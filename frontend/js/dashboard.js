/** Readiness dashboard: score, breakdown, fix list, and before/after proof. */

import { el, svg, mount } from "./dom.js";
import { dimensionLabel, sectionForField, DIMENSION_SECTIONS } from "./product.js";

const BAND_COLORS = {
  "Not AI-Ready": "#f87171",
  "Developing": "#fbbf24",
  "AI-Ready with Gaps": "#60a5fa",
  "Highly AI-Ready": "#34d399",
};

const BAND_BLURB = {
  "Not AI-Ready": "An agent has almost nothing to reason over. It cannot match this product to a stated intent or justify recommending it.",
  "Developing": "An agent can identify the product but cannot defend it against alternatives or match specific constraints.",
  "AI-Ready with Gaps": "An agent can recommend this product for some intents, but the remaining gaps still force it to guess.",
  "Highly AI-Ready": "An agent can match this product to specific intents and explain the recommendation from supplied facts alone.",
};

const RING_RADIUS = 48;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const bandColor = (band) => BAND_COLORS[band] || "#9aa6c2";

/** Two scoring results are "the same" when the scorer produced identical output. */
export const sameResult = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fillClass(ratio) {
  if (ratio >= 0.8) return "fill-good";
  if (ratio >= 0.5) return "fill-mid";
  return "fill-low";
}

function ring(score, band) {
  const ratio = Math.max(0, Math.min(1, score / 100));
  return el("div", { class: "ring" },
    svg("svg", { width: 108, height: 108, viewBox: "0 0 108 108" },
      svg("circle", { class: "ring-track", cx: 54, cy: 54, r: RING_RADIUS, fill: "none", "stroke-width": 9 }),
      svg("circle", {
        class: "ring-value", cx: 54, cy: 54, r: RING_RADIUS, fill: "none", "stroke-width": 9,
        stroke: bandColor(band),
        "stroke-dasharray": RING_LENGTH.toFixed(2),
        "stroke-dashoffset": (RING_LENGTH * (1 - ratio)).toFixed(2),
      })),
    el("div", { class: "ring-label" },
      el("div", { class: "ring-score" }, String(score)),
      el("div", { class: "ring-max" }, "of 100")));
}

function deltaChip(current, baseline) {
  const delta = current - baseline;
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "=";
  return el("span", { class: `delta ${tone}`.trim() }, `${arrow} ${delta > 0 ? "+" : ""}${delta} vs baseline (${baseline})`);
}

function scoreHead(result, baseline) {
  return el("div", { class: "score-head" },
    ring(result.total_score, result.readiness_level),
    el("div", { class: "score-meta" },
      el("span", { class: "band", dataset: { band: result.readiness_level } }, result.readiness_level),
      el("p", {}, BAND_BLURB[result.readiness_level] || ""),
      baseline ? deltaChip(result.total_score, baseline.result.total_score) : null));
}

function dimensionRow(key, dimension, baselineDimension) {
  const ratio = dimension.score / dimension.max_score;
  const bar = el("div", { class: "bar" },
    el("i", { class: fillClass(ratio), style: { width: `${ratio * 100}%` } }));

  if (baselineDimension && baselineDimension.score !== dimension.score) {
    bar.appendChild(el("span", {
      class: "ghost-mark",
      title: `Baseline: ${baselineDimension.score}`,
      style: { left: `${(baselineDimension.score / dimension.max_score) * 100}%` },
    }));
  }

  const detail = el("div", { class: "dim-detail" });
  if (dimension.issues.length) {
    detail.appendChild(el("ul", {}, dimension.issues.map((issue) => el("li", { class: "issue" }, issue))));
  }
  if (dimension.suggestions.length) {
    detail.appendChild(el("ul", {}, dimension.suggestions.map((text) => el("li", {}, text))));
  }
  if (!dimension.issues.length && !dimension.suggestions.length) {
    detail.appendChild(el("div", {}, "Full marks — nothing missing in this dimension."));
  }

  return el("div", { class: "dim" },
    el("div", { class: "dim-head" },
      el("span", { class: "dim-name" }, dimensionLabel(key)),
      el("span", { class: "dim-score" }, `${dimension.score} / ${dimension.max_score}`)),
    bar,
    detail);
}

function breakdownTab(result, baseline, schema) {
  const order = schema && schema.scoring_dimensions
    ? Object.keys(schema.scoring_dimensions).filter((key) => key in result.dimensions)
    : Object.keys(result.dimensions);
  for (const key of Object.keys(result.dimensions)) {
    if (!order.includes(key)) order.push(key);
  }
  return el("div", { class: "tab-body" },
    order.map((key) => dimensionRow(key, result.dimensions[key], baseline?.result?.dimensions?.[key])));
}

