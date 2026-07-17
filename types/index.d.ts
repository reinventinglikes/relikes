// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

declare namespace Relikes {
  type RGB = [number, number, number];
  type ReactionKind = 'like' | 'dislike';
  type ViewMode = 'mine' | 'heatmap';

  interface TextAnchorRun {
    start: number;
    end: number;
    exact: string;
    prefix: string;
    suffix: string;
  }

  interface TextAnchor extends TextAnchorRun {
    version?: 2;
    runs?: TextAnchorRun[];
  }

  interface Reaction {
    id: string;
    docId: string;
    userId: string;
    kind: ReactionKind;
    anchor: TextAnchor;
    createdAt?: string;
    updatedAt?: string;
  }

  interface ReactionStore {
    listReactions(docId: string): Reaction[];
    saveReaction(reaction: Reaction): Reaction[];
    removeReaction(reactionId: string): void;
    clearUser(docId: string, userId: string): void;
  }

  interface Colors {
    selection?: RGB;
    like?: RGB;
    dislike?: RGB;
  }

  interface Geometry {
    radius?: number;
    paddingRatio?: number;
    detectTolerance?: number;
    overlayPadding?: number;
  }

  interface HeatmapOptions {
    scale?: 'linear' | 'sqrt' | 'log';
    minAlpha?: number;
    maxAlpha?: number;
    maxSteps?: number;
    includeLocalReactions?: boolean;
    overlapMode?: 'split' | 'blend';
    data?: HeatmapResponse;
  }

  interface HeatmapSegment {
    start: number;
    end: number;
    likes: number;
    dislikes: number;
  }

  interface HeatmapResponse {
    schema?: 1;
    revision?: string | number;
    maxHits?: number;
    totalUsers?: number;
    totalReactions?: number;
    maxSteps?: number;
    segments?: HeatmapSegment[];
  }

  interface BackendRoute {
    url?: string;
    method?: string;
  }

  interface BackendOptions {
    enabled?: boolean;
    url: string;
    documentId?: string;
    documentVersion: string;
    userId?: string | number | null | (() => string | number | null);
    routes?: Partial<Record<'session' | 'reactions' | 'heatmap', BackendRoute | string | ((context: unknown) => BackendRoute | string)>>;
    headers?: HeadersInit | ((context: unknown) => HeadersInit);
    credentials?: RequestCredentials;
    fetch?: typeof fetch;
    request?: (context: unknown) => Promise<unknown>;
    tokenStorageKey?: string;
    stateStorageKey?: string;
    saveDebounceMs?: number;
    minWriteIntervalMs?: number;
    retryBaseMs?: number;
    retryMaxMs?: number;
  }

  interface Options {
    docId?: string;
    userId?: string;
    userKey?: string;
    storageKey?: string;
    store?: ReactionStore;
    colors?: Colors;
    geometry?: Geometry;
    reactionAlpha?: number;
    heatmap?: HeatmapOptions;
    airbrush?: Record<string, unknown>;
    interactiveElements?: unknown;
    touchEraseControl?: boolean | object;
    touchEraseBar?: boolean | object;
    popupRenderer?: unknown;
    backend?: BackendOptions | null;
    eraseEnabled?: boolean;
    viewMode?: ViewMode;
    onChange?: (state: unknown) => void;
    onViewModeChange?: (mode: ViewMode) => void;
    onHeatmapChange?: (state: HeatmapResponse) => void;
    onBackendChange?: (state: unknown) => void;
  }

  interface ContentIndex {
    text: string;
    fragments: Array<Record<string, unknown>>;
  }

  class LocalReactionStore implements ReactionStore {
    constructor(storageKey: string);
    read(): { reactions: Reaction[] };
    write(store: { reactions: Reaction[] }): void;
    listReactions(docId: string): Reaction[];
    saveReaction(reaction: Reaction): Reaction[];
    removeReaction(reactionId: string): void;
    clearUser(docId: string, userId: string): void;
  }

  class RelikesApiClient {
    constructor(instance: Instance, options: BackendOptions);
    getState(): unknown;
    initialize(snapshot: unknown): Promise<unknown>;
    saveSnapshot(snapshot: unknown): Promise<unknown>;
    loadHeatmap(context?: unknown): Promise<HeatmapResponse>;
  }

