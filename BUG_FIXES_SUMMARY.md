# Bug Fixes Summary - Ready for Master Merge

Comprehensive list of all bug fixes and improvements made since last merge to master.

## Media Card (ha-media-card) - v5.5.0 → v5.6.0

### Critical Bug Fixes

#### Video Navigation Auto-Pause (Commit: 0d22c87)
**Problem**: Videos would automatically pause the slideshow when clicking next/previous during playback
- Root Cause: Browser auto-pauses videos when removed from DOM, triggering pause event handler
- Solution: Added `_navigatingAway` flag to ignore pause events during navigation transitions
- Impact: Slideshow now continues correctly when navigating through videos

#### Panel Navigation Flag Cleanup (Commits: 2691283)
**Problem**: `_navigatingAway` flag would stay `true` indefinitely when using panel navigation
- Root Cause: Early return in panel override path didn't clear the navigation flag
- Solution: Clear flag before returning in both `_loadNext()` and `_loadPrevious()` panel paths
- Impact: Prevents stuck state in burst mode and other panel-based features
- Severity: Critical - would break panel navigation entirely

#### Timer Position Loss on Pause Button (Commit: fea16cd)
**Problem**: Pause button would restart timer from full interval instead of preserving position
- Root Cause: Pause button handler didn't calculate elapsed time like center click handler
- Solution: Added same timer preservation logic - calculate elapsed, store remaining time
- Impact: Consistent UX whether pausing via button or center click
- Example: Pause at 4s of 5s interval now resumes after 1s, not 5s

#### Smart-Scale Min-Height Fallback (Commit: dd7a7ad)
**Problem**: Smart-scale mode could result in 0px height on some configurations
- Root Cause: CSS calculation could evaluate to invalid value
- Solution: Added `max(50vh, ...)` fallback to ensure minimum 50% viewport height
- Impact: Backward compatibility and graceful degradation

#### Viewport-Fit Centering with Panel Open (Commits: 2f4e8f0, 6c09445)
**Problem**: Images not properly centered when side panel opened in viewport-fit mode
- Root Cause: Absolute positioning didn't adapt to reduced viewport width
- Solution: Redesigned using CSS Grid for proper centering
- Impact: Images stay centered regardless of panel state

#### Thumbnail Cropping in Viewport Modes (Commits: 25a7bce, 8bbe24b)
**Problem**: Thumbnails showing cropped images when card configured for viewport-fit/fill
- Root Cause: Aspect mode CSS applying to thumbnails in panel
- Solution: Scoped viewport CSS to only affect main media container, not thumbnails
- Impact: Thumbnails always show full image preview

#### Unnecessary Refresh on First Timer Fire (Commit: 2989618)
**Problem**: First auto-advance would trigger immediately instead of waiting full interval
- Root Cause: Timer logic firing refresh before first interval elapsed
- Solution: Proper initialization of timer state
- Impact: More predictable slideshow timing

### Performance Optimizations

#### Header Visibility Polling (Commit: 7025654)
**Problem**: Shadow DOM search executed every 200ms for header detection
- Root Cause: Polling interval did full recursive search on every iteration
- Solution: Cache header element after first discovery, reuse in subsequent polls
- Impact: Reduced CPU usage from ~5 expensive searches/second to single property check
- Before: Full shadow DOM traversal every 200ms
- After: One search, then just `offsetHeight` check

#### Header Caching for Height Calculation (Commit: 0d22c87)
**Problem**: Expensive shadow DOM traversal on every viewport height calculation
- Root Cause: Re-searching for header element on every resize/recalculation
- Solution: Cache header element reference, invalidate on kiosk mode toggle
- Added: Recursion depth limit (5 levels) to prevent performance issues
- Impact: Significant performance improvement in viewport height calculations

#### Viewport Height Recalculation Throttling (Commit: aef8eb6)
**Problem**: Excessive console logging during viewport calculations
- Solution: Throttle viewport height recalculation logs
- Impact: Cleaner console output, reduced log noise

#### Pause Log Spam Reduction (Commit: 9adde85)
**Problem**: Repeated "slideshow paused" messages filling console
- Solution: Added `_pauseLogShown` flag to log pause state only once
- Impact: Much cleaner console output during paused state

### Architecture Improvements

#### Kiosk Mode Detection (Commits: e85e971, 7fcc93a)
**Problem**: Header visibility changes not detected in kiosk mode
- Root Cause: MutationObserver unreliable for kiosk integration DOM changes
- Solution: Switched to polling-based header visibility detection (200ms interval)
- Added: Proper invalidation of cached header on kiosk state changes
- Impact: Viewport height now correctly recalculates when entering/exiting kiosk mode

