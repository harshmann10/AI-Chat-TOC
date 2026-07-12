/**
 * Unified TOC Extension - UI Module
 * Contains all reusable UI code: Position, Drag, Search, and DOM management.
 */

window.TOC = window.TOC || {};

// =============================================================================
// Constants
// =============================================================================

window.TOC.CONSTANTS = {
    IDS: {
        TOC_CONTAINER: "toc-extension",
        TOC_TOGGLE_BTN: "toc-toggle-btn",
        SEARCH_INPUT: "toc-search-input",
        SEARCH_CLEAR: "toc-search-clear",
    },
    CLASSES: {
        TOC_HEADER: "toc-header",
        TOC_HEADER_CONTENT: "toc-header-content",
        TOC_DRAG_HANDLE: "toc-drag-handle",
        TOC_SEARCH_CONTAINER: "toc-search-container",
        TOC_RESIZE_HANDLE: "toc-resize-handle",
        COLLAPSED: "collapsed",
    },
    CONSTRAINTS: {
        PADDING: 10,
        MIN_WIDTH: 220,
        MAX_WIDTH: 900,
        MIN_HEIGHT: 180,
        MAX_HEIGHT_VH: 0.95,
        MAX_QUERY_LENGTH: 70,
        TRUNCATE_SUFFIX: "...",
    },
};

// =============================================================================
// PositionManager - Handles saving and loading TOC position
// =============================================================================

window.TOC.PositionManager = class PositionManager {
    constructor(storageKey) {
        this.storageKey = storageKey;
        this.collapsedKey = storageKey + "-collapsed";
        this.sizeKey = storageKey + "-size";
    }

    savePosition(x, y) {
        localStorage.setItem(this.storageKey, JSON.stringify({ x, y }));
    }

    getSavedPosition() {
        const saved = localStorage.getItem(this.storageKey);
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            localStorage.removeItem(this.storageKey);
            return null;
        }
    }

    saveCollapsedState(isCollapsed) {
        localStorage.setItem(this.collapsedKey, JSON.stringify(isCollapsed));
    }

    getCollapsedState() {
        const saved = localStorage.getItem(this.collapsedKey);
        if (!saved) return false;
        try {
            return JSON.parse(saved);
        } catch (e) {
            localStorage.removeItem(this.collapsedKey);
            return false;
        }
    }

    saveSize(width, height) {
        localStorage.setItem(this.sizeKey, JSON.stringify({ width, height }));
    }

    getSavedSize() {
        const saved = localStorage.getItem(this.sizeKey);
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            this.clearSavedSize();
            return null;
        }
    }

    clearSavedSize() {
        localStorage.removeItem(this.sizeKey);
    }

    applySize(element, width, height) {
        element.style.setProperty("width", `${width}px`, "important");
        element.style.setProperty("height", `${height}px`, "important");
        element.style.setProperty("max-height", "none", "important");
    }

    clearSize(element) {
        element.style.removeProperty("width");
        element.style.removeProperty("height");
        element.style.removeProperty("max-height");
        const list = element.querySelector("ul");
        if (list) list.style.removeProperty("max-height");
    }

    applyPosition(element, x, y) {
        const styles = {
            position: "fixed",
            left: `${x}px`,
            top: `${y}px`,
            right: "auto",
            bottom: "auto",
            margin: "0",
            transform: "none",
        };

        Object.entries(styles).forEach(([prop, value]) => {
            element.style.setProperty(prop, value, "important");
        });
    }

    constrainToViewport(x, y, elementWidth, elementHeight) {
        const padding = window.TOC.CONSTANTS.CONSTRAINTS.PADDING;
        const minX = padding;
        const minY = padding;
        const maxX = window.innerWidth - elementWidth - padding;
        const maxY = window.innerHeight - elementHeight - padding;

        return {
            x: Math.max(minX, Math.min(x, maxX)),
            y: Math.max(minY, Math.min(y, maxY)),
        };
    }
};

// =============================================================================
// ThemeManager - Handles applying themes and dark mode
// =============================================================================

window.TOC.ThemeManager = class ThemeManager {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.init();
    }

    async init() {
        await this.loadSettings();
    }

    async loadSettings() {
        return new Promise((resolve) => {
            const api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : (typeof browser !== 'undefined' && browser.storage) ? browser : null;
            if (api && api.storage && api.storage.local) {
                api.storage.local.get(DEFAULT_SETTINGS, (items) => {
                    this.settings = { ...this.settings, ...items };
                    resolve(this.settings);
                });
            } else {
                resolve(this.settings);
            }
        });
    }

    applyTheme(element, platformKey) {
        if (!element || !platformKey) return;

        const themeId = (this.settings.themes && this.settings.themes[platformKey]) || DEFAULT_THEMES[platformKey] || "emerald";
        const themeConfig = THEMES[themeId];
        if (!themeConfig) return;

        const isDark = this.getEffectiveDarkMode();
        const colors = isDark ? themeConfig.dark : themeConfig.light;

        element.style.setProperty("--toc-accent", colors.accent, "important");
        element.style.setProperty("--toc-accent-light", colors.accentLight, "important");
        element.style.setProperty("--toc-accent-hover", colors.accentHover, "important");

        this.applyDarkMode(element);
    }

    applyDarkMode(element) {
        const isDark = this.getEffectiveDarkMode();
        if (isDark) {
            element.classList.add("toc-dark");
        } else {
            element.classList.remove("toc-dark");
        }

        // Handle standalone elements like toast
        const toast = document.querySelector(".toc-toast");
        if (toast) {
            if (isDark) toast.classList.add("toc-dark");
            else toast.classList.remove("toc-dark");
        }
    }

    getEffectiveDarkMode() {
        const mode = this.settings.themeMode || "system";
        if (mode === "dark") return true;
        if (mode === "light") return false;
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    onSettingsChanged(callback) {
        const handler = (changes, area) => {
            if (area === "local") {
                for (let key in changes) {
                    if (changes[key].newValue !== undefined) {
                        this.settings[key] = changes[key].newValue;
                    }
                }
                if (callback) callback(this.settings);
            }
        };

        const api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : (typeof browser !== 'undefined' && browser.storage) ? browser : null;
        if (api && api.storage) {
            api.storage.onChanged.addListener(handler);
        }
    }

    saveSetting(key, value) {
        this.settings[key] = value;
        const api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : (typeof browser !== 'undefined' && browser.storage) ? browser : null;
        if (api && api.storage && api.storage.local) {
            api.storage.local.set({ [key]: value });
        }
    }
};

