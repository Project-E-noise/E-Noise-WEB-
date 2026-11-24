"""model_cache.broken_cache_dir: only an incomplete model folder inside the TF Hub cache is ever returned."""
import os
import tempfile
import unittest

from model_cache import broken_cache_dir


def tf_error(path):
    return f"Trying to load a model of incompatible/unknown type. '{path}' contains neither 'saved_model.pb' nor 'saved_model.pbtxt'."


class BrokenCacheDirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self.tmp.name, "tfhub_modules")
        self.model = os.path.join(self.root, "9616fd04ec2360621642ef9455b84f4b668e219e")
        os.makedirs(os.path.join(self.model, "variables"))

    def tearDown(self):
        self.tmp.cleanup()

    def test_incomplete_model_folder_is_found(self):
        self.assertEqual(broken_cache_dir(tf_error(self.model), self.root), os.path.realpath(self.model))

    def test_complete_model_is_left_alone(self):
        open(os.path.join(self.model, "saved_model.pb"), "wb").close()
        self.assertIsNone(broken_cache_dir(tf_error(self.model), self.root))

    def test_folder_outside_the_cache_is_never_returned(self):
        outside = os.path.join(self.tmp.name, "important")
        os.makedirs(outside)
        self.assertIsNone(broken_cache_dir(tf_error(outside), self.root))
        self.assertIsNone(broken_cache_dir(tf_error(self.root), self.root))

    def test_other_errors_are_not_treated_as_a_broken_cache(self):
        self.assertIsNone(broken_cache_dir("ValueError: something else", self.root))


if __name__ == "__main__":
    unittest.main()
