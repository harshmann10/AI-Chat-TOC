/**
 * AI Chat TOC - Strategy C3: ChatGPT Backend API
 *
 * Tests the verified C3 contract (see NEW.md):
 * - Logged-in chats at /c/{id} use GET /backend-api/conversation/{id}
 *   with Authorization: Bearer <accessToken> (opt-in via experimental toggle).
 * - Shared chats at /share/{id} use GET /backend-api/share/{id} with no token.
 * - Responses carry a `mapping` tree (walk the active branch) and, for shared
 *   chats, may also carry `linear_conversation` as fallback.
 * - Only visible user + assistant turns count; system/tool/hidden nodes excluded.
 * - Multimodal content.parts are filtered to strings (never .join() objects).
 *
 * DATA SOURCE: Network API (same-origin fetch from content script context)
 * NAVIGATION: out of scope for this test (reported separately, always false).
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};
window.TOC.TEST.STRATEGIES = window.TOC.TEST.STRATEGIES || {};

const c3ApiUrl = (path) => {
    let origin = 'https://chatgpt.com';
    try {
        if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
            origin = location.origin;
        }
    } catch (e) { /* use ChatGPT fallback */ }
    return `${origin}${path}`;
};

window.TOC.TEST.STRATEGIES['c3-backend-api'] = {
    name: 'C3: ChatGPT Backend API',
    platform: 'chatgpt',
    description: 'Fetch full conversation from ChatGPT\'s backend API (verified contract)',

    /**
     * Detect URL type and extract the conversation/share ID.
     * @returns {{kind: 'c'|'share'|null, id: string|null}}
     */
    getConversationRef() {
        try {
            const path = location.pathname || '';
            let m = path.match(/\/c\/([a-f0-9-]+)/);
            if (m) return { kind: 'c', id: m[1] };
            m = path.match(/\/share\/([a-f0-9-]+)/);
            if (m) return { kind: 'share', id: m[1] };
        } catch (e) { /* ignore */ }
        return { kind: null, id: null };
    },

    /**
     * Legacy helper kept for harness compatibility.
     * @returns {string|null} Conversation or share ID
     */
    getConversationId() {
        const ref = this.getConversationRef();
        if (ref.id) return ref.id;
        // Try DOM data attribute
        const convEl = document.querySelector('[data-conversation-id]');
        if (convEl) return convEl.getAttribute('data-conversation-id');
        // Try turn containers
        const turnEl = document.querySelector('[data-testid^="conversation-turn-"]');
        if (turnEl) {
            const turnId = turnEl.getAttribute('data-turn-id');
            if (turnId) return turnId;
        }
        return null;
    },

    /**
     * Multimodal-safe text extraction: string parts only.
     */
    extractText(message) {
        try {
            const parts = (message.content && Array.isArray(message.content.parts))
                ? message.content.parts
                : [];
            return parts.filter(p => typeof p === 'string').join('\n');
        } catch (e) {
            return '';
        }
    },

    /**
     * Normalize one mapping/linear message node to the internal format.
     */
    normalizeNode(msg) {
        if (!msg) return null;
        return {
            id: msg.id,
            role: (msg.author && msg.author.role) || 'unknown',
            text: this.extractText(msg),
            createTime: msg.create_time,
            turnId: msg.id,
            messageId: msg.id,
            isVisible: !(msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true),
            isUserSystemMessage: !!(msg.metadata && msg.metadata.is_user_system_message === true),
        };
    },

    /**
     * A message counts toward the TOC only when it is a visible user or
     * assistant turn with non-empty text.
     */
    isVisibleTurn(m) {
        if (!m || !m.text || !m.text.trim()) return false;
        if (m.isVisible === false) return false;
        if (m.isUserSystemMessage === true) return false;
        return m.role === 'user' || m.role === 'assistant';
    },

    /**
     * Walk the conversation mapping tree to get ordered messages.
     * Selects current_node, then the node marked current, then the node with
     * the latest timestamp. Guards against missing parents and cycles.
     * @param {object} mapping - The mapping object from API response
     * @param {string} [currentNode] - Explicit current node ID when known
     * @returns {object[]} Ordered array of normalized messages
     */
    walkMappingTree(mapping, currentNode) {
        if (!mapping) return [];

        // Find current node
        let currentNodeId = currentNode || null;
        if (!currentNodeId) {
            for (const [nodeId, node] of Object.entries(mapping)) {
                if (node.current) {
                    currentNodeId = nodeId;
                    break;
                }
            }
        }

        // Fallback: find the node with the latest timestamp
        if (!currentNodeId) {
            let latestTime = 0;
            for (const [nodeId, node] of Object.entries(mapping)) {
                if (node.message?.create_time && node.message.create_time > latestTime) {
                    latestTime = node.message.create_time;
                    currentNodeId = nodeId;
                }
            }
        }

        if (!currentNodeId) return [];

        // Walk parent chain from current to root (cycle-guarded)
        const messages = [];
        const seen = new Set();
        let current = mapping[currentNodeId];
        let guard = 0;
        const maxNodes = Object.keys(mapping).length + 1;
        while (current && guard++ < maxNodes) {
            const key = current.id || (current.message && current.message.id);
            if (key) {
                if (seen.has(key)) break; // cycle
                seen.add(key);
            }
            if (current.message) {
                const normalized = this.normalizeNode(current.message);
                if (normalized) messages.unshift(normalized);
            }
            current = current.parent ? mapping[current.parent] : null;
        }

        return messages;
    },

    /**
     * Extract a Bearer token the same way production does (scripts first,
     * then /api/auth/session). Session-scoped only, never persisted.
     * @returns {Promise<string|null>}
     */
    async resolveToken() {
        try {
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                const m = s.textContent.match(/"accessToken":"([^"]+)"/);
                if (m) return m[1];
            }
        } catch (e) { /* ignore */ }
        try {
            const res = await fetch(c3ApiUrl('/api/auth/session'), { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data.accessToken === 'string' && data.accessToken) {
                    return data.accessToken;
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    },

    /**
     * Run the strategy.
     * @returns {object} Standardized test result (C3 success independent of navigation)
     */
    async run() {
        const startTime = window.TOC.TEST.Metrics.startTimer();
        const notes = [];

        try {
            const ref = this.getConversationRef();

            if (!ref.id) {
                return window.TOC.TEST.Metrics.createResult({
                    strategy: 'c3-backend-api',
                    platform: 'chatgpt',
                    success: false,
                    error: 'Not a /c/{id} or /share/{id} conversation page',
                    timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                    reliability: 'low',
                    notes: ['Page may not be a conversation page']
                });
            }

            notes.push(`URL type: /${ref.kind}/, ID: ${ref.id}`);

            // Route per verified contract: share endpoint needs no token,
            // conversation endpoint needs a Bearer token.
            let apiData = null;
            if (ref.kind === 'share') {
                try {
                    const response = await fetch(c3ApiUrl(`/backend-api/share/${ref.id}`), {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json' },
                    });
                    if (response.ok) {
                        apiData = await response.json();
                        notes.push('Share endpoint fetch succeeded (no token required)');
                    } else {
                        notes.push(`Share endpoint returned ${response.status}`);
                    }
                } catch (e) {
                    notes.push(`Share fetch failed: ${e.message}`);
                }
            } else {
                const token = await this.resolveToken();
                if (!token) {
                    notes.push('No access token available (toggle off or logged out)');
                } else {
                    notes.push('Access token resolved (session-scoped, not persisted)');
                    try {
                        let response = await fetch(c3ApiUrl(`/backend-api/conversation/${ref.id}`), {
                            credentials: 'include',
                            headers: {
                                'Accept': 'application/json',
                                'Authorization': `Bearer ${token}`,
                            },
                        });
                        if (response.status === 401) {
                            notes.push('Got 401, retrying once with a fresh session token');
                            try {
                                const retry = await fetch(c3ApiUrl('/api/auth/session'), { credentials: 'include' });
                                const retryData = retry.ok ? await retry.json() : null;
                                const fresh = retryData && retryData.accessToken;
                                if (fresh) {
                                    response = await fetch(c3ApiUrl(`/backend-api/conversation/${ref.id}`), {
                                        credentials: 'include',
                                        headers: {
                                            'Accept': 'application/json',
                                            'Authorization': `Bearer ${fresh}`,
                                        },
                                    });
                                }
                            } catch (e) {
                                notes.push(`Fresh-token retry failed: ${e.message}`);
                            }
                        }
                        if (response.ok) {
                            apiData = await response.json();
                            notes.push('Conversation endpoint fetch succeeded');
                        } else {
                            notes.push(`Conversation endpoint returned ${response.status}`);
                        }
                    } catch (e) {
                        notes.push(`Conversation fetch failed: ${e.message}`);
                    }
                }
            }

            if (!apiData) {
                return window.TOC.TEST.Metrics.createResult({
                    strategy: 'c3-backend-api',
                    platform: 'chatgpt',
                    success: false,
                    error: ref.kind === 'c'
                        ? 'Conversation API fetch failed (token missing/expired or request rejected)'
                        : 'Share API fetch failed',
                    timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                    reliability: 'low',
                    notes
                });
            }

            // Parse: mapping tree first, linear_conversation as fallback
            const mapping = apiData.mapping || apiData.data?.mapping;
            let messages = [];

            if (mapping) {
                const currentNode = apiData.current_node || apiData.currentNode || apiData.data?.current_node;
                messages = this.walkMappingTree(mapping, currentNode);
                notes.push(`Extracted ${messages.length} nodes from mapping tree (pre-filter)`);
            }
            if (messages.length === 0) {
                const linear = apiData.linear_conversation || apiData.data?.linear_conversation;
                if (linear) {
                    messages = linear
                        .filter(item => item.message)
                        .map(item => this.normalizeNode(item.message))
                        .filter(Boolean);
                    notes.push(`Extracted ${messages.length} nodes from linear_conversation (pre-filter)`);
                }
            }

            const rawCount = messages.length;
            const visible = messages.filter(m => this.isVisibleTurn(m));
            const excluded = rawCount - visible.length;
            notes.push(`Visible user+assistant turns: ${visible.length} (excluded ${excluded} hidden/system/tool/empty)`);

            const userMessages = visible.filter(m => m.role === 'user');
            const assistantMessages = visible.filter(m => m.role === 'assistant');

            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c3-backend-api',
                platform: 'chatgpt',
                success: visible.length > 0,
                messagesFound: visible.length,
                userMessages: userMessages.length,
                assistantMessages: assistantMessages.length,
                hasStableIds: visible.some(m => m.id),
                hasFullText: visible.some(m => m.text.length > 100),
                hasTruncatedText: false,
                hasAssistantContent: assistantMessages.some(m => m.text.length > 0),
                navigationWorks: false,
                navigationMethod: 'none (out of scope for C3 test)',
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                domNodesScanned: 0,
                reliability: visible.length > 0 ? 'high' : 'medium',
                notes
            });

        } catch (e) {
            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c3-backend-api',
                platform: 'chatgpt',
                success: false,
                error: e.message,
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                reliability: 'low',
                notes: [e.stack?.split('\n')[1]?.trim() || '']
            });
        }
    }
};
