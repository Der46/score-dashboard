"use strict";

/* ================================
   Config
================================ */

const CONFIG = {
    I18N_URL: "./i18n.json",
    WEEK_INDEX_URL: "./data/weeks.csv",
    UPDATED_AT_URL: "./data/updated-at.json",
    DEFAULT_LOCALE: "zh-Hant",
    STORAGE_LOCALE_KEY: "score-dashboard-locale",

    // 與 ScoreDashboardScript.gs 相同：合格 / 長老依「實際投入」判定
    PASS_SCORE: 200000,
    ELDER_SCORE: 500000,

    // 未投入佔個人總分達此比例，標記為「未投入過半」
    UNINVESTED_HEAVY_SHARE: 0.5,

    BOTTOM_N: 5,
    HISTORY_MIN_WEEKS: 2,

    // 成員關注參考：列出人數、最少需有幾週資料（避免剛加入的成員被列入）
    WATCH_N: 5,
    WATCH_MIN_WEEKS: 2,
    // 最近一週較本月前幾週平均下滑達此比例才列為理由
    WATCH_DROP_SHARE: 0.3
};

const STATUS = {
    PASS: "PASS",
    OUT: "淘汰",
    RETURN: "回歸",
    DOWNGRADE: "降級",
    ELDER: "長老",
    CAPTAIN: "隊長",
    VICE_CAPTAIN: "副隊長"
};

const LEADER_STATUSES = [STATUS.CAPTAIN, STATUS.VICE_CAPTAIN];

const SPECIAL_CM = {
    RETURN_SECTION: "【回歸帳號】",
    TOTAL: "總計"
};

/** 每週 CSV 必須有的欄位；缺少時這週視為讀取失敗。 */
const REQUIRED_WEEK_HEADERS = ["CM", "LINE名稱", "一週總分"];

/** 無法解析分數的提示最多列出幾格。 */
const NOTICE_MAX_CELLS = 5;

const VIEW = {
    MONTH: "month",
    WEEK: "week"
};

const FILTER = {
    ALL: "all",
    HEAVY: "heavy",
    LEADERS: "leaders",
    ELDER: "elder",
    RETURN: "return",
    EVER_BOTTOM: "everBottom",
    STATUS_PREFIX: "status:"
};

/* ================================
   State / Elements
================================ */

const i18nState = {
    locale: safeStorageGet(CONFIG.STORAGE_LOCALE_KEY) || CONFIG.DEFAULT_LOCALE,
    messages: {}
};

const state = {
    weeks: [],              // weeks.csv，新到舊（只含讀取成功的週別）
    allWeeks: [],           // weeks.csv，新到舊（含讀取失敗的週別）
    weekData: new Map(),    // weekId -> 週資料模型
    rowsCache: new Map(),   // `${view}:${period}` -> 表格列（不含篩選 / 排序）
    failedWeeks: [],
    months: [],             // monthKey，新到舊
    monthCache: new Map(),
    updatedAt: null,

    view: VIEW.MONTH,
    period: "",
    filter: FILTER.ALL,
    sort: { key: "score", dir: "desc" },
    keyword: ""
};

const els = {
    app: document.querySelector(".app"),
    languageSelect: document.getElementById("languageSelect"),
    viewTabs: document.getElementById("viewTabs"),
    periodSelect: document.getElementById("periodSelect"),
    searchInput: document.getElementById("searchInput"),
    filterSelect: document.getElementById("filterSelect"),
    sortSelect: document.getElementById("sortSelect"),
    notice: document.getElementById("notice"),
    stats: document.getElementById("stats"),
    podium: document.getElementById("podium"),
    watchList: document.getElementById("watchList"),
    tableTitle: document.getElementById("tableTitle"),
    resultHint: document.getElementById("resultHint"),
    tableHead: document.getElementById("tableHead"),
    tableBody: document.getElementById("tableBody"),
    updatedAtText: document.getElementById("updatedAtText"),
    profileModal: document.getElementById("profileModal"),
    profileDialog: document.querySelector("#profileModal .modal-dialog"),
    profileName: document.getElementById("profileName"),
    profileAvatar: document.getElementById("profileAvatar"),
    profileMeta: document.getElementById("profileMeta"),
    profileBody: document.getElementById("profileBody"),
    tooltip: document.getElementById("chartTooltip")
};

/* ================================
   Utilities
================================ */

function safeStorageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* 無法寫入時忽略 */
    }
}

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

function parseNumber(value) {
    const text = cleanText(value).replaceAll(",", "");

    if (!text) return 0;

    const number = Number(text);

    return Number.isFinite(number) ? number : 0;
}

function parseOptionalNumber(value) {
    const text = cleanText(value).replaceAll(",", "");

    if (!text) return null;

    const number = Number(text);

    return Number.isFinite(number) ? number : null;
}

function sum(values) {
    return values.reduce((total, value) => total + value, 0);
}

function ratio(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
        return null;
    }

    return numerator / denominator;
}