#### Viewport-Fill Mode Redesign (Commits: 7ae63be, 989f43f, 90fe100, cb637c2)
**Problem**: Viewport-fill had inconsistent behavior between images and videos
- Root Cause: Mix of absolute positioning and object-fit causing layout issues
- Solution: Complete redesign using CSS Grid for consistent behavior
- Impact: Images fill viewport, videos centered, thumbnails correct in all modes

#### Aspect Mode Consistency (Commits: 7d12c52, 5e50b33)
**Problem**: Confusing differences between aspect modes
- Solution: Improved consistency and documented clear use cases
- Impact: Better UX and clearer mental model for users

### Code Quality

#### Code Formatting (Commit: 30ec6c9)
**Problem**: Missing blank line between closing brace and const declaration
- Solution: Proper JavaScript formatting for readability
- Source: Copilot PR review comment #1

#### Unused Variable Cleanup (Commit: 5026001)
**Problem**: `wasPaused` variable declared but never used in `_handlePauseClick`
- Solution: Removed unused variable
- Impact: Cleaner code

#### Logging Consistency (Commit: f0dd44b)
**Problem**: Some viewport height logs using console.log instead of _log()
- Solution: Replaced with `_log()` method for consistency
- Impact: Logs respect debug mode setting

### Documentation

#### Smart-Scale Viewport Height (Commit: a00f941)
**Problem**: Documentation incorrectly stated "90% of viewport (80% when panel open)"
- Actual Behavior: Always 80% of viewport
- Solution: Corrected documentation to match implementation
- Source: Copilot PR review comment #3

#### Aspect Mode Use Cases (Commit: 5e50b33)
**Problem**: Unclear differences between smart-scale, viewport-fit, viewport-fill
- Solution: Documented clear use cases and behavior for each mode
- Impact: Users can make informed choices

#### CHANGELOG Clarification (Commit: ef9ee7d)
**Problem**: CHANGELOG lacked detail on min-height fallback behavior
- Solution: Added comprehensive documentation of fallback behavior
- Impact: Clear upgrade notes for users

---

## Media Index (ha-media-index) - v1.5.0 → v1.5.1

### Critical Database Fixes

#### Foreign Key Constraints Disabled (Commit: 4be81f3) 🚨 **CRITICAL**
**Problem**: Database growing to 235MB for only 3,026 files (99% wasted space)
- Root Cause: SQLite foreign keys disabled by default, `ON DELETE CASCADE` never worked
- Result: 1,432,402 orphaned exif_data rows accumulating since integration creation
- Solution: Added `PRAGMA foreign_keys = ON` during database initialization
- Impact: Future deletes will properly cascade, preventing orphan accumulation
- **This was a silent data integrity issue affecting all installations**

#### Orphaned EXIF Data Cleanup (Commit: 4be81f3)
**Problem**: Existing installations have millions of orphaned exif_data rows
- Solution: Enhanced `cleanup_database` service to detect and remove orphans
- Added: `orphaned_exif_removed` count in service response
- Result: Cleaned 1,432,402 orphaned rows, reclaimed 232.68 MB from one database
- Impact: Existing users can clean up accumulated bloat

#### Database Bloat Prevention (Commit: 6cd8775)
**Problem**: Database file growing indefinitely due to SQLite copy-on-write behavior
- Root Cause: Deleted rows leave ghost data, file never shrinks
- Solution: Automatic VACUUM operations
  - After `cleanup_database` service completes (when `dry_run=false`)
  - Weekly scheduled VACUUM via `async_track_time_interval`
- Added: Size tracking (`db_size_before_mb`, `db_size_after_mb`, `space_reclaimed_mb`)
- Result: 22MB database with 172 files → properly sized after VACUUM
- Impact: Database files stay compact over time

### Bug Fixes

#### Geocode Cache Hit Rate Tracking (Commit: 4c10333)
**Problem**: Cache hit rate calculation producing incorrect percentages
- Root Cause: Logic error in percentage calculation
- Solution: Fixed calculation to properly track cache effectiveness
- Impact: Accurate statistics for geocoding performance monitoring

#### Files With Location Count (Commit: 4c10333)
**Problem**: Count of geocoded files not accurate
- Solution: Fixed query to properly count files with location data
- Impact: Accurate sensor statistics

---

## Testing Status

