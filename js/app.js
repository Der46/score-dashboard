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
    HISTORY_MIN_WEEKS: 2
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
    weeks: [],              // weeks.csv，新到舊
    weekData: new Map(),    // weekId -> 週資料模型
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
    languageSelect: document.getElementById("languageSelect"),
    viewTabs: document.getElementById("viewTabs"),
    periodSelect: document.getElementById("periodSelect"),
    searchInput: document.getElementById("searchInput"),
    filterSelect: document.getElementById("filterSelect"),
    sortSelect: document.getElementById("sortSelect"),
    notice: document.getElementById("notice"),
    stats: document.getElementById("stats"),
    podium: document.getElementById("podium"),
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

    return Number(text) || 0;
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

async function loadI18n() {
    const response = await fetch(CONFIG.I18N_URL, { cache: "no-store" });

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

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && inQuotes && next === '"') {
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
            if (char === "\r" && next === "\n") i++;

            row.push(cell);

            if (row.some(value => value.trim() !== "")) rows.push(row);

            row = [];
            cell = "";
            continue;
        }

        cell += char;
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
    const response = await fetch(url, { cache: "no-store" });

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
 */
function buildWeekModel(week, rawRows) {
    const people = [];
    let inReturnSection = false;

    rawRows.forEach(raw => {
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
        const score = parseNumber(raw["一週總分"]);
        let invested = parseOptionalNumber(raw["投入總分"]);
        let uninvested = parseOptionalNumber(raw["未投入總分"]);

        if (invested !== null && uninvested === null) {
            uninvested = Math.max(score - invested, 0);
        }

        if (invested === null) {
            uninvested = null;
        }

        const activities = [1, 2, 3].map(number => ({
            number,
            total: parseNumber(raw[`活動${number}總分`]),
            invested: parseOptionalNumber(raw[`活動${number}投入`]),
            uninvested: parseOptionalNumber(raw[`活動${number}未投入`])
        }));

        people.push({
            key: `cm:${cm.toLowerCase()}`,
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
            sheetOrder: people.length
        });
    });

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
        teamUninvested
    };

    model.bottomKeys = getBottomKeys(model);

    return model;
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

    state.weeks = state.weeks.filter(week => state.weekData.has(week.id));
    state.months = Array.from(new Set(state.weeks.map(getWeekMonthKey).filter(Boolean)));

    if (!state.weeks.length) {
        throw new Error(t("error.weeksEmpty"));
    }
}

async function loadUpdatedAt() {
    try {
        const response = await fetch(CONFIG.UPDATED_AT_URL, { cache: "no-store" });

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
        member.investedContribution = member.invested === null ? null : ratio(member.invested, teamInvested);
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
            rankShift:
                Number.isFinite(member.totalRank) && Number.isFinite(member.investedRank)
                    ? member.totalRank - member.investedRank
                    : null
        }))
    };
}

function getPreviousWeekModel(weekId) {
    const index = state.weeks.findIndex(week => week.id === weekId);
    const previous = state.weeks[index + 1];

    return previous ? state.weekData.get(previous.id) : null;
}

