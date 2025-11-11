# V5a Ship Readiness - Action Plan

## Current Status Assessment (Nov 8, 2025)

### ✅ CONFIRMED WORKING
Based on user feedback and code review:

**Core Architecture:**
- ✅ Provider pattern implemented
- ✅ MediaIndexProvider (random + sequential)
- ✅ FolderProvider with SubfolderQueue
- ✅ SingleMediaProvider
- ✅ Priority folders implemented
- ✅ Sequential filesystem mode working
- ✅ Position indicator working
- ✅ Dots indicator working
- ✅ Tap actions implemented

**Features:**
- ✅ Queue duplicate filtering
- ✅ History-based duplicate prevention
- ✅ Smart retry logic
- ✅ Exhaustion optimization
- ✅ Edit/delete history cleanup
- ✅ Scanner timestamp fix (backend)
- ✅ Metadata display (EXIF, GPS, camera)
- ✅ Favorites/edit/delete functionality

**UI:**
- ✅ Navigation controls (next/previous)
- ✅ Click zones for navigation
- ✅ GUI editor with all options
- ✅ Video playback controls
- ✅ Error handling with retry

---

### ❌ IDENTIFIED ISSUES

#### 1. **Reconnection Logic Broken** (HIGH PRIORITY)
**Problem**: After card reconfiguration, history is lost
- Subfolder Queue has window.mediaCardSubfolderQueues registry
- Card needs to check registry on init and reconnect
- "Can't go back in history" after reconfigure

**Fix Required**: 
```javascript
// In _initializeProvider(), before creating new provider:
const mediaPath = this.config.folder?.path;
if (mediaPath && window.mediaCardSubfolderQueues?.has(mediaPath)) {
  // Reconnect to existing queue
  const existingQueue = window.mediaCardSubfolderQueues.get(mediaPath);
  // Restore history, position, etc.
}
```

**Estimated Time**: 2-3 hours

#### 2. **Pause on Hidden/Background Tab** (MEDIUM PRIORITY)
**User Note**: "It does appear to stop scanning when not visible, but not seeing logs"
**Issue**: Unclear if pause/resume working correctly
- Need to verify IntersectionObserver is active
- Check if SubfolderQueue pauses scanning
- Add clearer logging for pause/resume events

**Fix Required**:
- Add comprehensive logging to pause/resume logic
- Test with background tabs
- Verify SubfolderQueue _waitIfBackgroundPaused() working

**Estimated Time**: 1 hour

#### 3. **Recursive Scanning Not Tested** (MEDIUM PRIORITY)
**User Note**: "Haven't tested recursion yet"
**Issue**: Need to verify recursive:true + scan_depth working

**Testing Required**:
- Create nested folder structure (3+ levels)
- Test recursive: true (should scan all subfolders)
- Test scan_depth: 2 (should limit to 2 levels)
- Test priority_folders with recursive mode

**Estimated Time**: 1 hour testing

---

### 🔨 REQUIRED BEFORE SHIPPING

#### Critical (Blockers):
1. ✅ **Fix reconnection logic** - Restore history/position on reconfigure
2. ✅ **Verify pause/resume** - Confirm background tab handling works
3. ✅ **Test recursive scanning** - Validate nested folder support

#### Important (Should Have):
4. **Enhanced Kiosk Mode** - Add auto-enable entity on card load
5. **Config Migration** - Create v4 → v5 config converter
6. **Comprehensive Testing** - Execute full test suite from testing guide

#### Nice to Have:
7. **Performance optimization** - Test with 5000+ file libraries
8. **Error scenario testing** - Network failures, missing files, etc.
9. **Cross-browser testing** - Safari, Firefox, mobile browsers

---

## Implementation Tasks

### Task 1: Fix Reconnection Logic (CRITICAL)

**Goal**: Restore queue/history when card reconfigures

**V4 Code Reference**:
- ha-media-card.js lines 1560-1580 (history restoration)
- ha-media-card.js lines 12-13 (window registry check)

**Implementation**:
1. Check `window.mediaCardSubfolderQueues` in `_initializeProvider()`
2. If existing queue found, extract history and position
3. Restore card's history array and historyPosition
4. Connect to existing provider instead of creating new one

**Code Location**: ha-media-card-v5a.js line 3200 (`_initializeProvider()`)

**Test**:
- Configure card with folder mode
- Advance through 10 items
- Open editor, change auto_advance_seconds
- Save config
- Click "Previous" → should show previous items (not start over)

---

### Task 2: Verify Pause/Resume Logic

**Goal**: Confirm scanning stops when card not visible

**V4 Code Reference**:
- ha-media-card.js lines 6703-6750 (`_waitIfBackgroundPaused()`)

**Verification Steps**:
1. Check SubfolderQueue constructor has `isPaused` flag
2. Verify `_waitIfBackgroundPaused()` method exists
3. Add logging: "⏸️ Paused - waiting for visibility" when paused
4. Add logging: "▶️ Resumed - continuing scan" when resumed
5. Test with tab switching

**Code Locations**:
- SubfolderQueue class (lines 50-2850)
- Look for IntersectionObserver or visibility API usage

**Test**:
- Start slideshow with auto-advance
- Switch to different browser tab
- Wait 30 seconds
- Check console logs for pause messages
- Switch back to HA tab
- Verify slideshow resumes

---

### Task 3: Test Recursive Scanning

**Goal**: Validate nested folder scanning works correctly

**Test Scenarios**:

