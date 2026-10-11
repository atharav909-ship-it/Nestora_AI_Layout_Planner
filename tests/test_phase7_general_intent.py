from intent.executor import compile_design_intent


def test_open_goal_compiles_to_circulation_priority():
    out = compile_design_intent({"goals": [{"type": "increase_openness", "priority": "high"}]})
    assert out["circulation_priority"] == "high"


def test_lock_constraint_compiles_to_existing_lock_system():
    out = compile_design_intent({"constraints": [{"type": "lock_fixture", "fixture": "shower"}]})
    assert "shower" in out["locked_fixtures"]


def test_away_from_entrance_compiles_to_soft_preference():
    out = compile_design_intent({"relationships": [{"type": "away_from", "fixture": "toilet", "target": "entrance"}]})
    pref = next(p for p in out["placement_preferences"] if p["fixture"] == "toilet")
    assert pref["avoid_entrance"] is True


def test_prefer_wall_compiles_to_soft_preference():
    out = compile_design_intent({"relationships": [{"type": "prefer_wall", "fixture": "vanity", "wall": "left"}]})
    pref = next(p for p in out["placement_preferences"] if p["fixture"] == "vanity")
    assert pref["preferred_wall"] == "left"


def test_swap_operation_is_preserved_for_frontend_snapshot():
    intent = {"operations": [{"type": "swap", "fixture": "toilet", "target_fixture": "shower"}]}
    out = compile_design_intent(intent)
    assert out["operations"][0]["type"] == "swap"
    assert out["operations"][0]["target_fixture"] == "shower"