function debounce(fn, delay = 160) {
    let timer = null;

    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function getNumberLocale() {
    if (i18nState.locale === "zh-Hant") return "zh-TW";
    if (i18nState.locale === "vi") return "vi-VN";

    return "en-US";
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return "—";

    return Math.round(value).toLocaleString(getNumberLocale());
}

function formatCompact(value) {
    if (!Number.isFinite(value)) return "—";

    return new Intl.NumberFormat(getNumberLocale(), {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(value);
}

function formatPercent(value, digits = 1) {
    if (!Number.isFinite(value)) return "—";

    return `${(value * 100).toLocaleString(getNumberLocale(), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    })}%`;
}

function formatSigned(value) {
    if (!Number.isFinite(value)) return "—";
    if (value > 0) return `+${formatNumber(value)}`;
    if (value < 0) return `−${formatNumber(Math.abs(value))}`;

    return "0";
}

function average(values) {
    const valid = values.filter(Number.isFinite);

    return valid.length ? sum(valid) / valid.length : 0;
}

function stdDev(values) {
    const valid = values.filter(Number.isFinite);

    if (!valid.length) return 0;

    const mean = average(valid);

    return Math.sqrt(average(valid.map(value => (value - mean) ** 2)));
}

/* ================================
   I18n
================================ */

function getNestedValue(object, path) {
    return String(path || "")
        .split(".")
        .reduce((current, key) => current?.[key], object);
}

function t(path, params = {}) {
    const localeMessages = i18nState.messages[i18nState.locale] || {};
    const fallbackMessages = i18nState.messages[CONFIG.DEFAULT_LOCALE] || {};

    const template =
        getNestedValue(localeMessages, path) ??
        getNestedValue(fallbackMessages, path) ??
        path;

    return String(template).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

function statusLabel(status) {
    const map = {
        [STATUS.PASS]: "status.pass",
        [STATUS.OUT]: "status.out",
        [STATUS.RETURN]: "status.return",
        [STATUS.DOWNGRADE]: "status.downgrade",
        [STATUS.ELDER]: "status.elder",
        [STATUS.CAPTAIN]: "status.captain",
        [STATUS.VICE_CAPTAIN]: "status.viceCaptain"
    };

    return map[status] ? t(map[status]) : status;
}

/**
 * 所有資料都用 no-cache：每次都向伺服器確認，但沒變的檔案只回 304，不必重新下載整份內容
 * （GitHub Pages 會提供 ETag）。
 */
const FETCH_OPTIONS = { cache: "no-cache" };

/** i18n.json 讀取失敗時錯誤畫面使用的內建文字，避免畫面顯示 key。 */
const FALLBACK_ERROR_TEXT = {
    "zh-Hant": { title: "資料讀取失敗", body: "資料讀取失敗，請稍後重新整理頁面。" },
    en: { title: "Failed to load data", body: "Failed to load data. Please refresh the page later." },
    vi: { title: "Không tải được dữ liệu", body: "Không tải được dữ liệu. Vui lòng tải lại trang sau." }
};

async function loadI18n() {
    const response = await fetch(CONFIG.I18N_URL, FETCH_OPTIONS);

    if (!response.ok) {
        throw new Error(`Failed to read ${CONFIG.I18N_URL}`);
    }

    i18nState.messages = await response.json();

    if (!i18nState.messages[i18nState.locale]) {
        i18nState.locale = CONFIG.DEFAULT_LOCALE;
    }

    applyStaticI18n();
}

function applyStaticI18n() {
    document.documentElement.lang = t("page.htmlLang");
    document.title = t("page.title");

    document.querySelectorAll("[data-i18n]").forEach(element => {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(element => {
        element.dataset.i18nAttr
            .split(";")
            .map(rule => rule.trim())
            .filter(Boolean)
            .forEach(rule => {
                const [attribute, path] = rule.split(":").map(part => part.trim());

                if (attribute && path) {
                    element.setAttribute(attribute, t(path));
                }
            });
    });

    els.languageSelect.value = i18nState.locale;
}

async function setLocale(locale) {
    if (!i18nState.messages[locale]) return;

    i18nState.locale = locale;
    safeStorageSet(CONFIG.STORAGE_LOCALE_KEY, locale);

    applyStaticI18n();
    renderUpdatedAt();
    renderControls();
    renderAll();

    if (!els.profileModal.hidden && state.profileKey) {
        renderProfile(state.profileKey);
    }
}

/* ================================
   CSV
================================ */

/**
 * RFC 4180 風格的 CSV 解析：只有在儲存格開頭的 `"` 才進入引號模式，
 * 未加引號的儲存格中間出現的 `"`（例如 Joe "Boss"）視為一般字元，不會打亂後面的欄位。
 * 檔案結束時引號仍未關閉代表檔案毀損，直接丟錯讓這週列入讀取失敗。
 */
function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    let cellStarted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                cell += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                cell += char;
            }

            continue;
        }

        if (char === '"' && !cellStarted) {
            inQuotes = true;
            cellStarted = true;
            continue;
        }

        if (char === ",") {
            row.push(cell);
            cell = "";
            cellStarted = false;
            continue;
        }

        if (char === "\n" || char === "\r") {
            if (char === "\r" && next === "\n") i++;

            row.push(cell);

            if (row.some(value => value.trim() !== "")) rows.push(row);

            row = [];
            cell = "";
            cellStarted = false;
            continue;
        }

        cell += char;
        cellStarted = true;
    }

    if (inQuotes) {
        throw new Error("CSV has an unterminated quoted field");
    }

    row.push(cell);

    if (row.some(value => value.trim() !== "")) rows.push(row);

    return rows;
}

function csvToObjects(text) {
    const rows = parseCSV(text.replace(/^﻿/, ""));

    if (!rows.length) return [];

    const headers = rows[0].map(cleanText);

    return rows.slice(1).map(cols => {
        const object = {};

        headers.forEach((header, index) => {
            object[header] = cols[index] ?? "";
        });

        return object;
    });
}

async function fetchText(url) {
    const response = await fetch(url, FETCH_OPTIONS);

    if (!response.ok) {
        throw new Error(t("error.fetchFailed", { url }));
    }

    return response.text();
}

/* ================================
   Data Model: Week
================================ */

function getWeekMonthKey(week) {
    const match =
        cleanText(week?.startDate).match(/^(\d{4})-(\d{2})/) ||
        cleanText(week?.id).match(/^(\d{4})-(\d{2})/);

    return match ? `${match[1]}-${match[2]}` : "";
}

function getWeekShortLabel(week) {
    const label = cleanText(week?.label || week?.id);

    return label.split("｜")[0] || label;
}

function formatMonthLabel(monthKey) {
    const [year, month] = String(monthKey || "").split("-");

    if (!year || !month) return monthKey;

    return t("month.label", { year, month: String(Number(month)) });
}

function formatMonthShort(monthKey) {
    const [year, month] = String(monthKey || "").split("-");

    if (!year || !month) return monthKey;

    return t("month.short", { year: year.slice(2), month: String(Number(month)) });
}

/**
 * 將一週 CSV 轉為週資料模型。
 *
 * 貢獻度在這裡重新計算：分母 = 全隊（一般帳號 + 回歸帳號）總分，
 * 不使用 CSV 內舊的貢獻度欄位，因為舊週表分母沒有包含回歸帳號。
 *
 * 缺少必要欄位或沒有任何成員時直接丟錯，讓這週列入 failedWeeks，
 * 而不是顯示成一張空表。
 */
function buildWeekModel(week, rawRows) {
    if (!rawRows.length) {
        throw new Error(`${week.file}: no data rows`);
    }

    const missingHeaders = REQUIRED_WEEK_HEADERS.filter(header => !(header in rawRows[0]));

    if (missingHeaders.length) {
        throw new Error(`${week.file}: missing columns ${missingHeaders.join(", ")}`);
    }

    const people = [];
    let rowInvalidCells = [];
    let inReturnSection = false;

    // 非空白但無法解析的分數格：總分以 0 計、投入 / 未投入為 null（顯示「—」），並記下來顯示在提示中。
    const readNumber = (raw, header, optional) => {
        const text = cleanText(raw[header]).replaceAll(",", "");
        const number = Number(text);

        if (text && !Number.isFinite(number)) {
            rowInvalidCells.push(header);
        }

        return optional ? parseOptionalNumber(text) : parseNumber(text);
    };

    rawRows.forEach(raw => {
        rowInvalidCells = [];

        const type = cleanText(raw.type);
        const cm = cleanText(raw["CM"]);
        const lineName = cleanText(raw["LINE名稱"]);

        if (cm === SPECIAL_CM.RETURN_SECTION || type === "section") {
            inReturnSection = cm === SPECIAL_CM.RETURN_SECTION;
            return;
        }

        if (type === "total" || cm === SPECIAL_CM.TOTAL) return;
        if (!cm && !lineName) return;

        const status = cleanText(raw["狀態"]);
        const score = readNumber(raw, "一週總分");
        let invested = readNumber(raw, "投入總分", true);
        let uninvested = readNumber(raw, "未投入總分", true);

        if (invested !== null && uninvested === null) {
            uninvested = Math.max(score - invested, 0);
        }

        if (invested === null) {
            uninvested = null;
        }

        const activities = [1, 2, 3].map(number => ({
            number,
            total: readNumber(raw, `活動${number}總分`),
            invested: readNumber(raw, `活動${number}投入`, true),
            uninvested: readNumber(raw, `活動${number}未投入`, true)
        }));

        people.push({
            key: cm ? `cm:${cm.toLowerCase()}` : `line:${lineName.toLowerCase()}`,
            cm: cm || lineName,
            lineName,
            status,
            isReturn: inReturnSection || status === STATUS.RETURN,
            score,
            invested,
            uninvested,
            activities,
            passDistanceRaw: cleanText(raw["距離合格分數"]),
            elderDistanceRaw: cleanText(raw["距離長老分數"]),
            sheetOrder: people.length,
            invalidCells: rowInvalidCells
        });
    });

    if (!people.length) {
        throw new Error(`${week.file}: no member rows`);
    }

    // 同一人（CM 與 LINE 名稱都相同）在週表出現多次時只保留一列，其餘視為重複列忽略：
    // 優先保留一般區（非回歸）的列，同區時保留分數較高的列。
    const isBetterRow = (person, best) => {
        if (person.isReturn !== best.isReturn) return !person.isReturn;

        return person.score > best.score;
    };

    const bestRows = new Map();

    people.forEach(person => {
        const identity = `${person.cm.toLowerCase()}|${person.lineName.toLowerCase()}`;
        const best = bestRows.get(identity);

        if (!best || isBetterRow(person, best)) bestRows.set(identity, person);
    });

    const keptRows = new Set(bestRows.values());

    for (let index = people.length - 1; index >= 0; index--) {
        if (!keptRows.has(people[index])) people.splice(index, 1);
    }

    // 同一週 CM 重複、但 LINE 名稱不同：先記下來，key 由 applyStableMemberKeys 跨週統一處理。
    const keyCounts = new Map();

    people.forEach(person => keyCounts.set(person.key, (keyCounts.get(person.key) || 0) + 1));

    const duplicateKeys = new Set(people.filter(person => keyCounts.get(person.key) > 1).map(person => person.key));
    const duplicateNames = new Set(people.filter(person => duplicateKeys.has(person.key)).map(person => person.cm));

    // 只收集保留下來的列，同一格只列一次。
    const invalidCells = Array.from(new Set(
        people.flatMap(person => person.invalidCells.map(header => `${person.cm} ${header}`))
    ));

    const hasSplit = people.length > 0 && people.every(person => person.invested !== null);
    const teamTotal = sum(people.map(person => person.score));
    const teamInvested = hasSplit ? sum(people.map(person => person.invested)) : null;
    const teamUninvested = hasSplit ? sum(people.map(person => person.uninvested)) : null;

    people.forEach(person => {
        person.contribution = ratio(person.score, teamTotal);
        person.investedShare = person.invested === null ? null : ratio(person.invested, person.score);
        person.uninvestedShare = person.uninvested === null ? null : ratio(person.uninvested, person.score);
    });

    const model = {
        week,
        monthKey: getWeekMonthKey(week),
        people,
        byKey: new Map(people.map(person => [person.key, person])),
        hasSplit,
        teamTotal,
        teamInvested,
        teamUninvested,
        invalidCells,
        duplicateKeys,
        duplicateNames: Array.from(duplicateNames)
    };

    model.bottomKeys = getBottomKeys(model);

    return model;
}

/**
 * CM 在任一週與不同 LINE 名稱重複時，所有週都改用 CM + LINE 名稱當 key，
 * 讓同一人跨週的 key 一致，月統計、上週差距與個人頁歷史才不會被拆開。
 */
function applyStableMemberKeys(models) {
    const splitKeys = new Set(models.flatMap(model => Array.from(model.duplicateKeys)));

    if (!splitKeys.size) return;

    models.forEach(model => {
        model.people.forEach(person => {
            if (splitKeys.has(person.key)) {
                person.key = `${person.key}|line:${person.lineName.toLowerCase()}`;
            }
        });

        model.byKey = new Map(model.people.map(person => [person.key, person]));
        model.bottomKeys = getBottomKeys(model);
    });
}

function isBottomEligible(person) {
    return !person.isReturn && !LEADER_STATUSES.includes(person.status);
}

/**
 * 後五名：合格判定以實際投入為準，因此有拆分資料時用投入分排序，
 * 舊資料沒有拆分時才退回一週總分。
 */
function getBottomKeys(model) {
    const metric = person => (model.hasSplit ? person.invested : person.score);
    const candidates = model.people
        .filter(isBottomEligible)
        .map(person => ({ key: person.key, value: metric(person) }))
        .sort((a, b) => a.value - b.value);

    if (!candidates.length) return new Set();

    const cutoff = candidates[Math.min(CONFIG.BOTTOM_N - 1, candidates.length - 1)].value;

    return new Set(candidates.filter(item => item.value <= cutoff).map(item => item.key));
}

async function loadWeeks() {
    const text = await fetchText(CONFIG.WEEK_INDEX_URL);

    state.weeks = csvToObjects(text)
        .filter(week => cleanText(week.id) && cleanText(week.file))
        .sort((a, b) => String(b.startDate || b.id).localeCompare(String(a.startDate || a.id)));

    if (!state.weeks.length) {
        throw new Error(t("error.weeksEmpty"));
    }

    const results = await Promise.allSettled(
        state.weeks.map(async week => buildWeekModel(week, csvToObjects(await fetchText(week.file))))
    );

    results.forEach((result, index) => {
        const week = state.weeks[index];

        if (result.status === "fulfilled") {
            state.weekData.set(week.id, result.value);
        } else {
            state.failedWeeks.push(week);
            console.warn("Failed to load week", week.file, result.reason);
        }
    });

    applyStableMemberKeys(Array.from(state.weekData.values()));

    // 保留含讀取失敗週別的完整順序，計算「上週」時才不會跳過中間缺的那週。
    state.allWeeks = state.weeks.slice();
    state.weeks = state.weeks.filter(week => state.weekData.has(week.id));
    state.months = Array.from(new Set(state.weeks.map(getWeekMonthKey).filter(Boolean)));

    if (!state.weeks.length) {
        throw new Error(t("error.weeksEmpty"));
    }
}

async function loadUpdatedAt() {
    try {
        const response = await fetch(CONFIG.UPDATED_AT_URL, FETCH_OPTIONS);

        if (!response.ok) return;

        const data = await response.json();
        const date = new Date(data.updatedAt);

        if (!Number.isNaN(date.getTime())) {
            state.updatedAt = date;
        }
    } catch (error) {
        console.warn("Failed to load updated-at.json", error);
    }
}

function renderUpdatedAt() {
    if (!state.updatedAt) {
        els.updatedAtText.textContent = "";
        return;
    }

    const time = new Intl.DateTimeFormat(getNumberLocale(), {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Taipei"
    }).format(state.updatedAt);

    els.updatedAtText.innerHTML = `${icon("refresh")}<span>${escapeHTML(t("hero.updatedAt", { time }))}</span>`;
}

/* ================================
   Data Model: Month
================================ */

function getWeeksOfMonth(monthKey) {
    // 舊到新
    return state.weeks
        .filter(week => getWeekMonthKey(week) === monthKey)
        .slice()
        .reverse()
        .map(week => state.weekData.get(week.id))
        .filter(Boolean);
}

/**
 * 月資料模型：每位成員本月的總分、實際投入、未投入與貢獻度。
 *
 * 本月貢獻度 = 個人本月總分 ÷ 全隊本月總分（含回歸帳號）。
 */
function buildMonthModel(monthKey, uptoWeekId = null) {
    const cacheKey = `${monthKey}|${uptoWeekId || ""}`;

    if (state.monthCache.has(cacheKey)) {
        return state.monthCache.get(cacheKey);
    }

    let weekModels = getWeeksOfMonth(monthKey);

    if (uptoWeekId) {
        const index = weekModels.findIndex(model => model.week.id === uptoWeekId);

        if (index >= 0) weekModels = weekModels.slice(0, index + 1);
    }

    const hasSplit = weekModels.length > 0 && weekModels.every(model => model.hasSplit);
    const members = new Map();

    weekModels.forEach(model => {
        model.people.forEach(person => {
            if (!members.has(person.key)) {
                members.set(person.key, {
                    key: person.key,
                    cm: person.cm,
                    lineName: person.lineName,
                    score: 0,
                    invested: 0,
                    uninvested: 0,
                    splitComplete: true,
                    weeks: [],
                    bottomWeeks: 0,
                    bottomEligibleWeeks: 0
                });
            }

            const member = members.get(person.key);

            member.score += person.score;

            if (person.invested === null) {
                member.splitComplete = false;
            } else {
                member.invested += person.invested;
                member.uninvested += person.uninvested;
            }

            member.weeks.push({ model, person });

            if (isBottomEligible(person)) {
                member.bottomEligibleWeeks += 1;

                if (model.bottomKeys.has(person.key)) member.bottomWeeks += 1;
            }

            // 最新一週的身分
            member.latest = person;
            member.cm = person.cm || member.cm;
            member.lineName = person.lineName || member.lineName;
        });
    });

    const teamTotal = sum(weekModels.map(model => model.teamTotal));
    const teamInvested = hasSplit ? sum(weekModels.map(model => model.teamInvested)) : null;
    const teamUninvested = hasSplit ? sum(weekModels.map(model => model.teamUninvested)) : null;

    const list = Array.from(members.values()).map(member => {
        if (!member.splitComplete) {
            member.invested = null;
            member.uninvested = null;
        }

        const latest = member.latest;

        member.status = latest.status;
        member.isReturn = latest.isReturn;
        member.weeksSeen = member.weeks.length;
        member.contribution = ratio(member.score, teamTotal);
        member.investedShare = member.invested === null ? null : ratio(member.invested, member.score);
        member.uninvestedShare = member.uninvested === null ? null : ratio(member.uninvested, member.score);
        member.isHeavy = isUninvestedHeavy(member);

        return member;
    });

    assignRanks(list, "score", "totalRank");
    assignRanks(list.filter(member => member.invested !== null), "invested", "investedRank");

    const monthModel = {
        monthKey,
        weekModels,
        totalWeeks: weekModels.length,
        hasSplit,
        missingSplitWeeks: weekModels.filter(model => !model.hasSplit).length,
        teamTotal,
        teamInvested,
        teamUninvested,
        members: list,
        byKey: new Map(list.map(member => [member.key, member]))
    };

    state.monthCache.set(cacheKey, monthModel);

    return monthModel;
}

function isUninvestedHeavy(item) {
    return (
        Number.isFinite(item.uninvestedShare) &&
        item.score > 0 &&
        item.uninvestedShare >= CONFIG.UNINVESTED_HEAVY_SHARE
    );
}

/** 排名：回歸帳號不列入，同分同名次。 */
function assignRanks(items, field, rankField) {
    const ranked = items
        .filter(item => !item.isReturn && Number.isFinite(item[field]))
        .sort((a, b) => b[field] - a[field]);

    let previousValue = null;
    let previousRank = 0;

    ranked.forEach((item, index) => {
        const rank = item[field] === previousValue ? previousRank : index + 1;

        item[rankField] = rank;
        previousValue = item[field];
        previousRank = rank;
    });
}

/* ================================
   Row Building (month / week)
================================ */

function getMonthRows() {
    const month = buildMonthModel(state.period);

    return {
        month,
        rows: month.members.map(member => ({
            ...member,
            name: member.cm,
            monthWeeks: month.totalWeeks,
            rankShift:
                Number.isFinite(member.totalRank) && Number.isFinite(member.investedRank)
                    ? member.totalRank - member.investedRank
                    : null
        }))
    };
}

/**
 * 前一週的資料模型。前一週讀取失敗時回傳 { missing: true }，
 * 讓畫面顯示「—」而不是拿更早一週來比較。
 */
function getPreviousWeekModel(weekId) {
    const index = state.allWeeks.findIndex(week => week.id === weekId);
    const previous = state.allWeeks[index + 1];

    if (!previous) return { model: null, missing: false };

    const model = state.weekData.get(previous.id) || null;

    return { model, missing: !model };
}

function getWeekRows() {
    const model = state.weekData.get(state.period);
    const previous = getPreviousWeekModel(state.period);
    const monthToDate = buildMonthModel(model.monthKey, model.week.id);

    const rows = model.people.map(person => {
        const previousPerson = previous.model?.byKey.get(person.key) || null;
        const monthMember = monthToDate.byKey.get(person.key);

        return {
            ...person,
            name: person.cm,
            weekModel: model,
            previousMissing: previous.missing,
            delta: previousPerson ? person.score - previousPerson.score : null,
            previousScore: previousPerson ? previousPerson.score : null,
            isHeavy: isUninvestedHeavy(person),
            bottomWeeks: monthMember?.bottomWeeks || 0,
            bottomEligibleWeeks: monthMember?.bottomEligibleWeeks || 0,
            monthWeeks: monthToDate.totalWeeks
        };
    });

    assignRanks(rows, "score", "totalRank");
    assignRanks(rows.filter(row => row.invested !== null), "invested", "investedRank");

    rows.forEach(row => {
        row.rankShift =
            Number.isFinite(row.totalRank) && Number.isFinite(row.investedRank)
                ? row.totalRank - row.investedRank
                : null;
    });

    return { model, rows };
}

/* ================================
   Filters / Sort
================================ */

const SORT_OPTIONS = {
    [VIEW.MONTH]: ["score", "invested", "uninvested", "investedShare", "contribution", "weeksSeen"],
    [VIEW.WEEK]: ["sheetOrder", "score", "invested", "uninvested", "investedShare", "contribution", "delta"]
};

const SORT_DEFAULT = {
    [VIEW.MONTH]: "score",
    [VIEW.WEEK]: "sheetOrder"
};

function getFilterOptions() {
    const options = [
        { value: FILTER.ALL, label: t("filter.all") },
        { value: FILTER.HEAVY, label: t("filter.heavy") },
        { value: FILTER.LEADERS, label: t("filter.leaders") },
        { value: FILTER.ELDER, label: t("filter.elder") },
        { value: FILTER.RETURN, label: t("filter.return") }
    ];

    if (state.view === VIEW.WEEK) {
        options.push({ value: FILTER.EVER_BOTTOM, label: t("filter.everBottom") });

        const model = state.weekData.get(state.period);
        const statuses = Array.from(new Set((model?.people || []).map(person => person.status).filter(Boolean)))
            .filter(status => ![STATUS.ELDER, STATUS.RETURN, ...LEADER_STATUSES].includes(status));

        statuses.forEach(status => {
            options.push({ value: `${FILTER.STATUS_PREFIX}${status}`, label: statusLabel(status) });
        });
    }

    return options;
}

function matchesFilter(row) {
    const filter = state.filter;

    if (filter === FILTER.ALL) return true;
    if (filter === FILTER.HEAVY) return row.isHeavy;
    if (filter === FILTER.LEADERS) return LEADER_STATUSES.includes(row.status);
    if (filter === FILTER.ELDER) return row.status === STATUS.ELDER;
    if (filter === FILTER.RETURN) return row.isReturn;
    if (filter === FILTER.EVER_BOTTOM) return row.bottomWeeks > 0;

    if (filter.startsWith(FILTER.STATUS_PREFIX)) {
        return row.status === filter.slice(FILTER.STATUS_PREFIX.length);
    }

    return true;
}

function matchesKeyword(row) {
    const keyword = state.keyword.trim().toLowerCase();

    if (!keyword) return true;

    return (
        row.name.toLowerCase().includes(keyword) ||
        row.lineName.toLowerCase().includes(keyword)
    );
}

function sortRows(rows) {
    const { key, dir } = state.sort;
    const factor = dir === "asc" ? 1 : -1;

    return rows.slice().sort((a, b) => {
        if (key === "sheetOrder") {
            return a.sheetOrder - b.sheetOrder;
        }

        const aValue = Number.isFinite(a[key]) ? a[key] : Number.NEGATIVE_INFINITY;
        const bValue = Number.isFinite(b[key]) ? b[key] : Number.NEGATIVE_INFINITY;

        if (aValue !== bValue) {
            if (aValue === Number.NEGATIVE_INFINITY) return 1;
            if (bValue === Number.NEGATIVE_INFINITY) return -1;

            return (aValue - bValue) * factor;
        }

        return b.score - a.score || a.name.localeCompare(b.name);
    });
}

/* ================================
   URL Hash State
================================ */

function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const view = params.get("view");
    const period = params.get("period");

    if (view === VIEW.MONTH || view === VIEW.WEEK) state.view = view;
    if (period) state.period = period;
}

function writeHash() {
    const params = new URLSearchParams({ view: state.view, period: state.period });

    history.replaceState(null, "", `#${params.toString()}`);
}

function ensureValidPeriod() {
    if (state.view === VIEW.MONTH) {
        if (!state.months.includes(state.period)) {
            const fromWeek = state.weekData.get(state.period)?.monthKey;

            state.period = state.months.includes(fromWeek) ? fromWeek : state.months[0];
        }
    } else if (!state.weekData.has(state.period)) {
        // 由月份切換到週：選該月最新一週
        const weekInMonth = state.weeks.find(week => getWeekMonthKey(week) === state.period);

        state.period = (weekInMonth || state.weeks[0]).id;
    }
}

/* ================================
   Render: Controls
================================ */

function renderControls() {
    // 檢視切換是一組切換按鈕（不是 tab 元件），用 aria-pressed 表示目前選取的檢視。
    document.querySelectorAll("#viewTabs [data-view], #railNav [data-view]").forEach(button => {
        const active = button.dataset.view === state.view;

        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("is-active", active);
    });

    if (state.view === VIEW.MONTH) {
        els.periodSelect.innerHTML = state.months
            .map(month => `<option value="${escapeHTML(month)}">${escapeHTML(formatMonthLabel(month))}</option>`)
            .join("");
    } else {
        els.periodSelect.innerHTML = state.weeks
            .map(week => `<option value="${escapeHTML(week.id)}">${escapeHTML(week.label || week.id)}</option>`)
            .join("");
    }

    els.periodSelect.value = state.period;
    els.periodSelect.setAttribute("aria-label", t(state.view === VIEW.MONTH ? "controls.month" : "controls.week"));

    const filterOptions = getFilterOptions();

    if (!filterOptions.some(option => option.value === state.filter)) {
        state.filter = FILTER.ALL;
    }

    els.filterSelect.innerHTML = filterOptions
        .map(option => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`)
        .join("");
    els.filterSelect.value = state.filter;
    els.filterSelect.setAttribute("aria-label", t("controls.filter"));

    const sortKeys = SORT_OPTIONS[state.view];

    if (!sortKeys.includes(state.sort.key)) {
        state.sort = { key: SORT_DEFAULT[state.view], dir: "desc" };
    }

    els.sortSelect.innerHTML = sortKeys
        .map(key => `<option value="${key}">${escapeHTML(t("sort.prefix", { label: t(`sortKey.${key}`) }))}</option>`)
        .join("");
    els.sortSelect.value = state.sort.key;
    els.sortSelect.setAttribute("aria-label", t("controls.sort"));
}

/* ================================
   Render: Notice / Stats
================================ */

function renderNotice(missingWeeks, weekModels = []) {
    const messages = [];

    if (missingWeeks > 0) {
        messages.push(t("notice.missingSplit", { count: missingWeeks }));
    }

    weekModels.forEach(model => {
        const week = getWeekShortLabel(model.week);

        if (model.invalidCells.length) {
            // 最多列出前幾格，避免整片提示洗版。
            const shown = model.invalidCells.slice(0, NOTICE_MAX_CELLS).join("、");
            const cells = model.invalidCells.length > NOTICE_MAX_CELLS ? `${shown}…` : shown;

            messages.push(t("notice.invalidCells", { week, count: model.invalidCells.length, cells }));
        }

        if (model.duplicateNames.length) {
            messages.push(t("notice.duplicateMembers", { week, names: model.duplicateNames.join("、") }));
        }
    });

    if (state.failedWeeks.length) {
        messages.push(t("notice.failedWeeks", { weeks: state.failedWeeks.map(week => week.id).join("、") }));
    }

    // 提示區一直留在頁面上（空的時候由 CSS 隱藏），內容真的變了才重寫，
    // 螢幕閱讀器才會正確念出新提示，也不會在每次重畫時重複播報。
    const html = messages.map(message => `<p>${escapeHTML(message)}</p>`).join("");

    if (lastNoticeHTML !== html) {
        lastNoticeHTML = html;
        els.notice.innerHTML = html;
    }
}

let lastNoticeHTML = "";

function renderStats(scope) {
    const people = scope.rows;
    const regular = people.filter(row => !row.isReturn);
    const returning = people.filter(row => row.isReturn);
    const heavyCount = regular.filter(row => row.isHeavy).length;

    const investedShare = ratio(scope.teamInvested, scope.teamTotal);
    const uninvestedShare = ratio(scope.teamUninvested, scope.teamTotal);

    const sideCard = state.view === VIEW.WEEK
        ? miniCard({
            icon: "crown",
            label: t("stats.statusMix"),
            value: `${countStatus(people, STATUS.ELDER)} / ${countStatus(people, STATUS.PASS)} / ${countStatus(people, STATUS.OUT)}`,
            note: t("stats.statusMixNote")
        })
        : miniCard({
            icon: "users",
            label: t("stats.members"),
            value: formatNumber(people.length),
            note: t("stats.membersNote", { regular: regular.length, returning: returning.length })
        });

    els.stats.innerHTML = `
        <article class="stat-card">
            ${cardHead("chartColumn", t(state.view === VIEW.MONTH ? "stats.teamMonthTotal" : "stats.teamWeekTotal"))}
            <div class="stat-value">${escapeHTML(formatNumber(scope.teamTotal))}</div>
            ${renderTeamMix(scope.teamInvested, scope.teamUninvested, scope.teamTotal)}
        </article>

        <article class="stat-card stat-lime">
            ${cardHead("target", t("metric.invested"), Number.isFinite(investedShare) ? formatPercent(investedShare, 0) : "")}
            <div class="stat-value">${escapeHTML(formatNumber(scope.teamInvested))}</div>
            <div class="stat-note">${escapeHTML(Number.isFinite(investedShare) ? t("stats.shareOfTeam", { pct: formatPercent(investedShare) }) : t("common.noSplit"))}</div>
            ${renderCapsuleMeter(investedShare)}
        </article>

        <article class="stat-card stat-dark">
            ${cardHead("layers", t("metric.uninvested"), Number.isFinite(uninvestedShare) ? formatPercent(uninvestedShare, 0) : "")}
            <div class="stat-value">${escapeHTML(formatNumber(scope.teamUninvested))}</div>
            <div class="stat-note">${escapeHTML(Number.isFinite(uninvestedShare) ? t("stats.shareOfTeam", { pct: formatPercent(uninvestedShare) }) : t("common.noSplit"))}</div>
            ${renderCapsuleMeter(uninvestedShare)}
        </article>

        <div class="stat-side">
            ${miniCard({
                icon: "alert",
                label: t("stats.heavy"),
                value: scope.hasSplit ? formatNumber(heavyCount) : "—",
                note: t("stats.heavyNote", { pct: formatPercent(CONFIG.UNINVESTED_HEAVY_SHARE, 0) }),
                action: heavyCount > 0 ? FILTER.HEAVY : ""
            })}
            ${sideCard}
        </div>
    `;
}

function countStatus(rows, status) {
    return rows.filter(row => row.status === status).length;
}

function cardHead(iconName, label, pill = "") {
    return `
        <div class="card-head">
            <span class="icon-chip" aria-hidden="true">${icon(iconName)}</span>
            <span class="card-label">${escapeHTML(label)}</span>
            ${pill ? `<span class="pct-pill">${escapeHTML(pill)}</span>` : ""}
        </div>
    `;
}

function miniCard({ icon: iconName, label, value, note = "", action = "" }) {
    const tag = action ? "button" : "article";
    const attrs = action ? `type="button" data-filter-shortcut="${escapeHTML(action)}"` : "";

    return `
        <${tag} class="mini-card ${action ? "is-action" : ""}" ${attrs}>
            <div class="mini-top">
                <span class="icon-chip icon-chip-sm" aria-hidden="true">${icon(iconName)}</span>
                ${action ? `<span class="mini-arrow" aria-hidden="true">${icon("arrowUpRight")}</span>` : ""}
            </div>
            <div class="mini-label">${escapeHTML(label)}</div>
            <div class="mini-value">${escapeHTML(value)}</div>
            ${note ? `<div class="mini-note">${escapeHTML(note)}</div>` : ""}
        </${tag}>
    `;
}

/** 參考圖的膠囊進度條：10 格，依比例填滿。 */
function renderCapsuleMeter(share, count = 10) {
    if (!Number.isFinite(share)) {
        return `<div class="capsules capsules-empty">${"<span></span>".repeat(count)}</div>`;
    }

    const filled = Math.round(share * count);

    return `
        <div class="capsules" aria-hidden="true">
            ${Array.from({ length: count }, (_, index) => `<span class="${index < filled ? "is-on" : ""}"></span>`).join("")}
        </div>
    `;
}

function renderTeamMix(invested, uninvested, total) {
    if (!Number.isFinite(invested) || !total) {
        return `<div class="team-mix team-mix-empty">${escapeHTML(t("common.noSplit"))}</div>`;
    }

    return `
        <div class="team-mix" role="img" aria-label="${escapeHTML(t("stats.mixAria", {
            invested: formatPercent(invested / total),
            uninvested: formatPercent(uninvested / total)
        }))}">
            <div class="mix-track mix-track-lg">
                <span class="mix-seg mix-invested" style="flex-grow:${invested}"></span>
                <span class="mix-seg mix-uninvested" style="flex-grow:${uninvested}"></span>
            </div>
            <div class="team-mix-labels">
                <span><i class="swatch swatch-invested"></i>${escapeHTML(t("metric.invested"))}</span>
                <span><i class="swatch swatch-uninvested"></i>${escapeHTML(t("metric.uninvested"))}</span>
            </div>
        </div>
    `;
}

/* ================================
   Render: Achievements
================================ */

const ACHIEVEMENTS = [
    { key: "mvp", icon: "trophy", accent: "lime" },
    { key: "improver", icon: "rocket" },
    { key: "stable", icon: "shieldCheck" },
    { key: "burst", icon: "zap" },
    { key: "potential", icon: "sprout" }
];

function calculateAchievements(month) {
    const useInvested = month.hasSplit;
    const metric = person => (useInvested ? person.invested : person.score);

    const members = month.members
        .filter(member => !member.isReturn)
        .map(member => {
            const values = member.weeks.map(entry => metric(entry.person));
            const labels = member.weeks.map(entry => getWeekShortLabel(entry.model.week));

            return { member, values, labels, total: sum(values) };
        });

    const byName = (a, b) => a.member.cm.localeCompare(b.member.cm);
    const results = {};

    // MVP：本月累計最高
    const mvp = members.filter(item => item.values.length).sort((a, b) => b.total - a.total || byName(a, b))[0];

    results.mvp = mvp && { item: mvp, value: formatNumber(mvp.total) };

    // 進步王：本月由低點到後續高點的最大漲幅
    const improver = members
        .filter(item => item.values.length >= 2)
        .map(item => {
            let lowest = item.values[0];
            let best = Number.NEGATIVE_INFINITY;

            for (let i = 1; i < item.values.length; i++) {
                best = Math.max(best, item.values[i] - lowest);
                lowest = Math.min(lowest, item.values[i]);
            }

            return { ...item, gain: best };
        })
        .filter(item => item.gain > 0)
        .sort((a, b) => b.gain - a.gain || byName(a, b))[0];

    results.improver = improver && { item: improver, value: formatSigned(improver.gain) };

    // 穩定王：平均高於全體平均者中，波動最小
    const stableCandidates = members
        .filter(item => item.values.length >= 2)
        .map(item => ({ ...item, avg: average(item.values), sd: stdDev(item.values) }));
    const avgOfAvg = average(stableCandidates.map(item => item.avg));
    const stablePool = stableCandidates.filter(item => item.avg >= avgOfAvg);
    const stable = (stablePool.length ? stablePool : stableCandidates)
        .sort((a, b) => a.sd - b.sd || b.avg - a.avg || byName(a, b))[0];

    results.stable = stable && {
        item: stable,
        value: `${formatCompact(stable.avg)} ± ${formatCompact(stable.sd)}`
    };

    // 爆發王：單週最高
    const burst = members
        .filter(item => item.values.length)
        .map(item => ({ ...item, best: Math.max(...item.values) }))
        .sort((a, b) => b.best - a.best || b.total - a.total || byName(a, b))[0];

    results.burst = burst && { item: burst, value: formatNumber(burst.best) };

    // 潛力股：最近三週連續上升
    const potential = members
        .filter(item => item.values.length >= 3)
        .map(item => {
            const last3 = item.values.slice(-3);

            return { ...item, last3, rise: last3[2] - last3[0], ok: last3[1] > last3[0] && last3[2] > last3[1] };
        })
        .filter(item => item.ok)
        .sort((a, b) => b.rise - a.rise || byName(a, b))[0];

    results.potential = potential && { item: potential, value: formatSigned(potential.rise) };

    return { results, useInvested };
}

function renderPodium(month) {
    if (state.view !== VIEW.MONTH) {
        els.podium.hidden = true;
        els.podium.innerHTML = "";
        return;
    }

    const { results, useInvested } = calculateAchievements(month);

    els.podium.hidden = false;
    els.podium.innerHTML = `
        <div class="section-head">
            <div class="panel-heading">
                <span class="icon-chip" aria-hidden="true">${icon("award")}</span>
                <h2 class="section-title">${escapeHTML(t("achievement.title", { scope: formatMonthLabel(month.monthKey) }))}</h2>
            </div>
            <span class="section-note">${escapeHTML(t(useInvested ? "achievement.noteInvested" : "achievement.noteScore"))}</span>
        </div>
        <div class="podium-row" role="list">
            ${ACHIEVEMENTS.map(config => `<div class="podium-item" role="listitem">${renderAchievementCard(config, results[config.key])}</div>`).join("")}
        </div>
    `;
}

function renderAchievementCard(config, result) {
    const title = t(`achievement.${config.key}Title`);
    const subtitle = t(`achievement.${config.key}Subtitle`);
    const accentClass = config.accent ? `podium-${config.accent}` : "";

    if (!result) {
        return `
            <article class="podium-card ${accentClass} is-empty">
                <div class="mini-top">
                    <span class="icon-chip icon-chip-sm" aria-hidden="true">${icon(config.icon)}</span>
                </div>
                <div class="podium-title">${escapeHTML(title)}</div>
                <div class="podium-subtitle">${escapeHTML(subtitle)}</div>
                <div class="podium-empty">${escapeHTML(t(`achievement.${config.key}Empty`))}</div>
            </article>
        `;
    }

    return `
        <button class="podium-card ${accentClass}" type="button"
            data-profile-key="${escapeHTML(result.item.member.key)}">
            <div class="mini-top">
                <span class="icon-chip icon-chip-sm" aria-hidden="true">${icon(config.icon)}</span>
                <span class="mini-arrow" aria-hidden="true">${icon("arrowUpRight")}</span>
            </div>
            <div class="podium-title">${escapeHTML(title)}</div>
            <div class="podium-name">${escapeHTML(result.item.member.cm)}</div>
            <div class="podium-metric">${escapeHTML(result.value)}</div>
            <div class="podium-subtitle">${escapeHTML(subtitle)}</div>
        </button>
    `;
}

/* ================================
   Render: Watch List（成員關注參考）
================================ */

/**
 * 依本月數據整理的關注參考，僅供管理者參考。
 * 只列本月最新一週仍在隊伍內的成員；回歸帳號與隊長 / 副隊長不列入（同後五名規則）。
 *
 * 綜合分數（越高越需要關注）：
 *   未達合格週比例 ×3 + 落在後五名週比例 ×2 + 週平均排名百分位 ×2
 *   + 最近一週下滑 ×1 + 未投入過半 ×1
 */
function calculateWatchList(month) {
    const useInvested = month.hasSplit;
    const metric = person => (useInvested ? person.invested : person.score);
    const minWeeks = Math.min(CONFIG.WATCH_MIN_WEEKS, month.totalWeeks);

    // 只看本月最新一週仍在週表上的成員（月中已離隊者不列入）
    const latestWeek = month.weekModels[month.weekModels.length - 1];

    const candidates = month.members
        .filter(member =>
            latestWeek?.byKey.has(member.key) &&
            isBottomEligible(member) &&
            member.weeks.length >= minWeeks
        )
        .map(member => {
            const values = member.weeks.map(entry => metric(entry.person));
            const avg = average(values);
            const belowPassWeeks = member.weeks.filter(({ person }) =>
                person.status === STATUS.OUT || (person.invested !== null && person.invested < CONFIG.PASS_SCORE)
            ).length;

            const last = values[values.length - 1];
            const earlierAvg = values.length >= 2 ? average(values.slice(0, -1)) : null;
            const lastDrop = earlierAvg > 0 ? (earlierAvg - last) / earlierAvg : null;

            return { member, values, avg, belowPassWeeks, lastDrop };
        });

    // 週平均由低到高排名（1 = 最低）
    const byAvg = candidates.slice().sort((a, b) => a.avg - b.avg);

    byAvg.forEach((item, index) => {
        item.avgRankFromBottom = index + 1;
        item.lowPercentile = byAvg.length > 1 ? 1 - index / (byAvg.length - 1) : 1;
    });

    candidates.forEach(item => {
        const weeks = item.member.weeks.length;
        const bottomRate = item.member.bottomEligibleWeeks ? item.member.bottomWeeks / item.member.bottomEligibleWeeks : 0;
        const isLastDrop = Number.isFinite(item.lastDrop) && item.lastDrop >= CONFIG.WATCH_DROP_SHARE;

        item.weight =
            (item.belowPassWeeks / weeks) * 3 +
            bottomRate * 2 +
            item.lowPercentile * 2 +
            (isLastDrop ? 1 : 0) +
            (item.member.isHeavy ? 1 : 0);

        item.reasons = buildWatchReasons(item, { weeks, isLastDrop, total: candidates.length, useInvested });
    });

    const list = candidates
        .sort((a, b) => b.weight - a.weight || a.avg - b.avg || a.member.cm.localeCompare(b.member.cm))
        .slice(0, CONFIG.WATCH_N);

    return { list, useInvested };
}

function buildWatchReasons(item, { weeks, isLastDrop, total, useInvested }) {
    const { member } = item;
    const reasons = [];
    const metricLabel = t(useInvested ? "metric.invested" : "metric.score");

    if (item.belowPassWeeks > 0) {
        reasons.push({
            tone: item.belowPassWeeks === weeks ? "risk" : "watch",
            text: t("watch.reasonBelowPass", { count: item.belowPassWeeks, total: weeks, pass: formatCompact(CONFIG.PASS_SCORE) })
        });
    }

    if (member.bottomWeeks > 0) {
        reasons.push({
            tone: member.bottomWeeks === member.bottomEligibleWeeks ? "risk" : "watch",
            text: t("watch.reasonBottom", { count: member.bottomWeeks, total: member.bottomEligibleWeeks, n: CONFIG.BOTTOM_N })
        });
    }

    reasons.push({
        tone: "neutral",
        text: t("watch.reasonAvg", {
            metric: metricLabel,
            value: formatNumber(Math.round(item.avg)),
            rank: total - item.avgRankFromBottom + 1,
            total
        })
    });

    if (isLastDrop) {
        reasons.push({ tone: "watch", text: t("watch.reasonLastDrop", { pct: formatPercent(item.lastDrop, 0) }) });
    }

    if (member.isHeavy) {
        reasons.push({ tone: "watch", text: t("watch.reasonHeavy", { pct: formatPercent(member.uninvestedShare, 0) }) });
    }

    return reasons;
}

function renderWatchList(month) {
    if (state.view !== VIEW.MONTH || !month) {
        els.watchList.hidden = true;
        els.watchList.innerHTML = "";
        return;
    }

    const { list, useInvested } = calculateWatchList(month);

    els.watchList.hidden = false;
    els.watchList.innerHTML = `
        <div class="section-head">
            <div class="panel-heading">
                <span class="icon-chip" aria-hidden="true">${icon("eye")}</span>
                <h2 class="section-title">${escapeHTML(t("watch.title", { scope: formatMonthLabel(month.monthKey) }))}</h2>
            </div>
            <span class="section-note">${escapeHTML(t(useInvested ? "watch.noteInvested" : "watch.noteScore", {
                n: CONFIG.WATCH_MIN_WEEKS,
                week: getWeekShortLabel(month.weekModels[month.weekModels.length - 1].week)
            }))}</span>
        </div>
        ${list.length
            ? `<ol class="watch-row">${list.map((item, index) => renderWatchCard(item, index)).join("")}</ol>`
            : `<p class="watch-empty">${escapeHTML(t("watch.empty"))}</p>`}
    `;
}

function renderWatchCard(item, index) {
    const { member } = item;

    return `
        <li class="watch-card">
            <button class="watch-name" type="button" data-profile-key="${escapeHTML(member.key)}"
                aria-label="${escapeHTML(t("profile.open", { name: member.cm }))}">
                <span class="watch-index">${index + 1}</span>
                <span class="watch-cm">${escapeHTML(member.cm)}</span>
                <span class="mini-arrow" aria-hidden="true">${icon("arrowUpRight")}</span>
            </button>
            ${member.lineName ? `<div class="watch-line">${escapeHTML(member.lineName)}</div>` : ""}
            <ul class="watch-reasons">
                ${item.reasons.map(reason => `<li class="watch-reason tone-${reason.tone}">${escapeHTML(reason.text)}</li>`).join("")}
            </ul>
        </li>
    `;
}

/* ================================
   Render: Table
================================ */

function getColumns() {
    if (state.view === VIEW.MONTH) {
        return [
            { key: "rank", label: t("col.rank"), className: "col-rank" },
            { key: "member", label: t("col.member"), className: "col-member" },
            { key: "score", label: t("col.monthScore"), sort: "score", className: "col-num" },
            { key: "invested", label: t("metric.invested"), sort: "invested", className: "col-num" },
            { key: "uninvested", label: t("metric.uninvested"), sort: "uninvested", className: "col-num" },
            { key: "mix", label: t("col.mix"), sort: "investedShare", className: "col-mix" },
            { key: "contribution", label: t("col.contribution"), sort: "contribution", className: "col-num" },
            { key: "investedRank", label: t("col.investedRank"), className: "col-num" },
            { key: "weeks", label: t("col.weeks"), sort: "weeksSeen", className: "col-num" }
        ];
    }

    return [
        { key: "rank", label: t("col.rank"), className: "col-rank" },
        { key: "member", label: t("col.member"), className: "col-member" },
        { key: "score", label: t("col.weekScore"), sort: "score", className: "col-num" },
        { key: "invested", label: t("metric.invested"), sort: "invested", className: "col-num" },
        { key: "uninvested", label: t("metric.uninvested"), sort: "uninvested", className: "col-num" },
        { key: "mix", label: t("col.mix"), sort: "investedShare", className: "col-mix" },
        { key: "contribution", label: t("col.contribution"), sort: "contribution", className: "col-num" },
        { key: "delta", label: t("col.delta"), sort: "delta", className: "col-num" },
        { key: "target", label: t("col.target"), className: "col-text" },
        { key: "bottom", label: t("col.bottom"), className: "col-text" },
        { key: "status", label: t("col.status"), className: "col-text" }
    ];
}

function renderHead(columns) {
    els.tableHead.innerHTML = `
        <tr>
            ${columns.map(column => {
                if (!column.sort) {
                    return `<th scope="col" class="${column.className}">${escapeHTML(column.label)}</th>`;
                }

                const active = state.sort.key === column.sort;
                const ariaSort = active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none";
                const arrow = active ? icon(state.sort.dir === "asc" ? "arrowUp" : "arrowDown") : "";

                return `
                    <th scope="col" class="${column.className} ${active ? "is-sorted" : ""}" aria-sort="${ariaSort}">
                        <button type="button" class="th-sort" data-sort="${column.sort}">
                            ${escapeHTML(column.label)}<span class="sort-arrow" aria-hidden="true">${arrow}</span>
                        </button>
                    </th>
                `;
            }).join("")}
        </tr>
    `;
}

function renderBody(columns, rows, maxScore) {
    const regular = rows.filter(row => !row.isReturn);
    const returning = rows.filter(row => row.isReturn);

    if (!rows.length) {
        els.tableBody.innerHTML = `
            <tr><td class="empty-state" colspan="${columns.length}">${escapeHTML(t("table.empty"))}</td></tr>
        `;
        return;
    }

    const regularHTML = regular
        .map(row => renderRow(columns, row, row.totalRank, maxScore))
        .join("");

    const returnHTML = returning.length
        ? `
            <tr class="group-row"><th colspan="${columns.length}" scope="rowgroup">
                ${escapeHTML(t("table.returnSection", { count: returning.length }))}
            </th></tr>
            ${returning.map(row => renderRow(columns, row, null, maxScore)).join("")}
        `
        : "";

    els.tableBody.innerHTML = regularHTML + returnHTML;
}

function getRowClass(row) {
    const classes = ["data-row"];

    if (row.status === STATUS.ELDER) classes.push("row-elder");
    if (row.status === STATUS.CAPTAIN) classes.push("row-captain");
    if (row.status === STATUS.VICE_CAPTAIN) classes.push("row-vice");
    if (row.isReturn) classes.push("row-return");
    if (row.isHeavy) classes.push("row-heavy");

    return classes.join(" ");
}

function renderRow(columns, row, rank, maxScore) {
    return `
        <tr class="${getRowClass(row)}">
            ${columns.map(column => renderCell(column, row, rank, maxScore)).join("")}
        </tr>
    `;
}

function cell(column, content, extraClass = "", title = "") {
    return `
        <td class="${column.className} ${extraClass}" data-label="${escapeHTML(column.label)}" ${title ? `title="${escapeHTML(title)}"` : ""}>
            ${content}
        </td>
    `;
}

function renderCell(column, row, rank, maxScore) {
    switch (column.key) {
        case "rank":
            return cell(column, rank ? `<span class="rank-badge">${rank}</span>` : `<span class="rank-badge rank-muted">–</span>`);

        case "member":
            return cell(column, renderMemberCell(row));

        case "score":
            return cell(column, `<strong>${escapeHTML(formatNumber(row.score))}</strong>`, "num");

        case "invested":
            return cell(column, escapeHTML(formatNumber(row.invested)), "num");

        case "uninvested":
            return cell(column, escapeHTML(formatNumber(row.uninvested)), `num ${row.isHeavy ? "is-heavy" : ""}`);

        case "mix":
            return cell(column, renderMixBar(row, maxScore));

        case "contribution":
            return cell(column, escapeHTML(formatPercent(row.contribution, 2)), "num", t("tip.contribution"));

        case "investedRank":
            return cell(column, renderRankShift(row), "num");

        case "weeks":
            return cell(column, escapeHTML(t("common.weeksOf", { seen: row.weeksSeen, total: row.monthWeeks })), "num");

        case "delta":
            return cell(column, renderDelta(row), "num");

        case "target":
            return cell(column, escapeHTML(getTargetText(row)));

        case "bottom":
            return cell(column, renderBottom(row));

        case "status":
            return cell(column, row.status ? renderBadge(row.status) : "—");

        default:
            return cell(column, "");
    }
}

function renderMemberCell(row) {
    const badges = [];

    if (state.view === VIEW.MONTH && row.status && ![STATUS.PASS, STATUS.RETURN].includes(row.status)) {
        badges.push(renderBadge(row.status));
    }

    if (row.isHeavy) {
        badges.push(`
            <span class="badge badge-heavy" title="${escapeHTML(t("flag.heavyTitle", { pct: formatPercent(row.uninvestedShare) }))}">
                ${icon("alert")}${escapeHTML(t("flag.heavy"))}
                <span class="sr-only">${escapeHTML(t("flag.heavyTitle", { pct: formatPercent(row.uninvestedShare) }))}</span>
            </span>
        `);
    }

    return `
        <div class="member">
            <span class="avatar avatar-sm" aria-hidden="true">${escapeHTML(getInitial(row.name))}</span>
            <div class="member-text">
                <button class="member-link" type="button" data-profile-key="${escapeHTML(row.key)}">
                    <span class="member-name">${escapeHTML(row.name || "-")}</span>
                    ${row.lineName && row.lineName !== row.name ? `<span class="member-line">${escapeHTML(row.lineName)}</span>` : ""}
                </button>
                ${badges.length ? `<div class="member-badges">${badges.join("")}</div>` : ""}
            </div>
        </div>
    `;
}

function getInitial(name) {
    return Array.from(cleanText(name))[0]?.toUpperCase() || "?";
}

function renderBadge(status) {
    const classMap = {
        [STATUS.PASS]: "badge-pass",
        [STATUS.OUT]: "badge-out",
        [STATUS.RETURN]: "badge-return",
        [STATUS.ELDER]: "badge-elder",
        [STATUS.CAPTAIN]: "badge-captain",
        [STATUS.VICE_CAPTAIN]: "badge-vice",
        [STATUS.DOWNGRADE]: "badge-out"
    };

    return `<span class="badge ${classMap[status] || "badge-other"}">${escapeHTML(statusLabel(status))}</span>`;
}

/**
 * 投入 / 未投入堆疊條：長度依清單內最高總分縮放（看量），
 * 兩段比例看組成（看是否由未投入撐起）。
 */
function renderMixBar(row, maxScore) {
    const scale = maxScore > 0 ? row.score / maxScore : 0;

    if (row.invested === null) {
        return `
            <div class="mix" title="${escapeHTML(t("common.noSplit"))}">
                <div class="mix-track">
                    <span class="mix-seg mix-unknown" style="width:${scale * 100}%"></span>
                </div>
                <span class="mix-label">${escapeHTML(t("common.noSplitShort"))}</span>
            </div>
        `;
    }

    const investedWidth = row.score > 0 ? (row.invested / row.score) * scale * 100 : 0;
    const uninvestedWidth = row.score > 0 ? (row.uninvested / row.score) * scale * 100 : 0;
    const tip = t("tip.mix", {
        invested: formatNumber(row.invested),
        investedPct: formatPercent(row.investedShare),
        uninvested: formatNumber(row.uninvested),
        uninvestedPct: formatPercent(row.uninvestedShare)
    });

    return `
        <div class="mix" title="${escapeHTML(tip)}">
            <div class="mix-track">
                ${investedWidth > 0 ? `<span class="mix-seg mix-invested" style="width:${investedWidth}%"></span>` : ""}
                ${uninvestedWidth > 0 ? `<span class="mix-seg mix-uninvested" style="width:${uninvestedWidth}%"></span>` : ""}
            </div>
            <span class="mix-label">${escapeHTML(t("tip.investedShort", { pct: formatPercent(row.investedShare, 0) }))}</span>
            <span class="sr-only">${escapeHTML(tip)}</span>
        </div>
    `;
}

function renderRankShift(row) {
    if (row.isReturn) return `<span class="muted">${escapeHTML(t("common.notRanked"))}</span>`;
    if (!Number.isFinite(row.investedRank)) return "—";

    const shift = row.rankShift;
    const title = t("tip.rankShift", { total: row.totalRank, invested: row.investedRank });
    let shiftHTML = `<span class="shift shift-same">${icon("minus")}</span>`;

    if (shift > 0) shiftHTML = `<span class="shift shift-up">${icon("arrowUp")}${shift}</span>`;
    if (shift < 0) shiftHTML = `<span class="shift shift-down">${icon("arrowDown")}${Math.abs(shift)}</span>`;

    return `<span class="rank-shift" title="${escapeHTML(title)}">#${row.investedRank} ${shiftHTML}<span class="sr-only">${escapeHTML(title)}</span></span>`;
}

