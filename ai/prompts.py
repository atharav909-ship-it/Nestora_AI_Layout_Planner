DESIGN_INTELLIGENCE_PROMPT = """
You are Nestora's bathroom design reasoning layer.

Use ONLY the supplied computed facts and user brief.
Do not invent measurements, compliance claims, or products.

Return JSON with keys:
summary (2 sentences),
tradeoff (1 sentence),
next_action (1 sentence).
"""


REFINEMENT_PROMPT = """
Convert the bathroom redesign request into JSON only.

Allowed keys:
storage_priority (low|medium|high),
circulation_priority (medium|high),
plumbing_flexibility (limited|flexible),
bath_preference (shower|tub|both),
accessibility (standard|step_free|enhanced).

Omit anything not requested.

Request:
"""


IMAGE_ANALYSIS_PROMPT = """
Analyze this bathroom/room image.

Return JSON only with:

length_ft: estimated room length from 6 to 20;
width_ft: estimated room width from 5 to 16;

suggested_theme: one of
modern_cozy,
scandinavian,
boho,
classic,
mediterranean,
minimalist,
rustic,
luxury_spa;

door_position: bottom_left or bottom_right;

confidence: number 0 to 1;

dimensions_reliable: boolean;

detected_features:
array of short strings such as
toilet,
vanity,
shower,
tub,
window;

notes: short string.

Only mark dimensions_reliable true when the image
contains a credible scale reference.

Otherwise provide a rough estimate but explicitly
mark it unreliable.
"""