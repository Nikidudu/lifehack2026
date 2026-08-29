/** Structured editor for the canonical Product schema. */

import { el, mount, clear } from "./dom.js";
import {
  STANDARD_CONSTRAINTS, newPair, newUseCase, newPersona, newComparison, newClaim,
  newOtherConstraint,
} from "./product.js";

const openSections = new Set(["core"]);
const sectionNodes = new Map();
let badgeUpdaters = [];
let notifyChange = () => {};
let notifyStructure = () => {};

const nonEmpty = (list) => list.filter((item) => String(item).trim()).length;

/* ---------- primitive field builders ---------- */

function labelRow(text, { required = false, hint = "" } = {}) {
  return el("div", { class: "label" }, text, required ? el("span", { class: "required" }, "required") : null,
    hint ? el("span", { class: "hint" }, hint) : null);
}

function textField(text, obj, key, opts = {}) {
  const input = el("input", {
    type: opts.type || "text",
    value: obj[key] ?? "",
    placeholder: opts.placeholder || "",
    spellcheck: false,
    oninput: (event) => {
      obj[key] = event.target.value;
      notifyChange();
    },
  });
  return el("label", { class: "field" }, labelRow(text, opts), input);
}

function textAreaField(text, obj, key, opts = {}) {
  const area = el("textarea", {
    rows: opts.rows || 3,
    value: obj[key] ?? "",
    placeholder: opts.placeholder || "",
    oninput: (event) => {
      obj[key] = event.target.value;
      if (opts.onInput) opts.onInput(event.target.value);
      notifyChange();
    },
  });
  return el("label", { class: "field" }, labelRow(text, opts), area, opts.footer || null);
}

/** Chip editor bound to an array of strings. */
function chipsField(text, obj, key, opts = {}) {
  const box = el("div", { class: "chips" });

  const render = () => {
    clear(box);
    obj[key].forEach((value, index) => {
      box.appendChild(el("span", { class: "chip" }, value,
        el("button", {
          type: "button",
          title: "Remove",
          "aria-label": `Remove ${value}`,
          onclick: () => {
            obj[key].splice(index, 1);
            render();
            notifyChange();
          },
        }, "×")));
    });

    const commit = (raw) => {
      const parts = String(raw).split(",").map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return false;
      obj[key].push(...parts);
      render();
      notifyChange();
      return true;
    };

    const input = el("input", {
      type: "text",
      placeholder: opts.placeholder || "Add an item, then press Enter",
      spellcheck: false,
      onkeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (commit(event.target.value)) {
            box.querySelector("input")?.focus();
          }
        } else if (event.key === "Backspace" && !event.target.value && obj[key].length) {
          obj[key].pop();
          render();
          notifyChange();
          box.querySelector("input")?.focus();
        }
      },
      onblur: (event) => {
        if (event.target.value.trim()) commit(event.target.value);
      },
    });
    box.appendChild(input);
  };

  render();
  return el("div", { class: "field" }, labelRow(text, opts), box);
}

/** Key/value editor bound to an array of { key, value }. */
function pairsField(text, obj, key, opts = {}) {
  const wrap = el("div", { class: "pairs" });

  const render = () => {
    clear(wrap);
    obj[key].forEach((pair, index) => {
      wrap.appendChild(el("div", { class: "pair-row" },
        el("input", {
          type: "text", value: pair.key, placeholder: opts.keyPlaceholder || "name", spellcheck: false,
          oninput: (event) => { pair.key = event.target.value; notifyChange(); },
        }),
        el("input", {
          type: "text", value: pair.value, placeholder: opts.valuePlaceholder || "value", spellcheck: false,
          oninput: (event) => { pair.value = event.target.value; notifyChange(); },
        }),
        el("button", {
          class: "btn ghost tiny", type: "button", title: "Remove row",
          onclick: () => { obj[key].splice(index, 1); render(); notifyChange(); },
        }, "×")));
    });
    wrap.appendChild(el("button", {
      class: "btn tiny", type: "button",
      onclick: () => { obj[key].push(newPair()); render(); notifyChange(); },
    }, opts.addLabel || "Add row"));
  };

  render();
  return el("div", { class: "field" }, labelRow(text, opts), wrap);
}

