# AGENTS.md — AI Chat TOC

This document provides architectural context, critical invariants, build commands, and the standard release procedure for any AI assistant working on the **AI Chat TOC** extension codebase.

---

## 1. Project Overview

**AI Chat TOC** is a high-performance browser extension that injects a draggable, resizable Table of Contents sidebar into major AI chat platforms:

- **ChatGPT** (`chatgpt.com`)
- **Claude** (`claude.ai`)
- **Gemini** (`gemini.google.com`)
- **Perplexity** (`perplexity.ai`)
- **Grok** (`grok.com`)

### Dual-Manifest Packaging

- **Chrome / Edge**: Manifest V3 ([`manifests/chrome_manifest.json`](manifests/chrome_manifest.json))
- **Firefox**: Manifest V2 ([`manifests/firefox_manifest.json`](manifests/firefox_manifest.json))

---

## 2. Directory & Component Structure

```text
AI Chat TOC/
├── .github/workflows/
│   └── release.yml            # GitHub Actions automated build & release pipeline
├── src/
│   ├── main.js                # Router, platform configuration & lifecycle orchestration
│   ├── ui.js                  # TOC DOM construction, drag & resize, animations, events
│   ├── themes.js              # Theme manager, platform colors, settings persistence
│   ├── virtual.js             # ChatGPT multi-strategy virtualization & precision navigator
│   ├── store.js               # Persistent outline cache with LRU eviction
│   ├── storage.js             # Cross-browser storage adapter (MV2 / MV3 compat)
│   ├── popup.html             # Extension settings popup UI
│   ├── popup.css              # Settings popup styling
│   ├── popup.js               # Settings interactions & cache management
│   ├── style.css              # TOC sidebar, compact mode, animations & scrollbar styles
│   └── test/                  # Test harness & metrics (stripped in production builds)
├── icons/                     # Extension branding icons
├── manifests/                 # Platform manifest definitions
│   ├── chrome_manifest.json   # MV3 manifest
│   └── firefox_manifest.json  # MV2 manifest
├── dev.ps1                    # Local dev unpack script (outputs to dist/)
├── build.ps1                  # Production zip packaging script (cross-platform pwsh)
├── AGENTS.md                  # AI agent guidelines, invariants & release procedures (this file)
└── README.md                  # User-facing features & documentation
```

---

## 3. Critical Architectural Invariants

Whenever modifying code in `src/`, preserve these core rules:

1. **Performance is Priority #1**:
   - Animations must strictly touch GPU-composited properties only (`transform`, `opacity`).
   - Never animate `width`, `height`, `left`, `top`, or `margin` during panel collapse/expand. Layout thrashing causes severe frame drops in long conversations.
2. **Never Store Stale DOM Elements Across Virtualization**:
   - In virtualized chats (ChatGPT, Claude), off-screen DOM nodes are continually unmounted and re-mounted.
   - Store stable message IDs / indices (`_storeId`, `data-store-id`), never direct DOM node references.
3. **In-Place DOM Patching**:
   - `createTOC()` uses DocumentFragments and updates existing `<li>` items in-place where possible to avoid full list rebuilds and visual flickering.
4. **CSS Animation Restarts Must Force Reflow**:
   - When restarting a CSS keyframe animation dynamically (e.g. [`pulseContainer()`](src/ui.js)), always read `void element.offsetWidth` between class removal and re-addition. Without this, browsers batch the style recalculation and skip restarting the animation.
5. **Preserve Cross-Browser Compatibility**:
   - Custom scrollbars must include both standard CSS (`scrollbar-width: thin; scrollbar-color: ...`) for Firefox and `::-webkit-scrollbar` for Chromium.
   - Storage operations must use the safe storage adapter (`storage.js`) supporting Chrome callback and Firefox Promise APIs.
6. **Scroll Position Is Layout-Dependent (CRITICAL — ChatGPT New UI)**:
   - ChatGPT's conversation thread scroller has **flipped layouts before and may flip again** (2026-10: `column-reverse`; 2026-11: plain `column`). On `column-reverse` the native `scrollTop` range is **`[-maxTop, 0]`**: `0` is the _newest_ message and `-maxTop` is the _oldest_; assigning a positive value (or `scrollTo({ top: >0 })`) is **silently clamped and does nothing** — this broke every scroll, scan step and jump during the 2026-10 rollout.
   - Never do raw scroll math and never assume a direction. Use the `window.TOC.scroll` helpers in [`store.js`](src/store.js), which expose one logical axis (`0` = oldest, `maxTop` = newest) that behaves identically on both layouts: `getLogical()`, `setLogical()`, `scrollByElement()`, `isReverse()`, `maxTop()`.
   - `scrollByElement()` uses a viewport delta rather than an absolute offset, so it stays correct even while the virtualizer rewrites `scrollHeight` mid-operation.
7. **Git Safety & Permission Policy (CRITICAL)**:
   - **NEVER** run `git commit`, `git tag`, or `git push` without an explicit request or permission from the user.
   - Always prepare changes, run verification checks, and show the proposed commit message or tag command to the user. Wait for user confirmation before executing any Git write operations.
