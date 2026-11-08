<p align="center">
  <img src="./img.png" width="96" height="96" alt="AI Chat TOC Logo" style="border-radius: 20%;" />
</p>

<h1 align="center">AI Chat TOC</h1>

<p align="center">
  <strong>Navigate long AI conversations with an instant, interactive Table of Contents sidebar.</strong><br>
  Built for <strong>ChatGPT</strong>, <strong>Claude</strong>, <strong>Gemini</strong>, <strong>Perplexity</strong>, and <strong>Grok</strong>.
</p>

<p align="center">
  <a href="https://github.com/harshmann10/AI-Chat-TOC/releases/latest"><img src="https://img.shields.io/github/v/release/harshmann10/AI-Chat-TOC?color=3b82f6&style=flat-square" alt="Version" /></a>
  <a href="https://chromewebstore.google.com/detail/ai-chat-toc/ainbhafdpkbgbkcomkhkilokelolnnpn"><img src="https://img.shields.io/chrome-web-store/users/ainbhafdpkbgbkcomkhkilokelolnnpn?style=flat-square&color=4285F4&logo=googlechrome&logoColor=white&label=Chrome" alt="Chrome Web Store" /></a>
  <a href="https://addons.mozilla.org/firefox/addon/ai-chat-toc/"><img src="https://img.shields.io/amo/users/ai-chat-toc?style=flat-square&color=FF7139&logo=firefox&logoColor=white&label=Firefox" alt="Firefox" /></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/ai-chat-toc/ciclciocehhjmkknjhnpaaligmffmpcb"><img src="https://img.shields.io/badge/dynamic/xml?url=https%3A%2F%2Fbadgen.net%2Fedge-addons%2Fusers%2Fciclciocehhjmkknjhnpaaligmffmpcb&query=%2F%2F*%5Blocal-name()%3D'text'%5D%5Blast()%5D&label=Edge&style=flat-square&color=0078D7" alt="Edge Add-ons" /></a>
  <a href="https://github.com/harshmann10/AI-Chat-TOC/stargazers"><img src="https://img.shields.io/github/stars/harshmann10/AI-Chat-TOC?style=flat-square&color=blue" alt="GitHub Stars" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License: MIT" /></a>
  <a href="https://github.com/sponsors/harshmann10"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?style=flat-square&logo=githubsponsors&logoColor=white" alt="Sponsor" /></a>
</p>

<p align="center">
  <a href="#-why-ai-chat-toc">Why TOC?</a> &nbsp;•&nbsp;
  <a href="#-supported-platforms">Platforms</a> &nbsp;•&nbsp;
  <a href="#-key-features">Key Features</a> &nbsp;•&nbsp;
  <a href="#-installation">Installation</a> &nbsp;•&nbsp;
  <a href="#%EF%B8%8F-keyboard-shortcuts">Shortcuts</a> &nbsp;•&nbsp;
  <a href="#-export-options">Export</a> &nbsp;•&nbsp;
  <a href="#%EF%B8%8F-project-architecture">Architecture</a> &nbsp;•&nbsp;
  <a href="#-support--sponsor">Support</a>
</p>

---

## ⚡ Why AI Chat TOC?

Long AI threads easily span dozens of prompts, deep problem-solving explorations, and extensive code generations. Navigating them natively quickly turns painful:

| The Problem in Long AI Chats | How AI Chat TOC Solves It |
| :--- | :--- |
| **Endless Scroll Fatigue**<br>Finding an earlier prompt in a 50+ message conversation requires exhausting manual mouse scrolling. | **Instant 1-Click Message Jump**<br>A floating, draggable outline lists every query. Click any item to jump straight to it with a smooth flash highlight. |
| **DOM Virtualization Message Loss**<br>ChatGPT unmounts off-screen messages to save memory, making native browser <kbd>Ctrl</kbd>+<kbd>F</kbd> and scrolling fail on long threads. | **Virtualization Engine & Backend API Sync**<br>Hybrid scanning combines ChatGPT's conversation tree API with live DOM observers, capturing complete outlines even for unmounted turns. |
| **Screen Clutter on Narrow Displays**<br>Static sidebars permanently consume horizontal reading space and clash with web app layouts. | **Draggable, Resizable & Compact Mode**<br>Freely reposition anywhere, resize bidirectionally, collapse to an ultra-compact number grid (`[1] [2] [3]`), or minimize to a corner pill. |
| **Laggy Outlines on Return**<br>Revisiting past conversations forces users to wait while the page slowly rescans and re-renders. | **Persistent Outline Cache (LRU)**<br>Chat outlines are saved locally in persistent storage, rendering instantly (< 50ms) with seamless background sync. |
| **Fragmented Platform Navigation**<br>Every AI provider uses different layouts, and ChatGPT even deleted its own native prompt-navigation UI. | **One Unified, Polished Interface**<br>Consistent shortcuts, dark/light themes, and automatic native accent matching across all 5 major platforms. |

