from typing import List, Literal, Optional
from pydantic import BaseModel, Field

REFINEMENT_ALLOWED_VALUES = {
    "storage_priority": {"low", "medium", "high"},
    "circulation_priority": {"medium", "high"},
    "plumbing_flexibility": {"limited", "flexible"},
    "bath_preference": {"shower", "tub", "both"},
    "accessibility": {"standard", "step_free", "enhanced"}
}


ALLOWED_FIXTURES = {
    "shower",
    "toilet",
    "vanity",
    "tub"
}


ALLOWED_WALLS = {
    "left",
    "right",
    "top",
    "bottom"
}


ALLOWED_ZONES = {
    "front",
    "rear",
    "center"
}


FixtureName = Literal["shower", "toilet", "vanity", "tub"]


class DesignGoal(BaseModel):
    type: Literal[
        "increase_openness",
        "increase_storage",
        "improve_accessibility",
        "optimize_layout",
    ]
    fixture: Optional[FixtureName] = None
    priority: Literal["low", "medium", "high"] = "medium"


class DesignConstraint(BaseModel):
    type: Literal["lock_fixture", "preserve_plumbing"]
    fixture: Optional[FixtureName] = None


class FixtureOperation(BaseModel):
    type: Literal["swap", "move", "optimize_position"]
    fixture: FixtureName
    target_fixture: Optional[FixtureName] = None
    preferred_wall: Optional[Literal["left", "right", "top", "bottom"]] = None
    preferred_zone: Optional[Literal["front", "rear", "center"]] = None


class SpatialRelationship(BaseModel):
    type: Literal["away_from", "near", "prefer_wall", "prefer_zone"]
    fixture: FixtureName
    target: Optional[Literal["entrance", "shower", "toilet", "vanity", "tub"]] = None
    wall: Optional[Literal["left", "right", "top", "bottom"]] = None
    zone: Optional[Literal["front", "rear", "center"]] = None


class ProductRequirement(BaseModel):
    fixture: FixtureName
    requirement: Literal["narrower", "wider", "smaller", "larger", "more_storage", "specific_match"]
    specific_product_id: Optional[str] = None

class StyleRequirement(BaseModel):
    description: str = Field(..., min_length=1, max_length=160)


class BudgetRequirement(BaseModel):
    max_budget: Optional[float] = Field(default=None, gt=0)
    preserve_current_budget: bool = False


class PlacementPreference(BaseModel):
    fixture: Literal[
        "shower",
        "toilet",
        "vanity",
        "tub"
    ]

    preferred_wall: Optional[
        Literal["left", "right", "top", "bottom"]
    ] = None

    preferred_zone: Optional[
        Literal["front", "rear", "center"]
    ] = None

    avoid_entrance: bool = False


class DesignIntent(BaseModel):
    storage_priority: Literal[
        "low",
        "medium",
        "high"
    ] = "medium"

    circulation_priority: Literal[
        "medium",
        "high"
    ] = "medium"

    plumbing_flexibility: Literal[
        "limited",
        "flexible"
    ] = "limited"

    bath_preference: Optional[
        Literal["shower", "tub", "both"]
    ] = None

    accessibility: Literal[
        "standard",
        "step_free",
        "enhanced"
    ] = "standard"

    locked_fixtures: List[
        Literal["shower", "toilet", "vanity", "tub"]
    ] = Field(default_factory=list)

    placement_preferences: List[
        PlacementPreference
    ] = Field(default_factory=list)

    goals: List[DesignGoal] = Field(default_factory=list)
    constraints: List[DesignConstraint] = Field(default_factory=list)
    operations: List[FixtureOperation] = Field(default_factory=list)
    relationships: List[SpatialRelationship] = Field(default_factory=list)
    product_requirements: List[ProductRequirement] = Field(default_factory=list)
    style_requirements: List[StyleRequirement] = Field(default_factory=list)
    budget_requirement: Optional[BudgetRequirement] = None


IMAGE_ANALYSIS_SCHEMA = {
    "type": "OBJECT",

    "properties": {

        "length_ft": {
            "type": "NUMBER"
        },

        "width_ft": {
            "type": "NUMBER"
        },

        "suggested_theme": {
            "type": "STRING"
        },

        "door_position": {
            "type": "STRING"
        },

        "confidence": {
            "type": "NUMBER"
        },

        "dimensions_reliable": {
            "type": "BOOLEAN"
        },

        "detected_features": {
            "type": "ARRAY",
            "items": {
                "type": "STRING"
            }
        },

        "notes": {
            "type": "STRING"
        }
    },

    "required": [
        "length_ft",
        "width_ft",
        "suggested_theme",
        "door_position",
        "confidence",
        "dimensions_reliable",
        "detected_features",
        "notes"
    ]
}