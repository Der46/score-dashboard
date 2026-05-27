/* ================================
   I18n
================================ */

const I18N_URL = "./i18n.json";
const DEFAULT_LOCALE = "zh-Hant";
const STORAGE_LOCALE_KEY = "score-dashboard-locale";

const i18nState = {
    locale: localStorage.getItem(STORAGE_LOCALE_KEY) || DEFAULT_LOCALE,
    messages: {}
};

function getNestedValue(object, path) {
    return String(path || "")
        .split(".")
        .reduce((current, key) => current?.[key], object);
}

function interpolate(template, params = {}) {
    return String(template ?? "").replace(/\{(\w+)\}/g, (_, key) => {
        return params[key] ?? "";
    });
}

function t(path, params = {}) {
    const localeMessages = i18nState.messages[i18nState.locale] || {};
    const fallbackMessages = i18nState.messages[DEFAULT_LOCALE] || {};

    const value =
        getNestedValue(localeMessages, path) ??
        getNestedValue(fallbackMessages, path) ??
        path;

    return interpolate(value, params);
}

function getCurrentLocale() {
    return i18nState.locale || DEFAULT_LOCALE;
}

function getLocaleForNumber() {
    const locale = getCurrentLocale();

    if (locale === "zh-Hant") return "zh-TW";
    if (locale === "vi") return "vi-VN";

    return "en-US";
}

async function loadI18n() {
    const response = await fetch(I18N_URL, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`Failed to read i18n file: ${I18N_URL}`);
    }

    i18nState.messages = await response.json();

    if (!i18nState.messages[i18nState.locale]) {
        i18nState.locale = DEFAULT_LOCALE;
    }

    applyStaticI18n();
}

async function setLocale(locale) {
    if (!i18nState.messages[locale]) return;

    i18nState.locale = locale;
    localStorage.setItem(STORAGE_LOCALE_KEY, locale);

    applyStaticI18n();
    await rerenderAll();
}

