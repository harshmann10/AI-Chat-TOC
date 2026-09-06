/**
 * AI Chat TOC - Test Reporter Module
 * Console output formatting for test results.
 */

window.TOC = window.TOC || {};
window.TOC.TEST = window.TOC.TEST || {};

window.TOC.TEST.Reporter = class Reporter {
    /**
     * Print a single strategy result to console.
     * @param {object} result - Standardized result from Metrics.createResult()
     */
    static printResult(result) {
        const score = window.TOC.TEST.Metrics.score(result);
        const icon = result.success ? '✅' : '❌';
        const scoreIcon = score >= 80 ? '🏆' : score >= 60 ? '👍' : score >= 40 ? '⚠️' : '👎';

        console.group(`${icon} ${result.strategy} ${scoreIcon} (Score: ${score}/100)`);
        console.log(`Platform:     ${result.platform}`);
        console.log(`Time:         ${result.timeMs}ms`);
        console.log(`Messages:     ${result.messagesFound} (user: ${result.userMessages}, assistant: ${result.assistantMessages})`);
        console.log(`Stable IDs:   ${result.hasStableIds ? '✅' : '❌'}`);
        console.log(`Full Text:    ${result.hasFullText ? '✅' : '❌'}`);
        console.log(`Truncated:    ${result.hasTruncatedText ? '✅' : '❌'}`);
        console.log(`Assistant:    ${result.hasAssistantContent ? '✅' : '❌'}`);
        console.log(`Navigation:   ${result.navigationWorks ? '✅ ' + result.navigationMethod : '❌'}`);
        console.log(`Reliability:  ${result.reliability}`);
        console.log(`DOM Nodes:    ${result.domNodesScanned}`);
        if (result.error) console.error(`Error:        ${result.error}`);
        if (result.notes.length) console.log(`Notes:        ${result.notes.join(', ')}`);
        console.groupEnd();
    }

    /**
     * Print a comparison table of all results.
     * @param {object[]} results - Array of standardized results
     */
    static printTable(results) {
        console.log('\n📊 === STRATEGY COMPARISON TABLE ===\n');

        const tableData = results.map(r => ({
            'Strategy': r.strategy,
            'Score': window.TOC.TEST.Metrics.score(r),
            'Success': r.success ? '✅' : '❌',
            'Messages': r.messagesFound,
            'User': r.userMessages,
            'Assistant': r.assistantMessages,
            'FullText': r.hasFullText ? '✅' : '❌',
            'Nav': r.navigationWorks ? '✅' : '❌',
            'Time(ms)': r.timeMs,
            'Reliability': r.reliability
        }));

        console.table(tableData);

        // Find winner
        const scored = results.map(r => ({
            strategy: r.strategy,
            score: window.TOC.TEST.Metrics.score(r)
        }));
        scored.sort((a, b) => b.score - a.score);

        console.log(`\n🏆 Winner: ${scored[0].strategy} (Score: ${scored[0].score}/100)`);
        if (scored.length > 1) {
            console.log(`🥈 Runner-up: ${scored[1].strategy} (Score: ${scored[1].score}/100)`);
        }
    }

    /**
     * Print a detailed markdown report.
     * @param {object[]} results
     * @returns {string} Markdown report
     */
    static generateMarkdown(results) {
        const scored = results.map(r => ({
            ...r,
            score: window.TOC.TEST.Metrics.score(r)
        }));
        scored.sort((a, b) => b.score - a.score);

        let md = `# 🧪 Virtualization Strategy Test Report\n\n`;
        md += `**Date:** ${new Date().toLocaleDateString()}\n`;
        md += `**URL:** ${window.location.href}\n\n`;

        md += `## Rankings\n\n`;
        md += `| Rank | Strategy | Score | Messages | Full Text | Nav | Time |\n`;
        md += `|------|----------|-------|----------|-----------|-----|------|\n`;

        scored.forEach((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            md += `| ${medal} | ${r.strategy} | ${r.score}/100 | ${r.messagesFound} | ${r.hasFullText ? '✅' : '❌'} | ${r.navigationWorks ? '✅' : '❌'} | ${r.timeMs}ms |\n`;
        });

        md += `\n## Detailed Results\n\n`;
        scored.forEach(r => {
            md += `### ${r.strategy}\n\n`;
            md += `- **Success:** ${r.success ? 'Yes' : 'No'}\n`;
            md += `- **Messages Found:** ${r.messagesFound} (user: ${r.userMessages}, assistant: ${r.assistantMessages})\n`;
            md += `- **Stable IDs:** ${r.hasStableIds ? 'Yes' : 'No'}\n`;
            md += `- **Full Text Available:** ${r.hasFullText ? 'Yes' : 'No'}\n`;
            md += `- **Navigation Works:** ${r.navigationWorks ? `Yes (${r.navigationMethod})` : 'No'}\n`;
            md += `- **Time:** ${r.timeMs}ms\n`;
            md += `- **Reliability:** ${r.reliability}\n`;
            if (r.notes.length) md += `- **Notes:** ${r.notes.join(', ')}\n`;
            md += `\n`;
        });

        return md;
    }

    /**
     * Save report to localStorage for later retrieval.
     * @param {object[]} results
     */
    static saveReport(results) {
        const report = {
            url: window.location.href,
            timestamp: new Date().toISOString(),
            results: results.map(r => ({
                ...r,
                score: window.TOC.TEST.Metrics.score(r)
            }))
        };
        localStorage.setItem('toc-test-report', JSON.stringify(report, null, 2));
        console.log('💾 Report saved to localStorage key "toc-test-report"');
    }
};