function renderDelta(row) {
    if (row.isReturn) return `<span class="muted">${escapeHTML(t("common.notCalculated"))}</span>`;

    // 上週資料讀取失敗：不跟更早的週比較，也不誤標成新成員。
    if (row.previousMissing) {
        return `<span class="muted" title="${escapeHTML(t("trend.previousMissing"))}">—<span class="sr-only">${escapeHTML(t("trend.previousMissing"))}</span></span>`;
    }

    if (!Number.isFinite(row.delta)) {
        return `<span class="trend trend-new">${escapeHTML(t("trend.new"))}</span>`;
    }

    const title = t("trend.lastWeek", { score: formatNumber(row.previousScore) });
    const [trendClass, iconName] =
        row.delta > 0 ? ["trend-up", "trendingUp"] : row.delta < 0 ? ["trend-down", "trendingDown"] : ["trend-same", "minus"];

    return `
        <span class="trend ${trendClass}" title="${escapeHTML(title)}">
            ${icon(iconName)}${escapeHTML(formatNumber(Math.abs(row.delta)))}<span class="sr-only">${escapeHTML(title)}</span>
        </span>
    `;
}

function getTargetText(row) {
    if (row.invested !== null) {
        if (row.invested >= CONFIG.ELDER_SCORE) return t("target.elderReached");
        if (row.invested >= CONFIG.PASS_SCORE) return t("target.toElder", { value: formatNumber(CONFIG.ELDER_SCORE - row.invested) });

        return t("target.toPass", { value: formatNumber(CONFIG.PASS_SCORE - row.invested) });
    }

    // 舊資料：週表的距離欄位本來就是以投入分計算
    if (row.passDistanceRaw) return t("target.toPass", { value: formatNumber(parseNumber(row.passDistanceRaw)) });
    if (row.elderDistanceRaw) return t("target.toElder", { value: formatNumber(parseNumber(row.elderDistanceRaw)) });

    return t("target.elderReached");
}

