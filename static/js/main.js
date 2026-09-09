/* ============================================================
   STORAGE LAYER — projects persisted to localStorage.
   ============================================================ */

const STORAGE_KEYS = {
  index: "dramaz:projects",
  project: (id) => `dramaz:project:${id}`,
};

function safeGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function loadProjectIndex() {
  return safeGetJSON(STORAGE_KEYS.index, []);
}

function saveProjectIndex(list) {
  safeSetJSON(STORAGE_KEYS.index, list);
}

function newProjectId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyProject() {
  const now = Date.now();
  return {
    id: newProjectId(),
    createdAt: now,
    updatedAt: now,
    activeTab: "studio",
    stepStatus: { trends: "active", concept: "locked", season: "locked", episode: "locked" },
    currentStep: "trends",
    trendOptions: [],
    selectedTrends: [],
    seenTrendNiches: [],
    concept: null,
    season: null,
    episodeCount: 20,
    currentEpisodeNumber: 1,
    approvedEpisodes: [],
    scenesByEpisode: {},
    studioNodePositions: {},
  };
}

function loadProject(id) {
  const loaded = safeGetJSON(STORAGE_KEYS.project(id), null);
  if (!loaded) return null;
  return Object.assign(emptyProject(), loaded, { id: loaded.id });
}

function projectTitle(project) {
  if (project.concept && project.concept.logline) {
    const l = project.concept.logline;
    return l.length > 64 ? l.slice(0, 61) + "…" : l;
  }
  if (project.selectedTrends && project.selectedTrends.length) {
    return project.selectedTrends.map((t) => t.niche).join(" × ");
  }
  return "Untitled Project";
}

function projectSubtitle(project) {
  if (project.concept && project.concept.core_conflict) return project.concept.core_conflict;
  if (project.selectedTrends && project.selectedTrends[0]) return project.selectedTrends[0].seed;
  return "Not started yet — scout trends to begin.";
}

function projectSummary(project) {
  return {
    id: project.id,
    title: projectTitle(project),
    subtitle: projectSubtitle(project),
    updatedAt: project.updatedAt,
    stepStatus: project.stepStatus,
    currentStep: project.currentStep,
  };
}

function saveProject(project) {
  project.updatedAt = Date.now();
  safeSetJSON(STORAGE_KEYS.project(project.id), project);
  const index = loadProjectIndex();
  const i = index.findIndex((p) => p.id === project.id);
  const summary = projectSummary(project);
  if (i >= 0) index[i] = summary;
  else index.unshift(summary);
  saveProjectIndex(index);
}

function deleteProject(id) {
  try {
    localStorage.removeItem(STORAGE_KEYS.project(id));
  } catch (e) {}
  saveProjectIndex(loadProjectIndex().filter((p) => p.id !== id));
}

// Every API route can fail with a transient upstream error (e.g. the model
// provider being overloaded), returned as {"error": "..."} with a non-2xx
// status. Without this check, that error object gets treated as real data
// (concept/season/scenes) and silently corrupts persisted project state.
async function parseApiResponse(res) {
  const data = await res.json();
  if (!res.ok || (data && typeof data === "object" && !Array.isArray(data) && data.error)) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/* ============================================================
   UTIL
   ============================================================ */

function relativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* ============================================================
   CURRENT PROJECT STATE
   ============================================================ */

let currentProjectId = null;
const state = emptyProject();

function hydrateState(loaded) {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, loaded);
  if (!Array.isArray(state.approvedEpisodes)) state.approvedEpisodes = [];
  if (!state.scenesByEpisode) state.scenesByEpisode = {};
  if (!state.studioNodePositions) state.studioNodePositions = {};
  if (!state.activeTab) state.activeTab = "studio";
  state.busy = false;
}

function persist() {
  if (!currentProjectId) return;
  saveProject(state);
  const titleEl = document.getElementById("rail-project-title");
  if (titleEl) titleEl.textContent = projectTitle(state);
  document.title = `${projectTitle(state)} — Dramaz`;
}

async function withBusyGuard(buttons, fn) {
  if (state.busy) return;
  state.busy = true;
  buttons.forEach((b) => b && (b.disabled = true));
  try {
    await fn();
  } finally {
    state.busy = false;
    buttons.forEach((b) => b && (b.disabled = false));
  }
}

/* ============================================================
   ROUTER
   ============================================================ */

const viewDashboard = document.getElementById("view-dashboard");
const viewProject = document.getElementById("view-project");

// Photo mode (the filmmaker background) shows on Dashboard, Trends, Seasons,
// Episodes. Plain mode (no photo) is for Studio and Office, which already
// paint their own opaque canvases and shouldn't have it bleeding through
// their header/legend chrome.
function updateBackgroundMode(mode) {
  document.body.dataset.bg = mode;
}

function showDashboard(push) {
  currentProjectId = null;
  viewDashboard.classList.remove("hidden");
  viewProject.classList.add("hidden");
  stopOffice();
  renderProjectGrid();
  updateBackgroundMode("photo");
  document.title = "Dramaz — AI Micro-Drama Studio";
  if (push) history.pushState({ view: "dashboard" }, "", "/");
}

function showProject(id, push) {
  const loaded = loadProject(id);
  if (!loaded) {
    history.replaceState({ view: "dashboard" }, "", "/");
    showDashboard(false);
    return;
  }
  hydrateState(loaded);
  currentProjectId = id;
  viewDashboard.classList.add("hidden");
  viewProject.classList.remove("hidden");
  document.getElementById("rail-project-title").textContent = projectTitle(state);
  document.title = `${projectTitle(state)} — Dramaz`;
  rehydratePanels();
  goToTab(state.activeTab, true);
  if (push) history.pushState({ view: "project", id }, "", `/project/${id}`);
}

