/*!
 * Re:Likes v1.1.0
 * Passage-level like and dislike reactions for the web.
 *
 * Copyright (c) 2026 kotoverse
 * Author: kotoverse
 * @license MIT
 * Licensed under the MIT License.
 * License: https://opensource.org/license/mit/
 * Project and live demo: https://relikes.com/
 * Source: https://github.com/reinventinglikes/relikes
 *
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: MIT
 */
(function () {
  /*
    Core data flow:
    Clean Selection capture -> durable quote anchor -> local reaction store ->
    reaction cloud. Optional backend sync uploads normalized runs and returns
    aggregate offset segments, which are resolved through the same content index.
  */

  const DEFAULT_COLORS = Object.freeze({
    selection: [90, 168, 255],
    like: [85, 185, 111],
    dislike: [223, 131, 137]
  });

  const DEFAULT_GEOMETRY = Object.freeze({
    radius: 18,
    paddingRatio: 0.32,
    detectTolerance: 3,
    overlayPadding: 72
  });

  const DEFAULT_HEATMAP = Object.freeze({
    scale: 'linear',
    minAlpha: 0,
    maxAlpha: 0.48,
    includeLocalReactions: true,
    overlapMode: 'split'
  });

  const DEFAULT_BACKEND_SYNC = Object.freeze({
    saveDebounceMs: 1200,
    minWriteIntervalMs: 5000,
    retryBaseMs: 5000,
    retryMaxMs: 60000,
    credentials: 'same-origin'
  });

  const DEFAULT_BACKEND_ROUTES = Object.freeze({
    session: Object.freeze({ url: '?action=session', method: 'POST' }),
    reactions: Object.freeze({ url: '?action=reactions', method: 'PUT' }),
    heatmap: Object.freeze({ url: '?action=heatmap', method: 'GET' })
  });

  const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

  /*
    Re:Likes is local-first: reactions are committed to this small store before
    any network work begins. localStorage provides persistence, while the memory
    copy keeps the interaction functional when storage is unavailable or blocked.
  */
  class LocalReactionStore {
    constructor(storageKey) {
      this.storageKey = storageKey;
      this.memory = createEmptyStore();
    }

    read() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return cloneStore(this.memory);

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return createEmptyStore();

        return {
          reactions: Array.isArray(parsed.reactions) ? parsed.reactions : []
        };
      } catch (error) {
        return cloneStore(this.memory);
      }
    }

    write(nextStore) {
      this.memory = cloneStore(nextStore);

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(nextStore));
      } catch (error) {
        this.memory = cloneStore(nextStore);
      }
    }

    listReactions(docId) {
      return this.read().reactions
        .filter(reaction => reaction.docId === docId)
        .sort((left, right) => {
          const leftTime = Date.parse(left.updatedAt || left.createdAt || 0);
          const rightTime = Date.parse(right.updatedAt || right.createdAt || 0);
          return rightTime - leftTime;
        });
    }

    saveReaction(reaction) {
      // Anchor signatures identify the same semantic passage across refreshes;
      // IDs alone cannot, because merged or restored reactions may be recreated.
      const store = this.read();
      const signature = getAnchorSignature(reaction.anchor);
      const index = store.reactions.findIndex(candidate =>
        candidate.docId === reaction.docId &&
        candidate.userId === reaction.userId &&
        candidate.kind === reaction.kind &&
        getAnchorSignature(candidate.anchor) === signature
      );

      if (index >= 0) {
        store.reactions[index] = {
          ...store.reactions[index],
          ...reaction,
          id: store.reactions[index].id,
          updatedAt: new Date().toISOString()
        };
      } else {
        store.reactions.unshift(reaction);
      }

      this.write(store);
      return this.listReactions(reaction.docId);
    }

    removeReaction(reactionId) {
      const store = this.read();
      store.reactions = store.reactions.filter(reaction => reaction.id !== reactionId);
      this.write(store);
    }

    clearUser(docId, userId) {
      const store = this.read();
      store.reactions = store.reactions.filter(reaction =>
        !(reaction.docId === docId && reaction.userId === userId)
      );
      this.write(store);
    }
  }

  /*
    The API client owns protocol details only: identity, route resolution,
    revisions, authentication, and response validation. Scheduling and visual
    updates are deliberately handled by RelikesBackendSync below.
  */
  class RelikesApiClient {
    constructor(instance, options) {
      this.instance = instance;
      this.opts = options;
      this.backendDocumentId = options.documentId || instance.opts.docId;
      this.currentIdentityScope = '';
      this.currentState = createEmptyBackendState();
      this.memoryTokenRecord = null;
      this.endpointScope = hashStorageScope(options.url);
      this.tokenStorageKey = options.tokenStorageKey ||
        'relikes-api-token-v1-' + this.endpointScope;
      this.stateStorageKeyBase = options.stateStorageKey ||
        'relikes-api-state-v1-' + this.endpointScope + '-' +
        hashStorageScope(options.documentVersion);
    }

    getState() {
      const userId = this.getUserId();
      this.selectIdentityState(userId);

      return {
        url: this.opts.url,
        documentId: this.backendDocumentId,
        documentVersion: this.opts.documentVersion,
        userId,
        identityType: userId === null ? 'anonymous' : 'registered',
        clientRevision: Math.max(0, Number(this.currentState.clientRevision) || 0),
        hasAnonymousSession: userId === null && Boolean(this.getStoredToken())
      };
    }

    async initialize(snapshot) {
      // The acknowledged fingerprint distinguishes an unsent local snapshot from
      // one the server has already accepted. Fresh empty readers can go directly
      // to a public heatmap without creating an anonymous identity.
      const userId = this.getUserId();
      this.selectIdentityState(userId);
      const fingerprint = getBackendSnapshotFingerprint(snapshot);
      const token = userId === null ? this.getStoredToken() : null;
      const shouldSave = userId === null
        ? (token
          ? this.currentState.acknowledgedFingerprint !== fingerprint
          : snapshot.reactions.length > 0)
        : (this.currentState.acknowledgedFingerprint === null
          ? snapshot.reactions.length > 0
          : this.currentState.acknowledgedFingerprint !== fingerprint);

      return shouldSave
        ? this.saveSnapshot(snapshot)
        : this.loadHeatmap({ snapshot });
    }

    async saveSnapshot(snapshot) {
      // Snapshots replace one subject's complete state. Monotonic client revisions
      // and mutation IDs make retries safe without defining a per-reaction API.
      const userId = this.getUserId();
      this.selectIdentityState(userId);
      const fingerprint = getBackendSnapshotFingerprint(snapshot);
      const existingToken = userId === null ? this.getStoredToken() : null;

      if (
        userId === null &&
        !existingToken &&
        !snapshot.reactions.length &&
        this.currentState.acknowledgedFingerprint === null
      ) {
        return this.loadHeatmap({ snapshot });
      }

      if (
        (userId !== null || existingToken) &&
        this.currentState.acknowledgedFingerprint === fingerprint
      ) {
        return this.loadHeatmap({ snapshot });
      }

      const clientRevision = Math.max(
        0,
        Number(this.currentState.clientRevision) || 0
      ) + 1;
      const payload = {
        schema: 1,
        documentId: this.backendDocumentId,
        documentVersion: this.opts.documentVersion,
        contentLength: snapshot.contentLength,
        clientRevision,
        mutationId: createId('mutation'),
        reactions: snapshot.reactions,
        ...(userId === null ? {} : { userId })
      };
      this.currentState.clientRevision = clientRevision;
      this.persistState();

      let token = userId === null ? await this.ensureToken() : null;
      let response;

      try {
        response = await this.request('reactions', {
          token,
          body: payload
        });
      } catch (error) {
        if (userId === null && error?.status === 401) {
          this.clearStoredToken();
          token = await this.ensureToken();
          response = await this.request('reactions', {
            token,
            body: payload
          });
        } else {
          if (error?.status === 409) this.updateRevisionFromConflict(error);
          throw error;
        }
      }

      if (!response?.ok || !Number.isFinite(Number(response?.clientRevision))) {
        throw createBackendError(
          'invalid_backend_response',
          'The Re:Likes API returned an invalid save response.'
        );
      }

      this.currentState.clientRevision = Math.max(
        clientRevision,
        Number(response.clientRevision) || 0
      );
      this.currentState.acknowledgedFingerprint = fingerprint;
      this.persistState();
      return this.loadHeatmap({ snapshot });
    }

    async loadHeatmap(context = {}) {
      const userId = this.getUserId();
      this.selectIdentityState(userId);
      let token = userId === null ? this.getStoredToken() : null;
      const requestHeatmap = requestToken => this.request('heatmap', {
        token: requestToken,
        params: {
          documentId: this.backendDocumentId,
          documentVersion: this.opts.documentVersion,
          // A fresh anonymous reader has no reactions to exclude. Keeping this
          // request public also avoids creating a server session on page view.
          ...(userId !== null || requestToken
            ? { excludeCurrentUser: '1' }
            : {}),
          ...(userId === null ? {} : { userId })
        },
        context
      });
      let response;

      try {
        response = await requestHeatmap(token);
      } catch (error) {
        if (userId === null && error?.status === 401 && token) {
          this.clearStoredToken();
          token = null;
          response = await requestHeatmap(token);
        } else {
          throw error;
        }
      }

      if (response?.schema !== 1 || !Array.isArray(response?.segments)) {
        throw createBackendError(
          'invalid_backend_response',
          'The Re:Likes API returned an invalid heatmap response.'
        );
      }

      return response;
    }

    async ensureToken() {
      // Anonymous identity is lazy: a token is issued only when a write needs it,
      // not merely because someone viewed a heatmap-enabled page.
      const existing = this.getStoredToken();
      if (existing) return existing;

      const response = await this.request('session');
      const record = {
        token: String(response?.token || ''),
        expiresAt: String(response?.expiresAt || '')
      };
      if (!record.token) {
        throw createBackendError(
          'invalid_backend_response',
          'The Re:Likes API did not return an anonymous session token.'
        );
      }

      this.memoryTokenRecord = record;
      writeBackendStorageJson(this.tokenStorageKey, record);
      return record.token;
    }

    getStoredToken() {
      const record = readBackendStorageJson(
        this.tokenStorageKey,
        this.memoryTokenRecord
      );
      if (!record?.token) return null;
      this.memoryTokenRecord = record;

      const expiresAt = Date.parse(record.expiresAt || '');
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60000) {
        this.clearStoredToken();
        return null;
      }

      return String(record.token);
    }

    clearStoredToken() {
      this.memoryTokenRecord = null;
      try {
        localStorage.removeItem(this.tokenStorageKey);
      } catch (error) {
        // A page-scoped anonymous session remains possible without persistence.
      }
    }

    getUserId() {
      const value = typeof this.opts.userId === 'function'
        ? this.opts.userId()
        : this.opts.userId;
      if (value === undefined || value === null || value === '') return null;
      return String(value);
    }

    selectIdentityState(userId) {
      // Anonymous and registered sessions cannot share revision/fingerprint state;
      // switching identity therefore selects a separate local synchronization key.
      const identityScope = userId === null
        ? 'anonymous'
        : 'registered-' + hashStorageScope(userId);
      if (identityScope === this.currentIdentityScope) return;

      this.currentIdentityScope = identityScope;
      this.currentState = readBackendStorageJson(
        this.getStateStorageKey(),
        createEmptyBackendState()
      );
    }

    getStateStorageKey() {
      return this.stateStorageKeyBase + '-' +
        hashStorageScope(this.backendDocumentId) + '-' +
        this.currentIdentityScope;
    }

    persistState() {
      writeBackendStorageJson(this.getStateStorageKey(), this.currentState);
    }

    updateRevisionFromConflict(error) {
      const storedRevision = Number(error?.details?.storedClientRevision);
      if (!Number.isFinite(storedRevision)) return;

      this.currentState.clientRevision = Math.max(
        Number(this.currentState.clientRevision) || 0,
        storedRevision
      );
      this.persistState();
    }

    async request(operation, requestOptions = {}) {
      // A request callback can wrap or replace fetch for CMS adapters, test rigs,
      // and nonstandard transports while preserving one route/response contract.
      const route = this.resolveRoute(operation, requestOptions);
      const url = resolveBackendRequestUrl(route.url, this.opts.url);
      if (route.appendParams !== false) {
        for (const [key, value] of Object.entries(requestOptions.params || {})) {
          url.searchParams.set(key, String(value));
        }
      }

      const configuredHeaders = typeof this.opts.headers === 'function'
        ? this.opts.headers({ operation, url, requestOptions })
        : this.opts.headers;
      const headers = {
        Accept: 'application/json',
        ...(configuredHeaders || {})
      };
      if (requestOptions.token) {
        headers.Authorization = 'Bearer ' + requestOptions.token;
      }
      if (requestOptions.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const init = {
        method: route.method,
        credentials: this.opts.credentials,
        headers,
        body: requestOptions.body === undefined
          ? undefined
          : JSON.stringify(requestOptions.body),
        cache: 'no-store'
      };
      const requestContext = {
        operation,
        url,
        init,
        params: requestOptions.params || {},
        body: requestOptions.body,
        defaultRequest: () => this.opts.fetch(url, init)
      };
      const result = this.opts.request
        ? await this.opts.request(requestContext)
        : await requestContext.defaultRequest();

      return this.parseResponse(result);
    }

    resolveRoute(operation, requestOptions) {
      const configured = this.opts.routes[operation];
      const resolved = typeof configured === 'function'
        ? configured({
          operation,
          documentId: this.backendDocumentId,
          documentVersion: this.opts.documentVersion,
          userId: this.getUserId(),
          params: requestOptions.params || {},
          body: requestOptions.body
        })
        : configured;
      const fallback = DEFAULT_BACKEND_ROUTES[operation];
      const route = typeof resolved === 'string'
        ? { ...fallback, url: resolved }
        : { ...fallback, ...(resolved || {}) };

      return {
        url: String(route.url),
        method: String(route.method || fallback.method).toUpperCase(),
        appendParams: route.appendParams !== false
      };
    }

    async parseResponse(result) {
      if (
        result &&
        typeof result === 'object' &&
        typeof result.json === 'function' &&
        typeof result.ok === 'boolean'
      ) {
        const data = await result.json().catch(() => null);
        if (!result.ok) {
          const error = createBackendError(
            data?.error?.code || 'backend_request_failed',
            data?.error?.message || 'The Re:Likes API request failed.'
          );
          error.status = result.status;
          error.details = data?.error?.details || {};
          throw error;
        }
        return data;
      }

      return result;
    }
  }

  /*
    The core owns synchronization and the canonical Re:Likes API client. URL,
    route, identity, headers, and request behavior are initialization options.
  */
  class RelikesBackendSync {
    constructor(instance, options) {
      this.instance = instance;
      this.opts = options;
      this.api = new RelikesApiClient(instance, options);
      this.timerId = 0;
      this.inFlight = null;
      this.dirty = false;
      this.started = false;
      this.retryCount = 0;
      this.lastWriteAt = 0;
      this.status = 'idle';
      this.error = null;
      this.retryOperation = 'refresh';
      this.destroyed = false;

      this.onlineListener = () => {
        if (this.destroyed) return;
        window.clearTimeout(this.timerId);
        this.timerId = 0;

        if (this.dirty || this.retryOperation === 'save') {
          this.scheduleSync(0);
        } else {
          this.refreshHeatmap().catch(error => this.handleError(error, 'refresh'));
        }
      };
      window.addEventListener('online', this.onlineListener);
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.initialize().catch(error => this.handleError(error, 'refresh'));
    }

    getState() {
      let apiState = null;

      try {
        apiState = this.api.getState();
      } catch (error) {
        apiState = null;
      }

      return {
        enabled: true,
        status: this.status,
        error: this.error,
        pending: this.dirty || Boolean(this.timerId) || Boolean(this.inFlight),
        lastWriteAt: this.lastWriteAt || null,
        api: apiState
      };
    }

    getSnapshot() {
      // Backend snapshots contain normalized text runs rather than local reaction
      // IDs, timestamps, or rendering data. The server only needs canonical state.
      return {
        schema: 1,
        documentId: this.instance.opts.docId,
        contentLength: this.instance.index?.text?.length || 0,
        reactions: buildBackendReactions(this.instance)
      };
    }

    getContext(snapshot = this.getSnapshot()) {
      return {
        instance: this.instance,
        documentId: this.instance.opts.docId,
        contentLength: snapshot.contentLength,
        localReactions: this.instance.getMine(),
        snapshot
      };
    }

    async initialize() {
      this.setStatus('loading');
      const snapshot = this.getSnapshot();
      const context = this.getContext(snapshot);
      const response = await this.api.initialize(snapshot, context);

      this.applyHeatmapResponse(response);
      this.retryCount = 0;
      this.retryOperation = 'refresh';
      this.setStatus('idle');
      return response;
    }

    scheduleSync(delay = this.opts.saveDebounceMs) {
      // Debouncing absorbs quick edits; minWriteIntervalMs additionally protects
      // the backend when a user keeps modifying reactions for a long period.
      if (this.destroyed) return;
      this.dirty = true;
      this.setStatus('pending');
      window.clearTimeout(this.timerId);

      const writeSpacing = Math.max(
        0,
        this.lastWriteAt + this.opts.minWriteIntervalMs - Date.now()
      );
      const nextDelay = Math.max(0, Number(delay) || 0, writeSpacing);
      this.timerId = window.setTimeout(() => {
        this.timerId = 0;
        this.flush().catch(() => {});
      }, nextDelay);
    }

    async flush() {
      // Only one write may be in flight. Mutations arriving during that request set
      // dirty again and are serialized into the next complete snapshot.
      if (this.inFlight) {
        this.dirty = true;
        return this.inFlight;
      }

      window.clearTimeout(this.timerId);
      this.timerId = 0;
      this.dirty = false;
      this.inFlight = this.writeCurrentSnapshot();

      try {
        return await this.inFlight;
      } catch (error) {
        this.handleError(error, 'save');
        return false;
      } finally {
        this.inFlight = null;
        if (this.dirty) this.scheduleSync();
      }
    }

    async writeCurrentSnapshot() {
      const snapshot = this.getSnapshot();
      this.setStatus('saving');
      const response = await this.api.saveSnapshot(
        snapshot,
        this.getContext(snapshot)
      );

      this.lastWriteAt = Date.now();
      this.retryCount = 0;
      this.retryOperation = 'refresh';
      if (!this.applyHeatmapResponse(response)) {
        await this.refreshHeatmap();
      }
      this.setStatus('idle');
      return true;
    }

    async refreshHeatmap() {
      this.setStatus(this.status === 'saving' ? 'saving' : 'loading');
      const response = await this.api.loadHeatmap(this.getContext());
      this.applyHeatmapResponse(response, true);
      this.retryOperation = 'refresh';
      if (this.status === 'loading') this.setStatus('idle');
      return response;
    }

    applyHeatmapResponse(response, required = false) {
      // Some save endpoints return an embedded heatmap to avoid a second round trip;
      // others return only acknowledgement, in which case refreshHeatmap follows.
      if (this.destroyed) return false;
      const heatmap = response?.heatmap || response;
      const valid = heatmap?.schema === 1 && Array.isArray(heatmap?.segments);
      if (!valid) {
        if (required) {
          const error = new Error('The Re:Likes API returned an invalid heatmap response.');
          error.code = 'invalid_backend_response';
          throw error;
        }
        return false;
      }

      this.instance.setHeatmapData(heatmap);
      return true;
    }

    handleError(error, retryOperation = 'save') {
      // Reads and writes retry independently with capped exponential backoff. A
      // later online event bypasses the remaining delay and resumes the right path.
      if (this.destroyed) return;
      this.retryOperation = retryOperation;
      this.error = {
        code: error?.code || 'backend_unavailable',
        message: error?.message || 'The Re:Likes API is unavailable.'
      };
      this.setStatus('error');

      const retryDelay = Math.min(
        this.opts.retryMaxMs,
        this.opts.retryBaseMs * Math.pow(2, this.retryCount)
      );
      this.retryCount += 1;

      if (retryOperation === 'refresh' && !this.dirty) {
        window.clearTimeout(this.timerId);
        this.timerId = window.setTimeout(() => {
          this.timerId = 0;
          this.refreshHeatmap().catch(nextError => this.handleError(nextError, 'refresh'));
        }, retryDelay);
      } else {
        this.scheduleSync(retryDelay);
      }
    }

    setStatus(status) {
      if (this.destroyed) return;
      this.status = status;
      if (['idle', 'loading', 'saving'].includes(status)) this.error = null;
      this.instance.opts.onBackendChange?.({
        instance: this.instance,
        backend: this.getState()
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      window.clearTimeout(this.timerId);
      this.timerId = 0;
      this.dirty = false;
      window.removeEventListener('online', this.onlineListener);
    }
  }

  /*
    The reaction overlay is independent from Clean Selection's transient canvas.
    Entries are declarative cloud shapes; this renderer preserves animation state
    by key and redraws them at device-pixel resolution after layout changes.
  */
  class CloudOverlay {
    constructor(element, geometry = DEFAULT_GEOMETRY) {
      this.el = element;
      this.geometry = { ...DEFAULT_GEOMETRY, ...geometry };
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.canvas.className = 'relikes-cloud-overlay';
      this.canvas.dataset.relikesOverlay = 'true';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.position = 'absolute';
      this.canvas.style.left = '0';
      this.canvas.style.top = '0';
      this.canvas.style.zIndex = '10005';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.setProperty('display', 'block', 'important');
      this.canvas.style.setProperty('margin', '0', 'important');
      this.canvas.style.setProperty('padding', '0', 'important');
      this.canvas.style.setProperty('border', '0', 'important');
      this.canvas.style.setProperty('box-sizing', 'content-box', 'important');
      this.canvas.style.setProperty('max-width', 'none', 'important');

      this.entries = [];
      this.animationFrame = 0;
      this.width = 0;
      this.height = 0;
      this.contentWidth = 0;
      this.contentHeight = 0;
      this.padding = Math.ceil(
        Number.isFinite(Number(this.geometry.overlayPadding))
          ? Number(this.geometry.overlayPadding)
          : this.geometry.radius * 4
      );
      this.persistent = Boolean(this.geometry.persistent);
      this.dpr = window.devicePixelRatio || 1;
      this.destroyed = false;
      this.originalPosition = this.el.style.position;

      this._render = this._render.bind(this);

      this.el.style.position ||= 'relative';
      this.el.appendChild(this.canvas);
    }

    setEntries(entries) {
      // Stable keys retain their original appearance time and source color, which
      // prevents every refresh from replaying the full entrance animation.
      this.resize();
      if (this.canvas.parentNode === this.el) {
        this.el.appendChild(this.canvas);
      }

      const previousEntries = new Map(this.entries.map(entry => [entry.key, entry]));

      this.entries = entries.map(entry => {
        const previous = previousEntries.get(entry.key);
        if (previous) {
          return {
            ...entry,
            appearAt: previous.appearAt,
            fromColor: previous.fromColor
          };
        }

        return {
          ...entry,
          appearAt: performance.now()
        };
      });

      this.requestRender();
    }

    resize() {
      // Detach generated overlays while measuring so their overflow cannot enlarge
      // the content they are supposed to follow.
      const content = withDetachedOverlayChildren(this.el, () => ({
        width: Math.max(1, Math.ceil(this.el.scrollWidth)),
        height: Math.max(1, Math.ceil(this.el.scrollHeight))
      }));
      const contentWidth = content.width;
      const contentHeight = content.height;
      const width = contentWidth + this.padding * 2;
      const height = contentHeight + this.padding * 2;
      const dpr = window.devicePixelRatio || 1;

      if (
        width === this.width &&
        height === this.height &&
        contentWidth === this.contentWidth &&
        contentHeight === this.contentHeight &&
        dpr === this.dpr
      ) {
        return;
      }

      this.width = width;
      this.height = height;
      this.contentWidth = contentWidth;
      this.contentHeight = contentHeight;
      this.dpr = dpr;
      this.canvas.width = Math.ceil(width * dpr);
      this.canvas.height = Math.ceil(height * dpr);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.canvas.style.left = -this.padding + 'px';
      this.canvas.style.top = -this.padding + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    requestRender() {
      if (this.destroyed || this.animationFrame) return;
      this.animationFrame = window.requestAnimationFrame(this._render);
    }

    _render(now) {
      // Each entry is layered from broad transparent aura to a denser core. Optional
      // clip regions let overlapping like/dislike heatmaps share one text area.
      this.animationFrame = 0;
      if (this.destroyed) return;
      if (!this.persistent || !this.width || !this.height) {
        this.resize();
      }

      this.ctx.clearRect(0, 0, this.width, this.height);

      let needsAnotherFrame = false;

      this.ctx.save();
      this.ctx.translate(this.padding, this.padding);

      for (const entry of this.entries) {
        const duration = 320;
        const progress = clamp((now - entry.appearAt) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const color = mixColor(entry.fromColor, entry.toColor, eased);
        const alpha = entry.alpha * (0.64 + eased * 0.36);
        const scaleBoost = entry.scaleBoost || 0;
        const aura = entry.aura || null;

        this.ctx.save();
        if (entry.clipRegions?.length) {
          this.ctx.beginPath();
          for (const region of entry.clipRegions) {
            this.ctx.rect(region.x, region.y, region.width, region.height);
          }
          this.ctx.clip();
        }
        if (aura) {
          this.sprayCloud(entry.stamps, {
            color,
            scale: (0.92 + eased * 1.04) * (1 + scaleBoost + (aura.scaleBoost || 0)),
            expansion: this.geometry.radius * (aura.expansionRatio || 0.42),
            alpha: alpha * (aura.outerAlphaMultiplier || 0.2),
            edge: aura.outerEdge || 0.78
          });
          this.sprayCloud(entry.stamps, {
            color,
            scale: (0.76 + eased * 0.86) * (1 + scaleBoost + (aura.scaleBoost || 0) * 0.7),
            expansion: this.geometry.radius * (aura.innerExpansionRatio || 0.22),
            alpha: alpha * (aura.innerAlphaMultiplier || 0.34),
            edge: aura.innerEdge || 0.66
          });
        }
        this.sprayCloud(entry.stamps, {
          color,
          scale: (0.64 + eased * 0.78) * (1 + scaleBoost),
          expansion: this.geometry.radius * 0.14,
          alpha: alpha * 0.28,
          edge: 0.68
        });
        this.sprayCloud(entry.stamps, {
          color,
          scale: (0.42 + eased * 0.58) * (1 + scaleBoost),
          expansion: 0,
          alpha: alpha * 0.56,
          edge: 0.52
        });
        this.ctx.restore();

        if (progress < 1) needsAnotherFrame = true;
      }

      this.ctx.restore();

      if (needsAnotherFrame || (this.persistent && this.entries.length)) {
        this.requestRender();
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.entries = [];
      this.canvas.remove();
      this.el.style.position = this.originalPosition;
    }

    sprayCloud(stamps, options) {
      for (const stamp of stamps) {
        const radius = Math.max(1, stamp.radius * options.scale + options.expansion);
        const gradient = this.ctx.createRadialGradient(stamp.x, stamp.y, 0, stamp.x, stamp.y, radius);

        gradient.addColorStop(0, rgba(options.color, options.alpha));
        gradient.addColorStop(options.edge, rgba(options.color, options.alpha * 0.46));
        gradient.addColorStop(1, rgba(options.color, 0));

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(stamp.x, stamp.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  /*
    A RelikesInstance coordinates four layers around one selectable element:
    Clean Selection capture, local reaction state, cloud rendering, and optional
    backend synchronization. Local rendering never waits for the network.
  */
  class RelikesInstance {
    constructor(element, options = {}) {
      this.el = element;
      this.opts = {
        docId: options.docId || element.id || 'relikes-document',
        userId: options.userId || getOrCreateUserId(options.userKey || 'relikes-user-v1'),
        storageKey: options.storageKey || 'relikes-store-v1',
        colors: { ...DEFAULT_COLORS, ...(options.colors || {}) },
        geometry: { ...DEFAULT_GEOMETRY, ...(options.geometry || {}) },
        reactionAlpha: normalizeOptionalAlpha(options.reactionAlpha),
        heatmap: normalizeHeatmapOptions(options.heatmap),
        airbrush: { ...(options.airbrush || {}) },
        interactiveElements: options.interactiveElements ?? options.airbrush?.interactiveElements ?? false,
        touchEraseControl: options.touchEraseControl ?? options.airbrush?.touchEraseControl ?? false,
        touchEraseBar: options.touchEraseBar === undefined ? true : options.touchEraseBar,
        popupRenderer: options.popupRenderer || null,
        backend: normalizeBackendOptions(options.backend),
        onChange: typeof options.onChange === 'function' ? options.onChange : null,
        onViewModeChange: typeof options.onViewModeChange === 'function'
          ? options.onViewModeChange
          : null,
        onHeatmapChange: typeof options.onHeatmapChange === 'function'
          ? options.onHeatmapChange
          : null,
        onBackendChange: typeof options.onBackendChange === 'function'
          ? options.onBackendChange
          : null
      };

      if (
        this.opts.backend &&
        !this.opts.backend.documentId &&
        !options.docId &&
        !element.id
      ) {
        throw new TypeError(
          'A backend-enabled Re:Likes instance requires backend.documentId, docId, or an element id.'
        );
      }

      this.store = options.store || new LocalReactionStore(this.opts.storageKey);
      this.overlay = new CloudOverlay(this.el, this.opts.geometry);
      this.index = null;
      this.reactions = [];
      this.eraseEnabled = Boolean(options.eraseEnabled);
      this.viewMode = normalizeViewMode(options.viewMode);
      this.heatmapData = normalizeHeatmapResponse(options.heatmap?.data);
      this.capture = null;
      this.backend = null;
      this.popupActionPromises = new Map();
      this.destroyed = false;

      this.refresh();
      this.attachCapture();
      this.render();
      this.emitChange();

      if (this.opts.backend) {
        this.backend = new RelikesBackendSync(this, this.opts.backend);
        this.backend.start();
      }
    }

    attachCapture() {
      // Clean Selection remains the input engine. Re:Likes supplies reaction-aware
      // popup actions and maps erase gestures back to persisted text anchors.
      if (!window.CleanSelection) {
        throw new Error('Relikes requires cleanselection.js to be loaded first.');
      }

      this.capture = CleanSelection.attach(this.el, this.buildAirbrushOptions());
      patchCaptureMeasurement(this.capture);
      this.syncCaptureMode();
    }

    buildAirbrushOptions() {
      const geometry = this.opts.geometry;
      return {
        ...this.opts.airbrush,
        radius: geometry.radius,
        hardness: 0.34,
        maxAlpha: 0.16,
        spacing: 0.33,
        turbulence: 0.22,
        turbulenceSpeed: 0.54,
        color: this.opts.colors.selection,
        finalAlpha: 0.28,
        overflowPadding: geometry.overlayPadding,
        detectTolerance: geometry.detectTolerance,
        mergeSelections: true,
        multiSelect: false,
        allowErase: this.eraseEnabled,
        includeCompleteWords: true,
        showTextPreview: false,
        externalVirtualPadding: 20,
        popupOffset: 22,
        popupRenderer: this.createPopupRenderer(),
        interactiveElements: this.opts.interactiveElements,
        touchEraseControl: this.opts.touchEraseControl,
        touchEraseBar: this.opts.touchEraseBar,
        hasEraseTarget: () => this.getMine().length > 0,
        onErasePoint: context => this.eraseAtPoint(context.clientX, context.clientY)
      };
    }

    refresh() {
      // Re-index before resolving anchors because DOM text and responsive wrapping
      // may have changed since reactions were originally stored.
      this.index = buildContentIndex(this.el);
      this.reactions = this.store.listReactions(this.opts.docId);
      this.render();

      if (this.capture) {
        this.capture._resizeCanvases?.();
        this.capture._collectFragments?.();
        this.capture._syncTouchEraseBarRegistration?.();
      }

      this.emitChange();
    }

    render() {
      // Mine mode renders only this identity's editable reactions. Heatmap mode
      // renders aggregate data, optionally adding local reactions client-side.
      if (this.destroyed) return;
      this.el.dataset.relikesViewMode = this.viewMode;

      if (this.viewMode === 'heatmap') {
        this.overlay.setEntries(buildHeatmapEntries(
          this.heatmapData,
          this.index,
          this.opts.colors,
          this.opts.geometry,
          this.opts.heatmap,
          this.getMine()
        ));
        return;
      }

      const reactionAlpha = this.getReactionAlpha();
      if (reactionAlpha === null) return;

      this.overlay.setEntries(buildEntriesFromReactions(
        this.getMine(),
        this.index,
        this.opts.colors,
        this.opts.geometry,
        reactionAlpha
      ));
    }

    getReactionAlpha() {
      return this.opts.reactionAlpha ?? normalizeOptionalAlpha(this.capture?.opts?.finalAlpha);
    }

    getViewMode() {
      return this.viewMode;
    }

    setViewMode(nextMode) {
      const viewMode = normalizeViewMode(nextMode);
      if (viewMode === this.viewMode) return this;

      this.viewMode = viewMode;

      this.syncCaptureMode();
      this.render();

      this.opts.onViewModeChange?.({
        instance: this,
        viewMode,
        heatmap: this.getHeatmapState()
      });
      this.emitChange();
      return this;
    }

    setHeatmapData(response) {
      if (this.destroyed) return this;
      this.heatmapData = normalizeHeatmapResponse(response);

      if (this.viewMode === 'heatmap') {
        this.render();
      }

      this.opts.onHeatmapChange?.({
        instance: this,
        heatmap: this.getHeatmapState()
      });
      this.emitChange();
      return this;
    }

    getHeatmapState() {
      return cloneHeatmapResponse(this.heatmapData);
    }

    syncCaptureMode() {
      // Capture options are mirrored after mode/control changes without replacing
      // the Clean Selection instance or losing an in-progress UI configuration.
      if (!this.capture) return;

      this.capture.opts.allowErase = this.eraseEnabled;
      this.capture.opts.mergeSelections = true;
      this.capture.opts.interactiveElements = this.opts.interactiveElements;
      this.capture.opts.touchEraseControl = this.opts.touchEraseControl;
      this.capture.opts.touchEraseBar = this.opts.touchEraseBar;
      this.capture._applyRestingInteractionStyles?.();
      this.capture._syncTouchEraseBarRegistration?.();
    }

    getMine() {
      return this.reactions.filter(reaction => reaction.userId === this.opts.userId);
    }

    getCounts() {
      const mine = this.getMine();
      const likes = countReactionRuns(mine.filter(reaction => reaction.kind === 'like'));
      const dislikes = countReactionRuns(mine.filter(reaction => reaction.kind === 'dislike'));

      return {
        likes,
        dislikes,
        total: likes + dislikes
      };
    }

    emitChange() {
      if (!this.opts.onChange) return;

      const mine = this.getMine();
      this.opts.onChange({
        instance: this,
        reactions: [...this.reactions],
        mine,
        counts: this.getCounts(),
        viewMode: this.viewMode,
        heatmap: this.getHeatmapState(),
        backend: this.getBackendState()
      });
    }

    setEraseEnabled(enabled) {
      this.eraseEnabled = Boolean(enabled);
      this.syncCaptureMode();

      return this;
    }

    clearUser() {
      this.store.clearUser(this.opts.docId, this.opts.userId);
      this.refresh();
      this.backend?.scheduleSync();
    }

    getBackendState() {
      return this.backend?.getState() || {
        enabled: false,
        status: 'disabled',
        error: null,
        pending: false,
        lastWriteAt: null,
        api: null
      };
    }

    refreshBackendHeatmap() {
      return this.backend?.refreshHeatmap() || Promise.resolve(this.getHeatmapState());
    }

    flushBackend() {
      return this.backend?.flush() || Promise.resolve(false);
    }

    destroy() {
      if (this.destroyed) return this;
      this.destroyed = true;
      this.backend?.destroy();
      this.capture?.destroy();
      this.overlay?.destroy();
      this.popupActionPromises.clear();
      delete this.el.dataset.relikesViewMode;
      return this;
    }

    getLivePopupContext(popupContext = {}) {
      const selection = popupContext.selection;

      return {
        ...popupContext,
        text: selection?.state?.textPreview ?? popupContext.text ?? '',
        fragmentIndices: selection?.fragmentIndices
          ? [...selection.fragmentIndices]
          : [...(popupContext.fragmentIndices || [])]
      };
    }

    applyPopupReaction(kind, popupContext) {
      // Deduplicate repeated clicks for the same selection while an async custom
      // action is pending; different selections remain independently actionable.
      if (!['like', 'dislike'].includes(kind)) {
        return Promise.reject(new TypeError('A Re:Likes reaction must be like or dislike.'));
      }

      const actionKey = popupContext?.selectionId ?? popupContext?.selection?.id ?? null;
      const pendingAction = actionKey === null
        ? null
        : this.popupActionPromises.get(actionKey);
      if (pendingAction) return pendingAction;

      const action = this.commitReaction(kind, this.getLivePopupContext(popupContext));
      if (actionKey === null) return action;

      const trackedAction = action.finally(() => {
        if (this.popupActionPromises.get(actionKey) === trackedAction) {
          this.popupActionPromises.delete(actionKey);
        }
      });
      this.popupActionPromises.set(actionKey, trackedAction);
      return trackedAction;
    }

    createRelikesPopupContext(cleanSelectionContext) {
      const liveContext = this.getLivePopupContext(cleanSelectionContext);
      const react = kind => this.applyPopupReaction(kind, cleanSelectionContext);
      const like = () => react('like');
      const dislike = () => react('dislike');

      return {
        ...liveContext,
        instance: this,
        relikes: this,
        cleanSelection: cleanSelectionContext.instance,
        react,
        like,
        dislike,
        actions: {
          react,
          like,
          dislike,
          close: liveContext.close
        }
      };
    }

    wrapPopupController(controller) {
      if (controller instanceof HTMLElement || !controller || typeof controller !== 'object') {
        return controller;
      }

      const wrappedController = Object.create(Object.getPrototypeOf(controller));
      Object.defineProperties(
        wrappedController,
        Object.getOwnPropertyDescriptors(controller)
      );
      if (typeof controller.update === 'function') {
        Object.defineProperty(wrappedController, 'update', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: context => controller.update(
            this.createRelikesPopupContext(context)
          )
        });
      }
      if (typeof controller.destroy === 'function') {
        Object.defineProperty(wrappedController, 'destroy', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: context => controller.destroy(
            this.createRelikesPopupContext(context)
          )
        });
      }
      return wrappedController;
    }

    async commitReaction(kind, popupContext) {
      // Rebuild the index at commit time so the anchor is based on current DOM text,
      // then update local state and UI before scheduling backend persistence.
      this.index = buildContentIndex(this.el);
      const anchor = createAnchorFromSelection(popupContext.fragmentIndices, this.index);
      if (!anchor) {
        popupContext.close();
        return;
      }

      const reaction = {
        id: createId('reaction'),
        docId: this.opts.docId,
        userId: this.opts.userId,
        kind,
        text: popupContext.text,
        anchor,
        createdAt: new Date().toISOString()
      };

      this.reactions = saveReactionWithMerge(reaction, this.index, this.store, this.opts.geometry);
      this.render();
      this.emitChange();
      this.backend?.scheduleSync();
      popupContext.close();
    }

    createPopupRenderer() {
      // Custom renderers receive the same enriched like/dislike context as the
      // built-in renderer and fall back safely if they return unusable markup.
      const defaultRenderer = this.createDefaultPopupRenderer();
      const configuredRenderer = this.opts.popupRenderer;
      const configuredCreate = typeof configuredRenderer === 'function'
        ? configuredRenderer
        : configuredRenderer?.create;
      const renderer = typeof configuredCreate === 'function'
        ? configuredRenderer
        : defaultRenderer;
      const create = typeof renderer === 'function'
        ? renderer
        : context => renderer.create(context);

      return {
        create: cleanSelectionContext => {
          const context = this.createRelikesPopupContext(cleanSelectionContext);
          let controller = null;

          try {
            controller = create(context);
          } catch (error) {
            if (this.opts.airbrush.debug) {
              console.error('relikes popup renderer failed', error);
            }
          }

          const validController = controller instanceof HTMLElement ||
            controller?.element instanceof HTMLElement;
          if (!validController && renderer !== defaultRenderer) {
            controller = defaultRenderer.create(context);
          }

          return this.wrapPopupController(controller);
        },
        update: typeof renderer?.update === 'function'
          ? (element, context) => renderer.update(
            element,
            this.createRelikesPopupContext(context)
          )
          : undefined,
        destroy: typeof renderer?.destroy === 'function'
          ? (element, context) => renderer.destroy(
            element,
            this.createRelikesPopupContext(context)
          )
          : undefined
      };
    }

    createDefaultPopupRenderer() {
      return {
        create: context => {
          const shell = CleanSelection.createPopupShell('relikes-popup');
          const host = shell.host;
          const shadowRoot = shell.shadowRoot;
          const template = document.createElement('template');
          const likeColor = this.opts.colors.like.join(', ');
          const dislikeColor = this.opts.colors.dislike.join(', ');

          template.innerHTML = `
            <style>
              :host {
                --relikes-panel: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.94));
                --relikes-line: rgba(21, 59, 99, 0.1);
                --relikes-ink: #16324b;
                --relikes-muted: #5a6f84;
                --relikes-like-start: rgba(${likeColor}, 0.92);
                --relikes-like-end: rgb(${likeColor});
                --relikes-dislike-start: rgba(${dislikeColor}, 0.92);
                --relikes-dislike-end: rgb(${dislikeColor});
                --relikes-shadow: 0 22px 38px rgba(16, 37, 60, 0.18), 0 8px 16px rgba(16, 37, 60, 0.08);
              }

              .relikes-popup {
                position: relative;
                width: min(320px, calc(100vw - 32px));
                padding: 0.95rem;
                border-radius: 18px;
                border: 1px solid var(--relikes-line);
                background: var(--relikes-panel);
                box-shadow: var(--relikes-shadow);
                display: grid;
                gap: 0.9rem;
                font-family: "Avenir Next", "Segoe UI", sans-serif;
                color: var(--relikes-ink);
                box-sizing: border-box;
              }

              .relikes-popup__topline {
                display: flex;
                align-items: start;
                justify-content: space-between;
                gap: 0.8rem;
              }

              .relikes-popup__topline > div {
                padding-right: 1.85rem;
              }

              .relikes-popup__eyebrow {
                font-size: 0.74rem;
                font-weight: 700;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: rgba(22, 50, 75, 0.62);
              }

              .relikes-popup__text {
                margin-top: 0.35rem;
                color: var(--relikes-muted);
                font-size: 0.9rem;
                line-height: 1.45;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 3;
                overflow: hidden;
              }

              .relikes-popup__close {
                appearance: none;
                border: 0;
                position: absolute;
                top: 0.95rem;
                right: 0.95rem;
                width: 1.05rem;
                height: 1.05rem;
                padding: 0;
                border-radius: 0;
                display: grid;
                place-items: center;
                cursor: pointer;
                background: transparent;
                color: #274563;
                line-height: 1;
                flex: none;
                transition: transform 120ms ease, color 120ms ease;
              }

              .relikes-popup__close svg {
                display: block;
                width: 100%;
                height: 100%;
                stroke: currentColor;
              }

              .relikes-popup__close:hover {
                transform: translateY(-1px);
                color: #143b63;
              }

              .relikes-popup__actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 0.7rem;
              }

              .relikes-popup__button {
                appearance: none;
                border: 0;
                border-radius: 14px;
                padding: 0.75rem 0.9rem;
                color: #fff;
                font: inherit;
                cursor: pointer;
                transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
              }

              .relikes-popup__button:hover {
                transform: translateY(-1px);
                filter: brightness(1.02);
              }

              .relikes-popup__button:active {
                transform: translateY(0);
              }

              .relikes-popup__button:disabled,
              .relikes-popup__close:disabled {
                opacity: 0.6;
                cursor: wait;
                transform: none;
              }

              .relikes-popup__button--like {
                background: linear-gradient(135deg, var(--relikes-like-start), var(--relikes-like-end));
                box-shadow: 0 12px 20px rgba(76, 186, 106, 0.24);
              }

              .relikes-popup__button--dislike {
                background: linear-gradient(135deg, var(--relikes-dislike-start), var(--relikes-dislike-end));
                box-shadow: 0 12px 20px rgba(223, 134, 137, 0.24);
              }
            </style>
            <div class="relikes-popup">
              <div class="relikes-popup__topline">
                <div>
                  <div class="relikes-popup__eyebrow">React to Selection</div>
                  <div class="relikes-popup__text"></div>
                </div>
                <button type="button" class="relikes-popup__close" aria-label="Close popup">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M6 6L18 18M18 6L6 18" fill="none" stroke-width="2.25" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="relikes-popup__actions">
                <button type="button" class="relikes-popup__button relikes-popup__button--like">Like</button>
                <button type="button" class="relikes-popup__button relikes-popup__button--dislike">Dislike</button>
              </div>
            </div>
          `;

          shadowRoot.appendChild(template.content.cloneNode(true));

          const preview = shadowRoot.querySelector('.relikes-popup__text');
          const closeButton = shadowRoot.querySelector('.relikes-popup__close');
          const likeButton = shadowRoot.querySelector('.relikes-popup__button--like');
          const dislikeButton = shadowRoot.querySelector('.relikes-popup__button--dislike');
          const controllerState = { context, pending: false };

          const setPending = pending => {
            controllerState.pending = pending;
            likeButton.disabled = pending;
            dislikeButton.disabled = pending;
            closeButton.disabled = pending;
          };

          const applyReaction = async kind => {
            if (controllerState.pending || !controllerState.context) return;
            setPending(true);

            try {
              await controllerState.context.react(kind);
            } finally {
              setPending(false);
            }
          };

          closeButton.addEventListener('click', event => {
            event.preventDefault();
            if (controllerState.pending) return;
            controllerState.context.close();
          });

          likeButton.addEventListener('click', event => {
            event.preventDefault();
            applyReaction('like');
          });

          dislikeButton.addEventListener('click', event => {
            event.preventDefault();
            applyReaction('dislike');
          });

          return {
            element: host,
            update(nextContext) {
              controllerState.context = nextContext;
              preview.textContent = nextContext.text || 'React to this selection';
            }
          };
        }
      };
    }

    eraseAtPoint(clientX, clientY) {
      // Erasing is partial: each touched reaction is rewritten with its surviving
      // anchored runs, and is removed only when no run remains.
      this.index = buildContentIndex(this.el);

      const point = getLocalPoint(this.el, clientX, clientY, this.opts.geometry.overlayPadding);
      if (!point) return false;

      const mine = this.getMine();
      let changed = false;

      for (const reaction of mine) {
        if (eraseReactionFragmentsAtPoint(reaction, point, this.index, this.store, this.opts.geometry)) {
          changed = true;
        }
      }

      if (!changed) return false;

      this.reactions = this.store.listReactions(this.opts.docId);
      this.render();
      this.emitChange();
      this.backend?.scheduleSync();
      return true;
    }
  }

  function attach(element, options = {}) {
    return new RelikesInstance(element, options);
  }

  function patchCaptureMeasurement(instance) {
    // Clean Selection cannot know about Re:Likes' extra canvas. Wrap its private
    // measurement hook so generated overlays never inflate scroll dimensions.
    if (!instance || instance.__relikesMeasureWithoutOverlays) return;

    const measureContentSize = instance._measureContentSize?.bind(instance);
    if (typeof measureContentSize !== 'function') return;

    instance.__relikesMeasureWithoutOverlays = true;
    instance._measureContentSize = () => withDetachedOverlayChildren(
      instance.el,
      measureContentSize,
      child => child.classList?.contains('relikes-cloud-overlay')
    );
    instance._resizeCanvases?.();
    instance._collectFragments?.();
  }

  function buildEntriesFromReactions(
    reactions,
    indexModel,
    colors = DEFAULT_COLORS,
    geometry = DEFAULT_GEOMETRY,
    reactionAlpha
  ) {
    return reactions
      .map(reaction => createOverlayEntryFromReaction(
        reaction,
        indexModel,
        colors,
        geometry,
        reactionAlpha
      ))
      .filter(Boolean);
  }

  function createOverlayEntryFromReaction(
    reaction,
    indexModel,
    colors = DEFAULT_COLORS,
    geometry = DEFAULT_GEOMETRY,
    reactionAlpha
  ) {
    return createOverlayEntryFromAnchor(reaction.id, reaction.anchor, indexModel, {
      fromColor: colors.selection,
      toColor: reaction.kind === 'like' ? colors.like : colors.dislike,
      alpha: reactionAlpha,
      scaleBoost: 0,
      geometry
    });
  }

  function buildHeatmapEntries(
    response,
    indexModel,
    colors = DEFAULT_COLORS,
    geometry = DEFAULT_GEOMETRY,
    options = DEFAULT_HEATMAP,
    localReactions = []
  ) {
    // Convert sparse server offset segments into contiguous visual groups. Local
    // reactions are added after the server excludes the current subject, keeping
    // the interface immediate without double-counting synchronized data.
    if (!indexModel?.fragments?.length) return [];

    const heatmap = normalizeHeatmapResponse(response);
    const heatmapOptions = normalizeHeatmapOptions(options);
    const segments = heatmap.segments;
    const maxChannelHits = Math.max(
      1,
      ...segments.flatMap(segment => [segment.likes, segment.dislikes])
    );
    const localLikeIndices = new Set();
    const localDislikeIndices = new Set();

    if (heatmapOptions.includeLocalReactions) {
      for (const reaction of localReactions) {
        const target = reaction.kind === 'like'
          ? localLikeIndices
          : reaction.kind === 'dislike'
            ? localDislikeIndices
            : null;
        if (!target) continue;

        for (const fragment of getFragmentsForAnchor(indexModel, reaction.anchor)) {
          target.add(fragment.index);
        }
      }
    }

    if (!segments.length && !localLikeIndices.size && !localDislikeIndices.size) return [];

    const scoredFragments = [];
    let segmentCursor = 0;

    for (const fragment of indexModel.fragments) {
      while (segments[segmentCursor]?.end <= fragment.globalStart) {
        segmentCursor += 1;
      }

      let likes = 0;
      let dislikes = 0;
      let scanIndex = segmentCursor;

      while (segments[scanIndex]?.start < fragment.globalEnd) {
        const segment = segments[scanIndex];
        if (segment.end > fragment.globalStart) {
          likes = Math.max(likes, segment.likes);
          dislikes = Math.max(dislikes, segment.dislikes);
        }
        scanIndex += 1;
      }

      if (localLikeIndices.has(fragment.index)) likes += 1;
      if (localDislikeIndices.has(fragment.index)) dislikes += 1;

      if (likes + dislikes > 0) {
        scoredFragments.push({ fragment, likes, dislikes });
      }
    }

    const groups = [];

    for (const scored of scoredFragments) {
      const previousGroup = groups[groups.length - 1];
      const previousFragment = previousGroup?.fragments[previousGroup.fragments.length - 1];

      if (
        previousGroup &&
        previousFragment.index + 1 === scored.fragment.index &&
        previousGroup.likes === scored.likes &&
        previousGroup.dislikes === scored.dislikes
      ) {
        previousGroup.fragments.push(scored.fragment);
      } else {
        groups.push({
          likes: scored.likes,
          dislikes: scored.dislikes,
          fragments: [scored.fragment]
        });
      }
    }

    return groups.flatMap((group, groupIndex) => {
      const firstIndex = group.fragments[0].index;
      const lastIndex = group.fragments[group.fragments.length - 1].index;
      const hasOverlap = group.likes > 0 && group.dislikes > 0;
      const channels = [
        { name: 'like', count: group.likes, color: colors.like },
        { name: 'dislike', count: group.dislikes, color: colors.dislike }
      ];

      return channels
        .filter(channel => channel.count > 0)
        .map(channel => {
          const strength = getHeatmapStrength(
            channel.count,
            maxChannelHits,
            heatmapOptions.scale
          );

          return {
            key: 'heatmap-' + heatmap.revision + '-' + channel.name + '-' +
              groupIndex + '-' + firstIndex + '-' + lastIndex,
            stamps: buildFinalStamps(group.fragments, geometry),
            fromColor: colors.selection,
            toColor: channel.color,
            alpha: heatmapOptions.minAlpha +
              (heatmapOptions.maxAlpha - heatmapOptions.minAlpha) * strength,
            scaleBoost: 0,
            aura: null,
            clipRegions: hasOverlap && heatmapOptions.overlapMode === 'split'
              ? buildHeatmapClipRegions(group.fragments, channel.name, geometry)
              : null,
            heatmap: {
              channel: channel.name,
              count: channel.count,
              maxChannelHits,
              likes: group.likes,
              dislikes: group.dislikes,
              strength,
              overlap: hasOverlap
            }
          };
        });
    });
  }

  function getHeatmapStrength(total, maxHits, scale = 'sqrt') {
    const ratio = clamp(maxHits > 0 ? total / maxHits : 0, 0, 1);

    if (scale === 'linear') return ratio;
    if (scale === 'log') {
      return maxHits > 0 ? Math.log1p(total) / Math.log1p(maxHits) : 0;
    }

    return Math.sqrt(ratio);
  }

  function buildHeatmapClipRegions(fragments, channel, geometry = DEFAULT_GEOMETRY) {
    // When both channels occupy the same passage, likes use the upper half and
    // dislikes the lower half of each visual line instead of painting over one another.
    const rows = [];

    for (const fragment of fragments) {
      const row = rows[rows.length - 1];
      if (row && areSameVisualLineFragments(row.lastFragment, fragment)) {
        row.fragments.push(fragment);
        row.lastFragment = fragment;
      } else {
        rows.push({ fragments: [fragment], lastFragment: fragment });
      }
    }

    const horizontalReach = geometry.radius * 2.4;
    const verticalReach = geometry.radius * 2.2;

    return rows.map(row => {
      const left = Math.min(...row.fragments.map(fragment => fragment.x));
      const right = Math.max(...row.fragments.map(fragment => fragment.x + fragment.width));
      const centerY = row.fragments.reduce(
        (total, fragment) => total + fragment.centerY,
        0
      ) / row.fragments.length;

      return {
        x: left - horizontalReach,
        y: channel === 'like' ? centerY - verticalReach : centerY,
        width: right - left + horizontalReach * 2,
        height: verticalReach
      };
    });
  }

  function createOverlayEntryFromAnchor(key, anchor, indexModel, options = {}) {
    if (!anchor || !indexModel) return null;

    const geometry = options.geometry || DEFAULT_GEOMETRY;
    const fragmentRuns = getFragmentRunsForAnchor(indexModel, anchor);
    if (!fragmentRuns.length) return null;

    return {
      key,
      stamps: fragmentRuns.flatMap(fragments => buildFinalStamps(fragments, geometry)),
      fromColor: options.fromColor || DEFAULT_COLORS.selection,
      toColor: options.toColor || DEFAULT_COLORS.like,
      alpha: options.alpha ?? 0.42,
      scaleBoost: options.scaleBoost || 0,
      aura: options.aura || null
    };
  }

  function eraseReactionFragmentsAtPoint(reaction, point, indexModel, store, geometry = DEFAULT_GEOMETRY) {
    // Reactions may contain several disjoint runs. Removing touched graphemes and
    // rebuilding the anchor preserves every untouched run under the same reaction.
    const fragments = getFragmentsForAnchor(indexModel, reaction.anchor);
    if (!fragments.length) return false;

    const erasedFragments = fragments.filter(fragment =>
      isFragmentTouchedByEraser(fragment, point, geometry)
    );

    if (!erasedFragments.length) return false;

    const erasedIndices = new Set(erasedFragments.map(fragment => fragment.index));
    const remainingFragments = fragments.filter(fragment => !erasedIndices.has(fragment.index));
    const anchor = createAnchorFromFragments(remainingFragments, indexModel);

    store.removeReaction(reaction.id);

    if (anchor) {
      store.saveReaction({
        ...reaction,
        text: getTextFromFragments(remainingFragments),
        anchor,
        updatedAt: new Date().toISOString()
      });
    }

    return true;
  }

  function isFragmentTouchedByEraser(fragment, point, geometry = DEFAULT_GEOMETRY) {
    const rect = normalizeRect({
      x: fragment.x,
      y: fragment.y,
      width: fragment.width,
      height: fragment.height
    }, geometry);
    const closestX = clamp(point.x, rect.x, rect.x + rect.width);
    const closestY = clamp(point.y, rect.y, rect.y + rect.height);
    const distance = Math.hypot(point.x - closestX, point.y - closestY);

    return distance <= geometry.radius * 0.95;
  }

  function buildRemainingReactionRuns(fragments) {
    if (!fragments.length) return [];

    const runs = [];
    let current = [];
    const flush = () => {
      if (!current.length) return;

      let start = 0;
      let end = current.length - 1;

      while (start <= end && /^\s+$/u.test(current[start].text)) start += 1;
      while (end >= start && /^\s+$/u.test(current[end].text)) end -= 1;

      if (start <= end) runs.push(current.slice(start, end + 1));
      current = [];
    };

    const sorted = fragments.slice().sort((left, right) => left.index - right.index);

    for (const fragment of sorted) {
      const previous = current[current.length - 1];
      if (previous && fragment.index !== previous.index + 1) flush();
      current.push(fragment);
    }

    flush();
    return runs;
  }

  function getLocalPoint(element, clientX, clientY, padding = 0) {
    const rect = element.getBoundingClientRect();

    if (
      clientX < rect.left - padding ||
      clientX > rect.right + padding ||
      clientY < rect.top - padding ||
      clientY > rect.bottom + padding
    ) {
      return null;
    }

    return {
      x: clientX - rect.left + element.scrollLeft,
      y: clientY - rect.top + element.scrollTop
    };
  }

  function isGeneratedOverlayChild(element) {
    return Boolean(
      element &&
      (
        element.classList?.contains('relikes-cloud-overlay') ||
        element.classList?.contains('airbrush-interaction-surface') ||
        (element.tagName === 'CANVAS' && element.style.position === 'absolute')
      )
    );
  }

  function withDetachedOverlayChildren(parent, callback, predicate = isGeneratedOverlayChild) {
    // Comment markers preserve exact child order while overlays are temporarily
    // removed for measurement, even if callback code triggers synchronous DOM work.
    const detached = [];

    for (const child of Array.from(parent.children)) {
      if (!predicate(child)) continue;

      const marker = document.createComment('overlay-measurement-anchor');
      parent.insertBefore(marker, child);
      parent.removeChild(child);
      detached.push({ child, marker });
    }

    try {
      return callback();
    } finally {
      for (const { child, marker } of detached) {
        if (marker.parentNode === parent) {
          parent.insertBefore(child, marker);
          parent.removeChild(marker);
        } else {
          parent.appendChild(child);
        }
      }
    }
  }

  function buildContentIndex(root) {
    // The index links three coordinate systems: DOM offsets for durable anchors,
    // global text offsets for backend ranges, and element-local rectangles for drawing.
    const fragments = [];
    const baseRect = root.getBoundingClientRect();
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: node => isSelectableTextNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      }
    );

    let globalOffset = 0;
    let semanticText = '';
    let node;
    let index = 0;

    while ((node = walker.nextNode())) {
      const range = document.createRange();
      const segments = segmentText(node.nodeValue);
      semanticText += node.nodeValue;

      for (const segment of segments) {
        range.setStart(node, segment.startOffset);
        range.setEnd(node, segment.endOffset);

        const globalStart = globalOffset;
        const globalEnd = globalOffset + segment.text.length;
        globalOffset = globalEnd;

        const rect = measureFragmentRect(range);
        if (!rect) continue;

        const x = rect.left - baseRect.left + root.scrollLeft;
        const y = rect.top - baseRect.top + root.scrollTop;

        fragments.push({
          index,
          node,
          text: segment.text,
          startOffset: segment.startOffset,
          endOffset: segment.endOffset,
          globalStart,
          globalEnd,
          x,
          y,
          width: rect.width,
          height: rect.height,
          centerX: x + rect.width / 2,
          centerY: y + rect.height / 2
        });

        index += 1;
      }

      range.detach?.();
    }

    return {
      fragments,
      text: semanticText
    };
  }

  function createAnchorFromSelection(fragmentIndices, indexModel) {
    const fragments = Array.from(fragmentIndices)
      .sort((left, right) => left - right)
      .map(index => indexModel.fragments[index])
      .filter(Boolean);

    return createAnchorFromFragments(fragments, indexModel);
  }

  function createAnchorFromFragments(fragments, indexModel) {
    // Version 2 stores one quote anchor per contiguous surviving run. This is what
    // allows partial erase and responsive re-resolution without joining gaps.
    if (!indexModel || !fragments.length) return null;

    const runs = buildRemainingReactionRuns(fragments)
      .map(run => createAnchorFromOffsets(
        run[0].globalStart,
        run[run.length - 1].globalEnd,
        indexModel
      ))
      .filter(Boolean);

    if (!runs.length) return null;

    return {
      version: 2,
      runs
    };
  }

  function createAnchorFromQuote(quote, indexModel) {
    const start = indexModel.text.indexOf(quote);
    if (start === -1) return null;

    return createAnchorFromOffsets(start, start + quote.length, indexModel);
  }

  function createAnchorFromOffsets(start, end, indexModel) {
    if (!indexModel) return null;

    const normalized = normalizeTextRange(start, end, indexModel.text);
    if (!normalized) return null;

    return {
      start: normalized.start,
      end: normalized.end,
      exact: indexModel.text.slice(normalized.start, normalized.end),
      prefix: indexModel.text.slice(Math.max(0, normalized.start - 32), normalized.start),
      suffix: indexModel.text.slice(normalized.end, Math.min(indexModel.text.length, normalized.end + 32))
    };
  }

  function normalizeTextRange(start, end, text) {
    const clampedStart = clamp(Math.floor(start), 0, text.length);
    const clampedEnd = clamp(Math.ceil(end), 0, text.length);
    let nextStart = Math.min(clampedStart, clampedEnd);
    let nextEnd = Math.max(clampedStart, clampedEnd);

    while (nextStart < nextEnd && /\s/u.test(text[nextStart])) nextStart += 1;
    while (nextEnd > nextStart && /\s/u.test(text[nextEnd - 1])) nextEnd -= 1;

    if (nextEnd <= nextStart) return null;

    return {
      start: nextStart,
      end: nextEnd
    };
  }

  function resolveTextAnchor(indexModel, anchor) {
    // Fast path uses original offsets. If surrounding content moved, quote plus
    // prefix/suffix context selects the most plausible occurrence of repeated text.
    if (!anchor) return null;

    const storedSlice = indexModel.text.slice(anchor.start, anchor.end);
    if (storedSlice === anchor.exact) {
      return {
        start: anchor.start,
        end: anchor.end
      };
    }

    if (!anchor.exact) return null;

    let cursor = 0;
    let bestMatch = null;

    while (cursor <= indexModel.text.length) {
      const found = indexModel.text.indexOf(anchor.exact, cursor);
      if (found === -1) break;

      const prefix = typeof anchor.prefix === 'string' ? anchor.prefix : '';
      const suffix = typeof anchor.suffix === 'string' ? anchor.suffix : '';
      const candidatePrefix = indexModel.text.slice(Math.max(0, found - prefix.length), found);
      const candidateSuffix = indexModel.text.slice(
        found + anchor.exact.length,
        found + anchor.exact.length + suffix.length
      );
      const score = sharedSuffixLength(candidatePrefix, prefix) +
        sharedPrefixLength(candidateSuffix, suffix) -
        Math.abs(found - anchor.start) * 0.001;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          start: found,
          end: found + anchor.exact.length,
          score
        };
      }

      cursor = found + Math.max(1, anchor.exact.length);
    }

    return bestMatch || resolveWhitespaceInsensitiveAnchor(indexModel.text, anchor);
  }

  function resolveWhitespaceInsensitiveAnchor(text, anchor) {
    const compactExact = String(anchor.exact || '').replace(/\s+/gu, '');
    if (!compactExact) return null;

    let compactText = '';
    const sourceOffsets = [];

    for (let index = 0; index < text.length; index += 1) {
      if (/\s/u.test(text[index])) continue;
      compactText += text[index];
      sourceOffsets.push(index);
    }

    const prefix = String(anchor.prefix || '').replace(/\s+/gu, '');
    const suffix = String(anchor.suffix || '').replace(/\s+/gu, '');
    let cursor = 0;
    let bestMatch = null;

    while (cursor <= compactText.length) {
      const found = compactText.indexOf(compactExact, cursor);
      if (found === -1) break;

      const sourceStart = sourceOffsets[found];
      const sourceEnd = sourceOffsets[found + compactExact.length - 1] + 1;
      const candidatePrefix = compactText.slice(Math.max(0, found - prefix.length), found);
      const candidateSuffix = compactText.slice(
        found + compactExact.length,
        found + compactExact.length + suffix.length
      );
      const score = sharedSuffixLength(candidatePrefix, prefix) +
        sharedPrefixLength(candidateSuffix, suffix) -
        Math.abs(sourceStart - anchor.start) * 0.001;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          start: sourceStart,
          end: sourceEnd,
          score
        };
      }

      cursor = found + Math.max(1, compactExact.length);
    }

    return bestMatch;
  }

  function getStoredAnchorRuns(anchor) {
    if (!anchor) return [];
    if (Array.isArray(anchor.runs)) return anchor.runs.filter(Boolean);
    return [anchor];
  }

  function normalizeBackendOptions(options) {
    // Normalize integration-specific transport choices into one internal contract;
    // the rest of the library does not need to know whether it is talking to PHP,
    // WordPress REST, a custom request callback, or ordinary fetch routes.
    if (!options) return null;

    const source = typeof options === 'object' ? options : null;
    if (!source) {
      throw new TypeError('Relikes backend configuration must be an object.');
    }
    if (source.enabled === false) return null;

    const configuredUrl = String(source.url || source.apiUrl || '').trim();
    if (!configuredUrl) {
      throw new TypeError('Relikes backend requires a url.');
    }

    const documentVersion = String(source.documentVersion || '').trim();
    if (!documentVersion) {
      throw new TypeError('Relikes backend requires a documentVersion.');
    }

    const fetchImpl = source.fetch ||
      (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    if (!fetchImpl && typeof source.request !== 'function') {
      throw new TypeError('Relikes backend requires fetch support or a request callback.');
    }

    return {
      url: new URL(configuredUrl, document.baseURI).href,
      documentId: source.documentId === undefined || source.documentId === null
        ? null
        : String(source.documentId),
      documentVersion,
      userId: source.userId,
      routes: {
        ...DEFAULT_BACKEND_ROUTES,
        ...(source.routes || {})
      },
      headers: source.headers || null,
      credentials: ['omit', 'same-origin', 'include'].includes(source.credentials)
        ? source.credentials
        : DEFAULT_BACKEND_SYNC.credentials,
      fetch: fetchImpl,
      request: typeof source.request === 'function' ? source.request : null,
      tokenStorageKey: source.tokenStorageKey || null,
      stateStorageKey: source.stateStorageKey || null,
      saveDebounceMs: normalizeBackendDelay(
        source.saveDebounceMs,
        DEFAULT_BACKEND_SYNC.saveDebounceMs
      ),
      minWriteIntervalMs: normalizeBackendDelay(
        source.minWriteIntervalMs,
        DEFAULT_BACKEND_SYNC.minWriteIntervalMs
      ),
      retryBaseMs: normalizeBackendDelay(
        source.retryBaseMs,
        DEFAULT_BACKEND_SYNC.retryBaseMs
      ),
      retryMaxMs: normalizeBackendDelay(
        source.retryMaxMs,
        DEFAULT_BACKEND_SYNC.retryMaxMs
      )
    };
  }

  function resolveBackendRequestUrl(routeUrl, baseUrl) {
    const route = String(routeUrl || '');
    const base = new URL(baseUrl, document.baseURI);

    // WordPress uses query-based REST URLs when pretty REST permalinks are not
    // available, for example index.php?rest_route=/relikes/v1/. A bare route
    // cannot be resolved against that query with new URL(), because it would
    // replace index.php and produce /session instead of updating rest_route.
    const isBareRelativeRoute = Boolean(route) &&
      !route.startsWith('?') &&
      !route.startsWith('/') &&
      !route.startsWith('//') &&
      !/^[a-z][a-z\d+.-]*:/i.test(route);

    if (isBareRelativeRoute && base.searchParams.has('rest_route')) {
      const namespace = String(base.searchParams.get('rest_route') || '/')
        .replace(/\/+$/u, '');
      const suffix = route.replace(/^\.\//u, '').replace(/^\/+|\/+$/gu, '');
      const joined = `${namespace}/${suffix}`.replace(/\/{2,}/gu, '/');
      base.searchParams.set('rest_route', joined.startsWith('/') ? joined : `/${joined}`);
      return base;
    }

    return new URL(route, base);
  }

  function normalizeBackendDelay(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(Math.round(number), 0, 300000) : fallback;
  }

  function buildBackendReactions(instance) {
    // Collapse local reaction objects into the protocol's two channel snapshots.
    // Overlapping or adjacent runs of the same kind are normalized before upload.
    const runsByKind = { like: [], dislike: [] };

    for (const reaction of instance.getMine()) {
      if (!runsByKind[reaction.kind]) continue;

      for (const run of resolveAnchorRuns(instance.index, reaction.anchor)) {
        runsByKind[reaction.kind].push({ start: run.start, end: run.end });
      }
    }

    return ['like', 'dislike']
      .map(kind => ({
        kind,
        runs: normalizeBackendRuns(runsByKind[kind])
      }))
      .filter(reaction => reaction.runs.length);
  }

  function normalizeBackendRuns(runs) {
    const sorted = runs
      .filter(run => Number.isFinite(run.start) && Number.isFinite(run.end) && run.end > run.start)
      .map(run => ({ start: Math.floor(run.start), end: Math.ceil(run.end) }))
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const normalized = [];

    for (const run of sorted) {
      const previous = normalized[normalized.length - 1];
      if (previous && run.start <= previous.end) {
        previous.end = Math.max(previous.end, run.end);
      } else {
        normalized.push({ ...run });
      }
    }

    return normalized;
  }

  function createEmptyBackendState() {
    return {
      clientRevision: 0,
      acknowledgedFingerprint: null
    };
  }

  function getBackendSnapshotFingerprint(snapshot) {
    return JSON.stringify(snapshot.reactions || []);
  }

  function createBackendError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function readBackendStorageJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeBackendStorageJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Synchronization remains usable for the current page without persistence.
    }
  }

  function hashStorageScope(value) {
    let hash = 2166136261;
    const text = String(value);

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function normalizeViewMode(value) {
    return value === 'heatmap' ? 'heatmap' : 'mine';
  }

  function normalizeHeatmapOptions(options = {}) {
    const source = options && typeof options === 'object' ? options : {};
    const minAlpha = normalizeOptionalAlpha(source.minAlpha) ?? DEFAULT_HEATMAP.minAlpha;
    const maxAlpha = normalizeOptionalAlpha(source.maxAlpha) ?? DEFAULT_HEATMAP.maxAlpha;

    return {
      scale: ['linear', 'sqrt', 'log'].includes(source.scale)
        ? source.scale
        : DEFAULT_HEATMAP.scale,
      minAlpha: Math.min(minAlpha, maxAlpha),
      maxAlpha: Math.max(minAlpha, maxAlpha),
      includeLocalReactions: source.includeLocalReactions === undefined
        ? DEFAULT_HEATMAP.includeLocalReactions
        : Boolean(source.includeLocalReactions),
      overlapMode: source.overlapMode === 'blend' ? 'blend' : DEFAULT_HEATMAP.overlapMode
    };
  }

  function normalizeHeatmapResponse(response) {
    // Treat backend data as untrusted input: discard invalid ranges, clamp counts,
    // sort offsets, and recompute maxHits from the accepted segments.
    const source = response && typeof response === 'object' ? response : {};
    const segments = Array.isArray(source.segments)
      ? source.segments
        .map(segment => {
          const start = Math.max(0, Math.floor(Number(segment?.start)));
          const end = Math.max(0, Math.ceil(Number(segment?.end)));
          const likes = normalizeHeatmapCount(segment?.likes);
          const dislikes = normalizeHeatmapCount(segment?.dislikes);

          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
          if (likes + dislikes <= 0) return null;
          return { start, end, likes, dislikes };
        })
        .filter(Boolean)
        .sort((left, right) => left.start - right.start || left.end - right.end)
      : [];
    const computedMaxHits = segments.reduce(
      (maximum, segment) => Math.max(maximum, segment.likes + segment.dislikes),
      0
    );

    return {
      schema: 1,
      revision: String(source.revision ?? '0').slice(0, 96),
      maxHits: computedMaxHits,
      totalUsers: normalizeHeatmapCount(source.totalUsers),
      totalReactions: normalizeHeatmapCount(source.totalReactions),
      segments
    };
  }

  function cloneHeatmapResponse(response) {
    const heatmap = normalizeHeatmapResponse(response);
    return {
      ...heatmap,
      segments: heatmap.segments.map(segment => ({ ...segment }))
    };
  }

  function normalizeHeatmapCount(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return clamp(Math.floor(numericValue), 0, 1000000);
  }

  function normalizeOptionalAlpha(value) {
    if (value === undefined || value === null || value === '') return null;

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? clamp(numericValue, 0, 1) : null;
  }

  function countReactionRuns(reactions) {
    return reactions.reduce(
      (total, reaction) => total + getStoredAnchorRuns(reaction.anchor).length,
      0
    );
  }

  function resolveAnchorRuns(indexModel, anchor) {
    if (!indexModel || !anchor) return [];

    return getStoredAnchorRuns(anchor)
      .map(run => resolveTextAnchor(indexModel, run))
      .filter(Boolean)
      .sort((left, right) => left.start - right.start || left.end - right.end);
  }

  function resolveAnchor(indexModel, anchor) {
    const runs = resolveAnchorRuns(indexModel, anchor);
    if (!runs.length) return null;

    return {
      start: runs[0].start,
      end: runs[runs.length - 1].end,
      runs
    };
  }

  function getFragmentsForRange(indexModel, start, end) {
    return indexModel.fragments.filter(fragment =>
      fragment.globalStart >= start && fragment.globalEnd <= end
    );
  }

  function getFragmentsForAnchor(indexModel, anchor) {
    return getFragmentRunsForAnchor(indexModel, anchor).flat();
  }

  function getFragmentRunsForAnchor(indexModel, anchor) {
    const fragmentsByIndex = new Map();
    const fragmentRuns = [];

    for (const run of resolveAnchorRuns(indexModel, anchor)) {
      const fragmentRun = [];

      for (const fragment of getFragmentsForRange(indexModel, run.start, run.end)) {
        if (fragmentsByIndex.has(fragment.index)) continue;
        fragmentsByIndex.set(fragment.index, fragment);
        fragmentRun.push(fragment);
      }

      if (fragmentRun.length) fragmentRuns.push(fragmentRun);
    }

    return fragmentRuns;
  }

  function saveReactionWithMerge(reaction, indexModel, store, geometry = DEFAULT_GEOMETRY) {
    // A new same-kind stroke may bridge several older reactions. Repeatedly expand
    // the merged shape until no remaining candidate touches the growing result.
    let mergedFragments = getFragmentsForAnchor(indexModel, reaction.anchor);
    if (!mergedFragments.length) return store.saveReaction(reaction);

    subtractOppositeReactionFragments(reaction, mergedFragments, indexModel, store);

    const candidates = store.listReactions(reaction.docId).filter(candidate =>
      candidate.userId === reaction.userId &&
      candidate.kind === reaction.kind &&
      candidate.id !== reaction.id
    );

    const mergedCandidates = [];
    let changed = true;

    while (changed) {
      changed = false;

      for (const candidate of candidates) {
        if (mergedCandidates.includes(candidate)) continue;

        const candidateFragments = getFragmentsForAnchor(indexModel, candidate.anchor);
        if (!reactionShapesMergeable(mergedFragments, candidateFragments, indexModel, geometry)) continue;

        mergedCandidates.push(candidate);
        mergedFragments = mergeFragmentSets(mergedFragments, candidateFragments);
        changed = true;
      }
    }

    const mergedAnchor = createAnchorFromFragments(mergedFragments, indexModel);
    if (!mergedAnchor) return store.saveReaction(reaction);

    for (const candidate of mergedCandidates) {
      store.removeReaction(candidate.id);
    }

    const mergedCreatedAt = [
      reaction.createdAt,
      ...mergedCandidates.map(candidate => candidate.createdAt)
    ]
      .filter(Boolean)
      .sort()[0] || reaction.createdAt;

    return store.saveReaction({
      ...reaction,
      id: mergedCandidates[0] ? mergedCandidates[0].id : reaction.id,
      text: getTextFromFragments(mergedFragments),
      anchor: mergedAnchor,
      createdAt: mergedCreatedAt,
      updatedAt: mergedCandidates.length ? new Date().toISOString() : reaction.updatedAt
    });
  }

  function subtractOppositeReactionFragments(reaction, newFragments, indexModel, store) {
    // One reader cannot like and dislike the same graphemes simultaneously. A new
    // reaction subtracts its footprint from every opposite-kind local reaction.
    const newFragmentIndices = new Set(newFragments.map(fragment => fragment.index));
    const oppositeKind = reaction.kind === 'like' ? 'dislike' : 'like';
    const oppositeReactions = store.listReactions(reaction.docId).filter(candidate =>
      candidate.userId === reaction.userId &&
      candidate.kind === oppositeKind &&
      candidate.id !== reaction.id
    );

    for (const candidate of oppositeReactions) {
      const candidateFragments = getFragmentsForAnchor(indexModel, candidate.anchor);
      const remainingFragments = candidateFragments.filter(fragment =>
        !newFragmentIndices.has(fragment.index)
      );

      if (remainingFragments.length === candidateFragments.length) continue;

      store.removeReaction(candidate.id);
      const remainingAnchor = createAnchorFromFragments(remainingFragments, indexModel);

      if (remainingAnchor) {
        store.saveReaction({
          ...candidate,
          text: getTextFromFragments(remainingFragments),
          anchor: remainingAnchor,
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  function reactionShapesMergeable(fragmentsA, fragmentsB, indexModel, geometry = DEFAULT_GEOMETRY) {
    if (!fragmentsA.length || !fragmentsB.length) return false;

    const runsA = buildRemainingReactionRuns(fragmentsA);
    const runsB = buildRemainingReactionRuns(fragmentsB);

    return runsA.some(runA => runsB.some(runB => rangesMergeable(
      {
        start: runA[0].globalStart,
        end: runA[runA.length - 1].globalEnd
      },
      {
        start: runB[0].globalStart,
        end: runB[runB.length - 1].globalEnd
      },
      indexModel,
      geometry
    )));
  }

  function mergeFragmentSets(...fragmentSets) {
    const fragmentsByIndex = new Map();

    for (const fragments of fragmentSets) {
      for (const fragment of fragments) {
        fragmentsByIndex.set(fragment.index, fragment);
      }
    }

    return Array.from(fragmentsByIndex.values())
      .sort((left, right) => left.index - right.index);
  }

  function getTextFromFragments(fragments) {
    return buildRemainingReactionRuns(fragments)
      .map(run => run.map(fragment => fragment.text).join(''))
      .join('\n');
  }

  function rangesMergeable(rangeA, rangeB, indexModel, geometry = DEFAULT_GEOMETRY) {
    // Textual overlap and whitespace bridges merge immediately. Non-whitespace
    // gaps may still merge when their rendered shapes are visually adjacent.
    if (!rangeA || !rangeB || !indexModel) return false;

    const left = rangeA.start <= rangeB.start ? rangeA : rangeB;
    const right = left === rangeA ? rangeB : rangeA;

    if (left.end >= right.start) return true;

    const gapText = indexModel.text.slice(left.end, right.start);
    if (!gapText.trim()) return true;

    const leftRects = buildFinalRects(getFragmentsForRange(indexModel, left.start, left.end), geometry);
    const rightRects = buildFinalRects(getFragmentsForRange(indexModel, right.start, right.end), geometry);

    return distanceBetweenRectSets(leftRects, rightRects) <= geometry.radius * 0.55;
  }

  function buildFinalRects(fragments, geometry = DEFAULT_GEOMETRY) {
    if (!fragments.length) return [];

    const merged = [];

    for (const fragment of fragments) {
      const previous = merged[merged.length - 1];

      if (
        previous &&
        Math.abs(previous.y - fragment.y) < Math.max(previous.height, fragment.height) * 0.45 &&
        fragment.x <= previous.x + previous.width + geometry.detectTolerance
      ) {
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

    return merged.map(rect => normalizeRect(rect, geometry));
  }

  function normalizeRect(rect, geometry = DEFAULT_GEOMETRY) {
    const padding = geometry.radius * geometry.paddingRatio;
    const minSize = geometry.radius * 2;
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

  function buildFinalStamps(fragments, geometry = DEFAULT_GEOMETRY) {
    // Deterministic noise makes the cloud organic while keeping the same passage
    // visually stable across refreshes, heatmap updates, and responsive redraws.
    if (!fragments.length) return [];

    const stamps = [];
    const padding = geometry.radius * geometry.paddingRatio;

    for (let index = 0; index < fragments.length; index += 1) {
      const fragment = fragments[index];
      const previous = fragments[index - 1] || null;
      const next = fragments[index + 1] || null;
      const baseRadius = Math.max(fragment.height * 0.48 + padding, geometry.radius * 0.42);
      const spanStart = fragment.x - padding * 0.56;
      const spanEnd = fragment.x + fragment.width + padding * 0.56;
      const span = Math.max(0, spanEnd - spanStart);
      const step = Math.max(baseRadius * 0.92, 8);
      const count = Math.max(1, Math.ceil(span / step));
      const previousSameRow = previous && areSameVisualLineFragments(previous, fragment);
      const nextSameRow = next && areSameVisualLineFragments(fragment, next);

      for (let stampIndex = 0; stampIndex < count; stampIndex += 1) {
        const t = count === 1 ? 0.5 : stampIndex / (count - 1);
        const jitterX = signedNoise(fragment.index, stampIndex, 1);
        const jitterY = signedNoise(fragment.index, stampIndex, 2);
        const jitterR = signedNoise(fragment.index, stampIndex, 3);

        stamps.push({
          x: count === 1 ? fragment.centerX : spanStart + span * t + jitterX * baseRadius * 0.08,
          y: fragment.centerY + jitterY * Math.min(fragment.height * 0.16, geometry.radius * 0.14),
          radius: baseRadius * (0.9 + jitterR * 0.12)
        });
      }

      if (!previousSameRow) {
        stamps.push({
          x: spanStart - baseRadius * 0.18,
          y: fragment.centerY,
          radius: baseRadius * 0.98
        });
      }

      if (!nextSameRow) {
        stamps.push({
          x: spanEnd + baseRadius * 0.18,
          y: fragment.centerY,
          radius: baseRadius * 0.98
        });
      }

      if (!next) continue;

      const sameRow = areSameVisualLineFragments(fragment, next);
      const horizontalGap = next.x - (fragment.x + fragment.width);

      if (sameRow && horizontalGap > 0 && horizontalGap < geometry.radius * 1.9) {
        const startX = fragment.x + fragment.width;
        const endX = next.x;
        const connectorSpan = Math.max(0, endX - startX);
        const connectorRadius = Math.max(baseRadius * 0.76, geometry.radius * 0.34);
        const connectorCount = Math.max(1, Math.ceil(connectorSpan / Math.max(connectorRadius * 0.85, 6)));

        for (let connectorIndex = 1; connectorIndex <= connectorCount; connectorIndex += 1) {
          const t = connectorIndex / (connectorCount + 1);
          stamps.push({
            x: startX + connectorSpan * t,
            y: fragment.centerY + signedNoise(fragment.index, connectorIndex, 4) * connectorRadius * 0.08,
            radius: connectorRadius * (0.94 + signedNoise(fragment.index, connectorIndex, 5) * 0.08)
          });
        }
      }
    }

    return stamps;
  }

  function segmentText(text) {
    if (SEGMENTER) {
      return Array.from(SEGMENTER.segment(text)).map(part => ({
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

  function isSelectableTextNode(node) {
    if (!node || !node.nodeValue) return false;

    const parent = node.parentElement;
    if (!parent) return false;
    if (parent.closest('script, style, noscript, svg, canvas, [data-overlay-ui]')) return false;

    const style = window.getComputedStyle(parent);
    return !(
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    );
  }

  function measureFragmentRect(range) {
    const clientRects = Array.from(range.getClientRects()).filter(rect => rect.width && rect.height);

    if (clientRects.length) {
      const bestRect = clientRects.reduce((best, rect) => {
        if (!best) return rect;

        const bestArea = best.width * best.height;
        const rectArea = rect.width * rect.height;
        return rectArea < bestArea || (rectArea === bestArea && rect.width < best.width)
          ? rect
          : best;
      }, null);

      if (bestRect) {
        return {
          left: bestRect.left,
          top: bestRect.top,
          width: bestRect.width,
          height: bestRect.height
        };
      }
    }

    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function createEmptyStore() {
    return { reactions: [] };
  }

  function cloneStore(store) {
    return JSON.parse(JSON.stringify(store));
  }

  function getOrCreateUserId(key = 'relikes-user-v1') {
    // This ID separates local reactions only. Backend identity must come from a
    // trusted authenticated session or the signed anonymous token protocol.
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;

      const created = createId('reader');
      localStorage.setItem(key, created);
      return created;
    } catch (error) {
      return createId('reader');
    }
  }

  function createId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return prefix + '-' + crypto.randomUUID();
    }

    return prefix + '-' + Math.random().toString(36).slice(2, 10);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function rgba(color, alpha) {
    return 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + alpha + ')';
  }

  function mixColor(from, to, progress) {
    return [
      Math.round(from[0] + (to[0] - from[0]) * progress),
      Math.round(from[1] + (to[1] - from[1]) * progress),
      Math.round(from[2] + (to[2] - from[2]) * progress)
    ];
  }

  function signedNoise(a, b, c) {
    const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }

  function areSameVisualLineFragments(left, right) {
    if (!left || !right) return false;
    return Math.abs(left.centerY - right.centerY) <= Math.max(left.height, right.height) * 0.4;
  }

  function rectDistance(rectA, rectB) {
    const dx = Math.max(rectA.x - (rectB.x + rectB.width), rectB.x - (rectA.x + rectA.width), 0);
    const dy = Math.max(rectA.y - (rectB.y + rectB.height), rectB.y - (rectA.y + rectA.height), 0);
    return Math.hypot(dx, dy);
  }

  function distanceBetweenRectSets(rectsA, rectsB) {
    if (!rectsA.length || !rectsB.length) return Infinity;

    let minDistance = Infinity;

    for (const rectA of rectsA) {
      for (const rectB of rectsB) {
        minDistance = Math.min(minDistance, rectDistance(rectA, rectB));
      }
    }

    return minDistance;
  }

  function sharedSuffixLength(left, right) {
    let count = 0;
    while (
      count < left.length &&
      count < right.length &&
      left[left.length - count - 1] === right[right.length - count - 1]
    ) {
      count += 1;
    }

    return count;
  }

  function sharedPrefixLength(left, right) {
    let count = 0;
    while (count < left.length && count < right.length && left[count] === right[count]) {
      count += 1;
    }

    return count;
  }

  function getAnchorSignature(anchor) {
    return JSON.stringify(getStoredAnchorRuns(anchor).map(run => [
      run.start,
      run.end,
      run.exact,
      run.prefix,
      run.suffix
    ]));
  }

  window.Relikes = {
    version: '1.1.0',
    attach,
    getOrCreateUserId,
    LocalReactionStore,
    RelikesApiClient,
    RelikesBackendSync,
    CloudOverlay,
    buildContentIndex,
    createAnchorFromQuote,
    createAnchorFromOffsets,
    createAnchorFromSelection,
    resolveAnchor,
    resolveAnchorRuns,
    getFragmentsForRange,
    getFragmentsForAnchor,
    getFragmentRunsForAnchor,
    buildHeatmapEntries,
    buildFinalStamps,
    buildFinalRects,
    normalizeRect,
    createOverlayEntryFromAnchor,
    createOverlayEntryFromReaction,
    buildEntriesFromReactions,
    utils: {
      clamp,
      rgba,
      mixColor,
      signedNoise,
      withDetachedOverlayChildren
    }
  };
})();
