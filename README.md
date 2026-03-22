# AI Chat TOC

> 🧭 Navigate long AI conversations with ease

A browser extension that adds a **Table of Contents** sidebar to AI chat interfaces. Never lose track of your conversation again!

<p align="center">
  <img src="https://img.shields.io/badge/version-1.6.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platforms-5-orange" alt="Platforms">
</p>

---

## 🌐 Supported Platforms

| Platform   | Status | Accent Color |
| ---------- | ------ | ------------ |
| ChatGPT    | ✅     | Green        |
| Gemini     | ✅     | Blue         |
| Perplexity | ✅     | Teal         |
| Claude     | ✅     | Orange       |
| Grok       | ✅     | Black        |

---

## ✨ Features

| Feature                | Description                                 |
| ---------------------- | ------------------------------------------- |
| 📋 **TOC Sidebar**     | Lists all your queries in a navigable list  |
| 🔍 **Search**          | Filter queries by keyword                   |
| 🤖 **Show AI Answers** | Toggle inline AI response previews         |
| 🖱️ **Drag & Drop**     | Reposition anywhere on screen               |
| 📱 **Mobile Friendly** | Touch support & responsive design           |
| 💾 **Position Memory** | Remembers position per-site                 |
| 📤 **Export**          | Copy/download as text or markdown           |
| 🌙 **Dark Mode**       | Auto-adapts to system preference            |
| ⚡ **Optimized**       | Minimal CPU usage                           |

---

## 📥 Installation

[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-toc/)

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome)](https://chromewebstore.google.com/detail/ai-chat-toc/ainbhafdpkbgbkcomkhkilokelolnnpn)

[![Edge Web Store](https://img.shields.io/badge/Edge-Web%20Store-4285F4?logo=googlechrome)](https://microsoftedge.microsoft.com/addons/detail/ai-chat-toc/ciclciocehhjmkknjhnpaaligmffmpcb)

### Manual Installation

Download the latest zip files from **[GitHub Releases](https://github.com/harshmann10/AI-Chat-TOC/releases)**. If you want to build locally, use the **Build Scripts** section below:

#### Using Pre-built Releases

1. Go to [Releases](https://github.com/harshmann10/AI-Chat-TOC/releases)
2. Download `chrome.zip` or `firefox.zip`
3. Extract the zip file
4. Load in your browser (see instructions below)

#### Loading the Extension

**Firefox:**

- Open `about:debugging#/runtime/this-firefox`
- Click **Load Temporary Add-on**
- Select the `manifest.json` from the extracted folder

**Chrome/Edge:**

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select the extracted folder

---

## 📤 Export Options

Click the **↓** button in the header:

- 📋 Copy as Text
- 📝 Copy as Markdown
- 💾 Download as .txt
- 💾 Download as .md

---

## 🗂️ Project Structure

```
AI Chat TOC/
├── src/                           # Shared source code
│   ├── main.js
│   ├── popup.js
│   ├── popup.html
│   ├── popup.css
│   ├── style.css
│   ├── themes.js
│   └── ui.js
├── icons/                         # Extension icons
├── manifests/                     # Manifest files
│   ├── chrome_manifest.json       # Manifest V3 (Chrome/Edge)
│   └── firefox_manifest.json      # Manifest V2 (Firefox)
├── dev.ps1                        # Development script (generates dist/)
├── build.ps1                      # Production build script
├── LICENSE
└── README.md
```

**Build Process:** The `build.ps1` script combines the `src/` folder with the appropriate manifest file to generate ready-to-use zip files for each platform.

---

## ⌨️ Keyboard Shortcuts

| Shortcut       | Action                             |
| -------------- | ---------------------------------- |
| `Ctrl+Shift+F` | Toggle TOC visibility (Customizable in browser) |
| 📋 Copy button | Hover over item to see copy button |

### How to Customize the Shortcut

You can change the `Ctrl+Shift+F` shortcut natively in your browser:
*   **Chrome / Edge**: Go to `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`), find "AI Chat TOC", and type your preferred key combination.
*   **Firefox**: Go to `about:addons`, click the **Gear** icon ⚙️ in the top right, select **Manage Extension Shortcuts**, and update "AI Chat TOC".

---

## 🚀 Roadmap

- [x] ~~Keyboard shortcut (Ctrl+Shift+F, Customizable)~~
- [x] ~~Copy button on each query~~
- [x] ~~Grok support~~
- [x] ~~Settings page (Theme Customization)~~
- [x] ~~Show Answers in TOC~~
- [ ] More AI platforms

---

## 🛠️ Development

### Build Scripts

#### Local Testing (Development)

```powershell
./dev.ps1
```

Generates a `dist/` folder with:

- `dist/chrome/` - Chrome/Edge version ready to load
- `dist/firefox/` - Firefox version ready to load

Use this when developing and testing locally.

#### Production Build

```powershell
./build.ps1
```

Generates `chrome.zip` and `firefox.zip` for distribution. Use this before releasing.

### Adding a New Site

1. Add config to `SITES` in `main.js`
2. Add URL patterns to both manifests in `manifests/`
3. Add theme/accent color class to `style.css`
4. Test with `dev.ps1` before building with `build.ps1`

---

## 📄 License

[MIT License](LICENSE) - Feel free to use, modify, and distribute.

---

## 🙏 Acknowledgments

This extension was inspired by and built upon [chatgpt_toc](https://github.com/sk5268/chatgpt_toc) by [@sk5268](https://github.com/sk5268). The original project provided the foundation and core concept for this multi-platform extension.

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>
