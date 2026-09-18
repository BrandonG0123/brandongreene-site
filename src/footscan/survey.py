"""Pre-scan survey: safety screening, and choosing which scans to take.

What the survey does and doesn't do
-----------------------------------
- It decides **which scans to capture**. It never shapes the insole directly.
  People often misjudge their own arches, so an answer like "flat feet" adds
  a standing scan that *measures* how far the arch drops under load, rather
  than being trusted as a fact.
- It **screens out** people for whom a home-made insole is actively risky
  (reduced sensation, diabetes, poor circulation, open wounds): a small fit
  error can cause a sore they won't feel. They are told to see a podiatrist
  and nothing about them is stored.
- It **flags** answers that mean a clinician should see the person before
  they wear the insole at all, not just before sport.
- It does not diagnose. Self-checks like the tiptoe test are recorded as
  observations for the operator, never shown back as a label.

The question schema is served to the browser (GET /api/survey) so the form
and this validation can't drift apart.
"""

from __future__ import annotations

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
# Question types: single, multi, text, number, confirm.
# show_if: {question_id: [values]}; the question only applies when every
# referenced single-choice answer is one of the listed values.

SECTIONS = [
    {
        "id": "safety",
        "title": "Safety check",
        "intro": "A few questions first, to check an insole is safe for you to try.",
        "questions": [
            {"id": "adult", "type": "single", "label": "Are you 18 or older?", "required": True,
             "options": [["yes", "Yes"], ["no", "No"]]},
            {"id": "guardian", "type": "confirm", "required": True, "show_if": {"adult": ["no"]},
             "label": "A parent or guardian has read the four points above and says this scan is OK."},
            {"id": "conditions", "type": "multi", "required": True, "exclusive": "none",
             "label": "Do any of these sound like you?",
             "options": [
                 ["diabetes", "Diabetes"],
                 ["numbness", "My feet often feel numb or tingly, or I can't feel them well"],
                 ["circulation", "A doctor told me I have poor blood flow in my legs or feet"],
                 ["wounds", "I have a cut, sore or wound on my foot that has not healed"],
                 ["arthritis", "I have arthritis that a doctor treats (like rheumatoid arthritis)"],
                 ["recent_injury", "In the last year I broke, badly sprained, or had surgery on a foot or ankle"],
                 ["none", "None of these"],
             ]},
            {"id": "pain", "type": "single", "required": True,
             "label": "Do your feet, legs or back hurt right now?",
             "options": [["none", "No"], ["occasional", "A little, now and then"], ["regular", "Yes, often, or it is getting worse"]]},
            {"id": "pain_where", "type": "multi", "required": True, "show_if": {"pain": ["occasional", "regular"]},
             "label": "Where does it hurt?",
             "options": [["heel", "Heel"], ["arch", "Arch"], ["forefoot", "Ball of the foot or toes"], ["ankle", "Ankle"],
                         ["shin", "Shin"], ["knee", "Knee"], ["hip", "Hip"], ["back", "Back"]]},
        ],
    },
    {
        "id": "feet",
        "title": "Your feet",
        "intro": "Just guess if you are not sure. The scan measures the real shape. Your answers only decide which scans to take.",
        "questions": [
            {"id": "arch", "type": "single", "required": True,
             "label": "What are your arches like?",
             "hint": "Not sure? Wet your foot and stand on paper or dry ground, then look at the footprint. Nearly the "
                     "whole sole means a low arch. A thin strip along the outside means a high arch.",
             "options": [["flat", "Flat or low"], ["normal", "Normal"], ["high", "High (a big gap under the middle)"], ["unsure", "Not sure"]]},
            {"id": "tiptoe", "type": "single", "required": True, "show_if": {"arch": ["flat", "unsure"]},
             "label": "Stand up and go on tiptoes. Does a gap appear under the middle of your foot?",
             "options": [["appears", "Yes, a gap appears"], ["stays_flat", "No, it stays flat"], ["cant_tell", "I can't tell"]]},
            {"id": "arch_change", "type": "single", "required": True, "show_if": {"arch": ["flat", "unsure"]},
             "label": "Has one foot got flatter in the last year or two?",
             "options": [["no", "No"], ["yes", "Yes"], ["unsure", "Not sure"]]},
        ],
    },
    {
        "id": "use",
        "title": "How you'll use it",
        "intro": "This helps pick how long, thick and firm your insole should be.",
        "questions": [
            {"id": "use", "type": "single", "required": True, "label": "What will you mostly use it for?",
             "options": [["everyday", "Everyday comfort"], ["on_feet", "Long days standing or walking (school or work)"], ["sport", "Sport"]]},
            {"id": "sport", "type": "text", "required": True, "max": 60, "show_if": {"use": ["sport"]},
             "label": "Which sport?"},
            {"id": "sport_level", "type": "single", "required": True, "show_if": {"use": ["sport"]},
             "label": "How often do you play it?",
             "options": [["casual", "Just for fun"], ["regular", "I train most weeks"], ["competitive", "I compete"]]},
            {"id": "shoe_type", "type": "single", "required": True, "label": "What shoe will it go in?",
             "options": [["court", "Court shoes (tennis, basketball…)"], ["running", "Running shoes"],
                         ["everyday", "Everyday trainers or school shoes"], ["boots", "Work boots"], ["other", "Something else"]]},
            {"id": "removable_insole", "type": "single", "required": True,
             "label": "Can you pull the insole out of that shoe?",
             "options": [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]},
            {"id": "shoe_size", "type": "text", "required": False, "max": 20, "label": "What shoe size are you?",
             "hint": "You can skip this. For example US 10 or EU 44."},
            {"id": "current_insoles", "type": "single", "required": True,
             "label": "Do you use insoles now?",
             "options": [["none", "No"], ["store", "Yes, ones I bought in a shop"], ["prescribed", "Yes, ones a foot doctor made for me"]]},
            {"id": "goals", "type": "multi", "required": True, "max_select": 2,
             "label": "What do you want most from it?", "hint": "Pick one or two.",
             "options": [["comfort", "Comfort"], ["support", "Arch support"], ["fatigue", "Feet that feel less tired"],
                         ["fit", "Better fit in my shoe"], ["stability", "Stability in sport"]]},
            {"id": "weight_kg", "type": "number", "required": False, "min": 20, "max": 300,
             "label": "How much do you weigh? (kg)", "hint": "You can skip this. It helps pick how firm the insole should be."},
        ],
    },
]

