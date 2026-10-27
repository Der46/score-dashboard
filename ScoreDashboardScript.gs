/* =====================================================
 * 基本設定
 * ===================================================== */

const PASS_SCORE = 200000;
const ELDER_SCORE = 500000;

const MEMBER_SHEET_NAME = "成員名單";

// 成員名單：一般帳號 A2 起最多 50 列，回歸帳號 A53 起
const MEMBER_FORMAL_FIRST_ROW = 2;
const MEMBER_FORMAL_MAX_COUNT = 50;
const MEMBER_RETURN_FIRST_ROW = 53;

// 週積分表
const SCORE_FORMAL_FIRST_ROW = 2;
const SCORE_TABLE_LAST_COL = 19;   // S
const TOTAL_SCORE_COL = 12;        // L 一週總分
const STATUS_COL = 15;             // O
const CONTRIBUTION_FIRST_COL = 16; // P
const STATUS_COLOR_MAX_ROW = 200;

// 可輸入分數的欄位：C/D、F/G、I/J
const SCORE_INPUT_COLS = [3, 4, 6, 7, 9, 10];

// 各活動「投入」欄位，「未投入」為下一欄
const ACTIVITY_INVESTED_COLS = {
  1: 3,  // C / D
  2: 6,  // F / G
  3: 9   // I / J
};

// 版面資訊 AA:AB
const LAYOUT_INFO_FIRST_COL = 27;
const LAYOUT_INFO_LAST_COL = 28;
const LAYOUT_KEYS = [
  "FormalFirstRow",
  "FormalLastRow",
  "TotalRow",
  "ReturnTitleRow",
  "ReturnFirstRow",
  "ReturnLastRow"
];

const LEADER_ROLES = ["隊長", "副隊長"];
const BORDER_COLOR = "#95B3D7";


/* =====================================================
 * 欄位樣式
 *
 * header            表頭文字
 * width             欄寬
 * headerBackground  表頭底色（未設定用 #4472C4）
 * background        成員列底色（未設定用藍白 / 橘白交錯）
 * fontColor         成員列字色（未設定則不更動）
 * numberFormat      成員列數字格式（未設定則不更動）
 * ===================================================== */

const ACTIVITY_COLUMN_STYLES = [
  { label: "投入", headerBackground: "#1F497D", background: "#C5D9F1", fontColor: "#1F497D", numberFormat: "#,##0" },
  { label: "未投入", headerBackground: "#ED7D31", background: "#FCE4D6", fontColor: "#9C5700", numberFormat: "#,##0" },
  { label: "小計", headerBackground: "#70AD47", background: "#E2EFDA", fontColor: "#006600", numberFormat: "#,##0" }
];

const CONTRIBUTION_COLUMN_STYLE = {
  headerBackground: "#5B9BD5",
  background: "#DDEBF7",
  fontColor: "#1F4E79",
  numberFormat: "0.00%"
};

const SCORE_COLUMNS = [
  { header: "CM", width: 90 },
  { header: "LINE名稱", width: 130 },
  ...[1, 2, 3].flatMap(n =>
    ACTIVITY_COLUMN_STYLES.map(({ label, ...style }) => ({ header: `活動${n}\n${label}`, width: 80, ...style }))
  ),
  { header: "一週總分", width: 90, background: "#FFF2CC", fontColor: "#C00000", numberFormat: "#,##0" },
  { header: "距離合格分數", width: 100, background: "#FFEBDC", fontColor: "#FF6600" },
  { header: "距離長老分數", width: 100, background: "#FFF8C8", fontColor: "#996600" },
  { header: "狀態", width: 80, headerBackground: "#666666" },
  { header: "活動1\n貢獻度", width: 105, ...CONTRIBUTION_COLUMN_STYLE },
  { header: "活動2\n貢獻度", width: 105, ...CONTRIBUTION_COLUMN_STYLE },
  { header: "活動3\n貢獻度", width: 105, ...CONTRIBUTION_COLUMN_STYLE },
  { header: "整週\n貢獻度", width: 110, ...CONTRIBUTION_COLUMN_STYLE }
];

// O 欄狀態條件式格式：文字、底色、字色
const STATUS_COLORS = [
  ["長老", "#FFD966", "#000000"],
  ["PASS", "#93C47D", "#000000"],
  ["淘汰", "#E06666", "#FFFFFF"],
  ["隊長", "#674EA7", "#FFFFFF"],
  ["副隊長", "#8E7CC3", "#FFFFFF"],
  ["回歸", "#76A5AF", "#FFFFFF"],
  ["降級", "#FF8000", "#FFFFFF"]
];


/* =====================================================
 * 建立自訂選單
 * ===================================================== */

function onOpen() {
  SpreadsheetApp
    .getUi()
    .createMenu("積分工具")
    .addItem("建立全新本週積分表", "createWeeklyScoreSheet")
    .addItem("重新排序目前週表", "sortActiveWeeklyScoreSheet")
    .addItem("依指定週數成績排序成員名單", "sortMemberListByInputWeeklyScore")
    .addItem("匯入 OCR 成績 CSV", "importOcrCsvToWeeklySheet")
    .addSeparator()
    .addItem("修正目前週表總計與貢獻度公式（含回歸帳號）", "repairActiveWeeklyContributionFormulas")
    .addItem("修復目前週表 O 欄狀態顏色", "repairActiveWeeklyStatusColors")
    .addItem("檢查目前週表條件式格式範圍", "checkActiveSheetConditionalFormatRanges")
    .addItem("清理暫存週表", "cleanupTempWeeklySheets")
    .addToUi();
}


/* =====================================================
 * 建立本週積分表
 *
 * 選單只負責開啟進度對話框，實際建立由對話框以
 * google.script.run 呼叫 runCreateWeeklyScoreSheet。
 * 直接由選單執行長時間工作時，試算表可能等不到執行結果，
 * 只顯示「指令碼發生錯誤」；改由對話框等待即可正確顯示完成或錯誤。
 * ===================================================== */

function createWeeklyScoreSheet() {
  showTaskDialog_({
    title: "建立全新本週積分表",
    runningText: "正在建立本週積分表，請稍候…\n完成前請不要關閉此視窗。",
    callbackName: "runCreateWeeklyScoreSheet"
  });
}

function runCreateWeeklyScoreSheet() {
  const lock = LockService.getDocumentLock();

  try {
    if (!lock.tryLock(30000)) {
      throw new Error("目前已有積分表建立程序正在執行，請稍後再試。");
    }

    return createWeeklyScoreSheetByDate_(new Date());

  } catch (err) {
    Logger.log(err.stack || err.message || err);

    throw new Error(
      "建立週表失敗：\n\n" +
      (err.message || err) +
      "\n\n請到 Apps Script 左側「執行項目」查看詳細錯誤。"
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      Logger.log("釋放 Lock 失敗：" + (err.message || err));
    }
  }
}


/* =====================================================
 * 建立指定日期週表
 *
 * 只讀取目前成員名單，不讀取上一週、不修改成員名單。
 * 先在暫存表完成所有內容，最後才改成正式名稱。
 * ===================================================== */

