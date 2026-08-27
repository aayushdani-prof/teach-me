const $ = (s) => document.querySelector(s);
const api = async (p, opts) => {
  const r = await fetch(p, opts);
  return r.json();
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let DATA = { concepts: [], modules: [], due: [], thread: [] };
let CURRENT = null;        // {view:'board'|'progress', or {id} for concept}
let FROM_BOARD = false;    // concept opened from Board (not today's queue)
let OPEN_MODULES = new Set();

/* ---------- data ---------- */
async function reloadData() {
  const [today, progress, concepts] = await Promise.all([
    api("/api/today"), api("/api/progress"), api("/api/concepts"),
  ]);
  DATA = { due: today.due || [], concepts: progress.concepts || [], modules: concepts.modules || [], today: [] };
  renderAll();
}

/* ---------- nav / view state ---------- */
function setView(v) {
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
  if (v === "today") { current = null; renderToday(); }
  else if (v === "board") { current = null; renderBoard(); }
  else if (v === "graph") { current = null; renderGraph(); }
  else if (v === "progress") { current = null; renderProgress(); }
}
function showCrumb() {
  const top = $("#topbar");
  if (!current) { top.innerHTML = `<span class="crumb"><b>Teach Me</b></span>`; return; }
  if (current.id) {
    const c = DATA.concepts.find((x) => x.id === current.id);
    top.innerHTML = `<span class="crumb"><b>${esc(c?.module_id || "—")}</b> / ${esc(c?.title || current.id)}</span><span class="spacer"></span>`;
  }
}
function HS() { return new Date().toISOString().slice(0, 10); }

/* ---------- sidebar ---------- */
function renderAll() {
  renderSidebar();
  showCrumb();
  if (!current) { const act = document.querySelector(".nav-tab.active")?.dataset.view; (act === "board" ? renderBoard : act === "graph" ? renderGraph : act === "progress" ? renderProgress : renderToday)(); }
  else if (current.id) renderConcept(current.id);
}
function renderSidebar() {
  const q = ($("#search")?.value || "").toLowerCase();
  const byModule = {};
  for (const c of DATA.concepts || []) {
    (byModule[c.module_id] = byModule[c.module_id] || []).push(c);
  }
  const mods = DATA.modules?.length ? DATA.modules : Object.keys(byModule).map((id) => ({ id, title: id }));
  let html = "";
  for (const m of mods) {
    const cs = (byModule[m.id] || []).filter((c) => !q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    const open = OPEN_MODULES.has(m.id);
    // keep module open if it has the filtered result
    html += `<div class="module">
      <div class="module-head ${open ? "open" : ""}" onclick="toggleModule('${m.id}')">
        <span class="chevron">▶</span>${esc(m.title)} <span style="font-size:.7rem;color:var(--faint)">(${cs.length})</span>
      </div>${open ? cs.map((c) => `
        <div class="concept" onclick="openConcept('${c.id}')">
          <span class="status-dot ${c.stage}"></span>
          <span class="t">${esc(c.title)}</span>
          <span class="meta">${c.interval_days ? c.interval_days + "d" : "—"}</span>
        </div>`).join("") : ""}</div>`;
  }
  $("#sidebar-modules").innerHTML = html || `<div class="empty">No concepts yet.</div>`;

  const pillBtns = [];
  const dueSoon = DATA.concepts.filter((c) => c.interval_days && c.interval_days <= 1);
  $("#pills").innerHTML =
    `<span class="pill"><span class="dot"></span><span class="n">${DATA.due.length}</span> due today</span>` +
    `<button class="btn ghost small" onclick="showAdd()">+ Add</button>`;
}
function toggleModule(id) { if (OPEN_MODULES.has(id)) OPEN_MODULES.delete(id); else OPEN_MODULES.add(id); renderSidebar(); }

/* ---------- today ---------- */
function renderToday() {
  $("#pills").innerHTML = "";
  const due = DATA.due;
  const html = `<div class="section-title">Today's queue</div>
    ${due.length ? `<div class="progress-list">${due.map((c, i) => `
      <div class="prow" onclick="openConcept('${c.id}')">
        <span style="font-size:.8rem;color:var(--faint)">${i + 1}</span>
        <span class="t">${esc(c.title)}</span>
        <span class="sub">${esc(c.module_id)}</span>
        <span class="bar"><span class="fill" style="width:${Math.min(100, c.interval_days * 12)}%"></span></span>
      </div>`).join("")}</div>` : `<div class="empty">Nothing due today. Enjoy the gap — or add a concept.</div>`}
    <div class="section-title">Not due now</div>
    <div class="progress-list">${DATA.concepts.filter((c) => !due.find((d) => d.id === c.id)).slice(0, 5).map((c) => `
      <div class="prow" onclick="openConcept('${c.id}')">
        <span class="status-dot ${c.stage}" style="width:8px;height:8px;border-radius:50%;display:inline-block"></span>
        <span class="t">${esc(c.title)}</span>
        <span class="sub">${esc(c.module_id)}</span>
      </div>`).join("")}</div>`;
  $("#view").innerHTML = html;
}

/* ---------- board ---------- */
function renderBoard() {
  const list = DATA.concepts || [];
  const byStage = {
    docket: list.filter((c) => c.stage === "docket"),
    off_docket: list.filter((c) => c.stage === "off_docket"),
    eventually: list.filter((c) => c.stage === "eventually"),
  };
  const col = (title, items) => `
    <div class="bcol">
      <div class="bcol-head">${title} <span class="bcount">${items.length}</span></div>
      ${items.map((c) => {
        const pct = Math.min(100, Math.round(((c.success_count || 0) / 3) * 100));
        return `<div class="bcard" onclick="openConcept('${c.id}')">
          <div class="bcard-t">${esc(c.title)}</div>
          <div class="bcard-sub">${esc(c.module_id)} · ${c.interval_days ? c.interval_days + "d" : "–"}</div>
          <div class="bar"><span class="fill" style="width:${pct}%"></span></div>
        </div>`;
      }).join("") || `<div class="empty">—</div>`}
    </div>`;
  $("#view").innerHTML = `
    <div class="board">
      ${col("Learning", byStage.docket)}
      ${col("Mastered", byStage.off_docket)}
      ${col("Eventually", byStage.eventually)}
    </div>`;
}

/* ---------- progress ---------- */
async function renderProgress() {
  const [progress, meta, gaps] = await Promise.all([api("/api/progress"), api("/api/meta"), api("/api/gaps")]);
  const concepts = progress.concepts || [];
  const total = concepts.length, mastered = concepts.filter((c) => c.stage === "off_docket").length;
  const learned = concepts.filter((c) => c.success_count > 0).length;
  const active = concepts.filter((c) => c.stage === "docket").length;
  const cal = progress.calibrationCount || 0;
  $("#view").innerHTML = `
    <div class="section-title">Overview</div>
    <div class="stat-grid">
      <div class="stat"><div class="v">${total}</div><div class="k">Concepts</div></div>
      <div class="stat"><div class="v">${learned}</div><div class="k">Learned</div></div>
      <div class="stat"><div class="v">${mastered}</div><div class="k">Mastered</div></div>
      <div class="stat"><div class="v">${active}</div><div class="k">In progress</div></div>
      <div class="stat"><div class="v">${cal}</div><div class="k">Calibration pts</div></div>
    </div>
    <div class="section-title">All concepts</div>
    <div class="progress-list">
      ${concepts.map((c) => {
        const pct = Math.min(100, Math.round(((c.success_count || 0) / 3) * 100));
        return `<div class="prow" onclick="openConcept('${c.id}')">
          <span class="status-dot ${c.stage}" style="width:8px;height:8px;border-radius:50%;display:inline-block"></span>
          <span class="t">${esc(c.title)}</span>
          <span class="bar"><span class="fill" style="width:${pct}%"></span></span>
          <span class="sub">${c.interval_days ? c.interval_days + "d" : "–"} · succ ${c.success_count || 0}</span>
        </div>`;
      }).join("")}
    </div>
    ${gaps?.length ? `<div class="section-title">Open gaps</div>
      <div class="cal-block">${gaps.map((g) => `
        <div class="gap-item">
          <span class="tag core">gap</span>
          <span style="flex:1">${esc(g.missing)}</span>
          <span style="color:var(--faint);font-size:.72rem">${esc(g.concept_id)} · d${g.depth}</span>
        </div>`).join("")}</div>` : ""}`;
}

/* ---------- concept view (review + chat) ---------- */
async function openConcept(id) {
  current = { id };
  const due = DATA.due.find((c) => c.id === id);
  const thread = (await api(`/api/thread?conceptId=${id}`)).thread || [];
  const c = DATA.concepts.find((x) => x.id === id);
  $("#view").innerHTML = `
    <div class="chat">
      ${due ? `
        <div class="review-card" style="margin-bottom:1rem">
          <div class="head"><h2>${esc(c?.title || id)}</h2><span class="module-tag">${esc(c?.module_id || "")}</span></div>
          <div class="q">${esc(due.objective)}</div>
          <div class="label">Free recall — attempt before looking</div>
          <textarea id="answer" placeholder="Your answer from memory..."></textarea>
          <div class="row">
            <span class="label" style="margin:0">Confidence:</span>
            <input type="range" id="conf" min="0" max="100" value="50" oninput="confOut.value=this.value+'%'">
            <span id="confOut">50%</span>
          </div>
          <div class="row">
            <select id="grade" style="width:auto">
              <option value="pass">Pass</option><option value="partial">Partial</option><option value="fail">Fail</option>
            </select>
            <button class="btn" onclick="submitReview('${id}', true)">Grade</button>
          </div>
          <div class="log" id="reviewLog"></div>
          <div class="progress">review for this concept</div>
        </div>` : `<div class="review-card" style="margin-bottom:1rem">
          <div class="head"><h2>${esc(c?.title || id)}</h2><span class="module-tag">${esc(c?.module_id || "")}</span></div>
          <div class="q">Not due right now — but you can talk to the tutor. Or review it anyway below.</div>
          <div class="label">Optional review</div>
          <div class="row">
            <select id="grade" style="width:auto"><option value="pass">Pass</option><option value="partial">Partial</option><option value="fail">Fail</option></select>
            <button class="btn ghost" onclick="submitReview('${id}', false)">Mark reviewed</button>
          </div>
        </div>`}
      <div class="review-card" style="flex:1">
        <div class="head"><h2>Tutor</h2></div>
        <div class="chat-log" id="chatLog"></div>
        <div class="chat-input">
          <input id="chatInput" placeholder="Ask, or answer the tutor's question..." onkeydown="if(event.key==='Enter')sendChat('${id}')" />
          <button class="btn" onclick="sendChat('${id}')">Send</button>
        </div>
      </div>
    </div>`;
  renderThread(thread);
}
function confOut() { const o = $("#conf"); if (o) $("#confOut").textContent = o.value + "%"; }

async function submitReview(id, fromDue) {
  const grade = $("#grade").value;
  const conf = $("#conf")?.value ?? null;
  const r = await api("/api/review", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conceptId: id, outcome: grade, confidence: conf }),
  });
  const log = $("#reviewLog");
  if (log) log.textContent = `Result: ${grade.toUpperCase()} → next review in ${r.interval}d (due ${r.due})`;
  await reloadData();
}

