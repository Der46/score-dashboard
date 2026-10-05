/* =====================================================
 * 基本設定
 * ===================================================== */

const PASS_SCORE = 200000;
const ELDER_SCORE = 500000;

const MEMBER_SHEET_NAME = "成員名單";

// 一般帳號
const MEMBER_FORMAL_FIRST_ROW = 2;
const MEMBER_FORMAL_MAX_COUNT = 50;

// 回歸帳號
const MEMBER_RETURN_FIRST_ROW = 53;

// 週積分表一般帳號起始列
const SCORE_FORMAL_FIRST_ROW = 2;

// 狀態欄
const STATUS_COL = 15; // O

// 貢獻度欄位
const ACTIVITY1_CONTRIBUTION_COL = 16; // P
const ACTIVITY2_CONTRIBUTION_COL = 17; // Q
const ACTIVITY3_CONTRIBUTION_COL = 18; // R
const WEEKLY_CONTRIBUTION_COL = 19;    // S

const CONTRIBUTION_FIRST_COL = 16; // P
const CONTRIBUTION_LAST_COL = 19;  // S

// 週積分表最後一欄
const SCORE_TABLE_LAST_COL = 19;

// 狀態顏色最大列
const STATUS_COLOR_MAX_ROW = 200;

// 版面資訊 AA:AB
const LAYOUT_INFO_FIRST_COL = 27;
const LAYOUT_INFO_LAST_COL = 28;


/* =====================================================
 * 建立本週積分表
 * ===================================================== */

function createWeeklyScoreSheet() {
  const lock = LockService.getDocumentLock();

  try {
    const locked = lock.tryLock(30000);

    if (!locked) {
      SpreadsheetApp.getUi().alert(
        "目前已有積分表建立程序正在執行，請稍後再試。"
      );

      return;
    }

    createWeeklyScoreSheetByDate_(new Date());

  } catch (err) {
    Logger.log(
      err.stack || err.message || err
    );

    SpreadsheetApp.getUi().alert(
      "建立週表失敗：\n\n" +
      (err.message || err) +
      "\n\n請到 Apps Script 左側「執行項目」查看詳細錯誤。"
    );

    throw err;

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      Logger.log(
        "釋放 Lock 失敗：" +
        (err.message || err)
      );
    }
  }
}


/* =====================================================
 * 建立指定日期週表
 *
 * 重要：
 * 完全不讀取上一週
 * 完全不修改成員名單
 * ===================================================== */

function createWeeklyScoreSheetByDate_(targetDate) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const memberSheet =
    ss.getSheetByName(
      MEMBER_SHEET_NAME
    );

  if (!memberSheet) {
    throw new Error(
      `找不到「${MEMBER_SHEET_NAME}」工作表。`
    );
  }


  /* ---------------------------------------------
   * 取得本週工作表名稱
   * --------------------------------------------- */

  const sheetName =
    getWeeklySheetName_(targetDate);


  /* ---------------------------------------------
   * 直接讀取目前成員名單
   *
   * 不讀取上一週
   * 不同步上一週
   * 不排序成員名單
   * --------------------------------------------- */

  const formalMembers =
    readFormalMembers_(memberSheet);

  const returnMembers =
    readReturnMembers_(memberSheet);

  if (formalMembers.length <= 0) {
    throw new Error(
      "一般帳號名單為空，請確認「成員名單」A2 開始是否有資料。"
    );
  }


  /* ---------------------------------------------
   * 計算週表版面
   * --------------------------------------------- */

  const formalCount =
    formalMembers.length;

  const returnCount =
    returnMembers.length;

  const formalLastRow =
    SCORE_FORMAL_FIRST_ROW +
    formalCount -
    1;

  const totalRow =
    formalLastRow + 1;

  const returnTitleRow =
    totalRow + 2;

  const returnFirstRow =
    returnTitleRow + 1;

  const returnLastRow =
    returnCount > 0
      ? returnFirstRow + returnCount - 1
      : returnFirstRow - 1;


  /* ---------------------------------------------
   * 如果本週表已存在，刪除舊表
   * --------------------------------------------- */

  const existingSheet =
    ss.getSheetByName(sheetName);

  if (existingSheet) {
    runWithRetry_(
      "刪除既有週表",
      () => {
        ss.deleteSheet(existingSheet);
        SpreadsheetApp.flush();
      },
      3
    );
  }


  /* ---------------------------------------------
   * 建立暫存表
   * --------------------------------------------- */

  const tempSheetName =
    `__tmp_${sheetName}_${Date.now()}`;

  const ws =
    runWithRetry_(
      "建立暫存週表",
      () => ss.insertSheet(tempSheetName),
      3
    );

  SpreadsheetApp.flush();
  Utilities.sleep(500);


  try {
    /* ---------------------------------------------
     * 建立表頭
     * --------------------------------------------- */

    fillHeaders_(ws);


    /* ---------------------------------------------
     * 儲存版面資訊
     * --------------------------------------------- */

    storeLayoutInfo_(ws, {
      formalFirstRow:
        SCORE_FORMAL_FIRST_ROW,

      formalLastRow:
        formalLastRow,

      totalRow:
        totalRow,

      returnTitleRow:
        returnTitleRow,

      returnFirstRow:
        returnFirstRow,

      returnLastRow:
        returnLastRow
    });


    /* ---------------------------------------------
     * 寫入一般帳號
     * --------------------------------------------- */

    writeScoreRows_(
      ws,
      SCORE_FORMAL_FIRST_ROW,
      formalMembers,
      false
    );


    /* ---------------------------------------------
     * 寫入總計
     * --------------------------------------------- */

    writeTotalRow_(
      ws,
      totalRow,
      formalLastRow,
      returnFirstRow,
      returnLastRow
    );


    /* ---------------------------------------------
     * 回歸帳號標題
     * --------------------------------------------- */

    ws
      .getRange(
        returnTitleRow,
        1
      )
      .setValue(
        "【回歸帳號】"
      );


    /* ---------------------------------------------
     * 寫入回歸帳號
     * --------------------------------------------- */

    writeScoreRows_(
      ws,
      returnFirstRow,
      returnMembers,
      true
    );


    SpreadsheetApp.flush();


    /* ---------------------------------------------
     * 格式化
     * --------------------------------------------- */

    formatScoreSheet_(ws);


    SpreadsheetApp.flush();


    /* ---------------------------------------------
     * 暫存表改正式名稱
     * --------------------------------------------- */

    runWithRetry_(
      "暫存表改正式名稱",
      () => {
        ws.setName(sheetName);
        ss.setActiveSheet(ws);
        SpreadsheetApp.flush();
      },
      3
    );


    SpreadsheetApp.getUi().alert(
      `全新週積分表建立完成！\n\n` +
      `工作表：${sheetName}\n` +
      `一般帳號：${formalCount} 個\n` +
      `回歸帳號：${returnCount} 個\n\n` +
      `已保留原欄位顏色設定，並新增 P:S 貢獻度欄位。`
    );

  } catch (err) {
    try {
      const tempSheet =
        ss.getSheetByName(
          tempSheetName
        );

      if (tempSheet) {
        runWithRetry_(
          "清理暫存表",
          () => {
            ss.deleteSheet(tempSheet);
            SpreadsheetApp.flush();
          },
          3
        );
      }

    } catch (cleanupErr) {
      Logger.log(
        "暫存表清理失敗：" +
        (cleanupErr.message || cleanupErr)
      );
    }

    throw err;
  }
}


/* =====================================================
 * 建立自訂選單
 * ===================================================== */

function onOpen() {
  SpreadsheetApp
    .getUi()
    .createMenu("積分工具")

    .addItem(
      "建立全新本週積分表",
      "createWeeklyScoreSheet"
    )

    .addItem(
      "重新排序目前週表",
      "sortActiveWeeklyScoreSheet"
    )

    .addItem(
      "依指定週數成績排序成員名單",
      "sortMemberListByInputWeeklyScore"
    )

    .addSeparator()

    .addItem(
      "修正目前週表總計與貢獻度公式（含回歸帳號）",
      "repairActiveWeeklyContributionFormulas"
    )

    .addItem(
      "修復目前週表 O 欄狀態顏色",
      "repairActiveWeeklyStatusColors"
    )

    .addItem(
      "檢查目前週表條件式格式範圍",
      "checkActiveSheetConditionalFormatRanges"
    )

    .addItem(
      "清理暫存週表",
      "cleanupTempWeeklySheets"
    )

    .addToUi();
}

