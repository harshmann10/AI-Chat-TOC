/**
 * Unified TOC Extension - Main Entry Point
 * Contains all site-specific configurations and the router.
 * 
 * Performance Optimizations Applied:
 * - Throttled MutationObserver callbacks (500ms)
 * - Increased periodic check interval to 5 seconds
 * - Visibility API to pause when tab is hidden
 * - Reduced console logging
 */

// =============================================================================
// Performance Utilities
// =============================================================================

const TOC_PERF = {
    // Throttle function - limits how often a function can be called
    throttle: function (func, limit) {
        let inThrottle = false;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Check if tab is visible
    isTabVisible: function () {
        return !document.hidden;
    },

    // Debounce for URL changes
    urlChangeDebounce: null
};

// =============================================================================
// Site Configurations
// =============================================================================

const SITES = {
    // =========================================================================
    // ChatGPT Configuration
    // =========================================================================
    chatgpt: {
        name: "ChatGPT",
        host: "chatgpt.com",
        themeClass: "theme-chatgpt",
        storageKey: "chatgpt-toc-position",
        selectors: {
            userMessage: 'div[data-message-author-role="user"]',
            sendButton: '[data-testid="send-button"]',
            promptInput: "#prompt-textarea",
        },
        delays: {
            pageLoad: 2000,
            promptSubmission: 500,
            chatChange: 1500,
            stateCheck: 5000, // Increased from 2000 to 5000
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            const queryElements = document.querySelectorAll(this.selectors.userMessage);
            const queries = [];
            queryElements.forEach((el) => {
                const text = el.textContent.trim();
                if (text) queries.push({ text, element: el });
            });
            return queries;
        },

        setupMonitor: function (onUpdate) {
            const self = this;
            self.lastUrl = location.href;
            self.lastQueryCount = 0;

            // Throttled URL check (runs at most once per 500ms)
            const throttledUrlCheck = TOC_PERF.throttle(() => {
                if (!TOC_PERF.isTabVisible()) return; // Skip if tab hidden

                const currentUrl = location.href;
                if (currentUrl !== self.lastUrl) {
                    self.lastUrl = currentUrl;
                    self.lastQueryCount = 0;
                    setTimeout(onUpdate, self.delays.chatChange);
                }
            }, 500);

            new MutationObserver(throttledUrlCheck).observe(document, { subtree: true, childList: true });

            window.addEventListener("popstate", () => {
                self.lastQueryCount = 0;
                setTimeout(onUpdate, self.delays.chatChange);
            });

            // Periodic check with visibility check
            setInterval(() => {
                if (!TOC_PERF.isTabVisible()) return; // Skip if tab hidden

                const tocExists = document.getElementById("toc-extension");
                const currentQueries = self.getQueries().length;

                if (!tocExists && currentQueries > 0) {
                    onUpdate();
                }

                if (tocExists && currentQueries !== self.lastQueryCount && currentQueries > 0) {
                    self.lastQueryCount = currentQueries;
                    onUpdate();
                }
            }, self.delays.stateCheck);
        },
    },

    // =========================================================================
    // Gemini Configuration
    // =========================================================================
    gemini: {
        name: "Gemini",
        host: "gemini.google.com",
        themeClass: "theme-gemini",
        storageKey: "gemini-toc-position",
        selectors: {
            userMessage: ".query-text-line, .user-message, .query",
            sendButton: '[data-testid="submit-button"], button[type="submit"]',
            promptInput: "textarea, #ask-input",
            chatContainer: "main, [role='main']",
        },
        delays: {
            pageLoad: 1500,
            promptSubmission: 500,
            chatChange: 1500,
            stateCheck: 5000, // Increased from 1500 to 5000
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            const containerSelector = ".user-message, .query";
            const containers = Array.from(document.querySelectorAll(containerSelector));
            const groups = [];

            if (containers.length) {
                containers.forEach((container) => {
                    const lineNodes = Array.from(container.querySelectorAll(".query-text-line"));
                    let text;
                    if (lineNodes.length) {
                        text = lineNodes.map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
                    } else {
                        text = container.textContent.replace(/\s+/g, " ").trim();
                    }
                    if (text) groups.push({ text, element: container });
                });
            } else {
                const nodes = Array.from(document.querySelectorAll(this.selectors.userMessage));
                for (let i = 0; i < nodes.length; i++) {
                    const el = nodes[i];
                    const isLine = el.classList && el.classList.contains("query-text-line");

                    if (isLine) {
                        const prev = el.previousElementSibling;
                        if (prev && prev.parentElement === el.parentElement && prev.classList.contains("query-text-line")) {
                            continue;
                        }
                        const parts = [el.textContent];
                        let j = i + 1;
                        while (j < nodes.length && nodes[j].classList && nodes[j].classList.contains("query-text-line") && nodes[j].parentElement === el.parentElement) {
                            parts.push(nodes[j].textContent);
                            j++;
                        }
                        i = j - 1;
                        const text = parts.join(" ").replace(/\s+/g, " ").trim();
                        if (text) groups.push({ text, element: el });
                    } else {
                        const text = el.textContent.replace(/\s+/g, " ").trim();
                        if (text) groups.push({ text, element: el });
                    }
                }
            }

            const seen = new Set();
            return groups.filter((g) => {
                const lower = g.text.toLowerCase();
                if (lower.startsWith("hello,")) return false;
                if (seen.has(lower)) return false;
                seen.add(lower);
                return true;
            });
        },

        setupMonitor: function (onUpdate) {
            const self = this;
            self.lastUrl = location.href;
            self.lastQueryCount = 0;

            // Throttled URL check
            const throttledUrlCheck = TOC_PERF.throttle(() => {
                if (!TOC_PERF.isTabVisible()) return;

                const currentUrl = location.href;
                if (currentUrl !== self.lastUrl) {
                    self.lastUrl = currentUrl;
                    self.lastQueryCount = 0;
                    setTimeout(onUpdate, self.delays.chatChange);
                }
            }, 500);

            new MutationObserver(throttledUrlCheck).observe(document, { subtree: true, childList: true });

            // Periodic check with visibility check
            setInterval(() => {
                if (!TOC_PERF.isTabVisible()) return;

                const tocExists = document.getElementById("toc-extension");
                const currentQueries = self.getQueries().length;

                if (!tocExists && currentQueries > 0) {
                    self.lastQueryCount = currentQueries;
                    onUpdate();
                    return;
                }

                if (currentQueries !== self.lastQueryCount) {
                    self.lastQueryCount = currentQueries;
                    if (currentQueries > 0) {
                        onUpdate();
                    } else {
                        const toc = document.getElementById("toc-extension");
                        if (toc) toc.remove();
                    }
                }
            }, self.delays.stateCheck);
        },
    },

    // =========================================================================
    // Perplexity Configuration
    // =========================================================================
    perplexity: {
        name: "Perplexity",
        host: "perplexity.ai",
        themeClass: "theme-perplexity",
        storageKey: "perplexity-toc-position",
        selectors: {
            userMessage: "h1.group\\/query, div.group\\/query, .flex.flex-col.gap-1.pb-2",
            sendButton: '[data-testid="submit-button"]',
            promptInput: "#ask-input",
        },
        delays: {
            pageLoad: 2000,
            promptSubmission: 200,
            chatChange: 1500,
            stateCheck: 5000, // Increased from 2000 to 5000
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            let queryElements = document.querySelectorAll("h1.group\\/query, div.group\\/query, .flex.flex-col.gap-1.pb-2");
            let queries = Array.from(queryElements)
                .map((el) => ({ text: el.textContent.trim(), element: el }))
                .filter((q) => q.text);

            if (queries.length === 0) {
                queryElements = document.querySelectorAll('[class*="pb-2"] .font-sans.text-textMain');
                queries = Array.from(queryElements)
                    .map((el) => ({ text: el.textContent.trim(), element: el }))
                    .filter((q) => q.text);
            }

            return queries;
        },

        setupMonitor: function (onUpdate) {
            const self = this;
            self.lastUrl = location.href;
            self.lastQueryCount = 0;

            // Throttled URL check
            const throttledUrlCheck = TOC_PERF.throttle(() => {
                if (!TOC_PERF.isTabVisible()) return;

                const currentUrl = location.href;
                if (currentUrl !== self.lastUrl) {
                    self.lastUrl = currentUrl;
                    self.lastQueryCount = 0;
                    setTimeout(onUpdate, self.delays.chatChange);
                }
            }, 500);

            new MutationObserver(throttledUrlCheck).observe(document, { subtree: true, childList: true });

            setInterval(() => {
                if (!TOC_PERF.isTabVisible()) return;

                const tocExists = document.getElementById("toc-extension");
                const currentQueries = self.getQueries().length;

                if (!tocExists && currentQueries > 1) {
                    onUpdate();
                }

                if (currentQueries !== self.lastQueryCount && currentQueries > 1) {
                    self.lastQueryCount = currentQueries;
                    onUpdate();
                }
            }, self.delays.stateCheck);
        },
    },

    // =========================================================================
    // Claude Configuration
    // =========================================================================
    claude: {
        name: "Claude",
        host: "claude.ai",
        themeClass: "theme-claude",
        storageKey: "claude-toc-position",
        selectors: {
            userMessage: '[data-testid="user-message"], .human-message, [class*="human"]',
            sendButton: '[data-testid="send-button"], button[type="submit"]',
            promptInput: '[contenteditable="true"], textarea',
        },
        delays: {
            pageLoad: 2000,
            promptSubmission: 500,
            chatChange: 1500,
            stateCheck: 5000, // Increased from 2000 to 5000
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            const selectors = [
                '[data-testid="user-message"]',
                '.human-message',
                '[class*="human"] [class*="message"]',
                '.prose[class*="human"]'
            ];

            let queries = [];

            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    queries = Array.from(elements)
                        .map((el) => ({ text: el.textContent.trim(), element: el }))
                        .filter((q) => q.text && q.text.length > 0);
                    if (queries.length > 0) break;
                }
            }

            const seen = new Set();
            return queries.filter((q) => {
                const key = q.text.substring(0, 100);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        },

        setupMonitor: function (onUpdate) {
            const self = this;
            self.lastUrl = location.href;
            self.lastQueryCount = 0;

            // Throttled URL check
            const throttledUrlCheck = TOC_PERF.throttle(() => {
                if (!TOC_PERF.isTabVisible()) return;

                const currentUrl = location.href;
                if (currentUrl !== self.lastUrl) {
                    self.lastUrl = currentUrl;
                    self.lastQueryCount = 0;
                    setTimeout(onUpdate, self.delays.chatChange);
                }
            }, 500);

            new MutationObserver(throttledUrlCheck).observe(document, { subtree: true, childList: true });

            setInterval(() => {
                if (!TOC_PERF.isTabVisible()) return;

                const tocExists = document.getElementById("toc-extension");
                const currentQueries = self.getQueries().length;

                if (!tocExists && currentQueries > 0) {
                    self.lastQueryCount = currentQueries;
                    onUpdate();
                    return;
                }

                if (currentQueries !== self.lastQueryCount && currentQueries > 0) {
                    self.lastQueryCount = currentQueries;
                    onUpdate();
                }
            }, self.delays.stateCheck);
        },
    },
};

// =============================================================================
// Router - Detect current site and initialize
// =============================================================================

(function () {
    let activeAdapter = null;

    for (const key in SITES) {
        if (location.host.includes(SITES[key].host)) {
            activeAdapter = SITES[key];
            break;
        }
    }

    if (activeAdapter) {
        new window.TOC.UI(activeAdapter);
    }
})();
