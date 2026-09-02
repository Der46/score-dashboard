const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../data");

const TARGET_HEADERS = [
    "type",
    "CM",
    "LINE名稱",
    "活動1總分",
    "活動1貢獻度",
    "活動2總分",
    "活動2貢獻度",
    "活動3總分",
    "活動3貢獻度",
    "一週總分",
    "整週貢獻度",
    "距離合格分數",
    "距離長老分數",
    "狀態"
];

const SCORE_HEADERS = [
    "活動1總分",
    "活動2總分",
    "活動3總分",
    "一週總分"
];

const CONTRIBUTION_HEADER_MAP = {
    "活動1總分": "活動1貢獻度",
    "活動2總分": "活動2貢獻度",
    "活動3總分": "活動3貢獻度",
    "一週總分": "整週貢獻度"
};

function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
    const text = cleanText(value);

    if (!text) return 0;

    return Number(text.replaceAll(",", "")) || 0;
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return "";

    return `${(value * 100).toFixed(2)}%`;
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

            if (row.some(value => cleanText(value) !== "")) {
                rows.push(row);
            }

            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    row.push(cell);

    if (row.some(value => cleanText(value) !== "")) {
        rows.push(row);
    }

    return rows;
}

function csvToObjects(csvText) {
    const rows = parseCSV(csvText);

    if (!rows.length) {
        return {
            headers: [],
            objects: []
        };
    }

    const headers = rows[0].map(cleanText);

    const objects = rows.slice(1).map(cols => {
        const obj = {};

        headers.forEach((header, index) => {
            obj[header] = cols[index] ?? "";
        });

        return obj;
    });

    return {
        headers,
        objects
    };
}

function escapeCSVCell(value) {
    const text = String(value ?? "");

    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n") ||
        text.includes("\r")
    ) {
        return `"${text.replaceAll('"', '""')}"`;
    }

    return text;
}

function objectsToCSV(objects) {
    const lines = [];

    lines.push(TARGET_HEADERS.map(escapeCSVCell).join(","));

    objects.forEach(row => {
        const line = TARGET_HEADERS
            .map(header => escapeCSVCell(row[header] ?? ""))
            .join(",");

        lines.push(line);
    });

    return lines.join("\n") + "\n";
}

function findTotalRow(rows) {
    return rows.find(row => {
        return cleanText(row["type"]) === "total" || cleanText(row["CM"]) === "總計";
    }) || null;
}

function shouldSkipFile(filePath) {
    const fileName = path.basename(filePath);

    if (!fileName.endsWith(".csv")) return true;
    if (fileName === "weeks.csv") return true;

    return false;
}

function backfillRows(rows) {
    const totalRow = findTotalRow(rows);

    const totals = {};

    SCORE_HEADERS.forEach(header => {
        totals[header] = totalRow
            ? parseNumber(totalRow[header])
            : rows
                .filter(row => cleanText(row["type"]) === "person")
                .reduce((sum, row) => sum + parseNumber(row[header]), 0);
    });

    return rows.map(row => {
        const nextRow = { ...row };

        TARGET_HEADERS.forEach(header => {
            nextRow[header] = nextRow[header] ?? "";
        });

        const type = cleanText(nextRow["type"]);

        SCORE_HEADERS.forEach(scoreHeader => {
            const contributionHeader = CONTRIBUTION_HEADER_MAP[scoreHeader];

            // 如果原本已經有貢獻度，就不覆蓋
            if (cleanText(nextRow[contributionHeader])) {
                return;
            }

            if (type !== "person") {
                nextRow[contributionHeader] = "";
                return;
            }

            const denominator = totals[scoreHeader];
            const numerator = parseNumber(nextRow[scoreHeader]);

            if (!denominator || denominator <= 0) {
                nextRow[contributionHeader] = "";
                return;
            }

            nextRow[contributionHeader] = formatPercent(numerator / denominator);
        });

        return nextRow;
    });
}

function backupFile(filePath) {
    const backupPath = `${filePath}.bak`;

    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
    }
}

function processFile(filePath) {
    const originalText = fs.readFileSync(filePath, "utf8");
    const { objects } = csvToObjects(originalText);

    if (!objects.length) {
        console.log(`略過空檔案：${filePath}`);
        return;
    }

    const updatedRows = backfillRows(objects);
    const updatedCSV = objectsToCSV(updatedRows);

    backupFile(filePath);
    fs.writeFileSync(filePath, updatedCSV, "utf8");

    console.log(`已補貢獻度：${filePath}`);
}

function walkCsvFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach(entry => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walkCsvFiles(fullPath);
            return;
        }

        if (shouldSkipFile(fullPath)) {
            return;
        }

        processFile(fullPath);
    });
}

walkCsvFiles(DATA_DIR);

console.log("全部 CSV 貢獻度補齊完成。");
