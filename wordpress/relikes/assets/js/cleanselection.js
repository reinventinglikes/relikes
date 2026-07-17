/*!
 * Clean Selection v1.1.0
 * Airbrush-style text selection for the web.
 *
 * Copyright (c) 2026 kotoverse
 * Author: kotoverse
 * @license MIT
 * Licensed under the MIT License.
 * License: https://opensource.org/license/mit/
 * Project and live demo: https://cleanselection.com/
 * Source: https://github.com/cleanselection/cleanselection
 *
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: MIT
 */
(function () {

  /*
    Core data flow:
    rendered text -> grapheme fragments -> sampled airbrush stroke -> resolved
    fragment span -> durable selection record -> popup and clipboard actions.
    Geometry is always derived from the current DOM; the selection record is the
    semantic boundary that keeps text, rendering, and UI behavior synchronized.
  */

  // Shared state is intentionally tiny. Instances render independently, but
  // popup timing and cross-instance copy ordering need a common view.
  const GLOBAL_STATE = {
    active: false,
    instances: [],
    nextInstanceId: 1,
    touchEraseBarManager: null
  };
  // Pair tables are used by includeCompleteWords=true to optionally pull in
  // punctuation at the selection edge when its counterpart is already inside.
  const OPEN_TO_CLOSE = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
    '“': '”',
    '‘': '’',
    '«': '»',
    '‹': '›'
  };
  const CLOSE_TO_OPEN = Object.fromEntries(
    Object.entries(OPEN_TO_CLOSE).map(([open, close]) => [close, open])
  );
  const SYMMETRIC_PAIRS = new Set(['"', "'", '`']);
  // Apostrophes and hyphens should behave like word glue, not punctuation,
  // when they sit between two word characters on the same rendered line.
  const WORD_JOINERS = new Set(["'", '’', '-', '‐', '‑']);
  const POPUP_THEME_TOKENS = Object.freeze({
    minWidth: '220px',
    maxWidth: 'min(320px, calc(100vw - 32px))',
    radius: '14px',
    paddingY: '0.9rem',
    paddingX: '1rem',
    gap: '0.75rem',
    borderColor: 'rgba(52, 78, 131, 0.14)',
    backgroundStart: 'rgba(255,255,255,0.97)',
    backgroundEnd: 'rgba(246,249,255,0.95)',
    shadowPrimary: '0 20px 38px rgba(26, 43, 77, 0.16)',
    shadowSecondary: '0 6px 18px rgba(26, 43, 77, 0.1)',
    previewColor: '#21314f',
    previewFontSize: '0.92rem',
    previewLineHeight: '1.45',
    actionGap: '0.65rem',
    buttonRadius: '14px',
    buttonPaddingY: '0.58rem',
    buttonPaddingX: '0.95rem',
    buttonWeight: '600',
    copyStart: '#1e90ff',
    copyEnd: '#4f6dff',
    copyShadow: '0 10px 18px rgba(35, 94, 255, 0.22)',
    copyActiveStart: '#166fd8',
    copyActiveEnd: '#3559db',
    copyActiveShadow: '0 12px 24px rgba(35, 94, 255, 0.34)',
    copiedStart: '#1d69d6',
    copiedEnd: '#3b56da',
    cancelBackground: 'rgba(77, 96, 133, 0.1)',
    cancelColor: '#32425f'
  });
  const TOUCH_ERASE_BAR_THEME = Object.freeze({
    background: 'rgba(248, 252, 255, 0.96)',
    borderColor: 'rgba(20, 45, 68, 0.12)',
    trackBackground: 'rgba(226, 238, 247, 0.86)',
    activeBackground: '#294765',
    eraseActiveBackground: '#294765',
    textColor: '#607489',
    activeTextColor: '#fbfdff',
    zIndex: '40020',
    backdropFilter: 'blur(16px)'
  });
  const TOUCH_ERASE_BAR_LAYOUT = Object.freeze({
    placement: 'top',
    offset: '0px',
    inlineInset: '0px',
    align: 'stretch',
    width: 'auto',
    maxWidth: 'none',
    borderRadius: '0px'
  });
  const IS_ANDROID_CHROME = (() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent || '';

    return (
      /Android/i.test(userAgent) &&
      /Chrome\/\d+/i.test(userAgent) &&
      !/(EdgA|OPR|SamsungBrowser|DuckDuckGo|YaBrowser|Vivaldi)/i.test(userAgent)
    );
  })();

  function getVisualViewportMetrics() {
    const visualViewport = window.visualViewport;
    const layoutWidth = document.documentElement.clientWidth || window.innerWidth || 1;
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight || 1;
    const left = visualViewport ? Math.max(0, visualViewport.offsetLeft || 0) : 0;
    const top = visualViewport ? Math.max(0, visualViewport.offsetTop || 0) : 0;
    const width = Math.max(1, visualViewport?.width || layoutWidth);
    const height = Math.max(1, visualViewport?.height || window.innerHeight || layoutHeight);

    return {
      left,
      top,
      width,
      height,
      rightInset: Math.max(0, layoutWidth - left - width),
      bottomInset: Math.max(0, layoutHeight - top - height),
      pageLeft: window.scrollX + left,
      pageTop: window.scrollY + top
    };
  }

  function addCssLengths(...values) {
    return `calc(${values.filter(Boolean).join(' + ')})`;
  }
  const POPUP_STYLE_TEMPLATE = document.createElement('template');
  POPUP_STYLE_TEMPLATE.innerHTML = `
    <style>
      :host {
        position: absolute;
        z-index: 20000;
        display: block;
        pointer-events: auto;
        box-sizing: border-box;
        font: inherit;
        color: inherit;
        --airbrush-popup-min-width: ${POPUP_THEME_TOKENS.minWidth};
        --airbrush-popup-max-width: ${POPUP_THEME_TOKENS.maxWidth};
        --airbrush-popup-radius: ${POPUP_THEME_TOKENS.radius};
        --airbrush-popup-padding-y: ${POPUP_THEME_TOKENS.paddingY};
        --airbrush-popup-padding-x: ${POPUP_THEME_TOKENS.paddingX};
        --airbrush-popup-gap: ${POPUP_THEME_TOKENS.gap};
        --airbrush-popup-border-color: ${POPUP_THEME_TOKENS.borderColor};
        --airbrush-popup-bg-start: ${POPUP_THEME_TOKENS.backgroundStart};
        --airbrush-popup-bg-end: ${POPUP_THEME_TOKENS.backgroundEnd};
        --airbrush-popup-shadow-primary: ${POPUP_THEME_TOKENS.shadowPrimary};
        --airbrush-popup-shadow-secondary: ${POPUP_THEME_TOKENS.shadowSecondary};
        --airbrush-popup-preview-color: ${POPUP_THEME_TOKENS.previewColor};
        --airbrush-popup-preview-font-size: ${POPUP_THEME_TOKENS.previewFontSize};
        --airbrush-popup-preview-line-height: ${POPUP_THEME_TOKENS.previewLineHeight};
        --airbrush-popup-action-gap: ${POPUP_THEME_TOKENS.actionGap};
        --airbrush-popup-button-radius: ${POPUP_THEME_TOKENS.buttonRadius};
        --airbrush-popup-button-padding-y: ${POPUP_THEME_TOKENS.buttonPaddingY};
        --airbrush-popup-button-padding-x: ${POPUP_THEME_TOKENS.buttonPaddingX};
        --airbrush-popup-button-weight: ${POPUP_THEME_TOKENS.buttonWeight};
        --airbrush-popup-copy-start: ${POPUP_THEME_TOKENS.copyStart};
        --airbrush-popup-copy-end: ${POPUP_THEME_TOKENS.copyEnd};
        --airbrush-popup-copy-shadow: ${POPUP_THEME_TOKENS.copyShadow};
        --airbrush-popup-copy-active-start: ${POPUP_THEME_TOKENS.copyActiveStart};
        --airbrush-popup-copy-active-end: ${POPUP_THEME_TOKENS.copyActiveEnd};
        --airbrush-popup-copy-active-shadow: ${POPUP_THEME_TOKENS.copyActiveShadow};
        --airbrush-popup-copied-start: ${POPUP_THEME_TOKENS.copiedStart};
        --airbrush-popup-copied-end: ${POPUP_THEME_TOKENS.copiedEnd};
        --airbrush-popup-cancel-background: ${POPUP_THEME_TOKENS.cancelBackground};
        --airbrush-popup-cancel-color: ${POPUP_THEME_TOKENS.cancelColor};
      }

      :host([hidden]) {
        display: none !important;
      }

      .airbrush-popup {
        display: grid;
        gap: var(--airbrush-popup-gap);
        min-width: var(--airbrush-popup-min-width);
        max-width: var(--airbrush-popup-max-width);
        padding: var(--airbrush-popup-padding-y) var(--airbrush-popup-padding-x);
        border: 1px solid var(--airbrush-popup-border-color);
        border-radius: var(--airbrush-popup-radius);
        background: linear-gradient(180deg, var(--airbrush-popup-bg-start), var(--airbrush-popup-bg-end));
        box-shadow:
          var(--airbrush-popup-shadow-primary),
          var(--airbrush-popup-shadow-secondary);
        backdrop-filter: blur(14px);
        box-sizing: border-box;
      }

      :host([data-has-preview="false"]) .airbrush-popup {
        gap: 0;
      }

      .airbrush-popup__preview {
        font-size: var(--airbrush-popup-preview-font-size);
        line-height: var(--airbrush-popup-preview-line-height);
        color: var(--airbrush-popup-preview-color);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-wrap: pretty;
      }

      .airbrush-popup__preview[hidden] {
        display: none !important;
      }

      .airbrush-popup__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--airbrush-popup-action-gap);
      }

      .airbrush-popup__btn {
        appearance: none;
        border: 0;
        border-radius: var(--airbrush-popup-button-radius);
        padding: var(--airbrush-popup-button-padding-y) var(--airbrush-popup-button-padding-x);
        width: 100%;
        margin: 0;
        min-width: 0;
        box-sizing: border-box;
        font: inherit;
        font-weight: var(--airbrush-popup-button-weight);
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, color 120ms ease;
      }

      .airbrush-popup__btn:hover {
        transform: translateY(-1px);
      }

      .airbrush-popup__btn:active {
        transform: translateY(0);
      }

      .airbrush-popup__btn--copy {
        background: linear-gradient(135deg, var(--airbrush-popup-copy-start), var(--airbrush-popup-copy-end));
        color: #fff;
        box-shadow: var(--airbrush-popup-copy-shadow);
      }

      .airbrush-popup__btn--copy.mock-clicked {
        background: linear-gradient(135deg, var(--airbrush-popup-copy-active-start), var(--airbrush-popup-copy-active-end));
        box-shadow: var(--airbrush-popup-copy-active-shadow);
      }

      .airbrush-popup__btn--copy[data-state="copied"] {
        background: linear-gradient(135deg, var(--airbrush-popup-copied-start), var(--airbrush-popup-copied-end));
      }

      .airbrush-popup__btn--cancel {
        background: var(--airbrush-popup-cancel-background);
        color: var(--airbrush-popup-cancel-color);
      }
    </style>
  `;

  const DEFAULT_POPUP_MARKUP_TEMPLATE = document.createElement('template');
  DEFAULT_POPUP_MARKUP_TEMPLATE.innerHTML = `
    <div class="airbrush-popup" part="popup">
      <div class="airbrush-popup__preview" part="preview"></div>
      <div class="airbrush-popup__actions" part="actions">
        <button type="button" class="airbrush-popup__btn airbrush-popup__btn--copy" part="copy-button">Copy</button>
        <button type="button" class="airbrush-popup__btn airbrush-popup__btn--cancel" part="cancel-button">Cancel</button>
      </div>
    </div>
  `;

  // Popup markup lives in a shadow root so the built-in controls remain usable
  // in heavily styled host pages. Consumers can still theme through the exposed
  // CSS variables, parts, class tokens, or a completely custom renderer.
  function getPopupClassTokens(popupClassName = '') {
    return String(popupClassName)
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean);
  }

  function applyPopupClassTokens(element, classTokens) {
    if (element && classTokens.length) {
      element.classList.add(...classTokens);
    }
  }

  function createPopupShell(popupClassName = '') {
    const host = document.createElement('div');
    host.hidden = true;
    host.className = 'airbrush-popup-host';
    host.dataset.airbrushPopup = 'true';
    const classTokens = getPopupClassTokens(popupClassName);
    applyPopupClassTokens(host, classTokens);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(POPUP_STYLE_TEMPLATE.content.cloneNode(true));

    return {
      host,
      shadowRoot,
      classTokens
    };
  }

  function createDefaultPopupDom(popupClassName = '') {
    const popupShell = createPopupShell(popupClassName);
    const { host, shadowRoot, classTokens } = popupShell;

    shadowRoot.appendChild(DEFAULT_POPUP_MARKUP_TEMPLATE.content.cloneNode(true));

    const popup = shadowRoot.querySelector('.airbrush-popup');
    applyPopupClassTokens(popup, classTokens);

    return {
      host,
      shadowRoot,
      popup,
      preview: shadowRoot.querySelector('.airbrush-popup__preview'),
      copyButton: shadowRoot.querySelector('.airbrush-popup__btn--copy'),
      cancelButton: shadowRoot.querySelector('.airbrush-popup__btn--cancel')
    };
  }

  // A registry is an opt-in coordination object shared by otherwise independent
  // instances. It provides document-order copy/cancel behavior without coupling
  // the instances' canvases or pointer state.
  function ensureRegistryState(registryRef) {
    if (!registryRef) return null;

    if (!registryRef.__airbrushSelectionState) {
      registryRef.__airbrushSelectionState = {
        entries: new Map(),
        copiedSelectionIds: new Set(),
        nextSelectionId: 1
      };
    }

    return registryRef.__airbrushSelectionState;
  }

  function compareElementsInDom(a, b) {
    if (a === b) return 0;

    const relation = a.compareDocumentPosition(b);

    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;

    return 0;
  }

  function getSelectionFragmentEdge(selection, edge = 'start') {
    const indices = selection?.fragmentIndices || selection?.state?.fragmentIndices || [];
    if (!indices.length) return Number.MAX_SAFE_INTEGER;

    return edge === 'end'
      ? Math.max(...indices)
      : Math.min(...indices);
  }

  function compareSelectionsInDocument(a, b) {
    const elementOrder = compareElementsInDom(a.element, b.element);
    if (elementOrder !== 0) return elementOrder;

    const startDiff = getSelectionFragmentEdge(a) - getSelectionFragmentEdge(b);
    if (startDiff !== 0) return startDiff;

    const endDiff = getSelectionFragmentEdge(a, 'end') - getSelectionFragmentEdge(b, 'end');
    if (endDiff !== 0) return endDiff;

    const topDiff = (a.bounds?.y ?? Number.MAX_SAFE_INTEGER) - (b.bounds?.y ?? Number.MAX_SAFE_INTEGER);
    if (Math.abs(topDiff) > 0.5) return topDiff;

    const leftDiff = (a.bounds?.x ?? Number.MAX_SAFE_INTEGER) - (b.bounds?.x ?? Number.MAX_SAFE_INTEGER);
    if (Math.abs(leftDiff) > 0.5) return leftDiff;

    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  }

  function collectRegistrySelections(registryState, copiedOnly = false) {
    if (!registryState) return [];

    const selections = [];

    for (const entry of registryState.entries.values()) {
      for (const selection of entry.selections) {
        if (!selection) continue;
        if (copiedOnly && !registryState.copiedSelectionIds.has(selection.id)) continue;
        selections.push(selection);
      }
    }

    return selections.sort(compareSelectionsInDocument);
  }

  // Public option normalization happens once at the boundary. Internal code can
  // then treat the touch controller as a complete, predictable configuration.
  function normalizeTouchEraseBarConfig(value) {
    if (!value) return null;

    const config = value === true ? {} : value;
    if (config.enabled === false) return null;

    return {
      labels: {
        select: config.labels?.select || 'Select',
        erase: config.labels?.erase || 'Deselect'
      },
      ariaLabel: config.ariaLabel || 'Selection mode',
      className: config.className || '',
      bodyClassName: config.bodyClassName || 'has-airbrush-touch-erase-bar',
      mediaQuery: config.mediaQuery || '(max-width: 760px)',
      requireSelection: config.requireSelection === true,
      alwaysVisible: config.alwaysVisible === true,
      layout: normalizeTouchEraseBarLayout(config.layout),
      theme: {
        ...TOUCH_ERASE_BAR_THEME,
        ...(config.theme || {})
      }
    };
  }

  function normalizeCssLength(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value}px`;
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    return fallback;
  }

  function normalizeTouchEraseBarLayout(value) {
    const source = value && typeof value === 'object' ? value : {};
    const placement = ['top', 'bottom', 'floating'].includes(source.placement)
      ? source.placement
      : TOUCH_ERASE_BAR_LAYOUT.placement;
    const offsetSource = source.offset && typeof source.offset === 'object'
      ? source.offset
      : {};
    const scalarOffset = typeof source.offset === 'object'
      ? null
      : normalizeCssLength(source.offset, TOUCH_ERASE_BAR_LAYOUT.offset);
    const hasVerticalOffset = offsetSource.top != null || offsetSource.bottom != null;
    const hasHorizontalOffset = offsetSource.left != null || offsetSource.right != null;
    const offset = {
      top: offsetSource.top == null ? null : normalizeCssLength(offsetSource.top, null),
      right: offsetSource.right == null ? null : normalizeCssLength(offsetSource.right, null),
      bottom: offsetSource.bottom == null ? null : normalizeCssLength(offsetSource.bottom, null),
      left: offsetSource.left == null ? null : normalizeCssLength(offsetSource.left, null)
    };

    if (placement === 'top' && !hasVerticalOffset) offset.top = scalarOffset;
    if (placement === 'bottom' && !hasVerticalOffset) offset.bottom = scalarOffset;
    if (placement === 'floating' && !hasVerticalOffset) offset.bottom = '16px';
    if (placement === 'floating' && !hasHorizontalOffset) offset.right = '16px';

    return {
      placement,
      offset,
      inlineInset: normalizeCssLength(
        source.inlineInset,
        placement === 'floating' ? '16px' : TOUCH_ERASE_BAR_LAYOUT.inlineInset
      ),
      align: ['stretch', 'start', 'center', 'end'].includes(source.align)
        ? source.align
        : (placement === 'floating' ? 'end' : TOUCH_ERASE_BAR_LAYOUT.align),
      width: normalizeCssLength(
        source.width,
        placement === 'floating'
          ? 'min(360px, calc(var(--airbrush-visual-viewport-width, 100vw) - 32px))'
          : TOUCH_ERASE_BAR_LAYOUT.width
      ),
      maxWidth: normalizeCssLength(
        source.maxWidth,
        placement === 'floating'
          ? 'calc(var(--airbrush-visual-viewport-width, 100vw) - 32px)'
          : TOUCH_ERASE_BAR_LAYOUT.maxWidth
      ),
      borderRadius: normalizeCssLength(
        source.borderRadius,
        placement === 'floating' ? '16px' : TOUCH_ERASE_BAR_LAYOUT.borderRadius
      )
    };
  }

  function normalizeInteractiveElementRules(value) {
    if (!value) return [];

    const sources = Array.isArray(value) ? value : [value];
    return sources
      .map(source => {
        if (typeof source === 'string') {
          return {
            selector: source,
            behavior: 'tap-native-drag-select',
            onActivate: null
          };
        }

        if (!source || typeof source !== 'object' || typeof source.selector !== 'string') {
          return null;
        }

        const behavior = [
          'native',
          'tap-native-drag-select',
          'tap-delegate-drag-select'
        ].includes(source.behavior)
          ? source.behavior
          : 'tap-native-drag-select';

        return {
          selector: source.selector,
          behavior,
          onActivate: typeof source.onActivate === 'function' ? source.onActivate : null
        };
      })
      .filter(rule => rule?.selector.trim());
  }

  /*
    One page-level manager owns the optional Select/Deselect bar. Instances only
    register their capabilities and visibility; the manager decides whether the
    shared control should be present and routes touch erase gestures to the
    selectable element under the pointer.
  */
  class TouchEraseBarManager {
    constructor() {
      this.mode = 'select';
      this.visible = false;
      this.activeSession = null;
      this.host = null;
      this.shadowRoot = null;
      this.toggle = null;
      this.buttons = [];
      this.mediaQueries = new Map();
      this.bodyClassNames = new Set(['has-airbrush-touch-erase-bar']);
      this.subscribers = new Set();
      this.lastPublishedState = '';

      this.sync = this.sync.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerEnd = this.handlePointerEnd.bind(this);

      window.addEventListener('resize', this.sync);
      window.addEventListener('scroll', this.sync, true);
      window.visualViewport?.addEventListener('resize', this.sync);
      window.visualViewport?.addEventListener('scroll', this.sync);
      document.addEventListener('pointerdown', this.handlePointerDown, true);
      document.addEventListener('pointermove', this.handlePointerMove, true);
      document.addEventListener('pointerup', this.handlePointerEnd, true);
      document.addEventListener('pointercancel', this.handlePointerEnd, true);
    }

    register(instance) {
      if (instance?._usesTouchEraseBar()) this.ensureHost();
      this.sync();
      queueMicrotask(this.sync);
    }

    ensureHost() {
      if (this.host) return;

      this.host = document.createElement('div');
      this.host.className = 'airbrush-touch-erase-bar-host';
      this.host.dataset.airbrushTouchEraseBar = 'true';
      this.host.setAttribute('aria-hidden', 'true');
      this.host.hidden = true;
      this.host.addEventListener('pointerdown', event => event.stopPropagation());
      this.host.addEventListener('mousedown', event => event.stopPropagation());
      this.host.addEventListener('click', event => event.stopPropagation());

      this.shadowRoot = this.host.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            position: fixed;
            z-index: var(--airbrush-touch-erase-z-index);
            overflow: hidden;
            border: 0;
            border-bottom: 1px solid var(--airbrush-touch-erase-border);
            border-radius: var(--airbrush-touch-erase-radius, 0);
            background: var(--airbrush-touch-erase-background);
            backdrop-filter: var(--airbrush-touch-erase-backdrop);
            opacity: 0;
            pointer-events: none;
            transform: translateY(-100%);
            transition: opacity 180ms ease, transform 180ms ease;
            box-sizing: border-box;
            font: inherit;
          }

          :host(.is-placement-bottom) {
            border-top: 1px solid var(--airbrush-touch-erase-border);
            border-bottom: 0;
            transform: translateY(100%);
          }

          :host(.is-placement-floating) {
            border: 1px solid var(--airbrush-touch-erase-border);
            transform: translateY(8px) scale(0.98);
          }

          :host(.is-visible) {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
          }

          :host(.is-visible.is-placement-floating) {
            transform: translateY(0) scale(1);
          }

          :host([hidden]) {
            display: none !important;
          }

          .airbrush-touch-erase-toggle {
            position: relative;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
            max-width: 100%;
            min-width: 0;
            padding: 2px;
            background: var(--airbrush-touch-erase-track);
            box-sizing: border-box;
          }

          .airbrush-touch-erase-toggle::before {
            content: "";
            position: absolute;
            top: 2px;
            bottom: 2px;
            left: 2px;
            width: calc(50% - 2px);
            background: var(--airbrush-touch-erase-active);
            transform: translateX(calc(var(--active-index, 0) * 100%));
            transition: transform 160ms ease, background 160ms ease;
          }

          :host(.is-erase) .airbrush-touch-erase-toggle::before {
            background: var(--airbrush-touch-erase-active-erase);
          }

          button {
            appearance: none;
            border: 0;
            position: relative;
            z-index: 1;
            min-width: 0;
            padding: 0.58rem 0.8rem;
            background: transparent;
            color: var(--airbrush-touch-erase-text);
            font: inherit;
            font-size: 0.92rem;
            font-weight: 800;
            cursor: pointer;
            transition: color 140ms ease;
          }

          button.is-active {
            color: var(--airbrush-touch-erase-active-text);
          }
        </style>
        <div class="airbrush-touch-erase-toggle" role="group">
          <button type="button" class="is-active" data-mode="select" aria-pressed="true">Select</button>
          <button type="button" data-mode="erase" aria-pressed="false">Deselect</button>
        </div>
      `;

      this.toggle = this.shadowRoot.querySelector('.airbrush-touch-erase-toggle');
      this.buttons = [...this.shadowRoot.querySelectorAll('[data-mode]')];
      this.buttons.forEach(button => {
        button.addEventListener('click', () => this.setMode(button.dataset.mode));
      });

      document.body.appendChild(this.host);
    }

    getEnabledInstances() {
      return GLOBAL_STATE.instances.filter(instance => instance._usesTouchEraseControl());
    }

    getBarInstances(instances = this.getEnabledInstances()) {
      return instances.filter(instance => instance._usesTouchEraseBar());
    }

    getFirstConfig(instances = this.getBarInstances()) {
      return instances
        .map(instance => instance._getTouchEraseBarConfig())
        .find(Boolean) || normalizeTouchEraseBarConfig(true);
    }

    supportsUi(config) {
      const query = this.getMediaQuery(config.mediaQuery);
      return Boolean(query.matches && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
    }

    getMediaQuery(queryText) {
      if (!this.mediaQueries.has(queryText)) {
        const query = window.matchMedia(queryText);
        this.mediaQueries.set(queryText, query);
        query.addEventListener?.('change', this.sync);
      }

      return this.mediaQueries.get(queryText);
    }

    isInstanceVisible(instance) {
      const rect = instance.el.getBoundingClientRect();
      const viewport = getVisualViewportMetrics();
      const visibleWidth = Math.min(rect.right, viewport.left + viewport.width) - Math.max(rect.left, viewport.left);
      const visibleHeight = Math.min(rect.bottom, viewport.top + viewport.height) - Math.max(rect.top, viewport.top);

      return visibleWidth > 24 && visibleHeight > 24;
    }

    hasAnyEraseTarget(instances) {
      return instances.some(instance => instance._hasAnyEraseTarget());
    }

    applyConfig(config) {
      if (!this.host) return;

      const theme = config.theme;
      this.host.style.setProperty('--airbrush-touch-erase-background', theme.background);
      this.host.style.setProperty('--airbrush-touch-erase-border', theme.borderColor);
      this.host.style.setProperty('--airbrush-touch-erase-track', theme.trackBackground);
      this.host.style.setProperty('--airbrush-touch-erase-active', theme.activeBackground);
      this.host.style.setProperty('--airbrush-touch-erase-active-erase', theme.eraseActiveBackground);
      this.host.style.setProperty('--airbrush-touch-erase-text', theme.textColor);
      this.host.style.setProperty('--airbrush-touch-erase-active-text', theme.activeTextColor);
      this.host.style.setProperty('--airbrush-touch-erase-z-index', theme.zIndex);
      this.host.style.setProperty('--airbrush-touch-erase-backdrop', theme.backdropFilter);
      this.applyLayout(config.layout);
      this.toggle.setAttribute('aria-label', config.ariaLabel);
      this.buttons[0].textContent = config.labels.select;
      this.buttons[1].textContent = config.labels.erase;
      this.bodyClassNames.add(config.bodyClassName);

      const classTokens = String(config.className || '').split(/\s+/).filter(Boolean);
      this.host.className = ['airbrush-touch-erase-bar-host', ...classTokens].join(' ');
      this.host.classList.toggle('is-placement-bottom', config.layout.placement === 'bottom');
      this.host.classList.toggle('is-placement-floating', config.layout.placement === 'floating');
      this.host.classList.toggle('is-visible', this.visible);
      this.host.classList.toggle('is-erase', this.mode === 'erase');
    }

    applyLayout(layout) {
      if (!this.host) return;

      const { placement, offset, inlineInset, align, width, maxWidth, borderRadius } = layout;
      const style = this.host.style;
      const viewport = getVisualViewportMetrics();
      const safeTop = 'env(safe-area-inset-top, 0px)';
      const safeRight = 'env(safe-area-inset-right, 0px)';
      const safeBottom = 'env(safe-area-inset-bottom, 0px)';
      const safeLeft = 'env(safe-area-inset-left, 0px)';
      const inlineStart = value => addCssLengths(`${viewport.left}px`, value, safeLeft);
      const inlineEnd = value => addCssLengths(`${viewport.rightInset}px`, value, safeRight);
      style.top = 'auto';
      style.right = 'auto';
      style.bottom = 'auto';
      style.left = 'auto';
      style.marginLeft = '0px';
      style.marginRight = '0px';
      style.width = width;
      style.maxWidth = maxWidth;
      style.setProperty('--airbrush-touch-erase-radius', borderRadius);
      style.setProperty('--airbrush-visual-viewport-width', `${viewport.width}px`);

      if (placement === 'floating') {
        style.top = offset.top ? addCssLengths(`${viewport.top}px`, offset.top, safeTop) : 'auto';
        style.right = offset.right ? inlineEnd(offset.right) : 'auto';
        style.bottom = offset.bottom ? addCssLengths(`${viewport.bottomInset}px`, offset.bottom, safeBottom) : 'auto';
        style.left = offset.left ? inlineStart(offset.left) : 'auto';
        return;
      }

      if (placement === 'top') {
        style.top = addCssLengths(`${viewport.top}px`, offset.top || '0px', safeTop);
      }
      if (placement === 'bottom') {
        style.bottom = addCssLengths(`${viewport.bottomInset}px`, offset.bottom || '0px', safeBottom);
      }

      if (align === 'start') {
        style.left = inlineStart(offset.left || inlineInset);
        return;
      }

      if (align === 'end') {
        style.right = inlineEnd(offset.right || inlineInset);
        return;
      }

      const leftInset = offset.left || inlineInset;
      const rightInset = offset.right || inlineInset;
      style.left = inlineStart(leftInset);
      style.right = inlineEnd(rightInset);

      if (width === 'auto') {
        style.right = 'auto';
        style.width = `calc(${viewport.width}px - (${leftInset}) - (${rightInset}) - ${safeLeft} - ${safeRight})`;
      }

      if (align === 'center') {
        style.marginLeft = 'auto';
        style.marginRight = 'auto';
        if (width === 'auto') style.width = '100%';
      }
    }

    sync() {
      // Visibility depends on configured media queries, whether a registered
      // instance is currently on screen, and optionally whether it has an erase
      // target. Keeping that policy here avoids each instance fighting the bar.
      const instances = this.getEnabledInstances();
      if (!instances.length) {
        this.mode = 'select';
        this.setVisible(false, null, false);
        this.renderMode();
        return;
      }

      const barInstances = this.getBarInstances(instances);
      const config = barInstances.length ? this.getFirstConfig(barInstances) : null;
      const relevantInstances = config?.alwaysVisible
        ? barInstances.filter(instance => instance.el?.isConnected)
        : barInstances.filter(instance => this.isInstanceVisible(instance));
      const shouldShow = Boolean(
        this.host &&
        config &&
        this.supportsUi(config) &&
        relevantInstances.length
      );

      if (config) this.applyConfig(config);

      if (this.mode === 'erase' && this.requiresSelection(instances, config) && !this.hasAnyEraseTarget(instances)) {
        this.mode = 'select';
      }

      const hasExternalControl = instances.some(instance => instance._usesExternalTouchEraseControl());
      this.setVisible(shouldShow, config, !hasExternalControl);
      this.renderMode();
    }

    requiresSelection(instances, barConfig = null) {
      if (barConfig?.requireSelection) return true;

      return instances.some(instance => instance._getTouchEraseControlConfig()?.requireSelection);
    }

    setVisible(visible, config, resetModeWhenHidden = true) {
      this.visible = Boolean(visible);

      if (!this.host) return;

      if (!this.visible && resetModeWhenHidden && this.mode !== 'select') {
        this.mode = 'select';
      }

      this.host.hidden = !this.visible;
      this.host.classList.toggle('is-visible', this.visible);
      this.host.setAttribute('aria-hidden', this.visible ? 'false' : 'true');

      for (const bodyClassName of this.bodyClassNames) {
        document.body.classList.remove(bodyClassName);
      }

      if (this.visible) {
        document.body.classList.add(config?.bodyClassName || 'has-airbrush-touch-erase-bar');
      }

      this.publishState();
    }

    setMode(mode) {
      const nextMode = mode === 'erase' ? 'erase' : 'select';
      const instances = this.getEnabledInstances();
      const config = this.getFirstConfig(instances);

      this.mode = nextMode === 'erase' && this.requiresSelection(instances, config) && !this.hasAnyEraseTarget(instances)
        ? 'select'
        : nextMode;

      this.renderMode();
    }

    renderMode() {
      const eraseInputActive = this.mode === 'erase';

      for (const instance of this.getEnabledInstances()) {
        instance._setTouchEraseInputMode(eraseInputActive);
      }

      if (!this.host || !this.toggle) {
        this.publishState();
        return;
      }

      this.host.classList.toggle('is-erase', this.mode === 'erase');
      this.toggle.style.setProperty('--active-index', this.mode === 'erase' ? '1' : '0');

      for (const button of this.buttons) {
        const active = button.dataset.mode === this.mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }

      this.publishState();
    }

    getState() {
      const instances = this.getEnabledInstances();

      return {
        mode: this.mode,
        visible: this.visible,
        enabled: instances.length > 0,
        canErase: this.hasAnyEraseTarget(instances)
      };
    }

    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};

      this.subscribers.add(listener);
      listener(this.getState());
      return () => this.subscribers.delete(listener);
    }

    publishState() {
      const state = this.getState();
      const signature = JSON.stringify(state);
      if (signature === this.lastPublishedState) return;

      this.lastPublishedState = signature;
      for (const listener of this.subscribers) {
        try {
          listener({ ...state });
        } catch (error) {
          // A custom control must not interrupt selection input.
        }
      }
    }

    findTargetInstance(clientX, clientY) {
      // Touch events originate on the fixed bar, not the content. Resolve the
      // destination from viewport geometry and let the chosen instance translate
      // the synthetic gesture into its own local coordinates.
      const candidates = this.getEnabledInstances()
        .map(instance => {
          const rect = instance.el.getBoundingClientRect();
          const padding = Number(instance.opts.externalVirtualPadding) || 0;
          const inside =
            clientX >= rect.left - padding &&
            clientX <= rect.right + padding &&
            clientY >= rect.top - padding &&
            clientY <= rect.bottom + padding;

          if (!inside) return null;

          return {
            instance,
            distance: instance._getClientRectDistance(clientX, clientY, rect),
            startedInsideActualBounds: instance._containsClientPointInActualBounds(clientX, clientY)
          };
        })
        .filter(Boolean);

      if (!candidates.length) return null;

      candidates.sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return compareElementsInDom(left.instance.el, right.instance.el);
      });

      return candidates[0];
    }

    cancelPendingStarts(pointerId) {
      for (const instance of GLOBAL_STATE.instances) {
        if (!instance.isPointerDown || instance.pointerId !== pointerId) continue;

        if (instance.isDrawing) {
          instance._end({ pointerId });
        } else {
          instance._cancelPendingPointer();
        }
      }
    }

    handlePointerDown(event) {
      if (this.mode !== 'erase' || event.pointerType !== 'touch') return;
      if (this.host && event.composedPath?.().includes(this.host)) return;

      const match = this.findTargetInstance(event.clientX, event.clientY);
      if (!match) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      this.cancelPendingStarts(event.pointerId);
      match.instance._startTouchErase(event, !match.startedInsideActualBounds);

      if (!match.instance.isPointerDown || match.instance.pointerId !== event.pointerId) {
        return;
      }

      this.activeSession = {
        instance: match.instance,
        pointerId: event.pointerId
      };
    }

    handlePointerMove(event) {
      const session = this.activeSession;
      if (!session || event.pointerType !== 'touch' || event.pointerId !== session.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
    }

    handlePointerEnd(event) {
      const session = this.activeSession;
      if (!session || event.pointerType !== 'touch' || event.pointerId !== session.pointerId) return;

      this.activeSession = null;
      this.setMode('select');
    }
  }

  /*
    Instance model

    Each attached element owns:
    - a fragment list derived from rendered text geometry
    - a fog canvas plus finalized cloud rendering
    - zero or more finalized selection groups

    Selection groups are local to the element for rendering, but may also be
    reflected into a shared registry so copy ordering works across instances.
  */
  class CleanSelection {

    static attach(element, opts = {}) {
      const instance = new CleanSelection(element, opts);
      GLOBAL_STATE.instances.push(instance);
      return instance;
    }

    constructor(element, opts) {
      this.el = element;
      // Mouse and touch need different activation behavior. Mouse can start
      // selection immediately after a small move; touch must first prove that
      // the gesture is selection intent rather than page scroll.
      this.opts = Object.assign({
        radius: 24,
        hardness: 0.35,
        maxAlpha: 0.18,
        spacing: 0.35,
        turbulence: 0.25,
        turbulenceSpeed: 0.6,
        color: [30, 144, 255],
        copiedColor: null,
        copiedColorMorphSpeed: 0.06,
        eraseColor: [255, 255, 255],
        finalAlpha: 0.34,
        fadeSpeed: 0.035,
        finalGrowSpeed: 0.04,
        finalPaddingRatio: 0.3,
        detectTolerance: 10,
        movementThreshold: 6,
        touchActivationDistance: 14,
        touchMaxAngle: 38,
        overflowPadding: null,
        externalVirtualPadding: 0,
        cursor: null,
        preventSelection: true,
        observeResize: true,
        multiSelect: false,
        // null follows the mode default: durable for multiselect, destructive
        // for ordinary single selections. Set explicitly to override either mode.
        preserveSelectionsOnResize: null,
        mergeSelections: true,
        allowErase: false,
        strokeMergeTime: 320,
        strokeMergeTolerance: null,
        strokeMergeDomGap: 18,
        includeCompleteWords: false,
        continuousOnly: false,
        dismissSpeed: 0.08,
        popupOffset: 24,
        androidChromePopupExtraOffset: 12,
        centerPopup: false,
        showTextPreview: true,
        hidePopupsOnSelectionStart: false,
        // popupRenderer can be either:
        // - function(context) => HTMLElement | { element, update?, destroy? }
        // - { create(context), update?(element, context), destroy?(element, context) }
        // The core owns popup positioning; consumers own structure, actions, and styling.
        popupRenderer: null,
        autoClose: false,
        wrapper: null,
        registry: null,
        popupClassName: '',
        // Rules can preserve native controls or defer a link tap while still
        // allowing a deliberate drag to select its text.
        interactiveElements: false,
        // Enables touch erase for a custom mode controller without requiring
        // the built-in bar to be rendered.
        touchEraseControl: false,
        touchEraseBar: false,
        hasEraseTarget: null,
        onErasePoint: null,
        debug: false
      }, opts);

      // Pointer and stroke fields are transient per gesture. Selection groups
      // remain durable until copied, cancelled, erased, or rebuilt after reflow.
      this.instanceId = GLOBAL_STATE.nextInstanceId++;
      this.registryState = ensureRegistryState(this.opts.registry);
      this.fragments = [];
      this.pointerId = null;
      this.pointerType = '';
      this.pointerButton = 0;
      this.isPointerDown = false;
      this.isDrawing = false;
      this.strokeMode = 'add';
      this.startPoint = null;
      this.lastPoint = null;
      this.releasePoint = null;
      this.strokeDistance = 0;
      this.touchIntentDirection = 0;
      this.touchIntentHorizontalStreak = 0;
      this.time = 0;
      this.coveredFragments = new Set();
      this.fragmentScores = new Map();
      this.validFragments = new Set();
      this.strokeSamples = [];
      this.strokeBounds = null;
      this.fogFadeFramesRemaining = 0;
      this.selectionGroups = [];
      this.selectionOrderCounter = 0;
      this.currentSelection = null;
      this.localSelectionSerial = 0;
      this.refreshPending = false;
      this.isMeasuring = false;
      this.forceOwnExternalStart = false;
      this.contentWidth = 0;
      this.contentHeight = 0;
      this.suppressContextMenuUntil = 0;
      this.renderPadding = 0;
      this.externalPadding = 0;
      this.padding = 0;
      this.selectTouchAction = '';
      this.touchEraseInputActive = false;
      this.interactiveGesture = null;
      this.suppressedInteractiveClick = null;
      this.interactiveActivationBypass = new WeakSet();
      this.ownsCursorStyle = false;
      this.destroyed = false;
      this.animationFrame = 0;
      this.originalStyles = {
        position: this.el.style.position,
        touchAction: this.el.style.touchAction,
        userSelect: this.el.style.userSelect,
        webkitUserSelect: this.el.style.webkitUserSelect,
        cursor: this.el.style.cursor
      };
      this._refreshCanvasPadding();

      this._render = this._render.bind(this);

      this._setupCanvases();
      this._collectFragments();
      this._bindEvents();
      if (this.opts.observeResize) this._observe();
      this._syncTouchEraseBarRegistration();
      this.animationFrame = requestAnimationFrame(this._render);
    }

    /* ---------- Canvas ---------- */

    _setupCanvases() {
      // The visible canvas holds finalized selections. The detached fog canvas
      // accumulates the current airbrush stroke and doubles as the alpha mask
      // used by hit testing; the interaction surface extends pointer reach only.
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.fogCanvas = document.createElement('canvas');
      this.fogCtx = this.fogCanvas.getContext('2d');
      this.interactionSurface = document.createElement('div');
      this.interactionSurface.className = 'airbrush-interaction-surface';
      this.interactionSurfaceStrips = [];

      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.left = `${-this.padding}px`;
      this.canvas.style.top = `${-this.padding}px`;
      this.canvas.style.zIndex = '9999';
      this.canvas.style.setProperty('display', 'block', 'important');
      this.canvas.style.setProperty('margin', '0', 'important');
      this.canvas.style.setProperty('padding', '0', 'important');
      this.canvas.style.setProperty('border', '0', 'important');
      this.canvas.style.setProperty('box-sizing', 'content-box', 'important');
      this.canvas.style.setProperty('max-width', 'none', 'important');
      this.canvas.style.userSelect = 'none';
      this.interactionSurface.style.position = 'absolute';
      this.interactionSurface.style.pointerEvents = 'none';
      this.interactionSurface.style.zIndex = '9998';
      this.interactionSurface.style.setProperty('margin', '0', 'important');
      this.interactionSurface.style.setProperty('padding', '0', 'important');
      this.interactionSurface.style.setProperty('border', '0', 'important');
      this.interactionSurface.style.setProperty('box-sizing', 'content-box', 'important');
      this.interactionSurface.style.setProperty('max-width', 'none', 'important');
      this.interactionSurface.style.userSelect = 'none';
      this.interactionSurface.style.webkitUserSelect = 'none';
      this.interactionSurface.style.background = 'transparent';

      for (let index = 0; index < 4; index++) {
        const strip = document.createElement('div');
        strip.className = `airbrush-interaction-strip airbrush-interaction-strip--${index}`;
        strip.style.position = 'absolute';
        strip.style.background = 'transparent';
        strip.style.pointerEvents = 'auto';
        strip.style.touchAction = 'pan-y';
        strip.style.userSelect = 'none';
        strip.style.webkitUserSelect = 'none';
        this.interactionSurface.appendChild(strip);
        this.interactionSurfaceStrips.push(strip);
      }

      this._resizeCanvases();

      this.el.style.position ||= 'relative';
      this.selectTouchAction = this.el.style.touchAction || 'pan-y';
      this.el.style.touchAction = this.selectTouchAction;
      this.el.appendChild(this.interactionSurface);
      this.el.appendChild(this.canvas);
      this._setTouchEraseInputMode(false);
      this._applyRestingInteractionStyles();
    }

    _getConfiguredExternalPadding() {
      const value = Number(this.opts.externalVirtualPadding);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    _hasExternalVirtualPadding() {
      return this.externalPadding > 0;
    }

    _getRenderPadding() {
      return Math.max(
        this.opts.radius * this.opts.finalPaddingRatio,
        this.opts.overflowPadding ?? this.opts.radius * 0.75
      );
    }

    _refreshCanvasPadding() {
      this.renderPadding = this._getRenderPadding();
      this.externalPadding = this._getConfiguredExternalPadding();
      this.padding = this.renderPadding + this.externalPadding;
    }

    _measureContentSize() {
      const attachedChildren = [];

      if (this.interactionSurface && this.interactionSurface.parentNode === this.el) {
        attachedChildren.push(this.interactionSurface);
      }

      if (this.canvas && this.canvas.parentNode === this.el) {
        attachedChildren.push(this.canvas);
      }

      if (attachedChildren.length) {
        // Measuring with the overlay attached creates a feedback loop because the
        // overlay layers themselves contribute to scroll size. Measure "naked",
        // then restore the interaction surface and canvas in order.
        this.isMeasuring = true;
        for (const child of attachedChildren) {
          this.el.removeChild(child);
        }
      }

      const width = Math.ceil(this.el.scrollWidth);
      const height = Math.ceil(this.el.scrollHeight);

      if (attachedChildren.length) {
        for (const child of attachedChildren) {
          this.el.appendChild(child);
        }
        this.isMeasuring = false;
      }

      this.contentWidth = width;
      this.contentHeight = height;

      return { width, height };
    }

    _resizeCanvases() {
      // Canvas dimensions include render overflow and optional virtual input
      // padding. All fragment and brush coordinates remain content-relative and
      // are shifted by the same shared padding when drawn.
      const content = this._measureContentSize();
      const width = Math.ceil(content.width + this.padding * 2);
      const height = Math.ceil(content.height + this.padding * 2);

      if (width === this.canvas.width && height === this.canvas.height) {
        return;
      }

      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      this.fogCanvas.width = width;
      this.fogCanvas.height = height;

      this._updateInteractionSurface();
    }

    _updateInteractionSurface() {
      // Four thin strips cover only the virtual band around content. A single
      // full overlay would intercept links and other native controls inside it.
      if (!this.interactionSurface) {
        return;
      }

      const externalPadding = this.externalPadding;

      if (!externalPadding) {
        this.interactionSurface.style.display = 'none';
        return;
      }

      this.interactionSurface.style.display = 'block';
      this.interactionSurface.style.left = `${-externalPadding}px`;
      this.interactionSurface.style.top = `${-externalPadding}px`;
      this.interactionSurface.style.width = `${this.contentWidth + externalPadding * 2}px`;
      this.interactionSurface.style.height = `${this.contentHeight + externalPadding * 2}px`;

      const [topStrip, rightStrip, bottomStrip, leftStrip] = this.interactionSurfaceStrips;

      if (topStrip) {
        topStrip.style.left = '0px';
        topStrip.style.top = '0px';
        topStrip.style.width = '100%';
        topStrip.style.height = `${externalPadding}px`;
      }

      if (rightStrip) {
        rightStrip.style.left = `${this.contentWidth + externalPadding}px`;
        rightStrip.style.top = `${externalPadding}px`;
        rightStrip.style.width = `${externalPadding}px`;
        rightStrip.style.height = `${this.contentHeight}px`;
      }

      if (bottomStrip) {
        bottomStrip.style.left = '0px';
        bottomStrip.style.top = `${this.contentHeight + externalPadding}px`;
        bottomStrip.style.width = '100%';
        bottomStrip.style.height = `${externalPadding}px`;
      }

      if (leftStrip) {
        leftStrip.style.left = '0px';
        leftStrip.style.top = `${externalPadding}px`;
        leftStrip.style.width = `${externalPadding}px`;
        leftStrip.style.height = `${this.contentHeight}px`;
      }
    }

    _clearFog() {
      this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
      this.fogFadeFramesRemaining = 0;
    }

    _startFogFade() {
      const fadeSpeed = Number(this.opts.fadeSpeed);

      if (!Number.isFinite(fadeSpeed) || fadeSpeed <= 0) {
        this._clearFog();
        return;
      }

      this.fogFadeFramesRemaining = Math.max(
        this.fogFadeFramesRemaining,
        Math.ceil(4 / fadeSpeed)
      );
    }

    _getRestingUserSelectValue() {
      return (this.opts.preventSelection || this._canUseErase()) ? 'none' : '';
    }

    _applyRestingInteractionStyles() {
      const userSelect = this._getRestingUserSelectValue();
      this.el.style.userSelect = userSelect;
      this.el.style.webkitUserSelect = userSelect;
      this._applyCursorStyle();
    }

    _applyCursorStyle() {
      const cursor = typeof this.opts.cursor === 'string'
        ? this.opts.cursor.trim()
        : '';

      if (cursor) {
        this.el.style.cursor = cursor;
        this.ownsCursorStyle = true;
        return;
      }

      if (this.ownsCursorStyle) {
        this.el.style.cursor = this.originalStyles.cursor;
        this.ownsCursorStyle = false;
      }
    }

    _setTouchEraseInputMode(active) {
      this.touchEraseInputActive = Boolean(active);
      this.el.style.touchAction = this.touchEraseInputActive
        ? 'none'
        : this.selectTouchAction;

      for (const strip of this.interactionSurfaceStrips) {
        strip.style.touchAction = this.touchEraseInputActive ? 'none' : 'pan-y';
      }
    }

    _resetStrokeState() {
      this.coveredFragments.clear();
      this.fragmentScores.clear();
      this.validFragments.clear();
      this.strokeSamples = [];
      this.strokeBounds = null;
      this.releasePoint = null;
    }

    _clearSelectionState() {
      this._resetStrokeState();

      for (const selection of [...this.selectionGroups]) {
        this._removeSelection(selection);
      }

      this.currentSelection = null;
    }

    _shouldPreserveSelectionsOnResize() {
      return this.opts.preserveSelectionsOnResize == null
        ? Boolean(this.opts.multiSelect)
        : Boolean(this.opts.preserveSelectionsOnResize);
    }

    _buildSelectionTextRuns(selection) {
      // Reflow snapshots retain text-node identity and exact offsets rather than
      // pixel rectangles. If the DOM text is unchanged, geometry can be safely
      // rebuilt for a new line wrap without changing clipboard semantics.
      const fragments = (selection?.fragmentIndices || [])
        .map(index => this.fragments[index])
        .filter(fragment =>
          fragment?.node &&
          Number.isFinite(fragment.startOffset) &&
          Number.isFinite(fragment.endOffset)
        )
        .sort((left, right) => left.index - right.index);
      const runs = [];

      for (const fragment of fragments) {
        const nodeValue = fragment.node.nodeValue || '';
        const previous = runs[runs.length - 1];
        const gap = previous?.node === fragment.node
          ? nodeValue.slice(previous.endOffset, fragment.startOffset)
          : null;
        const joinsPrevious = previous &&
          previous.node === fragment.node &&
          (
            fragment.startOffset <= previous.endOffset ||
            (gap !== null && /^\s*$/u.test(gap))
          );

        if (joinsPrevious) {
          previous.endOffset = Math.max(previous.endOffset, fragment.endOffset);
          previous.exact = nodeValue.slice(previous.startOffset, previous.endOffset);
          continue;
        }

        runs.push({
          node: fragment.node,
          startOffset: fragment.startOffset,
          endOffset: fragment.endOffset,
          exact: nodeValue.slice(fragment.startOffset, fragment.endOffset)
        });
      }

      return runs;
    }

    _resolveSelectionTextRuns(runs) {
      if (!Array.isArray(runs) || !runs.length) {
        return null;
      }

      const fragmentsByIndex = new Map();

      for (const run of runs) {
        const nodeValue = run.node?.nodeValue;

        if (
          typeof nodeValue !== 'string' ||
          !run.node.isConnected ||
          nodeValue.slice(run.startOffset, run.endOffset) !== run.exact
        ) {
          return null;
        }

        const matches = this.fragments.filter(fragment =>
          fragment.node === run.node &&
          fragment.endOffset > run.startOffset &&
          fragment.startOffset < run.endOffset
        );

        if (!matches.length && run.exact.trim()) {
          return null;
        }

        for (const fragment of matches) {
          fragmentsByIndex.set(fragment.index, fragment);
        }
      }

      return [...fragmentsByIndex.values()]
        .sort((left, right) => left.index - right.index);
    }

    _remapSelectionReleasePoint(releasePoint, previousBounds, nextBounds) {
      if (!releasePoint || !previousBounds || !nextBounds) {
        return releasePoint;
      }

      const width = Math.max(1, previousBounds.width);
      const height = Math.max(1, previousBounds.height);
      const xRatio = (releasePoint.x - previousBounds.x) / width;
      const yRatio = (releasePoint.y - previousBounds.y) / height;

      return {
        x: nextBounds.x + nextBounds.width * xRatio,
        y: nextBounds.y + nextBounds.height * yRatio
      };
    }

    _discardSelectionAfterReflow(selection) {
      if (!selection) return;

      this._clearPopupTimer(selection);
      this._setSelectionCopied(selection, false);
      this._hidePopup(selection);
      this._destroySelectionPopup(selection);
    }

    _snapshotSelectionsForReflow() {
      const selections = Array.isArray(this.selectionGroups)
        ? [...this.selectionGroups]
        : [];

      return {
        selections,
        previousCurrent: this.currentSelection,
        active: selections
          .filter(selection => selection && !selection.isDismissing)
          .map(selection => ({
            selection,
            textRuns: this._buildSelectionTextRuns(selection),
            text: selection.state?.textPreview ?? selection.text ?? '',
            bounds: selection.state?.bounds
              ? { ...selection.state.bounds }
              : (selection.bounds ? { ...selection.bounds } : null),
            releasePoint: selection.releasePoint ? { ...selection.releasePoint } : null,
            finalProgress: selection.finalProgress,
            finalVisibility: selection.finalVisibility
          }))
      };
    }

    _restoreSelectionsAfterReflow(snapshot) {
      for (const selection of snapshot.selections) {
        if (selection?.isDismissing) {
          this._discardSelectionAfterReflow(selection);
        }
      }

      const restored = [];

      for (const saved of snapshot.active) {
        const fragments = this._resolveSelectionTextRuns(saved.textRuns);

        if (!fragments?.length) {
          this._discardSelectionAfterReflow(saved.selection);
          continue;
        }

        const finalRects = this._buildFinalRects(fragments);
        const finalStamps = this._buildFinalStamps(fragments);
        const state = this._buildSelectionState(fragments, finalRects);

        if (!state) {
          this._discardSelectionAfterReflow(saved.selection);
          continue;
        }

        // Copy text is semantic selection state, so responsive line wrapping must
        // not alter it even though bounds, rectangles, and stamps are rebuilt.
        state.textPreview = saved.text;

        const selection = saved.selection;
        const previousProgress = Number(saved.finalProgress);
        const previousVisibility = Number(saved.finalVisibility);
        selection.fragmentIndices = [...state.fragmentIndices];
        selection.text = state.textPreview;
        selection.bounds = { ...state.bounds };
        selection.rects = state.rects.map(rect => ({ ...rect }));
        selection.finalRects = finalRects;
        selection.finalStamps = finalStamps;
        selection.finalProgress = finalStamps.length
          ? Math.min(1, Math.max(0, Number.isFinite(previousProgress) ? previousProgress : 1))
          : 1;
        selection.finalVisibility = finalStamps.length
          ? Math.min(1, Math.max(0, Number.isFinite(previousVisibility) ? previousVisibility : 1))
          : 0;
        selection.isDismissing = false;
        selection.releasePoint = this._remapSelectionReleasePoint(
          saved.releasePoint,
          saved.bounds,
          state.bounds
        );
        selection.state = state;
        restored.push(selection);
      }

      this.selectionGroups = restored;
      this.currentSelection = restored.includes(snapshot.previousCurrent)
        ? snapshot.previousCurrent
        : (restored[restored.length - 1] || null);

      this._syncRegistrySelections();
      this._positionAllPopups();
    }

    _scheduleRefresh() {
      // Coalesce ResizeObserver bursts into one measurement frame. Reflow either
      // remaps durable multiselections or deliberately clears single selections,
      // depending on preserveSelectionsOnResize.
      if (this.refreshPending) return;
      this.refreshPending = true;

      requestAnimationFrame(() => {
        if (this.destroyed) return;
        this.refreshPending = false;
        const selectionSnapshot = this._shouldPreserveSelectionsOnResize()
          ? this._snapshotSelectionsForReflow()
          : null;

        this._resetStrokeState();
        this._resizeCanvases();
        this._collectFragments();
        this._clearFog();

        if (selectionSnapshot) {
          this._restoreSelectionsAfterReflow(selectionSnapshot);
        } else {
          this._clearSelectionState();
        }
      });
    }

    _observe() {
      const readElementSize = () => {
        const rect = this.el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      };
      let previousSize = readElementSize();
      const refreshForElementResize = () => {
        if (this.isMeasuring) return;

        const nextSize = readElementSize();
        const sizeChanged =
          Math.abs(nextSize.width - previousSize.width) > 0.5 ||
          Math.abs(nextSize.height - previousSize.height) > 0.5;

        if (!sizeChanged) return;

        previousSize = nextSize;
        this._scheduleRefresh();
      };

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(refreshForElementResize);
        this.resizeObserver.observe(this.el);
      } else {
        // Modern mobile browsers resize the viewport when the onscreen keyboard
        // closes. Only use viewport resize as the layout-refresh fallback;
        // ResizeObserver already catches genuine selectable-element reflow.
        this.fallbackResizeListener = refreshForElementResize;
        window.addEventListener('resize', this.fallbackResizeListener);
      }
    }

    /* ---------- Text ---------- */

    _segmentText(text) {
      if ('Segmenter' in Intl) {
        return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
          .map(part => ({
            text: part.segment,
            startOffset: part.index,
            endOffset: part.index + part.segment.length
          }));
      }

      const segments = [];
      let cursor = 0;

      for (const grapheme of Array.from(text)) {
        segments.push({
          text: grapheme,
          startOffset: cursor,
          endOffset: cursor + grapheme.length
        });
        cursor += grapheme.length;
      }

      return segments;
    }

    _measureFragmentRect(range) {
      const clientRects = [...range.getClientRects()]
        .filter(rect => rect.width && rect.height);

      if (clientRects.length) {
        // Wrapped inline content can report a broad bounding rect that reaches
        // toward the line edge even when the grapheme itself is much narrower.
        // For per-grapheme geometry, the tightest client rect is the safer
        // source of truth for both hit-testing and final cloud rendering.
        const bestRect = clientRects.reduce((best, rect) => {
          if (!best) {
            return rect;
          }

          const bestArea = best.width * best.height;
          const rectArea = rect.width * rect.height;

          if (
            rectArea < bestArea ||
            (rectArea === bestArea && rect.width < best.width)
          ) {
            return rect;
          }

          return best;
        }, null);

        return bestRect
          ? {
            left: bestRect.left,
            top: bestRect.top,
            width: bestRect.width,
            height: bestRect.height
          }
          : null;
      }

      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return null;
      }

      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
    }

    _collectFragments() {
      this.fragments = [];

      // Selection is built from rendered grapheme boxes, not words or text nodes.
      // That keeps hit-testing aligned with visible text and wrapped lines.
      const baseRect = this.el.getBoundingClientRect();
      const walker = document.createTreeWalker(
        this.el,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: node => this._isSelectableTextNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT
        }
      );

      let node;
      let index = 0;

      while ((node = walker.nextNode())) {
        const range = document.createRange();
        const segments = this._segmentText(node.nodeValue);

        for (const segment of segments) {
          range.setStart(node, segment.startOffset);
          range.setEnd(node, segment.endOffset);

          const rect = this._measureFragmentRect(range);
          if (!rect) continue;

          const x = rect.left - baseRect.left + this.el.scrollLeft;
          const y = rect.top - baseRect.top + this.el.scrollTop;

          this.fragments.push({
            index,
            node,
            x,
            y,
            width: rect.width,
            height: rect.height,
            centerX: x + rect.width / 2,
            centerY: y + rect.height / 2,
            text: segment.text,
            startOffset: segment.startOffset,
            endOffset: segment.endOffset
          });

          index += 1;
        }

        range.detach?.();
      }
    }

    _isSelectableTextNode(node) {
      if (!node || !node.nodeValue) {
        return false;
      }

      const parent = node.parentElement;
      if (!parent) {
        return false;
      }

      if (parent.closest('script, style, noscript, svg, canvas')) {
        return false;
      }

      const style = window.getComputedStyle(parent);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        return false;
      }

      return true;
    }

    /* ---------- Events ---------- */

    _bindEvents() {
      // Move/end handlers live on window so a stroke remains coherent after the
      // pointer leaves the element or starts in the external virtual band.
      this.boundEvents = {
        elementPointerDown: event => this._start(event),
        windowPointerDown: event => this._start(event, true),
        contextMenu: event => this._handleContextMenu(event),
        click: event => this._handleInteractiveClick(event),
        dragStart: event => this._handleInteractiveDragStart(event),
        pointerMove: event => this._move(event),
        pointerEnd: event => this._end(event),
        positionPopups: () => this._positionAllPopups()
      };

      this.el.addEventListener('pointerdown', this.boundEvents.elementPointerDown, true);
      window.addEventListener('pointerdown', this.boundEvents.windowPointerDown, true);
      this.el.addEventListener('contextmenu', this.boundEvents.contextMenu, true);
      this.el.addEventListener('click', this.boundEvents.click, true);
      this.el.addEventListener('dragstart', this.boundEvents.dragStart, true);
      window.addEventListener('pointermove', this.boundEvents.pointerMove, true);
      window.addEventListener('pointerup', this.boundEvents.pointerEnd, true);
      window.addEventListener('pointercancel', this.boundEvents.pointerEnd, true);
      window.addEventListener('scroll', this.boundEvents.positionPopups, true);
      window.addEventListener('resize', this.boundEvents.positionPopups);
      window.visualViewport?.addEventListener('scroll', this.boundEvents.positionPopups);
      window.visualViewport?.addEventListener('resize', this.boundEvents.positionPopups);
    }

    _canUseErase() {
      return Boolean(this.opts.allowErase && this.opts.mergeSelections);
    }

    _getTouchEraseBarConfig() {
      return this._canUseErase()
        ? normalizeTouchEraseBarConfig(this.opts.touchEraseBar)
        : null;
    }

    _getTouchEraseControlConfig() {
      if (!this._canUseErase() || !this.opts.touchEraseControl) return null;

      const config = this.opts.touchEraseControl === true
        ? {}
        : this.opts.touchEraseControl;

      return {
        requireSelection: config?.requireSelection === true
      };
    }

    _usesTouchEraseControl() {
      return Boolean(this._getTouchEraseBarConfig() || this._getTouchEraseControlConfig());
    }

    _usesExternalTouchEraseControl() {
      return Boolean(this._getTouchEraseControlConfig());
    }

    _usesTouchEraseBar() {
      return Boolean(this._getTouchEraseBarConfig());
    }

    _getExternalErasePointContext(event, localPoint = null, phase = 'move') {
      return {
        event,
        phase,
        instance: this,
        clientX: event?.clientX ?? 0,
        clientY: event?.clientY ?? 0,
        localPoint: localPoint || (event ? this._getLocalPointFromClient(event.clientX, event.clientY) : null),
        radius: this.opts.radius,
        eraseRadius: this.opts.radius,
        selectionState: () => this.getSelectionState()
      };
    }

    _notifyExternalErasePoint(event, localPoint = null, phase = 'move') {
      if (!this._canUseErase() || this.strokeMode !== 'erase') {
        return false;
      }

      const callback = this.opts.onErasePoint;
      if (typeof callback !== 'function') {
        return false;
      }

      try {
        return Boolean(callback(this._getExternalErasePointContext(event, localPoint, phase)));
      } catch (error) {
        if (this.opts.debug) {
          console.error('airbrush external erase handler failed', error);
        }

        return false;
      }
    }

    _hasAnyEraseTarget() {
      if (typeof this.opts.hasEraseTarget === 'function') {
        try {
          if (this.opts.hasEraseTarget({ instance: this, selectionState: () => this.getSelectionState() })) {
            return true;
          }
        } catch (error) {
          if (this.opts.debug) {
            console.error('airbrush erase target check failed', error);
          }
        }
      }

      const state = this.getSelectionState();
      return Boolean(state?.selectionCount);
    }

    _syncTouchEraseBarRegistration() {
      if (!this._usesTouchEraseControl()) {
        this._setTouchEraseInputMode(false);
        GLOBAL_STATE.touchEraseBarManager?.sync();
        return;
      }

      if (!GLOBAL_STATE.touchEraseBarManager) {
        GLOBAL_STATE.touchEraseBarManager = new TouchEraseBarManager();
      }

      GLOBAL_STATE.touchEraseBarManager.register(this);
    }

    _isErasePointerEvent(event) {
      return Boolean(
        event &&
        event.pointerType === 'mouse' &&
        event.button === 2 &&
        this._canUseErase()
      );
    }

    _isEraseMode() {
      return this.strokeMode === 'erase' && this._canUseErase() && this.pointerType === 'mouse';
    }

    _handleContextMenu(event) {
      if (!this._canUseErase()) {
        return;
      }

      const now = performance.now();
      const shouldSuppress = this._isEraseMode() ||
        (this.pointerType === 'mouse' && this.pointerButton === 2) ||
        this.suppressContextMenuUntil > now;

      if (shouldSuppress) {
        event.preventDefault();
      }
    }

    _getInteractiveMatch(event) {
      // Interactive-element rules separate a tap from a drag: taps may remain
      // native or delegated, while a deliberate drag can still select their text.
      const rules = normalizeInteractiveElementRules(this.opts.interactiveElements);
      if (!rules.length || !event) return null;

      const path = typeof event.composedPath === 'function'
        ? event.composedPath()
        : [event.target];
      const origin = path.find(node => node instanceof Element && this.el.contains(node));
      if (!origin) return null;

      for (const rule of rules) {
        try {
          const element = origin.closest(rule.selector);
          if (element && this.el.contains(element)) return { rule, element };
        } catch (error) {
          if (this.opts.debug) {
            console.error('clean selection interactive selector failed', error);
          }
        }
      }

      return null;
    }

    _eventBelongsToElement(event, element) {
      if (!event || !element) return false;

      if (typeof event.composedPath === 'function' && event.composedPath().includes(element)) {
        return true;
      }

      return event.target instanceof Node && element.contains(event.target);
    }

    _handleInteractiveDragStart(event) {
      if (!this.interactiveGesture) return;
      if (!this._eventBelongsToElement(event, this.interactiveGesture.element)) return;

      event.preventDefault();
    }

    _handleInteractiveClick(event) {
      const suppressed = this.suppressedInteractiveClick;

      if (suppressed && suppressed.expiresAt <= performance.now()) {
        this.suppressedInteractiveClick = null;
      } else if (suppressed && this._eventBelongsToElement(event, suppressed.element)) {
        this.suppressedInteractiveClick = null;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }

      const match = this._getInteractiveMatch(event);
      if (!match || match.rule.behavior !== 'tap-delegate-drag-select') return;

      if (this.interactiveActivationBypass.has(match.element)) {
        this.interactiveActivationBypass.delete(match.element);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      let settled = false;
      const activate = () => {
        if (settled || !match.element.isConnected) return false;
        settled = true;
        this.interactiveActivationBypass.add(match.element);

        try {
          match.element.click();
          return true;
        } finally {
          queueMicrotask(() => this.interactiveActivationBypass.delete(match.element));
        }
      };
      const cancel = () => {
        settled = true;
      };

      try {
        match.rule.onActivate?.({
          instance: this,
          element: match.element,
          event,
          activate,
          cancel
        });
      } catch (error) {
        cancel();
        if (this.opts.debug) {
          console.error('clean selection interactive activation failed', error);
        }
      }
    }

    _start(e, allowExternalStart = false) {
      // Pointer-down records a candidate gesture only. Drawing begins later,
      // after mouse movement clears the threshold or touch intent is horizontal.
      if (this.isPointerDown) return;
      const isErasePointer = this._isErasePointerEvent(e);
      if (e.pointerType === 'mouse' && e.button !== 0 && !isErasePointer) return;

      const interactiveMatch = isErasePointer ? null : this._getInteractiveMatch(e);
      if (interactiveMatch?.rule.behavior === 'native') return;

      const p = this._getPoint(e, false, allowExternalStart ? 'external-start' : 'default');
      if (!p) return;

      this.pointerType = e.pointerType || 'mouse';

      this._applyRestingInteractionStyles();

      if (this.pointerType !== 'touch' && !interactiveMatch) {
        // Touch remains a normal vertical pan until _move() proves horizontal
        // selection intent. This also applies to starts in the virtual band.
        e.preventDefault();
      }

      this.pointerId = e.pointerId;
      this.isPointerDown = true;
      this.isDrawing = false;
      this.pointerButton = e.button ?? 0;
      this.strokeMode = isErasePointer ? 'erase' : 'add';
      this.startPoint = p;
      this.lastPoint = p;
      this.releasePoint = null;
      this.strokeDistance = 0;
      this.touchIntentDirection = 0;
      this.touchIntentHorizontalStreak = 0;
      this.interactiveGesture = interactiveMatch
        ? {
          ...interactiveMatch,
          pointerId: e.pointerId,
          activated: false
        }
        : null;

      if (isErasePointer) {
        this.suppressContextMenuUntil = performance.now() + 700;
        this._notifyExternalErasePoint(e, p, 'start');
      }
    }

    _startTouchErase(event, allowExternalStart = false) {
      const syntheticEvent = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        pointerType: 'mouse',
        button: 2,
        preventDefault() {},
        composedPath() {
          return [];
        }
      };

      this.forceOwnExternalStart = Boolean(allowExternalStart);

      try {
        this._start(syntheticEvent, allowExternalStart);
      } finally {
        this.forceOwnExternalStart = false;
      }
    }

    _beginDrawing() {
      // From this point the gesture owns pointer input and produces both a visual
      // fog trail and fragment coverage samples from the same stamped path.
      this.isDrawing = true;
      GLOBAL_STATE.active = true;
      this.strokeDistance = 0;
      this.lastPoint = this.startPoint;

      if (this.interactiveGesture) {
        this.interactiveGesture.activated = true;
        this.suppressedInteractiveClick = {
          element: this.interactiveGesture.element,
          expiresAt: performance.now() + 800
        };
      }

      if (this.opts.hidePopupsOnSelectionStart) {
        this._hideAllPopups({ cancelPending: true });
      }

      this._clearFog();
      this._resetStrokeState();
      // The first stamp matters: it anchors the stroke even if the user only
      // barely crosses the movement threshold before continuing.
      this._stamp(this.startPoint.x, this.startPoint.y);
      this._detect(this.startPoint.x, this.startPoint.y);

      this._applyCursorStyle();

      if (this.pointerId != null && this.el.setPointerCapture) {
        try {
          this.el.setPointerCapture(this.pointerId);
        } catch (error) {
          // Pointer capture is best-effort here.
        }
      }
    }

    _getTouchIntent(point) {
      if (!this.startPoint) return 'pending';

      const dx = point.x - this.startPoint.x;
      const dy = point.y - this.startPoint.y;
      const distance = Math.hypot(dx, dy);
      const maxAngle = Math.max(0, Math.min(89, Number(this.opts.touchMaxAngle) || 0));
      const previousPoint = this.lastPoint || this.startPoint;
      const stepDx = point.x - previousPoint.x;
      const stepDy = point.y - previousPoint.y;
      const stepDistance = Math.hypot(stepDx, stepDy);

      if (stepDistance >= 1) {
        const stepAngle = Math.atan2(Math.abs(stepDy), Math.max(1, Math.abs(stepDx))) * 180 / Math.PI;
        const stepDirection = Math.sign(stepDx);

        if (stepDirection && stepAngle <= maxAngle) {
          if (stepDirection === this.touchIntentDirection) {
            this.touchIntentHorizontalStreak += 1;
          } else {
            this.touchIntentDirection = stepDirection;
            this.touchIntentHorizontalStreak = 1;
          }
        } else {
          this.touchIntentDirection = 0;
          this.touchIntentHorizontalStreak = 0;
        }
      }

      if (distance <= this.opts.touchActivationDistance) {
        return 'pending';
      }

      const angle = Math.atan2(Math.abs(dy), Math.max(1, Math.abs(dx))) * 180 / Math.PI;
      if (angle > maxAngle) {
        return 'reject';
      }

      // A single sideways wobble must not claim a vertical page scroll. Overall
      // displacement and several recent segments must agree before selection starts.
      return this.touchIntentHorizontalStreak >= 3 ? 'activate' : 'pending';
    }

    _cancelPendingPointer() {
      // We only land here before drawing begins. Once the gesture looks like scroll,
      // clear our state and let the browser continue naturally.
      this.pointerId = null;
      this.pointerType = '';
      this.pointerButton = 0;
      this.isPointerDown = false;
      this.isDrawing = false;
      this.strokeMode = 'add';
      this.startPoint = null;
      this.lastPoint = null;
      this.releasePoint = null;
      this.strokeDistance = 0;
      this.touchIntentDirection = 0;
      this.touchIntentHorizontalStreak = 0;
      this.interactiveGesture = null;
      GLOBAL_STATE.active = false;
      this._applyRestingInteractionStyles();
    }

    _move(e) {
      if (!this.isPointerDown || e.pointerId !== this.pointerId) return;

      const p = this._getPoint(e, true);
      if (!p) return;

      if (!this.isDrawing) {
        const dist = Math.hypot(
          p.x - this.startPoint.x,
          p.y - this.startPoint.y
        );

        if (this.pointerType === 'touch') {
          const intent = this._getTouchIntent(p);

          if (intent === 'pending') {
            this.lastPoint = p;
            return;
          }

          if (intent === 'reject') {
            this._cancelPendingPointer();
            return;
          }
        } else if (dist <= this.opts.movementThreshold) {
          this.lastPoint = p;
          return;
        }

        this._beginDrawing();
      }

      if (this._isEraseMode()) {
        this._notifyExternalErasePoint(e, p, 'move');
      }

      e.preventDefault();
      this._stampAlong(this.lastPoint, p);
      this.lastPoint = p;
    }

    _end(e) {
      // Finalization converts transient coverage into a durable selection record;
      // releasing a pointer that never activated drawing is intentionally a no-op.
      if (!this.isPointerDown) return;
      if (e && e.pointerId != null && e.pointerId !== this.pointerId) return;

      const wasErase = this._isEraseMode();
      this.isPointerDown = false;

      if (this.pointerId != null && this.el.releasePointerCapture) {
        try {
          this.el.releasePointerCapture(this.pointerId);
        } catch (error) {
          // Pointer capture is best-effort here.
        }
      }

      if (this.isDrawing) {
        this.isDrawing = false;
        GLOBAL_STATE.active = false;
        this.releasePoint = this.lastPoint ? { ...this.lastPoint } : null;
        this._finalizeSelection();
        this._startFogFade();
      }

      this.lastPoint = null;
      this.startPoint = null;
      this.pointerId = null;
      this.pointerType = '';
      this.pointerButton = 0;
      this.strokeMode = 'add';
      this.touchIntentDirection = 0;
      this.touchIntentHorizontalStreak = 0;
      this.interactiveGesture = null;

      if (wasErase) {
        this.suppressContextMenuUntil = performance.now() + 700;
      }

      this._applyRestingInteractionStyles();
    }

    /* ---------- Geometry ---------- */

    // Geometry in this section is element-local. Viewport coordinates are only
    // used at event boundaries and are converted before brush or fragment work.

    _getContentBounds() {
      return {
        left: 0,
        top: 0,
        right: this.contentWidth,
        bottom: this.contentHeight
      };
    }

    _getGestureBounds() {
      if (!this._hasExternalVirtualPadding()) {
        return this._getContentBounds();
      }

      return {
        left: -this.externalPadding,
        top: -this.externalPadding,
        right: this.contentWidth + this.externalPadding,
        bottom: this.contentHeight + this.externalPadding
      };
    }

    _isPointInsideBounds(point, bounds) {
      return Boolean(
        point &&
        bounds &&
        point.x >= bounds.left &&
        point.y >= bounds.top &&
        point.x <= bounds.right &&
        point.y <= bounds.bottom
      );
    }

    _getLocalPointFromClient(clientX, clientY) {
      const rect = this.el.getBoundingClientRect();

      return {
        x: clientX - rect.left + this.el.scrollLeft,
        y: clientY - rect.top + this.el.scrollTop
      };
    }

    _getClientRectDistance(clientX, clientY, rect) {
      const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
      const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      return Math.hypot(dx, dy);
    }

    _isEventInsideAirbrushPopup(e) {
      if (!e?.composedPath) {
        return false;
      }

      return e.composedPath().some(node =>
        node instanceof HTMLElement &&
        node.dataset?.airbrushPopup === 'true'
      );
    }

    _containsClientPointInActualBounds(clientX, clientY) {
      const rect = this.el.getBoundingClientRect();

      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    }

    _canClaimExternalStartFromClientPoint(clientX, clientY) {
      if (!this._hasExternalVirtualPadding()) {
        return false;
      }

      const rect = this.el.getBoundingClientRect();

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return false;
      }

      return (
        clientX >= rect.left - this.externalPadding &&
        clientX <= rect.right + this.externalPadding &&
        clientY >= rect.top - this.externalPadding &&
        clientY <= rect.bottom + this.externalPadding
      );
    }

    _ownsExternalStart(e) {
      // Virtual padding can overlap between nearby instances. Ownership goes to
      // real content first, then the nearest eligible virtual band, with DOM order
      // as the stable final tie-breaker.
      if (this.forceOwnExternalStart) {
        return true;
      }

      if (this._isEventInsideAirbrushPopup(e)) {
        return false;
      }

      if (!this._canClaimExternalStartFromClientPoint(e.clientX, e.clientY)) {
        return false;
      }

      for (const instance of GLOBAL_STATE.instances) {
        if (instance._containsClientPointInActualBounds(e.clientX, e.clientY)) {
          return false;
        }
      }

      const candidates = GLOBAL_STATE.instances.filter(instance =>
        instance._canClaimExternalStartFromClientPoint(e.clientX, e.clientY)
      );

      if (!candidates.length) {
        return false;
      }

      candidates.sort((left, right) => {
        const leftRect = left.el.getBoundingClientRect();
        const rightRect = right.el.getBoundingClientRect();
        const leftDistance = left._getClientRectDistance(e.clientX, e.clientY, leftRect);
        const rightDistance = right._getClientRectDistance(e.clientX, e.clientY, rightRect);

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        const leftArea = leftRect.width * leftRect.height;
        const rightArea = rightRect.width * rightRect.height;

        if (leftArea !== rightArea) {
          return leftArea - rightArea;
        }

        return compareElementsInDom(left.el, right.el);
      });

      return candidates[0] === this;
    }

    _getPoint(e, clamp = false, mode = 'default') {
      if (mode === 'external-start') {
        if (!this._ownsExternalStart(e)) {
          return null;
        }
      }

      let { x, y } = this._getLocalPointFromClient(e.clientX, e.clientY);
      const actualBounds = this._getContentBounds();
      const gestureBounds = this._getGestureBounds();

      if (clamp) {
        x = Math.max(gestureBounds.left, Math.min(gestureBounds.right, x));
        y = Math.max(gestureBounds.top, Math.min(gestureBounds.bottom, y));
        return { x, y };
      }

      const point = { x, y };

      if (mode === 'external-start') {
        if (
          this._isPointInsideBounds(point, actualBounds) ||
          !this._isPointInsideBounds(point, gestureBounds)
        ) {
          return null;
        }

        return point;
      }

      if (!this._isPointInsideBounds(point, actualBounds)) {
        return null;
      }

      return point;
    }

    _stampAlong(a, b) {
      // Interpolate by brush-relative spacing so hit detection does not develop
      // holes when pointer events arrive slowly or are coalesced by the browser.
      const spacing = this.opts.radius * this.opts.spacing;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      const steps = Math.max(1, Math.ceil(dist / spacing));

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        this._stamp(x, y);
        this._detect(x, y);
        this.strokeDistance += spacing;
      }
    }

    /* ---------- Brush ---------- */

    _stamp(x, y) {
      // The same procedural stamp is recorded geometrically and painted into the
      // fog alpha mask. This keeps the preview, final resolver, and diagnostics in
      // agreement even though they consume different representations.
      const flow = this.strokeDistance * 0.04 + this.time * this.opts.turbulenceSpeed;
      const radius = this.opts.radius * (
        1 + Math.sin(flow * 0.9) * this.opts.turbulence * 0.18
      );
      const edge = Math.min(
        0.92,
        Math.max(
          0.18,
          this.opts.hardness + Math.cos(flow * 1.3) * this.opts.turbulence * 0.2
        )
      );
      this.strokeSamples.push({ x, y, radius });
      this._extendStrokeBounds(x, y, radius);
      const cx = x + this.padding;
      const cy = y + this.padding;
      const g = this.fogCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const brushColor = this._getActiveBrushColor();

      g.addColorStop(0, this._rgba(this.opts.maxAlpha * 0.92, brushColor));
      g.addColorStop(edge, this._rgba(this.opts.maxAlpha * 0.46, brushColor));
      g.addColorStop(1, this._rgba(0, brushColor));

      this.fogCtx.fillStyle = g;
      this.fogCtx.beginPath();
      this.fogCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.fogCtx.fill();
    }

    _detect(x, y) {
      // Broad-phase rectangle checks keep pointer-time work cheap; finalization
      // later performs the more expensive alpha-mask and line-continuity tests.
      const reach = this.opts.radius + this.opts.detectTolerance;
      const reachSq = reach * reach;

      for (const fragment of this.fragments) {
        if (fragment.x > x + reach || fragment.x + fragment.width < x - reach) continue;
        if (fragment.y > y + reach || fragment.y + fragment.height < y - reach) continue;

        const dx = Math.max(fragment.x - x, 0, x - (fragment.x + fragment.width));
        const dy = Math.max(fragment.y - y, 0, y - (fragment.y + fragment.height));
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq <= reachSq) {
          this.coveredFragments.add(fragment.index);
          // Scores are retained even though the final selection is not always
          // score-driven. They still help with touch strokes and edge trimming.
          const distanceRatio = Math.sqrt(distanceSq) / reach;
          const weight = 0.18 + (1 - distanceRatio) * 0.82;
          this.fragmentScores.set(
            fragment.index,
            (this.fragmentScores.get(fragment.index) || 0) + weight
          );
        }
      }
    }

    _finalizeSelection() {
      // Resolution always runs in the same order:
      // covered fragments -> resolved span -> optional word expansion -> merge/create.
      // Keeping this centralized prevents popup text, rendering, and clipboard text
      // from drifting apart semantically.
      this._computeLargestFragment();
      const baseFragments = [...this.validFragments]
        .sort((a, b) => a - b)
        .map(index => this.fragments[index])
        .filter(Boolean);
      const validFragments = this._isEraseMode()
        ? this._normalizeErasedFragments(
          this._expandFinalFragments(baseFragments)
        )
        : this._normalizeSelectionContinuity(
          this._expandFinalFragments(baseFragments)
        );

      if (!validFragments.length) {
        this._resetStrokeState();
        return;
      }

      if (this._isEraseMode()) {
        this._finalizeEraseSelection(validFragments);
        this._resetStrokeState();
        return;
      }

      const candidateFinalRects = this._buildFinalRects(validFragments);

      const mergeTarget = this.opts.mergeSelections
        ? this._findMergeTarget(candidateFinalRects, validFragments)
        : null;

      if (mergeTarget) {
        if (!this.opts.multiSelect) {
          this._dismissOtherSelections(mergeTarget);
        }

        const mergedFragments = this._mergeSelectionFragments(mergeTarget, validFragments);
        this._updateSelectionRecord(mergeTarget, mergedFragments);
        this.currentSelection = mergeTarget;
        this._syncRegistrySelections();
        this._schedulePopup(mergeTarget);
      } else {
        if (!this.opts.multiSelect) {
          this._dismissAllSelections();
        }

        const selection = this._createSelectionRecord(validFragments);

        if (selection) {
          this._addSelection(selection);
        }
      }

      this._resetStrokeState();

      if (this.opts.debug) {
        console.log('airtest2 selection', this.getSelectionState());
      }
    }

    _normalizeErasedFragments(validFragments) {
      if (!validFragments.length) {
        return [];
      }

      const sorted = validFragments
        .slice()
        .sort((left, right) => left.index - right.index);
      const trimmed = [];
      let run = [];
      const flushRun = () => {
        if (!run.length) {
          return;
        }

        let start = 0;
        let end = run.length - 1;

        while (start <= end && /^\s+$/.test(run[start].text)) {
          start += 1;
        }

        while (end >= start && /^\s+$/.test(run[end].text)) {
          end -= 1;
        }

        for (let index = start; index <= end; index++) {
          trimmed.push(run[index]);
        }

        run = [];
      };

      for (const fragment of sorted) {
        if (run.length && fragment.index !== run[run.length - 1].index + 1) {
          flushRun();
        }

        run.push(fragment);
      }

      flushRun();

      return this._normalizeSelectionContinuity(trimmed);
    }

    _computeLargestFragment() {
      const sorted = [...this.coveredFragments].sort((a, b) => a - b);

      this.validFragments.clear();
      if (!sorted.length) return;

      const resolvedFragments = this._resolveCoveredFragmentSpan(sorted);

      for (const fragment of resolvedFragments) {
        this.validFragments.add(fragment.index);
      }
    }

    _getFragmentScore(index) {
      return this.fragmentScores.get(index) || 0;
    }

    _getFragmentDistanceToPoint(index, point) {
      const fragment = this.fragments[index];
      if (!fragment || !point) return Infinity;

      const dx = Math.max(fragment.x - point.x, 0, point.x - (fragment.x + fragment.width));
      const dy = Math.max(fragment.y - point.y, 0, point.y - (fragment.y + fragment.height));
      return Math.hypot(dx, dy);
    }

    _extendStrokeBounds(x, y, radius) {
      const nextLeft = x - radius;
      const nextTop = y - radius;
      const nextRight = x + radius;
      const nextBottom = y + radius;

      if (!this.strokeBounds) {
        this.strokeBounds = {
          left: nextLeft,
          top: nextTop,
          right: nextRight,
          bottom: nextBottom
        };
        return;
      }

      this.strokeBounds.left = Math.min(this.strokeBounds.left, nextLeft);
      this.strokeBounds.top = Math.min(this.strokeBounds.top, nextTop);
      this.strokeBounds.right = Math.max(this.strokeBounds.right, nextRight);
      this.strokeBounds.bottom = Math.max(this.strokeBounds.bottom, nextBottom);
    }

    /* ---------- Fragment resolution ---------- */

    _getFogGeometrySnapshot() {
      // Reading one bounded ImageData snapshot is considerably cheaper than
      // repeatedly sampling the full fog canvas for every grapheme candidate.
      if (!this.strokeBounds) {
        return null;
      }

      const left = Math.max(0, Math.floor(this.strokeBounds.left + this.padding - 2));
      const top = Math.max(0, Math.floor(this.strokeBounds.top + this.padding - 2));
      const right = Math.min(this.fogCanvas.width, Math.ceil(this.strokeBounds.right + this.padding + 2));
      const bottom = Math.min(this.fogCanvas.height, Math.ceil(this.strokeBounds.bottom + this.padding + 2));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);

      try {
        const imageData = this.fogCtx.getImageData(left, top, width, height);

        return {
          left,
          top,
          right,
          bottom,
          width,
          height,
          data: imageData.data,
          alphaThreshold: Math.max(10, Math.round(this.opts.maxAlpha * 255 * 0.18)),
          strongThreshold: Math.max(18, Math.round(this.opts.maxAlpha * 255 * 0.34))
        };
      } catch (error) {
        return null;
      }
    }

    _getFogSnapshotAlpha(snapshot, x, y) {
      if (!snapshot) return 0;

      const sampleX = Math.round(x);
      const sampleY = Math.round(y);

      if (
        sampleX < snapshot.left ||
        sampleY < snapshot.top ||
        sampleX >= snapshot.right ||
        sampleY >= snapshot.bottom
      ) {
        return 0;
      }

      const offset = ((sampleY - snapshot.top) * snapshot.width + (sampleX - snapshot.left)) * 4 + 3;
      return snapshot.data[offset] || 0;
    }

    _getFragmentHitMask(fragment, profile = this._getLineResolverProfile()) {
      const baseLeft = fragment.x + this.padding;
      const baseTop = fragment.y + this.padding;
      const baseRight = baseLeft + fragment.width;
      const baseBottom = baseTop + fragment.height;
      const maxInsetX = Math.max(0, fragment.width / 2 - 1);
      const insetX = Math.min(fragment.width * profile.hitMaskInsetXRatio, maxInsetX);
      const centerBandHeight = Math.min(
        fragment.height,
        Math.max(Math.min(fragment.height, 4), fragment.height * profile.hitMaskCenterBandRatio)
      );
      const centerY = baseTop + fragment.height / 2;
      const top = Math.max(baseTop, centerY - centerBandHeight / 2);
      const bottom = Math.min(baseBottom, centerY + centerBandHeight / 2);

      return {
        left: baseLeft + insetX,
        right: baseRight - insetX,
        top,
        bottom,
        width: Math.max(1, baseRight - baseLeft - insetX * 2),
        height: Math.max(1, bottom - top),
        centerX: baseLeft + fragment.width / 2,
        centerY
      };
    }

    _measureFragmentHitCoverage(fragment, snapshot, profile = this._getLineResolverProfile()) {
      if (!fragment || !snapshot) {
        return {
          hitCount: 0,
          sampleCount: 0,
          maxAlpha: 0,
          avgAlpha: 0,
          centerAlpha: 0
        };
      }

      const mask = this._getFragmentHitMask(fragment, profile);
      const sampleCountX = mask.width >= 18 ? 4 : (mask.width >= 10 ? 3 : 2);
      const sampleCountY = mask.height >= 7 ? 3 : 2;
      let hitCount = 0;
      let sampleCount = 0;
      let maxAlpha = 0;
      let alphaTotal = 0;

      for (let yIndex = 0; yIndex < sampleCountY; yIndex++) {
        const ty = sampleCountY === 1 ? 0.5 : yIndex / (sampleCountY - 1);
        const sampleY = mask.top + mask.height * (0.1 + ty * 0.8);

        for (let xIndex = 0; xIndex < sampleCountX; xIndex++) {
          const tx = sampleCountX === 1 ? 0.5 : xIndex / (sampleCountX - 1);
          const sampleX = mask.left + mask.width * (0.08 + tx * 0.84);
          const alpha = this._getFogSnapshotAlpha(snapshot, sampleX, sampleY);

          sampleCount += 1;
          alphaTotal += alpha;
          maxAlpha = Math.max(maxAlpha, alpha);

          if (alpha >= snapshot.alphaThreshold) {
            hitCount += 1;
          }
        }
      }

      return {
        hitCount,
        sampleCount,
        maxAlpha,
        avgAlpha: sampleCount ? alphaTotal / sampleCount : 0,
        centerAlpha: this._getFogSnapshotAlpha(snapshot, mask.centerX, mask.centerY)
      };
    }

    _getLineResolverProfile() {
      if (this.pointerType === 'touch') {
        return {
          geometryHitRatio: 0.34,
          geometryAvgAlphaRatio: 0.78,
          geometryStrongAlphaRatio: 0.82,
          geometryCenterAlphaRatio: 0.74,
          hitMaskInsetXRatio: 0.06,
          hitMaskCenterBandRatio: 0.34,
          lineBandHeightRatio: 0.58,
          lineBandRadiusRatio: 0.58,
          minTravelHeightRatio: 1.0,
          minTravelRadiusRatio: 0.72,
          minFragmentCount: 3,
          minStrongSamples: 3,
          secondaryLineTravelRatio: 1.05,
          secondaryLineFallbackTravelRatio: 0.9,
          secondaryLineMinFragments: 3,
          secondaryLineMinSamples: 5,
          bridgeLineTravelRatio: 0.85,
          bridgeLineMinFragments: 3,
          bridgeLineMinSamples: 3
        };
      }

      return {
        geometryHitRatio: 0.42,
        geometryAvgAlphaRatio: 0.9,
        geometryStrongAlphaRatio: 0.94,
        geometryCenterAlphaRatio: 0.88,
        hitMaskInsetXRatio: 0.08,
        hitMaskCenterBandRatio: 0.32,
        lineBandHeightRatio: 0.78,
        lineBandRadiusRatio: 0.55,
        minTravelHeightRatio: 1.35,
        minTravelRadiusRatio: 0.95,
        minFragmentCount: 2,
        minStrongSamples: 3,
        secondaryLineTravelRatio: 0.84,
        secondaryLineFallbackTravelRatio: 0.6,
        secondaryLineMinFragments: 2,
        secondaryLineMinSamples: 3,
        bridgeLineTravelRatio: 0.42,
        bridgeLineMinFragments: 1,
        bridgeLineMinSamples: 1
      };
    }

    _resolveCoveredFragmentGeometry(indices, profile = this._getLineResolverProfile()) {
      if (!indices.length) {
        return [];
      }

      const snapshot = this._getFogGeometrySnapshot();
      if (!snapshot) {
        return [];
      }

      const resolved = [];

      for (const fragment of this.fragments) {
        const left = fragment.x + this.padding;
        const top = fragment.y + this.padding;
        const right = left + fragment.width;
        const bottom = top + fragment.height;

        if (
          right < snapshot.left ||
          left > snapshot.right ||
          bottom < snapshot.top ||
          top > snapshot.bottom
        ) {
          continue;
        }

        const coverage = this._measureFragmentHitCoverage(fragment, snapshot, profile);
        const minHitCount = Math.max(1, Math.ceil(coverage.sampleCount * profile.geometryHitRatio));
        const strongThreshold = snapshot.strongThreshold * profile.geometryStrongAlphaRatio;
        const avgAlphaThreshold = snapshot.alphaThreshold * profile.geometryAvgAlphaRatio;
        const centerAlphaThreshold = snapshot.alphaThreshold * profile.geometryCenterAlphaRatio;

        if (
          coverage.centerAlpha >= centerAlphaThreshold ||
          coverage.maxAlpha >= strongThreshold ||
          coverage.hitCount >= minHitCount ||
          coverage.avgAlpha >= avgAlphaThreshold
        ) {
          resolved.push(fragment.index);
        }
      }

      return resolved;
    }

    _groupSortedIndicesByVisualLine(indices) {
      const groups = [];
      let current = [];

      for (const index of indices) {
        const fragment = this.fragments[index];
        if (!fragment) continue;

        const previousIndex = current[current.length - 1];
        if (
          current.length &&
          previousIndex != null &&
          this._isSameVisualLineIndex(previousIndex, index)
        ) {
          current.push(index);
        } else {
          if (current.length) {
            groups.push(current);
          }
          current = [index];
        }
      }

      if (current.length) {
        groups.push(current);
      }

      return groups;
    }

    _measureStrokeSupportForLine(indices, profile = this._getLineResolverProfile()) {
      if (!indices.length) {
        return {
          lineHeight: 0,
          fragmentSpanWidth: 0,
          fragmentCount: 0,
          sampleCount: 0,
          sampleXSpan: 0
        };
      }

      const fragments = indices.map(index => this.fragments[index]).filter(Boolean);
      const first = fragments[0];
      const last = fragments[fragments.length - 1];
      const lineCenterY = fragments.reduce((sum, fragment) => sum + fragment.centerY, 0) / fragments.length;
      const lineHeight = fragments.reduce((max, fragment) => Math.max(max, fragment.height), 0);
      const band = Math.max(
        lineHeight * profile.lineBandHeightRatio,
        this.opts.radius * profile.lineBandRadiusRatio
      );
      const nearbySamples = this.strokeSamples.filter(sample => Math.abs(sample.y - lineCenterY) <= band);
      let sampleXSpan = 0;

      if (nearbySamples.length) {
        let minX = nearbySamples[0].x;
        let maxX = nearbySamples[0].x;

        for (let i = 1; i < nearbySamples.length; i++) {
          minX = Math.min(minX, nearbySamples[i].x);
          maxX = Math.max(maxX, nearbySamples[i].x);
        }

        sampleXSpan = maxX - minX;
      }

      return {
        lineHeight,
        fragmentSpanWidth: (last.x + last.width) - first.x,
        fragmentCount: fragments.length,
        sampleCount: nearbySamples.length,
        sampleXSpan
      };
    }

    _resolveFragmentClusters(indices, profile = this._getLineResolverProfile()) {
      // A broad brush can graze adjacent lines. Rank line groups by actual stroke
      // travel and sampled support, keep the primary line, and admit secondary
      // lines only when the gesture contains convincing movement across them.
      const geometricIndices = this._resolveCoveredFragmentGeometry(indices, profile);
      const spanIndices = geometricIndices.length
        ? geometricIndices
        : (this.pointerType === 'touch' ? [] : indices);
      const lineGroups = this._groupSortedIndicesByVisualLine(spanIndices);

      if (!lineGroups.length) {
        return [];
      }

      if (lineGroups.length === 1) {
        return lineGroups[0];
      }

      const lineCandidates = lineGroups.map((group, order) => {
        const support = this._measureStrokeSupportForLine(group, profile);
        const minTravel = Math.max(
          support.lineHeight * profile.minTravelHeightRatio,
          this.opts.radius * profile.minTravelRadiusRatio
        );
        const horizontalTravel = Math.max(support.fragmentSpanWidth, support.sampleXSpan);
        const isStrong =
          horizontalTravel >= minTravel ||
          (
            support.fragmentCount >= profile.minFragmentCount &&
            support.sampleCount >= profile.minStrongSamples
          );
        const qualifiesSecondary =
          horizontalTravel >= minTravel * profile.secondaryLineTravelRatio ||
          (
            horizontalTravel >= minTravel * profile.secondaryLineFallbackTravelRatio &&
            support.fragmentCount >= profile.secondaryLineMinFragments &&
            support.sampleCount >= profile.secondaryLineMinSamples
          );
        const supportScore =
          horizontalTravel +
          support.fragmentCount * Math.max(4, support.lineHeight * 0.22) +
          support.sampleCount * 0.9;

        return {
          order,
          indices: group,
          support,
          minTravel,
          horizontalTravel,
          isStrong,
          qualifiesSecondary,
          supportScore
        };
      });

      const primaryCandidate = lineCandidates.reduce((best, candidate) => {
        if (!best || candidate.supportScore > best.supportScore) {
          return candidate;
        }
        return best;
      }, null);
      let keptOrders = new Set(primaryCandidate ? [primaryCandidate.order] : []);

      for (const candidate of lineCandidates) {
        if (!primaryCandidate || candidate.order === primaryCandidate.order) {
          continue;
        }

        if (candidate.isStrong && candidate.qualifiesSecondary) {
          keptOrders.add(candidate.order);
        }
      }

      if (keptOrders.size > 1) {
        const keptRange = [...keptOrders].sort((a, b) => a - b);
        const firstKept = keptRange[0];
        const lastKept = keptRange[keptRange.length - 1];

        for (const candidate of lineCandidates) {
          if (keptOrders.has(candidate.order) || candidate.order <= firstKept || candidate.order >= lastKept) {
            continue;
          }

          const canBridge =
            candidate.horizontalTravel >= candidate.minTravel * profile.bridgeLineTravelRatio &&
            candidate.support.fragmentCount >= profile.bridgeLineMinFragments &&
            candidate.support.sampleCount >= profile.bridgeLineMinSamples;

          if (candidate.isStrong && canBridge) {
            keptOrders.add(candidate.order);
          }
        }
      }

      const resolved = [];

      for (const candidate of lineCandidates) {
        if (!keptOrders.has(candidate.order)) {
          continue;
        }

        const start = candidate.indices[0];
        const end = candidate.indices[candidate.indices.length - 1];

        for (let index = start; index <= end; index++) {
          const fragment = this.fragments[index];
          if (fragment && this._isSameVisualLineIndex(start, index)) {
            resolved.push(index);
          }
        }
      }

      return resolved;
    }

    _resolveTouchAnchoredFragmentSpan(indices) {
      const scores = indices.map(index => this._getFragmentScore(index));
      const peak = Math.max(...scores);
      const anchorFloor = Math.max(peak * 0.26, 0.18);
      const strongIndices = indices.filter(index => this._getFragmentScore(index) >= anchorFloor);
      const anchorIndices = strongIndices.length ? strongIndices : indices;
      const startAnchor = this._pickAnchorIndex(this.startPoint, anchorIndices) ?? anchorIndices[0];
      const endAnchor = this._pickAnchorIndex(
        this.releasePoint || this.lastPoint || this.startPoint,
        anchorIndices
      ) ?? anchorIndices[anchorIndices.length - 1];
      const start = Math.min(startAnchor, endAnchor);
      const end = Math.max(startAnchor, endAnchor);
      const resolved = [];

      for (let index = start; index <= end; index++) {
        const fragment = this.fragments[index];
        if (fragment) {
          resolved.push(fragment);
        }
      }

      return resolved;
    }

    _selectLongestContinuousFragmentRun(validFragments) {
      if (!validFragments.length) {
        return validFragments;
      }

      const sortedFragments = [...validFragments].sort((a, b) => a.index - b.index);
      const runs = [];
      let currentRun = [sortedFragments[0]];

      for (let i = 1; i < sortedFragments.length; i++) {
        const fragment = sortedFragments[i];
        const previous = currentRun[currentRun.length - 1];

        if (fragment.index === previous.index + 1) {
          currentRun.push(fragment);
        } else {
          runs.push(currentRun);
          currentRun = [fragment];
        }
      }

      if (currentRun.length) {
        runs.push(currentRun);
      }

      let bestRun = runs[0];
      let bestWidth = (bestRun[bestRun.length - 1].x + bestRun[bestRun.length - 1].width) - bestRun[0].x;

      for (const run of runs) {
        const width = (run[run.length - 1].x + run[run.length - 1].width) - run[0].x;

        if (
          run.length > bestRun.length ||
          (run.length === bestRun.length && width > bestWidth)
        ) {
          bestRun = run;
          bestWidth = width;
        }
      }

      return bestRun;
    }

    _normalizeSelectionContinuity(validFragments) {
      if (!validFragments.length || !this.opts.continuousOnly) {
        return validFragments;
      }

      return this._selectLongestContinuousFragmentRun(validFragments);
    }

    _pickClosestAnchorIndex(point, indices) {
      if (!point || !indices.length) return null;

      let bestIndex = null;
      let bestDistance = Infinity;

      for (const index of indices) {
        const distance = this._getFragmentDistanceToPoint(index, point);

        if (
          distance < bestDistance ||
          (distance === bestDistance && (bestIndex == null || index < bestIndex))
        ) {
          bestIndex = index;
          bestDistance = distance;
        }
      }

      return bestIndex;
    }

    _pickAnchorIndex(point, indices) {
      if (!point || !indices.length) return null;

      let bestIndex = null;
      let bestRank = -Infinity;
      let bestDistance = Infinity;

      for (const index of indices) {
        const fragment = this.fragments[index];
        if (!fragment) continue;

        const distance = this._getFragmentDistanceToPoint(index, point);
        const rank = this._getFragmentScore(index) * 3 - distance / Math.max(this.opts.radius * 0.75, 1);

        if (
          rank > bestRank ||
          (rank === bestRank && distance < bestDistance) ||
          (rank === bestRank && distance === bestDistance && (bestIndex == null || index < bestIndex))
        ) {
          bestIndex = index;
          bestRank = rank;
          bestDistance = distance;
        }
      }

      return bestIndex;
    }

    _resolveCoveredFragmentSpan(indices) {
      if (!indices.length) {
        return [];
      }

      const resolvedIndices = this._resolveFragmentClusters(indices);
      const resolved = [];

      for (const index of resolvedIndices) {
        const fragment = this.fragments[index];
        if (fragment) {
          resolved.push(fragment);
        }
      }

      if (resolved.length || this.pointerType !== 'touch') {
        return resolved;
      }

      // Touch now shares the geometry-first resolver. If that path produces no
      // usable fragments at all, fall back to the older score-aware anchor span
      // rather than dropping the gesture entirely.
      return this._resolveTouchAnchoredFragmentSpan(indices);
    }

    _buildFinalRects(fragments) {
      // Final rectangles are compact line bands used for bounds, merging, and
      // clipping. The softer cloud itself is generated from stamps below.
      if (!fragments.length) return [];

      const merged = [];

      for (const fragment of fragments) {
        const previous = merged[merged.length - 1];

        if (
          previous &&
          Math.abs(previous.y - fragment.y) < Math.max(previous.height, fragment.height) * 0.45 &&
          fragment.x <= previous.x + previous.width + this.opts.detectTolerance
        ) {
          // Same-row neighboring fragments are merged into one geometry band.
          // This keeps finalized bounds readable and avoids a staircase of tiny rects.
          const right = Math.max(previous.x + previous.width, fragment.x + fragment.width);
          const bottom = Math.max(previous.y + previous.height, fragment.y + fragment.height);
          previous.x = Math.min(previous.x, fragment.x);
          previous.y = Math.min(previous.y, fragment.y);
          previous.width = right - previous.x;
          previous.height = bottom - previous.y;
        } else {
          merged.push({
            x: fragment.x,
            y: fragment.y,
            width: fragment.width,
            height: fragment.height
          });
        }
      }

      return merged.map(rect => this._normalizeRect(rect));
    }

    _buildFinalStamps(fragments) {
      // Reconstruct a deterministic cloud from resolved text geometry rather than
      // preserving the raw stroke; selections settle onto the text line while
      // retaining the airbrush visual language.
      if (!fragments.length) return [];

      const stamps = [];
      const padding = this.opts.radius * this.opts.finalPaddingRatio;

      for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i];
        const next = fragments[i + 1] || null;
        const baseRadius = Math.max(
          fragment.height * 0.48 + padding,
          this.opts.radius * 0.42
        );
        const spanStart = fragment.x - padding * 0.42;
        const spanEnd = fragment.x + fragment.width + padding * 0.42;
        const span = Math.max(0, spanEnd - spanStart);
        const step = Math.max(baseRadius * 0.92, 8);
        const count = Math.max(1, Math.ceil(span / step));

        for (let j = 0; j < count; j++) {
          const t = count === 1 ? 0.5 : j / (count - 1);
          const jitterX = this._signedNoise(fragment.index, j, 1);
          const jitterY = this._signedNoise(fragment.index, j, 2);
          const jitterR = this._signedNoise(fragment.index, j, 3);

          stamps.push({
            x: count === 1 ? fragment.centerX : spanStart + span * t + jitterX * baseRadius * 0.08,
            y: fragment.centerY + jitterY * Math.min(fragment.height * 0.16, this.opts.radius * 0.14),
            radius: baseRadius * (0.9 + jitterR * 0.12)
          });
        }

        if (!next) continue;

        const sameRow = Math.abs(next.centerY - fragment.centerY) <= Math.max(fragment.height, next.height) * 0.4;
        const horizontalGap = next.x - (fragment.x + fragment.width);

        if (sameRow && horizontalGap > 0 && horizontalGap < this.opts.radius * 1.9) {
          // Small same-line gaps look artificial if left as separate blobs, so the
          // final cloud gets a connector pass. Cross-line jumps are left alone.
          const startX = fragment.x + fragment.width;
          const endX = next.x;
          const connectorSpan = Math.max(0, endX - startX);
          const connectorRadius = Math.max(baseRadius * 0.76, this.opts.radius * 0.34);
          const connectorCount = Math.max(1, Math.ceil(connectorSpan / Math.max(connectorRadius * 0.85, 6)));

          for (let j = 1; j <= connectorCount; j++) {
            const t = j / (connectorCount + 1);
            stamps.push({
              x: startX + connectorSpan * t,
              y: fragment.centerY + this._signedNoise(fragment.index, j, 4) * connectorRadius * 0.08,
              radius: connectorRadius * (0.94 + this._signedNoise(fragment.index, j, 5) * 0.08)
            });
          }
        }
      }

      return stamps;
    }

    _normalizeRect(rect) {
      const padding = this.opts.radius * this.opts.finalPaddingRatio;
      const minSize = this.opts.radius * 2;
      const targetWidth = Math.max(rect.width + padding * 2, minSize);
      const targetHeight = Math.max(rect.height + padding * 2, minSize);
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      return {
        x: centerX - targetWidth / 2,
        y: centerY - targetHeight / 2,
        width: targetWidth,
        height: targetHeight
      };
    }

    _buildPreviewText(validFragments) {
      // DOM adjacency alone does not describe readable text across blocks and
      // wrapped nodes, so reconstruction combines text offsets with visual-line
      // relationships before normalizing whitespace.
      if (!validFragments.length) {
        return '';
      }

      let preview = '';
      let previous = null;

      for (const fragment of validFragments) {
        if (previous) {
          let gapText = '';

          if (fragment.node === previous.node) {
            gapText = fragment.node.nodeValue.slice(previous.endOffset, fragment.startOffset);
          } else {
            // Different text nodes frequently mean block boundaries or wrapped DOM
            // structure, so we reconstruct a human-readable preview from geometry.
            const sameRow = Math.abs(fragment.centerY - previous.centerY) <= Math.max(fragment.height, previous.height) * 0.4;
            const visibleGap = fragment.x - (previous.x + previous.width);

            if (!sameRow || visibleGap > Math.max(fragment.height, previous.height) * 0.25) {
              gapText = ' ';
            }
          }

          if (gapText && /\s/.test(gapText)) {
            preview += ' ';
          }
        }

        preview += fragment.text;
        previous = fragment;
      }

      return preview.replace(/\s+/g, ' ').trim();
    }

    _isWordCoreText(text) {
      if (!text) return false;

      if (!this._wordCorePattern) {
        try {
          this._wordCorePattern = /[\p{L}\p{N}\p{M}]/u;
        } catch (error) {
          this._wordCorePattern = /[A-Za-z0-9_]/;
        }
      }

      return this._wordCorePattern.test(text);
    }

    _isWhitespaceText(text) {
      return Boolean(text) && /^\s+$/u.test(text);
    }

    _isSameVisualLineIndex(leftIndex, rightIndex) {
      const left = this.fragments[leftIndex];
      const right = this.fragments[rightIndex];

      if (!left || !right) {
        return false;
      }

      return Math.abs(left.centerY - right.centerY) <= Math.max(left.height, right.height) * 0.45;
    }

    _isWordJoinerIndex(index) {
      const fragment = this.fragments[index];
      if (!fragment || !WORD_JOINERS.has(fragment.text)) {
        return false;
      }

      const previous = this.fragments[index - 1];
      const next = this.fragments[index + 1];

      return Boolean(
        previous &&
        next &&
        this._isSameVisualLineIndex(index - 1, index) &&
        this._isSameVisualLineIndex(index, index + 1) &&
        this._isWordCoreText(previous.text) &&
        this._isWordCoreText(next.text)
      );
    }

    _isWordLikeIndex(index) {
      const fragment = this.fragments[index];
      if (!fragment) return false;

      return this._isWordCoreText(fragment.text) || this._isWordJoinerIndex(index);
    }

    _expandSelectionToWholeWords(start, end) {
      // Completion stays conservative: apostrophes and hyphens may join word
      // cores, but expansion never jumps across a rendered line boundary.
      let nextStart = start;
      let nextEnd = end;

      // Word expansion is intentionally line-bounded. A wrapped word boundary acts
      // like a separator for this engine; otherwise the first word on the next line
      // gets absorbed when the user only intended the edge word of the current line.
      while (
        nextStart > 0 &&
        this._isWordLikeIndex(nextStart) &&
        this._isWordLikeIndex(nextStart - 1) &&
        this._isSameVisualLineIndex(nextStart, nextStart - 1)
      ) {
        nextStart -= 1;
      }

      while (
        nextEnd < this.fragments.length - 1 &&
        this._isWordLikeIndex(nextEnd) &&
        this._isWordLikeIndex(nextEnd + 1) &&
        this._isSameVisualLineIndex(nextEnd, nextEnd + 1)
      ) {
        nextEnd += 1;
      }

      return { start: nextStart, end: nextEnd };
    }

    _countSymmetricPairInRange(char, start, end) {
      let count = 0;

      for (let index = start; index <= end; index++) {
        const fragment = this.fragments[index];
        if (!fragment || fragment.text !== char || this._isWordJoinerIndex(index)) {
          continue;
        }

        count += 1;
      }

      return count;
    }

    _countAsymmetricPairBalance(open, close, start, end) {
      let balance = 0;

      for (let index = start; index <= end; index++) {
        const fragment = this.fragments[index];
        if (!fragment) continue;

        if (fragment.text === open) {
          balance += 1;
        } else if (fragment.text === close) {
          balance -= 1;
        }
      }

      return balance;
    }

    _shouldIncludeLeadingPair(index, start, end) {
      const fragment = this.fragments[index];
      if (!fragment) return false;

      if (SYMMETRIC_PAIRS.has(fragment.text) && !this._isWordJoinerIndex(index)) {
        return this._countSymmetricPairInRange(fragment.text, start, end) % 2 === 1;
      }

      const close = OPEN_TO_CLOSE[fragment.text];
      if (!close) return false;

      return this._countAsymmetricPairBalance(fragment.text, close, start, end) < 0;
    }

    _shouldIncludeTrailingPair(index, start, end) {
      const fragment = this.fragments[index];
      if (!fragment) return false;

      if (SYMMETRIC_PAIRS.has(fragment.text) && !this._isWordJoinerIndex(index)) {
        return this._countSymmetricPairInRange(fragment.text, start, end) % 2 === 1;
      }

      const open = CLOSE_TO_OPEN[fragment.text];
      if (!open) return false;

      return this._countAsymmetricPairBalance(open, fragment.text, start, end) > 0;
    }

    _expandSelectionWithPairs(start, end) {
      let nextStart = start;
      let nextEnd = end;
      let changed = true;

      // Pair expansion only reaches one fragment outward at each edge, and only
      // when the counterpart is already present inside the current selection span.
      // It is meant to complete punctuation around selected text, not to "hunt"
      // arbitrarily far away for matching brackets or quotes.
      while (changed) {
        changed = false;

        if (nextStart > 0 && this._shouldIncludeLeadingPair(nextStart - 1, nextStart, nextEnd)) {
          nextStart -= 1;
          changed = true;
        }

        if (
          nextEnd < this.fragments.length - 1 &&
          this._shouldIncludeTrailingPair(nextEnd + 1, nextStart, nextEnd)
        ) {
          nextEnd += 1;
          changed = true;
        }
      }

      return { start: nextStart, end: nextEnd };
    }

    _trimDetachedEdgeFragment(start, end, direction) {
      const edgeIndex = direction < 0 ? start : end;
      const edgeFragment = this.fragments[edgeIndex];

      if (
        !edgeFragment ||
        this._isWhitespaceText(edgeFragment.text) ||
        this._isWordCoreText(edgeFragment.text) ||
        this._isWordJoinerIndex(edgeIndex)
      ) {
        return direction < 0 ? start : end;
      }

      let cursor = edgeIndex - direction;
      let hasWhitespaceGap = false;

      while (cursor >= start && cursor <= end) {
        const fragment = this.fragments[cursor];

        if (
          !fragment ||
          !this._isSameVisualLineIndex(edgeIndex, cursor) ||
          !this._isWhitespaceText(fragment.text)
        ) {
          break;
        }

        hasWhitespaceGap = true;
        cursor -= direction;
      }

      if (!hasWhitespaceGap) {
        return direction < 0 ? start : end;
      }

      const anchoredFragment = this.fragments[cursor];

      if (
        !anchoredFragment ||
        !this._isSameVisualLineIndex(edgeIndex, cursor)
      ) {
        return direction < 0 ? start : end;
      }

      return direction < 0 ? cursor : cursor;
    }

    _trimDetachedEdgePunctuation(start, end) {
      let nextStart = start;
      let nextEnd = end;

      nextStart = this._trimDetachedEdgeFragment(nextStart, nextEnd, -1);
      nextEnd = this._trimDetachedEdgeFragment(nextStart, nextEnd, 1);

      return { start: nextStart, end: nextEnd };
    }

    _expandFinalFragments(validFragments) {
      if (!this.opts.includeCompleteWords || !validFragments.length) {
        return validFragments;
      }

      // Word/pair expansion stays local to each visual-line cluster. A global
      // first->last expansion would reintroduce the same overfill problem the
      // geometric resolver is trying to avoid.
      const sortedFragments = [...validFragments].sort((a, b) => a.index - b.index);
      const clusters = [];
      let currentCluster = [];

      for (const fragment of sortedFragments) {
        const previous = currentCluster[currentCluster.length - 1];

        if (
          previous &&
          this._isSameVisualLineIndex(previous.index, fragment.index)
        ) {
          currentCluster.push(fragment);
        } else {
          if (currentCluster.length) {
            clusters.push(currentCluster);
          }
          currentCluster = [fragment];
        }
      }

      if (currentCluster.length) {
        clusters.push(currentCluster);
      }

      const expandedIndices = new Set();

      for (const cluster of clusters) {
        let start = cluster[0].index;
        let end = cluster[cluster.length - 1].index;

        ({ start, end } = this._expandSelectionToWholeWords(start, end));
        ({ start, end } = this._expandSelectionWithPairs(start, end));
        ({ start, end } = this._trimDetachedEdgePunctuation(start, end));

        for (let index = start; index <= end; index++) {
          const fragment = this.fragments[index];
          if (fragment && this._isSameVisualLineIndex(start, index)) {
            expandedIndices.add(index);
          }
        }
      }

      return [...expandedIndices]
        .sort((a, b) => a - b)
        .map(index => this.fragments[index])
        .filter(Boolean);
    }

    _buildSelectionBounds(rects) {
      // Bounds remain element-local; popup code converts them to page coordinates
      // only while positioning visible UI.
      if (!rects.length) {
        return null;
      }

      let left = rects[0].x;
      let top = rects[0].y;
      let right = rects[0].x + rects[0].width;
      let bottom = rects[0].y + rects[0].height;

      for (let i = 1; i < rects.length; i++) {
        const rect = rects[i];
        left = Math.min(left, rect.x);
        top = Math.min(top, rect.y);
        right = Math.max(right, rect.x + rect.width);
        bottom = Math.max(bottom, rect.y + rect.height);
      }

      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      };
    }

    _buildSelectionState(validFragments, finalRects) {
      if (!validFragments.length) {
        return null;
      }

      // This state object is the semantic source of truth for everything user-facing:
      // popup preview, clipboard output, ordering, and merge decisions.
      const fragmentIndices = validFragments.map(fragment => fragment.index);

      return {
        fragmentIndices,
        fragmentCount: fragmentIndices.length,
        textPreview: this._buildPreviewText(validFragments),
        bounds: this._buildSelectionBounds(finalRects),
        rects: finalRects.map(rect => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }))
      };
    }

    _compareLocalSelections(a, b) {
      return compareSelectionsInDocument(a, b);
    }

    _broadcastRegistryUpdate() {
      if (!this.registryState) {
        this._syncAllPopupStates();
        return;
      }

      for (const instance of GLOBAL_STATE.instances) {
        if (instance.registryState === this.registryState) {
          instance._syncAllPopupStates();
        }
      }
    }

    _syncRegistrySelections() {
      if (this.registryState) {
        const activeSelections = this.selectionGroups
          .filter(selection => !selection.isDismissing)
          .sort((a, b) => this._compareLocalSelections(a, b));

        if (activeSelections.length) {
          this.registryState.entries.set(this.instanceId, {
            instance: this,
            element: this.el,
            selections: activeSelections
          });
        } else {
          this.registryState.entries.delete(this.instanceId);
        }
      }

      this._broadcastRegistryUpdate();
      GLOBAL_STATE.touchEraseBarManager?.sync();
    }

    _setSelectionCopied(selection, copied) {
      if (!selection) return;

      selection.copied = copied;

      if (this.registryState) {
        if (copied) {
          this.registryState.copiedSelectionIds.add(selection.id);
        } else {
          this.registryState.copiedSelectionIds.delete(selection.id);
        }
      }
    }

    _buildPopupContext(selection) {
      // Custom renderers receive callbacks and cloned geometry rather than direct
      // authority over the internal selection record.
      const state = selection?.state;
      const popupElement = selection?.popup || null;

      return {
        instance: this,
        selection,
        selectionId: selection?.id ?? null,
        element: this.el,
        popup: popupElement,
        popupElement,
        popupShadowRoot: selection?.popupShadowRoot || null,
        popupClassName: this.opts.popupClassName,
        text: state?.textPreview ?? '',
        copied: Boolean(selection?.copied),
        copyLabel: this._getCopyButtonLabel(selection),
        showTextPreview: Boolean(this.opts.showTextPreview),
        fragmentIndices: selection?.fragmentIndices ? [...selection.fragmentIndices] : [],
        bounds: state?.bounds ? { ...state.bounds } : null,
        rects: state?.rects ? state.rects.map(rect => ({ ...rect })) : [],
        requestPosition: () => requestAnimationFrame(() => this._positionPopup(selection)),
        showPopup: () => this._showPopup(selection),
        hidePopup: () => this._hidePopup(selection),
        copy: () => this.copySelection(selection?.id),
        close: () => this.cancelSelection(selection?.id),
        cancel: () => this.cancelSelection(selection?.id)
      };
    }

    _createDefaultPopupController(selection) {
      const popupDom = createDefaultPopupDom(this.opts.popupClassName);

      selection.popupCard = popupDom.popup;
      selection.popupPreview = popupDom.preview;
      selection.popupCopyButton = popupDom.copyButton;
      selection.popupCancelButton = popupDom.cancelButton;

      popupDom.copyButton.addEventListener('click', event => {
        event.preventDefault();
        this.copySelection(selection.id);
      });

      popupDom.cancelButton.addEventListener('click', event => {
        event.preventDefault();
        this.cancelSelection(selection.id);
      });

      return {
        element: popupDom.host,
        update: context => {
          popupDom.host.dataset.hasPreview = context.showTextPreview ? 'true' : 'false';
          popupDom.preview.hidden = !context.showTextPreview;
          popupDom.preview.textContent = context.showTextPreview ? context.text : '';
          popupDom.copyButton.textContent = context.copyLabel;
          popupDom.copyButton.dataset.state = context.copied ? 'copied' : 'ready';
        },
        destroy: () => {
          selection.popupCard = null;
          selection.popupPreview = null;
          selection.popupCopyButton = null;
          selection.popupCancelButton = null;
        }
      };
    }

    _normalizeCustomPopupController(selection, popupRenderer, controllerCandidate) {
      const controller = controllerCandidate instanceof HTMLElement
        ? { element: controllerCandidate }
        : controllerCandidate;
      const popupElement = controller?.element;

      if (!(popupElement instanceof HTMLElement)) {
        return null;
      }

      if (typeof controller.update !== 'function' && typeof popupRenderer?.update === 'function') {
        controller.update = context => popupRenderer.update(popupElement, context);
      }

      if (typeof controller.destroy !== 'function' && typeof popupRenderer?.destroy === 'function') {
        controller.destroy = context => popupRenderer.destroy(popupElement, context);
      }

      selection.popupCard = null;
      selection.popupPreview = null;
      selection.popupCopyButton = null;
      selection.popupCancelButton = null;

      return controller;
    }

    _resolvePopupController(selection) {
      const popupRenderer = this.opts.popupRenderer;
      const createPopup = typeof popupRenderer === 'function'
        ? popupRenderer
        : popupRenderer?.create;

      if (typeof createPopup !== 'function') {
        return this._createDefaultPopupController(selection);
      }

      try {
        const popupContext = this._buildPopupContext(selection);
        const controller = this._normalizeCustomPopupController(
          selection,
          popupRenderer,
          createPopup(popupContext)
        );

        return controller || this._createDefaultPopupController(selection);
      } catch (error) {
        if (this.opts.debug) {
          console.error('airbrush popup renderer failed', error);
        }

        return this._createDefaultPopupController(selection);
      }
    }

    _createSelectionPopup(selection) {
      const popupController = this._resolvePopupController(selection);

      selection.popupController = popupController;
      selection.popup = popupController.element;
      selection.popupShadowRoot = selection.popup.shadowRoot || null;
      selection.popup.hidden = true;
      selection.popup.style.position ||= 'absolute';
      selection.popup.style.zIndex ||= '20000';
      selection.popupPosition = null;

      selection.popup.addEventListener('pointerdown', event => event.stopPropagation(), true);
      selection.popup.addEventListener('mousedown', event => event.stopPropagation(), true);

      document.body.appendChild(selection.popup);
      this._syncPopupState(selection);
    }

    _destroySelectionPopup(selection) {
      this._clearPopupTimer(selection);

      if (selection?.popupController?.destroy) {
        try {
          selection.popupController.destroy(this._buildPopupContext(selection));
        } catch (error) {
          if (this.opts.debug) {
            console.error('airbrush popup destroy failed', error);
          }
        }
      }

      if (selection?.popup?.parentNode) {
        selection.popup.parentNode.removeChild(selection.popup);
      }

      selection.popup = null;
      selection.popupController = null;
      selection.popupShadowRoot = null;
      selection.popupCard = null;
      selection.popupPreview = null;
      selection.popupCopyButton = null;
      selection.popupCancelButton = null;
      selection.popupPosition = null;
    }

    _createSelectionRecord(validFragments, order = null) {
      const finalRects = this._buildFinalRects(validFragments);
      const finalStamps = this._buildFinalStamps(validFragments);
      const state = this._buildSelectionState(validFragments, finalRects);

      if (!state) return null;

      // A selection record keeps both semantic data (text/range) and render data
      // (stamps/progress/visibility). That lets us animate dismissal without losing
      // ordering and copy semantics too early.
      const id = this.registryState
        ? `selection-${this.registryState.nextSelectionId++}`
        : `selection-${this.instanceId}-${++this.localSelectionSerial}`;
      const now = performance.now();
      const selection = {
        id,
        instanceId: this.instanceId,
        element: this.el,
        fragmentIndices: [...state.fragmentIndices],
        text: state.textPreview,
        bounds: { ...state.bounds },
        rects: state.rects.map(rect => ({ ...rect })),
        finalRects,
        finalStamps,
        finalProgress: finalStamps.length ? 0 : 1,
        finalVisibility: finalStamps.length ? 1 : 0,
        isDismissing: false,
        copied: false,
        copiedProgress: 0,
        order: order ?? ++this.selectionOrderCounter,
        createdAt: now,
        lastUpdatedAt: now,
        releasePoint: this.releasePoint ? { ...this.releasePoint } : null,
        popupTimerId: 0,
        popupPending: false,
        state
      };

      this._createSelectionPopup(selection);

      return selection;
    }

    _updateSelectionRecord(selection, validFragments) {
      const finalRects = this._buildFinalRects(validFragments);
      const finalStamps = this._buildFinalStamps(validFragments);
      const state = this._buildSelectionState(validFragments, finalRects);

      if (!state) return null;

      this._setSelectionCopied(selection, false);
      selection.fragmentIndices = [...state.fragmentIndices];
      selection.text = state.textPreview;
      selection.bounds = { ...state.bounds };
      selection.rects = state.rects.map(rect => ({ ...rect }));
      selection.finalRects = finalRects;
      selection.finalStamps = finalStamps;
      selection.finalProgress = Math.min(selection.finalProgress, 0.45);
      selection.finalVisibility = 1;
      selection.isDismissing = false;
      selection.lastUpdatedAt = performance.now();
      selection.releasePoint = this.releasePoint ? { ...this.releasePoint } : selection.releasePoint;
      selection.state = state;

      return selection;
    }

    _findSelectionById(selectionId) {
      if (!selectionId) return null;
      return this.selectionGroups.find(selection => selection.id === selectionId) || null;
    }

    _getSelectionPageBounds(selection) {
      if (!selection?.state?.bounds) {
        return null;
      }

      const elementRect = this.el.getBoundingClientRect();
      const { bounds } = selection.state;
      const left = elementRect.left + window.scrollX + bounds.x - this.el.scrollLeft;
      const top = elementRect.top + window.scrollY + bounds.y - this.el.scrollTop;

      return {
        left,
        top,
        right: left + bounds.width,
        bottom: top + bounds.height,
        width: bounds.width,
        height: bounds.height
      };
    }

    _isPageRectVisible(bounds) {
      if (!bounds) return false;

      const margin = 4;
      const viewport = getVisualViewportMetrics();
      const viewportLeft = viewport.pageLeft + margin;
      const viewportTop = viewport.pageTop + margin;
      const viewportRight = viewport.pageLeft + viewport.width - margin;
      const viewportBottom = viewport.pageTop + viewport.height - margin;

      return (
        bounds.right > viewportLeft &&
        bounds.left < viewportRight &&
        bounds.bottom > viewportTop &&
        bounds.top < viewportBottom
      );
    }

    _getReleasePagePoint(selection) {
      if (!selection?.releasePoint) return null;

      const elementRect = this.el.getBoundingClientRect();

      return {
        x: elementRect.left + window.scrollX + selection.releasePoint.x - this.el.scrollLeft,
        y: elementRect.top + window.scrollY + selection.releasePoint.y - this.el.scrollTop
      };
    }

    _getPopupOffsetGap() {
      const baseGap = this.opts.popupOffset;
      return IS_ANDROID_CHROME
        ? baseGap + Math.max(0, Number(this.opts.androidChromePopupExtraOffset) || 0)
        : baseGap;
    }

    _positionAllPopups() {
      for (const selection of this.selectionGroups) {
        this._positionPopup(selection);
      }
    }

    _positionPopup(selection) {
      // Recompute from live page geometry on scroll and resize. The selection's
      // stored rectangles remain stable in element-local coordinates.
      if (!selection?.popup || selection.popup.hidden || !selection.state) return;

      const bounds = this._getSelectionPageBounds(selection);
      if (!bounds) return;

      if (!this._isPageRectVisible(bounds)) {
        // Hidden is better than clamping to the viewport edge; otherwise popups
        // appear to "stick" to the top while their selection has scrolled away.
        selection.popup.style.visibility = 'hidden';
        selection.popupPosition = null;
        return;
      }

      selection.popup.style.visibility = 'hidden';

      const popupWidth = selection.popupCard?.offsetWidth || selection.popup.offsetWidth || 220;
      const popupHeight = selection.popupCard?.offsetHeight || selection.popup.offsetHeight || 84;
      const position = this._resolvePopupPlacement(selection, bounds, popupWidth, popupHeight);

      selection.popup.style.left = `${position.left}px`;
      selection.popup.style.top = `${position.top}px`;
      selection.popup.style.visibility = '';
      selection.popupPosition = position;
    }

    _resolvePopupPlacement(selection, bounds, popupWidth, popupHeight) {
      const margin = 12;
      const gap = this._getPopupOffsetGap();
      const viewport = getVisualViewportMetrics();
      const viewportLeft = viewport.pageLeft + margin;
      const viewportTop = viewport.pageTop + margin;
      const viewportRight = viewport.pageLeft + viewport.width - margin;
      const viewportWidth = Math.max(1, viewportRight - viewportLeft);
      const rawViewportBottom = viewport.pageTop + viewport.height - margin;
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const viewportBottom = Math.min(rawViewportBottom, documentHeight - margin);
      const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
      const centeredLeft = clamp(
        viewport.pageLeft + (viewport.width - popupWidth) / 2,
        viewportLeft,
        viewportRight - popupWidth
      );
      const centerPopupFully = Boolean(this.opts.centerPopup);
      const centerPopupHorizontally = centerPopupFully || popupWidth > viewportWidth * 0.5;

      if (centerPopupFully) {
        return {
          left: centeredLeft,
          top: clamp(
            viewport.pageTop + (viewport.height - popupHeight) / 2,
            viewportTop,
            viewportBottom - popupHeight
          )
        };
      }

      const releasePoint = this._getReleasePagePoint(selection) || {
        x: bounds.right,
        y: bounds.bottom
      };
      const spaceBelow = viewportBottom - bounds.bottom;
      const spaceAbove = bounds.top - viewportTop;
      const preferAbove = spaceBelow < popupHeight + gap;

      const belowCandidates = [
        { left: bounds.right - popupWidth, top: bounds.bottom + gap, placement: 'below' },
        { left: bounds.left, top: bounds.bottom + gap, placement: 'below' },
        { left: releasePoint.x - popupWidth * 0.7, top: releasePoint.y + gap, placement: 'below' }
      ];
      const aboveCandidates = [
        { left: bounds.right - popupWidth, top: bounds.top - popupHeight - gap, placement: 'above' },
        { left: bounds.left, top: bounds.top - popupHeight - gap, placement: 'above' },
        { left: releasePoint.x - popupWidth * 0.7, top: bounds.top - popupHeight - gap, placement: 'above' }
      ];
      const candidates = preferAbove
        ? [...aboveCandidates, ...belowCandidates]
        : [...belowCandidates, ...aboveCandidates];

      const fits = position =>
        position.left >= viewportLeft &&
        position.top >= viewportTop &&
        position.left + popupWidth <= viewportRight &&
        position.top + popupHeight <= viewportBottom &&
        position.top + popupHeight <= documentHeight - margin;

      for (const candidate of candidates) {
        const positionedCandidate = centerPopupHorizontally
          ? { ...candidate, left: centeredLeft }
          : candidate;

        if (fits(positionedCandidate)) {
          return positionedCandidate;
        }
      }

      const fallbackPlacement = preferAbove
        ? 'above'
        : (spaceBelow >= popupHeight + gap || spaceBelow >= spaceAbove ? 'below' : 'above');
      const fallback = fallbackPlacement === 'above' ? aboveCandidates[0] : belowCandidates[0];

      const clampedLeft = clamp(
        fallback.left,
        viewportLeft,
        viewportRight - popupWidth
      );
      const clampedTop = fallbackPlacement === 'above'
        ? clamp(bounds.top - popupHeight - gap, viewportTop, viewportBottom - popupHeight)
        : clamp(bounds.bottom + gap, viewportTop, viewportBottom - popupHeight);

      return {
        left: centerPopupHorizontally ? centeredLeft : clampedLeft,
        top: clampedTop
      };
    }

    _hasCopiedSelectionsInScope() {
      if (this.registryState) {
        return this.registryState.copiedSelectionIds.size > 0;
      }

      return this.selectionGroups.some(selection => selection.copied && !selection.isDismissing);
    }

    _getCopyButtonLabel(selection) {
      if (!selection) return 'Copy';
      if (selection.copied) return 'Copied';
      if (!this.opts.autoClose && this._hasCopiedSelectionsInScope()) return '+Copy';
      return 'Copy';
    }

    _getPopupDelay() {
      const delay = Number(this.opts.strokeMergeTime);
      return Number.isFinite(delay) ? Math.max(0, delay) : 0;
    }

    _clearPopupTimer(selection) {
      if (!selection) return;

      if (selection.popupTimerId) {
        window.clearTimeout(selection.popupTimerId);
        selection.popupTimerId = 0;
      }

      selection.popupPending = false;
    }

    _schedulePopup(selection) {
      if (!selection?.popup || !selection.state || selection.isDismissing) return;

      const delay = this._getPopupDelay();
      this._clearPopupTimer(selection);
      this._hidePopup(selection);

      if (delay === 0) {
        this._showPopup(selection);
        return;
      }

      // The popup shares the merge window on purpose: a user can finish one stroke,
      // add another nearby stroke, and only then get the final action UI.
      selection.popupPending = true;
      const revealWhenIdle = () => {
        selection.popupTimerId = 0;

        if (selection.isDismissing) return;
        if (!this._findSelectionById(selection.id)) return;

        if (GLOBAL_STATE.active || this.isPointerDown || this.isDrawing) {
          // Keep deferring until the user is actually idle; otherwise the popup
          // can surface mid-gesture on slower devices.
          selection.popupTimerId = window.setTimeout(revealWhenIdle, 80);
          return;
        }

        selection.popupPending = false;
        this._showPopup(selection);
      };

      selection.popupTimerId = window.setTimeout(revealWhenIdle, delay);
    }

    _showPopup(selection) {
      if (!selection?.popup || !selection.state || selection.isDismissing) return;

      // Popups are ephemeral UI over a durable selection record. Showing/hiding the
      // popup must never mutate the selection itself, otherwise scroll and autoclose
      // interactions become hard to reason about.
      if (this.opts.hidePopupsOnSelectionStart) {
        this._hideAllPopups({ exceptSelection: selection, cancelPending: true });
      }

      this._clearPopupTimer(selection);
      selection.popup.hidden = false;
      this._syncPopupState(selection);

      requestAnimationFrame(() => this._positionPopup(selection));
    }

    _hidePopup(selection) {
      if (!selection?.popup) return;
      selection.popup.hidden = true;
      selection.popupPosition = null;
    }

    _hideAllPopups({ exceptSelection = null, cancelPending = false } = {}) {
      const instances = this.registryState
        ? GLOBAL_STATE.instances.filter(instance => instance.registryState === this.registryState)
        : [this];

      for (const instance of instances) {
        for (const selection of instance.selectionGroups) {
          if (selection === exceptSelection) continue;

          if (cancelPending) {
            instance._clearPopupTimer(selection);
          }

          instance._hidePopup(selection);
        }
      }
    }

    _syncPopupState(selection) {
      if (!selection?.popup || !selection.state) return;

      if (selection.popupController?.update) {
        try {
          selection.popupController.update(this._buildPopupContext(selection));
        } catch (error) {
          if (this.opts.debug) {
            console.error('airbrush popup update failed', error);
          }
        }
      }

      if (!selection.popup.hidden) {
        this._positionPopup(selection);
      }
    }

    _syncAllPopupStates() {
      for (const selection of this.selectionGroups) {
        this._syncPopupState(selection);
      }
    }

    _rectDistance(rectA, rectB) {
      // Merge and erase decisions use final text-aligned rectangles, not transient
      // brush circles, which makes repeated strokes predictable.
      const dx = Math.max(rectA.x - (rectB.x + rectB.width), rectB.x - (rectA.x + rectA.width), 0);
      const dy = Math.max(rectA.y - (rectB.y + rectB.height), rectB.y - (rectA.y + rectA.height), 0);

      return Math.hypot(dx, dy);
    }

    _distanceBetweenRectSets(rectsA, rectsB) {
      let minDistance = Infinity;

      for (const rectA of rectsA) {
        for (const rectB of rectsB) {
          minDistance = Math.min(minDistance, this._rectDistance(rectA, rectB));
        }
      }

      return minDistance;
    }

    _getStrokeMergeTolerance() {
      return this.opts.strokeMergeTolerance ?? Math.max(this.opts.radius * 1.1, this.opts.detectTolerance * 3);
    }

    _getStrokeMergeDomGap() {
      return Math.max(0, Number(this.opts.strokeMergeDomGap) || 0);
    }

    _getFragmentRangeFromIndices(indices) {
      if (!indices?.length) return null;

      return {
        start: indices[0],
        end: indices[indices.length - 1]
      };
    }

    _getFragmentRangeFromFragments(fragments) {
      if (!fragments?.length) return null;

      return {
        start: fragments[0].index,
        end: fragments[fragments.length - 1].index
      };
    }

    _getFragmentRangeGap(rangeA, rangeB) {
      if (!rangeA || !rangeB) return Infinity;
      if (rangeA.end >= rangeB.start && rangeB.end >= rangeA.start) return 0;
      if (rangeA.end < rangeB.start) return rangeB.start - rangeA.end - 1;
      return rangeA.start - rangeB.end - 1;
    }

    _hasWhitespaceOnlyBridge(rangeA, rangeB) {
      if (!rangeA || !rangeB) return false;

      const leftRange = rangeA.start <= rangeB.start ? rangeA : rangeB;
      const rightRange = leftRange === rangeA ? rangeB : rangeA;

      if (leftRange.end >= rightRange.start - 1) {
        return true;
      }

      for (let index = leftRange.end + 1; index < rightRange.start; index++) {
        const fragment = this.fragments[index];
        if (!fragment || !/^\s+$/.test(fragment.text)) {
          return false;
        }
      }

      return true;
    }

    _findMergeTarget(candidateRects, validFragments = []) {
      // Time, visual proximity, and DOM gap all participate. DOM adjacency is
      // especially important where a phrase wraps between rendered lines.
      const now = performance.now();
      const maxAge = this.opts.strokeMergeTime;
      const maxDistance = this._getStrokeMergeTolerance();
      const maxDomGap = this._getStrokeMergeDomGap();
      const candidateRange = this._getFragmentRangeFromFragments(validFragments);
      let bestSelection = null;
      let bestTouches = false;
      let bestDomGap = Infinity;
      let bestDistance = Infinity;

      for (const selection of this.selectionGroups) {
        if (selection.isDismissing) continue;

        const distance = this._distanceBetweenRectSets(selection.finalRects, candidateRects);
        const selectionRange = this._getFragmentRangeFromIndices(selection.fragmentIndices);
        const domGap = this._getFragmentRangeGap(selectionRange, candidateRange);
        const touchingEligible = this._hasWhitespaceOnlyBridge(selectionRange, candidateRange);
        const recentEnough = now - selection.lastUpdatedAt <= maxAge;
        const domEligible = domGap <= maxDomGap;
        const distanceEligible = distance <= maxDistance;

        if (touchingEligible) {
          if (
            !bestTouches ||
            domGap < bestDomGap ||
            (domGap === bestDomGap && distance < bestDistance)
          ) {
            bestSelection = selection;
            bestTouches = true;
            bestDomGap = domGap;
            bestDistance = distance;
          }

          continue;
        }

        if (!recentEnough || bestTouches) {
          continue;
        }

        if (
          // Wrapped line endings can be visually far apart while still being
          // adjacent in DOM order, so DOM gap gets first priority when allowed.
          (domEligible && (
            domGap < bestDomGap ||
            (domGap === bestDomGap && distance < bestDistance)
          )) ||
          (!domEligible && bestDomGap === Infinity && distanceEligible && distance < bestDistance)
        ) {
          bestSelection = selection;
          bestDomGap = domGap;
          bestDistance = distance;
        }
      }

      return bestSelection;
    }

    _findEraseTargets(eraseIndices) {
      if (!eraseIndices?.size) {
        return [];
      }

      return this.selectionGroups.filter(selection =>
        !selection.isDismissing &&
        selection.fragmentIndices.some(index => eraseIndices.has(index))
      );
    }

    _subtractSelectionFragments(selection, eraseIndices) {
      // Erasing edits the semantic fragment set first; text, bounds, rectangles,
      // and stamps are then rebuilt from the survivors.
      if (!selection || !eraseIndices?.size) {
        return [];
      }

      const remainingFragments = selection.fragmentIndices
        .filter(index => !eraseIndices.has(index))
        .map(index => this.fragments[index])
        .filter(Boolean);

      return this._normalizeErasedFragments(remainingFragments);
    }

    _finalizeEraseSelection(validFragments) {
      if (!this._canUseErase() || !validFragments.length) {
        return;
      }

      const eraseIndices = new Set(validFragments.map(fragment => fragment.index));
      const targets = this._findEraseTargets(eraseIndices);

      if (!targets.length) {
        return;
      }

      let activeSelection = null;

      for (const selection of targets) {
        this._clearPopupTimer(selection);
        this._hidePopup(selection);

        const nextFragments = this._subtractSelectionFragments(selection, eraseIndices);

        if (!nextFragments.length) {
          this._removeSelection(selection);
          continue;
        }

        this._updateSelectionRecord(selection, nextFragments);
        activeSelection = selection;
      }

      const visibleSelections = this._getLocalSelections(false);
      this.currentSelection = activeSelection && visibleSelections.includes(activeSelection)
        ? activeSelection
        : visibleSelections[visibleSelections.length - 1] || null;
      this._syncRegistrySelections();

      if (this.currentSelection) {
        this._schedulePopup(this.currentSelection);
      }
    }

    _mergeSelectionFragments(selection, validFragments) {
      const indices = new Set(selection.fragmentIndices);

      for (const fragment of validFragments) {
        indices.add(fragment.index);
      }

      const sorted = [...indices].sort((a, b) => a - b);
      const mergedFragments = [];

      // When two strokes merge we fill the full DOM interval between them. Keeping
      // two fragment islands here caused wrapped lines to behave like separate picks.
      for (let index = sorted[0]; index <= sorted[sorted.length - 1]; index++) {
        const fragment = this.fragments[index];
        if (fragment) {
          mergedFragments.push(fragment);
        }
      }

      return this._normalizeSelectionContinuity(this._expandFinalFragments(mergedFragments));
    }

    _addSelection(selection) {
      if (!selection) return;

      this.selectionGroups.push(selection);
      this.currentSelection = selection;
      this._syncRegistrySelections();
      this._schedulePopup(selection);
    }

    _removeSelection(selection) {
      if (!selection) return;

      this._clearPopupTimer(selection);
      this._setSelectionCopied(selection, false);
      this._hidePopup(selection);
      this._destroySelectionPopup(selection);
      this.selectionGroups = this.selectionGroups.filter(candidate => candidate !== selection);

      if (this.currentSelection === selection) {
        const remaining = this.selectionGroups.filter(candidate => !candidate.isDismissing);
        this.currentSelection = remaining[remaining.length - 1] || null;
      }

      this._syncRegistrySelections();
    }

    _dismissSelection(selection) {
      if (!selection || selection.isDismissing) return;

      // Dismissal is animated rather than immediate removal so the selection can
      // fade out after Cancel/autoClose without visually snapping away.
      this._clearPopupTimer(selection);
      this._setSelectionCopied(selection, false);
      this._hidePopup(selection);
      selection.isDismissing = true;
      selection.finalVisibility = Math.max(selection.finalVisibility, Math.max(selection.finalProgress, 0.35));

      if (this.currentSelection === selection) {
        const remaining = this.selectionGroups.filter(candidate => candidate !== selection && !candidate.isDismissing);
        this.currentSelection = remaining[remaining.length - 1] || null;
      }

      this._syncRegistrySelections();
    }

    _dismissAllSelections() {
      for (const selection of this.selectionGroups) {
        this._dismissSelection(selection);
      }
    }

    _dismissOtherSelections(exceptSelection) {
      for (const selection of this.selectionGroups) {
        if (selection !== exceptSelection) {
          this._dismissSelection(selection);
        }
      }
    }

    _getLocalSelections(copiedOnly = false) {
      // Reading order wins over creation order, so several strokes copy like
      // ordinary text even when they were drawn out of sequence.
      return this.selectionGroups
        .filter(selection => !selection.isDismissing && (!copiedOnly || selection.copied))
        .sort((a, b) => this._compareLocalSelections(a, b));
    }

    _getWrapperConfig(selectionCount) {
      if (this.opts.wrapper) {
        if (selectionCount > 1 && this.opts.wrapper.multi) {
          return this.opts.wrapper.multi;
        }

        if (selectionCount === 1 && this.opts.wrapper.single) {
          return this.opts.wrapper.single;
        }

        return this.opts.wrapper;
      }

      if (selectionCount > 1) {
        return {
          before: '',
          after: '\n\n'
        };
      }

      return {
        before: '',
        after: ''
      };
    }

    _applyWrapper(text, wrapper) {
      return `${wrapper.before || ''}${text}${wrapper.after || ''}`;
    }

    _buildClipboardText(selections) {
      if (!selections.length) return '';

      const wrapper = this._getWrapperConfig(selections.length);
      return selections
        .map(selection => this._applyWrapper(selection.text, wrapper))
        .join('');
    }

    _writeClipboardText(text) {
      const fallbackCopy = () => new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
          const copied = document.execCommand('copy');
          document.body.removeChild(textarea);

          if (!copied) {
            reject(new Error('Copy command was rejected.'));
            return;
          }

          resolve();
        } catch (error) {
          document.body.removeChild(textarea);
          reject(error);
        }
      });

      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => fallbackCopy());
      }

      return fallbackCopy();
    }

    /*
      Public instance API

      copySelection(selectionId?)
      - marks one local selection as copied
      - if a shared registry is present, clipboard text is built from every copied
        selection in shared DOM order, not just from this instance
      - autoClose=true dismisses the copied selection after a successful write

      copyAllSelections()
      - marks and copies every visible selection in the local or shared scope

      clearAllSelections()
      - dismisses every visible selection in the local or shared scope

      cancelSelection(selectionId?)
      - hides popup immediately and fades the cloud out
      - does not hard-delete the selection until the dismiss animation finishes

      getSelectionState()
      - debugging/introspection helper used by future tuning sessions
      - returns the current visible selection plus the local selection list
      - fragmentIndices are the most important field for diagnosing bad resolution
    */
    async copySelection(selectionId = this.currentSelection?.id) {
      const selection = this._findSelectionById(selectionId) || this.currentSelection;
      if (!selection) return false;

      const previousCopied = selection.copied;
      let selectionsToCopy = [];

      this.currentSelection = selection;
      this._setSelectionCopied(selection, true);

      if (this.registryState) {
        selectionsToCopy = collectRegistrySelections(this.registryState, true);
        this._broadcastRegistryUpdate();
      } else {
        selectionsToCopy = this._getLocalSelections(true);
        this._syncAllPopupStates();
      }

      const clipboardText = this._buildClipboardText(selectionsToCopy);

      try {
        await this._writeClipboardText(clipboardText);

        if (this.opts.autoClose) {
          this.cancelSelection(selection.id);
        }

        return true;
      } catch (error) {
        this._setSelectionCopied(selection, previousCopied);
        this._broadcastRegistryUpdate();

        if (this.opts.debug) {
          console.error('airtest2 copy failed', error);
        }

        return false;
      }
    }

    _getSelectionsInScope(copiedOnly = false) {
      return this.registryState
        ? collectRegistrySelections(this.registryState, copiedOnly)
        : this._getLocalSelections(copiedOnly);
    }

    _getSelectionOwner(selection) {
      return GLOBAL_STATE.instances.find(instance => instance.instanceId === selection?.instanceId) || this;
    }

    async copyAllSelections() {
      const selections = this._getSelectionsInScope(false);
      if (!selections.length) return false;

      const previousCopiedStates = new Map(
        selections.map(selection => [selection.id, Boolean(selection.copied)])
      );

      for (const selection of selections) {
        this._setSelectionCopied(selection, true);
      }

      this._broadcastRegistryUpdate();
      const clipboardText = this._buildClipboardText(selections);

      try {
        await this._writeClipboardText(clipboardText);

        if (this.opts.autoClose) {
          this.clearAllSelections();
        }

        return true;
      } catch (error) {
        for (const selection of selections) {
          this._setSelectionCopied(
            selection,
            previousCopiedStates.get(selection.id)
          );
        }

        this._broadcastRegistryUpdate();

        if (this.opts.debug) {
          console.error('clean selection copy all failed', error);
        }

        return false;
      }
    }

    clearAllSelections() {
      const selections = this._getSelectionsInScope(false);

      for (const selection of selections) {
        this._getSelectionOwner(selection)._dismissSelection(selection);
      }
    }

    cancelSelection(selectionId = this.currentSelection?.id) {
      const selection = this._findSelectionById(selectionId) || this.currentSelection;

      if (!selection) {
        return;
      }

      this._dismissSelection(selection);
    }

    destroy() {
      // Restore host styles and unregister global/shared state so dynamic pages can
      // attach and dispose instances without accumulating invisible handlers.
      if (this.destroyed) return this;
      this.destroyed = true;

      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = 0;
      }

      for (const selection of this.selectionGroups) {
        this._clearPopupTimer(selection);
        this._setSelectionCopied(selection, false);
        this._destroySelectionPopup(selection);
      }

      this.selectionGroups = [];
      this.currentSelection = null;
      this.registryState?.entries.delete(this.instanceId);

      if (this.boundEvents) {
        this.el.removeEventListener('pointerdown', this.boundEvents.elementPointerDown, true);
        window.removeEventListener('pointerdown', this.boundEvents.windowPointerDown, true);
        this.el.removeEventListener('contextmenu', this.boundEvents.contextMenu, true);
        this.el.removeEventListener('click', this.boundEvents.click, true);
        this.el.removeEventListener('dragstart', this.boundEvents.dragStart, true);
        window.removeEventListener('pointermove', this.boundEvents.pointerMove, true);
        window.removeEventListener('pointerup', this.boundEvents.pointerEnd, true);
        window.removeEventListener('pointercancel', this.boundEvents.pointerEnd, true);
        window.removeEventListener('scroll', this.boundEvents.positionPopups, true);
        window.removeEventListener('resize', this.boundEvents.positionPopups);
        window.visualViewport?.removeEventListener('scroll', this.boundEvents.positionPopups);
        window.visualViewport?.removeEventListener('resize', this.boundEvents.positionPopups);
      }

      this.resizeObserver?.disconnect();
      if (this.fallbackResizeListener) {
        window.removeEventListener('resize', this.fallbackResizeListener);
      }

      this.interactionSurface?.remove();
      this.canvas?.remove();
      this.el.style.position = this.originalStyles.position;
      this.el.style.touchAction = this.originalStyles.touchAction;
      this.el.style.userSelect = this.originalStyles.userSelect;
      this.el.style.webkitUserSelect = this.originalStyles.webkitUserSelect;
      this.el.style.cursor = this.originalStyles.cursor;

      GLOBAL_STATE.instances = GLOBAL_STATE.instances.filter(instance => instance !== this);
      if (GLOBAL_STATE.touchEraseBarManager?.activeSession?.instance === this) {
        GLOBAL_STATE.touchEraseBarManager.activeSession = null;
      }
      this._broadcastRegistryUpdate();
      GLOBAL_STATE.touchEraseBarManager?.sync();
      return this;
    }

    updateOptions(nextOpts = {}) {
      // Options are hot-swappable. Geometry and interaction surfaces are rebuilt
      // only as needed; existing semantic selections remain owned by the instance.
      if (!nextOpts || typeof nextOpts !== 'object') {
        return this;
      }

      Object.assign(this.opts, nextOpts);
      this._refreshCanvasPadding();

      if (this.canvas) {
        this.canvas.style.left = `${-this.padding}px`;
        this.canvas.style.top = `${-this.padding}px`;
      }

      this._applyRestingInteractionStyles();
      this._clearSelectionState();
      this._resizeCanvases();
      this._collectFragments();
      this._clearFog();
      this._syncTouchEraseBarRegistration();

      return this;
    }

    getSelectionState() {
      const visibleSelections = this._getLocalSelections(false);
      const currentSelection = this.currentSelection && !this.currentSelection.isDismissing
        ? this.currentSelection
        : visibleSelections[visibleSelections.length - 1] || null;

      if (!currentSelection) return null;

      return {
        selectionCount: visibleSelections.length,
        currentSelectionId: currentSelection.id,
        fragmentIndices: [...currentSelection.state.fragmentIndices],
        fragmentCount: currentSelection.state.fragmentCount,
        textPreview: currentSelection.state.textPreview,
        bounds: currentSelection.state.bounds ? { ...currentSelection.state.bounds } : null,
        copied: Boolean(currentSelection.copied),
        popupVisible: Boolean(
          currentSelection.popup &&
          !currentSelection.popup.hidden &&
          currentSelection.popup.style.visibility !== 'hidden'
        ),
        rects: currentSelection.state.rects.map(rect => ({ ...rect })),
        selections: visibleSelections.map(selection => ({
          id: selection.id,
          order: selection.order,
          textPreview: selection.state.textPreview,
          copied: selection.copied,
          bounds: selection.state.bounds ? { ...selection.state.bounds } : null,
          rects: selection.state.rects.map(rect => ({ ...rect }))
        }))
      };
    }

    _render() {
      // A single animation loop composites transient fog and durable selection
      // clouds, and advances all fade/grow transitions from one clock.
      if (this.destroyed) return;
      this.animationFrame = requestAnimationFrame(this._render);
      this.time += 0.016;

      if (this.fogFadeFramesRemaining > 0) {
        this.fogCtx.save();
        this.fogCtx.globalCompositeOperation = 'destination-out';
        this.fogCtx.fillStyle = `rgba(0,0,0,${this.opts.fadeSpeed})`;
        this.fogCtx.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        this.fogCtx.restore();

        this.fogFadeFramesRemaining -= 1;

        if (this.fogFadeFramesRemaining === 0) {
          this._clearFog();
        }
      }

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const erasePreviewActive = this._isEraseMode();
      if (!erasePreviewActive) {
        this.ctx.drawImage(this.fogCanvas, 0, 0);
      }

      // Fog and finalized selections are rendered separately. Fog is transient
      // in-progress state; finalized clouds are durable selection groups that can
      // merge, copy, dismiss, and animate independently.
      for (const selection of [...this.selectionGroups]) {
        const copiedTarget = selection.copied && Array.isArray(this.opts.copiedColor) ? 1 : 0;
        const copiedSpeed = Math.max(0, Number(this.opts.copiedColorMorphSpeed) || 0);

        if (selection.copiedProgress < copiedTarget) {
          selection.copiedProgress = Math.min(copiedTarget, selection.copiedProgress + copiedSpeed);
        } else if (selection.copiedProgress > copiedTarget) {
          selection.copiedProgress = Math.max(copiedTarget, selection.copiedProgress - copiedSpeed);
        }

        if (selection.finalStamps.length && selection.finalProgress < 1) {
          selection.finalProgress = Math.min(1, selection.finalProgress + this.opts.finalGrowSpeed);
        }

        if (selection.isDismissing) {
          selection.finalVisibility = Math.max(0, selection.finalVisibility - this.opts.dismissSpeed);

          if (selection.finalVisibility === 0) {
            this._removeSelection(selection);
            continue;
          }
        }

        if (selection.finalStamps.length && selection.finalProgress > 0 && selection.finalVisibility > 0) {
          this._drawFinalSelection(selection);
        }
      }

      if (erasePreviewActive) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.drawImage(this.fogCanvas, 0, 0);
        this.ctx.restore();
      }
    }

    _drawFinalSelection(selection) {
      const eased = (1 - Math.pow(1 - selection.finalProgress, 3)) * selection.finalVisibility;
      const coreScale = 0.42 + eased * 0.58;
      const glowScale = 0.6 + eased * 0.72;
      const color = this._getSelectionRenderColor(selection);

      this.ctx.save();
      this._sprayFinalCloud(this.ctx, selection.finalStamps, {
        scale: glowScale,
        expansion: this.opts.radius * 0.12,
        alpha: this.opts.finalAlpha * 0.28 * eased,
        edge: 0.68,
        color
      });
      this._sprayFinalCloud(this.ctx, selection.finalStamps, {
        scale: coreScale,
        expansion: 0,
        alpha: this.opts.finalAlpha * 0.56 * eased,
        edge: 0.52,
        color
      });
      this.ctx.restore();
    }

    _sprayFinalCloud(ctx, stamps, { scale, expansion, alpha, edge, color }) {
      for (const stamp of stamps) {
        const radius = Math.max(1, stamp.radius * scale + expansion);
        const x = stamp.x + this.padding;
        const y = stamp.y + this.padding;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

        gradient.addColorStop(0, this._rgba(alpha, color));
        gradient.addColorStop(edge, this._rgba(alpha * 0.46, color));
        gradient.addColorStop(1, this._rgba(0, color));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _getSelectionRenderColor(selection) {
      const baseColor = this.opts.color;
      const copiedColor = Array.isArray(this.opts.copiedColor)
        ? this.opts.copiedColor
        : baseColor;
      const progress = Math.max(0, Math.min(1, Number(selection?.copiedProgress) || 0));

      return baseColor.map((channel, index) =>
        Math.round(channel + ((copiedColor[index] ?? channel) - channel) * progress)
      );
    }

    _signedNoise(a, b, c) {
      const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
      return (value - Math.floor(value)) * 2 - 1;
    }

    _getActiveBrushColor() {
      return this._isEraseMode() ? this.opts.eraseColor : this.opts.color;
    }

    _rgba(a, color = this.opts.color) {
      const [r, g, b] = color;
      return `rgba(${r},${g},${b},${a})`;
    }
  }

  function getTouchEraseModeManager() {
    if (!GLOBAL_STATE.touchEraseBarManager) {
      GLOBAL_STATE.touchEraseBarManager = new TouchEraseBarManager();
    }

    return GLOBAL_STATE.touchEraseBarManager;
  }

  const TOUCH_ERASE_MODE_CONTROLLER = Object.freeze({
    setMode(mode) {
      getTouchEraseModeManager().setMode(mode);
      return this;
    },

    getMode() {
      return getTouchEraseModeManager().mode;
    },

    getState() {
      return getTouchEraseModeManager().getState();
    },

    subscribe(listener) {
      return getTouchEraseModeManager().subscribe(listener);
    }
  });

  // Public popup helpers:
  // - popupThemeTokens: default CSS variable values for the built-in popup theme
  // - createPopupShell(className): shadow-DOM host with shared popup theme styles only
  // - createDefaultPopupDom(className): built-in popup DOM, useful as a customization baseline
  CleanSelection.popupThemeTokens = POPUP_THEME_TOKENS;
  CleanSelection.version = '1.1.0';
  CleanSelection.touchEraseBarThemeTokens = TOUCH_ERASE_BAR_THEME;
  CleanSelection.touchEraseBarLayoutDefaults = TOUCH_ERASE_BAR_LAYOUT;
  CleanSelection.createPopupShell = createPopupShell;
  CleanSelection.createDefaultPopupDom = createDefaultPopupDom;
  CleanSelection.getModeController = () => TOUCH_ERASE_MODE_CONTROLLER;

  window.CleanSelection = CleanSelection;

})()
