# Rezolve AI Hackathon — Project Brief

## 1. Original Problem Statement

Traditional digital commerce has been built around keywords, ads, and product catalogs designed for humans browsing websites. However, consumer behavior is rapidly shifting toward intent-based interactions through AI assistants such as ChatGPT, shopping agents, and conversational interfaces.

Instead of searching for "running shoes size 10", consumers increasingly ask questions such as:
> "I'm training for a half marathon in Singapore's humid weather and need lightweight shoes under S$200."

Or:
> "Find me a sustainable skincare routine for oily skin that takes less than 5 minutes every morning."

AI agents can only recommend products effectively when brands provide content that is structured, contextual, persuasive, and optimized for machine understanding. Most brands today still produce content primarily for websites, search engines, and social media, leaving a significant gap between how products are marketed and how AI agents discover, reason about, and recommend them.

### Questions to consider
- What information does an AI agent need to confidently recommend a product?
- How should brands describe products beyond traditional titles and specifications?
- How can product attributes, customer personas, use cases, comparisons, and storytelling be represented in ways that AI systems can reason over?
- How can brands measure whether their content is "AI-ready"?
- Can generative AI be used to automatically transform existing product catalogs into agent-optimized content?

### Suggested solution types (from brief)
- An AI Content Copilot that generates agent-friendly product descriptions from raw catalog data.
- A Content Readiness Score that evaluates how likely a product is to be recommended by conversational AI systems.
- A Persona-Aware Content Generator that creates tailored narratives for different consumer intents.
- A Simulation Platform that tests products against thousands of natural language shopping queries to identify content gaps.
- A Structured Knowledge Layer that converts marketing assets into machine-readable representations for AI commerce applications.

---

## 2. Root Problem (Distilled)

**Brands are invisible or under-recommended to AI shopping agents not because their products are bad, but because their content was built for a different reader (humans + search engines), and nobody has given them tools to measure that gap or fix it.**

Four sub-problems:
1. **Diagnostic gap** — brands don't know if/why they're failing to get recommended (no measurement tool exists).
2. **Content gap** — content lacks the structure, context, and specificity an AI agent needs to reason confidently.
3. **Persona/use-case gap** — content is one-size-fits-all; agents need to match products to specific stated intents, requiring multiple angles on the same product.
4. **Verification gap** — no way to test, before or after changes, whether an agent would actually surface and recommend the product for realistic queries.

---

## 3. Rezolve AI — Company Context

Research findings on Rezolve AI (Nasdaq: RZLV), the sponsor of this challenge:

- **Brain Suite**: Rezolve's proprietary retail-focused LLM, positioned as resistant to hallucination and model drift, aligned to brand-safe, trustworthy output.
- **Brain Commerce**: Conversational commerce product — human-like conversations, smarter search, product discovery, personalized recommendations, SEO insights, optimized for revenue/AOV.
- **Brain Checkout**: One-click checkout, conversational cart management, crypto payment support, location-based fulfillment (curbside/in-store/drive-thru).
- **Rezolve Provenance** (recently launched): A patent-backed, model-agnostic platform that marks, signs, and verifies AI-generated/AI-modified content across commerce workflows — designed to meet transparency regs like the EU AI Act. Embeds a recoverable signal in content that survives cropping/compression/screenshots.
- **TraceWare**: Records whether an AI agent checked provenance signals and followed policy before acting — i.e., audits agent decision-making.
- **Commerce Trust Stack** = Brain Commerce (grounded AI intelligence) + Rezolve Provenance (verifiable content) + TraceWare (auditable agent actions), exposed via APIs/SDKs.
- Strategic direction: positioning as **infrastructure for the "agentic economy"** — trust, verifiability, and hallucination-resistance are the core differentiators, not just conversational UX.

### Why this matters for our solution
Rezolve's business isn't just "AI that recommends products" — it's about **trustworthy, grounded, auditable AI commerce**. A tool that helps vendors submit structured, verifiable, "AI-ready" content is the natural **upstream complement** to Provenance/TraceWare (which operate downstream, verifying content and auditing agent behavior). Structured vendor data = better grounding = less hallucination = supports Rezolve's core sales pitch.

---

## 4. Our Solution Framing

> Give vendors a standard, structured format Rezolve's LLM can trust and reason over, plus a score that tells them how ready they are — so Brain Commerce can make grounded, explainable recommendations instead of guessing from thin catalog data.

This is not just about visibility/SEO-for-AI — it's about **reducing hallucination risk** by giving the LLM better grounding material, directly supporting Rezolve's "no hallucination" claim, and plugging into their Provenance layer (verified structured vendor content vs. unverified scraped content).

### Core solution loop (MVP for hackathon)

**Input → Score → Fix → Prove it worked**

1. Vendor submits raw product data (title, bullets, maybe an image).
2. Tool outputs a **Readiness/Trust Score** with a breakdown of what's missing (attributes, personas, use cases, comparisons, etc.).
3. Tool **auto-generates** the missing structured content using an LLM.
4. Tool **re-scores** the improved content and/or **simulates** it against realistic natural-language shopping queries to show the product now gets recommended when it didn't before (before/after proof).

