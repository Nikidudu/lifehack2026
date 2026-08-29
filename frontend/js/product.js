/**
 * The editor keeps a "draft" whose scalars are always strings (so inputs stay
 * controlled and blank means "not provided"). `toPayload` converts a draft into
 * the canonical Product JSON the backend accepts — the backend forbids unknown
 * fields, so nothing extra may leak into the request.
 */

export const PRODUCT_KEYS = [
  "product_id", "title", "brand", "category", "description",
  "specifications", "materials", "dimensions", "price", "currency", "availability",
  "use_cases", "target_personas", "comparisons", "claims", "constraints_handled", "narrative",
];

export const STANDARD_CONSTRAINTS = [
  "budget", "climate", "geography", "time", "compatibility", "accessibility",
];

/** Which editor section a backend field path or scoring dimension belongs to. */
export const FIELD_SECTIONS = {
  product_id: "core", title: "core", brand: "core", category: "core",
  description: "core", price: "core", currency: "core", availability: "core",
  specifications: "attributes", materials: "attributes", dimensions: "attributes",
  use_cases: "use-cases", target_personas: "personas", comparisons: "comparisons",
  claims: "claims", constraints_handled: "constraints", narrative: "narrative",
};

export const DIMENSION_SECTIONS = {
  core_information: "core",
  structured_attributes: "attributes",
  use_case_coverage: "use-cases",
  persona_coverage: "personas",
  comparison_information: "comparisons",
  claims_and_evidence: "claims",
  constraint_coverage: "constraints",
  storytelling_context: "narrative",
};

export const DIMENSION_LABELS = {
  core_information: "Core information",
  structured_attributes: "Structured attributes",
  use_case_coverage: "Use-case coverage",
  persona_coverage: "Persona coverage",
  comparison_information: "Comparison information",
  claims_and_evidence: "Claims and evidence",
  constraint_coverage: "Constraint coverage",
  storytelling_context: "Storytelling / context",
};

export function dimensionLabel(key) {
  if (DIMENSION_LABELS[key]) return DIMENSION_LABELS[key];
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function sectionForField(field) {
  return FIELD_SECTIONS[String(field).split(".")[0]] || null;
}

const str = (value) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));
const strList = (value) => (Array.isArray(value) ? value.map(str) : []);
const clean = (list) => list.map((item) => item.trim()).filter(Boolean);
const nullable = (value) => (str(value).trim() ? str(value).trim() : null);

export function emptyDraft() {
  return {
    product_id: "", title: "", brand: "", category: "", description: "",
    specifications: [],
    materials: [],
    dimensions: { mode: "text", text: "", pairs: [] },
    price: "", currency: "", availability: "",
    use_cases: [], target_personas: [], comparisons: [], claims: [],
    constraints_handled: {
      budget: [], climate: [], geography: [], time: [],
      compatibility: [], accessibility: [], other: [],
    },
    narrative: "",
  };
}

export const newPair = () => ({ key: "", value: "" });
export const newUseCase = () => ({ name: "", description: "", conditions: [] });
export const newPersona = () => ({ name: "", description: "", priorities: [], constraints: [] });
export const newComparison = () => ({ alternative: "", advantages: [], disadvantages: [], evidence: "" });
export const newClaim = () => ({ claim: "", evidence: "", source: "" });
export const newOtherConstraint = () => ({ key: "", values: [] });

function pairsToObject(pairs) {
  const out = {};
  for (const { key, value } of pairs) {
    const name = str(key).trim();
    const text = str(value).trim();
    if (name && text) out[name] = text;
  }
  return out;
}

/** Build the exact JSON body for POST /api/v1/score. */
export function toPayload(draft) {
  const specs = pairsToObject(draft.specifications);
  const dimensionPairs = pairsToObject(draft.dimensions.pairs);
  const other = {};
  for (const entry of draft.constraints_handled.other) {
    const name = str(entry.key).trim();
    const values = clean(strList(entry.values));
    if (name && values.length) other[name] = values;
  }

  const priceText = str(draft.price).trim();

  return {
    product_id: nullable(draft.product_id),
    title: str(draft.title).trim(),
    brand: nullable(draft.brand),
    category: nullable(draft.category),
    description: nullable(draft.description),
    specifications: specs,
    materials: clean(strList(draft.materials)),
    dimensions: draft.dimensions.mode === "pairs"
      ? (Object.keys(dimensionPairs).length ? dimensionPairs : null)
      : nullable(draft.dimensions.text),
    price: priceText === "" ? null : Number(priceText),
    currency: nullable(draft.currency),
    availability: nullable(draft.availability),
    use_cases: draft.use_cases.map((item) => ({
      name: str(item.name).trim(),
      description: str(item.description).trim(),
      conditions: clean(strList(item.conditions)),
    })),
    target_personas: draft.target_personas.map((item) => ({
      name: str(item.name).trim(),
      description: str(item.description).trim(),
      priorities: clean(strList(item.priorities)),
      constraints: clean(strList(item.constraints)),
    })),
    comparisons: draft.comparisons.map((item) => ({
      alternative: str(item.alternative).trim(),
      advantages: clean(strList(item.advantages)),
      disadvantages: clean(strList(item.disadvantages)),
      evidence: nullable(item.evidence),
    })),
    claims: draft.claims.map((item) => ({
      claim: str(item.claim).trim(),
      evidence: nullable(item.evidence),
      source: nullable(item.source),
    })),
    constraints_handled: {
      budget: clean(strList(draft.constraints_handled.budget)),
      climate: clean(strList(draft.constraints_handled.climate)),
      geography: clean(strList(draft.constraints_handled.geography)),
      time: clean(strList(draft.constraints_handled.time)),
      compatibility: clean(strList(draft.constraints_handled.compatibility)),
      accessibility: clean(strList(draft.constraints_handled.accessibility)),
      other,
    },
    narrative: nullable(draft.narrative),
  };
}

