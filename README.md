# AI Chat TOC

A browser extension that adds a **Table of Contents** sidebar to AI chat interfaces, making it easy to navigate long conversations.

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Supported Platforms

| Platform | Status |
|----------|--------|
| ChatGPT | ✅ Supported |
| Gemini | ✅ Supported |
| Perplexity | ✅ Supported |
| Claude | ✅ Supported |

## Features

- 📋 **Table of Contents** - Lists all your queries in a navigable sidebar
- 🔍 **Search** - Filter queries by keyword
- 🖱️ **Drag & Drop** - Reposition the TOC anywhere on screen
- 💾 **Position Memory** - Remembers position per-site
- 📤 **Export** - Copy/download queries as text or markdown
- 🌙 **Dark Mode** - Auto-adapts to system preference
- ⚡ **Performance Optimized** - Minimal CPU usage

## Installation

### Firefox
1. Download the extension from [Firefox Add-ons](https://addons.mozilla.org/)
2. Or load temporarily: `about:debugging` → Load Temporary Add-on → Select `Firefox/manifest.json`

### Chrome / Edge
1. Download from Chrome Web Store or Edge Add-ons
2. Or load unpacked: `chrome://extensions` → Enable Developer mode → Load unpacked → Select `Chrome` folder

## File Structure

```
AI Chat TOC/
├── Chrome/           # Chrome/Edge version (Manifest V3)
│   ├── manifest.json
│   ├── ui.js
│   ├── main.js
│   ├── style.css
│   └── icons/
├── Firefox/          # Firefox version (Manifest V2)
│   ├── manifest.json
│   ├── ui.js
│   ├── main.js
│   ├── style.css
│   └── icons/
└── README.md
```

## How It Works

1. **ui.js** - Contains all reusable UI components (drag, search, position management)
2. **main.js** - Site-specific configurations and query extraction logic
3. **style.css** - Modern, clean styling with theme support per platform

## Export Options

Click the export button (↓) in the header to:
- Copy as Text
- Copy as Markdown
- Download as .txt file
- Download as .md file

## Performance

Optimizations applied:
- Throttled DOM observers (500ms)
- Visibility API (pauses when tab hidden)
- 5-second periodic checks
- Debounced TOC creation

## Future Improvements

- [ ] Keyboard shortcut to toggle TOC (Ctrl+Shift+T)
- [ ] Click to copy individual query
- [ ] Highlight currently visible query
- [ ] Settings page for customization
- [ ] Sync position across devices
- [ ] Add more AI platforms
- [ ] Collapse/expand by conversation sections
- [ ] Query timestamps

## Adding a New Site

1. Add configuration to `SITES` object in `main.js`
2. Add URL pattern to `manifest.json` (both versions)
3. Add theme class to `style.css` (optional)

## Development

```bash
# Firefox - Load temporarily
about:debugging#/runtime/this-firefox → Load Temporary Add-on

# Chrome - Load unpacked
chrome://extensions → Developer mode → Load unpacked
```

## License

MIT License - Feel free to use, modify, and distribute.

## Author

Created for personal use to navigate long AI conversations efficiently.

---

**Contributions welcome!** Feel free to submit issues or pull requests.