function sectionForRecommendation(result, text) {
  for (const [key, dimension] of Object.entries(result.dimensions)) {
    if (dimension.suggestions.includes(text)) return DIMENSION_SECTIONS[key] || null;
  }
  return null;
}

function fixesTab(result, handlers) {
  const blocks = [];

  if (result.critical_issues.length) {
    blocks.push(el("div", { class: "list-card critical" },
      el("h3", {}, "Critical issues", el("span", { class: "badge bad" }, String(result.critical_issues.length))),
      el("p", { class: "hint" }, "Unsupported claims are the highest-risk content for a grounded agent: it either repeats an unverifiable statement or refuses to use the record."),
      result.critical_issues.map((issue) => el("div", { class: "critical-item" }, issue))));
  }

  blocks.push(el("div", { class: "list-card" },
    el("h3", {}, "Priority fixes", el("span", { class: "badge info" }, String(result.top_recommendations.length))),
    result.top_recommendations.length
      ? result.top_recommendations.map((text, index) => {
          const target = sectionForRecommendation(result, text);
          return el("div", { class: "rec" },
            el("span", { class: "rank" }, String(index + 1)),
            el("span", { class: "rec-text" }, text),
            target
              ? el("button", {
                  class: "btn tiny", type: "button",
                  onclick: () => handlers.onFocusSection(target),
                }, "Fix")
              : null);
        })
      : el("p", { class: "hint" }, "No outstanding recommendations.")));

  if (result.missing_fields.length) {
    blocks.push(el("div", { class: "list-card" },
      el("h3", {}, "Missing fields", el("span", { class: "badge warn" }, String(result.missing_fields.length))),
      el("p", { class: "hint" }, "Click a field to jump to it in the editor."),
      el("div", { class: "chips-static" },
        result.missing_fields.map((field) => el("button", {
          class: "chip-static", type: "button",
          onclick: () => {
            const target = sectionForField(field);
            if (target) handlers.onFocusSection(target);
          },
        }, field)))));
  }

  return el("div", { class: "tab-body" }, blocks);
}

function proofTab(result, baseline, schema) {
  const before = baseline.result;
  const order = schema && schema.scoring_dimensions
    ? Object.keys(schema.scoring_dimensions).filter((key) => key in result.dimensions)
    : Object.keys(result.dimensions);

  const rows = order.map((key) => {
    const now = result.dimensions[key];
    const then = before.dimensions[key];
    if (!now || !then) return null;
    const delta = now.score - then.score;
    const tone = delta > 0 ? "up" : delta < 0 ? "down" : "same";
    return el("div", { class: "cmp" },
      el("div", { class: "cmp-head" },
        el("span", {}, dimensionLabel(key)),
        el("span", { class: `cmp-delta ${tone}` },
          `${then.score} → ${now.score} (${delta > 0 ? "+" : ""}${delta})`)),
      el("div", { class: "cmp-bars" },
        el("div", { class: "bar before" }, el("i", { style: { width: `${(then.score / then.max_score) * 100}%` } })),
        el("div", { class: "bar" },
          el("i", {
            class: fillClass(now.score / now.max_score),
            style: { width: `${(now.score / now.max_score) * 100}%` },
          }))));
  });

  const resolvedCritical = before.critical_issues.filter((issue) => !result.critical_issues.includes(issue));
  const newCritical = result.critical_issues.filter((issue) => !before.critical_issues.includes(issue));
  const filledFields = before.missing_fields.filter((field) => !result.missing_fields.includes(field));

  const totalDelta = result.total_score - before.total_score;

  return el("div", { class: "tab-body" },
    el("div", { class: "list-card" },
      el("div", { class: "proof-head" },
        el("div", { class: "proof-score" },
          el("span", { class: "label" }, "Before"),
          el("span", { class: "value", style: { color: bandColor(before.readiness_level) } }, String(before.total_score)),
          el("span", { class: "hint" }, before.readiness_level)),
        el("span", { class: "proof-arrow" }, "→"),
        el("div", { class: "proof-score" },
          el("span", { class: "label" }, "After"),
          el("span", { class: "value", style: { color: bandColor(result.readiness_level) } }, String(result.total_score)),
          el("span", { class: "hint" }, result.readiness_level)),
        el("span", { class: `delta ${totalDelta > 0 ? "up" : totalDelta < 0 ? "down" : ""}`.trim() },
          `${totalDelta > 0 ? "+" : ""}${totalDelta} points`)),
      el("p", { class: "hint" },
        `${filledFields.length} field(s) filled · ${resolvedCritical.length} critical issue(s) resolved · same deterministic scorer, version ${(baseline.scoringVersion || "1.0.0")}.`)),
    el("div", { class: "list-card" },
      el("h3", {}, "Dimension movement"),
      rows),
    el("div", { class: "proof-lists" },
      el("div", { class: "list-card" },
        el("h3", {}, "Resolved"),
        resolvedCritical.length || filledFields.length
          ? el("ul", { class: "tiny-list" },
              resolvedCritical.map((issue) => el("li", { class: "resolved" }, issue)),
              filledFields.map((field) => el("li", { class: "resolved" }, `${field} now provided`)))
          : el("p", { class: "hint" }, "Nothing resolved yet.")),
      el("div", { class: "list-card" },
        el("h3", {}, "Still open"),
        result.critical_issues.length || result.missing_fields.length
          ? el("ul", { class: "tiny-list" },
              newCritical.map((issue) => el("li", { class: "added" }, `New: ${issue}`)),
              result.critical_issues.filter((issue) => !newCritical.includes(issue)).map((issue) => el("li", {}, issue)),
              result.missing_fields.map((field) => el("li", {}, `${field} still missing`)))
          : el("p", { class: "hint" }, "No gaps left."))));
}

