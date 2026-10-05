import math
from main import _intent_candidate_score, _locked_position

def test_preferred_left_wall_scores_left_candidate_higher():
    intelligence = {
        "placement_preferences": [
            {"fixture": "vanity", "preferred_wall": "left", "preferred_zone": None, "avoid_entrance": False}
        ]
    }
    left = {"x": 2, "y": 30, "w": 36, "h": 22}
    right = {"x": 82, "y": 30, "w": 36, "h": 22}
    assert _intent_candidate_score(left, "Vanity & Basin", 120, 96, "bottom_left", intelligence) > \
           _intent_candidate_score(right, "Vanity & Basin", 120, 96, "bottom_left", intelligence)

def test_avoid_entrance_scores_farther_candidate_higher():
    intelligence = {
        "placement_preferences": [
            {"fixture": "toilet", "preferred_wall": None, "preferred_zone": None, "avoid_entrance": True}
        ]
    }
    near = {"x": 8, "y": 62, "w": 28, "h": 28}
    far = {"x": 82, "y": 8, "w": 28, "h": 28}
    assert _intent_candidate_score(far, "Smart Toilet", 120, 96, "bottom_left", intelligence) > \
           _intent_candidate_score(near, "Smart Toilet", 120, 96, "bottom_left", intelligence)

def test_locked_position_only_applies_to_locked_fixture():
    intelligence = {
        "locked_fixtures": ["shower"],
        "locked_positions": {"shower": {"x": 10, "y": 12, "rotation": 0}}
    }
    assert _locked_position(intelligence, "Shower & Tub") == {"x": 10, "y": 12, "rotation": 0}
    assert _locked_position(intelligence, "Smart Toilet") is None
