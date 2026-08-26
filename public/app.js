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
  if (!item) { $("#view").innerHTML = `<h2>${id}</h2><p class="card">Not due right now.</p>`; return; }
  $("#view").innerHTML = `
    <div class="card">
      <h2>${item.title} <span class="objective">${item.module_id}</span></h2>
      <p class="objective">${item.objective}</p>
      <p><strong>Free recall:</strong> write your answer before revealing anything.</p>
      <textarea id="answer" placeholder="Your answer from memory..."></textarea>
      <div class="row">
        <select id="grade">
          <option value="pass">Pass</option>
          <option value="partial">Partial</option>
          <option value="fail">Fail</option>
        </select>
        <button onclick="submitReview('${id}')">Submit</button>
      </div>
      <div class="log" id="reviewLog"></div>
    </div>`;
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
loadDashboard();