### Media Card
- ✅ All fixes tested individually on HADev (.62)
- ✅ Video navigation works without auto-pause
- ✅ Timer preservation consistent between pause methods
- ✅ Panel navigation (burst mode) working correctly
- ✅ Viewport modes rendering correctly
- ✅ Kiosk mode transitions working
- ✅ Performance improvements verified (reduced console logging)

### Media Index
- ✅ Foreign key constraints verified enabled
- ✅ Cleanup service tested on production databases
- ✅ Total space reclaimed: 256MB across all instances
  - PhotoLibrary: 235MB → 2.35MB (232.68 MB reclaimed)
  - RandomPhotos: 23MB → smaller (23MB reclaimed)
- ✅ Orphan detection working (1.54M orphans found and removed)
- ✅ VACUUM operations working (significant compression)
- ✅ Future deletes now properly cascade

---

## Commits Ready for Merge

### Media Card (29 commits)
```
2691283 fix: clear _navigatingAway flag before panel navigation early returns
7025654 perf: optimize header visibility polling to use cached element
a00f941 docs: correct smart-scale viewport height to 80%
fea16cd fix: preserve timer position in pause button handler
30ec6c9 fix: formatting - separate closing brace from const declaration
0d22c87 fix: prevent video pause on navigation and re-implement header caching
2989618 fix: prevent unnecessary refresh on first auto-advance timer fire
9604b0f feat: preserve timer position on pause/resume
ef9ee7d docs: clarify CHANGELOG and document min-height fallback
aef8eb6 refactor: throttle viewport height recalculation logs
7fcc93a fix: use polling-based header visibility detection for kiosk mode
e85e971 fix: trigger viewport height recalculation on kiosk mode toggle
1a53688 fix: initialize _pauseLogShown flag in constructor
d81cf2e refactor: extract smart-scale 80vh to CSS custom property
9fba566 refactor: remove redundant window resize listener
8bbe24b fix: scope viewport-fit/viewport-fill video CSS to prevent thumbnail cropping
7d12c52 feat: improve aspect mode consistency and UX
5e50b33 docs: clarify aspect mode differences and use cases
25a7bce fix: viewport-fit thumbnails showing cropped images
2f4e8f0 fix: smart-scale centering in panel-open mode
dd7a7ad fix: smart-scale min-height fallback to 50vh for backward compatibility
f0dd44b perf: replace console.log with _log() for viewport height logging
5026001 chore: remove unused wasPaused variable in _handlePauseClick
90fe100 fix: viewport-fill mode now properly fills viewport for all media types
7ae63be fix: redesign viewport-fill to use CSS Grid instead of absolute positioning
cb637c2 fix: viewport-fill video styling to match images (partial fix)
cb30871 chore: rollback version to v5.5.0
989f43f fix: viewport-fill mode - images fill viewport, videos centered, panel thumbnails correct
9adde85 fix: timer spam when paused and shadow DOM header detection
6c09445 fix: viewport-fit centering with CSS Grid and video scaling
```

### Media Index (3 commits)
```
4be81f3 fix: enable foreign key constraints and add orphan cleanup to prevent database bloat
6cd8775 fix: add SQLite VACUUM to prevent database bloat
4c10333 fix: geocode cache hit rate tracking and files_with_location count
```

---

## Recommended Merge Strategy

1. **Media Index first** - Database fixes are critical and should be released ASAP
   - Foreign key fix prevents future data integrity issues
   - Cleanup service helps existing users recover space
   
2. **Media Card second** - UI/UX improvements and bug fixes
   - No breaking changes
   - All fixes backward compatible
   - Significant performance improvements

3. **Version Bumps**
   - Media Card: v5.5.0 → v5.6.0 (bug fixes + performance)
   - Media Index: v1.5.0 → v1.5.1 (critical database fix)

---

## Known Issues Resolved

- ❌ ~~Database growing to 235MB for 3K files~~ → ✅ Fixed with foreign keys + VACUUM
- ❌ ~~Video navigation pausing slideshow~~ → ✅ Fixed with _navigatingAway flag
- ❌ ~~Panel navigation breaking after first use~~ → ✅ Fixed flag cleanup
- ❌ ~~Pause button restarting timer~~ → ✅ Fixed timer preservation
- ❌ ~~Header search running every 200ms~~ → ✅ Fixed with caching
- ❌ ~~Kiosk mode not recalculating viewport~~ → ✅ Fixed with polling
- ❌ ~~Thumbnails showing cropped images~~ → ✅ Fixed CSS scoping
- ❌ ~~Smart-scale 0px height edge case~~ → ✅ Fixed with min-height fallback

---

Generated: December 12, 2025
