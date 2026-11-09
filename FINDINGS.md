# 🧪 AI Chat TOC — Findings & Handoff

> **Last updated:** 2026-11-10
> **Environment:** Windows · Microsoft Edge · ChatGPT redesigned conversation UI
> **Extension under test:** AI Chat TOC **1.9.3** loaded unpacked from `dist/chrome_test` (Web Store copy **1.9.1** may also be installed — see §5 gotcha)

---

# 🔴 PART 1 — Why the TOC broke on ChatGPT (RESOLVED in 1.9.2)

## Symptom

The TOC sidebar did not appear at all on `chatgpt.com`.

## Root cause — every selector matched zero elements

ChatGPT's redesign replaced every DOM hook the extension relied on. Live-measured match counts:

| Extension selector                                      | Live matches  |
| ------------------------------------------------------- | ------------- |
| `[data-message-author-role="user"]`                     | **0**         |
| `[data-message-author-role="assistant"]`                | **0**         |
| `[data-testid^="conversation-turn-"]`                   | **0**         |
| `[data-turn-id]` / `[data-message-id]`                  | **0** / **0** |
| `[data-toc-item-index]` (prompt bars)                   | **0**         |
| `div[class*="scrollbar-gutter"]` (old scroll container) | **0**         |
| `#toc-extension` present in page?                       | **false**     |

Zero queries detected ⇒ `createTOC()` never ran.

## New DOM contract (live-verified)

| Purpose                | New selector                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| Scroll container       | `.thread-scroll-container`                                                   |
| Turn wrapper           | `[data-turn-key]` (stable UUID)                                              |
| User message           | `[data-user-message-bubble]`                                                 |
| Assistant message      | `[data-markdown-text-style="assistant-message"]`                             |
| Per-turn message ids   | `[data-chatgpt-search-message-ids]` (space-separated UUIDs)                  |
| Per-turn unit key      | `[data-chatgpt-search-unit-key]` → `fallback-turn-N:0:user` / `:1:assistant` |
| Turn → conversation id | `[data-chatgpt-selection-conversation-id]` (one per turn)                    |
| Turn state             | `[data-talvt-turn-state]` (`complete`)                                       |
| Role label             | `[data-conversation-role]` (`sr-only` H4)                                    |

**The prompt bars are gone.** `[data-toc-item-index]` no longer exists, so the entire legacy **C1** strategy (instant index + bar-click navigation) is dead on the new UI and cannot be revived.

---

# 🔄 PART 2 — Reverse scrolling (THE critical discovery)

> **⚠️ 2026-11-09 update:** the thread scroller has since flipped back to **plain `column`**
> (`flexDirection` measured live). The logical-axis helpers below handle both layouts via
> `isReverse()` — nothing to change in callers — but do NOT assume a direction anywhere, and
> re-measure before trusting any absolute-offset math. See §6 for the current lazy-pagination
> findings, which are the bigger deal on today's UI.

The new thread container is a `flex-direction: column-reverse`, so its **native `scrollTop` range is `[-maxTop, 0]`**.

Directly measured on a live 5-turn chat:

| Action                   | Result                              |
| ------------------------ | ----------------------------------- |
| `scrollTop = 200`        | ❌ silently clamped — **no effect** |
| `scrollTo({ top: 400 })` | ❌ **no effect**                    |
| `scrollTop = -500`       | ✅ works (−499.8)                   |
| `scrollTop = 0`          | newest message (bottom)             |
| `scrollTop = -maxTop`    | oldest message (top)                |

Measured `maxTop = 9944`.

**Impact:** every legacy absolute-offset scroll, scroll-scan step and jump silently became a no-op. This is exactly what the referenced repo's v1.4.4 release note means by _"fixed timeline nodes failing to jump to their messages in the updated reverse-scrolling conversation view"_ (`isConversationReverseScrollRoot` ⇒ `getComputedStyle(root).flexDirection === "column-reverse"`).

## Solution — `window.TOC.scroll` (in `src/store.js`)

Exposes **one logical axis** that behaves identically on both layouts: `0` = oldest, `maxTop` = newest.

| Helper                               | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `isReverse(el)`                      | `flexDirection === 'column-reverse'`                       |
| `maxTop(el)`                         | `scrollHeight - clientHeight`                              |
| `getLogical(el)`                     | logical position of the current scroll                     |
| `setLogical(el, v)`                  | scroll to a logical offset (does the sign flip internally) |
| `scrollByElement(el, target, block)` | direction-agnostic nudge that centres `target`             |

`scrollByElement` uses a **viewport delta**, not an absolute offset, so it stays correct while the virtualizer rewrites `scrollHeight` mid-operation.

---

# ✅ PART 3 — Fix implemented for the new UI (v1.9.2)

