/** App wiring: state, persistence, and the input → score → fix → re-score loop. */

import { $, el, mount } from "./dom.js";
import { getHealth, getSchema, scoreProduct, generateProduct, normalizeBase, ApiError } from "./api.js";
import { emptyDraft, fromPayload, toPayload, validateDraft } from "./product.js";
import { SAMPLES } from "./samples.js";
import { renderForm, refreshBadges, applyFlags, focusSection } from "./form.js";
import { renderResults, weakSections, sameResult } from "./dashboard.js";

const STORE_KEY = "acr.session.v1";
const DEFAULT_BASE = "http://127.0.0.1:8000";

const state = {
  apiBase: DEFAULT_BASE,
  connection: "unknown",
  schema: null,
  draft: emptyDraft(),
  result: null,
  error: null,
  baseline: null,
  scoreCount: 0,
  tab: "breakdown",
  view: "form",
  busy: false,
  dirty: false,
};

const ui = {};

/* ---------- persistence (best effort; a private window may refuse) ---------- */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      apiBase: state.apiBase,
      product: toPayload(state.draft),
      baseline: state.baseline,
      result: state.result,
      scoreCount: state.scoreCount,
    }));
  } catch {
    /* storage unavailable — the session simply does not persist */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.apiBase) state.apiBase = saved.apiBase;
    if (saved.product) state.draft = fromPayload(saved.product).draft;
    if (saved.baseline) state.baseline = saved.baseline;
    if (saved.result) state.result = saved.result;
    if (typeof saved.scoreCount === "number") state.scoreCount = saved.scoreCount;
  } catch {
    /* ignore malformed or unavailable storage */
  }
}

/* ---------- rendering ---------- */

function setStatus(connection, text) {
  state.connection = connection;
  ui.status.dataset.state = connection;
  ui.statusText.textContent = text;
}

function renderVersions() {
  if (!state.schema) {
    ui.versions.hidden = true;
    return;
  }
  ui.versions.hidden = false;
  mount(ui.versions,
    el("span", { title: "Product schema version" }, `schema ${state.schema.schema_version}`),
    el("span", { title: "Deterministic scoring version" }, `scoring ${state.schema.scoring_version}`),
    el("span", { title: "Maximum total score" }, `max ${state.schema.total_maximum_score}`));
}

function renderFlow() {
  const hasTitle = Boolean(String(state.draft.title).trim());
  const done = {
    input: hasTitle,
    score: state.scoreCount >= 1,
    fix: state.scoreCount >= 2 || (state.scoreCount >= 1 && state.dirty),
    rescore: state.scoreCount >= 2,
    proof: state.scoreCount >= 2 && Boolean(state.baseline) && Boolean(state.result)
      && !sameResult(state.baseline.result, state.result),
  };
  let currentAssigned = false;
  for (const item of ui.flowSteps.querySelectorAll("li")) {
    const step = item.dataset.step;
    const isDone = Boolean(done[step]);
    const isCurrent = !isDone && !currentAssigned;
    if (isCurrent) currentAssigned = true;
    item.classList.toggle("is-done", isDone);
    item.classList.toggle("is-current", isCurrent);
  }
}

function renderJson() {
  if (state.view !== "json") return;
  ui.jsonEditor.value = JSON.stringify(toPayload(state.draft), null, 2);
}

function renderResultsPanel() {
  renderResults(ui.results, state, {
    onTab: (tab) => { state.tab = tab; renderResultsPanel(); },
    onFocusSection: (section) => {
      if (state.view !== "form") setView("form");
      focusSection(section);
    },
    onSetBaseline: () => {
      state.baseline = {
        result: state.result,
        at: new Date().toLocaleTimeString(),
        scoringVersion: state.schema?.scoring_version || "1.0.0",
      };
      state.tab = "breakdown";
      renderResultsPanel();
      renderFlow();
      save();
    },
    onClearBaseline: () => {
      state.baseline = null;
      state.scoreCount = state.result ? 1 : 0;
      state.tab = "breakdown";
      renderResultsPanel();
      renderFlow();
      save();
    },
  });
}