function createAndOpenProject() {
  const project = emptyProject();
  saveProject(project);
  showProject(project.id, true);
}

window.addEventListener("popstate", () => {
  const path = location.pathname;
  if (path.startsWith("/project/")) {
    showProject(decodeURIComponent(path.split("/project/")[1]), false);
  } else {
    showDashboard(false);
  }
});

document.getElementById("btn-new-project").addEventListener("click", createAndOpenProject);
document.getElementById("btn-new-project-empty").addEventListener("click", createAndOpenProject);
document.getElementById("btn-all-projects").addEventListener("click", () => showDashboard(true));
document.getElementById("rail-brand-btn").addEventListener("click", () => showDashboard(true));

/* ============================================================
   DASHBOARD RENDERING
   ============================================================ */

function renderProgressDots(stepStatus) {
  return ["trends", "concept", "season", "episode"]
    .map((s) => {
      const st = (stepStatus || {})[s];
      const cls = st === "complete" ? "done" : st === "active" ? "active" : "";
      return `<span class="progress-dot ${cls}"></span>`;
    })
    .join("");
}

function stageBadgeLabel(p) {
  const names = { trends: "Trends", concept: "Concept", season: "Season", episode: "Episode" };
  return names[p.currentStep] || "Trends";
}

function renderProjectGrid() {
  const grid = document.getElementById("project-grid");
  const empty = document.getElementById("project-empty");
  const index = loadProjectIndex().slice().sort((a, b) => b.updatedAt - a.updatedAt);

  if (index.length === 0) {
    empty.classList.remove("hidden");
    grid.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }
  empty.classList.add("hidden");
  grid.classList.remove("hidden");
  grid.innerHTML = "";

  index.forEach((p) => {
    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-top">
        <span class="project-stage-badge">${stageBadgeLabel(p)}</span>
        <button class="project-delete" title="Delete project" data-id="${p.id}">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.6 9a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <h3 class="project-title">${escapeHtml(p.title)}</h3>
      <p class="project-sub">${escapeHtml(p.subtitle)}</p>
      <div class="project-progress">${renderProgressDots(p.stepStatus)}</div>
      <div class="project-meta">Updated ${relativeTime(p.updatedAt)}</div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".project-delete")) return;
      showProject(p.id, true);
    });
    grid.appendChild(card);
  });

  grid.querySelectorAll(".project-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("Delete this project? This can't be undone.")) {
        deleteProject(btn.dataset.id);
        renderProjectGrid();
      }
    });
  });
}

/* ============================================================
   TAB NAVIGATION
   ============================================================ */

function stepToTab(step) {
  if (step === "trends") return "trends";
  if (step === "concept" || step === "season") return "seasons";
  if (step === "episode") return "episodes";
  return "studio";
}

function renderTabNav() {
  document.querySelectorAll(".tab-pill").forEach((btn) => {
    const tab = btn.dataset.tab;
    let enabled = true;
    if (tab === "seasons") enabled = state.stepStatus.concept !== "locked";
    if (tab === "episodes") enabled = state.stepStatus.episode !== "locked";
    btn.disabled = !enabled;
    btn.classList.toggle("active", state.activeTab === tab);
  });
}

function goToTab(tab, skipPersist) {
  if (tab === "seasons" && state.stepStatus.concept === "locked") return;
  if (tab === "episodes" && state.stepStatus.episode === "locked") return;
  state.activeTab = tab;
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.tabPanel === tab);
  });
  renderTabNav();
  updateBackgroundMode(tab === "studio" || tab === "office" ? "plain" : "photo");
  if (tab === "studio") renderStudioGraph();
  if (tab === "office") renderOffice();
  if (!skipPersist) persist();
}

document.querySelectorAll(".tab-pill").forEach((btn) => {
  btn.addEventListener("click", () => goToTab(btn.dataset.tab));
});

function setStepStatus(step, status) {
  state.stepStatus[step] = status;
  renderTabNav();
  if (state.activeTab === "studio") renderStudioGraph();
  if (state.activeTab === "office") renderOffice();
}

function unlockArcSection() {
  document.getElementById("arc-section").classList.remove("locked");
  document.getElementById("arc-content").classList.remove("hidden");
}

/* ============================================================
   STUDIO — a data-driven node graph, not a fixed diagram.
   The graph grows as the project actually progresses: it starts with
   just the Trend Scout node; scouting fans out one node per discovered
   niche; approving trend(s) draws a wire from each selected niche into
   a new Concept Architect node; approving concept/season adds the next
   node in the chain. Everything here is derived fresh from `state` on
   every render, so a page reload reconstructs the exact same graph.
   ============================================================ */

// Fixed-pixel layout, not percentages of the panel — percentages cram
// every sibling into whatever height the panel happens to have, which is
// exactly what caused nodes to overlap once there were more than a
// handful. A pixel-sized "world" that the user pans/zooms around fixes
// that at the source and lets nodes be dragged to any position.
const STUDIO_NODE_W = 220;
const STUDIO_LEAF_NODE_W = 188;
const STUDIO_COL_STEP = 300;
const STUDIO_ROW_H = 132;
const STUDIO_MARGIN = 56;
const STUDIO_ZOOM_MIN = 0.35;
const STUDIO_ZOOM_MAX = 1.75;

let studioPan = { x: 40, y: 40 };
let studioZoom = 1;
let studioViewInitialized = false;
let studioUserAdjustedView = false;
let lastStudioNodeIds = "";
let lastStudioEdges = [];

function studioTrendsMeta() {
  const status = state.stepStatus.trends;
  if (status === "complete") return `${state.selectedTrends.length} seed${state.selectedTrends.length === 1 ? "" : "s"} approved`;
  if (state.trendOptions.length) return `${state.trendOptions.length} niches found`;
  return "Ready to scout";
}