function createWeeklyScoreSheetByDate_(targetDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName(MEMBER_SHEET_NAME);

  if (!memberSheet) {
    throw new Error(`找不到「${MEMBER_SHEET_NAME}」工作表。`);
  }

  const sheetName = getWeeklySheetName_(targetDate);
  const formalMembers = readFormalMembers_(memberSheet);
  const returnMembers = readReturnMembers_(memberSheet);

  if (formalMembers.length <= 0) {
    throw new Error("一般帳號名單為空，請確認「成員名單」A2 開始是否有資料。");
  }

  const formalLastRow = SCORE_FORMAL_FIRST_ROW + formalMembers.length - 1;
  const totalRow = formalLastRow + 1;
  const returnTitleRow = totalRow + 2;
  const returnFirstRow = returnTitleRow + 1;

  const layout = {
    FormalFirstRow: SCORE_FORMAL_FIRST_ROW,
    FormalLastRow: formalLastRow,
    TotalRow: totalRow,
    ReturnTitleRow: returnTitleRow,
    ReturnFirstRow: returnFirstRow,
    ReturnLastRow: returnFirstRow + returnMembers.length - 1
  };

  const existingSheet = ss.getSheetByName(sheetName);

  if (existingSheet) {
    runWithRetry_("刪除既有週表", () => {
      ss.deleteSheet(existingSheet);
      SpreadsheetApp.flush();
    }, 3);
  }

  const tempSheetName = `__tmp_${sheetName}_${Date.now()}`;
  const ws = runWithRetry_("建立暫存週表", () => ss.insertSheet(tempSheetName), 3);

  SpreadsheetApp.flush();
  Utilities.sleep(500);

  try {
    runWithRetry_("寫入表頭", () => {
      ws.getRange(1, 1, 1, SCORE_TABLE_LAST_COL).setValues([SCORE_COLUMNS.map(col => col.header)]);
      SpreadsheetApp.flush();
    }, 3);

    storeLayoutInfo_(ws, layout);
    writeScoreRows_(ws, SCORE_FORMAL_FIRST_ROW, formalMembers, false, totalRow);
    writeTotalRow_(ws, layout);
    writeScoreRows_(ws, returnFirstRow, returnMembers, true, totalRow);

    SpreadsheetApp.flush();

    formatScoreSheet_(ws, layout);

    SpreadsheetApp.flush();

    runWithRetry_("暫存表改正式名稱", () => {
      ws.setName(sheetName);
      ss.setActiveSheet(ws);
      SpreadsheetApp.flush();
    }, 3);

    return (
      `全新週積分表建立完成！\n\n` +
      `工作表：${sheetName}\n` +
      `一般帳號：${formalMembers.length} 個\n` +
      `回歸帳號：${returnMembers.length} 個\n\n` +
      `已保留原欄位顏色設定，並新增 P:S 貢獻度欄位。`
    );

  } catch (err) {
    try {
      const tempSheet = ss.getSheetByName(tempSheetName);

      if (tempSheet) {
        runWithRetry_("清理暫存表", () => {
          ss.deleteSheet(tempSheet);
          SpreadsheetApp.flush();
        }, 3);
      }

    } catch (cleanupErr) {
      Logger.log("暫存表清理失敗：" + (cleanupErr.message || cleanupErr));
    }

    throw err;
  }
}


/* =====================================================
 * 寫入週表成員列
 *
 * A CM / B LINE
 * C/D、F/G、I/J 活動投入 / 未投入
 * E、H、K 活動小計
 * L 一週總分
 * M/N 距離合格 / 長老分數（依投入分 C + F + I）
 * O 狀態（隊長 / 副隊長 / 回歸為文字，其餘為公式）
 * P:S 貢獻度（分母為總計列）
 *
 * 公式以 A1 字串透過 setValues 一次寫入。
 * ===================================================== */

function writeScoreRows_(sheet, firstRow, members, isReturnAccount, totalRow) {
  if (members.length <= 0) {
    return;
  }

  const values = members.map((member, index) => {
    const row = firstRow + index;
    const invested = `($C${row}+$F${row}+$I${row})`;
    const distance = target => `=IF(${invested}>=${target},"",TEXT(${target}-${invested},"#,##0"))`;

    const status =
      isReturnAccount ? "回歸" :
      LEADER_ROLES.includes(member.role) ? member.role :
      `=IF(${invested}>=${ELDER_SCORE},"長老",IF(${invested}>=${PASS_SCORE},"PASS","淘汰"))`;

    return [
      member.cm,
      member.line,
      0, 0, `=C${row}+D${row}`,
      0, 0, `=F${row}+G${row}`,
      0, 0, `=I${row}+J${row}`,
      `=E${row}+H${row}+K${row}`,
      distance(PASS_SCORE),
      distance(ELDER_SCORE),
      status,
      ...contributionFormulas_(row, totalRow)
    ];
  });

  sheet.getRange(firstRow, 1, values.length, SCORE_TABLE_LAST_COL).setValues(values);
}


/* =====================================================
 * 貢獻度公式 P:S
 *
 * 個人活動1 / 活動2 / 活動3 小計、一週總分 ÷ 總計列
 * 總計列 = 一般帳號 + 回歸帳號，因此全部成員加總為 100%
 * ===================================================== */

function contributionFormulas_(row, totalRow) {
  return ["E", "H", "K", "L"].map(col =>
    totalRow > 0
      ? `=IF($${col}$${totalRow}=0,"",$${col}${row}/$${col}$${totalRow})`
      : ""
  );
}


/* =====================================================
 * 寫入總計列
 *
 * C:L = 一般帳號區 + 回歸帳號區
 * 回歸帳號的分數也屬於全隊產出，必須算進貢獻度分母。
 * P:S = 該活動總分為 0 時留空，否則 100%
 * ===================================================== */

function writeTotalRow_(sheet, layout) {
  const { TotalRow: totalRow, FormalLastRow: formalLastRow } = layout;
  const returnBlock = getScoreBlocks_(layout).returning;

  const sumFormulas = Array.from({ length: 10 }, (_, i) => {
    const col = columnToLetter_(3 + i);

    return (
      `=SUM(${col}${SCORE_FORMAL_FIRST_ROW}:${col}${formalLastRow})` +
      (returnBlock ? `+SUM(${col}${returnBlock.firstRow}:${col}${returnBlock.lastRow})` : "")
    );
  });

  const contributionTotals = ["E", "H", "K", "L"].map(col => `=IF(${col}${totalRow}=0,"",1)`);

  sheet
    .getRange(totalRow, 1, 1, SCORE_TABLE_LAST_COL)
    .setValues([["總計", "", ...sumFormulas, "", "", "", ...contributionTotals]]);
}


/* =====================================================
 * 版面資訊 AA:AB
 * ===================================================== */

