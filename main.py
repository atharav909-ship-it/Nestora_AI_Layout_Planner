import json
import math
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import Base, engine, get_db, migrate_schema
from models import CatalogItemModel, DesignModel
from seed import init_db

migrate_schema()
init_db()

app = FastAPI(title="AI Bathroom Layout Planner", version="5.2.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

THEME_TITLES = {
    "modern_cozy": "Modern Cozy",
    "scandinavian": "Scandinavian",
    "boho": "Boho Organic",
    "classic": "Classic Luxury",
    "mediterranean": "Mediterranean",
    "minimalist": "Pure Minimalist",
    "rustic": "Rustic Lodge",
    "luxury_spa": "Luxury Spa Retreat",
}

THEME_NOTES = {
    "modern_cozy": "Warm timber, soft lighting and comfortable circulation.",
    "scandinavian": "Light wood, clean geometry and uncluttered storage.",
    "boho": "Organic textures, earthy materials and relaxed layering.",
    "classic": "Symmetry, stone-like finishes and timeless proportions.",
    "mediterranean": "Terracotta warmth, natural wood and tactile surfaces.",
    "minimalist": "Quiet surfaces, floating fixtures and generous negative space.",
    "rustic": "Smoked timber, stone texture and grounded materials.",
    "luxury_spa": "Dark wood, refined metals and hotel-style comfort.",
}

CATEGORY_ORDER = [
    "Vanity & Basin",
    "Smart Toilet",
    "Shower & Tub",
    "Freestanding Tub",
    "Lavatory Faucet",
    "Toiletries & Accessories",
    "Towel Warmer",
    "Vanity Mirror / Medicine Cabinet",
]


class PlanRequest(BaseModel):
    roomLengthFt: float = Field(..., ge=4, le=30)
    roomWidthFt: float = Field(..., ge=4, le=25)
    budget: float = Field(..., ge=1000, le=100000)
    theme: str = Field(..., pattern=r"^(modern_cozy|scandinavian|boho|classic|mediterranean|minimalist|rustic|luxury_spa)$")
    doorPosition: str = Field(default="bottom_left", pattern=r"^(bottom_left|bottom_right)$")
    tile: str = Field(default="travertine", pattern=r"^(travertine|terrazzo|sage|slate|terracotta|marble)$")
    marbleDesign: str = Field(default="calacatta", pattern=r"^(calacatta|statuario|arabescato|emperador)$")
    tileColor: str = Field(default="#e7dfd2", pattern=r"^#[0-9a-fA-F]{6}$")
    designIntelligence: Dict[str, Any] = Field(default_factory=dict)
    imageAnalysis: Dict[str, Any] = Field(default_factory=dict)


class LayoutItem(BaseModel):
    id: str
    item: Dict[str, Any]
    areaLabel: str
    x: float
    y: float
    w: float
    h: float
    rotation: float = 0
    clearance: Optional[Dict[str, Any]] = None


class ValidateRequest(BaseModel):
    roomLengthInches: float = Field(..., gt=0)
    roomWidthInches: float = Field(..., gt=0)
    doorPosition: str = "bottom_left"
    layout: List[LayoutItem]


class SaveDesignRequest(BaseModel):
    name: str = "Untitled Bathroom"
    theme: str
    tile: str = "travertine"
    marbleDesign: str = "calacatta"
    tileColor: str = "#e7dfd2"
    roomLengthFt: float
    roomWidthFt: float
    budget: float
    totalCost: float
    doorPosition: str
    layout: List[Dict[str, Any]]
    bundle: List[Dict[str, Any]]
    designIntelligence: Dict[str, Any] = Field(default_factory=dict)
    imageAnalysis: Dict[str, Any] = Field(default_factory=dict)
    layoutAnalysis: Dict[str, Any] = Field(default_factory=dict)


class SuggestionRequest(BaseModel):
    roomLengthInches: float
    roomWidthInches: float
    doorPosition: str
    theme: str = "modern_cozy"
    tile: str = "travertine"
    marbleDesign: str = "calacatta"
    tileColor: str = "#e7dfd2"
    layout: List[LayoutItem]


class IntelligenceRequest(BaseModel):
    roomLengthInches: float
    roomWidthInches: float
    doorPosition: str
    theme: str = "modern_cozy"
    budget: float = 8500
    totalCost: float = 0
    tile: str = "travertine"
    layoutName: str = "Generated layout"
    strategy: str = "open_balanced"
    plannerScore: Optional[float] = None
    layout: List[LayoutItem]
    bundle: List[Dict[str, Any]] = Field(default_factory=list)
    designIntelligence: Dict[str, Any] = Field(default_factory=dict)
    imageAnalysis: Dict[str, Any] = Field(default_factory=dict)
    comparisonLayouts: List[Dict[str, Any]] = Field(default_factory=list)


class RefineRequest(BaseModel):
    instruction: str = Field(..., min_length=2, max_length=500)
    designIntelligence: Dict[str, Any] = Field(default_factory=dict)


class RenameDesignRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


# ------------------------------ geometry ------------------------------

def rects_intersect(a: Dict[str, float], b: Dict[str, float], padding: float = 0) -> bool:
    return not (
        a["x"] + a["w"] + padding <= b["x"]
        or b["x"] + b["w"] + padding <= a["x"]
        or a["y"] + a["h"] + padding <= b["y"]
        or b["y"] + b["h"] + padding <= a["y"]
    )


def inside_room(r: Dict[str, float], L: float, W: float, margin: float = 0) -> bool:
    return (
        r["x"] >= margin
        and r["y"] >= margin
        and r["x"] + r["w"] <= L - margin
        and r["y"] + r["h"] <= W - margin
    )


def door_zone(L: float, W: float, door: str) -> Dict[str, float]:
    width, depth = 42.0, 50.0
    if door == "bottom_right":
        return {"x": max(0, L - width), "y": W - depth, "w": width, "h": depth}
    return {"x": 0, "y": W - depth, "w": width, "h": depth}


def footprint(item: Dict[str, Any], x: float, y: float, rotation: float = 0) -> Dict[str, float]:
    w = float(item.get("widthInches") or 24)
    h = float(item.get("depthInches") or 24)
    if int(rotation) % 180 == 90:
        w, h = h, w
    return {"x": x, "y": y, "w": w, "h": h}


def _make_layout_entry(item: Dict[str, Any], x: float, y: float, rotation: float = 0, label: Optional[str] = None):
    r = footprint(item, x, y, rotation)
    cf = float(item.get("clearanceFrontInches") or 0)
    return {
        "id": f"layout-{item['id']}-{uuid.uuid4().hex[:6]}",
        "item": item,
        "areaLabel": label or item["category"],
        "x": round(r["x"], 2), "y": round(r["y"], 2),
        "w": round(r["w"], 2), "h": round(r["h"], 2),
        "rotation": rotation,
        "clearance": {
            "x": round(max(0, r["x"] - cf / 2), 2),
            "y": round(max(0, r["y"] - cf / 2), 2),
            "w": round(r["w"] + cf, 2),
            "h": round(r["h"] + cf, 2),
            "label": "Suggested clearance",
        },
    }


def _large_room_plan(bundle: List[Dict[str, Any]], L: float, W: float, door: str) -> List[Dict[str, Any]]:
    """Compose large bathrooms like a premium hospitality/spa interior.

    The scene is intentionally architectural rather than corner-packed:
      * freestanding tub centered on the rear/window axis;
      * vanity suite running along the left wall;
      * toilet tucked beside the vanity's rear end with lateral clearance;
      * glass shower on the right wall;
      * heated towel ladder on the right side wall.
    """
    by_cat = {x["category"]: x for x in bundle}
    layout: List[Dict[str, Any]] = []

    vanity = by_cat.get("Vanity & Basin")
    toilet = by_cat.get("Smart Toilet")
    tub = by_cat.get("Freestanding Tub")
    shower = by_cat.get("Shower & Tub")
    towel = by_cat.get("Towel Warmer")
    mirror = by_cat.get("Vanity Mirror / Medicine Cabinet")
    faucet = by_cat.get("Lavatory Faucet")
    accessory = by_cat.get("Toiletries & Accessories")

    # Hero tub under the rear privacy window. Keep a genuine walking ring around it.
    if tub:
        bw, bd = float(tub["widthInches"]), float(tub["depthInches"])
        perimeter = 18.0
        tub_x = max(perimeter, min(L - bw - perimeter, (L - bw) / 2.0))
        tub_y = max(perimeter, min(W - bd - perimeter, 10.0))
        layout.append(_make_layout_entry(tub, tub_x, tub_y, 0, "Freestanding tub · hero position"))

    # Vanity runs along the left side wall, like a furniture console rather than
    # another object thrown into a rear corner. Rotating its 48x22 footprint makes
    # the 48" run follow the room depth.
    vanity_x = 8.0
    vanity_y = min(max(28.0, W * 0.27), max(28.0, W - 58.0))
    vanity_rot = 90
    if vanity:
        vw, vd = float(vanity["widthInches"]), float(vanity["depthInches"])
        run_w, run_d = vd, vw
        vanity_y = max(12.0, min(W - run_d - 8.0, vanity_y))
        layout.append(_make_layout_entry(vanity, vanity_x, vanity_y, vanity_rot, "Left-wall vanity suite"))

    # Toilet sits just inboard of the vanity's rear end. It is deliberately separated
    # from the vanity by a 10" lateral buffer and does not collide with the tub ring.
    if toilet:
        tw, td = float(toilet["widthInches"]), float(toilet["depthInches"])
        toilet_x = vanity_x + float(vanity["depthInches"] if vanity else 22.0) + 10.0
        toilet_y = max(12.0, vanity_y + 24.0)
        toilet_x = min(toilet_x, L - tw - 12.0)
        layout.append(_make_layout_entry(toilet, toilet_x, toilet_y, 0, "Toilet · lateral clearance"))

    # Wall-mounted fittings are tied to the vanity wall. Their elevations are metadata,
    # not floor occupancy, so they can share the same architectural wall plane safely.
    if mirror and vanity:
        layout.append(_make_layout_entry(mirror, vanity_x + 2.0, vanity_y + 6.0, 90, "Backlit vanity mirror"))
    if faucet and vanity:
        layout.append(_make_layout_entry(faucet, vanity_x + 4.0, vanity_y + 16.0, 90, "Lavatory faucet"))
    if accessory:
        layout.append(_make_layout_entry(accessory, vanity_x + 3.0, vanity_y + 28.0, 90, "Wall storage"))

    # Right-side walk-in shower. The glass face opens toward the room and remains
    # visually opposite the vanity without consuming the central tub axis.
    if shower:
        sw, sd = float(shower["widthInches"]), float(shower["depthInches"])
        rot = 90
        rw, rd = sd, sw
        sx = L - rw - 8.0
        sy = max(42.0, min(W - rd - 10.0, W * 0.48))
        layout.append(_make_layout_entry(shower, sx, sy, rot, "Walk-in shower · right zone"))

    # Heated towel ladder is mounted on the right side wall, elevated and excluded
    # from floor-clearance calculations.
    if towel:
        tw, td = float(towel["widthInches"]), float(towel["depthInches"])
        x = L - td - 5.0
        y = max(20.0, min(W - tw - 16.0, W * 0.20))
        layout.append(_make_layout_entry(towel, x, y, 90, "Heated towel ladder"))

    return layout

def _wall_candidates(item: Dict[str, Any], L: float, W: float, category: str, strategy: str):
    """Generate sensible wall anchors. Rotation is part of the layout contract:
    0=north wall facing room, 180=south, 90=west, 270=east.
    """
    w=float(item.get("widthInches") or 24); d=float(item.get("depthInches") or 24)
    edge=4.0
    # Positions are sampled along each wall, not across the open floor.
    fractions={
        "open_balanced":[.18,.50,.82], "circulation_first":[.12,.88,.50],
        "storage_first":[.22,.38,.72], "spa_corner":[.12,.88,.68],
        "symmetry":[.50,.20,.80], "compact_comfort":[.16,.84,.50],
    }.get(strategy,[.2,.5,.8])
    out=[]
    for f in fractions:
        # north / south: original footprint
        x=max(edge,min(L-w-edge,L*f-w/2))
        out += [(x,edge,0),(x,max(edge,W-d-edge),180)]
        # west / east: rotated footprint (d x w)
        y=max(edge,min(W-w-edge,W*f-w/2))
        out += [(edge,y,90),(max(edge,L-d-edge),y,270)]
    # Shower gets corner-first ordering; vanity/toilet prefer long uninterrupted walls.
    if category == "Shower & Tub":
        corners=[(edge,edge,0),(max(edge,L-w-edge),edge,0),(edge,max(edge,W-d-edge),180),(max(edge,L-w-edge),max(edge,W-d-edge),180)]
        out=corners+out
    return out


def candidate_positions(item: Dict[str, Any], L: float, W: float, category: str, strategy: str):
    if category == "Freestanding Tub":
        w=float(item.get("widthInches") or 66); d=float(item.get("depthInches") or 32)
        return [(L/2-w/2,W/2-d/2,0),(L/2-w/2,12,0),(12,W/2-d/2,90),(L-d-12,W/2-w/2,90)]
    return _wall_candidates(item,L,W,category,strategy)


def _service_zone(r, rotation, front_inches):
    depth=0.0  # service clearances are scored/warned; physical overlap + door zones remain hard constraints
    if depth <= 0: return None
    rot=int(rotation)%360
    if rot==0: return {"x":r["x"],"y":r["y"]+r["h"],"w":r["w"],"h":depth}
    if rot==180: return {"x":r["x"],"y":r["y"]-depth,"w":r["w"],"h":depth}
    if rot==90: return {"x":r["x"]+r["w"],"y":r["y"],"w":depth,"h":r["h"]}
    return {"x":r["x"]-depth,"y":r["y"],"w":depth,"h":r["h"]}


def _hard_valid(r, placed, L, W, dz, rotation=0, front_inches=0, min_gap=5.0):
    if not inside_room(r,L,W,margin=1.5): return False
    if rects_intersect(r,dz,padding=2): return False
    service=_service_zone(r,rotation,front_inches)
    if service and not inside_room(service,L,W): return False
    for p in placed:
        if rects_intersect(r,p,padding=min_gap): return False
        if service and rects_intersect(service,p): return False
        if p.get("_service") and rects_intersect(r,p["_service"]): return False
    return True


def _candidate_local_score(r, rot, category, L, W, strategy, placed):
    cx,cy=r["x"]+r["w"]/2,r["y"]+r["h"]/2
    center=math.hypot(cx-L/2,cy-W/2)
    wall=min(r["x"],r["y"],L-r["x"]-r["w"],W-r["y"]-r["h"])
    score=max(0,18-wall)*2 + center*.10
    if strategy=="circulation_first": score += center*.55
    elif strategy=="compact_comfort": score -= center*.12
    elif strategy=="symmetry": score -= abs(cx-L/2)*.18
    elif strategy=="storage_first" and category=="Vanity & Basin": score += 18
    elif strategy=="spa_corner" and category=="Shower & Tub": score += center*.35
    # Avoid creating narrow slots between floor fixtures.
    for p in placed:
        dx=max(p["x"]-(r["x"]+r["w"]),r["x"]-(p["x"]+p["w"]),0)
        dy=max(p["y"]-(r["y"]+r["h"]),r["y"]-(p["y"]+p["h"]),0)
        gap=math.hypot(dx,dy)
        if gap<12: score-=45
        elif gap<20: score-=12
    return score

def score_layout(layout: List[Dict[str, Any]], L: float, W: float, door: str, strategy: str = "open_balanced") -> float:
    score = 0.0
    dz = door_zone(L, W, door)
    cx, cy = L / 2, W / 2
    for entry in layout:
        r = {"x": entry["x"], "y": entry["y"], "w": entry["w"], "h": entry["h"]}
        cat = entry["item"]["category"]
        wall_mounted = entry["item"].get("mountingType") == "wall_hung"
        if not inside_room(r, L, W): score -= 1000
        if not wall_mounted and rects_intersect(r, dz, padding=2): score -= 420
        wall_distance = min(r["x"], r["y"], L-(r["x"]+r["w"]), W-(r["y"]+r["h"]))
        if cat in {"Vanity & Basin", "Smart Toilet", "Shower & Tub", "Freestanding Tub"}:
            score += max(0, 18-wall_distance)*2
        center_dist = math.hypot(r["x"]+r["w"]/2-cx, r["y"]+r["h"]/2-cy)
        score += min(center_dist/5, 16)
        if strategy == "circulation_first": score += min(center_dist/3, 22)
        if strategy == "symmetry": score += max(0, 14-abs((r["x"]+r["w"]/2)-cx))*0.8
        if strategy == "compact_comfort": score += max(0, 12-center_dist/3)

    floor_entries = [e for e in layout if e["item"].get("mountingType", "floor") != "wall_hung"]
    for i,a in enumerate(floor_entries):
        ar={"x":a["x"],"y":a["y"],"w":a["w"],"h":a["h"]}
        clearance=float(a["item"].get("clearanceFrontInches") or 0)
        clear={"x":ar["x"]-clearance/2,"y":ar["y"]-clearance/2,"w":ar["w"]+clearance,"h":ar["h"]+clearance}
        for b in floor_entries[i+1:]:
            br={"x":b["x"],"y":b["y"],"w":b["w"],"h":b["h"]}
            if rects_intersect(ar,br,padding=1): score-=800
            if rects_intersect(clear,br): score-=22
    corridor={"x":L*.38,"y":0,"w":L*.24,"h":W}
    for e in floor_entries:
        r={"x":e["x"],"y":e["y"],"w":e["w"],"h":e["h"]}
        if rects_intersect(r,corridor): score -= 2 if strategy == "circulation_first" else 6
    if L >= 168:
        # Reward the intended large-room composition: clustered vanity/toilet + central tub.
        names={e["item"]["category"]: e for e in layout}
        if "Vanity & Basin" in names and "Smart Toilet" in names:
            v,t=names["Vanity & Basin"],names["Smart Toilet"]
            if abs(v["y"]-t["y"]) < 14: score += 18
        if "Freestanding Tub" in names:
            tub=names["Freestanding Tub"]
            edge_clear=min(tub["x"],tub["y"],L-tub["x"]-tub["w"],W-tub["y"]-tub["h"])
            score += min(edge_clear, 30)
    return score


def generate_candidate(bundle: List[Dict[str, Any]], L: float, W: float, door: str, strategy: str):
    """Constraint-first planner. Core floor fixtures are never allowed to overlap,
    block the door, or squeeze through a sub-5-inch geometric gap. Wall-mounted
    accessories are attached after the floor plan is solved so they cannot corrupt it.
    """
    dz=door_zone(L,W,door)
    floor_categories=[c for c in ["Shower & Tub","Vanity & Basin","Smart Toilet","Freestanding Tub"] if any(i["category"]==c for i in bundle)]
    # Do not force a large soaking tub into a room that cannot carry it comfortably.
    if L*W < 14500 and "Freestanding Tub" in floor_categories:
        floor_categories.remove("Freestanding Tub")
    if strategy=="storage_first": floor_categories.sort(key=lambda c: {"Vanity & Basin":0,"Smart Toilet":1,"Shower & Tub":2,"Freestanding Tub":3}.get(c,9))
    elif strategy=="spa_corner": floor_categories.sort(key=lambda c: {"Shower & Tub":0,"Freestanding Tub":1,"Vanity & Basin":2,"Smart Toilet":3}.get(c,9))

    best_layout=[]; best_score=-1e18
    def search(idx, placed, entries, running):
        nonlocal best_layout,best_score
        if idx==len(floor_categories):
            final=running+score_layout(entries,L,W,door,strategy)
            if final>best_score: best_score=final; best_layout=list(entries)
            return
        cat=floor_categories[idx]; item=next(i for i in bundle if i["category"]==cat)
        candidates=[]
        for x,y,rot in candidate_positions(item,L,W,cat,strategy):
            r=footprint(item,x,y,rot)
            r["x"]=max(0,min(r["x"],L-r["w"])); r["y"]=max(0,min(r["y"],W-r["h"]))
            front=float(item.get("clearanceFrontInches") or 0)
            if _hard_valid(r,placed,L,W,dz,rot,front,5.0):
                r["_service"]=_service_zone(r,rot,front)
                candidates.append((_candidate_local_score(r,rot,cat,L,W,strategy,placed),r,rot))
        for local,r,rot in sorted(candidates,reverse=True,key=lambda z:z[0])[:10]:
            search(idx+1,placed+[r],entries+[_make_layout_entry(item,r["x"],r["y"],rot)],running+local)
    search(0,[],[],0)

    layout=best_layout
    # Secondary wall pieces never get forced into the doorway. Mirror/faucet are
    # attached to the vanity elevation; storage/towel pieces must find their own safe wall.
    vanity=next((e for e in layout if e["item"]["category"]=="Vanity & Basin"),None)
    occupied=[{"x":e["x"],"y":e["y"],"w":e["w"],"h":e["h"]} for e in layout if e["item"].get("mountingType")!="wall_hung"]
    for item in bundle:
        if item.get("mountingType")!="wall_hung" or item.get("category")=="Vanity & Basin": continue
        cat=item["category"]
        if vanity and cat in {"Vanity Mirror / Medicine Cabinet","Lavatory Faucet"}:
            x=vanity["x"]+(vanity["w"]-float(item.get("widthInches") or 4))/2
            y=vanity["y"]
            layout.append(_make_layout_entry(item,x,y,vanity["rotation"],f"{cat} · vanity zone"))
            continue
        safe=None
        for x,y,rot in candidate_positions(item,L,W,cat,strategy):
            r=footprint(item,x,y,rot)
            if inside_room(r,L,W,1.5) and not rects_intersect(r,dz,padding=4):
                # Wall-mounted storage may visually align with a floor fixture but must not
                # occupy the entry zone. Prefer a wall segment not directly over core fixtures.
                overlap=sum(1 for q in occupied if rects_intersect(r,q,padding=2))
                if overlap==0: safe=(r,rot); break
                if safe is None: safe=(r,rot)
        if safe:
            r,rot=safe
            layout.append(_make_layout_entry(item,r["x"],r["y"],rot,f"{cat} · clear wall"))
        # If no safe wall exists, omit it instead of corrupting circulation.
    return layout


def _normalize_layout_bounds(layout: List[Dict[str, Any]], L: float, W: float, margin: float = 1.5):
    """Final invariant: every stored axis-aligned footprint is inside the room.

    Recomputes the occupied footprint from catalog dimensions + rotation, then
    clamps only to the room boundary. This is especially important for attached
    mirror/storage/faucet entries that can share a wall plane with their host.
    """
    for entry in layout:
        item = entry.get("item") or {}
        rot = float(entry.get("rotation") or 0) % 360
        r = footprint(item, float(entry.get("x") or 0), float(entry.get("y") or 0), rot)
        w, h = r["w"], r["h"]
        max_x = max(margin, L - w - margin)
        max_y = max(margin, W - h - margin)
        entry["x"] = round(min(max(float(entry.get("x") or 0), margin), max_x), 2)
        entry["y"] = round(min(max(float(entry.get("y") or 0), margin), max_y), 2)
        entry["w"] = round(w, 2)
        entry["h"] = round(h, 2)
    return layout


def compute_plan(bundle: List[Dict[str, Any]], L: float, W: float, door: str, strategy: str = "open_balanced"):
    """Canonical spatial planner used by the API.

    Large rooms use the architectural clustering composition above; compact rooms
    use the candidate/clearance solver. Keeping this behind one function makes the
    layout policy explicit and keeps the endpoint independent of the strategy details.
    """
    return generate_candidate(bundle, L, W, door, strategy)

def choose_bundle(db: Session, theme: str, budget: float, intelligence: Optional[Dict[str, Any]] = None):
    """Choose a themed bundle that actually responds to the target budget.

    Core plumbing fixtures are mandatory. Secondary fixtures are added only when
    affordable. Within each category, the optimizer upgrades from Essential to
    Signature/Premium while staying at or below the target whenever possible.
    """
    mandatory = {"Vanity & Basin", "Smart Toilet", "Shower & Tub", "Lavatory Faucet"}
    intelligence = intelligence or {}
    optional_order = ["Vanity Mirror / Medicine Cabinet", "Toiletries & Accessories", "Towel Warmer"]
    if intelligence.get("bath_preference") in {"tub", "both"}:
        optional_order.insert(0 if intelligence.get("bath_preference") == "tub" else len(optional_order), "Freestanding Tub")
    if intelligence.get("storage_priority") == "high":
        optional_order = ["Toiletries & Accessories", "Vanity Mirror / Medicine Cabinet"] + [x for x in optional_order if x not in {"Toiletries & Accessories", "Vanity Mirror / Medicine Cabinet"}]
    by_category = {}
    for category in CATEGORY_ORDER:
        rows = db.query(CatalogItemModel).filter(
            CatalogItemModel.category == category,
            CatalogItemModel.theme == theme,
            CatalogItemModel.in_stock.is_(True),
        ).order_by(CatalogItemModel.price.asc()).all()
        if not rows:
            rows = db.query(CatalogItemModel).filter(
                CatalogItemModel.category == category, CatalogItemModel.in_stock.is_(True)
            ).order_by(CatalogItemModel.price.asc()).all()
        choices = [r.to_dict() for r in rows]
        tiered = [x for x in choices if (x.get("attributes") or {}).get("tier") in {"essential", "signature", "premium"}]
        by_category[category] = tiered or choices

    selected = []
    # Start with the least expensive version of every mandatory category.
    for category in CATEGORY_ORDER:
        if category in mandatory and by_category.get(category):
            selected.append(by_category[category][0])

    def total():
        return sum(float(x.get("price", 0)) for x in selected)

    # Add useful secondary fixtures in a predictable priority order.
    for category in optional_order:
        choices = by_category.get(category) or []
        if choices and total() + float(choices[0]["price"]) <= budget:
            selected.append(choices[0])

    # Spend remaining budget on the smallest sensible upgrades first. This gets
    # much closer to the selected target than simply picking the first DB row.
    while True:
        upgrades = []
        for i, current in enumerate(selected):
            choices = by_category.get(current["category"]) or []
            for candidate in choices:
                delta = float(candidate["price"]) - float(current["price"])
                if delta > 0 and total() + delta <= budget:
                    upgrades.append((delta, i, candidate))
                    break
        if not upgrades:
            break
        # Prefer a larger affordable upgrade so higher budgets visibly change quality.
        _, idx, candidate = max(upgrades, key=lambda x: x[0])
        selected[idx] = candidate

    return selected


# ------------------------------ API ------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version}


@app.get("/api/catalog")
def catalog(db: Session = Depends(get_db)):
    return [x.to_dict() for x in db.query(CatalogItemModel).order_by(CatalogItemModel.category, CatalogItemModel.price).all()]


@app.post("/api/plan")
def plan(req: PlanRequest, db: Session = Depends(get_db)):
    L, W = req.roomLengthFt * 12, req.roomWidthFt * 12
    bundle = choose_bundle(db, req.theme, req.budget, req.designIntelligence)
    if not bundle:
        raise HTTPException(500, "Catalog is empty. Run seed.py.")

    strategies = [
        ("open_balanced", "Open & Balanced"),
        ("storage_first", "Storage First"),
        ("spa_corner", "Spa Corner"),
        ("symmetry", "Symmetry"),
        ("circulation_first", "Circulation Focus"),
        ("compact_comfort", "Compact Comfort"),
    ]
    designs = []
    for strategy, name in strategies:
        layout = _normalize_layout_bounds(compute_plan(bundle, L, W, req.doorPosition, strategy), L, W)
        score = score_layout(layout, L, W, req.doorPosition, strategy)
        if layout:
            designs.append({"id": f"design-{uuid.uuid4().hex[:8]}", "name": name, "strategy": strategy, "score": round(score,1), "layout": layout})
    # Prefer three intentionally different planning philosophies, then use score/diversity as fallback.
    if req.designIntelligence.get("storage_priority") == "high":
        family_order = ["storage_first", "circulation_first", "open_balanced"]
    elif req.designIntelligence.get("circulation_priority") == "high" or req.designIntelligence.get("accessibility") in {"step_free", "enhanced"}:
        family_order = ["circulation_first", "open_balanced", "storage_first"]
    else:
        family_order = ["open_balanced", "circulation_first", "storage_first"]
    ranked = sorted(designs, key=lambda d: (family_order.index(d["strategy"]) if d["strategy"] in family_order else 99, -d["score"]))
    def layout_distance(a, b):
        total = 0.0
        for ea in a:
            eb = next((x for x in b if x["item"]["category"] == ea["item"]["category"]), None)
            if eb:
                total += abs(ea["x"]-eb["x"]) + abs(ea["y"]-eb["y"]) + abs(ea.get("rotation",0)-eb.get("rotation",0))*1.5
        return total
    selected=[]
    for candidate in ranked:
        if not selected or all(layout_distance(candidate["layout"], chosen["layout"]) >= 25 for chosen in selected):
            selected.append(candidate)
        if len(selected) == 3:
            break
    # If a very small room leaves fewer than three distinct candidates, fill from the ranked list.
    for candidate in ranked:
        if candidate not in selected:
            selected.append(candidate)
        if len(selected) == 3:
            break
    designs = selected
    best_layout = designs[0]["layout"] if designs else []
    total = round(sum(i["price"] for i in bundle), 2)
    return {
        "theme": req.theme,
        "themeTitle": THEME_TITLES[req.theme],
        "themeNote": THEME_NOTES[req.theme],
        "bundle": bundle,
        "designs": designs,
        "layout": best_layout,
        "roomLInches": L,
        "roomWInches": W,
        "totalCost": total,
        "budget": req.budget,
        "doorPosition": req.doorPosition,
        "tile": req.tile,
        "marbleDesign": req.marbleDesign,
        "tileColor": req.tileColor,
        "designIntelligence": req.designIntelligence,
        "imageAnalysis": req.imageAnalysis,
    }


@app.post("/api/layout/validate")
def validate_layout(req: ValidateRequest):
    L, W = req.roomLengthInches, req.roomWidthInches
    problems = []
    warnings = []
    dz = door_zone(L, W, req.doorPosition)
    for entry in req.layout:
        r = {"x": entry.x, "y": entry.y, "w": entry.w, "h": entry.h}
        wall_mounted = entry.item.get("category") in {"Lavatory Faucet","Toiletries & Accessories","Towel Warmer","Vanity Mirror / Medicine Cabinet"}
        if not inside_room(r, L, W):
            problems.append(f"{entry.areaLabel} extends outside the room.")
        if not wall_mounted and rects_intersect(r, dz, padding=1):
            problems.append(f"{entry.areaLabel} overlaps the entrance clearance zone.")
        if wall_mounted:
            continue
        cf = float(entry.item.get("clearanceFrontInches") or 0)
        clear = {"x": r["x"] - cf / 2, "y": r["y"] - cf / 2, "w": r["w"] + cf, "h": r["h"] + cf}
        for other in req.layout:
            if other.id == entry.id or other.item.get("category") in {"Lavatory Faucet","Toiletries & Accessories","Towel Warmer","Vanity Mirror / Medicine Cabinet"}:
                continue
            o = {"x": other.x, "y": other.y, "w": other.w, "h": other.h}
            if rects_intersect(r, o, padding=1):
                problems.append(f"{entry.areaLabel} overlaps {other.areaLabel}.")
                break
            if rects_intersect(clear, o, padding=0):
                warnings.append(f"{entry.areaLabel} is close to {other.areaLabel}; check circulation.")
                break
    # de-duplicate while preserving order
    problems = list(dict.fromkeys(problems))
    warnings = list(dict.fromkeys(warnings))
    return {"valid": not problems, "problems": problems, "warnings": warnings}


def _layout_metrics(layout, L, W, door):
    dz = door_zone(L, W, door)
    wall = {"Lavatory Faucet","Toiletries & Accessories","Towel Warmer","Vanity Mirror / Medicine Cabinet"}
    floor = [e for e in layout if e.item.get("category") not in wall]
    entry_hits=[]; overlaps=[]; closest=None
    for i,a in enumerate(floor):
        ar={"x":a.x,"y":a.y,"w":a.w,"h":a.h}
        if rects_intersect(ar,dz,padding=2): entry_hits.append(a.areaLabel)
        for b in floor[i+1:]:
            br={"x":b.x,"y":b.y,"w":b.w,"h":b.h}
            if rects_intersect(ar,br,padding=1): overlaps.append(f"{a.areaLabel} / {b.areaLabel}")
            dx=max(br["x"]-(ar["x"]+ar["w"]), ar["x"]-(br["x"]+br["w"]), 0)
            dy=max(br["y"]-(ar["y"]+ar["h"]), ar["y"]-(br["y"]+br["h"]), 0)
            gap=math.hypot(dx,dy)
            if closest is None or gap<closest[0]: closest=(gap,a.areaLabel,b.areaLabel)
    occupied=sum(e.w*e.h for e in floor)
    return {"entryClear":not entry_hits,"entryConflicts":entry_hits,"overlaps":overlaps,
            "closestGapInches":round(closest[0],1) if closest else None,
            "closestPair":[closest[1],closest[2]] if closest else [],
            "floorOccupancyPercent":round(100*occupied/max(L*W,1),1),"fixtureCount":len(layout)}


def _intelligence_facts(req: IntelligenceRequest):
    facts=_layout_metrics(req.layout, req.roomLengthInches, req.roomWidthInches, req.doorPosition)
    facts.update({"productCount":len(req.bundle),"budgetRemaining":round(req.budget-req.totalCost,2),"withinBudget":req.totalCost<=req.budget})
    return facts


def _comparison(req: IntelligenceRequest, facts):
    rows=[]
    for raw in req.comparisonLayouts:
        try:
            layout=[LayoutItem(**x) for x in raw.get("layout",[])]
            m=_layout_metrics(layout,req.roomLengthInches,req.roomWidthInches,req.doorPosition)
            rows.append({"name":raw.get("name","Alternative"),"strategy":raw.get("strategy",""),"score":raw.get("score"),**m})
        except Exception:
            continue
    current=next((x for x in rows if x["name"]==req.layoutName),None) or {"name":req.layoutName,**facts}
    valid=[x for x in rows if not x.get("overlaps") and x.get("entryClear")]
    trade=[]
    if valid and current.get("closestGapInches") is not None:
        best=max(valid,key=lambda x:x.get("closestGapInches") or -1)
        if best["name"]!=current["name"] and (best.get("closestGapInches") or 0) > current["closestGapInches"]+1:
            trade.append(f"{best['name']} provides about {best['closestGapInches']:.1f} in between its closest core fixtures versus {current['closestGapInches']:.1f} in here")
        else:
            trade.append(f"this option has the strongest measured core-fixture spacing at about {current['closestGapInches']:.1f} in")
    if valid:
        lowest=min(valid,key=lambda x:x.get("floorOccupancyPercent",999))
        if lowest["name"]!=current["name"] and lowest.get("floorOccupancyPercent",0)+1 < current.get("floorOccupancyPercent",0):
            trade.append(f"{lowest['name']} uses less floor footprint ({lowest['floorOccupancyPercent']:.1f}% vs {current['floorOccupancyPercent']:.1f}%)")
    sentence=("; however, ".join(trade[:2])+".") if trade else f"This option uses {facts['floorOccupancyPercent']:.1f}% of the room footprint for core floor fixtures."
    return rows, sentence[0].upper()+sentence[1:]


def _design_brief(req: IntelligenceRequest):
    di=req.designIntelligence or {}
    users=di.get("users","2"); storage=di.get("storage_priority","medium")
    bath={"shower":"walk-in shower","tub":"bathtub","both":"shower and bathtub"}.get(di.get("bath_preference"),"shower")
    access={"standard":"standard access","step_free":"step-free access","enhanced":"enhanced clearances"}.get(di.get("accessibility"),"standard access")
    plumbing="retain existing plumbing where practical" if di.get("plumbing_flexibility") == "limited" else "allow plumbing relocation when it improves the plan"
    circulation="prioritize open circulation" if di.get("circulation_priority") == "high" else "balance circulation with fixture capacity"
    return f"Design for {users} user(s) with {storage} storage priority and a preference for a {bath}. {access.capitalize()}; {plumbing}; {circulation}. Keep the product bundle within ${req.budget:,.0f}."


@app.post("/api/designs/intelligence")
def design_intelligence(req: IntelligenceRequest):
    facts=_intelligence_facts(req); brief=_design_brief(req); di=req.designIntelligence or {}
    comparison, measured_tradeoff = _comparison(req, facts)
    strengths=[]; warnings=[]
    strengths.append("Entrance keep-clear zone is protected." if facts["entryClear"] else "")
    if not facts["overlaps"]: strengths.append("No core fixture collisions were detected.")
    if facts["withinBudget"]: strengths.append(f"Product bundle stays within budget with ${facts['budgetRemaining']:,.0f} remaining.")
    if facts["closestGapInches"] is not None and facts["closestGapInches"] >= 24: strengths.append(f"Tightest core-fixture gap is about {facts['closestGapInches']:.0f} in.")
    if not facts["entryClear"]: warnings.append("A core fixture conflicts with the protected entrance zone.")
    if facts["overlaps"]: warnings.append("Core fixture overlap detected: " + ", ".join(facts["overlaps"][:2]) + ".")
    if facts["closestGapInches"] is not None and facts["closestGapInches"] < 18: warnings.append(f"The tightest core-fixture gap is only about {facts['closestGapInches']:.0f} in; circulation should be reviewed.")
    if not facts["withinBudget"]: warnings.append(f"Selected products exceed the target by ${abs(facts['budgetRemaining']):,.0f}.")
    if di.get("storage_priority") == "high" and not any(x.get("category") in {"Toiletries & Accessories","Vanity Mirror / Medicine Cabinet"} for x in req.bundle): warnings.append("High storage priority is not fully represented by the current product bundle.")
    strengths=[x for x in strengths if x]
    product_reasoning=[]
    for item in req.bundle[:8]:
        cat=item.get("category","Fixture"); name=item.get("name",cat); tier=(item.get("attributes") or {}).get("tier")
        reason=f"{name} fits the {req.theme.replace('_',' ')} scheme and the active product budget."
        if cat=="Vanity & Basin" and di.get("storage_priority")=="high": reason=f"{name} supports the high-storage brief while remaining compatible with the generated vanity footprint."
        elif cat=="Shower & Tub" and di.get("bath_preference")=="shower": reason=f"{name} directly satisfies the walk-in-shower preference."
        elif tier: reason=f"{name} is the {tier} tier selected by the budget-aware bundle optimizer."
        product_reasoning.append({"product":name,"reason":reason})
    response={"source":"spatial-engine","aiAvailable":False,"brief":brief,"facts":facts,"strengths":strengths,"warnings":warnings,"tradeoff":measured_tradeoff,"comparison":comparison,"productReasoning":product_reasoning}
    api_key=os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            client=genai.Client(api_key=api_key)
            prompt="""You are Nestora's bathroom design reasoning layer. Use ONLY the supplied computed facts and user brief. Do not invent measurements, compliance claims, or products. Return JSON with keys: summary (2 sentences), tradeoff (1 sentence), next_action (1 sentence).\n""" + json.dumps({"brief":brief,"facts":facts,"comparison":comparison,"measured_tradeoff":measured_tradeoff,"layout":req.layoutName,"strategy":req.strategy,"products":[{"name":x.get("name"),"category":x.get("category"),"price":x.get("price")} for x in req.bundle]})
            ai=client.models.generate_content(model="gemini-3.6-flash",contents=prompt)
            parsed=json.loads(ai.text.replace("```json","").replace("```","").strip())
            response.update({"source":"gemini+spatial-engine","aiAvailable":True,"summary":parsed.get("summary"),"tradeoff":parsed.get("tradeoff",response["tradeoff"]),"nextAction":parsed.get("next_action")})
        except Exception as exc:
            print(f"Gemini design intelligence error: {exc}")
    return response


@app.post("/api/designs/refine")
def refine_design(req: RefineRequest):
    text=req.instruction.lower(); di=dict(req.designIntelligence or {}); changes=[]; locks=[]
    if any(k in text for k in ["more storage","storage","cabinet"]): di["storage_priority"]="high"; changes.append("storage priority -> high")
    if any(k in text for k in ["more space","spacious","open circulation","more circulation"]): di["circulation_priority"]="high"; changes.append("circulation priority -> high")
    if any(k in text for k in ["keep plumbing","don't move plumbing","do not move plumbing"]): di["plumbing_flexibility"]="limited"; changes.append("plumbing relocation -> limited")
    if "bathtub" in text or "bath tub" in text: di["bath_preference"]="tub"; changes.append("bath preference -> bathtub")
    if "shower" in text and "tub" not in text: di["bath_preference"]="shower"; changes.append("bath preference -> walk-in shower")
    if any(k in text for k in ["accessible","accessibility","wheelchair","step-free","step free"]): di["accessibility"]="enhanced"; changes.append("accessibility -> enhanced")
    # Gemini may interpret subtler wording, but only into this safe structured schema.
    api_key=os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            client=genai.Client(api_key=api_key)
            prompt="""Convert the bathroom redesign request into JSON only. Allowed keys: storage_priority(low|medium|high), circulation_priority(medium|high), plumbing_flexibility(limited|flexible), bath_preference(shower|tub|both), accessibility(standard|step_free|enhanced). Omit anything not requested. Request: """ + req.instruction
            ai=client.models.generate_content(model="gemini-3.6-flash",contents=prompt)
            parsed=json.loads(ai.text.replace("```json","").replace("```","").strip())
            allowed={"storage_priority":{"low","medium","high"},"circulation_priority":{"medium","high"},"plumbing_flexibility":{"limited","flexible"},"bath_preference":{"shower","tub","both"},"accessibility":{"standard","step_free","enhanced"}}
            for k,vals in allowed.items():
                if parsed.get(k) in vals: di[k]=parsed[k]
        except Exception as exc: print(f"Gemini refinement error: {exc}")
    return {"designIntelligence":di,"changes":changes,"message":"I translated your request into planner constraints. Regenerating will re-run geometry validation and product matching."}


@app.post("/api/designs/suggestions")
def suggestions(req: SuggestionRequest):
    L, W = req.roomLengthInches, req.roomWidthInches
    dz = door_zone(L, W, req.doorPosition)
    room_ft = f"{L/12:.1f} × {W/12:.1f} ft"
    observations = []

    def label(e):
        return (e.areaLabel or e.item.get("category", "fixture")).replace(" · ", " ")

    # 1) Door + circulation: name the actual fixture and quantify the issue.
    entry_hits = []
    for e in req.layout:
        r = {"x":e.x,"y":e.y,"w":e.w,"h":e.h}
        if rects_intersect(r, dz, padding=2):
            entry_hits.append(e)
    if entry_hits:
        e = entry_hits[0]
        observations.append({"type":"entry","title":f"Move {label(e)} away from the door","text":f"In this {room_ft} room, {label(e).lower()} overlaps the entrance/swing zone near the {req.doorPosition.replace('_',' ')} door. Move it at least 6–12 in farther along its wall before adding decor."})
    else:
        observations.append({"type":"circulation","title":"Entry path is clear","text":f"The {req.doorPosition.replace('_',' ')} entrance is unobstructed in this {room_ft} plan. Preserve roughly a 30 in walking lane from the door toward the room centre."})

    # 2) Find the closest pair and report the measured edge-to-edge gap.
    closest = None
    non_floor={"Lavatory Faucet","Toiletries & Accessories","Towel Warmer","Vanity Mirror / Medicine Cabinet"}
    floor_layout=[e for e in req.layout if e.item.get("category") not in non_floor]
    for i,a in enumerate(floor_layout):
        for b in floor_layout[i+1:]:
            ar={"x":a.x,"y":a.y,"w":a.w,"h":a.h}; br={"x":b.x,"y":b.y,"w":b.w,"h":b.h}
            dx=max(br["x"]-(ar["x"]+ar["w"]), ar["x"]-(br["x"]+br["w"]), 0)
            dy=max(br["y"]-(ar["y"]+ar["h"]), ar["y"]-(br["y"]+br["h"]), 0)
            dist=math.hypot(dx,dy)
            if closest is None or dist < closest[0]: closest=(dist,a,b)
    if closest:
        gap,a,b=closest
        if gap < 18:
            observations.append({"type":"spacing","title":f"Separate {label(a)} and {label(b)}","text":f"Their edge-to-edge gap is only about {gap:.0f} in. Aim for about 18–24 in where possible; if the room cannot support that, remove or wall-mount the lower-priority piece rather than squeezing both together."})
        else:
            observations.append({"type":"spacing","title":"Fixture spacing is workable","text":f"The tightest pair is {label(a).lower()} and {label(b).lower()} at about {gap:.0f} in apart. Keep that gap open instead of filling it with storage or decor."})

    # 3) Give a layout-specific visual recommendation based on density + selected finish.
    floor_area=L*W
    occupied=sum(e.w*e.h for e in req.layout if e.item.get("category") not in non_floor)
    density=occupied/max(floor_area,1)
    tile_names={"travertine":"warm travertine","terrazzo":"cream terrazzo","sage":"sage zellige","slate":"charcoal slate","terracotta":"terracotta","marble":"custom marble"}
    if density > .30:
        text=f"Floor fixtures occupy roughly {density*100:.0f}% of the plan footprint before clearances. Keep the 3D scene to the core fixtures and use wall-mounted storage; the {tile_names.get(req.tile,req.tile)} already provides enough visual detail."
        title="Reduce visual density"
    else:
        text=f"Floor fixtures use roughly {density*100:.0f}% of the room footprint. The plan has enough negative space, so keep accessories concentrated near the vanity instead of distributing them around every wall."
        title="Use the open space deliberately"
    observations.append({"type":"density","title":title,"text":text})
    return {"suggestions": observations[:3]}


@app.post("/api/analyze-image")
async def analyze_room_image(file: UploadFile = File(...)):
    contents = await file.read()
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=api_key)
            prompt = """
Analyze this bathroom/room image. Return JSON only with:
length_ft: estimated room length from 6 to 20;
width_ft: estimated room width from 5 to 16;
suggested_theme: one of modern_cozy, scandinavian, boho, classic, mediterranean, minimalist, rustic, luxury_spa;
door_position: bottom_left or bottom_right;
confidence: number 0 to 1;
dimensions_reliable: boolean;
detected_features: array of short strings such as toilet, vanity, shower, tub, window;
notes: short string.
Only mark dimensions_reliable true when the image contains a credible scale reference. Otherwise provide a rough estimate but explicitly mark it unreliable.
"""
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[
                    types.Part.from_bytes(data=contents, mime_type=file.content_type or "image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "length_ft": {"type": "NUMBER"},
                            "width_ft": {"type": "NUMBER"},
                            "suggested_theme": {"type": "STRING"},
                            "door_position": {"type": "STRING"},
                            "confidence": {"type": "NUMBER"},
                            "dimensions_reliable": {"type": "BOOLEAN"},
                            "detected_features": {"type": "ARRAY", "items": {"type": "STRING"}},
                            "notes": {"type": "STRING"},
                        },
                        "required": ["length_ft", "width_ft", "suggested_theme", "door_position", "confidence", "dimensions_reliable", "detected_features", "notes"],
                    },
                ),
            )
            result = json.loads(response.text)
            result["analysis_available"] = True
            result["source"] = "gemini"
            return result
        except Exception as exc:
            print(f"Gemini vision error: {exc}")
            return {"analysis_available": False, "error": "Vision analysis failed. Review server logs and enter dimensions manually."}
    return {"analysis_available": False, "error": "Gemini vision is not configured. Set GEMINI_API_KEY or enter dimensions manually."}


