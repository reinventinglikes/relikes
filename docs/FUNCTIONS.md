<!--
SPDX-FileCopyrightText: 2026 kotoverse
SPDX-License-Identifier: MIT
-->

# Complete function reference

This generated inventory covers every named function, named closure, class method, constructor, and named object method in the canonical source. Anonymous callbacks are described at their call sites rather than assigned artificial API names. Public and experimental stability is defined by [API.md](API.md); internal entries may change in any release.

| Callable | Visibility | Responsibility | Location |
| --- | --- | --- | --- |
| `LocalReactionStore.constructor(storageKey)` | Public | Initializes a LocalReactionStore instance. | [source](../src/relikes.js#L73) |
| `LocalReactionStore.read()` | Public | Provides read behavior. | [source](../src/relikes.js#L78) |
| `LocalReactionStore.write(nextStore)` | Public | Provides write behavior. | [source](../src/relikes.js#L94) |
| `LocalReactionStore.listReactions(docId)` | Public | Provides list reactions behavior. | [source](../src/relikes.js#L104) |
| `LocalReactionStore.saveReaction(reaction)` | Public | Provides save reaction behavior. | [source](../src/relikes.js#L114) |
| `LocalReactionStore.removeReaction(reactionId)` | Public | Provides remove reaction behavior. | [source](../src/relikes.js#L141) |
| `LocalReactionStore.clearUser(docId, userId)` | Public | Provides clear user behavior. | [source](../src/relikes.js#L147) |
| `RelikesApiClient.constructor(instance, options)` | Experimental | Initializes a RelikesApiClient instance. | [source](../src/relikes.js#L162) |
| `RelikesApiClient.getState()` | Experimental | Provides get state behavior. | [source](../src/relikes.js#L177) |
| `RelikesApiClient.initialize(snapshot)` | Experimental | Provides initialize behavior. | [source](../src/relikes.js#L192) |
| `RelikesApiClient.saveSnapshot(snapshot)` | Experimental | Provides save snapshot behavior. | [source](../src/relikes.js#L213) |
| `RelikesApiClient.loadHeatmap(context = {})` | Experimental | Provides load heatmap behavior. | [source](../src/relikes.js#L292) |
| `RelikesApiClient.requestHeatmap(requestToken)` | Experimental | Provides request heatmap behavior. | [source](../src/relikes.js#L296) |
| `RelikesApiClient.ensureToken()` | Experimental | Provides ensure token behavior. | [source](../src/relikes.js#L334) |
| `RelikesApiClient.getStoredToken()` | Experimental | Provides get stored token behavior. | [source](../src/relikes.js#L357) |
| `RelikesApiClient.clearStoredToken()` | Experimental | Provides clear stored token behavior. | [source](../src/relikes.js#L374) |
| `RelikesApiClient.getUserId()` | Experimental | Provides get user id behavior. | [source](../src/relikes.js#L383) |
| `RelikesApiClient.selectIdentityState(userId)` | Experimental | Provides select identity state behavior. | [source](../src/relikes.js#L391) |
| `RelikesApiClient.getStateStorageKey()` | Experimental | Provides get state storage key behavior. | [source](../src/relikes.js#L406) |
| `RelikesApiClient.persistState()` | Experimental | Provides persist state behavior. | [source](../src/relikes.js#L412) |
| `RelikesApiClient.updateRevisionFromConflict(error)` | Experimental | Provides update revision from conflict behavior. | [source](../src/relikes.js#L416) |
| `RelikesApiClient.request(operation, requestOptions = {})` | Experimental | Provides request behavior. | [source](../src/relikes.js#L427) |
| `RelikesApiClient.resolveRoute(operation, requestOptions)` | Experimental | Provides resolve route behavior. | [source](../src/relikes.js#L476) |
| `RelikesApiClient.parseResponse(result)` | Experimental | Provides parse response behavior. | [source](../src/relikes.js#L500) |
| `RelikesBackendSync.constructor(instance, options)` | Experimental | Initializes a RelikesBackendSync instance. | [source](../src/relikes.js#L529) |
| `RelikesBackendSync.start()` | Experimental | Provides start behavior. | [source](../src/relikes.js#L558) |
| `RelikesBackendSync.getState()` | Experimental | Provides get state behavior. | [source](../src/relikes.js#L564) |
| `RelikesBackendSync.getSnapshot()` | Experimental | Provides get snapshot behavior. | [source](../src/relikes.js#L583) |
| `RelikesBackendSync.initialize()` | Experimental | Provides initialize behavior. | [source](../src/relikes.js#L604) |
| `RelikesBackendSync.scheduleSync(delay = this.opts.saveDebounceMs)` | Experimental | Provides schedule sync behavior. | [source](../src/relikes.js#L617) |
| `RelikesBackendSync.flush()` | Experimental | Provides flush behavior. | [source](../src/relikes.js#L636) |
| `RelikesBackendSync.writeCurrentSnapshot()` | Experimental | Provides write current snapshot behavior. | [source](../src/relikes.js#L660) |
| `RelikesBackendSync.refreshHeatmap()` | Experimental | Provides refresh heatmap behavior. | [source](../src/relikes.js#L678) |
| `RelikesBackendSync.applyHeatmapResponse(response, required = false)` | Experimental | Provides apply heatmap response behavior. | [source](../src/relikes.js#L687) |
| `RelikesBackendSync.handleError(error, retryOperation = 'save')` | Experimental | Provides handle error behavior. | [source](../src/relikes.js#L706) |
| `RelikesBackendSync.setStatus(status)` | Experimental | Provides set status behavior. | [source](../src/relikes.js#L734) |
| `RelikesBackendSync.destroy()` | Experimental | Provides destroy behavior. | [source](../src/relikes.js#L744) |
| `CloudOverlay.constructor(element, geometry = DEFAULT_GEOMETRY)` | Experimental | Initializes a CloudOverlay instance. | [source](../src/relikes.js#L760) |
| `CloudOverlay.setEntries(entries)` | Experimental | Provides set entries behavior. | [source](../src/relikes.js#L802) |
| `CloudOverlay.resize()` | Experimental | Provides resize behavior. | [source](../src/relikes.js#L831) |
| `CloudOverlay.requestRender()` | Experimental | Provides request render behavior. | [source](../src/relikes.js#L868) |
| `CloudOverlay._render(now)` | Internal | Implements render behavior. | [source](../src/relikes.js#L873) |
| `CloudOverlay.destroy()` | Experimental | Provides destroy behavior. | [source](../src/relikes.js#L948) |
| `CloudOverlay.sprayCloud(stamps, options)` | Experimental | Provides spray cloud behavior. | [source](../src/relikes.js#L958) |
| `RelikesInstance.constructor(element, options = {})` | Public | Initializes a RelikesInstance instance. | [source](../src/relikes.js#L981) |
| `RelikesInstance.attachCapture()` | Public | Provides attach capture behavior. | [source](../src/relikes.js#L1043) |
| `RelikesInstance.buildAirbrushOptions()` | Public | Provides build airbrush options behavior. | [source](../src/relikes.js#L1055) |
| `RelikesInstance.refresh()` | Public | Provides refresh behavior. | [source](../src/relikes.js#L1085) |
| `RelikesInstance.render()` | Public | Provides render behavior. | [source](../src/relikes.js#L1101) |
| `RelikesInstance.getReactionAlpha()` | Public | Provides get reaction alpha behavior. | [source](../src/relikes.js#L1131) |
| `RelikesInstance.getViewMode()` | Public | Provides get view mode behavior. | [source](../src/relikes.js#L1135) |
| `RelikesInstance.setViewMode(nextMode)` | Public | Provides set view mode behavior. | [source](../src/relikes.js#L1139) |
| `RelikesInstance.setHeatmapData(response)` | Public | Provides set heatmap data behavior. | [source](../src/relikes.js#L1157) |
| `RelikesInstance.getHeatmapState()` | Public | Provides get heatmap state behavior. | [source](../src/relikes.js#L1173) |
| `RelikesInstance.syncCaptureMode()` | Public | Provides sync capture mode behavior. | [source](../src/relikes.js#L1177) |
| `RelikesInstance.getMine()` | Public | Provides get mine behavior. | [source](../src/relikes.js#L1191) |
| `RelikesInstance.getCounts()` | Public | Provides get counts behavior. | [source](../src/relikes.js#L1195) |
| `RelikesInstance.emitChange()` | Public | Provides emit change behavior. | [source](../src/relikes.js#L1207) |
| `RelikesInstance.setEraseEnabled(enabled)` | Public | Provides set erase enabled behavior. | [source](../src/relikes.js#L1222) |
| `RelikesInstance.clearUser()` | Public | Provides clear user behavior. | [source](../src/relikes.js#L1229) |
| `RelikesInstance.getBackendState()` | Public | Provides get backend state behavior. | [source](../src/relikes.js#L1235) |
| `RelikesInstance.refreshBackendHeatmap()` | Public | Provides refresh backend heatmap behavior. | [source](../src/relikes.js#L1246) |
| `RelikesInstance.flushBackend()` | Public | Provides flush backend behavior. | [source](../src/relikes.js#L1250) |
| `RelikesInstance.destroy()` | Public | Provides destroy behavior. | [source](../src/relikes.js#L1254) |
| `RelikesInstance.getLivePopupContext(popupContext = {})` | Public | Provides get live popup context behavior. | [source](../src/relikes.js#L1265) |
| `RelikesInstance.applyPopupReaction(kind, popupContext)` | Public | Provides apply popup reaction behavior. | [source](../src/relikes.js#L1277) |
| `RelikesInstance.createRelikesPopupContext(cleanSelectionContext)` | Public | Provides create relikes popup context behavior. | [source](../src/relikes.js#L1302) |
| `RelikesInstance.react(kind)` | Public | Provides react behavior. | [source](../src/relikes.js#L1304) |
| `RelikesInstance.like()` | Public | Provides like behavior. | [source](../src/relikes.js#L1305) |
| `RelikesInstance.dislike()` | Public | Provides dislike behavior. | [source](../src/relikes.js#L1306) |
| `RelikesInstance.wrapPopupController(controller)` | Public | Provides wrap popup controller behavior. | [source](../src/relikes.js#L1325) |
| `RelikesInstance.commitReaction(kind, popupContext)` | Public | Provides commit reaction behavior. | [source](../src/relikes.js#L1358) |
| `RelikesInstance.createPopupRenderer()` | Public | Provides create popup renderer behavior. | [source](../src/relikes.js#L1385) |
| `RelikesInstance.createDefaultPopupRenderer()` | Public | Provides create default popup renderer behavior. | [source](../src/relikes.js#L1436) |
| `RelikesInstance.setPending(pending)` | Public | Provides set pending behavior. | [source](../src/relikes.js#L1607) |
| `RelikesInstance.applyReaction(kind)` | Public | Provides apply reaction behavior. | [source](../src/relikes.js#L1614) |
| `RelikesInstance.update(nextContext)` | Public | Provides update behavior. | [source](../src/relikes.js#L1643) |
| `RelikesInstance.eraseAtPoint(clientX, clientY)` | Public | Provides erase at point behavior. | [source](../src/relikes.js#L1652) |
| `attach(element, options = {})` | Public | Provides attach behavior. | [source](../src/relikes.js#L1679) |
| `patchCaptureMeasurement(instance)` | Internal | Implements patch capture measurement behavior. | [source](../src/relikes.js#L1683) |
| `getHeatmapLevel(total, maxHits, maxSteps = DEFAULT_HEATMAP.maxSteps)` | Internal | Implements get heatmap level behavior. | [source](../src/relikes.js#L1902) |
| `getHeatmapStrength(total, maxHits, scale = 'sqrt')` | Internal | Implements get heatmap strength behavior. | [source](../src/relikes.js#L1908) |
| `buildHeatmapClipRegions(fragments, channel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements build heatmap clip regions behavior. | [source](../src/relikes.js#L1919) |
| `createOverlayEntryFromAnchor(key, anchor, indexModel, options = {})` | Public | Provides create overlay entry from anchor behavior. | [source](../src/relikes.js#L1954) |
| `eraseReactionFragmentsAtPoint(reaction, point, indexModel, store, geometry = DEFAULT_GEOMETRY)` | Internal | Implements erase reaction fragments at point behavior. | [source](../src/relikes.js#L1972) |
| `isFragmentTouchedByEraser(fragment, point, geometry = DEFAULT_GEOMETRY)` | Internal | Implements is fragment touched by eraser behavior. | [source](../src/relikes.js#L2002) |
| `buildRemainingReactionRuns(fragments)` | Internal | Implements build remaining reaction runs behavior. | [source](../src/relikes.js#L2016) |
| `closure.flush()` | Internal | Implements flush behavior. | [source](../src/relikes.js#L2021) |
| `getLocalPoint(element, clientX, clientY, padding = 0)` | Internal | Implements get local point behavior. | [source](../src/relikes.js#L2046) |
| `isGeneratedOverlayChild(element)` | Internal | Implements is generated overlay child behavior. | [source](../src/relikes.js#L2064) |
| `withDetachedOverlayChildren(parent, callback, predicate = isGeneratedOverlayChild)` | Experimental | Provides with detached overlay children behavior. | [source](../src/relikes.js#L2075) |
| `buildContentIndex(root)` | Public | Provides build content index behavior. | [source](../src/relikes.js#L2103) |
| `createAnchorFromSelection(fragmentIndices, indexModel)` | Public | Provides create anchor from selection behavior. | [source](../src/relikes.js#L2171) |
| `createAnchorFromFragments(fragments, indexModel)` | Internal | Implements create anchor from fragments behavior. | [source](../src/relikes.js#L2180) |
| `createAnchorFromQuote(quote, indexModel)` | Public | Provides create anchor from quote behavior. | [source](../src/relikes.js#L2201) |
| `createAnchorFromOffsets(start, end, indexModel)` | Public | Provides create anchor from offsets behavior. | [source](../src/relikes.js#L2208) |
| `normalizeTextRange(start, end, text)` | Internal | Implements normalize text range behavior. | [source](../src/relikes.js#L2223) |
| `resolveTextAnchor(indexModel, anchor)` | Internal | Implements resolve text anchor behavior. | [source](../src/relikes.js#L2240) |
| `resolveWhitespaceInsensitiveAnchor(text, anchor)` | Internal | Implements resolve whitespace insensitive anchor behavior. | [source](../src/relikes.js#L2287) |
| `getStoredAnchorRuns(anchor)` | Internal | Implements get stored anchor runs behavior. | [source](../src/relikes.js#L2334) |
| `normalizeBackendOptions(options)` | Internal | Implements normalize backend options behavior. | [source](../src/relikes.js#L2340) |
| `resolveBackendRequestUrl(routeUrl, baseUrl)` | Internal | Implements resolve backend request url behavior. | [source](../src/relikes.js#L2406) |
| `normalizeBackendDelay(value, fallback)` | Internal | Implements normalize backend delay behavior. | [source](../src/relikes.js#L2432) |
| `buildBackendReactions(instance)` | Internal | Implements build backend reactions behavior. | [source](../src/relikes.js#L2437) |
| `normalizeBackendRuns(runs)` | Internal | Implements normalize backend runs behavior. | [source](../src/relikes.js#L2458) |
| `createEmptyBackendState()` | Internal | Implements create empty backend state behavior. | [source](../src/relikes.js#L2477) |
| `getBackendSnapshotFingerprint(snapshot)` | Internal | Implements get backend snapshot fingerprint behavior. | [source](../src/relikes.js#L2484) |
| `createBackendError(code, message)` | Internal | Implements create backend error behavior. | [source](../src/relikes.js#L2488) |
| `readBackendStorageJson(key, fallback)` | Internal | Implements read backend storage json behavior. | [source](../src/relikes.js#L2494) |
| `writeBackendStorageJson(key, value)` | Internal | Implements write backend storage json behavior. | [source](../src/relikes.js#L2505) |
| `hashStorageScope(value)` | Internal | Implements hash storage scope behavior. | [source](../src/relikes.js#L2513) |
| `normalizeViewMode(value)` | Internal | Implements normalize view mode behavior. | [source](../src/relikes.js#L2525) |
| `normalizeHeatmapOptions(options = {})` | Internal | Implements normalize heatmap options behavior. | [source](../src/relikes.js#L2529) |
| `normalizeHeatmapResponse(response)` | Internal | Implements normalize heatmap response behavior. | [source](../src/relikes.js#L2548) |
| `cloneHeatmapResponse(response)` | Internal | Implements clone heatmap response behavior. | [source](../src/relikes.js#L2583) |
| `normalizeHeatmapCount(value)` | Internal | Implements normalize heatmap count behavior. | [source](../src/relikes.js#L2591) |
| `normalizeHeatmapSteps(value, fallback)` | Internal | Implements normalize heatmap steps behavior. | [source](../src/relikes.js#L2597) |
| `normalizeOptionalAlpha(value)` | Internal | Implements normalize optional alpha behavior. | [source](../src/relikes.js#L2603) |
| `countReactionRuns(reactions)` | Internal | Implements count reaction runs behavior. | [source](../src/relikes.js#L2610) |
| `resolveAnchorRuns(indexModel, anchor)` | Public | Provides resolve anchor runs behavior. | [source](../src/relikes.js#L2617) |
| `resolveAnchor(indexModel, anchor)` | Public | Provides resolve anchor behavior. | [source](../src/relikes.js#L2626) |
| `getFragmentsForRange(indexModel, start, end)` | Public | Provides get fragments for range behavior. | [source](../src/relikes.js#L2637) |
| `getFragmentsForAnchor(indexModel, anchor)` | Public | Provides get fragments for anchor behavior. | [source](../src/relikes.js#L2665) |
| `getFragmentRunsForAnchor(indexModel, anchor)` | Public | Provides get fragment runs for anchor behavior. | [source](../src/relikes.js#L2669) |
| `saveReactionWithMerge(reaction, indexModel, store, geometry = DEFAULT_GEOMETRY)` | Internal | Implements save reaction with merge behavior. | [source](../src/relikes.js#L2688) |
| `subtractOppositeReactionFragments(reaction, newFragments, indexModel, store)` | Internal | Implements subtract opposite reaction fragments behavior. | [source](../src/relikes.js#L2744) |
| `reactionShapesMergeable(fragmentsA, fragmentsB, indexModel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements reaction shapes mergeable behavior. | [source](../src/relikes.js#L2777) |
| `mergeFragmentSets(...fragmentSets)` | Internal | Implements merge fragment sets behavior. | [source](../src/relikes.js#L2797) |
| `getTextFromFragments(fragments)` | Internal | Implements get text from fragments behavior. | [source](../src/relikes.js#L2810) |
| `rangesMergeable(rangeA, rangeB, indexModel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements ranges mergeable behavior. | [source](../src/relikes.js#L2816) |
| `buildFinalRects(fragments, geometry = DEFAULT_GEOMETRY)` | Public | Provides build final rects behavior. | [source](../src/relikes.js#L2835) |
| `normalizeRect(rect, geometry = DEFAULT_GEOMETRY)` | Public | Provides normalize rect behavior. | [source](../src/relikes.js#L2867) |
| `buildFinalStamps(fragments, geometry = DEFAULT_GEOMETRY)` | Public | Provides build final stamps behavior. | [source](../src/relikes.js#L2883) |
| `segmentText(text)` | Internal | Implements segment text behavior. | [source](../src/relikes.js#L2959) |
| `isSelectableTextNode(node)` | Internal | Implements is selectable text node behavior. | [source](../src/relikes.js#L2983) |
| `measureFragmentRect(range)` | Internal | Implements measure fragment rect behavior. | [source](../src/relikes.js#L2998) |
| `createEmptyStore()` | Internal | Implements create empty store behavior. | [source](../src/relikes.js#L3033) |
| `cloneStore(store)` | Internal | Implements clone store behavior. | [source](../src/relikes.js#L3037) |
| `getOrCreateUserId(key = 'relikes-user-v1')` | Public | Provides get or create user id behavior. | [source](../src/relikes.js#L3041) |
| `createId(prefix)` | Internal | Implements create id behavior. | [source](../src/relikes.js#L3056) |
| `clamp(value, min, max)` | Experimental | Provides clamp behavior. | [source](../src/relikes.js#L3064) |
| `rgba(color, alpha)` | Experimental | Provides rgba behavior. | [source](../src/relikes.js#L3068) |
| `mixColor(from, to, progress)` | Experimental | Provides mix color behavior. | [source](../src/relikes.js#L3072) |
| `signedNoise(a, b, c)` | Experimental | Provides signed noise behavior. | [source](../src/relikes.js#L3080) |
| `areSameVisualLineFragments(left, right)` | Internal | Implements are same visual line fragments behavior. | [source](../src/relikes.js#L3085) |
| `rectDistance(rectA, rectB)` | Internal | Implements rect distance behavior. | [source](../src/relikes.js#L3090) |
| `distanceBetweenRectSets(rectsA, rectsB)` | Internal | Implements distance between rect sets behavior. | [source](../src/relikes.js#L3096) |
| `sharedSuffixLength(left, right)` | Internal | Implements shared suffix length behavior. | [source](../src/relikes.js#L3110) |
| `sharedPrefixLength(left, right)` | Internal | Implements shared prefix length behavior. | [source](../src/relikes.js#L3123) |
| `getAnchorSignature(anchor)` | Internal | Implements get anchor signature behavior. | [source](../src/relikes.js#L3132) |

Total documented named callables: **150**.
