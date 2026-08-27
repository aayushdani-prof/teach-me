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


/* ---------- Graph (stable diagram) ---------- */
let graphState = null;

function layoutGraph(nodes, edges) {
  // 1. level each node: max(level of prereqs/ghost-sources) + 1
  const level = {};
  for (const n of nodes) level[n.id] = 0;
  // propagate levels: prereq edges push dependents one level deeper (repeat for chains)
  for (let it = 0; it < nodes.length + 1; it++) {
    for (const e of edges) {
      if (e.kind !== "prereq") continue;
      const a = e.from, b = e.to;
      const need = (level[a] || 0) + 1;
      if ((level[b] || 0) < need) level[b] = need;
    }
  }
  // group by level
  const byLevel = {};
  for (const n of nodes) {
    const l = level[n.id] || 0;
    (byLevel[l] = byLevel[l] || []).push(n);
  }
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);
  const NODE_W = 170, NODE_H = 54, GX = 36, GY = 46;
  for (const l of levels) {
    const row = byLevel[l].sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    const rowH = (row.length - 1) * 26;
    row.forEach((n, i) => {
      n.x = 90 + l * (NODE_W + GX);
      n.y = 60 + i * (NODE_H + GY) - rowH / 2;
      n.w = NODE_W; n.h = NODE_H;
    });
  }
  return { byLevel, levels };
}