This combines three of the five brief-suggested solution types (Content Copilot + Readiness Score + Simulation) into one demoable narrative with a clear before/after story.

---

## 5. Schema — What "AI-Ready" Content Needs (starting point, refine with team)

Fields an agent needs to reason confidently over a product:
- **Core attributes**: category, specs, materials, dimensions, price, availability
- **Use cases**: specific scenarios the product solves (e.g., "half marathon training in humid climates")
- **Target personas**: who this is for (experience level, priorities, constraints)
- **Comparisons**: how it differs from alternatives/competitors on relevant axes
- **Claims & evidence**: sustainability claims, certifications, performance claims — with substantiation
- **Constraints handled**: budget ceilings, climate/geography, time constraints, etc. (the kind of specific constraints seen in natural-language queries)
- **Storytelling/brand context**: brief narrative framing (optional, lower weight for scoring but useful for persuasive tone)

*(Person A should own finalizing this schema and the associated scoring rubric in the first 2 hours.)*

---

## 6. Task Breakdown (24-hour hackathon, team of 4)

### Team split

| Role | Owns | Hours 0-8 | Hours 8-16 | Hours 16-24 |
|---|---|---|---|---|
| **Person A — Backend/Schema** | Scoring rubric + data schema + LLM prompts | Define schema (attributes, personas, use cases, comparisons) + scoring rubric | Build scoring function (LLM-as-judge or rule-based + LLM hybrid) | Integration + bug fixes |
| **Person B — Generation** | Content-generation pipeline | Draft prompts for auto-generating missing fields from raw catalog data | Build generation pipeline, test on 3-5 sample products | Polish output quality, edge cases |
| **Person C — Frontend/Demo** | UI vendors interact with | Wireframe + build input form/upload | Build score dashboard (visual — this is what judges see most) | Build before/after view, simulation results view |
| **Person D — Simulation + Pitch** | Query simulation + storytelling | Build a bank of 15-20 realistic natural-language shopping queries across 2-3 product categories | Build simulation harness (run product against queries, check if/how it'd be recommended, with reasoning) | Build slide deck, rehearse pitch, record backup demo video |

### Detailed task list

**Hours 0-2: Foundation**
- [ ] Finalize MVP scope as a team, write it down, don't relitigate later
- [ ] Define the schema (see Section 5) — lock by hour 2 max, since generation work depends on it
- [ ] Pick 2-3 sample product categories to demo with (e.g., running shoes, skincare — matches brief's own examples)
- [ ] Set up repo, shared doc, API keys, basic scaffolding

**Hours 2-8: Core build (parallel tracks)**
- [ ] Scoring rubric defined and turned into a working function/prompt
- [ ] Generation pipeline drafted and tested on raw sample data
- [ ] Frontend skeleton — input screen + score display
- [ ] Query bank for simulation drafted (15-20 realistic natural-language questions)

**Hours 8-16: Integration**
- [ ] Wire frontend to backend end-to-end
- [ ] Simulation harness working — run a product's content against the query bank, output pass/fail + reasoning
- [ ] Before/after comparison view (raw catalog data vs. generated content, old score vs. new score)
- [ ] Test with real/messy sample data, not just clean examples

**Hours 16-20: Polish + edge cases**
- [ ] Handle failure cases gracefully (bad input, missing image, etc.)
- [ ] Visual polish on the dashboard — this is what judges remember
- [ ] Cut anything half-working; a smaller working demo beats a bigger broken one

**Hours 20-24: Pitch prep**
- [ ] Build slide deck (problem → Rezolve-specific insight → solution → live demo → what's next)
- [ ] Rehearse the demo at least twice, out loud, timed
- [ ] Record a backup video of the demo working, in case live demo breaks
- [ ] Prep for Q&A — expect questions on integration with Rezolve's actual product and how the score is validated

---

## 7. Deliverables Checklist

1. **Working prototype** — input → score → generate → re-score/simulate loop, deployed or runnable locally
2. **Scoring rubric doc** — one-pager defining what "AI-ready" means and how it's measured (judges want to see the thinking, not just a number)
3. **Slide deck** (~8-10 slides): problem framing → why this matters for Rezolve specifically → demo → architecture → roadmap/business case
4. **Live demo script** — rehearsed, timed, with a fallback video
5. **README** — what was built, how it works, tech stack, what you'd do with more time

---

## 8. Pitch Angle

Tie the solution explicitly back to Rezolve's own language:
- Not just "better content" — **reducing hallucination risk and enabling grounded recommendations**, directly supporting Brain Suite's "immune to hallucination" positioning.
- The natural **upstream complement** to Rezolve Provenance/TraceWare: verified, structured vendor data feeding into verified agent actions — completing their "commerce trust stack" story.

---

## 9. Notes for Codex / Implementation

- This doc is meant to be pasted into other LLM tools (e.g., Codex) as project context before starting implementation.
- Suggested stack decisions are NOT yet made — team should decide framework/language based on skillsets in the first 30 minutes and add that here.
- Priority order if time runs short: (1) working score function, (2) working generation pipeline, (3) simple UI, (4) simulation harness — simulation is the most cuttable piece if time is tight, but even 5 hardcoded queries with reasoning shown is enough for a compelling demo.