function renderBottom(row) {
    if (!isBottomEligible(row)) {
        return `<span class="muted">${escapeHTML(t("common.notCalculated"))}</span>`;
    }

    if (!row.bottomWeeks) return `<span class="muted">—</span>`;

    const always = row.bottomEligibleWeeks >= CONFIG.HISTORY_MIN_WEEKS && row.bottomWeeks === row.bottomEligibleWeeks;
    const key = always ? "bottom.always" : "bottom.ever";

    return `
        <span class="pill ${always ? "pill-risk" : "pill-watch"}">
            ${escapeHTML(t(key, { count: row.bottomWeeks, total: row.bottomEligibleWeeks }))}
        </span>
    `;
}

/* ================================
   Render: All
================================ */

/**
 * 目前期間的資料（月或週）。週資料載入後不會再變，所以依 view + period 快取，
 * 搜尋、篩選、排序時不必重算整個月份模型。
 */
function getCurrentScope() {
    const cacheKey = `${state.view}:${state.period}`;

    if (!state.rowsCache.has(cacheKey)) {
        if (state.view === VIEW.MONTH) {
            const { month, rows } = getMonthRows();

            state.rowsCache.set(cacheKey, { month, model: null, rows, scope: { ...month, rows } });
        } else {
            const { model, rows } = getWeekRows();

            state.rowsCache.set(cacheKey, { month: null, model, rows, scope: { ...model, rows } });
        }
    }

    return state.rowsCache.get(cacheKey);
}

