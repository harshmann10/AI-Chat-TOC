/**
 * AI Chat TOC - Main Entry Point
 * Site-specific configurations and router.
 */

// =============================================================================
// Performance Utilities
// =============================================================================

const TOC_PERF = {
    // Debounce function - waits for activity to stop before firing
    debounce: function (func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    // Check if tab is visible
    isTabVisible: function () {
        return !document.hidden;
    },

    /**
     * Fallback to find the AI answer by looking ahead in the DOM.
     * Finds the first AI element that appears after the user element,
     * ensuring it doesn't belong to the *next* user element.
     */
    findAnswerElement: function (userElement, aiElements, userElements) {
        try {
            const allAi = Array.isArray(aiElements) ? aiElements : Array.from(document.querySelectorAll(aiElements));
            const allUser = Array.isArray(userElements) ? userElements : Array.from(document.querySelectorAll(userElements));

            let nextUser = null;
            for (let i = 0; i < allUser.length; i++) {
                const u = allUser[i];
                const pos = userElement.compareDocumentPosition(u);
                if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) {
                    nextUser = u;
                    break;
                }
            }

            for (let i = 0; i < allAi.length; i++) {
                const ai = allAi[i];
                const pos = userElement.compareDocumentPosition(ai);
                if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) {
                    if (nextUser) {
                        const aiPosToNextUser = ai.compareDocumentPosition(nextUser);
                        if (aiPosToNextUser & Node.DOCUMENT_POSITION_PRECEDING) {
                            return null;
                        }
                    }
                    return ai;
                }
            }
        } catch (e) {
            console.debug(e);
        }
        return null;
    },

    /**
     * Shared monitor factory - eliminates per-site duplication.
     * @param {object} siteConfig - The SITES entry (has .getQueries, .delays, .lastQueryCount, .lastUrl)
     * @param {function} onUpdate - Callback to trigger a TOC rebuild.
     * @param {object} [opts]
     * @param {number}   [opts.minQueries=1]    - Minimum query count required to trigger updates.
     * @param {function} [opts.extraGuard]       - Optional function returning false to skip the periodic tick.
     */
    createSharedMonitor: function (siteConfig, onUpdate, opts) {
        const o = opts || {};
        const minQ = (o.minQueries !== undefined) ? o.minQueries : 1;
        siteConfig.lastUrl = location.href;
        siteConfig.lastQueryCount = 0;

        const scheduleUpdate = TOC_PERF.debounce(() => {
            if (!TOC_PERF.isTabVisible()) return;
            onUpdate();
        }, siteConfig.delays.chatChange);

        const handleUrlChange = () => {
            if (!TOC_PERF.isTabVisible()) return;

            const currentUrl = location.href;
            if (currentUrl === siteConfig.lastUrl) return;

            siteConfig.lastUrl = currentUrl;
            siteConfig.lastQueryCount = 0;
            scheduleUpdate();
        };

        if (!TOC_PERF._historyHooksInstalled) {
            TOC_PERF._historyHooksInstalled = true;

            const emitLocationChange = () => {
                window.dispatchEvent(new Event("toc-locationchange"));
            };

            const patchHistoryMethod = (methodName) => {
                const original = history[methodName];
                if (typeof original !== "function" || original.__tocPatched) return;

                const patched = function (...args) {
                    const result = original.apply(this, args);
                    emitLocationChange();
                    return result;
                };

                patched.__tocPatched = true;
                history[methodName] = patched;
            };

            patchHistoryMethod("pushState");
            patchHistoryMethod("replaceState");

            window.addEventListener("popstate", emitLocationChange);
            window.addEventListener("hashchange", emitLocationChange);
        }

        window.addEventListener("toc-locationchange", handleUrlChange);

        // Periodic safety-net check
        setInterval(() => {
            if (!TOC_PERF.isTabVisible()) return;
            if (o.extraGuard && !o.extraGuard()) return;

            const tocExists = document.getElementById("toc-extension");
            const currentQueries = siteConfig.getQueries().length;

            if (!tocExists && currentQueries >= minQ) {
                siteConfig.lastQueryCount = currentQueries;
                scheduleUpdate();
                return;
            }

            if (currentQueries !== siteConfig.lastQueryCount) {
                siteConfig.lastQueryCount = currentQueries;
                if (currentQueries >= minQ) {
                    scheduleUpdate();
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
                let answerElement = null;
                try {
                    // ChatGPT groups messages in turn containers
                    const turnContainer = el.closest('[data-testid^="conversation-turn"]') || el.closest('article') || el.parentElement;
                    if (turnContainer) {
                        let nextTurn = turnContainer.nextElementSibling;
                        while (nextTurn) {
                            const assistantMsg = nextTurn.querySelector('[data-message-author-role="assistant"]');
                            if (assistantMsg) {
                                answerElement = assistantMsg;
                                answer = assistantMsg.textContent.trim();
                                break;
                            }
                            // If we hit another user message, stop
                            if (nextTurn.querySelector('[data-message-author-role="user"]')) break;
                            nextTurn = nextTurn.nextElementSibling;
                        }
                    }
                } catch (e) { /* silently ignore */ }

                queries.push({ text, element: el, answer, answerElement });
            });
            return queries;
        },

        setupMonitor: function (onUpdate) {
            TOC_PERF.createSharedMonitor(this, onUpdate);
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
            const geminiAiSelector = '.model-response-text, .model-response, [class*="response"]';

            if (containers.length) {
                const aiElements = Array.from(document.querySelectorAll(geminiAiSelector));
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
                    let answerElement = null;
                    try {
                        const turnContainer = container.closest('.conversation-turn, [class*="turn"]') || container.parentElement;
                        if (turnContainer) {
                            let next = turnContainer.nextElementSibling;
                            while (next) {
                                const modelResp = next.querySelector('.model-response-text, .model-response, [class*="response"]');
                                if (modelResp) {
                                    answerElement = modelResp;
                                    answer = modelResp.textContent.trim();
                                    break;
                                }
                                if (next.querySelector('.user-message, .query')) break;
                                next = next.nextElementSibling;
                            }
                        }
                    } catch (e) { /* silently ignore */ }

                    if (!answerElement) {
                        answerElement = TOC_PERF.findAnswerElement(container, aiElements, containers);
                        if (answerElement) answer = answerElement.textContent.trim();
                    }

                    groups.push({ text, element: container, answer, answerElement });
                });
            } else {
                const nodes = Array.from(document.querySelectorAll(this.selectors.userMessage));
                const aiElements = Array.from(document.querySelectorAll(geminiAiSelector));
                for (let i = 0; i < nodes.length; i++) {
                    const el = nodes[i];
                    const isLine = el.classList && el.classList.contains("query-text-line");
                    let text = "";

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
                        text = parts.join(" ").replace(/\s+/g, " ").trim();
                    } else {
                        text = el.textContent.replace(/\s+/g, " ").trim();
                    }

                    if (text) {
                        let answer = "";
                        let answerElement = TOC_PERF.findAnswerElement(el, aiElements, nodes);
                        if (answerElement) answer = answerElement.textContent.trim();
                        groups.push({ text, element: el, answer, answerElement });
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
            const perplexityAiSelector = '.prose, [class*="prose"]';
            let aiElements = Array.from(document.querySelectorAll(perplexityAiSelector));

            let queries = Array.from(queryElements)
                .map((el) => {
                    const text = el.textContent.trim();
                    // Extract answer from the next sibling answer block
                    let answer = "";
                    let answerElement = null;
                    try {
                        const queryBlock = el.closest('[class*="group/query"]') || el.parentElement;
                        if (queryBlock) {
                            let next = queryBlock.nextElementSibling;
                            if (next) {
                                const prose = next.querySelector('.prose, [class*="prose"]');
                                answerElement = prose || next;
                                answer = prose ? prose.textContent.trim() : next.textContent.trim();
                            }
                        }
                    } catch (e) { /* silently ignore */ }

                    if (!answerElement) {
                        answerElement = TOC_PERF.findAnswerElement(el, aiElements, Array.from(queryElements));
                        if (answerElement) answer = answerElement.textContent.trim();
                    }

                    return { text, element: el, answer, answerElement };
                })
                .filter((q) => q.text);

            if (queries.length === 0) {
                const fallbackSelector = '[class*="pb-2"] .font-sans.text-textMain';
                queryElements = document.querySelectorAll(fallbackSelector);
                aiElements = Array.from(document.querySelectorAll(perplexityAiSelector));
                queries = Array.from(queryElements)
                    .map((el) => {
                        let answer = "";
                        let answerElement = TOC_PERF.findAnswerElement(el, aiElements, Array.from(queryElements));
                        if (answerElement) answer = answerElement.textContent.trim();
                        return { text: el.textContent.trim(), element: el, answer, answerElement };
                    })
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
            const claudeAiSelector = '[data-testid="ai-message"], .font-claude-message, [class*="assistant"], [class*="response"]';
            const aiElements = Array.from(document.querySelectorAll(claudeAiSelector));

            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    const elementsArr = Array.from(elements);
                    queries = elementsArr
                        .map((el) => {
                            const text = el.textContent.trim();
                            // Extract AI answer: find the next assistant response block
                            let answer = "";
                            let answerElement = null;
                            try {
                                const turnContainer = el.closest('[class*="turn"], [class*="row"]') || el.parentElement;
                                if (turnContainer) {
                                    let next = turnContainer.nextElementSibling;
                                    while (next) {
                                        const aiMsg = next.querySelector('[data-testid="ai-message"], [class*="assistant"], [class*="response"]');
                                        if (aiMsg) {
                                            answerElement = aiMsg;
                                            answer = aiMsg.textContent.trim();
                                            break;
                                        }
                                        // Check if the sibling itself is the AI response
                                        if (next.matches && (next.matches('[class*="assistant"]') || next.matches('[class*="response"]'))) {
                                            answerElement = next;
                                            answer = next.textContent.trim();
                                            break;
                                        }
                                        if (next.querySelector('[data-testid="user-message"], [class*="human"]')) break;
                                        next = next.nextElementSibling;
                                    }
                                }
                            } catch (e) { /* silently ignore */ }

                            if (!answerElement) {
                                answerElement = TOC_PERF.findAnswerElement(el, aiElements, elementsArr);
                                if (answerElement) answer = answerElement.textContent.trim();
                            }

                            return { text, element: el, answer, answerElement };
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
        host: "grok.com",
        platformKey: "grok",
        storageKey: "grok-toc-position",
        selectors: {
            userMessage: ".message-bubble.bg-surface-l1, .user-message, [data-testid='user-message'], .message-user",
            sendButton: "button[aria-label='Submit'], [data-testid='send-button']",
            promptInput: "div.tiptap.ProseMirror, textarea[aria-label='Ask Grok anything'], textarea, [contenteditable='true']",
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
            const possibleSelectors = this.selectors.userMessage.split(",").map(s => s.trim());
            let queries = [];
            const grokAiSelector = '.message-bubble:not(.bg-surface-l1), [class*="assistant"]';
            const aiElements = Array.from(document.querySelectorAll(grokAiSelector));

            for (const selector of possibleSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    const elementsArr = Array.from(elements);
                    queries = elementsArr
                        .map((el) => {
                            const text = el.textContent.trim();
                            // Extract AI answer: find the next non-user message sibling
                            let answer = "";
                            let answerElement = null;
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
                                            answerElement = next;
                                            answer = responseText;
                                            break;
                                        }
                                        next = next.nextElementSibling;
                                    }
                                }
                            } catch (e) { /* silently ignore */ }

                            if (!answerElement) {
                                answerElement = TOC_PERF.findAnswerElement(el, aiElements, elementsArr);
                                if (answerElement) answer = answerElement.textContent.trim();
                            }

                            return { text, element: el, answer, answerElement };
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
};

// =============================================================================
// Router - Detect current site and initialize
// =============================================================================

(function () {
    let activeAdapter = null;

    for (const key in SITES) {
        const site = SITES[key];
        if (location.host.includes(site.host)) {
            activeAdapter = site;
            break;
        }
    }

    if (activeAdapter) {
        new window.TOC.UI(activeAdapter);
    }
})();
