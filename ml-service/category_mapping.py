"""
Maps YAMNet's 521 pretrained AudioSet class names down to Project E-Noise's
four categories, by keyword matching on the class display name.

This is a prototype-stage, hand-authored mapping — not a trained
classifier. See ml-service/README.md's "Fine-tuning later" section for the
intended upgrade path once labeled study-hub audio exists.

Keyword lists are intentionally conservative (specific words, not broad
guesses) — a class that matches nothing falls through to Ambient Baseline,
which is the safest default for a noise-monitoring dashboard (silence,
generic room tone, HVAC hum, and anything unrecognized all read as
"nothing noteworthy happening" rather than being force-fit into one of the
three more alarming categories).
"""

CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Impact Noise", "Ambient Baseline"]

_KEYWORDS = {
    "Loud Conversation": [
        "speech", "conversation", "narration", "monologue", "babbl", "chatter",
        "crowd", "hubbub", "shout", "yell", "children shouting", "children playing",
        "laughter", "crying", "babble", "argument", "talk"
    ],
    "Mobile Phone Noise": [
        "telephone", "ringtone", "cellphone", "cell phone", "mobile phone",
        "dial tone", "busy signal", "vibrat"
    ],
    "Impact Noise": [
        "bang", "slam", "knock", "tap", "thump", "thud", "clatter", "crash",
        "breaking", "chop", "smash", "bump", "clang", "clink", "door",
        "wood", "gunshot", "explosion"
    ]
    # Ambient Baseline has no keyword list — it's the catch-all default.
}


def bucket_for_class_name(class_name: str) -> str:
    """Returns one of CATEGORIES for a single YAMNet class display name."""
    lowered = class_name.lower()
    for category, keywords in _KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return category
    return "Ambient Baseline"


def build_class_index_to_bucket(class_names: list[str]) -> list[str]:
    """
    Precomputes the bucket for every entry in YAMNet's class list (indexed
    the same way as the model's output scores), so per-request scoring
    doesn't repeat the keyword matching for all 521 classes every time.
    """
    return [bucket_for_class_name(name) for name in class_names]