function studioConceptMeta() {
  if (state.stepStatus.concept === "complete") return `${state.concept ? (state.concept.characters || []).length : 0} characters cast`;
  return state.concept ? "Concept drafted" : "Building concept…";
}

function studioSeasonMeta() {
  if (state.stepStatus.season === "complete") return `${state.season ? state.season.length : 0}-episode arc approved`;
  return state.season ? `${state.season.length}-episode arc drafted` : "Plotting arc…";
}

function studioEpisodeMeta() {
  if (state.stepStatus.episode === "complete") return "All episode kits approved";
  return `${state.approvedEpisodes.length}/${state.episodeCount} episodes approved`;
}

// Builds the current node/edge list purely from state — nothing here is
// stored separately, so persistence and refresh "just work" for free.
function buildStudioGraph() {
  const nodes = [
    {
      id: "trends-root",
      depth: 0,
      kind: "trends",
      title: "Trend Scout",
      sub: "Live web research",
      status: state.stepStatus.trends,
      meta: studioTrendsMeta(),
    },
  ];
  const edges = [];

  (state.trendOptions || []).forEach((t, i) => {
    const id = `trend-${i}`;
    const selected = state.selectedTrends.some((s) => s.niche === t.niche);
    nodes.push({
      id,
      depth: 1,
      kind: "trend-result",
      title: t.niche,
      sub: t.seed && t.seed.length > 72 ? t.seed.slice(0, 69) + "…" : t.seed,
      selected,
      meta: selected ? "Selected for concept" : "Discovered",
    });
    edges.push({ from: "trends-root", to: id });
  });

  if (state.stepStatus.concept !== "locked") {
    nodes.push({
      id: "concept",
      depth: 2,
      kind: "concept",
      title: "Concept Architect",
      sub: "Logline, cast, world",
      status: state.stepStatus.concept,
      meta: studioConceptMeta(),
    });
    const flowing = state.stepStatus.concept === "active";
    state.selectedTrends.forEach((sel) => {
      const idx = state.trendOptions.findIndex((t) => t.niche === sel.niche);
      if (idx >= 0) edges.push({ from: `trend-${idx}`, to: "concept", lit: true, flowing });
    });
  }

  if (state.stepStatus.season !== "locked") {
    nodes.push({
      id: "season",
      depth: 3,
      kind: "season",
      title: "Season Planner",
      sub: "Episode-by-episode arc",
      status: state.stepStatus.season,
      meta: studioSeasonMeta(),
    });
    edges.push({ from: "concept", to: "season", lit: true, flowing: state.stepStatus.season === "active" });
  }

  if (state.stepStatus.episode !== "locked") {
    nodes.push({
      id: "episode",
      depth: 4,
      kind: "episode",
      title: "Episode Director",
      sub: "Scene-by-scene shot kit",
      status: state.stepStatus.episode,
      meta: studioEpisodeMeta(),
    });
    edges.push({ from: "season", to: "episode", lit: true, flowing: state.stepStatus.episode === "active" });

    // One leaf node per approved episode, attached to Episode Director —
    // the running record of exactly which episodes are actually done.
    state.approvedEpisodes.forEach((num) => {
      const id = `episode-${num}`;
      nodes.push({
        id,
        depth: 5,
        kind: "episode-result",
        episodeNumber: num,
        title: `Episode ${num}`,
        sub: "Scene kit approved",
        meta: "Complete",
      });
      edges.push({ from: "episode", to: id, lit: true });
    });
  }

  return { nodes, edges };
}

function studioNodeTargetTab(kind) {
  return kind === "trend-result" ? "trends" : stepToTab(kind);
}

// Default column/row layout in world pixels, then manual drag overrides
// (persisted per-node in state.studioNodePositions) win over the default.
function layoutStudioNodes(nodes) {
  const byDepth = {};
  nodes.forEach((n) => (byDepth[n.depth] = byDepth[n.depth] || []).push(n));
  const maxCount = Math.max(1, ...Object.values(byDepth).map((g) => g.length));
  const worldHeight = Math.max(STUDIO_MARGIN * 2 + maxCount * STUDIO_ROW_H, 460);

  Object.values(byDepth).forEach((group) => {
    const colOffset = Math.max(STUDIO_MARGIN, (worldHeight - group.length * STUDIO_ROW_H) / 2);
    group.forEach((n, i) => {
      const defaultX = STUDIO_MARGIN + n.depth * STUDIO_COL_STEP;
      const defaultY = colOffset + i * STUDIO_ROW_H;
      const override = state.studioNodePositions[n.id];
      n.x = override ? override.x : defaultX;
      n.y = override ? override.y : defaultY;
    });
  });

  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const nodeW = maxDepth >= 1 ? STUDIO_LEAF_NODE_W : STUDIO_NODE_W;
  const worldWidth = STUDIO_MARGIN * 2 + maxDepth * STUDIO_COL_STEP + Math.max(STUDIO_NODE_W, nodeW);
  return { worldWidth, worldHeight };
}

function applyStudioTransform() {
  const world = document.getElementById("studio-world");
  if (!world) return;
  world.style.transform = `translate(${studioPan.x}px, ${studioPan.y}px) scale(${studioZoom})`;
}

function updateStudioZoomLabel() {
  const label = document.getElementById("studio-zoom-label");
  if (label) label.textContent = `${Math.round(studioZoom * 100)}%`;
}

