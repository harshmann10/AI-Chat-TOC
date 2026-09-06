/**
 * AI Chat TOC – Popup Logic
 */
document.addEventListener('DOMContentLoaded', async () => {

    // ── Storage helper (MV2 / MV3 compat) ────────────────────────
    const storageAPI = (typeof chrome !== 'undefined' && chrome.storage)
        ? chrome.storage.local
        : (typeof browser !== 'undefined' && browser.storage)
            ? browser.storage.local
            : null;

    // ── Update version from manifest ────────────────────────────
    const versionSpan = document.querySelector('.header-version');
    if (versionSpan) {
        const manifest = (typeof chrome !== 'undefined') ? chrome.runtime.getManifest() : browser.runtime.getManifest();
        versionSpan.textContent = `v${manifest.version}`;
    }

    // ── Tab switching ────────────────────────────────────────────
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    const indicator = document.querySelector('.tab-indicator');

    function updateTabIndicator(activeTab) {
        if (!indicator || !activeTab) return;
        const index = Array.from(tabs).indexOf(activeTab);
        const gap = 4;
        const x = index * (activeTab.offsetWidth + gap);
        indicator.style.transform = `translateX(${x}px)`;
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            updateTabIndicator(tab);
        });
    });

    // Run initially for default active tab
    setTimeout(() => updateTabIndicator(document.querySelector('.tab.active')), 10);

    // ── Load settings (cross-browser via shared safeStorage adapter) ──
    let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    function safeAdapter() {
        return (window.TOC && window.TOC.safeStorage) || null;
    }

    async function loadSettings() {
        // Prefer the shared adapter (promise-style, Firefox browser.* compatible).
        // Fall back to callback-style chrome.storage for older contexts.
        try {
            const adapter = safeAdapter();
            if (adapter) {
                const items = await adapter.get(DEFAULT_SETTINGS);
                settings = { ...settings, ...(items || {}) };
                return;
            }
        } catch (e) { /* fall through */ }
        if (!storageAPI) return;
        // Detect promise-style (Firefox browser.*) vs callback-style (Chrome)
        try {
            const maybePromise = storageAPI.get(DEFAULT_SETTINGS);
            if (maybePromise && typeof maybePromise.then === 'function') {
                const items = await maybePromise;
                settings = { ...settings, ...(items || {}) };
                return;
            }
        } catch (e) { /* try callback style */ }
        return new Promise(resolve => {
            try {
                storageAPI.get(DEFAULT_SETTINGS, items => {
                    settings = { ...settings, ...(items || {}) };
                    resolve();
                });
            } catch (e) {
                resolve();
            }
        });
    }

    // ── Saved Toast Indicator ────────────────────────────────────
    const savedToast = document.getElementById('saved-toast');
    let savedToastTimer = null;

    function showSavedToast(text = 'Saved') {
        if (!savedToast) return;
        const span = savedToast.querySelector('span');
        if (span) span.textContent = text;
        savedToast.classList.add('visible');
        if (savedToastTimer) clearTimeout(savedToastTimer);
        savedToastTimer = setTimeout(() => {
            savedToast.classList.remove('visible');
        }, 1200);
    }

    function saveKey(key, value) {
        showSavedToast('Saved');
        try {
            const adapter = safeAdapter();
            if (adapter) {
                adapter.set({ [key]: value });
                return;
            }
        } catch (e) { /* fall through */ }
        try {
            if (storageAPI) {
                const r = storageAPI.set({ [key]: value });
                if (r && typeof r.catch === 'function') r.catch(() => { });
            }
        } catch (e) { /* ignore */ }
    }

    await loadSettings();

    // ── Mode toggle ──────────────────────────────────────────────
    const modeBtns = document.querySelectorAll('.mode-option');

    function applyDarkMode() {
        let isDark = false;
        if (settings.themeMode === "dark") {
            isDark = true;
        } else if (settings.themeMode === "light") {
            isDark = false;
        } else {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        if (isDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    function refreshModeUI() {
        modeBtns.forEach(btn =>
            btn.classList.toggle('active', btn.dataset.mode === settings.themeMode)
        );
        applyDarkMode();
    }

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            settings.themeMode = btn.dataset.mode;
            saveKey('themeMode', settings.themeMode);
            refreshModeUI();
        });
    });

    // ── Show Answers toggle ──────────────────────────────────────
    const showAnswersToggle = document.getElementById('toggle-show-answers');

    function refreshShowAnswersUI() {
        if (showAnswersToggle) {
            showAnswersToggle.checked = !!settings.showAnswers;
        }
    }

    if (showAnswersToggle) {
        showAnswersToggle.addEventListener('change', () => {
            settings.showAnswers = showAnswersToggle.checked;
            saveKey('showAnswers', settings.showAnswers);
        });
    }

    // ── Compact Mode toggle ──────────────────────────────────────
    const compactModeToggle = document.getElementById('toggle-compact-mode');

    function refreshCompactModeUI() {
        if (compactModeToggle) {
            compactModeToggle.checked = !!settings.compactMode;
        }
    }

    if (compactModeToggle) {
        compactModeToggle.addEventListener('change', () => {
            settings.compactMode = compactModeToggle.checked;
            saveKey('compactMode', settings.compactMode);
        });
    }

    // ── Experimental API toggle (v1.9.0) ───────────────────────────
    const experimentalApiToggle = document.getElementById('toggle-experimental-api');

    function refreshExperimentalApiUI() {
        if (experimentalApiToggle) {
            experimentalApiToggle.checked = !!settings.experimentalAPI;
        }
    }

    if (experimentalApiToggle) {
        experimentalApiToggle.addEventListener('change', () => {
            settings.experimentalAPI = experimentalApiToggle.checked;
            saveKey('experimentalAPI', settings.experimentalAPI);
        });
    }

    // ── Cache toggle (v1.9.0) ───────────────────────────────────
    const cacheEnabledToggle = document.getElementById('toggle-cache-enabled');

    function refreshCacheEnabledUI() {
        if (cacheEnabledToggle) {
            cacheEnabledToggle.checked = settings.cacheEnabled !== false;
        }
    }

    if (cacheEnabledToggle) {
        cacheEnabledToggle.addEventListener('change', () => {
            settings.cacheEnabled = cacheEnabledToggle.checked;
            saveKey('cacheEnabled', settings.cacheEnabled);
        });
    }

    // ── Clear TOC cache (v1.9.0, shared helper) ──────────────────
    const clearCacheBtn = document.getElementById('clear-toc-cache');
    const cacheStatus = document.getElementById('toc-cache-status');
    const cacheBadge = document.getElementById('toc-cache-badge');

    async function refreshCacheStats() {
        try {
            const adapter = (window.TOC && window.TOC.safeStorage) || null;
            if (!adapter) return;
            const all = await adapter.getAll();
            const prefix = (window.TOC && window.TOC.CACHE_PREFIX) || 'toc_chat_';
            const indexKey = (window.TOC && window.TOC.CACHE_INDEX_KEY) || 'toc_chat_index';
            const chatEntries = Object.entries(all || {}).filter(([k]) => k.indexOf(prefix) === 0 && k !== indexKey);
            const count = chatEntries.length;

            let approxBytes = 0;
            for (const [, val] of chatEntries) {
                try {
                    approxBytes += JSON.stringify(val).length;
                } catch (e) { /* ignore */ }
            }
            const approxKb = Math.round(approxBytes / 1024);

            if (cacheBadge) {
                if (count > 0) {
                    cacheBadge.textContent = `${count} chat${count === 1 ? '' : 's'}${approxKb > 0 ? ` • ${approxKb} KB` : ''}`;
                    cacheBadge.classList.add('has-items');
                } else {
                    cacheBadge.textContent = 'Empty';
                    cacheBadge.classList.remove('has-items');
                }
            }

            if (cacheStatus) {
                cacheStatus.textContent = count > 0
                    ? `${count} cached chat outline${count === 1 ? '' : 's'} stored locally`
                    : 'Stored chat outlines for instant load';
            }

            if (clearCacheBtn && !clearCacheBtn.classList.contains('cleared') && !clearCacheBtn.classList.contains('clearing')) {
                clearCacheBtn.disabled = count === 0;
            }
        } catch (e) { /* ignore */ }
    }

    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            clearCacheBtn.disabled = true;
            clearCacheBtn.classList.add('clearing');
            const btnText = clearCacheBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = 'Clearing...';

            try {
                let removed = 0;
                if (window.TOC && typeof window.TOC.clearTOCCache === 'function') {
                    removed = await window.TOC.clearTOCCache();
                }
                clearCacheBtn.classList.remove('clearing');
                clearCacheBtn.classList.add('cleared');
                clearCacheBtn.innerHTML = `
                    <svg class="cache-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span class="btn-text">Cleared!</span>
                `;
                if (cacheStatus) {
                    cacheStatus.textContent = `Cleared ${removed} cached chat${removed === 1 ? '' : 's'}`;
                }
                showSavedToast('Cache cleared');
            } catch (e) {
                clearCacheBtn.classList.remove('clearing');
                if (cacheStatus) cacheStatus.textContent = 'Failed to clear cache';
            } finally {
                setTimeout(async () => {
                    clearCacheBtn.classList.remove('cleared');
                    clearCacheBtn.innerHTML = `
                        <svg class="cache-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span class="btn-text">Clear</span>
                    `;
                    await refreshCacheStats();
                }, 1400);
            }
        });
    }

    // ── Platform theme cards ─────────────────────────────────────
    const platformList = document.getElementById('platform-list');
    const PLATFORMS = [
        { key: 'chatgpt', name: 'ChatGPT' },
        { key: 'gemini', name: 'Gemini' },
        { key: 'perplexity', name: 'Perplexity' },
        { key: 'claude', name: 'Claude' },
        { key: 'grok', name: 'Grok' }
    ];

    function renderPlatforms() {
        platformList.textContent = '';

        PLATFORMS.forEach(p => {
            const current = (settings.themes && settings.themes[p.key])
                || DEFAULT_THEMES[p.key];

            const card = document.createElement('div');
            card.className = 'platform-card';

            const name = document.createElement('span');
            name.className = 'platform-name';
            name.textContent = p.name;

            const row = document.createElement('div');
            row.className = 'swatches';

            Object.entries(THEMES).forEach(([id, theme]) => {
                const dot = document.createElement('div');
                dot.className = 'swatch' + (current === id ? ' active' : '');
                dot.style.backgroundColor = theme.light.accent;
                dot.title = theme.name;
                dot.addEventListener('click', () => {
                    settings.themes[p.key] = id;
                    saveKey('themes', settings.themes);
                    renderPlatforms();          // re-render to move the checkmark
                });
                row.appendChild(dot);
            });

            card.appendChild(name);
            card.appendChild(row);
            platformList.appendChild(card);
        });
    }

    // ── Reset ────────────────────────────────────────────────────
    document.getElementById('reset-defaults').addEventListener('click', () => {
        settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        try {
            const adapter = safeAdapter();
            if (adapter) adapter.set(DEFAULT_SETTINGS);
            else if (storageAPI) storageAPI.set(DEFAULT_SETTINGS);
        } catch (e) { /* ignore */ }
        showSavedToast('Reset to defaults');
        refreshModeUI();
        refreshShowAnswersUI();
        refreshCompactModeUI();
        refreshExperimentalApiUI();
        refreshCacheEnabledUI();
        refreshCacheStats();
        renderPlatforms();

        // Broadcast layout reset command to all content tabs
        const api = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined') ? browser : null;
        if (api && api.tabs) {
            api.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    api.tabs.sendMessage(tab.id, { action: "reset-toc-layout" }).catch(() => { });
                });
            });
        }
    });

    // ── Init ─────────────────────────────────────────────────────
    refreshModeUI();
    refreshShowAnswersUI();
    refreshCompactModeUI();
    refreshExperimentalApiUI();
    refreshCacheEnabledUI();
    renderPlatforms();
    refreshCacheStats();
});