function objectToPairs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, item]) => ({ key: str(key), value: str(item) }));
}

/** Turn canonical Product JSON (or a partial catalog record) into a draft. */
export function fromPayload(raw) {
  const warnings = [];
  const draft = emptyDraft();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("Expected a JSON object describing one product.");
    return { draft, warnings };
  }

  const unknown = Object.keys(raw).filter((key) => !PRODUCT_KEYS.includes(key));
  if (unknown.length) {
    warnings.push(`Dropped field(s) the schema forbids: ${unknown.join(", ")}.`);
  }

  for (const key of ["product_id", "title", "brand", "category", "description", "currency", "availability", "narrative"]) {
    draft[key] = str(raw[key]);
  }
  draft.price = raw.price === null || raw.price === undefined ? "" : String(raw.price);
  draft.specifications = objectToPairs(raw.specifications);
  draft.materials = strList(raw.materials);

  if (typeof raw.dimensions === "string") {
    draft.dimensions = { mode: "text", text: raw.dimensions, pairs: [] };
  } else if (raw.dimensions && typeof raw.dimensions === "object") {
    draft.dimensions = { mode: "pairs", text: "", pairs: objectToPairs(raw.dimensions) };
  }

  draft.use_cases = (Array.isArray(raw.use_cases) ? raw.use_cases : []).map((item) => ({
    ...newUseCase(), name: str(item?.name), description: str(item?.description), conditions: strList(item?.conditions),
  }));
  draft.target_personas = (Array.isArray(raw.target_personas) ? raw.target_personas : []).map((item) => ({
    ...newPersona(), name: str(item?.name), description: str(item?.description),
    priorities: strList(item?.priorities), constraints: strList(item?.constraints),
  }));
  draft.comparisons = (Array.isArray(raw.comparisons) ? raw.comparisons : []).map((item) => ({
    ...newComparison(), alternative: str(item?.alternative), advantages: strList(item?.advantages),
    disadvantages: strList(item?.disadvantages), evidence: str(item?.evidence),
  }));
  draft.claims = (Array.isArray(raw.claims) ? raw.claims : []).map((item) => ({
    ...newClaim(), claim: str(item?.claim), evidence: str(item?.evidence), source: str(item?.source),
  }));

  const handled = raw.constraints_handled;
  if (handled && typeof handled === "object" && !Array.isArray(handled)) {
    for (const key of STANDARD_CONSTRAINTS) draft.constraints_handled[key] = strList(handled[key]);
    const other = handled.other;
    if (other && typeof other === "object" && !Array.isArray(other)) {
      draft.constraints_handled.other = Object.entries(other).map(([key, values]) => ({
        key: str(key), values: strList(values),
      }));
    }
  }

  return { draft, warnings };
}

/** Client-side guards for the two things the backend rejects outright. */
export function validateDraft(draft) {
  const problems = [];
  if (!str(draft.title).trim()) problems.push("Title is required and cannot be blank.");
  const priceText = str(draft.price).trim();
  if (priceText !== "") {
    const price = Number(priceText);
    if (!Number.isFinite(price)) problems.push("Price must be a number, or left empty.");
    else if (price < 0) problems.push("Price cannot be negative.");
  }
  return problems;
}

/** How many of the eight schema sections carry any content at all. */
export function sectionFillCount(payload) {
  return [
    Boolean(payload.brand || payload.category || payload.description || payload.availability),
    Object.keys(payload.specifications).length > 0 || payload.materials.length > 0 || payload.dimensions,
    payload.use_cases.length > 0,
    payload.target_personas.length > 0,
    payload.comparisons.length > 0,
    payload.claims.length > 0,
    STANDARD_CONSTRAINTS.some((key) => payload.constraints_handled[key].length > 0)
      || Object.keys(payload.constraints_handled.other).length > 0,
    Boolean(payload.narrative),
  ].filter(Boolean).length;
}