function applyStaticI18n() {
    document.documentElement.lang = t("page.htmlLang");
    document.title = t("page.title");

    document.querySelectorAll("[data-i18n]").forEach(element => {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(element => {
        const rules = element.dataset.i18nAttr
            .split(";")
            .map(rule => rule.trim())
            .filter(Boolean);

        rules.forEach(rule => {
            const [attribute, path] = rule.split(":").map(part => part.trim());

            if (!attribute || !path) return;

            element.setAttribute(attribute, t(path));
        });
    });

    if (els?.languageSelect) {
        els.languageSelect.value = getCurrentLocale();
    }
}

async function rerenderAll() {
    if (!state.weeks.length) return;

    const keyword = els.searchInput.value;
    const status = els.statusFilter.value;

    renderWeekSelect();

    if (state.currentWeek) {
        await loadWeek(state.currentWeek.id);

        els.searchInput.value = keyword;

        const optionValues = Array.from(els.statusFilter.options).map(option => option.value);
        els.statusFilter.value = optionValues.includes(status) ? status : STATUS.ALL;

        renderBody();
    } else if (state.currentRows.length) {
        renderHead();
        renderStatusFilter(state.currentRows);
        renderAchievementsPodium();
        renderStats(state.currentRows);
        renderBody();
    }

    if (!els.profileModal.hidden) {
        closeProfileModal();
    }
}

function tx(value) {
    const map = {
        "全部": t("status.all"),
        "PASS": t("status.pass"),
        "淘汰": t("status.out"),
        "回歸": t("status.return"),
        "降級": t("status.downgrade"),
        "長老": t("status.elder"),
        "隊長": t("status.captain"),
        "副隊長": t("status.viceCaptain"),
        "無資料": t("status.noData"),
        "不計算": t("common.notCalculated"),
        "總計": t("specialCm.total"),
        "【回歸帳號】": t("specialCm.returnSection")
    };

    return map[value] || value;
}

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

const HEADER_I18N_KEY = {
    [RANK_COLUMN]: "headers.rank",
    "CM": "headers.cm",
    "活動1總分": "headers.activity1Total",
    "活動2總分": "headers.activity2Total",
    "活動3總分": "headers.activity3Total",
    "一週總分": "headers.weeklyTotal",
    [MONTH_TOTAL_COLUMN]: "headers.monthTotal",
    "距離合格分數": "headers.passDistance",
    "距離長老分數": "headers.elderDistance",
    "較上週": "headers.compareLastWeek",
    [HISTORY_COLUMN]: "headers.bottomFiveThisMonth",
    "狀態": "headers.status"
};

function getHeaderLabel(header) {
    return HEADER_I18N_KEY[header] ? t(HEADER_I18N_KEY[header]) : header;
}
function getAchievementTitle(achievement) {
    return achievement.titleKey ? t(achievement.titleKey) : achievement.title || "";
}

function getAchievementSubtitle(achievement) {
    return achievement.subtitleKey ? t(achievement.subtitleKey) : achievement.subtitle || "";
}

function getAchievementEmptyText(achievement) {
    return achievement.emptyTextKey ? t(achievement.emptyTextKey) : achievement.emptyText || t("common.noData");
}

const ACHIEVEMENT_BADGES = {
    MVP: {
        key: "mvp",
        titleKey: "achievement.mvpTitle",
        subtitleKey: "achievement.mvpSubtitle",
        icon: "🏆",
        accent: "gold",
        emptyTextKey: "achievement.mvpEmpty"
    },
    IMPROVER: {
        key: "improver",
        titleKey: "achievement.improverTitle",
        subtitleKey: "achievement.improverSubtitle",
        icon: "🚀",
        accent: "green",
        emptyTextKey: "achievement.improverEmpty"
    },
    STABLE: {
        key: "stable",
        titleKey: "achievement.stableTitle",
        subtitleKey: "achievement.stableSubtitle",
        icon: "🛡️",
        accent: "blue",
        emptyTextKey: "achievement.stableEmpty"
    },
    BURST: {
        key: "burst",
        titleKey: "achievement.burstTitle",
        subtitleKey: "achievement.burstSubtitle",
        icon: "⚡",
        accent: "orange",
        emptyTextKey: "achievement.burstEmpty"
    },
    POTENTIAL: {
        key: "potential",
        titleKey: "achievement.potentialTitle",
        subtitleKey: "achievement.potentialSubtitle",
        icon: "🌱",
        accent: "purple",
        emptyTextKey: "achievement.potentialEmpty"
    }
};

const ROLE_META = {
    [STATUS.ELDER]: {
        rowClass: "row-elder",
        rankBadgeClass: "rank-badge rank-badge-elder",
        personLinkClass: "person-link elder-link",
        badgeClass: "badge-elder",
    },
    [STATUS.CAPTAIN]: {
        rowClass: "row-captain",
        rankBadgeClass: "rank-badge rank-badge-captain",
        personLinkClass: "person-link captain-link",
        badgeClass: "badge-captain",
    },
    [STATUS.VICE_CAPTAIN]: {
        rowClass: "row-vice",
        rankBadgeClass: "rank-badge rank-badge-vice",
        personLinkClass: "person-link vice-link",
        badgeClass: "badge-vice",
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

const els = {
    languageSelect: document.getElementById("languageSelect"),
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
    historyScopeLabel: "",
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
    return Number(value || 0).toLocaleString(getLocaleForNumber());
}

function formatCompactNumber(value) {
    const number = Number(value || 0);
    const locale = getLocaleForNumber();

    return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(number);
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
    if (delta === null || delta === undefined) return t("trend.noData");
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

function showLoading(message = t("common.syncing")) {
    els.resultHint.textContent = message;
    renderLoading(message);
}

/* ================================
   Data Fetching / CSV
================================ */

async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(t("error.fetchFailed", { url }));
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
        return t("month.currentMonth");
    }

    return t("month.label", { year, month });
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
        throw new Error(t("error.weekNotFound"));
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
        console.warn(t("error.previousWeekReadFailed"), error);

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
    const keyMap = {
        [STATUS.ELDER]: "statusTitle.elder",
        [STATUS.CAPTAIN]: "statusTitle.captain",
        [STATUS.VICE_CAPTAIN]: "statusTitle.viceCaptain",
        [STATUS.PASS]: "statusTitle.pass",
        [STATUS.OUT]: "statusTitle.out",
        [STATUS.DOWNGRADE]: "statusTitle.downgrade"
    };

    return keyMap[status] ? t(keyMap[status]) : tx(status) || "";
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
    return `data-label="${escapeHTML(getHeaderLabel(header))}"`;
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
            row["較上週"] = t("common.notCalculated");

            row.__trend = TREND.SAME;
            row.__delta = null;
            row.__prevScore = null;

            return row;
        }

        const key = getPersonKey(row);
        const currentScore = parseNumber(row["一週總分"]);

        if (!key || !previousScoreMap.has(key)) {
            row["較上週"] = t("common.newOrNoData");
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
            console.warn(t("error.historyBottomFiveReadFailed", { file: week.file }), error);
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

            row[HISTORY_COLUMN] = t("common.notCalculated");
            row.__historyLevel = HISTORY_LEVEL.NONE;
            row.__historyTitle = t("history.excludedTitle", {
                status: tx(status || t("common.noData")),
                scope: state.historyScopeLabel
            });
            row.__historyAlways = false;

            return row;
        }

        const key = getPersonKey(row);
        const summary = state.historySummaryMap.get(key);

        if (!summary) {
            row[HISTORY_COLUMN] = "—";
            row.__historyLevel = HISTORY_LEVEL.NONE;
            row.__historyTitle = t("history.noMonthData", {
                scope: state.historyScopeLabel
            });
            row.__historyAlways = false;

            return row;
        }

        const alwaysBottomFive = isAlwaysHistoricalBottomFive(summary);

        row.__historyAlways = alwaysBottomFive;
        row.__historyTitle = summary.bottomWeekLabels.length
            ? t("history.bottomFiveWeeks", {
                scope: state.historyScopeLabel,
                weeks: summary.bottomWeekLabels.join("、")
            })
            : t("history.noBottomFive", {
                scope: state.historyScopeLabel
            });

        if (alwaysBottomFive) {
            row[HISTORY_COLUMN] = t("history.alwaysBottomFive", {
                bottomWeeks: summary.bottomWeeks,
                weeksSeen: summary.weeksSeen
            });
            row.__historyLevel = HISTORY_LEVEL.RISK;
        } else if (summary.bottomWeeks > 0) {
            row[HISTORY_COLUMN] = t("history.everBottomFive", {
                bottomWeeks: summary.bottomWeeks,
                weeksSeen: summary.weeksSeen
            });
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
            console.warn(t("error.monthlyPersonalTotalReadFailed", { file: week.file }), error);
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
            row.__monthTotalTitle = t("monthlyTotal.noData", {
                scope: state.historyScopeLabel
            });

            return row;
        }

        row.__monthTotal = summary.totalScore;
        row.__monthTotalRank = summary.totalRank || null;
        row[MONTH_TOTAL_COLUMN] = formatNumber(summary.totalScore);

        if (summary.isReturnAccount || isReturnAccount(row)) {
            row.__monthTotalTitle = t("monthlyTotal.returnExcludedTitle", {
                scope: state.historyScopeLabel,
                score: formatNumber(summary.totalScore),
                weeksSeen: summary.weeksSeen,
                totalWeeks: summary.totalWeeks
            });
        } else {
            row.__monthTotalTitle = t("monthlyTotal.rankTitle", {
                scope: state.historyScopeLabel,
                score: formatNumber(summary.totalScore),
                rank: summary.totalRank,
                weeksSeen: summary.weeksSeen,
                totalWeeks: summary.totalWeeks
            });
        }

        return row;
    });
}