async function renderGraph() {
  $("#view").innerHTML = `
    <div class="graph-wrap" id="graphWrap">
      <canvas id="graphCanvas"></canvas>
      <div class="graph-top">
        <button class="btn-ghost" onclick="graphFit()">Fit</button>
        <button class="btn-ghost" onclick="graphReset()">Reset</button>
      </div>
      <div class="graph-legend">
        <div class="lg"><span class="dot" style="background:#d29922"></span> learning</div>
        <div class="lg"><span class="dot" style="background:#3fb950"></span> mastered</div>
        <div class="lg"><span class="dot" style="background:#5a6577"></span> eventually</div>
        <div class="lg"><span class="dot" style="background:#d8519d"></span> gap needed</div>
      </div>
      <div class="graph-hint">drag canvas to pan · scroll to zoom · drag a node to move · double-click to open</div>
    </div>`;
  const data = await api("/api/graph");
  const wrap = $("#graphWrap");
  const canvas = $("#graphCanvas");
  const ctx = canvas.getContext("2d");
  const W = wrap.clientWidth, H = wrap.clientHeight;
  canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  // separate concept nodes from ghost nodes; ghost nodes sit right of their concept
  const ghosts = (data.nodes || []).filter((n) => n.id.startsWith("ghost:"));
  const concepts = (data.nodes || []).filter((n) => !n.id.startsWith("ghost:"));
  const edges = (data.edges || []);
  const nodeMap = new Map(concepts.map((n) => [n.id, n]));

  // anchor each ghost next to its concept (fixed offset, not in layout)
  for (const g of ghosts) {
    const host = nodeMap.get(g.gapFor);
    if (host) { g.x = host.x + host.w + 26; g.y = host.y; g.w = 150; g.h = 40; g.ghostOf = host.id; }
  }

  const laid = layoutGraph(concepts, edges);
  // place ghosts on their host row (row index from host)
  for (const g of ghosts) {
    const host = nodeMap.get(g.gapFor);
    if (host) { g.x = host.x + host.w + 26; g.y = host.y; }
  }

  // node lookup includes ghosts so gap edges resolve
  const allMap = new Map([...nodeMap.entries(), ...ghosts.map((g) => [g.id, g])]);
  graphState = { nodes: concepts, ghosts, edges, canvas, ctx, W, H, zoom: 1, panX: 0, panY: 0,
                 nodeMap: allMap, dragNode: null, dragOffX: 0, dragOffY: 0, hover: null };

  const draw = () => {
    const { ctx, W, H, zoom, panX, panY } = graphState;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // edges (draw under)
    for (const e of edges) {
      const a = allMap.get(e.from), b = allMap.get(e.to);
      if (!a || !b) continue;
      const isGap = e.kind === "gap";
      const x1 = a.x + a.w, y1 = a.y + a.h / 2;
      const x2 = b.x, y2 = b.y + b.h / 2;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      // orthogonal S-curve
      const mx = (x1 + x2) / 2;
      ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
      ctx.strokeStyle = isGap ? "rgba(216,157,255,.45)" : "rgba(141,157,196,.4)";
      ctx.lineWidth = isGap ? 1.5 : 2;
      ctx.setLineDash(isGap ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      // arrowhead
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 8 * Math.cos(ang - 0.4), y2 - 8 * Math.sin(ang - 0.4));
      ctx.lineTo(x2 - 8 * Math.cos(ang + 0.4), y2 - 8 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = isGap ? "rgba(216,157,255,.45)" : "rgba(141,157,196,.4)";
      ctx.fill();
    }

    // nodes: cards
    const all = [...concepts, ...ghosts];
    for (const n of all) {
      const isGhost = !!n.ghost;
      const color = n.stage === "off_docket" ? "#3fb950" : n.stage === "gap" ? "#d8519d" : n.stage === "eventually" ? "#5a6577" : "#d29922";
      const hovered = graphState.hover === n.id;
      const drag = graphState.dragNode === n;
      ctx.fillStyle = hovered ? "rgba(255,255,255,.03)" : "rgba(18,22,31,0.6)";
      ctx.strokeStyle = drag ? "#fff" : (hovered ? "#fff" : color);
      ctx.lineWidth = hovered || drag ? 2 : 1.2;
      ctx.beginPath();
      const r = 8;
      ctx.roundRect(n.x, n.y, n.w, n.h, r);
      ctx.fill(); ctx.stroke();

      // left status stripe
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(n.x, n.y, 5, n.h, [r, 0, 0, r]); ctx.fill();

      // label
      ctx.fillStyle = hovered || drag || n.stage === "gap" ? "#fff" : "#cbd2e0";
      ctx.font = n.stage === "gap" ? "italic 11px system-ui" : "600 11px system-ui";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      wrapText(ctx, n.label, n.x + 12, n.y + n.h / 2 - 6, n.w - 20);
      // sub (mastery or "gap")
      ctx.fillStyle = n.stage === "gap" ? "rgba(255,255,255,.5)" : "rgba(141,149,167,.6)";
      ctx.font = "9px system-ui";
      if (n.stage === "gap") { ctx.fillText("missing prereq", n.x + 12, n.y + n.h / 2 + 8); }
      else { const pct = Math.round((n.mastery || 0) * 100); ctx.fillText(`${n.module_id} · ${pct}%`, n.x + 12, n.y + n.h / 2 + 8); }
    }
    ctx.restore();
  };

  const wrapText = (ctx, text, x, y, maxW) => {
    const words = text.split(" ");
    let line = "";
    let yy = y;
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += 12; }
      else line = t;
    }
    ctx.fillText(line, x, yy);
  };
  graphState.wrapText = wrapText;

  // interactions
  const hit = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left - graphState.panX) / graphState.zoom;
    const y = (ev.clientY - rect.top - graphState.panY) / graphState.zoom;
    for (const n of all) if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
    return null;
  };
  let pointerDown = false, moved = false, downX = 0, downY = 0;
  canvas.addEventListener("pointermove", (ev) => {
    const n = hit(ev);
    graphState.hover = n;
    if (pointerDown && graphState.dragNode) {
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left - graphState.panX) / graphState.zoom;
      const y = (ev.clientY - rect.top - graphState.panY) / graphState.zoom;
      graphState.dragNode.x = x - graphState.dragOffX;
      graphState.dragNode.y = y - graphState.dragOffY;
      // if it's a ghost, move it with the host-free
      moved = true;
    } else if (pointerDown && !graphState.dragNode) {
      const dx = ev.clientX - downX, dy = ev.clientY - downY;
      graphState.panX += dx; graphState.panY += dy;
      downX = ev.clientX; downY = ev.clientY;
    }
    draw();
  });
  canvas.addEventListener("pointerdown", (ev) => {
    const n = hit(ev);
    pointerDown = true; downX = ev.clientX; downY = ev.clientY;
    if (n) { graphState.dragNode = n; graphState.dragOffX = ev.clientX - n.x * graphState.zoom - graphState.panX; graphState.dragOffY = ev.clientY - n.y * graphState.zoom - graphState.panY; }
    wrap.classList.add("dragging");
  });
  canvas.addEventListener("pointerup", (ev) => {
    if (graphState.dragNode && !moved && !graphState.dragNode.ghost && !graphState.dragNode.id.startsWith("ghost:")) openConcept(graphState.dragNode.id);
    graphState.dragNode = null; pointerDown = false; moved = false;
    wrap.classList.remove("dragging");
  });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); graphState.zoom = Math.max(0.3, Math.min(2, graphState.zoom * (e.deltaY > 0 ? 0.92 : 1.1))); draw(); }, { passive: false });

  graphState.fit = () => {
    // compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of all) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); }
    const bw = maxX - minX, bh = maxY - minY;
    graphState.zoom = Math.min(1, Math.min(W / (bw + 80), H / (bh + 80)));
    graphState.panX = W / 2 - (minX + bw / 2) * graphState.zoom;
    graphState.panY = H / 2 - (minY + bh / 2) * graphState.zoom;
    draw();
  };
  draw();
  graphState.fit();
}

window.fitGraph = () => graphState?.fit?.();
window.graphReset = () => { renderGraph(); };
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
