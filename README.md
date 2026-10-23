<p align="center">
  <img src="icons/icon.svg" width="120" alt="隊伍成績總覽 icon" />
</p>

<h1 align="center">Coin999-長長久久 隊伍成績總覽</h1>

<p align="center">
  以月 / 週為單位檢視每位成員的總分、實際投入、未投入分數與貢獻度。<br />
  🔗 <a href="https://der46.github.io/score-dashboard/">der46.github.io/score-dashboard</a>
</p>

---

## 功能

- **月度總覽 / 單週明細**：切換檢視期間，查看全隊統計、前三名頒獎台與成員排行表。
- **篩選、排序、搜尋**：可篩選未投入過半、隊長 / 副隊長、長老、回歸帳號、曾落後五名等成員，切換排序方式，並搜尋 CM / LINE 名稱。
- **成員關注參考**：依未達合格週數、落後名次、最近一週下滑、未投入比例等理由，列出值得關注的成員。
- **成員個人頁**：點選成員可查看月 / 週投入與未投入圖表、排名及歷史週別紀錄。
- **多語系**：繁體中文、English、Tiếng Việt（`i18n.json`）。
- **可安裝為 App**：附 `manifest.webmanifest` 與 App icon，手機可「加入主畫面」。
- **自動同步**：GitHub Actions 每 3 小時從 Google Sheet 抓取當週分數並更新 CSV。

## 專案結構

```
├── index.html                 # 主頁面
├── manifest.webmanifest       # PWA 設定（名稱、主題色、icon）
├── icons/                     # App icon（SVG 原稿 + PNG 輸出）
├── css/styles.css             # 樣式
├── js/
│   ├── app.js                 # 資料載入、計算與畫面渲染
│   └── icons.js               # Lucide 圖示
├── i18n.json                  # 多語系字串
├── data/
│   ├── weeks.csv              # 週別索引（id、標籤、起訖日、檔案路徑）
│   ├── yyyy-MM-wN.csv         # 各週成績
│   └── updated-at.json        # 最後同步時間
├── scripts/
│   ├── download_google_sheet_week.py   # 從 Google Sheet 下載週分頁為 XLSX
│   ├── convert_excel_to_csv.py         # XLSX → 儀表板 CSV
│   └── update_weeks_csv.py             # 更新 weeks.csv 索引
├── tools/backfill-contribution.js      # 回補舊 CSV 的貢獻度欄位
├── ScoreDashboardScript.gs             # Google Sheet 端的 Apps Script（積分工具選單）
└── .github/workflows/
    ├── sync-google-sheet-week.yml      # 排程同步當週
    └── backfill-google-sheet-weeks.yml # 手動回補指定週別
```

## 資料流程

```
Google Sheet（週積分表）
   │  GitHub Actions：download_google_sheet_week.py
   ▼
work/<week>.xlsx
   │  convert_excel_to_csv.py
   ▼
data/<week>.csv  +  data/weeks.csv  +  data/updated-at.json
   │  commit & push
   ▼
GitHub Pages（index.html 讀取 CSV 渲染）
```

週別 ID 格式為 `yyyy-MM-wN`，以每月第一個星期一為第 1 週起點。自動同步在**台灣時間每週三 21:00** 之後才切換到新的一週，在此之前持續同步上一週。

## 自動同步設定

在 GitHub repo 的 **Settings → Secrets and variables → Actions** 加入：

| Secret | 說明 |
| --- | --- |
| `GOOGLE_SPREADSHEET_ID` | 積分表的 Spreadsheet ID |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API 金鑰 |

- **Sync Google Sheet Weekly Score**：每 3 小時自動執行；也可手動執行並指定 `week_id`（例如 `2026-10-w3`）。
- **Backfill Google Sheet Weeks**：手動執行，輸入以逗號分隔的週別，或 `all` 重新同步 `weeks.csv` 內全部週別。

## 本機預覽

頁面以 `fetch` 讀取 CSV，需透過 HTTP 伺服器開啟（直接開 `file://` 會被瀏覽器擋下）：

```bash
python -m http.server 8000
```

然後開啟 <http://localhost:8000>。

### 手動轉換 XLSX

```bash
pip install pandas openpyxl requests
INPUT_XLSX=work/2026-10-w3.xlsx OUTPUT_CSV=data/2026-10-w3.csv python scripts/convert_excel_to_csv.py
WEEK_ID=2026-10-w3 python scripts/update_weeks_csv.py
```

## 分數規則

| 項目 | 規則 |
| --- | --- |
| 合格（PASS） | 單週實際投入 ≥ 200,000 |
| 長老 | 單週實際投入 ≥ 500,000 |
| 實際投入 / 未投入 | 對應週表「投入」/「未投入」欄位 |
| 貢獻度 | 個人分數 ÷ 全隊總分（含回歸帳號） |

門檻設定在 `js/app.js` 的 `CONFIG` 與 `ScoreDashboardScript.gs`，兩邊需保持一致。

## App icon

`icons/icon.svg` 為原稿：深色圓角底（`#1b1b19`）、萊姆色冠軍長條與星芒，呼應儀表板的黑 + 萊姆配色與頒獎台。PNG（`icon-192.png`、`icon-512.png`、`apple-touch-icon.png`）由 SVG 輸出，修改 SVG 後請一併重新輸出。

## 授權

圖示使用 [Lucide](https://lucide.dev)（ISC License）。
