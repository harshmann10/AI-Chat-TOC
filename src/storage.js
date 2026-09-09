/**
 * AI Chat TOC - Storage Adapter (v1.9.0)
 * DOM-free shared module: safeStorage + TOC cache key helpers.
 * Loaded before store.js in content scripts and before popup.js in popup.html.
 * Must work in content-script, popup, and Firefox (browser.*) contexts.
 */
window.TOC = window.TOC || {};

// Cache key protocol (shared by content script + popup)
window.TOC.CACHE_PREFIX = 'toc_chat_';
window.TOC.CACHE_INDEX_KEY = 'toc_chat_index';
window.TOC.CACHE_CLEARED_AT_KEY = 'toc_cache_last_cleared_at';
window.TOC.CACHE_MAX_CHATS = 50;
window.TOC.CACHE_SCHEMA_VERSION = 1;

window.TOC.safeStorage = (function () {
    function getStorageApi() {
        try {
            if (typeof browser !== 'undefined' && browser && browser.storage && browser.storage.local) {
                return browser.storage.local;
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
                return chrome.storage.local;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function getRuntime() {
        try {
            if (typeof browser !== 'undefined' && browser && browser.runtime) return browser.runtime;
        } catch (e) { /* ignore */ }
        try {
            if (typeof chrome !== 'undefined' && chrome && chrome.runtime) return chrome.runtime;
        } catch (e) { /* ignore */ }
        return null;
    }

    function hasLastError() {
        const rt = getRuntime();
        try {
            return !!(rt && rt.lastError && rt.lastError.message);
        } catch (e) {
            return false;
        }
    }

    // Note: promise-style is tried first; callback-style is the fallback.
    // hasLastError() is only read through getRuntime().

    async function get(keys) {
        const api = getStorageApi();
        if (!api) return {};
        // Promise style (browser.*, MV3 chrome without callback)
        try {
            const maybePromise = api.get(keys);
            if (maybePromise && typeof maybePromise.then === 'function') {
                const items = await maybePromise;
                if (hasLastError()) return {};
                return items || {};
            }
        } catch (e) { /* try callback style */ }
        try {
            const items = await new Promise((resolve) => {
                try {
                    api.get(keys, (result) => {
                        if (hasLastError()) resolve({});
                        else resolve(result || {});
                    });
                } catch (e) {
                    resolve({});
                }
            });
            return items || {};
        } catch (e) {
            return {};
        }
    }

    async function set(items) {
        const api = getStorageApi();
        if (!api) return false;
        try {
            const maybePromise = api.set(items);
            if (maybePromise && typeof maybePromise.then === 'function') {
                await maybePromise;
                return !hasLastError();
            }
        } catch (e) { /* try callback style */ }
        try {
            const ok = await new Promise((resolve) => {
                try {
                    api.set(items, () => {
                        resolve(!hasLastError());
                    });
                } catch (e) {
                    resolve(false);
                }
            });
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    async function remove(keys) {
        const api = getStorageApi();
        if (!api) return false;
        try {
            const maybePromise = api.remove(keys);
            if (maybePromise && typeof maybePromise.then === 'function') {
                await maybePromise;
                return !hasLastError();
            }
        } catch (e) { /* try callback style */ }
        try {
            const ok = await new Promise((resolve) => {
                try {
                    api.remove(keys, () => {
                        resolve(!hasLastError());
                    });
                } catch (e) {
                    resolve(false);
                }
            });
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    async function getAll() {
        const got = await get(null);
        return got || {};
    }

    return { get, set, remove, getAll };
})();

/**
 * Shared clear-cache helper usable from content script AND popup.
 * Enumerates every toc_chat_* key, removes them, resets index,
 * writes last-cleared timestamp, and returns removed chat count.
 * Storage failure never throws — returns 0.
 */
window.TOC.clearTOCCache = async function clearTOCCache() {
    try {
        const PREFIX = window.TOC.CACHE_PREFIX;
        const INDEX_KEY = window.TOC.CACHE_INDEX_KEY;
        const CLEARED_KEY = window.TOC.CACHE_CLEARED_AT_KEY;
        const all = await window.TOC.safeStorage.getAll();
        const chatKeys = Object.keys(all || {}).filter((k) => k.indexOf(PREFIX) === 0);
        // Never delete the index key itself here (it does not start with toc_chat_ — it is toc_chat_index).
        // Filter defensively in case prefix overlaps index naming.
        const recordKeys = chatKeys.filter((k) => k !== INDEX_KEY);
        if (recordKeys.length > 0) {
            await window.TOC.safeStorage.remove(recordKeys);
        }
        await window.TOC.safeStorage.set({ [INDEX_KEY]: {} });
        await window.TOC.safeStorage.set({ [CLEARED_KEY]: Date.now() });
        // Cancel any pending content-script save is handled by StorageManager
        // in the content context; popup context has no pending timer.
        try {
            const mgr = window.TOC.StorageManager || window.TOC.StoreManager;
            if (mgr && typeof mgr.cancelPendingSave === 'function') {
                mgr.cancelPendingSave();
            }
        } catch (e) { /* ignore */ }
        return recordKeys.length;
    } catch (e) {
        return 0;
    }
};

console.log('[TOC] storage.js loaded');