function storeLayoutInfo_(sheet, layout) {
  const maxColumns = sheet.getMaxColumns();

  if (maxColumns < LAYOUT_INFO_LAST_COL) {
    sheet.insertColumnsAfter(maxColumns, LAYOUT_INFO_LAST_COL - maxColumns);
  }

  sheet
    .getRange(1, LAYOUT_INFO_FIRST_COL, LAYOUT_KEYS.length, 2)
    .setValues(LAYOUT_KEYS.map(key => [key, layout[key]]));

  sheet.hideColumns(LAYOUT_INFO_FIRST_COL, 2);
}


/* =====================================================
 * 一次讀取全部版面資訊
 *
 * 回傳：{ FormalFirstRow: 2, FormalLastRow: 51, ... }
 * 找不到的項目為 0；重複項目以第一筆為準。
 * ===================================================== */

function readLayoutInfo_(sheet) {
  const layout = Object.fromEntries(LAYOUT_KEYS.map(key => [key, 0]));

  if (sheet.getMaxColumns() < LAYOUT_INFO_LAST_COL) {
    return layout;
  }

  const seen = {};

  sheet
    .getRange(1, LAYOUT_INFO_FIRST_COL, 20, 2)
    .getValues()
    .forEach(([key, value]) => {
      const name = String(key);

      if (!(name in seen)) {
        seen[name] = Number(value) || 0;
      }
    });

  return { ...layout, ...seen };
}


/* =====================================================
 * 一般 / 回歸帳號區塊
 *
 * 區塊無效（未設定或沒有成員）時為 null
 * ===================================================== */

function getScoreBlocks_(layout) {
  const block = (firstRow, lastRow, isReturn) =>
    firstRow > 0 && lastRow >= firstRow
      ? { firstRow, lastRow, rowCount: lastRow - firstRow + 1, isReturn }
      : null;

  return {
    formal: block(layout.FormalFirstRow, layout.FormalLastRow, false),
    returning: block(layout.ReturnFirstRow, layout.ReturnLastRow, true)
  };
}

function listScoreBlocks_(layout) {
  const { formal, returning } = getScoreBlocks_(layout);
  return [formal, returning].filter(Boolean);
}


/* =====================================================
 * 修正目前週表總計與貢獻度公式
 *
 * 舊版週表的總計只加一般帳號，回歸帳號的貢獻度分母少算了。
 * 依 AA:AB 版面資訊重寫總計列 C:L 與所有成員 P:S 公式。
 * 不會修改任何輸入分數。
 * ===================================================== */

function repairActiveWeeklyContributionFormulas() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getActiveWeeklySheet_();

  if (!sheet) {
    return;
  }

  const layout = readLayoutInfo_(sheet);

  if (!getScoreBlocks_(layout).formal || layout.TotalRow <= 0) {
    ui.alert("找不到週表版面資訊（AA:AB），無法修正。");
    return;
  }

  writeTotalRow_(sheet, layout);

  listScoreBlocks_(layout).forEach(block => {
    sheet
      .getRange(block.firstRow, CONTRIBUTION_FIRST_COL, block.rowCount, 4)
      .setValues(
        Array.from({ length: block.rowCount }, (_, i) =>
          contributionFormulas_(block.firstRow + i, layout.TotalRow)
        )
      );
  });

  SpreadsheetApp.flush();

  reapplyAfterSortStyles_(sheet, layout);

  ui.alert(
    `已修正「${sheet.getName()}」：\n\n` +
    `總計列已包含回歸帳號分數，\n` +
    `全部成員貢獻度加總為 100%。`
  );
}


/* =====================================================
 * 編輯 C/D/F/G/I/J 成員分數後自動排序
 * ===================================================== */

function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  const sheet = e.range.getSheet();

  if (
    !isWeeklyScoreSheetName_(sheet.getName()) ||
    !SCORE_INPUT_COLS.includes(e.range.getColumn())
  ) {
    return;
  }

  const layout = readLayoutInfo_(sheet);
  const row = e.range.getRow();

  const isMemberRow = listScoreBlocks_(layout).some(block =>
    row >= block.firstRow && row <= block.lastRow
  );

  if (!isMemberRow) {
    return;
  }

  SpreadsheetApp.flush();

  sortWeeklyScoreSheet_(sheet, layout);
  reapplyAfterSortStyles_(sheet, layout);
}


/* =====================================================
 * 手動重新排序目前週表
 * ===================================================== */

function sortActiveWeeklyScoreSheet() {
  const sheet = getActiveWeeklySheet_();

  if (!sheet) {
    return;
  }

  const layout = readLayoutInfo_(sheet);

  SpreadsheetApp.flush();

  sortWeeklyScoreSheet_(sheet, layout);
  reapplyAfterSortStyles_(sheet, layout);

  SpreadsheetApp.getUi().alert("目前週表已重新排序。");
}


/* =====================================================
 * 週表排序：各區塊依 L 一週總分由高到低
 * ===================================================== */

function sortWeeklyScoreSheet_(sheet, layout) {
  listScoreBlocks_(layout).forEach(block => {
    sheet
      .getRange(block.firstRow, 1, block.rowCount, SCORE_TABLE_LAST_COL)
      .sort({ column: TOTAL_SCORE_COL, ascending: false });
  });
}


/* =====================================================
 * 取得目前週表；不是週表時提示並回傳 null
 * ===================================================== */

function getActiveWeeklySheet_() {
  const sheet = SpreadsheetApp.getActiveSheet();

  if (!isWeeklyScoreSheetName_(sheet.getName())) {
    SpreadsheetApp.getUi().alert("目前工作表不是週積分表。");
    return null;
  }

  return sheet;
}


/* =====================================================
 * 格式化
 *
 * formatScoreSheet_       新週表：表頭 + 全部格式 + 條件式格式
 * reapplyAfterSortStyles_ 排序後：成員列、總計、回歸標題、邊框
 * ===================================================== */

function formatScoreSheet_(sheet, layout) {
  applyHeaderStyles_(sheet);
  reapplyAfterSortStyles_(sheet, layout);

  try {
    applyStatusConditionalFormatting_(sheet);
  } catch (err) {
    Logger.log("條件式格式建立失敗：" + (err.message || err));
  }

  sheet.setFrozenRows(1);
}

function reapplyAfterSortStyles_(sheet, layout) {
  listScoreBlocks_(layout).forEach(block => applyBlockStyles_(sheet, block));
  applySummaryRowsStyles_(sheet, layout);
  applyBorders_(sheet, layout);
}


/* =====================================================
 * 表頭格式與欄寬
 * ===================================================== */

function applyHeaderStyles_(sheet) {
  sheet
    .getRange(1, 1, 1, SCORE_TABLE_LAST_COL)
    .setBackgrounds([SCORE_COLUMNS.map(col => col.headerBackground || "#4472C4")])
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.setRowHeight(1, 40);

  columnRuns_(SCORE_COLUMNS.map(col => col.width), (a, b) => a === b).forEach(run => {
    sheet.setColumnWidths(run.startCol, run.values.length, run.values[0]);
  });

  sheet
    .getRange(1, 1, sheet.getMaxRows(), SCORE_TABLE_LAST_COL)
    .setVerticalAlignment("middle");
}