QUESTIONS = {q["id"]: q for s in SECTIONS for q in s["questions"]}
FEET = ("left", "right")

# Conditions where a DIY insole shouldn't be made at all.
STOP_CONDITIONS = {
    "diabetes": "diabetes",
    "numbness": "reduced feeling in your feet",
    "circulation": "poor circulation",
    "wounds": "open wounds or sores on your feet",
}


class SurveyError(ValueError):
    def __init__(self, errors: dict[str, str]):
        super().__init__("; ".join(f"{k}: {v}" for k, v in errors.items()))
        self.errors = errors


def applies(q: dict, answers: dict) -> bool:
    return all(answers.get(k) in values for k, values in q.get("show_if", {}).items())


def validate(raw: dict) -> dict:
    """Clean a submitted survey. Unknown and non-applicable answers are dropped."""
    if not isinstance(raw, dict):
        raise SurveyError({"survey": "expected an object"})
    out: dict = {}
    errors: dict[str, str] = {}
    # Questions are ordered so show_if only ever refers to an earlier question.
    for qid, q in QUESTIONS.items():
        if not applies(q, out):
            continue
        value = raw.get(qid)
        empty = value in (None, "", []) or (q["type"] == "confirm" and value is not True)
        if empty:
            if q.get("required"):
                errors[qid] = "required"
            continue
        opts = {o[0] for o in q.get("options", [])}
        t = q["type"]
        if t == "single":
            if value not in opts:
                errors[qid] = "not a valid option"
                continue
        elif t == "multi":
            if not isinstance(value, list) or len(set(value)) != len(value) or not set(value) <= opts:
                errors[qid] = "not valid options"
                continue
            if q.get("exclusive") in value and len(value) > 1:
                errors[qid] = f"'{q['exclusive']}' can't be combined with other answers"
                continue
            if q.get("max_select") and len(value) > q["max_select"]:
                errors[qid] = f"pick at most {q['max_select']}"
                continue
            value = [o[0] for o in q["options"] if o[0] in value]
        elif t == "text":
            value = str(value).strip()[: q.get("max", 200)]
            if not value:
                if q.get("required"):
                    errors[qid] = "required"
                continue
        elif t == "number":
            try:
                value = float(value)
            except (TypeError, ValueError):
                errors[qid] = "must be a number"
                continue
            if not q["min"] <= value <= q["max"]:
                errors[qid] = f"must be between {q['min']} and {q['max']}"
                continue
        elif t == "confirm":
            value = True
        out[qid] = value
    if errors:
        raise SurveyError(errors)
    return out


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

