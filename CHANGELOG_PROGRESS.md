# AI Chat TOC — Change History and Remaining Work

> Consolidated status of the extension work through v1.9.2, the UI/animation follow-ups, and the implemented v1.9.3 navigation change set (pagination-hold jumps, scan start fix, unconditional API outline). This is a working status document, not a release note. Some edits are currently staged or unstaged; no commit or release is implied.

## Current Snapshot

- Current manifest version: **1.9.3** (Chrome/Edge and Firefox) — bumped for the pending navigation change set; no commit, tag or release has happened yet.
- ChatGPT's redesigned, virtualized conversation UI is supported through the new turn selectors, API-first outline, layout-agnostic scroll helpers, and active-conversation scoping.
- **2026-11:** ChatGPT lazy-loads older messages in ~10-turn pages that only materialize while the viewport dwells at the oldest boundary, and the thread scroller has flipped back from `column-reverse` to plain `column`. The jump engine and C7 scan now handle both (pagination hold + re-pin; scan dwell is skipped when C3 says the oldest turn is already mounted).
- The "Conversation API (ChatGPT)" settings toggle has been **removed** — the API-first outline is unconditional because navigation depends on it.
- Collapse/expand currently uses opacity and `transform: scale()` keyframes rather than animating panel width/height. This was adopted after text-heavy long chats exposed jank in the earlier layout-morph experiment.
- The update indicator currently uses newly added row animation, an unread dot while the TOC is collapsed, an accessible live region, and a brief ambient accent glow. The earlier `+N` count chip was removed in the latest working-tree UI edits.
- The worktree contains staged/unstaged edits. Review `git status` before building or preparing a release, and preserve those edits.

## Changes Completed

### Virtualized conversation support

- Added a unified message store with stable message IDs, role/text data, ordering, deduplication, and persistent ChatGPT outline caching with LRU management.
- Added ChatGPT API-backed conversation extraction, including active-branch parsing, visible-message filtering, multimodal-safe text parsing, token/error handling, and merge with DOM-derived data.
- Added DOM accumulation and scroll scanning as complementary/fallback sources. The prompt-bar strategy was later removed after ChatGPT removed the prompt-bar UI.
- Added message navigation using stable message IDs and API positions, with mounted-element verification and a best-effort virtualized search path.
- Added a direction-independent scroll abstraction for ChatGPT's redesigned `column-reverse` thread, where native `scrollTop` runs from `-maxTop` to `0`.
- Added SPA chat identity handling, store reset, active-thread selection, and protection against scanning the outgoing/hidden conversation during chat switches.

### Settings, storage, and live updates

- Removed the "Conversation API (ChatGPT)" toggle from the settings popup (v1.9.3). The API-first outline started as an experimental opt-in (v1.9.0), became an opt-out default (v1.9.2), and is now unconditional: after the 2026-11 pagination fix, C3's `apiIndex`/`apiTotal` are load-bearing for the ratio jump and the pagination hold, so a DOM-only mode would break distant-target navigation. Stale stored `experimentalAPI: false` values are ignored, which migrates pre-1.9.3 opt-outs automatically. The dead storage-change listener and `getSetting()` helper were removed with it.

- Restricted the storage-change listener to real settings keys. The persistent cache shares `chrome.storage.local`; cache writes must not be interpreted as settings changes or trigger rebuilds.
- Changed settings updates to reuse the existing TOC and update it in place, preserving search/list state rather than destroying and recreating the container.
- Added diff-based detection of newly added TOC rows. Only new rows enter with an animation; existing rows are not replayed.
- Added an accessible `role="status"` / `aria-live="polite"` region for new-item announcements.
- Added a collapsed-pill unread indicator. It clears when expanded and is also cleared on conversation change so unread state does not carry into another chat.
- Replaced the earlier numeric `+N` footer chip with a simple dot in the current staged UI changes. Settings and scan feedback should remain intentional rather than reacting to every cache write.

### Collapse/expand animation iterations

- v1.9.0 narrowed the panel transition to color properties, so the box snapped between expanded and collapsed states.
- Restored a size/position morph and unified button, keyboard, and popup toggling paths. Fixed the collapsed anchor-size mismatch and saved-size restoration issues.
- The layout morph then stuttered in long-prompt chats: changing panel width forced repeated text reflow for clamped, word-breaking rows. A frozen-list-width experiment reduced reflow, but it was not the final animation design.
- The current implementation uses opacity and `transform: scale()` keyframes for collapse/expand, followed by a small pill-entry animation. This avoids animating panel width/height during the visible morph and follows the project invariant to prefer composited properties.
- Reduced-motion preferences are handled separately so the panel does not depend on the animation to become usable.

### ChatGPT redesigned UI fixes documented in FINDINGS.md

- Updated selectors for the new conversation DOM and removed reliance on prompt bars.
- Added reverse-scroll logical helpers and updated scan/navigation paths for the new scroller.
- Fixed a fatal malformed-selector path in conversation identity initialization.
- Replaced reliance on isolated-world `history.pushState` hooks alone with URL polling and shared navigation signals.
- Scoped all turn queries to the active conversation and removed unsafe fallback behavior that could leak messages from the previous chat.
- Cleared stale rendered rows when changing conversations.

### Very-large-chat navigation fix & UX feedback (v1.9.3 change set, implemented + verified live 2026-11-10)