/* =====================================================
 * 成員列格式
 *
 * A、B、O：一般帳號藍白交錯、回歸帳號淡橘白交錯
 * 其餘欄位依 SCORE_COLUMNS 設定
 * 全部欄位粗體、置中
 * ===================================================== */

function applyBlockStyles_(sheet, block) {
  const { firstRow, rowCount, isReturn } = block;
  const stripeColor = isReturn ? "#FCE4D6" : "#D9E1F2";

  const backgrounds = Array.from({ length: rowCount }, (_, i) => {
    const rowColor = (firstRow + i) % 2 === 0 ? stripeColor : "#FFFFFF";
    return SCORE_COLUMNS.map(col => col.background || rowColor);
  });

  sheet
    .getRange(firstRow, 1, rowCount, SCORE_TABLE_LAST_COL)
    .setBackgrounds(backgrounds)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  [
    ["fontColor", "setFontColors"],
    ["numberFormat", "setNumberFormats"]
  ].forEach(([key, setter]) => {
    columnRuns_(SCORE_COLUMNS.map(col => col[key]), () => true).forEach(run => {
      sheet
        .getRange(firstRow, run.startCol, rowCount, run.values.length)
        [setter](Array.from({ length: rowCount }, () => run.values));
    });
  });
}


/* =====================================================
 * 將欄位設定分成連續區段
 *
 * values 為 A 欄起的欄位設定，null / undefined 會斷開區段。
 * sameRun(a, b) 決定相鄰值能否放在同一段。
 * 回傳：[{ startCol, values }]
 * ===================================================== */

function columnRuns_(values, sameRun) {
  const runs = [];

  values.forEach((value, index) => {
    const last = runs[runs.length - 1];

    if (value == null) {
      return;
    }

    if (
      last &&
      last.startCol + last.values.length === index + 1 &&
      sameRun(last.values[0], value)
    ) {
      last.values.push(value);
    } else {
      runs.push({ startCol: index + 1, values: [value] });
    }
  });

  return runs;
}


/* =====================================================
 * 總計列與回歸帳號標題格式
 * ===================================================== */

function applySummaryRowsStyles_(sheet, layout) {
  const { TotalRow: totalRow, ReturnTitleRow: returnTitleRow } = layout;

  if (totalRow > 0) {
    sheet
      .getRange(totalRow, 1, 1, SCORE_TABLE_LAST_COL)
      .setBackground("#FFD966")
      .setFontWeight("bold")
      .setFontColor("#000000")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    sheet.getRange(totalRow, 3, 1, 10).setNumberFormat("#,##0");
    sheet.getRange(totalRow, CONTRIBUTION_FIRST_COL, 1, 4).setNumberFormat("0.00%");
  }

  if (returnTitleRow > 0) {
    const range = sheet.getRange(returnTitleRow, 1, 1, SCORE_TABLE_LAST_COL);

    range.breakApart();
    range.merge();

    range
      .setValue("【回歸帳號】")
      .setBackground("#FFC000")
      .setFontWeight("bold")
      .setFontColor("#000000")
      .setFontSize(11)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
  }
}


/* =====================================================
 * 邊框：表頭、成員列、總計、回歸標題
 * ===================================================== */

function applyBorders_(sheet, layout) {
  const lastCol = columnToLetter_(SCORE_TABLE_LAST_COL);
  const rowsA1 = (firstRow, lastRow) => `A${firstRow}:${lastCol}${lastRow}`;
  const { formal, returning } = getScoreBlocks_(layout);

  const ranges = [
    rowsA1(1, 1),
    formal && rowsA1(formal.firstRow, formal.lastRow),
    layout.TotalRow > 0 && rowsA1(layout.TotalRow, layout.TotalRow),
    layout.ReturnTitleRow > 0 && rowsA1(layout.ReturnTitleRow, layout.ReturnTitleRow),
    returning && rowsA1(returning.firstRow, returning.lastRow)
  ].filter(Boolean);

  sheet
    .getRangeList(ranges)
    .setBorder(true, true, true, true, true, true, BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID);
}


/* =====================================================
 * O 欄狀態條件式格式
 * ===================================================== */

function applyStatusConditionalFormatting_(sheet) {
  const statusRange = sheet.getRange(2, STATUS_COL, STATUS_COLOR_MAX_ROW - 1, 1);

  sheet.setConditionalFormatRules(
    STATUS_COLORS.map(([text, background, fontColor]) =>
      SpreadsheetApp
        .newConditionalFormatRule()
        .whenTextEqualTo(text)
        .setBackground(background)
        .setFontColor(fontColor)
        .setRanges([statusRange])
        .build()
    )
  );
}


/* =====================================================
 * 修復目前週表 O 欄狀態顏色
 * ===================================================== */

function repairActiveWeeklyStatusColors() {
  const sheet = getActiveWeeklySheet_();

  if (!sheet) {
    return;
  }

  applyStatusConditionalFormatting_(sheet);

  SpreadsheetApp.getUi().alert("目前週表 O 欄狀態顏色已修復。");
}


/* =====================================================
 * 檢查目前週表條件式格式範圍
 * ===================================================== */

function checkActiveSheetConditionalFormatRanges() {
  const sheet = getActiveWeeklySheet_();

  if (!sheet) {
    return;
  }

  const lines = sheet
    .getConditionalFormatRules()
    .map((rule, index) =>
      `規則 ${index + 1}: ` +
      rule.getRanges().map(range => range.getA1Notation()).join(", ")
    );

  SpreadsheetApp.getUi().alert(
    lines.length > 0
      ? lines.join("\n")
      : "目前工作表沒有條件式格式規則。"
  );
}


/* =====================================================
 * 清理暫存週表
 * ===================================================== */

function cleanupTempWeeklySheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let deletedCount = 0;

  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();

    if (!name.startsWith("__tmp_")) {
      return;
    }

    try {
      ss.deleteSheet(sheet);
      deletedCount++;
    } catch (err) {
      Logger.log(`刪除暫存表失敗：${name}，原因：` + (err.message || err));
    }
  });

  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(`暫存週表清理完成，共刪除 ${deletedCount} 張。`);
}


/* =====================================================
 * 讀取成員名單
 *
 * A CM / B LINE / C 職位 / D 保留欄位
 * 遇到 CM 與 LINE 都空白的列即停止。
 * ===================================================== */

function readFormalMembers_(sheet) {
  return parseMemberRows_(
    sheet.getRange(MEMBER_FORMAL_FIRST_ROW, 1, MEMBER_FORMAL_MAX_COUNT, 4).getValues()
  );
}

function readReturnMembers_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < MEMBER_RETURN_FIRST_ROW) {
    return [];
  }

  return parseMemberRows_(
    sheet.getRange(MEMBER_RETURN_FIRST_ROW, 1, lastRow - MEMBER_RETURN_FIRST_ROW + 1, 4).getValues()
  );
}

