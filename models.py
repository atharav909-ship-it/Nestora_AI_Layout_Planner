import json
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Boolean, JSON
from database import Base

class CatalogItemModel(Base):
    __tablename__ = "catalog_items"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    model_number = Column(String, default="")
    theme = Column(String, nullable=False, default="modern_cozy", index=True)
    price = Column(Float, default=0.0)
    width_inches = Column(Float, nullable=False)
    depth_inches = Column(Float, nullable=False)
    height_inches = Column(Float, default=32.0)
    mounting_type = Column(String, default="floor")
    elevation_inches = Column(Float, default=0.0)
    clearance_front_inches = Column(Float, default=21.0)
    clearance_side_inches = Column(Float, default=0.0)
    description = Column(Text, default="")
    finish = Column(String, default="Standard")
    # Dynamic 3D model asset path (.glb, .gltf, or .obj)
    image_url = Column(String, nullable=True)
    model_url = Column(String, nullable=True)
    in_stock = Column(Boolean, default=True)
    extra_attributes = Column(JSON, default=dict)
    # Rotation calibration offset in degrees if asset is exported rotated
    base_rotation_offset = Column(Float, default=0.0)

    def _json_field(self, value, fallback):
        try:
            return json.loads(value) if value else fallback
        except Exception:
            return fallback

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "modelNumber": self.model_number,
            "theme": self.theme,
            "price": self.price,
            "widthInches": self.width_inches,
            "depthInches": self.depth_inches,
            "heightInches": self.height_inches,
            "mountingType": self.mounting_type,
            "elevationInches": self.elevation_inches,
            "clearanceFrontInches": self.clearance_front_inches,
            "clearanceSideInches": self.clearance_side_inches,
            "description": self.description,
            "finish": self.finish,
            "imageUrl": self.image_url,
            "modelUrl": self.model_url,
            "inStock": self.in_stock,
            "attributes": self.extra_attributes or {},
            "baseRotationOffset": self.base_rotation_offset or 0.0,
        }


class DesignModel(Base):
    __tablename__ = "saved_designs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    theme = Column(String, nullable=False)
    tile = Column(String, default="travertine")
    marble_design = Column(String, default="calacatta")
    tile_color = Column(String, default="#e7dfd2")
    room_length_ft = Column(Float, nullable=False)
    room_width_ft = Column(Float, nullable=False)
    budget = Column(Float, default=8500.0)
    total_cost = Column(Float, default=0.0)
    door_position = Column(String, default="bottom_left")
    layout_data = Column(Text, nullable=False)
    bundle_data = Column(Text, nullable=False)
    design_intelligence_data = Column(Text, default="{}")
    image_analysis_data = Column(Text, default="{}")
    layout_analysis_data = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_layout(self):
        try:
            return json.loads(self.layout_data) if self.layout_data else []
        except Exception:
            return []

    def get_bundle(self):
        try:
            return json.loads(self.bundle_data) if self.bundle_data else []
        except Exception:
            return []

    def _json_field(self, value, fallback):
        try:
            return json.loads(value) if value else fallback
        except Exception:
            return fallback

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "theme": self.theme,
            "tile": self.tile,
            "marbleDesign": self.marble_design,
            "tileColor": self.tile_color,
            "roomLengthFt": self.room_length_ft,
            "roomWidthFt": self.room_width_ft,
            "budget": self.budget,
            "totalCost": self.total_cost,
            "doorPosition": self.door_position,
            "layout": self.get_layout(),
            "bundle": self.get_bundle(),
            "designIntelligence": self._json_field(self.design_intelligence_data, {}),
            "imageAnalysis": self._json_field(self.image_analysis_data, {}),
            "layoutAnalysis": self._json_field(self.layout_analysis_data, {}),
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }

# Aliases to guarantee compatibility with any other module naming
CatalogItem = CatalogItemModel
SavedDesign = DesignModel