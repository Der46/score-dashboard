/* ================================
   Config / Constants
================================ */

const WEEK_INDEX_URL = "./data/weeks.csv";

const HISTORY_MIN_WEEKS = 2;
const HISTORY_MODE = "appeared";

const STATUS = {
    ALL: "全部",
    PASS: "PASS",
    OUT: "淘汰",
    RETURN: "回歸",
    DOWNGRADE: "降級",
    ELDER: "長老",
    CAPTAIN: "隊長",
    VICE_CAPTAIN: "副隊長",
    NO_DATA: "無資料"
};

const ROW_TYPE = {
    PERSON: "person",
    SECTION: "section",
    TOTAL: "total"
};

const SPECIAL_CM = {
    RETURN_SECTION: "【回歸帳號】",
    TOTAL: "總計"
};

const TREND = {
    UP: "up",
    DOWN: "down",
    SAME: "same",
    NEW: "new"
};

const HISTORY_LEVEL = {
    NONE: "none",
    WATCH: "watch",
    RISK: "risk"
};

const EXCLUDED_STATUSES = [
    STATUS.RETURN,
    STATUS.VICE_CAPTAIN,
    STATUS.CAPTAIN
];

const RANK_COLUMN = "編號";
const MONTH_TOTAL_COLUMN = "本月總分";
const HISTORY_COLUMN = "本月後五";

const SPECIAL_STATUS_FILTERS = {
    EVER_BOTTOM_FIVE: "__everBottomFive",
    MONTH_TOTAL_SCORE_SORT: "__monthTotalScoreSort"
};

const DISPLAY_HEADERS = [
    RANK_COLUMN,
    "CM",
    "活動1總分",
    "活動2總分",
    "活動3總分",
    "一週總分",
    MONTH_TOTAL_COLUMN,
    "距離合格分數",
    "距離長老分數",
    "較上週",
    HISTORY_COLUMN,
    "狀態"
];

const ACHIEVEMENT_BADGES = {
    MVP: {
        key: "mvp",
        title: "本月 MVP",
        subtitle: "本月總分最高",
        icon: "🏆",
        accent: "gold",
        emptyText: "暫無本月總分資料"
    },
    IMPROVER: {
        key: "improver",
        title: "進步王",
        subtitle: "最後一週 - 第一週最高",
        icon: "🚀",
        accent: "green",
        emptyText: "週數不足，暫無進步資料"
    },
    STABLE: {
        key: "stable",
        title: "穩定王",
        subtitle: "波動最小且平均高",
        icon: "🛡️",
        accent: "blue",
        emptyText: "週數不足，暫無穩定資料"
    },
    BURST: {
        key: "burst",
        title: "爆發王",
        subtitle: "單週最高分最高",
        icon: "⚡",
        accent: "orange",
        emptyText: "暫無單週分數資料"
    },
    POTENTIAL: {
        key: "potential",
        title: "潛力股",
        subtitle: "最近兩週連續上升",
        icon: "🌱",
        accent: "purple",
        emptyText: "週數不足或無連續上升"
    }
};

const ROLE_META = {
    [STATUS.ELDER]: {
        rowClass: "row-elder",
        rankBadgeClass: "rank-badge rank-badge-elder",
        personLinkClass: "person-link elder-link",
        badgeClass: "badge-elder",
        title: "長老"
    },
    [STATUS.CAPTAIN]: {
        rowClass: "row-captain",
        rankBadgeClass: "rank-badge rank-badge-captain",
        personLinkClass: "person-link captain-link",
        badgeClass: "badge-captain",
        title: "隊長"
    },
    [STATUS.VICE_CAPTAIN]: {
        rowClass: "row-vice",
        rankBadgeClass: "rank-badge rank-badge-vice",
        personLinkClass: "person-link vice-link",
        badgeClass: "badge-vice",
        title: "副隊長"
    }
};

const STATUS_BADGE_CLASS = {
    [STATUS.PASS]: "badge-pass",
    [STATUS.OUT]: "badge-out",
    [STATUS.RETURN]: "badge-return",
    [STATUS.ELDER]: ROLE_META[STATUS.ELDER].badgeClass,
    [STATUS.CAPTAIN]: ROLE_META[STATUS.CAPTAIN].badgeClass,
    [STATUS.VICE_CAPTAIN]: ROLE_META[STATUS.VICE_CAPTAIN].badgeClass
};

const STATUS_TITLE = {
    [STATUS.ELDER]: "長老",
    [STATUS.CAPTAIN]: "隊長",
    [STATUS.VICE_CAPTAIN]: "副隊長",
    [STATUS.PASS]: "本週合格",
    [STATUS.OUT]: "本週淘汰",
    [STATUS.DOWNGRADE]: "本週降級"
};

const els = {
    weekSelect: document.getElementById("weekSelect"),
    stats: document.getElementById("stats"),
    tableHead: document.getElementById("tableHead"),
    tableBody: document.getElementById("tableBody"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    resultHint: document.getElementById("resultHint"),
    profileModal: document.getElementById("profileModal"),
    profileClose: document.getElementById("profileClose"),
    profileName: document.getElementById("profileName"),
    profileMeta: document.getElementById("profileMeta"),
    profileBody: document.getElementById("profileBody"),
    get achievements() {
        return document.getElementById("achievementsPodium");
    },
    get profileDialog() {
        return document.querySelector(".profile-dialog");
    }
};

const state = {
    weeks: [],
    currentWeek: null,
    currentRows: [],
    historySummaryMap: new Map(),
    monthlyTotalMap: new Map(),
    monthlyAchievementMap: new Map(),
    achievements: [],
    historyScopeWeekCount: 0,
    historyScopeLabel: "本月",
    weekRowsCache: new Map(),
    hasRenderedTableOnce: false
};

/* ================================
   Utilities
================================ */

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function createClassName(...classes) {
    return classes.filter(Boolean).join(" ");
}

function debounce(fn, delay = 180) {
    let timer = null;

    return (...args) => {
        clearTimeout(timer);

        timer = setTimeout(() => {
            fn(...args);
        }, delay);
    };
}

function parseNumber(value) {
    if (!value) return 0;

    return Number(String(value).replaceAll(",", "").trim()) || 0;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("zh-TW");
}

function formatCompactNumber(value) {
    const number = Number(value || 0);
    const abs = Math.abs(number);

    if (abs >= 100000000) {
        return `${(number / 100000000).toLocaleString("zh-TW", {
            maximumFractionDigits: 1
        })}億`;
    }

    if (abs >= 10000) {
        return `${(number / 10000).toLocaleString("zh-TW", {
            maximumFractionDigits: 1
        })}萬`;
    }

    return formatNumber(number);
}

function calculateAverage(values) {
    const validValues = values.filter(Number.isFinite);

    if (!validValues.length) return 0;

    return Math.round(
        validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    );
}

function calculatePopulationStdDev(values) {
    const validValues = values.filter(Number.isFinite);

    if (!validValues.length) return 0;

    const average = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
    const variance =
        validValues.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
        validValues.length;

    return Math.sqrt(variance);
}

function formatDelta(delta) {
    if (delta === null || delta === undefined) return "無資料";
    if (delta > 0) return `▲ ${formatNumber(delta)}`;
    if (delta < 0) return `▼ ${formatNumber(Math.abs(delta))}`;

    return "— 0";
}

function cloneRows(rows) {
    return rows.map(row => ({ ...row }));
}

function getRowAnimationDelay(index) {
    return Math.min(index * 0.015, 0.3);
}

function showLoading(message = "資料同步中...") {
    els.resultHint.textContent = message;
    renderLoading(message);
}

/* ================================
   Data Fetching / CSV
================================ */

async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`讀取失敗：${url}`);
    }

    return response.text();
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            cell += '"';
            i++;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && nextChar === "\n") i++;

            row.push(cell);

            if (row.some(value => String(value).trim() !== "")) {
                rows.push(row);
            }

            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    row.push(cell);

    if (row.some(value => String(value).trim() !== "")) {
        rows.push(row);
    }

    return rows;
}

function csvToObjects(csvText) {
    const rows = parseCSV(csvText);

    if (!rows.length) return [];

    const headers = rows[0].map(cleanText);

    return rows.slice(1).map(cols => {
        const obj = {};

        headers.forEach((header, index) => {
            obj[header] = cols[index] ?? "";
        });

        return obj;
    });
}

async function loadWeeks() {
    const csvText = await fetchText(WEEK_INDEX_URL);

    state.weeks = csvToObjects(csvText).sort((a, b) => {
        return String(b.startDate || "").localeCompare(String(a.startDate || ""));
    });

    renderWeekSelect();
}