function parseMemberRows_(values) {
  const members = values.map((row, originalIndex) => ({
    cm: String(row[0] || "").trim(),
    line: String(row[1] || "").trim(),
    role: normalizeRole_(row[2]),
    colD: row[3],
    originalIndex
  }));

  const endIndex = members.findIndex(member => !member.cm && !member.line);

  return endIndex < 0 ? members : members.slice(0, endIndex);
}

function normalizeRole_(value) {
  const role = String(value || "").trim();
  return LEADER_ROLES.includes(role) ? role : "";
}


/* =====================================================
 * 依指定週數成績排序成員名單
 *
 * 積分工具 → 依指定週數成績排序成員名單
 * → 從下拉式選單選擇試算表中已存在的週表
 *
 * 1. 以目前「成員名單」為主，不移除成員
 * 2. 一般 / 回歸帳號只比對週表各自的區塊
 * 3. 比對 CM + LINE，或 CM only；不使用 LINE only
 * 4. 有紀錄者依 L 欄一週總分由高到低，同分保留原順序
 * 5. 沒有紀錄的新成員保留原順序放在最下面
 * ===================================================== */

function sortMemberListByInputWeeklyScore() {
  showWeeklySheetPickerDialog_({
    title: "依指定週數成績排序成員名單",
    description:
      "請選擇要依據的週表。\n\n" +
      "說明：\n" +
      "1. 一般帳號只會比對週表的一般帳號區。\n" +
      "2. 回歸帳號只會比對週表的回歸帳號區。\n" +
      "3. CM 與 LINE 都相同才算有紀錄。\n" +
      "4. 沒有該週紀錄的新成員會保留並放在最下面。",
    submitLabel: "開始排序",
    callbackName: "sortMemberListByWeeklySheetName"
  });
}


/* =====================================================
 * 依選定週表排序成員名單
 *
 * 由週表下拉選單對話框呼叫，回傳結果訊息。
 * ===================================================== */

function sortMemberListByWeeklySheetName(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weeklySheet = getSelectedWeeklySheet_(ss, payload && payload.weeklySheetName);
  const memberSheet = ss.getSheetByName(MEMBER_SHEET_NAME);

  if (!memberSheet) {
    throw new Error(`找不到「${MEMBER_SHEET_NAME}」工作表。`);
  }

  try {
    SpreadsheetApp.flush();

    const result = sortMemberListByCurrentMembersAndWeeklyScore_(memberSheet, weeklySheet);

    return (
      "成員名單排序完成！\n\n" +
      `依據週表：${weeklySheet.getName()}\n` +
      `一般帳號：${result.formalCount} 筆\n` +
      `回歸帳號：${result.returnCount} 筆\n` +
      `無週表紀錄但已保留：${result.noRecordCount} 筆\n\n` +
      "排序規則：\n" +
      "1. 有該週紀錄者依 L 欄一週總分由高到低。\n" +
      "2. 沒有該週紀錄的新成員已放在各自區塊最下面。\n" +
      "3. 一般帳號與回歸帳號已分區比對，不會互相吃到分數。"
    );

  } catch (err) {
    Logger.log(err.stack || err.message || err);

    throw new Error("排序成員名單失敗：\n\n" + (err.message || err));
  }
}

function sortMemberListByCurrentMembersAndWeeklyScore_(memberSheet, weeklySheet) {
  const formalMembers = readFormalMembers_(memberSheet);
  const returnMembers = readReturnMembers_(memberSheet);

  if (formalMembers.length <= 0) {
    throw new Error("目前「成員名單」一般帳號區塊沒有資料。");
  }

  const blocks = getScoreBlocks_(readLayoutInfo_(weeklySheet));

  const sortedFormal = sortMembersByWeeklyScore_(
    formalMembers,
    buildWeeklyScoreMap_(weeklySheet, blocks.formal)
  );

  const sortedReturn = sortMembersByWeeklyScore_(
    returnMembers,
    buildWeeklyScoreMap_(weeklySheet, blocks.returning)
  );

  if (sortedFormal.length > MEMBER_FORMAL_MAX_COUNT) {
    throw new Error(`一般帳號數量 ${sortedFormal.length} 超過上限 ${MEMBER_FORMAL_MAX_COUNT}。`);
  }

  writeMemberRows_(memberSheet, MEMBER_FORMAL_FIRST_ROW, MEMBER_FORMAL_MAX_COUNT, sortedFormal);

  writeMemberRows_(
    memberSheet,
    MEMBER_RETURN_FIRST_ROW,
    Math.max(memberSheet.getLastRow(), MEMBER_RETURN_FIRST_ROW) - MEMBER_RETURN_FIRST_ROW + 1,
    sortedReturn
  );

  SpreadsheetApp.flush();

  return {
    formalCount: sortedFormal.length,
    returnCount: sortedReturn.length,
    noRecordCount: [...sortedFormal, ...sortedReturn].filter(member => !member.hasWeeklyRecord).length
  };
}


/* =====================================================
 * 週表區塊成績 Map
 *
 * Key → L 欄一週總分；同 Key 以第一筆為準
 * ===================================================== */

function buildWeeklyScoreMap_(weeklySheet, block) {
  const scoreMap = {};

  if (!block) {
    return scoreMap;
  }

  weeklySheet
    .getRange(block.firstRow, 1, block.rowCount, SCORE_TABLE_LAST_COL)
    .getValues()
    .forEach(row => {
      const score = normalizeScoreValue_(row[TOTAL_SCORE_COL - 1]);

      memberMatchKeys_(row[0], row[1]).forEach(key => {
        if (!(key in scoreMap)) {
          scoreMap[key] = score;
        }
      });
    });

  return scoreMap;
}


/* =====================================================
 * 成員比對 Keys
 *
 * 1. 有 CM + LINE → FULL:cm||line
 * 2. 有 CM → CM:cm
 * 不建立 LINE only Key：LINE 常多人共用（例如 Polly Chan）。
 * 比對前去前後空白、轉小寫。
 * ===================================================== */

function memberMatchKeys_(cm, line) {
  const normalizedCm = normalizeMemberKeyPart_(cm);
  const normalizedLine = normalizeMemberKeyPart_(line);

  return [
    normalizedCm && normalizedLine ? `FULL:${normalizedCm}||${normalizedLine}` : "",
    normalizedCm ? `CM:${normalizedCm}` : ""
  ].filter(Boolean);
}

function normalizeMemberKeyPart_(value) {
  return String(value || "").trim().toLowerCase();
}


/* =====================================================
 * 依週表成績排序成員
 *
 * 有紀錄者在上、分數高者在上；
 * 同分與無紀錄者保留成員名單原順序。
 * ===================================================== */

function sortMembersByWeeklyScore_(members, scoreMap) {
  return members
    .map(member => {
      const key = memberMatchKeys_(member.cm, member.line).find(k => k in scoreMap);
      const hasWeeklyRecord = key !== undefined;

      return { ...member, hasWeeklyRecord, score: hasWeeklyRecord ? scoreMap[key] : 0 };
    })
    .sort((a, b) => {
      if (a.hasWeeklyRecord !== b.hasWeeklyRecord) {
        return a.hasWeeklyRecord ? -1 : 1;
      }

      if (a.hasWeeklyRecord && b.score !== a.score) {
        return b.score - a.score;
      }

      return a.originalIndex - b.originalIndex;
    });
}