  class RelikesBackendSync {
    constructor(instance: Instance, options: BackendOptions);
    start(): void;
    getState(): unknown;
    getSnapshot(): unknown;
    flush(): Promise<unknown>;
    refreshHeatmap(): Promise<unknown>;
    destroy(): void;
  }

  class CloudOverlay {
    constructor(element: HTMLElement, geometry?: Geometry);
    setEntries(entries: unknown[]): void;
    resize(): void;
    requestRender(): void;
    sprayCloud(stamps: unknown[], options: unknown): void;
    destroy(): void;
  }

  interface Instance {
    readonly el: HTMLElement;
    refresh(): void;
    render(): void;
    getReactionAlpha(): number;
    getViewMode(): ViewMode;
    setViewMode(mode: ViewMode): ViewMode;
    setHeatmapData(response: HeatmapResponse): void;
    getHeatmapState(): HeatmapResponse;
    getMine(): Reaction[];
    getCounts(): { likes: number; dislikes: number };
    setEraseEnabled(enabled: boolean): void;
    clearUser(): void;
    getBackendState(): unknown;
    refreshBackendHeatmap(): Promise<unknown> | null;
    flushBackend(): Promise<unknown> | null;
    eraseAtPoint(clientX: number, clientY: number): boolean;
    destroy(): void;
  }
}

declare const Relikes: {
  readonly version: '1.1.0';
  attach(element: HTMLElement, options?: Relikes.Options): Relikes.Instance;
  getOrCreateUserId(key?: string): string;
  LocalReactionStore: typeof Relikes.LocalReactionStore;
  RelikesApiClient: typeof Relikes.RelikesApiClient;
  RelikesBackendSync: typeof Relikes.RelikesBackendSync;
  CloudOverlay: typeof Relikes.CloudOverlay;
  buildContentIndex(root: HTMLElement): Relikes.ContentIndex;
  createAnchorFromQuote(quote: string, index: Relikes.ContentIndex): Relikes.TextAnchor | null;
  createAnchorFromOffsets(start: number, end: number, index: Relikes.ContentIndex): Relikes.TextAnchorRun | null;
  createAnchorFromSelection(indices: Iterable<number>, index: Relikes.ContentIndex): Relikes.TextAnchor | null;
  resolveAnchor(index: Relikes.ContentIndex, anchor: Relikes.TextAnchor): unknown;
  resolveAnchorRuns(index: Relikes.ContentIndex, anchor: Relikes.TextAnchor): unknown[];
  getFragmentsForRange(index: Relikes.ContentIndex, start: number, end: number): unknown[];
  getFragmentsForAnchor(index: Relikes.ContentIndex, anchor: Relikes.TextAnchor): unknown[];
  getFragmentRunsForAnchor(index: Relikes.ContentIndex, anchor: Relikes.TextAnchor): unknown[][];
  buildHeatmapEntries(response: Relikes.HeatmapResponse, index: Relikes.ContentIndex, colors?: Relikes.Colors, geometry?: Relikes.Geometry, options?: Relikes.HeatmapOptions): unknown[];
  buildFinalStamps(fragments: unknown[], geometry?: Relikes.Geometry): unknown[];
  buildFinalRects(fragments: unknown[], geometry?: Relikes.Geometry): unknown[];
  normalizeRect(rect: unknown, geometry?: Relikes.Geometry): unknown;
  createOverlayEntryFromAnchor(...args: unknown[]): unknown;
  createOverlayEntryFromReaction(...args: unknown[]): unknown;
  buildEntriesFromReactions(...args: unknown[]): unknown[];
  utils: {
    clamp(value: number, min: number, max: number): number;
    rgba(color: Relikes.RGB, alpha: number): string;
    mixColor(from: Relikes.RGB, to: Relikes.RGB, progress: number): Relikes.RGB;
    signedNoise(a: number, b: number, c: number): number;
    withDetachedOverlayChildren<T>(parent: HTMLElement, callback: () => T, predicate?: (element: Element) => boolean): T;
  };
};

export = Relikes;
export as namespace Relikes;