/** 期間或檢視方式改變時：重畫提示、頒獎台、關注名單、統計卡與表格。 */
function renderAll() {
    ensureValidPeriod();
    writeHash();

    const current = getCurrentScope();

    if (current.month) {
        renderNotice(current.month.missingSplitWeeks, current.month.weekModels);
        renderPodium(current.month);
        renderWatchList(current.month);
    } else {
        renderNotice(current.model.hasSplit ? 0 : 1, [current.model]);
        renderPodium(null);
        renderWatchList(null);
    }

    renderStats(current.scope);
    renderTable();
}

/** 搜尋、篩選、排序只影響表格，不必重畫上方的統計區塊。 */
function renderTable() {
    const current = getCurrentScope();
    const { rows } = current;

    const title = current.month
        ? t("table.titleMonth", { month: formatMonthLabel(current.month.monthKey) })
        : t("table.titleWeek", { week: current.model.week.label || current.model.week.id });

    const columns = getColumns();
    const visible = sortRows(rows.filter(row => matchesFilter(row) && matchesKeyword(row)));
    const maxScore = Math.max(0, ...rows.map(row => row.score));

    els.tableTitle.textContent = title;
    els.resultHint.textContent = t("table.hint", {
        shown: visible.length,
        total: rows.length,
        returning: rows.filter(row => row.isReturn).length
    });

    renderHead(columns);
    renderBody(columns, visible, maxScore);
}

