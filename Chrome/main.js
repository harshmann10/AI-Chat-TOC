/**
 * AI Chat TOC - Main Entry Point
 * Site-specific configurations and router.
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

    /**
     * Shared monitor factory - eliminates per-site duplication.
     * @param {object} siteConfig - The SITES entry (has .getQueries, .delays, .lastQueryCount, .lastUrl)
     * @param {function} onUpdate - Callback to trigger a TOC rebuild.
     * @param {object} [opts]
     * @param {number}   [opts.minQueries=1]    - Minimum query count required to trigger updates.
     * @param {boolean}  [opts.listenPopstate]  - Also fire onUpdate on browser back/forward.
     * @param {function} [opts.extraGuard]       - Optional function returning false to skip the periodic tick.
     */
    createSharedMonitor: function (siteConfig, onUpdate, opts) {
        const o = opts || {};
        const minQ = (o.minQueries !== undefined) ? o.minQueries : 1;
        siteConfig.lastUrl = location.href;
        siteConfig.lastQueryCount = 0;

        // Throttled URL-change detection via MutationObserver
        const throttledUrlCheck = TOC_PERF.throttle(() => {
            if (!TOC_PERF.isTabVisible()) return;
            const currentUrl = location.href;
            if (currentUrl !== siteConfig.lastUrl) {
                siteConfig.lastUrl = currentUrl;
                siteConfig.lastQueryCount = 0;
                setTimeout(onUpdate, siteConfig.delays.chatChange);
            }
        }, 500);

        new MutationObserver(throttledUrlCheck).observe(document, { subtree: true, childList: true });

        // Optional: detect browser history navigation
        if (o.listenPopstate) {
            window.addEventListener("popstate", () => {
                siteConfig.lastQueryCount = 0;
                setTimeout(onUpdate, siteConfig.delays.chatChange);
            });
        }

        // Periodic safety-net check
        setInterval(() => {
            if (!TOC_PERF.isTabVisible()) return;
            if (o.extraGuard && !o.extraGuard()) return;

            const tocExists = document.getElementById("toc-extension");
            const currentQueries = siteConfig.getQueries().length;

            if (!tocExists && currentQueries >= minQ) {
                siteConfig.lastQueryCount = currentQueries;
                onUpdate();
                return;
            }

            if (currentQueries !== siteConfig.lastQueryCount) {
                siteConfig.lastQueryCount = currentQueries;
                if (currentQueries >= minQ) {
                    onUpdate();
                } else {
                    const toc = document.getElementById("toc-extension");
                    if (toc) toc.remove();
                }
            }
        }, siteConfig.delays.stateCheck);
    },
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
        platformKey: "chatgpt",
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
            stateCheck: 5000,
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            const queryElements = document.querySelectorAll(this.selectors.userMessage);
            const queries = [];
            queryElements.forEach((el) => {
                const text = el.textContent.trim();
                if (!text) return;

                // Extract AI answer: walk up to the turn container, then find the assistant message
                let answer = "";
                try {
                    // ChatGPT groups messages in turn containers
                    const turnContainer = el.closest('[data-testid^="conversation-turn"]') || el.closest('article') || el.parentElement;
                    if (turnContainer) {
                        let nextTurn = turnContainer.nextElementSibling;
                        while (nextTurn) {
                            const assistantMsg = nextTurn.querySelector('[data-message-author-role="assistant"]');
                            if (assistantMsg) {
                                answer = assistantMsg.textContent.trim();
                                break;
                            }
                            // If we hit another user message, stop
                            if (nextTurn.querySelector('[data-message-author-role="user"]')) break;
                            nextTurn = nextTurn.nextElementSibling;
                        }
                    }
                } catch (e) { /* silently ignore */ }

                queries.push({ text, element: el, answer });
            });
            return queries;
        },

        setupMonitor: function (onUpdate) {
            TOC_PERF.createSharedMonitor(this, onUpdate, { listenPopstate: true });
        },
    },

    // =========================================================================
    // Gemini Configuration
    // =========================================================================
    gemini: {
        name: "Gemini",
        host: "gemini.google.com",
        platformKey: "gemini",
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
            stateCheck: 5000,
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
                    if (!text) return;

                    // Extract AI answer from the next sibling model response
                    let answer = "";
                    try {
                        const turnContainer = container.closest('.conversation-turn, [class*="turn"]') || container.parentElement;
                        if (turnContainer) {
                            let next = turnContainer.nextElementSibling;
                            while (next) {
                                const modelResp = next.querySelector('.model-response-text, .model-response, [class*="response"]');
                                if (modelResp) {
                                    answer = modelResp.textContent.trim();
                                    break;
                                }
                                if (next.querySelector('.user-message, .query')) break;
                                next = next.nextElementSibling;
                            }
                        }
                    } catch (e) { /* silently ignore */ }

                    groups.push({ text, element: container, answer });
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
                        if (text) groups.push({ text, element: el, answer: "" });
                    } else {
                        const text = el.textContent.replace(/\s+/g, " ").trim();
                        if (text) groups.push({ text, element: el, answer: "" });
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
            TOC_PERF.createSharedMonitor(this, onUpdate);
        },
    },

    // =========================================================================
    // Perplexity Configuration
    // =========================================================================
    perplexity: {
        name: "Perplexity",
        host: "perplexity.ai",
        platformKey: "perplexity",
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
            stateCheck: 5000,
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            let queryElements = document.querySelectorAll("h1.group\\/query, div.group\\/query, .flex.flex-col.gap-1.pb-2");
            let queries = Array.from(queryElements)
                .map((el) => {
                    const text = el.textContent.trim();
                    // Extract answer from the next sibling answer block
                    let answer = "";
                    try {
                        const queryBlock = el.closest('[class*="group/query"]') || el.parentElement;
                        if (queryBlock) {
                            let next = queryBlock.nextElementSibling;
                            if (next) {
                                const prose = next.querySelector('.prose, [class*="prose"]');
                                answer = prose ? prose.textContent.trim() : next.textContent.trim();
                            }
                        }
                    } catch (e) { /* silently ignore */ }
                    return { text, element: el, answer };
                })
                .filter((q) => q.text);

            if (queries.length === 0) {
                queryElements = document.querySelectorAll('[class*="pb-2"] .font-sans.text-textMain');
                queries = Array.from(queryElements)
                    .map((el) => ({ text: el.textContent.trim(), element: el, answer: "" }))
                    .filter((q) => q.text);
            }

            return queries;
        },

        setupMonitor: function (onUpdate) {
            TOC_PERF.createSharedMonitor(this, onUpdate, { minQueries: 2 });
        },
    },

    // =========================================================================
    // Claude Configuration
    // =========================================================================
    claude: {
        name: "Claude",
        host: "claude.ai",
        platformKey: "claude",
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
            stateCheck: 5000,
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
                        .map((el) => {
                            const text = el.textContent.trim();
                            // Extract AI answer: find the next assistant response block
                            let answer = "";
                            try {
                                const turnContainer = el.closest('[class*="turn"], [class*="row"]') || el.parentElement;
                                if (turnContainer) {
                                    let next = turnContainer.nextElementSibling;
                                    while (next) {
                                        const aiMsg = next.querySelector('[data-testid="ai-message"], [class*="assistant"], [class*="response"]');
                                        if (aiMsg) {
                                            answer = aiMsg.textContent.trim();
                                            break;
                                        }
                                        // Check if the sibling itself is the AI response
                                        if (next.matches && (next.matches('[class*="assistant"]') || next.matches('[class*="response"]'))) {
                                            answer = next.textContent.trim();
                                            break;
                                        }
                                        if (next.querySelector('[data-testid="user-message"], [class*="human"]')) break;
                                        next = next.nextElementSibling;
                                    }
                                }
                            } catch (e) { /* silently ignore */ }
                            return { text, element: el, answer };
                        })
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
            TOC_PERF.createSharedMonitor(this, onUpdate);
        },
    },


    // =========================================================================
    // Grok Configuration
    // =========================================================================
    grok: {
        name: "Grok",
        host: ["grok.com", "x.com"],
        platformKey: "grok",
        storageKey: "grok-toc-position",
        selectors: {
            userMessage: ".message-bubble.bg-surface-l1, .user-message, [data-testid='user-message'], [data-testid='tweetText'][dir='auto'], .message-user, [data-testid='messageEntry']",
            sendButton: "button[aria-label='Submit'], [data-testid='send-button'], [aria-label='Send Post']",
            promptInput: "div.tiptap.ProseMirror, textarea[aria-label='Ask Grok anything'], [data-testid='tweetTextarea_0'], textarea, [contenteditable='true']",
        },
        delays: {
            pageLoad: 2500,
            promptSubmission: 500,
            chatChange: 1500,
            stateCheck: 5000,
        },

        lastQueryCount: 0,
        lastUrl: "",

        getQueries: function () {
            // Only run on Grok pages if on x.com
            if (location.host.includes("x.com") && !location.pathname.includes("grok")) {
                return [];
            }

            const possibleSelectors = this.selectors.userMessage.split(",").map(s => s.trim());
            let queries = [];

            for (const selector of possibleSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    queries = Array.from(elements)
                        .map((el) => {
                            const text = el.textContent.trim();
                            // Extract AI answer: find the next non-user message sibling
                            let answer = "";
                            try {
                                const msgContainer = el.closest('[class*="message"], [class*="bubble"]') || el.parentElement;
                                if (msgContainer) {
                                    let next = msgContainer.nextElementSibling;
                                    while (next) {
                                        // Skip if it's another user message
                                        const isUser = next.classList.contains('bg-surface-l1') || next.querySelector('.bg-surface-l1');
                                        if (isUser) break;
                                        const responseText = next.textContent.trim();
                                        if (responseText) {
                                            answer = responseText;
                                            break;
                                        }
                                        next = next.nextElementSibling;
                                    }
                                }
                            } catch (e) { /* silently ignore */ }
                            return { text, element: el, answer };
                        })
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
            TOC_PERF.createSharedMonitor(this, onUpdate, {
                extraGuard: () => !(location.host.includes("x.com") && !location.pathname.includes("grok"))
            });
        },
    },
};

// =============================================================================
// Router - Detect current site and initialize
// =============================================================================

(function () {
    let activeAdapter = null;

    for (const key in SITES) {
        const site = SITES[key];
        if (Array.isArray(site.host)) {
            if (site.host.some(h => location.host.includes(h))) {
                activeAdapter = site;
                break;
            }
        } else if (location.host.includes(site.host)) {
            activeAdapter = site;
            break;
        }
    }

    if (activeAdapter) {
        new window.TOC.UI(activeAdapter);
    }
})();
