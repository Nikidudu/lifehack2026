/** App wiring: state, persistence, and the input → score → fix → re-score loop. */

import { $, el, mount } from "./dom.js";
import { getHealth, getSchema, scoreProduct, importCatalog, suggestProducts, chatWithCoach, normalizeBase, ApiError } from "./api.js";
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
  catalog: [],
  catalogIndex: 0,
  proposals: [],
  coachQuestion: null,
  coachMessages: [{ role: "assistant", text: "Add or import a product, then score it. I’ll ask focused questions to improve its readiness." }],
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
  if (!ui.flowSteps) return;
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

function renderCatalog() {
  ui.catalogProduct.hidden = !state.catalog.length;
  mount(ui.catalogProduct, state.catalog.map((product, index) =>
    el("option", { value: String(index), selected: index === state.catalogIndex }, `${index + 1}. ${product.title}`)));
}

function renderSuggestions() {
  ui.suggestions.hidden = !state.proposals.length;
  mount(ui.suggestions, state.proposals.flatMap((proposal) => proposal.suggestions.map((suggestion) =>
    el("div", { class: "suggestion" },
      el("div", {}, el("strong", {}, proposal.title), el("span", { class: "badge info" }, suggestion.field),
        el("pre", {}, JSON.stringify(suggestion.value, null, 2))),
      el("button", { class: "btn tiny", type: "button", onclick: () => acceptSuggestion(proposal, suggestion) }, "Accept")))));
}

function renderCoach() {
  mount(ui.coachMessages,
    state.coachMessages.map((message) => el("div", { class: `coach-message ${message.role}` }, message.text)),
    state.coachQuestion === "busy"
      ? el("div", { class: "coach-message assistant thinking", "aria-label": "GPT is thinking" }, el("i"), el("i"), el("i"))
      : null);
  ui.coachMessages.scrollTop = ui.coachMessages.scrollHeight;
  const ready = state.coachQuestion === "ready";
  ui.coachAnswer.disabled = !ready;
  ui.coachSkip.disabled = !ready;
  ui.coachAnswer.placeholder = state.coachQuestion === "busy" ? "GPT is thinking…" : ready ? "Type your answer…" : "Score a product to start the coach";
}

async function askCoach(message) {
  if (!state.result || state.coachQuestion === "busy") return;
  const history = state.coachMessages.slice(1).map((item) => ({ role: item.role, content: item.text }));
  const startsConversation = message === "Begin the coaching conversation by asking the single most useful question.";
  if (!startsConversation) state.coachMessages.push({ role: "user", text: message });
  state.coachQuestion = "busy";
  renderCoach();
  try {
    const response = await chatWithCoach(state.apiBase, toPayload(state.draft), state.result, history, message);
    const previous = toPayload(state.draft);
    state.draft = fromPayload(response.updated_product).draft;
    state.dirty = JSON.stringify(previous) !== JSON.stringify(response.updated_product);
    const changed = response.changed_fields?.length ? ` Updated: ${response.changed_fields.join(", ")}.` : "";
    state.coachMessages.push({ role: "assistant", text: `${response.message}${changed}` });
    state.coachQuestion = "ready";
    if (state.catalog.length) state.catalog[state.catalogIndex] = toPayload(state.draft);
    renderEditor(); renderJson(); renderFlow(); updateScoreButton(); renderCoach(); save();
    if (state.dirty) await runScore();
  } catch (error) {
    state.coachQuestion = "ready";
    state.coachMessages.push({ role: "assistant", text: `${error.message} Check OPENAI_API_KEY and try again.` });
    renderCoach();
  }
}

async function answerCoach(event) {
  event.preventDefault();
  const answer = ui.coachAnswer.value.trim();
  if (!answer || state.coachQuestion !== "ready") return;
  ui.coachAnswer.value = "";
  await askCoach(answer);
}

function skipCoachQuestion() {
  if (state.coachQuestion === "ready") askCoach("Skip that question and ask a different useful question.");
}

function selectCatalogProduct(index) {
  if (state.catalog.length) state.catalog[state.catalogIndex] = toPayload(state.draft);
  state.catalogIndex = index;
  state.draft = fromPayload(state.catalog[index]).draft;
  state.result = null;
  state.scoreCount = 0;
  state.baseline = null;
  state.dirty = false;
  state.coachQuestion = null;
  state.coachMessages = [{ role: "assistant", text: `Now reviewing ${state.draft.title}. Score it and I’ll guide the improvements.` }];
  renderCoach();
  renderEditor(); renderCatalog(); renderResultsPanel(); renderFlow(); updateScoreButton();
}

function acceptSuggestion(proposal, suggestion) {
  const product = structuredClone(state.catalog[proposal.product_index] || toPayload(state.draft));
  product[suggestion.field] = suggestion.value;
  if (state.catalog.length) state.catalog[proposal.product_index] = product;
  if (!state.catalog.length || proposal.product_index === state.catalogIndex) {
    state.draft = fromPayload(product).draft;
    state.dirty = true;
    renderEditor(); renderFlow(); updateScoreButton();
  }
  proposal.suggestions = proposal.suggestions.filter((item) => item !== suggestion);
  state.proposals = state.proposals.filter((item) => item.suggestions.length);
  renderSuggestions();
  setMessage(ui.editorMessage, `Accepted ${suggestion.field} for ${proposal.title}. Re-score when ready.`, "ok");
}