8. **SPA Navigation Must Be Detected Cross-World (CRITICAL — ChatGPT New UI, 2026-10)**:
   - Content scripts run in an **isolated world**, and DOM objects (`window.history` included) get a **separate JS wrapper per world**. Expando patches made from the extension (`history.pushState = …`) are therefore invisible to page scripts: a site router calling its own `pushState` never reaches them.
   - Verified live 2026-10-10: a main-world probe caught the router's `pushState` while the isolated-world patch never fired — chat switches went completely unnoticed and the TOC kept the previous chat's rows forever.
   - Navigation detection must use channels that ARE shared: `location.href` polling (~500 ms), `popstate`/`hashchange` events, and a `MutationObserver` on `<head>` (the route change swaps `<title>`).
9. **Scope Every Turn Query to the ACTIVE Conversation (CRITICAL — ChatGPT New UI, 2026-10)**:
   - During a chat swap ChatGPT keeps the OUTGOING thread mounted: there are **two `.thread-scroll-container` elements** (the old one hidden, `clientHeight === 0`) and a plain `document.querySelector` returns the OLD one. A document-wide `[data-turn-key]` query then absorbs the previous chat's turns into the new store — this is the "every chat adds its messages to the same TOC" bug.
   - Always resolve turns/containers via `window.TOC.dom.activeTurns()` / `window.TOC.dom.threadContainer()` ([`store.js`](src/store.js)): they match containers by the per-turn `[data-chatgpt-selection-conversation-id]`, then fall back to visibility, then newest.
   - **Never** fall back to the unfiltered turn set when the conversation-id filter excludes everything — that fallback IS the leak. An empty result is the correct answer for "all mounted turns belong to another chat".
   - `extractConversationId()` ([`store.js`](src/store.js)) must stay URL-only. A DOM fallback returns the PREVIOUS chat's id while the outgoing thread is still mounted, so `getCurrentId()` never changes and the store is never reset.
   - Any value in `SELECTORS.chatgpt` may be a bare attribute name (`convIdAttr`, `turnKeyAttr`, `unitKeyAttr`) or a full selector (`turnContainerNew`, `scrollContainerNew`). Attribute names go inside `[brackets]`; full selectors must **never** be wrapped again — `[[data-turn-key]]` throws a `SyntaxError` that aborts all of `store.js` on every no-id page load (e.g. `chatgpt.com/`), which kills `ConversationIdentity`, `StoreManager` and the router for the whole page session.
10. **API-First Outline Source (v1.9.2)**:

- `C3` (ChatGPT conversation API) is **ALWAYS on (v1.9.3)** — it is load-bearing for navigation: the ratio jump and the pagination hold both read `apiIndex`/`apiTotal`. The old `experimentalAPI` opt-out setting was removed from the popup (stale stored `false` values are ignored, so pre-1.9.3 opt-outs are migrated automatically). Do not reintroduce a DOM-only mode. `/share/` is always enabled (no auth needed).
- After a successful merge, `C3` stamps `apiIndex` (position in the API's linear branch) on every message and sets `store.apiTotal`. Those two values make the Navigator's ratio jump exact — never drop them from `add` / `update` / `serialize` / `hydrate` / `replaceAll` / `toSnapshot` or navigation silently degrades to the slower directional search.
- `mergeC3Data` matches by exact message UUID first (C6 keys new-UI records with the API's own UUIDs); index/prefix matching stays only for legacy bar stubs.
- Fetch hardening: two endpoint candidates, a `current_node → parent` completeness walk (a truncated mapping must never seed the outline), a 10 s `AbortController` timeout, one token refresh on 401, and a **bounded** paginated fallback (`MAX_PAGES = 5`).

11. **The Navigator Never Lies (v1.9.2)**:

- On the new UI, `Navigator.navigateTo` delegates to `performVirtualJump`, which returns `true` **only** after a mounted element was verified by turn key / message id. Never report success for "a scroll happened" — the UI would suppress its "Message not in view" toast.
- The jump must cancel on user intent (`wheel` / `touchstart` / `pointerdown` / `keydown`), when a newer jump starts (`activeJumpToken`), and on SPA navigation (the module-level `onUrlChange` handler bumps the token so a 12 s jump can never scroll the previous conversation's thread).
- **Navigation Feedback & Re-Click Cancel (v1.9.3)**: When a TOC query or answer is clicked to navigate, that row/badge pulses (`.toc-navigating`) to give immediate visual feedback. Re-clicking the active item cancels the jump via `Navigator.cancelJump()`. User cancellations (re-click or manual scroll) suppress the false `"Message not in view"` toast and surface a clean `"Navigation cancelled"` toast when explicitly cancelled.
- **Scan Stop on Re-Click (v1.9.3)**: Clicking the scan button while scanning invokes `C7.abort()`, halts the async scan loop immediately, restores the original query count, and toasts `"Scan stopped"`.
- **Clean Footer Invariant**: The footer remains a pure, centered query count (`X queries`); all interactive navigation feedback is anchored directly to the clicked row and the scan button.
- After C3 stamps positions onto existing records, call `store.sort()` once — the merge sorted _before_ those positions were known, so without the extra sort stamped records keep a heuristic slot and the rendered order is wrong.
- C7's scan step is adaptive: it only grows while consecutive mounted windows overlap (`mountedTurnRange`); on a detected gap it rewinds one step, shrinks (`× 0.6`, floor 0.5 viewport) and rescans. Keep the rewind bounded (`stepGapUndos < 6`) so a bad turn-number parse can never cause a loop.
- The prompt-bar scanner (C1) is **deleted** (v1.9.2) — ChatGPT removed that UI, so its selectors and call sites must not be reintroduced.
- **Older pages are lazy-loaded (2026-11)**: ChatGPT fetches older messages in ~10-turn pages (`GET /backend-api/conversations/<id>/messages?before=<uuid>`) only while the viewport **dwells at the oldest materialized boundary**. Distant jumps and top-region scans must pin logical 0 and re-pin as pages prepend (its scroll anchoring moves `scrollTop` under you); never oscillate/reverse at the boundary — that suppresses the dwell and the target never mounts. The thread scroller may also flip between `column` and `column-reverse`; always route scroll math through `window.TOC.scroll` (see invariant 6), never assume a direction.

---

## 4. Verification & Build Commands

Before creating a release or finishing changes:

```powershell
# 1. Syntax check all JS files
node --check src/ui.js
node --check src/themes.js
node --check src/main.js
node --check src/virtual.js
node --check src/store.js
node --check src/storage.js
node --check src/popup.js

# 2. Build production zip archives
# (Strips dev test harnesses and debug console.log lines automatically)
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

---

## 5. Release & Tagging Procedure (How to Publish)

The repository has an automated GitHub Actions pipeline ([`.github/workflows/release.yml`](.github/workflows/release.yml)) that builds, packages, and attaches `chrome.zip` and `firefox.zip` to a new GitHub Release.

> [!CAUTION]
> **EXPLICIT USER PERMISSION REQUIRED FOR GIT WRITE OPERATIONS**:
> AI assistants must **never** run `git commit`, `git tag`, or `git push` autonomously.
> Always prepare the file changes, run verification, show the proposed commit/tag message to the user, and wait for their explicit permission before running any Git write commands.

### Step-by-Step Release Flow for Agents:

1. **Bump Manifest Versions**:
   Update `"version"` in both:
   - [`manifests/chrome_manifest.json`](manifests/chrome_manifest.json)
   - [`manifests/firefox_manifest.json`](manifests/firefox_manifest.json)

2. **Update README.md**:
   - Ensure the version badge (`img.shields.io/badge/version-X.Y.Z-blue`) matches the new version.
   - Update `What's New in vX.Y` with concise highlights of changes.

3. **Verify Build**:
   Run `node --check` and `powershell -ExecutionPolicy Bypass -File .\build.ps1` to ensure archives build cleanly.

4. **Commit & Push to Main**:

   ```bash
   git add manifests/ README.md src/ build.ps1
   git commit -m "chore: bump version to vX.Y.Z"
   git push origin main
   ```

5. **Tag and Push the Git Release Tag**:
   Create an annotated tag containing the release summary in `-m`:

   ```bash
   git tag -a vX.Y.Z -m "### Highlights
   - Summary of feature 1
   - Summary of feature 2"
   git push origin vX.Y.Z
   ```

   > [!IMPORTANT]
   > **Tag message format is load-bearing** — the release title and body are extracted from it:
   > 1. **First line must be `vX.Y.Z: Descriptive Title`** (e.g. `v1.9.1: UI Polish, Frosted Glass Export Menu & Smooth Animations`). The workflow only accepts a title whose first line matches `^vX.Y.Z[:\s]` / `^v\d+\.\d+`; anything else falls back to the literal string `Release vX.Y.Z`.
   > 2. **Write the file with `--cleanup=verbatim`** when using `-F <file>`: Git's default cleanup **strips every line starting with `#`**, which silently deletes a `## What's Changed` heading (and any heading as the first line).
   > ```bash
   > git tag -a vX.Y.Z --cleanup=verbatim -F notes.md
   > ```
   > 3. The body becomes the release notes (the `**Full Changelog**` footer is appended automatically), so write it in the same style as previous releases: a `## What's Changed in vX.Y.Z` heading followed by emoji bullets.
   > 4. `actions/checkout` runs with `fetch-tags: true` so the annotated tag object is actually available to the workflow — do not remove it, or the release will fall back to the commit message.

   To fix a release published with the wrong title/body, re-create the tag with the correct message (delete + re-push the tag, or run the workflow manually via **workflow_dispatch** with the `release_title` and `release_notes` inputs). `softprops/action-gh-release` updates an existing release for the same tag.

6. **Automated Pipeline Takes Over**:
   - GitHub Actions detects the `v*` tag.
   - It runs syntax validation and `./build.ps1`.
   - It extracts the tag message from `-m` as the release body.
   - It creates the GitHub Release **Release vX.Y.Z** and attaches `chrome.zip` and `firefox.zip`.