/* =====================================================
 * 回寫成員名單 A:D
 *
 * 寫入 rowCount 列：排序結果在上，其餘清空。
 * ===================================================== */

function writeMemberRows_(memberSheet, firstRow, rowCount, members) {
  const values = Array.from({ length: rowCount }, (_, i) =>
    members[i]
      ? [members[i].cm, members[i].line, members[i].role, members[i].colD]
      : ["", "", "", ""]
  );

  memberSheet.getRange(firstRow, 1, rowCount, 4).setValues(values);
}


/* =====================================================
 * 分數正規化
 *
 * 支援 500000、"500,000"、""、null；無法解析時視為 0
 * ===================================================== */

function normalizeScoreValue_(value) {
  if (typeof value === "number") {
    return value;
  }

  const numberValue = Number(String(value || "").replace(/,/g, "").trim());

  return isNaN(numberValue) ? 0 : numberValue;
}


/* =====================================================
 * 匯入 OCR 成績 CSV
 *
 * 積分工具 → 匯入 OCR 成績 CSV
 * → 下拉選擇週表、活動，並選擇 CSV 檔
 *
 * CSV 欄位（第一列為表頭，其他欄位會忽略）：
 * name          → 對應週表 A 欄 CM
 * score         → 寫入該活動「投入」欄
 * unused_score  → 寫入該活動「未投入」欄（空白視為 0）
 *
 * 1. 一般帳號區與回歸帳號區都會比對
 * 2. CM 去前後空白、不分大小寫完全相同才寫入
 * 3. 找不到、CSV 重複、週表 CM 重複者不寫入，並列在結果中
 * 4. 週表中沒出現在 CSV 的成員保留原分數
 * 5. 寫入後重新排序週表
 * ===================================================== */

function importOcrCsvToWeeklySheet() {
  showWeeklySheetPickerDialog_({
    title: "匯入 OCR 成績 CSV",
    description:
      "請選擇要匯入的週表與活動，並選擇 CSV 檔。\n\n" +
      "說明：\n" +
      "1. CSV 的 name 會比對週表 A 欄 CM。\n" +
      "2. score 寫入投入、unused_score 寫入未投入。\n" +
      "3. 沒出現在 CSV 的成員會保留原分數。",
    submitLabel: "開始匯入",
    callbackName: "importOcrCsvForWeeklySheet",
    withActivityPicker: true,
    withCsvFile: true
  });
}


/* =====================================================
 * 將 CSV 內容匯入選定週表
 *
 * 由週表下拉選單對話框呼叫，回傳結果訊息。
 * 讀寫試算表的步驟遇到暫時性錯誤（例如 DEADLINE_EXCEEDED）會自動重試。
 * ===================================================== */

function importOcrCsvForWeeklySheet(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weeklySheet = getSelectedWeeklySheet_(ss, payload && payload.weeklySheetName);
  const activityNumber = Number(payload && payload.activityNumber);

  if (!ACTIVITY_INVESTED_COLS[activityNumber]) {
    throw new Error(`活動編號不正確：${payload && payload.activityNumber}`);
  }

  const ocrRows = parseOcrScoreCsv_(payload && payload.csvText);

  if (ocrRows.length === 0) {
    throw new Error("CSV 中沒有任何成績資料。");
  }

  try {
    const layout = runWithRetry_("讀取週表版面資訊", () => readLayoutInfo_(weeklySheet), 3);
    const result = writeOcrScoresToWeeklySheet_(weeklySheet, layout, activityNumber, ocrRows);

    runWithRetry_("匯入後排序週表", () => {
      SpreadsheetApp.flush();
      sortWeeklyScoreSheet_(weeklySheet, layout);
    }, 3);

    runWithRetry_("匯入後套用週表格式", () => reapplyAfterSortStyles_(weeklySheet, layout), 3);

    return buildOcrImportReport_(weeklySheet.getName(), activityNumber, ocrRows.length, result);

  } catch (err) {
    Logger.log(err.stack || err.message || err);

    const message = String(err.message || err);

    const timeoutHint = message.includes("DEADLINE_EXCEEDED")
      ? "\n\nGoogle 試算表伺服器回應逾時，請稍候再匯入一次。\n" +
        "已寫入的分數可再次匯入覆蓋，不會重複累加。"
      : "";

    throw new Error("匯入 CSV 失敗：\n\n" + message + timeoutHint);
  }
}


/* =====================================================
 * 解析 OCR 成績 CSV
 *
 * 回傳：[{ rowNumber, name, score, unusedScore }]
 * ===================================================== */

function parseOcrScoreCsv_(csvText) {
  const text = String(csvText || "").replace(/^﻿/, "");

  if (!text.trim()) {
    throw new Error("CSV 檔案是空的。");
  }

  const rows = Utilities.parseCsv(text);
  const header = rows[0].map(cell => String(cell || "").trim().toLowerCase());
  const nameIndex = header.indexOf("name");
  const scoreIndex = header.indexOf("score");
  const unusedScoreIndex = header.indexOf("unused_score");

  if (nameIndex < 0 || scoreIndex < 0) {
    throw new Error(
      "CSV 表頭缺少 name 或 score 欄位。\n" +
      `目前表頭：${rows[0].join(", ")}`
    );
  }

  return rows
    .slice(1)
    .map((row, index) => {
      const rowNumber = index + 2;

      return {
        rowNumber,
        name: String(row[nameIndex] || "").trim(),
        score: parseOcrScoreCell_(row[scoreIndex], rowNumber, "score"),
        unusedScore: unusedScoreIndex < 0
          ? 0
          : parseOcrScoreCell_(row[unusedScoreIndex], rowNumber, "unused_score")
      };
    })
    .filter(row => row.name);
}


/* =====================================================
 * 解析 CSV 分數欄
 *
 * 空白 → 0，可含千分位逗號；
 * 非數字或負數 → 拋出錯誤，避免寫入錯誤分數
 * ===================================================== */

function parseOcrScoreCell_(value, rowNumber, columnName) {
  const text = String(value == null ? "" : value).replace(/[,\s]/g, "");

  if (!text) {
    return 0;
  }

  const numberValue = Number(text);

  if (isNaN(numberValue) || numberValue < 0) {
    throw new Error(`CSV 第 ${rowNumber} 列 ${columnName} 不是有效分數：${value}`);
  }

  return numberValue;
}


/* =====================================================
 * 將 OCR 成績寫入週表指定活動
 *
 * 只寫入該活動的投入 / 未投入兩欄，不動其他欄位與公式。
 * ===================================================== */

