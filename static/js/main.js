const PIPELINE = ["trends", "concept", "season", "episode"];

const state = {
  stepStatus: { trends: "active", concept: "locked", season: "locked", episode: "locked" },
  currentStep: "trends",
  trendOptions: [],
  selectedTrends: [],
  concept: null,
  season: null,
  episodeCount: 20,
  currentEpisodeNumber: 1,
  approvedEpisodes: new Set(),
  busy: false,
};

// Guards against double-fired requests (double-click, rapid keyboard repeat, etc).
// Runs `fn`, disabling `buttons` for its duration, and no-ops if another guarded call is in flight.
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

// ---------- STEPPER ----------

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
    if (status === "complete" && step !== state.currentStep) {
      statusEl.textContent = "Approved";
    } else {
      statusEl.textContent = defaults[step];
    }
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
  btn.addEventListener("click", () => goToStep(btn.dataset.step));
});

// ================= STEP 1: TRENDS =================

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
      const res = await fetch(`/trends?${params.toString()}`, { cache: "no-store" });
      const trends = await res.json();
      state.trendOptions = trends;
      renderTrends(trends);
      trendsRefineRow.classList.remove("hidden");
      trendsApproveRow.classList.remove("hidden");
      updateTrendSelectionUI();
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
      <p class="niche">${t.niche}</p>
      <p class="seed">${t.seed}</p>
      <p class="source">${t.source_url}</p>
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
  generateConcept();
});

// ================= STEP 2: CONCEPT =================

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
    conceptSource.innerHTML = `Built from: <b>${niches}</b>`;

    try {
      const res = await fetch("/concept", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeds: state.selectedTrends.map((t) => t.seed),
          niches: state.selectedTrends.map((t) => t.niche),
          note: conceptRefineInput.value || null,
        }),
      });
      const concept = await res.json();
      state.concept = concept;
      renderConcept(concept);
      conceptResult.classList.remove("hidden");
      conceptRefineRow.classList.remove("hidden");
      conceptApproveRow.classList.remove("hidden");
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
      <span class="style-names">${sb.director_name || sb.director_id} × ${sb.cinematographer_name || sb.cinematographer_id}</span>
      <span class="style-reason">${sb.reason || ""}</span>
    </span>
  `;

  const charGrid = document.getElementById("character-grid");
  charGrid.innerHTML = "";
  (concept.characters || []).forEach((c) => {
    const card = document.createElement("div");
    card.className = "char-card";
    card.innerHTML = `
      <p class="name">${c.name}</p>
      <p class="role">${c.role}</p>
      <p class="arc">${c.arc}</p>
      <p class="visual">${c.visual_description}</p>
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
  generateSeason();
});

// ================= STEP 3: SEASON =================

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
        }),
      });
      const season = await res.json();
      state.season = season;
      state.episodeCount = season.length;
      renderSeason(season);
      seasonRefineRow.classList.remove("hidden");
      seasonApproveRow.classList.remove("hidden");
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
        <p class="hook">${ep.hook}</p>
        <p class="cliffhanger"><span class="cliff-label">Cliffhanger</span>${ep.cliffhanger}</p>
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
  state.approvedEpisodes = new Set();
  goToStep("episode");
  generateEpisode(1);
});

// ================= STEP 4: EPISODE =================

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
    if (state.approvedEpisodes.has(i)) pill.classList.add("approved");
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
        }),
      });
      const data = await res.json();
      renderScenes(data.scenes || data);
      episodeRefineRow.classList.remove("hidden");
      episodeApproveRow.classList.remove("hidden");
      btnApproveEpisode.textContent = episodeNumber < state.episodeCount
        ? "Approve & Next Episode →"
        : "Approve & Finish Season →";
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
        <span class="shot-type">${s.shot_type}</span>
      </div>
      <p class="description">${s.description}</p>
      <p class="prompt-row"><span class="prompt-label">Image</span>${s.image_prompt}</p>
      <p class="prompt-row"><span class="prompt-label">Video</span>${s.video_prompt}</p>
      <span class="model-tag">${s.recommended_model}</span>
      <p class="direction">${s.direction}</p>
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
  state.approvedEpisodes.add(state.currentEpisodeNumber);
  renderEpisodeProgress();

  if (state.currentEpisodeNumber < state.episodeCount) {
    generateEpisode(state.currentEpisodeNumber + 1);
  } else {
    setStepStatus("episode", "complete");
    episodeApproveRow.classList.add("hidden");
    episodeRefineRow.classList.add("hidden");
    seasonCompleteBanner.classList.remove("hidden");
  }
});

renderStepper();