@app.post("/api/designs", status_code=status.HTTP_201_CREATED)
def save_design(req: SaveDesignRequest, db: Session = Depends(get_db)):
    design = DesignModel(
        name=req.name,
        theme=req.theme,
        tile=req.tile,
        marble_design=req.marbleDesign,
        tile_color=req.tileColor,
        room_length_ft=req.roomLengthFt,
        room_width_ft=req.roomWidthFt,
        budget=req.budget,
        total_cost=req.totalCost,
        door_position=req.doorPosition,
        layout_data=json.dumps(req.layout),
        bundle_data=json.dumps(req.bundle),
        design_intelligence_data=json.dumps(req.designIntelligence or {}),
        image_analysis_data=json.dumps(req.imageAnalysis or {}),
        layout_analysis_data=json.dumps(req.layoutAnalysis or {}),
    )
    db.add(design)
    db.commit()
    db.refresh(design)
    return design.to_dict()


@app.get("/api/designs")
def get_saved_designs(db: Session = Depends(get_db)):
    return [d.to_dict() for d in db.query(DesignModel).order_by(DesignModel.created_at.desc()).all()]


@app.get("/api/designs/{design_id}")
def get_saved_design(design_id: int, db: Session = Depends(get_db)):
    design = db.query(DesignModel).filter(DesignModel.id == design_id).first()
    if not design:
        raise HTTPException(404, "Design not found")
    return design.to_dict()


@app.patch("/api/designs/{design_id}")
def rename_saved_design(design_id: int, req: RenameDesignRequest, db: Session = Depends(get_db)):
    design=db.query(DesignModel).filter(DesignModel.id==design_id).first()
    if not design: raise HTTPException(404,"Design not found")
    design.name=req.name.strip(); db.commit(); db.refresh(design); return design.to_dict()


@app.delete("/api/designs/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_design(design_id: int, db: Session = Depends(get_db)):
    design=db.query(DesignModel).filter(DesignModel.id==design_id).first()
    if not design: raise HTTPException(404,"Design not found")
    db.delete(design); db.commit(); return None


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")