function writeOcrScoresToWeeklySheet_(weeklySheet, layout, activityNumber, ocrRows) {
  const investedCol = ACTIVITY_INVESTED_COLS[activityNumber];

  const blocks = listScoreBlocks_(layout).map(block => ({
    ...block,
    values: runWithRetry_("讀取週表成員列", () =>
      weeklySheet.getRange(block.firstRow, 1, block.rowCount, investedCol + 1).getValues(), 3)
  }));

  if (blocks.length === 0) {
    throw new Error(`「${weeklySheet.getName()}」找不到版面資訊（AA:AB），無法判斷成員列範圍。`);
  }

  // CM → 週表列號清單
  const rowsByCm = {};

  blocks.forEach(block => {
    block.values.forEach((row, index) => {
      const key = normalizeMemberKeyPart_(row[0]);

      if (key) {
        rowsByCm[key] = (rowsByCm[key] || []).concat(block.firstRow + index);
      }
    });
  });

  const updatesByRow = {};
  const seenNames = {};
  const unmatchedNames = [];
  const duplicateCsvNames = [];
  const ambiguousNames = [];

  ocrRows.forEach(ocrRow => {
    const key = normalizeMemberKeyPart_(ocrRow.name);
    const targetRows = rowsByCm[key] || [];

    if (seenNames[key]) {
      duplicateCsvNames.push(ocrRow.name);
    } else if (targetRows.length === 0) {
      unmatchedNames.push(ocrRow.name);
    } else if (targetRows.length > 1) {
      ambiguousNames.push(ocrRow.name);
    } else {
      updatesByRow[targetRows[0]] = [ocrRow.score, ocrRow.unusedScore];
    }

    seenNames[key] = true;
  });

  blocks.forEach(block => {
    const scoreValues = block.values.map((row, index) =>
      updatesByRow[block.firstRow + index] || [row[investedCol - 1], row[investedCol]]
    );

    runWithRetry_("寫入 OCR 分數", () =>
      weeklySheet.getRange(block.firstRow, investedCol, scoreValues.length, 2).setValues(scoreValues), 3);
  });

  const memberCount = Object.values(rowsByCm).reduce((sum, rows) => sum + rows.length, 0);
  const writtenCount = Object.keys(updatesByRow).length;

  return {
    writtenCount,
    notInCsvCount: memberCount - writtenCount,
    unmatchedNames,
    duplicateCsvNames,
    ambiguousNames
  };
}


/* =====================================================
 * 組合 CSV 匯入結果訊息
 * ===================================================== */

function buildOcrImportReport_(weeklySheetName, activityNumber, csvRowCount, result) {
  const formatNames = names => names.length === 0 ? "" : `\n  ${names.join("、")}`;

  return (
    "CSV 匯入完成！\n\n" +
    `週表：${weeklySheetName}\n` +
    `活動：活動${activityNumber}\n` +
    `CSV 筆數：${csvRowCount} 筆\n` +
    `已寫入：${result.writtenCount} 筆\n` +
    `週表中未出現在 CSV（保留原分數）：${result.notInCsvCount} 筆\n` +
    `找不到成員（未寫入）：${result.unmatchedNames.length} 筆` +
    formatNames(result.unmatchedNames) + "\n" +
    `CSV 重複名稱（只寫入第一筆）：${result.duplicateCsvNames.length} 筆` +
    formatNames(result.duplicateCsvNames) + "\n" +
    `週表 CM 重複（未寫入）：${result.ambiguousNames.length} 筆` +
    formatNames(result.ambiguousNames) + "\n\n" +
    "週表已依一週總分重新排序。"
  );
}


/* =====================================================
 * 取得並驗證下拉選單選定的週表
 * ===================================================== */

function getSelectedWeeklySheet_(ss, weeklySheetName) {
  const name = String(weeklySheetName || "").trim();

  if (!isWeeklyScoreSheetName_(name)) {
    throw new Error(`週表名稱格式不正確：${name}`);
  }

  const weeklySheet = runWithRetry_("取得週表", () => ss.getSheetByName(name), 3);

  if (!weeklySheet) {
    throw new Error(`找不到指定週積分表：${name}`);
  }

  return weeklySheet;
}


/* =====================================================
 * 列出試算表中所有週表名稱，由新到舊
 * ===================================================== */

function listWeeklySheetNames_(ss) {
  const toSortKey = name => {
    const [, year, month, week] = name.match(/^(\d{4})-(\d{2})-w(\d+)$/);
    return Number(year) * 10000 + Number(month) * 100 + Number(week);
  };

  return ss
    .getSheets()
    .map(sheet => sheet.getName())
    .filter(name => isWeeklyScoreSheetName_(name))
    .sort((a, b) => toSortKey(b) - toSortKey(a));
}


/* =====================================================
 * 顯示週表下拉選單對話框
 *
 * options：
 * title               對話框標題
 * description         說明文字
 * submitLabel         確認按鈕文字
 * callbackName        選定後呼叫的公開函式名稱
 *                     （不可以底線結尾，否則 google.script.run 無法呼叫）
 * withActivityPicker  是否顯示活動 1 / 2 / 3 下拉選單
 * withCsvFile         是否顯示 CSV 檔案選擇
 *
 * callback 接收 { weeklySheetName, activityNumber, csvText }，回傳結果訊息。
 * 預設選取目前所在的週表；不在週表上則選最新一週。
 * ===================================================== */