async function getWeekRows(week) {
    if (!week) return [];

    if (state.weekRowsCache.has(week.id)) {
        return state.weekRowsCache.get(week.id);
    }

    const csvText = await fetchText(week.file);
    const rows = normalizeRows(csvToObjects(csvText));

    state.weekRowsCache.set(week.id, rows);

    return rows;
}

/* ================================
   Week Helpers
================================ */

function getWeekMonthKey(week) {
    const startDate = cleanText(week?.startDate || "");
    const startDateMatch = startDate.match(/^(\d{4})-(\d{2})/);

    if (startDateMatch) {
        return `${startDateMatch[1]}-${startDateMatch[2]}`;
    }

    const id = cleanText(week?.id || "");
    const idMatch = id.match(/^(\d{4})-(\d{2})/);

    if (idMatch) {
        return `${idMatch[1]}-${idMatch[2]}`;
    }

    return "";
}

function formatMonthLabel(monthKey) {
    const [year, month] = String(monthKey || "").split("-");

    if (!year || !month) {
        return "本月";
    }

    return `${year}年${month}月`;
}

function getWeeksInSameMonth(targetWeek) {
    const targetMonthKey = getWeekMonthKey(targetWeek);

    if (!targetMonthKey) return [];

    return state.weeks.filter(week => getWeekMonthKey(week) === targetMonthKey);
}

function getWeekShortLabel(week) {
    const label = cleanText(week?.label || week?.id || "");
    const parts = label.split("｜");

    return parts[0] || label;
}

function findWeekById(weekId) {
    const week = state.weeks.find(item => item.id === weekId) || state.weeks[0];

    if (!week) {
        throw new Error("找不到週別資料");
    }

    return week;
}

async function getPreviousRows(currentWeekId) {
    const currentIndex = state.weeks.findIndex(week => week.id === currentWeekId);
    const previousWeek = state.weeks[currentIndex + 1];

    if (!previousWeek) return [];

    try {
        const rows = await getWeekRows(previousWeek);

        return cloneRows(rows);
    } catch (error) {
        console.warn("上一週資料讀取失敗：", error);

        return [];
    }
}

/* ================================
   Row Helpers
================================ */

function getRowType(row) {
    const cm = cleanText(row["CM"]);

    if (row.type) return row.type;
    if (cm === SPECIAL_CM.RETURN_SECTION) return ROW_TYPE.SECTION;
    if (cm === SPECIAL_CM.TOTAL) return ROW_TYPE.TOTAL;

    return ROW_TYPE.PERSON;
}

function isPersonRow(row) {
    return row?.__type === ROW_TYPE.PERSON;
}

function isSectionRow(row) {
    return row?.__type === ROW_TYPE.SECTION;
}

function isTotalRow(row) {
    return row?.__type === ROW_TYPE.TOTAL;
}

function getRowStatus(row) {
    return cleanText(row?.["狀態"]);
}

function isStatus(row, status) {
    return isPersonRow(row) && getRowStatus(row) === status;
}

function isElder(row) {
    return isStatus(row, STATUS.ELDER);
}

function isCaptain(row) {
    return isStatus(row, STATUS.CAPTAIN);
}

function isViceCaptain(row) {
    return isStatus(row, STATUS.VICE_CAPTAIN);
}

function normalizeCmName(value) {
    return cleanText(value).toLowerCase();
}

function getCmKey(row) {
    const cm = normalizeCmName(row["CM"]);

    return cm ? `cm:${cm}` : "";
}

function getPersonKey(row) {
    if (isExcludedFromCalculation(row)) return "";

    return getCmKey(row);
}

function hasMatchingProfileKey(row, keySet) {
    const cmKey = getCmKey(row);

    return Boolean(cmKey && keySet.has(cmKey));
}

function isReturnAccount(row) {
    const cm = cleanText(row["CM"]);
    const status = getRowStatus(row);

    return (
        row.__isReturnAccount === true ||
        cm === SPECIAL_CM.RETURN_SECTION ||
        status === STATUS.RETURN
    );
}

function isExcludedFromCalculation(row) {
    return (
        isReturnAccount(row) ||
        EXCLUDED_STATUSES.includes(getRowStatus(row))
    );
}

function isCalculablePerson(row) {
    return isPersonRow(row) && !isExcludedFromCalculation(row);
}

function getCalculablePeople(rows) {
    return rows.filter(isCalculablePerson);
}

function getExcludedPeople(rows) {
    return rows.filter(row => isPersonRow(row) && isExcludedFromCalculation(row));
}

function getTotalRow(rows) {
    return rows.find(row => {
        return (
            isTotalRow(row) ||
            cleanText(row["CM"]) === SPECIAL_CM.TOTAL
        );
    }) || null;
}

function getWeeklyTotalScore(rows) {
    const totalRow = getTotalRow(rows);

    if (totalRow) {
        return parseNumber(totalRow["一週總分"]);
    }

    return rows
        .filter(isPersonRow)
        .reduce((sum, row) => sum + parseNumber(row["一週總分"]), 0);
}

function countByStatus(rows, status) {
    return rows.filter(row => getRowStatus(row) === status).length;
}

function normalizeRows(rows) {
    let inReturnSection = false;

    return rows
        .map(row => {
            const normalized = { ...row };

            DISPLAY_HEADERS.forEach(header => {
                normalized[header] = normalized[header] ?? "";
            });

            normalized["CM"] = cleanText(normalized["CM"]);
            normalized["狀態"] = cleanText(normalized["狀態"]);
            normalized.__type = getRowType(normalized);

            const cm = cleanText(normalized["CM"]);
            const status = getRowStatus(normalized);

            if (cm === SPECIAL_CM.RETURN_SECTION) {
                inReturnSection = true;
                normalized.__isReturnAccount = true;
            } else if (isSectionRow(normalized)) {
                inReturnSection = false;
                normalized.__isReturnAccount = false;
            } else if (isPersonRow(normalized)) {
                normalized.__isReturnAccount = inReturnSection || status === STATUS.RETURN;
            } else {
                normalized.__isReturnAccount = false;
            }

            return normalized;
        })
        .filter(row => {
            if (!isPersonRow(row)) return true;

            return cleanText(row["CM"]) || cleanText(row["LINE名稱"]);
        });
}

/* ================================
   Role / Style Helpers
================================ */

function getRoleMeta(row) {
    return ROLE_META[getRowStatus(row)] || null;
}

function getRowRewardClass(row) {
    return getRoleMeta(row)?.rowClass || "";
}

function getRankBadgeClass(row) {
    return getRoleMeta(row)?.rankBadgeClass || "rank-badge";
}

function getPersonLinkClass(row) {
    return getRoleMeta(row)?.personLinkClass || "person-link";
}

function getStatusTitle(status) {
    return STATUS_TITLE[status] || status || "";
}

function getBadgeClass(status) {
    return STATUS_BADGE_CLASS[status] || "badge-other";
}

function getColumnClass(header) {
    if (header === "距離合格分數") return "col-pass-distance";
    if (header === "距離長老分數") return "col-elder-distance";

    return "";
}

function getCellClass(header, extraClass = "") {
    return createClassName(extraClass, getColumnClass(header));
}

function getCellLabelAttr(header) {
    return `data-label="${escapeHTML(header)}"`;
}

function getDisplayName(value) {
    return escapeHTML(cleanText(value) || "-");
}

/* ================================
   Comparison / History / Monthly
================================ */

function buildPreviousScoreMap(rows) {
    const map = new Map();

    rows.filter(isCalculablePerson).forEach(row => {
        const key = getPersonKey(row);

        if (!key) return;

        map.set(key, parseNumber(row["一週總分"]));
    });

    return map;
}

function applyWeekComparison(rows, previousRows) {
    const previousScoreMap = buildPreviousScoreMap(previousRows);

    return rows.map(row => {
        if (!isPersonRow(row)) {
            row["較上週"] = "";
            row.__trend = "";
            row.__delta = null;
            row.__prevScore = null;

            return row;
        }

        if (isExcludedFromCalculation(row)) {
            row["較上週"] = "不計算";
            row.__trend = TREND.SAME;
            row.__delta = null;
            row.__prevScore = null;

            return row;
        }

        const key = getPersonKey(row);
        const currentScore = parseNumber(row["一週總分"]);

        if (!key || !previousScoreMap.has(key)) {
            row["較上週"] = "新 / 無資料";
            row.__trend = TREND.NEW;
            row.__delta = null;
            row.__prevScore = null;

            return row;
        }

        const previousScore = previousScoreMap.get(key);
        const delta = currentScore - previousScore;

        row.__delta = delta;
        row.__prevScore = previousScore;

        if (delta > 0) {
            row["較上週"] = `▲ ${formatNumber(delta)}`;
            row.__trend = TREND.UP;
        } else if (delta < 0) {
            row["較上週"] = `▼ ${formatNumber(Math.abs(delta))}`;
            row.__trend = TREND.DOWN;
        } else {
            row["較上週"] = "— 0";
            row.__trend = TREND.SAME;
        }

        return row;
    });
}