/* ---------- chat ---------- */
function renderThread(thread) {
  const log = $("#chatLog");
  if (!log) return;
  log.innerHTML = thread.length ? thread.map((m) => `
    <div class="msg ${m.role}">
      <span class="who">${m.role === "user" ? "You" : "Tutor"}</span>${esc(m.content)}
    </div>`).join("") : `<div class="msg assistant"><span class="who">Tutor</span>Ask me to teach this, or tell me where you're stuck — I'll probe until you've got it.</div>`;
  log.scrollTop = log.scrollHeight;
}

async function sendChat(id) {
  const input = $("#chatInput");
  const m = input.value.trim();
  if (!m) return;
  input.value = "";
  const log = $("#chatLog");
  const cur = log.__thread || [];
  log.__thread = [...cur, { role: "user", content: m }];
  renderThread(log.__thread);
  const btn = document.querySelector("#view .chat-input button");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptId: id, message: m }) });
    log.__thread = r.thread;
    renderThread(r.thread);
  } catch (e) {
    renderThread([...log.__thread, { role: "assistant", content: `Error: ${e.error || e.message || "agent call failed"}` }]);
  }
  if (btn) btn.disabled = false;
}

/* ---------- add concept ---------- */
async function showAdd() {
  const data = await api("/api/concepts");
  const mods = (data.modules || []).map((m) => `<option value="${m.id}">${m.title}</option>`).join("");
  $("#view").innerHTML = `
    <div class="card">
      <h2>Add a concept</h2>
      <p class="objective">From Discovery or your own material — the tutor will drill down and track it.</p>
      <label class="label">Title</label>
      <input id="newTitle" placeholder="e.g. NCCL AllReduce" />
      <label class="label">Objective (learner can, given X, do Y)</label>
      <textarea id="newObjective" placeholder="e.g. learner can explain AllReduce and diagnose a gradient-sync timeout"></textarea>
      <label class="label">Module</label>
      <select id="newModule">${mods || `<option value="M0">M0</option>`}</select>
      <label class="label">Tier</label>
      <select id="newTier"><option value="core">core</option><option value="important">important</option><option value="nice">nice</option></select>
      <label class="label">Prereqs (comma-separated concept ids, optional)</label>
      <input id="newPrereqs" placeholder="e.g. C1, C2" />
      <div class="row">
        <button class="btn" onclick="submitAdd()">Add & start learning</button>
        <span class="log" id="addMsg"></span>
      </div>
    </div>`;
}

