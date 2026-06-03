import os
import re
import requests
from pathlib import Path


WEEK_ID_PATTERN = re.compile(r"^\d{4}-\d{2}-w\d+$")


def require_env(name):
    value = os.environ.get(name, "").strip()

    if not value:
        raise ValueError(f"缺少環境變數 {name}")

    return value


def validate_week_id(week_id):
    if not WEEK_ID_PATTERN.match(week_id):
        raise ValueError(
            f"WEEK_ID 格式錯誤：{week_id}。"
            "正確格式應為 2026-06-w2"
        )


def fetch_google_sheet_tabs(spreadsheet_id, api_key):
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        f"?fields=sheets.properties(sheetId,title,index)"
        f"&key={api_key}"
    )

    response = requests.get(url, timeout=60)

    if response.status_code != 200:
        raise RuntimeError(
            f"讀取 Google Sheet 分頁清單失敗，HTTP {response.status_code}"
        )

    data = response.json()

    tabs = []

    for sheet in data.get("sheets", []):
        properties = sheet.get("properties", {})

        tabs.append({
            "title": str(properties.get("title", "")).strip(),
            "gid": str(properties.get("sheetId", "")).strip(),
            "index": properties.get("index"),
        })

    return tabs


def find_gid_by_week_id(tabs, week_id):
    matched_tabs = [
        tab for tab in tabs
        if tab.get("title") == week_id
    ]

    if len(matched_tabs) == 0:
        available_week_tabs = [
            tab.get("title")
            for tab in tabs
            if WEEK_ID_PATTERN.match(tab.get("title", ""))
        ]

        raise ValueError(
            f"找不到名稱為 {week_id} 的 Google Sheet 分頁。"
            f"目前符合週別格式的分頁有：{available_week_tabs}"
        )

    if len(matched_tabs) > 1:
        raise ValueError(
            f"找到多個名稱為 {week_id} 的分頁，請確認 Google Sheet 分頁名稱沒有重複。"
        )

    return matched_tabs[0]["gid"]


def download_sheet_as_xlsx(spreadsheet_id, gid, week_id):
    work_dir = Path("work")
    work_dir.mkdir(parents=True, exist_ok=True)

    output_file = work_dir / f"{week_id}.xlsx"

    url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        f"/export?format=xlsx&gid={gid}"
    )

    print(f"下載 Google Sheet 分頁：week_id={week_id}")
    print(f"輸出檔案：{output_file}")

    response = requests.get(url, timeout=60)

    if response.status_code != 200:
        raise RuntimeError(f"下載 XLSX 失敗，HTTP {response.status_code}")

    output_file.write_bytes(response.content)

    if output_file.stat().st_size < 1000:
        raise RuntimeError("下載的 xlsx 檔案過小，可能不是有效 Excel 檔案。")

    print("下載完成")


def main():
    spreadsheet_id = require_env("GOOGLE_SPREADSHEET_ID")
    api_key = require_env("GOOGLE_SHEETS_API_KEY")
    week_id = require_env("WEEK_ID")

    validate_week_id(week_id)

    tabs = fetch_google_sheet_tabs(spreadsheet_id, api_key)
    gid = find_gid_by_week_id(tabs, week_id)

    download_sheet_as_xlsx(spreadsheet_id, gid, week_id)


if __name__ == "__main__":
    main()
