import sqlite3
from pathlib import Path

from app.models.batch import CatalogImportResult
from app.models.product import Product


REQUIRED_TABLES = {"watches", "collections", "specs"}


def import_sqlite(path: Path) -> CatalogImportResult:
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not REQUIRED_TABLES <= tables:
            raise ValueError("Unsupported SQLite catalog schema")
        rows = connection.execute("""
            SELECT w.*, c.name AS collection_name, c.type AS collection_type,
                   c.tagline, c.thesis, c.design_notes, s.*
            FROM watches w JOIN collections c ON c.slug=w.collection_slug
            JOIN specs s ON s.watch_id=w.id ORDER BY w.sort_order
        """).fetchall()
        products = []
        for row in rows:
            straps = connection.execute(
                "SELECT material FROM straps WHERE watch_id=? ORDER BY is_default DESC, id", (row["id"],)
            ).fetchall()
            specifications = {
                "reference": row["ref"], "collection": row["collection_name"],
                "movement": row["movement"], "caliber": row["caliber"],
                "case diameter": f'{row["case_diameter_mm"]:g} mm',
                "case thickness": f'{row["case_thickness_mm"]:g} mm',
                "lug to lug": f'{row["lug_to_lug_mm"]:g} mm',
                "lug width": f'{row["lug_width_mm"]} mm', "crystal": row["crystal"],
                "water resistance": f'{row["water_resistance_m"]} m',
            }
            for key in ("beat_rate", "power_reserve_hours", "jewels"):
                if row[key] is not None:
                    specifications[key.replace("_", " ")] = str(row[key])
            products.append(Product(
                product_id=row["id"], title=row["name"], category=f'{row["collection_type"]} watch',
                description=row["description"], specifications=specifications,
                materials=list(dict.fromkeys([row["case_material"], *(strap["material"] for strap in straps)])),
                dimensions={"diameter": f'{row["case_diameter_mm"]:g} mm', "thickness": f'{row["case_thickness_mm"]:g} mm'},
                price=row["price_cents"] / 100,
                narrative=" ".join(filter(None, [row["tagline"], row["thesis"], row["design_notes"], row["dial_note"]])),
            ))
        return CatalogImportResult(products=products, warnings=["Currency is absent from the database and was left unset."])
    finally:
        connection.close()