/* =====================================================
 * 依指定週數成績排序成員名單
 *
 * 使用方式：
 * 積分工具 → 依指定週數成績排序成員名單
 *
 * 可輸入：
 * 1
 * 2
 * 3
 * 4
 * 5
 *
 * 或完整週表名稱：
 * 2026-09-w1
 * 2026-09-w2
 *
 * 排序邏輯：
 * 1. 以目前「成員名單」為主
 * 2. 一般帳號只比對指定週表的一般帳號區
 * 3. 回歸帳號只比對指定週表的回歸帳號區
 * 4. 必須 CM + LINE 都相同才算有該週紀錄
 * 5. 有紀錄者依 L 欄一週總分由高到低
 * 6. 沒有紀錄的新成員會保留並放在最下面
 * 7. 不移除成員
 * ===================================================== */

function sortMemberListByInputWeeklyScore() {
  const ui =
    SpreadsheetApp.getUi();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const response =
    ui.prompt(
      "依指定週數成績排序成員名單",
      "請輸入週數或完整週表名稱。\n\n" +
      "例如：\n" +
      "1  → 使用本月第 1 週，例如 2026-09-w1\n" +
      "2  → 使用本月第 2 週，例如 2026-09-w2\n" +
      "2026-09-w1 → 使用指定週表\n\n" +
      "說明：\n" +
      "1. 一般帳號只會比對週表的一般帳號區。\n" +
      "2. 回歸帳號只會比對週表的回歸帳號區。\n" +
      "3. CM 與 LINE 都相同才算有紀錄。\n" +
      "4. 沒有該週紀錄的新成員會保留並放在最下面。",
      ui.ButtonSet.OK_CANCEL
    );

  if (
    response.getSelectedButton() !==
    ui.Button.OK
  ) {
    return;
  }

  const input =
    String(
      response.getResponseText() || ""
    ).trim();

  if (!input) {
    ui.alert(
      "尚未輸入週數或週表名稱。"
    );

    return;
  }

  const weeklySheetName =
    resolveWeeklySheetNameFromInput_(
      input
    );

  if (
    !isWeeklyScoreSheetName_(
      weeklySheetName
    )
  ) {
    ui.alert(
      "週表名稱格式不正確。\n\n" +
      "請輸入週數，例如：1、2、3\n" +
      "或完整週表名稱，例如：2026-09-w1"
    );

    return;
  }

  const weeklySheet =
    ss.getSheetByName(
      weeklySheetName
    );

  if (!weeklySheet) {
    ui.alert(
      `找不到指定週積分表：${weeklySheetName}`
    );

    return;
  }

  const memberSheet =
    ss.getSheetByName(
      MEMBER_SHEET_NAME
    );

  if (!memberSheet) {
    ui.alert(
      `找不到「${MEMBER_SHEET_NAME}」工作表。`
    );

    return;
  }

  try {
    SpreadsheetApp.flush();

    const result =
      sortMemberListByCurrentMembersAndWeeklyScore_(
        memberSheet,
        weeklySheet
      );

    ui.alert(
      "成員名單排序完成！\n\n" +
      `依據週表：${weeklySheetName}\n` +
      `一般帳號：${result.formalCount} 筆\n` +
      `回歸帳號：${result.returnCount} 筆\n` +
      `無週表紀錄但已保留：${result.noRecordCount} 筆\n\n` +
      "排序規則：\n" +
      "1. 有該週紀錄者依 L 欄一週總分由高到低。\n" +
      "2. 沒有該週紀錄的新成員已放在各自區塊最下面。\n" +
      "3. 一般帳號與回歸帳號已分區比對，不會互相吃到分數。"
    );

  } catch (err) {
    Logger.log(
      err.stack || err.message || err
    );

    ui.alert(
      "排序成員名單失敗：\n\n" +
      (err.message || err)
    );

    throw err;
  }
}


/* =====================================================
 * 根據輸入內容解析週表名稱
 *
 * 支援：
 * 1            → 依目前年月產生 yyyy-MM-w1
 * w1           → 依目前年月產生 yyyy-MM-w1
 * W1           → 依目前年月產生 yyyy-MM-w1
 * 2026-09-w1   → 直接使用
 * ===================================================== */