// =============================================================================
// DragManager - Handles drag functionality for the TOC (mouse + touch)
// =============================================================================

window.TOC.DragManager = class DragManager {
    constructor(element, positionManager) {
        this.element = element;
        this.positionManager = positionManager;
        this.isDragging = false;
        this.hasMoved = false;
        this.isClickOnToggle = false;
        this.startX = 0;
        this.startY = 0;
        this.startElementX = 0;
        this.startElementY = 0;

        this.boundDrag = this.drag.bind(this);
        this.boundStopDrag = this.stopDrag.bind(this);

        this.init();
    }

    init() {
        const header = this.element.querySelector(`.${window.TOC.CONSTANTS.CLASSES.TOC_HEADER}`);
        if (!header) return;

        header.style.cursor = "move";
        header.style.userSelect = "none";
        header.style.touchAction = "none";

        header.addEventListener("pointerdown", this.startDrag.bind(this));
    }

    startDrag(e) {
        if (!e.isPrimary) return;

        const isToggleBtn = e.target.closest(`#${window.TOC.CONSTANTS.IDS.TOC_TOGGLE_BTN}`);
        const isExportBtn = e.target.closest("#toc-export-btn");
        const isRefreshBtn = e.target.closest("#toc-refresh-btn");
        const isCollapsed = this.element.classList.contains(window.TOC.CONSTANTS.CLASSES.COLLAPSED);

        if (isExportBtn || isRefreshBtn) return;

        if (isToggleBtn && !isCollapsed) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleCollapse(false);
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        this.isDragging = true;
        this.hasMoved = false;
        this.isClickOnToggle = !!isToggleBtn;
        this.startX = e.clientX;
        this.startY = e.clientY;

        const rect = this.element.getBoundingClientRect();
        this.startElementX = rect.left;
        this.startElementY = rect.top;

        this.positionManager.applyPosition(this.element, this.startElementX, this.startElementY);
        this.applyDragStyles();

        document.addEventListener("pointermove", this.boundDrag);
        document.addEventListener("pointerup", this.boundStopDrag);
        document.addEventListener("pointercancel", this.boundStopDrag);
        document.body.style.userSelect = "none";
    }

    drag(e) {
        if (!this.isDragging || !e.isPrimary) return;
        e.preventDefault();

        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;

        if (!this.hasMoved && Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) return;
        this.hasMoved = true;

        const constrained = this.positionManager.constrainToViewport(
            this.startElementX + deltaX,
            this.startElementY + deltaY,
            this.element.offsetWidth,
            this.element.offsetHeight
        );
        this.positionManager.applyPosition(this.element, constrained.x, constrained.y);
    }

    stopDrag(e) {
        if (!this.isDragging) return;
        this.isDragging = false;

        const rect = this.element.getBoundingClientRect();
        this.positionManager.savePosition(rect.left, rect.top);

        if (!this.hasMoved && this.isClickOnToggle) {
            this.toggleCollapse(true);
        }

        this.removeDragStyles();
        document.removeEventListener("pointermove", this.boundDrag);
        document.removeEventListener("pointerup", this.boundStopDrag);
        document.removeEventListener("pointercancel", this.boundStopDrag);
        document.body.style.userSelect = "";
    }

    toggleCollapse(isExpanding) {
        const rect = this.element.getBoundingClientRect();
        const currentX = rect.left;
        const currentY = rect.top;
        const collapsedSize = 48;

        if (!isExpanding) {
            const expandedWidth = rect.width;
            const expandedHeight = rect.height;
            this.element.dataset.expandedWidth = expandedWidth;
            this.element.dataset.expandedHeight = expandedHeight;

            const newX = currentX + expandedWidth - collapsedSize;

            this.element.classList.add(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
            this.element.style.removeProperty("width");
            this.element.style.removeProperty("height");
            this.element.style.removeProperty("max-height");
            this.positionManager.applyPosition(this.element, newX, currentY);
            this.positionManager.savePosition(newX, currentY);
            this.positionManager.saveCollapsedState(true);
        } else {
            const savedSize = this.positionManager.getSavedSize();
            const expandedWidth = savedSize
                ? savedSize.width
                : (parseFloat(this.element.dataset.expandedWidth) || 300);
            const expandedHeight = savedSize
                ? savedSize.height
                : parseFloat(this.element.dataset.expandedHeight);

            const newX = currentX - (expandedWidth - collapsedSize);
            this.element.classList.remove(window.TOC.CONSTANTS.CLASSES.COLLAPSED);

            if (savedSize) {
                this.positionManager.applySize(this.element, expandedWidth, expandedHeight);
                const list = this.element.querySelector("ul");
                if (list) list.style.maxHeight = "none";
            }

            const constrained = this.positionManager.constrainToViewport(
                newX, currentY, expandedWidth, this.element.offsetHeight
            );
            this.positionManager.applyPosition(this.element, constrained.x, constrained.y);
            this.positionManager.savePosition(constrained.x, constrained.y);
            this.positionManager.saveCollapsedState(false);
        }
    }

    applyDragStyles() {
        this.element.style.opacity = "0.8";
        this.element.style.transition = "none";
        this.element.style.zIndex = "10001";
    }

    removeDragStyles() {
        this.element.style.opacity = "";
        this.element.style.transition = "";
        this.element.style.zIndex = "10000";
    }
};

// =============================================================================
// ResizeManager - Handles drag-to-resize functionality (Pointer Events)
// =============================================================================

window.TOC.ResizeManager = class ResizeManager {
    constructor(element, positionManager) {
        this.element = element;
        this.positionManager = positionManager;
        this.isResizing = false;
        this.isLeftResize = false;
        this.ticking = false;
        this.lastTapTime = 0;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        this.startLeft = 0;
        this.pendingX = 0;
        this.pendingY = 0;

        this.boundResize = this.resize.bind(this);
        this.boundStopResize = this.stopResize.bind(this);

        this.init();
    }

    init() {
        const handles = this.element.querySelectorAll(`.${window.TOC.CONSTANTS.CLASSES.TOC_RESIZE_HANDLE}`);
        handles.forEach(handle => {
            handle.style.touchAction = "none";
            handle.addEventListener("pointerdown", this.startResize.bind(this));
        });
    }

    startResize(e) {
        if (!e.isPrimary) return;

        // Double-tap/click reset check
        const now = Date.now();
        if (now - this.lastTapTime < 300) {
            this.resetToDefault();
            this.lastTapTime = 0;
            return;
        }
        this.lastTapTime = now;

        e.preventDefault();
        e.stopPropagation();

        this.isLeftResize = e.target.classList.contains("bottom-left");
        this.isResizing = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startWidth = this.element.offsetWidth;
        this.startHeight = this.element.offsetHeight;
        this.startLeft = parseFloat(this.element.style.left) || this.element.getBoundingClientRect().left;

        this.applyResizeStyles(e.target);

        document.addEventListener("pointermove", this.boundResize);
        document.addEventListener("pointerup", this.boundStopResize);
        document.addEventListener("pointercancel", this.boundStopResize);
        document.body.style.userSelect = "none";
    }

    resize(e) {
        if (!this.isResizing || !e.isPrimary) return;
        e.preventDefault();

        this.pendingX = e.clientX;
        this.pendingY = e.clientY;

        if (!this.ticking) {
            requestAnimationFrame(() => {
                this.applyResize();
                this.ticking = false;
            });
            this.ticking = true;
        }
    }

    applyResize() {
        const deltaX = this.pendingX - this.startX;
        const deltaY = this.pendingY - this.startY;
        const max = this.getEffectiveMax();
        const C = window.TOC.CONSTANTS.CONSTRAINTS;

        let newWidth, newHeight, newLeft;

        if (this.isLeftResize) {
            // Left resize: dragging left (negative deltaX) increases width
            newWidth = Math.max(C.MIN_WIDTH, Math.min(this.startWidth - deltaX, max.width));
            const widthDiff = newWidth - this.startWidth;
            newLeft = this.startLeft - widthDiff;
            newHeight = Math.max(C.MIN_HEIGHT, Math.min(this.startHeight + deltaY, max.height));
        } else {
            // Right resize: dragging right (positive deltaX) increases width
            newWidth = Math.max(C.MIN_WIDTH, Math.min(this.startWidth + deltaX, max.width));
            newHeight = Math.max(C.MIN_HEIGHT, Math.min(this.startHeight + deltaY, max.height));
        }

        this.positionManager.applySize(this.element, newWidth, newHeight);

        if (this.isLeftResize && newLeft !== undefined) {
            this.element.style.left = `${newLeft}px`;
        }

        const list = this.element.querySelector("ul");
        if (list) list.style.maxHeight = "none";
    }

    getEffectiveMax() {
        const rect = this.element.getBoundingClientRect();
        const padding = window.TOC.CONSTANTS.CONSTRAINTS.PADDING;
        const C = window.TOC.CONSTANTS.CONSTRAINTS;

        // When resizing from the left, space to the left is bounded by rect.right - padding
        const maxWidth = this.isLeftResize 
            ? Math.min(C.MAX_WIDTH, (rect.right - padding)) 
            : Math.min(C.MAX_WIDTH, (window.innerWidth - rect.left - padding));

        return {
            width: maxWidth,
            height: Math.min(
                window.innerHeight * C.MAX_HEIGHT_VH,
                window.innerHeight - rect.top - padding
            )
        };
    }

    stopResize(e) {
        if (!this.isResizing) return;
        this.isResizing = false;

        const width = this.element.offsetWidth;
        const height = this.element.offsetHeight;
        this.positionManager.saveSize(width, height);

        if (this.isLeftResize) {
            const rect = this.element.getBoundingClientRect();
            this.positionManager.savePosition(rect.left, rect.top);
        }

        this.removeResizeStyles();
        document.removeEventListener("pointermove", this.boundResize);
        document.removeEventListener("pointerup", this.boundStopResize);
        document.removeEventListener("pointercancel", this.boundStopResize);
        document.body.style.userSelect = "";
    }

    resetToDefault() {
        this.positionManager.clearSavedSize();
        this.positionManager.clearSize(this.element);

        const rect = this.element.getBoundingClientRect();
        const constrained = this.positionManager.constrainToViewport(
            rect.left, rect.top, this.element.offsetWidth, this.element.offsetHeight
        );
        this.positionManager.applyPosition(this.element, constrained.x, constrained.y);
        this.positionManager.savePosition(constrained.x, constrained.y);
    }

    applyResizeStyles(activeHandle) {
        this.element.style.transition = "none";
        this.element.style.zIndex = "10001";
        if (activeHandle) activeHandle.classList.add("resizing");
    }

    removeResizeStyles() {
        this.element.style.transition = "";
        this.element.style.zIndex = "10000";
        const handles = this.element.querySelectorAll(`.${window.TOC.CONSTANTS.CLASSES.TOC_RESIZE_HANDLE}`);
        handles.forEach(h => h.classList.remove("resizing"));
    }
};

// =============================================================================
// SearchManager - Handles search functionality
// =============================================================================

window.TOC.SearchManager = class SearchManager {
    constructor(searchInput, searchClear) {
        this.searchInput = searchInput;
        this.searchClear = searchClear;
        this.allListItems = [];

        this.init();
    }

    init() {
        this.searchInput.addEventListener("input", this.handleSearchInput.bind(this));
        this.searchClear.addEventListener("click", this.clearSearch.bind(this));
    }

    addListItems(items) {
        this.allListItems.push(...items);
    }

    handleSearchInput() {
        this.updateSearchResults();
        this.updateClearButtonVisibility();
    }

    updateSearchResults() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();

        this.allListItems.forEach((item) => {
            const text = item.querySelector("a").textContent.toLowerCase();
            const answer = (item.getAttribute("data-answer") || "").toLowerCase();
            const shouldShow = searchTerm === "" || text.includes(searchTerm) || answer.includes(searchTerm);
            item.style.display = shouldShow ? "" : "none";
        });
    }

    updateClearButtonVisibility() {
        this.searchClear.style.display = this.searchInput.value ? "flex" : "none";
    }

    clearSearch() {
        this.searchInput.value = "";
        this.updateSearchResults();
        this.updateClearButtonVisibility();
        this.searchInput.focus();
    }

    reset() {
        this.allListItems = [];
    }
};