async function submitAdd() {
  const title = $("#newTitle").value.trim();
  const objective = $("#newObjective").value.trim();
  if (!title || !objective) { $("#addMsg").textContent = "title + objective required"; return; }
  const r = await api("/api/concepts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, objective, moduleId: $("#newModule").value, tier: $("#newTier").value, prereqs: $("#newPrereqs").value }),
  });
  if (r.ok) { $("#addMsg").textContent = `Added ${r.id}`; await reloadData(); openConcept(r.id); }
  else $("#addMsg").textContent = "Error: " + (r.error || "unknown");
}


/* ---------- Graph ---------- */
let graphState = null;
async function renderGraph() {
  $("#view").innerHTML = `
    <div class="graph-wrap" id="graphWrap">
      <canvas id="graphCanvas"></canvas>
      <div class="graph-legend">
        <div class="lg"><span class="dot" style="background:#d29922"></span> learning</div>
        <div class="lg"><span class="dot" style="background:#3fb950"></span> mastered</div>
        <div class="lg"><span class="dot" style="background:#5a6577"></span> eventually</div>
        <div class="lg"><span class="dot" style="background:#d8519d"></span> gap needed</div>
      </div>
      <div class="graph-hint">drag to move · scroll to zoom · click a node to open</div>
    </div>`;
  const data = await api("/api/graph");
  const wrap = $("#graphWrap");
  const canvas = $("#graphCanvas");
  const ctx = canvas.getContext("2d");
  const W = wrap.clientWidth, H = wrap.clientHeight;
  canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const nodes = data.nodes.map((n, i) => {
    const a = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
    const r = Math.min(W, H) * 0.32;
    return { ...n, x: W / 2 + Math.cos(a) * r * (0.6 + ((i % 3) * 0.2)), y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0, r: 16 };
  });
  const edges = data.edges || [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  graphState = { nodes, edges, canvas, ctx, W, H, zoom: 1, panX: 0, panY: 0, _alive: false, _raf: 0 };

  const step = () => {
    for (const n of nodes) {
      for (const o of nodes) {
        if (n === o) continue;
        let dx = n.x - o.x, dy = n.y - o.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const f = 3000 / d2;
        n.vx += (dx / Math.sqrt(d2)) * f;
        n.vy += (dy / Math.sqrt(d2)) * f;
      }
      for (const e of edges) {
        const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 110) * 0.008;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      n.vx += (W / 2 - n.x) * 0.0015;
      n.vy += (H / 2 - n.y) * 0.0015;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(25, Math.min(W - 25, n.x));
      n.y = Math.max(25, Math.min(H - 25, n.y));
    }
    draw();
    if (graphState._alive) requestAnimationFrame(step);
  };

  const draw = () => {
    const { ctx, W, H, zoom, panX, panY, nodes, edges } = graphState;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    for (const e of edges) {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const isGap = e.kind === "gap";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isGap ? "rgba(216,157,255,.4)" : "rgba(141,157,196,.35)";
      ctx.lineWidth = isGap ? 1.5 : 2;
      ctx.setLineDash(isGap ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const n of nodes) {
      const color = n.stage === "off_docket" ? "#3fb950" : n.stage === "gap" ? "#d8519d" : n.stage === "eventually" ? "#5a6577" : "#d29922";
      const r = n.stage === "gap" ? 24 : (14 + n.mastery * 10);
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2.2);
      grad.addColorStop(0, color + "66"); grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e8ecf4";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y - r - 6);
    }
    ctx.restore();
  };

  let down = null, downX = 0, downY = 0, panned = false;
  canvas.addEventListener("pointerdown", (ev) => { down = ev; downX = ev.clientX; downY = ev.clientY; });
  canvas.addEventListener("pointermove", (ev) => {
    if (!down) return;
    const dx = ev.clientX - downX, dy = ev.clientY - downY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panned = true;
    downX = ev.clientX; downY = ev.clientY;
    if (panned) { graphState.panX += dx; graphState.panY += dy; }
  });
  canvas.addEventListener("pointerup", (ev) => {
    if (down && !panned) {
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left - graphState.panX) / graphState.zoom;
      const y = (ev.clientY - rect.top - graphState.panY) / graphState.zoom;
      const hit = [...nodes].reverse().find((n2) => (n2.x - x) ** 2 + (n2.y - y) ** 2 < (n2.r + 8) ** 2);
      if (hit && !hit.id.startsWith("ghost:")) openConcept(hit.id);
    }
    down = null; panned = false;
  });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); graphState.zoom = Math.max(0.4, Math.min(2.5, graphState.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });
  if (graphState._alive) cancelAnimationFrame(graphState._raf);
  graphState._alive = true;
  graphState._raf = requestAnimationFrame(step);
}

/* ---------- init ---------- */
window.toggleModule = toggleModule;
window.openConcept = openConcept;
window.submitReview = submitReview;
window.sendChat = sendChat;
window.showAdd = showAdd;
window.submitAdd = submitAdd;
window.setView = setView;
window.confOut = confOut;
window.renderGraph = renderGraph;
window.renderSidebar = renderSidebar;
loadDashboard();
async function loadDashboard() { await reloadData(); }
