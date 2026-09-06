/**
 * AI Chat TOC - Strategy C7: Scroll-and-Capture Scan
 * 
 * HOW IT WORKS:
 * Programmatically scroll from top to bottom of the conversation,
 * capturing messages at each position. Uses UUID deduplication to
 * avoid duplicates. Inspired by chatgpt-chat-exporter's approach.
 * 
 * DATA SOURCE: Live DOM (walks entire conversation)
 * NAVIGATION: Offset-based scroll (after scan completes)
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};
window.TOC.TEST.STRATEGIES = window.TOC.TEST.STRATEGIES || {};

window.TOC.TEST.STRATEGIES['c7-scroll-scan'] = {
    name: 'C7: Scroll-and-Capture Scan',
    platform: 'all',
    description: 'Programmatic top-to-bottom scroll, capture at each stop, deduplicate by UUID',

    /**
     * Find the main scroll container.
     * @returns {Element|null}
     */
    findScrollContainer() {
        return document.querySelector('main') ||
            Array.from(document.querySelectorAll('div')).find(d =>
                d.scrollHeight > 5000 && d.clientHeight < 2000
            );
    },

    /**
     * Capture currently rendered messages.
     * @param {Set} seenIds - Deduplication set
     * @returns {object[]} New messages found
     */
    captureCurrentMessages(seenIds) {
        const newMessages = [];

        // ChatGPT selectors
        const turnContainers = document.querySelectorAll('[data-testid^="conversation-turn-"]');

        for (const turn of turnContainers) {
            const turnId = turn.getAttribute('data-turn-id') || turn.getAttribute('data-testid');
            const turnNum = turn.getAttribute('data-testid')?.match(/(\d+)/)?.[1];

            const userMsg = turn.querySelector('[data-message-author-role="user"]');
            const assistantMsg = turn.querySelector('[data-message-author-role="assistant"]');

            const userMsgId = userMsg?.getAttribute('data-message-id');
            const assistantMsgId = assistantMsg?.getAttribute('data-message-id');

            // Use stable UUID as key, fallback to turnId
            const key = userMsgId || assistantMsgId || turnId;

            if (key && !seenIds.has(key)) {
                seenIds.add(key);
                newMessages.push({
                    key,
                    turnNum: turnNum ? parseInt(turnNum) : null,
                    userText: userMsg?.textContent?.trim() || '',
                    assistantText: assistantMsg?.textContent?.trim() || '',
                    offsetTop: turn.offsetTop + (turn.closest('main')?.scrollTop || 0),
                    height: turn.offsetHeight
                });
            }
        }

        return newMessages;
    },

    /**
     * Run the strategy.
     * @param {object} opts - Options
     * @param {boolean} opts.fullScan - If true, actually scroll through the conversation
     * @param {number} opts.maxSteps - Maximum scroll steps
     * @param {number} opts.stepDelay - Delay between scroll steps (ms)
     * @returns {object} Standardized test result
     */
    async run(opts = {}) {
        const startTime = window.TOC.TEST.Metrics.startTimer();
        const notes = [];
        const fullScan = opts.fullScan || false;
        const maxSteps = opts.maxSteps || 30;
        const stepDelay = opts.stepDelay || 200;

        try {
            const scrollContainer = this.findScrollContainer();

            if (!scrollContainer) {
                return window.TOC.TEST.Metrics.createResult({
                    strategy: 'c7-scroll-scan',
                    platform: 'all',
                    success: false,
                    error: 'No scroll container found',
                    timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                    reliability: 'low',
                    notes
                });
            }

            const seenIds = new Set();
            const allMessages = [];
            const scrollHeight = scrollContainer.scrollHeight;
            const clientHeight = scrollContainer.clientHeight;
            const isVirtualized = scrollHeight / clientHeight > 5;

            notes.push(`Scroll height: ${scrollHeight}`);
            notes.push(`Virtualized: ${isVirtualized ? 'YES' : 'NO'}`);

            if (!fullScan) {
                // Quick mode: just capture what's currently rendered
                const captured = this.captureCurrentMessages(seenIds);
                allMessages.push(...captured);
                notes.push(`Quick scan: found ${captured.length} messages`);
            } else {
                // Full scan: scroll top to bottom
                const savedScrollTop = scrollContainer.scrollTop;
                const scrollStep = Math.max(clientHeight * 0.8, 300);
                const totalSteps = Math.min(Math.ceil(scrollHeight / scrollStep), maxSteps);

                notes.push(`Full scan: ${totalSteps} steps, ${stepDelay}ms delay`);

                // Scroll to top
                scrollContainer.scrollTop = 0;
                await new Promise(r => setTimeout(r, 300));

                // Capture at each position
                for (let step = 0; step < totalSteps; step++) {
                    const captured = this.captureCurrentMessages(seenIds);
                    allMessages.push(...captured);

                    scrollContainer.scrollTop += scrollStep;
                    await new Promise(r => setTimeout(r, stepDelay));
                }

                // Final capture at bottom
                scrollContainer.scrollTop = scrollHeight;
                await new Promise(r => setTimeout(r, 300));
                const finalCaptured = this.captureCurrentMessages(seenIds);
                allMessages.push(...finalCaptured);

                // Restore scroll position
                scrollContainer.scrollTop = savedScrollTop;
                notes.push(`Restored scroll position to ${savedScrollTop}`);
            }

            const userMessages = allMessages.filter(m => m.userText);
            const assistantMessages = allMessages.filter(m => m.assistantText);

            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c7-scroll-scan',
                platform: 'all',
                success: allMessages.length > 0,
                messagesFound: allMessages.length,
                userMessages: userMessages.length,
                assistantMessages: assistantMessages.length,
                hasStableIds: allMessages.some(m => m.key && !m.key.startsWith('conversation-turn')),
                hasFullText: allMessages.some(m => (m.userText + m.assistantText).length > 200),
                hasTruncatedText: false,
                hasAssistantContent: assistantMessages.length > 0,
                navigationWorks: true,
                navigationMethod: 'offset-based',
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                domNodesScanned: document.querySelectorAll('[data-testid^="conversation-turn-"]').length,
                reliability: fullScan ? 'high' : 'medium',
                notes
            });

        } catch (e) {
            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c7-scroll-scan',
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
