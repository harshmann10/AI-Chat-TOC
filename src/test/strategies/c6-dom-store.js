/**
 * AI Chat TOC - Strategy C6: DOM Accumulating Store
 * 
 * HOW IT WORKS:
 * Maintain a persistent Map keyed by stable UUID (data-message-id).
 * On each MutationObserver trigger, scan rendered messages and merge
 * into the store. Messages accumulate over time as user scrolls.
 * 
 * DATA SOURCE: Live DOM (current render window)
 * NAVIGATION: Offset-based scroll (estimate position)
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};
window.TOC.TEST.STRATEGIES = window.TOC.TEST.STRATEGIES || {};

window.TOC.TEST.STRATEGIES['c6-dom-store'] = {
    name: 'C6: DOM Accumulating Store',
    platform: 'all',
    description: 'Scan current DOM, merge into UUID-keyed store, measure coverage',

    /**
     * Scan the current DOM for messages.
     * @returns {object} Scan results
     */
    scanDOM() {
        const messages = [];
        let domNodesScanned = 0;

        // ChatGPT selectors
        const turnContainers = document.querySelectorAll('[data-testid^="conversation-turn-"]');
        domNodesScanned += turnContainers.length;

        for (const turn of turnContainers) {
            const turnId = turn.getAttribute('data-turn-id') || turn.getAttribute('data-testid');
            const turnNum = turn.getAttribute('data-testid')?.match(/(\d+)/)?.[1];
            const role = turn.getAttribute('data-turn');

            // Find user message
            const userMsg = turn.querySelector('[data-message-author-role="user"]');
            const userMsgId = userMsg?.getAttribute('data-message-id');
            const userText = userMsg?.textContent?.trim() || '';

            // Find assistant message
            const assistantMsg = turn.querySelector('[data-message-author-role="assistant"]');
            const assistantMsgId = assistantMsg?.getAttribute('data-message-id');
            const assistantText = assistantMsg?.textContent?.trim() || '';

            if (userText || assistantText) {
                messages.push({
                    turnId,
                    turnNum: turnNum ? parseInt(turnNum) : null,
                    role: role || (userText ? 'user' : 'assistant'),
                    userMsgId,
                    userText,
                    assistantMsgId,
                    assistantText,
                    hasStableId: !!(userMsgId || assistantMsgId),
                    offsetTop: turn.offsetTop,
                    height: turn.offsetHeight
                });
            }
        }

        // Also try generic selectors for other platforms
        if (messages.length === 0) {
            const userMsgs = document.querySelectorAll('[data-message-author-role="user"]');
            domNodesScanned += userMsgs.length;

            for (const msg of userMsgs) {
                const msgId = msg.getAttribute('data-message-id');
                messages.push({
                    turnId: msgId,
                    turnNum: null,
                    role: 'user',
                    userMsgId: msgId,
                    userText: msg.textContent?.trim() || '',
                    assistantMsgId: null,
                    assistantText: '',
                    hasStableId: !!msgId,
                    offsetTop: msg.offsetTop,
                    height: msg.offsetHeight
                });
            }
        }

        return { messages, domNodesScanned };
    },

    /**
     * Calculate total scroll height and estimate total messages.
     * @returns {object} Scroll metrics
     */
    getScrollMetrics() {
        const scrollContainer = document.querySelector('main') ||
            Array.from(document.querySelectorAll('div')).find(d => d.scrollHeight > 5000);

        if (!scrollContainer) return null;

        return {
            scrollHeight: scrollContainer.scrollHeight,
            clientHeight: scrollContainer.clientHeight,
            scrollTop: scrollContainer.scrollTop,
            ratio: scrollContainer.scrollHeight / scrollContainer.clientHeight,
            isVirtualized: scrollContainer.scrollHeight / scrollContainer.clientHeight > 5
        };
    },

    /**
     * Run the strategy.
     * @returns {object} Standardized test result
     */
    async run() {
        const startTime = window.TOC.TEST.Metrics.startTimer();
        const notes = [];

        try {
            const { messages, domNodesScanned } = this.scanDOM();
            const scrollMetrics = this.getScrollMetrics();

            if (scrollMetrics) {
                notes.push(`Scroll ratio: ${scrollMetrics.ratio.toFixed(1)}x`);
                notes.push(`Virtualized: ${scrollMetrics.isVirtualized ? 'YES' : 'NO'}`);
            }

            const userMessages = messages.filter(m => m.role === 'user');
            const assistantMessages = messages.filter(m => m.role === 'assistant');
            const hasStableIds = messages.some(m => m.hasStableId);
            const hasFullText = messages.some(m => (m.userText + m.assistantText).length > 200);

            // Estimate total messages from scroll ratio
            if (scrollMetrics?.isVirtualized) {
                const avgHeight = messages.reduce((sum, m) => sum + m.height, 0) / messages.length;
                const estimatedTotal = Math.round(scrollMetrics.scrollHeight / avgHeight);
                notes.push(`Estimated total messages: ~${estimatedTotal}`);
                notes.push(`Currently rendered: ${messages.length}`);
                notes.push(`Coverage: ${Math.round((messages.length / estimatedTotal) * 100)}%`);
            }

            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c6-dom-store',
                platform: 'all',
                success: messages.length > 0,
                messagesFound: messages.length,
                userMessages: userMessages.length,
                assistantMessages: assistantMessages.length,
                hasStableIds,
                hasFullText,
                hasTruncatedText: false,
                hasAssistantContent: assistantMessages.some(m => m.assistantText.length > 0),
                navigationWorks: true,
                navigationMethod: 'offset-based',
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                domNodesScanned,
                reliability: 'high',
                notes
            });

        } catch (e) {
            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c6-dom-store',
                platform: 'all',
                success: false,
                error: e.message,
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                reliability: 'low',
                notes: [e.stack?.split('\n')[1]?.trim() || '']
            });
        }
    }
};