function renderEditor() {
  renderForm(ui.formView, state.draft, {
    onChange: () => {
      state.dirty = true;
      refreshBadges();
      renderJson();
      renderFlow();
      updateScoreButton();
      save();
    },
    onStructuralChange: () => {
      state.dirty = true;
      refreshBadges();
      renderJson();
      renderFlow();
      updateScoreButton();
      save();
    },
  });
  applyFlags(weakSections(state.result));
}

function updateScoreButton() {
  ui.score.disabled = state.busy;
  ui.score.textContent = state.busy
    ? "Scoring…"
    : state.scoreCount === 0
      ? "Score product"
      : state.dirty ? "Re-score product" : "Score again";
}

function setMessage(node, text, tone = "") {
  node.textContent = text || "";
  node.className = `inline-message ${tone}`.trim();
}

function setView(view) {
  state.view = view;
  ui.formView.hidden = view !== "form";
  ui.jsonView.hidden = view !== "json";
  for (const button of ui.viewButtons) {
    button.classList.toggle("is-active", button.dataset.view === view);
  }
  renderJson();
}

/* ---------- actions ---------- */

async function connect() {
  state.apiBase = normalizeBase(ui.apiBase.value) || DEFAULT_BASE;
  ui.apiBase.value = state.apiBase;
  setStatus("busy", "Connecting…");
  save();
  try {
    await getHealth(state.apiBase);
    state.schema = await getSchema(state.apiBase);
    setStatus("ok", "Backend connected");
    renderVersions();
  } catch (error) {
    state.schema = null;
    renderVersions();
    setStatus("down", error instanceof ApiError && error.code === "network" ? "Backend unreachable" : "Backend error");
    setMessage(ui.editorMessage, error.message, "error");
  }
}

async function runScore() {
  const problems = validateDraft(state.draft);
  if (problems.length) {
    setMessage(ui.editorMessage, problems.join(" "), "error");
    return;
  }
  setMessage(ui.editorMessage, "");

  state.busy = true;
  state.error = null;
  updateScoreButton();
  renderResultsPanel();

  try {
    const result = await scoreProduct(state.apiBase, toPayload(state.draft));
    state.result = result;
    state.scoreCount += 1;
    state.dirty = false;
    if (!state.baseline) {
      state.baseline = {
        result,
        at: new Date().toLocaleTimeString(),
        scoringVersion: state.schema?.scoring_version || "1.0.0",
      };
    } else if (!sameResult(state.baseline.result, result)) {
      state.tab = "proof";
    }
    if (state.connection !== "ok") setStatus("ok", "Backend connected");
  } catch (error) {
    state.error = error instanceof ApiError ? error : new ApiError(String(error.message || error));
    if (state.error.code === "network") setStatus("down", "Backend unreachable");
  } finally {
    state.busy = false;
    updateScoreButton();
    renderResultsPanel();
    applyFlags(weakSections(state.result));
    renderFlow();
    save();
  }
}

async function runGenerate() {
  const problems = validateDraft(state.draft);
  if (problems.length) {
    setMessage(ui.editorMessage, problems.join(" "), "error");
    return;
  }
  ui.generate.disabled = true;
  setMessage(ui.editorMessage, "Requesting enrichment from /api/v1/generate…");
  try {
    const enriched = await generateProduct(state.apiBase, toPayload(state.draft));
    const { draft, warnings } = fromPayload(enriched);
    state.draft = draft;
    state.dirty = true;
    renderEditor();
    renderJson();
    renderFlow();
    updateScoreButton();
    save();
    setMessage(ui.editorMessage, `Enriched draft loaded. ${warnings.join(" ")} Re-score to prove the improvement.`.trim(), "ok");
  } catch (error) {
    const message = error instanceof ApiError && (error.code === "not_found" || error.status === 405)
      ? "The generation service is not wired up yet — POST /api/v1/generate is not served by this backend. Fill the gaps by hand, or load the enriched sample."
      : error.message;
    setMessage(ui.editorMessage, message, "error");
  } finally {
    ui.generate.disabled = false;
  }
}