/** Repeatable object cards (use cases, personas, comparisons, claims). */
function cardList(list, factory, renderCard, opts = {}) {
  const wrap = el("div", { class: "stack" });

  const render = () => {
    clear(wrap);
    if (!list.length) {
      wrap.appendChild(el("div", { class: "empty-note" }, opts.emptyText || "Nothing recorded yet."));
    }
    list.forEach((item, index) => {
      const head = el("div", { class: "card-head" },
        el("span", { class: "card-index" }, `${opts.itemLabel || "item"} ${index + 1}`),
        opts.badge ? opts.badge(item) : null,
        el("button", {
          class: "btn ghost tiny", type: "button",
          onclick: () => { list.splice(index, 1); render(); notifyStructure(); },
        }, "Remove"));
      wrap.appendChild(el("div", { class: "card" }, head, renderCard(item, index)));
    });
    const scored = opts.scoredCount;
    wrap.appendChild(el("div", { class: "card-head" },
      el("button", {
        class: "btn tiny", type: "button",
        onclick: () => { list.push(factory()); render(); notifyStructure(); },
      }, opts.addLabel || "Add"),
      scored ? el("span", { class: "hint" }, `Scoring counts the first ${scored}.`) : null));
  };

  render();
  return wrap;
}

/* ---------- sections ---------- */

function section(id, title, badgeFn, body) {
  const badge = el("span", { class: "badge" });
  const update = () => {
    const state = badgeFn();
    badge.textContent = state.text;
    badge.className = `badge ${state.tone || ""}`.trim();
  };
  badgeUpdaters.push(update);
  update();

  const node = el("details", {
    class: "section", id: `section-${id}`, open: openSections.has(id),
    ontoggle: (event) => {
      if (event.target.open) openSections.add(id);
      else openSections.delete(id);
    },
  },
    el("summary", {}, el("span", { class: "section-title" }, title), el("span", { class: "section-meta" }, badge)),
    el("div", { class: "section-body" }, body));

  sectionNodes.set(id, node);
  return node;
}

function coreSection(draft) {
  return section("core", "Identity & core attributes", () => {
    const filled = ["brand", "category", "description", "availability", "currency"]
      .filter((key) => String(draft[key]).trim()).length + (String(draft.price).trim() ? 1 : 0);
    return { text: `${filled}/6 optional filled`, tone: filled >= 5 ? "good" : filled >= 3 ? "warn" : "bad" };
  }, [
    textField("Title", draft, "title", { required: true, placeholder: "AeroLite 24L Commuter Backpack" }),
    el("div", { class: "grid-2" },
      textField("Product ID", draft, "product_id", { placeholder: "nordvik-aerolite-24" }),
      textField("Brand", draft, "brand", { placeholder: "Nordvik" })),
    el("div", { class: "grid-2" },
      textField("Category", draft, "category", { placeholder: "Commuter backpacks" }),
      textField("Availability", draft, "availability", { placeholder: "In stock" })),
    el("div", { class: "grid-2" },
      textField("Price", draft, "price", { type: "text", placeholder: "129", hint: "number only" }),
      textField("Currency", draft, "currency", { placeholder: "SGD" })),
    textAreaField("Description", draft, "description", {
      rows: 3,
      placeholder: "What the product is and what it is for — facts only.",
    }),
  ]);
}

function attributesSection(draft) {
  const dimensionsBox = el("div", { class: "field" });

  const renderDimensions = () => {
    const isPairs = draft.dimensions.mode === "pairs";
    mount(dimensionsBox,
      labelRow("Dimensions", { hint: "free text or named measurements" }),
      el("div", { class: "seg" },
        el("button", {
          class: `seg-btn ${isPairs ? "" : "is-active"}`, type: "button",
          onclick: () => { draft.dimensions.mode = "text"; renderDimensions(); notifyChange(); },
        }, "Text"),
        el("button", {
          class: `seg-btn ${isPairs ? "is-active" : ""}`, type: "button",
          onclick: () => { draft.dimensions.mode = "pairs"; renderDimensions(); notifyChange(); },
        }, "Measurements")),
      isPairs
        ? pairsField("", draft.dimensions, "pairs", {
            keyPlaceholder: "height", valuePlaceholder: "48 cm", addLabel: "Add measurement",
          })
        : el("input", {
            type: "text", value: draft.dimensions.text, spellcheck: false,
            placeholder: "48 x 30 x 17 cm",
            oninput: (event) => { draft.dimensions.text = event.target.value; notifyChange(); },
          }));
  };
  renderDimensions();

  return section("attributes", "Structured attributes", () => {
    const specs = draft.specifications.filter((pair) => pair.key.trim() && pair.value.trim()).length;
    const materials = nonEmpty(draft.materials);
    return {
      text: `${specs} spec${specs === 1 ? "" : "s"} · ${materials} material${materials === 1 ? "" : "s"}`,
      tone: specs >= 4 && materials >= 2 ? "good" : specs || materials ? "warn" : "bad",
    };
  }, [
    pairsField("Specifications", draft, "specifications", {
      hint: "four scored", keyPlaceholder: "weight", valuePlaceholder: "980 g", addLabel: "Add specification",
    }),
    chipsField("Materials", draft, "materials", { hint: "two scored", placeholder: "Recycled nylon 420D" }),
    dimensionsBox,
  ]);
}

