"""週別計算的單元測試：python -m unittest discover -s tests"""

import sys
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from week_utils import (  # noqa: E402
    get_start_date_from_week_id,
    get_week_id_from_date,
    get_week_start_from_date,
    is_valid_week_id,
    parse_week_id,
    resolve_auto_week_id,
)

TPE = ZoneInfo("Asia/Taipei")


class WeekIdFromDateTest(unittest.TestCase):
    def test_first_monday_starts_week_one(self):
        # 2026-06-01 是星期一
        self.assertEqual(get_week_id_from_date(date(2026, 6, 1)), "2026-06-w1")
        self.assertEqual(get_week_id_from_date(date(2026, 6, 7)), "2026-06-w1")
        self.assertEqual(get_week_id_from_date(date(2026, 6, 8)), "2026-06-w2")

    def test_days_before_first_monday_belong_to_previous_month(self):
        # 2026-11-01 是星期日，屬於 10 月第四週（10/26 開始）
        self.assertEqual(get_week_id_from_date(date(2026, 11, 1)), "2026-10-w4")
        self.assertEqual(get_week_start_from_date(date(2026, 11, 1)), date(2026, 10, 26))

    def test_five_week_month(self):
        # 2026-06 有 5 個星期一（1、8、15、22、29）
        self.assertEqual(get_week_id_from_date(date(2026, 6, 29)), "2026-06-w5")
        self.assertEqual(get_week_id_from_date(date(2026, 7, 5)), "2026-06-w5")

    def test_january_rolls_back_to_previous_december(self):
        # 2027-01-01 是星期五，第一個星期一是 1/4
        self.assertEqual(get_week_id_from_date(date(2027, 1, 1)), "2026-12-w4")
        self.assertEqual(get_week_id_from_date(date(2027, 1, 4)), "2027-01-w1")

    def test_round_trip_with_start_date(self):
        for day in range(1, 32):
            current = date(2026, 12, day)
            week_id = get_week_id_from_date(current)
            self.assertEqual(get_start_date_from_week_id(week_id), get_week_start_from_date(current))


class ParseWeekIdTest(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(parse_week_id("2026-06-w2"), {"year": 2026, "month": 6, "week_index": 2})

    def test_rejects_bad_format_and_trailing_newline(self):
        for value in ["", "2026-6-w2", "2026-06-2", "2026-06-w2\n", " 2026-06-w2", None]:
            with self.subTest(value=value):
                self.assertFalse(is_valid_week_id(value))

    def test_rejects_out_of_range_month_and_week(self):
        for value in ["2026-00-w1", "2026-13-w1", "2026-06-w0", "2026-06-w7", "2026-06-w99"]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    parse_week_id(value)


class ResolveAutoWeekIdTest(unittest.TestCase):
    def resolve(self, *args):
        week_id, fallback, *_ = resolve_auto_week_id(datetime(*args, tzinfo=TPE))
        return week_id, fallback

    def test_before_wednesday_switch_uses_previous_week_without_fallback(self):
        # 2026-11-04（星期三）20:59，當週為 11 月第一週（11/2 開始）
        self.assertEqual(self.resolve(2026, 11, 4, 20, 59), ("2026-10-w4", ""))
        self.assertEqual(self.resolve(2026, 11, 2, 9, 0), ("2026-10-w4", ""))

    def test_after_wednesday_switch_uses_current_week_with_fallback(self):
        self.assertEqual(self.resolve(2026, 11, 4, 21, 0), ("2026-11-w1", "2026-10-w4"))
        self.assertEqual(self.resolve(2026, 11, 8, 23, 59), ("2026-11-w1", "2026-10-w4"))

    def test_sunday_before_first_monday(self):
        # 2026-11-01 星期日：10 月第四週已過切換時間
        self.assertEqual(self.resolve(2026, 11, 1, 12, 0), ("2026-10-w4", "2026-10-w3"))


if __name__ == "__main__":
    unittest.main()
