<!--
SPDX-FileCopyrightText: 2026 kotoverse
SPDX-License-Identifier: MIT
-->

# Complete function reference

This generated inventory covers every named function, named closure, class method, constructor, and named object method in the canonical source. Anonymous callbacks are described at their call sites rather than assigned artificial API names. Public and experimental stability is defined by [API.md](API.md); internal entries may change in any release.

| Callable | Visibility | Responsibility | Location |
| --- | --- | --- | --- |
| `LocalReactionStore.constructor(storageKey)` | Public | Initializes a LocalReactionStore instance. | [source](../src/relikes.js#L69) |
| `LocalReactionStore.read()` | Public | Provides read behavior. | [source](../src/relikes.js#L74) |
| `LocalReactionStore.write(nextStore)` | Public | Provides write behavior. | [source](../src/relikes.js#L90) |
| `LocalReactionStore.listReactions(docId)` | Public | Provides list reactions behavior. | [source](../src/relikes.js#L100) |
| `LocalReactionStore.saveReaction(reaction)` | Public | Provides save reaction behavior. | [source](../src/relikes.js#L110) |
| `LocalReactionStore.removeReaction(reactionId)` | Public | Provides remove reaction behavior. | [source](../src/relikes.js#L137) |
| `LocalReactionStore.clearUser(docId, userId)` | Public | Provides clear user behavior. | [source](../src/relikes.js#L143) |
| `RelikesApiClient.constructor(instance, options)` | Experimental | Initializes a RelikesApiClient instance. | [source](../src/relikes.js#L158) |
| `RelikesApiClient.getState()` | Experimental | Provides get state behavior. | [source](../src/relikes.js#L173) |
| `RelikesApiClient.initialize(snapshot)` | Experimental | Provides initialize behavior. | [source](../src/relikes.js#L188) |
| `RelikesApiClient.saveSnapshot(snapshot)` | Experimental | Provides save snapshot behavior. | [source](../src/relikes.js#L209) |
| `RelikesApiClient.loadHeatmap(context = {})` | Experimental | Provides load heatmap behavior. | [source](../src/relikes.js#L288) |
| `RelikesApiClient.requestHeatmap(requestToken)` | Experimental | Provides request heatmap behavior. | [source](../src/relikes.js#L292) |
| `RelikesApiClient.ensureToken()` | Experimental | Provides ensure token behavior. | [source](../src/relikes.js#L330) |
| `RelikesApiClient.getStoredToken()` | Experimental | Provides get stored token behavior. | [source](../src/relikes.js#L353) |
| `RelikesApiClient.clearStoredToken()` | Experimental | Provides clear stored token behavior. | [source](../src/relikes.js#L370) |
| `RelikesApiClient.getUserId()` | Experimental | Provides get user id behavior. | [source](../src/relikes.js#L379) |
| `RelikesApiClient.selectIdentityState(userId)` | Experimental | Provides select identity state behavior. | [source](../src/relikes.js#L387) |
| `RelikesApiClient.getStateStorageKey()` | Experimental | Provides get state storage key behavior. | [source](../src/relikes.js#L402) |
| `RelikesApiClient.persistState()` | Experimental | Provides persist state behavior. | [source](../src/relikes.js#L408) |
| `RelikesApiClient.updateRevisionFromConflict(error)` | Experimental | Provides update revision from conflict behavior. | [source](../src/relikes.js#L412) |
| `RelikesApiClient.request(operation, requestOptions = {})` | Experimental | Provides request behavior. | [source](../src/relikes.js#L423) |
| `RelikesApiClient.resolveRoute(operation, requestOptions)` | Experimental | Provides resolve route behavior. | [source](../src/relikes.js#L472) |
| `RelikesApiClient.parseResponse(result)` | Experimental | Provides parse response behavior. | [source](../src/relikes.js#L496) |
| `RelikesBackendSync.constructor(instance, options)` | Experimental | Initializes a RelikesBackendSync instance. | [source](../src/relikes.js#L525) |
| `RelikesBackendSync.start()` | Experimental | Provides start behavior. | [source](../src/relikes.js#L554) |
| `RelikesBackendSync.getState()` | Experimental | Provides get state behavior. | [source](../src/relikes.js#L560) |
| `RelikesBackendSync.getSnapshot()` | Experimental | Provides get snapshot behavior. | [source](../src/relikes.js#L579) |
| `RelikesBackendSync.initialize()` | Experimental | Provides initialize behavior. | [source](../src/relikes.js#L600) |
| `RelikesBackendSync.scheduleSync(delay = this.opts.saveDebounceMs)` | Experimental | Provides schedule sync behavior. | [source](../src/relikes.js#L613) |
| `RelikesBackendSync.flush()` | Experimental | Provides flush behavior. | [source](../src/relikes.js#L632) |
| `RelikesBackendSync.writeCurrentSnapshot()` | Experimental | Provides write current snapshot behavior. | [source](../src/relikes.js#L656) |
| `RelikesBackendSync.refreshHeatmap()` | Experimental | Provides refresh heatmap behavior. | [source](../src/relikes.js#L674) |
| `RelikesBackendSync.applyHeatmapResponse(response, required = false)` | Experimental | Provides apply heatmap response behavior. | [source](../src/relikes.js#L683) |
| `RelikesBackendSync.handleError(error, retryOperation = 'save')` | Experimental | Provides handle error behavior. | [source](../src/relikes.js#L702) |
| `RelikesBackendSync.setStatus(status)` | Experimental | Provides set status behavior. | [source](../src/relikes.js#L730) |
| `RelikesBackendSync.destroy()` | Experimental | Provides destroy behavior. | [source](../src/relikes.js#L740) |
| `CloudOverlay.constructor(element, geometry = DEFAULT_GEOMETRY)` | Experimental | Initializes a CloudOverlay instance. | [source](../src/relikes.js#L756) |
| `CloudOverlay.setEntries(entries)` | Experimental | Provides set entries behavior. | [source](../src/relikes.js#L798) |
| `CloudOverlay.resize()` | Experimental | Provides resize behavior. | [source](../src/relikes.js#L827) |
| `CloudOverlay.requestRender()` | Experimental | Provides request render behavior. | [source](../src/relikes.js#L864) |
| `CloudOverlay._render(now)` | Internal | Implements render behavior. | [source](../src/relikes.js#L869) |
| `CloudOverlay.destroy()` | Experimental | Provides destroy behavior. | [source](../src/relikes.js#L944) |
| `CloudOverlay.sprayCloud(stamps, options)` | Experimental | Provides spray cloud behavior. | [source](../src/relikes.js#L954) |
| `RelikesInstance.constructor(element, options = {})` | Public | Initializes a RelikesInstance instance. | [source](../src/relikes.js#L977) |
| `RelikesInstance.attachCapture()` | Public | Provides attach capture behavior. | [source](../src/relikes.js#L1039) |
| `RelikesInstance.buildAirbrushOptions()` | Public | Provides build airbrush options behavior. | [source](../src/relikes.js#L1051) |
| `RelikesInstance.refresh()` | Public | Provides refresh behavior. | [source](../src/relikes.js#L1081) |
| `RelikesInstance.render()` | Public | Provides render behavior. | [source](../src/relikes.js#L1097) |
| `RelikesInstance.getReactionAlpha()` | Public | Provides get reaction alpha behavior. | [source](../src/relikes.js#L1127) |
| `RelikesInstance.getViewMode()` | Public | Provides get view mode behavior. | [source](../src/relikes.js#L1131) |
| `RelikesInstance.setViewMode(nextMode)` | Public | Provides set view mode behavior. | [source](../src/relikes.js#L1135) |
| `RelikesInstance.setHeatmapData(response)` | Public | Provides set heatmap data behavior. | [source](../src/relikes.js#L1153) |
| `RelikesInstance.getHeatmapState()` | Public | Provides get heatmap state behavior. | [source](../src/relikes.js#L1169) |
| `RelikesInstance.syncCaptureMode()` | Public | Provides sync capture mode behavior. | [source](../src/relikes.js#L1173) |
| `RelikesInstance.getMine()` | Public | Provides get mine behavior. | [source](../src/relikes.js#L1187) |
| `RelikesInstance.getCounts()` | Public | Provides get counts behavior. | [source](../src/relikes.js#L1191) |
| `RelikesInstance.emitChange()` | Public | Provides emit change behavior. | [source](../src/relikes.js#L1203) |
| `RelikesInstance.setEraseEnabled(enabled)` | Public | Provides set erase enabled behavior. | [source](../src/relikes.js#L1218) |
| `RelikesInstance.clearUser()` | Public | Provides clear user behavior. | [source](../src/relikes.js#L1225) |
| `RelikesInstance.getBackendState()` | Public | Provides get backend state behavior. | [source](../src/relikes.js#L1231) |
| `RelikesInstance.refreshBackendHeatmap()` | Public | Provides refresh backend heatmap behavior. | [source](../src/relikes.js#L1242) |
| `RelikesInstance.flushBackend()` | Public | Provides flush backend behavior. | [source](../src/relikes.js#L1246) |
| `RelikesInstance.destroy()` | Public | Provides destroy behavior. | [source](../src/relikes.js#L1250) |
| `RelikesInstance.getLivePopupContext(popupContext = {})` | Public | Provides get live popup context behavior. | [source](../src/relikes.js#L1261) |
| `RelikesInstance.applyPopupReaction(kind, popupContext)` | Public | Provides apply popup reaction behavior. | [source](../src/relikes.js#L1273) |
| `RelikesInstance.createRelikesPopupContext(cleanSelectionContext)` | Public | Provides create relikes popup context behavior. | [source](../src/relikes.js#L1298) |
| `RelikesInstance.react(kind)` | Public | Provides react behavior. | [source](../src/relikes.js#L1300) |
| `RelikesInstance.like()` | Public | Provides like behavior. | [source](../src/relikes.js#L1301) |
| `RelikesInstance.dislike()` | Public | Provides dislike behavior. | [source](../src/relikes.js#L1302) |
| `RelikesInstance.wrapPopupController(controller)` | Public | Provides wrap popup controller behavior. | [source](../src/relikes.js#L1321) |
| `RelikesInstance.commitReaction(kind, popupContext)` | Public | Provides commit reaction behavior. | [source](../src/relikes.js#L1354) |
| `RelikesInstance.createPopupRenderer()` | Public | Provides create popup renderer behavior. | [source](../src/relikes.js#L1381) |
| `RelikesInstance.createDefaultPopupRenderer()` | Public | Provides create default popup renderer behavior. | [source](../src/relikes.js#L1432) |
| `RelikesInstance.setPending(pending)` | Public | Provides set pending behavior. | [source](../src/relikes.js#L1603) |
| `RelikesInstance.applyReaction(kind)` | Public | Provides apply reaction behavior. | [source](../src/relikes.js#L1610) |
| `RelikesInstance.update(nextContext)` | Public | Provides update behavior. | [source](../src/relikes.js#L1639) |
| `RelikesInstance.eraseAtPoint(clientX, clientY)` | Public | Provides erase at point behavior. | [source](../src/relikes.js#L1648) |
| `attach(element, options = {})` | Public | Provides attach behavior. | [source](../src/relikes.js#L1675) |
| `patchCaptureMeasurement(instance)` | Internal | Implements patch capture measurement behavior. | [source](../src/relikes.js#L1679) |
| `getHeatmapStrength(total, maxHits, scale = 'sqrt')` | Internal | Implements get heatmap strength behavior. | [source](../src/relikes.js#L1867) |
| `buildHeatmapClipRegions(fragments, channel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements build heatmap clip regions behavior. | [source](../src/relikes.js#L1878) |
| `createOverlayEntryFromAnchor(key, anchor, indexModel, options = {})` | Public | Provides create overlay entry from anchor behavior. | [source](../src/relikes.js#L1913) |
| `eraseReactionFragmentsAtPoint(reaction, point, indexModel, store, geometry = DEFAULT_GEOMETRY)` | Internal | Implements erase reaction fragments at point behavior. | [source](../src/relikes.js#L1931) |
| `isFragmentTouchedByEraser(fragment, point, geometry = DEFAULT_GEOMETRY)` | Internal | Implements is fragment touched by eraser behavior. | [source](../src/relikes.js#L1961) |
| `buildRemainingReactionRuns(fragments)` | Internal | Implements build remaining reaction runs behavior. | [source](../src/relikes.js#L1975) |
| `closure.flush()` | Internal | Implements flush behavior. | [source](../src/relikes.js#L1980) |
| `getLocalPoint(element, clientX, clientY, padding = 0)` | Internal | Implements get local point behavior. | [source](../src/relikes.js#L2005) |
| `isGeneratedOverlayChild(element)` | Internal | Implements is generated overlay child behavior. | [source](../src/relikes.js#L2023) |
| `withDetachedOverlayChildren(parent, callback, predicate = isGeneratedOverlayChild)` | Experimental | Provides with detached overlay children behavior. | [source](../src/relikes.js#L2034) |
| `buildContentIndex(root)` | Public | Provides build content index behavior. | [source](../src/relikes.js#L2062) |
| `createAnchorFromSelection(fragmentIndices, indexModel)` | Public | Provides create anchor from selection behavior. | [source](../src/relikes.js#L2129) |
| `createAnchorFromFragments(fragments, indexModel)` | Internal | Implements create anchor from fragments behavior. | [source](../src/relikes.js#L2138) |
| `createAnchorFromQuote(quote, indexModel)` | Public | Provides create anchor from quote behavior. | [source](../src/relikes.js#L2159) |
| `createAnchorFromOffsets(start, end, indexModel)` | Public | Provides create anchor from offsets behavior. | [source](../src/relikes.js#L2166) |
| `normalizeTextRange(start, end, text)` | Internal | Implements normalize text range behavior. | [source](../src/relikes.js#L2181) |
| `resolveTextAnchor(indexModel, anchor)` | Internal | Implements resolve text anchor behavior. | [source](../src/relikes.js#L2198) |
| `resolveWhitespaceInsensitiveAnchor(text, anchor)` | Internal | Implements resolve whitespace insensitive anchor behavior. | [source](../src/relikes.js#L2245) |
| `getStoredAnchorRuns(anchor)` | Internal | Implements get stored anchor runs behavior. | [source](../src/relikes.js#L2292) |
| `normalizeBackendOptions(options)` | Internal | Implements normalize backend options behavior. | [source](../src/relikes.js#L2298) |
| `resolveBackendRequestUrl(routeUrl, baseUrl)` | Internal | Implements resolve backend request url behavior. | [source](../src/relikes.js#L2364) |
| `normalizeBackendDelay(value, fallback)` | Internal | Implements normalize backend delay behavior. | [source](../src/relikes.js#L2390) |
| `buildBackendReactions(instance)` | Internal | Implements build backend reactions behavior. | [source](../src/relikes.js#L2395) |
| `normalizeBackendRuns(runs)` | Internal | Implements normalize backend runs behavior. | [source](../src/relikes.js#L2416) |
| `createEmptyBackendState()` | Internal | Implements create empty backend state behavior. | [source](../src/relikes.js#L2435) |
| `getBackendSnapshotFingerprint(snapshot)` | Internal | Implements get backend snapshot fingerprint behavior. | [source](../src/relikes.js#L2442) |
| `createBackendError(code, message)` | Internal | Implements create backend error behavior. | [source](../src/relikes.js#L2446) |
| `readBackendStorageJson(key, fallback)` | Internal | Implements read backend storage json behavior. | [source](../src/relikes.js#L2452) |
| `writeBackendStorageJson(key, value)` | Internal | Implements write backend storage json behavior. | [source](../src/relikes.js#L2463) |
| `hashStorageScope(value)` | Internal | Implements hash storage scope behavior. | [source](../src/relikes.js#L2471) |
| `normalizeViewMode(value)` | Internal | Implements normalize view mode behavior. | [source](../src/relikes.js#L2483) |
| `normalizeHeatmapOptions(options = {})` | Internal | Implements normalize heatmap options behavior. | [source](../src/relikes.js#L2487) |
| `normalizeHeatmapResponse(response)` | Internal | Implements normalize heatmap response behavior. | [source](../src/relikes.js#L2505) |
| `cloneHeatmapResponse(response)` | Internal | Implements clone heatmap response behavior. | [source](../src/relikes.js#L2539) |
| `normalizeHeatmapCount(value)` | Internal | Implements normalize heatmap count behavior. | [source](../src/relikes.js#L2547) |
| `normalizeOptionalAlpha(value)` | Internal | Implements normalize optional alpha behavior. | [source](../src/relikes.js#L2553) |
| `countReactionRuns(reactions)` | Internal | Implements count reaction runs behavior. | [source](../src/relikes.js#L2560) |
| `resolveAnchorRuns(indexModel, anchor)` | Public | Provides resolve anchor runs behavior. | [source](../src/relikes.js#L2567) |
| `resolveAnchor(indexModel, anchor)` | Public | Provides resolve anchor behavior. | [source](../src/relikes.js#L2576) |
| `getFragmentsForRange(indexModel, start, end)` | Public | Provides get fragments for range behavior. | [source](../src/relikes.js#L2587) |
| `getFragmentsForAnchor(indexModel, anchor)` | Public | Provides get fragments for anchor behavior. | [source](../src/relikes.js#L2593) |
| `getFragmentRunsForAnchor(indexModel, anchor)` | Public | Provides get fragment runs for anchor behavior. | [source](../src/relikes.js#L2597) |
| `saveReactionWithMerge(reaction, indexModel, store, geometry = DEFAULT_GEOMETRY)` | Internal | Implements save reaction with merge behavior. | [source](../src/relikes.js#L2616) |
| `subtractOppositeReactionFragments(reaction, newFragments, indexModel, store)` | Internal | Implements subtract opposite reaction fragments behavior. | [source](../src/relikes.js#L2672) |
| `reactionShapesMergeable(fragmentsA, fragmentsB, indexModel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements reaction shapes mergeable behavior. | [source](../src/relikes.js#L2705) |
| `mergeFragmentSets(...fragmentSets)` | Internal | Implements merge fragment sets behavior. | [source](../src/relikes.js#L2725) |
| `getTextFromFragments(fragments)` | Internal | Implements get text from fragments behavior. | [source](../src/relikes.js#L2738) |
| `rangesMergeable(rangeA, rangeB, indexModel, geometry = DEFAULT_GEOMETRY)` | Internal | Implements ranges mergeable behavior. | [source](../src/relikes.js#L2744) |
| `buildFinalRects(fragments, geometry = DEFAULT_GEOMETRY)` | Public | Provides build final rects behavior. | [source](../src/relikes.js#L2763) |
| `normalizeRect(rect, geometry = DEFAULT_GEOMETRY)` | Public | Provides normalize rect behavior. | [source](../src/relikes.js#L2795) |
| `buildFinalStamps(fragments, geometry = DEFAULT_GEOMETRY)` | Public | Provides build final stamps behavior. | [source](../src/relikes.js#L2811) |
| `segmentText(text)` | Internal | Implements segment text behavior. | [source](../src/relikes.js#L2887) |
| `isSelectableTextNode(node)` | Internal | Implements is selectable text node behavior. | [source](../src/relikes.js#L2911) |
| `measureFragmentRect(range)` | Internal | Implements measure fragment rect behavior. | [source](../src/relikes.js#L2926) |
| `createEmptyStore()` | Internal | Implements create empty store behavior. | [source](../src/relikes.js#L2961) |
| `cloneStore(store)` | Internal | Implements clone store behavior. | [source](../src/relikes.js#L2965) |
| `getOrCreateUserId(key = 'relikes-user-v1')` | Public | Provides get or create user id behavior. | [source](../src/relikes.js#L2969) |
| `createId(prefix)` | Internal | Implements create id behavior. | [source](../src/relikes.js#L2984) |
| `clamp(value, min, max)` | Experimental | Provides clamp behavior. | [source](../src/relikes.js#L2992) |
| `rgba(color, alpha)` | Experimental | Provides rgba behavior. | [source](../src/relikes.js#L2996) |
| `mixColor(from, to, progress)` | Experimental | Provides mix color behavior. | [source](../src/relikes.js#L3000) |
| `signedNoise(a, b, c)` | Experimental | Provides signed noise behavior. | [source](../src/relikes.js#L3008) |
| `areSameVisualLineFragments(left, right)` | Internal | Implements are same visual line fragments behavior. | [source](../src/relikes.js#L3013) |
| `rectDistance(rectA, rectB)` | Internal | Implements rect distance behavior. | [source](../src/relikes.js#L3018) |
| `distanceBetweenRectSets(rectsA, rectsB)` | Internal | Implements distance between rect sets behavior. | [source](../src/relikes.js#L3024) |
| `sharedSuffixLength(left, right)` | Internal | Implements shared suffix length behavior. | [source](../src/relikes.js#L3038) |
| `sharedPrefixLength(left, right)` | Internal | Implements shared prefix length behavior. | [source](../src/relikes.js#L3051) |
| `getAnchorSignature(anchor)` | Internal | Implements get anchor signature behavior. | [source](../src/relikes.js#L3060) |

Total documented named callables: **148**.