function renderError(error) {
    console.error(error);

    // i18n 本身讀取失敗時 t() 只會回傳 key，改用內建文字。
    const hasMessages = Object.keys(i18nState.messages).length > 0;
    const fallback = FALLBACK_ERROR_TEXT[i18nState.locale] || FALLBACK_ERROR_TEXT[CONFIG.DEFAULT_LOCALE];
    const title = hasMessages ? t("error.dataReadFailed") : fallback.title;
    const body = hasMessages ? t("error.dataReadFailedBody") : fallback.body;

    els.stats.innerHTML = "";
    els.podium.innerHTML = "";
    els.watchList.innerHTML = "";
    els.tableHead.innerHTML = "";
    els.resultHint.textContent = title;
    els.tableBody.innerHTML = `
        <tr><td class="empty-state">${escapeHTML(body)}</td></tr>
    `;
}

function renderLoading() {
    els.tableBody.innerHTML = `
        <tr><td class="empty-state"><span class="loader" aria-hidden="true"></span>${escapeHTML(t("common.loading"))}</td></tr>
    `;
}

/* ================================
   Profile
================================ */

function getMemberHistory(key) {
    // 舊到新
    return state.weeks
        .slice()
        .reverse()
        .map(week => {
            const model = state.weekData.get(week.id);
            const person = model?.byKey.get(key);

            return person ? { model, person } : null;
        })
        .filter(Boolean);
}

