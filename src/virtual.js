/**
 * AI Chat TOC - Virtual Module (v1.9.2)
 * C3 (conversation API) + C6 (DOM accumulator) + C7 (scroll scan) + Navigator
 * Optimized 2-file architecture: store.js + virtual.js
 *
 * C1 (prompt bars) was DELETED in v1.9.2 — ChatGPT's 2026-10 redesign removed its
 * own prompt-navigation UI, so the scanner could never match anything again.
 *
 * Live-verified 2026-10-11 on the new UI (264-message chat):
 * - C3: plain /backend-api/conversation/<id> first (the include_full_conversation
 *   variant 403s), 264-node mapping -> apiIndex stamped on every record
 * - C6: scoped to the ACTIVE thread (two containers coexist during a swap)
 * - C7: event-driven waits + adaptive step, ~8-15s on a 16k px thread
 * - Nav: mounted/nearby targets resolve in 0-1500ms; far targets in a huge chat may
 *   exhaust the 12s budget (documented limitation, FINDINGS.md PART 6)
 */
window.TOC = window.TOC || {};

window.TOC.Virtual = (function () {
    const SELECTORS = window.TOC.SELECTORS;
    const StoreManager = window.TOC.StoreManager;
    const Identity = window.TOC.ConversationIdentity;
    const safeCall = window.TOC.safeChromeCall || ((fn) => { try { return fn(); } catch (e) { return null; } });

    // -------------------------------------------------------------------------
    // SPA navigation generation (race safety) — one monotonic counter.
    // Every async flow captures { convId, navGen } at start and validates
    // via isCurrentSession() before applying cache/C3/C6/C7/save/render.
    // -------------------------------------------------------------------------
    let currentNavGen = 0;

    function captureSession() {
        return {
            convId: (Identity && typeof Identity.getCurrentId === 'function' && Identity.getCurrentId()) || location.href,
            navGen: currentNavGen,
        };
    }

    function isCurrentSession(session) {
        try {
            if (!session) return false;
            if (session.navGen !== currentNavGen) return false;
            const currentId = (Identity && typeof Identity.getCurrentId === 'function' && Identity.getCurrentId()) || location.href;
            return session.convId === currentId;
        } catch (e) {
            return false;
        }
    }

    function getStoreManager() {
        return StoreManager;
    }

    // -------------------------------------------------------------------------
    // Utils
    // -------------------------------------------------------------------------
    const RIC = (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function')
        ? window.requestIdleCallback.bind(window)
        : ((cb) => setTimeout(cb, 1));
    const debounce = (fn, delay) => {
        let t;
        const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
        wrapped.cancel = () => { clearTimeout(t); t = null; };
        return wrapped;
    };
    const waitForElement = async (selector, timeout = 600) => {
        const start = performance.now();
        while (performance.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise(r => requestAnimationFrame(r));
        }
        return document.querySelector(selector);
    };
    const findScrollContainer = (siteKey) => {
        if (siteKey === 'chatgpt') {
            const sel = SELECTORS.chatgpt;
            const scroll = window.TOC.scroll;
            // NEW UI (2026-10): .thread-scroll-container is the thread scroller
            // (column-reverse). Accept it at any size — the legacy >5000px
            // heuristic below would reject a short thread and fall back to `main`,
            // which is not scrollable.
            // Resolve through TOC.dom, which skips the OUTGOING (hidden) thread
            // that stays mounted next to the incoming one during a chat swap.
            let el = (window.TOC.dom && window.TOC.dom.threadContainer)
                ? window.TOC.dom.threadContainer()
                : document.querySelector(sel.scrollContainerNew);
            if (el && scroll && scroll.maxTop(el) > 0) return el;
            if (el && el.scrollHeight >= el.clientHeight) return el;
            // LEGACY UI
            el = document.querySelector(sel.scrollContainer);
            if (el && getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > 5000) return el;
            // Try alt selector
            el = document.querySelector(sel.scrollContainerAlt);
            if (el && el.scrollHeight > 5000) return el;
            // Fallback: find by dimensions
            el = Array.from(document.querySelectorAll('div')).find(d =>
                d.scrollHeight > 5000 && d.clientHeight < 2000 && getComputedStyle(d).overflowY === 'auto'
            );
            if (el) return el;
            return document.querySelector(sel.scrollContainerFallback) || document.querySelector('main') || document.body;
        }
        const siteSel = SELECTORS[siteKey];
        if (siteSel && siteSel.scrollContainer) {
            const el = document.querySelector(siteSel.scrollContainer);
            if (el) return el;
        }
        return document.querySelector('main') || document.body;
    };
    const isVirtualized = (container) => {
        if (!container) return false;
        return container.scrollHeight / container.clientHeight > 5;
    };

    // -------------------------------------------------------------------------
    // C1: Prompt Bar Scanner (ChatGPT only, conditional)
    // Fix: Handle both "Prompt N" and truncated text in aria-label
    // -------------------------------------------------------------------------
    // C1 (prompt-bar scanner) — REMOVED in v1.9.2.
    //
    // ChatGPT's 2026-10 redesign deleted its own prompt-navigation UI entirely:
    // live probes for [data-toc-item-index], `aria-label="Prompt N"` and the
    // hover popover all return 0 matches, so this scanner could never find
    // anything. C3 (API) + C6 (DOM) are the outline sources now. The module is
    // gone rather than left inert so no future update re-enables dead work.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // C6: DOM Accumulator (All platforms, always-on)
    // -------------------------------------------------------------------------
    const C6 = (function () {
        let observer = null;
        let debounceTimer = null;
        let debouncedScanFn = null;
        let scrollDebounce = null;
        let onUpdateCallback = null;
        let siteKey = null;
        let lastUuidSet = new Set();
        let lastTextMap = new Map();
        let activeSession = null;

        function captureTextMap(store) {
            const m = new Map();
            try {
                for (const msg of store.getAll()) {
                    m.set(msg.id, (msg.text || '').length);
                }
            } catch (e) { /* ignore */ }
            return m;
        }

        function hasTextUpgraded(prevMap, store) {
            try {
                for (const msg of store.getAll()) {
                    const prevLen = prevMap.get(msg.id);
                    if (prevLen !== undefined && (msg.text || '').length > prevLen) return true;
                }
            } catch (e) { /* ignore */ }
            return false;
        }

        function guardedFire(session, store) {
            // Session guard for observer callbacks + delayed UI rendering
            if (session && !isCurrentSession(session)) return;
            try {
                const newSet = store.getUuidSet();
                const uuidChanged = store.hasChanged(lastUuidSet);
                const textUpgraded = hasTextUpgraded(lastTextMap, store);
                if (uuidChanged || textUpgraded) {
                    lastUuidSet = newSet;
                    lastTextMap = captureTextMap(store);
                    // Persist provisional C6 changes (ChatGPT-only; StorageManager
                    // preserves full snapshots and skips non-cacheable platforms)
                    try {
                        if (siteKey === 'chatgpt' && StoreManager && typeof StoreManager.debouncedSave === 'function') {
                            const convId = (session && session.convId) || (Identity && Identity.getCurrentId()) || location.href;
                            if (convId) StoreManager.debouncedSave(convId, store, session, false);
                        }
                    } catch (e) { /* never break TOC */ }
                    if (onUpdateCallback) onUpdateCallback();
                }
            } catch (e) { /* ignore */ }
        }

        const scanCurrent = (site, session) => {
            if (session && !isCurrentSession(session)) return 0;
            const store = StoreManager.getStore();
            const key = site || siteKey || 'chatgpt';
            const sel = SELECTORS[key] || SELECTORS.chatgpt;
            let found = 0;

            if (key === 'chatgpt') {
                // -----------------------------------------------------------------
                // NEW UI (LIVE-VERIFIED 2026-10-10)
                // Turns are [data-turn-key] wrappers holding a [data-user-message-bubble]
                // and/or a [data-markdown-text-style="assistant-message"] body. Message
                // IDs come from the per-unit search registry when present; otherwise the
                // turn UUID is used, which is stable across virtualization.
                // Legacy prompt bars/index mapping do not exist here.
                // -----------------------------------------------------------------
                // Scoped to the ACTIVE conversation (never document-wide) so a
                // still-mounted outgoing thread cannot leak into this store.
                const newTurns = (window.TOC.dom && window.TOC.dom.activeTurns)
                    ? window.TOC.dom.activeTurns()
                    : document.querySelectorAll(sel.turnContainerNew);
                if (newTurns.length > 0) {
                    const firstIdOf = (unit) => {
                        if (!unit) return null;
                        const raw = unit.getAttribute(sel.unitMsgIdsAttr);
                        return raw ? (raw.trim().split(/\s+/)[0] || null) : null;
                    };
                    newTurns.forEach(turn => {
                        const turnKey = turn.getAttribute(sel.turnKeyAttr);
                        if (!turnKey) return;
                        const offsetTop = turn.offsetTop;
                        const userUnit = turn.querySelector(`[${sel.unitKeyAttr}$=":user"]`);
                        const assistantUnit = turn.querySelector(`[${sel.unitKeyAttr}$=":assistant"]`);
                        const userEl = turn.querySelector(sel.userMessageNew) || userUnit;
                        const assistantEl = turn.querySelector(sel.assistantMessageNew) || assistantUnit;

                        if (userEl) {
                            const userMsgId = firstIdOf(userUnit);
                            const text = userEl.textContent.trim() || '[Attachment]';
                            const id = userMsgId || `${turnKey}:user`;
                            if (!store.has(id)) {
                                store.add({
                                    id,
                                    role: 'user',
                                    text,
                                    isTruncated: false,
                                    promptBarIndex: null,
                                    turnId: turnKey,
                                    messageId: userMsgId,
                                    offsetTop,
                                    // DOM turn index (fallback-turn-N): always present and
                                    // an ordering signal the Navigator can trust even when
                                    // no store record resolves for a mounted turn.
                                    turnNumber: turnNumberFromEl(turn),
                                    source: 'c6',
                                });
                                found++;
                            } else {
                                const existing = store.getById(id);
                                if (existing) {
                                    // Backfill ids/geometry the first time this record is seen,
                                    // and upgrade the text whenever the DOM now holds more of
                                    // it (the record may have been added from a stub/API merge).
                                    const patch = {
                                        turnId: turnKey,
                                        messageId: userMsgId,
                                        offsetTop,
                                        turnNumber: turnNumberFromEl(turn),
                                    };
                                    if (text.length > (existing.text || '').length) patch.text = text;
                                    const geometryMissing = existing.turnNumber === null || existing.turnNumber === undefined
                                        || existing.offsetTop === null || existing.offsetTop === undefined;
                                    if (geometryMissing || patch.text !== undefined) {
                                        store.update(id, patch);
                                    }
                                }
                            }
                        }
                        if (assistantEl) {
                            const assistantMsgId = firstIdOf(assistantUnit);
                            const text = assistantEl.textContent.trim();
                            if (text) {
                                const id = assistantMsgId || `${turnKey}:assistant`;
                                if (!store.has(id)) {
                                    store.add({
                                        id,
                                        role: 'assistant',
                                        text,
                                        isTruncated: false,
                                        promptBarIndex: null,
                                        turnId: turnKey,
                                        messageId: assistantMsgId,
                                        offsetTop,
                                        turnNumber: turnNumberFromEl(turn),
                                        source: 'c6',
                                    });
                                    found++;
                                } else {
                                    const existing = store.getById(id);
                                    if (existing && text.length > (existing.text || '').length) {
                                        store.update(id, { text, offsetTop, turnId: turnKey, messageId: assistantMsgId });
                                    }
                                }
                            }
                        }
                    });
                    if (found > 0) console.log(`[TOC C6] (new UI) Scanned ${found} new messages, total: ${store.size()}`);
                    return found;
                }

                // -----------------------------------------------------------------
                // LEGACY UI
                // -----------------------------------------------------------------
                // ChatGPT: use turn containers with data-testid
                const turns = document.querySelectorAll(sel.turnContainer);
                turns.forEach(turn => {
                    const turnId = turn.getAttribute(sel.turnIdAttr) || turn.getAttribute('data-testid');
                    const turnNum = turn.getAttribute('data-testid')?.match(/(\d+)/)?.[1];
                    const userEl = turn.querySelector(sel.userMessage);
                    const assistantEl = turn.querySelector(sel.assistantMessage);
                    const userMsgId = userEl?.getAttribute(sel.messageIdAttr);
                    const assistantMsgId = assistantEl?.getAttribute(sel.messageIdAttr);

                    if (userEl) {
                        const text = userEl.textContent.trim() || '[Attachment]';
                        const id = userMsgId || turnId || `turn-${turnNum}-user`;
                        // Fix: Use turnNum to compute promptBarIndex for correct matching
                        // ChatGPT: user turns are odd numbers 1,3,5... -> idx (n-1)/2
                        let matchedC1 = null;
                        let targetIdx = null;
                        if (turnNum) {
                            const n = parseInt(turnNum, 10);
                            // Check if this is a user turn (odd) and compute idx
                            const turnRole = turn.getAttribute('data-turn');
                            if (turnRole === 'user' && n % 2 === 1) {
                                targetIdx = (n - 1) / 2;
                            } else if (!turnRole && n % 2 === 1) {
                                // Fallback: assume odd is user
                                targetIdx = (n - 1) / 2;
                            }
                            if (targetIdx !== null && targetIdx >= 0 && targetIdx < 100) {
                                const candidate = store.getByPromptBarIndex(targetIdx);
                                if (candidate && candidate.id.startsWith('c1-') && candidate.text.startsWith('Prompt ')) {
                                    matchedC1 = candidate;
                                } else if (candidate && candidate.text && candidate.text.slice(0, 30).toLowerCase() === text.slice(0, 30).toLowerCase()) {
                                    // Already upgraded but same text, update
                                    matchedC1 = candidate;
                                }
                            }
                        }
                        // Fallback: if no turnNum mapping, try text prefix or first un-upgraded
                        if (!matchedC1) {
                            const textPrefix = text.slice(0, 30).toLowerCase();
                            let alreadyExists = false;
                            for (const m of store.getAll()) {
                                if (m.role === 'user' && m.text && !m.text.startsWith('Prompt ') && m.text.slice(0, 30).toLowerCase() === textPrefix) {
                                    alreadyExists = true;
                                    break;
                                }
                            }
                            if (!alreadyExists) {
                                for (const m of store.getAll()) {
                                    if (m.promptBarIndex !== null && m.id.startsWith('c1-') && m.text && m.text.startsWith('Prompt ')) {
                                        matchedC1 = m;
                                        break;
                                    }
                                }
                            }
                        }
                        if (matchedC1) {
                            const oldId = matchedC1.id;
                            const oldIdx = matchedC1.promptBarIndex;
                            store.update(oldId, {
                                text,
                                isTruncated: false,
                                turnId,
                                messageId: userMsgId,
                                offsetTop: turn.offsetTop,
                                turnNumber: turnNum ? parseInt(turnNum, 10) : null,
                                source: 'c6',
                            });
                            if (id !== oldId && userMsgId) {
                                const updated = store.getById(oldId);
                                if (updated) {
                                    store.messages.delete(oldId);
                                    store.messages.set(id, { ...updated, id });
                                    store.order = store.order.map(x => x === oldId ? id : x);
                                    store.uuidSet.delete(oldId);
                                    store.uuidSet.add(id);
                                    if (oldIdx !== null) {
                                        store.promptBarIndexMap.set(oldIdx, id);
                                    }
                                }
                            }
                            found++;
                        } else if (!store.has(id)) {
                            const textPrefix = text.slice(0, 30).toLowerCase();
                            let isDuplicate = false;
                            for (const m of store.getAll()) {
                                if (m.role === 'user' && m.text && !m.text.startsWith('Prompt ') && m.text.slice(0, 30).toLowerCase() === textPrefix && textPrefix.length > 10) {
                                    isDuplicate = true;
                                    break;
                                }
                            }
                            if (!isDuplicate) {
                                store.add({
                                    id,
                                    role: 'user',
                                    text,
                                    isTruncated: false,
                                    // Persist computed targetIdx so bar navigation + index map work.
                                    promptBarIndex: (targetIdx !== null && targetIdx !== undefined) ? targetIdx : null,
                                    turnId,
                                    messageId: userMsgId,
                                    offsetTop: turn.offsetTop,
                                    turnNumber: turnNum ? parseInt(turnNum, 10) : null,
                                    source: 'c6',
                                });
                                found++;
                            }
                        } else {
                            const existing = store.getById(id);
                            // Always update turnNumber if missing or different
                            const newTurnNum = turnNum ? parseInt(turnNum, 10) : null;
                            // Self-heal records poisoned by earlier scans (null promptBarIndex,
                            // stale tiny offsetTop captured during scroll-to-top recycling).
                            const needsBarIdx = existing && (existing.promptBarIndex === null || existing.promptBarIndex === undefined) && targetIdx !== null && targetIdx !== undefined;
                            const existingTop = existing ? existing.offsetTop : null;
                            const observedTop = turn.offsetTop;
                            const needsTopFix = existing && typeof observedTop === 'number' && observedTop > 200 && (existingTop === null || existingTop === undefined || (typeof existingTop === 'number' && existingTop < 200));
                            if (existing && (existing.turnNumber === null || existing.turnNumber === undefined) && newTurnNum !== null) {
                                const updates = { turnNumber: newTurnNum, offsetTop: turn.offsetTop };
                                if (needsBarIdx) updates.promptBarIndex = targetIdx;
                                store.update(id, updates);
                                if (needsBarIdx) {
                                    try { store.promptBarIndexMap.set(targetIdx, id); } catch (e) { /* ignore */ }
                                }
                            } else if (existing && existing.text !== text && text.length > existing.text.length) {
                                const updates = { text, offsetTop: turn.offsetTop, turnNumber: newTurnNum };
                                if (needsBarIdx) updates.promptBarIndex = targetIdx;
                                store.update(id, updates);
                                if (needsBarIdx) {
                                    try { store.promptBarIndexMap.set(targetIdx, id); } catch (e) { /* ignore */ }
                                }
                            } else if (existing && newTurnNum !== null && existing.turnNumber !== newTurnNum) {
                                store.update(id, { turnNumber: newTurnNum });
                            } else if (existing && (needsBarIdx || needsTopFix)) {
                                const updates = {};
                                if (needsBarIdx) updates.promptBarIndex = targetIdx;
                                if (needsTopFix) updates.offsetTop = observedTop;
                                store.update(id, updates);
                                if (needsBarIdx) {
                                    try { store.promptBarIndexMap.set(targetIdx, id); } catch (e) { /* ignore */ }
                                }
                            }
                        }
                    }
                    if (assistantEl) {
                        const text = assistantEl.textContent.trim();
                        if (!text) return;
                        const id = assistantMsgId || `${turnId}-assistant` || `turn-${turnNum}-assistant`;
                        if (!store.has(id)) {
                            store.add({
                                id,
                                role: 'assistant',
                                text,
                                isTruncated: false,
                                promptBarIndex: null,
                                turnId,
                                messageId: assistantMsgId,
                                offsetTop: turn.offsetTop,
                                turnNumber: turnNum ? parseInt(turnNum, 10) : null,
                                source: 'c6',
                            });
                            found++;
                        } else {
                            const existing = store.getById(id);
                            const newTurnNum2 = turnNum ? parseInt(turnNum, 10) : null;
                            if (existing && text.length > existing.text.length) {
                                store.update(id, { text, offsetTop: turn.offsetTop, turnNumber: newTurnNum2 });
                            } else if (existing && (existing.turnNumber === null || existing.turnNumber === undefined) && newTurnNum2 !== null) {
                                store.update(id, { turnNumber: newTurnNum2 });
                            }
                        }
                    }
                });
                // Also handle case where turns are not in containers (fallback)
                if (turns.length === 0) {
                    const userMsgs = document.querySelectorAll(sel.userMessage);
                    userMsgs.forEach((el, idx) => {
                        const msgId = el.getAttribute(sel.messageIdAttr) || `user-${idx}`;
                        if (!store.has(msgId)) {
                            const text = el.textContent.trim() || '[Attachment]';
                            store.add({
                                id: msgId,
                                role: 'user',
                                text,
                                isTruncated: false,
                                promptBarIndex: null,
                                turnId: null,
                                messageId: msgId,
                                offsetTop: el.offsetTop,
                                source: 'c6',
                            });
                            found++;
                        }
                    });
                }
            } else {
                // Other platforms: generic scan
                const userMsgs = document.querySelectorAll(sel.userMessage);
                userMsgs.forEach((el, idx) => {
                    const text = el.textContent.trim() || '[Attachment]';
                    // Use text hash as id for dedup
                    const id = el.getAttribute('data-message-id') || el.getAttribute('data-testid') || `msg-${key}-${idx}-${text.slice(0, 20).replace(/\W/g, '')}`;
                    if (!store.has(id)) {
                        store.add({
                            id,
                            role: 'user',
                            text,
                            isTruncated: false,
                            promptBarIndex: null,
                            turnId: null,
                            messageId: id,
                            offsetTop: el.offsetTop,
                            source: 'c6',
                        });
                        found++;
                    }
                });
                // Try assistant
                if (sel.assistantMessage) {
                    const assistantMsgs = document.querySelectorAll(sel.assistantMessage);
                    assistantMsgs.forEach((el, idx) => {
                        const text = el.textContent.trim();
                        if (!text) return;
                        const id = el.getAttribute('data-message-id') || `assistant-${key}-${idx}`;
                        if (!store.has(id)) {
                            store.add({
                                id,
                                role: 'assistant',
                                text,
                                isTruncated: false,
                                promptBarIndex: null,
                                turnId: null,
                                messageId: id,
                                offsetTop: el.offsetTop,
                                source: 'c6',
                            });
                            found++;
                        }
                    });
                }
            }
            if (found > 0) console.log(`[TOC C6] Scanned ${found} new messages, total: ${store.size()}`);
            return found;
        };

        const start = (site, onUpdate, session) => {
            siteKey = site || 'chatgpt';
            onUpdateCallback = onUpdate;
            activeSession = session || null;
            const store = StoreManager.getStore();
            lastUuidSet = store.getUuidSet();
            lastTextMap = captureTextMap(store);

            // Initial scan (session-guarded)
            if (!activeSession || isCurrentSession(activeSession)) {
                scanCurrent(siteKey, activeSession);
                // Refresh fingerprint after initial scan so upgrades are detected next time
                try {
                    lastUuidSet = store.getUuidSet();
                    lastTextMap = captureTextMap(store);
                } catch (e) { /* ignore */ }
            }
            if (onUpdateCallback && (!activeSession || isCurrentSession(activeSession))) {
                try { onUpdateCallback(); } catch (e) { /* ignore */ }
            }

            // Find scroll container (LIVE: div[class*="scrollbar-gutter"] for ChatGPT)
            const container = findScrollContainer(siteKey);
            if (!container) {
                console.warn('[TOC C6] No scroll container found, observing body');
            }
            const target = container || document.body;
            console.log(`[TOC C6] Observing ${target.tagName}.${target.className.slice(0, 60)} for ${siteKey}`);

            // Disconnect old observer (Trap 16)
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (debounceTimer) clearTimeout(debounceTimer);

            const debouncedScan = debounce(() => {
                RIC(() => {
                    if (activeSession && !isCurrentSession(activeSession)) return;
                    scanCurrent(siteKey, activeSession);
                    guardedFire(activeSession, store);
                });
            }, 200);
            debouncedScanFn = debouncedScan;

            observer = new MutationObserver(debouncedScan);
            observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-is-intersecting'] });

            // Also observe scroll to catch virtualization that doesn't trigger childList
            let lastScrollTop = target ? target.scrollTop : 0;
            const scrollHandler = () => {
                const currentTop = target ? target.scrollTop : 0;
                if (Math.abs(currentTop - lastScrollTop) < 150) return;
                lastScrollTop = currentTop;
                clearTimeout(scrollDebounce);
                scrollDebounce = setTimeout(() => {
                    RIC(() => {
                        if (activeSession && !isCurrentSession(activeSession)) return;
                        scanCurrent(siteKey, activeSession);
                        guardedFire(activeSession, store);
                    });
                }, 500);
            };
            if (target && target !== document.body) {
                target.addEventListener('scroll', scrollHandler, { passive: true });
                observer._scrollHandler = scrollHandler;
                observer._scrollTarget = target;
            }

            // If we fell back to body, try re-targeting after SPA mount
            if (target === document.body) {
                const retargetSession = activeSession;
                setTimeout(() => {
                    if (retargetSession && !isCurrentSession(retargetSession)) return;
                    if (!observer) return;
                    const actual = findScrollContainer(siteKey);
                    if (actual && actual !== document.body) {
                        console.log('[TOC C6] Re-targeting observer to', actual.className.slice(0, 60));
                        observer.disconnect();
                        if (observer._scrollTarget) observer._scrollTarget.removeEventListener('scroll', observer._scrollHandler);
                        observer.observe(actual, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-is-intersecting'] });
                        actual.addEventListener('scroll', scrollHandler, { passive: true });
                        observer._scrollHandler = scrollHandler;
                        observer._scrollTarget = actual;
                    }
                }, 2000);
            }

            // Also listen for URL changes to reset
            // Note: registered per start() (legacy behavior). Router-level destroy()
            // handles generation invalidation + pending-save cancel; this only stops DOM work.
            Identity.onUrlChange(() => {
                console.log('[TOC C6] URL changed, resetting observer');
                stop();
                // Re-init will be handled by main.js router
            });
        };

        const stop = () => {
            if (observer) {
                if (observer._scrollTarget && observer._scrollHandler) {
                    observer._scrollTarget.removeEventListener('scroll', observer._scrollHandler);
                }
                observer.disconnect();
                observer = null;
            }
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            // Cancel pending C6 debounce + scroll callbacks so stale work can't
            // fire into the next chat's store after SPA navigation.
            try {
                if (debouncedScanFn && typeof debouncedScanFn.cancel === 'function') debouncedScanFn.cancel();
            } catch (e) { /* ignore */ }
            debouncedScanFn = null;
            try {
                if (scrollDebounce) clearTimeout(scrollDebounce);
            } catch (e) { /* ignore */ }
            scrollDebounce = null;
            activeSession = null;
            console.log('[TOC C6] Observer stopped');
        };

        return { scanCurrent, start, stop, getObserver: () => observer };
    })();

    // -------------------------------------------------------------------------
    // Window helpers (v1.9.2) — shared by the C7 scan and the virtual-jump engine.
    // `turnNumberFromEl` / `windowSignature` are defined with the jump engine
    // below; these helpers are only invoked at runtime, long after evaluation.
    // -------------------------------------------------------------------------
    // rAF with timeout fallback: rAF never fires in hidden tabs, which wedged
    // isScanning=true forever once the 30s backstop was removed. Module-scope so
    // C7 AND the window helpers below can use it.
    const nextFrame = () => new Promise((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        try {
            requestAnimationFrame(() => requestAnimationFrame(done));
        } catch (e) { done(); }
        setTimeout(done, 500);
    });

    /** Min/max turn number mounted in the ACTIVE thread; null when unavailable. */
    const mountedTurnRange = () => {
        const turns = (window.TOC.dom && window.TOC.dom.activeTurns) ? window.TOC.dom.activeTurns() : [];
        let min = null;
        let max = null;
        for (const t of turns) {
            const n = turnNumberFromEl(t);
            if (n === null) continue;
            if (min === null || n < min) min = n;
            if (max === null || n > max) max = n;
        }
        return (min === null) ? null : { min, max };
    };

    /** Resolve as soon as the mounted window changes (or after timeoutMs). */
    const waitForWindowChange = async (prevSig, timeoutMs) => {
        // No window signal (legacy UI or a non-ChatGPT platform): fall back to the
        // previous short rAF + sleep so other sites keep their original timing.
        if (!prevSig) {
            await nextFrame();
            await nextFrame();
            await new Promise(r => setTimeout(r, 50));
            return false;
        }
        const deadline = performance.now() + (timeoutMs || 260);
        while (performance.now() < deadline) {
            await nextFrame();
            if (windowSignature() !== prevSig) return true;
            await new Promise(r => setTimeout(r, 20));
        }
        return false;
    };

    // -------------------------------------------------------------------------
    // C7: Scroll Scanner (All platforms, replaces Refresh)
    // -------------------------------------------------------------------------
    // Drop C1 placeholder stubs ("Prompt N") that a full C7 scroll never
    // upgraded to real text (deleted/regenerated turns), then rebuild the
    // store authoritatively via replaceAll. Only placeholders are pruned —
    // real uuids missed by virtualization gaps are kept and corrected by C3.
    function pruneStalePlaceholders(store) {
        try {
            if (!store || typeof store.getAll !== 'function') return 0;
            const all = store.getAll();
            const stale = all.filter((m) =>
                m && typeof m.id === 'string' && m.id.indexOf('c1-') === 0 &&
                typeof m.text === 'string' && m.text.indexOf('Prompt ') === 0
            );
            if (stale.length === 0) return 0;
            const staleIds = new Set(stale.map((m) => m.id));
            const kept = all.filter((m) => !staleIds.has(m.id));
            const wasFull = !!store.isFullyScanned;
            store.replaceAll(kept, wasFull);
            console.log(`[TOC C7] Pruned ${stale.length} stale placeholders`);
            return stale.length;
        } catch (e) {
            return 0;
        }
    }

    const C7 = (function () {
        let isScanning = false;
        let isPaused = false;
        let scanAbort = false;
        let scanGen = 0; // generation token: stale/hung scans exit when superseded
        let scanStartWall = 0;
        let ceilingTimer = null;
        const STALL_TIMEOUT_MS = 25000;
        const MAX_SCAN_TIME_MS = 300000;

        // nextFrame() is defined at module scope (shared with the window helpers).

        const scan = async (site, onProgress, onComplete, session) => {
            if (isScanning) {
                console.log('[TOC C7] Already scanning, ignoring');
                return;
            }
            const myGen = ++scanGen;
            const scanSession = session || null;
            const scanConvId = (scanSession && scanSession.convId) || (Identity && Identity.getCurrentId()) || location.href;
            isScanning = true;
            isPaused = false;
            scanAbort = false;
            // Activity watchdog: abort only if no scroll movement AND no new
            // messages for STALL_TIMEOUT_MS. Frozen while tab hidden (isPaused).
            // Absolute ceiling MAX_SCAN_TIME_MS (5min) as final safety net.
            let lastScrollPosition = -1;
            let lastProgressTime = performance.now();
            scanStartWall = performance.now();
            const touchProgress = (scrollPos, addedCount) => {
                if (scrollPos !== lastScrollPosition || (addedCount && addedCount > 0)) {
                    lastScrollPosition = scrollPos;
                    lastProgressTime = performance.now();
                }
            };
            // Ceiling timer: guarantees isScanning is released even if the scan
            // promise wedges (hidden tab, throttled timers, hung rAF).
            if (ceilingTimer) clearTimeout(ceilingTimer);
            ceilingTimer = setTimeout(() => {
                if (scanGen === myGen && isScanning) {
                    console.warn('[TOC C7] Max scan time 5min reached (ceiling)');
                    scanAbort = true;
                    isScanning = false;
                    isPaused = false;
                }
            }, MAX_SCAN_TIME_MS);
            const siteKey = site || 'chatgpt';
            const store = StoreManager.getStore();
            const container = findScrollContainer(siteKey);
            if (!container) {
                console.warn('[TOC C7] No scroll container');
                isScanning = false;
                if (onComplete) onComplete(0);
                return;
            }

            const virtualized = isVirtualized(container);
            console.log(`[TOC C7] Starting scan for ${siteKey}, virtualized: ${virtualized}, height: ${container.scrollHeight}, viewport: ${container.clientHeight}`);

            // UUID-anchor save (Trap 8)
            const S = window.TOC.scroll;
            let savedAnchorId = null;
            let savedAnchorIndex = null;
            // Track the LOGICAL position (0 = oldest) so restore works in both
            // layouts — the native scrollTop is negative on the new UI.
            let savedTop = 0;
            try {
                savedTop = S ? S.getLogical(container) : container.scrollTop;
                const viewportCenter = savedTop + container.clientHeight / 2;
                const turnSel = document.querySelector(SELECTORS.chatgpt.turnContainerNew)
                    ? SELECTORS.chatgpt.turnContainerNew
                    : SELECTORS.chatgpt.turnContainer;
                // New UI: scope to the active conversation's turns (never document-wide)
                const turns = (turnSel === SELECTORS.chatgpt.turnContainerNew && window.TOC.dom && window.TOC.dom.activeTurns)
                    ? window.TOC.dom.activeTurns()
                    : document.querySelectorAll(turnSel);
                let closest = null;
                let closestDist = Infinity;
                turns.forEach(turn => {
                    const center = turn.offsetTop + turn.offsetHeight / 2;
                    const dist = Math.abs(center - viewportCenter);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closest = turn;
                    }
                });
                if (closest) {
                    savedAnchorId = closest.getAttribute(SELECTORS.chatgpt.turnKeyAttr)
                        || closest.getAttribute(SELECTORS.chatgpt.turnIdAttr)
                        || closest.getAttribute('data-testid');
                    const idxAttr = closest.getAttribute('data-testid')?.match(/(\d+)/)?.[1];
                    if (idxAttr) savedAnchorIndex = parseInt(idxAttr, 10) - 1;
                    console.log(`[TOC C7] Saved anchor: ${savedAnchorId} at index ${savedAnchorIndex}`);
                }
            } catch (e) { console.debug('[TOC C7] Anchor save failed', e); }

            const seenIds = new Set(store.getUuidSet());
            let totalFound = 0;
            const startTime = performance.now();

            // Small chat path: single capture, no scroll (instant)
            if (!virtualized) {
                console.log('[TOC C7] Small chat — single capture, no scroll');
                const added = C6.scanCurrent(siteKey, scanSession);
                totalFound += added;
                if (scanSession && !isCurrentSession(scanSession)) return;
                if (onProgress) onProgress({ step: 0, total: 1, found: totalFound, isSmall: true });
                // Restore anchor (no scroll needed, but ensure visible)
                if (savedAnchorId) {
                    const el = document.querySelector(`[data-turn-key="${savedAnchorId}"]`)
                        || document.querySelector(`[data-turn-id="${savedAnchorId}"]`);
                    if (el && S) S.scrollByElement(container, el, 'center');
                    else if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
                }
                isScanning = false;
                isPaused = false;
                scanAbort = false;
                // Full C7 completion: prune stale placeholders, rebuild authoritatively,
                // mark fully scanned + persist (StorageManager skips when disabled).
                // Stale real-uuid deletions are corrected by the next full C3 refresh.
                try {
                    if (scanGen === myGen && !scanAbort && (!scanSession || isCurrentSession(scanSession))) {
                        pruneStalePlaceholders(store);
                        store.isFullyScanned = true;
                        if (StoreManager && typeof StoreManager.save === 'function' && scanConvId) {
                            await StoreManager.save(scanConvId, store, true, scanSession);
                        }
                    }
                } catch (e) { /* never break TOC */ }
                if (scanGen === myGen && (!scanSession || isCurrentSession(scanSession))) {
                    if (onComplete) onComplete(totalFound);
                }
                console.log(`[TOC C7] Small chat scan done in ${(performance.now() - startTime).toFixed(0)}ms, found ${totalFound}`);
                return;
            }

            // Large chat path: incremental scroll
            // v1.9.2: adaptive step — starts at 0.85 viewport, grows while the mounted
            // windows overlap, and backs off (rewind + rescan) the moment a coverage
            // gap appears. Falls back to a fixed step when turn numbers are unknown.
            let stepRatio = 0.85;
            const MIN_STEP_RATIO = 0.5;
            const MAX_STEP_RATIO = 1.5;
            let stepGapUndos = 0;
            let lastMaxTurn = null;
            const maxSteps = 500;
            let staleCount = 0;
            const MAX_STALE = 15;
            let prevHeight = container.scrollHeight;
            let steps = 0;
            let noNewCount = 0;

            // Visibility handling (Trap 17)
            const handleVisibility = () => {
                if (document.hidden && isScanning) {
                    isPaused = true;
                    console.log('[TOC C7] Paused — tab hidden');
                    if (onProgress) onProgress({ paused: true });
                } else if (!document.hidden && isPaused) {
                    isPaused = false;
                    console.log('[TOC C7] Resumed — tab visible');
                    if (onProgress) onProgress({ paused: false });
                }
            };
            document.addEventListener('visibilitychange', handleVisibility);

            try {
                // Scroll to top (oldest) — logical 0, not native 0 (new UI is
                // column-reverse where native 0 is the NEWEST message).
                if (S) S.setLogical(container, 0);
                else container.scrollTo({ top: 0, behavior: 'instant' });
                await nextFrame();
                await nextFrame();
                await new Promise(r => setTimeout(r, 300));
                if (scanGen !== myGen || scanAbort) return;
                if (scanSession && !isCurrentSession(scanSession)) return;

                // Materialize the lazy-loaded oldest pages first (2026-11-09):
                // ChatGPT fetches older messages in ~10-turn pages only while
                // the viewport dwells at the oldest boundary, so a plain 300 ms
                // wait starts the scan above a wall of unmaterialized spacer
                // (a 265-node chat had its oldest ~190 nodes unmounted). Pin,
                // wait for prepends, re-pin, capture as pages arrive.
                //
                // FAST EXIT (v1.9.3): when C3 already stamped positions, the
                // earliest mounted apiIndex tells us whether older pages can
                // exist at all. `<= 1` ⇒ the true oldest message is mounted ⇒
                // skip the dwell entirely — small/medium chats must not pay a
                // ~5 s idle tax per scan.
                const earliestMountedIndex = () => {
                    try {
                        const positions = mountedRecords(store)
                            .map(r => (typeof r.domPosition === 'number') ? r.domPosition
                                : (r.rec && typeof r.rec.apiIndex === 'number') ? r.rec.apiIndex : null)
                            .filter(v => v !== null && v !== undefined);
                        return positions.length ? Math.min(...positions) : null;
                    } catch (e) { return null; }
                };
                const materializeAtOldest = async (maxHoldMs) => {
                    const deadline = performance.now() + (maxHoldMs || 45000);
                    let idleRounds = 0;
                    while (!scanAbort && scanGen === myGen && performance.now() < deadline) {
                        if (scanAbort || scanGen !== myGen) return;
                        const earliest = earliestMountedIndex();
                        if (earliest !== null && earliest <= 1) break; // true top already mounted
                        if (S) S.setLogical(container, 0);
                        else container.scrollTo({ top: 0, behavior: 'instant' });
                        const h0 = container.scrollHeight;
                        const sig0 = windowSignature();
                        const roundDeadline = performance.now() + JUMP.holdPageMs;
                        let grew = false;
                        while (!scanAbort && scanGen === myGen && performance.now() < roundDeadline) {
                            await nextFrame();
                            await new Promise(r => setTimeout(r, 100));
                            if (scanAbort || scanGen !== myGen) return;
                            if (container.scrollHeight !== h0 || windowSignature() !== sig0) grew = true;
                        }
                        const pageAdded = C6.scanCurrent(siteKey, scanSession);
                        totalFound += pageAdded;
                        if (onProgress) onProgress({ step: steps, total: maxSteps, found: store.getUserMessages().length, scrollTop: 0 });
                        if (!grew) {
                            idleRounds++;
                            if (idleRounds >= 2) break; // boundary refuses to move
                        } else {
                            idleRounds = 0;
                        }
                    }
                };
                await materializeAtOldest(45000);
                if (scanGen !== myGen || scanAbort) return;
                if (scanSession && !isCurrentSession(scanSession)) return;
                let added = C6.scanCurrent(siteKey, scanSession);
                totalFound += added;
                if (onProgress) onProgress({ step: 0, total: maxSteps, found: store.getUserMessages().length });

                // Incremental scroll
                for (let i = 0; i < maxSteps; i++) {
                    if (scanAbort || scanGen !== myGen) break;
                    if (scanSession && !isCurrentSession(scanSession)) break;
                    // Pause if hidden
                    while (isPaused && !scanAbort && scanGen === myGen) {
                        await new Promise(r => setTimeout(r, 500));
                    }
                    if (scanAbort || scanGen !== myGen) break;

                    const beforeTop = container.scrollTop;
                    const beforeHeight = container.scrollHeight;
                    const beforeCount = store.size();

                    const scrollStep = Math.floor(container.clientHeight * stepRatio);
                    const sigBefore = windowSignature();
                    S.setLogical(container, S.getLogical(container) + scrollStep);
                    // Event-driven wait: proceed as soon as the virtualizer swaps the
                    // mounted window (typically 1–3 frames) instead of a fixed sleep.
                    await waitForWindowChange(sigBefore, 260);
                    if (scanGen !== myGen || scanAbort) break;
                    if (scanSession && !isCurrentSession(scanSession)) break;

                    const afterTop = container.scrollTop;
                    const afterHeight = container.scrollHeight;
                    added = C6.scanCurrent(siteKey, scanSession);
                    totalFound += added;
                    steps++;
                    touchProgress(afterTop, added);

                    // Fix: Progress counts user only, not total (avoid 484 double count)
                    const userFound = store.getUserMessages().length;
                    if (onProgress) onProgress({ step: steps, total: maxSteps, found: userFound, scrollTop: afterTop });

                    // Coverage validation (v1.9.2): consecutive windows must overlap.
                    // When a gap is detected, rewind one step, shrink the step and let
                    // the next iteration rescan that span. Bounded by stepGapUndos.
                    const range = mountedTurnRange();
                    if (range) {
                        if (lastMaxTurn !== null && range.min > lastMaxTurn && stepGapUndos < 6) {
                            console.log(`[TOC C7] Coverage gap (min ${range.min} > last max ${lastMaxTurn}) — rewinding`);
                            S.setLogical(container, S.getLogical(container) - scrollStep);
                            stepRatio = Math.max(MIN_STEP_RATIO, stepRatio * 0.6);
                            stepGapUndos++;
                            lastMaxTurn = null; // re-establish after the rescan
                            continue;
                        }
                        if (lastMaxTurn !== null) {
                            stepRatio = Math.min(MAX_STEP_RATIO, stepRatio * 1.08);
                        }
                        lastMaxTurn = range.max;
                    }

                    // Stall watchdog: abort only if neither scroll position nor store
                    // advanced for STALL_TIMEOUT_MS. Frozen while tab hidden.
                    if (!isPaused && performance.now() - lastProgressTime > STALL_TIMEOUT_MS) {
                        console.warn('[TOC C7] Scan stalled for 25s at position', afterTop);
                        break;
                    }

                    // Reverse illusion handling (Trap 5) — LIVE: height -16 at step 3
                    if (afterHeight < prevHeight) {
                        staleCount++;
                        console.log(`[TOC C7] Reverse illusion: height ${beforeHeight} -> ${afterHeight}, stale ${staleCount}`);
                        if (staleCount > MAX_STALE) {
                            console.log('[TOC C7] Max stale reached, stopping');
                            break;
                        }
                    } else {
                        staleCount = 0;
                    }
                    prevHeight = afterHeight;

                    // Idle detection: only abort if no new messages across a large span
                    if (added === 0) {
                        noNewCount++;
                        if (noNewCount >= 60 && i > 50) {
                            console.log('[TOC C7] No new for 60 steps, stopping early');
                            break;
                        }
                    } else {
                        noNewCount = 0;
                    }

                    // Check if at bottom — settle first: React virtualizer uses
                    // estimated placeholder heights, so scrollHeight can expand
                    // after measuring real content (36k -> 66k observed live).
                    if (S.getLogical(container) >= S.maxTop(container) - 10) {
                        await new Promise(r => setTimeout(r, 250));
                        if (scanGen !== myGen || scanAbort) break;
                        if (scanSession && !isCurrentSession(scanSession)) break;
                        if (container.scrollHeight > afterHeight + 50) {
                            console.log(`[TOC C7] ScrollHeight expanded ${afterHeight} -> ${container.scrollHeight}, continuing scan`);
                            prevHeight = container.scrollHeight;
                            touchProgress(container.scrollTop, 1);
                            continue;
                        }
                        console.log('[TOC C7] Reached bottom');
                        break;
                    }
                    // Absolute ceiling: 5min safety (wall clock, not paused-adjusted)
                    if (performance.now() - scanStartWall > MAX_SCAN_TIME_MS) {
                        console.log('[TOC C7] Max scan time 5min reached');
                        break;
                    }
                }

                // Final capture at bottom — also re-scan top to catch any missed first turns
                if (scanGen === myGen && !scanAbort && (!scanSession || isCurrentSession(scanSession))) {
                    S.setLogical(container, S.maxTop(container));
                    await new Promise(r => setTimeout(r, 200));
                    if (scanGen !== myGen || scanAbort) return;
                    if (scanSession && !isCurrentSession(scanSession)) return;
                    added = C6.scanCurrent(siteKey, scanSession);
                    totalFound += added;
                }
                // Re-scan top: virtualization may have hidden first turns during bottom scroll
                if (scanGen === myGen && !scanAbort && (!scanSession || isCurrentSession(scanSession))) {
                    if (S) S.setLogical(container, 0);
                    else container.scrollTo({ top: 0, behavior: 'instant' });
                    await nextFrame();
                    await new Promise(r => setTimeout(r, 300));
                    if (scanGen !== myGen || scanAbort) return;
                    if (scanSession && !isCurrentSession(scanSession)) return;
                    added = C6.scanCurrent(siteKey, scanSession);
                    totalFound += added;
                }

                // Sort by offsetTop (Trap 5, Bug 2) — LIVE: isOffsetSorted true
                store.sort();

                // Full C7 completion: prune stale placeholders, rebuild authoritatively
                // via replaceAll (drops placeholders for deleted turns), then persist.
                // Stale real-uuid deletions are corrected by the next full C3 refresh.
                try {
                    if (scanGen === myGen && !scanAbort && (!scanSession || isCurrentSession(scanSession))) {
                        pruneStalePlaceholders(store);
                        store.isFullyScanned = true;
                        if (StoreManager && typeof StoreManager.save === 'function' && scanConvId) {
                            await StoreManager.save(scanConvId, store, true, scanSession);
                        }
                    }
                } catch (e) { /* never break TOC */ }

                console.log(`[TOC C7] Scan complete in ${(performance.now() - startTime).toFixed(0)}ms, steps: ${steps}, found: ${totalFound}, total store: ${store.size()}`);

            } finally {
                document.removeEventListener('visibilitychange', handleVisibility);
                // Restore by UUID (Trap 8)
                if (savedAnchorId) {
                    const anchorEl = document.querySelector(`[data-turn-key="${savedAnchorId}"]`)
                        || document.querySelector(`[data-turn-id="${savedAnchorId}"]`);
                    if (anchorEl && S) {
                        console.log(`[TOC C7] Restoring anchor ${savedAnchorId}`);
                        S.scrollByElement(container, anchorEl, 'center');
                    } else if (anchorEl) {
                        anchorEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                    } else if (savedAnchorIndex !== null) {
                        // Fallback to prompt bar (legacy UI only)
                        const bar = document.querySelector(`[data-toc-item-index="${savedAnchorIndex}"]`);
                        if (bar) {
                            console.log(`[TOC C7] Anchor not in DOM, clicking bar ${savedAnchorIndex}`);
                            bar.click();
                        } else if (S) {
                            S.setLogical(container, savedTop);
                        } else {
                            container.scrollTo({ top: savedTop, behavior: 'instant' });
                        }
                    } else if (S) {
                        S.setLogical(container, savedTop);
                    } else {
                        container.scrollTo({ top: savedTop, behavior: 'instant' });
                    }
                } else if (S) {
                    S.setLogical(container, savedTop);
                } else {
                    container.scrollTo({ top: savedTop, behavior: 'instant' });
                }
                await nextFrame();
                if (scanGen === myGen && (!scanSession || isCurrentSession(scanSession))) {
                    isScanning = false;
                    isPaused = false;
                    scanAbort = false;
                    if (onComplete) onComplete(totalFound);
                }
            }
        };

        const abort = () => {
            scanGen++; // invalidate any in-flight scan so it exits at next gate
            scanAbort = true;
            isScanning = false;
            isPaused = false;
            if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
        };

        const forceReset = () => {
            scanGen++; // invalidate any in-flight scan so it exits at next gate
            isScanning = false;
            isPaused = false;
            scanAbort = false;
            if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
        };

        return { scan, abort, forceReset, isScanning: () => isScanning, isPaused: () => isPaused };
    })();

    // -------------------------------------------------------------------------
    // Virtual-jump engine (new UI) — v1.9.2
    //
    // Shaped after GPT-Conversation-Toolkit's `virtualized-jump` flow, reduced to
    // what the DOM actually exposes here:
    //   1. fast path          — target already mounted → centre + flash
    //   2. ratio jump         — exact API branch position (apiIndex/apiTotal)
    //   3. directional search — uses the MOUNTED window's api indices to pick the
    //                           direction, overshoots when the window is stuck,
    //                           refines with smaller steps late
    //   3.5 pagination hold   — target OLDER than the materialized boundary:
    //                           pin logical 0 and let ChatGPT lazy-load pages of
    //                           ~10 turns (it only fetches while the viewport
    //                           dwells at the boundary); re-pin as pages prepend
    //   4. verify             — by turn key / message id (never by offset guess)
    // Cancels the moment the user scrolls or types, so it never fights input.
    // -------------------------------------------------------------------------
    let activeJumpToken = 0;

    const JUMP = {
        maxAttempts: 60,
        largeStep: 0.85,   // × viewport, matches the C7 scan step
        smallStep: 0.25,   // × viewport, late refinement
        overshoot: 1.4,    // × step when the mounted window refuses to change
        pollMs: 60,
        verifyMs: 1200,
        stepWaitMs: 260,
        deadlineMs: 12000, // hard wall-clock budget for one navigation
        // Pagination hold (2026-11-09): ChatGPT lazy-loads older messages in
        // pages of ~10 turns and only fetches them while the viewport dwells
        // at the oldest materialized boundary. These bound that wait.
        holdPageMs: 2500,  // per-pin wait for a page to materialize
        holdMaxMs: 60000,  // hard cap (≈19 sequential pages observed live)
        holdPollMs: 100,
    };

    /** Turn index embedded in the unit key: "fallback-turn-7:0:user" → 7. */
    const turnNumberFromEl = (turnEl) => {
        try {
            const sel = SELECTORS.chatgpt.unitKeyAttr;
            const unit = turnEl.querySelector(`[${sel}]`);
            const key = unit && unit.getAttribute(sel);
            const m = key && key.match(/turn-(\d+)/i);
            return m ? parseInt(m[1], 10) : null;
        } catch (e) {
            return null;
        }
    };

    /** Cheap fingerprint of the mounted turn window (change detection). */
    const windowSignature = () => {
        const turns = (window.TOC.dom && window.TOC.dom.activeTurns) ? window.TOC.dom.activeTurns() : [];
        if (turns.length === 0) return '';
        const first = turns[0].getAttribute(SELECTORS.chatgpt.turnKeyAttr) || '';
        const last = turns[turns.length - 1].getAttribute(SELECTORS.chatgpt.turnKeyAttr) || '';
        let minTurn = null;
        let maxTurn = null;
        for (const t of turns) {
            const n = turnNumberFromEl(t);
            if (n === null) continue;
            if (minTurn === null || n < minTurn) minTurn = n;
            if (maxTurn === null || n > maxTurn) maxTurn = n;
        }
        return `${turns.length}|${first}|${last}|${minTurn === null ? '' : minTurn}:${maxTurn === null ? '' : maxTurn}`;
    };

    /** Store records for the currently mounted turns (apiIndex + ordinal). */
    const mountedRecords = (store) => {
        const out = [];
        const turns = (window.TOC.dom && window.TOC.dom.activeTurns) ? window.TOC.dom.activeTurns() : [];
        if (turns.length === 0) return out;
        let all = [];
        try { all = store.getAll(); } catch (e) { all = []; }
        for (const t of turns) {
            const key = t.getAttribute(SELECTORS.chatgpt.turnKeyAttr);
            if (!key) continue;
            // PRIMARY (no store record required): resolve the turn's API position
            // straight from its DOM ids via C3's published table. Mounted turns are
            // often absent from the store (C6 only adds what it scanned), and the
            // DOM's own turn numbers are local to the render window — they restart
            // at 0 — so ids are the only globally-ordered signal available.
            let domPosition = null;
            try {
                const ids = [key];
                const unit = t.querySelector(`[${SELECTORS.chatgpt.unitKeyAttr}$=":user"]`);
                const raw = unit && unit.getAttribute(SELECTORS.chatgpt.unitMsgIdsAttr);
                if (raw) raw.trim().split(/\s+/).forEach(x => { if (x) ids.push(x); });
                for (const id of ids) {
                    const p = (typeof store.positionOfId === 'function') ? store.positionOfId(id) : null;
                    if (typeof p === 'number') { domPosition = p; break; }
                }
            } catch (e) { /* ignore */ }
            // Prefer a candidate that actually carries an apiIndex — the same turn can
            // have more than one record if a previous merge failed to de-duplicate.
            const byTurn = all.filter(m => m.turnId === key);
            let rec = byTurn.find(m => typeof m.apiIndex === 'number') || byTurn[0] || null;
            if (!rec) {
                try {
                    const unit2 = t.querySelector(`[${SELECTORS.chatgpt.unitKeyAttr}$=":user"]`);
                    const raw2 = unit2 && unit2.getAttribute(SELECTORS.chatgpt.unitMsgIdsAttr);
                    const id = raw2 ? raw2.trim().split(/\s+/)[0] : null;
                    if (id) {
                        const cand = [store.getById(id)]
                            .concat(all.filter(m => m.messageId === id))
                            .filter(Boolean);
                        rec = cand.find(m => typeof m.apiIndex === 'number') || cand[0] || null;
                    }
                } catch (e) { /* ignore */ }
            }
            out.push({
                key,
                rec,
                domPosition,
                ordinal: rec ? all.indexOf(rec) : -1,
                turnNumber: turnNumberFromEl(t),
            });
        }
        return out;
    };

    /**
     * Resolve + scroll + flash. Returns true only when a mounted element was
     * verified — never when a scroll merely happened.
     */
    const performVirtualJump = async (msg, container, store, onProgress) => {
        const S = window.TOC.scroll;
        if (!S || !container || !msg) return false;
        const myToken = ++activeJumpToken;
        const stillActive = () => myToken === activeJumpToken;
        const t0 = performance.now();
        // Aborts are logged so a silent "not reachable" can always be told apart
        // from a real search failure.
        const abort = (why) => {
            console.warn(`[TOC Nav] Aborted (${why}) after ${(performance.now() - t0).toFixed(0)}ms`);
            Navigator.lastAbortReason = why;
            return false;
        };

        // User intent cancels the jump instantly (never fight manual scrolling).
        let cancelled = false;
        const cancel = () => { cancelled = true; };
        const cancelEvents = ['wheel', 'touchstart', 'pointerdown'];
        const cancelOpts = { passive: true, capture: true };
        const cancelKeys = () => { cancelled = true; };
        cancelEvents.forEach(ev => window.addEventListener(ev, cancel, cancelOpts));
        window.addEventListener('keydown', cancelKeys, true);
        const cleanup = () => {
            cancelEvents.forEach(ev => window.removeEventListener(ev, cancel, cancelOpts));
            window.removeEventListener('keydown', cancelKeys, true);
        };

        // Scope lookups to the ACTIVE thread: the outgoing chat's turns stay
        // mounted for a while during a swap and must never be matched.
        //
        // Matching order: DOM turn key → message id (legacy attrs) → the per-unit
        // search registry → TEXT fingerprint. The last fallback exists because a
        // record's ids can disagree with the live DOM (id scheme changes, records
        // merged from the API before the turn ever mounted). Live evidence: a middle
        // row could sit inside the mounted window yet never match by id.
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const needle = norm(msg.text).slice(0, 48);
        const byText = () => {
            if (needle.length < 12) return null;
            const turns = (window.TOC.dom && window.TOC.dom.activeTurns) ? window.TOC.dom.activeTurns() : [];
            const sel = (msg.role === 'assistant')
                ? SELECTORS.chatgpt.assistantMessageNew
                : SELECTORS.chatgpt.userMessageNew;
            for (const t of turns) {
                const node = t.querySelector(sel);
                if (!node) continue;
                const text = norm(node.textContent);
                if (text.slice(0, needle.length) === needle) return t;
            }
            return null;
        };
        const findEl = (m) => {
            try {
                if (m.turnId) {
                    const el = container.querySelector(`[data-turn-key="${m.turnId}"]`);
                    if (el) return el;
                }
                if (m.messageId) {
                    const el = container.querySelector(`[data-message-id="${m.messageId}"]`);
                    if (el) return el;
                    const unit = container.querySelector(`[${SELECTORS.chatgpt.unitMsgIdsAttr}*="${m.messageId}"]`);
                    if (unit) return unit.closest('[data-turn-key]') || unit;
                }
            } catch (e) { /* malformed id — fall through to text */ }
            return byText();
        };

        const waitFor = async (m, timeoutMs) => {
            const deadline = performance.now() + (timeoutMs || JUMP.verifyMs);
            while (!cancelled && stillActive() && performance.now() < deadline) {
                const el = findEl(m);
                if (el) return el;
                await new Promise(r => setTimeout(r, JUMP.pollMs));
            }
            return findEl(m);
        };

        const flash = (el) => {
            try {
                el.classList.add('toc-nav-target');
                setTimeout(() => { try { el.classList.remove('toc-nav-target'); } catch (e) { /* ignore */ } }, 1600);
            } catch (e) { /* ignore */ }
        };

        const finish = (el) => {
            if (!el) return false;
            try {
                // A turn taller than ~1.5 viewports must align its START, not
                // its center: a 25k-char message renders as a ~45k px turn and
                // centering leaves its beginning 20k px above the viewport
                // (live 2026-11-09) — the user sees the middle of the message.
                const tall = el.getBoundingClientRect().height > container.clientHeight * 1.5;
                S.scrollByElement(container, el, tall ? 'start' : 'center');
            } catch (e) { /* ignore */ }
            flash(el);
            console.log(`[TOC Nav] Resolved ${msg.id} in ${(performance.now() - t0).toFixed(0)}ms`);
            return true;
        };

        try {
            // 1. Fast path — already mounted.
            let el = findEl(msg);
            if (el) return finish(el);

            const vh = container.clientHeight || 600;
            const total = (typeof store.apiTotal === 'number' && store.apiTotal > 1) ? store.apiTotal : null;
            const hasApi = (typeof msg.apiIndex === 'number') && !!total;

            // 2. Exact ratio jump from the API branch position.
            if (hasApi) {
                const ratio = Math.min(1, Math.max(0, msg.apiIndex / (total - 1)));
                console.log(`[TOC Nav] Ratio jump ${(ratio * 100).toFixed(1)}% (apiIndex ${msg.apiIndex}/${total})`);
                if (typeof onProgress === 'function') {
                    onProgress({ phase: 'ratio', text: 'Navigating to message...' });
                }
                S.setLogical(container, S.maxTop(container) * ratio);
                el = await waitFor(msg, JUMP.verifyMs);
                if (el) return finish(el);
            }
            if (cancelled) return abort('user-scroll');
            if (!stillActive()) return abort(Navigator.lastAbortReason || 'superseded');

            // 3. Coarse jump from cached geometry (a previous scan).
            if (typeof msg.offsetTop === 'number' && msg.offsetTop > 0) {
                S.setLogical(container, msg.offsetTop);
                el = await waitFor(msg, JUMP.verifyMs);
                if (el) return finish(el);
            }
            if (cancelled) return abort('user-scroll');
            if (!stillActive()) return abort(Navigator.lastAbortReason || 'superseded');

            // 3.5 Pagination hold — targets OLDER than the materialized boundary.
            //
            // ChatGPT lazy-loads older messages in pages of ~10 turns
            // (GET /backend-api/conversations/<id>/messages?before=<uuid>) and
            // fires those fetches ONLY while the viewport dwells at the oldest
            // materialized boundary (live 2026-11-09: boundary at linear
            // position ~191 of 265, target at 1). Sweeping near the boundary
            // suppresses the dwell, the pages never load, and the search burns
            // its budget oscillating — the reported "goes up, down somewhat
            // and just stop".
            //
            // So: pin the viewport at the oldest end (logical 0 works on both
            // layouts), wait for the virtualizer to prepend a page (its scroll
            // anchoring moves scrollTop as content is inserted above), re-pin,
            // and repeat until the target mounts or progress stops. Direction
            // NEVER reverses while pinned.
            const mountedRecs = mountedRecords(store);
            const earliest = (() => {
                const positions = mountedRecs
                    .map(r => (typeof r.domPosition === 'number') ? r.domPosition
                        : (r.rec && typeof r.rec.apiIndex === 'number') ? r.rec.apiIndex : null)
                    .filter(v => v !== null && v !== undefined);
                return positions.length ? Math.min(...positions) : null;
            })();
            const mountedOrds = mountedRecs.map(r => r.ordinal).filter(o => o >= 0);
            const targetOrdinal = store.getAll().findIndex(m => m.id === msg.id);
            const olderThanBoundary = (hasApi && earliest !== null && msg.apiIndex < earliest - 1)
                || (!hasApi && mountedOrds.length > 0 && targetOrdinal >= 0 && targetOrdinal < Math.min(...mountedOrds));
            if (olderThanBoundary) {
                const pages = (hasApi && earliest !== null)
                    ? Math.ceil((earliest - msg.apiIndex) / 10) + 1
                    : null;
                const budget = pages
                    ? Math.min(JUMP.holdMaxMs, pages * JUMP.holdPageMs + 8000)
                    : 45000;
                const holdDeadline = performance.now() + budget;
                console.log(`[TOC Nav] Pagination hold: target ${hasApi ? msg.apiIndex : '?'} is older than earliest mounted ${earliest} (≈${pages || '?'} pages, budget ${(budget / 1000).toFixed(0)}s)`);
                let boundaryStuck = 0;
                let pageLoaded = 0;
                while (!cancelled && stillActive() && performance.now() < holdDeadline) {
                    if (typeof onProgress === 'function') {
                        const pageText = pages
                            ? `Loading earlier messages (${Math.min(pages, pageLoaded + 1)}/${pages})...`
                            : 'Loading earlier messages...';
                        onProgress({ phase: 'hold', page: pageLoaded, totalPages: pages, text: pageText });
                    }
                    S.setLogical(container, 0);
                    const h0 = container.scrollHeight;
                    const sig0 = windowSignature();
                    const roundDeadline = performance.now() + JUMP.holdPageMs;
                    let grew = false;
                    while (!cancelled && stillActive() && performance.now() < roundDeadline) {
                        const found = findEl(msg);
                        if (found) return finish(found);
                        await new Promise(r => setTimeout(r, JUMP.holdPollMs));
                        if (container.scrollHeight !== h0 || windowSignature() !== sig0) grew = true;
                    }
                    if (cancelled || !stillActive()) return abort(cancelled ? 'user-scroll' : (Navigator.lastAbortReason || 'superseded'));
                    // One confirmation round with zero materialization ⇒ the
                    // boundary refuses to move (give up back to the sweep).
                    if (!grew) {
                        boundaryStuck++;
                        if (boundaryStuck >= 2) break;
                    } else {
                        boundaryStuck = 0;
                        pageLoaded++;
                    }
                }
                el = findEl(msg);
                if (el) return finish(el);
                console.warn('[TOC Nav] Pagination hold exhausted — falling back to sweep');
            }
            if (cancelled) return abort('user-scroll');
            if (!stillActive()) return abort(Navigator.lastAbortReason || 'superseded');

            // 4. Directional search with window feedback.
            let lastSig = '';
            let stuck = 0;
            let momentum = -1; // no API signal → sweep older first
            for (let attempt = 1; attempt <= JUMP.maxAttempts; attempt++) {
                if (cancelled) return abort('user-scroll');
                if (!stillActive()) return abort(Navigator.lastAbortReason || 'superseded');

                if (typeof onProgress === 'function' && attempt > 2) {
                    onProgress({
                        phase: 'sweep',
                        attempt,
                        maxAttempts: JUMP.maxAttempts,
                        text: `Locating message (${attempt}/${JUMP.maxAttempts})...`
                    });
                }

                const sig = windowSignature();
                if (sig && sig === lastSig) stuck++;
                else { stuck = 0; lastSig = sig; }

                // Direction: prefer exact API indices; fall back to STORE ORDINALS,
                // which work even when C6-only records carry no apiIndex (live
                // evidence: the give-up diagnostic showed window=[?,?], i.e. the
                // search had no signal at all and simply drifted).
                let all = [];
                try { all = store.getAll(); } catch (e) { all = []; }
                const recs = mountedRecords(store);
                let direction = 0;
                let windowRange = null;
                // Window position: DOM-resolved position first (works without a store
                // record), then a record's apiIndex as a fallback.
                const positions = recs
                    .map(r => (typeof r.domPosition === 'number') ? r.domPosition
                        : (r.rec && typeof r.rec.apiIndex === 'number') ? r.rec.apiIndex : null)
                    .filter(v => v !== null && v !== undefined);
                if (hasApi && positions.length > 0) {
                    const min = Math.min(...positions);
                    const max = Math.max(...positions);
                    windowRange = { min, max };
                    if (msg.apiIndex < min) direction = -1;       // target is older
                    else if (msg.apiIndex > max) direction = 1;   // target is newer
                }
                if (direction === 0) {
                    const ords = recs.map(r => r.ordinal).filter(o => o >= 0);
                    const targetOrd = all.findIndex(m => m.id === msg.id);
                    if (ords.length > 0 && targetOrd >= 0) {
                        const minO = Math.min(...ords);
                        const maxO = Math.max(...ords);
                        if (targetOrd < minO) direction = -1;
                        else if (targetOrd > maxO) direction = 1;
                    }
                }
                if (direction === 0 && typeof msg.turnNumber === 'number') {
                    // Last resort: DOM turn numbers, which are always present on the
                    // mounted turns and ordered — no store resolution required.
                    const range = mountedTurnRange();
                    if (range) {
                        if (msg.turnNumber < range.min) direction = -1;
                        else if (msg.turnNumber > range.max) direction = 1;
                    }
                }
                if (direction === 0) {
                    // Inside the mounted window but not matched, or no API signal:
                    // keep sweeping the SAME way first, and only reverse once the
                    // window has refused to change twice (prevents oscillation).
                    direction = (stuck >= 2) ? -momentum : momentum;
                }
                momentum = direction;

                // Distance-aware stride: big steps while the target is far in API
                // index space, small steps once it is within ~1 window. Without a
                // known index, keep the large step (the old behaviour).
                let distance = null;
                if (windowRange) {
                    distance = (msg.apiIndex < windowRange.min)
                        ? (windowRange.min - msg.apiIndex)
                        : (msg.apiIndex > windowRange.max ? (msg.apiIndex - windowRange.max) : 0);
                }
                let baseStep = JUMP.largeStep;
                if (distance !== null && distance <= 12) baseStep = JUMP.smallStep;
                else if (distance !== null && distance > 24) baseStep = JUMP.largeStep * JUMP.overshoot;
                const step = (stuck > 1 ? baseStep * JUMP.overshoot : baseStep) * vh;

                const sigBefore = windowSignature();
                // Travel with a RELATIVE DOM operation: scroll the window's leading
                // edge element to the opposite side, which moves the viewport one full
                // step in the wanted direction. Absolute scroll math was cancelled by
                // the virtualizer's growing height estimate (scrollHeight grew
                // 15k → 27k mid-navigation) — setLogical() steps produced no net
                // movement, which is why the search stalled at the same window.
                let travelled = false;
                // Far target with a known API position: re-pin at the target's
                // RATIO of the CURRENT maxTop instead of crawling by viewports.
                // In chats with giant turns (a 25k-char message rendered as a
                // 46k px turn ≈ 25 viewports, live 2026-11-09) viewport-sized
                // steps cannot cross the remaining distance inside the time
                // budget; and the virtualizer keeps refining scrollHeight, so
                // the ratio must be re-aimed with the CURRENT maxTop per round
                // (the first ratio jump landed at 62% because maxTop grew after
                // the pin). Each repin converges geometrically as heights settle.
                if (hasApi && distance !== null && distance > 12) {
                    const ratio = Math.min(1, Math.max(0, msg.apiIndex / (total - 1)));
                    S.setLogical(container, S.maxTop(container) * ratio);
                    travelled = true;
                }
                try {
                    const recsNow = mountedRecords(store).filter(r => typeof r.domPosition === 'number');
                    if (recsNow.length > 0) {
                        const pick = (direction < 0)
                            ? recsNow.reduce((a, b) => (a.domPosition <= b.domPosition ? a : b))
                            : recsNow.reduce((a, b) => (a.domPosition >= b.domPosition ? a : b));
                        const boundaryEl = container.querySelector(`[data-turn-key="${pick.key}"]`);
                        if (boundaryEl) {
                            boundaryEl.scrollIntoView({
                                behavior: 'instant',
                                block: direction < 0 ? 'end' : 'start',
                            });
                            travelled = true;
                        }
                    }
                } catch (e) { /* fall back to offset math */ }
                if (!travelled) {
                    S.setLogical(container, S.getLogical(container) + direction * step);
                }
                // Wait for the virtualizer to actually swap its window (bounded), then
                // look for the target. Absolute scroll math is unreliable on this
                // scroller: scrollHeight is an ESTIMATE that grows as turns get
                // measured (15k → 50k → 101k observed live), so the only dependable
                // strategy is to travel in bounded steps and verify each window.
                await waitForWindowChange(sigBefore, JUMP.stepWaitMs);
                el = await waitFor(msg, 150);
                if (el) return finish(el);
                if (performance.now() - t0 > JUMP.deadlineMs) {
                    console.warn('[TOC Nav] Time budget exhausted');
                    break;
                }
            }

            // Diagnostics make a stuck jump debuggable from the console alone
            // (window range vs target index vs scroll position).
            let diag = '';
            try {
                const recs = mountedRecords(store);
                const idx = recs
                    .map(r => (typeof r.domPosition === 'number') ? r.domPosition
                        : (r.rec && typeof r.rec.apiIndex === 'number') ? r.rec.apiIndex : null)
                    .filter(v => v !== null && v !== undefined);
                const ords = recs.map(r => r.ordinal).filter(o => o >= 0);
                const targetOrd = store.getAll().findIndex(m => m.id === msg.id);
                diag = ` window=[${idx.length ? Math.min(...idx) : '?'},${idx.length ? Math.max(...idx) : '?'}]`
                    + ` ordinalWindow=[${ords.length ? Math.min(...ords) : '?'},${ords.length ? Math.max(...ords) : '?'}]`
                    + ` target=${typeof msg.apiIndex === 'number' ? msg.apiIndex : '?'}`
                    + ` targetOrdinal=${targetOrd}`
                    + ` mounted=${recs.length}`
                    + ` logical=${Math.round(S.getLogical(container))}/${Math.round(S.maxTop(container))}`;
            } catch (e) { /* ignore */ }
            console.warn(`[TOC Nav] (new UI) Gave up on ${msg.id} after ${JUMP.maxAttempts} attempts —${diag}`);
            return false;
        } finally {
            cleanup();
        }
    };

    // -------------------------------------------------------------------------
    // Navigator (Trap 2) — 2-step with adaptive wait
    // -------------------------------------------------------------------------
    const Navigator = {
        lastAbortReason: null,
        cancelJump() {
            activeJumpToken++;
            this.lastAbortReason = 'user-cancel';
            console.log('[TOC Nav] Jump cancelled via cancelJump');
        },
        async navigateTo(storeId, siteKey, onProgress) {
            this.lastAbortReason = null;
            const store = StoreManager.getStore();
            let msg = store.getById(storeId);
            // Fix: storeId may be fallback "toc-question-N" — try to resolve via promptBarIndex
            if (!msg && storeId.startsWith('toc-question-')) {
                const idx = parseInt(storeId.replace('toc-question-', ''), 10);
                if (!isNaN(idx)) {
                    msg = store.getByPromptBarIndex(idx) || store.getAll()[idx];
                    if (msg) {
                        console.log(`[TOC Nav] Resolved fallback ${storeId} -> ${msg.id}`);
                        storeId = msg.id;
                    }
                }
            }
            if (!msg) {
                // Fallback: try element scroll directly
                const el = document.getElementById(storeId);
                if (el) {
                    console.log(`[TOC Nav] Fallback element scroll for ${storeId}`);
                    el.scrollIntoView({ behavior: 'instant', block: 'start' });
                    return true;
                }
                console.warn(`[TOC Nav] Message ${storeId} not found`);
                return false;
            }
            const key = siteKey || 'chatgpt';
            const container = findScrollContainer(key);

            // Resolve a mounted element for a store record across both UIs.
            const findMsgElement = (m) => {
                const sels = [];
                if (m.turnId) sels.push(`[data-turn-key="${m.turnId}"]`);
                if (m.messageId) sels.push(`[data-message-id="${m.messageId}"]`);
                if (m.turnId) sels.push(`[data-turn-id="${m.turnId}"]`);
                for (const s of sels) {
                    try { const el = document.querySelector(s); if (el) return el; } catch (e) { /* ignore */ }
                }
                return null;
            };
            const waitForMsgElement = async (m, timeout) => {
                const deadline = performance.now() + (timeout || 800);
                while (performance.now() < deadline) {
                    const el = findMsgElement(m);
                    if (el) return el;
                    await new Promise(r => requestAnimationFrame(r));
                }
                return findMsgElement(m);
            };

            if (key === 'chatgpt') {
                // -----------------------------------------------------------------
                // NEW UI (2026-10): prompt bars are gone and the thread is a
                // column-reverse virtual scroller. Delegate to the virtual-jump
                // engine (ratio jump + directional search + verification).
                // -----------------------------------------------------------------
                const S = window.TOC.scroll;
                const newUI = !!(S && document.querySelector(SELECTORS.chatgpt.turnContainerNew));
                if (newUI) {
                    const ok = await performVirtualJump(msg, container, store, onProgress);
                    if (!ok) console.warn(`[TOC Nav] (new UI) Message ${storeId} not reachable`);
                    return ok;
                }

                // -----------------------------------------------------------------
                // LEGACY UI
                // -----------------------------------------------------------------
                // ChatGPT: use prompt bars for user, 2-step for assistant.
                // barIdx derivation: stored promptBarIndex first, then turnNumber
                // parity ((n-1)/2 for odd user turns), then sequence position.
                // This keeps bar navigation working for records scanned before
                // promptBarIndex was persisted (null) or hydrated from old caches.
                let barIdx = (msg.promptBarIndex !== null && msg.promptBarIndex !== undefined) ? msg.promptBarIndex : null;
                if ((barIdx === null || barIdx === undefined) && msg.role === 'user') {
                    if (msg.turnNumber !== null && msg.turnNumber !== undefined && msg.turnNumber % 2 === 1) {
                        barIdx = (msg.turnNumber - 1) / 2;
                    } else {
                        try {
                            const userMsgs = store.getUserMessages();
                            const uIdx = userMsgs.findIndex(m => m.id === msg.id);
                            if (uIdx >= 0) barIdx = uIdx;
                        } catch (e) { /* ignore */ }
                    }
                }
                if (msg.role === 'user' && barIdx !== null && barIdx !== undefined) {
                    const bar = document.querySelector(`[data-toc-item-index="${barIdx}"]`);
                    if (bar) {
                        console.log(`[TOC Nav] Clicking bar ${barIdx} for user ${storeId}`);
                        bar.click();
                        return true;
                    }
                    // Fallback: try to find by turnId
                    if (msg.turnId) {
                        const el = document.querySelector(`[data-turn-id="${msg.turnId}"]`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'instant', block: 'start' });
                            return true;
                        }
                    }
                } else if (msg.role === 'assistant') {
                    // 2-step: find preceding user message (tolerates null
                    // promptBarIndex via turnNumber/sequence derivation)
                    const all = store.getAll();
                    const idx = all.findIndex(m => m.id === storeId);
                    let userIdx = -1;
                    for (let i = idx - 1; i >= 0; i--) {
                        if (all[i].role === 'user') {
                            userIdx = (all[i].promptBarIndex !== null && all[i].promptBarIndex !== undefined) ? all[i].promptBarIndex : -1;
                            if ((userIdx === null || userIdx === undefined || userIdx < 0) && all[i].turnNumber !== null && all[i].turnNumber !== undefined && all[i].turnNumber % 2 === 1) {
                                userIdx = (all[i].turnNumber - 1) / 2;
                            }
                            if (userIdx !== null && userIdx !== undefined && userIdx >= 0) break;
                            userIdx = -1;
                        }
                    }
                    if (userIdx >= 0) {
                        const bar = document.querySelector(`[data-toc-item-index="${userIdx}"]`);
                        if (bar) {
                            console.log(`[TOC Nav] 2-step: clicking bar ${userIdx} for assistant ${storeId}`);
                            bar.click();
                            // Adaptive wait (not fixed 300ms) — poll until target appears
                            const targetSel = msg.messageId ? `[data-message-id="${msg.messageId}"]` : `[data-turn-id="${msg.turnId}"]`;
                            const el = await waitForElement(targetSel, 600);
                            if (el) {
                                console.log(`[TOC Nav] Target found, scrolling`);
                                el.scrollIntoView({ behavior: 'instant', block: 'start' });
                                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                                return true;
                            } else {
                                console.warn(`[TOC Nav] Target not found after 600ms, trying offset scroll`);
                                // Fallback: try offset scroll
                                if (msg.offsetTop !== null && container) {
                                    container.scrollTo({ top: msg.offsetTop, behavior: 'instant' });
                                    return true;
                                }
                            }
                        }
                    }
                    // Fallback: direct query
                    const sel = msg.messageId ? `[data-message-id="${msg.messageId}"]` : `[data-turn-id="${msg.turnId}"]`;
                    const el = document.querySelector(sel);
                    if (el) {
                        el.scrollIntoView({ behavior: 'instant', block: 'start' });
                        return true;
                    }
                    console.warn(`[TOC Nav] Assistant ${storeId} not in DOM and no bar found`);
                    return false;
                }
                // Generic fallback for chatgpt
                const sel = msg.messageId ? `[data-message-id="${msg.messageId}"]` : `[data-turn-id="${msg.turnId}"]`;
                const el = document.querySelector(sel);
                if (el) {
                    el.scrollIntoView({ behavior: 'instant', block: 'start' });
                    return true;
                }
                if (msg.offsetTop !== null && container) {
                    container.scrollTo({ top: msg.offsetTop, behavior: 'instant' });
                    return true;
                }
            } else {
                // Other platforms: offset-based
                const el = document.querySelector(`[data-message-id="${msg.messageId}"]`) || document.querySelector(`#${storeId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'instant', block: 'start' });
                    return true;
                }
                if (msg.offsetTop !== null && container) {
                    container.scrollTo({ top: msg.offsetTop, behavior: 'instant' });
                    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                    // Fine-tune: wait for render, then check if element appeared
                    const el2 = document.querySelector(`[data-message-id="${msg.messageId}"]`);
                    if (el2) el2.scrollIntoView({ behavior: 'instant', block: 'start' });
                    return true;
                }
            }
            console.warn(`[TOC Nav] Failed to navigate to ${storeId}`);
            return false;
        },
        // Legacy: navigate by element (for backward compat)
        navigateToElement(element) {
            if (!element) return false;
            // Try to find store id from element
            const msgId = element.getAttribute('data-message-id') || element.getAttribute('data-turn-id') || element.id;
            if (msgId) {
                const store = StoreManager.getStore();
                const msg = store.getById(msgId) || store.getAll().find(m => m.turnId === msgId || m.messageId === msgId);
                if (msg) return this.navigateTo(msg.id);
            }
            element.scrollIntoView({ behavior: 'instant', block: 'start' });
            return true;
        }
    };

    // -------------------------------------------------------------------------
    // C3: Backend API (Experimental, default OFF, auto for /share/)
    // -------------------------------------------------------------------------
    const C3 = (function () {
        // Firefox content scripts do not resolve root-relative fetch URLs
        // against the host page. Always build an absolute same-origin URL.
        const apiUrl = (path) => {
            let origin = 'https://chatgpt.com';
            try {
                if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
                    origin = location.origin;
                }
            } catch (e) { /* use ChatGPT fallback */ }
            return `${origin}${path}`;
        };

        // Session-only token cache (never persisted; never written to TOC cache).
        let cachedToken = null;
        let cachedTokenAt = 0;
        const TOKEN_TTL_MS = 10 * 60 * 1000;

        const safeAdapter = () => (window.TOC && window.TOC.safeStorage) || null;

        // C3 is ChatGPT-only: active site must be a supported conversation URL.
        const isChatGPTConversationPage = () => {
            try {
                if (!location.host.includes('chatgpt.com')) return false;
                return location.href.includes('/c/') || location.href.includes('/share/');
            } catch (e) {
                return false;
            }
        };

        // v1.9.3: the API is ALWAYS on. Since the 2026-11 pagination fix, C3's
        // apiIndex/apiTotal are load-bearing for navigation — the ratio jump
        // and the pagination hold both read them — so a DOM-only outline would
        // break distant-target jumps in large chats. The v1.9.0
        // "Conversation API" toggle was removed from the popup; any stale
        // stored `experimentalAPI: false` is deliberately IGNORED so pre-1.9.3
        // opt-outs are migrated automatically instead of being stranded with a
        // degraded TOC and no way to re-enable it.
        const isEnabled = async () => {
            if (Identity.isShared()) {
                console.log('[TOC C3] Auto-enabled for /share/');
            }
            return true;
        };

        const extractToken = () => {
            // Primary: regex on script tags
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                const m = s.textContent.match(/"accessToken":"([^"]+)"/);
                if (m) return m[1];
            }
            return null;
        };

        const fetchSessionToken = async () => {
            try {
                const res = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && typeof data.accessToken === 'string' && data.accessToken) {
                        return data.accessToken;
                    }
                    console.debug('[TOC C3] Session response had no usable accessToken');
                    return null;
                }
            } catch (e) { console.debug('[TOC C3] Session fetch failed', e); }
            return null;
        };

        // ---------------------------------------------------------------------
        // v1.9.2 hardening (ports from GPT-Conversation-Toolkit's conversation-api)
        // ---------------------------------------------------------------------
        const FETCH_TIMEOUT_MS = 10000; // never let a hung request stall init
        const MAX_PAGES = 5;            // bounded pagination for mega-chats

        const fetchWithTimeout = async (url, options, timeoutMs) => {
            const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
            let timer = null;
            if (ctl) {
                timer = setTimeout(() => { try { ctl.abort(); } catch (e) { /* ignore */ } }, timeoutMs || FETCH_TIMEOUT_MS);
            }
            try {
                const opts = { ...(options || {}) };
                if (ctl) opts.signal = ctl.signal;
                return await fetch(url, opts);
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        /**
         * A truncated mapping (partial response) looks like a short conversation.
         * Walk current_node → parent to the root: if any hop is missing the
         * response is incomplete and must not replace/seed the outline.
         */
        const isCompleteMapping = (mapping, currentNode) => {
            if (!mapping || typeof mapping !== 'object') return false;
            let id = currentNode || '';
            if (!id) {
                for (const [k, node] of Object.entries(mapping)) {
                    if (node && node.current) { id = k; break; }
                }
            }
            if (!id || !mapping[id]) return false;
            const seen = new Set();
            let steps = 0;
            while (id) {
                if (seen.has(id) || !mapping[id]) return false;
                seen.add(id);
                id = mapping[id].parent || '';
                if (++steps > 10000) return false;
            }
            return true;
        };

        /**
         * Bounded pagination fallback (mega-chats): the paginated endpoint returns
         * newest-first chunks; each older page is fetched with `before=<cursor>`
         * and prepended. Returns oldest→newest, or null when unavailable.
         */
        const fetchPaginatedMessages = async (convId) => {
            let token = await resolveToken();
            if (!token) return null;
            let all = [];
            let cursor = '';
            for (let page = 0; page < MAX_PAGES; page++) {
                const qs = `?num_turns=100&include_has_versions=true${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`;
                let res;
                try {
                    res = await fetchWithTimeout(apiUrl(`/backend-api/conversations/${convId}/messages${qs}`), {
                        credentials: 'include',
                        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
                    });
                } catch (e) { break; }
                if (!res || !res.ok) break;
                let json = null;
                try { json = await res.json(); } catch (e) { break; }
                const pageMessages = Array.isArray(json && json.messages) ? json.messages : null;
                if (!pageMessages || pageMessages.length === 0) break;
                const seen = new Set(all.map(m => m && m.id));
                const older = pageMessages.filter(m => m && m.id && !seen.has(m.id));
                all = older.concat(all); // older pages go in front → oldest first
                const info = (json && (json.page_info || json.pageInfo)) || {};
                const hasPrev = info.has_previous_page === true || info.hasPreviousPage === true;
                const nextCursor = info.start_cursor || info.startCursor || '';
                if (!hasPrev || typeof nextCursor !== 'string' || !nextCursor) break;
                cursor = nextCursor;
            }
            if (all.length === 0) return null;
            // Pages are assumed oldest-first per chunk; when every message carries
            // create_time, sort ascending as a normalization safety net.
            if (all.every(m => m && typeof m.create_time === 'number')) {
                all = all.slice().sort((a, b) => a.create_time - b.create_time);
            }
            console.log(`[TOC C3] Paginated fallback produced ${all.length} messages`);
            return all.map((msg) => {
                const parts = (msg.content && Array.isArray(msg.content.parts)) ? msg.content.parts : [];
                const textParts = parts.filter(p => typeof p === 'string');
                return {
                    id: msg.id,
                    role: (msg.author && msg.author.role) || 'unknown',
                    text: textParts.join('\n'),
                    createTime: msg.create_time,
                    turnId: msg.id,
                    messageId: msg.id,
                    isVisible: !(msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true),
                    isUserSystemMessage: !!(msg.metadata && msg.metadata.is_user_system_message === true),
                };
            });
        };

        // Resolve a Bearer token for the current session only: cached value
        // within TTL, else page scripts, else /api/auth/session. Missing or
        // expired tokens are a normal C3 failure (fallback to C1/C6).
        const resolveToken = async () => {
            try {
                if (cachedToken && (Date.now() - cachedTokenAt) < TOKEN_TTL_MS) return cachedToken;
            } catch (e) { /* ignore */ }
            cachedToken = null;
            let token = null;
            try {
                token = extractToken();
            } catch (e) { token = null; }
            if (!token) {
                console.log('[TOC C3] No token in scripts, trying session');
                token = await fetchSessionToken();
            }
            if (token) {
                cachedToken = token;
                try { cachedTokenAt = Date.now(); } catch (e) { cachedTokenAt = 0; }
            }
            return token;
        };

        const clearCachedToken = () => {
            cachedToken = null;
            cachedTokenAt = 0;
        };

        const parseMapping = (mapping, currentNode) => {
            if (!mapping) return [];
            // Find current node
            let currentId = currentNode;
            if (!currentId) {
                for (const [id, node] of Object.entries(mapping)) {
                    if (node.current) { currentId = id; break; }
                }
            }
            if (!currentId) {
                // Fallback: latest create_time
                let latest = 0;
                for (const [id, node] of Object.entries(mapping)) {
                    if (node.message?.create_time > latest) {
                        latest = node.message.create_time;
                        currentId = id;
                    }
                }
            }
            if (!currentId) return [];

            // Walk parent chain to root, then reverse.
            // Guarded against missing parents and cycles (malformed mapping).
            const chain = [];
            const seen = new Set();
            let cur = mapping[currentId];
            let guard = 0;
            const maxNodes = Object.keys(mapping).length + 1;
            while (cur && guard++ < maxNodes) {
                const nodeKey = cur.id || (cur.message && cur.message.id);
                if (nodeKey) {
                    if (seen.has(nodeKey)) {
                        console.warn('[TOC C3] Cycle detected in mapping tree, stopping walk');
                        break;
                    }
                    seen.add(nodeKey);
                }
                if (cur.message) {
                    const msg = cur.message;
                    // Multimodal-safe (Trap 10): keep string parts only, never
                    // call .join() on arbitrary multimodal objects.
                    const parts = (msg.content && Array.isArray(msg.content.parts)) ? msg.content.parts : [];
                    const textParts = parts.filter(p => typeof p === 'string');
                    const text = textParts.join('\n');
                    chain.unshift({
                        id: msg.id,
                        role: (msg.author && msg.author.role) || 'unknown',
                        text,
                        createTime: msg.create_time,
                        turnId: msg.id,
                        messageId: msg.id,
                        isVisible: !(msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true),
                        isUserSystemMessage: !!(msg.metadata && msg.metadata.is_user_system_message === true),
                        contentType: msg.content && msg.content.content_type,
                    });
                }
                cur = cur.parent ? mapping[cur.parent] : null;
            }
            return chain;
        };

        const fetchConversation = async () => {
            const enabled = await isEnabled();
            if (!enabled) {
                // isEnabled() already logged the specific reason.
                return null;
            }
            const url = location.href;
            const isShare = url.includes('/share/');
            let shareId = null;
            let convId = null;
            if (isShare) {
                const m = url.match(/\/share\/([a-f0-9-]+)/);
                if (m) shareId = m[1];
            } else {
                const m = url.match(/\/c\/([a-f0-9-]+)/);
                if (m) convId = m[1];
            }
            if (!shareId && !convId) {
                console.log('[TOC C3] No conversation ID found');
                return null;
            }

            try {
                let data = null;
                if (shareId) {
                    console.log(`[TOC C3] Fetching /share/${shareId}`);
                    try {
                        const res = await fetchWithTimeout(apiUrl(`/backend-api/share/${shareId}`), {
                            credentials: 'include',
                            headers: { Accept: 'application/json' },
                        });
                        if (res && res.ok) data = await res.json();
                        else console.warn(`[TOC C3] Share fetch failed: ${res && res.status}`);
                    } catch (e) { console.warn('[TOC C3] Share fetch error', e); }
                } else {
                    // Logged-in conversation: Bearer token required.
                    // Two endpoint candidates + completeness validation; the token
                    // is refreshed once on 401. A bounded paginated request is the
                    // last resort (mega-chats / partial responses).
                    // Order matters: the plain endpoint is the one ChatGPT's own UI
                    // uses and it answered 200 in ~3 s live, while the
                    // `include_full_conversation=true` variant returned 403 for this
                    // account — so it is kept only as a secondary candidate.
                    const candidates = [
                        apiUrl(`/backend-api/conversation/${convId}`),
                        apiUrl(`/backend-api/conversation/${convId}?include_full_conversation=true`),
                    ];
                    let token = await resolveToken();
                    for (const url of candidates) {
                        if (!token) { console.warn('[TOC C3] No token available for /c/ fetch'); break; }
                        let res = null;
                        try {
                            console.log(`[TOC C3] Fetching /backend-api/conversation/${convId}`);
                            res = await fetchWithTimeout(url, {
                                credentials: 'include',
                                headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
                            });
                        } catch (e) { console.warn('[TOC C3] Fetch error', e); continue; }
                        if (res && res.status === 401) {
                            console.log('[TOC C3] 401, refreshing token once');
                            clearCachedToken();
                            token = await fetchSessionToken();
                            if (token) {
                                cachedToken = token;
                                try { cachedTokenAt = Date.now(); } catch (e) { /* ignore */ }
                                try {
                                    res = await fetchWithTimeout(url, {
                                        credentials: 'include',
                                        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
                                    });
                                } catch (e) { continue; }
                            }
                        }
                        if (!res || !res.ok) {
                            console.warn(`[TOC C3] Candidate failed: ${res && res.status}`);
                            continue;
                        }
                        let json = null;
                        try { json = await res.json(); } catch (e) { continue; }
                        const mapping = json && (json.mapping || (json.conversation && json.conversation.mapping));
                        const cur = json && (json.current_node || json.current_node_id
                            || (json.conversation && (json.conversation.current_node || json.conversation.current_node_id)));
                        if (mapping && !isCompleteMapping(mapping, cur)) {
                            console.warn('[TOC C3] Incomplete mapping, trying next candidate');
                            continue;
                        }
                        data = json;
                        break;
                    }
                    if (!data) {
                        console.log('[TOC C3] Falling back to paginated messages endpoint');
                        const paginated = await fetchPaginatedMessages(convId);
                        if (paginated) {
                            paginated.forEach((m, i) => { m.apiIndex = i; });
                            try { paginated.apiTotal = paginated.length; } catch (e) { /* ignore */ }
                            console.log(`[TOC C3] Final ${paginated.length} messages with content (paginated)`);
                            return paginated;
                        }
                        console.warn('[TOC C3] No usable conversation data');
                        return null;
                    }
                }

                if (!data) return null;
                console.log(`[TOC C3] Fetched ${JSON.stringify(Object.keys(data)).slice(0, 100)}`);

                // Parse
                let messages = [];
                if (data.mapping) {
                    messages = parseMapping(data.mapping, data.current_node || data.currentNode);
                    console.log(`[TOC C3] Parsed ${messages.length} from mapping`);
                } else if (data.data?.mapping) {
                    messages = parseMapping(data.data.mapping, data.data.current_node);
                    console.log(`[TOC C3] Parsed ${messages.length} from data.mapping`);
                }
                // Fallback: linear_conversation (preserve response order)
                if (messages.length === 0) {
                    const linear = data.linear_conversation || data.data?.linear_conversation;
                    if (linear) {
                        messages = linear.filter(n => n.message).map(n => {
                            const msg = n.message;
                            const parts = (msg.content && Array.isArray(msg.content.parts)) ? msg.content.parts : [];
                            const textParts = parts.filter(p => typeof p === 'string');
                            return {
                                id: msg.id,
                                role: (msg.author && msg.author.role) || 'unknown',
                                text: textParts.join('\n'),
                                createTime: msg.create_time,
                                turnId: msg.id,
                                messageId: msg.id,
                                isVisible: !(msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true),
                                isUserSystemMessage: !!(msg.metadata && msg.metadata.is_user_system_message === true),
                            };
                        });
                        console.log(`[TOC C3] Parsed ${messages.length} from linear_conversation`);
                    }
                }
                // Fallback: data.messages array
                if (messages.length === 0 && Array.isArray(data.messages)) {
                    messages = data.messages.map(msg => {
                        const parts = (msg.content && Array.isArray(msg.content.parts)) ? msg.content.parts : [];
                        const textParts = parts.filter(p => typeof p === 'string');
                        return {
                            id: msg.id,
                            role: (msg.author && msg.author.role) || 'unknown',
                            text: textParts.join('\n'),
                            createTime: msg.create_time,
                            turnId: msg.id,
                            messageId: msg.id,
                            isVisible: !(msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true),
                            isUserSystemMessage: !!(msg.metadata && msg.metadata.is_user_system_message === true),
                        };
                    });
                    console.log(`[TOC C3] Parsed ${messages.length} from data.messages`);
                }

                // NEW UI (v1.9.2): record each message's position in the API branch.
                // The Navigator's ratio jump depends on it. Indices are assigned
                // BEFORE the empty/system filter so they stay conversation-accurate;
                // the pre-filter count rides along as `apiTotal` so the ratio
                // DENOMINATOR matches that index space. Mixing the filtered count with
                // unfiltered indices made every ratio jump overshoot (live: apiIndex
                // 239 with total 84 → a 100% jump for a mid-conversation message).
                const fullTotal = messages.length;
                // id → position map for the WHOLE chain. Row-creation below skips
                // hidden/system messages, but navigation still needs their position:
                // C6 finds them in the DOM and keys them by these ids, so without the
                // map those records stay position-less and the Navigator drifts
                // (live: window=[?,?] target=142 mounted=5).
                const indexById = new Map();
                messages.forEach((m, i) => {
                    m.apiIndex = i;
                    if (m.id) indexById.set(m.id, i);
                });
                // Filter out empty and system hidden
                messages = messages.filter(m => m.text && m.text.trim().length > 0);
                try { messages.apiTotal = fullTotal; } catch (e) { /* ignore */ }
                try { messages.indexById = indexById; } catch (e) { /* ignore */ }
                console.log(`[TOC C3] Final ${messages.length} of ${fullTotal} messages with content`);
                return messages;

            } catch (e) {
                console.warn('[TOC C3] Fetch error', e);
                return null;
            }
        };

        const fetchAndMerge = async (session) => {
            // Capture conversation ID BEFORE awaiting — never resolve the store
            // only after an old request completes (would merge Chat A into Chat B).
            const requestConvId = (session && session.convId) || (Identity && Identity.getCurrentId()) || location.href;
            const requestSession = session || null;
            // C3 entry point guard: ChatGPT conversation pages only.
            if (!isChatGPTConversationPage()) return 0;
            const messages = await fetchConversation();
            if (!messages || messages.length === 0) return 0;
            // Drop stale responses from a previous SPA navigation
            if (requestSession && !isCurrentSession(requestSession)) {
                console.log('[TOC C3] Discarding stale response after navigation');
                return 0;
            }
            try {
                const currentId = (Identity && Identity.getCurrentId()) || location.href;
                if (requestConvId !== currentId) {
                    console.log(`[TOC C3] Discarding response for ${requestConvId} (now at ${currentId})`);
                    return 0;
                }
            } catch (e) { return 0; }
            const store = StoreManager.getStore();
            try {
                if (store.conversationId !== requestConvId) {
                    console.log('[TOC C3] Store mismatch, discarding merge');
                    return 0;
                }
            } catch (e) { return 0; }
            // Merge into the existing MessageStore: C3 user messages upgrade C1
            // placeholders by sequential user index (30-char validation), C3
            // assistants are inserted with stable UUIDs. C1 order and C6
            // geometry are preserved; no offsetTop is invented (API has none).
            // One guarded UI update follows a successful merge (see init).
            try {
                const eligible = messages.filter((m) => {
                    if (!m || !m.text || !m.text.trim()) return false;
                    if (m.isVisible === false) return false;
                    if (m.isUserSystemMessage === true) return false;
                    return m.role === 'user' || m.role === 'assistant';
                });
                if (eligible.length === 0) return 0;
                store.mergeC3Data(eligible);
                // Stamp the exact API position on EVERY record that exists in the
                // chain — including records the row-merge deliberately skips
                // (hidden/system user context that C6 still sees in the DOM). Row
                // creation and position stamping are separate concerns: without this,
                // DOM-keyed records carry no apiIndex and both direction signals fail.
                try {
                    const indexById = messages.indexById;
                    if (indexById && typeof indexById.get === 'function') {
                        // Publish so every record added/updated LATER (C6 scan, C7)
                        // is stamped automatically — the reason the list order used to
                        // break after a scan.
                        if (typeof store.setChainIndex === 'function') store.setChainIndex(indexById);
                        for (const rec of store.getAll()) {
                            let idx = null;
                            if (rec.id && indexById.has(rec.id)) idx = indexById.get(rec.id);
                            else if (rec.messageId && indexById.has(rec.messageId)) idx = indexById.get(rec.messageId);
                            if (idx !== null && idx !== undefined && rec.apiIndex !== idx) {
                                store.update(rec.id, { apiIndex: idx });
                            }
                        }
                        // Re-sort: the merge above sorted BEFORE these positions were
                        // known, so freshly stamped records would keep a heuristic slot.
                        try { store.sort(); } catch (e) { /* ignore */ }
                    }
                } catch (e) { /* never break the TOC */ }
                // Ratio-jump denominator: the FULL API branch length (pre-filter), which
                // shares the same index space as each message's apiIndex. Using the
                // filtered count here made every ratio jump overshoot.
                store.apiTotal = (typeof messages.apiTotal === 'number' && messages.apiTotal > 0)
                    ? messages.apiTotal
                    : messages.length;
                store.isFullyScanned = true;
                console.log(`[TOC C3] Merged ${eligible.length} messages, store now ${store.size()}`);
                // Persist full C3 completion (StorageManager skips when disabled/non-ChatGPT)
                try {
                    if (StoreManager && typeof StoreManager.save === 'function') {
                        await StoreManager.save(requestConvId, store, true, requestSession);
                    }
                } catch (e) { /* never break TOC */ }
                return eligible.length;
            } catch (e) {
                console.warn('[TOC C3] Merge failed, keeping C1/C6 data', e);
                return 0;
            }
        };

        return { isEnabled, fetchConversation, fetchAndMerge, extractToken, isChatGPTConversationPage, clearCachedToken };
    })();

    // Invalidate stale async work on SPA navigation: bump generation, cancel
    // pending saves, abort in-flight C7. Store reset itself is handled by
    // StoreManager; C6 observer stop is handled by its own listener + destroy().
    try {
        Identity.onUrlChange(() => {
            currentNavGen++;
            // Cancel any in-flight navigation: a 12 s jump must never keep scrolling
            // (or flash a highlight) in the PREVIOUS conversation's thread.
            activeJumpToken++;
            try {
                if (StoreManager && typeof StoreManager.cancelPendingSave === 'function') {
                    StoreManager.cancelPendingSave();
                }
            } catch (e) { /* ignore */ }
            try { C7.abort(); } catch (e) { /* ignore */ }
        });
    } catch (e) { /* ignore */ }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    return {
        C6,
        C7,
        Navigator,
        C3,
        findScrollContainer,
        isVirtualized,
        waitForElement,
        // Unified init for a site — async, hydrates cache before C1/C6.
        // Returns a Promise so UI.start() can await perceived-instant render.
        async init(siteKey, onUpdate) {
            const session = {
                convId: (Identity && Identity.getCurrentId()) || location.href,
                navGen: ++currentNavGen,
            };
            console.log(`[TOC Virtual] Init for ${siteKey} (gen ${session.navGen}, conv ${session.convId})`);
            try {
                if (StoreManager && typeof StoreManager.setSessionValidator === 'function') {
                    StoreManager.setSessionValidator((s) => isCurrentSession(s));
                }
            } catch (e) { /* ignore */ }
            const guardedUpdate = () => {
                if (!isCurrentSession(session)) return;
                try {
                    if (typeof onUpdate === 'function') onUpdate();
                } catch (e) { /* ignore */ }
            };

            // 1. Hydrate persistent cache BEFORE starting scanners (ChatGPT only).
            // On a hit, render hydrated store first; C1/C6 then run in background.
            try {
                if (siteKey === 'chatgpt' && session.convId) {
                    const cached = await StoreManager.load(session.convId, session);
                    if (!isCurrentSession(session)) return;
                    if (cached && Array.isArray(cached.messages) && cached.messages.length > 0) {
                        const store = StoreManager.getStore();
                        if (store && (store.conversationId === session.convId)) {
                            const restored = store.hydrate(cached);
                            console.log(`[TOC Virtual] Hydrated ${restored} cached messages (full=${!!cached.isFullyScanned})`);
                            if (restored > 0) guardedUpdate();
                        }
                    }
                }
            } catch (e) { /* cache miss is normal */ }

            if (!isCurrentSession(session)) return;

            // 3. C6 always-on (provisional saves wired inside C6)
            C6.start(siteKey, guardedUpdate, session);

            // 4. C3 backend API in background — ChatGPT only (auto for /share/,
            // opt-in for /c/). Other platforms keep DOM-only behavior.
            if (siteKey === 'chatgpt') {
                setTimeout(async () => {
                    try {
                        if (!isCurrentSession(session)) return;
                        const count = await C3.fetchAndMerge(session);
                        if (count > 0) guardedUpdate();
                    } catch (e) { /* ignore */ }
                }, 1000);
            }

            // (v1.9.3) The storage-change hook for the old `experimentalAPI`
            // toggle was removed with the setting itself. chrome.storage.local
            // is shared with the persistent cache, so fewer listeners here also
            // means fewer chances of reacting to cache writes.
        },
        destroy() {
            // Invalidate current generation + cancel pending C6/C7/saves
            currentNavGen++;
            try {
                if (StoreManager && typeof StoreManager.cancelPendingSave === 'function') {
                    StoreManager.cancelPendingSave();
                }
            } catch (e) { /* ignore */ }
            C6.stop();
            C7.abort();
        },
        // Exposed for router/tests
        _isCurrentSession: isCurrentSession,
        _captureSession: captureSession,
        _getNavGen: () => currentNavGen,
    };
})();

console.log('[TOC] virtual.js loaded');
