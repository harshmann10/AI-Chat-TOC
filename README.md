# AI Chat TOC

> 🧭 Navigate long AI conversations with ease

A browser extension that adds a **Table of Contents** sidebar to AI chat interfaces. Never lose track of your conversation again!

<p align="center">
  <img src="https://img.shields.io/badge/version-1.9.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platforms-5-orange" alt="Platforms">
  <a href="https://github.com/sponsors/harshmann10"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=githubsponsors" alt="Sponsor"></a>
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

| Feature                      | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 📋 **TOC Sidebar**           | Lists all your queries in a navigable list                                                        |
| 🍱 **Compact Mode**          | Adaptive multi-column grid of pill badges with zero-jitter hover preview cards                    |
| ⚡ **Virtualization Engine** | Full outline capture for massive conversations without missing messages due to DOM virtualization |
| 🚀 **Instant Outline Cache** | Stores chat outlines locally for sub-second TOC loading on revisited chats                        |
| 🧹 **TOC Cache Manager**     | Live cache storage inspector (chat count & KB size) with one-click cleanup                        |
| 🔍 **Search**                | Filter queries by keyword and AI answer text                                                      |
| 🤖 **Show AI Answers**       | Toggle inline AI response previews                                                                |
| 🌗 **Theme Mode**            | Light / Dark / System modes                                                                       |
| 🖱️ **Drag & Drop**           | Reposition anywhere on screen                                                                     |
| 📐 **Bidirectional Resize**  | Smoothly resize width and height from bottom-left corner with dynamic text reflow                 |
| 🔄 **Instant Updates**       | TOC updates instantly with near-zero lag as you send or receive messages                          |
| 🔄 **Layout Reset**          | Easily restore default layout & position from Settings with one click                             |
| 📱 **Mobile Friendly**       | Touch support & responsive design                                                                 |
| 💾 **Position Memory**       | Remembers position per-site                                                                       |
| 📤 **Export**                | Copy/download as text or markdown                                                                 |
| ⚡ **Highly Optimized**      | Intelligent throttling (300ms/500ms) & idle safety checks                                         |

---

## 📥 Installation

[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox)](https://addons.mozilla.org/firefox/addon/ai-chat-toc/)

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

## ⚡ What's New in v1.9.0: Virtualization Engine & Persistent Cache

Long AI conversations (especially on ChatGPT) use **DOM virtualization**, where messages scrolled out of view are dynamically unmounted from the DOM. In older versions, this meant the TOC could miss questions until you manually scrolled top to bottom.

**Version 1.9.0 introduces a multi-strategy virtualization and outline caching architecture:**

- 🔄 **Dual-Source Hybrid Scanning:**
  - **C3 Backend API Source:** For ChatGPT conversations (`/c/<id>` and `/share/<id>`), securely retrieves the conversation tree in the background to build a complete outline immediately without requiring manual scrolling.
  - **C1 Prompt Bars & C6 DOM Scanner:** Continuously observes live prompt navigation bars and DOM messages as new responses stream in.
  - **Intelligent Merge:** Combines both sources, preserving conversation chronological order and exact scroll geometry.
- 🚀 **Instant Outline Cache (`store.js`, `storage.js`):**
  - Visited chat outlines are securely saved in extension local storage.
  - Re-opening a long chat renders your full TOC outline **instantly with zero lag**, while background sync updates any new responses.
  - Built-in **LRU eviction** ensures storage stays compact and efficient.
- 🧹 **Cache Management & Settings UX:**
  - View your stored outline count and estimated cache size directly in the extension popup.
  - One-click **Clear TOC Cache** button with animated status feedback (`Clearing...` → `Cleared!`).
  - Real-time **Saved** toast for instant confirmation when changing themes or settings.
- 🎯 **Precision Scroll Navigation:**
  - Fixed navigation jumping issues on virtualized chats — clicking any query reliably mounts the target message and smoothly scrolls directly to it.
- 💖 **Integrated GitHub Sponsorship:**
  - Direct access to support project development from the popup header.

---

## 🗂️ Project Structure

```
AI Chat TOC/
├── src/                           # Shared source code
│   ├── main.js                    # Router & lifecycle orchestration
│   ├── popup.html                 # Settings popup UI
│   ├── popup.css                  # Modern popup styling
│   ├── popup.js                   # Settings state & cache management
│   ├── storage.js                 # Cross-browser storage adapter (MV2 / MV3)
│   ├── store.js                   # Persistent TOC outline store & LRU cache
│   ├── style.css                  # TOC sidebar & compact mode styles
│   ├── themes.js                  # Theme definitions & platform defaults
│   ├── ui.js                      # TOC DOM building, drag, resize & interactions
│   ├── virtual.js                 # Multi-strategy virtualization & navigation engine
│   └── test/                      # Strategy test harness & diagnostic metrics
├── icons/                         # Extension icons
├── manifests/                     # Manifest files
│   ├── chrome_manifest.json       # Manifest V3 (Chrome/Edge)
│   └── firefox_manifest.json      # Manifest V2 (Firefox)
├── dev.ps1                        # Development script (generates dist/)
├── build.ps1                      # Production build script (strips tests & console logs)
├── LICENSE
└── README.md
```

**Build Process:** The `build.ps1` script combines the `src/` folder with the appropriate manifest file to generate ready-to-use zip files for each platform.

---

## ⌨️ Keyboard Shortcuts

| Shortcut       | Action                                                   |
| -------------- | -------------------------------------------------------- |
| `Ctrl+Shift+F` | Toggle TOC visibility (Customizable in browser)          |
| `Alt+Shift+C`  | Toggle Compact Navigation Mode (Customizable in browser) |
| 📋 Copy button | Hover over item to see copy button                       |

### How to Customize the Shortcuts

You can change the `Ctrl+Shift+F` or `Alt+Shift+C` shortcuts natively in your browser:

- **Chrome / Edge**: Go to `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`), find "AI Chat TOC", and type your preferred key combinations.
- **Firefox**: Go to `about:addons`, click the **Gear** icon ⚙️ in the top right, select **Manage Extension Shortcuts**, and update "AI Chat TOC".

