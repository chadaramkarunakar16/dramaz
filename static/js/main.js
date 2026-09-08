/* ============================================================
   STORAGE LAYER — projects persisted to localStorage.
   Each project is stored under its own key; a lightweight index
   (id/title/subtitle/updatedAt/stepStatus) powers the dashboard
   grid without loading every project's full payload.
   ============================================================ */

const STORAGE_KEYS = {
  index: "dramaz:projects",
  project: (id) => `dramaz:project:${id}`,
  theme: "dramaz:theme",
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
  } catch (e) {
    /* storage unavailable/full — fail silently, app still works in-memory */
  }
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
  };
}

function loadProject(id) {
  const loaded = safeGetJSON(STORAGE_KEYS.project(id), null);
  if (!loaded) return null;
  // Merge onto defaults so older saved projects gain any new fields safely.
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

/* ============================================================
   THEME
   ============================================================ */

function getTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.theme) || "dark";
  } catch (e) {
    return "dark";
  }
}

const THEME_ICONS = {
  sun: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 16 16" fill="none"><path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 106.9 7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch (e) {}
  document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
    btn.innerHTML = theme === "dark" ? THEME_ICONS.sun : THEME_ICONS.moon;
    btn.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  });
}

function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

setTheme(getTheme());
document.querySelectorAll(".theme-toggle-btn").forEach((btn) => btn.addEventListener("click", toggleTheme));

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

/* ============================================================
   CURRENT PROJECT STATE — the active project being edited.
   Mutated in place (never reassigned) so all functions below
   that close over `state` keep working after a project switch.
   ============================================================ */

const PIPELINE = ["trends", "concept", "season", "episode"];
let currentProjectId = null;

const state = emptyProject();

function hydrateState(loaded) {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, loaded);
  if (!Array.isArray(state.approvedEpisodes)) state.approvedEpisodes = [];
  if (!state.scenesByEpisode) state.scenesByEpisode = {};
  state.busy = false;
}

function persist() {
  if (!currentProjectId) return;
  saveProject(state);
  const titleEl = document.getElementById("rail-project-title");
  if (titleEl) titleEl.textContent = projectTitle(state);
  document.title = `${projectTitle(state)} — Dramaz`;
}

// Guards against double-fired requests (double-click, rapid keyboard repeat, etc).
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
   ROUTER — dashboard (/) vs. a project (/project/<id>)
   ============================================================ */

const viewDashboard = document.getElementById("view-dashboard");
const viewProject = document.getElementById("view-project");

function showDashboard(push) {
  currentProjectId = null;
  viewDashboard.classList.remove("hidden");
  viewProject.classList.add("hidden");
  renderProjectGrid();
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
  renderStepper();
  goToStep(state.currentStep);
  rehydratePanels();
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
  return PIPELINE.map((s) => {
    const st = (stepStatus || {})[s];
    const cls = st === "complete" ? "done" : st === "active" ? "active" : "";
    return `<span class="progress-dot ${cls}"></span>`;
  }).join("");
}

function stageBadgeLabel(p) {
  const names = { trends: "Trends", concept: "Concept", season: "Season", episode: "Episode" };
  return names[p.currentStep] || "Trends";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
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
   STEPPER (in-project navigation)
   ============================================================ */

function setStepStatus(step, status) {
  state.stepStatus[step] = status;
  renderStepper();
}

function renderStepper() {
  document.querySelectorAll(".step").forEach((btn) => {
    const step = btn.dataset.step;
    const status = state.stepStatus[step];
    btn.classList.remove("active", "complete", "locked");
    btn.disabled = status === "locked";
    if (step === state.currentStep) btn.classList.add("active");
    else if (status === "complete") btn.classList.add("complete");
    else if (status === "locked") btn.classList.add("locked");

    const statusEl = btn.querySelector(".step-status");
    const defaults = {
      trends: "Scout what's viral",
      concept: "Logline, cast, world",
      season: "Episode arc",
      episode: "Shot-by-shot kit",
    };
    statusEl.textContent = status === "complete" && step !== state.currentStep ? "Approved" : defaults[step];
  });
}

function goToStep(step) {
  if (state.stepStatus[step] === "locked") return;
  state.currentStep = step;
  document.querySelectorAll(".stage-panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.panel === step);
  });
  renderStepper();
}

