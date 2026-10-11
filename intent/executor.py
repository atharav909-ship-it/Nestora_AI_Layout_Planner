from copy import deepcopy
from typing import Any, Dict, Optional


def _merge_pref(prefs, fixture, **updates):
    current = next((p for p in prefs if p.get("fixture") == fixture), None)
    if current is None:
        current = {"fixture": fixture, "preferred_wall": None, "preferred_zone": None, "avoid_entrance": False}
        prefs.append(current)
    for key, value in updates.items():
        if value is not None:
            current[key] = value


def compile_design_intent(intent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Compile general AI intent into deterministic planner hints.

    The executor never decides geometry. It only converts semantic intent into
    locks, soft preferences, strategy priorities and operation targets that the
    existing spatial engine can validate.
    """
    di = deepcopy(intent or {})
    locks = list(dict.fromkeys(di.get("locked_fixtures") or []))
    prefs = deepcopy(di.get("placement_preferences") or [])

    for constraint in di.get("constraints") or []:
        if constraint.get("type") == "lock_fixture" and constraint.get("fixture"):
            if constraint["fixture"] not in locks:
                locks.append(constraint["fixture"])
        elif constraint.get("type") == "preserve_plumbing":
            di["plumbing_flexibility"] = "limited"

    for goal in di.get("goals") or []:
        kind = goal.get("type")
        if kind == "increase_openness":
            di["circulation_priority"] = "high"
        elif kind == "increase_storage":
            di["storage_priority"] = "high"
        elif kind == "improve_accessibility":
            di["accessibility"] = "enhanced"

    for relation in di.get("relationships") or []:
        fixture = relation.get("fixture")
        if not fixture:
            continue
        kind = relation.get("type")
        if kind == "away_from" and relation.get("target") == "entrance":
            _merge_pref(prefs, fixture, avoid_entrance=True)
        elif kind == "prefer_wall":
            _merge_pref(prefs, fixture, preferred_wall=relation.get("wall"))
        elif kind == "prefer_zone":
            _merge_pref(prefs, fixture, preferred_zone=relation.get("zone"))

    for op in di.get("operations") or []:
        fixture = op.get("fixture")
        if op.get("type") in {"move", "optimize_position"} and fixture:
            if op.get("preferred_wall"):
                _merge_pref(prefs, fixture, preferred_wall=op.get("preferred_wall"))
            if op.get("preferred_zone"):
                _merge_pref(prefs, fixture, preferred_zone=op.get("preferred_zone"))

    di["locked_fixtures"] = locks
    di["placement_preferences"] = prefs
    return di