function renderProfile(key) {
    const history = getMemberHistory(key);

    if (!history.length) {
        els.profileName.textContent = t("profile.emptyTitle");
        els.profileAvatar.textContent = "?";
        els.profileMeta.textContent = "";
        els.profileBody.innerHTML = `<div class="empty-state">${escapeHTML(t("profile.emptyBody"))}</div>`;
        return;
    }

    const latest = history[history.length - 1].person;
    const monthKey =
        state.view === VIEW.MONTH ? state.period : state.weekData.get(state.period)?.monthKey;
    const month = buildMonthModel(monthKey);
    const member = month.byKey.get(key);

    els.profileDialog.classList.toggle("is-elder", latest.status === STATUS.ELDER);
    els.profileName.textContent = latest.cm;
    els.profileAvatar.textContent = getInitial(latest.cm);
    els.profileMeta.textContent = t("profile.meta", {
        line: latest.lineName || "-",
        weeks: history.length,
        status: latest.status ? statusLabel(latest.status) : t("common.none")
    });

    // 所有月份彙總（舊到新）
    const monthSeries = state.months
        .slice()
        .reverse()
        .map(monthKeyItem => {
            const item = buildMonthModel(monthKeyItem).byKey.get(key);

            return {
                label: formatMonthShort(monthKeyItem),
                fullLabel: formatMonthLabel(monthKeyItem),
                score: item ? item.score : null,
                invested: item ? item.invested : null,
                uninvested: item ? item.uninvested : null,
                contribution: item ? item.contribution : null,
                weeksSeen: item ? item.weeksSeen : 0
            };
        })
        .filter(item => item.score !== null);

    const weekSeries = month.weekModels.map(model => {
        const person = model.byKey.get(key);

        return {
            label: getWeekShortLabel(model.week),
            fullLabel: model.week.label || model.week.id,
            score: person ? person.score : null,
            invested: person ? person.invested : null,
            uninvested: person ? person.uninvested : null,
            contribution: person ? person.contribution : null
        };
    });

    const monthLabel = formatMonthLabel(monthKey);

    els.profileBody.innerHTML = `
        ${latest.status === STATUS.ELDER ? `
            <div class="elder-banner">
                <span class="icon-chip" aria-hidden="true">${icon("crown")}</span>
                <div>
                    <strong>${escapeHTML(t("profile.elderTitle"))}</strong>
                    <p>${escapeHTML(t("profile.elderText"))}</p>
                </div>
            </div>` : ""}

        <section class="profile-section">
            <h3 class="section-title">${escapeHTML(t("profile.monthSummary", { month: monthLabel }))}</h3>
            ${member ? renderProfileMonthTiles(member, month) : `<div class="empty-state">${escapeHTML(t("profile.noMonthData", { month: monthLabel }))}</div>`}
        </section>

        <section class="profile-section">
            <div class="section-head">
                <h3 class="section-title">${escapeHTML(t("profile.monthlyChartTitle"))}</h3>
                ${chartLegend()}
            </div>
            <div class="chart-box">${renderStackedColumns(monthSeries, t("profile.monthlyChartAria"))}</div>
        </section>

        <section class="profile-section">
            <div class="section-head">
                <h3 class="section-title">${escapeHTML(t("profile.weeklyChartTitle", { month: monthLabel }))}</h3>
                ${chartLegend()}
            </div>
            <div class="chart-box">${renderStackedColumns(weekSeries, t("profile.weeklyChartAria", { month: monthLabel }))}</div>
        </section>

        <section class="profile-section">
            <h3 class="section-title">${escapeHTML(t("profile.timelineTitle"))}</h3>
            ${renderProfileTimeline(history)}
        </section>
    `;
}

function renderProfileMonthTiles(member, month) {
    const tiles = [
        { label: t("col.monthScore"), value: formatNumber(member.score) },
        { label: t("metric.invested"), value: formatNumber(member.invested), swatch: "invested", note: Number.isFinite(member.investedShare) ? formatPercent(member.investedShare) : t("common.noSplitShort") },
        { label: t("metric.uninvested"), value: formatNumber(member.uninvested), swatch: "uninvested", note: Number.isFinite(member.uninvestedShare) ? formatPercent(member.uninvestedShare) : t("common.noSplitShort") },
        { label: t("col.contribution"), value: formatPercent(member.contribution, 2), note: t("profile.contributionNote") },
        {
            label: t("profile.rank"),
            value: member.isReturn
                ? t("common.notRanked")
                : `#${member.totalRank ?? "—"} / #${member.investedRank ?? "—"}`,
            note: t("profile.rankNote")
        },
        { label: t("col.weeks"), value: t("common.weeksOf", { seen: member.weeksSeen, total: month.totalWeeks }) }
    ];

    return `
        ${member.isHeavy ? `<div class="flag-banner">${escapeHTML(t("flag.heavyTitle", { pct: formatPercent(member.uninvestedShare) }))}</div>` : ""}
        <div class="tile-grid">
            ${tiles.map(tile => `
                <div class="tile">
                    <div class="tile-label">
                        ${tile.swatch ? `<i class="swatch swatch-${tile.swatch}" aria-hidden="true"></i>` : ""}
                        ${escapeHTML(tile.label)}
                    </div>
                    <div class="tile-value">${escapeHTML(tile.value)}</div>
                    ${tile.note ? `<div class="tile-note">${escapeHTML(tile.note)}</div>` : ""}
                </div>
            `).join("")}
        </div>
    `;
}

function chartLegend() {
    return `
        <div class="legend">
            <span class="legend-item"><i class="swatch swatch-invested"></i>${escapeHTML(t("metric.invested"))}</span>
            <span class="legend-item"><i class="swatch swatch-uninvested"></i>${escapeHTML(t("metric.uninvested"))}</span>
        </div>
    `;
}

function niceMax(value) {
    if (value <= 0) return 1;

    const exponent = 10 ** Math.floor(Math.log10(value));
    const fraction = value / exponent;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;

    return nice * exponent;
}

/** 圓角膠囊（兩端全圓）路徑，與參考圖的膠囊直條一致。 */
function capsulePath(x, y, width, height) {
    if (height <= 0) return "";

    const r = Math.min(width / 2, height / 2);

    return [
        `M ${x} ${y + r}`,
        `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
        `L ${x + width} ${y + height - r}`,
        `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
        "Z"
    ].join(" ");
}

/**
 * 投入（下，深色）/ 未投入（上，萊姆色）堆疊膠囊直條圖。
 * 單一 y 軸，段與段之間 2px 間隔；無資料的週別以虛線膠囊表示。
 */
