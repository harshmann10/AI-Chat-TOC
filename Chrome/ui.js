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
        COLLAPSED: "collapsed",
    },
    CONSTRAINTS: {
        PADDING: 10,
        MAX_QUERY_LENGTH: 70,
        TRUNCATE_SUFFIX: "...",
        COLLAPSE_BREAKPOINT: 1024,
    },
};

// =============================================================================
// PositionManager - Handles saving and loading TOC position
// =============================================================================

window.TOC.PositionManager = class PositionManager {
    constructor(storageKey) {
        this.storageKey = storageKey;
        this.collapsedKey = storageKey + "-collapsed";
    }

    savePosition(x, y) {
        localStorage.setItem(this.storageKey, JSON.stringify({ x, y }));
    }

    getSavedPosition() {
        const saved = localStorage.getItem(this.storageKey);
        return saved ? JSON.parse(saved) : null;
    }

    saveCollapsedState(isCollapsed) {
        localStorage.setItem(this.collapsedKey, JSON.stringify(isCollapsed));
    }

    getCollapsedState() {
        const saved = localStorage.getItem(this.collapsedKey);
        return saved ? JSON.parse(saved) : false;
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
        this.boundTouchDrag = this.touchDrag.bind(this);
        this.boundTouchEnd = this.touchEnd.bind(this);

        this.init();
    }

    init() {
        const header = this.element.querySelector(`.${window.TOC.CONSTANTS.CLASSES.TOC_HEADER}`);
        if (!header) return;

        header.style.cursor = "move";
        header.style.userSelect = "none";
        header.style.touchAction = "none"; // Prevent default touch scrolling

        // Mouse events
        header.addEventListener("mousedown", this.startDrag.bind(this));

        // Touch events
        header.addEventListener("touchstart", this.touchStart.bind(this), { passive: false });
    }

    // Get coordinates from mouse or touch event
    getEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // =========== MOUSE EVENTS ===========
    startDrag(e) {
        const isToggleBtn = e.target.closest(`#${window.TOC.CONSTANTS.IDS.TOC_TOGGLE_BTN}`);
        const isCollapsed = this.element.classList.contains(window.TOC.CONSTANTS.CLASSES.COLLAPSED);

        if (isToggleBtn) {
            if (!isCollapsed) {
                e.preventDefault();
                e.stopPropagation();
                this.toggleCollapse(false);
                return;
            }
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

        document.addEventListener("mousemove", this.boundDrag);
        document.addEventListener("mouseup", this.boundStopDrag);
        document.body.style.userSelect = "none";
    }

    drag(e) {
        if (!this.isDragging) return;

        e.preventDefault();
        e.stopPropagation();

        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;

        if (!this.hasMoved && Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) return;
        this.hasMoved = true;

        let newX = this.startElementX + deltaX;
        let newY = this.startElementY + deltaY;

        const constrained = this.positionManager.constrainToViewport(
            newX,
            newY,
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
        document.removeEventListener("mousemove", this.boundDrag);
        document.removeEventListener("mouseup", this.boundStopDrag);
        document.body.style.userSelect = "";
    }

    // =========== TOUCH EVENTS ===========
    touchStart(e) {
        const isToggleBtn = e.target.closest(`#${window.TOC.CONSTANTS.IDS.TOC_TOGGLE_BTN}`);
        const isExportBtn = e.target.closest("#toc-export-btn");
        const isCollapsed = this.element.classList.contains(window.TOC.CONSTANTS.CLASSES.COLLAPSED);

        // Let export button work normally
        if (isExportBtn) return;

        if (isToggleBtn) {
            if (!isCollapsed) {
                e.preventDefault();
                this.toggleCollapse(false);
                return;
            }
        }

        if (e.touches.length !== 1) return;

        e.preventDefault();

        this.isDragging = true;
        this.hasMoved = false;
        this.isClickOnToggle = !!isToggleBtn;

        const touch = e.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;

        const rect = this.element.getBoundingClientRect();
        this.startElementX = rect.left;
        this.startElementY = rect.top;

        this.positionManager.applyPosition(this.element, this.startElementX, this.startElementY);
        this.applyDragStyles();

        document.addEventListener("touchmove", this.boundTouchDrag, { passive: false });
        document.addEventListener("touchend", this.boundTouchEnd);
        document.addEventListener("touchcancel", this.boundTouchEnd);
    }

    touchDrag(e) {
        if (!this.isDragging || e.touches.length !== 1) return;

        e.preventDefault();

        const touch = e.touches[0];
        const deltaX = touch.clientX - this.startX;
        const deltaY = touch.clientY - this.startY;

        if (!this.hasMoved && Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
        this.hasMoved = true;

        let newX = this.startElementX + deltaX;
        let newY = this.startElementY + deltaY;

        const constrained = this.positionManager.constrainToViewport(
            newX,
            newY,
            this.element.offsetWidth,
            this.element.offsetHeight
        );

        this.positionManager.applyPosition(this.element, constrained.x, constrained.y);
    }

    touchEnd(e) {
        if (!this.isDragging) return;

        this.isDragging = false;

        const rect = this.element.getBoundingClientRect();
        this.positionManager.savePosition(rect.left, rect.top);

        if (!this.hasMoved && this.isClickOnToggle) {
            this.toggleCollapse(true);
        }

        this.removeDragStyles();
        document.removeEventListener("touchmove", this.boundTouchDrag);
        document.removeEventListener("touchend", this.boundTouchEnd);
        document.removeEventListener("touchcancel", this.boundTouchEnd);
    }

    toggleCollapse(isExpanding) {
        const rect = this.element.getBoundingClientRect();
        const currentX = rect.left;
        const currentY = rect.top;
        const collapsedSize = 48;

        if (!isExpanding) {
            const expandedWidth = rect.width;
            this.element.dataset.expandedWidth = expandedWidth;

            const newX = currentX + expandedWidth - collapsedSize;

            this.element.classList.add(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
            this.positionManager.applyPosition(this.element, newX, currentY);
            this.positionManager.savePosition(newX, currentY);
            this.positionManager.saveCollapsedState(true);
        } else {
            const expandedWidth = parseFloat(this.element.dataset.expandedWidth) || 300;

            const newX = currentX - (expandedWidth - collapsedSize);

            this.element.classList.remove(window.TOC.CONSTANTS.CLASSES.COLLAPSED);

            const constrained = this.positionManager.constrainToViewport(
                newX,
                currentY,
                expandedWidth,
                this.element.offsetHeight
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
            const shouldShow = searchTerm === "" || text.includes(searchTerm);
            item.style.display = shouldShow ? "block" : "none";
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
        this.searchManager = null;
        this.dragManager = null;
        this.createTimer = null; // Debounce timer
        this.lastCreateTime = 0; // Prevent rapid creates

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.config.setupMonitor(() => this.debouncedCreateTOC());
        this.delayedCreateTOC();
    }

    setupEventListeners() {
        window.addEventListener("load", () => this.delayedCreateTOC());
        window.addEventListener("pageshow", () => this.delayedCreateTOC());
        window.addEventListener("resize", () => this.handleWindowResize());

        document.addEventListener("click", (e) => this.handleDocumentClick(e), true);
        document.addEventListener("keydown", (e) => this.handleKeyDown(e), true);

        // Global keyboard shortcut: Ctrl+Shift+T to toggle TOC
        document.addEventListener("keydown", (e) => this.handleGlobalShortcut(e));
    }

    handleGlobalShortcut(event) {
        // Ctrl+Shift+T or Cmd+Shift+T to toggle TOC
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "t") {
            event.preventDefault();
            event.stopPropagation();
            this.toggleTOC();
        }
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

    createTOC() {
        // Prevent creating more than once per second
        const now = Date.now();
        if (now - this.lastCreateTime < 1000) {
            console.log("[TOC] Skipping - too soon since last create");
            return;
        }
        this.lastCreateTime = now;

        this.removeExistingTOC();

        const questions = this.config.getQueries();
        if (questions.length === 0) {
            console.log("[TOC] No questions found, not creating TOC");
            return;
        }

        const tocContainer = this.buildTOCStructure(questions);
        this.setupTOCFunctionality(tocContainer);
        this.applyInitialPosition(tocContainer);

        document.body.appendChild(tocContainer);
        console.log(`[TOC] Created with ${questions.length} items`);
    }

    removeExistingTOC() {
        const existingTOC = document.getElementById(window.TOC.CONSTANTS.IDS.TOC_CONTAINER);
        if (existingTOC) {
            existingTOC.remove();
        }
    }

    buildTOCStructure(questions) {
        const CONSTANTS = window.TOC.CONSTANTS;

        const tocContainer = document.createElement("div");
        tocContainer.id = CONSTANTS.IDS.TOC_CONTAINER;
        tocContainer.classList.add(this.config.themeClass);

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
            this.showExportMenu(tocContainer, questions);
        });

        const toggleBtn = document.createElement("button");
        toggleBtn.id = CONSTANTS.IDS.TOC_TOGGLE_BTN;
        toggleBtn.title = "Toggle Table of Contents";

        headerButtons.appendChild(exportBtn);
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
        searchClear.textContent = "×";

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(searchClear);

        // List
        const tocList = document.createElement("ul");

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

        return tocContainer;
    }

    showExportMenu(container, questions) {
        // Remove existing menu if any
        const existingMenu = container.querySelector(".toc-export-menu");
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

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
        const text = questions.map((q, i) => `${i + 1}. ${typeof q === "string" ? q : q.text}`).join("\n");
        this.copyToClipboard(text, "Copied as text!");
    }

    exportAsMarkdown(questions) {
        const siteName = this.config.name;
        const date = new Date().toLocaleDateString();
        let md = `# ${siteName} Conversation Summary\n`;
        md += `_Exported on ${date}_\n\n`;
        md += `## Queries (${questions.length})\n\n`;
        questions.forEach((q, i) => {
            md += `${i + 1}. ${typeof q === "string" ? q : q.text}\n`;
        });
        this.copyToClipboard(md, "Copied as Markdown!");
    }

    downloadAsFile(questions, format) {
        const siteName = this.config.name;
        const date = new Date().toISOString().split("T")[0];
        let content, filename, mimeType;

        if (format === "md") {
            content = `# ${siteName} Conversation Summary\n`;
            content += `_Exported on ${date}_\n\n`;
            content += `## Queries (${questions.length})\n\n`;
            questions.forEach((q, i) => {
                content += `${i + 1}. ${typeof q === "string" ? q : q.text}\n`;
            });
            filename = `${siteName.toLowerCase()}-queries-${date}.md`;
            mimeType = "text/markdown";
        } else {
            content = questions.map((q, i) => `${i + 1}. ${typeof q === "string" ? q : q.text}`).join("\n");
            filename = `${siteName.toLowerCase()}-queries-${date}.txt`;
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
        const listItems = [];

        questions.forEach((item, index) => {
            const questionText = typeof item === "string" ? item : item.text;
            const element = typeof item === "string" ? null : item.element;

            const shortText =
                questionText.length > CONSTANTS.CONSTRAINTS.MAX_QUERY_LENGTH
                    ? questionText.substring(0, CONSTANTS.CONSTRAINTS.MAX_QUERY_LENGTH - 3) +
                    CONSTANTS.CONSTRAINTS.TRUNCATE_SUFFIX
                    : questionText;

            const questionId = `toc-question-${index}`;

            if (element) {
                element.id = questionId;
            }

            const listItem = document.createElement("li");
            listItem.setAttribute("data-toc-num", index + 1);

            const link = document.createElement("a");
            link.href = `#${questionId}`;
            link.setAttribute("data-num", index + 1);
            link.textContent = shortText;
            link.title = questionText;

            // Click - scroll to query
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const targetElement = document.getElementById(questionId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });

            // Copy button
            const copyBtn = document.createElement("button");
            copyBtn.className = "toc-copy-btn";
            copyBtn.title = "Copy query";
            copyBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.copyToClipboard(questionText, "Copied!");
            });

            listItem.appendChild(link);
            listItem.appendChild(copyBtn);
            tocList.appendChild(listItem);
            listItems.push(listItem);
        });

        return listItems;
    }

    setupTOCFunctionality(tocContainer) {
        this.setupSearchFunctionality(tocContainer);
        this.setupDragFunctionality(tocContainer);
        this.restoreCollapsedState(tocContainer);
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

        if (this.searchManager) {
            this.searchManager.reset();
        }

        this.searchManager = new window.TOC.SearchManager(searchInput, searchClear);
        this.searchManager.addListItems(listItems);
    }

    setupDragFunctionality(tocContainer) {
        this.dragManager = new window.TOC.DragManager(tocContainer, this.positionManager);
    }

    setupResponsiveCollapse(tocContainer) {
        if (window.innerWidth <= window.TOC.CONSTANTS.CONSTRAINTS.COLLAPSE_BREAKPOINT) {
            tocContainer.classList.add(window.TOC.CONSTANTS.CLASSES.COLLAPSED);
        }
    }

    applyInitialPosition(tocContainer) {
        // Need to wait a frame for the element to have dimensions
        requestAnimationFrame(() => {
            const savedPosition = this.positionManager.getSavedPosition();
            const width = tocContainer.offsetWidth || 300;
            const height = tocContainer.offsetHeight || 400;

            let x, y;

            if (savedPosition) {
                // Use saved position but constrain to viewport
                const constrained = this.positionManager.constrainToViewport(
                    savedPosition.x,
                    savedPosition.y,
                    width,
                    height
                );
                x = constrained.x;
                y = constrained.y;
            } else {
                // Default position: top-right corner with padding
                x = window.innerWidth - width - 40;
                y = 60;
            }

            this.positionManager.applyPosition(tocContainer, x, y);
            this.positionManager.savePosition(x, y);
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
            setTimeout(() => this.createTOC(), this.config.delays.promptSubmission);
        }
    }

    handleKeyDown(event) {
        const promptInput = this.config.selectors.promptInput;
        if (
            event.key === "Enter" &&
            promptInput &&
            document.activeElement.matches(promptInput)
        ) {
            setTimeout(() => this.createTOC(), this.config.delays.promptSubmission);
        }
    }
};

console.log("[TOC] UI module loaded");
