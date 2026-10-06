import pytest

from footscan.survey import QUESTIONS, SurveyError, evaluate, validate

BASE = {
    "adult": "yes", "conditions": ["none"], "pain": "none", "arch": "normal",
    "use": "everyday", "shoe_type": "everyday", "removable_insole": "yes",
    "current_insoles": "none", "goals": ["comfort"],
}


def plan_keys(result):
    return [p["key"] for p in result["plan"]]


def flag_codes(result, level=None):
    return {f["code"] for f in result["flags"] if level is None or f["level"] == level}


def test_show_if_only_refers_to_earlier_questions():
    seen = set()
    for qid, q in QUESTIONS.items():
        assert set(q.get("show_if", {})) <= seen, qid
        seen.add(qid)


def test_minimal_valid_survey_is_seated_only():
    answers = validate(BASE)
    r = evaluate(answers, ["left", "right"])
    assert r["blocked"] is None
    assert plan_keys(r) == ["right-swb", "left-swb"]
    assert r["flags"] == []


@pytest.mark.parametrize("patch,missing", [
    ({"adult": None}, "adult"),
    ({"adult": "no"}, "guardian"),
    ({"pain": "regular"}, "pain_where"),
    ({"arch": "flat"}, "tiptoe"),
    ({"use": "sport"}, "sport"),
    ({"goals": []}, "goals"),
])
def test_required_and_conditional_questions(patch, missing):
    with pytest.raises(SurveyError) as e:
        validate({**BASE, **patch})
    assert missing in e.value.errors


def test_hidden_answers_are_dropped():
    cleaned = validate({**BASE, "tiptoe": "appears", "sport": "tennis", "made_up": 1})
    assert "tiptoe" not in cleaned and "sport" not in cleaned and "made_up" not in cleaned


@pytest.mark.parametrize("patch", [
    {"conditions": ["none", "diabetes"]},
    {"goals": ["comfort", "support", "fit"]},
    {"arch": "wobbly"},
    {"weight_kg": 5},
    {"weight_kg": "heavy"},
])
def test_invalid_answers(patch):
    with pytest.raises(SurveyError):
        validate({**BASE, **patch})


@pytest.mark.parametrize("condition", ["diabetes", "numbness", "circulation", "wounds"])
def test_high_risk_conditions_block(condition):
    r = evaluate(validate({**BASE, "conditions": [condition, "arthritis"]}), ["right"])
    assert r["blocked"] and r["plan"] == [] and "podiatrist" in r["blocked"]["message"]


def test_flat_foot_adds_standing_scans_and_tiptoe_notes():
    answers = validate({**BASE, "arch": "flat", "tiptoe": "appears", "arch_change": "no"})
    r = evaluate(answers, ["right", "left"])
    assert plan_keys(r) == ["right-swb", "left-swb", "right-fwb", "left-fwb"]
    assert flag_codes(r) == {"tiptoe_arch"}
    assert flag_codes(r, "before_wear") == set()


def test_rigid_or_changing_arch_needs_clinician_before_wear():
    answers = validate({**BASE, "arch": "unsure", "tiptoe": "stays_flat", "arch_change": "yes"})
    assert flag_codes(evaluate(answers, ["left"]), "before_wear") == {"rigid_arch", "arch_change"}


def test_sport_or_high_arch_adds_standing():
    sport = validate({**BASE, "use": "sport", "sport": "tennis", "sport_level": "competitive"})
    assert plan_keys(evaluate(sport, ["left"])) == ["left-swb", "left-fwb"]
    high = validate({**BASE, "arch": "high"})
    assert plan_keys(evaluate(high, ["right"])) == ["right-swb", "right-fwb"]


def test_before_wear_flags():
    answers = validate({
        **BASE, "adult": "no", "guardian": True, "conditions": ["arthritis", "recent_injury"],
        "pain": "regular", "pain_where": ["knee", "back"], "current_insoles": "prescribed", "removable_insole": "no",
    })
    r = evaluate(answers, ["right"])
    assert flag_codes(r, "before_wear") == {"minor", "arthritis", "recent_injury", "pain", "prescribed"}
    assert "fixed_insole" in flag_codes(r, "note")
    pain = next(f for f in r["flags"] if f["code"] == "pain")
    assert "knee and back" in pain["studio"]
    assert all(f["customer"] for f in r["flags"] if f["level"] == "before_wear")