function useCasesSection(draft) {
  return section("use-cases", "Use cases", () => {
    const count = draft.use_cases.length;
    return { text: `${count} recorded`, tone: count >= 3 ? "good" : count ? "warn" : "bad" };
  }, cardList(draft.use_cases, newUseCase, (item) => [
    textField("Name", item, "name", { placeholder: "Daily bike commute" }),
    textAreaField("Description", item, "description", {
      rows: 2, placeholder: "The scenario this product is used in.",
    }),
    chipsField("Conditions", item, "conditions", {
      hint: "two scored", placeholder: "Sudden heavy rain",
    }),
  ], { itemLabel: "use case", addLabel: "Add use case", scoredCount: 3, emptyText: "No use cases — agents cannot match this product to a stated intent." }));
}

function personasSection(draft) {
  return section("personas", "Target personas", () => {
    const count = draft.target_personas.length;
    return { text: `${count} recorded`, tone: count >= 3 ? "good" : count ? "warn" : "bad" };
  }, cardList(draft.target_personas, newPersona, (item) => [
    textField("Name", item, "name", { placeholder: "Bike commuter" }),
    textAreaField("Description", item, "description", { rows: 2, placeholder: "Who this buyer is." }),
    el("div", { class: "grid-2" },
      chipsField("Priorities", item, "priorities", { placeholder: "Water resistance" }),
      chipsField("Constraints", item, "constraints", { placeholder: "Budget under S$150" })),
  ], { itemLabel: "persona", addLabel: "Add persona", scoredCount: 3, emptyText: "No personas recorded." }));
}

function comparisonsSection(draft) {
  return section("comparisons", "Comparisons", () => {
    const count = draft.comparisons.length;
    const unsupported = draft.comparisons.filter((item) => !String(item.evidence).trim()).length;
    return {
      text: unsupported ? `${count} · ${unsupported} without evidence` : `${count} recorded`,
      tone: count >= 2 && !unsupported ? "good" : count ? "warn" : "bad",
    };
  }, cardList(draft.comparisons, newComparison, (item) => [
    textField("Alternative", item, "alternative", { placeholder: "Generic 25L polyester commuter pack" }),
    el("div", { class: "grid-2" },
      chipsField("Advantages", item, "advantages", { placeholder: "Coated shell" }),
      chipsField("Disadvantages", item, "disadvantages", { placeholder: "Higher price" })),
    textField("Evidence", item, "evidence", {
      hint: "worth 2 of 5 points", placeholder: "Published specification sheets for both models",
    }),
  ], {
    itemLabel: "comparison", addLabel: "Add comparison", scoredCount: 2,
    emptyText: "No comparisons — an agent cannot explain why to choose this over an alternative.",
    badge: (item) => (String(item.evidence).trim()
      ? null
      : el("span", { class: "badge warn" }, "no evidence")),
  }));
}

function claimsSection(draft) {
  return section("claims", "Claims & evidence", () => {
    const unsupported = draft.claims.filter((item) => String(item.claim).trim() && !String(item.evidence).trim()).length;
    if (unsupported) return { text: `${unsupported} unsupported`, tone: "bad" };
    return { text: `${draft.claims.length} supported`, tone: draft.claims.length >= 3 ? "good" : draft.claims.length ? "warn" : "bad" };
  }, cardList(draft.claims, newClaim, (item) => [
    textField("Claim", item, "claim", { placeholder: "Shell is water-resistant in light rain" }),
    textField("Evidence", item, "evidence", {
      hint: "3 of 5 points", placeholder: "Supplier PU-coating specification, 800 mm hydrostatic head",
    }),
    textField("Source", item, "source", { placeholder: "https://example.com/spec.pdf" }),
  ], {
    itemLabel: "claim", addLabel: "Add claim", scoredCount: 3,
    emptyText: "No claims recorded.",
    badge: (item) => (String(item.claim).trim() && !String(item.evidence).trim()
      ? el("span", { class: "badge bad" }, "unsupported")
      : null),
  }));
}