function getWeekRows() {
    const model = state.weekData.get(state.period);
    const previous = getPreviousWeekModel(state.period);
    const monthToDate = buildMonthModel(model.monthKey, model.week.id);

    const rows = model.people.map(person => {
        const previousPerson = previous?.byKey.get(person.key) || null;
        const monthMember = monthToDate.byKey.get(person.key);

        return {
            ...person,
            name: person.cm,
            weekModel: model,
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
    document.querySelectorAll("#viewTabs [data-view], #railNav [data-view]").forEach(button => {
        const active = button.dataset.view === state.view;

        button.setAttribute("aria-selected", String(active));
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

function renderNotice(missingWeeks) {
    const messages = [];

    if (missingWeeks > 0) {
        messages.push(t("notice.missingSplit", { count: missingWeeks }));
    }

    if (state.failedWeeks.length) {
        messages.push(t("notice.failedWeeks", { weeks: state.failedWeeks.map(week => week.id).join("、") }));
    }

    els.notice.hidden = !messages.length;
    els.notice.innerHTML = messages.map(message => `<p>${escapeHTML(message)}</p>`).join("");
}

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
            ${ACHIEVEMENTS.map(config => renderAchievementCard(config, results[config.key])).join("")}
        </div>
    `;
}

function renderAchievementCard(config, result) {
    const title = t(`achievement.${config.key}Title`);
    const subtitle = t(`achievement.${config.key}Subtitle`);
    const accentClass = config.accent ? `podium-${config.accent}` : "";

    if (!result) {
        return `
            <article class="podium-card ${accentClass} is-empty" role="listitem">
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
        <button class="podium-card ${accentClass}" type="button" role="listitem"
            data-profile-key="${escapeHTML(result.item.member.key)}"
            title="${escapeHTML(t("profile.open", { name: result.item.member.cm }))}">
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
        .map((row, index) => renderRow(columns, row, index + 1, maxScore))
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
            return cell(column, escapeHTML(t("common.weeksOf", { seen: row.weeksSeen, total: buildMonthModel(state.period).totalWeeks })), "num");

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
            </span>
        `);
    }

    return `
        <div class="member">
            <span class="avatar avatar-sm" aria-hidden="true">${escapeHTML(getInitial(row.name))}</span>
            <div class="member-text">
                <button class="member-link" type="button" data-profile-key="${escapeHTML(row.key)}"
                    title="${escapeHTML(t("profile.open", { name: row.name }))}">
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

    return `<span class="rank-shift" title="${escapeHTML(title)}">#${row.investedRank} ${shiftHTML}</span>`;
}

function renderDelta(row) {
    if (row.isReturn) return `<span class="muted">${escapeHTML(t("common.notCalculated"))}</span>`;

    if (!Number.isFinite(row.delta)) {
        return `<span class="trend trend-new">${escapeHTML(t("trend.new"))}</span>`;
    }

    const title = t("trend.lastWeek", { score: formatNumber(row.previousScore) });
    const [trendClass, iconName] =
        row.delta > 0 ? ["trend-up", "trendingUp"] : row.delta < 0 ? ["trend-down", "trendingDown"] : ["trend-same", "minus"];

    return `
        <span class="trend ${trendClass}" title="${escapeHTML(title)}">
            ${icon(iconName)}${escapeHTML(formatNumber(Math.abs(row.delta)))}
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

function renderAll() {
    ensureValidPeriod();
    writeHash();

    let scope;
    let rows;
    let title;

    if (state.view === VIEW.MONTH) {
        const result = getMonthRows();

        rows = result.rows;
        scope = { ...result.month, rows };
        title = t("table.titleMonth", { month: formatMonthLabel(result.month.monthKey) });
        renderNotice(result.month.missingSplitWeeks);
        renderPodium(result.month);
    } else {
        const result = getWeekRows();

        rows = result.rows;
        scope = { ...result.model, rows };
        title = t("table.titleWeek", { week: result.model.week.label || result.model.week.id });
        renderNotice(result.model.hasSplit ? 0 : 1);
        renderPodium(null);
    }

    renderStats(scope);

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

    els.stats.innerHTML = "";
    els.podium.innerHTML = "";
    els.tableHead.innerHTML = "";
    els.resultHint.textContent = t("error.dataReadFailed");
    els.tableBody.innerHTML = `
        <tr><td class="empty-state">${escapeHTML(t("error.dataReadFailedBody"))}</td></tr>
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
        <div class="legend" aria-hidden="true">
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

/** 圓角頂端、平底的長條路徑。 */
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
                        tabindex="0" data-tip="${escapeHTML(`${item.fullLabel}\n${t("common.noRecord")}`)}" aria-label="${escapeHTML(`${item.fullLabel} ${t("common.noRecord")}`)}"></rect>
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
                    tabindex="0" data-tip="${escapeHTML(tipLines.join("\n"))}" aria-label="${escapeHTML(tipLines.join("，"))}"></rect>
                ${label}
            </g>
        `;
    }).join("");

    return `
        <svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHTML(ariaLabel)}">
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

let lastFocusedElement = null;

function openProfile(key) {
    if (!key) return;

    state.profileKey = key;
    lastFocusedElement = document.activeElement;

    els.profileModal.hidden = false;
    document.body.classList.add("modal-open");

    renderProfile(key);

    els.profileDialog.scrollTop = 0;
    els.profileDialog.focus();
}

function closeProfile() {
    els.profileModal.hidden = true;
    document.body.classList.remove("modal-open");
    state.profileKey = null;
    hideTooltip();

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
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

    document.querySelectorAll("[data-scroll]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            document.getElementById(link.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });

    els.stats.addEventListener("click", event => {
        const shortcut = event.target.closest("[data-filter-shortcut]");

        if (!shortcut) return;

        state.filter = shortcut.dataset.filterShortcut;
        renderControls();
        renderAll();
        document.getElementById("tableAnchor").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.periodSelect.addEventListener("change", event => {
        state.period = event.target.value;
        renderControls();
        renderAll();
    });

    els.filterSelect.addEventListener("change", event => {
        state.filter = event.target.value;
        renderAll();
    });

    els.sortSelect.addEventListener("change", event => {
        state.sort = { key: event.target.value, dir: event.target.value === "sheetOrder" ? "asc" : "desc" };
        renderAll();
    });

    els.searchInput.addEventListener("input", debounce(event => {
        state.keyword = event.target.value;
        renderAll();
    }));

    els.tableHead.addEventListener("click", event => {
        const button = event.target.closest("[data-sort]");

        if (!button) return;

        const key = button.dataset.sort;

        state.sort = state.sort.key === key
            ? { key, dir: state.sort.dir === "desc" ? "asc" : "desc" }
            : { key, dir: "desc" };

        els.sortSelect.value = key;
        renderAll();
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
        if (event.key === "Escape" && !els.profileModal.hidden) {
            closeProfile();
        }
    });

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

async function initApp() {
    hydrateIcons();
    bindEvents();

    try {
        await loadI18n();
        renderLoading();

        await Promise.all([loadUpdatedAt(), loadWeeks()]);

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
