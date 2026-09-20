# Nestora — AI Bathroom Studio

**AI-assisted bathroom planning with deterministic spatial validation, interactive 2D/3D visualization, and intelligent design reasoning.**

Nestora is an AI-assisted bathroom design platform that helps users move from room requirements and design preferences to spatially validated bathroom concepts.

Rather than relying on generative AI to arbitrarily position fixtures, Nestora combines **AI-based design reasoning** with a **deterministic spatial planning engine**. AI helps interpret user intent, analyze bathroom images, generate design insights, and explain design decisions, while the spatial engine handles fixture geometry, placement constraints, clearances, collisions, and circulation.

The result is an interactive design workflow where users can explore multiple bathroom layouts, compare design strategies, visualize them in 2D and 3D, select products within a target budget, save designs, and generate a structured design report.

---

## Key Features

### AI Design Intelligence

Nestora collects more than just room dimensions. Users can specify design priorities such as:

- Storage requirements
- Circulation priority
- Number of users
- Bathing preference
- Plumbing flexibility
- Accessibility considerations
- Style and material preferences
- Target budget

These inputs are used to create an **AI Design Brief** that guides layout generation and product recommendations.

---

### Spatially Validated Layout Generation

Nestora generates multiple bathroom concepts using different planning strategies.

The spatial engine evaluates layouts using deterministic geometry rather than relying solely on AI-generated coordinates.

It considers factors such as:

- Room boundaries
- Fixture footprints
- Fixture-to-fixture collisions
- Door clearance
- Entry circulation
- Front clearances
- Storage requirements
- Available floor area
- User priorities
- Plumbing flexibility

Generated layouts can therefore represent different design objectives such as stronger circulation, increased storage, or a more balanced arrangement.

---

### AI Design Review

After a layout is generated and validated, Nestora can provide design reasoning based on the actual layout data.

The review can highlight:

- Design strengths
- Spatial warnings
- Opportunities for improvement
- User-priority trade-offs
- Product-selection reasoning

This keeps AI reasoning connected to measurable properties of the generated design.

The interface distinguishes between information produced by the **spatial validation engine** and AI-assisted design interpretation.

---

## 2D Floor Planning

Each generated concept includes an interactive 2D floor plan showing:

- Fixture placement
- Fixture dimensions
- Fixture rotation
- Door position and swing
- Entry clearance
- Room dimensions
- Fixture identification

The 2D layout is derived from the same underlying design data used throughout the application.

---

## Interactive 3D Visualization

Nestora converts the selected bathroom layout into an interactive Three.js scene.

The 3D environment supports local **OBJ and GLB product assets**, including bathroom fixtures such as:

- Vanities
- Toilets
- Showers
- Bathtubs
- Faucets
- Cabinets
- Towel racks
- Accessories

Procedural geometry can also be used as a fallback where appropriate.

The 2D and 3D views are driven by shared layout information so that changes to the design can be represented consistently across both views.

---

## Product & Budget Intelligence

Nestora includes a bathroom product catalog containing product information such as:

- Category
- Dimensions
- Price
- Style
- Finish
- Product/model information
- 3D asset reference

The target budget is treated as part of the design process rather than simply displayed as metadata.

Product bundles can be selected according to:

- Available budget
- Design theme
- Room requirements
- Fixture category
- User priorities

The application also provides a cost summary showing the estimated product total relative to the user's target budget.

---

## Bathroom Image Analysis

Users can optionally upload a bathroom photograph for AI-assisted visual analysis.

When Gemini is configured, the image-analysis system can assist with identifying information such as:

- Existing fixtures
- General room characteristics
- Doors and openings
- Visible design style
- Spatial relationships
- Potential design considerations

Image analysis is intended to support the design process rather than replace physical measurement.

> **Note:** Exact real-world dimensions cannot be guaranteed from a single photograph without a known scale reference. Users should confirm room measurements before relying on a generated layout for real-world installation.

If Gemini is not configured, Nestora continues to operate using manually entered room information.

---

## Natural-Language Design Refinement

Nestora supports AI-assisted design refinement using natural-language requests.

For example:

> "Give me more storage but keep the entrance open."

The AI layer can interpret the request as design preferences or constraints, after which the deterministic spatial planner regenerates and validates suitable layouts.

This separation allows AI to understand **what the user wants**, while the spatial engine determines **whether the resulting arrangement is geometrically feasible**.

---

## Saved Designs

Designs can be stored locally using SQLite.

Saved projects preserve information such as:

- Room dimensions
- Layout
- Fixture placement
- Selected products
- Theme
- Materials
- Budget
- Door position
- Design configuration

Saved designs can later be reopened from the studio.

---

## Design Report / PDF Export

Nestora can generate a downloadable design report containing information such as:

- Project overview
- Room specifications
- 2D floor plan
- Design Intelligence summary
- Spatial validation information
- Fixture schedule
- Product selections
- Material selections
- Budget summary

