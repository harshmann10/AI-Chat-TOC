/**
 * AI Chat TOC - Test Metrics Module
 * Performance measurement and result standardization.
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};

window.TOC.TEST.Metrics = class Metrics {
    /**
     * Start timing a strategy run.
     * @returns {number} Start timestamp
     */
    static startTimer() {
        return performance.now();
    }

    /**
     * End timing and return elapsed ms.
     * @param {number} startTime
     * @returns {number} Elapsed milliseconds
     */
    static endTimer(startTime) {
        return Math.round((performance.now() - startTime) * 100) / 100;
    }

    /**
     * Create a standardized test result object.
     * @param {object} opts
     * @returns {object} Standardized result
     */
    static createResult(opts) {
        return {
            strategy: opts.strategy || 'unknown',
            platform: opts.platform || 'unknown',
            success: opts.success !== undefined ? opts.success : false,
            error: opts.error || null,

            // Data metrics
            messagesFound: opts.messagesFound || 0,
            userMessages: opts.userMessages || 0,
            assistantMessages: opts.assistantMessages || 0,
            hasStableIds: opts.hasStableIds || false,
            hasFullText: opts.hasFullText || false,
            hasTruncatedText: opts.hasTruncatedText || false,
            hasAssistantContent: opts.hasAssistantContent || false,

            // Navigation metrics
            navigationWorks: opts.navigationWorks || false,
            navigationMethod: opts.navigationMethod || 'none',

            // Performance metrics
            timeMs: opts.timeMs || 0,
            domNodesScanned: opts.domNodesScanned || 0,

            // Reliability
            reliability: opts.reliability || 'unknown',
            notes: opts.notes || [],

            // Timestamp
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Compare two results side-by-side.
     * @param {object} a - First result
     * @param {object} b - Second result
     * @returns {object} Comparison object
     */
    static compare(a, b) {
        return {
            strategies: [a.strategy, b.strategy],
            winner: {
                messages: a.messagesFound > b.messagesFound ? a.strategy : b.strategy,
                speed: a.timeMs < b.timeMs ? a.strategy : b.strategy,
                completeness: (a.hasFullText && a.hasAssistantContent) > (b.hasFullText && b.hasAssistantContent) ? a.strategy : b.strategy,
                navigation: a.navigationWorks && !b.navigationWorks ? a.strategy : !a.navigationWorks && b.navigationWorks ? b.strategy : 'tie',
            }
        };
    }

    /**
     * Score a result from 0-100 based on multiple factors.
     * @param {object} result
     * @returns {number} Score 0-100
     */
    static score(result) {
        let score = 0;

        // Success (0-20)
        if (result.success) score += 20;

        // Data completeness (0-40)
        if (result.userMessages > 0) score += 10;
        if (result.assistantMessages > 0) score += 10;
        if (result.hasFullText) score += 10;
        if (result.hasAssistantContent) score += 10;

        // Stability (0-20)
        if (result.hasStableIds) score += 10;
        if (result.navigationWorks) score += 10;

        // Speed (0-20)
        if (result.timeMs < 50) score += 20;
        else if (result.timeMs < 200) score += 15;
        else if (result.timeMs < 500) score += 10;
        else if (result.timeMs < 1000) score += 5;

        return Math.min(100, score);
    }
};
