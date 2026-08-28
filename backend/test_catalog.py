from pathlib import Path
import unittest

try:
    from .sequences import SEQUENCE_INDEX, build_catalog, get_solution_metadata
except ImportError:  # Allows `python backend/test_catalog.py` too.
    from sequences import SEQUENCE_INDEX, build_catalog, get_solution_metadata


class TacticalCatalogTests(unittest.TestCase):
    def test_every_catalog_video_exists(self):
        videos_dir = Path(__file__).resolve().parent / "videos"
        missing = [name for name in SEQUENCE_INDEX.values() if not (videos_dir / name).is_file()]
        self.assertEqual(missing, [])

    def test_no_unreferenced_tactical_videos(self):
        videos_dir = Path(__file__).resolve().parent / "videos"
        actual = {path.name for path in videos_dir.glob("*.mp4")}
        expected = set(SEQUENCE_INDEX.values())
        self.assertEqual(actual, expected)

    def test_catalog_shape_and_metadata(self):
        catalog = build_catalog()
        self.assertEqual(len(catalog["combos"]), len(SEQUENCE_INDEX))
        self.assertEqual(set(catalog["phases"]), {"build_up", "finishing"})
        for item in catalog["combos"]:
            for field in (
                "scenario_id",
                "phase",
                "own",
                "opp",
                "variant",
                "title",
                "objective",
                "principles",
                "key_actions",
                "risk_notes",
                "coaching_points",
                "profile",
                "video",
            ):
                self.assertIn(field, item)

    def test_known_4231_solution_is_specialised(self):
        item = get_solution_metadata("build_up", "4-3-3", "4-2-3-1", "A")
        self.assertEqual(item["title"], "Goalkeeper + third-man press escape")
        self.assertIn("Goalkeeper as +1", item["principles"])


if __name__ == "__main__":
    unittest.main()
