import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import briefing
from risk_intelligence import build_plan

with open(os.path.join(os.path.dirname(__file__), "..", "sample_sites.json")) as f:
    DATA = json.load(f)


class TestPlan(unittest.TestCase):
    def test_ranking_worst_first(self):
        plan = build_plan(DATA)
        self.assertEqual([s["verdict"] for s in plan["sites_ranked"]], ["NO-GO", "CAUTION", "GO"])

    def test_uncertainty_flagged(self):
        plan = build_plan(DATA)
        self.assertTrue(plan["sites_ranked"][0]["uncertainty"]["uncertain"])
        self.assertFalse(plan["sites_ranked"][2]["uncertainty"]["uncertain"])

    def test_staging_excludes_no_go(self):
        plan = build_plan(DATA)
        self.assertEqual(plan["staging"]["total_mats"], 8)  # NO-GO site excluded
        self.assertEqual(len(plan["staging"]["by_site"]), 2)


class TestBriefing(unittest.TestCase):
    def test_fallback_without_key(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            r = briefing.generate_briefing(DATA)
        self.assertEqual(r["source"], "fallback")
        self.assertIn("DEMO DATA", r["text"])

    def test_invented_number_rejected(self):
        with mock.patch.object(briefing, "_call_gemini", return_value="Bring 99 mats to DEMO Substation Alpha."):
            r = briefing.generate_briefing(DATA)
        self.assertEqual(r["source"], "fallback")
        self.assertIn("99", r["note"])

    def test_grounded_gemini_accepted(self):
        with mock.patch.object(briefing, "_call_gemini", return_value="Demo data. Alpha is NO-GO at 8.2; 8 mats total."):
            r = briefing.generate_briefing(DATA)
        self.assertEqual(r["source"], "gemini")

    def test_gemini_exception_falls_back(self):
        with mock.patch.object(briefing, "_call_gemini", side_effect=RuntimeError("boom")):
            r = briefing.generate_briefing(DATA)
        self.assertEqual(r["source"], "fallback")


class TestLeaks(unittest.TestCase):
    def test_placeholder_rejected(self):
        with mock.patch.object(briefing, "_call_gemini", return_value="Alpha is NO-GO, and N others."):
            r = briefing.generate_briefing(DATA)
        self.assertEqual(r["source"], "fallback")
        self.assertIn("leaked", r["note"])


class TestBigAndWhatIf(unittest.TestCase):
    def test_long_list_is_trimmed(self):
        sites = [dict(DATA["sites"][2], id=f"x{i}", name=f"Site {i}") for i in range(60)]
        r = briefing.generate_briefing({"is_demo": False, "target_date": "2026-10-17", "sites": sites}, use_gemini=False)
        self.assertIn("plus 50 lower-risk sites", r["text"])
        self.assertLess(len(r["text"].splitlines()), 40)

    def test_what_if_banner(self):
        d = dict(DATA, what_if="SIMULATED SCENARIO: 2.0 in of rain")
        r = briefing.generate_briefing(d, use_gemini=False)
        self.assertIn("SIMULATED SCENARIO", r["text"])


if __name__ == "__main__":
    unittest.main()