| File                     | Change                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/store.js`           | New-UI selectors added (legacy kept as fallback) · `window.TOC.scroll` helpers · `extractConversationId()` DOM fallback                                                                        |
| `src/virtual.js`         | `findScrollContainer()` prefers `.thread-scroll-container` · `C6.scanCurrent()` new-UI branch · C7 scan made reverse-safe (`getLogical`/`setLogical`) · Navigator new-UI path (no prompt bars) |
| `src/main.js`            | `SITES.chatgpt.selectors` accepts both layouts · `getQueries()` new-UI extraction branch                                                                                                       |
| `manifests/*.json`       | 1.9.1 → **1.9.2**                                                                                                                                                                              |
| `README.md`, `AGENTS.md` | docs + new invariant #6 documenting the `[-maxTop, 0]` scroll trap                                                                                                                             |

## Live verification (real built code injected into the live page)

- **Extraction:** 10 records — 5 user + 5 assistant, all stable UUIDs, offsets ascending, correctly interleaved.
- **`C6.scanCurrent`:** `added 6`, `users 3`, `assistants 3`, order `user, assistant, user, assistant…`
- **`Navigator.navigateTo(oldest)`** → `true`, logical **1798**
- **`Navigator.navigateTo(newest)`** → `true`, logical **9131** (`movedToOlder: true`)
- **`setLogical(0)`** → turn-0 visible · **`setLogical(maxTop)`** → newest visible · position restores cleanly.

---

# ✅ PART 4 — Chat-switch leak & SPA blindness (RESOLVED 2026-10-10, round 2)

> All three root causes below were reproduced and fixed against the **live UI** this round (real Edge + real ChatGPT, driven through the Chrome DevTools MCP; real `dist/chrome_test` build loaded as an unpacked extension).

## Symptom (user-reported, reproducible)

1. The TOC **does not update when switching chats** (opened `/`, clicked a sidebar chat ⇒ TOC never appeared / kept the previous chat's rows).
2. Every chat visited adds **its own messages to the same TOC** ("five messages are getting added in the same TOC itself"), until a full reload.

## Root cause (a) — `[[data-turn-key]]` SyntaxError killed all of `store.js` 🔴

`ConversationIdentity.extractConversationId()` wrapped `SELECTORS.chatgpt.turnContainerNew` (**already a full selector** `[data-turn-key]`) in another pair of brackets:

```js
const newTurn = document.querySelector(`[${sel.turnContainerNew}]`); // → '[[data-turn-key]]'
```

On any URL without a `/c/<id>` (bare `chatgpt.com/`, `/gpts`, …) the URL regexes miss, this line runs and **throws**. Because it executed at the IIFE's top-level init, the whole file aborted: **`ConversationIdentity`, `MessageStore` and `StoreManager` were never defined** (`[TOC] store.js loaded` was missing from the console), the history hooks never installed, and `main.js`'s router block silently skipped (`StoreManager` undefined). The extension stayed dead for the entire page session — including after any later SPA navigation to a real chat.

**Fix:** removed the DOM fallback entirely — the URL is the only source of truth (`/c/<id>`, `/share/<id>`), otherwise `null` (callers key on `location.href`). Bonus: it also killed root cause (b). Init is now wrapped in `try/catch` so no future resolution bug can abort `store.js` again ([`src/store.js`](src/store.js)).

## Root cause (b) — SPA navigation was never detected (isolated world) 🔴

`installHistoryHooks()` patched `history.pushState` / `history.replaceState` — but content scripts run in an **isolated world**, and DOM objects get a **separate JS wrapper per world**. Expando patches made there are invisible to page scripts, so ChatGPT's router calling its own `pushState` never reached our wrapper.

Live proof: a **main-world** probe wrapped `history.pushState`, then a sidebar chat was clicked ⇒ `{"push":1}` (caught), while the extension's console showed **zero** reaction (no identity change, no store reset, no re-init).

**Fix:** keep the patches (harmless, same-world callers) but detect navigation through **shared** channels ([`src/store.js`](src/store.js)):

- `setInterval(checkAndEmit, 500)` — a `location.href` string compare (shared, always accurate);
- `popstate` / `hashchange` listeners (DOM events cross worlds);
- `MutationObserver` on `<head>` (the route change swaps `<title>`) to react within the same frame.

## Root cause (c) — two threads mounted at once → cross-chat leak 🔴 (the "five messages" bug)

During a chat swap ChatGPT keeps the **outgoing** thread mounted. Live probe right after a switch:

| container | turns | conversation               | visible                     |
| --------- | ----- | -------------------------- | --------------------------- |
| `#0`      | 5     | `6ac3fe4f…` (**old chat**) | ❌ hidden, `clientHeight 0` |
| `#1`      | 3     | `6ac37e44…` (new chat)     | ✅                          |

`document.querySelector('.thread-scroll-container')` returns **#0 (the old thread)**, and the per-turn conversation filter then rejected every turn in it. The `activeTurns()` fallback (`mine.length > 0 ? mine : all`) then re-admitted that unfiltered set ⇒ C6 scanned **10 messages of the previous chat** into the new chat's freshly-reset store ⇒ "Scanned 10 new messages, total: 16" ⇒ 8 TOC rows (3 new + 5 old).

**Fix:** `window.TOC.dom` ([`src/store.js`](src/store.js)) resolves the **active** container by per-turn `[data-chatgpt-selection-conversation-id]`, then visibility, then newest — and `activeTurns()` **returns `[]`** when every mounted turn belongs to another conversation (no unfiltered fallback). `findScrollContainer()` ([`src/virtual.js`](src/virtual.js)), `C6.scanCurrent()`, the C7 anchor lookup and `main.js`'s `getQueries()` DOM fallback all route through it. `main.js`'s router also clears the rendered rows immediately on conversation change, so stale rows can't linger (previously they persisted forever if the new chat was empty).

## Live verification (2026-10-10, real UI via Chrome DevTools MCP)

| Check                                     | Result                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Console on a no-id page load              | `[TOC] store.js loaded` present, **no SyntaxError** ✅                                                                 |
| `/` → click chat (user's flow)            | TOC appears with that chat's 5 rows ✅                                                                                 |
| SPA switch 6ac37e44 → 6ab52d1b            | `Conversation changed` → `Store reset` → `New store` → rows = **new chat only** (5 rows), old chat's 6 rows dropped ✅ |
| Both containers present during swap       | old (hidden, 3 turns) ignored; new (visible, 5 turns) used ✅                                                          |
| Scan button on a 102k px virtualized chat | 20.5 s / 64 steps, found 2 unseen turns, **no duplicates** (6 unique ids) ✅                                           |
| TOC row click (oldest row)                | logical scroll 9995 → 5570, target turn mounted & visible ✅                                                           |

## Investigation notes that proved WRONG (kept for future debugging)

- "Stale-cache-key collision" — ruled out (bare `/` isn't cacheable).
- "The `.thread-scroll-container` is unique" — **false during a swap**; there are two.
- "Patching `history` from a content script works" — **false** in an isolated world (see (b)).

---

# 🔌 PART 5 — Browser automation notes (READ BEFORE TESTING)

## ❌ `chrome-devtools-mcp` cannot drive Edge's inspect server

`edge://inspect/#remote-debugging` starts a **WebSocket-only** debug server. **All REST discovery endpoints return 404**: `/json/version`, `/json/list`, `/json/protocol`.

| MCP mode                                                 | Result                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--autoConnect` (default)                                | Path-resolution bug — uses a literal `%LocalAppData%` → `ENOENT: ...\g:\web dev\%LocalAppData%\Microsoft\Edge\User Data\DevToolsActivePort`. With an explicit `--userDataDir "C:\Users\...\Edge\User Data"` it **connects over WS but `list_pages` hangs forever**. Reproduced on **v1.7.0 and v1.10.1**. |
| `--browserUrl http://127.0.0.1:9222`                     | ❌ fails — `/json/version` returns **404**                                                                                                                                                                                                                                                                |
| `--wsEndpoint ws://127.0.0.1:9222/devtools/browser/<id>` | Connects, then **`list_pages` hangs**                                                                                                                                                                                                                                                                     |

The server also accepts **only ONE CDP client at a time**. A stale `chrome-devtools-mcp` node process holds the single slot, and new connections complete the TCP handshake but never finish the WebSocket upgrade. Detect and clear it:

```powershell
Get-NetTCPConnection -RemotePort 9222 -State Established | ForEach-Object { Get-Process -Id $_.OwningProcess }
Stop-Process -Id <node-pid> -Force
```

## ✅ WORKING method — raw CDP over the WebSocket

1. Read `%LOCALAPPDATA%\Microsoft\Edge\User Data\DevToolsActivePort` → line 1 = port, line 2 = `/devtools/browser/<uuid>`.
2. `new WebSocket('ws://127.0.0.1:<port><path>')`.
3. `Target.getTargets` → pick `type === 'page'` with the wanted URL → `Target.attachToTarget { flatten: true }` → use the returned `sessionId` for all further calls.

## ⚠️ CRITICAL — content scripts live in an isolated world

`window.TOC` / `window.TOC.StoreManager` are **NOT visible** from the page's main world. Evaluating there makes the extension look broken — a **false negative**.

To inspect extension state, evaluate inside its isolated world:

```js
await send("Runtime.enable", {}, sessionId); // (re-)emits context events
const ctx = contexts.find((c) => c.name === "AI Chat TOC"); // isolated world
await send(
  "Runtime.evaluate",
  {
    expression,
    contextId: ctx.id,
    returnByValue: true,
    awaitPromise: true,
  },
  sessionId,
);
```

Collect the `Runtime.executionContextCreated` events **before** `Runtime.enable` resolves — they are replayed once and dropped if the handler is attached late.

## Other gotchas

- The DOM element `#toc-extension` **is** visible from the main world (it lives in the shared DOM) — so presence/absence checks are safe there. Only `window.TOC*` is isolated.
- `Runtime.evaluate` with `awaitPromise` **hangs** if the page navigates or the expression awaits a timer during teardown. Keep expressions short; prefer fire-and-forget + a separate poll.
- A tab created via `Target.createTarget` needs ~5–10 s before the extension's isolated world appears.
- **Two "AI Chat TOC" isolated worlds may exist** if both the Web Store copy (id `ciclciocehhjmkknjhnpaaligmffmpcb`, v1.9.1) and the unpacked dev build are enabled. Identify by extension id, and disable the store copy while testing the dev build — otherwise you get duplicate TOCs.
- Safe repro pattern: create a background tab via `Target.createTarget`, then click a sidebar `a[href^="/c/"]` **inside that tab** to trigger a real SPA navigation without disturbing the user's tab.

## Test harness status

`src/test/**` ships a console harness (dev builds only): `window.__TOC_TEST__.listStrategies()`, `.run('c7-scroll-scan')`, `.runAll({ fullScan: true })`, `.report()`, `.reportMarkdown()`.

⚠️ **The strategy files still use the OLD UI selectors** (`[data-testid^="conversation-turn-"]`, `data-turn-id`, `data-message-id`, `[data-toc-item-index]`) and will return 0 results on the new UI until updated. Files needing migration:

```
src/test/strategies/c1-prompt-bars.js     ← bars no longer exist on the new UI
src/test/strategies/c3-backend-api.js     ← uses data-turn-id / conversation-turn
src/test/strategies/c4-fiber-nav.js       ← uses conversation-turn
src/test/strategies/c6-dom-store.js       ← uses conversation-turn / data-message-id
src/test/strategies/c7-scroll-scan.js     ← uses conversation-turn + native scrollTop math
```

---

# 📋 PART 6 — Next steps

## Navigation root cause — DISTANT TARGETS (2026-11-09, live via chrome-devtools MCP) 🔴→📐

> Replaces/updates the "Navigation status" note below. Reproduced and root-caused live on
> **"Branch · Audit Evidence Engine"** (`/c/6ac3fe4f…`, 265 API nodes: 34 user / 131 assistant / 99 tool),
> store build v1.9.2 (`ciclciocehhjmkknjhnpaaligmffmpcb`) — whose `virtual.js` matches current `src/`.

### Symptom (exact user report)

Clicking a TOC row "goes up, down somewhat and just stop" — the jump oscillates and gives up.
Give-up diagnostic from the live console:

```
[TOC Nav] Time budget exhausted
[TOC Nav] (new UI) Gave up on 75977115-… after 60 attempts —
    window=[142,153] ordinalWindow=[26,26] target=0 targetOrdinal=0 mounted=5 logical=4769/33470
```

The target was the **oldest message (position 1 of 265)**; the mounted window sat at api indices 142–153.

### Root cause — ChatGPT lazy-loads older messages in pages, and the search fights it

1. **The scroller is now `flex-direction: column`** (NOT `column-reverse` as of 2026-10-10).
   `window.TOC.scroll.isReverse()` handles this dynamically — helpers still behave. Re-measure any
   future absolute-offset findings against `column` first.
2. **Only the newest region is materialized.** ChatGPT fetches older messages in pages of 10 via

   ```
   GET /backend-api/conversations/<id>/messages?before=<turnUuid>&num_turns=10&include_has_versions=true
   ```

   triggered by **dwelling near the oldest materialized boundary**. On first open the boundary sat at
   linear position ~191; positions 1–190 existed only as estimated spacer height (scrollHeight was an
   estimate that grew 21k → 33k → 189k px as pages loaded).
3. **Ratio jump lands in the spacer** → target can't mount → directional search scrolls older, hits the
   boundary, the window stops changing → `stuck ≥ 2` **reverses direction** and scrolls the viewport
   AWAY (newer) → window changes → positions say "target is older" → scroll back → oscillation.
   60 attempts / 12 s → give up. The oscillation also **suppresses the pagination trigger** (which
   needs dwell time at the boundary), so the pages that WERE fetched (4+) only crept the boundary
   191 → ~142 before the budget died. This is the "goes up, down somewhat and just stop".

### Fix validated live (the recipe)

**Pin the viewport at the oldest boundary and let ChatGPT paginate — no reversal:**

1. `scrollTop = 0` (logical 0; works on both layouts via `S.setLogical(container, 0)`).
2. Materialization prepends pages ABOVE; ChatGPT's **scroll anchoring** moves `scrollTop` to keep the
   viewport content stable (observed 0 → 72,883 as ~91k px materialized). Re-pin to logical 0 each
   iteration; each pin exposes a new boundary and fires more `?before=` page fetches.
3. After ~2 pins (~15–20 s from position 191 to position 1) the target **mounted**. A subsequent TOC
   click then resolved via the fast path and centered the (45,000 px tall!) target turn correctly.

Also observed: giant turns (25k-char message) center fine, but the viewport lands mid-turn —
`finish()` should prefer the turn's START when the turn is taller than ~1.5 viewports.

### Implementation checklist (for the fix)

- [x] `performVirtualJump` (`src/virtual.js`): when the target's apiIndex/ordinal is OLDER than the
      earliest mounted position, enter a **pagination-hold loop** — pin logical 0, poll `waitFor`,
      re-pin on every window change where the earliest mounted api position DECREASES. **Never reverse
      direction while pinned.** Budget: scale with page distance (`~10 turns/page`), e.g. 45–60 s for
      distant targets; keep user-intent/superseded/SPA cancellation.
- [x] `finish()`: block `'start'` (not center) when the target turn is taller than ~1.5 viewports.
- [x] C7 scan: same awareness for the top region of huge chats (hold + repin instead of stepping into
      the spacer; the scan currently reaches the bottom quickly but the oldest pages load on demand).
- [x] Local testing setup: build with `dev.ps1`, load `dist/chrome_test` unpacked and
      disable the store copy while verifying (double-injection gotcha, §5).

## Navigation status (2026-10-11, v1.9.2 work-in-progress) — superseded by the note above

**Works:** clicking an item whose turn is mounted or within a few steps resolves in 0–1500 ms (verified live, several rows + the 3-message chat resolves in 0–1 ms).

**Known limit:** in a _very large_ chat (264 messages incl. tool nodes; one 25k-char message) a target far from the rendered window often cannot be reached: the search travels for the full 12 s / 60-attempt budget and still gives up. Evidence + causes found live:

- ChatGPT's thread scroller has an **unstable `scrollHeight`** (an estimate that grew 15k → 50k → 101k during one session), so absolute scroll math is unreliable; steps must be relative DOM operations (now implemented: scroll the window's edge element to the opposite side).
- The DOM's own `fallback-turn-N` unit keys are **local to the rendered window** (they restart at 0), so they cannot order the conversation — only message ids ↔ API positions can (implemented via `store.positionOfId`).
- The virtualizer appears to **refuse to mount the earliest region** while the estimate is small; repeatedly stepping there does not grow it within the budget.

**Options if this needs to be fully solved:** (a) raise the travel budget (≈500 ms settle per step, 20–25 s cap) and/or (b) trigger the app's own "load earlier" path if it exists; (c) accept best-effort for very distant targets and surface the existing "Message not in view" toast. Small/medium chats are unaffected.

1. ✅ **Chat-switch leak fixed** (PART 4) — verified live: identity change → store reset → scoped scan → no cross-chat rows.
2. **Migrate the test strategies** to the new selectors so the harness is usable again (still open — note the harness is isolated-world only, so it must be driven from the extension's own console context, not from `chrome-devtools-mcp`).
3. **Verify on a long chat (20+ turns):** full capture depth — see the navigation note above; the scan itself reaches the bottom in ~8–15 s with no duplicates.
4. **Verify navigation accuracy** on very long assistant replies (the Navigate sweep fallback path).
5. Consider whether the **1.9.1 Web Store copy** should be uninstalled to avoid double-injection during testing. (Round 2: it was toggled **off** in Edge while testing; the unpacked dev build is `geoljgcmnlgpgblfcpageafgklffdpfk`.)
6. **Reload the extension + any open ChatGPT tab** after pulling these fixes — an already-running content script keeps the old code until the page reloads.

---

---

# 📦 ARCHIVE — Virtualization Strategy Testing (2026-08-18)

> Superseded by the new-UI work above, but retained because it documents the C1/C3/C6/C7 strategy research that the current architecture is built on.

> **Date:** 2026-08-18 (Updated 2026-08-19 — Shared chat API verified)
> **Tested on:** ChatGPT (shared + logged-in views)
> **Extension:** AI Chat TOC v1.8.0 (release/1.9.0 branch)

---

## Problem Statement

ChatGPT (and Claude) use **virtualized DOM** — only 2-5 messages are rendered at a time, regardless of total conversation length. This breaks the extension's TOC which relies on `document.querySelectorAll()` to find messages.

**Impact:** TOC shows only 2-3 messages instead of the full conversation.

---

## Test Environment

| Property             | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| Shared URL           | `https://chatgpt.com/share/6a0cc811-699c-83a9-b983-4a8f5e448142` |
| Logged-in URL        | `https://chatgpt.com/c/69f99875-ca14-8320-beea-f55756b482c5`     |
| Total messages       | 18 user + 18 assistant = **36 turns**                            |
| Scroll height        | 126,097px (logged-in) / 86,072px (shared)                        |
| Viewport height      | ~583px                                                           |
| Virtualization ratio | **147.6×** (massive)                                             |
| Turns in DOM at once | **5** (turns 32-36 at bottom, 1-2 at top)                        |
| Turns 3-31           | **Completely absent** from DOM                                   |

---

## DOM Attributes Discovered

Every ChatGPT turn container has these **stable attributes**:

| Attribute                | Example                       | Survives Virtualization     |
| ------------------------ | ----------------------------- | --------------------------- |
| `data-testid`            | `conversation-turn-32`        | ⚠️ Sequential number shifts |
| `data-turn-id`           | `127268a8-5232-448c-84f5-...` | ✅ Stable UUID              |
| `data-turn-id-container` | Same as `data-turn-id`        | ✅ Stable UUID              |
| `data-turn`              | `user` / `assistant`          | ✅ Role indicator           |

Every ChatGPT message div has:

| Attribute                  | Example                       | Survives Virtualization |
| -------------------------- | ----------------------------- | ----------------------- |
| `data-message-author-role` | `user` / `assistant`          | ✅                      |
| `data-message-id`          | `127268a8-5232-448c-84f5-...` | ✅ Stable UUID          |
| `data-message-model-slug`  | `gpt-5-5`                     | ✅ (assistant only)     |

---

## Strategy Test Results

### 🥇 C3: Backend API — Score: 95/100

**Status:** ✅ SUCCESS (both shared and logged-in views) ✅ VERIFIED

**How it works:**

1. Extract `accessToken` from preloaded `<script>` tag: `"accessToken":"eyJhbGci..."`
2. Call API endpoint (routing depends on URL type)
3. Parse `mapping` object → walk parent chain from `current_node`
4. Get ordered array of all messages

**Results:**

| Metric            | Value                             |
| ----------------- | --------------------------------- |
| Messages found    | **36** (18 user + 18 assistant)   |
| Full text         | ✅ Yes                            |
| Stable UUIDs      | ✅ Every message has `id`         |
| Assistant content | ✅ Yes                            |
| Response size     | ~97KB                             |
| Time              | 6.7s (including token extraction) |
| Auth              | Bearer token from page            |

**API Details:**

**Logged-in conversations (`/c/{id}`):**

```
Endpoint:  GET /backend-api/conversation/{conversationId}
Headers:   Authorization: Bearer {accessToken}
           Accept: application/json
Credentials: include

Response:  { mapping: { nodeId: { message: {...}, parent: "...", current: true } } }
```

**Shared conversations (`/share/{id}`):** ✅ VERIFIED

```
Endpoint:  GET /backend-api/share/{shareId}
Headers:   Accept: application/json
Credentials: include (optional)

Response:  { linear_conversation: [...], mapping: {...}, current_node: "..." }
```

**Test Results for Shared Chat API:**

- Returns **200 OK** with full conversation data
- **No authentication required** (works without login)
- Response includes `linear_conversation` (75 nodes) + `mapping` tree
- **36 messages with content** (18 user + 18 assistant)
- Response size: ~97KB

**Token Extraction:**

```javascript
const scripts = document.querySelectorAll("script");
for (const script of scripts) {
  const match = script.textContent.match(/"accessToken":"([^"]+)"/);
  if (match) {
    token = match[1];
    break;
  }
}
```

**Limitations:**

- ❌ Share URLs require different endpoint (`/backend-api/share/{id}`)
- ❌ Token may expire (expires field in session data)
- ❌ Rate limiting possible
- ⚠️ Shared chat endpoint may change without notice

**Code snippet:**

```javascript
// Routing based on URL type
if (window.location.pathname.includes("/share/")) {
  // Shared chat - no auth needed
  const shareId = window.location.pathname.match(/\/share\/([a-f0-9-]+)/)?.[1];
  const response = await fetch(`/backend-api/share/${shareId}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
} else {
  // Logged-in chat - needs Bearer token
  const convId = window.location.pathname.match(/\/c\/([a-f0-9-]+)/)?.[1];
  const response = await fetch(`/backend-api/conversation/${convId}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
const data = await response.json();
// Walk mapping tree from current_node → parent chain
```

---

### 🥈 C1: Prompt Bars + Popover — Score: 75/100

**Status:** ✅ SUCCESS (both shared and logged-in views) — **Updated 2026-08-31: aria-label now "Prompt N" (not truncated text)**

**How it works:**

1. ChatGPT renders tiny indicator bars (2px high) on the right side
2. Each bar has `aria-label="Prompt N"` (2026-08-31: was truncated text on 2026-08-30, now "Prompt N") and `data-toc-item-index`
3. Hover over bar → popover appears with truncated user message text (if available)
4. Click bar → ChatGPT's internal virtualizer scrolls to that message

**2026-08-31 Update — Why TOC shows "Prompt 1, 2" initially:**

- `aria-label` now contains `"Prompt N"` not truncated text, so C1 creates stubs as `Prompt 1, 2...` (0.1ms for 18 bars)
- Real text comes from C6 (DOM at scroll position) or C7 Scan (scrolls through all) — after Scan, TOC shows full truncated text
- This is expected: C1 gives instant index (18 items), C6/C7 upgrade to real text. Without Scan, only visible DOM turns have real text.

**Results:**

| Metric            | Value                                         |
| ----------------- | --------------------------------------------- |
| Prompt bars found | **18** (always rendered)                      |
| Popover items     | **18** (truncated text)                       |
| Navigation        | ✅ **Works via click**                        |
| Speed             | **1ms** (bar scan) + **1.1s** (hover popover) |
| Works on          | ✅ Both shared and logged-in views            |

**Navigation Proof:**

```
Click Prompt 1  → scrollTop = 120px (top)
Click Prompt 18 → scrollTop = 81,441px (bottom)
Delta: 81,321px — full conversation traversal ✅
```

**DOM Structure:**

```html
<div class="max-h-[50lvh] w-9 overflow-clip" style="max-height: 333px;">
  <div class="flex flex-col items-center gap-2 py-1">
    <button
      type="button"
      class="h-0.5 w-4.5 ..."
      aria-label="Prompt 1"
      data-toc-item-index="0"
    ></button>
    <button
      type="button"
      class="h-0.5 w-4.5 ..."
      aria-label="Prompt 2"
      data-toc-item-index="1"
    ></button>
    <!-- ... 16 more bars ... -->
  </div>
</div>
```

**Popover (on hover):**

```html
<div class="popover ...">
  <ul class="flex max-h-[50lvh] flex-col overflow-y-auto">
    <li>
      <button class="group __menu-item hoverable">
        <div class="truncate">so these pentest are for my prod...</div>
      </button>
    </li>
    <!-- ... 17 more items ... -->
  </ul>
</div>
```

**Selectors (Updated 2026-08-31):**

```javascript
// Find all prompt bars — LIVE 2026-08-31: [data-toc-item-index] is stable (18/18 in 0.1ms)
// button[aria-label^="Prompt"] is stale when aria-label holds truncated text, but now aria-label is "Prompt N" again
const promptBars = document.querySelectorAll("[data-toc-item-index]");

// Read truncated text directly from aria-label (no hover needed when it holds truncated text)
// When aria-label is "Prompt N", need C6/C7 for real text
const text = bar.getAttribute("aria-label"); // "Prompt N" or "so these pentest..."

// Fallback: hover popover (287ms) — only if aria-label is "Prompt N"
firstBar.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
const items = document.querySelectorAll(".popover li button");
```

**Limitations:**

- ❌ User messages only (no assistant responses)
- ❌ Text truncated (~50 chars + "...")
- ❌ Popover only visible on hover (flashes briefly)
- ❌ ChatGPT-specific (not cross-platform)

---

### 🥉 C7: Scroll-and-Capture Scan — Score: 80/100

**Status:** ✅ SUCCESS (conceptual — not fully tested in browser)

**How it works:**

1. Save current scroll position
2. Scroll to top of conversation
3. Scroll down in increments (e.g., 80% of viewport)
4. At each position, scan DOM for new messages
5. Deduplicate by UUID (`data-message-id`)
6. Restore scroll position

**Results:**

| Metric            | Value                            |
| ----------------- | -------------------------------- |
| Estimated capture | ~36 messages (all)               |
| Full text         | ✅ Yes                           |
| Stable UUIDs      | ✅ `data-message-id`             |
| Speed             | ~3s (with 200ms delays)          |
| Visual disruption | ⚠️ Yes                           |
| **Best for**      | One-time "Load Full Chat" button |

**Code pattern:**

```javascript
const seenIds = new Set();
const allMessages = [];
const scrollStep = clientHeight * 0.8;

// Scroll to top
scrollContainer.scrollTop = 0;
await sleep(300);

// Scan at each position
while (scrollContainer.scrollTop < scrollHeight) {
  // Capture current messages
  document
    .querySelectorAll('[data-testid^="conversation-turn-"]')
    .forEach((turn) => {
      const msgId = turn
        .querySelector("[data-message-id]")
        ?.getAttribute("data-message-id");
      if (msgId && !seenIds.has(msgId)) {
        seenIds.add(msgId);
        allMessages.push(extractMessage(turn));
      }
    });

  scrollContainer.scrollTop += scrollStep;
  await sleep(200);
}

// Restore position
scrollContainer.scrollTop = savedPosition;
```

**Limitations:**

- ⚠️ Visual disruption (scrolls through conversation)
- ⚠️ Takes ~3 seconds
- ⚠️ Must restore scroll position accurately

---

### C6: DOM Accumulating Store — Score: 55/100

**Status:** ✅ SUCCESS (baseline — captures current render window)

**How it works:**

- Maintain a `Map<UUID, Message>` in memory
- On each DOM change, scan rendered messages
- Merge new messages into the store (never remove)
- TOC displays the full store

**Results:**

| Metric             | Value                           |
| ------------------ | ------------------------------- |
| Messages found     | **5** (current render window)   |
| User messages      | 2                               |
| Assistant messages | 3                               |
| Full text          | ✅ Yes                          |
| Stable UUIDs       | ✅ All 5 have `data-message-id` |
| Speed              | **0ms**                         |

**Limitations:**

- Only captures what's currently rendered (2-5 messages)
- TOC grows slowly as user scrolls
- Needs C1 or C7 to fill in the gaps

---

### ❌ C4: React Fiber Virtualizer Bridge — Score: 10/100

**Status:** ❌ FAILED

**How it would work:**

- Walk React fiber tree to find virtualizer API
- Call `scrollToIndex(index)` directly for precise navigation

**Results:**

| Metric              | Value            |
| ------------------- | ---------------- |
| Elements scanned    | 2,959            |
| Fiber nodes scanned | 10,000+          |
| Starting points     | 7                |
| Methods searched    | 12               |
| Result              | **Zero matches** |

**Why it failed:**

- ChatGPT likely uses a custom virtualization implementation
- Virtualizer API not exposed in `memoizedState` or `memoizedProps`
- May use IntersectionObserver directly (not TanStack Virtual)

---

## Research: Other Repos' Approaches

### chatgpt-chat-exporter

- **Scroll-and-capture loop** with content hash dedup
- Geometric ordering via `getBoundingClientRect().top + scrollTop`
- Proven pattern for our C7 strategy

### GPT-Conversation-Toolkit

- **Triple-layer**: Network interception → Direct API fetch → DOM fallback
- React Fiber virtualizer bridge (found `scrollToIndex`)
- Virtualized jump with retry loop (24 attempts)
- Direct API: `GET /backend-api/conversation/{id}` (same as our C3)

### gpt-toc-extension

- Simple DOM polling (no virtualization handling)
- Breaks on long conversations
- Uses same `data-message-author-role` selectors

### obsidian-AI-exporter

- Auto-scroll with configurable timeouts (15s idle, 300s total)
- Platform-specific extractors

---

## Final Recommendation — Updated 2026-08-31 (Implemented as Core + Conditional + Experimental)

### ChatGPT: C1 (conditional) + C6 + C7 + C3 (experimental) — 2-file optimized (store.js + virtual.js)

| Tier | Strategy           | When                                   | What it provides                                                           |
| ---- | ------------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| 1    | **C1 Prompt Bars** | Conditional (if bars exist, 0.1ms)     | Instant index (18 stubs as Prompt N), navigation via [data-toc-item-index] |
| 2    | **C6 DOM Store**   | Always-on (0ms)                        | Accumulates full text as user scrolls, upgrades C1 stubs                   |
| 3    | **C7 Scroll Scan** | On-demand (Scan button, ~3s)           | Full upgrade: scrolls through all, 18 real texts                           |
| 4    | **C3 Backend API** | Experimental opt-in (auto for /share/) | Full conversation with text + UUIDs ✅ VERIFIED                            |

**Why Prompt 1,2 initially:** C1 creates stubs as `Prompt N` when `aria-label="Prompt N"` (2026-08-31). Real text comes from C6 (visible DOM) or C7 Scan (all). After Scan, 18 real texts. This is expected — C1 gives instant 18-item index, C6/C7 upgrade.

### Other Platforms: C6 + C7

| Tier | Strategy           | When      | What it provides      |
| ---- | ------------------ | --------- | --------------------- |
| 1    | **C6 DOM Store**   | On-scroll | Accumulates over time |
| 2    | **C7 Scroll Scan** | On-demand | Complete data         |

### Fallback Chain

```
ChatGPT:
  1. Try C3 (API) → routing depends on URL:
     - /c/{id} → GET /backend-api/conversation/{id} (needs Bearer token)
     - /share/{id} → GET /backend-api/share/{id} (no auth needed) ✅
  2. Try C1 (Prompt Bars) → instant index + nav
  3. Use C6 (DOM Store) → accumulate as user scrolls
  4. Offer C7 (Scan) → "Load Full Chat" button

Claude/Gemini/Perplexity/Grok:
  1. Use C6 (DOM Store) → accumulate as user scrolls
  2. Offer C7 (Scan) → "Load Full Chat" button
  3. Check for platform-specific API endpoints
```

---

## Files Created for Testing

```
src/test/
├── FINDINGS.md              ← This file
├── metrics.js               ← Performance measurement
├── reporter.js              ← Console output formatting
├── test-harness.js          ← Master controller (run from console)
├── index.js                 ← Module index
└── strategies/
    ├── c1-prompt-bars.js    ← ChatGPT prompt indicator bars
    ├── c3-backend-api.js    ← ChatGPT backend API fetch
    ├── c4-fiber-nav.js      ← React fiber virtualizer bridge
    ├── c6-dom-store.js      ← DOM accumulating store
    └── c7-scroll-scan.js    ← Scroll-and-capture scan
```

### Usage (in browser console)

```javascript
// List strategies
window.__TOC_TEST__.listStrategies();

// Test one
window.__TOC_TEST__.run("c1-prompt-bars");

// Test all
window.__TOC_TEST__.runAll();

// Test with full scroll scan
window.__TOC_TEST__.runAll({ fullScan: true });

// Show comparison
window.__TOC_TEST__.report();

// Copy markdown report
window.__TOC_TEST__.reportMarkdown();
```

---

## Next Steps — Updated 2026-08-31 (Implemented)

1. ✅ **C1** (Prompt Bars) — `[data-toc-item-index]` 18/18 in 0.1ms, stubs as Prompt N, upgraded by C6/C7
2. ✅ **C3** (Backend API) — Experimental opt-in (auto for /share/ 200 in 3.3s, opt-in for /c/ with Bearer)
3. ✅ **C6** (DOM Store) — Targeted observer on `div[class*="scrollbar-gutter"]`, dedup via turnNum→idx
4. ✅ **C7** (Scroll Scan) — Scan button replaces Refresh, 300 steps for 132k, user-only count
5. ✅ **Virtualization bugs** — Reverse illusion (staleCount), out-of-order (sort by promptBarIndex), SPA hooks
6. ⏳ **Test on Claude** — check if similar virtualization patterns exist
7. ⏳ **Test on Gemini/Perplexity/Grok** — platform-specific adaptations

**2026-08-31 Live Test on share/6a0cc811 (Firefox 154.0.1):**

- Initial: 18 Prompt N (C1 stubs) → After Scan: 18 real texts in correct order, no duplicates
- Navigation: first 120, mid 55379, last 98122 — all scrolled
- Scan: 300 steps, ~6s, user-only count, no stuck