function constraintsSection(draft) {
  const handled = draft.constraints_handled;
  const otherWrap = el("div", { class: "stack" });

  const renderOther = () => {
    clear(otherWrap);
    if (!handled.other.length) {
      otherWrap.appendChild(el("div", { class: "empty-note" }, "No custom constraint categories."));
    }
    handled.other.forEach((entry, index) => {
      otherWrap.appendChild(el("div", { class: "card" },
        el("div", { class: "card-head" },
          el("span", { class: "card-index" }, `custom ${index + 1}`),
          el("button", {
            class: "btn ghost tiny", type: "button",
            onclick: () => { handled.other.splice(index, 1); renderOther(); notifyStructure(); },
          }, "Remove")),
        textField("Category", entry, "key", { placeholder: "warranty" }),
        chipsField("Values", entry, "values", { placeholder: "Two-year limited warranty" })));
    });
    otherWrap.appendChild(el("button", {
      class: "btn tiny", type: "button",
      onclick: () => { handled.other.push(newOtherConstraint()); renderOther(); notifyStructure(); },
    }, "Add custom category"));
  };
  renderOther();

  return section("constraints", "Constraints handled", () => {
    const covered = STANDARD_CONSTRAINTS.filter((key) => nonEmpty(handled[key])).length;
    return { text: `${covered}/6 categories`, tone: covered >= 5 ? "good" : covered ? "warn" : "bad" };
  }, [
    el("p", { class: "hint" }, "Record only constraints the product demonstrably satisfies. These are what natural-language queries actually contain."),
    el("div", { class: "grid-2" },
      chipsField("Budget", handled, "budget", { placeholder: "Under S$150" }),
      chipsField("Climate", handled, "climate", { placeholder: "Tropical rain" })),
    el("div", { class: "grid-2" },
      chipsField("Geography", handled, "geography", { placeholder: "Singapore" }),
      chipsField("Time", handled, "time", { placeholder: "Daily commuting" })),
    el("div", { class: "grid-2" },
      chipsField("Compatibility", handled, "compatibility", { placeholder: "16-inch laptops" }),
      chipsField("Accessibility", handled, "accessibility", { placeholder: "One-handed buckle" })),
    el("div", { class: "field" }, labelRow("Custom categories", { hint: "two scored" }), otherWrap),
  ]);
}

function narrativeSection(draft) {
  const counter = el("p", { class: "hint" });
  const updateCounter = (value) => {
    const length = String(value).trim().length;
    counter.textContent = `${length} characters — 120 earns the full 3 points.`;
  };
  updateCounter(draft.narrative);

  return section("narrative", "Storytelling & context", () => {
    const length = String(draft.narrative).trim().length;
    return { text: `${length} chars`, tone: length >= 120 ? "good" : length ? "warn" : "bad" };
  }, textAreaField("Narrative", draft, "narrative", {
    rows: 4,
    placeholder: "Factual brand and purpose framing, without new claims.",
    footer: counter,
    onInput: updateCounter,
  }));
}

/* ---------- public API ---------- */

export function renderForm(root, draft, { onChange, onStructuralChange }) {
  notifyChange = onChange || (() => {});
  notifyStructure = onStructuralChange || (() => {});
  badgeUpdaters = [];
  sectionNodes.clear();

  mount(root,
    coreSection(draft),
    attributesSection(draft),
    useCasesSection(draft),
    personasSection(draft),
    comparisonsSection(draft),
    claimsSection(draft),
    constraintsSection(draft),
    narrativeSection(draft));
}

/** Recompute the section summary badges without rebuilding inputs. */
export function refreshBadges() {
  for (const update of badgeUpdaters) update();
}

/** Mark sections that the latest score flagged as weak. */
export function applyFlags(sectionIds) {
  for (const [id, node] of sectionNodes) {
    node.classList.toggle("is-flagged", sectionIds.has(id));
  }
}

export function focusSection(sectionId) {
  const node = sectionNodes.get(sectionId);
  if (!node) return;
  node.open = true;
  openSections.add(sectionId);
  node.scrollIntoView({ behavior: "smooth", block: "start" });
  const input = node.querySelector("input, textarea");
  if (input) setTimeout(() => input.focus({ preventScroll: true }), 320);
}