function fitStudioView() {
  const canvas = document.getElementById("studio-canvas");
  const world = document.getElementById("studio-world");
  if (!canvas || !world) return;
  const canvasRect = canvas.getBoundingClientRect();
  const ww = parseFloat(world.style.width) || 1;
  const wh = parseFloat(world.style.height) || 1;
  if (canvasRect.width === 0 || canvasRect.height === 0) return;
  const zoom = Math.min(1, (canvasRect.width - 40) / ww, (canvasRect.height - 40) / wh);
  studioZoom = Math.max(STUDIO_ZOOM_MIN, Math.min(1, zoom));
  studioPan.x = (canvasRect.width - ww * studioZoom) / 2;
  studioPan.y = (canvasRect.height - wh * studioZoom) / 2;
  applyStudioTransform();
  updateStudioZoomLabel();
}

function resetStudioView() {
  studioUserAdjustedView = false;
  fitStudioView();
  requestAnimationFrame(() => drawConnectors());
}

function zoomStudioAt(cx, cy, newZoomRaw) {
  const newZoom = Math.min(STUDIO_ZOOM_MAX, Math.max(STUDIO_ZOOM_MIN, newZoomRaw));
  const worldX = (cx - studioPan.x) / studioZoom;
  const worldY = (cy - studioPan.y) / studioZoom;
  studioPan.x = cx - worldX * newZoom;
  studioPan.y = cy - worldY * newZoom;
  studioZoom = newZoom;
  studioUserAdjustedView = true;
  applyStudioTransform();
  updateStudioZoomLabel();
  requestAnimationFrame(() => drawConnectors());
}

function studioZoomStep(factor) {
  const canvas = document.getElementById("studio-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  zoomStudioAt(rect.width / 2, rect.height / 2, studioZoom * factor);
}

// Pan the canvas by dragging its empty background; nodes stop this via
// stopPropagation in their own pointerdown handler so the two gestures
// never fight each other.
function attachStudioCanvasInteractions() {
  const canvas = document.getElementById("studio-canvas");
  if (!canvas || canvas.dataset.wired) return;
  canvas.dataset.wired = "1";

  let panning = false;
  let startX = 0, startY = 0, startPan = { x: 0, y: 0 };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".studio-toolbar")) return;
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPan = { x: studioPan.x, y: studioPan.y };
    canvas.classList.add("panning");
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!panning) return;
    studioPan.x = startPan.x + (e.clientX - startX);
    studioPan.y = startPan.y + (e.clientY - startY);
    studioUserAdjustedView = true;
    applyStudioTransform();
    drawConnectors();
  });

  ["pointerup", "pointercancel"].forEach((evt) => {
    canvas.addEventListener(evt, (e) => {
      if (!panning) return;
      panning = false;
      canvas.classList.remove("panning");
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    });
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomStudioAt(e.clientX - rect.left, e.clientY - rect.top, studioZoom * factor);
    },
    { passive: false }
  );

  document.getElementById("studio-zoom-in")?.addEventListener("click", () => studioZoomStep(1.25));
  document.getElementById("studio-zoom-out")?.addEventListener("click", () => studioZoomStep(0.8));
  document.getElementById("studio-zoom-reset")?.addEventListener("click", resetStudioView);
}

// Distinguishes a click (navigate) from a drag (reposition + persist) by
// distance moved, since both start from the same pointerdown.
function attachStudioNodeDrag(el, n) {
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = n.x;
    startTop = n.y;
    el.classList.add("dragging");
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - startX) / studioZoom;
    const dy = (e.clientY - startY) / studioZoom;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    if (moved) {
      n.x = startLeft + dx;
      n.y = startTop + dy;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      drawConnectors();
    }
    e.stopPropagation();
  });

  el.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    e.stopPropagation();
    if (moved) {
      state.studioNodePositions[n.id] = { x: n.x, y: n.y };
      persist();
    } else {
      if (n.kind === "episode-result") {
        viewEpisode(n.episodeNumber);
        goToTab("episodes");
      } else {
        goToTab(studioNodeTargetTab(n.kind));
      }
    }
  });
}

function renderStudioGraph() {
  const canvas = document.getElementById("studio-canvas");
  const world = document.getElementById("studio-world");
  if (!canvas || !world) return;
  attachStudioCanvasInteractions();

  const { nodes, edges } = buildStudioGraph();
  const nodeIdKey = nodes.map((n) => n.id).sort().join(",");
  const structureChanged = nodeIdKey !== lastStudioNodeIds;
  lastStudioNodeIds = nodeIdKey;

  const { worldWidth, worldHeight } = layoutStudioNodes(nodes);
  world.style.width = `${worldWidth}px`;
  world.style.height = `${worldHeight}px`;
  applyStudioTransform();

  world.querySelectorAll(".studio-node").forEach((el) => el.remove());

  nodes.forEach((n) => {
    const el = document.createElement("div");
    el.className = "studio-node";
    el.dataset.nodeId = n.id;
    if (n.kind === "trend-result" || n.kind === "episode-result") {
      el.classList.add(n.kind === "trend-result" ? "trend-result-node" : "episode-result-node");
      if (n.selected) el.classList.add("selected");
    } else {
      if (n.status === "active") el.classList.add("active");
      if (n.status === "complete") el.classList.add("complete");
    }
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;

    const hasIn = n.depth > 0;
    const hasOut = edges.some((e) => e.from === n.id);
    el.innerHTML = `
      ${hasIn ? '<span class="node-port port-in"></span>' : ""}
      ${hasOut ? '<span class="node-port port-out"></span>' : ""}
      <div class="node-head">
        <span class="node-status-dot"></span>
        <span class="node-title">${escapeHtml(n.title)}</span>
      </div>
      <p class="node-sub">${escapeHtml(n.sub || "")}</p>
      <p class="node-meta">${escapeHtml(n.meta || "")}</p>
    `;
    attachStudioNodeDrag(el, n);
    world.appendChild(el);
  });

  requestAnimationFrame(() => drawConnectors(edges));

  if (!studioViewInitialized || (structureChanged && !studioUserAdjustedView)) {
    studioViewInitialized = true;
    requestAnimationFrame(fitStudioView);
  }
}