function goToStep(step) {
  const showEditor = step === "input" || step === "rescore";
  if (showEditor) {
    setView("form");
    ui.editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    if (step === "input") focusSection("core");
    else ui.score.focus();
    return;
  }

  if (!state.result) {
    setMessage(ui.editorMessage, "Enter a product and score it first.", "error");
    ui.editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  state.tab = step === "fix" ? "fixes" : step === "proof" ? "proof" : "breakdown";
  renderResultsPanel();
  ui.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const previousResult = state.result;
  state.busy = true;
  state.error = null;
  updateScoreButton();
  renderResultsPanel();

  try {
    const result = await scoreProduct(state.apiBase, toPayload(state.draft));
    state.result = result;
    state.scoreCount += 1;
    state.dirty = false;
    if (previousResult && !sameResult(previousResult, result)) {
      state.baseline = {
        result: previousResult,
        at: new Date().toLocaleTimeString(),
        scoringVersion: state.schema?.scoring_version || "1.0.0",
      };
      state.tab = "proof";
    } else if (!previousResult) {
      state.baseline = {
        result,
        at: new Date().toLocaleTimeString(),
        scoringVersion: state.schema?.scoring_version || "1.0.0",
      };
    }
    if (state.connection !== "ok") setStatus("ok", "Backend connected");
    return result;
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
    if (state.result && !state.coachQuestion) askCoach("Begin the coaching conversation by asking the single most useful question.");
  }
}

async function runGenerate() {
  const problems = validateDraft(state.draft);
  if (problems.length) {
    setMessage(ui.editorMessage, problems.join(" "), "error");
    return;
  }
  ui.generate.disabled = true;
  setMessage(ui.editorMessage, "Generating optional suggestions…");
  try {
    if (state.catalog.length) state.catalog[state.catalogIndex] = toPayload(state.draft);
    const result = await suggestProducts(state.apiBase, state.catalog.length ? state.catalog : [toPayload(state.draft)]);
    state.proposals = result.products || [];
    renderSuggestions();
    setMessage(ui.editorMessage, state.proposals.length ? `${state.proposals.length} product proposal sets ready. Accept only what you want.` : (result.warnings || []).join(" "));
  } catch (error) {
    setMessage(ui.editorMessage, error.message, "error");
  } finally {
    ui.generate.disabled = false;
  }
}

async function runImport(file = ui.databaseFile.files[0]) {
  if (!file) return setMessage(ui.editorMessage, "Choose a SQLite database first.", "error");
  ui.dropZone.classList.add("is-busy");
  setMessage(ui.editorMessage, "Importing catalog…");
  try {
    const result = await importCatalog(state.apiBase, file);
    state.catalog = result.products;
    state.catalogIndex = 0;
    state.proposals = [];
    selectCatalogProduct(0);
    renderSuggestions();
    setMessage(ui.editorMessage, `Imported ${state.catalog.length} products. ${(result.warnings || []).join(" ")}`, "ok");
  } catch (error) {
    setMessage(ui.editorMessage, error.message, "error");
  } finally {
    ui.dropZone.classList.remove("is-busy");
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
  ui.editorPanel = $("#editor-panel");
  ui.resultsPanel = $("#results-panel");
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
  ui.databaseFile = $("#database-file");
  ui.databaseName = $("#database-name");
  ui.dropZone = $("#drop-zone");
  ui.catalogProduct = $("#catalog-product");
  ui.suggestions = $("#suggestions");
  ui.settingsToggle = $("#settings-toggle");
  ui.settingsMenu = $("#settings-menu");
  ui.coachMessages = $("#coach-messages");
  ui.coachForm = $("#coach-form");
  ui.coachAnswer = $("#coach-answer");
  ui.coachSkip = $("#coach-skip");
  ui.viewButtons = Array.from(document.querySelectorAll(".seg-btn[data-view]"));
}

function wire() {
  ui.reconnect.addEventListener("click", async () => {
    await connect();
    ui.settingsMenu.hidden = true;
    ui.settingsToggle.setAttribute("aria-expanded", "false");
  });
  ui.apiBase.addEventListener("keydown", (event) => {
    if (event.key === "Enter") connect();
  });
  ui.score.addEventListener("click", runScore);
  ui.generate.addEventListener("click", runGenerate);
  ui.databaseFile.addEventListener("change", () => {
    const file = ui.databaseFile.files[0];
    if (file) {
      ui.databaseName.textContent = file.name;
      runImport(file);
    }
  });
  ui.catalogProduct.addEventListener("change", () => selectCatalogProduct(Number(ui.catalogProduct.value)));
  for (const eventName of ["dragenter", "dragover"]) {
    ui.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); ui.dropZone.classList.add("is-dragging"); });
  }
  for (const eventName of ["dragleave", "drop"]) {
    ui.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); ui.dropZone.classList.remove("is-dragging"); });
  }
  ui.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) { ui.databaseName.textContent = file.name; runImport(file); }
  });
  ui.settingsToggle.addEventListener("click", () => {
    ui.settingsMenu.hidden = !ui.settingsMenu.hidden;
    ui.settingsToggle.setAttribute("aria-expanded", String(!ui.settingsMenu.hidden));
  });
  ui.coachForm.addEventListener("submit", answerCoach);
  ui.coachSkip.addEventListener("click", skipCoachQuestion);
  ui.jsonApply.addEventListener("click", applyJson);
  ui.jsonCopy.addEventListener("click", copyJson);

  for (const item of ui.flowSteps?.querySelectorAll("li") || []) {
    item.addEventListener("click", () => goToStep(item.dataset.step));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goToStep(item.dataset.step);
      }
    });
  }

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
  renderCatalog();
  renderSuggestions();
  renderCoach();
  setView("form");
  updateScoreButton();
  renderFlow();
  renderResultsPanel();
  await connect();
  await applyDeepLink();
}

boot();