document.querySelectorAll(".step").forEach((btn) => {
  btn.addEventListener("click", () => {
    goToStep(btn.dataset.step);
    persist();
  });
});

/* ============================================================
   RESUME — repaint panels for whatever data the loaded
   project already has, so reopening a project mid-flow works.
   ============================================================ */

function rehydratePanels() {
  // Trends
  if (state.trendOptions && state.trendOptions.length) {
    renderTrends(state.trendOptions);
    document.querySelectorAll(".trend-card").forEach((card) => {
      const i = parseInt(card.dataset.index, 10);
      const t = state.trendOptions[i];
      const isSelected = state.selectedTrends.some((s) => s.niche === t.niche);
      card.classList.toggle("selected", isSelected);
    });
    trendsRefineRow.classList.remove("hidden");
    trendsApproveRow.classList.remove("hidden");
    updateTrendSelectionUI();
  } else {
    trendsGrid.innerHTML = "";
    trendsRefineRow.classList.add("hidden");
    trendsApproveRow.classList.add("hidden");
  }

  // Concept
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

  // Season
  episodeCountInput.value = state.episodeCount || 20;
  episodeCountValue.textContent = episodeCountInput.value;
  if (state.season && state.season.length) {
    renderSeason(state.season);
    populateEpisodeSelect(state.season);
    seasonRefineRow.classList.remove("hidden");
    seasonApproveRow.classList.remove("hidden");
  } else {
    seasonList.innerHTML = "";
    episodeSelect.innerHTML = "";
    seasonRefineRow.classList.add("hidden");
    seasonApproveRow.classList.add("hidden");
  }

  // Episode
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
      const trends = await res.json();
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
  if (state.busy || state.selectedTrends.length === 0) return;
  setStepStatus("trends", "complete");
  setStepStatus("concept", "active");
  goToStep("concept");
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
      const concept = await res.json();
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
  if (state.busy) return;
  setStepStatus("concept", "complete");
  setStepStatus("season", "active");
  goToStep("season");
  persist();
  generateSeason();
});

/* ================= STEP 3: SEASON ================= */

const episodeCountInput = document.getElementById("episode-count");
const episodeCountValue = document.getElementById("episode-count-value");
const btnSeasonLoading = document.getElementById("season-loading");
const seasonList = document.getElementById("season-list");
const seasonRefineRow = document.getElementById("season-refine-row");
const seasonRefineInput = document.getElementById("season-refine-input");
const btnResearchSeason = document.getElementById("btn-research-season");
const seasonApproveRow = document.getElementById("season-approve-row");
const btnApproveSeason = document.getElementById("btn-approve-season");

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
      const season = await res.json();
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
      <div>
        <p class="hook">${escapeHtml(ep.hook)}</p>
        <p class="cliffhanger"><span class="cliff-label">Cliffhanger</span>${escapeHtml(ep.cliffhanger)}</p>
      </div>
    `;
    seasonList.appendChild(li);
  });
}

btnResearchSeason.addEventListener("click", generateSeason);

btnApproveSeason.addEventListener("click", () => {
  if (state.busy) return;
  setStepStatus("season", "complete");
  setStepStatus("episode", "active");
  populateEpisodeSelect(state.season);
  state.currentEpisodeNumber = 1;
  state.approvedEpisodes = [];
  goToStep("episode");
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
      const data = await res.json();
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

(function initRouter() {
  const path = location.pathname;
  if (path.startsWith("/project/")) {
    showProject(decodeURIComponent(path.split("/project/")[1]), false);
  } else {
    showDashboard(false);
  }
})();