- **Root cause (live, FINDINGS.md §6):** ChatGPT lazy-loads older messages in ~10-turn pages (`/messages?before=<uuid>`) only while the viewport dwells at the oldest materialized boundary; the old jump's stuck-reversal scrolled AWAY from that boundary, so distant targets never mounted — the reported "goes up, down somewhat and just stop".
- **Pagination hold** (`performVirtualJump` §3.5): when the target is older than the earliest mounted position, pin logical 0, re-pin as pages prepend (ChatGPT scroll-anchoring moves `scrollTop` under you), never reverse while pinned, deadline scaled by page distance (~10 turns/page, 60 s cap). Verified: oldest of 265 resolved in ~25 s.
- **Far-target ratio re-pinning:** targets with a known `apiIndex` farther than ~12 positions re-aim at `maxTop × ratio` each sweep round (recomputed against the CURRENT maxTop, which grows as heights settle). Verified: newest of 264 in 2.4 s, mid in 9 s.
- **Giant-turn start-align:** `finish()` scrolls to the START of turns taller than ~1.5 viewports (a 25k-char message renders ~46k px; centering landed mid-turn).
- **Scan start fix:** C7's `materializeAtOldest` dwell is skipped when the earliest mounted `apiIndex ≤ 1` (true top already mounted) — small/medium chats scan instantly (3.8 s on a 3-row chat, was ~9 s with a flat 5 s idle tax), while giant chats still dwell to materialize the full top region.
- **Item navigation feedback & re-click cancel:** Clicking a question or answer starts an active pulsing highlight (`.toc-navigating` in standard mode; scaling highlight in compact mode) indicating that navigation is underway. Re-clicking the currently navigating item cancels the jump via `Navigator.cancelJump()`. User cancellations (re-click or manual wheel scroll) suppress the false `"Message not in view"` error toast and surface `"Navigation cancelled"` upon explicit cancel.
- **Scan stop on re-click:** Re-clicking `#toc-scan-btn` while scanning immediately halts the async scan loop via `C7.abort()`, restores the original query count, updates the button title, and displays a `"Scan stopped"` confirmation toast.
- **Clean footer invariant:** The footer remains a pure, centered query count (`X queries`); all interactive navigation feedback is anchored directly to the clicked row and the scan button.

## Remaining Work

### High priority: test harness migration

- `src/test/strategies/` still contains selectors and native scroll assumptions from ChatGPT's previous UI. Migrate the C1/C3/C4/C6/C7 tests to the current turn keys, message IDs, active-thread helpers, and logical scroll API.
- C1 prompt-bar tests should be removed or marked unsupported because that UI no longer exists.
- Drive the harness in the extension's isolated-world context; `window.TOC` is not available from the page's main world.

### Verification and release readiness

- Already verified live (2026-11-09, real Edge + ChatGPT): distant-target jumps in a 265-node chat (oldest/newest/middle), giant-turn start alignment, instant scan start on small chats, pagination-hold capture on the big chat, popup renders cleanly with the API toggle removed, `node --check` on all touched files.
- Re-test the current transform morph on the reported long-prompt chats, including long assistant content and Show Answers. The transform rewrite is implemented, but actual smoothness on the user's target chats remains the final acceptance check.
- Run the full sweep before release: `node --check` on every JS file, the production `build.ps1`, and Chrome/Edge plus Firefox smoke tests on the final build.
- Reload the unpacked extension and affected chat tabs when testing; an already injected content script continues running old code.
- Test-environment gotcha: the Edge profile has the STORE build (`ciclciocehhjmkknjhnpaaligmffmpcb`) and the unpacked dev build (`geoljgcmnlgpgblfcpageafgklffdpfk`); the store copy was toggled off during live testing — re-check before store-version smoke tests.
- Before release: bump manifests to v1.9.3, update the README version badge and "What's New", review the staged workflow changes and removed `img2.png`, then follow `AGENTS.md`. Do not commit, tag, or push without explicit approval.

### Optional future work (v1.9.4 candidates — from the GPT-Conversation-Toolkit research)

- **Passive page-capture** (their best idea, ranked #1): a MAIN-world `fetch`/`XHR` hook silently captures ChatGPT's own conversation + lazy `/messages` responses and merges them into the C3 index (with "never downgrade a complete index" guards). Grows `apiIndex` coverage of the distant tail for free as the user browses; complements, does not replace, our pagination hold.
- **MutationObserver rendered-window wait**: replace scrollHeight/signature polling in the hold loop with "did the mounted key-set change within 2.5 s?" (their `waitForMessageWindowMutation`, 40 ms debounce) — immune to re-anchor noise.
- **Boundary dwell + 24 px nudge**: element-anchored nudge (`scrollIntoView(oldestMounted, "start")` + nudge) may trigger ChatGPT's loader more reliably than scrollTop pinning; subordinated to the hold, never replacing it.
- **Jump progress HUD**: a rich modal/pill HUD with page counter and retry back-off (the lightweight row feedback and re-click cancel shipped in v1.9.3).
- **Timeboxed spike, opt-in only**: React-fiber `scrollToIndex` bridge (they shipped it DISABLED with zero callers — validate against the live UI before investing).
- Additional platform support (for example DeepSeek) is a product roadmap item, not required to close the current ChatGPT virtualization work.
- Keep selector updates and platform-specific DOM assumptions centralized and documented as those sites change.

## Source of Truth

- [`AGENTS.md`](AGENTS.md): architecture invariants, current ChatGPT implementation rules, verification and release process.
- [`FINDINGS.md`](FINDINGS.md): live findings, resolved ChatGPT regressions, the 2026-11 lazy-pagination root cause + fix recipe, and test harness migration list.
- [`PLAN.md`](PLAN.md): historical v1.9.0 research and implementation plan; it is marked superseded and should not be treated as the current implementation checklist.