@dataclass
class Flag:
    level: str      # "before_wear": clinician before any wear; "note": for the operator
    code: str
    customer: str   # shown to the person (empty = operator only)
    studio: str     # shown in the studio

    def as_dict(self):
        return dict(level=self.level, code=self.code, customer=self.customer, studio=self.studio)


CONDITION_LABELS = {"swb": "Seated", "fwb": "Standing"}


def evaluate(answers: dict, feet: list[str]) -> dict:
    """-> {blocked, flags, plan}. ``answers`` must already be validated."""
    conditions = set(answers.get("conditions", []))
    stops = [STOP_CONDITIONS[c] for c in STOP_CONDITIONS if c in conditions]
    if stops:
        return dict(
            blocked=dict(
                reasons=stops,
                message=(
                    f"We can't make an insole for you with this tool because of {join_words(stops)}. "
                    "An insole that does not fit perfectly can rub and make a sore you might not feel, and that can "
                    "get bad. A foot doctor (podiatrist) can fit insoles safely for you."
                ),
            ),
            flags=[], plan=[],
        )

    flags: list[Flag] = []
    before = lambda code, customer, studio: flags.append(Flag("before_wear", code, customer, studio))  # noqa: E731
    note = lambda code, studio: flags.append(Flag("note", code, "", studio))  # noqa: E731

    if answers.get("adult") == "no":
        before("minor", "You are under 18, so your feet are still growing. Show the insole to a foot doctor before you wear it.",
               "Under 18 (guardian confirmed). Clinician before any wear.")
    if "arthritis" in conditions:
        before("arthritis", "Because of your arthritis, a foot doctor should say yes before you wear the insole.",
               "Inflammatory arthritis. Clinician before any wear.")
    if "recent_injury" in conditions:
        before("recent_injury", "You hurt your foot or ankle recently, so ask your doctor before you wear the insole.",
               "Foot/ankle surgery, fracture or bad sprain in the last 12 months. Clinician before any wear.")
    if answers.get("pain") == "regular":
        before("pain", "Something hurts often, or is getting worse. Please see a doctor about it. An insole is not a cure for pain.",
               f"Regular or worsening pain ({join_words(answers.get('pain_where', []))}). Clinician before any wear.")
    elif answers.get("pain") == "occasional":
        note("pain_occasional", f"Occasional mild pain: {join_words(answers.get('pain_where', []))}.")
    if answers.get("tiptoe") == "stays_flat":
        before("rigid_arch", "Your foot stayed flat on tiptoes. A foot doctor should look at that before you wear an insole.",
               "Self-check: arch stays flat on tiptoe (possible rigid flat foot, unconfirmed). Clinician before any wear.")
    elif answers.get("tiptoe") == "appears":
        note("tiptoe_arch", "Self-check: arch appears on tiptoe (consistent with a flexible flat foot, unconfirmed). "
                            "Seated vs standing scans will measure it.")
    if answers.get("arch_change") == "yes":
        before("arch_change", "A foot that has got flatter lately should be checked by a foot doctor first.",
               "One foot flattened recently (can indicate a tendon problem). Clinician before any wear.")
    if answers.get("current_insoles") == "prescribed":
        before("prescribed", "You already have insoles from a foot doctor. Ask them before you swap to this one.",
               "Already has prescribed orthotics. Their clinician must agree before any wear.")
    if answers.get("removable_insole") == "no":
        note("fixed_insole", "Shoe's insole doesn't come out: added insole may make the shoe too tight.")

    # Scan plan: every foot gets a seated scan (the main shape). A standing
    # scan is added when how the foot changes under load matters.
    arch, use = answers.get("arch"), answers.get("use")
    standing_why = None
    if arch in ("flat", "unsure"):
        standing_why = "Shows how much your arch drops when you put weight on it."
    elif arch == "high":
        standing_why = "Shows how your high arch takes your weight."
    elif use == "sport":
        standing_why = "Sport loads your feet far more than sitting, so we also look at your foot under full weight."

    ordered = [f for f in ("right", "left") if f in feet]
    plan = [dict(key=f"{f}-swb", foot=f, condition="swb", label=f"{f.capitalize()} foot · seated",
                 why="The main shape for your insole.") for f in ordered]
    if standing_why:
        plan += [dict(key=f"{f}-fwb", foot=f, condition="fwb", label=f"{f.capitalize()} foot · standing",
                      why=standing_why) for f in ordered]
    return dict(blocked=None, flags=[fl.as_dict() for fl in flags], plan=plan)


def join_words(items) -> str:
    items = list(items)
    if not items:
        return "location not given"
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]
