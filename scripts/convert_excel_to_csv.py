import pandas as pd
import csv
import re
from pathlib import Path
import os

SCRIPT_DIR = Path(__file__).resolve().parent

INPUT_FILE_ENV = os.environ.get("INPUT_XLSX", "").strip()
OUTPUT_FILE_ENV = os.environ.get("OUTPUT_CSV", "").strip()

if INPUT_FILE_ENV:
    INPUT_FILE = Path(INPUT_FILE_ENV)
else:
    EXCEL_FILES = [
        file for file in SCRIPT_DIR.glob("*.xlsx")
        if not file.name.startswith("~$")
    ]

    if len(EXCEL_FILES) == 0:
        raise FileNotFoundError(f"找不到 xlsx 檔案，請確認資料夾內有 .xlsx：{SCRIPT_DIR}")

    if len(EXCEL_FILES) > 1:
        file_list = "\n".join(f"- {file.name}" for file in EXCEL_FILES)
        raise ValueError(
            "同一個資料夾內找到多個 xlsx，請只保留一個要轉換的檔案：\n"
            f"{file_list}"
        )

    INPUT_FILE = EXCEL_FILES[0]

if OUTPUT_FILE_ENV:
    OUTPUT_FILE = Path(OUTPUT_FILE_ENV)
else:
    OUTPUT_FILE = INPUT_FILE.with_suffix(".csv")

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

OUTPUT_COLUMNS = [
    "type",
    "CM",
    "LINE名稱",
    "活動1總分",
    "活動2總分",
    "活動3總分",
    "一週總分",
    "距離合格分數",
    "距離長老分數",
    "狀態",
    "活動1貢獻度",
    "活動2貢獻度",
    "活動3貢獻度",
    "整週貢獻度",
]


def clean_text(value):
    """
    清理一般文字欄位。
    注意：這個函式只去掉前後空白，不移除中間空白。
    例如 LINE 名稱 Polly Chan 會被保留。
    """
    if pd.isna(value):
        return ""

    return str(value).strip()


def clean_column_name(value):
    """
    清理 Excel 表頭欄位名稱。

    主要處理：
    - 儲存格內換行，例如「活動1\\n小計」變成「活動1小計」
    - 多餘空白
    - Tab
    - Unnamed 欄位
    """
    if pd.isna(value):
        return ""

    text = str(value).strip()

    if text.lower().startswith("unnamed"):
        return ""

    text = re.sub(r"\s+", "", text)

    return text


def format_number_like_excel(value):
    """
    將 Excel 數字轉成含千分位的字串。
    若本來就是文字，例如 PASS、隊長，則保留原樣。
    """
    if pd.isna(value):
        return ""

    text = str(value).strip()

    if text == "":
        return ""

    if "," in text:
        return text

    try:
        number = float(text)

        if number.is_integer():
            return f"{int(number):,}"

        return str(number)

    except ValueError:
        return text


def format_score(value, default="0"):
    """
    分數欄位專用格式化。
    空白時補 0。
    """
    formatted_value = format_number_like_excel(value)

    if formatted_value == "":
        return default

    return formatted_value


def format_percent_like_excel(value):
    """
    將貢獻度格式化成百分比字串。

    支援：
    - Excel 實際值 0.1027 -> 10.27%
    - 已經是字串 10.27% -> 保留成 10.27%
    - 空白 -> 空白
    """
    if pd.isna(value):
        return ""

    text = str(value).strip()

    if text == "":
        return ""

    if text.endswith("%"):
        return text

    try:
        number = float(text)

        # Excel 百分比通常會讀成 0.1027 這種小數
        if abs(number) <= 1:
            return f"{number * 100:.2f}%"

        # 若來源已經是 10.27 這種數字，視為百分比數值
        return f"{number:.2f}%"

    except ValueError:
        return text


def normalize_columns(df):
    """
    清理欄位名稱。

    例如：
    - 活動1\\n投入 -> 活動1投入
    - 活動1\\n小計 -> 活動1小計
    - 整週\\n貢獻度 -> 整週貢獻度
    """
    normalized_columns = []

    for col in df.columns:
        col_text = clean_column_name(col)
        normalized_columns.append(col_text)

    df.columns = normalized_columns
    return df


def find_header_row(raw_df):
    """
    自動尋找表頭列。
    避免 Excel 前方有空白列或標題列時讀取錯誤。
    """
    for idx, row in raw_df.iterrows():
        values = [clean_column_name(value) for value in row.tolist()]

        has_cm = "CM" in values
        has_line_name = "LINE名稱" in values
        has_week_total = "一週總分" in values

        has_activity_1 = (
            "活動1小計" in values
            or "活動1小記" in values
            or "活動1總分" in values
            or "活動1投分" in values
        )

        if has_cm and has_line_name and has_activity_1 and has_week_total:
            return idx

    raise ValueError(
        "找不到表頭列。請確認 Excel 內至少有：CM、LINE名稱、活動1小計/活動1小記、一週總分"
    )