function showWeeklySheetPickerDialog_(options) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const { weeklySheetNames, activeSheetName } = runWithRetry_("讀取週表清單", () => ({
    weeklySheetNames: listWeeklySheetNames_(ss),
    activeSheetName: ss.getActiveSheet().getName()
  }), 3);

  if (weeklySheetNames.length === 0) {
    ui.alert("試算表中沒有任何週積分表（格式：yyyy-MM-wN）。");
    return;
  }

  const config = {
    description: options.description,
    submitLabel: options.submitLabel,
    callbackName: options.callbackName,
    withActivityPicker: Boolean(options.withActivityPicker),
    withCsvFile: Boolean(options.withCsvFile),
    weeklySheetNames,
    defaultName: weeklySheetNames.includes(activeSheetName) ? activeSheetName : weeklySheetNames[0]
  };

  // 避免 JSON 內容提前結束 <script>
  const configJson = JSON.stringify(config).replace(/</g, "\\u003c");

  const html = `
<!DOCTYPE html>
<html>
<head>
<base target="_top">
<style>
  body { font-family: Arial, "Noto Sans TC", sans-serif; font-size: 14px; margin: 0; padding: 4px 2px; }
  p { white-space: pre-wrap; margin: 0 0 12px; line-height: 1.5; }
  label { display: block; font-weight: bold; margin-bottom: 4px; }
  select, input[type=file] { width: 100%; box-sizing: border-box; padding: 6px; font-size: 14px; margin-bottom: 14px; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; }
  button { padding: 6px 16px; font-size: 14px; cursor: pointer; }
  #submit { background: #1a73e8; color: #fff; border: none; border-radius: 4px; }
  #submit:disabled { background: #9aa0a6; cursor: default; }
  .hidden { display: none; }
  .error { color: #c5221f; }
</style>
</head>
<body>
  <div id="form">
    <p id="description"></p>

    <label for="week">週表</label>
    <select id="week"></select>

    <div id="activityField" class="hidden">
      <label for="activity">活動</label>
      <select id="activity">
        <option value="1">活動1</option>
        <option value="2">活動2</option>
        <option value="3">活動3</option>
      </select>
    </div>

    <div id="fileField" class="hidden">
      <label for="csvFile">CSV 檔案</label>
      <input id="csvFile" type="file" accept=".csv,text/csv">
    </div>

    <p id="formError" class="error hidden"></p>

    <div class="buttons">
      <button id="cancel" type="button">取消</button>
      <button id="submit" type="button"></button>
    </div>
  </div>

  <div id="resultBox" class="hidden">
    <p id="result"></p>
    <div class="buttons">
      <button id="close" type="button">關閉</button>
    </div>
  </div>
<script>
  const config = ${configJson};

  const byId = id => document.getElementById(id);
  const weekSelect = byId("week");
  const activitySelect = byId("activity");
  const fileInput = byId("csvFile");
  const submit = byId("submit");

  byId("description").textContent = config.description;
  submit.textContent = config.submitLabel;
  byId("activityField").classList.toggle("hidden", !config.withActivityPicker);
  byId("fileField").classList.toggle("hidden", !config.withCsvFile);

  config.weeklySheetNames.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === config.defaultName;
    weekSelect.appendChild(option);
  });

  const showFormError = message => {
    byId("formError").textContent = message;
    byId("formError").classList.remove("hidden");
  };

  const showResult = (message, isError) => {
    const result = byId("result");
    result.textContent = message;
    result.className = isError ? "error" : "";
    byId("form").classList.add("hidden");
    byId("resultBox").classList.remove("hidden");
  };

  const readCsvFile = () => new Promise((resolve, reject) => {
    if (!config.withCsvFile) {
      resolve("");
      return;
    }

    const file = fileInput.files[0];

    if (!file) {
      reject(new Error("請選擇 CSV 檔案。"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("讀取 CSV 檔案失敗。"));
    reader.readAsText(file, "UTF-8");
  });

  const close = () => google.script.host.close();

  byId("cancel").addEventListener("click", close);
  byId("close").addEventListener("click", close);

  submit.addEventListener("click", () => {
    readCsvFile()
      .then(csvText => {
        submit.disabled = true;
        submit.textContent = "處理中…";
        [weekSelect, activitySelect, fileInput].forEach(el => { el.disabled = true; });

        google.script.run
          .withSuccessHandler(message => showResult(message || "完成。", false))
          .withFailureHandler(err => showResult((err && err.message) || String(err), true))
          [config.callbackName]({
            weeklySheetName: weekSelect.value,
            activityNumber: Number(activitySelect.value),
            csvText
          });
      })
      .catch(err => showFormError(err.message));
  });
</script>
</body>
</html>`;

  ui.showModalDialog(
    HtmlService
      .createHtmlOutput(html)
      .setWidth(440)
      .setHeight(config.withCsvFile ? 480 : 360),
    options.title
  );
}


/* =====================================================
 * 顯示執行中對話框
 *
 * 開啟後立即以 google.script.run 呼叫 callbackName，
 * 顯示其回傳的結果訊息，或拋出的錯誤訊息。
 * callbackName 不可以底線結尾。
 * ===================================================== */

function showTaskDialog_(options) {
  // 避免 JSON 內容提前結束 <script>
  const configJson = JSON.stringify({
    runningText: options.runningText,
    callbackName: options.callbackName
  }).replace(/</g, "\\u003c");

  const html = `
<!DOCTYPE html>
<html>
<head>
<base target="_top">
<style>
  body { font-family: Arial, "Noto Sans TC", sans-serif; font-size: 14px; margin: 0; padding: 4px 2px; }
  p { white-space: pre-wrap; margin: 0 0 12px; line-height: 1.5; }
  .buttons { display: flex; justify-content: flex-end; }
  button { padding: 6px 16px; font-size: 14px; cursor: pointer; }
  .hidden { display: none; }
  .error { color: #c5221f; }
</style>
</head>
<body>
  <p id="message"></p>
  <div id="buttons" class="buttons hidden">
    <button id="close" type="button">關閉</button>
  </div>
<script>
  const config = ${configJson};
  const message = document.getElementById("message");

  const finish = (text, isError) => {
    message.textContent = text;
    message.className = isError ? "error" : "";
    document.getElementById("buttons").classList.remove("hidden");
  };

  message.textContent = config.runningText;
  document.getElementById("close").addEventListener("click", () => google.script.host.close());

  google.script.run
    .withSuccessHandler(text => finish(text || "完成。", false))
    .withFailureHandler(err => finish((err && err.message) || String(err), true))
    [config.callbackName]();
</script>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(420).setHeight(260),
    options.title
  );
}


/* =====================================================
 * 通用 Retry：失敗後依序等待 1、2… 秒再試
 * ===================================================== */

function runWithRetry_(label, callback, maxAttempts) {
  const attempts = maxAttempts || 3;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return callback();

    } catch (err) {
      lastError = err;

      Logger.log(`${label} 失敗，第 ${attempt}/${attempts} 次：` + (err.message || err));

      if (attempt < attempts) {
        Utilities.sleep(1000 * attempt);
      }
    }
  }

  throw lastError;
}


/* =====================================================
 * 週表名稱
 *
 * 格式 yyyy-MM-wN，N 為該週星期一是當月第幾個星期一
 * 2026/08/03 → 2026-08-w1
 * 2026/08/31 → 2026-08-w5
 * 2026/09/02 → 2026-08-w5（該週星期一在 8 月）
 * ===================================================== */

function isWeeklyScoreSheetName_(sheetName) {
  return /^\d{4}-\d{2}-w\d+$/.test(String(sheetName || ""));
}

function getWeeklySheetName_(targetDate) {
  const monday = getMondayOfWeek_(targetDate);
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const weekNumber = Math.floor((monday.getDate() - 1) / 7) + 1;

  return `${monday.getFullYear()}-${month}-w${weekNumber}`;
}

function getMondayOfWeek_(date) {
  const result = new Date(date);
  const day = result.getDay();

  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));

  return result;
}


/* =====================================================
 * 欄位編號轉英文字母：1 → A，19 → S
 * ===================================================== */

function columnToLetter_(column) {
  let letter = "";

  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + (n - 1) % 26) + letter;
  }

  return letter;
}


/* =====================================================
 * 測試週表命名
 * ===================================================== */

function testWeeklySheetNames() {
  [
    new Date(2026, 7, 3),
    new Date(2026, 7, 10),
    new Date(2026, 7, 17),
    new Date(2026, 7, 24),
    new Date(2026, 7, 31),
    new Date(2026, 8, 1),
    new Date(2026, 8, 2)
  ].forEach(date => {
    Logger.log(`${date.toDateString()} => ${getWeeklySheetName_(date)}`);
  });
}
