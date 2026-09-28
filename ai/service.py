import json
import os

from google import genai
from google.genai import types

from ai.prompts import (
    DESIGN_INTELLIGENCE_PROMPT,
    REFINEMENT_PROMPT,
    IMAGE_ANALYSIS_PROMPT,
)

from ai.schemas import (
    REFINEMENT_ALLOWED_VALUES,
    IMAGE_ANALYSIS_SCHEMA,
)


MODEL_NAME = "gemini-3.6-flash"


def get_client():
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        return None

    return genai.Client(api_key=api_key)


# -----------------------------------------
# DESIGN INTELLIGENCE
# -----------------------------------------

def generate_design_intelligence(context):
    client = get_client()

    if not client:
        return None

    prompt = (
        DESIGN_INTELLIGENCE_PROMPT
        + "\n"
        + json.dumps(context)
    )

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt
    )

    return json.loads(
        response.text
        .replace("```json", "")
        .replace("```", "")
        .strip()
    )


# -----------------------------------------
# NATURAL LANGUAGE REFINEMENT
# -----------------------------------------

def interpret_refinement(instruction):
    client = get_client()

    if not client:
        return {}

    prompt = REFINEMENT_PROMPT + instruction

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt
    )

    parsed = json.loads(
        response.text
        .replace("```json", "")
        .replace("```", "")
        .strip()
    )

    validated = {}

    for key, allowed_values in REFINEMENT_ALLOWED_VALUES.items():
        if parsed.get(key) in allowed_values:
            validated[key] = parsed[key]

    return validated


# -----------------------------------------
# IMAGE ANALYSIS
# -----------------------------------------

def analyze_image(image_bytes, mime_type="image/jpeg"):
    client = get_client()

    if not client:
        return None

    response = client.models.generate_content(
        model=MODEL_NAME,

        contents=[
            types.Part.from_bytes(
                data=image_bytes,
                mime_type=mime_type
            ),

            IMAGE_ANALYSIS_PROMPT,
        ],

        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=IMAGE_ANALYSIS_SCHEMA,
        ),
    )

    return json.loads(response.text)