def read_excel_auto(input_file):
    """
    自動讀取 Excel。
    - 若表頭在第一列，可以正常讀。
    - 若表頭前面有空白列，也會自動尋找表頭。
    - 工作表不指定，直接讀第一個 sheet。
    """
    excel_file = pd.ExcelFile(input_file)
    sheet_name = excel_file.sheet_names[0]

    print(f"讀取工作表：{sheet_name}")

    raw_df = pd.read_excel(
        input_file,
        sheet_name=sheet_name,
        header=None,
        dtype=object
    )

    header_row = find_header_row(raw_df)

    df = pd.read_excel(
        input_file,
        sheet_name=sheet_name,
        header=header_row,
        dtype=object
    )

    df = normalize_columns(df)
    df = df.dropna(how="all")

    print(f"偵測到表頭列：第 {header_row + 1} 列")
    print(f"目前讀到的欄位：{list(df.columns)}")

    return df


def find_column(df, possible_names):
    """
    從多個可能欄位名稱中找出第一個存在的欄位。
    """
    for name in possible_names:
        if name in df.columns:
            return name

    return None


def find_activity_columns(df):
    """
    找出活動分數欄位。

    來源欄位支援：
    - 活動1小計 / 活動1小記
    - 活動2小計 / 活動2小記
    - 活動3小計 / 活動3小記

    也保留舊格式支援：
    - 活動1總分 / 活動1投分
    - 活動2總分 / 活動2投分
    - 活動3總分 / 活動3投分

    輸出一律仍會是：
    - 活動1總分
    - 活動2總分
    - 活動3總分
    """
    activity1_col = find_column(df, [
        "活動1小計",
        "活動1小記",
        "活動1總分",
        "活動1投分",
    ])

    activity2_col = find_column(df, [
        "活動2小計",
        "活動2小記",
        "活動2總分",
        "活動2投分",
    ])

    activity3_col = find_column(df, [
        "活動3小計",
        "活動3小記",
        "活動3總分",
        "活動3投分",
    ])

    return activity1_col, activity2_col, activity3_col


def find_distance_columns(df):
    """
    找出「距離合格分數」與「距離長老分數」欄位。
    """
    columns = list(df.columns)

    qualify_col = find_column(df, [
        "距離合格分數",
        "距離合格",
    ])

    elder_col = find_column(df, [
        "距離長老分數",
        "距離長老",
    ])

    if "距離合格" in columns:
        idx = columns.index("距離合格")

        for col in columns[idx + 1:]:
            col_text = clean_column_name(col)

            if col_text == "分數" or col_text.startswith("分數."):
                qualify_col = col
                break

    if "距離長老" in columns:
        idx = columns.index("距離長老")

        for col in columns[idx + 1:]:
            col_text = clean_column_name(col)

            if col_text == "分數" or col_text.startswith("分數."):
                elder_col = col
                break

    return qualify_col, elder_col


def find_contribution_columns(df):
    """
    找出貢獻度欄位。

    支援目前新版欄位：
    - 活動1貢獻度
    - 活動2貢獻度
    - 活動3貢獻度
    - 整週貢獻度

    也支援可能的替代名稱：
    - 一週貢獻度
    - 週貢獻度
    """
    activity1_contribution_col = find_column(df, [
        "活動1貢獻度",
        "活動1貢獻",
    ])

    activity2_contribution_col = find_column(df, [
        "活動2貢獻度",
        "活動2貢獻",
    ])

    activity3_contribution_col = find_column(df, [
        "活動3貢獻度",
        "活動3貢獻",
    ])

    weekly_contribution_col = find_column(df, [
        "整週貢獻度",
        "一週貢獻度",
        "週貢獻度",
    ])

    return (
        activity1_contribution_col,
        activity2_contribution_col,
        activity3_contribution_col,
        weekly_contribution_col,
    )


def is_return_section_row(row):
    """
    判斷是否為【回歸帳號】分隔列。
    因為 Excel 可能有合併儲存格，所以檢查整列。
    """
    for value in row.tolist():
        if clean_text(value) == "【回歸帳號】":
            return True

    return False


def is_empty_or_skip_row(row):
    """
    過濾不需要輸出的列。
    """
    cm = clean_text(row.get("CM", ""))
    line_name = clean_text(row.get("LINE名稱", ""))

    if cm == "" and line_name == "":
        return True

    # 舊版低標列相容：雖然現在已移除，但保留防呆
    if cm in {
        "低標",
        "請輸入各活動投分低標→",
        "請輸入各活動總分低標→",
        "請輸入各活動投入低標→",
    }:
        return True

    if line_name in {
        "請輸入各活動投分低標→",
        "請輸入各活動總分低標→",
        "請輸入各活動投入低標→",
    }:
        return True

    if cm == "0":
        return True

    return False


