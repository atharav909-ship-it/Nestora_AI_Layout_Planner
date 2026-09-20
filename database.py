from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{BASE_DIR / 'bathroom_designer.db'}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def migrate_schema():
    # Lightweight SQLite migration for existing demo databases.
    with engine.begin() as conn:
        design_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(designs)"))}
        if design_cols:
            if "tile" not in design_cols:
                conn.execute(text("ALTER TABLE designs ADD COLUMN tile VARCHAR NOT NULL DEFAULT 'travertine'"))
            if "marble_design" not in design_cols:
                conn.execute(text("ALTER TABLE designs ADD COLUMN marble_design VARCHAR NOT NULL DEFAULT 'calacatta'"))
            if "tile_color" not in design_cols:
                conn.execute(text("ALTER TABLE designs ADD COLUMN tile_color VARCHAR NOT NULL DEFAULT '#e7dfd2'"))

        saved_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(saved_designs)"))}
        if saved_cols:
            for col in ("design_intelligence_data", "image_analysis_data", "layout_analysis_data"):
                if col not in saved_cols:
                    conn.execute(text(f"ALTER TABLE saved_designs ADD COLUMN {col} TEXT NOT NULL DEFAULT '{{}}'"))

        catalog_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(catalog_items)"))}
        if catalog_cols:
            if "mounting_type" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN mounting_type VARCHAR NOT NULL DEFAULT 'floor'"))
            if "elevation_inches" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN elevation_inches FLOAT NOT NULL DEFAULT 0.0"))
            if "base_rotation_offset" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN base_rotation_offset FLOAT NOT NULL DEFAULT 0.0"))
            if "model_number" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN model_number VARCHAR DEFAULT ''"))
            if "theme" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN theme VARCHAR NOT NULL DEFAULT 'modern_cozy'"))
            if "clearance_side_inches" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN clearance_side_inches FLOAT NOT NULL DEFAULT 0.0"))
            if "image_url" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN image_url VARCHAR"))
            if "in_stock" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN in_stock BOOLEAN NOT NULL DEFAULT 1"))
            if "extra_attributes" not in catalog_cols:
                conn.execute(text("ALTER TABLE catalog_items ADD COLUMN extra_attributes TEXT NOT NULL DEFAULT '{}'"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