The exported floor plan is generated from the underlying design data rather than depending on a screenshot of the visible browser workspace.

---

# System Architecture

Nestora separates **AI reasoning** from **spatial validation**.

```text
User Requirements
Dimensions · Budget · Style · Priorities
                 │
                 ▼
        AI Design Intelligence
                 │
                 ▼
          AI Design Brief
                 │
                 ▼
       Spatial Planning Engine
                 │
        ┌────────┴────────┐
        ▼                 ▼
Candidate Layouts    Constraint Checks
        │                 │
        └────────┬────────┘
                 ▼
        Validated Designs
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
   AI Review    2D Plan   Product
                          Selection
       │         │         │
       └─────────┼─────────┘
                 ▼
          3D Visualization
                 │
                 ▼
          Design Report
```

### Why separate AI and geometry?

Large language models are useful for understanding preferences, reasoning about design objectives, and communicating trade-offs.

They are not used as the sole authority for geometric validity.

Nestora therefore follows the principle:

> **AI reasons. The spatial engine validates.**

This allows creative design assistance while keeping measurable spatial constraints under deterministic control.

---

# Technology Stack

### Backend

- Python
- FastAPI
- SQLAlchemy
- SQLite
- Pydantic

### AI

- Google Gemini
- Multimodal image analysis
- Design reasoning
- Natural-language refinement

### Frontend

- HTML
- CSS
- JavaScript
- SVG-based 2D floor planning
- Three.js

### 3D Assets

- OBJ
- GLB / glTF
- Procedural Three.js geometry where appropriate

### Reporting

- jsPDF
- Deterministic floor-plan rendering

---

# Project Structure

```text
Nestora/
│
├── main.py
├── models.py
├── database.py
├── seed.py
├── requirements.txt
├── README.md
│
├── static/
│   ├── app.js
│   ├── styles.css
│   ├── ...
│   │
│   └── models/
│       ├── Vanity/
│       ├── Toilet/
│       ├── Shower/
│       ├── Bathtub/
│       ├── Faucet/
│       ├── Cabinets/
│       ├── Towel_Rack/
│       └── Decor/
│
└── ...
```

---

# Running Nestora Locally

## 1. Clone the repository

```bash
git clone <YOUR-REPOSITORY-URL>
cd <YOUR-REPOSITORY-FOLDER>
```

---

## 2. Create a virtual environment

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

---

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

## 4. Configure Gemini

Nestora can use Google Gemini for its AI-assisted functionality.

Create a `.env` file or configure the environment variable:

```text
GEMINI_API_KEY=your_api_key_here
```

Do **not** commit API keys to GitHub.

If Gemini is not configured, the deterministic planning functionality remains available, while Gemini-dependent features will indicate that AI analysis is unavailable.

---

## 5. Start the application

```bash
uvicorn main:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

---

# Design Workflow

A typical Nestora workflow is:

```text
1. Enter room dimensions
        ↓
2. Configure Design Intelligence
        ↓
3. Select style, materials and budget
        ↓
4. Optionally analyze a bathroom image
        ↓
5. Generate bathroom concepts
        ↓
6. Spatial engine validates layouts
        ↓
7. Compare generated concepts
        ↓
8. Review AI design reasoning
        ↓
9. Explore the design in 2D and 3D
        ↓
10. Adjust products and configuration
        ↓
11. Save the design
        ↓
12. Export the design report
```

---

# Current Limitations

Nestora is currently a prototype and should be treated as a **design-assistance and visualization system**, not as construction documentation.

Current limitations include:

- Image-based dimensions are estimates unless a known physical reference is available.
- Generated layouts should be verified against actual site measurements before implementation.
- Plumbing, drainage, electrical systems, waterproofing, ventilation, structural requirements, and local building codes are not comprehensively modeled.
- Product pricing is indicative and may not represent current retail pricing, taxes, shipping, installation, or labor.
- 3D asset dimensions and orientation depend on the quality and calibration of the supplied model.
- AI-generated design reasoning should be treated as design assistance rather than professional architectural or engineering approval.

Future versions could integrate more detailed building-code validation, plumbing constraints, product databases, photogrammetry/LiDAR measurements, and more advanced spatial optimization.

---

# Privacy & API Keys

API credentials are loaded through environment variables and should never be committed to the repository.

The `.gitignore` file excludes local environment files and runtime artifacts such as:

```text
.env
venv/
.venv/
__pycache__/
*.pyc
bathroom_designer.db
```

---

# Project Goal

Nestora explores how artificial intelligence can assist bathroom design **without replacing deterministic engineering constraints**.

The project combines:

**AI understanding + spatial computation + product intelligence + interactive visualization**

to create a more explainable and practical bathroom-planning workflow.

---

## Disclaimer

Nestora is a prototype developed for design exploration and demonstration purposes. Generated layouts, product recommendations, cost estimates, and AI analysis should be independently verified before being used for purchasing, construction, plumbing, electrical, structural, or installation decisions.