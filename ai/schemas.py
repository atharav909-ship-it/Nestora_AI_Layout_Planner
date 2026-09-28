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