function getBottomFiveKeys(rows) {
    const people = rows
        .filter(isCalculablePerson)
        .map(row => ({
            key: getPersonKey(row),
            score: parseNumber(row["一週總分"])
        }))
        .filter(item => item.key);

    if (!people.length) return new Set();

    people.sort((a, b) => a.score - b.score);

    const cutoffIndex = Math.min(4, people.length - 1);
    const cutoffScore = people[cutoffIndex].score;

    return new Set(
        people
            .filter(item => item.score <= cutoffScore)
            .map(item => item.key)
    );
}

async function loadHistoryBottomFive(targetWeek) {
    const summaryMap = new Map();
    const monthKey = getWeekMonthKey(targetWeek);
    const monthWeeks = getWeeksInSameMonth(targetWeek);

    state.historyScopeWeekCount = monthWeeks.length;
    state.historyScopeLabel = formatMonthLabel(monthKey);

    for (const week of monthWeeks) {
        try {
            const rows = await getWeekRows(week);
            const bottomKeys = getBottomFiveKeys(rows);

            rows.filter(isCalculablePerson).forEach(row => {
                const key = getPersonKey(row);

                if (!key) return;

                if (!summaryMap.has(key)) {
                    summaryMap.set(key, {
                        key,
                        cm: row["CM"] || "",
                        lineName: row["LINE名稱"] || "",
                        weeksSeen: 0,
                        bottomWeeks: 0,
                        bottomWeekLabels: [],
                        monthKey,
                        totalWeeks: monthWeeks.length
                    });
                }

                const item = summaryMap.get(key);

                item.weeksSeen += 1;

                if (bottomKeys.has(key)) {
                    item.bottomWeeks += 1;
                    item.bottomWeekLabels.push(week.label || week.id);
                }
            });
        } catch (error) {
            console.warn(`本月後五資料讀取失敗：${week.file}`, error);
        }
    }

    state.historySummaryMap = summaryMap;
}

function isAlwaysHistoricalBottomFive(summary) {
    if (!summary) return false;
    if (summary.weeksSeen < HISTORY_MIN_WEEKS) return false;

    const totalWeeks = summary.totalWeeks || state.historyScopeWeekCount || 0;
    const appearedModePass = summary.bottomWeeks === summary.weeksSeen;

    const allWeeksModePass =
        totalWeeks > 0 &&
        summary.weeksSeen === totalWeeks &&
        summary.bottomWeeks === totalWeeks;

    return HISTORY_MODE === "allWeeks"
        ? allWeeksModePass
        : appearedModePass;
}

function applyHistoryBottomFive(rows) {
    return rows.map(row => {
        if (!isPersonRow(row)) {
            row[HISTORY_COLUMN] = "";
            row.__historyLevel = "";
            row.__historyTitle = "";
            row.__historyAlways = false;

            return row;
        }

        if (isExcludedFromCalculation(row)) {
            const status = getRowStatus(row);

            row[HISTORY_COLUMN] = "不計算";
            row.__historyLevel = HISTORY_LEVEL.NONE;
            row.__historyTitle = `${status || "此帳號"}不納入${state.historyScopeLabel}後五名統計`;
            row.__historyAlways = false;

            return row;
        }

        const key = getPersonKey(row);
        const summary = state.historySummaryMap.get(key);

        if (!summary) {
            row[HISTORY_COLUMN] = "—";
            row.__historyLevel = HISTORY_LEVEL.NONE;
            row.__historyTitle = `${state.historyScopeLabel}沒有資料`;
            row.__historyAlways = false;

            return row;
        }

        const alwaysBottomFive = isAlwaysHistoricalBottomFive(summary);

        row.__historyAlways = alwaysBottomFive;
        row.__historyTitle = summary.bottomWeekLabels.length
            ? `${state.historyScopeLabel}曾在後五名週別：${summary.bottomWeekLabels.join("、")}`
            : `${state.historyScopeLabel}沒有進入最後五名`;

        if (alwaysBottomFive) {
            row[HISTORY_COLUMN] = `都後五 ${summary.bottomWeeks}/${summary.weeksSeen}`;
            row.__historyLevel = HISTORY_LEVEL.RISK;
        } else if (summary.bottomWeeks > 0) {
            row[HISTORY_COLUMN] = `曾後五 ${summary.bottomWeeks}/${summary.weeksSeen}`;
            row.__historyLevel = HISTORY_LEVEL.WATCH;
        } else {
            row[HISTORY_COLUMN] = "—";
            row.__historyLevel = HISTORY_LEVEL.NONE;
        }

        return row;
    });
}

function getMonthlyTotalPersonKey(row) {
    return getCmKey(row);
}

async function loadMonthlyPersonalTotals(targetWeek) {
    const summaryMap = new Map();
    const monthWeeks = getWeeksInSameMonth(targetWeek);

    for (const week of monthWeeks) {
        try {
            const rows = await getWeekRows(week);

            rows.filter(isPersonRow).forEach(row => {
                const key = getMonthlyTotalPersonKey(row);

                if (!key) return;

                if (!summaryMap.has(key)) {
                    summaryMap.set(key, {
                        key,
                        cm: row["CM"] || "",
                        totalScore: 0,
                        weeksSeen: 0,
                        totalWeeks: monthWeeks.length,
                        weekLabels: [],
                        isReturnAccount: isReturnAccount(row)
                    });
                }

                const item = summaryMap.get(key);

                item.totalScore += parseNumber(row["一週總分"]);
                item.weeksSeen += 1;
                item.weekLabels.push(week.label || week.id);

                if (isReturnAccount(row)) {
                    item.isReturnAccount = true;
                }
            });
        } catch (error) {
            console.warn(`本月個人總分讀取失敗：${week.file}`, error);
        }
    }

    applyMonthlyTotalRank(summaryMap);
    state.monthlyTotalMap = summaryMap;
}

function applyMonthlyTotalRank(summaryMap) {
    const rankedItems = Array.from(summaryMap.values())
        .filter(item => !item.isReturnAccount)
        .sort((a, b) => b.totalScore - a.totalScore);

    let previousScore = null;
    let previousRank = 0;

    rankedItems.forEach((item, index) => {
        const rank =
            previousScore !== null && item.totalScore === previousScore
                ? previousRank
                : index + 1;

        item.totalRank = rank;

        previousScore = item.totalScore;
        previousRank = rank;
    });
}

function applyMonthlyPersonalTotals(rows) {
    return rows.map(row => {
        if (!isPersonRow(row)) {
            row[MONTH_TOTAL_COLUMN] = "";
            row.__monthTotal = null;
            row.__monthTotalRank = null;
            row.__monthTotalTitle = "";

            return row;
        }

        const key = getMonthlyTotalPersonKey(row);
        const summary = state.monthlyTotalMap.get(key);

        if (!summary) {
            row[MONTH_TOTAL_COLUMN] = "—";
            row.__monthTotal = null;
            row.__monthTotalRank = null;
            row.__monthTotalTitle = `${state.historyScopeLabel}沒有本月總分資料`;

            return row;
        }

        row.__monthTotal = summary.totalScore;
        row.__monthTotalRank = summary.totalRank || null;
        row[MONTH_TOTAL_COLUMN] = formatNumber(summary.totalScore);

        if (summary.isReturnAccount || isReturnAccount(row)) {
            row.__monthTotalTitle =
                `${state.historyScopeLabel}總分：${formatNumber(summary.totalScore)}｜` +
                `回歸號不納入本月總分排序｜` +
                `出現 ${summary.weeksSeen}/${summary.totalWeeks} 週`;
        } else {
            row.__monthTotalTitle =
                `${state.historyScopeLabel}總分：${formatNumber(summary.totalScore)}｜` +
                `本月總分第 ${summary.totalRank} 名｜` +
                `出現 ${summary.weeksSeen}/${summary.totalWeeks} 週`;
        }

        return row;
    });
}

/* ================================
   Achievements / Podium
================================ */