def make_return_section_row():
    """
    建立【回歸帳號】區段列。
    """
    return {
        "type": "section",
        "CM": "【回歸帳號】",
        "LINE名稱": "",
        "活動1總分": "",
        "活動2總分": "",
        "活動3總分": "",
        "一週總分": "",
        "距離合格分數": "",
        "距離長老分數": "",
        "狀態": "",
        "活動1貢獻度": "",
        "活動2貢獻度": "",
        "活動3貢獻度": "",
        "整週貢獻度": "",
    }


def main():
    input_path = Path(INPUT_FILE)

    if not input_path.exists():
        raise FileNotFoundError(f"找不到檔案：{INPUT_FILE}")

    print(f"讀取 Excel：{input_path.name}")

    df = read_excel_auto(input_path)

    activity1_col, activity2_col, activity3_col = find_activity_columns(df)
    qualify_distance_col, elder_distance_col = find_distance_columns(df)

    (
        activity1_contribution_col,
        activity2_contribution_col,
        activity3_contribution_col,
        weekly_contribution_col,
    ) = find_contribution_columns(df)

    required_columns = [
        "CM",
        "LINE名稱",
        "一週總分",
        "狀態",
    ]

    missing = [col for col in required_columns if col not in df.columns]

    if activity1_col is None:
        missing.append("活動1小計 / 活動1小記")

    if activity2_col is None:
        missing.append("活動2小計 / 活動2小記")

    # 活動3可有可無，沒有就補 0，所以不列為必要欄位
    # 貢獻度欄位也可有可無，沒有就輸出空白，方便相容舊週表

    if missing:
        raise ValueError(
            "Excel 缺少必要欄位："
            f"{missing}\n"
            f"目前讀到的欄位：{list(df.columns)}"
        )

    print(f"活動1來源欄位：{activity1_col}")
    print(f"活動2來源欄位：{activity2_col}")
    print(f"活動3來源欄位：{activity3_col if activity3_col else '未找到，將補 0'}")

    print(f"活動1貢獻度欄位：{activity1_contribution_col if activity1_contribution_col else '未找到，將輸出空白'}")
    print(f"活動2貢獻度欄位：{activity2_contribution_col if activity2_contribution_col else '未找到，將輸出空白'}")
    print(f"活動3貢獻度欄位：{activity3_contribution_col if activity3_contribution_col else '未找到，將輸出空白'}")
    print(f"整週貢獻度欄位：{weekly_contribution_col if weekly_contribution_col else '未找到，將輸出空白'}")

    output_rows = []
    inserted_return_section = False

    for _, row in df.iterrows():

        if is_return_section_row(row):
            output_rows.append(make_return_section_row())
            inserted_return_section = True
            continue

        if is_empty_or_skip_row(row):
            continue

        cm = clean_text(row.get("CM", ""))
        line_name = clean_text(row.get("LINE名稱", ""))
        status = clean_text(row.get("狀態", ""))

        if cm == "總計":
            row_type = "total"
        else:
            row_type = "person"

        if status == "回歸" and not inserted_return_section:
            output_rows.append(make_return_section_row())
            inserted_return_section = True

        activity1_score = format_score(row.get(activity1_col), default="0")
        activity2_score = format_score(row.get(activity2_col), default="0")

        if activity3_col:
            activity3_score = format_score(row.get(activity3_col), default="0")
        else:
            activity3_score = "0"

        qualify_distance = ""
        elder_distance = ""

        if qualify_distance_col:
            qualify_distance = format_number_like_excel(
                row.get(qualify_distance_col)
            )

        if elder_distance_col:
            elder_distance = format_number_like_excel(
                row.get(elder_distance_col)
            )

        activity1_contribution = ""
        activity2_contribution = ""
        activity3_contribution = ""
        weekly_contribution = ""

        if activity1_contribution_col:
            activity1_contribution = format_percent_like_excel(
                row.get(activity1_contribution_col)
            )

        if activity2_contribution_col:
            activity2_contribution = format_percent_like_excel(
                row.get(activity2_contribution_col)
            )

        if activity3_contribution_col:
            activity3_contribution = format_percent_like_excel(
                row.get(activity3_contribution_col)
            )

        if weekly_contribution_col:
            weekly_contribution = format_percent_like_excel(
                row.get(weekly_contribution_col)
            )

        output_rows.append({
            "type": row_type,
            "CM": cm,
            "LINE名稱": line_name,
            "活動1總分": activity1_score,
            "活動2總分": activity2_score,
            "活動3總分": activity3_score,
            "一週總分": format_number_like_excel(row.get("一週總分")),
            "距離合格分數": "" if row_type == "total" else qualify_distance,
            "距離長老分數": "" if row_type == "total" else elder_distance,
            "狀態": "" if row_type == "total" else status,
            "活動1貢獻度": activity1_contribution,
            "活動2貢獻度": activity2_contribution,
            "活動3貢獻度": activity3_contribution,
            "整週貢獻度": weekly_contribution,
        })

    output_df = pd.DataFrame(output_rows, columns=OUTPUT_COLUMNS)

    output_df.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
        quoting=csv.QUOTE_MINIMAL
    )

    print(f"轉換完成：{OUTPUT_FILE.name}")


if __name__ == "__main__":
    main()