---

## 🚀 Roadmap

- [x] ~~Keyboard shortcut (Ctrl+Shift+F, Customizable)~~
- [x] ~~Copy button on each query~~
- [x] ~~Grok support~~
- [x] ~~Settings page (Theme Customization)~~
- [x] ~~Show Answers in TOC~~
- [x] ~~Bidirectional Layout Resizing~~
- [x] ~~Compact Navigation Mode (Adaptive Grid & Hover Previews)~~
- [x] ~~Virtualization resilience for long conversations (v1.9.0)~~
- [x] ~~Instant outline persistent caching & LRU eviction (v1.9.0)~~
- [x] ~~TOC Cache management & storage inspector in Settings (v1.9.0)~~
- [x] ~~Precision virtualized message scroll navigation (v1.9.0)~~
- [ ] Additional AI platforms (DeepSeek, etc.)

---

## 🛠️ Development

### Build Scripts

#### Local Testing (Development)

```powershell
./dev.ps1
```

Generates a `dist/` folder with:

- `dist/chrome_test/` - Chrome/Edge version ready to load unpacked
- `dist/firefox_test/` - Firefox version ready to load temporarily

Use this when developing and testing locally.

#### Production Build

```powershell
./build.ps1
```

Generates clean, production-ready `chrome.zip` and `firefox.zip` for store distribution. Automatically strips development test harnesses (`test/*`) and verbose debugging logs.

### Adding a New Site

1. Add config to `SITES` in `main.js`
2. Add URL patterns to both manifests in `manifests/`
3. Add theme/accent color class to `style.css`
4. Test with `dev.ps1` before building with `build.ps1`

---

## 📄 License

[MIT License](LICENSE) - Feel free to use, modify, and distribute.

---

## 💖 Support & Sponsor

If you find **AI Chat TOC** useful and it saves you time navigating conversations, consider supporting ongoing development:

<p align="center">
  <a href="https://github.com/sponsors/harshmann10">
    <img src="https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" />
  </a>
</p>

- **International:** Support via [GitHub Sponsors](https://github.com/sponsors/harshmann10)
- **India:** UPI QR code support coming soon!

---

## 🙏 Acknowledgments

This extension was inspired by and built upon [chatgpt_toc](https://github.com/sk5268/chatgpt_toc) by [@sk5268](https://github.com/sk5268). The original project provided the foundation and core concept for this multi-platform extension.

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>