function drawConnectors(edges) {
  if (edges) lastStudioEdges = edges;
  const svg = document.getElementById("studio-connectors");
  const canvas = document.getElementById("studio-canvas");
  if (!svg || !canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width === 0) return;
  svg.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);
  svg.innerHTML = "";

  lastStudioEdges.forEach((edge) => {
    const fromPort = document.querySelector(`.studio-node[data-node-id="${edge.from}"] .port-out`);
    const toPort = document.querySelector(`.studio-node[data-node-id="${edge.to}"] .port-in`);
    if (!fromPort || !toPort) return;
    const a = fromPort.getBoundingClientRect();
    const b = toPort.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - canvasRect.left;
    const y1 = a.top + a.height / 2 - canvasRect.top;
    const x2 = b.left + b.width / 2 - canvasRect.left;
    const y2 = b.top + b.height / 2 - canvasRect.top;
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute("class", "connector-path");
    if (edge.lit) path.classList.add("lit");
    if (edge.flowing) path.classList.add("flowing");
    svg.appendChild(path);
  });
}

window.addEventListener("resize", () => {
  if (state.activeTab === "studio" && !viewProject.classList.contains("hidden")) drawConnectors();
});

/* ============================================================
   OFFICE — agent presence board
   Four static labels pinned over the four people in the team photo,
   one per agent, lit up from the same stepStatus state Studio reads.
   ============================================================ */

const OFFICE_AGENTS = [
  { key: "trends", name: "Trend Scout", left: 72, top: 47, meta: studioTrendsMeta },
  { key: "concept", name: "Concept Architect", left: 49, top: 31, meta: studioConceptMeta },
  { key: "season", name: "Season Planner", left: 46, top: 62, meta: studioSeasonMeta },
  { key: "episode", name: "Episode Director", left: 23, top: 46, meta: studioEpisodeMeta },
];

function renderOffice() {
  const markers = document.getElementById("office-markers");
  if (!markers) return;
  markers.innerHTML = OFFICE_AGENTS.map((agent) => {
    const status = state.stepStatus[agent.key];
    const cls = status === "active" ? "is-active" : status === "complete" ? "is-complete" : "";
    return `
      <div class="scene-label ${cls}" style="left:${agent.left}%; top:${agent.top}%;">
        <span class="scene-label-dot"></span>
        <span class="scene-label-text">${escapeHtml(agent.name)}</span>
        <span class="scene-label-status">${escapeHtml(agent.meta())}</span>
      </div>
    `;
  }).join("");
}

function stopOffice() {}

/* ============================================================
   RESUME — repaint panels for the loaded project's data
   ============================================================ */

function rehydratePanels() {
  if (state.trendOptions && state.trendOptions.length) {
    renderTrends(state.trendOptions);
    document.querySelectorAll(".trend-card").forEach((card) => {
      const i = parseInt(card.dataset.index, 10);
      const t = state.trendOptions[i];
      card.classList.toggle("selected", state.selectedTrends.some((s) => s.niche === t.niche));
    });
    trendsRefineRow.classList.remove("hidden");
    trendsApproveRow.classList.remove("hidden");
    updateTrendSelectionUI();
  } else {
    trendsGrid.innerHTML = "";
    trendsRefineRow.classList.add("hidden");
    trendsApproveRow.classList.add("hidden");
  }

  if (state.concept) {
    conceptSource.classList.remove("hidden");
    conceptSource.innerHTML = `Built from: <b>${escapeHtml(state.selectedTrends.map((t) => t.niche).join(", "))}</b>`;
    renderConcept(state.concept);
    conceptResult.classList.remove("hidden");
    conceptRefineRow.classList.remove("hidden");
    conceptApproveRow.classList.remove("hidden");
  } else {
    conceptResult.classList.add("hidden");
    conceptSource.classList.add("hidden");
    conceptRefineRow.classList.add("hidden");
    conceptApproveRow.classList.add("hidden");
  }

  if (state.stepStatus.season !== "locked") {
    unlockArcSection();
  } else {
    document.getElementById("arc-section").classList.add("locked");
    document.getElementById("arc-content").classList.add("hidden");
  }

  episodeCountInput.value = state.episodeCount || 20;
  episodeCountValue.textContent = episodeCountInput.value;
  if (state.season && state.season.length) {
    renderSeason(state.season);
    populateEpisodeSelect(state.season);
  } else {
    seasonList.innerHTML = "";
    episodeSelect.innerHTML = "";
  }
  syncSeasonApprovalUI();

  seasonCompleteBanner.classList.add("hidden");
  episodeApproveRow.classList.add("hidden");
  episodeRefineRow.classList.add("hidden");
  sceneList.innerHTML = "";
  episodeProgress.innerHTML = "";
  if (state.season && state.season.length) {
    renderEpisodeProgress();
    episodeSelect.value = state.currentEpisodeNumber;
    const scenes = state.scenesByEpisode[state.currentEpisodeNumber];
    if (scenes) {
      renderScenes(scenes);
      if (state.stepStatus.episode !== "complete") {
        episodeRefineRow.classList.remove("hidden");
        episodeApproveRow.classList.remove("hidden");
        btnApproveEpisode.textContent =
          state.currentEpisodeNumber < state.episodeCount ? "Approve & Next Episode →" : "Approve & Finish Season →";
      }
    }
    if (state.stepStatus.episode === "complete") {
      seasonCompleteBanner.classList.remove("hidden");
    }
  }

  renderTabNav();
  if (state.activeTab === "studio") renderStudioGraph();
  if (state.activeTab === "office") renderOffice();
}

/* ================= STEP 1: TRENDS ================= */

