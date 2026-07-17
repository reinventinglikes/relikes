/**
 * Re:Likes WordPress adapter.
 *
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
(function () {
  'use strict';

  const config = window.RelikesWPConfig;
  if (!config || !window.Relikes || !window.CleanSelection) return;

  document.documentElement.classList.add('relikes-wp-active');

  const instances = new Map();
  const pending = new Map();
  const arbitration = window.CleanSelectionRelikesWPArbitration ||= {};
  arbitration.cleanRecords ||= new Map();
  arbitration.relikesClaims ||= new WeakSet();
  arbitration.relikesPageActive = true;
  for (const release of [...arbitration.cleanRecords.values()]) {
    if (typeof release === 'function') release();
  }
  let intersectionObserver = null;
  let mutationObserver = null;
  let layoutResizeObserver = null;
  let layoutRefreshTimer = 0;
  let layoutRefreshFrame = 0;
  let destroyed = false;
  let sessionPromise = null;

  function queryAll(selector) {
    if (!selector) return [];
    try {
      return [...document.querySelectorAll(selector)];
    } catch (error) {
      console.warn('Re:Likes ignored an invalid selector.', selector, error);
      return [];
    }
  }

  function scheduleLayoutRefresh() {
    if (destroyed) return;

    // Re:Likes anchors are semantic, but their resolved rectangles are layout-specific.
    window.clearTimeout(layoutRefreshTimer);
    layoutRefreshTimer = window.setTimeout(() => {
      layoutRefreshTimer = 0;
      if (layoutRefreshFrame) window.cancelAnimationFrame(layoutRefreshFrame);
      layoutRefreshFrame = window.requestAnimationFrame(() => {
        layoutRefreshFrame = 0;
        for (const [element, record] of instances) {
          if (element.isConnected) record.instance?.refresh();
        }
      });
    }, 120);
  }

  function sanitizeKey(value, fallback) {
    const key = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return key || fallback;
  }

  function contentHash(element) {
    const text = String(element.innerText || element.textContent || '').replace(/\r\n?/g, '\n');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function commentMetadata(element) {
    const root = element.closest('[id^="comment-"], .comment, [data-comment-id]');
    const id = root?.dataset.commentId || root?.id?.match(/comment-(\d+)/)?.[1] || '';
    return { root, id };
  }

  function claim(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.dataset.relikesWpAttached || element.dataset.relikesWpCandidate) return false;
    if (element.closest('[data-relikes-wp-attached], [data-relikes-wp-candidate]')) return false;
    if (element.querySelector('[data-relikes-wp-attached], [data-relikes-wp-candidate]')) return false;

    element.dataset.relikesWpCandidate = '1';
    arbitration.relikesClaims.add(element);

    for (const [cleanElement, release] of [...arbitration.cleanRecords]) {
      const overlaps = cleanElement === element || cleanElement.contains(element) || element.contains(cleanElement);
      if (overlaps && typeof release === 'function') release();
    }

    return true;
  }

  function releaseClaim(element) {
    arbitration.relikesClaims.delete(element);
    delete element.dataset.relikesWpCandidate;
  }

  function discoverSurfaces() {
    const surfaces = [];

    if (config.enableContent) {
      const candidates = queryAll(config.contentSelector).filter(element => {
        const comment = element.closest('[id^="comment-"], .comment, [data-comment-id]');
        return !comment;
      });
      const topLevel = candidates.filter(element => !candidates.some(other => other !== element && other.contains(element)));

      topLevel.forEach((element, index) => {
        if (!claim(element)) return;
        const instanceKey = sanitizeKey(element.dataset.relikesInstance, index === 0 ? 'content' : `content-${index + 1}`);
        surfaces.push({
          element,
          type: 'post',
          sourceId: String(config.postId),
          instanceKey,
          documentId: `post:${config.postId}:${instanceKey}`
        });
      });
    }

    if (config.enableComments) {
      const counters = new Map();
      queryAll(config.commentSelector).forEach(element => {
        const metadata = commentMetadata(element);
        if (!metadata.id || !claim(element)) return;
        const count = (counters.get(metadata.id) || 0) + 1;
        counters.set(metadata.id, count);
        const instanceKey = sanitizeKey(element.dataset.relikesInstance, count === 1 ? 'content' : `content-${count}`);
        surfaces.push({
          element,
          type: 'comment',
          sourceId: metadata.id,
          instanceKey,
          documentId: `comment:${metadata.id}:${instanceKey}`
        });
      });
    }

    return surfaces;
  }

  function makeTools() {
    const tools = document.createElement('div');
    const switcher = document.createElement('div');
    const mine = document.createElement('button');
    const heatmap = document.createElement('button');
    const clear = document.createElement('button');
    const status = document.createElement('span');

    tools.className = 'relikes-wp-tools';
    tools.dataset.relikesOverlayUi = 'true';
    const controlOptions = config.visual?.controls || {};
    const controlAppearance = controlOptions.appearance === 'theme' ? 'theme' : 'default';
    tools.dataset.appearance = controlAppearance;

    if (controlAppearance === 'default') {
      const properties = {
        '--relikes-control-accent': controlOptions.accent,
        '--relikes-control-background': controlOptions.background,
        '--relikes-control-border': controlOptions.border,
        '--relikes-control-text': controlOptions.text,
        '--relikes-control-active-text': controlOptions.activeText,
        '--relikes-control-clear': controlOptions.clear,
        '--relikes-control-radius': `${numberOption(controlOptions.radius, 999)}px`
      };
      for (const [property, value] of Object.entries(properties)) {
        if (value !== undefined && value !== null && value !== '') tools.style.setProperty(property, value);
      }
    }

    switcher.className = 'relikes-wp-switch';
    switcher.dataset.mode = 'mine';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', `${config.labels.mine} / ${config.labels.heatmap}`);
    mine.type = heatmap.type = clear.type = 'button';
    mine.textContent = config.labels.mine;
    heatmap.textContent = config.labels.heatmap;
    clear.textContent = config.labels.clear;
    clear.className = 'relikes-wp-clear';
    status.className = 'relikes-wp-status';
    status.setAttribute('aria-live', 'polite');
    mine.setAttribute('aria-pressed', 'true');
    heatmap.setAttribute('aria-pressed', 'false');
    switcher.append(mine, heatmap);
    if (config.showHeatmap) tools.append(switcher);
    tools.append(clear, status);

    return { tools, switcher, mine, heatmap, clear, status };
  }

  function updateTools(record, state) {
    const mode = state.viewMode || 'mine';
    record.ui.switcher.dataset.mode = mode;
    record.ui.mine.setAttribute('aria-pressed', String(mode === 'mine'));
    record.ui.heatmap.setAttribute('aria-pressed', String(mode === 'heatmap'));
    record.ui.clear.disabled = !state.counts?.total;
    const backendStatus = state.backend?.status || 'idle';
    record.ui.status.textContent = `${config.labels.status}: ${backendStatus}`;
  }

  function touchBarOptions() {
    if (!config.touchBar) return false;
    return {
      ariaLabel: 'Reaction selection mode',
      layout: config.touchBarPlacement === 'floating'
        ? { placement: 'floating', offset: { bottom: config.touchBarOffset, right: '16px' }, borderRadius: '999px' }
        : { placement: config.touchBarPlacement, offset: config.touchBarOffset }
    };
  }

  async function sharedBackendRequest(context) {
    if (context.operation !== 'session') return context.defaultRequest();

    if (!sessionPromise) {
      sessionPromise = context.defaultRequest()
        .then(async response => {
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            const error = new Error(body?.error?.message || 'Could not establish a Re:Likes reader session.');
            error.code = body?.error?.code || 'session_failed';
            error.status = response.status;
            error.details = body?.error?.details || {};
            throw error;
          }
          return body;
        })
        .catch(error => {
          sessionPromise = null;
          throw error;
        });
      sessionPromise.finally(() => {
        window.setTimeout(() => {
          sessionPromise = null;
        }, 0);
      }).catch(() => {});
    }

    return sessionPromise;
  }

  function attachSurface(surface) {
    const element = surface.element;
    if (!element.isConnected || instances.has(element)) {
      pending.delete(element);
      if (!instances.has(element)) releaseClaim(element);
      return;
    }

    const ui = makeTools();
    element.before(ui.tools);
    element.dataset.relikesWpAttached = '1';
    delete element.dataset.relikesWpCandidate;

    const record = { surface, ui, instance: null };
    const versionScope = contentHash(element);
    const headers = config.nonce ? { 'X-WP-Nonce': config.nonce } : {};
    let instance;
    try {
      instance = Relikes.attach(element, {
        docId: surface.documentId,
        userId: config.userId || undefined,
        userKey: 'relikes-wp-reader-v1',
        storageKey: `relikes-wp-store-v1:${surface.documentId}:${versionScope}`,
        colors: {
          selection: hexToRgb(config.visual?.selectionColor),
          like: hexToRgb(config.likeColor),
          dislike: hexToRgb(config.dislikeColor)
        },
        reactionAlpha: Number(config.reactionAlpha),
        geometry: surfaceGeometry(surface),
        heatmap: config.visual?.heatmap || {},
        airbrush: brushVisualOptions(surface),
        eraseEnabled: true,
        touchEraseBar: touchBarOptions(),
        interactiveElements: [
          { selector: 'button, input, textarea, select, summary, [contenteditable="true"]', behavior: 'native' },
          { selector: 'a[href]', behavior: 'tap-native-drag-select' }
        ],
        backend: {
          url: config.restUrl,
          documentId: surface.documentId,
          documentVersion: config.documentVersion,
          userId: config.userId,
          routes: {
            session: { url: config.restRoutes?.session || 'session', method: 'POST' },
            reactions: { url: config.restRoutes?.reactions || 'reactions', method: 'PUT' },
            heatmap: { url: config.restRoutes?.heatmap || 'heatmap', method: 'GET' }
          },
          headers,
          credentials: 'same-origin',
          request: sharedBackendRequest
        },
        onChange(state) {
          updateTools(record, state);
        },
        onBackendChange(state) {
          record.ui.status.textContent = `${config.labels.status}: ${state.backend?.status || 'idle'}`;
        }
      });
    } catch (error) {
      ui.tools.remove();
      delete element.dataset.relikesWpAttached;
      pending.delete(element);
      releaseClaim(element);
      console.error('Re:Likes could not attach to a WordPress content surface.', error);
      return;
    }

    instance.capture?.updateOptions(brushVisualOptions(surface));
    record.instance = instance;
    instances.set(element, record);
    layoutResizeObserver?.observe(element);
    pending.delete(element);

    ui.mine.addEventListener('click', () => instance.setViewMode('mine'));
    ui.heatmap.addEventListener('click', () => instance.setViewMode('heatmap'));
    ui.clear.addEventListener('click', () => instance.clearUser());
  }

  function hexToRgb(hex) {
    const match = String(hex).match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    return match ? match.slice(1).map(value => Number.parseInt(value, 16)) : [85, 185, 111];
  }

  function numberOption(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function surfaceVisualOptions(surface) {
    const visual = config.visual || {};
    return surface.type === 'comment' ? (visual.comment || {}) : (visual.content || {});
  }

  function surfaceGeometry(surface) {
    const visual = config.visual || {};
    const geometry = surfaceVisualOptions(surface);
    return {
      radius: numberOption(geometry.radius, 18),
      paddingRatio: numberOption(visual.cloudPaddingRatio, 0.32),
      detectTolerance: numberOption(geometry.detectTolerance, 3),
      overlayPadding: numberOption(geometry.overlayPadding, 72)
    };
  }

  function brushVisualOptions(surface) {
    const visual = config.visual || {};
    const brush = visual.brush || {};
    const geometry = surfaceVisualOptions(surface);
    return {
      color: hexToRgb(visual.selectionColor),
      hardness: numberOption(brush.hardness, 0.34),
      maxAlpha: numberOption(brush.maxAlpha, 0.16),
      spacing: numberOption(brush.spacing, 0.33),
      turbulence: numberOption(brush.turbulence, 0.22),
      turbulenceSpeed: numberOption(brush.turbulenceSpeed, 0.54),
      finalAlpha: numberOption(brush.finalAlpha, 0.28),
      fadeSpeed: numberOption(brush.fadeSpeed, 0.035),
      finalGrowSpeed: numberOption(brush.finalGrowSpeed, 0.04),
      finalPaddingRatio: numberOption(brush.paddingRatio, 0.3),
      radius: numberOption(geometry.radius, 18),
      overflowPadding: numberOption(geometry.overlayPadding, 72),
      externalVirtualPadding: numberOption(geometry.virtualPadding, 20),
      detectTolerance: numberOption(geometry.detectTolerance, 3),
      centerPopup: Boolean(config.centerPopup),
      cursor: brush.cursor || null
    };
  }

  function schedule(surface) {
    pending.set(surface.element, surface);
    if (intersectionObserver) intersectionObserver.observe(surface.element);
    else attachSurface(surface);
  }

  function destroyRecord(element, record) {
    layoutResizeObserver?.unobserve(element);
    record.instance?.destroy();
    record.ui.tools.remove();
    delete element.dataset.relikesWpAttached;
    releaseClaim(element);
    instances.delete(element);
  }

  function reconcile() {
    for (const [element, record] of instances) {
      if (!element.isConnected) destroyRecord(element, record);
    }
    for (const element of pending.keys()) {
      if (!element.isConnected) {
        pending.delete(element);
        releaseClaim(element);
      }
    }
    for (const surface of discoverSurfaces()) schedule(surface);
  }

  function bootstrap() {
    if ('ResizeObserver' in window) {
      layoutResizeObserver = new ResizeObserver(scheduleLayoutRefresh);
    }
    window.addEventListener('resize', scheduleLayoutRefresh, { passive: true });
    window.addEventListener('orientationchange', scheduleLayoutRefresh, { passive: true });
    document.fonts?.ready.then(scheduleLayoutRefresh).catch(() => {});

    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const surface = pending.get(entry.target);
          intersectionObserver.unobserve(entry.target);
          if (surface) attachSurface(surface);
        }
      }, { rootMargin: '600px 0px' });
    }

    for (const surface of discoverSurfaces()) schedule(surface);
    mutationObserver = new MutationObserver(reconcile);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function destroyAll() {
    destroyed = true;
    mutationObserver?.disconnect();
    intersectionObserver?.disconnect();
    layoutResizeObserver?.disconnect();
    window.removeEventListener('resize', scheduleLayoutRefresh);
    window.removeEventListener('orientationchange', scheduleLayoutRefresh);
    window.clearTimeout(layoutRefreshTimer);
    if (layoutRefreshFrame) window.cancelAnimationFrame(layoutRefreshFrame);
    for (const [element, record] of instances) destroyRecord(element, record);
    for (const element of pending.keys()) releaseClaim(element);
    pending.clear();
    arbitration.relikesPageActive = false;
  }

  window.addEventListener('pagehide', destroyAll, { once: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
