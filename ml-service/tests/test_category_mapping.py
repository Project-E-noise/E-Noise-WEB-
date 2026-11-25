"""
Maps every one of YAMNet's 521 classes and checks the buckets.

Run from ml-service/:  python -m unittest discover -s tests -v
The fixture yamnet_class_map.csv is the class map shipped inside the
TF Hub YAMNet model (assets/yamnet_class_map.csv); keep it in sync if the
model version ever changes (verify_class_map() will fail loudly if not).
"""

import csv
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from category_mapping import (  # noqa: E402
    CATEGORIES,
    MUSIC_RANGE,
    SINGING_RANGE,
    build_class_index_to_bucket,
    verify_class_map,
)

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yamnet_class_map.csv")


def load_names():
    with open(FIXTURE, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        return [row[2] for row in reader]


NAMES = load_names()
BUCKETS = build_class_index_to_bucket(NAMES)
BY_NAME = dict(zip(NAMES, BUCKETS))

VIOLATION = {"Loud Conversation", "Mobile Phone Noise", "Music"}


class CategoryList(unittest.TestCase):
    def test_five_categories_in_the_shared_order(self):
        self.assertEqual(CATEGORIES, ["Loud Conversation", "Mobile Phone Noise", "Music", "Impact Noise", "Ambient Baseline"])


class ClassMap(unittest.TestCase):
    def test_all_521_classes_map_to_a_known_category(self):
        self.assertEqual(len(NAMES), 521)
        self.assertEqual(len(BUCKETS), 521)
        self.assertTrue(all(bucket in CATEGORIES for bucket in BUCKETS))

    def test_bucket_counts(self):
        counts = {category: BUCKETS.count(category) for category in CATEGORIES}
        self.assertEqual(counts, {
            "Loud Conversation": 23,
            "Mobile Phone Noise": 6,
            "Music": 142,
            "Impact Noise": 34,
            "Ambient Baseline": 316,
        })
        self.assertEqual(sum(counts.values()), 521)

    def test_index_ranges_match_the_real_class_map(self):
        self.assertEqual(SINGING_RANGE, (24, 31))
        self.assertEqual(MUSIC_RANGE, (132, 276))
        self.assertEqual(NAMES[24], "Singing")
        self.assertEqual(NAMES[31], "Rapping")
        self.assertEqual(NAMES[132], "Music")
        self.assertEqual(NAMES[276], "Scary music")
        verify_class_map(NAMES)  # must not raise

    def test_verify_rejects_a_shifted_class_map(self):
        shifted = ["Silence"] + NAMES[:-1]
        with self.assertRaises(ValueError):
            verify_class_map(shifted)
        with self.assertRaises(ValueError):
            verify_class_map(NAMES[:500])

    def test_range_boundaries(self):
        self.assertEqual(BUCKETS[23], "Ambient Baseline")  # Sigh
        self.assertEqual(BUCKETS[24], "Music")             # Singing
        self.assertEqual(BUCKETS[31], "Music")             # Rapping
        self.assertEqual(BUCKETS[32], "Ambient Baseline")  # Humming
        self.assertEqual(BUCKETS[131], "Ambient Baseline") # Whale vocalization
        self.assertEqual(BUCKETS[132], "Music")            # Music
        self.assertEqual(BUCKETS[276], "Music")            # Scary music
        self.assertEqual(BUCKETS[277], "Ambient Baseline") # Wind


class LoudConversation(unittest.TestCase):
    def test_speech_shouting_and_laughter_variants(self):
        for name in ["Speech", "Conversation", "Shout", "Yell", "Bellow", "Whoop", "Screaming", "Laughter", "Giggle",
                     "Snicker", "Belly laugh", "Chuckle, chortle", "Cheering", "Chatter", "Crowd",
                     "Hubbub, speech noise, speech babble", "Children shouting", "Children playing"]:
            self.assertEqual(BY_NAME[name], "Loud Conversation", name)

    def test_crying_and_quiet_vocal_sounds_are_not_violations(self):
        for name in ["Crying, sobbing", "Baby cry, infant cry", "Whimper", "Wail, moan", "Whispering", "Sigh",
                     "Cough", "Sneeze", "Throat clearing", "Humming", "Whistling"]:
            self.assertNotIn(BY_NAME[name], VIOLATION, name)


class MobilePhone(unittest.TestCase):
    def test_phone_sounds(self):
        for name in ["Telephone", "Telephone bell ringing", "Ringtone", "Telephone dialing, DTMF", "Dial tone", "Busy signal"]:
            self.assertEqual(BY_NAME[name], "Mobile Phone Noise", name)

    def test_lookalikes_are_not_phone(self):
        for name in ["Vibration", "Doorbell", "Water tap, faucet", "Engine knocking", "Alarm clock", "Beep, bleep", "Buzzer"]:
            self.assertNotEqual(BY_NAME[name], "Mobile Phone Noise", name)
            self.assertNotIn(BY_NAME[name], VIOLATION, name)


class Music(unittest.TestCase):
    def test_music_and_singing(self):
        for name in ["Singing", "Choir", "Rapping", "Music", "Guitar", "Piano", "Drum", "Pop music", "Scary music", "Background music"]:
            self.assertEqual(BY_NAME[name], "Music", name)

    def test_non_music_sounds_inside_the_music_range(self):
        for name in ["Bell", "Church bell", "Jingle bell", "Bicycle bell", "Chime", "Wind chime",
                     "Change ringing (campanology)", "Tuning fork"]:
            self.assertEqual(BY_NAME[name], "Ambient Baseline", name)
        for name in ["Rattle (instrument)", "Scratching (performance technique)", "Tapping (guitar technique)"]:
            self.assertEqual(BY_NAME[name], "Impact Noise", name)

    def test_rattle_outside_the_range_is_not_music(self):
        self.assertNotEqual(BY_NAME["Rattle"], "Music")


class KnownStudyHubSounds(unittest.TestCase):
    def test_everyday_noises_are_never_violations(self):
        for name in ["Cough", "Typing", "Computer keyboard", "Air conditioning", "Mechanical fan", "Door", "Slam",
                     "Traffic noise, roadway noise", "Scrape", "Walk, footsteps", "Chewing, mastication", "Knock",
                     "Cupboard open or close", "Dishes, pots, and pans", "Printer", "Vacuum cleaner", "Wind", "Rain"]:
            self.assertNotIn(BY_NAME[name], VIOLATION, name)

    def test_impacts(self):
        for name in ["Door", "Slam", "Knock", "Tap", "Bang", "Thump, thud", "Smash, crash", "Breaking", "Glass",
                     "Dishes, pots, and pans", "Cutlery, silverware", "Scrape", "Clatter", "Drawer open or close"]:
            self.assertEqual(BY_NAME[name], "Impact Noise", name)

    def test_ambient(self):
        for name in ["Cough", "Typing", "Air conditioning", "Traffic noise, roadway noise", "Silence", "Vibration",
                     "Doorbell", "Water tap, faucet", "Engine knocking", "White noise"]:
            self.assertEqual(BY_NAME[name], "Ambient Baseline", name)


if __name__ == "__main__":
    unittest.main()