const btnScout = document.getElementById("btn-scout");
const trendsLoading = document.getElementById("trends-loading");
const trendsGrid = document.getElementById("trends-grid");
const trendsRefineRow = document.getElementById("trends-refine-row");
const trendsRefineInput = document.getElementById("trends-refine-input");
const btnResearchTrends = document.getElementById("btn-research-trends");
const trendsApproveRow = document.getElementById("trends-approve-row");
const trendsSelectedCount = document.getElementById("trends-selected-count");
const btnApproveTrends = document.getElementById("btn-approve-trends");

async function scoutTrends() {
  await withBusyGuard([btnScout, btnResearchTrends, btnApproveTrends], async () => {
    trendsLoading.classList.remove("hidden");
    trendsGrid.innerHTML = "";
    trendsRefineRow.classList.add("hidden");
    trendsApproveRow.classList.add("hidden");
    state.selectedTrends = [];
    try {
      const refine = trendsRefineInput.value.trim();
      const params = new URLSearchParams({ _t: Date.now() });
      if (refine) params.set("refine", refine);
      if (state.seenTrendNiches.length) params.set("exclude", JSON.stringify(state.seenTrendNiches));
      const res = await fetch(`/trends?${params.toString()}`, { cache: "no-store" });
      const trends = await parseApiResponse(res);
      state.trendOptions = trends;
      trends.forEach((t) => {
        if (t.niche && !state.seenTrendNiches.includes(t.niche)) state.seenTrendNiches.push(t.niche);
      });
      renderTrends(trends);
      trendsRefineRow.classList.remove("hidden");
      trendsApproveRow.classList.remove("hidden");
      updateTrendSelectionUI();
      persist();
    } catch (err) {
      trendsGrid.innerHTML = `<p style="color:var(--danger)">Failed to scout trends: ${err}</p>`;
    } finally {
      trendsLoading.classList.add("hidden");
    }
  });
}

function renderTrends(trends) {
  trendsGrid.innerHTML = "";
  trends.forEach((t, i) => {
    const card = document.createElement("div");
    card.className = "trend-card";
    card.dataset.index = i;
    card.innerHTML = `
      <span class="checkbox"></span>
      <p class="niche">${escapeHtml(t.niche)}</p>
      <p class="seed">${escapeHtml(t.seed)}</p>
      <p class="source">${escapeHtml(t.source_url)}</p>
    `;
    card.addEventListener("click", () => toggleTrendSelection(t, card));
    trendsGrid.appendChild(card);
  });
}

function toggleTrendSelection(trend, card) {
  const idx = state.selectedTrends.findIndex((t) => t.niche === trend.niche);
  if (idx >= 0) {
    state.selectedTrends.splice(idx, 1);
    card.classList.remove("selected");
  } else {
    state.selectedTrends.push(trend);
    card.classList.add("selected");
  }
  updateTrendSelectionUI();
  persist();
}

function updateTrendSelectionUI() {
  const n = state.selectedTrends.length;
  trendsSelectedCount.textContent = n === 1 ? "1 selected" : `${n} selected`;
  btnApproveTrends.disabled = n === 0;
  btnApproveTrends.textContent = n > 1 ? `Approve ${n} Selected →` : "Approve Selected →";
}

btnScout.addEventListener("click", scoutTrends);
btnResearchTrends.addEventListener("click", scoutTrends);

btnApproveTrends.addEventListener("click", () => {
  if (state.busy || state.selectedTrends.length === 0 || state.stepStatus.trends === "complete") return;
  setStepStatus("trends", "complete");
  setStepStatus("concept", "active");
  state.currentStep = "concept";
  goToTab("seasons");
  persist();
  generateConcept();
});

/* ================= STEP 2: CONCEPT ================= */

const conceptSource = document.getElementById("concept-source");
const conceptLoading = document.getElementById("concept-loading");
const conceptResult = document.getElementById("concept-result");
const conceptRefineRow = document.getElementById("concept-refine-row");
const conceptRefineInput = document.getElementById("concept-refine-input");
const btnResearchConcept = document.getElementById("btn-research-concept");
const conceptApproveRow = document.getElementById("concept-approve-row");
const btnApproveConcept = document.getElementById("btn-approve-concept");

async function generateConcept() {
  await withBusyGuard([btnResearchConcept, btnApproveConcept], async () => {
    conceptLoading.classList.remove("hidden");
    conceptResult.classList.add("hidden");
    conceptRefineRow.classList.add("hidden");
    conceptApproveRow.classList.add("hidden");

    const niches = state.selectedTrends.map((t) => t.niche).join(", ");
    conceptSource.classList.remove("hidden");
    conceptSource.innerHTML = `Built from: <b>${escapeHtml(niches)}</b>`;

    try {
      const res = await fetch("/concept", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeds: state.selectedTrends.map((t) => t.seed),
          niches: state.selectedTrends.map((t) => t.niche),
          note: conceptRefineInput.value || null,
          previous: state.concept || null,
        }),
      });
      const concept = await parseApiResponse(res);
      state.concept = concept;
      renderConcept(concept);
      conceptResult.classList.remove("hidden");
      conceptRefineRow.classList.remove("hidden");
      conceptApproveRow.classList.remove("hidden");
      persist();
    } catch (err) {
      conceptResult.innerHTML = `<p style="color:var(--danger)">Failed to generate concept: ${err}</p>`;
      conceptResult.classList.remove("hidden");
    } finally {
      conceptLoading.classList.add("hidden");
    }
  });
}

