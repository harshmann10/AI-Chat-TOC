/**
 * AI Chat TOC - Virtual Module (v1.9.0)
 * C1 (prompt bars) + C6 (DOM accumulator) + C7 (scroll scan) + Navigator + C3 experimental
 * Optimized 2-file architecture: store.js + virtual.js
 * Live-verified 2026-08-30 on share/6a0cc811 (18 prompts, 36 msgs, 86k height)
 * - C1: [data-toc-item-index] 18/18 in 0.1ms, aria-label holds truncated text (no hover)
 * - C7: div[class*="scrollbar-gutter"] is real scroll container (86093px), not main
 * - C7: behavior:'instant' + double rAF 12.2ms/step, reverse illusion confirmed (height -16)
 * - Nav: bar 9 0->44828 in 583ms, need 300ms+ wait for assistant mount
 * - C3: /share/ 200 in 3.3s, 75 nodes -> 36 msgs (26 system hidden)
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
        // ChatGPT LIVE: div[class*="scrollbar-gutter"] is real (overflow:auto, 86093px)
        if (siteKey === 'chatgpt') {
            const sel = SELECTORS.chatgpt;
            let el = document.querySelector(sel.scrollContainer);
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
    const C1 = {
        scan(session) {
            // Stale SPA navigation: never populate the new chat's store with old data
            if (session && !isCurrentSession(session)) return 0;
            const store = StoreManager.getStore();
            const sel = SELECTORS.chatgpt;
            let bars = document.querySelectorAll(sel.promptBar);
            if (bars.length === 0) {
                bars = document.querySelectorAll(sel.promptBarFallback);
            }
            if (bars.length === 0) {
                console.log('[TOC C1] No prompt bars (small chat) — skip, rely on C6');
                return 0;
            }
            console.log(`[TOC C1] Found ${bars.length} prompt bars`);
            let added = 0;
            let updated = 0;
            bars.forEach(bar => {
                const idxStr = bar.getAttribute('data-toc-item-index');
                const idx = idxStr !== null ? parseInt(idxStr, 10) : -1;
                if (idx < 0 || isNaN(idx)) return;
                const rawAria = (bar.getAttribute(sel.promptBarTextAttr) || bar.getAttribute('aria-label') || '').trim();
                // Fix: aria-label may be "Prompt N" (new) or truncated text (old) — handle both
                const isPromptN = /^Prompt \d+$/i.test(rawAria);
                const truncated = isPromptN ? '' : rawAria;
                const text = truncated || `Prompt ${idx + 1}`;
                const isTruncated = !isPromptN && truncated.length > 0;
                // Use stable id based on index only (not text) to avoid duplicates when text changes
                const id = `c1-${idx}`;
                const existing = store.getByPromptBarIndex(idx);
                if (!existing) {
                    store.add({
                        id,
                        role: 'user',
                        text,
                        isTruncated,
                        promptBarIndex: idx,
                        turnId: null,
                        messageId: null,
                        source: 'c1',
                    });
                    added++;
                } else {
                    // Update if we now have real text and existing is placeholder
                    if (existing.text.startsWith('Prompt ') && truncated && !isPromptN) {
                        store.update(existing.id, { text: truncated, isTruncated });
                        updated++;
                    } else if (existing.isTruncated && truncated && existing.text !== truncated && !isPromptN) {
                        store.update(existing.id, { text: truncated, isTruncated });
                        updated++;
                    }
                }
            });
            console.log(`[TOC C1] Added ${added}, updated ${updated}, total store: ${store.size()}`);
            return bars.length;
        },
        getCount() {
            const sel = SELECTORS.chatgpt;
            let bars = document.querySelectorAll(sel.promptBar);
            if (bars.length === 0) bars = document.querySelectorAll(sel.promptBarFallback);
            return bars.length;
        }
    };

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

        // rAF with timeout fallback: rAF never fires in hidden tabs, which
        // wedged isScanning=true forever once the 30s backstop was removed.
        const nextFrame = () => new Promise((resolve) => {
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(); } };
            try {
                requestAnimationFrame(() => requestAnimationFrame(done));
            } catch (e) { done(); }
            setTimeout(done, 500);
        });

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
            let savedAnchorId = null;
            let savedAnchorIndex = null;
            try {
                const viewportCenter = container.scrollTop + container.clientHeight / 2;
                const turns = document.querySelectorAll(SELECTORS.chatgpt.turnContainer);
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
                    savedAnchorId = closest.getAttribute(SELECTORS.chatgpt.turnIdAttr) || closest.getAttribute('data-testid');
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
                    const el = document.querySelector(`[data-turn-id="${savedAnchorId}"]`);
                    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
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
            const savedTop = container.scrollTop;
            const scrollStep = Math.floor(container.clientHeight * 0.85);
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
                // Scroll to top — wait longer for virtualization to render first turns
                container.scrollTo({ top: 0, behavior: 'instant' });
                await nextFrame();
                await nextFrame();
                await new Promise(r => setTimeout(r, 300));
                if (scanGen !== myGen || scanAbort) return;
                if (scanSession && !isCurrentSession(scanSession)) return;
                let added = C6.scanCurrent(siteKey, scanSession);
                totalFound += added;
                // Bars often mount only after the first scroll forces layout:
                // index them now so subsequent C6 passes match via promptBarIndexMap.
                try {
                    if (siteKey === 'chatgpt' && document.querySelectorAll(SELECTORS.chatgpt.promptBar).length > 0) {
                        C1.scan(scanSession);
                    }
                } catch (e) { /* ignore */ }
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

                    container.scrollTo({ top: beforeTop + scrollStep, behavior: 'instant' });
                    await nextFrame();
                    await nextFrame();
                    await new Promise(r => setTimeout(r, 50));
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
                    if (afterTop >= container.scrollHeight - container.clientHeight - 10) {
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
                    container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
                    await new Promise(r => setTimeout(r, 200));
                    if (scanGen !== myGen || scanAbort) return;
                    if (scanSession && !isCurrentSession(scanSession)) return;
                    added = C6.scanCurrent(siteKey, scanSession);
                    totalFound += added;
                }
                // Re-scan top: virtualization may have hidden first turns during bottom scroll
                if (scanGen === myGen && !scanAbort && (!scanSession || isCurrentSession(scanSession))) {
                    container.scrollTo({ top: 0, behavior: 'instant' });
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
                        // Final bar indexing: bars mounted mid-scan get merged into
                        // existing C6 entries via promptBarIndexMap (no duplicates).
                        try {
                            if (siteKey === 'chatgpt' && document.querySelectorAll(SELECTORS.chatgpt.promptBar).length > 0) {
                                C1.scan(scanSession);
                            }
                        } catch (e) { /* ignore */ }
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
                    const anchorEl = document.querySelector(`[data-turn-id="${savedAnchorId}"]`);
                    if (anchorEl) {
                        console.log(`[TOC C7] Restoring anchor ${savedAnchorId}`);
                        anchorEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                    } else if (savedAnchorIndex !== null) {
                        // Fallback to prompt bar (LIVE: [data-toc-item-index], not aria-label)
                        const bar = document.querySelector(`[data-toc-item-index="${savedAnchorIndex}"]`);
                        if (bar) {
                            console.log(`[TOC C7] Anchor not in DOM, clicking bar ${savedAnchorIndex}`);
                            bar.click();
                        } else {
                            container.scrollTo({ top: savedTop, behavior: 'instant' });
                        }
                    } else {
                        container.scrollTo({ top: savedTop, behavior: 'instant' });
                    }
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
    // Navigator (Trap 2) — 2-step with adaptive wait
    // -------------------------------------------------------------------------
    const Navigator = {
        async navigateTo(storeId, siteKey) {
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

            if (key === 'chatgpt') {
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

        const getSetting = async () => {
            try {
                const adapter = safeAdapter();
                if (adapter) {
                    const items = await adapter.get({ experimentalAPI: false });
                    return { experimentalAPI: !!(items && items.experimentalAPI) };
                }
            } catch (e) { /* fall through */ }
            return new Promise(resolve => {
                try {
                    const api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local
                        : (typeof browser !== 'undefined' && browser.storage) ? browser.storage.local : null;
                    if (!api) return resolve({ experimentalAPI: false });
                    const maybePromise = api.get({ experimentalAPI: false });
                    if (maybePromise && typeof maybePromise.then === 'function') {
                        maybePromise.then(
                            items => resolve({ experimentalAPI: !!(items && items.experimentalAPI) }),
                            () => resolve({ experimentalAPI: false })
                        );
                        return;
                    }
                    api.get({ experimentalAPI: false }, items => resolve({ experimentalAPI: !!(items && items.experimentalAPI) }));
                } catch (e) {
                    resolve({ experimentalAPI: false });
                }
            });
        };

        const isEnabled = async () => {
            const isShare = Identity.isShared();
            if (isShare) {
                console.log('[TOC C3] Auto-enabled for /share/');
                return true;
            }
            const { experimentalAPI } = await getSetting();
            return !!experimentalAPI;
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
                console.log('[TOC C3] Disabled (toggle OFF and not /share/)');
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
                let res;
                if (shareId) {
                    console.log(`[TOC C3] Fetching /share/${shareId}`);
                    res = await fetch(apiUrl(`/backend-api/share/${shareId}`), {
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                    });
                } else {
                    // Logged-in conversation: Bearer token required (opt-in via toggle).
                    let token = await resolveToken();
                    if (!token) {
                        console.warn('[TOC C3] No token available for /c/ fetch');
                        return null;
                    }
                    console.log(`[TOC C3] Fetching /conversation/${convId} with token`);
                    res = await fetch(apiUrl(`/backend-api/conversation/${convId}`), {
                        credentials: 'include',
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                    });
                    if (res.status === 401) {
                        // Token expired: drop the cached token, fetch fresh once.
                        console.log('[TOC C3] 401, retrying with fresh token');
                        clearCachedToken();
                        token = await fetchSessionToken();
                        if (token) {
                            cachedToken = token;
                            try { cachedTokenAt = Date.now(); } catch (e) { /* ignore */ }
                            res = await fetch(apiUrl(`/backend-api/conversation/${convId}`), {
                                credentials: 'include',
                                headers: {
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${token}`,
                                },
                            });
                        } else {
                            clearCachedToken();
                        }
                    }
                }

                if (!res || !res.ok) {
                    console.warn(`[TOC C3] Fetch failed: ${res?.status}`);
                    return null;
                }
                const data = await res.json();
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

                // Filter out empty and system hidden
                messages = messages.filter(m => m.text && m.text.trim().length > 0);
                console.log(`[TOC C3] Final ${messages.length} messages with content`);
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
        C1,
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

            // 2. C1 for ChatGPT long chats (provisional)
            if (siteKey === 'chatgpt') {
                try { C1.scan(session); } catch (e) { /* ignore */ }
            }
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

            // Listen for storage changes to re-trigger C3 (ChatGPT pages only,
            // so toggling the setting elsewhere can never fire a ChatGPT request)
            try {
                const storageApi = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage
                    : (typeof browser !== 'undefined' && browser.storage) ? browser.storage : null;
                const api = storageApi || null;
                if (api && api.onChanged && !api.onChanged.__tocVirtualPatched) {
                    api.onChanged.__tocVirtualPatched = true;
                    api.onChanged.addListener((changes, area) => {
                        try {
                            if (area === 'local' && changes.experimentalAPI) {
                                try {
                                    if (!location.host.includes('chatgpt.com')) return;
                                } catch (e) { return; }
                                console.log('[TOC Virtual] experimentalAPI changed, re-fetching C3');
                                const current = {
                                    convId: (Identity && Identity.getCurrentId()) || location.href,
                                    navGen: currentNavGen,
                                };
                                C3.fetchAndMerge(current).then(c => { if (c > 0 && isCurrentSession(current) && onUpdate) onUpdate(); });
                            }
                        } catch (e) { /* ignore */ }
                    });
                }
            } catch (e) { /* ignore */ }
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