// =============================================================================
// UI - Main TOC UI class
// =============================================================================

window.TOC.UI = class UI {
    constructor(siteConfig) {
        this.config = siteConfig;
        this.positionManager = new window.TOC.PositionManager(siteConfig.storageKey);
        this.themeManager = new window.TOC.ThemeManager();
        this.searchManager = null;
        this.dragManager = null;
        this.createTimer = null; // Debounce timer
        this.lastCreateTime = 0; // Prevent rapid creates

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.config.setupMonitor(() => this.createTOC());
        this.delayedCreateTOC();
    }

    setupEventListeners() {
        window.addEventListener("load", () => this.delayedCreateTOC());
        window.addEventListener("pageshow", () => this.delayedCreateTOC());
        window.addEventListener("resize", () => this.handleWindowResize());

        document.addEventListener("click", (e) => this.handleDocumentClick(e), true);
        document.addEventListener("keydown", (e) => this.handleKeyDown(e), true);

        // Listen for messages from background script (Native Commands API)
        const api = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome : (typeof browser !== 'undefined' && browser.runtime) ? browser : null;
        if (api) {
            api.runtime.onMessage.addListener((request) => {
                if (request.action === "toggle-toc") {
                    this.toggleTOC();
                } else if (request.action === "reset-toc-layout") {
                    this.resetLayout();
                } else if (request.action === "toggle-compact-mode") {
                    this.toggleCompactModeShortcut();
                }
            });
        }

        // Listen for theme/settings changes from popup
        this.themeManager.onSettingsChanged(() => {
            // Reload settings first, then rebuild the TOC to reflect changes (e.g. showAnswers)
            this.themeManager.loadSettings().then(() => {
                this.createTOC(true);
            });
        });
    }

    resetLayout() {
        const tocContainer = document.getElementById(window.TOC.CONSTANTS.IDS.TOC_CONTAINER);
        if (!tocContainer) return;

        // 1. Clear saved values in PositionManager
        localStorage.removeItem(this.positionManager.storageKey);
        localStorage.removeItem(this.positionManager.sizeKey);
        localStorage.removeItem(this.positionManager.collapsedKey);

        // 2. Clear size and position in CSS / inline styles
        this.positionManager.clearSize(tocContainer);
        tocContainer.classList.remove(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
        tocContainer.classList.remove("compact-mode");
        this.themeManager.settings.compactMode = false;
        this.themeManager.settings.showAnswers = false;
        const api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : (typeof browser !== 'undefined' && browser.storage) ? browser : null;
        if (api && api.storage && api.storage.local) {
            api.storage.local.set({ compactMode: false, showAnswers: false });
        }

        // 3. Re-calculate defaults
        const width = 300;
        const height = 400;
        const x = window.innerWidth - width - 40;
        const y = 60;

        // 4. Temporarily disable transitions, apply position, and then restore
        tocContainer.style.setProperty("transition", "none", "important");
        this.positionManager.applyPosition(tocContainer, x, y);

        const list = tocContainer.querySelector("ul");
        if (list) list.style.removeProperty("max-height");

        // Force reflow
        tocContainer.offsetHeight;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                tocContainer.style.removeProperty("transition");
            });
        });

        this.showToast("TOC size & position reset to default");
    }

    toggleTOC() {
        const tocContainer = document.getElementById(window.TOC.CONSTANTS.IDS.TOC_CONTAINER);
        if (!tocContainer) {
            this.createTOC();
            return;
        }

        const isCollapsed = tocContainer.classList.contains(window.TOC.CONSTANTS.CLASSES.COLLAPSED);

        if (isCollapsed) {
            // Expand
            tocContainer.classList.remove(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
            this.positionManager.saveCollapsedState(false);
        } else {
            // Collapse
            tocContainer.classList.add(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
            this.positionManager.saveCollapsedState(true);
        }

        this.showToast(isCollapsed ? "TOC expanded" : "TOC collapsed");
    }

    toggleCompactModeShortcut() {
        const tocContainer = document.getElementById(window.TOC.CONSTANTS.IDS.TOC_CONTAINER);
        if (!tocContainer) return;

        const newMode = !this.themeManager.settings.compactMode;
        this.themeManager.saveSetting("compactMode", newMode);

        if (newMode) {
            tocContainer.classList.add("compact-mode");
        } else {
            tocContainer.classList.remove("compact-mode");
            const popover = document.getElementById("toc-compact-popover");
            if (popover) {
                popover.classList.remove("show");
                popover.style.display = "none";
            }
        }

        this.showToast(newMode ? "Compact mode enabled" : "Compact mode disabled");
    }

    delayedCreateTOC() {
        setTimeout(() => {
            console.log(`[TOC] Initial create for ${this.config.name}`);
            this.createTOC();
        }, this.config.delays.pageLoad);
    }

    // Debounced version - prevents multiple rapid calls
    debouncedCreateTOC() {
        // Clear any pending timer
        if (this.createTimer) {
            clearTimeout(this.createTimer);
        }

        // Debounce: wait 300ms before creating
        this.createTimer = setTimeout(() => {
            this.createTOC();
        }, 300);
    }

    createTOC(force = false) {
        // Throttle: prevent rapid successive creates
        const now = Date.now();
        if (!force && now - this.lastCreateTime < 500) {
            console.log("[TOC] Skipping - too soon since last create");
            return;
        }
        this.lastCreateTime = now;

        const questions = this.config.getQueries();
        if (questions.length === 0) {
            console.log("[TOC] No questions found, not creating TOC");
            return;
        }

        // #9: Preserve active search term across rebuilds
        const existingTOC = document.getElementById(window.TOC.CONSTANTS.IDS.TOC_CONTAINER);
        const activeSearch = existingTOC
            ? (existingTOC.querySelector(`#${window.TOC.CONSTANTS.IDS.SEARCH_INPUT}`)?.value || "")
            : "";

        // Remove existing TOC and do a full rebuild each time
        if (existingTOC) existingTOC.remove();

        this.themeManager.loadSettings().then(() => {
            const tocContainer = this.buildTOCStructure(questions);
            this.themeManager.applyTheme(tocContainer, this.config.platformKey);

            this.setupTOCFunctionality(tocContainer);

            // #9: Restore search term after setup so the new list items get filtered
            if (activeSearch && this.searchManager) {
                const searchInput = tocContainer.querySelector(`#${window.TOC.CONSTANTS.IDS.SEARCH_INPUT}`);
                if (searchInput) {
                    searchInput.value = activeSearch;
                    this.searchManager.updateSearchResults();
                    this.searchManager.updateClearButtonVisibility();
                }
            }

            this.applyInitialPosition(tocContainer);

            document.body.appendChild(tocContainer);
            console.log(`[TOC] Created with ${questions.length} items`);
        });
    }

    buildTOCStructure(questions) {
        const CONSTANTS = window.TOC.CONSTANTS;

        const tocContainer = document.createElement("div");
        tocContainer.id = CONSTANTS.IDS.TOC_CONTAINER;
        // Theme is now applied dynamically via ThemeManager

        // Header
        const tocHeader = document.createElement("div");
        tocHeader.className = CONSTANTS.CLASSES.TOC_HEADER;

        const headerContent = document.createElement("div");
        headerContent.className = CONSTANTS.CLASSES.TOC_HEADER_CONTENT;

        const dragHandle = document.createElement("div");
        dragHandle.className = CONSTANTS.CLASSES.TOC_DRAG_HANDLE;
        dragHandle.title = "Drag to move";

        const title = document.createElement("h2");
        title.textContent = "Table of Contents";

        // Header buttons container
        const headerButtons = document.createElement("div");
        headerButtons.className = "toc-header-buttons";

        // Export button
        const exportBtn = document.createElement("button");
        exportBtn.id = "toc-export-btn";
        exportBtn.title = "Export queries";
        exportBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showExportMenu(tocContainer);
        });

        // Refresh button
        const refreshBtn = document.createElement("button");
        refreshBtn.id = "toc-refresh-btn";
        refreshBtn.title = "Refresh TOC";
        refreshBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.createTOC(true);
        });

        if (this.themeManager.settings.compactMode) {
            tocContainer.classList.add("compact-mode");
        }

        const toggleBtn = document.createElement("button");
        toggleBtn.id = CONSTANTS.IDS.TOC_TOGGLE_BTN;
        toggleBtn.title = "Toggle Table of Contents";

        headerButtons.appendChild(exportBtn);
        headerButtons.appendChild(refreshBtn);
        headerButtons.appendChild(toggleBtn);

        headerContent.appendChild(dragHandle);
        headerContent.appendChild(title);
        tocHeader.appendChild(headerContent);
        tocHeader.appendChild(headerButtons);

        // Search
        const searchContainer = document.createElement("div");
        searchContainer.className = CONSTANTS.CLASSES.TOC_SEARCH_CONTAINER;

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.id = CONSTANTS.IDS.SEARCH_INPUT;
        searchInput.placeholder = "Search queries...";

        const searchClear = document.createElement("div");
        searchClear.id = CONSTANTS.IDS.SEARCH_CLEAR;
        searchClear.title = "Clear search";

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(searchClear);

        // List
        const tocList = document.createElement("ul");

        // --- EVENT DELEGATION: Handle all clicks on links and copy buttons in one place ---
        tocList.addEventListener("click", (e) => {
            const link = e.target.closest("a");
            const qCopy = e.target.closest(".toc-copy-btn");
            const aCopy = e.target.closest(".toc-answer-copy");

            const answerNav = e.target.closest(".toc-answer-content[data-nav-id]");

            if (link) {
                e.preventDefault();
                const questionId = link.getAttribute("href").substring(1);
                const targetElement = document.getElementById(questionId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            } else if (answerNav && !e.target.closest(".toc-answer-copy")) {
                e.preventDefault();
                const targetElement = document.getElementById(answerNav.getAttribute("data-nav-id"));
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            } else if (qCopy) {
                e.preventDefault();
                e.stopPropagation();
                const text = qCopy.getAttribute("data-text");
                this.copyToClipboard(text, "Query copied!");
            } else if (aCopy) {
                e.preventDefault();
                e.stopPropagation();
                const text = aCopy.getAttribute("data-text");
                this.copyToClipboard(text, "Answer copied!");
            }
        });

        this.populateTOCList(tocList, questions);

        // Footer with count
        const tocFooter = document.createElement("div");
        tocFooter.className = "toc-footer";
        const tocCount = document.createElement("span");
        tocCount.className = "toc-count";
        tocCount.textContent = `${questions.length} queries`;
        tocFooter.appendChild(tocCount);

        tocContainer.appendChild(tocHeader);
        tocContainer.appendChild(searchContainer);
        tocContainer.appendChild(tocList);
        tocContainer.appendChild(tocFooter);

        // Bottom Right Resize Handle
        const resizeRight = document.createElement("div");
        resizeRight.className = `${CONSTANTS.CLASSES.TOC_RESIZE_HANDLE} bottom-right`;
        resizeRight.title = "Drag to resize \u2022 Double-click to reset";
        tocContainer.appendChild(resizeRight);

        // Bottom Left Resize Handle
        const resizeLeft = document.createElement("div");
        resizeLeft.className = `${CONSTANTS.CLASSES.TOC_RESIZE_HANDLE} bottom-left`;
        resizeLeft.title = "Drag to resize \u2022 Double-click to reset";
        tocContainer.appendChild(resizeLeft);

        return tocContainer;
    }

    showExportMenu(container) {
        // Remove existing menu if any
        const existingMenu = container.querySelector(".toc-export-menu");
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        const questions = this.config.getQueries();

        const menu = document.createElement("div");
        menu.className = "toc-export-menu";

        const options = [
            { label: "Copy as Text", action: () => this.exportAsText(questions) },
            { label: "Copy as Markdown", action: () => this.exportAsMarkdown(questions) },
            { label: "Download as .txt", action: () => this.downloadAsFile(questions, "txt") },
            { label: "Download as .md", action: () => this.downloadAsFile(questions, "md") },
        ];

        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.className = "toc-export-option";
            btn.textContent = opt.label;
            btn.addEventListener("click", () => {
                opt.action();
                menu.remove();
            });
            menu.appendChild(btn);
        });

        container.appendChild(menu);

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener("click", function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener("click", closeMenu);
                }
            });
        }, 10);
    }

    exportAsText(questions) {
        const showAnswers = this.themeManager.settings.showAnswers;
        const text = questions.map((q, i) => {
            const qText = typeof q === "string" ? q : q.text;
            let line = `${i + 1}. Q: ${qText}`;
            if (showAnswers && q.answer) {
                line += `\n   A: ${q.answer}`;
            }
            return line;
        }).join("\n\n");
        this.copyToClipboard(text, "Copied as text!");
    }

    exportAsMarkdown(questions) {
        const siteName = this.config.name;
        const date = new Date().toLocaleDateString();
        const showAnswers = this.themeManager.settings.showAnswers;
        let md = `# ${siteName} Conversation Summary\n`;
        md += `_Exported on ${date}_\n\n`;
        md += `## ${showAnswers ? 'Conversation' : 'Queries'} (${questions.length})\n\n`;
        questions.forEach((q, i) => {
            const qText = typeof q === "string" ? q : q.text;
            md += `${i + 1}. **Q:** ${qText}\n`;
            if (showAnswers && q.answer) {
                md += `   > **A:** ${q.answer}\n`;
            }
            md += `\n`;
        });
        this.copyToClipboard(md, "Copied as Markdown!");
    }

    downloadAsFile(questions, format) {
        const siteName = this.config.name;
        const date = new Date().toISOString().split("T")[0];
        const showAnswers = this.themeManager.settings.showAnswers;
        let content, filename, mimeType;

        if (format === "md") {
            content = `# ${siteName} Conversation Summary\n`;
            content += `_Exported on ${date}_\n\n`;
            content += `## ${showAnswers ? 'Conversation' : 'Queries'} (${questions.length})\n\n`;
            questions.forEach((q, i) => {
                const qText = typeof q === "string" ? q : q.text;
                content += `${i + 1}. **Q:** ${qText}\n`;
                if (showAnswers && q.answer) {
                    content += `   > **A:** ${q.answer}\n`;
                }
                content += `\n`;
            });
            filename = `${siteName.toLowerCase()}-${showAnswers ? 'conversation' : 'queries'}-${date}.md`;
            mimeType = "text/markdown";
        } else {
            content = questions.map((q, i) => {
                const qText = typeof q === "string" ? q : q.text;
                let line = `${i + 1}. Q: ${qText}`;
                if (showAnswers && q.answer) {
                    line += `\n   A: ${q.answer}`;
                }
                return line;
            }).join("\n\n");
            filename = `${siteName.toLowerCase()}-${showAnswers ? 'conversation' : 'queries'}-${date}.txt`;
            mimeType = "text/plain";
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast(`Downloaded ${filename}`);
    }

    copyToClipboard(text, message) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast(message);
        }).catch(() => {
            // Fallback
            const textarea = document.createElement("textarea");
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            this.showToast(message);
        });
    }

    showToast(message) {
        const existing = document.querySelector(".toc-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.className = "toc-toast";
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    populateTOCList(tocList, questions) {
        const CONSTANTS = window.TOC.CONSTANTS;
        const showAnswers = this.themeManager.settings.showAnswers;
        const listItems = [];

        questions.forEach((item, index) => {
            const questionText = typeof item === "string" ? item : item.text;
            const element = typeof item === "string" ? null : item.element;
            const answerText = (typeof item !== "string" && item.answer) ? item.answer : "";
            const answerElement = (typeof item !== "string" && item.answerElement) ? item.answerElement : null;

            const questionId = `toc-question-${index}`;
            const answerId = `toc-answer-${index}`;

            if (element) {
                element.id = questionId;
            }

            if (answerElement) {
                answerElement.id = answerId;
            }

            const listItem = document.createElement("li");
            listItem.setAttribute("data-toc-num", index + 1);
            if (questionText.startsWith("[Attachment")) {
                listItem.classList.add("toc-attachment-item");
            }
            if (answerText) {
                listItem.setAttribute("data-answer", answerText);
            }

            const link = document.createElement("a");
            link.href = `#${questionId}`;
            link.setAttribute("data-num", index + 1);
            link.title = questionText;

            const qSpan = document.createElement("span");
            qSpan.className = "toc-question-text";
            qSpan.textContent = questionText;
            link.appendChild(qSpan);

            const questionRow = document.createElement("div");
            questionRow.className = "toc-question-row";
            questionRow.appendChild(link);

            // Copy button (stores text in data attribute for delegation)
            const copyBtn = document.createElement("button");
            copyBtn.className = "toc-copy-btn";
            copyBtn.title = "Copy query";
            copyBtn.setAttribute("data-text", questionText);
            
            questionRow.appendChild(copyBtn);
            listItem.appendChild(questionRow);

            if (showAnswers && answerText) {
                const answerRow = document.createElement("div");
                answerRow.className = "toc-answer-row";

                const answerContent = document.createElement("div");
                answerContent.className = "toc-answer-content";

                const badge = document.createElement("div");
                badge.className = "toc-answer-badge";

                const answerSpan = document.createElement("span");
                answerSpan.className = "toc-answer-text";
                answerSpan.textContent = answerText;
                answerSpan.title = answerText.substring(0, 500);

                answerContent.appendChild(badge);
                answerContent.appendChild(answerSpan);
                answerContent.setAttribute("data-nav-id", answerElement ? answerId : questionId);

                // Answer copy button (stores text in data attribute for delegation)
                const answerCopyBtn = document.createElement("button");
                answerCopyBtn.className = "toc-answer-copy";
                answerCopyBtn.title = "Copy answer";
                answerCopyBtn.setAttribute("data-text", answerText);

                answerRow.appendChild(answerContent);
                answerRow.appendChild(answerCopyBtn);
                listItem.appendChild(answerRow);
            }
            tocList.appendChild(listItem);
            listItems.push(listItem);
        });

        return listItems;
    }

    setupTOCFunctionality(tocContainer) {
        this.setupSearchFunctionality(tocContainer);
        this.setupDragFunctionality(tocContainer);
        this.setupResizeFunctionality(tocContainer);
        this.restoreCollapsedState(tocContainer);

        const tocList = tocContainer.querySelector("ul");
        if (tocList) {
            this.setupCompactPreview(tocContainer, tocList);
        }
    }



    setupCompactPreview(tocContainer, tocList) {
        let popover = document.getElementById("toc-compact-popover");
        if (popover) popover.remove();
        popover = document.createElement("div");
        popover.id = "toc-compact-popover";
        document.body.appendChild(popover);

        let hoverTimeout = null;
        let hideTimeout = null;
        let activeBadge = null;

        const showPopover = (badge) => {
            if (!badge || !tocContainer.classList.contains("compact-mode")) return;
            
            // Cancel any pending hide
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }

            const num = badge.getAttribute("data-toc-num");
            const link = badge.querySelector("a");
            const questionText = link ? link.title : "";
            const answerText = badge.getAttribute("data-answer");
            const showAnswers = this.themeManager.settings.showAnswers;

            // Apply theme (accent colors and light/dark mode) matching the active platform settings
            this.themeManager.applyTheme(popover, this.config.platformKey);

            // Clean content creation
            popover.innerHTML = "";

            // Header Row: Badge & Copy buttons
            const header = document.createElement("div");
            header.className = "toc-popover-header";

            const badgeSpan = document.createElement("span");
            badgeSpan.className = "toc-popover-badge";
            badgeSpan.textContent = `#${num}`;
            header.appendChild(badgeSpan);

            // Copy Row
            const copyRow = document.createElement("div");
            copyRow.className = "toc-popover-copy-row";

            // Copy Query Button
            const copyQBtn = document.createElement("button");
            copyQBtn.title = "Copy query";
            copyQBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            copyQBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.copyToClipboard(questionText, "Query copied!");
            });
            copyRow.appendChild(copyQBtn);

            // Copy Answer Button (only if answer exists)
            if (showAnswers && answerText) {
                const copyABtn = document.createElement("button");
                copyABtn.title = "Copy answer";
                copyABtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
                copyABtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.copyToClipboard(answerText, "Answer copied!");
                });
                copyRow.appendChild(copyABtn);
            }
            header.appendChild(copyRow);
            popover.appendChild(header);

            // Question Text
            const questionP = document.createElement("p");
            questionP.className = "toc-popover-question";
            questionP.textContent = questionText;
            popover.appendChild(questionP);

            // Answer section (if answer exists & showAnswers is active)
            if (showAnswers && answerText) {
                const divider = document.createElement("div");
                divider.className = "toc-popover-divider";
                popover.appendChild(divider);

                const answerSection = document.createElement("div");
                answerSection.className = "toc-popover-answer-section";

                const answerTitle = document.createElement("div");
                answerTitle.className = "toc-popover-answer-title";
                answerTitle.textContent = "AI Answer";
                answerSection.appendChild(answerTitle);

                const answerBody = document.createElement("p");
                answerBody.className = "toc-popover-answer-body";
                answerBody.textContent = answerText;
                answerSection.appendChild(answerBody);

                popover.appendChild(answerSection);
            }

            // Position popover relative to badge target
            const badgeRect = badge.getBoundingClientRect();
            
            // Show popover while hidden to measure its dimensions without flashing at (0,0)
            popover.style.visibility = "hidden";
            popover.style.display = "block";
            const popoverRect = popover.getBoundingClientRect();

            // Calculate horizontal position: centered with badge
            let left = badgeRect.left + (badgeRect.width / 2) - (popoverRect.width / 2);
            // Clamp to screen bounds
            left = Math.max(10, Math.min(left, window.innerWidth - popoverRect.width - 10));

            // Calculate vertical position: default below badge, but flip above if too close to bottom
            let top = badgeRect.bottom + 8;
            if (top + popoverRect.height > window.innerHeight - 10 && badgeRect.top - popoverRect.height - 8 > 10) {
                top = badgeRect.top - popoverRect.height - 8;
            }

            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
            popover.style.display = "";
            popover.style.visibility = "";
            popover.classList.add("show");
            activeBadge = badge;
        };

        const hidePopover = () => {
            if (hideTimeout) return;
            hideTimeout = setTimeout(() => {
                popover.classList.remove("show");
                activeBadge = null;
            }, 100);
        };

        // Event delegation for badges
        tocList.addEventListener("mouseover", (e) => {
            const badge = e.target.closest("li");
            if (!badge) return;

            if (hoverTimeout) clearTimeout(hoverTimeout);
            
            if (activeBadge === badge) {
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
                return;
            }

            hoverTimeout = setTimeout(() => {
                showPopover(badge);
            }, 100);
        });

        tocList.addEventListener("mouseout", (e) => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            hidePopover();
        });

        // Let cursor hover inside the popover without hiding it
        popover.addEventListener("mouseover", () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
        });

        popover.addEventListener("mouseout", (e) => {
            // Check if cursor moved to a child element inside popover
            if (popover.contains(e.relatedTarget)) return;
            hidePopover();
        });
    }

    restoreCollapsedState(tocContainer) {
        const isCollapsed = this.positionManager.getCollapsedState();
        if (isCollapsed) {
            tocContainer.classList.add(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
        }
    }

    setupSearchFunctionality(tocContainer) {
        const CONSTANTS = window.TOC.CONSTANTS;
        const searchInput = tocContainer.querySelector(`#${CONSTANTS.IDS.SEARCH_INPUT}`);
        const searchClear = tocContainer.querySelector(`#${CONSTANTS.IDS.SEARCH_CLEAR}`);
        const listItems = Array.from(tocContainer.querySelectorAll("li"));

        this.searchManager = new window.TOC.SearchManager(searchInput, searchClear);
        this.searchManager.addListItems(listItems);
    }

    setupDragFunctionality(tocContainer) {
        this.dragManager = new window.TOC.DragManager(tocContainer, this.positionManager);
    }

    setupResizeFunctionality(tocContainer) {
        this.resizeManager = new window.TOC.ResizeManager(tocContainer, this.positionManager);
    }

    applyInitialPosition(tocContainer) {
        const savedSize = this.positionManager.getSavedSize();
        const savedPosition = this.positionManager.getSavedPosition();
        const isCollapsed = this.positionManager.getCollapsedState();

        const width = savedSize ? savedSize.width : 300;
        const height = savedSize ? savedSize.height : 400;

        // Apply transition none to prevent any initial layout sliding animations
        tocContainer.style.setProperty("transition", "none", "important");

        if (savedSize && !isCollapsed) {
            this.positionManager.applySize(tocContainer, width, height);
            const list = tocContainer.querySelector("ul");
            if (list) list.style.maxHeight = "none";
        }

        let x, y;
        if (savedPosition) {
            const constrained = this.positionManager.constrainToViewport(
                savedPosition.x,
                savedPosition.y,
                width,
                height
            );
            x = constrained.x;
            y = constrained.y;
        } else {
            x = window.innerWidth - width - 40;
            y = 60;
        }

        this.positionManager.applyPosition(tocContainer, x, y);
        this.positionManager.savePosition(x, y);

        // Keep transition none for one render tick, then restore natural transitions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                tocContainer.style.removeProperty("transition");
            });
        });
    }

    handleWindowResize() {
        const tocContainer = document.getElementById(window.TOC.CONSTANTS.IDS.TOC_CONTAINER);
        if (!tocContainer) return;

        const rect = tocContainer.getBoundingClientRect();
        const constrained = this.positionManager.constrainToViewport(
            rect.left,
            rect.top,
            tocContainer.offsetWidth,
            tocContainer.offsetHeight
        );

        if (constrained.x !== rect.left || constrained.y !== rect.top) {
            this.positionManager.applyPosition(tocContainer, constrained.x, constrained.y);
            this.positionManager.savePosition(constrained.x, constrained.y);
        }
    }

    handleDocumentClick(event) {
        const sendButton = this.config.selectors.sendButton;
        if (sendButton && event.target.closest(sendButton)) {
            this.debouncedCreateTOC();
        }
    }

    handleKeyDown(event) {
        const promptInput = this.config.selectors.promptInput;
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            promptInput &&
            document.activeElement.matches(promptInput)
        ) {
            this.debouncedCreateTOC();
        }
    }
};

console.log("[TOC] UI module loaded");