function renderConcept(concept) {
  document.getElementById("concept-logline").textContent = concept.logline;

  const badge = document.getElementById("style-dna-badge");
  const sb = concept.style_blend || {};
  badge.innerHTML = `
    <span>
      <span class="style-names">${escapeHtml(sb.director_name || sb.director_id)} × ${escapeHtml(sb.cinematographer_name || sb.cinematographer_id)}</span>
      <span class="style-reason">${escapeHtml(sb.reason || "")}</span>
    </span>
  `;

  const charGrid = document.getElementById("character-grid");
  charGrid.innerHTML = "";
  (concept.characters || []).forEach((c) => {
    const card = document.createElement("div");
    card.className = "char-card";
    card.innerHTML = `
      <p class="name">${escapeHtml(c.name)}</p>
      <p class="role">${escapeHtml(c.role)}</p>
      <p class="arc">${escapeHtml(c.arc)}</p>
      <p class="visual">${escapeHtml(c.visual_description)}</p>
    `;
    charGrid.appendChild(card);
  });

  const locList = document.getElementById("locations-list");
  locList.innerHTML = "";
  (concept.locations || []).forEach((loc) => {
    const li = document.createElement("li");
    li.textContent = loc;
    locList.appendChild(li);
  });
}

btnResearchConcept.addEventListener("click", generateConcept);

btnApproveConcept.addEventListener("click", () => {
  if (state.busy || state.stepStatus.concept === "complete") return;
  setStepStatus("concept", "complete");
  setStepStatus("season", "active");
  state.currentStep = "season";
  unlockArcSection();
  persist();
  generateSeason();
});

/* ================= STEP 3: SEASON (arc, inside Seasons tab) ================= */

const episodeCountInput = document.getElementById("episode-count");
const episodeCountValue = document.getElementById("episode-count-value");
const seasonControls = document.getElementById("season-controls");
const btnSeasonLoading = document.getElementById("season-loading");
const seasonList = document.getElementById("season-list");
const seasonRefineRow = document.getElementById("season-refine-row");
const seasonRefineInput = document.getElementById("season-refine-input");
const btnResearchSeason = document.getElementById("btn-research-season");
const seasonApproveRow = document.getElementById("season-approve-row");
const btnApproveSeason = document.getElementById("btn-approve-season");
const seasonApprovedNote = document.getElementById("season-approved-note");

// Once the season is approved, editing the episode count or re-approving
// makes no sense — and having both an "editable" slider and an "approve"
// button still showing next to the now-locked list is exactly the
// cluttered, ambiguous layout that reads as things overlapping. Swap them
// for a single clear confirmation instead.
function syncSeasonApprovalUI() {
  const approved = state.stepStatus.season === "complete";
  seasonControls.classList.toggle("locked", approved);
  episodeCountInput.disabled = approved;
  seasonApprovedNote.classList.toggle("hidden", !approved);
  if (approved) {
    seasonRefineRow.classList.add("hidden");
    seasonApproveRow.classList.add("hidden");
  } else if (state.season && state.season.length) {
    seasonRefineRow.classList.remove("hidden");
    seasonApproveRow.classList.remove("hidden");
  }
}

episodeCountInput.addEventListener("input", () => {
  episodeCountValue.textContent = episodeCountInput.value;
  state.episodeCount = parseInt(episodeCountInput.value, 10);
  persist();
});

async function generateSeason() {
  await withBusyGuard([btnResearchSeason, btnApproveSeason], async () => {
    btnSeasonLoading.classList.remove("hidden");
    seasonList.innerHTML = "";
    seasonRefineRow.classList.add("hidden");
    seasonApproveRow.classList.add("hidden");
    try {
      const res = await fetch("/season", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: state.concept,
          episode_count: parseInt(episodeCountInput.value, 10),
          note: seasonRefineInput.value || null,
          previous: state.season || null,
        }),
      });
      const season = await parseApiResponse(res);
      state.season = season;
      state.episodeCount = season.length;
      renderSeason(season);
      seasonRefineRow.classList.remove("hidden");
      seasonApproveRow.classList.remove("hidden");
      persist();
    } catch (err) {
      seasonList.innerHTML = `<p style="color:var(--danger)">Failed to generate season: ${err}</p>`;
    } finally {
      btnSeasonLoading.classList.add("hidden");
    }
  });
}

function renderSeason(episodes) {
  seasonList.innerHTML = "";
  episodes.forEach((ep) => {
    const li = document.createElement("li");
    li.className = "season-item";
    li.innerHTML = `
      <span class="ep-number">${String(ep.episode_number).padStart(2, "0")}</span>
      <div class="season-item-body">
        <p class="hook">${escapeHtml(ep.hook)}</p>
        <p class="cliffhanger"><span class="cliff-label">Cliffhanger</span>${escapeHtml(ep.cliffhanger)}</p>
      </div>
    `;
    seasonList.appendChild(li);
  });
}

btnResearchSeason.addEventListener("click", generateSeason);

btnApproveSeason.addEventListener("click", () => {
  if (state.busy || state.stepStatus.season === "complete") return;
  setStepStatus("season", "complete");
  setStepStatus("episode", "active");
  syncSeasonApprovalUI();
  populateEpisodeSelect(state.season);
  state.currentEpisodeNumber = 1;
  state.approvedEpisodes = [];
  state.currentStep = "episode";
  goToTab("episodes");
  persist();
  generateEpisode(1);
});

/* ================= STEP 4: EPISODE ================= */

const episodeProgress = document.getElementById("episode-progress");
const episodeSelect = document.getElementById("episode-select");
const episodeLoading = document.getElementById("episode-loading");
const sceneList = document.getElementById("scene-list");
const episodeRefineRow = document.getElementById("episode-refine-row");
const episodeRefineInput = document.getElementById("episode-refine-input");
const btnResearchEpisode = document.getElementById("btn-research-episode");
const episodeApproveRow = document.getElementById("episode-approve-row");
const btnApproveEpisode = document.getElementById("btn-approve-episode");
const seasonCompleteBanner = document.getElementById("season-complete");