---

## 🌐 Supported Platforms

AI Chat TOC natively adapts to each platform's design language, theme modes, and DOM structure:

| Platform | Host URL | Accent Theme | Status |
| :--- | :--- | :--- | :--- |
| **ChatGPT** | `chatgpt.com` | Emerald (`#10a37f`) | ✅ Fully Supported (New Reverse-Scroll & Virtualized UI) |
| **Claude** | `claude.ai` | Sunset (`#ea580c`) | ✅ Fully Supported |
| **Gemini** | `gemini.google.com` | Sapphire (`#4285f4`) | ✅ Fully Supported |
| **Perplexity** | `perplexity.ai` | Teal (`#20b2aa`) | ✅ Fully Supported |
| **Grok** | `grok.com` | Slate (`#0f172a` / `#f8fafc`) | ✅ Fully Supported |

---

## ✨ Key Features

### 1. 🧭 Interactive Outline & Precision Jump
- **Complete Conversation Tree**: Lists all your prompts in an organized, numbered sequence.
- **Precision Scroll Engine**: Overcomes ChatGPT's reverse-scroll flex model (`column-reverse` scroller) and DOM unmounting to land exactly on target messages without getting stuck.
- **Visual Spotlight**: Briefly highlights the target message when clicked so your eyes locate it instantly.

---

### 2. 🍱 Compact Navigation Mode
- **Adaptive Number Grid**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> to transform the sidebar into a minimal, space-saving pill grid (`[1]` `[2]` `[3]`).
- **Zero-Jitter Hover Cards**: Hover over any pill badge to instantly view the question text and AI answer preview card.
- **Fluid Layout**: Automatically flows across columns based on window width.

---

### 3. ⚡ Virtualization Engine & API-First Outlines
- **Dual-Source Hybrid Discovery**: Integrates ChatGPT's internal conversation API tree with live DOM observers to construct a 100% complete outline in ~3 seconds.
- **Unread Notification Dot**: When the TOC is minimized to a corner pill, a clean indicator dot lights up when new messages arrive and clears automatically upon expanding or switching chats.
- **Direction-Agnostic Scroller**: Normalized coordinate engine seamlessly navigates both classic scroll containers and modern reverse-scroll threads.

---

### 4. 🚀 Instant Outline Cache & Storage Inspector
- **Sub-Second Hydration**: Visited conversation outlines are cached locally using LRU eviction, rendering instantly upon re-opening previous chats.
- **TOC Cache Manager**: Open the extension popup anytime to inspect saved chats, storage footprint (in KB), or wipe local cache with one click.

---

### 5. 🔍 Real-Time Search & Inline AI Answers
- **Instant Keyword Filter**: Search across your queries and AI responses in real-time.
- **Dynamic Query Counters**: Displays live `X of Y queries` matches and empty search guidance.
- **Inline Answer Previews**: Toggle AI response summaries directly underneath each query row in Settings.
- **Quick Copy**: Click the copy icon on any query or answer to grab markdown or plain text with one click.

---

### 6. 🎨 Modern Glassmorphic UI & Ergonomics
- **Frosted Glass Backdrop**: High-performance backdrop blur blending smoothly into light and dark interfaces.
- **Free Floating & Memory**: Drag the header to position the TOC anywhere; positions are remembered per-platform.
- **Bidirectional Resize**: Drag the corner handles to resize width and height freely with dynamic text reflow. Double-click corner handles to reset to defaults.
- **Theme Matching**: Supports Light, Dark, and System modes with 7 distinct accent palettes (Emerald, Sapphire, Teal, Sunset, Slate, Rose, Violet).

---

## 📥 Installation

### Install from Web Stores (Recommended)

Click below to install directly from your browser's official store:

<p>
  <a href="https://chromewebstore.google.com/detail/ai-chat-toc/ainbhafdpkbgbkcomkhkilokelolnnpn">
    <img src="https://img.shields.io/badge/Install%20for-Google%20Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Install in Chrome" />
  </a>
  <a href="https://addons.mozilla.org/firefox/addon/ai-chat-toc/">
    <img src="https://img.shields.io/badge/Install%20for-Mozilla%20Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Install in Firefox" />
  </a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/ai-chat-toc/ciclciocehhjmkknjhnpaaligmffmpcb">
    <img src="https://img.shields.io/badge/Install%20for-Microsoft%20Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Install in Edge" />
  </a>
</p>

