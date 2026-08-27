const $ = (s) => document.querySelector(s);
const api = async (p, opts) => (await fetch(p, opts)).json();

async function loadDashboard() {
  const [today, progress] = await Promise.all([api("/api/today"), api("/api/progress")]);
  const due = today.due || [];
  $("#pills").innerHTML = `
    <span class="pill"><span class="n">${due.length}</span> due today</span>
    <button onclick="showAdd()" style="margin-left:.5rem;padding:.3rem .7rem;font-size:.8rem">+ Add concept</button>`;
  $("#concepts").innerHTML = (progress.concepts || []).map((c) => `
    <div class="concept" onclick="openConcept('${c.id}')">
      <span class="stage stage-${c.stage}">${c.stage}</span>
      ${c.title}
      <div class="meta">${c.module_id} · int ${c.interval_days ?? "–"}d · succ ${c.success_count ?? 0}</div>
    </div>`).join("");
}

async function showAdd() {
  const data = await api("/api/concepts");
  const mods = (data.modules || []).map((m) => `<option value="${m.id}">${m.title}</option>`).join("");
  $("#view").innerHTML = `
    <div class="card">
      <h2>Add a concept</h2>
      <p class="objective">Directly from Discovery or your own material — the tutor will teach it on demand.</p>
      <label>Title</label>
      <input id="newTitle" placeholder="e.g. NCCL AllReduce" style="width:100%"/>
      <label>Objective (learner can, given X, do Y)</label>
      <textarea id="newObjective" placeholder="e.g. learner can explain what AllReduce does and identify when gradient sync times out"></textarea>
      <label>Module</label>
      <select id="newModule">${mods || "<option value=\"M0\">M0</option>"}</select>
      <label>Tier</label>
      <select id="newTier">
        <option value="core">core</option><option value="important">important</option><option value="nice">nice</option>
      </select>
      <label>Prereqs (comma-separated concept ids, optional)</label>
      <input id="newPrereqs" placeholder="e.g. C1, C2" style="width:100%"/>
      <div class="row">
        <button onclick="submitAdd()">Add & start learning</button>
        <span class="log" id="addMsg"></span>
      </div>
    </div>`;
}

async function submitAdd() {
  const title = $("#newTitle").value.trim();
  const objective = $("#newObjective").value.trim();
  if (!title || !objective) { $("#addMsg").textContent = "title + objective required"; return; }
  const r = await api("/api/concepts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      objective,
      moduleId: $("#newModule").value,
      tier: $("#newTier").value,
      prereqs: $("#newPrereqs").value,
    }),
  });
  if (r.ok) {
    $("#addMsg").textContent = `Added ${r.id}`;
    setTimeout(() => { loadDashboard(); openConcept(r.id); }, 600);
  } else {
    $("#addMsg").textContent = "Error: " + (r.error || "unknown");
  }
}

async function openConcept(id) {
  const today = await api("/api/today");
  const item = today.due.find((c) => c.id === id);
  const thread = (await api(`/api/thread?conceptId=${id}`)).thread || [];
  const dueBlock = item
    ? `
      <p><strong>Free recall:</strong> write your answer before revealing anything.</p>
      <textarea id="answer" placeholder="Your answer from memory..."></textarea>
      <div class="row">
        <select id="grade">
          <option value="pass">Pass</option>
          <option value="partial">Partial</option>
          <option value="fail">Fail</option>
        </select>
        <button onclick="submitReview('${id}')">Grade</button>
      </div>
      <div class="log" id="reviewLog"></div>`
    : `<p class="objective">Not due right now — but you can talk to the tutor.</p>`;
  $("#view").innerHTML = `
    <div class="card">
      <h2>${item.title} <span class="objective">${item.module_id}</span></h2>
      <p class="objective">${item.objective}</p>
      ${dueBlock}
      <hr style="border-color:#232733;margin:1rem 0" />
      <h3>Tutor</h3>
      <div id="chatLog" style="max-height:280px;overflow-y:auto;margin-bottom:.75rem"></div>
      <div class="row">
        <input id="chatInput" placeholder="Ask, or answer the tutor's question..." style="flex:1" />
        <button onclick="sendChat('${id}')">Send</button>
      </div>
    </div>`;
  renderThread(thread);
}

function renderThread(thread) {
  const log = $("#chatLog");
  if (!log) return;
  log.innerHTML = thread.map((m) => `
    <div style="margin:.35rem 0">
      <strong style="color:${m.role === "user" ? "var(--accent)" : "var(--ok)"}">${m.role === "user" ? "You" : "Tutor"}:</strong>
      <span style="white-space:pre-wrap">${escapeHtml(m.content)}</span>
    </div>`).join("") || `<span style="color:var(--muted)">No messages yet — ask the tutor to break it down.</span>`;
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendChat(id) {
  const input = $("#chatInput");
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";
  renderThread([...($("#chatLog").__thread || []), { role: "user", content: msg }]);
  $("#chatLog").__thread = $("#chatLog").__thread || [];
  $("#chatLog").__thread.push({ role: "user", content: msg });
  const btn = document.querySelector("#view button:last-of-type");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId: id, message: msg }),
    });
    $("#chatLog").__thread = r.thread;
    renderThread(r.thread);
  } catch (e) {
    renderThread([...$("#chatLog").__thread, { role: "assistant", content: `Error: ${e.error || e.message || "agent call failed"}` }]);
  }
  if (btn) btn.disabled = false;
}

async function submitReview(id) {
  const answer = $("#answer").value, grade = $("#grade").value;
  const r = await api("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conceptId: id, outcome: grade, confidence: null }),
  });
  $("#reviewLog").textContent = `Result: ${grade.toUpperCase()} → next review in ${r.interval}d (due ${r.due})`;
  setTimeout(loadDashboard, 800);
}

window.openConcept = openConcept;
window.submitReview = submitReview;
window.sendChat = sendChat;
window.showAdd = showAdd;
window.submitAdd = submitAdd;
loadDashboard();