function renderStackedColumns(series, ariaLabel) {
    const valid = series.filter(item => Number.isFinite(item.score));

    if (!valid.length) {
        return `<div class="empty-state">${escapeHTML(t("profile.chartNoData"))}</div>`;
    }

    // 依實際容器寬度繪製，避免手機上被等比縮小後文字過小
    const available = els.profileBody.clientWidth - 64;
    const width = Math.round(Math.min(720, Math.max(300, available || 720)));
    const height = width < 480 ? 210 : 250;
    const pad = { top: 16, right: 12, bottom: 34, left: 52 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const yMax = niceMax(Math.max(...valid.map(item => item.score)));
    const band = plotWidth / series.length;
    const barWidth = Math.max(10, Math.min(28, band * 0.5));
    const gap = 2;
    const y = value => pad.top + plotHeight - (value / yMax) * plotHeight;
    const baseline = y(0);

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(ratioValue => {
        const value = yMax * ratioValue;
        const ty = y(value);

        return `
            <line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${ty}" y2="${ty}"></line>
            <text class="chart-tick" x="${pad.left - 8}" y="${ty + 4}" text-anchor="end">${escapeHTML(formatCompact(value))}</text>
        `;
    }).join("");

    const labelEvery = Math.ceil(series.length / Math.max(1, Math.floor(plotWidth / 64)));

    const bars = series.map((item, index) => {
        const cx = pad.left + band * index + band / 2;
        const x = cx - barWidth / 2;
        const label = index % labelEvery === 0 || index === series.length - 1
            ? `<text class="chart-tick" x="${cx}" y="${height - 12}" text-anchor="middle">${escapeHTML(item.label)}</text>`
            : "";

        if (!Number.isFinite(item.score)) {
            return `
                <g class="bar-group">
                    <rect class="bar-missing" x="${x}" y="${pad.top + plotHeight * 0.1}" width="${barWidth}" height="${plotHeight * 0.9}" rx="${barWidth / 2}"></rect>
                    <rect class="bar-hit" x="${pad.left + band * index}" y="${pad.top}" width="${band}" height="${plotHeight}"
                        tabindex="0" role="img" data-tip="${escapeHTML(`${item.fullLabel}\n${t("common.noRecord")}`)}" aria-label="${escapeHTML(`${item.fullLabel} ${t("common.noRecord")}`)}"></rect>
                    ${label}
                </g>
            `;
        }

        const tipLines = [
            item.fullLabel,
            `${t("metric.score")}：${formatNumber(item.score)}`,
            `${t("metric.invested")}：${formatNumber(item.invested)}`,
            `${t("metric.uninvested")}：${formatNumber(item.uninvested)}`
        ];

        if (Number.isFinite(item.contribution)) {
            tipLines.push(`${t("col.contribution")}：${formatPercent(item.contribution, 2)}`);
        }

        let shapes = "";

        if (item.invested === null) {
            shapes = `<path class="bar-unknown" d="${capsulePath(x, y(item.score), barWidth, baseline - y(item.score))}"></path>`;
        } else {
            const investedTop = y(item.invested);
            const investedHeight = baseline - investedTop;
            const uninvestedTop = y(item.score);
            const uninvestedHeight = Math.max(0, investedTop - uninvestedTop - (investedHeight > 0 ? gap : 0));

            shapes = `
                ${item.uninvested > 0 && uninvestedHeight > 0
                    ? `<path class="bar-uninvested" d="${capsulePath(x, uninvestedTop, barWidth, uninvestedHeight)}"></path>`
                    : ""}
                ${investedHeight > 0
                    ? `<path class="bar-invested" d="${capsulePath(x, investedTop, barWidth, investedHeight)}"></path>`
                    : ""}
            `;
        }

        return `
            <g class="bar-group">
                ${shapes}
                <rect class="bar-hit" x="${pad.left + band * index}" y="${pad.top}" width="${band}" height="${plotHeight}"
                    tabindex="0" role="img" data-tip="${escapeHTML(tipLines.join("\n"))}" aria-label="${escapeHTML(tipLines.join("，"))}"></rect>
                ${label}
            </g>
        `;
    }).join("");

    return `
        <svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${escapeHTML(ariaLabel)}">
            ${ticks}
            ${bars}
        </svg>
    `;
}

function renderProfileTimeline(history) {
    const rows = history
        .slice()
        .reverse()
        .map(({ model, person }) => {
            const activities = person.activities
                .filter(activity => activity.total || activity.invested || activity.uninvested)
                .map(activity => {
                    const split = activity.invested !== null
                        ? ` (${formatNumber(activity.invested)} / ${formatNumber(activity.uninvested)})`
                        : "";

                    return `${t("profile.activity", { number: activity.number })} ${formatNumber(activity.total)}${split}`;
                })
                .join("｜");

            return `
                <tr>
                    <td data-label="${escapeHTML(t("profile.week"))}">
                        <div class="timeline-week">${escapeHTML(model.week.label || model.week.id)}</div>
                        ${activities ? `<div class="timeline-sub">${escapeHTML(activities)}</div>` : ""}
                    </td>
                    <td class="num" data-label="${escapeHTML(t("metric.invested"))}">${escapeHTML(formatNumber(person.invested))}</td>
                    <td class="num" data-label="${escapeHTML(t("metric.uninvested"))}">${escapeHTML(formatNumber(person.uninvested))}</td>
                    <td class="num" data-label="${escapeHTML(t("metric.score"))}"><strong>${escapeHTML(formatNumber(person.score))}</strong></td>
                    <td class="num" data-label="${escapeHTML(t("col.contribution"))}">${escapeHTML(formatPercent(person.contribution, 2))}</td>
                    <td data-label="${escapeHTML(t("col.status"))}">${person.status ? renderBadge(person.status) : "—"}</td>
                </tr>
            `;
        })
        .join("");

    return `
        <div class="table-wrap">
            <table class="timeline-table">
                <thead>
                    <tr>
                        <th scope="col">${escapeHTML(t("profile.week"))}</th>
                        <th scope="col" class="col-num">${escapeHTML(t("metric.invested"))}</th>
                        <th scope="col" class="col-num">${escapeHTML(t("metric.uninvested"))}</th>
                        <th scope="col" class="col-num">${escapeHTML(t("metric.score"))}</th>
                        <th scope="col" class="col-num">${escapeHTML(t("col.contribution"))}</th>
                        <th scope="col">${escapeHTML(t("col.status"))}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="panel-hint">${escapeHTML(t("profile.activityHint"))}</p>
    `;
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** 捲動到頁面區塊並把焦點移過去，鍵盤使用者按 Tab 才會從該區塊繼續；尊重「減少動態效果」設定。 */
function scrollToSection(id) {
    const target = document.getElementById(id);

    if (!target) return;

    target.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });

    // 錨點本身是空的 span 時，焦點改放到 data-focus 指定的區塊（例如表格標題）。
    const focusTarget = (target.dataset.focus && document.getElementById(target.dataset.focus)) || target;

    if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");

    focusTarget.focus({ preventScroll: true });
}

const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

let lastFocusedElement = null;

function openProfile(key) {
    if (!key) return;

    state.profileKey = key;
    lastFocusedElement = document.activeElement;

    els.profileModal.hidden = false;
    document.body.classList.add("modal-open");

    // 背景設為 inert：鍵盤與螢幕閱讀器都無法離開對話框。
    els.app.inert = true;

    renderProfile(key);

    els.profileDialog.scrollTop = 0;
    els.profileDialog.focus();
}

function closeProfile() {
    els.profileModal.hidden = true;
    document.body.classList.remove("modal-open");
    els.app.inert = false;

    const key = state.profileKey;

    state.profileKey = null;
    hideTooltip();

    // 開啟對話框的按鈕可能已被重畫取代，改找同一位成員的按鈕。
    const opener = lastFocusedElement?.isConnected
        ? lastFocusedElement
        : document.querySelector(`[data-profile-key="${CSS.escape(key || "")}"]`);

    opener?.focus?.();
}

/** 不支援 inert 的舊瀏覽器：Tab 在對話框內循環。 */
function trapFocusInDialog(event) {
    if (event.key !== "Tab" || els.profileModal.hidden) return;

    const focusable = Array.from(els.profileDialog.querySelectorAll(FOCUSABLE_SELECTOR));

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === els.profileDialog)) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

/* ================================
   Chart Tooltip
================================ */

function showTooltip(target, clientX, clientY) {
    const text = target.dataset.tip;

    if (!text) return;

    els.tooltip.textContent = text;
    els.tooltip.hidden = false;

    const rect = els.tooltip.getBoundingClientRect();
    const margin = 12;
    let left = clientX + margin;
    let top = clientY - rect.height - margin;

    if (left + rect.width > window.innerWidth - 8) left = clientX - rect.width - margin;
    if (top < 8) top = clientY + margin;

    els.tooltip.style.left = `${Math.max(8, left)}px`;
    els.tooltip.style.top = `${top}px`;
}

function hideTooltip() {
    els.tooltip.hidden = true;
}

/* ================================
   Events
================================ */

function bindEvents() {
    els.languageSelect.addEventListener("change", event => setLocale(event.target.value));

    document.addEventListener("click", event => {
        const button = event.target.closest("#viewTabs [data-view], #railNav [data-view]");

        if (!button || button.dataset.view === state.view) return;

        state.view = button.dataset.view;
        state.filter = FILTER.ALL;
        state.sort = { key: SORT_DEFAULT[state.view], dir: SORT_DEFAULT[state.view] === "sheetOrder" ? "asc" : "desc" };
        ensureValidPeriod();
        renderControls();
        renderAll();
    });

    // 不改網址 hash（hash 用來記錄檢視與期間），改為手動捲動並移動焦點。
    document.querySelectorAll("[data-scroll]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            scrollToSection(link.getAttribute("href").slice(1));
        });
    });

    els.stats.addEventListener("click", event => {
        const shortcut = event.target.closest("[data-filter-shortcut]");

        if (!shortcut) return;

        state.filter = shortcut.dataset.filterShortcut;
        renderControls();
        renderTable();
        scrollToSection("tableAnchor");
    });

    els.periodSelect.addEventListener("change", event => {
        state.period = event.target.value;
        renderControls();
        renderAll();
    });

    els.filterSelect.addEventListener("change", event => {
        state.filter = event.target.value;
        renderTable();
    });

    els.sortSelect.addEventListener("change", event => {
        state.sort = { key: event.target.value, dir: event.target.value === "sheetOrder" ? "asc" : "desc" };
        renderTable();
    });

    els.searchInput.addEventListener("input", debounce(event => {
        state.keyword = event.target.value;
        renderTable();
    }));

    els.tableHead.addEventListener("click", event => {
        const button = event.target.closest("[data-sort]");

        if (!button) return;

        const key = button.dataset.sort;

        state.sort = state.sort.key === key
            ? { key, dir: state.sort.dir === "desc" ? "asc" : "desc" }
            : { key, dir: "desc" };

        els.sortSelect.value = key;
        renderTable();

        // 表頭整個重畫後，把焦點放回剛按的排序按鈕，鍵盤使用者才不會失去位置。
        els.tableHead.querySelector(`[data-sort="${key}"]`)?.focus();
    });

    document.addEventListener("click", event => {
        const trigger = event.target.closest("[data-profile-key]");

        if (trigger) {
            openProfile(trigger.dataset.profileKey);
            return;
        }

        if (event.target.closest("[data-modal-close]")) {
            closeProfile();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" || els.profileModal.hidden) return;

        // 第一次 Esc 先關閉圖表提示，第二次才關閉對話框。
        if (!els.tooltip.hidden) {
            hideTooltip();
            return;
        }

        closeProfile();
    });

    els.profileDialog.addEventListener("keydown", trapFocusInDialog);

    els.profileBody.addEventListener("pointermove", event => {
        const target = event.target.closest("[data-tip]");

        if (target) showTooltip(target, event.clientX, event.clientY);
        else hideTooltip();
    });

    els.profileBody.addEventListener("pointerleave", hideTooltip);

    els.profileBody.addEventListener("focusin", event => {
        const target = event.target.closest("[data-tip]");

        if (!target) return;

        const rect = target.getBoundingClientRect();

        showTooltip(target, rect.left + rect.width / 2, rect.top + rect.height / 3);
    });

    els.profileBody.addEventListener("focusout", hideTooltip);

    window.addEventListener("hashchange", () => {
        readHash();
        ensureValidPeriod();
        renderControls();
        renderAll();
    });
}

/* ================================
   Init
================================ */

/** 註冊 service worker：讓已安裝的 App 可離線開啟，並沿用快取加快重複造訪。 */
function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("Service worker registration failed", error);
    });
}

async function initApp() {
    hydrateIcons();
    bindEvents();

    registerServiceWorker();

    try {
        // i18n 與資料同時開始下載，不必等語系檔載完才抓 CSV。
        const dataLoaded = Promise.all([loadUpdatedAt(), loadWeeks()]);

        // 避免 i18n 先失敗時資料的 Promise 變成未處理的 rejection
        dataLoaded.catch(() => {});

        await loadI18n();
        renderLoading();

        await dataLoaded;

        renderUpdatedAt();
        readHash();

        if (!state.period) {
            state.period = state.view === VIEW.MONTH ? state.months[0] : state.weeks[0].id;
        }

        ensureValidPeriod();
        renderControls();
        renderAll();
    } catch (error) {
        renderError(error);
    }
}

initApp();
