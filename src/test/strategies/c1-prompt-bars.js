/**
 * AI Chat TOC - Strategy C1: ChatGPT Prompt Bars
 * 
 * HOW IT WORKS:
 * ChatGPT renders tiny indicator bars (2px high) on the right side of the
 * conversation. Each bar has aria-label="Prompt N" and data-toc-item-index.
 * These bars are ALWAYS rendered regardless of virtualization.
 * 
 * HOVER over a bar → popover appears with truncated user message text.
 * CLICK a bar → ChatGPT's internal virtualizer scrolls to that message.
 * 
 * DATA SOURCE: React component state (prompt bar component)
 * NAVIGATION: Click the prompt bar (uses ChatGPT's own scrollToIndex)
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};
window.TOC.TEST.STRATEGIES = window.TOC.TEST.STRATEGIES || {};

window.TOC.TEST.STRATEGIES['c1-prompt-bars'] = {
    name: 'C1: ChatGPT Prompt Bars',
    platform: 'chatgpt',
    description: 'Read ChatGPT\'s built-in prompt indicator bars and hover popover',

    /**
     * Run the strategy.
     * @returns {object} Standardized test result
     */
    async run() {
        const startTime = window.TOC.TEST.Metrics.startTimer();
        const notes = [];
        let domNodesScanned = 0;

        try {
            // Step 1: Find all prompt indicator bars
            const promptBars = document.querySelectorAll('button[aria-label^="Prompt"]');
            domNodesScanned += document.querySelectorAll('button').length;

            if (promptBars.length === 0) {
                return window.TOC.TEST.Metrics.createResult({
                    strategy: 'c1-prompt-bars',
                    platform: 'chatgpt',
                    success: false,
                    error: 'No prompt bars found (not on ChatGPT or UI changed)',
                    timeMs: window.TOC.TEST.Metrics.endTimer(startTime),
                    domNodesScanned,
                    reliability: 'low',
                    notes: ['ChatGPT may have changed their UI structure']
                });
            }

            // Step 2: Extract index data from bars
            const barData = Array.from(promptBars).map((bar, idx) => ({
                index: idx,
                ariaLabel: bar.getAttribute('aria-label'),
                tocIndex: bar.getAttribute('data-toc-item-index'),
                rect: bar.getBoundingClientRect()
            }));

            notes.push(`Found ${barData.length} prompt bars`);

            // Step 3: Try to get text by hovering over each bar
            const messages = [];
            let truncatedTextAvailable = false;

            for (const bar of promptBars) {
                // Hover to trigger popover
                const hoverEvent = new MouseEvent('mouseenter', { bubbles: true });
                bar.dispatchEvent(hoverEvent);

                // Small delay for popover to appear
                await new Promise(r => setTimeout(r, 50));

                // Try to read popover text
                const popover = document.querySelector('.popover');
                if (popover) {
                    const items = popover.querySelectorAll('li button');
                    items.forEach(item => {
                        const text = item.textContent.trim();
                        if (text && !messages.find(m => m.text === text)) {
                            messages.push({
                                text: text,
                                truncated: text.endsWith('...'),
                                title: item.getAttribute('title') || null
                            });
                            truncatedTextAvailable = true;
                        }
                    });

                    // Dismiss popover
                    const mouseLeave = new MouseEvent('mouseleave', { bubbles: true });
                    bar.dispatchEvent(mouseLeave);
                    await new Promise(r => setTimeout(r, 30));
                }
            }

            // Step 4: Check for active message indicator
            const activeBar = Array.from(promptBars).find(bar =>
                bar.classList.contains('active') ||
                bar.getAttribute('aria-current') === 'true'
            );

            // Step 5: Test navigation (click first bar)
            let navigationWorks = false;
            let navigationMethod = 'none';

            if (promptBars.length > 0) {
                const scrollBefore = document.querySelector('main')?.scrollTop || 0;
                promptBars[0].click();
                await new Promise(r => setTimeout(r, 500));
                const scrollAfter = document.querySelector('main')?.scrollTop || 0;

                if (Math.abs(scrollAfter - scrollBefore) > 10) {
                    navigationWorks = true;
                    navigationMethod = 'prompt-bar-click';
                    notes.push('Navigation via prompt bar click works');
                } else {
                    notes.push('Navigation click did not scroll (may need different target)');
                }
            }

            const timeMs = window.TOC.TEST.Metrics.endTimer(startTime);

            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c1-prompt-bars',
                platform: 'chatgpt',
                success: true,
                messagesFound: messages.length,
                userMessages: messages.length,
                assistantMessages: 0,
                hasStableIds: false,
                hasFullText: false,
                hasTruncatedText: truncatedTextAvailable,
                hasAssistantContent: false,
                navigationWorks,
                navigationMethod,
                timeMs,
                domNodesScanned,
                reliability: 'high',
                notes
            });

        } catch (e) {
            return window.TOC.TEST.Metrics.createResult({
                strategy: 'c1-prompt-bars',
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
