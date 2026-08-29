// Generates sample/catalog.db — a fake brand catalog spanning three product
// types (shoes, watches, bags) with no category column, so the demo exercises
// the AI classification path.
//
// Run AFTER installing server deps:  node sample/make-sample-db.js

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "..", "server", "index.js"));

let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.error("better-sqlite3 not found. Run `npm install` inside server/ first.");
  process.exit(1);
}

const out = path.join(__dirname, "catalog.db");
if (fs.existsSync(out)) fs.unlinkSync(out);

const db = new Database(out);
db.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL
  );
`);

const rows = [
  // shoes
  ["Aero Glide Runner", "Lightweight mesh running shoe with responsive foam midsole", 129.9],
  ["Court Classic Low", "Timeless low-top sneaker in full-grain leather", 89.0],
  ["Summit Trail Pro", "Rugged trail shoe with aggressive lugs and rock plate", 149.5],
  ["Derby Oxford Noir", "Polished black oxford for formal occasions", 189.0],
  ["Loft Canvas Slip-On", "Easy canvas slip-on for everyday wear", 54.9],
  ["Velocity Track Spike", "Featherweight sprint spike for competition day", 119.0],
  ["Harbor Boat Shoe", "Hand-stitched leather boat shoe with non-marking sole", 99.0],
  ["Metro Chelsea Boot", "Sleek suede chelsea boot for smart-casual outfits", 159.0],
  ["Flex Studio Trainer", "Versatile gym trainer with flat stable base", 109.0],
  ["Breeze Sandal", "Cushioned strap sandal for warm weather", 45.0],
  ["Regal Monk Strap", "Double monk strap dress shoe in burnished calfskin", 210.0],
  ["Peak Hiker GTX", "Waterproof hiking boot with ankle support", 179.0],
  ["Pulse Basketball Mid", "Mid-top hoops shoe with herringbone traction", 139.0],
  ["Drift Skate Classic", "Durable suede skate shoe with vulcanized sole", 74.9],
  // watches
  ["Chrono Steel 42", "Stainless chronograph with tachymeter bezel", 349.0],
  ["Heritage Auto 38", "Automatic dress watch with exhibition caseback", 520.0],
  ["Dive Master 300", "300m dive watch with luminous markers", 430.0],
  ["Pulse Fit Band", "Fitness tracker with heart-rate and sleep monitoring", 99.0],
  ["Minimal Quartz 36", "Slim quartz watch with mesh strap", 149.0],
  ["Field Ranger 40", "Rugged field watch with canvas strap", 199.0],
  ["Lunar Moonphase", "Elegant moonphase complication in rose gold", 780.0],
  ["Circuit Smart X", "Smartwatch with GPS, payments and app store", 299.0],
  ["Regatta Yacht Timer", "Sailing chronograph with countdown bezel", 610.0],
  ["Pocket Heirloom", "Classic mechanical pocket watch with chain", 260.0],
  ["Neon Digital Retro", "Retro digital watch with backlight and alarms", 59.0],
  ["Aviator GMT 44", "Pilot GMT watch tracking two time zones", 455.0],
  // bags
  ["Commuter Daypack", "20L water-resistant backpack with laptop sleeve", 89.0],
  ["Voyage Duffel 45", "Weekender duffel in waxed canvas", 129.0],
  ["Metro Messenger", "Slim messenger bag for 14-inch laptops", 99.0],
  ["Trail Hydra 12", "Hydration pack with 2L reservoir for trail runs", 79.0],
  ["Atelier Tote", "Structured leather tote for work essentials", 189.0],
  ["Summit Alpine 60", "60L expedition pack with adjustable harness", 249.0],
  ["Nightout Clutch", "Compact evening clutch with chain strap", 69.0],
  ["Rolltop Courier", "Expandable rolltop bike courier bag", 119.0],
  ["Cabin Roller 35", "Carry-on roller with silent wheels", 199.0],
  ["Camera Sling 8", "Padded sling for mirrorless camera kits", 85.0],
  ["Beach Mesh Carryall", "Sand-shedding mesh carryall for the beach", 39.0],
  ["Exec Briefcase", "Full-grain briefcase with brass hardware", 320.0],
];

const insert = db.prepare(
  "INSERT INTO products (name, description, price) VALUES (?, ?, ?)"
);
const tx = db.transaction(() => rows.forEach((r) => insert.run(...r)));
tx();

db.close();
console.log(`Wrote ${rows.length} products to ${out}`);
