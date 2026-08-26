const $ = (s) => document.querySelector(s);
const api = async (p, opts) => (await fetch(p, opts)).json();

async function loadDashboard() {
  const [today, progress] = await Promise.all([api("/api/today"), api("/api/progress")]);
  const due = today.due || [];
  $("#pills").innerHTML = `<span class="pill"><span class="n">${due.length}</span> due today</span>`;
  $("#concepts").innerHTML = (progress.concepts || []).map((c) => `
    <div class="concept" onclick="openConcept('${c.id}')">
      <span class="stage stage-${c.stage}">${c.stage}</span>
      ${c.title}
      <div class="meta">${c.module_id} · int ${c.interval_days ?? "–"}d · succ ${c.success_count ?? 0}</div>
    </div>`).join("");
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
loadDashboard();