async function loadMonthlyAchievements(targetWeek) {
    const monthWeeks = getWeeksInSameMonth(targetWeek).reverse();
    const achievementMap = new Map();

    for (const week of monthWeeks) {
        try {
            const rows = await getWeekRows(week);

            rows.filter(isCalculablePerson).forEach(row => {
                const key = getPersonKey(row);

                if (!key) return;

                if (!achievementMap.has(key)) {
                    achievementMap.set(key, {
                        key,
                        cm: row["CM"] || "",
                        lineName: row["LINE名稱"] || "",
                        totalScore: 0,
                        scores: [],
                        weekLabels: [],
                        bestScore: 0,
                        bestWeekLabel: "",
                        weeksSeen: 0,
                        totalWeeks: monthWeeks.length
                    });
                }

                const item = achievementMap.get(key);
                const score = parseNumber(row["一週總分"]);

                item.totalScore += score;
                item.scores.push(score);
                item.weekLabels.push(week.label || week.id);
                item.weeksSeen += 1;

                if (score > item.bestScore) {
                    item.bestScore = score;
                    item.bestWeekLabel = week.label || week.id;
                }

                if (!item.cm && row["CM"]) {
                    item.cm = row["CM"];
                }

                if (!item.lineName && row["LINE名稱"]) {
                    item.lineName = row["LINE名稱"];
                }
            });
        } catch (error) {
            console.warn(`本月成就徽章資料讀取失敗：${week.file}`, error);
        }
    }

    state.monthlyAchievementMap = achievementMap;
    state.achievements = calculateAchievements(achievementMap);
}

function calculateAchievements(achievementMap) {
    const members = Array.from(achievementMap.values());

    return [
        calculateMvpAchievement(members),
        calculateImproverAchievement(members),
        calculateStableAchievement(members),
        calculateBurstAchievement(members),
        calculatePotentialAchievement(members)
    ];
}

function calculateMvpAchievement(members) {
    const winner = members
        .filter(member => member.weeksSeen > 0)
        .sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return getAchievementDisplayName(a).localeCompare(getAchievementDisplayName(b));
        })[0] || null;

    return createAchievementResult(ACHIEVEMENT_BADGES.MVP, winner, winner
        ? {
            metricLabel: "本月總分",
            metricValue: formatNumber(winner.totalScore),
            detail: `出現 ${winner.weeksSeen}/${winner.totalWeeks} 週`
        }
        : null
    );
}

function calculateImproverAchievement(members) {
    const candidates = members
        .filter(member => member.scores.length >= 2)
        .map(member => {
            const firstScore = member.scores[0];
            const lastScore = member.scores[member.scores.length - 1];
            const improvement = lastScore - firstScore;

            return {
                ...member,
                achievementScore: improvement,
                firstScore,
                lastScore
            };
        })
        .sort((a, b) => {
            if (b.achievementScore !== a.achievementScore) {
                return b.achievementScore - a.achievementScore;
            }

            if (b.lastScore !== a.lastScore) {
                return b.lastScore - a.lastScore;
            }

            return getAchievementDisplayName(a).localeCompare(getAchievementDisplayName(b));
        });

    const winner = candidates[0] || null;

    return createAchievementResult(ACHIEVEMENT_BADGES.IMPROVER, winner, winner
        ? {
            metricLabel: "進步幅度",
            metricValue: formatDelta(winner.achievementScore),
            detail: `${formatNumber(winner.firstScore)} → ${formatNumber(winner.lastScore)}`
        }
        : null
    );
}

function calculateStableAchievement(members) {
    const candidates = members
        .filter(member => member.scores.length >= 2)
        .map(member => {
            const average = calculateAverage(member.scores);
            const volatility = calculatePopulationStdDev(member.scores);

            return {
                ...member,
                averageScore: average,
                volatility
            };
        });

    if (!candidates.length) {
        return createAchievementResult(ACHIEVEMENT_BADGES.STABLE, null, null);
    }

    const averageOfAverages = calculateAverage(candidates.map(member => member.averageScore));

    const highAverageCandidates = candidates.filter(member => {
        return member.averageScore >= averageOfAverages;
    });

    const pool = highAverageCandidates.length ? highAverageCandidates : candidates;

    const winner = pool.sort((a, b) => {
        if (a.volatility !== b.volatility) {
            return a.volatility - b.volatility;
        }

        if (b.averageScore !== a.averageScore) {
            return b.averageScore - a.averageScore;
        }

        return getAchievementDisplayName(a).localeCompare(getAchievementDisplayName(b));
    })[0] || null;

    return createAchievementResult(ACHIEVEMENT_BADGES.STABLE, winner, winner
        ? {
            metricLabel: "平均 / 波動",
            metricValue: `${formatCompactNumber(winner.averageScore)} / ${formatCompactNumber(Math.round(winner.volatility))}`,
            detail: `平均高於本月均值 ${formatCompactNumber(averageOfAverages)}`
        }
        : null
    );
}

function calculateBurstAchievement(members) {
    const winner = members
        .filter(member => member.scores.length)
        .sort((a, b) => {
            if (b.bestScore !== a.bestScore) {
                return b.bestScore - a.bestScore;
            }

            if (b.totalScore !== a.totalScore) {
                return b.totalScore - a.totalScore;
            }

            return getAchievementDisplayName(a).localeCompare(getAchievementDisplayName(b));
        })[0] || null;

    return createAchievementResult(ACHIEVEMENT_BADGES.BURST, winner, winner
        ? {
            metricLabel: "單週最高",
            metricValue: formatNumber(winner.bestScore),
            detail: winner.bestWeekLabel || "本月週別"
        }
        : null
    );
}

function calculatePotentialAchievement(members) {
    const candidates = members
        .filter(member => member.scores.length >= 3)
        .map(member => {
            const scores = member.scores;
            const last3 = scores.slice(-3);
            const firstDelta = last3[1] - last3[0];
            const secondDelta = last3[2] - last3[1];
            const totalRise = last3[2] - last3[0];

            return {
                ...member,
                last3,
                firstDelta,
                secondDelta,
                totalRise
            };
        })
        .filter(member => member.firstDelta > 0 && member.secondDelta > 0)
        .sort((a, b) => {
            if (b.totalRise !== a.totalRise) {
                return b.totalRise - a.totalRise;
            }

            if (b.secondDelta !== a.secondDelta) {
                return b.secondDelta - a.secondDelta;
            }

            if (b.last3[2] !== a.last3[2]) {
                return b.last3[2] - a.last3[2];
            }

            return getAchievementDisplayName(a).localeCompare(getAchievementDisplayName(b));
        });

    const winner = candidates[0] || null;

    return createAchievementResult(ACHIEVEMENT_BADGES.POTENTIAL, winner, winner
        ? {
            metricLabel: "近三筆漲幅",
            metricValue: formatDelta(winner.totalRise),
            detail: winner.last3.map(formatCompactNumber).join(" → ")
        }
        : null
    );
}

function createAchievementResult(config, winner, metric) {
    return {
        ...config,
        winner,
        metric,
        isEmpty: !winner
    };
}

function getAchievementDisplayName(member) {
    return cleanText(member?.cm || member?.lineName || "-");
}

function getAchievementProfileKeys(member) {
    return member?.key || "";
}

function ensureAchievementsSection() {
    if (els.achievements) return els.achievements;

    const section = document.createElement("section");

    section.className = "achievements-podium";
    section.id = "achievementsPodium";
    section.setAttribute("aria-labelledby", "achievementsTitle");

    const hero = document.querySelector(".hero");

    if (hero) {
        hero.insertAdjacentElement("afterend", section);
    } else {
        const page = document.querySelector(".page");

        if (page) {
            page.prepend(section);
        }
    }

    return section;
}

function renderAchievementsPodium() {
    const section = ensureAchievementsSection();

    if (!section) return;

    const achievements = state.achievements || [];
    const loadedText = state.historyScopeLabel || "本月";

    section.innerHTML = `
        <div class="achievements-head">
            <div>
                <div class="achievements-kicker">Achievement Podium</div>
                <h2 class="achievements-title" id="achievementsTitle">${escapeHTML(loadedText)}成就徽章</h2>
            </div>

            <div class="achievements-note">
                依本月每週分數自動計算
            </div>
        </div>

        <div class="podium-row" role="list">
            ${achievements.map(renderAchievementCard).join("")}
        </div>
    `;
}

