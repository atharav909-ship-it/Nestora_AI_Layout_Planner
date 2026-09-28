REFINEMENT_ALLOWED_VALUES = {
    "storage_priority": {
        "low",
        "medium",
        "high"
    },

    "circulation_priority": {
        "medium",
        "high"
    },

    "plumbing_flexibility": {
        "limited",
        "flexible"
    },

    "bath_preference": {
        "shower",
        "tub",
        "both"
    },

    "accessibility": {
        "standard",
        "step_free",
        "enhanced"
    }
}


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