function loadSample(sample) {
  state.draft = fromPayload(sample.payload).draft;
  state.dirty = true;
  renderEditor();
  renderJson();
  renderFlow();
  updateScoreButton();
  setMessage(ui.editorMessage, `Loaded “${sample.label}”.`);
  save();
}

function applyJson() {
  let parsed;
  try {
    parsed = JSON.parse(ui.jsonEditor.value);
  } catch (error) {
    setMessage(ui.jsonMessage, `Invalid JSON: ${error.message}`, "error");
    return;
  }
  const { draft, warnings } = fromPayload(parsed);
  state.draft = draft;
  state.dirty = true;
  renderEditor();
  renderFlow();
  updateScoreButton();
  save();
  setMessage(ui.jsonMessage, warnings.length ? warnings.join(" ") : "Draft replaced.", warnings.length ? "error" : "ok");
}

async function copyJson() {
  const text = JSON.stringify(toPayload(state.draft), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setMessage(ui.jsonMessage, "Copied the payload to the clipboard.", "ok");
  } catch {
    ui.jsonEditor.select();
    setMessage(ui.jsonMessage, "Clipboard blocked — the payload is selected, press Ctrl+C.");
  }
}

/* ---------- boot ---------- */

function cacheNodes() {
  ui.apiBase = $("#api-base");
  ui.reconnect = $("#reconnect");
  ui.status = $("#status");
  ui.statusText = $("#status-text");
  ui.versions = $("#versions");
  ui.flowSteps = $("#flow-steps");
  ui.sampleButtons = $("#sample-buttons");
  ui.formView = $("#form-view");
  ui.jsonView = $("#json-view");
  ui.jsonEditor = $("#json-editor");
  ui.jsonApply = $("#json-apply");
  ui.jsonCopy = $("#json-copy");
  ui.jsonMessage = $("#json-message");
  ui.editorMessage = $("#editor-message");
  ui.results = $("#results");
  ui.score = $("#score");
  ui.generate = $("#generate");
  ui.viewButtons = Array.from(document.querySelectorAll(".seg-btn[data-view]"));
}

function wire() {
  ui.reconnect.addEventListener("click", connect);
  ui.apiBase.addEventListener("keydown", (event) => {
    if (event.key === "Enter") connect();
  });
  ui.score.addEventListener("click", runScore);
  ui.generate.addEventListener("click", runGenerate);
  ui.jsonApply.addEventListener("click", applyJson);
  ui.jsonCopy.addEventListener("click", copyJson);

  for (const button of ui.viewButtons) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }

  mount(ui.sampleButtons, SAMPLES.map((sample) => el("button", {
    class: "btn tiny", type: "button", title: sample.hint,
    onclick: () => loadSample(sample),
  }, sample.label)));

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runScore();
    }
  });
}

/**
 * Deep links for demo machines: ?api=<base>&sample=<id>&score=1 opens the
 * console already pointed at a backend, loaded with a fixture, and scored.
 */
async function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const sampleId = params.get("sample");
  if (sampleId) {
    const sample = SAMPLES.find((item) => item.id === sampleId);
    if (sample) loadSample(sample);
  }
  if (params.get("score") !== null && state.connection === "ok") await runScore();
}

async function boot() {
  cacheNodes();
  restore();

  const requestedBase = new URLSearchParams(location.search).get("api");
  if (requestedBase) state.apiBase = normalizeBase(requestedBase);
  ui.apiBase.value = state.apiBase;

  wire();
  renderEditor();
  setView("form");
  updateScoreButton();
  renderFlow();
  renderResultsPanel();
  await connect();
  await applyDeepLink();
}

boot();