**3.1 Basic Recursion**
```yaml
folder:
  path: media-source://media_source/media/Photos
  mode: subfolder_queue
  recursive: true
```
Expected: Scans all subfolders regardless of depth

**3.2 Depth Limiting**
```yaml
folder:
  path: media-source://media_source/media/Photos
  mode: subfolder_queue
  recursive: true
  scan_depth: 2
```
Expected: Only scans folders up to 2 levels deep

**3.3 Priority Folders + Recursion**
```yaml
folder:
  path: media-source://media_source/media/Photos
  mode: subfolder_queue
  recursive: true
  priority_folders:
    - pattern: "/DCIM/"
      weight: 3.0
```
Expected: Files from DCIM folders appear 3x more often

**Verification**:
- Console logs should show "Scanning directory: /path/to/folder"
- Check depth counter in logs
- Verify priority folder weighting in queue distribution

---

### Task 4: Enhanced Kiosk Mode

**Goal**: Add option to auto-enable kiosk entity on card load

**New Config**:
```yaml
kiosk:
  mode_entity: input_boolean.kiosk_mode
  auto_enable: true  # NEW - turn on entity when card loads
  exit_action: tap  # tap | hold | double_tap
```

**Implementation**:
1. Check `config.kiosk.auto_enable` on card initialization
2. If true, call service to turn on `mode_entity`
3. Monitor entity state changes
4. On tap (based on exit_action), turn off entity
5. When entity off, exit kiosk mode

**V4 Code Reference**:
- ha-media-card.js lines 4700-4800 (kiosk mode)

**Estimated Time**: 2 hours

---

### Task 5: Config Migration (v4 → v5)

**Goal**: Auto-convert v4 configs to v5 format

**Migration Rules**:

**Media Path Conversion**:
```yaml
# V4
media_path: "media-source://media_source/media/Photos"

# V5
media_source_type: single_media  # if no other config
single_media:
  path: "media-source://media_source/media/Photos"
```

**Folder Mode Conversion**:
```yaml
# V4
media_path: "media-source://media_source/media/Photos"
folder_mode: random

# V5
media_source_type: folder
folder:
  path: "media-source://media_source/media/Photos"
  mode: random
```

**Media Index Conversion**:
```yaml
# V4
media_index:
  entity_id: sensor.media_index...
random_mode: true

# V5
media_source_type: folder
folder:
  path: <extracted from entity attributes>
  mode: random
  media_index:
    entity_id: sensor.media_index...
```

**Implementation**:
1. Add `_migrateV4Config()` method to card
2. Call on `setConfig()` if old format detected
3. Log migration actions to console
4. Save migrated config automatically

**Code Location**: MediaCardV5a.setConfig() - add migration logic

**Estimated Time**: 3-4 hours

---

## Testing Plan

### Phase 1: Critical Fixes (Day 1)
- [ ] Implement reconnection logic fix
- [ ] Test reconnection with config changes
- [ ] Verify history preservation works
- [ ] Test with multiple cards sharing queue

### Phase 2: Verification (Day 1-2)
- [ ] Add enhanced pause/resume logging
- [ ] Test background tab behavior
- [ ] Execute recursive scanning tests
- [ ] Verify priority folders work with recursion

### Phase 3: Enhanced Features (Day 2-3)
- [ ] Implement auto-enable kiosk mode
- [ ] Test kiosk mode with entity monitoring
- [ ] Add config migration logic
- [ ] Test v4 config auto-conversion

### Phase 4: Comprehensive Testing (Day 3-4)
- [ ] Execute full testing guide
- [ ] Document test results
- [ ] Fix any discovered bugs
- [ ] Cross-browser testing

### Phase 5: Final Polish (Day 4-5)
- [ ] Update documentation
- [ ] Create release notes
- [ ] Tag v5.0.0 release
- [ ] Update HACS metadata

---

## Ship Criteria Checklist

### Must Have (Blockers):
- [ ] Reconnection logic working (history preserved)
- [ ] Pause/resume verified (background tabs)
- [ ] Recursive scanning tested (all scenarios)
- [ ] Zero critical bugs in console
- [ ] V4 feature parity confirmed

### Should Have:
- [ ] Enhanced kiosk mode implemented
- [ ] Config migration working
- [ ] 90%+ of test guide passing
- [ ] Performance acceptable (<5s load)

### Nice to Have:
- [ ] Cross-browser tested (Chrome, Firefox, Safari)
- [ ] Mobile tested (iOS, Android)
- [ ] Documentation complete
- [ ] Migration guide written

---

## Timeline

**Day 1 (Critical Fixes)**:
- Morning: Fix reconnection logic (3 hours)
- Afternoon: Verify pause/resume + test recursion (2 hours)

**Day 2 (Enhanced Features)**:
- Morning: Enhanced kiosk mode (2 hours)
- Afternoon: Config migration (3 hours)

**Day 3-4 (Testing)**:
- Execute comprehensive testing guide
- Fix bugs discovered during testing
- Document test results

**Day 5 (Ship)**:
- Final cross-browser testing
- Update documentation
- Create release
- Deploy to production

**Total Estimated Time**: 4-5 days to v5.0 release

---

## Next Immediate Actions

1. **Fix reconnection logic** (Start now - highest priority)
2. **Test recursive scanning** (User wants this verified)
3. **Add enhanced logging** (Verify pause/resume working)

After these 3 items complete, we'll have confidence the card is solid and can proceed with enhanced features and comprehensive testing.

**Recommendation**: Start with reconnection fix, that's the most user-impacting issue right now.
