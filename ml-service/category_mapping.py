"""
Maps YAMNet's 521 AudioSet classes to Project E-Noise's five categories.

The mapping is explicit: exact class display names plus two index ranges
of the class map (Singing 24-31 and Music 132-276). No keyword matching.
verify_class_map() checks the loaded class map against the expected
boundary names so a different model version can't silently shift indexes.

Only three categories can become a violation on the server
(server/src/data/constants.js VIOLATION_CATEGORIES): Loud Conversation,
Mobile Phone Noise and Music. Impact Noise and Ambient Baseline are never
violations; the split between those two only matters for the review UI.

Hand-authored, not trained. Confidence thresholds live on the server
(MIN_CONFIDENCE) and are placeholders until tuned with study-hub recordings.
"""

CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Music", "Impact Noise", "Ambient Baseline"]

# Index ranges in yamnet_class_map.csv (inclusive). Verified on the TF Hub
# model (google/yamnet/1): 23 Sigh | 24 Singing ... 31 Rapping | 32 Humming
# and 131 Whale vocalization | 132 Music ... 276 Scary music | 277 Wind.
SINGING_RANGE = (24, 31)
MUSIC_RANGE = (132, 276)

# Names that must sit at these indexes; anything else means a different
# class map and the ranges above would be wrong.
_EXPECTED_AT_INDEX = {
    0: "Speech",
    23: "Sigh",
    24: "Singing",
    31: "Rapping",
    32: "Humming",
    131: "Whale vocalization",
    132: "Music",
    276: "Scary music",
    277: "Wind",
}
EXPECTED_CLASS_COUNT = 521

LOUD_CONVERSATION = {
    "Speech", "Child speech, kid speaking", "Conversation", "Narration, monologue", "Babbling",
    "Speech synthesizer",
    "Shout", "Bellow", "Whoop", "Yell", "Children shouting", "Screaming",
    "Laughter", "Baby laughter", "Giggle", "Snicker", "Belly laugh", "Chuckle, chortle",
    "Cheering", "Chatter", "Crowd", "Hubbub, speech noise, speech babble", "Children playing",
}
# Deliberately NOT Loud Conversation: "Crying, sobbing", "Baby cry, infant cry",
# "Whimper", "Wail, moan", "Whispering", "Sigh", "Groan", "Grunt", "Applause".

MOBILE_PHONE = {
    "Telephone", "Telephone bell ringing", "Ringtone", "Telephone dialing, DTMF", "Dial tone", "Busy signal",
}
# Deliberately NOT phone: "Vibration", "Doorbell", "Ding-dong", "Water tap, faucet",
# "Engine knocking", "Alarm", "Alarm clock", "Beep, bleep", "Buzzer".

# Classes inside the Music range that are not music. Bells and chimes read
# as ambient; rattling, scratching and tapping as impact.
MUSIC_RANGE_EXCLUDED_AMBIENT = {
    "Bell", "Church bell", "Jingle bell", "Bicycle bell", "Tuning fork", "Chime", "Wind chime",
    "Change ringing (campanology)",
}
MUSIC_RANGE_EXCLUDED_IMPACT = {
    "Tapping (guitar technique)", "Rattle (instrument)", "Scratching (performance technique)",
}

IMPACT = {
    "Door", "Sliding door", "Slam", "Knock", "Tap",
    "Cupboard open or close", "Drawer open or close", "Dishes, pots, and pans", "Cutlery, silverware",
    "Chopping (food)", "Coin (dropping)", "Hammer",
    "Explosion", "Gunshot, gunfire", "Burst, pop", "Boom",
    "Wood", "Chop", "Glass", "Chink, clink", "Shatter",
    "Thump, thud", "Thunk", "Bang", "Slap, smack", "Whack, thwack", "Smash, crash", "Breaking",
    "Clang", "Clatter", "Scrape",
} | MUSIC_RANGE_EXCLUDED_IMPACT

# Everything else (typing, coughing, air conditioning, traffic, footsteps,
# vibration, alarms, wind, silence, ...) is Ambient Baseline.


def verify_class_map(class_names) -> None:
    """Raises ValueError if the class map is not the one the ranges assume."""
    if len(class_names) != EXPECTED_CLASS_COUNT:
        raise ValueError(f"YAMNet class map has {len(class_names)} classes, expected {EXPECTED_CLASS_COUNT}.")
    for index, expected in _EXPECTED_AT_INDEX.items():
        if class_names[index] != expected:
            raise ValueError(f"YAMNet class map mismatch at index {index}: got {class_names[index]!r}, expected {expected!r}.")


def _in_range(index: int, bounds) -> bool:
    return bounds[0] <= index <= bounds[1]


def bucket_for_class(index: int, class_name: str) -> str:
    """Returns one of CATEGORIES for a YAMNet class (index + display name)."""
    if class_name in LOUD_CONVERSATION:
        return "Loud Conversation"
    if class_name in MOBILE_PHONE:
        return "Mobile Phone Noise"
    if class_name in IMPACT:
        return "Impact Noise"
    if _in_range(index, SINGING_RANGE) or _in_range(index, MUSIC_RANGE):
        if class_name in MUSIC_RANGE_EXCLUDED_AMBIENT:
            return "Ambient Baseline"
        return "Music"
    return "Ambient Baseline"


def build_class_index_to_bucket(class_names) -> list[str]:
    """
    Precomputes the bucket for every entry in YAMNet's class list (indexed
    the same way as the model's output scores). Verifies the map first.
    """
    verify_class_map(class_names)
    return [bucket_for_class(index, name) for index, name in enumerate(class_names)]


def print_boundaries(class_names) -> None:
    """Prints the names around each range boundary (for a manual check)."""
    for bounds, label in ((SINGING_RANGE, "Singing"), (MUSIC_RANGE, "Music")):
        lo, hi = bounds
        print(f"{label} range {lo}-{hi}:")
        for index in (lo - 1, lo, hi, hi + 1):
            marker = "in " if lo <= index <= hi else "out"
            print(f"  [{marker}] {index:3d} {class_names[index]}")


if __name__ == "__main__":
    import csv
    import os
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "tests", "yamnet_class_map.csv")
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        names = [row[2] for row in reader]
    print_boundaries(names)
    buckets = build_class_index_to_bucket(names)
    for category in CATEGORIES:
        print(f"{category}: {buckets.count(category)} classes")
