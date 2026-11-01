"use strict";

/**
 * Service worker：讓手機「加入主畫面」後也能離線開啟，並沿用快取。
 *
 * 同站的檔案（頁面、程式、語系、週資料）一律「網路優先」：
 * 每次都先向伺服器確認（沒變的檔案只回 304），所以不會顯示過期的分數；
 * 只有在離線或伺服器無回應時才改用上次成功取得的版本。
 *
 * Google Fonts 字型檔內容不會變，採「快取優先」。
 *
 * 修改快取策略或預先快取清單時，請一併更新 CACHE_VERSION。
 */

const CACHE_VERSION = "v1";
const APP_CACHE = `score-dashboard-app-${CACHE_VERSION}`;
const FONT_CACHE = `score-dashboard-fonts-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    "./",
    "./css/styles.css",
    "./js/app.js",
    "./js/icons.js",
    "./i18n.json",
    "./manifest.webmanifest",
    "./icons/icon.svg",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png"
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(APP_CACHE)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    const keep = new Set([APP_CACHE, FONT_CACHE]);

    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => !keep.has(key)).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const { request } = event;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (FONT_HOSTS.includes(url.hostname)) {
        event.respondWith(cacheFirst(request, FONT_CACHE));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request, APP_CACHE));
    }
});

/** 頁面導覽一律以網站根目錄當快取 key，離線時 index.html 的各種 #hash / ?query 都能命中。 */
function cacheKeyFor(request) {
    return request.mode === "navigate" ? new URL("./", self.location.href).toString() : request;
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const key = cacheKeyFor(request);

    try {
        const response = await fetch(request);

        if (response.ok) {
            await cache.put(key, response.clone());
        }

        return response;
    } catch (error) {
        const cached = await cache.match(key);

        if (cached) return cached;

        throw error;
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) return cached;

    const response = await fetch(request);

    // 跨站的字型回應可能是 opaque（status 0），仍可快取使用。
    if (response.ok || response.type === "opaque") {
        await cache.put(request, response.clone());
    }

    return response;
}
