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

    // ── Load settings ────────────────────────────────────────────
    let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    async function loadSettings() {
        if (!storageAPI) return;
        return new Promise(resolve => {
            storageAPI.get(DEFAULT_SETTINGS, items => {
                settings = { ...settings, ...items };
                resolve();
            });
        });
    }

    function saveKey(key, value) {
        if (storageAPI) storageAPI.set({ [key]: value });
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
        platformList.innerHTML = '';

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
        if (storageAPI) storageAPI.set(DEFAULT_SETTINGS);
        refreshModeUI();
        refreshShowAnswersUI();
        renderPlatforms();
    });

    // ── Init ─────────────────────────────────────────────────────
    refreshModeUI();
    refreshShowAnswersUI();
    renderPlatforms();
});