function renderAchievementCard(achievement) {
    const accent = escapeHTML(achievement.accent || "");
    const title = escapeHTML(achievement.title || "");
    const subtitle = escapeHTML(achievement.subtitle || "");
    const icon = escapeHTML(achievement.icon || "🏅");

    if (achievement.isEmpty || !achievement.winner) {
        return `
            <article class="podium-card podium-${accent} podium-empty" role="listitem">
                <div class="podium-medal" aria-hidden="true">${icon}</div>

                <div class="podium-content">
                    <div class="podium-title">${title}</div>
                    <div class="podium-subtitle">${subtitle}</div>
                    <div class="podium-name">待產生</div>
                    <div class="podium-metric">${escapeHTML(achievement.emptyText || "暫無資料")}</div>
                </div>
            </article>
        `;
    }

    const member = achievement.winner;
    const displayName = getAchievementDisplayName(member);
    const profileKeys = getAchievementProfileKeys(member);
    const metric = achievement.metric || {};
    const metricLabel = metric.metricLabel || "";
    const metricValue = metric.metricValue || "";
    const detail = metric.detail || "";

    return `
        <article class="podium-card podium-${accent}" role="listitem">
            <div class="podium-medal" aria-hidden="true">${icon}</div>

            <div class="podium-content">
                <div class="podium-title">${title}</div>
                <div class="podium-subtitle">${subtitle}</div>

                <button
                    class="podium-name"
                    type="button"
                    data-profile-keys="${escapeHTML(profileKeys)}"
                    title="查看 ${escapeHTML(displayName)} 的個人資料"
                >
                    ${escapeHTML(displayName)}
                </button>

                <div class="podium-metric">
                    <span>${escapeHTML(metricLabel)}</span>
                    <strong>${escapeHTML(metricValue)}</strong>
                </div>

                <div class="podium-detail">${escapeHTML(detail)}</div>
            </div>
        </article>
    `;
}

/* ================================
   Row Numbering
================================ */

function applyRowNumbers(rows) {
    let normalNumber = 0;
    let returnNumber = 0;
    let inReturnSection = false;

    return rows.map(row => {
        if (isSectionRow(row)) {
            const cm = cleanText(row["CM"]);

            if (cm === SPECIAL_CM.RETURN_SECTION) {
                inReturnSection = true;
                returnNumber = 0;
            } else {
                inReturnSection = false;
            }

            row.__rank = null;
            row.__rankTitle = "";
            row[RANK_COLUMN] = "";

            return row;
        }

        if (!isPersonRow(row)) {
            row.__rank = null;
            row.__rankTitle = "";
            row[RANK_COLUMN] = "";

            return row;
        }

        const isReturn = inReturnSection || isReturnAccount(row);
        const number = isReturn ? ++returnNumber : ++normalNumber;

        row.__rank = number;
        row.__rankTitle = isReturn
            ? `回歸帳號編號 ${number}`
            : `編號 ${number}`;

        row[RANK_COLUMN] = String(number);

        return row;
    });
}

function prepareCurrentRows(rows, previousRows) {
    return applyRowNumbers(
        applyMonthlyPersonalTotals(
            applyHistoryBottomFive(
                applyWeekComparison(rows, previousRows)
            )
        )
    );
}

/* ================================
   Filters
================================ */

function isEverBottomFive(row) {
    return (
        isCalculablePerson(row) &&
        (
            row.__historyLevel === HISTORY_LEVEL.WATCH ||
            row.__historyLevel === HISTORY_LEVEL.RISK
        )
    );
}

function getFilteredRows() {
    const keyword = els.searchInput.value.trim().toLowerCase();
    const status = els.statusFilter.value;

    if (status === SPECIAL_STATUS_FILTERS.MONTH_TOTAL_SCORE_SORT) {
        return getMonthlyTotalScoreRows(keyword);
    }

    return state.currentRows.filter(row => {
        if (!isPersonRow(row)) return true;

        const matchKeyword =
            !keyword ||
            normalizeCmName(row["CM"]).includes(keyword);

        const matchStatus = getStatusMatch(row, status);

        return matchKeyword && matchStatus;
    });
}

function getMonthlyTotalScoreRows(keyword) {
    const peopleRows = state.currentRows
        .filter(row => isPersonRow(row) && !isReturnAccount(row))
        .filter(row => !keyword || normalizeCmName(row["CM"]).includes(keyword))
        .slice()
        .sort(compareMonthlyTotalScoreDesc)
        .map((row, index) => ({
            ...row,
            __displayRank: index + 1,
            __displayRankTitle: `本月總分排序第 ${index + 1} 名`
        }));

    const totalRows = state.currentRows.filter(isTotalRow);

    return [
        ...peopleRows,
        ...totalRows
    ];
}

function compareMonthlyTotalScoreDesc(a, b) {
    const aScore = Number.isFinite(a.__monthTotal)
        ? a.__monthTotal
        : Number.NEGATIVE_INFINITY;

    const bScore = Number.isFinite(b.__monthTotal)
        ? b.__monthTotal
        : Number.NEGATIVE_INFINITY;

    if (aScore !== bScore) {
        return bScore - aScore;
    }

    return normalizeCmName(a["CM"]).localeCompare(normalizeCmName(b["CM"]));
}

function getStatusMatch(row, status) {
    if (status === STATUS.ALL) return true;

    if (status === SPECIAL_STATUS_FILTERS.EVER_BOTTOM_FIVE) {
        return isEverBottomFive(row);
    }

    return getRowStatus(row) === status;
}

/* ================================
   Render: Common
================================ */

function renderHead() {
    els.tableHead.innerHTML = `
            <tr>
                ${DISPLAY_HEADERS.map(header => {
        const columnClass = getColumnClass(header);

        return `
                        <th class="${escapeHTML(columnClass)}">
                            ${escapeHTML(header)}
                        </th>
                    `;
    }).join("")}
            </tr>
        `;
}