/* ================================
   Achievements / Podium
================================ */

function isAchievementEligiblePerson(row) {
    return isPersonRow(row) && Boolean(getAchievementPersonKey(row));
}

function getAchievementPersonKey(row) {
    return getCmKey(row);
}

function getAchievementIdentityFlags(row) {
    const status = getRowStatus(row);

    return {
        isReturnAccount: isReturnAccount(row),
        isElder: status === STATUS.ELDER,
        isCaptain: status === STATUS.CAPTAIN,
        isViceCaptain: status === STATUS.VICE_CAPTAIN,
        latestStatus: status || ""
    };
}

async function loadMonthlyAchievements(targetWeek) {
    const monthWeeks = getWeeksInSameMonth(targetWeek).reverse();
    const achievementMap = new Map();

    for (const week of monthWeeks) {
        try {
            const rows = await getWeekRows(week);

            rows.filter(isAchievementEligiblePerson).forEach(row => {
                const key = getAchievementPersonKey(row);

                if (!key) return;

                const score = parseNumber(row["一週總分"]);
                const identityFlags = getAchievementIdentityFlags(row);

                if (!achievementMap.has(key)) {
                    achievementMap.set(key, {
                        key,
                        cm: row["CM"] || "",
                        lineName: row["LINE名稱"] || "",
                        totalScore: 0,
                        scores: [],
                        weekLabels: [],
                        bestScore: Number.NEGATIVE_INFINITY,
                        bestWeekLabel: "",
                        weeksSeen: 0,
                        totalWeeks: monthWeeks.length,

                        isReturnAccount: false,
                        isElder: false,
                        isCaptain: false,
                        isViceCaptain: false,
                        latestStatus: ""
                    });
                }

                const item = achievementMap.get(key);

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

                item.isReturnAccount = item.isReturnAccount || identityFlags.isReturnAccount;
                item.isElder = item.isElder || identityFlags.isElder;
                item.isCaptain = item.isCaptain || identityFlags.isCaptain;
                item.isViceCaptain = item.isViceCaptain || identityFlags.isViceCaptain;
                item.latestStatus = identityFlags.latestStatus || item.latestStatus;
            });
        } catch (error) {
            console.warn(t("error.monthlyAchievementReadFailed", { file: week.file }), error);
        }
    }

    achievementMap.forEach(item => {
        if (item.bestScore === Number.NEGATIVE_INFINITY) {
            item.bestScore = 0;
        }
    });

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
            metricLabel: t("achievement.metricMonthTotal"),
            metricValue: formatNumber(winner.totalScore),
            detail: t("achievement.detailAppeared", {
                tag: getAchievementMemberTag(winner),
                weeksSeen: winner.weeksSeen,
                totalWeeks: winner.totalWeeks
            })
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
            metricLabel: t("achievement.metricImprovement"),
            metricValue: formatDelta(winner.achievementScore),
            detail: t("achievement.detailScoreChange", {
                tag: getAchievementMemberTag(winner),
                firstScore: formatNumber(winner.firstScore),
                lastScore: formatNumber(winner.lastScore)
            })
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
            metricLabel: t("achievement.metricAverageVolatility"),
            metricValue: `${formatCompactNumber(winner.averageScore)} / ${formatCompactNumber(Math.round(winner.volatility))}`,
            detail: t("achievement.detailStable", {
                tag: getAchievementMemberTag(winner),
                average: formatCompactNumber(averageOfAverages)
            })
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
            metricLabel: t("achievement.metricBestWeek"),
            metricValue: formatNumber(winner.bestScore),
            detail: t("achievement.detailBestWeek", {
                tag: getAchievementMemberTag(winner),
                week: winner.bestWeekLabel || t("achievement.fallbackWeek")
            })
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
            metricLabel: t("achievement.metricRecentRise"),
            metricValue: formatDelta(winner.totalRise),
            detail: t("achievement.detailRecentRise", {
                tag: getAchievementMemberTag(winner),
                scores: winner.last3.map(formatCompactNumber).join(" → ")
            })
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

function getAchievementMemberTag(member) {
    if (!member) return t("common.normal");

    const tags = [];

    if (member.isReturnAccount) {
        tags.push(tx(STATUS.RETURN));
    }

    if (member.isElder) {
        tags.push(tx(STATUS.ELDER));
    }

    if (member.isCaptain) {
        tags.push(tx(STATUS.CAPTAIN));
    }

    if (member.isViceCaptain) {
        tags.push(tx(STATUS.VICE_CAPTAIN));
    }

    if (!tags.length && member.latestStatus) {
        tags.push(tx(member.latestStatus));
    }

    return tags.length ? tags.join(" / ") : t("common.normal");
}

function getAchievementMemberClass(member) {
    if (!member) return "";

    if (member.isElder) {
        return "achievement-member-elder";
    }

    if (member.isCaptain) {
        return "achievement-member-captain";
    }

    if (member.isViceCaptain) {
        return "achievement-member-vice";
    }

    if (member.isReturnAccount) {
        return "achievement-member-return";
    }

    return "";
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
    const loadedText = state.historyScopeLabel || t("month.currentMonth");

    section.innerHTML = `
        <div class="achievements-head">
            <div>
                <div class="achievements-kicker">${escapeHTML(t("achievement.kicker"))}</div>
                <h2 class="achievements-title" id="achievementsTitle">
                    ${escapeHTML(t("achievement.title", { scope: loadedText }))}
                </h2>
            </div>

            <div class="achievements-note">
                ${escapeHTML(t("achievement.note"))}
            </div>
        </div>

        <div class="podium-row" role="list">
            ${achievements.map(renderAchievementCard).join("")}
        </div>
    `;
}

function renderAchievementCard(achievement) {
    const accent = escapeHTML(achievement.accent || "");
    const title = escapeHTML(getAchievementTitle(achievement));
    const subtitle = escapeHTML(getAchievementSubtitle(achievement));
    const icon = escapeHTML(achievement.icon || "🏅");

    if (achievement.isEmpty || !achievement.winner) {
        return `
            <article class="podium-card podium-${accent} podium-empty" role="listitem">
                <div class="podium-medal" aria-hidden="true">${icon}</div>

                <div class="podium-content">
                    <div class="podium-title">${title}</div>
                    <div class="podium-subtitle">${subtitle}</div>
                    <div class="podium-name">${escapeHTML(t("achievement.pending"))}</div>
                    <div class="podium-metric">${escapeHTML(getAchievementEmptyText(achievement))}</div>
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
    const memberClass = getAchievementMemberClass(member);

    return `
        <article class="podium-card podium-${accent}" role="listitem">
            <div class="podium-medal" aria-hidden="true">${icon}</div>

            <div class="podium-content">
                <div class="podium-title">${title}</div>
                <div class="podium-subtitle">${subtitle}</div>

                <button
                    class="podium-name ${escapeHTML(memberClass)}"
                    type="button"
                    data-profile-keys="${escapeHTML(profileKeys)}"
                    title="${escapeHTML(t("achievement.viewProfileTitle", { name: displayName }))}"
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
            ? t("rank.returnAccountNumber", { number })
            : t("rank.number", { number });

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
            __displayRankTitle: t("monthlyTotal.displayRankTitle", { rank: index + 1 })
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
                        ${escapeHTML(getHeaderLabel(header))}
                    </th>
                `;
    }).join("")}
        </tr>
    `;
}

function renderLoading(message = t("common.syncing")) {
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
    const currentWeekId = state.currentWeek?.id || state.weeks[0]?.id || "";

    els.weekSelect.innerHTML = state.weeks
        .map(week => `<option value="${escapeHTML(week.id)}">${escapeHTML(week.label)}</option>`)
        .join("");

    if (currentWeekId) {
        els.weekSelect.value = currentWeekId;
    }
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
        <option value="${STATUS.ALL}">${escapeHTML(t("status.allStatus"))}</option>
        <option value="${SPECIAL_STATUS_FILTERS.EVER_BOTTOM_FIVE}">${escapeHTML(t("filters.everBottomFive"))}</option>
        <option value="${SPECIAL_STATUS_FILTERS.MONTH_TOTAL_SCORE_SORT}">${escapeHTML(t("filters.monthTotalScoreSort"))}</option>
        ${statuses.map(status => `
            <option value="${escapeHTML(status)}">${escapeHTML(tx(status))}</option>
        `).join("")}
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
            label: t("stats.weeklyTotalSum"),
            value: getWeeklyTotalScore(rows),
            icon: "⚡",
            format: "compact",
            className: ""
        },
        {
            label: tx(STATUS.ELDER),
            value: countByStatus(people, STATUS.ELDER),
            icon: "♕",
            format: "normal",
            className: "stat-elder"
        },
        {
            label: tx(STATUS.PASS),
            value: countByStatus(people, STATUS.PASS),
            icon: "✅",
            format: "normal",
            className: ""
        },
        {
            label: tx(STATUS.DOWNGRADE),
            value: countByStatus(people, STATUS.DOWNGRADE),
            icon: "⚠️",
            format: "normal",
            className: ""
        },
        {
            label: tx(STATUS.OUT),
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
        els.resultHint.textContent = t("table.shownZero");
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
                ${escapeHTML(t("table.empty"))}
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
                📌 ${escapeHTML(tx(cleanText(row["CM"])))}
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
    const rawCellValue = cleanText(row[header]);
    const rawName = rawCellValue || t("profile.thisMember");

    const displayName = escapeHTML(
        !isPersonRow(row)
            ? tx(rawCellValue || "-")
            : (rawCellValue || "-")
    );

    if (isPersonRow(row) && cmKey) {
        return `
            <td class="${getCellClass(header, "name")}" ${getCellLabelAttr(header)}>
                <button 
                    class="${getPersonLinkClass(row)}" 
                    type="button" 
                    data-profile-keys="${escapeHTML(cmKey)}" 
                    title="${escapeHTML(t("achievement.viewProfileTitle", { name: rawName }))}"
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
            ? t("trend.lastWeek", { score: formatNumber(row.__prevScore) })
            : t("trend.lastWeekNoData");

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
        ? `<span class="badge ${getBadgeClass(status)}" title="${escapeHTML(getStatusTitle(status))}">${escapeHTML(tx(status))}</span>`
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

    els.resultHint.textContent = t("table.hint", {
        shownPeople,
        allPeople,
        shownExcluded: shownExcludedCount,
        allExcluded: allExcludedCount,
        scope: state.historyScopeLabel,
        everCount: historyEverCount,
        riskCount: historyRiskCount
    });
}

function updateMonthlyTotalScoreHint(filteredRows) {
    const sortedPeople = filteredRows.filter(row => {
        return isPersonRow(row) && !isReturnAccount(row);
    });

    const topPerson = sortedPeople[0] || null;

    els.resultHint.textContent = topPerson
        ? t("monthlyTotal.hintTop", {
            scope: state.historyScopeLabel,
            name: topPerson["CM"] || "-",
            score: formatNumber(topPerson.__monthTotal || 0)
        })
        : t("monthlyTotal.hintEmpty");
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
            label: t("profile.activity", { number: 1 }),
            value: activity1,
            raw: activity1Raw,
            show: true
        },
        {
            label: t("profile.activity", { number: 2 }),
            value: activity2,
            raw: activity2Raw,
            show: true
        }
    ];

    if (activity3Raw !== "" && activity3 !== 0) {
        activities.push({
            label: t("profile.activity", { number: 3 }),
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

    if (!Number.isFinite(record.score)) {
        return [];
    }

    if (Array.isArray(record.activities) && record.activities.length) {
        return record.activities.filter(activity => activity.show !== false);
    }

    const activities = [
        {
            label: t("profile.activity", { number: 1 }),
            value: record.activity1,
            show: true
        },
        {
            label: t("profile.activity", { number: 2 }),
            value: record.activity2,
            show: true
        }
    ];

    if (Number.isFinite(record.activity3) && record.activity3 !== 0) {
        activities.push({
            label: t("profile.activity", { number: 3 }),
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
                ${escapeHTML(t("profile.chartNoData"))}
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
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(t("profile.chartAria"))}">
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
    const value = point.hasScore ? formatNumber(point.score) : t("common.noData");

    if (!point.hasScore) {
        return `
        <circle class="chart-dot-empty" cx="${point.x}" cy="${point.y}" r="5">
            <title>${label}：${escapeHTML(t("common.noData"))}</title>
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
                ${escapeHTML(t("profile.timelineNoData"))}
            </div>
        `;
    }

    return records
        .slice()
        .reverse()
        .map(renderProfileTimelineRow)
        .join("");
}

function formatOptionalNumber(value) {
    return Number.isFinite(value) ? formatNumber(value) : "-";
}

function renderProfileTimelineRow(record) {
    const activities = getRecordActivities(record);
    const dynamicColumnCount = activities.length + 2;

    const activityHTML = activities
        .map(activity => `
        <div class="profile-week-score">
            <span class="profile-week-caption">${escapeHTML(activity.label)}</span>
            ${formatOptionalNumber(activity.value)}
        </div>
    `)
        .join("");

    return `
            <div class="profile-week-row" style="--profile-week-columns: ${dynamicColumnCount}">
                <div>
                    <div class="profile-week-label">${escapeHTML(record.weekLabel)}</div>
                    <div class="profile-week-small">${escapeHTML(record.startDate || t("common.notProvidedDate"))}</div>
                </div>

                <div class="profile-week-score">
                    <span class="profile-week-caption">${escapeHTML(t("profile.weeklyTotal"))}</span>
                    ${formatOptionalNumber(record.score)}
                </div>

                ${activityHTML}

                <div class="profile-week-score">
                    <span class="profile-week-caption">${escapeHTML(t("profile.status"))}</span>
                    <span class="badge ${getBadgeClass(record.status)}">${escapeHTML(tx(record.status) || "-")}</span>
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

    const displayName = latestRecord.cm || latestRecord.lineName || t("common.unnamedMember");
    const isLatestElder = cleanText(latestRecord.status) === STATUS.ELDER;

    if (els.profileDialog) {
        els.profileDialog.classList.toggle("profile-elder", isLatestElder);
    }

    els.profileName.textContent = displayName;
    els.profileMeta.textContent = t("profile.weeksAppearedMeta", {
        weeks: summary.totalWeeks,
        status: tx(latestRecord.status) || t("profile.latestStatusUnmarked"),
        month: profile.selectedMonthLabel
    });

    els.profileBody.innerHTML = `
            ${isLatestElder ? renderElderProfileBanner() : ""}

            <div class="profile-grid">
                <article class="profile-stat">
                    <div class="profile-stat-label">${escapeHTML(t("profile.bestScore"))}</div>
                    <div class="profile-stat-value">${formatNumber(bestRecord.score)}</div>
                    <div class="profile-stat-note">${escapeHTML(bestRecord.weekLabel)}</div>
                </article>

                <article class="profile-stat">
                    <div class="profile-stat-label">${escapeHTML(t("profile.averageScore"))}</div>
                    <div class="profile-stat-value">${formatNumber(summary.averageScore)}</div>
                    <div class="profile-stat-note">${escapeHTML(t("profile.averageNote"))}</div>
                </article>

                <article class="profile-stat">
                    <div class="profile-stat-label">${escapeHTML(t("profile.monthTotal", { month: profile.selectedMonthLabel }))}</div>
                    <div class="profile-stat-value">${formatNumber(summary.monthTotal)}</div>
                    <div class="profile-stat-note">${escapeHTML(t("profile.monthTotalNote"))}</div>
                </article>

                <article class="profile-stat">
                    <div class="profile-stat-label">${escapeHTML(t("profile.monthTrend"))}</div>
                    <div class="profile-stat-value">${escapeHTML(formatDelta(summary.monthDelta))}</div>
                    <div class="profile-stat-note">${escapeHTML(t("profile.monthTrendNote"))}</div>
                </article>
            </div>

            <section class="profile-section">
                <div class="profile-section-head">
                    <h3 class="profile-section-title">${escapeHTML(t("profile.chartTitle", { month: profile.selectedMonthLabel }))}</h3>
                    <span class="profile-section-subtitle">${escapeHTML(t("profile.chartSubtitle"))}</span>
                </div>

                <div class="profile-chart">
                    ${renderProfileChart(profile.monthRecords)}
                </div>
            </section>

            <section class="profile-section">
                <div class="profile-section-head">
                    <h3 class="profile-section-title">${escapeHTML(t("profile.timelineTitle"))}</h3>
                    <span class="profile-section-subtitle">${escapeHTML(t("profile.timelineSubtitle"))}</span>
                </div>

                <div class="profile-timeline">
                    ${renderProfileTimeline(profile.records)}
                </div>
            </section>
        `;
}

function renderEmptyMemberProfile() {
    els.profileName.textContent = t("profile.emptyTitle");
    els.profileMeta.textContent = t("profile.emptyMeta");
    els.profileBody.innerHTML = `
        <div class="profile-empty">
            ${escapeHTML(t("profile.emptyBody"))}
        </div>
    `;
}

function renderElderProfileBanner() {
    return `
        <div class="elder-profile-banner">
            <div class="elder-profile-icon" aria-hidden="true">♕</div>

            <div>
                <div class="elder-profile-title">${escapeHTML(t("profile.elderBannerTitle"))}</div>
                <div class="elder-profile-text">
                    ${escapeHTML(t("profile.elderBannerText"))}
                </div>
            </div>

            <div class="elder-profile-tag">
                ${escapeHTML(t("profile.elderReward"))}
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

    els.profileName.textContent = t("profile.title");
    els.profileMeta.textContent = t("profile.analyzing");
    els.profileBody.innerHTML = `
        <div class="profile-loading">
            ${escapeHTML(t("profile.loadingDetail"))}
        </div>
    `;

    try {
        const profile = await buildMemberProfile(initialKeys);

        renderMemberProfile(profile);
    } catch (error) {
        console.error(error);

        els.profileName.textContent = t("profile.readFailedTitle");
        els.profileMeta.textContent = t("profile.readFailedMeta");
        els.profileBody.innerHTML = `
            <div class="profile-empty">
                ${escapeHTML(t("profile.readFailedBody"))}
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

    showLoading(t("common.dataLoading"));

    const rows = cloneRows(await getWeekRows(week));
    const previousRows = await getPreviousRows(week.id);

    showLoading(t("loadingSteps.bottomFive"));
    await loadHistoryBottomFive(week);

    showLoading(t("loadingSteps.monthlyTotal"));
    await loadMonthlyPersonalTotals(week);

    showLoading(t("loadingSteps.achievements"));
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
    els.resultHint.textContent = t("error.dataReadFailed");
    els.tableHead.innerHTML = "";

    els.tableBody.innerHTML = `
        <tr>
            <td class="empty-state" colspan="${DISPLAY_HEADERS.length}">
                ${t("error.dataReadFailedBody")}
            </td>
        </tr>
    `;
}

async function initApp() {
    try {
        await loadI18n();

        renderHead();
        renderLoading(t("common.readingWeeks"));

        await loadWeeks();

        if (!state.weeks.length) {
            throw new Error(t("error.weeksCsvEmpty"));
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
els.languageSelect.addEventListener("change", event => {
    setLocale(event.target.value);
});

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
