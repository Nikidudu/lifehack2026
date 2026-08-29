/**
 * Demo fixtures. These are canonical Product payloads, so they double as
 * documentation of the contract in `backend/app/models/product.py`.
 *
 * `messy` and `enriched` describe the SAME product before and after enrichment,
 * which is what drives the before/after proof view during the pitch. They are
 * illustrative fixtures written for the demo, not vendor-supplied facts.
 */

const MINIMAL = {
  title: "Everyday Backpack",
};

const COMPLETE = {
  product_id: "shoe-001",
  title: "Breeze Runner 2",
  brand: "Example Athletics",
  category: "Running shoes",
  description: "A lightweight road-running shoe designed for warm weather training.",
  specifications: { weight: "240 g", heel_to_toe_drop: "8 mm" },
  materials: ["Recycled mesh", "Rubber"],
  dimensions: { size_range: "EU 36-47" },
  price: 179.9,
  currency: "SGD",
  availability: "In stock",
  use_cases: [
    {
      name: "Humid-weather training",
      description: "Daily road training in warm, humid weather.",
      conditions: ["High humidity", "Road surfaces"],
    },
  ],
  target_personas: [
    {
      name: "Recreational runner",
      description: "A runner preparing for a first half marathon.",
      priorities: ["Breathability", "Low weight"],
      constraints: ["Budget under S$200"],
    },
  ],
  comparisons: [
    {
      alternative: "Traditional stability shoe",
      advantages: ["Lighter upper"],
      disadvantages: ["Less stability support"],
      evidence: "Manufacturer weight specifications",
    },
  ],
  claims: [
    {
      claim: "Upper contains recycled material",
      evidence: "Material composition report",
      source: "https://example.com/material-report",
    },
  ],
  constraints_handled: {
    budget: ["Under S$200"],
    climate: ["Hot and humid"],
    geography: ["Singapore"],
    time: ["Daily training"],
    compatibility: ["Road running"],
    accessibility: ["Wide sizes available"],
    other: { experience_level: ["Beginner", "Intermediate"] },
  },
  narrative: "Built for runners who train through tropical weather.",
};

const MESSY = {
  title: "AeroLite 24L Commuter Backpack — Black",
  brand: "Nordvik",
  description:
    "The best commuter backpack you can buy. Premium materials, unbeatable durability, and a design everyone loves.",
  specifications: { capacity: "24 L" },
  materials: ["Nylon"],
  price: 129,
  currency: "SGD",
  claims: [
    { claim: "Waterproof in all conditions" },
    { claim: "Made from 100% recycled fabric" },
  ],
  narrative: "Carry more.",
};

const ENRICHED = {
  product_id: "nordvik-aerolite-24",
  title: "AeroLite 24L Commuter Backpack — Black",
  brand: "Nordvik",
  category: "Commuter backpacks",
  description:
    "A 24-litre commuter backpack with a padded 16-inch laptop sleeve, a water-resistant recycled nylon shell, and a luggage pass-through strap.",
  specifications: {
    capacity: "24 L",
    weight: "980 g",
    laptop_compartment: "Fits up to 16-inch laptops",
    water_resistance: "PU-coated shell, rated to light rain",
  },
  materials: ["Recycled nylon 420D", "YKK zippers"],
  dimensions: { height: "48 cm", width: "30 cm", depth: "17 cm" },
  price: 129,
  currency: "SGD",
  availability: "In stock",
  use_cases: [
    {
      name: "Daily bike commute",
      description: "Carrying a laptop and a change of clothes on a bicycle commute in tropical rain.",
      conditions: ["Sudden heavy rain", "Bicycle commuting", "Laptop carried daily"],
    },
    {
      name: "Cabin-only travel",
      description: "Serving as a personal item on short-haul flights with a carry-on suitcase.",
      conditions: ["Under-seat storage", "Luggage pass-through needed"],
    },
    {
      name: "Campus study days",
      description: "Carrying a laptop, notebooks, and a water bottle between lectures.",
      conditions: ["Long wearing periods"],
    },
  ],
  target_personas: [
    {
      name: "Bike commuter",
      description: "Commutes 8 km each way by bicycle in a humid climate.",
      priorities: ["Water resistance", "Comfort under load"],
      constraints: ["Must protect a work laptop", "Budget under S$150"],
    },
    {
      name: "Frequent short-haul traveller",
      description: "Flies weekly with cabin baggage only.",
      priorities: ["Fits under an airline seat", "Attaches to a suitcase"],
      constraints: ["Airline personal-item size limits"],
    },
    {
      name: "University student",
      description: "Carries a laptop and books across campus for a full day.",
      priorities: ["Light empty weight", "Organisation"],
      constraints: ["Budget under S$150"],
    },
  ],
  comparisons: [
    {
      alternative: "Nordvik Trail 30L hiking pack",
      advantages: ["Lower empty weight", "Structured laptop protection"],
      disadvantages: ["Smaller capacity", "No hip-belt load transfer"],
      evidence: "Published specification sheets for both models",
    },
    {
      alternative: "Generic 25L polyester commuter pack",
      advantages: ["Water-resistant coated shell", "Luggage pass-through strap"],
      disadvantages: ["Higher price"],
      evidence: "Product specification comparison, retail listings as of 2026-08",
    },
  ],
  claims: [
    {
      claim: "Shell is water-resistant in light rain",
      evidence: "Supplier PU-coating specification, 800 mm hydrostatic head",
      source: "https://example.com/nordvik/aerolite/fabric-spec.pdf",
    },
    {
      claim: "Shell fabric is made from recycled nylon",
      evidence: "Global Recycled Standard certificate for the shell fabric lot",
      source: "https://example.com/nordvik/certificates/grs-2026.pdf",
    },
    {
      claim: "Carries a 16-inch laptop",
      evidence: "Internal sleeve measures 38 x 26 cm",
    },
  ],
  constraints_handled: {
    budget: ["Under S$150"],
    climate: ["Tropical rain", "High humidity"],
    geography: ["Singapore", "Southeast Asia"],
    time: ["Daily commuting"],
    compatibility: ["16-inch laptops", "Suitcase luggage handles"],
    accessibility: ["One-handed magnetic buckle"],
    other: {
      warranty: ["Two-year limited warranty"],
      care: ["Machine washable at 30C"],
    },
  },
  narrative:
    "Nordvik builds commuter gear for cities where the weather changes on the way to work. The AeroLite is the everyday pack in that range: a coated recycled shell, a padded laptop sleeve, and a pass-through strap for travel days.",
};

export const SAMPLES = [
  {
    id: "messy",
    label: "Messy vendor feed",
    hint: "A realistic thin catalog row with two unsupported claims. Start here for the demo.",
    payload: MESSY,
  },
  {
    id: "enriched",
    label: "Same product, enriched",
    hint: "Demo fixture: the messy record after enrichment. Use it to show the before/after jump.",
    payload: ENRICHED,
  },
  {
    id: "minimal",
    label: "Minimal",
    hint: "Only the required title — the floor of the scoring range.",
    payload: MINIMAL,
  },
  {
    id: "complete",
    label: "Backend example",
    hint: "backend/examples/sample_product_complete.json.",
    payload: COMPLETE,
  },
];

export const getSample = (id) => SAMPLES.find((sample) => sample.id === id) || null;
