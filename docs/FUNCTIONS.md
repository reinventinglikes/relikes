<!--
SPDX-FileCopyrightText: 2026 kotoverse
SPDX-License-Identifier: MIT
-->

# Complete function reference

This generated inventory covers every named function, named closure, class method, constructor, and named object method in the canonical source. Anonymous callbacks are described at their call sites rather than assigned artificial API names. Public and experimental stability is defined by [API.md](API.md); internal entries may change in any release.

| Callable | Visibility | Responsibility | Location |
| --- | --- | --- | --- |
| `LocalReactionStore.constructor(storageKey)` | Public | Initializes a LocalReactionStore instance. | [source](../src/relikes.js#L70) |
| `LocalReactionStore.read()` | Public | Provides read behavior. | [source](../src/relikes.js#L75) |
| `LocalReactionStore.write(nextStore)` | Public | Provides write behavior. | [source](../src/relikes.js#L91) |
| `LocalReactionStore.listReactions(docId)` | Public | Provides list reactions behavior. | [source](../src/relikes.js#L101) |
| `LocalReactionStore.saveReaction(reaction)` | Public | Provides save reaction behavior. | [source](../src/relikes.js#L111) |
| `LocalReactionStore.removeReaction(reactionId)` | Public | Provides remove reaction behavior. | [source](../src/relikes.js#L138) |
| `LocalReactionStore.clearUser(docId, userId)` | Public | Provides clear user behavior. | [source](../src/relikes.js#L144) |
| `RelikesApiClient.constructor(instance, options)` | Experimental | Initializes a RelikesApiClient instance. | [source](../src/relikes.js#L159) |
| `RelikesApiClient.getState()` | Experimental | Provides get state behavior. | [source](../src/relikes.js#L174) |
| `RelikesApiClient.initialize(snapshot)` | Experimental | Provides initialize behavior. | [source](../src/relikes.js#L189) |
| `RelikesApiClient.saveSnapshot(snapshot)` | Experimental | Provides save snapshot behavior. | [source](../src/relikes.js#L210) |
| `RelikesApiClient.loadHeatmap(context = {})` | Experimental | Provides load heatmap behavior. | [source](../src/relikes.js#L289) |
| `RelikesApiClient.requestHeatmap(requestToken)` | Experimental | Provides request heatmap behavior. | [source](../src/relikes.js#L293) |
| `RelikesApiClient.ensureToken()` | Experimental | Provides ensure token behavior. | [source](../src/relikes.js#L331) |
| `RelikesApiClient.getStoredToken()` | Experimental | Provides get stored token behavior. | [source](../src/relikes.js#L354) |
| `RelikesApiClient.clearStoredToken()` | Experimental | Provides clear stored token behavior. | [source](../src/relikes.js#L371) |
| `RelikesApiClient.getUserId()` | Experimental | Provides get user id behavior. | [source](../src/relikes.js#L380) |
| `RelikesApiClient.selectIdentityState(userId)` | Experimental | Provides select identity state behavior. | [source](../src/relikes.js#L388) |
| `RelikesApiClient.getStateStorageKey()` | Experimental | Provides get state storage key behavior. | [source](../src/relikes.js#L403) |
| `RelikesApiClient.persistState()` | Experimental | Provides persist state behavior. | [source](../src/relikes.js#L409) |
| `RelikesApiClient.updateRevisionFromConflict(error)` | Experimental | Provides update revision from conflict behavior. | [source](../src/relikes.js#L413) |
| `RelikesApiClient.request(operation, requestOptions = {})` | Experimental | Provides request behavior. | [source](../src/relikes.js#L424) |
| `RelikesApiClient.resolveRoute(operation, requestOptions)` | Experimental | Provides resolve route behavior. | [source](../src/relikes.js#L473) |
| `RelikesApiClient.parseResponse(result)` | Experimental | Provides parse response behavior. | [source](../src/relikes.js#L497) |
| `RelikesBackendSync.constructor(instance, options)` | Experimental | Initializes a RelikesBackendSync instance. | [source](../src/relikes.js#L526) |
| `RelikesBackendSync.start()` | Experimental | Provides start behavior. | [source](../src/relikes.js#L555) |
| `RelikesBackendSync.getState()` | Experimental | Provides get state behavior. | [source](../src/relikes.js#L561) |
| `RelikesBackendSync.getSnapshot()` | Experimental | Provides get snapshot behavior. | [source](../src/relikes.js#L580) |
| `RelikesBackendSync.initialize()` | Experimental | Provides initialize behavior. | [source](../src/relikes.js#L601) |
| `RelikesBackendSync.scheduleSync(delay = this.opts.saveDebounceMs)` | Experimental | Provides schedule sync behavior. | [source](../src/relikes.js#L614) |
| `RelikesBackendSync.flush()` | Experimental | Provides flush behavior. | [source](../src/relikes.js#L633) |
| `RelikesBackendSync.writeCurrentSnapshot()` | Experimental | Provides write current snapshot behavior. | [source](../src/relikes.js#L657) |
| `RelikesBackendSync.refreshHeatmap()` | Experimental | Provides refresh heatmap behavior. | [source](../src/relikes.js#L675) |
| `RelikesBackendSync.applyHeatmapResponse(response, required = false)` | Experimental | Provides apply heatmap response behavior. | [source](../src/relikes.js#L684) |
| `RelikesBackendSync.handleError(error, retryOperation = 'save')` | Experimental | Provides handle error behavior. | [source](../src/relikes.js#L703) |
| `RelikesBackendSync.setStatus(status)` | Experimental | Provides set status behavior. | [source](../src/relikes.js#L731) |
| `RelikesBackendSync.destroy()` | Experimental | Provides destroy behavior. | [source](../src/relikes.js#L741) |
| `CloudOverlay.constructor(element, geometry = DEFAULT_GEOMETRY)` | Experimental | Initializes a CloudOverlay instance. | [source](../src/relikes.js#L757) |
| `CloudOverlay.setEntries(entries)` | Experimental | Provides set entries behavior. | [source](../src/relikes.js#L799) |
| `CloudOverlay.resize()` | Experimental | Provides resize behavior. | [source](../src/relikes.js#L828) |
| `CloudOverlay.requestRender()` | Experimental | Provides request render behavior. | [source](../src/relikes.js#L865) |
| `CloudOverlay._render(now)` | Internal | Implements render behavior. | [source](../src/relikes.js#L870) |
| `CloudOverlay.destroy()` | Experimental | Provides destroy behavior. | [source](../src/relikes.js#L945) |
| `CloudOverlay.sprayCloud(stamps, options)` | Experimental | Provides spray cloud behavior. | [source](../src/relikes.js#L955) |
| `RelikesInstance.constructor(element, options = {})` | Public | Initializes a RelikesInstance instance. | [source](../src/relikes.js#L978) |
| `RelikesInstance.attachCapture()` | Public | Provides attach capture behavior. | [source](../src/relikes.js#L1040) |
| `RelikesInstance.buildAirbrushOptions()` | Public | Provides build airbrush options behavior. | [source](../src/relikes.js#L1052) |
| `RelikesInstance.refresh()` | Public | Provides refresh behavior. | [source](../src/relikes.js#L1082) |
| `RelikesInstance.render()` | Public | Provides render behavior. | [source](../src/relikes.js#L1098) |
| `RelikesInstance.getReactionAlpha()` | Public | Provides get reaction alpha behavior. | [source](../src/relikes.js#L1128) |
| `RelikesInstance.getViewMode()` | Public | Provides get view mode behavior. | [source](../src/relikes.js#L1132) |
| `RelikesInstance.setViewMode(nextMode)` | Public | Provides set view mode behavior. | [source](../src/relikes.js#L1136) |
| `RelikesInstance.setHeatmapData(response)` | Public | Provides set heatmap data behavior. | [source](../src/relikes.js#L1154) |
| `RelikesInstance.getHeatmapState()` | Public | Provides get heatmap state behavior. | [source](../src/relikes.js#L1170) |
| `RelikesInstance.syncCaptureMode()` | Public | Provides sync capture mode behavior. | [source](../src/relikes.js#L1174) |
| `RelikesInstance.getMine()` | Public | Provides get mine behavior. | [source](../src/relikes.js#L1188) |
| `RelikesInstance.getCounts()` | Public | Provides get counts behavior. | [source](../src/relikes.js#L1192) |
| `RelikesInstance.emitChange()` | Public | Provides emit change behavior. | [source](../src/relikes.js#L1204) |
| `RelikesInstance.setEraseEnabled(enabled)` | Public | Provides set erase enabled behavior. | [source](../src/relikes.js#L1219) |
| `RelikesInstance.clearUser()` | Public | Provides clear user behavior. | [source](../src/relikes.js#L1226) |
| `RelikesInstance.getBackendState()` | Public | Provides get backend state behavior. | [source](../src/relikes.js#L1232) |
| `RelikesInstance.refreshBackendHeatmap()` | Public | Provides refresh backend heatmap behavior. | [source](../src/relikes.js#L1243) |
| `RelikesInstance.flushBackend()` | Public | Provides flush backend behavior. | [source](../src/relikes.js#L1247) |
| `RelikesInstance.destroy()` | Public | Provides destroy behavior. | [source](../src/relikes.js#L1251) |
| `RelikesInstance.getLivePopupContext(popupContext = {})` | Public | Provides get live popup context behavior. | [source](../src/relikes.js#L1262) |
| `RelikesInstance.applyPopupReaction(kind, popupContext)` | Public | Provides apply popup reaction behavior. | [source](../src/relikes.js#L1274) |
| `RelikesInstance.createRelikesPopupContext(cleanSelectionContext)` | Public | Provides create relikes popup context behavior. | [source](../src/relikes.js#L1299) |
| `RelikesInstance.react(kind)` | Public | Provides react behavior. | [source](../src/relikes.js#L1301) |
| `RelikesInstance.like()` | Public | Provides like behavior. | [source](../src/relikes.js#L1302) |
| `RelikesInstance.dislike()` | Public | Provides dislike behavior. | [source](../src/relikes.js#L1303) |
| `RelikesInstance.wrapPopupController(controller)` | Public | Provides wrap popup controller behavior. | [source](../src/relikes.js#L1322) |
| `RelikesInstance.commitReaction(kind, popupContext)` | Public | Provides commit reaction behavior. | [source](../src/relikes.js#L1355) |
| `RelikesInstance.createPopupRenderer()` | Public | Provides create popup renderer behavior. | [source](../src/relikes.js#L1382) |
| `RelikesInstance.createDefaultPopupRenderer()` | Public | Provides create default popup renderer behavior. | [source](../src/relikes.js#L1433) |
| `RelikesInstance.setPending(pending)` | Public | Provides set pending behavior. | [source](../src/relikes.js#L1604) |
| `RelikesInstance.applyReaction(kind)` | Public | Provides apply reaction behavior. | [source](../src/relikes.js#L1611) |
| `RelikesInstance.update(nextContext)` | Public | Provides update behavior. | [source](../src/relikes.js#L1640) |
| `RelikesInstance.eraseAtPoint(clientX, clientY)` | Public | Provides erase at point behavior. | [source](../src/relikes.js#L1649) |
| `attach(element, options = {})` | Public | Provides attach behavior. | [source](../src/relikes.js#L1676) |
| `patchCaptureMeasurement(instance)` | Internal | Implements patch capture measurement behavior. | [source](../src/relikes.js#L1680) |
| `getHeatmapLevel(total, maxHits, maxSteps = DEFAULT_HEATMAP.maxSteps)` | Internal | Implements get heatmap level behavior. | [source](../src/relikes.js#L1901) |
| `getHeatmapStrength(total, maxHits, scale = 'sqrt')` | Internal | Implements get heatmap strength behavior. | [source](../src/relikes.js#L1907) |
| `buildHeatmapClipRegions(fragments, channel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements build heatmap clip regions behavior. | [source](../src/relikes.js#L1918) |
| `createOverlayEntryFromAnchor(key, anchor, indexModel, options = {})` | Public | Provides create overlay entry from anchor behavior. | [source](../src/relikes.js#L1953) |
| `eraseReactionFragmentsAtPoint(reaction, point, indexModel, store, geometry = DEFAULT_GEOMETRY)` | Internal | Implements erase reaction fragments at point behavior. | [source](../src/relikes.js#L1971) |
| `isFragmentTouchedByEraser(fragment, point, geometry = DEFAULT_GEOMETRY)` | Internal | Implements is fragment touched by eraser behavior. | [source](../src/relikes.js#L2001) |
| `buildRemainingReactionRuns(fragments)` | Internal | Implements build remaining reaction runs behavior. | [source](../src/relikes.js#L2015) |
| `closure.flush()` | Internal | Implements flush behavior. | [source](../src/relikes.js#L2020) |
| `getLocalPoint(element, clientX, clientY, padding = 0)` | Internal | Implements get local point behavior. | [source](../src/relikes.js#L2045) |
| `isGeneratedOverlayChild(element)` | Internal | Implements is generated overlay child behavior. | [source](../src/relikes.js#L2063) |
| `withDetachedOverlayChildren(parent, callback, predicate = isGeneratedOverlayChild)` | Experimental | Provides with detached overlay children behavior. | [source](../src/relikes.js#L2074) |
| `buildContentIndex(root)` | Public | Provides build content index behavior. | [source](../src/relikes.js#L2102) |
| `createAnchorFromSelection(fragmentIndices, indexModel)` | Public | Provides create anchor from selection behavior. | [source](../src/relikes.js#L2169) |
| `createAnchorFromFragments(fragments, indexModel)` | Internal | Implements create anchor from fragments behavior. | [source](../src/relikes.js#L2178) |
| `createAnchorFromQuote(quote, indexModel)` | Public | Provides create anchor from quote behavior. | [source](../src/relikes.js#L2199) |
| `createAnchorFromOffsets(start, end, indexModel)` | Public | Provides create anchor from offsets behavior. | [source](../src/relikes.js#L2206) |
| `normalizeTextRange(start, end, text)` | Internal | Implements normalize text range behavior. | [source](../src/relikes.js#L2221) |
| `resolveTextAnchor(indexModel, anchor)` | Internal | Implements resolve text anchor behavior. | [source](../src/relikes.js#L2238) |
| `resolveWhitespaceInsensitiveAnchor(text, anchor)` | Internal | Implements resolve whitespace insensitive anchor behavior. | [source](../src/relikes.js#L2285) |
| `getStoredAnchorRuns(anchor)` | Internal | Implements get stored anchor runs behavior. | [source](../src/relikes.js#L2332) |
| `normalizeBackendOptions(options)` | Internal | Implements normalize backend options behavior. | [source](../src/relikes.js#L2338) |
| `resolveBackendRequestUrl(routeUrl, baseUrl)` | Internal | Implements resolve backend request url behavior. | [source](../src/relikes.js#L2404) |
| `normalizeBackendDelay(value, fallback)` | Internal | Implements normalize backend delay behavior. | [source](../src/relikes.js#L2430) |
| `buildBackendReactions(instance)` | Internal | Implements build backend reactions behavior. | [source](../src/relikes.js#L2435) |
| `normalizeBackendRuns(runs)` | Internal | Implements normalize backend runs behavior. | [source](../src/relikes.js#L2456) |
| `createEmptyBackendState()` | Internal | Implements create empty backend state behavior. | [source](../src/relikes.js#L2475) |
| `getBackendSnapshotFingerprint(snapshot)` | Internal | Implements get backend snapshot fingerprint behavior. | [source](../src/relikes.js#L2482) |
| `createBackendError(code, message)` | Internal | Implements create backend error behavior. | [source](../src/relikes.js#L2486) |
| `readBackendStorageJson(key, fallback)` | Internal | Implements read backend storage json behavior. | [source](../src/relikes.js#L2492) |
| `writeBackendStorageJson(key, value)` | Internal | Implements write backend storage json behavior. | [source](../src/relikes.js#L2503) |
| `hashStorageScope(value)` | Internal | Implements hash storage scope behavior. | [source](../src/relikes.js#L2511) |
| `normalizeViewMode(value)` | Internal | Implements normalize view mode behavior. | [source](../src/relikes.js#L2523) |
| `normalizeHeatmapOptions(options = {})` | Internal | Implements normalize heatmap options behavior. | [source](../src/relikes.js#L2527) |
| `normalizeHeatmapResponse(response)` | Internal | Implements normalize heatmap response behavior. | [source](../src/relikes.js#L2546) |
| `cloneHeatmapResponse(response)` | Internal | Implements clone heatmap response behavior. | [source](../src/relikes.js#L2581) |
| `normalizeHeatmapCount(value)` | Internal | Implements normalize heatmap count behavior. | [source](../src/relikes.js#L2589) |
| `normalizeHeatmapSteps(value, fallback)` | Internal | Implements normalize heatmap steps behavior. | [source](../src/relikes.js#L2595) |
| `normalizeOptionalAlpha(value)` | Internal | Implements normalize optional alpha behavior. | [source](../src/relikes.js#L2601) |
| `countReactionRuns(reactions)` | Internal | Implements count reaction runs behavior. | [source](../src/relikes.js#L2608) |
| `resolveAnchorRuns(indexModel, anchor)` | Public | Provides resolve anchor runs behavior. | [source](../src/relikes.js#L2615) |
| `resolveAnchor(indexModel, anchor)` | Public | Provides resolve anchor behavior. | [source](../src/relikes.js#L2624) |
| `getFragmentsForRange(indexModel, start, end)` | Public | Provides get fragments for range behavior. | [source](../src/relikes.js#L2635) |
| `getFragmentsForAnchor(indexModel, anchor)` | Public | Provides get fragments for anchor behavior. | [source](../src/relikes.js#L2641) |
| `getFragmentRunsForAnchor(indexModel, anchor)` | Public | Provides get fragment runs for anchor behavior. | [source](../src/relikes.js#L2645) |
| `saveReactionWithMerge(reaction, indexModel, store, geometry = DEFAULT_GEOMETRY)` | Internal | Implements save reaction with merge behavior. | [source](../src/relikes.js#L2664) |
| `subtractOppositeReactionFragments(reaction, newFragments, indexModel, store)` | Internal | Implements subtract opposite reaction fragments behavior. | [source](../src/relikes.js#L2720) |
| `reactionShapesMergeable(fragmentsA, fragmentsB, indexModel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements reaction shapes mergeable behavior. | [source](../src/relikes.js#L2753) |
| `mergeFragmentSets(...fragmentSets)` | Internal | Implements merge fragment sets behavior. | [source](../src/relikes.js#L2773) |
| `getTextFromFragments(fragments)` | Internal | Implements get text from fragments behavior. | [source](../src/relikes.js#L2786) |
| `rangesMergeable(rangeA, rangeB, indexModel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements ranges mergeable behavior. | [source](../src/relikes.js#L2792) |
| `buildFinalRects(fragments, geometry = DEFAULT_GEOMETRY)` | Public | Provides build final rects behavior. | [source](../src/relikes.js#L2811) |
| `normalizeRect(rect, geometry = DEFAULT_GEOMETRY)` | Public | Provides normalize rect behavior. | [source](../src/relikes.js#L2843) |
| `buildFinalStamps(fragments, geometry = DEFAULT_GEOMETRY)` | Public | Provides build final stamps behavior. | [source](../src/relikes.js#L2859) |
| `segmentText(text)` | Internal | Implements segment text behavior. | [source](../src/relikes.js#L2935) |
| `isSelectableTextNode(node)` | Internal | Implements is selectable text node behavior. | [source](../src/relikes.js#L2959) |
| `measureFragmentRect(range)` | Internal | Implements measure fragment rect behavior. | [source](../src/relikes.js#L2974) |
| `createEmptyStore()` | Internal | Implements create empty store behavior. | [source](../src/relikes.js#L3009) |
| `cloneStore(store)` | Internal | Implements clone store behavior. | [source](../src/relikes.js#L3013) |
| `getOrCreateUserId(key = 'relikes-user-v1')` | Public | Provides get or create user id behavior. | [source](../src/relikes.js#L3017) |
| `createId(prefix)` | Internal | Implements create id behavior. | [source](../src/relikes.js#L3032) |
| `clamp(value, min, max)` | Experimental | Provides clamp behavior. | [source](../src/relikes.js#L3040) |
| `rgba(color, alpha)` | Experimental | Provides rgba behavior. | [source](../src/relikes.js#L3044) |
| `mixColor(from, to, progress)` | Experimental | Provides mix color behavior. | [source](../src/relikes.js#L3048) |
| `signedNoise(a, b, c)` | Experimental | Provides signed noise behavior. | [source](../src/relikes.js#L3056) |
| `areSameVisualLineFragments(left, right)` | Internal | Implements are same visual line fragments behavior. | [source](../src/relikes.js#L3061) |
| `rectDistance(rectA, rectB)` | Internal | Implements rect distance behavior. | [source](../src/relikes.js#L3066) |
| `distanceBetweenRectSets(rectsA, rectsB)` | Internal | Implements distance between rect sets behavior. | [source](../src/relikes.js#L3072) |
| `sharedSuffixLength(left, right)` | Internal | Implements shared suffix length behavior. | [source](../src/relikes.js#L3086) |
| `sharedPrefixLength(left, right)` | Internal | Implements shared prefix length behavior. | [source](../src/relikes.js#L3099) |
| `getAnchorSignature(anchor)` | Internal | Implements get anchor signature behavior. | [source](../src/relikes.js#L3108) |

Total documented named callables: **150**.
