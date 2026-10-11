from ai.prompts import (
    DESIGN_INTELLIGENCE_PROMPT,
    REFINEMENT_PROMPT,
    IMAGE_ANALYSIS_PROMPT,
)
from ai.router import ModelRouter, ModelType
from ai.providers import GeminiReasoningProvider, GeminiFastProvider, GeminiVisionProvider, MissingAIKey

# Initialize the router with our Phase 8 providers
ai_router = ModelRouter({
    ModelType.REASONING: GeminiReasoningProvider(),
    ModelType.FAST: GeminiFastProvider(),
    ModelType.VISION: GeminiVisionProvider()
})

# -----------------------------------------
# EXPORTED FACADE (Maintains API for main.py)
# -----------------------------------------

def generate_design_intelligence(context):
    try:
        return ai_router.route(ModelType.REASONING, {
        "system_prompt": DESIGN_INTELLIGENCE_PROMPT,
        "context": context
        })
    except MissingAIKey:
        return None

def interpret_refinement(instruction):
    try:
        return ai_router.route(ModelType.FAST, {
        "system_prompt": REFINEMENT_PROMPT,
        "instruction": instruction
        })
    except MissingAIKey:
        return {}

def analyze_image(image_bytes, mime_type="image/jpeg"):
    try:
        return ai_router.route(ModelType.VISION, {
        "system_prompt": IMAGE_ANALYSIS_PROMPT,
        "image_bytes": image_bytes,
        "mime_type": mime_type
        })
    except MissingAIKey:
        return None
