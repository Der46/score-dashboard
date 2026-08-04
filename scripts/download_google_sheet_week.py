import os
import re
import time
import requests
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


WEEK_ID_PATTERN = re.compile(r"^\d{4}-\d{2}-w\d+$")

CONNECT_TIMEOUT_SECONDS = 10
READ_TIMEOUT_SECONDS = 120

MIN_XLSX_SIZE_BYTES = 1000


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


def create_retry_session():
    """
    建立帶有 retry 機制的 requests session。

    可改善：
    - Google API 偶發 timeout
    - GitHub Actions runner 暫時網路不穩
    - Google API 短暫回傳 429 / 5xx
    """

    retry_strategy = Retry(
        total=5,
        connect=5,
        read=5,
        status=5,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
        respect_retry_after_header=True,
    )

    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=10,
        pool_maxsize=10,
    )

    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    return session


def get_with_retry(session, url, *, description, timeout=None):
    """
    統一處理 GET request。

    注意：
    urllib3 Retry 會處理部分 connect/read/status retry，
    這裡再補上清楚的錯誤訊息，讓 GitHub Actions log 更容易看。
    """

    request_timeout = timeout or (
        CONNECT_TIMEOUT_SECONDS,
        READ_TIMEOUT_SECONDS,
    )

    try:
        response = session.get(url, timeout=request_timeout)
        return response

    except requests.exceptions.Timeout as exc:
        raise RuntimeError(
            f"{description}逾時。"
            f"connect_timeout={request_timeout[0]} 秒，"
            f"read_timeout={request_timeout[1]} 秒。"
            "這通常是 Google API 或 GitHub Actions 網路暫時不穩，可透過 retry 改善。"
        ) from exc

    except requests.exceptions.RequestException as exc:
        raise RuntimeError(
            f"{description}失敗。"
            "請檢查網路、Google API 狀態、Spreadsheet ID、API key 或權限設定。"
        ) from exc


def fetch_google_sheet_tabs(session, spreadsheet_id, api_key):
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        f"?fields=sheets.properties(sheetId,title,index)"
        f"&key={api_key}"
    )

    print("讀取 Google Sheet 分頁清單...")

    response = get_with_retry(
        session,
        url,
        description="讀取 Google Sheet 分頁清單",
    )

    if response.status_code != 200:
        raise RuntimeError(
            "讀取 Google Sheet 分頁清單失敗，"
            f"HTTP {response.status_code}，"
            f"response={response.text[:1000]}"
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

    print(f"讀取完成，共找到 {len(tabs)} 個分頁")

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
            f"找到多個名稱為 {week_id} 的分頁，"
            "請確認 Google Sheet 分頁名稱沒有重複。"
        )

    gid = matched_tabs[0]["gid"]

    print(f"找到分頁：week_id={week_id}, gid={gid}")

    return gid


def validate_xlsx_file(output_file):
    if not output_file.exists():
        raise RuntimeError(f"下載後找不到檔案：{output_file}")

    file_size = output_file.stat().st_size

    if file_size < MIN_XLSX_SIZE_BYTES:
        raise RuntimeError(
            f"下載的 xlsx 檔案過小，可能不是有效 Excel 檔案。"
            f"file={output_file}, size={file_size} bytes"
        )


def download_sheet_as_xlsx(session, spreadsheet_id, gid, week_id):
    work_dir = Path("work")
    work_dir.mkdir(parents=True, exist_ok=True)

    output_file = work_dir / f"{week_id}.xlsx"
    temp_file = work_dir / f"{week_id}.xlsx.tmp"

    url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        f"/export?format=xlsx&gid={gid}"
    )

    print(f"下載 Google Sheet 分頁：week_id={week_id}, gid={gid}")
    print(f"輸出檔案：{output_file}")

    response = get_with_retry(
        session,
        url,
        description="下載 Google Sheet XLSX",
        timeout=(CONNECT_TIMEOUT_SECONDS, 180),
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"下載 XLSX 失敗，HTTP {response.status_code}，"
            f"response={response.text[:1000]}"
        )

    content_type = response.headers.get("content-type", "")

    if (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        not in content_type
        and "application/octet-stream" not in content_type
    ):
        print(f"警告：回應 content-type 不是典型 xlsx：{content_type}")

    temp_file.write_bytes(response.content)

    validate_xlsx_file(temp_file)

    temp_file.replace(output_file)

    validate_xlsx_file(output_file)

    print(f"下載完成：{output_file}, size={output_file.stat().st_size} bytes")


def main():
    spreadsheet_id = require_env("GOOGLE_SPREADSHEET_ID")
    api_key = require_env("GOOGLE_SHEETS_API_KEY")
    week_id = require_env("WEEK_ID")

    validate_week_id(week_id)

    session = create_retry_session()

    tabs = fetch_google_sheet_tabs(session, spreadsheet_id, api_key)
    gid = find_gid_by_week_id(tabs, week_id)

    download_sheet_as_xlsx(session, spreadsheet_id, gid, week_id)


if __name__ == "__main__":
    main()
