"""
決定這次同步的週別，輸出給 GitHub Actions 後續步驟使用。

- 有 INPUT_WEEK_ID（手動執行時輸入）就直接使用，不提供 fallback。
- 沒有時依台灣時間與「週三 21:00 切換」規則自動判斷，切換後提供上一週當 fallback。

輸出（寫入 $GITHUB_OUTPUT，本機執行時印在畫面上）：
    week_id=2026-10-w4
    fallback_week_id=2026-10-w3
"""

import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from week_utils import is_valid_week_id, resolve_auto_week_id


def main():
    input_week_id = os.environ.get("INPUT_WEEK_ID", "").strip()
    fallback_week_id = ""

    if input_week_id:
        if not is_valid_week_id(input_week_id):
            raise SystemExit(f"week_id 格式錯誤：{input_week_id}，應為 yyyy-MM-wN，例如 2026-06-w2")

        week_id = input_week_id
        source = "manual input"
    else:
        now = datetime.now(ZoneInfo("Asia/Taipei"))
        week_id, fallback_week_id, effective_date, switch_datetime, switch_status = resolve_auto_week_id(now)

        source = (
            f"auto from Asia/Taipei datetime {now.isoformat()}, "
            f"effective week date {effective_date.isoformat()}, "
            f"weekly switch datetime {switch_datetime.isoformat()}, "
            f"{switch_status}"
        )

    print(f"Resolved WEEK_ID={week_id} fallback={fallback_week_id or '-'} ({source})")

    lines = f"week_id={week_id}\nfallback_week_id={fallback_week_id}\n"
    output_path = os.environ.get("GITHUB_OUTPUT")

    if output_path:
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(lines)
    else:
        sys.stdout.write(lines)


if __name__ == "__main__":
    main()