function resolveWeeklySheetNameFromInput_(
  input
) {
  const text =
    String(
      input || ""
    ).trim();

  if (
    isWeeklyScoreSheetName_(
      text
    )
  ) {
    return text;
  }

  const weekMatch =
    text.match(
      /^w?(\d+)$/i
    );

  if (!weekMatch) {
    return text;
  }

  const weekNumber =
    Number(
      weekMatch[1]
    );

  if (
    !weekNumber ||
    weekNumber <= 0
  ) {
    return text;
  }

  const today =
    new Date();

  const year =
    today.getFullYear();

  const month =
    String(
      today.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-w${weekNumber}`
  );
}


/* =====================================================
 * 以目前成員名單為主，依指定週表分數排序
 *
 * 修正版重點：
 * 1. 一般帳號只比對週表一般帳號區
 * 2. 回歸帳號只比對週表回歸帳號區
 * 3. 避免回歸新成員誤吃一般帳號分數
 * 4. 避免只用 CM 或 LINE 撞名造成誤判
 * ===================================================== */

function sortMemberListByCurrentMembersAndWeeklyScore_(
  memberSheet,
  weeklySheet
) {
  const currentFormalMembers =
    readCurrentFormalMembersFromMemberSheet_(
      memberSheet
    );

  const currentReturnMembers =
    readCurrentReturnMembersFromMemberSheet_(
      memberSheet
    );

  if (
    currentFormalMembers.length <= 0
  ) {
    throw new Error(
      "目前「成員名單」一般帳號區塊沒有資料。"
    );
  }

  const formalWeeklyScoreMap =
    buildWeeklyScoreMapByBlock_(
      weeklySheet,
      "FormalFirstRow",
      "FormalLastRow"
    );

  const returnWeeklyScoreMap =
    buildWeeklyScoreMapByBlock_(
      weeklySheet,
      "ReturnFirstRow",
      "ReturnLastRow"
    );

  const sortedFormalMembers =
    sortCurrentMembersByWeeklyScoreMap_(
      currentFormalMembers,
      formalWeeklyScoreMap
    );

  const sortedReturnMembers =
    sortCurrentMembersByWeeklyScoreMap_(
      currentReturnMembers,
      returnWeeklyScoreMap
    );

  writeSortedFormalMembersKeepAll_(
    memberSheet,
    sortedFormalMembers
  );

  writeSortedReturnMembersKeepAll_(
    memberSheet,
    sortedReturnMembers
  );

  SpreadsheetApp.flush();

  const noRecordCount =
    sortedFormalMembers.filter(
      member => !member.hasWeeklyRecord
    ).length +
    sortedReturnMembers.filter(
      member => !member.hasWeeklyRecord
    ).length;

  return {
    formalCount:
      sortedFormalMembers.length,

    returnCount:
      sortedReturnMembers.length,

    noRecordCount:
      noRecordCount
  };
}


/* =====================================================
 * 讀取目前成員名單：一般帳號
 *
 * A CM
 * B LINE
 * C 職位
 * D 保留欄位
 * ===================================================== */

function readCurrentFormalMembersFromMemberSheet_(
  memberSheet
) {
  const values =
    memberSheet
      .getRange(
        MEMBER_FORMAL_FIRST_ROW,
        1,
        MEMBER_FORMAL_MAX_COUNT,
        4
      )
      .getValues();

  return parseCurrentMemberSheetRows_(
    values
  );
}


/* =====================================================
 * 讀取目前成員名單：回歸帳號
 *
 * 從第 53 列開始
 * ===================================================== */

function readCurrentReturnMembersFromMemberSheet_(
  memberSheet
) {
  const lastRow =
    memberSheet.getLastRow();

  if (
    lastRow <
    MEMBER_RETURN_FIRST_ROW
  ) {
    return [];
  }

  const values =
    memberSheet
      .getRange(
        MEMBER_RETURN_FIRST_ROW,
        1,
        lastRow -
        MEMBER_RETURN_FIRST_ROW +
        1,
        4
      )
      .getValues();

  return parseCurrentMemberSheetRows_(
    values
  );
}


/* =====================================================
 * 解析目前成員名單資料
 *
 * 注意：
 * 1. 保留 D 欄資料
 * 2. 保留目前成員名單 C 欄職位
 * 3. 不會因為週表沒有紀錄而刪除成員
 * ===================================================== */

function parseCurrentMemberSheetRows_(
  values
) {
  const members = [];

  for (
    let i = 0;
    i < values.length;
    i++
  ) {
    const row =
      values[i];

    const cm =
      String(
        row[0] || ""
      ).trim();

    const line =
      String(
        row[1] || ""
      ).trim();

    const role =
      normalizeRole_(
        row[2]
      );

    const colD =
      row[3];

    if (
      !cm &&
      !line
    ) {
      break;
    }

    members.push({
      cm:
        cm,

      line:
        line,

      role:
        role,

      colD:
        colD,

      originalIndex:
        i
    });
  }

  return members;
}


/* =====================================================
 * 建立指定週表區塊成績 Map
 *
 * 重要：
 * 僅使用指定區塊
 *
 * 一般帳號：
 * FormalFirstRow / FormalLastRow
 *
 * 回歸帳號：
 * ReturnFirstRow / ReturnLastRow
 *
 * 比對 Key：
 * 1. CM + LINE
 * 2. CM only
 *
 * 說明：
 * 若成員只有 CM、沒有 LINE，也可以被正確判定為有紀錄。
 * 但仍然不使用 LINE only，避免多人共用 LINE 名稱造成誤判。
 * ===================================================== */

function buildWeeklyScoreMapByBlock_(
  weeklySheet,
  firstRowKey,
  lastRowKey
) {
  const scoreMap =
    {};

  const rows =
    readWeeklyScoreRowsForMap_(
      weeklySheet,
      firstRowKey,
      lastRowKey
    );

  rows.forEach(
    row => {
      const keys =
        buildFlexibleMemberMatchKeys_(
          row.cm,
          row.line
        );

      keys.forEach(
        key => {
          if (
            key &&
            !scoreMap[key]
          ) {
            scoreMap[key] = {
              score:
                row.score
            };
          }
        }
      );
    }
  );

  return scoreMap;
}
/* =====================================================
 * 建立彈性成員比對 Keys
 *
 * 規則：
 * 1. 有 CM + LINE → 建立完整 Key
 * 2. 有 CM → 建立 CM only Key
 * 3. 不建立 LINE only Key
 *
 * 原因：
 * - CM 通常較像帳號唯一名稱
 * - LINE 常可能多人共用，例如 Polly Chan、林傳勝
 * - 因此不使用 LINE only，避免誤判
 * ===================================================== */

function buildFlexibleMemberMatchKeys_(
  cm,
  line
) {
  const keys = [];

  const strictKey =
    buildStrictMemberMatchKey_(
      cm,
      line
    );

  const cmOnlyKey =
    buildCmOnlyMatchKey_(
      cm
    );

  if (strictKey) {
    keys.push(
      strictKey
    );
  }

  if (cmOnlyKey) {
    keys.push(
      cmOnlyKey
    );
  }

  return keys;
}


/* =====================================================
 * 從週表指定區塊讀取成績資料
 *
 * A = CM
 * B = LINE
 * L = 一週總分
 * ===================================================== */

function readWeeklyScoreRowsForMap_(
  weeklySheet,
  firstRowKey,
  lastRowKey
) {
  const firstRow =
    getLayoutValue_(
      weeklySheet,
      firstRowKey
    );

  const lastRow =
    getLayoutValue_(
      weeklySheet,
      lastRowKey
    );

  if (
    !firstRow ||
    !lastRow ||
    lastRow < firstRow
  ) {
    return [];
  }

  const rowCount =
    lastRow - firstRow + 1;

  const values =
    weeklySheet
      .getRange(
        firstRow,
        1,
        rowCount,
        SCORE_TABLE_LAST_COL
      )
      .getValues();

  const rows = [];

  values.forEach(
    row => {
      const cm =
        String(
          row[0] || ""
        ).trim();

      const line =
        String(
          row[1] || ""
        ).trim();

      if (
        !cm &&
        !line
      ) {
        return;
      }

      const score =
        normalizeScoreValue_(
          row[11]
        );

      rows.push({
        cm:
          cm,

        line:
          line,

        score:
          score
      });
    }
  );

  return rows;
}


/* =====================================================
 * 建立嚴格成員比對 Key
 *
 * 必須同時有 CM 與 LINE 才建立 Key
 *
 * Key 格式：
 * FULL:cm||line
 * ===================================================== */

function buildStrictMemberMatchKey_(
  cm,
  line
) {
  const normalizedCm =
    normalizeMemberKeyPart_(
      cm
    );

  const normalizedLine =
    normalizeMemberKeyPart_(
      line
    );

  if (
    !normalizedCm ||
    !normalizedLine
  ) {
    return "";
  }

  return (
    `FULL:${normalizedCm}||${normalizedLine}`
  );
}
/* =====================================================
 * 建立 CM only 比對 Key
 *
 * 用於：
 * 成員名單或週表中沒有 LINE，但 CM 有填的狀況
 *
 * Key 格式：
 * CM:cm
 * ===================================================== */

function buildCmOnlyMatchKey_(
  cm
) {
  const normalizedCm =
    normalizeMemberKeyPart_(
      cm
    );

  if (
    !normalizedCm
  ) {
    return "";
  }

  return (
    `CM:${normalizedCm}`
  );
}



/* =====================================================
 * 成員比對文字正規化
 *
 * 去前後空白
 * 轉小寫
 * ===================================================== */

function normalizeMemberKeyPart_(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


/* =====================================================
 * 用週表成績 Map 排序目前成員
 *
 * 排序規則：
 * 1. 有週表紀錄者在上
 * 2. 分數高者在上
 * 3. 分數相同時，保留目前成員名單原順序
 * 4. 沒有週表紀錄者放最下面
 * 5. 沒有週表紀錄者之間保留目前名單原順序
 *
 * 比對規則：
 * 1. 優先 CM + LINE 完整比對
 * 2. 若沒有完整比對，允許 CM only 比對
 * 3. 不使用 LINE only 比對
 * ===================================================== */

function sortCurrentMembersByWeeklyScoreMap_(
  currentMembers,
  weeklyScoreMap
) {
  const enrichedMembers =
    currentMembers.map(
      member => {
        const keys =
          buildFlexibleMemberMatchKeys_(
            member.cm,
            member.line
          );

        let matched = null;

        for (
          const key of keys
        ) {
          if (
            weeklyScoreMap[key]
          ) {
            matched =
              weeklyScoreMap[key];

            break;
          }
        }

        const hasWeeklyRecord =
          !!matched;

        return {
          cm:
            member.cm,

          line:
            member.line,

          role:
            member.role,

          colD:
            member.colD,

          originalIndex:
            member.originalIndex,

          hasWeeklyRecord:
            hasWeeklyRecord,

          score:
            hasWeeklyRecord
              ? matched.score
              : 0
        };
      }
    );

  return enrichedMembers.sort(
    (a, b) => {
      if (
        a.hasWeeklyRecord !==
        b.hasWeeklyRecord
      ) {
        return a.hasWeeklyRecord
          ? -1
          : 1;
      }

      if (
        a.hasWeeklyRecord &&
        b.hasWeeklyRecord &&
        b.score !==
        a.score
      ) {
        return (
          b.score -
          a.score
        );
      }

      return (
        a.originalIndex -
        b.originalIndex
      );
    }
  );
}



/* =====================================================
 * 回寫一般帳號
 *
 * 不移除任何目前成員
 * 清理 A:D 後重寫排序結果
 * ===================================================== */

function writeSortedFormalMembersKeepAll_(
  memberSheet,
  rows
) {
  const maxCount =
    MEMBER_FORMAL_MAX_COUNT;

  if (
    rows.length >
    maxCount
  ) {
    throw new Error(
      `一般帳號數量 ${rows.length} 超過上限 ${maxCount}。`
    );
  }

  memberSheet
    .getRange(
      MEMBER_FORMAL_FIRST_ROW,
      1,
      maxCount,
      4
    )
    .clearContent();

  if (
    rows.length <= 0
  ) {
    return;
  }

  const values =
    rows.map(
      row => [
        row.cm,
        row.line,
        row.role,
        row.colD
      ]
    );

  memberSheet
    .getRange(
      MEMBER_FORMAL_FIRST_ROW,
      1,
      values.length,
      4
    )
    .setValues(
      values
    );
}


/* =====================================================
 * 回寫回歸帳號
 *
 * 不移除任何目前回歸成員
 * 清理第 53 列以下 A:D 後重寫排序結果
 * ===================================================== */

function writeSortedReturnMembersKeepAll_(
  memberSheet,
  rows
) {
  const lastRow =
    Math.max(
      memberSheet.getLastRow(),
      MEMBER_RETURN_FIRST_ROW
    );

  const clearRowCount =
    lastRow -
    MEMBER_RETURN_FIRST_ROW +
    1;

  memberSheet
    .getRange(
      MEMBER_RETURN_FIRST_ROW,
      1,
      clearRowCount,
      4
    )
    .clearContent();

  if (
    rows.length <= 0
  ) {
    return;
  }

  const values =
    rows.map(
      row => [
        row.cm,
        row.line,
        row.role,
        row.colD
      ]
    );

  memberSheet
    .getRange(
      MEMBER_RETURN_FIRST_ROW,
      1,
      values.length,
      4
    )
    .setValues(
      values
    );
}


/* =====================================================
 * 分數正規化
 *
 * 支援：
 * 500000
 * "500,000"
 * ""
 * null
 *
 * 無法解析時視為 0
 * ===================================================== */

function normalizeScoreValue_(
  value
) {
  if (
    typeof value === "number"
  ) {
    return value;
  }

  const text =
    String(
      value || ""
    )
      .replace(
        /,/g,
        ""
      )
      .trim();

  const numberValue =
    Number(
      text
    );

  if (
    isNaN(
      numberValue
    )
  ) {
    return 0;
  }

  return numberValue;
}


/* =====================================================
 * 通用 Retry
 * ===================================================== */

function runWithRetry_(
  label,
  callback,
  maxAttempts
) {
  const attempts =
    maxAttempts || 3;

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    try {
      return callback();

    } catch (err) {
      lastError = err;

      Logger.log(
        `${label} 失敗，第 ${attempt}/${attempts} 次：` +
        (err.message || err)
      );

      if (attempt < attempts) {
        Utilities.sleep(
          1000 * attempt
        );
      }
    }
  }

  throw lastError;
}


/* =====================================================
 * 清理暫存週表
 * ===================================================== */

function cleanupTempWeeklySheets() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheets =
    ss.getSheets();

  let deletedCount = 0;

  sheets.forEach(sheet => {
    const name =
      sheet.getName();

    if (
      name.startsWith("__tmp_")
    ) {
      try {
        ss.deleteSheet(sheet);
        deletedCount++;

      } catch (err) {
        Logger.log(
          `刪除暫存表失敗：${name}，原因：` +
          (err.message || err)
        );
      }
    }
  });

  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    `暫存週表清理完成，共刪除 ${deletedCount} 張。`
  );
}


/* =====================================================
 * 讀取一般帳號
 * ===================================================== */

function readFormalMembers_(sheet) {
  const values =
    sheet
      .getRange(
        MEMBER_FORMAL_FIRST_ROW,
        1,
        MEMBER_FORMAL_MAX_COUNT,
        4
      )
      .getValues();

  return parseMemberRows_(values);
}


/* =====================================================
 * 讀取回歸帳號
 * ===================================================== */

function readReturnMembers_(sheet) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow <
    MEMBER_RETURN_FIRST_ROW
  ) {
    return [];
  }

  const values =
    sheet
      .getRange(
        MEMBER_RETURN_FIRST_ROW,
        1,
        lastRow -
        MEMBER_RETURN_FIRST_ROW +
        1,
        4
      )
      .getValues();

  return parseMemberRows_(values);
}


/* =====================================================
 * 解析成員資料
 *
 * 注意：
 * D 欄上週狀態完全不使用
 * ===================================================== */

function parseMemberRows_(values) {
  const members = [];

  for (const row of values) {
    const cm =
      String(
        row[0] || ""
      ).trim();

    const line =
      String(
        row[1] || ""
      ).trim();

    const role =
      normalizeRole_(row[2]);

    if (!cm && !line) {
      break;
    }

    members.push({
      cm,
      line,
      role
    });
  }

  return members;
}


/* =====================================================
 * 寫入週表成員列
 *
 * A CM
 * B LINE
 * C/D 活動1
 * E 活動1小計
 * F/G 活動2
 * H 活動2小計
 * I/J 活動3
 * K 活動3小計
 * L 一週總分
 * M/N 距離分數
 * O 狀態
 * P 活動1貢獻度
 * Q 活動2貢獻度
 * R 活動3貢獻度
 * S 整週貢獻度
 * ===================================================== */

function writeScoreRows_(
  sheet,
  firstRow,
  members,
  isReturnAccount
) {
  if (members.length <= 0) {
    return;
  }

  const rowCount =
    members.length;

  const values =
    members.map(member => {
      let statusValue = "";

      if (isReturnAccount) {
        statusValue = "回歸";

      } else if (
        member.role === "隊長" ||
        member.role === "副隊長"
      ) {
        statusValue =
          member.role;
      }

      return [
        member.cm,    // A
        member.line,  // B
        0,            // C 活動1投入
        0,            // D 活動1未投入
        "",           // E 活動1小計
        0,            // F 活動2投入
        0,            // G 活動2未投入
        "",           // H 活動2小計
        0,            // I 活動3投入
        0,            // J 活動3未投入
        "",           // K 活動3小計
        "",           // L 一週總分
        "",           // M 距離合格分數
        "",           // N 距離長老分數
        statusValue,  // O 狀態
        "",           // P 活動1貢獻度
        "",           // Q 活動2貢獻度
        "",           // R 活動3貢獻度
        ""            // S 整週貢獻度
      ];
    });

  sheet
    .getRange(
      firstRow,
      1,
      rowCount,
      SCORE_TABLE_LAST_COL
    )
    .setValues(values);


  /* ---------------------------------------------
   * E 活動1小計
   * --------------------------------------------- */

  sheet
    .getRange(
      firstRow,
      5,
      rowCount,
      1
    )
    .setFormulaR1C1(
      "=RC[-2]+RC[-1]"
    );


  /* ---------------------------------------------
   * H 活動2小計
   * --------------------------------------------- */

  sheet
    .getRange(
      firstRow,
      8,
      rowCount,
      1
    )
    .setFormulaR1C1(
      "=RC[-2]+RC[-1]"
    );


  /* ---------------------------------------------
   * K 活動3小計
   * --------------------------------------------- */

  sheet
    .getRange(
      firstRow,
      11,
      rowCount,
      1
    )
    .setFormulaR1C1(
      "=RC[-2]+RC[-1]"
    );


  /* ---------------------------------------------
   * L 一週總分
   * E + H + K
   * --------------------------------------------- */

  sheet
    .getRange(
      firstRow,
      12,
      rowCount,
      1
    )
    .setFormulaR1C1(
      "=RC[-7]+RC[-4]+RC[-1]"
    );


  /* ---------------------------------------------
   * M 距離合格分數
   * 依照投入分：C + F + I
   * --------------------------------------------- */

  sheet
    .getRange(
      firstRow,
      13,
      rowCount,
      1
    )
    .setFormulaR1C1(
      distanceFormulaR1C1_(
        PASS_SCORE
      )
    );


  /* ---------------------------------------------
   * N 距離長老分數
   * --------------------------------------------- */

  sheet
    .getRange(
      firstRow,
      14,
      rowCount,
      1
    )
    .setFormulaR1C1(
      distanceFormulaR1C1_(
        ELDER_SCORE
      )
    );


  /* ---------------------------------------------
   * P:S 貢獻度
   * --------------------------------------------- */

  setContributionFormula_(
    sheet,
    firstRow,
    rowCount
  );


  /* ---------------------------------------------
   * 一般帳號狀態
   * --------------------------------------------- */

  if (!isReturnAccount) {
    setFormalStatusFormulas_(
      sheet,
      firstRow,
      members
    );
  }
}


/* =====================================================
 * 貢獻度公式
 *
 * 分母為「總計」列，總計列 = 一般帳號 + 回歸帳號
 * 因此一般帳號與回歸帳號的貢獻度加總為 100%
 *
 * P = 個人活動1小計 / 全隊活動1總計
 * Q = 個人活動2小計 / 全隊活動2總計
 * R = 個人活動3小計 / 全隊活動3總計
 * S = 個人一週總分 / 全隊一週總分
 * ===================================================== */

function setContributionFormula_(
  sheet,
  firstRow,
  rowCount
) {
  const totalRow =
    getLayoutValue_(
      sheet,
      "TotalRow"
    );

  if (
    !totalRow ||
    totalRow <= 0
  ) {
    return;
  }


  /*
   * P 活動1貢獻度
   */

  sheet
    .getRange(
      firstRow,
      ACTIVITY1_CONTRIBUTION_COL,
      rowCount,
      1
    )
    .setFormulaR1C1(
      `=IF(R${totalRow}C5=0,"",RC5/R${totalRow}C5)`
    );


  /*
   * Q 活動2貢獻度
   */

  sheet
    .getRange(
      firstRow,
      ACTIVITY2_CONTRIBUTION_COL,
      rowCount,
      1
    )
    .setFormulaR1C1(
      `=IF(R${totalRow}C8=0,"",RC8/R${totalRow}C8)`
    );


  /*
   * R 活動3貢獻度
   */

  sheet
    .getRange(
      firstRow,
      ACTIVITY3_CONTRIBUTION_COL,
      rowCount,
      1
    )
    .setFormulaR1C1(
      `=IF(R${totalRow}C11=0,"",RC11/R${totalRow}C11)`
    );


  /*
   * S 整週貢獻度
   */

  sheet
    .getRange(
      firstRow,
      WEEKLY_CONTRIBUTION_COL,
      rowCount,
      1
    )
    .setFormulaR1C1(
      `=IF(R${totalRow}C12=0,"",RC12/R${totalRow}C12)`
    );
}


/* =====================================================
 * 寫入總計列
 *
 * 總計 = 一般帳號 + 回歸帳號
 * 回歸帳號打的分數也屬於全隊產出，
 * 必須算進貢獻度分母，否則回歸帳號的貢獻度會被高估、
 * 全隊貢獻度加總也會超過 100%。
 * ===================================================== */

function writeTotalRow_(
  sheet,
  totalRow,
  formalLastRow,
  returnFirstRow,
  returnLastRow
) {
  const hasReturnRows =
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow;

  sheet
    .getRange(
      totalRow,
      1,
      1,
      SCORE_TABLE_LAST_COL
    )
    .setValues([
      new Array(
        SCORE_TABLE_LAST_COL
      ).fill("")
    ]);

  sheet
    .getRange(
      totalRow,
      1
    )
    .setValue("總計");


  /* ---------------------------------------------
   * C:L
   * 一般帳號區 + 回歸帳號區
   * --------------------------------------------- */

  for (
    let col = 3;
    col <= 12;
    col++
  ) {
    const colLetter =
      columnToLetter_(col);

    let formula =
      `=SUM(` +
      `${colLetter}${SCORE_FORMAL_FIRST_ROW}:` +
      `${colLetter}${formalLastRow}` +
      `)`;

    if (hasReturnRows) {
      formula +=
        `+SUM(` +
        `${colLetter}${returnFirstRow}:` +
        `${colLetter}${returnLastRow}` +
        `)`;
    }

    sheet
      .getRange(
        totalRow,
        col
      )
      .setFormula(formula);
  }


  /* ---------------------------------------------
   * P:S 貢獻度總計
   *
   * 一般帳號 + 回歸帳號總和 = 100%
   * 若該活動總分為 0，則留空
   * --------------------------------------------- */

  sheet
    .getRange(
      totalRow,
      ACTIVITY1_CONTRIBUTION_COL
    )
    .setFormula(
      `=IF(E${totalRow}=0,"",1)`
    );

  sheet
    .getRange(
      totalRow,
      ACTIVITY2_CONTRIBUTION_COL
    )
    .setFormula(
      `=IF(H${totalRow}=0,"",1)`
    );

  sheet
    .getRange(
      totalRow,
      ACTIVITY3_CONTRIBUTION_COL
    )
    .setFormula(
      `=IF(K${totalRow}=0,"",1)`
    );

  sheet
    .getRange(
      totalRow,
      WEEKLY_CONTRIBUTION_COL
    )
    .setFormula(
      `=IF(L${totalRow}=0,"",1)`
    );
}


/* =====================================================
 * 一般帳號狀態公式
 *
 * ≥ 500,000 → 長老
 * ≥ 200,000 → PASS
 * < 200,000 → 淘汰
 *
 * 隊長 / 副隊長不套用
 * ===================================================== */

function setFormalStatusFormulas_(
  sheet,
  firstRow,
  members
) {
  let segmentStart = null;
  let segmentLength = 0;

  const flushSegment = () => {
    if (
      segmentStart === null ||
      segmentLength <= 0
    ) {
      return;
    }

    sheet
      .getRange(
        segmentStart,
        STATUS_COL,
        segmentLength,
        1
      )
      .setFormulaR1C1(
        statusFormulaR1C1_()
      );

    segmentStart = null;
    segmentLength = 0;
  };

  members.forEach(
    (member, index) => {
      const row =
        firstRow + index;

      const isLeader =
        member.role === "隊長" ||
        member.role === "副隊長";

      if (isLeader) {
        flushSegment();
        return;
      }

      if (segmentStart === null) {
        segmentStart = row;
        segmentLength = 1;

      } else {
        segmentLength++;
      }
    }
  );

  flushSegment();
}


/* =====================================================
 * 正規化職位
 * ===================================================== */

function normalizeRole_(value) {
  const role =
    String(
      value || ""
    ).trim();

  if (role === "隊長") {
    return "隊長";
  }

  if (role === "副隊長") {
    return "副隊長";
  }

  return "";
}


/* =====================================================
 * 表頭
 *
 * A:S
 * P 活動1貢獻度
 * Q 活動2貢獻度
 * R 活動3貢獻度
 * S 整週貢獻度
 * ===================================================== */

function fillHeaders_(sheet) {
  const headers = [[
    "CM",

    "LINE名稱",

    "活動1\n投入",
    "活動1\n未投入",
    "活動1\n小計",

    "活動2\n投入",
    "活動2\n未投入",
    "活動2\n小計",

    "活動3\n投入",
    "活動3\n未投入",
    "活動3\n小計",

    "一週總分",

    "距離合格分數",

    "距離長老分數",

    "狀態",

    "活動1\n貢獻度",

    "活動2\n貢獻度",

    "活動3\n貢獻度",

    "整週\n貢獻度"
  ]];

  runWithRetry_(
    "寫入表頭",
    () => {
      sheet
        .getRange(
          1,
          1,
          1,
          SCORE_TABLE_LAST_COL
        )
        .setValues(headers);

      SpreadsheetApp.flush();
    },
    3
  );
}


/* =====================================================
 * 距離分數公式
 *
 * 目前依「投入分」 C + F + I
 * ===================================================== */

function distanceFormulaR1C1_(
  targetScore
) {
  return (
    `=IF(` +
    `(RC3+RC6+RC9)>=${targetScore},` +
    `"",` +
    `TEXT(` +
    `${targetScore}-(RC3+RC6+RC9),` +
    `"#,##0"` +
    `)` +
    `)`
  );
}


/* =====================================================
 * 狀態公式
 *
 * 目前依「投入分」 C + F + I
 * ===================================================== */

function statusFormulaR1C1_() {
  return (
    `=IF(` +
    `(RC3+RC6+RC9)>=${ELDER_SCORE},` +
    `"長老",` +

    `IF(` +
    `(RC3+RC6+RC9)>=${PASS_SCORE},` +
    `"PASS",` +

    `"淘汰"` +
    `)` +
    `)`
  );
}


/* =====================================================
 * 儲存版面資訊
 *
 * AA:AB
 * ===================================================== */

function storeLayoutInfo_(
  sheet,
  layout
) {
  if (
    sheet.getMaxColumns() <
    LAYOUT_INFO_LAST_COL
  ) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      LAYOUT_INFO_LAST_COL -
      sheet.getMaxColumns()
    );
  }

  const data = [
    [
      "FormalFirstRow",
      layout.formalFirstRow
    ],

    [
      "FormalLastRow",
      layout.formalLastRow
    ],

    [
      "TotalRow",
      layout.totalRow
    ],

    [
      "ReturnTitleRow",
      layout.returnTitleRow
    ],

    [
      "ReturnFirstRow",
      layout.returnFirstRow
    ],

    [
      "ReturnLastRow",
      layout.returnLastRow
    ]
  ];

  sheet
    .getRange(
      1,
      LAYOUT_INFO_FIRST_COL,
      data.length,
      2
    )
    .setValues(data);

  sheet.hideColumns(
    LAYOUT_INFO_FIRST_COL,
    2
  );
}


/* =====================================================
 * 取得版面資訊
 * ===================================================== */

function getLayoutValue_(
  sheet,
  keyName
) {
  if (
    sheet.getMaxColumns() <
    LAYOUT_INFO_LAST_COL
  ) {
    return 0;
  }

  const values =
    sheet
      .getRange(
        1,
        LAYOUT_INFO_FIRST_COL,
        20,
        2
      )
      .getValues();

  for (const row of values) {
    if (
      String(row[0]) === keyName
    ) {
      return (
        Number(row[1]) || 0
      );
    }
  }

  return 0;
}


/* =====================================================
 * 修正目前週表總計與貢獻度公式
 *
 * 舊版週表的總計只加一般帳號，
 * 回歸帳號的貢獻度分母少算了回歸帳號自己的分數。
 * 此功能會依 AA:AB 版面資訊重寫：
 * 1. 總計列 C:L = 一般帳號 + 回歸帳號
 * 2. 一般帳號與回歸帳號 P:S 貢獻度公式
 *
 * 不會修改任何輸入分數。
 * ===================================================== */

function repairActiveWeeklyContributionFormulas() {
  const ui =
    SpreadsheetApp.getUi();

  const sheet =
    SpreadsheetApp.getActiveSheet();

  if (
    !isWeeklyScoreSheetName_(
      sheet.getName()
    )
  ) {
    ui.alert(
      "目前工作表不是週積分表。"
    );

    return;
  }

  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const totalRow =
    getLayoutValue_(
      sheet,
      "TotalRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );

  if (
    formalFirstRow <= 0 ||
    formalLastRow < formalFirstRow ||
    totalRow <= 0
  ) {
    ui.alert(
      "找不到週表版面資訊（AA:AB），無法修正。"
    );

    return;
  }

  writeTotalRow_(
    sheet,
    totalRow,
    formalLastRow,
    returnFirstRow,
    returnLastRow
  );

  setContributionFormula_(
    sheet,
    formalFirstRow,
    formalLastRow -
    formalFirstRow +
    1
  );

  if (
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow
  ) {
    setContributionFormula_(
      sheet,
      returnFirstRow,
      returnLastRow -
      returnFirstRow +
      1
    );
  }

  SpreadsheetApp.flush();

  reapplyAfterSortStyles_(
    sheet
  );

  ui.alert(
    `已修正「${sheet.getName()}」：\n\n` +
    `總計列已包含回歸帳號分數，\n` +
    `全部成員貢獻度加總為 100%。`
  );
}


/* =====================================================
 * 編輯後自動排序
 *
 * C/D/F/G/I/J
 * ===================================================== */

function onEdit(e) {
  if (
    !e ||
    !e.range
  ) {
    return;
  }

  const sheet =
    e.range.getSheet();

  if (
    !isWeeklyScoreSheetName_(
      sheet.getName()
    )
  ) {
    return;
  }

  const col =
    e.range.getColumn();

  const row =
    e.range.getRow();

  const inputCols = [
    3, 4,
    6, 7,
    9, 10
  ];

  if (
    !inputCols.includes(col)
  ) {
    return;
  }

  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );

  const isFormalRow =
    row >= formalFirstRow &&
    row <= formalLastRow;

  const isReturnRow =
    returnLastRow >= returnFirstRow &&
    row >= returnFirstRow &&
    row <= returnLastRow;

  if (
    !isFormalRow &&
    !isReturnRow
  ) {
    return;
  }

  SpreadsheetApp.flush();

  sortWeeklyScoreSheet_(
    sheet
  );

  reapplyAfterSortStyles_(
    sheet
  );
}


/* =====================================================
 * 手動重新排序目前週表
 * ===================================================== */

function sortActiveWeeklyScoreSheet() {
  const sheet =
    SpreadsheetApp.getActiveSheet();

  if (
    !isWeeklyScoreSheetName_(
      sheet.getName()
    )
  ) {
    SpreadsheetApp.getUi().alert(
      "目前工作表不是週積分表。"
    );

    return;
  }

  SpreadsheetApp.flush();

  sortWeeklyScoreSheet_(
    sheet
  );

  reapplyAfterSortStyles_(
    sheet
  );

  SpreadsheetApp.getUi().alert(
    "目前週表已重新排序。"
  );
}


/* =====================================================
 * 週表排序
 *
 * 依 L 一週總分由高到低
 * ===================================================== */

function sortWeeklyScoreSheet_(
  sheet
) {
  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );

  if (
    formalFirstRow > 0 &&
    formalLastRow >= formalFirstRow
  ) {
    sheet
      .getRange(
        formalFirstRow,
        1,
        formalLastRow -
        formalFirstRow +
        1,
        SCORE_TABLE_LAST_COL
      )
      .sort({
        column: 12,
        ascending: false
      });
  }

  if (
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow
  ) {
    sheet
      .getRange(
        returnFirstRow,
        1,
        returnLastRow -
        returnFirstRow +
        1,
        SCORE_TABLE_LAST_COL
      )
      .sort({
        column: 12,
        ascending: false
      });
  }
}


/* =====================================================
 * 初次格式化週表
 * ===================================================== */

function formatScoreSheet_(
  sheet
) {
  applyHeaderStyles_(sheet);

  applyBaseRowColors_(sheet);

  applyInputAndResultStyles_(sheet);

  applySummaryRowsStyles_(sheet);

  applyBorders_(sheet);

  applyContributionStyles_(sheet);

  try {
    applyStatusConditionalFormatting_(
      sheet
    );

  } catch (err) {
    Logger.log(
      "條件式格式建立失敗：" +
      (err.message || err)
    );
  }

  sheet.setFrozenRows(1);
}


/* =====================================================
 * 排序後重新套用格式
 * ===================================================== */

function reapplyAfterSortStyles_(
  sheet
) {
  applyBaseRowColors_(sheet);

  applyInputAndResultStyles_(sheet);

  applySummaryRowsStyles_(sheet);

  applyContributionStyles_(sheet);

  applyBorders_(sheet);
}


/* =====================================================
 * 表頭格式
 *
 * 保留原本舊版配色
 * ===================================================== */

function applyHeaderStyles_(
  sheet
) {
  const header =
    sheet.getRange(
      1,
      1,
      1,
      SCORE_TABLE_LAST_COL
    );

  header
    .setBackground("#4472C4")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.setRowHeight(
    1,
    40
  );


  /*
   * 活動投入：深藍
   */

  sheet
    .getRange("C1")
    .setBackground("#1F497D");

  sheet
    .getRange("F1")
    .setBackground("#1F497D");

  sheet
    .getRange("I1")
    .setBackground("#1F497D");


  /*
   * 活動未投入：橘色
   */

  sheet
    .getRange("D1")
    .setBackground("#ED7D31");

  sheet
    .getRange("G1")
    .setBackground("#ED7D31");

  sheet
    .getRange("J1")
    .setBackground("#ED7D31");


  /*
   * 活動小計：綠色
   */

  sheet
    .getRange("E1")
    .setBackground("#70AD47");

  sheet
    .getRange("H1")
    .setBackground("#70AD47");

  sheet
    .getRange("K1")
    .setBackground("#70AD47");


  /*
   * 狀態：灰色
   */

  sheet
    .getRange("O1")
    .setBackground("#666666")
    .setFontColor("#FFFFFF");


  /*
   * P:S 貢獻度：藍色
   */

  sheet
    .getRange("P1:S1")
    .setBackground("#5B9BD5")
    .setFontColor("#FFFFFF");


  /*
   * 欄寬
   */

  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 130);

  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 80);

  sheet.setColumnWidth(6, 80);
  sheet.setColumnWidth(7, 80);
  sheet.setColumnWidth(8, 80);

  sheet.setColumnWidth(9, 80);
  sheet.setColumnWidth(10, 80);
  sheet.setColumnWidth(11, 80);

  sheet.setColumnWidth(12, 90);
  sheet.setColumnWidth(13, 100);
  sheet.setColumnWidth(14, 100);
  sheet.setColumnWidth(15, 80);

  sheet.setColumnWidth(16, 105);
  sheet.setColumnWidth(17, 105);
  sheet.setColumnWidth(18, 105);
  sheet.setColumnWidth(19, 110);

  sheet
    .getRange(
      1,
      1,
      sheet.getMaxRows(),
      SCORE_TABLE_LAST_COL
    )
    .setVerticalAlignment("middle");
}


/* =====================================================
 * 基本列格式
 *
 * 一般帳號：藍白交錯
 * 回歸帳號：淡橘白交錯
 * ===================================================== */

function applyBaseRowColors_(
  sheet
) {
  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );


  /*
   * 一般帳號：藍白交錯
   */

  if (
    formalFirstRow > 0 &&
    formalLastRow >= formalFirstRow
  ) {
    const rowCount =
      formalLastRow - formalFirstRow + 1;

    const backgrounds = [];

    for (
      let i = 0;
      i < rowCount;
      i++
    ) {
      const row =
        formalFirstRow + i;

      const color =
        row % 2 === 0
          ? "#D9E1F2"
          : "#FFFFFF";

      backgrounds.push(
        new Array(
          SCORE_TABLE_LAST_COL
        ).fill(color)
      );
    }

    sheet
      .getRange(
        formalFirstRow,
        1,
        rowCount,
        SCORE_TABLE_LAST_COL
      )
      .setBackgrounds(backgrounds)
      .setVerticalAlignment("middle");
  }


  /*
   * 回歸帳號：淡橘白交錯
   */

  if (
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow
  ) {
    const rowCount =
      returnLastRow - returnFirstRow + 1;

    const backgrounds = [];

    for (
      let i = 0;
      i < rowCount;
      i++
    ) {
      const row =
        returnFirstRow + i;

      const color =
        row % 2 === 0
          ? "#FCE4D6"
          : "#FFFFFF";

      backgrounds.push(
        new Array(
          SCORE_TABLE_LAST_COL
        ).fill(color)
      );
    }

    sheet
      .getRange(
        returnFirstRow,
        1,
        rowCount,
        SCORE_TABLE_LAST_COL
      )
      .setBackgrounds(backgrounds)
      .setVerticalAlignment("middle");
  }
}


/* =====================================================
 * 輸入與結果格式
 * ===================================================== */

function applyInputAndResultStyles_(
  sheet
) {
  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );

  if (
    formalFirstRow > 0 &&
    formalLastRow >= formalFirstRow
  ) {
    applyInputAndResultStylesForBlock_(
      sheet,
      formalFirstRow,
      formalLastRow
    );
  }

  if (
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow
  ) {
    applyInputAndResultStylesForBlock_(
      sheet,
      returnFirstRow,
      returnLastRow
    );
  }
}


/* =====================================================
 * 單一區塊欄位格式
 * ===================================================== */

function applyInputAndResultStylesForBlock_(
  sheet,
  firstRow,
  lastRow
) {
  const rowCount =
    lastRow - firstRow + 1;

  if (rowCount <= 0) {
    return;
  }

  /*
   * 全區基本對齊
   */

  sheet
    .getRange(
      firstRow,
      1,
      rowCount,
      SCORE_TABLE_LAST_COL
    )
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");


  /*
   * A:B 名稱欄
   */

  sheet
    .getRange(
      firstRow,
      1,
      rowCount,
      2
    )
    .setFontWeight("bold")
    .setHorizontalAlignment("center");


  /*
   * C / F / I：活動投入
   */

  [3, 6, 9].forEach(
    col => {
      sheet
        .getRange(
          firstRow,
          col,
          rowCount,
          1
        )
        .setBackground("#C5D9F1")
        .setFontColor("#1F497D")
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setNumberFormat("#,##0");
    }
  );


  /*
   * D / G / J：活動未投入
   */

  [4, 7, 10].forEach(
    col => {
      sheet
        .getRange(
          firstRow,
          col,
          rowCount,
          1
        )
        .setBackground("#FCE4D6")
        .setFontColor("#9C5700")
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setNumberFormat("#,##0");
    }
  );


  /*
   * E / H / K：活動小計
   */

  [5, 8, 11].forEach(
    col => {
      sheet
        .getRange(
          firstRow,
          col,
          rowCount,
          1
        )
        .setBackground("#E2EFDA")
        .setFontColor("#006600")
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setNumberFormat("#,##0");
    }
  );


  /*
   * L：一週總分
   */

  sheet
    .getRange(
      firstRow,
      12,
      rowCount,
      1
    )
    .setBackground("#FFF2CC")
    .setFontColor("#C00000")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setNumberFormat("#,##0");


  /*
   * M：距離合格分數
   */

  sheet
    .getRange(
      firstRow,
      13,
      rowCount,
      1
    )
    .setBackground("#FFEBDC")
    .setFontColor("#FF6600")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");


  /*
   * N：距離長老分數
   */

  sheet
    .getRange(
      firstRow,
      14,
      rowCount,
      1
    )
    .setBackground("#FFF8C8")
    .setFontColor("#996600")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");


  /*
   * O：狀態
   * 實際顏色由條件式格式控制
   */

  sheet
    .getRange(
      firstRow,
      STATUS_COL,
      rowCount,
      1
    )
    .setFontWeight("bold")
    .setHorizontalAlignment("center");


  /*
   * P:S：貢獻度
   */

  sheet
    .getRange(
      firstRow,
      CONTRIBUTION_FIRST_COL,
      rowCount,
      CONTRIBUTION_LAST_COL - CONTRIBUTION_FIRST_COL + 1
    )
    .setBackground("#DDEBF7")
    .setFontColor("#1F4E79")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setNumberFormat("0.00%");
}


/* =====================================================
 * 貢獻度格式
 *
 * P:S 顯示百分比
 * ===================================================== */

function applyContributionStyles_(
  sheet
) {
  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const totalRow =
    getLayoutValue_(
      sheet,
      "TotalRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );

  const contributionColCount =
    CONTRIBUTION_LAST_COL -
    CONTRIBUTION_FIRST_COL +
    1;


  /*
   * 一般帳號 P:S
   */

  if (
    formalFirstRow > 0 &&
    formalLastRow >= formalFirstRow
  ) {
    sheet
      .getRange(
        formalFirstRow,
        CONTRIBUTION_FIRST_COL,
        formalLastRow -
        formalFirstRow +
        1,
        contributionColCount
      )
      .setNumberFormat(
        "0.00%"
      );
  }


  /*
   * 總計 P:S
   */

  if (totalRow > 0) {
    sheet
      .getRange(
        totalRow,
        CONTRIBUTION_FIRST_COL,
        1,
        contributionColCount
      )
      .setNumberFormat(
        "0.00%"
      );
  }


  /*
   * 回歸帳號 P:S
   */

  if (
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow
  ) {
    sheet
      .getRange(
        returnFirstRow,
        CONTRIBUTION_FIRST_COL,
        returnLastRow -
        returnFirstRow +
        1,
        contributionColCount
      )
      .setNumberFormat(
        "0.00%"
      );
  }
}


/* =====================================================
 * 總計與回歸標題格式
 * ===================================================== */

function applySummaryRowsStyles_(
  sheet
) {
  const totalRow =
    getLayoutValue_(
      sheet,
      "TotalRow"
    );

  const returnTitleRow =
    getLayoutValue_(
      sheet,
      "ReturnTitleRow"
    );


  /*
   * 總計列：舊版黃色
   */

  if (totalRow > 0) {
    sheet
      .getRange(
        totalRow,
        1,
        1,
        SCORE_TABLE_LAST_COL
      )
      .setBackground("#FFD966")
      .setFontWeight("bold")
      .setFontColor("#000000")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    sheet
      .getRange(
        totalRow,
        3,
        1,
        10
      )
      .setNumberFormat("#,##0");

    sheet
      .getRange(
        totalRow,
        CONTRIBUTION_FIRST_COL,
        1,
        CONTRIBUTION_LAST_COL - CONTRIBUTION_FIRST_COL + 1
      )
      .setNumberFormat("0.00%");
  }


  /*
   * 回歸帳號標題：舊版橘色，合併 A:S
   */

  if (returnTitleRow > 0) {
    const range =
      sheet.getRange(
        returnTitleRow,
        1,
        1,
        SCORE_TABLE_LAST_COL
      );

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
 * 邊框
 * ===================================================== */

function applyBorders_(
  sheet
) {
  const formalFirstRow =
    getLayoutValue_(
      sheet,
      "FormalFirstRow"
    );

  const formalLastRow =
    getLayoutValue_(
      sheet,
      "FormalLastRow"
    );

  const totalRow =
    getLayoutValue_(
      sheet,
      "TotalRow"
    );

  const returnTitleRow =
    getLayoutValue_(
      sheet,
      "ReturnTitleRow"
    );

  const returnFirstRow =
    getLayoutValue_(
      sheet,
      "ReturnFirstRow"
    );

  const returnLastRow =
    getLayoutValue_(
      sheet,
      "ReturnLastRow"
    );


  /*
   * 表頭
   */

  sheet
    .getRange(
      1,
      1,
      1,
      SCORE_TABLE_LAST_COL
    )
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#95B3D7",
      SpreadsheetApp.BorderStyle.SOLID
    );


  /*
   * 一般帳號
   */

  if (
    formalFirstRow > 0 &&
    formalLastRow >= formalFirstRow
  ) {
    sheet
      .getRange(
        formalFirstRow,
        1,
        formalLastRow -
        formalFirstRow +
        1,
        SCORE_TABLE_LAST_COL
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#95B3D7",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }


  /*
   * 總計
   */

  if (totalRow > 0) {
    sheet
      .getRange(
        totalRow,
        1,
        1,
        SCORE_TABLE_LAST_COL
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#95B3D7",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }


  /*
   * 回歸標題
   */

  if (returnTitleRow > 0) {
    sheet
      .getRange(
        returnTitleRow,
        1,
        1,
        SCORE_TABLE_LAST_COL
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#95B3D7",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }


  /*
   * 回歸帳號
   */

  if (
    returnFirstRow > 0 &&
    returnLastRow >= returnFirstRow
  ) {
    sheet
      .getRange(
        returnFirstRow,
        1,
        returnLastRow -
        returnFirstRow +
        1,
        SCORE_TABLE_LAST_COL
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        "#95B3D7",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }
}


/* =====================================================
 * 狀態條件式格式
 *
 * 保留原本舊版 O 欄配色
 * ===================================================== */

function applyStatusConditionalFormatting_(
  sheet
) {
  const statusRange =
    sheet.getRange(
      2,
      STATUS_COL,
      STATUS_COLOR_MAX_ROW - 1,
      1
    );

  const rules = [];

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("長老")
      .setBackground("#FFD966")
      .setFontColor("#000000")
      .setRanges([
        statusRange
      ])
      .build()
  );

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("PASS")
      .setBackground("#93C47D")
      .setFontColor("#000000")
      .setRanges([
        statusRange
      ])
      .build()
  );

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("淘汰")
      .setBackground("#E06666")
      .setFontColor("#FFFFFF")
      .setRanges([
        statusRange
      ])
      .build()
  );

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("隊長")
      .setBackground("#674EA7")
      .setFontColor("#FFFFFF")
      .setRanges([
        statusRange
      ])
      .build()
  );

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("副隊長")
      .setBackground("#8E7CC3")
      .setFontColor("#FFFFFF")
      .setRanges([
        statusRange
      ])
      .build()
  );

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("回歸")
      .setBackground("#76A5AF")
      .setFontColor("#FFFFFF")
      .setRanges([
        statusRange
      ])
      .build()
  );

  rules.push(
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("降級")
      .setBackground("#FF8000")
      .setFontColor("#FFFFFF")
      .setRanges([
        statusRange
      ])
      .build()
  );

  sheet.setConditionalFormatRules(
    rules
  );
}


/* =====================================================
 * 修復目前週表 O 欄狀態顏色
 * ===================================================== */

function repairActiveWeeklyStatusColors() {
  const sheet =
    SpreadsheetApp.getActiveSheet();

  if (
    !isWeeklyScoreSheetName_(
      sheet.getName()
    )
  ) {
    SpreadsheetApp.getUi().alert(
      "目前工作表不是週積分表。"
    );

    return;
  }

  applyStatusConditionalFormatting_(
    sheet
  );

  SpreadsheetApp.getUi().alert(
    "目前週表 O 欄狀態顏色已修復。"
  );
}


/* =====================================================
 * 檢查目前週表條件式格式
 * ===================================================== */

function checkActiveSheetConditionalFormatRanges() {
  const sheet =
    SpreadsheetApp.getActiveSheet();

  if (
    !isWeeklyScoreSheetName_(
      sheet.getName()
    )
  ) {
    SpreadsheetApp.getUi().alert(
      "目前工作表不是週積分表。"
    );

    return;
  }

  const rules =
    sheet.getConditionalFormatRules();

  const lines =
    rules.map(
      (rule, index) => {
        const ranges =
          rule
            .getRanges()
            .map(
              range =>
                range.getA1Notation()
            )
            .join(", ");

        return (
          `規則 ${index + 1}: ` +
          `${ranges}`
        );
      }
    );

  SpreadsheetApp.getUi().alert(
    lines.length > 0
      ? lines.join("\n")
      : "目前工作表沒有條件式格式規則。"
  );
}


/* =====================================================
 * 判斷是否為週積分表
 *
 * 目前命名格式：
 * 2026-09-w1
 * 2026-09-w2
 * ===================================================== */

function isWeeklyScoreSheetName_(
  sheetName
) {
  return /^\d{4}-\d{2}-w\d+$/
    .test(
      String(sheetName || "")
    );
}


/* =====================================================
 * 取得週表名稱
 *
 * 例如：
 * 2026/08/03 → 2026-08-w1
 * 2026/08/10 → 2026-08-w2
 * 2026/08/17 → 2026-08-w3
 * 2026/08/24 → 2026-08-w4
 * 2026/08/31 → 2026-08-w5
 * ===================================================== */

function getWeeklySheetName_(targetDate) {
  const monday =
    getMondayOfWeek_(targetDate);

  const year =
    monday.getFullYear();

  const month =
    String(
      monday.getMonth() + 1
    ).padStart(2, "0");

  const weekNumber =
    getMondayIndexInMonth_(monday);

  return `${year}-${month}-w${weekNumber}`;
}


/* =====================================================
 * 取得指定日期所在週的星期一
 * ===================================================== */

function getMondayOfWeek_(date) {
  const result =
    new Date(date);

  result.setHours(
    0,
    0,
    0,
    0
  );

  const day =
    result.getDay();

  const diffToMonday =
    day === 0
      ? -6
      : 1 - day;

  result.setDate(
    result.getDate() + diffToMonday
  );

  return result;
}


/* =====================================================
 * 判斷該星期一是當月第幾個星期一
 * ===================================================== */

function getMondayIndexInMonth_(monday) {
  const year =
    monday.getFullYear();

  const month =
    monday.getMonth();

  const firstDayOfMonth =
    new Date(
      year,
      month,
      1
    );

  firstDayOfMonth.setHours(
    0,
    0,
    0,
    0
  );

  const firstDayWeekday =
    firstDayOfMonth.getDay();

  const daysToFirstMonday =
    firstDayWeekday === 0
      ? 1
      : (8 - firstDayWeekday) % 7;

  const firstMonday =
    new Date(
      year,
      month,
      1 + daysToFirstMonday
    );

  firstMonday.setHours(
    0,
    0,
    0,
    0
  );

  const diffDays =
    Math.floor(
      (monday - firstMonday) / 86400000
    );

  return (
    Math.floor(diffDays / 7) + 1
  );
}


/* =====================================================
 * 欄位編號轉英文字母
 *
 * 1 → A
 * 19 → S
 * ===================================================== */

function columnToLetter_(
  column
) {
  let temp = "";
  let letter = "";

  while (column > 0) {
    temp =
      (column - 1) % 26;

    letter =
      String.fromCharCode(
        temp + 65
      ) +
      letter;

    column =
      Math.floor(
        (column - temp - 1) / 26
      );
  }

  return letter;
}


/* =====================================================
 * 測試週表命名
 * ===================================================== */

function testWeeklySheetNames() {
  const dates = [
    new Date(2026, 7, 3),
    new Date(2026, 7, 10),
    new Date(2026, 7, 17),
    new Date(2026, 7, 24),
    new Date(2026, 7, 31),
    new Date(2026, 8, 1),
    new Date(2026, 8, 2)
  ];

  dates.forEach(date => {
    Logger.log(
      `${date.toDateString()} => ${getWeeklySheetName_(date)}`
    );
  });
}
