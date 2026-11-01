"""
週別 ID 的共用計算（GitHub Actions、update_weeks_csv.py、下載腳本共用同一份邏輯）。

週別規則：
- 週別 ID 格式為 yyyy-MM-wN，例如 2026-06-w2。
- 每個月的第一週從「該月第一個星期一」開始；
  月初在第一個星期一之前的日子，屬於上個月的最後一週。
- 自動同步在台灣時間每週三 21:00 才切換到當週；在那之前仍同步上一週。
"""

import re
from datetime import date, datetime, time, timedelta


WEEK_ID_PATTERN = re.compile(r"(\d{4})-(\d{2})-w(\d+)")

# 一個月最多跨 5 個星期一，週數上限保留 6 以防萬一。
MAX_WEEK_INDEX = 6

# Python weekday(): Monday=0, Tuesday=1, Wednesday=2
SWITCH_WEEKDAY = 2
SWITCH_TIME = time(21, 0)


def parse_week_id(week_id):
    """解析週別 ID，月份須為 1–12、週數須為 1–6，否則丟出 ValueError。"""
    match = WEEK_ID_PATTERN.fullmatch(str(week_id or ""))

    if not match:
        raise ValueError(f"WEEK_ID 格式錯誤，應為 yyyy-MM-wN，例如 2026-06-w2，目前是：{week_id}")

    year, month, week_index = (int(part) for part in match.groups())

    if not 1 <= month <= 12:
        raise ValueError(f"WEEK_ID 月份錯誤（須為 01–12）：{week_id}")

    if not 1 <= week_index <= MAX_WEEK_INDEX:
        raise ValueError(f"WEEK_ID 週數錯誤（須為 w1–w{MAX_WEEK_INDEX}）：{week_id}")

    return {"year": year, "month": month, "week_index": week_index}


def is_valid_week_id(week_id):
    try:
        parse_week_id(week_id)
    except ValueError:
        return False

    return True


def first_monday_of_month(year, month):
    first_day = date(year, month, 1)
    days_to_monday = (0 - first_day.weekday()) % 7

    return first_day + timedelta(days=days_to_monday)


def _month_of(current_date):
    """回傳 current_date 所屬週別的 (year, month, 該月第一個星期一)。"""
    year, month = current_date.year, current_date.month
    first_monday = first_monday_of_month(year, month)

    if current_date < first_monday:
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
        first_monday = first_monday_of_month(year, month)

    return year, month, first_monday


def get_week_id_from_date(current_date):
    year, month, first_monday = _month_of(current_date)
    week_index = ((current_date - first_monday).days // 7) + 1

    return f"{year:04d}-{month:02d}-w{week_index}"


def get_week_start_from_date(current_date):
    _, _, first_monday = _month_of(current_date)
    week_index = ((current_date - first_monday).days // 7) + 1

    return first_monday + timedelta(days=(week_index - 1) * 7)


def get_start_date_from_week_id(week_id):
    parsed = parse_week_id(week_id)
    first_monday = first_monday_of_month(parsed["year"], parsed["month"])

    return first_monday + timedelta(days=(parsed["week_index"] - 1) * 7)


def resolve_auto_week_id(now):
    """
    依目前時間（需帶時區，台灣時間）決定自動同步的週別。

    回傳 (week_id, fallback_week_id, effective_date, switch_datetime, switch_status)：
    - 週三 21:00 以前：同步上一週，沒有 fallback。
    - 週三 21:00 以後：同步當週；當週分頁還沒準備好時改同步 fallback（上一週）。
    """
    today = now.date()
    current_week_start = get_week_start_from_date(today)

    switch_date = current_week_start + timedelta(days=SWITCH_WEEKDAY)
    switch_datetime = datetime.combine(switch_date, SWITCH_TIME, tzinfo=now.tzinfo)

    previous_week_id = get_week_id_from_date(current_week_start - timedelta(days=1))

    if now < switch_datetime:
        effective_date = current_week_start - timedelta(days=1)
        return previous_week_id, "", effective_date, switch_datetime, "before weekly switch time, use previous week"

    return get_week_id_from_date(today), previous_week_id, today, switch_datetime, "after weekly switch time, use current week"
