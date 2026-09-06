/**
 * AI Chat TOC - Test Module Index
 * Loads all test strategies and harness in correct order.
 * 
 * This file is loaded as a content script in test mode.
 */

// Load order matters: metrics & reporter first, then strategies, then harness
// (Each file attaches to window.TOC.TEST namespace)

// 1. Metrics (no dependencies)
// 2. Reporter (depends on Metrics)
// 3. Strategies (depend on Metrics)
// 4. Harness (depends on all above)
//
// All files are loaded via manifest content_scripts in test mode.
// This file is just a documentation index — actual loading is done by the browser.

console.log('[TOC Test] All test modules loaded. Use window.__TOC_TEST__ to interact.');
