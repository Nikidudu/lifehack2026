import OpenAI from "openai";

// MOCK_AI=1 in server/.env runs the pipeline with canned keyword-based
// results instead of calling OpenAI — for developing/demoing without a key.
const MOCK = () => process.env.MOCK_AI === "1";

const MOCK_TYPE_RULES = [
  [/shoe|sneaker|boot|sandal|runner|oxford|trainer|spike|slip-on|chelsea|loafer|sole|monk strap/i, "shoes"],
  [/watch|chrono|timer|moonphase|gmt|quartz|digital|smartwatch|fitness tracker/i, "watches"],
  [/pack|bag|tote|duffel|messenger|clutch|briefcase|sling|carryall|roller|courier/i, "bags"],
];

const MOCK_TAXONOMIES = {
  shoes: [
    { name: "setting", kind: "single-choice", values: ["formal", "casual", "sports"] },
    { name: "material", kind: "single-choice", values: ["leather", "textile", "synthetic"] },
    { name: "waterproof", kind: "binary", values: ["yes", "no"] },
  ],
  watches: [
    { name: "style", kind: "single-choice", values: ["dress", "sport", "casual"] },
    { name: "movement", kind: "single-choice", values: ["automatic", "quartz", "digital"] },
    { name: "smart features", kind: "binary", values: ["yes", "no"] },
  ],
  bags: [
    { name: "use case", kind: "single-choice", values: ["work", "travel", "everyday"] },
    { name: "size", kind: "single-choice", values: ["small", "medium", "large"] },
    { name: "fits a laptop", kind: "binary", values: ["yes", "no"] },
  ],
};
const MOCK_DEFAULT_TAXONOMY = [
  { name: "style", kind: "single-choice", values: ["classic", "modern", "sporty"] },
  { name: "premium", kind: "binary", values: ["yes", "no"] },
];

let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw Object.assign(
      new Error(
        "OPENAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key."
      ),
      { status: 500 }
    );
  }
  if (!client) client = new OpenAI();
  return client;
}

const MODEL = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

async function jsonCall(system, user, schemaName, schema) {
  const res = await getClient().chat.completions.create({
    model: MODEL(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, strict: true, schema },
    },
  });
  return JSON.parse(res.choices[0].message.content);
}

// ---------------------------------------------------------------------------
// 1. Classify every product into a small set of general product types.
//    AI only picks a coarse type (shoes / watches / ...) — never attributes.
// ---------------------------------------------------------------------------
const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          product_type: { type: "string" },
        },
        required: ["id", "product_type"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
};

export async function classifyProductTypes(products) {
  if (MOCK()) {
    return products.map((p) => {
      const hay = `${p.name} ${p.description || ""}`;
      const rule = MOCK_TYPE_RULES.find(([re]) => re.test(hay));
      return { id: String(p.id), product_type: rule ? rule[1] : "other" };
    });
  }

  const BATCH = 80;
  const assignments = [];
  const knownTypes = new Set();

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const listing = batch
      .map((p) => {
        const desc = p.description
          ? ` — ${String(p.description).slice(0, 100)}`
          : "";
        return `${p.id}: ${p.name}${desc}`;
      })
      .join("\n");

    const known = knownTypes.size
      ? `Types already used for this catalog (REUSE these whenever they fit): ${[...knownTypes].join(", ")}.`
      : "";

    const out = await jsonCall(
      "You classify catalog products into a SMALL set of general product types " +
        "(examples of the granularity wanted: shoes, watches, bags, cars). " +
        "Use short lowercase plural nouns. Keep the total number of distinct types minimal. " +
        known,
      `Assign a product_type to every product below. Return one assignment per id.\n\n${listing}`,
      "classification",
      CLASSIFY_SCHEMA
    );

    for (const a of out.assignments) {
      const type = a.product_type.trim().toLowerCase();
      if (!type) continue;
      knownTypes.add(type);
      assignments.push({ id: String(a.id), product_type: type });
    }
  }

  // Only keep assignments for ids we actually sent.
  const validIds = new Set(products.map((p) => String(p.id)));
  return assignments.filter((a) => validIds.has(a.id));
}

// ---------------------------------------------------------------------------
// 2. Generate the attribute taxonomy for one product type. AI proposes the
//    vocabulary (category names + values); humans assign products to values.
// ---------------------------------------------------------------------------
const TAXONOMY_SCHEMA = {
  type: "object",
  properties: {
    attributes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["single-choice", "binary"] },
          values: { type: "array", items: { type: "string" } },
        },
        required: ["name", "kind", "values"],
        additionalProperties: false,
      },
    },
  },
  required: ["attributes"],
  additionalProperties: false,
};

export async function generateTaxonomy(productType, sampleNames) {
  if (MOCK()) {
    return MOCK_TAXONOMIES[productType] || MOCK_DEFAULT_TAXONOMY;
  }

  const out = await jsonCall(
    "You design product attribute taxonomies that help AI shopping assistants " +
      "recommend products. Attributes must describe qualities a human can judge " +
      "by looking at a product (setting, material, style...), never facts they " +
      "can't know. Every attribute is either 'single-choice' with EXACTLY 3 " +
      "mutually exclusive values, or 'binary' with values yes/no. Binary " +
      "attributes must ask about ONE concrete, type-specific property (e.g. " +
      "waterproof, hiking-ready, has laptop sleeve) — never vague quality " +
      "judgements like premium or high-end. Every attribute must be specific " +
      "to this product type, not generic. Use short lowercase labels.",
    `Product type: ${productType}\n` +
      `Sample products from this catalog:\n${sampleNames.slice(0, 25).join("\n")}\n\n` +
      `Propose 3 to 5 attributes for categorizing these ${productType}. ` +
      `Example for shoes: setting (formal/casual/sports), material (leather/textile/synthetic), waterproof (yes/no).`,
    "taxonomy",
    TAXONOMY_SCHEMA
  );

  // Post-process so the UI contract holds even if the model drifts:
  const seen = new Set();
  const attributes = [];
  for (const raw of out.attributes) {
    const name = raw.name.trim().toLowerCase();
    if (!name || name === "product_type" || seen.has(name)) continue;
    let kind = raw.kind;
    let values = [...new Set(raw.values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
    if (kind === "binary" || values.length < 3) {
      kind = "binary";
      values = ["yes", "no"];
    } else {
      kind = "single-choice";
      values = values.slice(0, 3); // the "3 boxes" contract
    }
    seen.add(name);
    attributes.push({ name, kind, values });
    if (attributes.length === 5) break;
  }

  if (attributes.length === 0) {
    throw Object.assign(
      new Error(`Could not generate categories for "${productType}".`),
      { status: 502 }
    );
  }
  return attributes;
}