---

### Manual / Developer Installation

You can also download pre-built release packages from **[GitHub Releases](https://github.com/harshmann10/AI-Chat-TOC/releases)**:

#### Chrome, Edge, Brave, Opera (Manifest V3)
1. Download `chrome.zip` from the latest release and extract it.
2. Navigate to `chrome://extensions` in your browser.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extracted folder.

#### Firefox (Manifest V2)
1. Download `firefox.zip` from the latest release and extract it.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**
4. Select `manifest.json` from the extracted folder.

---

## ⌨️ Keyboard Shortcuts

| Action | Windows / Linux | macOS | Configurable |
| :--- | :--- | :--- | :--- |
| **Toggle TOC Visibility** | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | ✅ Yes |
| **Toggle Compact Mode** | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> | <kbd>Option</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> | ✅ Yes |
| **Clear Search / Close Menus** | <kbd>Escape</kbd> | <kbd>Escape</kbd> | — |

### Customizing Shortcuts:
- **Chrome / Edge / Brave**: Navigate to `chrome://extensions/shortcuts`, find **AI Chat TOC**, and assign your preferred key combinations.
- **Firefox**: Open `about:addons` $\rightarrow$ click the **Gear icon (⚙️)** in the top right $\rightarrow$ select **Manage Extension Shortcuts**.

---

## 📤 Export Options

Click the export button (**↓**) in the TOC header to quickly export your conversation outline:

- 📋 **Copy as Plain Text** — Clean indented list of questions.
- 📝 **Copy as Markdown** — Formatted outline with bullet links.
- 💾 **Download as `.txt`** — Offline plain-text file.
- 💾 **Download as `.md`** — Formatted Markdown document ready for Obsidian, Notion, or GitHub.

---

## 🗂️ Project Architecture

```text
AI Chat TOC/
├── .github/workflows/
│   └── release.yml            # Automated multi-browser release & packaging workflow
├── src/
│   ├── main.js                # Platform router, lifecycle observers & SITES configurations
│   ├── ui.js                  # TOC DOM tree, drag/resize physics, search, animations & events
│   ├── themes.js              # Theme definitions, platform accent defaults & settings persistence
│   ├── virtual.js             # ChatGPT multi-strategy virtualization & precision scroll engine
│   ├── store.js               # Persistent outline store, LRU caching & direction-agnostic scroller
│   ├── storage.js             # Cross-browser storage adapter (MV2 Promise / MV3 Callback compat)
│   ├── popup.html             # Extension settings modal UI
│   ├── popup.css              # Glassmorphic settings styling
│   ├── popup.js               # Settings interactions, theme switches & cache inspector
│   ├── style.css              # Complete TOC sidebar styles, compact mode & keyframe animations
│   └── test/                  # Architecture test harness (excluded from production builds)
├── icons/                     # Extension branding icons (48x48, 128x128)
├── manifests/
│   ├── chrome_manifest.json   # Manifest V3 (Chrome, Edge, Chromium)
│   └── firefox_manifest.json  # Manifest V2 (Firefox Add-ons)
├── img.png                    # Extension branding logo
├── dev.ps1                    # Fast development builder (unpacks to dist/)
├── build.ps1                  # Production zip builder (strips tests & minifies)
├── AGENTS.md                  # Assistant guidelines, architectural invariants & release rules
└── README.md                  # Extension documentation
```

---

## 🛠️ Development & Build Scripts

AI Chat TOC uses native PowerShell scripts for local development and store packaging:

### Local Development (`dev.ps1`)
Unpacks and prepares testing builds inside `dist/`:
```powershell
./dev.ps1
```
- `dist/chrome_test/` — Ready to load unpacked in Chrome or Edge.
- `dist/firefox_test/` — Ready to load temporarily in Firefox.

### Production Packaging (`build.ps1`)
Packages clean, production-ready release archives:
```powershell
./build.ps1
```
Generates `chrome.zip` and `firefox.zip` in the root directory while stripping test suites (`src/test/`), developer comments, and verbose console logging.

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE). You are free to use, modify, and distribute it.

---

## 💖 Support & Sponsor

If **AI Chat TOC** saves you time navigating complex AI conversations, consider supporting ongoing maintenance and new platform adaptations:

<p align="center">
  <a href="https://github.com/sponsors/harshmann10">
    <img src="https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" />
  </a>
</p>

---

## 🙏 Acknowledgments

AI Chat TOC was inspired by and built upon the foundational work of [chatgpt_toc](https://github.com/sk5268/chatgpt_toc) by [@sk5268](https://github.com/sk5268).

<p align="center">
  <strong>⭐ Star this repository if you find it helpful!</strong>
</p>