function renderLoading(message = "資料同步中...") {
    els.tableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="${DISPLAY_HEADERS.length}">
                    <span class="cyber-loader">
                        <span></span><span></span><span></span>
                        <strong>${escapeHTML(message)}</strong>
                    </span>
                </td>
            </tr>
        `;
}

function renderWeekSelect() {
    els.weekSelect.innerHTML = state.weeks
        .map(week => `<option value="${escapeHTML(week.id)}">${escapeHTML(week.label)}</option>`)
        .join("");
}

function renderStatusFilter(rows) {
    const statuses = Array.from(
        new Set(
            rows
                .filter(isPersonRow)
                .map(getRowStatus)
                .filter(Boolean)
        )
    );

    const current = els.statusFilter.value || STATUS.ALL;

    els.statusFilter.innerHTML = `
            <option value="${STATUS.ALL}">全部狀態</option>
            <option value="${SPECIAL_STATUS_FILTERS.EVER_BOTTOM_FIVE}">曾經最後五</option>
            <option value="${SPECIAL_STATUS_FILTERS.MONTH_TOTAL_SCORE_SORT}">本月總分排序</option>
            ${statuses.map(status => `<option value="${escapeHTML(status)}">${escapeHTML(status)}</option>`).join("")}
        `;

    const validValues = [
        STATUS.ALL,
        SPECIAL_STATUS_FILTERS.EVER_BOTTOM_FIVE,
        SPECIAL_STATUS_FILTERS.MONTH_TOTAL_SCORE_SORT,
        ...statuses
    ];

    els.statusFilter.value = validValues.includes(current)
        ? current
        : STATUS.ALL;
}

/* ================================
   Render: Stats
================================ */

function animateNumber(element, target) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const formatType = element.dataset.format || "normal";
    const formatter = formatType === "compact" ? formatCompactNumber : formatNumber;

    if (prefersReducedMotion) {
        element.textContent = formatter(target);
        element.title = formatNumber(target);

        return;
    }

    const duration = 650;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(target * eased);

        element.textContent = formatter(current);
        element.title = formatNumber(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function animateStatCards() {
    document.querySelectorAll("[data-stat-value]").forEach(element => {
        animateNumber(element, Number(element.dataset.statValue || 0));
    });
}

function renderStats(rows) {
    const people = getCalculablePeople(rows);

    const statItems = [
        {
            label: "一週總分加總",
            value: getWeeklyTotalScore(rows),
            icon: "⚡",
            format: "compact",
            className: ""
        },
        {
            label: STATUS.ELDER,
            value: countByStatus(people, STATUS.ELDER),
            icon: "♕",
            format: "normal",
            className: "stat-elder"
        },
        {
            label: STATUS.PASS,
            value: countByStatus(people, STATUS.PASS),
            icon: "✅",
            format: "normal",
            className: ""
        },
        {
            label: STATUS.DOWNGRADE,
            value: countByStatus(people, STATUS.DOWNGRADE),
            icon: "⚠️",
            format: "normal",
            className: ""
        },
        {
            label: STATUS.OUT,
            value: countByStatus(people, STATUS.OUT),
            icon: "⛔",
            format: "normal",
            className: ""
        }
    ];

    els.stats.innerHTML = statItems.map(renderStatCard).join("");

    animateStatCards();
}

function renderStatCard(item) {
    return `
            <article class="stat-card ${escapeHTML(item.className || "")}">
                <div class="stat-top">
                    <div>
                        <div class="stat-label">${escapeHTML(item.label)}</div>
                        <div 
                            class="stat-value" 
                            data-stat-value="${Number(item.value)}" 
                            data-format="${escapeHTML(item.format || "normal")}" 
                            title="${escapeHTML(formatNumber(item.value))}"
                        >0</div>
                    </div>
                    <div class="stat-icon" aria-hidden="true">${escapeHTML(item.icon)}</div>
                </div>
            </article>
        `;
}

/* ================================
   Render: Table Body
================================ */

function renderBody() {
    const filteredRows = getFilteredRows();

    if (!filteredRows.length) {
        renderEmptyBody();
        els.resultHint.textContent = "目前顯示 0 筆成員資料";
        state.hasRenderedTableOnce = true;

        return;
    }

    els.tableBody.innerHTML = filteredRows
        .map(renderTableRow)
        .join("");

    updateResultHint(filteredRows);

    state.hasRenderedTableOnce = true;
}

function renderEmptyBody() {
    els.tableBody.innerHTML = `
            <tr>
                <td class="empty-state" colspan="${DISPLAY_HEADERS.length}">
                    找不到符合條件的資料。
                </td>
            </tr>
        `;
}

function renderTableRow(row, index) {
    if (isSectionRow(row)) {
        return renderSectionRow(row, index);
    }

    const rowClass = createClassName(
        isTotalRow(row) ? "row-total" : "",
        getRowRewardClass(row),
        state.hasRenderedTableOnce ? "row-no-animation" : ""
    );

    const animationStyle = state.hasRenderedTableOnce
        ? ""
        : `style="animation-delay: ${getRowAnimationDelay(index)}s"`;

    const cells = DISPLAY_HEADERS
        .map(header => renderTableCell(row, header))
        .join("");

    return `
            <tr class="${rowClass}" ${animationStyle}>
                ${cells}
            </tr>
        `;
}

function renderSectionRow(row, index) {
    const rowClass = createClassName(
        "section-row",
        state.hasRenderedTableOnce ? "row-no-animation" : ""
    );

    const animationStyle = state.hasRenderedTableOnce
        ? ""
        : `style="animation-delay: ${getRowAnimationDelay(index)}s"`;

    return `
            <tr class="${rowClass}" ${animationStyle}>
                <td colspan="${DISPLAY_HEADERS.length}">
                    📌 ${escapeHTML(cleanText(row["CM"]))}
                </td>
            </tr>
        `;
}

function renderTableCell(row, header) {
    if (header === "CM") return renderNameCell(row, header);
    if (header === RANK_COLUMN) return renderRankCell(row, header);
    if (header === MONTH_TOTAL_COLUMN) return renderMonthTotalCell(row, header);
    if (header === "較上週") return renderTrendCell(row, header);
    if (header === HISTORY_COLUMN) return renderHistoryCell(row, header);
    if (header === "狀態") return renderStatusCell(row, header);

    return renderScoreCell(row, header);
}

function renderNameCell(row, header) {
    const cmKey = getCmKey(row);
    const displayName = getDisplayName(row[header]);
    const titleName = escapeHTML(cleanText(row[header]) || "此成員");

    if (isPersonRow(row) && cmKey) {
        return `
                <td class="${getCellClass(header, "name")}" ${getCellLabelAttr(header)}>
                    <button 
                        class="${getPersonLinkClass(row)}" 
                        type="button" 
                        data-profile-keys="${escapeHTML(cmKey)}" 
                        title="查看 ${titleName} 的個人資料"
                    >
                        ${displayName}
                    </button>
                </td>
            `;
    }

    return `
            <td class="${getCellClass(header, "name")}" ${getCellLabelAttr(header)}>
                ${displayName}
            </td>
        `;
}

function renderRankCell(row, header) {
    const isMonthTotalScoreSort =
        els.statusFilter.value === SPECIAL_STATUS_FILTERS.MONTH_TOTAL_SCORE_SORT;

    const numberValue = isMonthTotalScoreSort
        ? row.__displayRank
        : row[RANK_COLUMN];

    const rankTitle = isMonthTotalScoreSort
        ? row.__displayRankTitle
        : row.__rankTitle;

    return `
            <td class="${getCellClass(header, "rank-cell")}" ${getCellLabelAttr(header)}>
                ${numberValue
            ? `<span class="${getRankBadgeClass(row)}" title="${escapeHTML(rankTitle || "")}">${escapeHTML(numberValue)}</span>`
            : ""
        }
            </td>
        `;
}

function renderMonthTotalCell(row, header) {
    const monthTotalValue = row[MONTH_TOTAL_COLUMN] || "";

    return `
            <td class="${getCellClass(header, "score")}" ${getCellLabelAttr(header)}>
                <span title="${escapeHTML(row.__monthTotalTitle || "")}">
                    ${escapeHTML(monthTotalValue || "-")}
                </span>
            </td>
        `;
}

function renderTrendCell(row, header) {
    const value = row[header] || "";
    const trendClass = row.__trend ? `trend-${row.__trend}` : "trend-same";

    const prevScoreText =
        row.__prevScore !== null && row.__prevScore !== undefined
            ? `上週：${formatNumber(row.__prevScore)}`
            : "上週無資料";

    return `
            <td class="${getCellClass(header, "score")}" ${getCellLabelAttr(header)}>
                <span class="trend-badge ${trendClass}" title="${escapeHTML(prevScoreText)}">
                    ${escapeHTML(value || "-")}
                </span>
            </td>
        `;
}

function renderHistoryCell(row, header) {
    const value = row[header] || "";
    const historyClass = row.__historyLevel
        ? `history-${row.__historyLevel}`
        : "history-none";

    return `
            <td class="${getCellClass(header, "score")}" ${getCellLabelAttr(header)}>
                <span class="history-badge ${historyClass}" title="${escapeHTML(row.__historyTitle || "")}">
                    ${escapeHTML(value || "-")}
                </span>
            </td>
        `;
}

function renderStatusCell(row, header) {
    const status = cleanText(row[header]);

    const statusHTML = status
        ? `<span class="badge ${getBadgeClass(status)}" title="${escapeHTML(getStatusTitle(status))}">${escapeHTML(status)}</span>`
        : "-";

    return `
            <td class="${getCellClass(header)}" ${getCellLabelAttr(header)}>
                ${statusHTML}
            </td>
        `;
}

function renderScoreCell(row, header) {
    return `
            <td class="${getCellClass(header, "score")}" ${getCellLabelAttr(header)}>
                ${escapeHTML(row[header] || "-")}
            </td>
        `;
}

function updateResultHint(filteredRows) {
    if (els.statusFilter.value === SPECIAL_STATUS_FILTERS.MONTH_TOTAL_SCORE_SORT) {
        updateMonthlyTotalScoreHint(filteredRows);

        return;
    }

    const shownPeople = filteredRows.filter(isCalculablePerson).length;
    const allPeople = getCalculablePeople(state.currentRows).length;

    const shownExcludedCount = filteredRows.filter(row => {
        return isPersonRow(row) && isExcludedFromCalculation(row);
    }).length;

    const allExcludedCount = getExcludedPeople(state.currentRows).length;

    const historyRiskCount = state.currentRows.filter(row => {
        return isCalculablePerson(row) && row.__historyAlways;
    }).length;

    const historyEverCount = state.currentRows.filter(isEverBottomFive).length;

    els.resultHint.textContent =
        `目前顯示可計算 ${shownPeople} / ${allPeople} 筆｜` +
        `不計算排除 ${shownExcludedCount} / ${allExcludedCount} 筆｜` +
        `${state.historyScopeLabel}曾後五 ${historyEverCount} 人｜` +
        `都後五 ${historyRiskCount} 人`;
}

function updateMonthlyTotalScoreHint(filteredRows) {
    const sortedPeople = filteredRows.filter(row => {
        return isPersonRow(row) && !isReturnAccount(row);
    });

    const topPerson = sortedPeople[0] || null;

    els.resultHint.textContent = topPerson
        ? `${state.historyScopeLabel}本月總分最高：${topPerson["CM"] || "-"}｜${formatNumber(topPerson.__monthTotal || 0)} 分｜已排除回歸號｜目前依本月總分由高到低排序`
        : "目前沒有可排序的本月總分資料";
}

/* ================================
   Profile Data
================================ */

function getScoreRecordsFromRows(row, week) {
    const activity1Raw = cleanText(row["活動1總分"] ?? "");
    const activity2Raw = cleanText(row["活動2總分"] ?? "");
    const activity3Raw = cleanText(row["活動3總分"] ?? "");

    const activity1 = parseNumber(activity1Raw);
    const activity2 = parseNumber(activity2Raw);
    const activity3 = parseNumber(activity3Raw);

    const activities = [
        {
            label: "活動 1",
            value: activity1,
            raw: activity1Raw,
            show: true
        },
        {
            label: "活動 2",
            value: activity2,
            raw: activity2Raw,
            show: true
        }
    ];

    if (activity3Raw !== "" && activity3 !== 0) {
        activities.push({
            label: "活動 3",
            value: activity3,
            raw: activity3Raw,
            show: true
        });
    }

    return {
        weekId: week.id,
        weekLabel: week.label || week.id,
        shortLabel: getWeekShortLabel(week),
        startDate: week.startDate || "",
        monthKey: getWeekMonthKey(week),
        cm: row["CM"] || "",
        lineName: row["LINE名稱"] || "",
        status: row["狀態"] || "",
        activity1,
        activity2,
        activity3,
        activities,
        score: parseNumber(row["一週總分"])
    };
}

async function buildMemberProfile(initialKeys) {
    const keySet = new Set(
        initialKeys
            .filter(Boolean)
            .filter(key => String(key).startsWith("cm:"))
    );

    const selectedMonthKey = getWeekMonthKey(state.currentWeek);
    const selectedMonthLabel = formatMonthLabel(selectedMonthKey);
    const monthWeeks = getWeeksInSameMonth(state.currentWeek).reverse();

    if (!keySet.size) {
        return {
            records: [],
            monthRecords: createEmptyMonthRecords(monthWeeks),
            selectedMonthKey,
            selectedMonthLabel
        };
    }

    const records = [];
    const chronologicalWeeks = [...state.weeks].reverse();

    for (const week of chronologicalWeeks) {
        const rows = await getWeekRows(week);

        const matchedRow = rows.find(row => {
            return isPersonRow(row) && hasMatchingProfileKey(row, keySet);
        });

        if (!matchedRow) continue;

        records.push(getScoreRecordsFromRows(matchedRow, week));
    }

    const monthRecords = monthWeeks.map(week => {
        const record = records.find(item => item.weekId === week.id);

        return record || createEmptyMonthRecord(week);
    });

    return {
        records,
        monthRecords,
        selectedMonthKey,
        selectedMonthLabel
    };
}

function createEmptyMonthRecords(monthWeeks) {
    return monthWeeks.map(createEmptyMonthRecord);
}

function createEmptyMonthRecord(week) {
    return {
        weekId: week.id,
        weekLabel: week.label || week.id,
        shortLabel: getWeekShortLabel(week),
        startDate: week.startDate || "",
        monthKey: getWeekMonthKey(week),
        cm: "",
        lineName: "",
        status: STATUS.NO_DATA,
        activity1: null,
        activity2: null,
        activity3: null,
        score: null
    };
}

function getProfileSummary(profile) {
    const records = profile.records;
    const validScores = records.map(record => record.score).filter(Number.isFinite);

    const bestRecord = records.reduce((best, record) => {
        if (!best) return record;

        return record.score > best.score ? record : best;
    }, null);

    const latestRecord = records[records.length - 1] || null;
    const previousRecord = records[records.length - 2] || null;

    const monthValidRecords = profile.monthRecords.filter(record => Number.isFinite(record.score));
    const monthScores = monthValidRecords.map(record => record.score);
    const monthTotal = monthScores.reduce((sum, score) => sum + score, 0);

    const firstMonthRecord = monthValidRecords[0] || null;
    const lastMonthRecord = monthValidRecords[monthValidRecords.length - 1] || null;

    const monthDelta =
        firstMonthRecord && lastMonthRecord
            ? lastMonthRecord.score - firstMonthRecord.score
            : null;

    const latestDelta =
        latestRecord && previousRecord
            ? latestRecord.score - previousRecord.score
            : null;

    return {
        totalWeeks: records.length,
        bestRecord,
        latestRecord,
        previousRecord,
        averageScore: calculateAverage(validScores),
        monthTotal,
        monthDelta,
        latestDelta
    };
}

function getRecordActivities(record) {
    if (Array.isArray(record.activities) && record.activities.length) {
        return record.activities.filter(activity => activity.show !== false);
    }

    const activities = [
        {
            label: "活動 1",
            value: record.activity1,
            show: true
        },
        {
            label: "活動 2",
            value: record.activity2,
            show: true
        }
    ];

    if (Number.isFinite(record.activity3) && record.activity3 !== 0) {
        activities.push({
            label: "活動 3",
            value: record.activity3,
            show: true
        });
    }

    return activities;
}

/* ================================
   Profile Render
================================ */

function renderProfileChart(monthRecords) {
    const width = 760;
    const height = 280;

    const padding = {
        top: 32,
        right: 26,
        bottom: 52,
        left: 70
    };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const validScores = monthRecords
        .map(record => record.score)
        .filter(Number.isFinite);

    if (!validScores.length) {
        return `
                <div class="profile-empty">
                    這個月份沒有可繪製的分數資料。
                </div>
            `;
    }

    const maxScore = Math.max(...validScores, 1);
    const niceMax = Math.ceil(maxScore / 100000) * 100000 || maxScore;

    const getX = index => {
        if (monthRecords.length <= 1) {
            return padding.left + chartWidth / 2;
        }

        return padding.left + (index / (monthRecords.length - 1)) * chartWidth;
    };

    const getY = score => {
        return padding.top + (1 - score / niceMax) * chartHeight;
    };

    const points = monthRecords.map((record, index) => {
        const hasScore = Number.isFinite(record.score);

        return {
            ...record,
            index,
            hasScore,
            x: getX(index),
            y: hasScore ? getY(record.score) : padding.top + chartHeight
        };
    });

    const validPoints = points.filter(point => point.hasScore);

    const linePath = validPoints
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    const areaPath = validPoints.length
        ? `${linePath} L ${validPoints[validPoints.length - 1].x} ${padding.top + chartHeight} L ${validPoints[0].x} ${padding.top + chartHeight} Z`
        : "";

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const y = padding.top + ratio * chartHeight;
        const value = Math.round(niceMax * (1 - ratio));

        return `
                <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
                <text class="chart-label" x="${padding.left - 12}" y="${y + 4}" text-anchor="end">
                    ${formatCompactNumber(value)}
                </text>
            `;
    }).join("");

    const dots = points.map(point => renderChartPoint(point, height)).join("");

    return `
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="本月分數折線圖">
                <defs>
                    <linearGradient id="scoreAreaGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="rgba(37, 99, 235, 0.22)"></stop>
                        <stop offset="100%" stop-color="rgba(14, 165, 233, 0.02)"></stop>
                    </linearGradient>
                </defs>

                ${gridLines}

                <line class="chart-axis" x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}"></line>
                <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}"></line>

                ${areaPath ? `<path class="chart-area" d="${areaPath}"></path>` : ""}
                ${linePath ? `<path class="chart-line" d="${linePath}"></path>` : ""}

                ${dots}
            </svg>
        `;
}

function renderChartPoint(point, height) {
    const label = escapeHTML(point.shortLabel);
    const value = point.hasScore ? formatNumber(point.score) : "無資料";

    if (!point.hasScore) {
        return `
                <circle class="chart-dot-empty" cx="${point.x}" cy="${point.y}" r="5">
                    <title>${label}：無資料</title>
                </circle>
                <text class="chart-label" x="${point.x}" y="${height - 24}" text-anchor="middle">${label}</text>
            `;
    }

    return `
            <circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="6">
                <title>${label}：${value}</title>
            </circle>
            <text class="chart-value" x="${point.x}" y="${point.y - 12}" text-anchor="middle">${formatCompactNumber(point.score)}</text>
            <text class="chart-label" x="${point.x}" y="${height - 24}" text-anchor="middle">${label}</text>
        `;
}

function renderProfileTimeline(records) {
    if (!records.length) {
        return `
                <div class="profile-empty">
                    查無這位成員的週別紀錄。
                </div>
            `;
    }

    return records
        .slice()
        .reverse()
        .map(renderProfileTimelineRow)
        .join("");
}

function renderProfileTimelineRow(record) {
    const activities = getRecordActivities(record);
    const dynamicColumnCount = activities.length + 2;

    const activityHTML = activities
        .map(activity => `
                <div class="profile-week-score">
                    <span class="profile-week-caption">${escapeHTML(activity.label)}</span>
                    ${formatNumber(activity.value)}
                </div>
            `)
        .join("");

    return `
            <div class="profile-week-row" style="--profile-week-columns: ${dynamicColumnCount}">
                <div>
                    <div class="profile-week-label">${escapeHTML(record.weekLabel)}</div>
                    <div class="profile-week-small">${escapeHTML(record.startDate || "未提供日期")}</div>
                </div>

                <div class="profile-week-score">
                    <span class="profile-week-caption">一週總分</span>
                    ${formatNumber(record.score)}
                </div>

                ${activityHTML}

                <div class="profile-week-score">
                    <span class="profile-week-caption">狀態</span>
                    <span class="badge ${getBadgeClass(record.status)}">${escapeHTML(record.status || "-")}</span>
                </div>
            </div>
        `;
}

function renderMemberProfile(profile) {
    const summary = getProfileSummary(profile);

    if (!profile.records.length) {
        renderEmptyMemberProfile();

        return;
    }

    const latestRecord = summary.latestRecord;
    const bestRecord = summary.bestRecord;

    const displayName = latestRecord.cm || latestRecord.lineName || "未命名成員";
    const isLatestElder = cleanText(latestRecord.status) === STATUS.ELDER;

    if (els.profileDialog) {
        els.profileDialog.classList.toggle("profile-elder", isLatestElder);
    }

    els.profileName.textContent = displayName;
    els.profileMeta.textContent =
        `共出現 ${summary.totalWeeks} 週｜最新狀態：${latestRecord.status || "未標記"}｜${profile.selectedMonthLabel}走勢分析`;

    els.profileBody.innerHTML = `
            ${isLatestElder ? renderElderProfileBanner() : ""}

            <div class="profile-grid">
                <article class="profile-stat">
                    <div class="profile-stat-label">歷史最高分</div>
                    <div class="profile-stat-value">${formatNumber(bestRecord.score)}</div>
                    <div class="profile-stat-note">${escapeHTML(bestRecord.weekLabel)}</div>
                </article>

                <article class="profile-stat">
                    <div class="profile-stat-label">歷史平均分</div>
                    <div class="profile-stat-value">${formatNumber(summary.averageScore)}</div>
                    <div class="profile-stat-note">依出現週數平均</div>
                </article>

                <article class="profile-stat">
                    <div class="profile-stat-label">${escapeHTML(profile.selectedMonthLabel)}總分</div>
                    <div class="profile-stat-value">${formatNumber(summary.monthTotal)}</div>
                    <div class="profile-stat-note">本月已出現週別加總</div>
                </article>

                <article class="profile-stat">
                    <div class="profile-stat-label">本月走勢</div>
                    <div class="profile-stat-value">${escapeHTML(formatDelta(summary.monthDelta))}</div>
                    <div class="profile-stat-note">以本月第一筆與最後一筆比較</div>
                </article>
            </div>

            <section class="profile-section">
                <div class="profile-section-head">
                    <h3 class="profile-section-title">${escapeHTML(profile.selectedMonthLabel)}分數折線圖</h3>
                    <span class="profile-section-subtitle">顯示目前選取月份的每週總分</span>
                </div>

                <div class="profile-chart">
                    ${renderProfileChart(profile.monthRecords)}
                </div>
            </section>

            <section class="profile-section">
                <div class="profile-section-head">
                    <h3 class="profile-section-title">歷史週別紀錄</h3>
                    <span class="profile-section-subtitle">最新週別在最上方</span>
                </div>

                <div class="profile-timeline">
                    ${renderProfileTimeline(profile.records)}
                </div>
            </section>
        `;
}

function renderEmptyMemberProfile() {
    els.profileName.textContent = "查無成員資料";
    els.profileMeta.textContent = "沒有找到對應的歷史紀錄。";
    els.profileBody.innerHTML = `
            <div class="profile-empty">
                找不到這位成員的歷史資料。
            </div>
        `;
}

function renderElderProfileBanner() {
    return `
            <div class="elder-profile-banner">
                <div class="elder-profile-icon" aria-hidden="true">♕</div>

                <div>
                    <div class="elder-profile-title">長老榮耀已啟用</div>
                    <div class="elder-profile-text">
                        此成員目前為長老身份，已達成本週高階標準。系統已套用專屬獎勵視覺與榮耀標記。
                    </div>
                </div>

                <div class="elder-profile-tag">
                    ELDER REWARD
                </div>
            </div>
        `;
}

/* ================================
   Modal
================================ */

function openProfileModal() {
    els.profileModal.hidden = false;
    document.body.classList.add("profile-open");
}

function closeProfileModal() {
    els.profileModal.hidden = true;
    document.body.classList.remove("profile-open");

    if (els.profileDialog) {
        els.profileDialog.classList.remove("profile-elder");
    }
}

async function openMemberProfile(profileKeyValue) {
    const initialKeys = String(profileKeyValue || "")
        .split("|")
        .map(key => key.trim())
        .filter(Boolean);

    if (!initialKeys.length) return;

    openProfileModal();

    els.profileName.textContent = "成員資料";
    els.profileMeta.textContent = "資料分析中...";
    els.profileBody.innerHTML = `
            <div class="profile-loading">
                正在彙整歷史最高分、本月折線圖與週別紀錄...
            </div>
        `;

    try {
        const profile = await buildMemberProfile(initialKeys);

        renderMemberProfile(profile);
    } catch (error) {
        console.error(error);

        els.profileName.textContent = "資料讀取失敗";
        els.profileMeta.textContent = "個人資料分析時發生錯誤。";
        els.profileBody.innerHTML = `
                <div class="profile-empty">
                    個人資料讀取失敗，請確認每週 CSV 檔案是否都能正常讀取。
                </div>
            `;
    }
}

/* ================================
   App Loading
================================ */

async function loadWeek(weekId) {
    const week = findWeekById(weekId);

    state.currentWeek = week;
    state.hasRenderedTableOnce = false;

    showLoading("資料載入中...");

    const rows = cloneRows(await getWeekRows(week));
    const previousRows = await getPreviousRows(week.id);

    showLoading("分析本月後五名中...");
    await loadHistoryBottomFive(week);

    showLoading("計算本月個人總分中...");
    await loadMonthlyPersonalTotals(week);

    showLoading("產生成就徽章中...");
    await loadMonthlyAchievements(week);

    state.currentRows = prepareCurrentRows(rows, previousRows);

    renderHead();
    renderStatusFilter(state.currentRows);
    renderAchievementsPodium();
    renderStats(state.currentRows);
    renderBody();
}

function renderError(error) {
    console.error(error);

    const achievementsSection = ensureAchievementsSection();

    if (achievementsSection) {
        achievementsSection.innerHTML = "";
    }

    els.stats.innerHTML = "";
    els.resultHint.textContent = "資料讀取失敗";
    els.tableHead.innerHTML = "";

    els.tableBody.innerHTML = `
            <tr>
                <td class="empty-state" colspan="${DISPLAY_HEADERS.length}">
                    資料讀取失敗，請確認 <strong>data/weeks.csv</strong> 與每週 CSV 檔案路徑是否正確。
                </td>
            </tr>
        `;
}

async function initApp() {
    try {
        renderHead();
        renderLoading("讀取週別資料中...");

        await loadWeeks();

        if (!state.weeks.length) {
            throw new Error("weeks.csv 沒有週別資料");
        }

        await loadWeek(state.weeks[0].id);
    } catch (error) {
        renderError(error);
    }
}

/* ================================
   Events
================================ */

const debouncedRenderBody = debounce(renderBody, 180);

els.weekSelect.addEventListener("change", async event => {
    try {
        els.searchInput.value = "";
        els.statusFilter.value = STATUS.ALL;

        await loadWeek(event.target.value);
    } catch (error) {
        renderError(error);
    }
});

els.searchInput.addEventListener("input", debouncedRenderBody);
els.statusFilter.addEventListener("change", renderBody);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-profile-keys]");

    if (!button) return;

    openMemberProfile(button.dataset.profileKeys || "");
});

els.profileClose.addEventListener("click", closeProfileModal);

els.profileModal.addEventListener("click", event => {
    if (event.target.matches("[data-profile-close]")) {
        closeProfileModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !els.profileModal.hidden) {
        closeProfileModal();
    }
});

initApp();
