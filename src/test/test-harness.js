/**
 * AI Chat TOC - Test Harness
 * Master controller for testing virtualization strategies.
 * 
 * USAGE (in browser console on ChatGPT):
 *   window.__TOC_TEST__.run('c1-prompt-bars')    // Test one strategy
 *   window.__TOC_TEST__.runAll()                   // Test all strategies
 *   window.__TOC_TEST__.runAll({ fullScan: true }) // Full scroll scan
 *   window.__TOC_TEST__.report()                   // Show comparison table
 *   window.__TOC_TEST__.reportMarkdown()           // Copy markdown report
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};

window.TOC.TEST.Harness = class TestHarness {
    constructor() {
        this.results = [];
        this.strategies = window.TOC.TEST.STRATEGIES || {};
    }

    /**
     * Get list of available strategies.
     * @returns {string[]}
     */
    listStrategies() {
        return Object.keys(this.strategies);
    }

    /**
     * Run a single strategy by name.
     * @param {string} name - Strategy key (e.g., 'c1-prompt-bars')
     * @param {object} opts - Options to pass to the strategy
     * @returns {object} Test result
     */
    async run(name, opts = {}) {
        const strategy = this.strategies[name];
        if (!strategy) {
            console.error(`❌ Strategy "${name}" not found. Available: ${this.listStrategies().join(', ')}`);
            return null;
        }

        console.log(`\n🧪 Running strategy: ${strategy.name}...`);
        console.log(`   ${strategy.description}\n`);

        const result = await strategy.run(opts);
        this.results.push(result);

        window.TOC.TEST.Reporter.printResult(result);
        return result;
    }

    /**
     * Run all available strategies sequentially.
     * @param {object} opts - Options to pass to all strategies
     * @returns {object[]} All results
     */
    async runAll(opts = {}) {
        console.log('\n🚀 === RUNNING ALL STRATEGIES ===\n');
        this.results = [];

        const names = this.listStrategies();
        for (const name of names) {
            await this.run(name, opts);
            console.log('---');
        }

        console.log('\n✅ All strategies complete!\n');
        window.TOC.TEST.Reporter.printTable(this.results);
        return this.results;
    }

    /**
     * Show comparison table of all results.
     */
    report() {
        if (this.results.length === 0) {
            console.log('⚠️ No results yet. Run strategies first with window.__TOC_TEST__.runAll()');
            return;
        }
        window.TOC.TEST.Reporter.printTable(this.results);
    }

    /**
     * Generate and copy markdown report.
     */
    reportMarkdown() {
        if (this.results.length === 0) {
            console.log('⚠️ No results yet. Run strategies first.');
            return;
        }
        const md = window.TOC.TEST.Reporter.generateMarkdown(this.results);
        console.log(md);

        // Copy to clipboard
        navigator.clipboard.writeText(md).then(() => {
            console.log('📋 Markdown report copied to clipboard!');
        }).catch(() => {
            console.log('📋 Markdown report printed above (copy manually)');
        });

        return md;
    }

    /**
     * Save results to localStorage.
     */
    save() {
        window.TOC.TEST.Reporter.saveReport(this.results);
    }

    /**
     * Clear all stored results.
     */
    clear() {
        this.results = [];
        console.log('🗑️ Results cleared');
    }
};

// Auto-initialize and expose to console
window.__TOC_TEST__ = new (window.TOC.TEST.Harness)();
console.log('✅ AI Chat TOC Test Harness loaded!');
console.log('📖 Usage:');
console.log('   window.__TOC_TEST__.listStrategies()     // List available strategies');
console.log('   window.__TOC_TEST__.run("c1-prompt-bars") // Test one strategy');
console.log('   window.__TOC_TEST__.runAll()              // Test all strategies');
console.log('   window.__TOC_TEST__.runAll({ fullScan: true }) // Full scroll scan');
console.log('   window.__TOC_TEST__.report()              // Show comparison table');
console.log('   window.__TOC_TEST__.reportMarkdown()      // Copy markdown report');
console.log('   window.__TOC_TEST__.save()                // Save to localStorage');
