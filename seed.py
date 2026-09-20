from database import engine, SessionLocal, Base
from models import CatalogItemModel

THEMES = [
    "modern_cozy", "scandinavian", "boho", "classic",
    "mediterranean", "minimalist", "rustic", "luxury_spa"
]

THEME_STYLE = {
    "modern_cozy": ("Warm Walnut", "Brushed Brass"),
    "scandinavian": ("Natural Birch", "Brushed Nickel"),
    "boho": ("Oak + Stone", "Antique Brass"),
    "classic": ("Carrara White", "Polished Chrome"),
    "mediterranean": ("Terracotta Oak", "Aged Brass"),
    "minimalist": ("Matte Chalk", "Matte Black"),
    "rustic": ("Smoked Oak", "Oil-Rubbed Bronze"),
    "luxury_spa": ("Dark Walnut", "Champagne Bronze"),
}

# category, base name, code, width, depth, height, price, front clearance,
# side clearance, mounting type, elevation above finished floor, description, model key
CATALOG_TEMPLATES = [
    ("Vanity & Basin", "Floating Vanity Suite", "VAN", 48, 22, 34, 1650, 24, 4, "wall_hung", 18, "Wall-hung console vanity with integrated undermount basin and storage.", "vanity"),
    ("Smart Toilet", "Compact Intelligent Toilet", "WC", 21, 27, 18, 2100, 30, 15, "floor", 0, "Compact floor-mounted intelligent toilet with generous lateral clearance.", "toilet"),
    ("Shower & Tub", "Walk-in Shower", "SHR", 48, 36, 84, 1650, 28, 6, "floor", 0, "Low-threshold shower zone with a frameless glass screen.", "shower"),
    ("Lavatory Faucet", "Tall Arc Faucet", "FAU", 4, 8, 11, 420, 0, 0, "wall_hung", 36, "Architectural lavatory faucet positioned above the vanity basin.", "faucet"),
    ("Toiletries & Accessories", "Wall Storage Set", "ACC", 24, 8, 32, 190, 0, 0, "wall_hung", 42, "Wall storage, shelf and accessory rail with no floor occupancy.", "cabinet"),
    ("Towel Warmer", "Heated Towel Ladder", "TWL", 24, 5, 40, 680, 0, 0, "wall_hung", 32, "Vertical heated towel ladder, wall-hung with concealed standoff brackets.", "towel_warmer"),
    ("Vanity Mirror / Medicine Cabinet", "Backlit Verdera-Style Mirror Cabinet", "MIR", 36, 5, 34, 920, 0, 0, "wall_hung", 48, "Backlit vanity mirror / medicine cabinet mounted above the vanity suite.", None),
    ("Freestanding Tub", "Freestanding Oval Soaking Tub", "TUB", 66, 32, 24, 2450, 36, 12, "floor", 0, "Contoured freestanding soaking tub with a 360-degree circulation perimeter.", "bathtub"),
]

PRICE_MOD = {
    "modern_cozy": 1.05, "scandinavian": 0.95, "boho": 0.92, "classic": 1.10,
    "mediterranean": 0.98, "minimalist": 0.90, "rustic": 0.94, "luxury_spa": 1.22,
}

MODEL_URLS = {
    "vanity": "/static/models/Vanity/vanity.obj",
    "toilet": "/static/models/Toilet/Toilet_2.obj",
    "shower": "/static/models/Shower/Shower.obj",
    "bathtub": "/static/models/Bathtub/Bathtub.obj",
    "accessory": "/static/models/Decor/KlrFeRKFbGEw41Jr_juT1.glb",
    "cabinet": "/static/models/Cabinets/Cabinet.obj",
    "faucet": "/static/models/Faucet/faucet.obj",
    "towel_warmer": "/static/models/Towel_Rack/Towel_Rack.obj",
}

MODEL_ROTATION_OFFSETS = {"vanity": 0.0, "toilet": 0.0, "shower": 0.0, "bathtub": 0.0, "accessory": 0.0}


def build_catalog():
    items = []
    tiers = [
        ("essential", "Essential", 0.72),
        ("signature", "Signature", 1.00),
        ("premium", "Premium", 1.38),
    ]
    for theme in THEMES:
        material, metal = THEME_STYLE[theme]
        mod = PRICE_MOD[theme]
        for category, base_name, code, w, d, h, price, cf, cs, mounting, elevation, desc, model_key in CATALOG_TEMPLATES:
            model_url = MODEL_URLS.get(model_key)
            for tier_key, tier_name, tier_mod in tiers:
                item_id = f"{theme}-{code.lower()}-{tier_key}"
                items.append({
                    "id": item_id,
                    "category": category,
                    "name": f"{tier_name} {base_name} — {theme.replace('_', ' ').title()}",
                    "model_number": f"ST-{code}-{THEMES.index(theme)+1:02d}-{tier_key[0].upper()}",
                    "theme": theme,
                    "price": round(price * mod * tier_mod, 2),
                    "width_inches": w, "depth_inches": d, "height_inches": h,
                    "mounting_type": mounting, "elevation_inches": elevation,
                    "clearance_front_inches": cf, "clearance_side_inches": cs,
                    "finish": f"{material} / {metal}",
                    "description": f"{tier_name} specification. {desc}",
                    "image_url": None, "model_url": model_url, "in_stock": True,
                    "base_rotation_offset": MODEL_ROTATION_OFFSETS.get(model_key, 0.0),
                    "extra_attributes": {
                        "tier": tier_key,
                        "footprintType": {
                            "Vanity & Basin": "vanity", "Smart Toilet": "toilet",
                            "Shower & Tub": "shower", "Lavatory Faucet": "faucet",
                            "Toiletries & Accessories": "accessory", "Towel Warmer": "towel_warmer",
                            "Vanity Mirror / Medicine Cabinet": "vanity_mirror", "Freestanding Tub": "bathtub",
                        }[category],
                        "mount": mounting, "material": material, "metal": metal,
                    },
                })
    return items


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        desired = {item["id"]: item for item in build_catalog()}
        existing = {x.id: x for x in db.query(CatalogItemModel).all()}

        for item_id, payload in desired.items():
            row = existing.get(item_id)
            if row is None:
                db.add(CatalogItemModel(**payload))
                continue
            # Keep user/database-specific pricing or descriptive edits, but always
            # synchronize the structural metadata needed by the planner and renderer.
            row.mounting_type = payload["mounting_type"]
            row.elevation_inches = payload["elevation_inches"]
            row.width_inches = payload["width_inches"]
            row.depth_inches = payload["depth_inches"]
            row.height_inches = payload["height_inches"]
            row.clearance_front_inches = payload["clearance_front_inches"]
            row.clearance_side_inches = payload["clearance_side_inches"]
            row.model_url = payload["model_url"]
            row.base_rotation_offset = payload.get("base_rotation_offset", 0.0)
            row.extra_attributes = payload["extra_attributes"]
            if not row.description:
                row.description = payload["description"]

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized with expanded wellness catalog.")
