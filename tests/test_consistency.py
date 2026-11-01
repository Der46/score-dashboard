"""
跨檔案的一致性檢查：python -m unittest discover -s tests

- 合格 / 長老門檻在 js/app.js 與 ScoreDashboardScript.gs 各有一份（Apps Script 需另外貼到 Google Sheet，
  無法共用同一個檔案），這裡確保兩邊數字相同。
- service worker 預先快取的檔案都必須存在，否則安裝會失敗。
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


class ThresholdConsistencyTest(unittest.TestCase):
    def test_pass_and_elder_scores_match(self):
        app = read("js/app.js")
        gs = read("ScoreDashboardScript.gs")

        for name in ("PASS_SCORE", "ELDER_SCORE"):
            with self.subTest(name=name):
                app_value = re.search(rf"{name}:\s*(\d+)", app)
                gs_value = re.search(rf"const {name} = (\d+);", gs)

                self.assertIsNotNone(app_value, f"js/app.js 找不到 {name}")
                self.assertIsNotNone(gs_value, f"ScoreDashboardScript.gs 找不到 {name}")
                self.assertEqual(app_value.group(1), gs_value.group(1), f"{name} 兩邊不一致")


class ServiceWorkerPrecacheTest(unittest.TestCase):
    def test_precached_files_exist(self):
        sw = read("sw.js")
        block = re.search(r"PRECACHE_URLS = \[(.*?)\];", sw, re.S)

        self.assertIsNotNone(block)

        for url in re.findall(r'"\./([^"]*)"', block.group(1)):
            if not url:
                continue  # "./" 是網站根目錄（index.html）

            with self.subTest(url=url):
                self.assertTrue((ROOT / url).is_file(), f"sw.js 預先快取的檔案不存在：{url}")


if __name__ == "__main__":
    unittest.main()