function populateEpisodeSelect(episodes) {
  episodeSelect.innerHTML = "";
  episodes.forEach((ep) => {
    const opt = document.createElement("option");
    opt.value = ep.episode_number;
    opt.textContent = `Episode ${ep.episode_number}`;
    episodeSelect.appendChild(opt);
  });
}

function renderEpisodeProgress() {
  episodeProgress.innerHTML = "";
  for (let i = 1; i <= state.episodeCount; i++) {
    const pill = document.createElement("span");
    pill.className = "ep-pill";
    if (state.approvedEpisodes.includes(i)) pill.classList.add("approved");
    if (i === state.currentEpisodeNumber) pill.classList.add("current");
    pill.textContent = i;
    episodeProgress.appendChild(pill);
  }
}

async function generateEpisode(episodeNumber) {
  await withBusyGuard([btnResearchEpisode, btnApproveEpisode, episodeSelect], async () => {
    state.currentEpisodeNumber = episodeNumber;
    episodeSelect.value = episodeNumber;
    renderEpisodeProgress();
    seasonCompleteBanner.classList.add("hidden");

    episodeLoading.classList.remove("hidden");
    sceneList.innerHTML = "";
    episodeRefineRow.classList.add("hidden");
    episodeApproveRow.classList.add("hidden");

    try {
      const res = await fetch("/episode", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: state.season,
          episode_number: episodeNumber,
          style_blend: state.concept.style_blend,
          note: episodeRefineInput.value || null,
          previous: state.scenesByEpisode[episodeNumber] || null,
        }),
      });
      const data = await parseApiResponse(res);
      const scenes = data.scenes || data;
      state.scenesByEpisode[episodeNumber] = scenes;
      renderScenes(scenes);
      episodeRefineRow.classList.remove("hidden");
      episodeApproveRow.classList.remove("hidden");
      btnApproveEpisode.textContent =
        episodeNumber < state.episodeCount ? "Approve & Next Episode →" : "Approve & Finish Season →";
      persist();
    } catch (err) {
      sceneList.innerHTML = `<p style="color:var(--danger)">Failed to generate episode kit: ${err}</p>`;
    } finally {
      episodeLoading.classList.add("hidden");
    }
  });
}

// Jumping to an already-generated episode (e.g. from a Studio node) should
// just display what was already built, not burn another API call.
function viewEpisode(episodeNumber) {
  const scenes = state.scenesByEpisode[episodeNumber];
  if (!scenes) {
    generateEpisode(episodeNumber);
    return;
  }
  state.currentEpisodeNumber = episodeNumber;
  episodeSelect.value = episodeNumber;
  renderEpisodeProgress();
  renderScenes(scenes);
  seasonCompleteBanner.classList.toggle("hidden", state.stepStatus.episode !== "complete");
  if (state.stepStatus.episode !== "complete") {
    episodeRefineRow.classList.remove("hidden");
    episodeApproveRow.classList.remove("hidden");
    btnApproveEpisode.textContent =
      episodeNumber < state.episodeCount ? "Approve & Next Episode →" : "Approve & Finish Season →";
  } else {
    episodeRefineRow.classList.add("hidden");
    episodeApproveRow.classList.add("hidden");
  }
  persist();
}

function renderScenes(scenes) {
  sceneList.innerHTML = "";
  scenes.forEach((s) => {
    const card = document.createElement("div");
    card.className = "scene-card";
    card.innerHTML = `
      <div class="scene-header">
        <span class="scene-number"><b>Scene ${s.scene_number}</b></span>
        <span class="shot-type">${escapeHtml(s.shot_type)}</span>
      </div>
      <p class="description">${escapeHtml(s.description)}</p>
      <div class="prompt-block">
        <p class="prompt-row"><span class="prompt-label">Image</span>${escapeHtml(s.image_prompt)}</p>
        <span class="model-tag">🖼 ${escapeHtml(s.recommended_image_model)}</span>
      </div>
      <div class="prompt-block">
        <p class="prompt-row"><span class="prompt-label">Video</span>${escapeHtml(s.video_prompt)}</p>
        <span class="model-tag">🎬 ${escapeHtml(s.recommended_video_model)}</span>
      </div>
      <p class="direction">${escapeHtml(s.direction)}</p>
    `;
    sceneList.appendChild(card);
  });
}

episodeSelect.addEventListener("change", () => {
  generateEpisode(parseInt(episodeSelect.value, 10));
});

btnResearchEpisode.addEventListener("click", () => generateEpisode(state.currentEpisodeNumber));

btnApproveEpisode.addEventListener("click", () => {
  if (state.busy) return;
  if (!state.approvedEpisodes.includes(state.currentEpisodeNumber)) {
    state.approvedEpisodes.push(state.currentEpisodeNumber);
  }
  renderEpisodeProgress();

  if (state.currentEpisodeNumber < state.episodeCount) {
    persist();
    generateEpisode(state.currentEpisodeNumber + 1);
  } else {
    setStepStatus("episode", "complete");
    episodeApproveRow.classList.add("hidden");
    episodeRefineRow.classList.add("hidden");
    seasonCompleteBanner.classList.remove("hidden");
    persist();
  }
});

/* ============================================================
   BOOT
   ============================================================ */

(function boot() {
  // Small rotating 3D marks on the Trends / Seasons / Episodes headers.
  if (typeof initAccentIcon === "function") {
    document.querySelectorAll(".panel-mark").forEach((c) => initAccentIcon(c, c.dataset.icon));
  }

  const path = location.pathname;
  if (path.startsWith("/project/")) {
    showProject(decodeURIComponent(path.split("/project/")[1]), false);
  } else {
    showDashboard(false);
  }
})();