function baselineBar(state, handlers) {
  const { baseline, result } = state;
  const isCurrent = baseline && result && sameResult(baseline.result, result);
  return el("div", { class: "baseline-bar" },
    baseline
      ? el("span", {},
          `Baseline: ${baseline.result.total_score}/100 (${baseline.result.readiness_level}) captured ${baseline.at}`)
      : el("span", {}, "No baseline captured yet — the first score becomes the baseline."),
    baseline && !isCurrent ? el("span", { class: "hint" }, "Automatically using the previous score") : null,
    baseline
      ? el("button", { class: "btn ghost tiny", type: "button", onclick: handlers.onClearBaseline }, "Clear")
      : null);
}

function errorBox(error) {
  const isValidation = error.code === "validation";
  return el("div", { class: "error-box" },
    el("h3", {}, isValidation ? "The product did not match the schema" : "Request failed"),
    el("p", { class: "hint" }, isValidation
      ? "The backend rejected the payload with HTTP 422. Fix the fields below and score again."
      : error.message),
    error.details && error.details.length
      ? el("ul", {}, error.details.map((detail) => el("li", {},
          el("code", {}, detail.field || "body"), ` — ${detail.message}`)))
      : null);
}

function emptyState(state) {
  if (state.busy) {
    return el("div", { class: "result-empty" },
      el("span", { class: "spinner" }),
      el("h3", {}, "Scoring…"),
      el("p", {}, "POST /api/v1/score — deterministic, no model call."));
  }
  return el("div", { class: "result-empty" },
    el("h3", {}, "No score yet"),
    el("p", {}, "Load a sample or fill in the product, then score it. The scorer is deterministic: the same product always produces the same result, and nothing is inferred from prose."));
}

export function renderResults(root, state, handlers) {
  const { result, error, baseline, schema } = state;
  const children = [];

  if (error) children.push(errorBox(error));

  if (!result) {
    mount(root, children, emptyState(state));
    return;
  }

  const hasProof = Boolean(baseline && !sameResult(baseline.result, result));
  const tabs = [
    { id: "breakdown", label: "Breakdown", count: null },
    { id: "fixes", label: "Fix list", count: result.top_recommendations.length + result.critical_issues.length },
    { id: "proof", label: "Before / after", count: null, disabled: !hasProof },
  ];
  const active = tabs.find((tab) => tab.id === state.tab && !tab.disabled) ? state.tab : "breakdown";

  children.push(scoreHead(result, hasProof ? baseline : null));
  children.push(el("div", { class: "tabs" }, tabs.map((tab) => el("button", {
    class: `tab ${tab.id === active ? "is-active" : ""}`.trim(),
    type: "button",
    disabled: Boolean(tab.disabled),
    title: tab.disabled ? "Re-score after editing to compare against the baseline." : "",
    onclick: () => handlers.onTab(tab.id),
  }, tab.label, tab.count ? el("span", { class: "count" }, String(tab.count)) : null))));

  if (active === "breakdown") children.push(breakdownTab(result, baseline, schema));
  else if (active === "fixes") children.push(fixesTab(result, handlers));
  else children.push(proofTab(result, baseline, schema));

  children.push(baselineBar(state, handlers));

  mount(root, children);
}

/** Sections whose dimension scored below 60% of its maximum. */
export function weakSections(result) {
  const flagged = new Set();
  if (!result) return flagged;
  for (const [key, dimension] of Object.entries(result.dimensions)) {
    if (dimension.score / dimension.max_score < 0.6) {
      const section = DIMENSION_SECTIONS[key];
      if (section) flagged.add(section);
    }
  }
  return flagged;
}
