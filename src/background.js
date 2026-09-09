/**
 * AI Chat TOC - Background Script
 * Handles global keyboard shortcuts and message passing.
 */

// Listen for commands from manifest.json
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-toc" || command === "toggle-compact-mode") {
        // Find the active tab and send a toggle message
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: command });
            }
        });
    }
});
