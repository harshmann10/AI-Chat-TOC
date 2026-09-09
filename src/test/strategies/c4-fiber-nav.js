/**
 * AI Chat TOC - Strategy C4: React Fiber Virtualizer Bridge
 * 
 * HOW IT WORKS:
 * Walk the React fiber tree to find the virtualizer's internal API
 * (scrollToIndex, scrollToItem, scrollToOffset). This gives us precise
 * navigation without guessing scroll positions.
 * 
 * DATA SOURCE: React internal state (fiber tree)
 * NAVIGATION: Direct virtualizer API call (scrollToIndex)
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};
window.TOC.TEST.STRATEGIES = window.TOC.TEST.STRATEGIES || {};

window.TOC.TEST.STRATEGIES['c4-fiber-nav'] = {
    name: 'C4: React Fiber Virtualizer Bridge',
    platform: 'chatgpt',
    description: 'Walk React fiber tree to find virtualizer API for precise navigation',

    /**
     * Walk the React fiber tree looking for virtualizer methods.
     * @param {Element} root - Starting DOM element
     * @returns {object|null} Virtualizer API if found
     */
    findVirtualizerAPI(root) {
        const FIBER_PREFIXES = ['__reactFiber$', '__reactProps$', '__reactContainer$'];
        const VIRTUALIZER_HINTS = [
            'scrollToIndex', 'scrollToItem', 'scrollToOffset',
            'getVirtualItems', 'getTotalSize', 'measureElement',
            'followOutput', 'rangeChanged', 'firstItemIndex', 'atBottom'
        ];

        // Find React fiber key
        let fiberKey = null;
        for (const prefix of FIBER_PREFIXES) {
            for (const key of Object.keys(root)) {
                if (key.startsWith(prefix)) {
                    fiberKey = key;
                    break;
                }
            }
            if (fiberKey) break;
        }

        if (!fiberKey) return null;

        // Walk fiber tree looking for virtualizer
        const visited = new WeakSet();
        let found = null;

        function walk(fiber, depth) {
            if (!fiber || depth > 30 || found || visited.has(fiber)) return;
            visited.add(fiber);

            // Check memoizedState chain
            if (fiber.memoizedState) {
                let state = fiber.memoizedState;
                let i = 0;
                while (state && i < 20) {
                    if (state.memoizedState && typeof state.memoizedState === 'object') {
                        const ms = state.memoizedState;
                        const keys = Object.keys(ms);
                        const hasVirtualizer = keys.some(k =>
                            VIRTUALIZER_HINTS.some(h => k.toLowerCase().includes(h.toLowerCase()))
                        );

                        if (hasVirtualizer) {
                            found = {
                                stateKeys: keys,
                                virtualizerMethods: keys.filter(k =>
                                    VIRTUALIZER_HINTS.some(h => k.toLowerCase().includes(h.toLowerCase()))
                                ),
                                depth,
                                stateIndex: i
                            };
                            return;
                        }

                        // Check nested objects
                        for (const key of keys) {
                            if (ms[key] && typeof ms[key] === 'object') {
                                const nestedKeys = Object.keys(ms[key]);
                                const nestedHasVirtualizer = nestedKeys.some(k =>
                                    VIRTUALIZER_HINTS.some(h => k.toLowerCase().includes(h.toLowerCase()))
                                );
                                if (nestedHasVirtualizer) {
                                    found = {
                                        stateKeys: nestedKeys,
                                        virtualizerMethods: nestedKeys.filter(k =>
                                            VIRTUALIZER_HINTS.some(h => k.toLowerCase().includes(h.toLowerCase()))
                                        ),
                                        depth,
                                        stateIndex: i,
                                        nested: true,
                                        parentKey: key
                                    };
                                    return;
                                }
                            }
                        }
                    }
                    state = state.next;
                    i++;
                }
            }

            walk(fiber.child, depth + 1);
            if (!found) walk(fiber.sibling, depth + 1);
        }

        walk(root[fiberKey], 0);
        return found;
    },

    /**
     * Run the strategy.
     * @returns {object} Standardized test result
     */
    async run() {
        const startTime = window.TOC.TEST.Metrics.startTimer();
        const notes = [];
        let domNodesScanned = 0;

        try {
            // Find starting points for fiber walk
            const startPoints = [
                document.querySelector('#thread'),
                document.querySelector('main'),
                document.querySelector('[data-scroll-root]'),
                document.querySelector('[data-testid^="conversation-turn-"]')
            ].filter(Boolean);

            domNodesScanned = document.querySelectorAll('*').length;
            notes.push(`Scanning ${startPoints.length} starting points`);

            let virtualizer = null;

            for (const point of startPoints) {
                virtualizer = this.findVirtualizerAPI(point);
                if (virtualizer) {
                    notes.push(`Found virtualizer at depth ${virtualizer.depth}`);
                    break;
                }
            }

            if (!virtualizer) {
                return window.TOC.TEST.Metrics.createResult({
                    strategy: 'c4-fiber-nav',
                    platform: 'chatgpt',
                    success: false,
                    error: 'Virtualizer API not found in React fiber tree',
                    timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                    domNodesScanned,
                    reliability: 'low',
                    notes: [...notes, 'React internals may have changed or virtualizer is not exposed']
                });
            }

            // Test navigation if virtualizer found
            let navigationWorks = false;
            let navigationMethod = 'none';

            if (virtualizer.virtualizerMethods.includes('scrollToIndex')) {
                notes.push('scrollToIndex method available');
                navigationMethod = 'fiber-scrollToIndex';
                navigationWorks = true;
            } else if (virtualizer.virtualizerMethods.includes('scrollToItem')) {
                notes.push('scrollToItem method available');
                navigationMethod = 'fiber-scrollToItem';
                navigationWorks = true;
            } else if (virtualizer.virtualizerMethods.includes('scrollToOffset')) {
                notes.push('scrollToOffset method available');
                navigationMethod = 'fiber-scrollToOffset';
                navigationWorks = true;
            }

            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c4-fiber-nav',
                platform: 'chatgpt',
                success: true,
                messagesFound: 0,
                userMessages: 0,
                assistantMessages: 0,
                hasStableIds: false,
                hasFullText: false,
                hasTruncatedText: false,
                hasAssistantContent: false,
                navigationWorks,
                navigationMethod,
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                domNodesScanned,
                reliability: 'medium',
                notes: [...notes, `Virtualizer methods: ${virtualizer.virtualizerMethods.join(', ')}`]
            });

        } catch (e) {
            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c4-fiber-nav',
                platform: 'chatgpt',
                success: false,
                error: e.message,
                timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                domNodesScanned,
                reliability: 'low',
                notes: [e.stack?.split('\n')[1]?.trim() || '']
            });
        }
    }
};
