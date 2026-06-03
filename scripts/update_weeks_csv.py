import csv
import os
import re
from datetime import date, timedelta
from pathlib import Path


WEEKS_CSV = Path("data/weeks.csv")


def parse_week_id(week_id):
    match = re.match(r"^(\d{4})-(\d{2})-w(\d+)$", week_id)

    if not match:
        raise ValueError(f"WEEK_ID 格式錯誤，應為 yyyy-MM-wN，例如 2026-06-w2，目前是：{week_id}")

    return {
        "year": int(match.group(1)),
        "month": int(match.group(2)),
        "week_index": int(match.group(3)),
    }


def first_monday_of_month(year, month):
    first_day = date(year, month, 1)

    # Python weekday:
    # Monday = 0
    # Sunday = 6
    days_to_monday = (0 - first_day.weekday()) % 7

    return first_day + timedelta(days=days_to_monday)


def get_start_date_from_week_id(week_id):
    parsed = parse_week_id(week_id)
    first_monday = first_monday_of_month(parsed["year"], parsed["month"])

    return first_monday + timedelta(days=(parsed["week_index"] - 1) * 7)


def format_month_day(d):
    return f"{d.month}/{d.day:02d}"


def chinese_week_text(week_index):
    mapping = {
        1: "第一週",
        2: "第二週",
        3: "第三週",
        4: "第四週",
        5: "第五週",
        6: "第六週",
    }

    return mapping.get(week_index, f"第{week_index}週")


def build_label(week_id):
    parsed = parse_week_id(week_id)
    start_date = get_start_date_from_week_id(week_id)
    end_date = start_date + timedelta(days=7)

    return (
        f"{parsed['month']}月{chinese_week_text(parsed['week_index'])}"
        f"｜{format_month_day(start_date)}～{format_month_day(end_date)}"
    )


def read_weeks():
    if not WEEKS_CSV.exists():
        return []

    with WEEKS_CSV.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return list(reader)


def sort_key(row):
    week_id = row.get("id", "")

    try:
        return get_start_date_from_week_id(week_id)
    except Exception:
        return date.min


def write_weeks(rows):
    WEEKS_CSV.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["id", "label", "startDate", "endDate", "file"]

    rows = sorted(rows, key=sort_key, reverse=True)

    with WEEKS_CSV.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()

        for row in rows:
            writer.writerow({
                "id": row.get("id", ""),
                "label": row.get("label", ""),
                "startDate": row.get("startDate", ""),
                "endDate": row.get("endDate", ""),
                "file": row.get("file", ""),
            })


def main():
    week_id = os.environ.get("WEEK_ID", "").strip()

    if not week_id:
        raise ValueError("缺少環境變數 WEEK_ID，例如 2026-06-w2")

    start_date = get_start_date_from_week_id(week_id)
    end_date = start_date + timedelta(days=7)

    new_row = {
        "id": week_id,
        "label": build_label(week_id),
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "file": f"{week_id}.csv",
    }

    rows = read_weeks()

    updated = False

    for index, row in enumerate(rows):
        if row.get("id", "").strip() == week_id:
            rows[index] = new_row
            updated = True
            break

    if not updated:
        rows.append(new_row)

    write_weeks(rows)

    if updated:
        print(f"已更新 weeks.csv 既有週別：{week_id}")
    else:
        print(f"已新增 weeks.csv 新週別：{week_id}")


if __name__ == "__main__":
    main()
