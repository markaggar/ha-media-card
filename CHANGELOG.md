# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v5.6.8 - 2026-01-12

### Added

- **Non-Admin User Support**: Dashboard users without admin privileges can now use all Media Index features
  - Previously, non-admin users would get "Unauthorized" errors when using random mode with Media Index
  - Root cause: `fire_event` and `subscribeEvents` WebSocket calls require admin permissions
  - Fix: Card now checks `hass.user.is_admin` and skips admin-only features for non-admin users
  - All core functionality works for non-admin users: navigation, slideshow, metadata display
  - No changes required to Media Index - works with existing versions

- **Video Controls On Tap** (Default: `true`): Videos now start with a cleaner presentation without visible playback controls
  - Native HTML5 video controls (play/pause, seek, volume, fullscreen) hidden until user interaction
  - **First tap**: Shows video controls, hides metadata/position overlays for unobstructed viewing
  - **Second tap**: Hides video controls, shows metadata/position overlays
  - Provides cleaner, more immersive video experience by default
  - Set `video_controls_on_tap: false` to restore legacy behavior (controls always visible)

- **Periodic Refresh for New Files**: Slideshow now checks for new files every `slideshow_window` items
  - Works for both database-backed (Media Index) and filesystem providers
  - New files are detected and inserted at the front of the queue without interrupting playback
  - Previously only checked when looping back to beginning; now checks periodically throughout slideshow

- **Fresh Query on Wrap**: When slideshow loops to beginning, performs fresh database/filesystem query
  - Catches new files added since slideshow started
  - Clears cursor and re-queries from beginning with updated data
  - `reset()` method added to all providers (FolderProvider, SequentialMediaIndexProvider, MediaIndexProvider, SubfolderQueue)

- **404 File Exclusion**: Files that return 404 are now excluded from future provider results
  - Provider's `excludeFile()` method tracks missing files
  - Path normalization ensures both URI and filesystem path formats are excluded
  - Prevents infinite loop when hitting missing files in sequential mode

- **New Config Option: `navigation_queue_size`** (YAML only)
  - Controls how many items are kept in back-navigation history
  - Default: 100 (or `slideshow_window` if larger)
  - Allows independent tuning of navigation history vs refresh interval
  - Example: `navigation_queue_size: 200`

### Fixed

- **Video Seek Backwards Auto-Advance**: Fixed video auto-advancing when user seeks backwards
  - Seeking backwards was incorrectly detected as video loop completion
  - Now skips loop detection entirely when user has interacted with video (seek, pause, click)
  - Users can freely seek without triggering premature advancement

- **Sequential Provider Cursor Pagination**: Fixed duplicate files appearing in slideshow
  - Cursor now properly updated after client-side sort (not before)
  - Removed cursor overwrite in `getNext()` that was causing duplicate fetches
  - `lastSeenId` now properly reset in `reset()` and `rescanForNewFiles()`
  - Provider correctly paginates through files without returning same items

- **Sequential Provider Timestamp Conversion**: Fixed `after_value` cursor errors
  - Backend expects numeric Unix timestamps, but some date fields returned ISO strings
  - Added `_toUnixTimestamp()` helper to convert dates to proper format
  - Handles: ISO strings, Date objects, EXIF format strings, millisecond timestamps
  - Prevents "Could not convert after_value to numeric" errors

- **Navigation Queue Preservation on Wrap**: Queue no longer cleared when slideshow loops
  - Previously: Queue was cleared and only 30 items reloaded on wrap
  - Now: Full navigation history preserved (up to `navigation_queue_size`)
  - Users can navigate back through previously seen items after loop
  - Queue trimmed from front if exceeds max size

- **Video Overlay Toggle**: Clicking on video now toggles bottom overlays for control access
  - Click video to hide metadata/position overlays, click again to show
  - Overlays auto-restore when video ends
  - Properly stops event propagation to prevent double-handling

- **Folder Sorting for Date-Based Names**: Fixed numeric sorting for folder structures like `2026/1/12`
  - String comparison `"2026/1/12"` vs `"2026/1/9"` incorrectly sorted "12" before "9"
  - Now extracts numeric parts and creates sortable YYYYMMDD values
  - Properly handles various formats: `2026/1/12`, `2026-01-12`, `20260112`

- **File Sorting with Date-Embedded Filenames**: Improved sorting for files with dates in names
  - Uses `BigInt` for numeric timestamp comparison (handles large values)
  - Reuses `MediaProvider.extractDateFromFilename()` for consistent date parsing
  - Falls back to `localeCompare` for non-date filenames

- **Compound Cursor Pagination**: Fixed duplicate files when paginating with same date_taken values
  - Now uses `(after_value, after_id)` compound cursor instead of just `after_value`
  - Secondary cursor (row ID) provides stable ordering when sort values are equal
  - Prevents items from being returned multiple times across page boundaries

- **Position Indicator After Wrap**: Fixed "1 of 30" showing after viewing 86 items
  - Now remembers `_totalItemsInLoop` before clearing queue on wrap
  - Position indicator uses remembered total while queue repopulates
  - Updates remembered total as queue grows during normal playback

- **Duplicate Files on Periodic Refresh**: Fixed files appearing multiple times after wrap
  - `SubfolderQueue.reset()` now preserves `_knownFilesAtStart` baseline across loops
  - `_doPeriodicRefresh()` also checks session `history` to skip already-shown files
  - Both checks prevent adding items that were already displayed this session

- **Sliding Window Index Adjustment**: Fixed navigation index when queue shifts
  - When removing oldest item from queue, correctly point to newly added item
  - Previously could cause navigation to wrong position after queue shift

### Changed

- **`slideshow_window` Behavior**: Now controls periodic refresh interval instead of queue size
  - `slideshow_window` = how often to check for new files (in items viewed)
  - `navigation_queue_size` = how many items to keep in back-navigation history (default: 100)
  - Navigation queue floor is now 100 items regardless of slideshow_window setting

## v5.6.7 - 2026-01-07

### Added

- **On This Day - Photo Date Toggle**: Choose between today's date or the current photo's date for "Through the Years" searches
  - Default (unchecked): Uses today's date
  - Checked: Uses current photo's date to find that same date across all years
  - Panel heading dynamically shows the date being used and year range of results

### Fixed

- **Same Date / Through the Years Date Accuracy**: Fixed critical timezone bug causing photos from wrong dates (spanning 2-3 days instead of one)
  - Now uses Unix timestamp filtering for exact calendar day matching
  - Requires ha-media-index v1.5.9 or later

- **Panel Navigation**: Queue panel now remembers scroll position when opening/closing other panels

- **Slideshow Resume**: Slideshow correctly restarts when closing any panel (previously could get stuck)

- **Video Handling**:
  - Missing videos are silently skipped (no 404 errors or stuck slideshow)
  - Fixed video-to-video transitions not loading the new video
  - Video thumbnails no longer flicker during navigation

- **UI Fixes**:
  - Clock no longer slides right when hovered at center positions
  - Tap center during video to hide bottom overlays for access to video controls (auto-restores when video ends)

## v5.6.5 - 2025-12-27

### Added

- - **Lightweight File Existence Check**: New filesystem validation for MediaIndexProvider only
  - Calls `media_index.check_file_exists` service for instant validation (~1ms)
  - No network request, no image decode - just `os.path.exists()` check
  - Eliminates 404 broken image icons by detecting missing files before rendering
  - Files skip instantly when 404 detected, no broken image placeholder shown
  - Provider-based architecture: MediaIndexProvider implements check, others skip validation
  - FolderProvider delegates to wrapped MediaIndexProvider when using `use_media_index_for_discovery: true`
  - Other providers (FolderProvider/SubfolderQueue, SingleMediaProvider) scan filesystem directly, so 404s unlikely
  - Graceful fallback: If service unavailable (old media_index v<1.5.6), proceeds without validation
  - Backward compatible with all media_index versions

- **Through the Years Button Hide Option**: New `hide_on_this_day_button` config option
  - Hides the action button while keeping clock/date activation functional
  - Useful for cleaner UI when clock overlay provides sufficient access
  - Appears as indented sub-option in editor when Through the Years is enabled
  - Config: `action_buttons.hide_on_this_day_button: true`

### Fixed

- **Video Auto-Advance Behavior**: Fixed videos respecting auto-advance timer properly
  - Videos now play to completion when auto-advance is enabled (no HTML loop attribute when timer active)
  - Short videos with `video_loop: true` restart manually based on elapsed playback time
  - When elapsed time < auto-advance interval: Video restarts and continues looping
  - When elapsed time >= auto-advance interval: Advances immediately to next media
  - `video_max_duration` still respected if set - interrupts video at specified limit
  - Long videos advance immediately when they end (no delay waiting for timer)
  - Fixed incorrect `maxDuration` calculation that showed wrong value in logs
  - Behavior: Short videos loop until timer expires, long videos advance on completion

- **Crossfade Black Screen During Navigation**: Fixed race condition causing images to disappear (fade to black) during navigation
  - Root cause: setTimeout callback clearing layer URLs after transition could fire after new image was already set to that layer
  - Added layer generation counters (`_frontLayerGeneration`, `_backLayerGeneration`) that increment when layer URLs change
  - setTimeout callbacks now capture generation at scheduling time and only clear if generation unchanged
  - Prevents stale setTimeout from wiping out newly-set layer URLs during rapid or overlapping navigation
  - Most commonly occurred when navigating forward/back repeatedly with brief pauses between clicks
  - Images now render consistently without black screens, crossfade transitions work reliably

- **Code Quality Issues** (GitHub Copilot review feedback):
  - Fixed matchesItem function parameter inconsistency - now properly receives index parameter in all filter calls
  - Fixed debugMatchCount variable continuing across multiple filter operations - now resets before _panelQueue filter
  - **Pagination Bug**: Fixed hasNextPage calculation using allItems.length instead of validItems.length (incorrect page count when items filtered)
  - Added null check in _checkFileExistsViaProvider before passing currentMedia to provider (prevents crashes)
  - Added defensive Number.isFinite check for video tolerance calculation (prevents NaN comparisons)
  - All issues addressed from automated code review to improve robustness and prevent edge case failures

- **Through the Years Panel Layout**: Fixed button overflow on narrow screens
  - Stacked layout: dropdown on top, checkbox and button on bottom row
  - Prevents "Play These" button from spilling off page
  - Improved responsive design for mobile/tablet views

- **Navigation Wrap-Around Bug**: Fixed undefined queue access when wrapping from end to start
  - Root cause: Local `nextIndex` variable wasn't synchronized with `_pendingNavigationIndex` when wrapping
  - Could cause errors when provider exhausted and collection wrapped to start
  - Added `nextIndex = 0` before `_pendingNavigationIndex = 0` at wrap point
  - Matches pattern already correctly implemented for preloaded collections
  - Identified by GitHub Copilot code review

- **Video Loop Detection for Short Videos**: Fixed endless looping on very short videos (e.g., 1-second videos)
  - Loop detection tolerance now duration-aware: uses 10% of video duration (clamped 0.05s-0.5s)
  - Previous fixed 0.5s tolerance was too large for short videos
  - Example: 1-second video now uses 0.1s tolerance instead of 0.5s
  - Backwards compatible: defaults to 0.5s for unknown/long durations
  - Identified by GitHub Copilot code review

- **Navigation Queue Index Adjustment**: Fixed incorrect position tracking when removing invalid items
  - Previous logic didn't correctly identify where removed items were relative to current position
  - Now tracks how many items were removed before current `navigationIndex`
  - Prevents position mismatches when clicking thumbnails after 404 items are filtered out
  - Handles multiple removed items correctly
  - Identified by GitHub Copilot code review

- **Video Seeking Threshold**: Changed threshold from `> 0.5` to `>= 0.5` for consistency
  - User seeks at exactly 0.5 seconds are now correctly detected as user interaction
  - Minor consistency improvement in threshold checks
  - Identified by GitHub Copilot code review

- **Panel Mode Debug Logging**: Fixed debug logs showing regardless of debug_mode setting
  - Burst mode, related photos, queue preview, and "On This Day" logs now properly gated
  - Changed all panel mode `console.warn()` calls to use `this._log()` method
  - Logs only appear when `debug_mode: true` in config or when using debug button
  - Reduces console noise for normal users

- **Missing Media File Handling (404 Errors)**: Slideshow no longer gets stuck on deleted files
  - 404 errors now automatically skip to next image in folder/queue modes
  - After one retry attempt, missing files are silently skipped with debug log
  - Slideshow continues seamlessly without user intervention
  - Single media mode still shows error message (as expected for static display)
  - Queue thumbnails: Broken thumbnails completely removed from display and navigationQueue
  - Items marked with `_invalid` flag and removed from underlying queue
  - Prevents broken image icons, empty slideshow states, stuck video playback, and position mismatches
  - NavigationIndex automatically adjusted when invalid items removed
  - Panel mode thumbnails: Same fix applied to burst, related photos, "On This Day", and history panels
  - Invalid items removed from `_panelQueue` with `_panelQueueIndex` adjustment
  - Fixes thumbnail/media mismatch when 404s occur in panel modes
  
- **404 Validation Strategy**: Lightweight filesystem check for MediaIndexProvider only
  - MediaIndexProvider: Uses service check (instant, ~1ms filesystem check)
  - Other providers: No validation overhead (files discovered from disk)
  - Removed Image() preload validation (was causing double network/decode overhead for all providers)
  - Provider polymorphism: Card calls `provider.checkFileExists()`, only MediaIndexProvider implements

- **Debug Logging**: Console messages now properly respect debug_mode setting
  - Queue navigation messages now use `_log()` instead of `console.log()`
  - Favorite debugging messages now use `_log()` instead of `console.warn()`
  - Messages only appear when `debug_mode: true` is enabled
  - Reduces console noise in production use

- **Confirmation Dialog Paths**: Delete/edit dialogs show correct destination folder
  - Root cause: Always preferred `media_path` even when in folder mode
  - Now checks `media_source_type` to determine correct path source
  - Folder mode (`media_source_type: folder`) uses `folder.path`
  - Single media mode (`media_source_type: single_media`) uses `media_path`
  - Prevents showing incorrect `_Junk`/`_Edit` destination paths

- **Queue Preview Panel Interaction**: Closing Queue Preview no longer skips injected items
  - Root cause: Queue restoration logic treated Queue Preview like other panel modes
  - Queue Preview is read-only overlay, never saves/restores navigationQueue
  - Through the Years, Burst, and Related modes inject items into navigationQueue
  - Closing Queue Preview now skips restoration, preserving injected items
  - Fixes bug where viewing queue during Through the Years playback would skip remaining items

### Improved
- **Code Quality**: Removed redundant video tracking flag resets
  - Centralized all resets in `_setMediaUrl()` as single source of truth
  - Removed duplicate resets from `_displayItem()` for cleaner code
  - Flags: `_videoHasEnded`, `_lastVideoTime`, `_videoTimerCount`

### Technical
- Requires `ha-media-index` v1.5.6+ for optimal performance (filesystem check)
- Works with older media_index versions (proceeds without validation)
- WebSocket service call pattern: `hass.callWS()` with `return_response: true`
- Response parsing: `response?.response?.exists` (nested under response key)

## v5.6.4 - 2025-12-22

### Fixed
- **Video Timer and Loop Behavior**: Complete overhaul of video timing system
  - Changed from timestamp-based approach to simple counter-based system
  - Timer always fires at `auto_advance_seconds` interval (e.g., 5s), never changes dynamically
  - Short videos that loop: advance on first timer fire after loop detection
  - Long videos with `max_video_duration`: counter × interval ≥ max enforces duration cap
  - User interaction (pause/seek/click) allows video to play to completion regardless of max_duration
  - Removed problematic logic that changed timer interval to max_duration (caused 2× timing)
  - Counter reset in `_setMediaUrl` for each new video
  - Fixes videos taking twice as long as expected (10s instead of 5s)
  - Preserves user control when manually interacting with video controls

- **Metadata Inheritance and Synchronization**: Fixed metadata from previous image being copied to videos
  - Root cause: Video elements had `@loadeddata` handler calling `_onMediaLoaded` (image handler)
  - Removed `@loadeddata` from video elements - videos now only use `@canplay` event
  - Updated `_onVideoCanPlay` to apply pending metadata like `_onMediaLoaded` does for images
  - Fixed `_refreshMetadata` bypassing pending state pattern by writing directly to `_currentMetadata`
  - `_refreshMetadata` now updates `_pendingMetadata` instead when pending state exists
  - Fixed `_refreshMetadata` using wrong path (was using `_currentMediaPath` instead of `_pendingMediaPath`)
  - Now uses pending path during navigation to fetch correct metadata for new item
  - Ensures metadata is synchronized with displayed media across all transitions
  - Favorite hearts and other metadata no longer incorrectly inherited between different media items

- **Duplicate Queue Refresh on Wrap-Around**: Fixed unnecessary queue refresh when looping from last to first item
  - Root cause: `_refreshQueue` called `provider.reset()` which triggered duplicate database query
  - `reset()` internally calls `initialize()` causing redundant rescan after `rescanForNewFiles()`
  - Solution: Added `skipReset` parameter to `_refreshQueue` to avoid duplicate when provider already rescanned
  - When called from `_checkForNewFiles`, passes `skipReset=true` to skip redundant reset
  - Fixed false positive new file detection on wrap by passing current media ID for comparison
  - `rescanForNewFiles` now accepts `currentMediaId` parameter for accurate comparison
  - Compares currently displayed file against database query results to detect actual new files
  - Eliminates unnecessary database queries while still detecting new files when they arrive
  - Reduces log spam and improves performance on collections that loop continuously

### Technical Details
- Video timer uses simple counter approach: `_videoTimerCount` increments each fire
- Elapsed time calculated as: `counter × auto_advance_seconds`
- Duration enforcement: `if (elapsedSeconds >= maxDuration) { advance }`
- User interaction flag `_videoUserInteracted` bypasses all timer/duration logic
- Metadata now properly isolated per media type with pending state pattern
- Queue refresh logic optimized to avoid redundant provider initialization

## v5.6.3 - 2025-12-21

### Added
- **Blend with Background Toggle**: New `blend_with_background` config option (default: true)
  - When enabled (default): Card blends seamlessly with dashboard background (transparent)
  - When disabled: Card uses standard HA card background with proper rounded corners
  - Metadata and position indicators automatically adapt to match card background color
  - Available in visual editor under "Image Options" section

- **Edge Fade Strength (Beta)**: Rectangular fade effect from all four edges
  - Single 0-100 number control for fade strength (replaces binary enable/disable)
  - CSS mask implementation with intersecting linear gradients
  - Available in visual editor under "Image Options" section
  - Marked as beta: May show faint horizontal/vertical intersection lines on some images
  - Works alongside existing vignette effect for additional image framing  

### Fixed
- **Auto-Advance Timer**: Fixed timer starting before media loads (images only)
  - **Images**: Timer now starts only when image has loaded (prevents timer expiring during slow image load)
  - **Videos**: Timer starts immediately and runs while video plays/loops (allows timer to interrupt long videos)
  - Most noticeable with slow connections or large files
  - Fixes issue where slideshow would skip images before they rendered
  - Preserves correct video behavior: timer interrupts playback when it expires (for max duration and loop mode)

- **Navigation Button Height**: Reduced height from 60% to 50% (max 600px to 400px)
  - Prevents interference with video control seek bar when panels are active
- **Rounded Corners**: Fixed missing rounded corners at top and bottom
  - Added `overflow: hidden` to `<ha-card>` element to properly clip content
  - Media container now inherits border-radius for consistent appearance

- **Metadata/Position Indicator Synchronization**: Fixed overlays updating before media loads
  - Root cause: Navigation methods were setting state immediately while media was still loading
  - Created visible desync where metadata and position indicator changed before image appeared
  - Most noticeable with manual navigation (buttons, thumbnails) or on slower connections
  - Solution: Implemented comprehensive pending state pattern across all navigation methods
  - All state updates (`_currentMetadata`, `_currentMediaPath`, `navigationIndex`) now deferred until image/video load events
  - Added `_pendingNavigationIndex` property alongside existing pending metadata
  - Modified `_onMediaLoaded()` and `_onVideoCanPlay()` to apply all pending state simultaneously
  - Fixed all navigation paths: `_loadNext()`, `_loadPrevious()`, `_loadPanelItem()`, `_jumpToQueuePosition()`
  - Metadata, position indicator, and media display now update perfectly synchronized

- **Panel Navigation Issues**:
  - Fixed Through the Years panel Next/Previous buttons not working (added `on_this_day` and `history` to allowed panel modes)
  - Fixed queue panel wrapping: Previous at start wraps to end, Next at end wraps to beginning
  - Fixed panel buttons showing when queue has ≤10 items and fits on one page
  - Fixed wrapping logic jumping to position 1 instead of last page

- **Clock Overlay Enhancement**: Made clock/date clickable to open Through the Years panel
  - Hover effect with slight scale and brightness increase
  - Only clickable when media_index active and Through the Years enabled
  - Tooltip shows "Through the Years" when clickable

- **Queue Preview Auto-Open**: Fixed not opening on card load in random mode
  - Changed requirement from `length > 1` to `length > 0` items
  - Now opens immediately with initial item, showing current position
  - Previous button appears as queue grows, allowing navigation back to earlier items

- **Queue Preview Auto-Open Not Populating**: Fixed panel opening empty when auto-open enabled
  - Root cause: Panel initialization reading `navigationIndex` before pending state applied
  - Auto-open happens in `firstUpdated()` lifecycle, before first media load completes
  - Solution: `_enterQueuePreviewMode()` now checks `_pendingNavigationIndex` first, falls back to `navigationIndex`
  - Panel now correctly initializes with current position and displays thumbnails immediately

## v5.6.2 - 2025-12-18

### Fixed
- **Action Button Timeout Not Expiring**: Fixed buttons never disappearing after tapping center to show them
  - Root cause: Slideshow auto-advance was restarting timer in `_loadNext()`/`_loadPrevious()` methods
  - Timer would restart on every slideshow advance before expiring, creating infinite loop
  - Solution: Removed timer restart from automatic navigation methods
  - Timer now expires naturally during slideshow auto-advance
  - Timer only restarts on manual user actions (navigation zones, action buttons)
  - Added debug logging to track timer lifecycle

### Added
- **Smart Touchscreen Timeout for Action Buttons**: Dynamic timeout scales with number of visible buttons
  - Base timeout: 3 seconds for ≤3 buttons
  - Scaling formula: 3s + 1s per additional button (max 15s)
  - Examples: 3 buttons→3s, 5→5s, 8→8s, 10→10s, 15+→15s
  - Touchscreen-only feature, mouse hover behavior unchanged
  - Provides adequate time to select buttons without accidental dismissal

## v5.6.1 - 2025-12-17

### Fixed
- **Crossfade Regression in Default Mode**: Fixed images not displaying in default scaling mode without explicit card_height or max_height
  - Root cause: Crossfade layers positioned absolutely needed container with explicit dimensions
  - Solution: Override absolute positioning in default mode using CSS Grid with `grid-area: 1 / 1` to stack layers
  - Layers now use `position: static` in default mode and participate in document flow
  - Container sizes naturally to fit image dimensions while respecting max-height constraints
  - Crossfade transitions work correctly with proper centering in all configurations

## v5.6.0 - 2025-12-16

### Fixed
- **Metadata Display Bug**
  - Fixed metadata overlay not displaying even when data available (filename, location, dates)
  - Root cause: `item.metadata` could be `undefined` instead of `null`
  - Setting `_pendingMetadata = undefined` passed null check but rendered empty
  - Solution: Added `|| null` fallback when setting `_pendingMetadata` to normalize undefined values
  - Metadata now displays reliably for all available fields

- **Video Loop Behavior**
  - Videos now loop continuously until auto-advance timer fires
  - `_onVideoEnded` exits early when `video_loop` enabled (doesn't trigger advance)
  - Timer keeps running during looped video (not stopped)
  - Auto-advance can interrupt loop at configured interval
  - Consistent with expected behavior: loop video, advance when timer expires

- **Display Entities Condition Initialization**
  - Fixed display entities showing all entities initially, ignoring conditions for first few seconds
  - Root cause: `_getFilteredEntities()` assumed `true` for uncached conditions during initialization
  - All entities showed immediately, then filtered correctly after async condition evaluation
  - Solution: Changed to exclude entities with unevaluated conditions (`return false` instead of `return true`)
  - Added else case to hide display when no entities pass conditions
  - Display entities now respect conditions from card initialization

### Added
- **Display Entities Configuration Controls**
  - Added GUI controls for display entities timing configuration (Phase 1 implementation)
  - Three new sliders in card editor when display entities enabled:
    - **Cycle Interval**: 1-60 seconds (default: 10) - time between entity rotations
    - **Transition Duration**: 0-2000ms (default: 500) - fade animation speed
    - **Recent Change Window**: 0-300 seconds (default: 60) - prioritize recently changed entities
  - Enhanced YAML configuration guidance with:
    - Step-by-step instructions to open YAML editor
    - Example configuration snippet with proper indentation
    - Direct link to full documentation
    - Visual callout box with warning icon for better visibility
    - Callout now spans full width (both columns) for better visibility
  - Entity list still configured in YAML (conditions, icons, styling require YAML flexibility)

- **Config UI Reorganization**
  - Split config sections for better organization:
    - New **📊 Display Entities** section with all display entities settings
    - New **🕐 Clock/Date** section with all clock/date settings
    - **📍 Overlay Positioning** section now contains only position dropdowns
  - Conditional positioning: Display entities and clock position dropdowns only show when respective features are enabled
  - Cleaner UI with logical grouping of related settings

- **Code Quality Improvements**
  - Fixed crossfade layer swap race condition with exact normalized URL matching
  - Moved friendly states mapping to static class constant (performance optimization)
  - Added 500ms debouncing for display entities condition evaluation (reduces excessive work)
  - Improved favorite detection logic to handle all truthy value types (string "true", number 1, boolean true)

- **UI/UX Refinements**
  - Standardized all bottom overlay positions to 12px from edge for visual consistency
  - Position indicator dots visible with higher z-index (z-index: 5)
  - Navigation zones reduced to 60x120px (from 80x200px) to avoid interfering with action buttons
  - Video icon with white background badge for clear distinction
  - Favorite badge with higher z-index and box shadow for visibility
- **Clock/Date Overlay**
  - Real-time clock and date display as overlay on media
  - Independent toggles for time and date (can show date-only, time-only, or both)
  - Time formats: 12-hour (3:45 PM) or 24-hour (15:45)
  - Date formats: Long (December 16, 2025) or Short (12/16/2025)
  - Optional background with glassmorphism styling
  - Configurable position (all 6 positions: corners + center-top/center-bottom)
  - Updates every second with proper lifecycle management
  - Example config:
    ```yaml
    clock:
      enabled: true
      position: center-bottom
      show_time: true
      show_date: true
      format: 12h
      date_format: long
      show_background: false  # Optional: transparent with text shadow
    ```

- **Center Positioning for All Overlays**
  - Added `center-top` and `center-bottom` positions to all overlays
  - Available for: metadata, action buttons, position indicator, display entities, clock
  - Center positioning uses `transform: translateX(-50%)` for perfect centering
  - Position indicator dots moved to 4px from bottom when in center-bottom position

- **Global Overlay Opacity Control**
  - Single `overlay_opacity` setting controls ALL overlay backgrounds (default: 0.25)
  - Range: 0 (transparent) to 1 (opaque), adjustable in 0.05 increments
  - Applies to: metadata, clock, display entities, position indicator
  - When opacity ≤ 0.05, backdrop-filter disabled for true transparency
  - Allows opacity as low as 1% (0.01) for minimal visual interference
  - UI control in "Metadata" section of visual editor

- **Friendly State Names for Display Entities**
  - All Home Assistant binary sensor device classes now show user-friendly states
  - Examples: "Detected/Clear" instead of "on/off" for motion sensors
  - "Locked/Unlocked" for locks, "Open/Closed" for doors/windows
  - "Charging/Not Charging" for battery sensors, "Wet/Dry" for moisture
  - Complete mapping for all 26 standard device classes
  - Numeric values automatically rounded to 1 decimal place
  - Falls back to raw state if device class not recognized

- **Panel Thumbnail Improvements**
  - Adaptive thumbnail sizing based on content aspect ratio
  - Portrait photos (< 0.9 ratio): 7 rows, Square photos (~1.0): 6 rows, Landscape photos (> 1.33): 5 rows
  - Dynamic height calculation to fit available vertical space without overlap
  - Video thumbnails now show 🎞️ film strip icon overlay in bottom-right corner
  - Favorite badges (♥) displayed on favorited items in all panel modes
  - Thumbnails properly constrained to grid width (no horizontal overflow)
  - Improved pagination - next/previous buttons work correctly on last page

- **Photo Transitions (Kiosk Enhancement)**
  - Configurable crossfade transitions between images (0-1000ms duration)
  - Visual editor with slider control (default: 300ms)
  - Smooth opacity-based crossfade using double-buffered image layers
  - Instant mode (0ms) bypasses transition system for maximum performance
  - Smart handling: Videos bypass transitions, images crossfade seamlessly
  - Load-triggered swap ensures both images ready before crossfade begins
  - No black flashes or gaps during transitions

- **Display Entities Overlay**
  - Display entity states as overlay on media with automatic rotation
  - Configurable position (top-left, top-right, bottom-left, bottom-right)
  - Cycle through multiple entities with configurable interval (default: 10s)
  - Smooth fade transitions between entities with configurable duration
  - Optional labels for each entity
  - **Icon support** with optional icon and icon_color per entity
  - Glassmorphism styling with backdrop blur
  - **Jinja2 template conditions** to show/hide entities dynamically
  - **Dual template styling support** - JavaScript OR Jinja2 for dynamic styling
  - Recent changes tracking - prioritize entities that changed recently
  - Example config with **JavaScript templates** (synchronous):
    ```yaml
    display_entities:
      enabled: true
      position: top-right
      cycle_interval: 5
      entities:
        - entity: sensor.temperature
          label: "Temp:"
          condition: "{{ states('sensor.temperature') | float > 70 }}"
          styles:
            color: |
              [[[ 
                return stateNum > 80 ? 'red' : 
                       stateNum > 70 ? 'orange' : 'lightblue';
              ]]]
            fontWeight: |
              [[[
                return stateNum > 75 ? 'bold' : 'normal';
              ]]]
    ```
  - Example config with **Jinja2 templates** and **icons**:
    ```yaml
    display_entities:
      enabled: true
      position: bottom-left
      entities:
        - entity: binary_sensor.motion_kitchen
          icon: mdi:motion-sensor
          icon_color: red
          label: "Kitchen"
          condition: "{{ is_state('binary_sensor.motion_kitchen', 'on') }}"
          styles:
            color: "{% if is_state('binary_sensor.motion_kitchen', 'on') %}red{% else %}lightblue{% endif %}"
            fontSize: "{{ '24px' if is_state('binary_sensor.motion_kitchen', 'on') else '16px' }}"
        - entity: sensor.temperature
          icon: mdi:thermometer
          styles:
            iconColor: "{{ 'red' if states('sensor.temperature') | float > 80 else 'orange' }}"
            color: "{{ 'red' if states('sensor.temperature') | float > 80 else 'orange' if states('sensor.temperature') | float > 70 else 'lightblue' }}"
            fontWeight: "{{ 'bold' if states('sensor.temperature') | float > 75 else 'normal' }}"
    ```
  - **JavaScript template context** (synchronous evaluation):
    - `entity` - Full entity state object
    - `state` - String state value (e.g., "on"/"off")
    - `stateNum` - Parsed numeric value
  - **Jinja2 templates** (async with caching):
    - Use Home Assistant's full Jinja2 environment
    - Access to `states()`, `is_state()`, `state_attr()`, etc.
    - Results cached for performance
    - Re-evaluated when entity states change

## v5.5.0
### Fixed
- **Panel Opening Position with Fixed Card Height**
  - Panel now opens on right side (not bottom) when using fixed card height in default scaling mode
  - Override `flex-direction` to `row` when panel is open to maintain consistent side-by-side layout
  - Fixes regression where thumbnails appeared below media instead of alongside it

- **Video Thumbnail Click Pause Bug**
  - Fixed slideshow pausing when clicking video thumbnails in panel
  - Root cause: Old video's pause event firing during thumbnail navigation
  - Added `_navigatingAway` flag to `_loadPanelItem()` and `_jumpToQueuePosition()` methods
  - Prevents video pause events from triggering slideshow pause during thumbnail navigation
  - Consistent with existing `_loadNext()` and `_loadPrevious()` flag handling

- **Video Controls Display**
  - Changed default: "Video options: ..." text now hidden by default
  - Logic changed from `if (config.hide_video_controls_display)` to `if (config.hide_video_controls_display !== false)`
  - Removed "Hide Options Display" checkbox from editor UI (no longer needed)
  - Users can still set `hide_video_controls_display: false` in YAML to show text if desired

### Changed
- **Code Quality: Timer Management Refactoring**
  - Extracted duplicated timer pause/resume logic into helper methods `_pauseTimer()` and `_resumeTimer()`
  - Eliminates code duplication between `_handleCenterClick` and `_handlePauseClick` methods
  - Ensures consistent timer behavior across all pause/resume interactions
  - Makes future timer-related updates easier to maintain

### Added
- **Improved Aspect Mode UX**
  - Updated dropdown labels to better describe each mode's behavior
  - Default: "Fixed Height" 
  - Smart Scale: "Leaves Space for Metadata"
  - Viewport Fit: "Maximize Image Size"
  - Viewport Fill: "Edge-to-Edge Immersive"
  - Enhanced documentation explaining differences between modes
  - Fixed video thumbnail CSS scoping to prevent cropping in viewport-fit/viewport-fill modes

- **Burst Review Feature**
  - New "Burst Review" button to review rapid-fire photos taken at the same moment
  - Uses `media_index.get_related_files` service with burst detection mode
  - Time-based filtering (±N seconds) with optional GPS proximity matching
  - Camera burst icon (`mdi:camera-burst`) for quick identification
  - Side panel displays all photos in the burst with thumbnail navigation
  - "Play These" button to inject burst items into navigation queue
  - Favorite selections from burst review can be saved to file metadata
  - Configuration: `action_buttons.enable_burst_review`

- **Through the Years Feature**
  - New "Through the Years" button showing photos from same date across all years (anniversary mode)
  - Uses `media_index.get_random_items` service with anniversary wildcard parameters
  - Supports `anniversary_month`, `anniversary_day`, and `anniversary_window_days` parameters
  - Multiple icon (`mdi:calendar-multiple`) distinguishes from single-year related photos
  - Displays up to 100 random photos from matching dates across entire photo library
  - Results sorted chronologically by year (oldest to newest)
  - Configuration: `action_buttons.enable_on_this_day`
  - **Dynamic window control**: Dropdown in panel header to adjust date range (Exact, ±1, ±3, ±7, ±14 days)
  - Panel opens even with 0 results so user can adjust window size
  - Auto-requeries when window size changes

- **Same Date Feature**
  - New "Same Date" button showing photos from same calendar date
  - Uses `media_index.get_random_items` service with date filtering
  - Displays up to 100 random photos from the selected day
  - Calendar icon (`mdi:calendar-outline`) matches metadata styling
  - Unified paging system with burst and queue preview
  - "Play These" button to inject panel items into navigation queue
  - Configuration: `action_buttons.enable_related_photos`

- **Video Thumbnail Support**
  - Dynamic video thumbnail generation in queue preview using HTML5 video elements
  - Browser-native frame extraction at configurable timestamp (e.g., 1 second into video)
  - Video elements display the extracted frame persistently as thumbnails
  - Session-based state tracking to prevent redundant loading
  - Configuration: `video_thumbnail_time` (seconds, default: 1, supports decimals)
  - Automatic video detection via file extension (.mp4, .mov, .webm, .m4v, .ogg)
  - Smooth opacity transition as thumbnails load (50% → 100%)
  - Muted and paused at specified timestamp for optimal thumbnail display

- **Queue Preview Feature**
  - New "Queue Preview" button in action buttons (playlist icon)
  - Displays upcoming items from navigation queue in side panel
  - Page-based thumbnail navigation with Previous/Next buttons
  - Dynamic thumbnail count based on viewport height
  - Works in both sequential and random modes
  - Configuration options:
    - `action_buttons.enable_queue_preview`: Enable/disable feature
    - `action_buttons.auto_open_queue_preview`: Auto-open panel on card load (detects editor mode properly)
  - Smart paging: manually page through queue or auto-adjust when clicking thumbnails
  - Integrates with burst review: saves and restores queue panel state

- **Burst Metadata Persistence**
  - Save burst review session metadata to all files in a burst group
  - New `burst_favorites` (JSON array) and `burst_count` (integer) metadata fields
  - Metadata persists across sessions and survives file deletions
  - Enables future features: favorite indicators, burst filtering, review status tracking

### Fixed
- **Smart-Scale Aspect Mode Consistency**
  - Unified image and video sizing at 80vh in both panel states (panel-open and panel-closed)
  - Previously: panel-closed used 90vh (images and videos), panel-open used 80vh (images) and 100% (videos)
  - Changed: Reduced panel-closed max-height from 90vh to 80vh to match panel-open behavior
  - Now provides consistent ~20vh buffer space for metadata visibility in all scenarios
  - Creates clearer differentiation from viewport-fit mode (which maximizes image size)

- **Viewport-Fit and Viewport-Fill Thumbnail Cropping**
  - Fixed thumbnails showing cropped/zoomed images in viewport-fit and viewport-fill modes
  - Scoped CSS selectors to `.main-content` to prevent affecting `.thumbnail-video` elements
  - Image thumbnails: Scoped from `.card.panel-open img` to `.card.panel-open .main-content img`
  - Video thumbnails: Scoped from `video` to `.main-content video` for both modes
  - Thumbnails now correctly show full content with `object-fit: contain` in all aspect modes

- **Smart-Scale Vertical Centering**  
  - Fixed panel-open mode not centering images like panel-closed
  - Changed container from `height: 100%` to `height: auto` with matching `min-height: 50vh`
  - Images now properly center vertically in both panel states

- **Sequential Mode Carousel**
  - New file detection now runs when wrapping from end of queue back to position 1
  - Fixes issue where files arriving mid-carousel weren't shown until next full cycle
  - Example: 10-camera carousel, new file arrives at position 5 → now shown when wrapping to position 1
  - Optimal balance: checks at position 1 and wrap point (not every position)

- **Queue Preview Auto-Open in Editor**
  - Fixed queue preview opening while card editor is open, causing jarring resize
  - Now detects editor mode by walking DOM tree to find `HUI-DIALOG-EDIT-CARD` parent
  - Auto-open only happens after closing editor and loading card normally
  
- **Burst Review Improvements**
  - Favorite state restoration when re-entering reviewed burst
  - Heart icons show on thumbnails and main image for pre-favorited photos
  - Session favorites tracked separately and merged with database favorites
  - Always save metadata on panel exit (even with no favorites)

### Changed
- **Feature Naming Consistency**
  - Renamed "At This Moment" → "Burst Review" for clarity
  - Renamed "From This Day" → "Same Date" to avoid confusion with "Through the Years"
  - Renamed "On This Day" → "Through the Years" to better convey cross-year nature
  - Config labels now follow "[Feature] Button" pattern (removed "Enable" prefix from all action buttons)
  - Help text made action-oriented and context-aware (clarifies current media vs today's date)
  - Button tooltips concise (Through the Years includes dynamic date)
  - Panel title icons match action button Material Design Icons (📸=mdi:camera-burst, 📅=mdi:calendar-outline, 📆=mdi:calendar-multiple, 📋=mdi:playlist-play)
- **Backend Integration**: Simplified URI handling - `media_index` now provides `media_source_uri` in burst results
- **Favorite Detection**: Check both session state and database metadata for displaying hearts
- **Logging**: Removed excessive debug logging from folder display rendering

## v5.4.0
### Added
- **Custom Date/Time Extraction**
  - YAML-only configuration to parse dates/times from filenames and/or folder paths
  - New `custom_datetime_format` block:
    - `filename_pattern`: e.g. `YYYY-MM-DD_HH-mm-ss`, `YYYYMMDD_HHmmss`, `YYYYMMDD`
    - `folder_pattern`: e.g. `YYYY/MM/DD`
  - Supported tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`
  - Respects `debug_mode: true` and logs extraction attempts/results to console
  - Safe fallback: if custom parsing fails, card falls back to built-in filename patterns; if those fail, EXIF/Media Index is used when available
  - Precedence: folder pattern applies first (when provided and matched), then filename pattern, then built-in patterns
- **Rating/Favorite Display**
  - New `metadata.show_rating` option to display favorite (❤️) and rating (⭐1-5) indicators in metadata overlay
  - Requires Media Index integration for `is_favorited` and `rating` attributes
  - Defaults to `false` (opt-in feature)
  - Editor checkbox: "Show Rating/Favorite"

### Changed
- **Build Process**: Removed Rollup bundling path; concat build is the only supported method (preserves exact class names and avoids runtime renaming issues)
- **Architecture Cleanup**: Resolved circular dependency between `MediaProvider` and `MediaIndexHelper` by inlining the media_index active check in helper (no cross-import)
- **Theme-Aware Backgrounds**: Complete theme integration for seamless blending with Home Assistant interface:
  - Media container background uses `var(--primary-background-color)` (black in dark theme, white in light theme)
  - Metadata and position indicator backgrounds use `rgba(var(--rgb-primary-background-color), 0.60)` with `20px` blur
  - Text color changed to `var(--primary-text-color)` for proper contrast in both themes
  - Video element background set to `transparent` to inherit container theme
  - Fullscreen container respects theme settings
  - Removed text-shadow from metadata overlay (was causing blurry appearance)
  - Backgrounds now match HA menu bars and footers perfectly in all themes

### Fixed
- **Sequential Mode Video Looping Bug**
  - Added client-side date sorting safety net in `SequentialMediaIndexProvider`
  - Re-sorts items by `date_taken` with fallback to `modified_time` and `created_time`
  - Prevents videos with null/missing dates from incorrectly appearing at position 1
  - Fixes infinite loop where "security camera mode" replayed the same video
  - Defense-in-depth: card now corrects sort order even if backend has issues
- **On This Day Panel Layout**
  - Improved panel header layout with date as title, controls centered, count below
  - Better visual hierarchy for window selector and Play These button

### UX & Controls
- Action buttons and navigation zones now have consistent visibility behavior across mouse and touch:
  - Hover behavior is enabled only on mouse devices (`@media (hover: hover) and (pointer: fine)`)
  - Touch interactions (center tap/video touch) explicitly show buttons and nav zones and auto-hide after ~3s of inactivity
  - Navigation zone clicks restart the 3s auto-hide timer after navigation
- Video controls are synced with action buttons: touching the video shows controls and action buttons, both fade after ~3s
- Semi-opaque nav target areas no longer stick on touch; hover-only on mouse, explicit-only on touch
- Edit and delete buttons now scale on hover (`transform: scale(1.15)`) to match other action buttons
- Removed colored background overlays from edit/delete button hover states for consistency

### Visual Hierarchy
- Z-index tuning so overlays/buttons stay below the HA header bar when scrolling

### Scaling
- Container-query based scaling for metadata and position indicator using `cqi` units and `--ha-media-metadata-scale`
- Added card editor UI input for `metadata.scale` (range 0.3–4.0; default 1.0)

### Fixed
- **Race Condition on Panel Entry**: Fixed race condition where auto-advance could change the displayed photo between button click and panel mode entry
  - Burst and related panels now capture metadata/path snapshots at click time
  - Snapshots passed to `_enterBurstMode()` and `_enterRelatedMode()` methods
  - Ensures panels always show photos related to the exact photo that was visible when button was clicked
- **Navigation After Delete/Edit**: Fixed regression where deleting or editing a photo prevented navigating back to previous images
  - Root cause: Delete/edit handlers were removing items from old v4 `history` array instead of v5.3 `navigationQueue`
  - Solution: Updated both `_performDelete()` and `_performEdit()` to correctly remove from `navigationQueue` and adjust `navigationIndex`
  - Backward navigation now works correctly after any delete or edit operation
- **Auto-Refresh for Sequential Media Index Mode**: Fixed folder mode with media_index not auto-refreshing or responding to refresh button
  - Root cause: `SequentialMediaIndexProvider._queryOrderedFiles()` was not adding `media_content_id` to transformed items, causing `_refreshQueue()` validation to reject all items
  - Solution: Added `media_content_id: mediaId` to item transformation in `_queryOrderedFiles()` method
  - Queue refresh now correctly populates navigationQueue with valid items from media_index
  - Both auto-refresh timer and manual refresh button now work correctly in folder mode with sequential media_index provider
- **Error State Auto-Recovery**: Fixed media loading errors getting stuck without retry attempts
  - Changed misleading "Configuration Error" label to "Media Loading Error" for accuracy
  - Auto-refresh timer now detects error state and automatically clears it to retry loading
  - Errors are retried on next timer cycle (every N seconds based on `auto_refresh_seconds`)
  - Particularly helpful for intermittent network issues with security camera feeds
  - Card will continuously retry until media loads successfully

### Stability & Cleanups
- Removed temporary debug `console.log` statements added during investigation
- Internal comments updated for v5.4 context

### Other Improvements
- Metadata now refreshes alongside image changes: on manual refresh and when advancing to next/previous media, metadata (EXIF, location, dates) is re-resolved to ensure up-to-date display
- Config editor prioritizes `media_source_uri` when a Media Index entity is selected (auto-populates folder path correctly)
- Media browser defaults to `media_source_uri` when available for better URI-first workflows
- Video autoplay/muted checkboxes in editor now reflect correct defaults (`true`)
- Provider logging tightened: FolderProvider null-item warnings moved to debug logging
- Git workflow docs updated: `dev` is the active development branch

### Notes
- This release focuses on polished touch/mouse parity for controls and predictable auto-hide timing.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.3.0]

### Added
- **Dynamic Filter System**: Real-time media filtering with entity-based controls
  - Filter by favorites (`filters.favorites: true` or entity reference like `input_boolean.slideshow_favorites`)
  - Filter by date range (`filters.date_range.start` and `filters.date_range.end` with static dates or `input_datetime` entities)
  - Entity resolution supports: `input_boolean`, `input_datetime`, `input_number`, `input_text`, `input_select`, `sensor`
  - Real-time updates: Card responds immediately when filter entities change (no page reload needed)
  - Subscribes to `state_changed` events for filter entities only (efficient callback-level filtering)
  - Date filtering uses EXIF `date_taken` with fallback to file modification time via `COALESCE` in backend queries
  - Visual config editor with dedicated Filters section
  - Queue statistics events (`media_card_queue_stats`) for template sensor integration
  - Clear error messages when no items match filter criteria (no silent fallback)
  - Compatible with Media Index v1.4.0+ backend integration
- **Navigation Queue Architecture**: Complete rewrite of navigation system for better reliability and wraparound support
  - Three-layer architecture: Provider Queue → Navigation Queue → History
  - Navigation Queue is what users navigate through (populated on-demand from provider)
  - Dynamic sliding window (default 200 items based on `slideshow_window * 2`)
  - Perfect wraparound for small collections (≤200 items) - pre-loads all items at startup
  - Efficient on-demand loading for large collections with sliding window behavior
  - Position indicator shows "X of Y" when exploring, "X" when caught up
  - Backward navigation wraps to last loaded item (always works within window)
  - Forward navigation always tries provider before wrapping (discovers new items)
  - Fixes "can't go back from first image" bug in small collections
  - Provider-specific pre-load strategies:
    - Sequential mode: Calls `getNext()` with `disableAutoLoop` flag
    - Random mode: Manually transforms queue items (can't disable auto-refill)
- **Fixed Card Height**: New `card_height` configuration option (100-5000 pixels) - *Contributed by [@BasicCPPDev](https://github.com/BasicCPPDev) in [PR #37](https://github.com/markaggar/ha-media-card/pull/37)*
  - Sets exact card height instead of letting content determine size
  - Applies only in default mode (not when aspect ratio is set)
  - Takes precedence over `max_height_pixels` when both are configured
  - Media scales to fit within container while maintaining aspect ratio
  - Perfect for consistent dashboard layouts
- **Default Zoom Level**: New `default_zoom` configuration option (1-5x) - *Contributed by [@BasicCPPDev](https://github.com/BasicCPPDev) in [PR #37](https://github.com/markaggar/ha-media-card/pull/37)*
  - Images automatically load pre-zoomed to the specified level
  - Works in both single media and folder modes
  - Click image to reset zoom, works with existing zoom toggle feature
  - Useful for camera feeds or images where you want to focus on a specific area
- **Filename Date Pattern**: Added `YYYYMMDDHHmmSS` pattern (e.g., `20250920211023`) for datetime extraction from filenames without separators
- **Debug Button**: New YAML-only `debug_button` configuration for dynamic debug mode control
  - Action button to toggle debug logging on/off without page reload
  - Persists debug_mode state to card configuration (survives page reloads)
  - Uses `this.config` for config-changed event to ensure proper Lovelace persistence
  - Active state shown with warning color (orange) and filled bug icon
  - Position follows `action_buttons.position` setting
  - YAML-only configuration (not exposed in visual editor)
  - Usage: `debug_button: true` in card YAML
- **Refresh Button**: New action button to manually reload current media
  - Appears between pause and fullscreen buttons in action button group
  - Re-resolves media URL to get fresh authentication tokens (useful for Synology/Immich signed URLs)
  - Adds cache-busting timestamp to force browser to reload updated files
  - Position order: pause → refresh → fullscreen → info → favorite → edit → delete
- **Unified Auto-Refresh Configuration**: Simplified refresh/advance timing configuration
  - Removed nested `single_media.refresh_seconds` in favor of top-level `auto_refresh_seconds`
  - `auto_refresh_seconds` now available in both single media and folder modes
  - In folder mode: `auto_advance_seconds` takes priority, `auto_refresh_seconds` used as fallback
  - Enables camera snapshot reloading in folder mode without auto-advancing
- **Consolidated Overlay Positioning**: New unified "Overlay Positioning" configuration section in editor
  - Single location to configure metadata overlay position (bottom-left, bottom-right, top-left, top-right)
  - Action buttons corner position (top-right, top-left, bottom-right, bottom-left)
  - Position indicator corner placement (bottom-right, bottom-left, top-right, top-left)
  - Simplifies UI configuration with clear help text for each option
- **Video Interaction Detection**: Videos now play to completion when user interacts with them (pause, seek, or click), ignoring `video_max_duration` timeout
- **Video Defaults**: New card instances now default to `video_autoplay: true` and `video_muted: true` for better out-of-box UX
- **Adaptive Buffer Sizing**: SubfolderQueue automatically adjusts buffer requirements based on collection size
  - Small collections (< 30 files) use 50% buffer (minimum 5 items)
  - Large collections use standard buffer calculation
  - Prevents infinite scanning loops in small folders
- **Configurable Position Indicator Corner**: Position indicator ("X of Y" counter) can now be placed in any corner via `position_indicator.position` config
- **PR #37 Integration**: Integrated community contributions with enhancements - *Contributed by [@BasicCPPDev](https://github.com/BasicCPPDev)*
  - Fixed card_height validation to properly clamp values (100-5000 pixels)
  - Enhanced default_zoom with proper null checking and validation
  - Improved error handling throughout

### Fixed

- **Sequential Mode File Ordering**: Fixed files with date-based filenames appearing in wrong order
  - **Root Cause**: `extractFilename()` incorrectly parsing Immich URIs (returned "jpeg" instead of full filename)
  - **Solution**: Use `file.title` directly (provided by media source) instead of parsing complex URIs
  - **Impact**: Date extraction now works correctly for Immich, local files, and all media sources
  - **Universal Sorting**: Works with any media source that provides filename in title property
- **Sequential Mode Chronological Order**: Fixed automatic shuffle destroying sorted order in sequential mode
  - **Root Issue**: SubfolderQueue was calling `shuffleQueue()` during file addition (batch shuffle every ~100 files)
  - **Mode Detection Fix**: Mode detection used wrong config path (`this.config.mode` instead of `this.card.config.folder_mode`)
  - **Solution**: Sequential mode now correctly skips all shuffle logic to preserve sorted order
  - **Slideshow Window Compliance**: Fixed SubfolderQueue not respecting `slideshow_window` limit in sequential mode
    - Queue now stops scanning when `slideshow_window` target reached
    - Prevents unnecessary folder scanning for large collections
    - Improves performance and startup time
  - **Enhanced sorting for all media sources**:
    - Reolink: Extracts second timestamp from pipe-delimited URI for accurate video start time
    - Date-based filenames: Uses `MediaProvider.extractDateFromFilename()` for standard patterns
    - Supports: `YYYY-MM-DD`, `YYYYMMDD`, `YYYYMMDD_HHMMSS`, `MM-DD-YYYY`, and other formats
    - Alphabetical fallback: Files without dates sort by title/filename
    - Timestamps always sorted before non-dated files (prevents mixing)
  - **Recursive Folder Scanning**: Full support for deep folder hierarchies with proper sequential ordering
  - **Media Browser Integration**: Files from browse_media API correctly recognized and sorted
  - Works seamlessly with Reolink, Immich, Synology, local files, and any media source
- **Debug Button Persistence**: Fixed debug button to properly update and persist `debug_mode` config
  - Direct config update bypasses `setConfig()` defaults that were resetting the value
  - Forces re-render to update button visual state immediately
  - Debug mode now correctly persists across page reloads
- **Confirmation Dialog Layering**: Fixed delete/edit confirmation dialogs appearing behind other cards
  - Removed `isolation: isolate` CSS rule that was trapping z-index within card's stacking context
  - Increased dialog backdrop z-index to 999999 (from 10000)
  - Dialogs now properly appear above all other dashboard cards
- **Media Index Actions**: Fixed `targetPath` undefined variable bugs in delete, edit, and favorite handlers
  - All three functions now correctly use `targetUri` parameter
  - Fixes "Failed to delete/edit/favorite media" errors
- **Z-Index Layering**: Reduced z-index values for metadata overlay, position indicator, and dots indicator
  - Metadata overlay: 11 → 5
  - Position and dots indicators: 15 → 8
  - Prevents card overlays from showing through Home Assistant dialogs and popups
  - Added `isolation: isolate` to contain z-index stacking within the card
- **Folder Display Logic**: Fixed `show_root_folder` metadata option to properly show first and last folder names
  - When enabled: displays "FirstFolder...LastFolder" format for nested paths
  - When disabled: displays only the immediate parent folder name
  - Respects configured scan prefix from `folder.path` to show relative paths correctly
- **Auto-Refresh in Folder Mode**: Corrected behavior to reload current image instead of advancing to next
  - Single media mode with `auto_refresh_seconds` reloads the same image (cache-busting)
  - Folder mode distinguishes between refresh (reload current) and advance (next image)
- **Folder Display Performance**: Implemented memoization to eliminate repeated path calculations during re-renders
  - Cache invalidated automatically when media changes
  - Significant performance improvement for cards with frequent re-renders
- **Debug Logging**: Error messages now respect `debug_mode` setting and only appear when explicitly enabled
- **Console Output**: Cleaned up logging with consistent "[MediaCard]" prefix throughout
- **Navigation Queue Pre-loading**: Fixed pre-loading behavior to only apply to sequential mode
  - Random mode no longer pre-loads entire queue (prevents memory issues with large collections)
  - Sequential mode pre-loads for perfect wraparound in small collections
  - Resolves performance issues when switching between providers
- **Duplicate Detection**: Improved duplicate detection in navigation queue to prevent same file appearing multiple times
- **Error Message Display**: Card now displays error messages in UI when initialization fails
  - Provides clear feedback when configuration issues occur
  - Helps users diagnose problems without checking browser console
- **Media Index Fallback**: Removed silent fallback to SubfolderQueue when Media Index fails
  - Clear error messages when no items match filter criteria
  - Prevents confusing behavior where filters appear ignored
- **Filter Validation**: Properly validates filter results and shows error when all items excluded
- **Queue Stats Events**: Fixed sendMessage promise handling to avoid undefined errors
  - Event bus properly emits `media_card_queue_stats` events
  - History tracking cleared correctly on navigation
- **Dynamic Filter Updates**: Filter entity subscriptions properly managed
  - Card responds immediately to entity state changes
  - Efficient callback-level filtering prevents unnecessary updates
- **Debug Mode Pass-Through**: Fixed debug_mode not being passed to SubfolderQueue
  - Debug logging now works correctly in all provider modes
  - Diagnostic logs appear when debug_mode: true in configuration
- **Class Naming**: Renamed internal classes from MediaCardV5a to MediaCard for consistency
  - All log messages now use [MediaCard] prefix
  - Cleaner codebase ready for v5.3.0 release
- **Media Browser Navigation**: Fixed media browser to work with filesystem paths
  - Converts filesystem paths to `media-source://` URIs for browse_media API compatibility
  - Added "Up to Parent Folder" button for easier navigation when opening at non-root paths
  - Improved placeholder styling with better contrast between placeholder and actual input text
- **Reolink/Synology Integration**: Fixed SubfolderQueue scanning for media sources without `media_class` property
  - Reolink and Synology DSM don't always set `media_class` in browse_media responses
  - Added fallback to extension-based filtering (`.jpg`, `.mp4`, etc.) when `media_class` missing
  - Resolves "0 files found" issue in Reolink and Synology folder scans
  - Works seamlessly with any media source (Immich, Reolink, Synology, local files)

### Changed
- **Cache-Busting Timestamp Logic**: Consolidated into `_addCacheBustingTimestamp()` helper method
  - Used by both auto-refresh and manual refresh for consistency
  - Intelligently handles signed URLs (never modifies authSig signatures)
  - Adds timestamp parameter to force browser cache reload when file content changes
- **URI-Based Media Index Workflow**: Card now uses `media_source_uri` exclusively with Media Index services
  - All service calls (`mark_favorite`, `delete_media`, `mark_for_edit`, `get_file_metadata`) use `media_source_uri` parameter
  - Removed frontend path manipulation (`_convertToFilesystemPath()` method eliminated)
  - Backend (Media Index) handles all URI ↔ path conversions
  - Cleaner code architecture aligned with Home Assistant's media-source system
- Optimized hass property setter to reduce logging noise (only logs on first call)
- Video element now uses proper boolean logic for autoplay/muted attributes (`!== false` instead of `|| false`)
- Editor UI reorganized for better clarity with consolidated overlay positioning section
- Refresh timer configuration moved to "Image Options" section (always visible, not mode-dependent)

### Media Index Integration Updates (v1.4.0 recommended)

**Note**: Media Card v5.3.0 works with all Media Index versions. For full URI-based workflow support, update to Media Index v1.4.0+.

- **Complete Media-Source URI Support**: All Media Index services now support URIs throughout
  - **Folder Filtering**: `get_random_items` and `get_ordered_files` accept `media-source://` URIs for `folder` parameter
  - **Individual File Operations**: All services accept `media_source_uri` parameter as alternative to `file_path`
    - `get_file_metadata`: Accepts either `file_path` OR `media_source_uri`
    - `geocode_file`: Accepts `file_path`, `file_id`, OR `media_source_uri`
    - `mark_favorite`: Accepts either `file_path` OR `media_source_uri`
    - `delete_media`: Accepts either `file_path` OR `media_source_uri`
    - `mark_for_edit`: Accepts either `file_path` OR `media_source_uri`
  - **Response Items**: Both `get_random_items` and `get_ordered_files` return both `path` and `media_source_uri` for each item
- **Automatic URI Construction**: Media Index automatically constructs `media_source_uri` from `base_folder` if not specified
  - Format: `media-source://media_source` + `base_folder`
  - Example: `/media/Photo/PhotoLibrary` → `media-source://media_source/media/Photo/PhotoLibrary`
- **Sensor Attribute Exposure**: `media_source_uri` configuration exposed as sensor state attribute for verification
- **Full Backward Compatibility**: All services maintain complete backward compatibility with `file_path`-only usage

**When to Configure `media_source_uri` Explicitly**:

Automatic construction works for standard paths under `/media`. **You MUST configure `media_source_uri` explicitly** when using custom `media_dirs` mappings in your Home Assistant configuration:

```yaml
# configuration.yaml - Custom media_dirs example
homeassistant:
  media_dirs:
    media: /media
    camera: /config/camera
    local: /config/www/local  # Maps media-source://media_source/local to filesystem /config/www/local
```

In this case, automatic construction would produce incorrect URIs because the filesystem path differs from the media-source URI path:

```yaml
sensor:
  - platform: media_index
    name: "LocalPhotos"
    base_folder: "/config/www/local/photos"  # Filesystem path
    media_source_uri: "media-source://media_source/local/photos"  # Must specify - URI path differs!
```

**Configuration Examples**:

Standard paths (automatic construction works):
```yaml
sensor:
  - platform: media_index
    name: "PhotoLibrary"
    base_folder: "/media/Photo/PhotoLibrary"
    # media_source_uri auto-constructed: media-source://media_source/media/Photo/PhotoLibrary
```

Custom media_dirs (explicit configuration required):
```yaml
sensor:
  - platform: media_index
    name: "LocalPhotos"
    base_folder: "/config/www/local/photos"
    media_source_uri: "media-source://media_source/local/photos"  # Required - maps to custom media_dir
```

**Card Configuration** (works with both URI and path formats):
```yaml
folder:
  path: media-source://media_source/local/ai_image_notifications  # URI format
  # OR
  path: /config/www/local/ai_image_notifications  # Path format (legacy)
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_config_www_local_total_files
```

## [5.1.0] - 2025-11-15

### Added
- **Max Height Control**: New `max_height_pixels` configuration option to set custom media container height (preserves aspect ratio)
- **Non-Recursive Scanning**: Media Index backend support for `recursive` parameter in `get_random_items` service
- **File Validation**: Media Index items verified for existence before rendering

### Fixed
- **Immich Integration**: Complete compatibility with Home Assistant's Immich media source
  - Thumbnail 401 authentication errors resolved (use fullsize URLs with authSig tokens)
  - Filename extraction from pipe-delimited format (`filename.jpg|image/jpeg`)
  - Media type filtering broken by pipe suffix in filenames
  - Folder path extraction from pipe-separated structure
  - Centralized file type detection with HEIC support
- **Sequential Mode**: Fixed slideshow stopping when looping back in non-recursive mode
  - Excluded files (marked for editing/deletion) now cleared when restarting sequence
  - Loop-back now triggers correctly when small folder has fewer items than queue size
  - Slideshow continues indefinitely even after marking files for editing
- **Metadata Display**: Metadata and position counters now update in sync with image changes (no premature flash)
- **Sequential Sorting**: Files without datetime stamps appear last in both sort directions, with alphabetical sub-sorting matching the chosen direction
- **Position Indicator**: Enhanced accuracy and stability across all provider types
  - Now resets when queue shrinks significantly (handles filtering/folder changes)
  - Prevents incorrect "5 of 20" displays when only 5 items remain
- **Path Conversion**: Auto-convert filesystem paths to media-source URIs when switching between modes
  - Ensures paths always have leading slash for valid media-source:// URIs
- **Configuration Validation**: Max height pixels now clamped to valid range (100-5000) even when set via YAML
- **Code Quality**: Addressed all automated code review suggestions (recursion protection, input validation, null handling, CSS specificity, queue size tracking, path normalization)

### Changed
- Media Index `get_random_items` service now supports recursive parameter (default: true for backward compatibility)


## [5.0.0] - 2025-11-13

### 🏗️ Major Architecture Refactor

**Provider Pattern Implementation** - Complete reorganization from monolithic to modular architecture with clean separation of concerns.

#### Core Architecture Changes

**Media Provider System**
- **`SingleMediaProvider`**: Handles individual file display with auto-refresh
- **`FolderProvider`**: Manages random, latest, and sequential folder modes with optional recursion through file system scanning
- **`MediaIndexProvider`**: Database-backed selection with enhanced metadata
- **`SequentialMediaIndexProvider`**: Sequential playback with Media Index integration

**Unified Provider Interface**
- Consistent `getNextItem()` / `getPreviousItem()` API across all providers
- Standardized configuration object structure
- Shared reconnection and error handling logic
- Common state management patterns

**Code Organization**
- Refactored ~10,000 lines from single file to logical provider modules
- Separated concerns: media selection, navigation, UI, state management
- Eliminated code duplication across provider types
- Improved maintainability and testability

**Confirmation Dialogs and Template variables**: Styled confirmation dialogs for tap/hold/double-tap actions
  - Template variable support in confirmation messages
  - 11 template variables: `{{filename}}`, `{{filename_ext}}`, `{{folder}}`, `{{folder_path}}`, `{{media_path}}`, `{{date}}`, `{{date_time}}`, `{{location}}`, `{{city}}`, `{{state}}`, `{{country}}`
  - Visual editor support for `confirmation_message` field with template hints
  - Use `confirmation_message` in any action config to show styled dialog before execution

### Fixed
- **Video Autoplay**: Suppressed benign `AbortError` console warnings during rapid media navigation
  - Errors occur when play() is interrupted by navigation (harmless)
  - Real autoplay failures still logged for debugging

### ✨ New Features

#### Kiosk Mode Auto-Enable
- **Entity-Based Activation**: Automatically enter/exit kiosk mode based on entity state

#### Enhanced Thumbnails
- **Delete Confirmation**: Proper image preview in delete confirmation dialog
- **Edit Confirmation**: Show thumbnail when editing media
- **Faster Loading**: Optimized thumbnail generation and caching

#### Fullscreen Button
- **Dedicated Control**: Separate button for fullscreen viewing (not just kiosk mode)
- **Image & Video Support**: Works with both media types
- **Easy Access**: Top-right button placement for quick activation
- **Browser Fullscreen API**: Native fullscreen without kiosk mode integration

### 🔧 Technical Improvements

#### Logging System
- **Conditional Compilation**: Debug logs only active when `debug_mode: true`
- **Localhost Exception**: Automatic debug enable on `localhost` for development
- **Provider-Specific Logs**: Each provider has namespaced logging (`[MediaIndexProvider]`, etc.)
- **Silent Production**: Zero console spam in production (only card loaded + real errors)
- **Debug Queue Mode**: Visual overlay with queue statistics (`debug_queue_mode: true`)

#### Error Handling
- **Comprehensive Error States**: User-friendly messages for all failure scenarios
- **Retry Logic**: Automatic retry with exponential backoff for transient failures
- **Synology Detection**: Special handling for Synology NAS media sources
- **Graceful Degradation**: Fallback behaviors when features unavailable

#### State Management
- **Centralized State**: Single source of truth for card state
- **Provider State Isolation**: Each provider manages own internal state independently
- **History Management**: Consistent navigation history across provider switches
- **Reconnection System**: Automatic recovery from network interruptions

#### Performance Optimizations
- **Smarter Queue Management**: Reduced redundant folder scans
- **Efficient Probability Calculations**: Optimized random selection algorithms
- **Lazy Provider Initialization**: Providers only created when needed
- **Memory Management**: Proper cleanup on provider switches

### 🐛 Bug Fixes

#### Critical Fixes
- **Kiosk Cleanup Error**: Fixed `TypeError: _kioskStateSubscription is not a function`
  - Added type guards before calling subscription cleanup
  - Prevents errors when `disconnectedCallback` called before subscription exists
  
- **Custom Element Registration**: Added guards to prevent re-registration errors
  - Checks `customElements.get()` before `.define()`
  - Prevents "name already used" errors on card reload
  - Duplicate check before `window.customCards.push()`

#### Pause/Resume Timing
- **Video Pause Detection**: Improved detection of manual vs automatic pauses
- **Slideshow Timing**: Better coordination between auto-refresh and pause state
- **Resume Behavior**: Consistent resume timing after manual pause

#### Navigation
- **History Consistency**: Fixed edge cases in navigation history management
- **Boundary Handling**: Improved first/last file detection and behavior
- **Provider Switching**: Smooth navigation when changing providers

#### Reconnection
- **Media Index Reconnect**: Better detection of Media Index availability changes
- **Folder Rescan**: Improved folder refresh after network interruptions
- **State Preservation**: Maintain position/history across reconnection attempts

### 🔄 Breaking Changes

**None** - Complete backward compatibility maintained.

All v4 configurations work without modification. The v5 refactor is an internal improvement with identical external API.

### 📈 Migration Guide

**From v4 to v5**: No changes required. Drop-in replacement.

**Optional New Features**:
```yaml
# Image zoom (new in v5)
zoom_enabled: true
zoom_level: 2.0

# Fullscreen button (new in v5)
show_fullscreen_button: true

# Enhanced debug logging
debug_mode: true  # Now includes provider-specific logs
debug_queue_mode: true  # Visual queue inspector
```

### 📝 Documentation Refactor

**New Documentation Structure**:
- `docs/guides/features.md` - Comprehensive feature documentation (benefit-focused)
- `docs/guides/installation.md` - Detailed installation guide (HACS + manual)
- `docs/guides/configuration.md` - Complete configuration reference with all options
- `docs/guides/examples.md` - Real-world configurations by use case
- `docs/guides/troubleshooting.md` - Solutions to common issues

**README Improvements**:
- Rewritten as benefit-focused landing page (not release notes)
- Removed version-specific language (v5/v4 sections)
- Added quick start guide with common examples
- Links to detailed documentation files
- Professional open-source project structure

**Developer Documentation**:
- `dev-docs/v5-architecture-spec.md` - Provider pattern architecture
- `dev-docs/v5-implementation-plan.md` - Phase-by-phase development plan
- `dev-docs/phase-1a-code-map.md` - V4→V5 code reuse mapping

### 🙏 Acknowledgments

v5 refactor focused on code quality and maintainability while preserving all existing functionality. The provider pattern enables easier feature additions and better testing going forward.

## [4.1.0] - 2025-11-03

### Added - User Experience Enhancements

#### 🖥️ Kiosk Mode Integration

- **Seamless Kiosk Support**: Full integration with HACS Kiosk Mode component for professional fullscreen displays
- **Smart Exit Hints**: Visual indicator appears only when kiosk mode boolean is active, with elegant bottom-center positioning
- **Configurable Exit Gestures**: Support for tap, double_tap, hold, and swipe_down actions to exit kiosk mode
- **State-Aware Visibility**: Exit hint automatically shows/hides based on input_boolean entity state
- **Template Integration**: Uses Home Assistant template syntax for kiosk mode activation: `hide_header: '{{ is_state("input_boolean.kiosk_mode", "on") }}'`
- **Multiple Display Support**: Different boolean entities for living room, bedroom, security monitor setups
- **Automation Ready**: Time-based and motion-triggered kiosk mode activation examples

#### 🎯 Entity Picker Dropdowns

- **Smart Media Index Selection**: Dropdown selector automatically discovers and filters `sensor.media_index_*` entities
- **Input Boolean Picker**: Filtered dropdown for `input_boolean.*` entities used in kiosk mode configuration
- **Error Prevention**: Eliminates typos and configuration errors from manual entity entry
- **Real-Time Validation**: Instantly validates entity availability and state
- **Enhanced User Experience**: Point-and-click configuration instead of remembering entity names

#### 🖼️ Viewport Centering Improvements

- **Fixed Landscape Centering**: Resolved landscape image positioning issues with improved CSS flexbox layout
- **Proper Aspect Ratio**: Landscape images now center correctly in viewport-fit mode without cropping or distortion  
- **Responsive Design**: Maintains proper centering across different screen sizes and orientations
- **Performance Optimized**: Eliminates problematic absolute positioning for smoother rendering

### Enhanced - Configuration Experience

- **Visual Entity Selection**: GUI dropdowns replace error-prone text input for entity configuration
- **Comprehensive Documentation**: Complete kiosk mode setup guide with step-by-step instructions
- **Configuration Examples**: Photo slideshow and security monitor kiosk templates ready to use
- **Pro Tips Section**: Advanced automation and multi-display configuration patterns

### Technical Improvements

- **Flexbox Layout**: Modern CSS layout replaces legacy positioning for better browser compatibility
- **Template Validation**: Proper Home Assistant template syntax in documentation prevents configuration errors
- **State Management**: Improved boolean entity state tracking for reliable kiosk hint visibility

## [4.0.0] - 2025-11-01

### Added - Major Features

#### ⚡ Media Index Integration
- **Lightning-Fast Performance**: Pre-indexed database eliminates folder scanning delays for instant slideshow startup
- **Multi-Instance Support**: Target specific Media Index entities for different media collections
- **True Database Randomization**: SQL-powered random selection eliminates filesystem bias
- **Enhanced Metadata Display**: Rich metadata from Media Index database including GPS locations and EXIF dates
- **Interactive Media Controls**: Favorite, edit, and delete buttons with real-time database synchronization

#### 📍 Rich Metadata & Location Features
- **GPS Location Geocoding**: Automatic reverse geocoding displays "Paris, France" instead of coordinates
- **EXIF Date Display**: Real photo creation dates from camera metadata vs file timestamps  
- **Star Ratings Display**: Shows favorite ratings extracted from photo metadata
- **Configurable Metadata**: Toggle location, date, and rating display independently

#### ⭐ Interactive User Controls
- **Favorite Button**: Star/unstar photos with visual feedback and database persistence
- **Edit Workflow**: Mark photos for editing, then restore when editing complete
- **Safe Delete**: Move unwanted files to junk folder with confirmation dialog
- **Real-Time Updates**: All actions sync instantly with Media Index database

#### 🎲 Advanced Randomization
- **SQL Random Selection**: Database-powered randomization for true random distribution
- **Collection-Wide Scope**: Random selection across entire indexed media collection
- **Exclusion Tracking**: Prevents showing recently deleted or edited files

### Enhanced - Existing Features

#### 🔄 Lifecycle Management
- **Navigation History Persistence**: Maintains slideshow position across view changes and reconnections
- **State Synchronization**: Proper reconnection handling with queue and history restoration
- **Background Pause Management**: Smart pause/resume when switching between views or tabs

#### 🎮 User Experience Improvements  
- **Silent Error Handling**: Auto-skip deleted files without error popups (404 suppression)
- **Preview Protection**: Prevents card initialization during editing mode
- **Flexible API Support**: Compatible with both WebSocket and REST API response formats
- **Circuit Breaker Protection**: Prevents infinite loops on file access issues

### Fixed - Performance & Reliability

#### 🐛 Authentication & File Access
- **File Type Detection**: Improved media type recognition and handling
- **Metadata Synchronization**: Backend metadata used to prevent duplicate rendering

#### 🔄 Navigation & State Management  
- **Queue Refresh Preservation**: Navigation history maintained during random mode queue refreshes
- **Media Type Preferences**: Honors configured media type settings in random mode
- **Favorite Status Persistence**: Maintains favorite status when navigating between images
- **Metadata Counter Sync**: Counters stay synchronized with displayed images

### Migration Notes
- All previous features continue to work without Media Index
- No existing configuration changes required for current users
- Media Index integration is optional but provides significant performance and feature enhancements
- Install Media Index via HACS for enhanced experience

## [3.0.1] - 20250-10-26

### Bug fixes

- **Default changes**: Scan depth is unlimited by default to prevent subfolder queue from failing when there are no images in first few levels.
- **Changing Path destroys queue**: Editing the card and changing the media path destroys the existing queue so you will not so irrelevant images.
- **Background scanning**: Many checks to stop background scanning from continuing when card is not visible, particularly on the old media path.
- **New logging**: Added option to suppress subfolder queue messages for easier debugging (yaml config only - see README.md).

## [3.0.0] - 2025-10-24

### Added - Major Features

#### 📂 Hierarchical Folder Scanning System
- **Smart Queue Management**: Intelligently discovers and selects media across hundreds of folders with thousands of files
- **Progressive Content Discovery**: Shows content immediately while continuing background scanning
- **Equal Probability Mode**: Fair representation ensuring each photo has equal selection chance regardless of folder size
- **Priority Folder Patterns**: Configure specific folders (e.g., "/Camera Roll/") to receive higher selection weight (3x default)
- **Concurrent Scanning**: Multiple folders processed simultaneously for faster discovery
- **Randomized Scan Order**: Folders scanned in random order to prevent alphabetical bias in early queue population
- **Background Pause Detection**: Scanning automatically pauses when card is not visible and resumes on return
- **Queue Persistence**: Maintains queue state when card reconnects to avoid re-scanning

#### 🖼️ Rich Metadata Display System
- **Folder Information**: Shows source folder path with clean presentation
- **Filename Display**: Clean filename with authentication signature removal
- **Smart Date Extraction**: Automatic date parsing from filenames (YYYY-MM-DD, YYYYMMDD, MM-DD-YYYY, and more)
- **Flexible Positioning**: 4 corner placement options (bottom-left, bottom-right, top-left, top-right)
- **Individual Component Toggles**: Enable/disable folder, filename, or date display independently
- **Theme Integration**: Automatically adapts to Home Assistant light/dark themes

#### 🎬 Video Completion Intelligence
- **Auto-advance After Completion**: Videos advance to next item immediately when finished playing
- **Smart Wait Detection**: Handles edge cases where video duration doesn't match actual playback
- **Seamless Integration**: Works with slideshow timing to prevent premature advances

#### ⏸️ Smart Pause Management
- **Video Pause Detection**: Slideshow automatically pauses when user manually pauses a video
- **Manual Pause Control**: Click pause indicator or use keyboard shortcuts
- **Background Activity Management**: Scans and slideshow pause when card not visible
- **Resume on Return**: Automatically resumes when card becomes visible again

### Changed

- **BREAKING (Minor)**: Deprecated `subfolder_queue.queue_size` in favor of unified `slideshow_window` setting
  - Automatic migration: Existing configs migrate on load
  - `slideshow_window` serves dual purpose: hard limit (legacy) or probability target (SubfolderQueue)
  - Default value: 1000 (suitable for both modes)
- Removed `queue_size` field from UI editor
- Improved early queue diversity by randomizing subfolder scan order
- Enhanced logging and debug output for hierarchical scanning

### Fixed

- **Queue Initialization**: Fixed `isScanning` flag stuck in true state causing slideshow to never resume
- **Duplicate Media Loading**: Added `_isLoadingMedia` flag to prevent videos being immediately replaced during startup
- **Priority Patterns UI**: Fixed textarea editing issue where content would reset on each render
- **Path Change Detection**: Fixed `pathChanged` showing undefined on first load
- **Scan Termination**: Fixed premature scan stopping due to bad timeout detection
- **Equal Probability Allocation**: Fixed 0 slot allocation during early discovery phase
- Improved documentation with migration notes and updated examples

## [1.3.2] - 2025-09-23

### Fixed

- **CRITICAL**: Fixed createElement attribute error that prevented card loading in Home Assistant
- Moved setAttribute calls from constructor to connectedCallback() following Web Components best practices
- Resolved "NotSupportedError: Failed to execute 'createElement'" issue

## [1.3.1] - 2025-09-23

### Fixed

- **Video Controls Accessibility**: Navigation zones now exclude bottom 50px to allow access to video controls
- Video pause/seek/volume controls are now fully accessible when navigation zones are enabled
- Added data-media-type attribute for proper CSS targeting of images vs videos

### Changed

- Navigation zones height reduced to calc(100% - 50px) for videos
- Images maintain full-height navigation zones (no controls to interfere with)

## [1.3.0] - 2025-09-23

### Added

- **Enhanced Navigation Zones**: Improved from 3-zone to 4-zone layout (20%/25%/30%/25%)
- **Neutral Zone**: 30% width center area dedicated for tap/hold actions
- **Conflict Resolution**: Tap/hold actions no longer interfere with navigation zones

### Changed

- Navigation zone restructuring prevents conflicts between navigation and tap/hold interactions
- Better separation of interaction areas for improved user experience

### Removed

- Unnecessary back button implementation (existing behavior was correct by design)
- Cleaned up redundant media browser navigation code

## [1.2.8] - 2025-09-23

### Fixed

- **Pause/Resume Functionality**: Fixed pause showing icon but images continuing to advance
- **Timer Management**: Pause now properly stops setInterval timer, resume restarts auto-refresh
- **Editor Utility Methods**: Added missing getItemDisplayName and isMediaFile methods to MediaCardEditor
- **Media Browser**: Resolved JavaScript errors when opening media browser from editor
- **Rapid Cycling**: Fixed performance issues with scanning 975+ files causing browser lag
- **Debug Mode**: Debug mode configuration now works properly
- **Component Update Loops**: Added hasInitializedHass flag to prevent infinite update cycles

### Added

- Debug mode configuration option with proper logging controls
- Startup protection mechanisms to prevent initialization issues
- Scan overlap protection to prevent multiple simultaneous folder scans

## [1.0.22] - 2025-08-31

### Fixed
- **CRITICAL**: Removed problematic dynamic imports that were causing Home Assistant interface to become unresponsive
- Fixed media browser dialog attempting to import non-existent HA internal modules
- Removed voice assistant action option (not supported in custom cards)

### Changed
- Media browser now uses custom dialog fallback by default (more reliable)
- Removed voice assistant from interaction options in editor UI

## [1.0.21] - 2025-08-31

### Added
- Full interaction support matching Home Assistant picture card standards
- Tap action configuration (single tap/click)
- Hold action configuration (tap and hold for 0.5+ seconds)
- Double tap action configuration (quick double tap/click)
- Action types: more-info, toggle, perform-action, navigate, url, none
- Service call support with entity targeting and JSON data
- Navigation support with path specification
- External URL opening capability  
- Confirmation dialog support for destructive actions
- Visual cursor feedback when interactions are configured

## [1.0.20] - 2025-08-31

### Changed
- Borderless design for cards without titles - matches native HA picture card appearance
- Improved visual consistency when no title is configured

## [1.0.19] - 2025-08-31

### Fixed
- Video muted option now properly shows mute icon in browser controls
- Muted state preserved during auto-refresh cycles
- Enhanced video control visibility and interaction

## [1.0.18] - 2025-08-30

### Changed
- Removed version number from card display name for cleaner appearance
- Enhanced placeholder design with larger movie icon and better messaging
- Cleaned up default configuration examples

### Fixed
- Media browser dialog interaction issues resolved
- Improved theme consistency across light/dark modes

## [1.0.17] - 2025-08-30

### Added
- Auto-refresh functionality for monitoring file changes
- Manual refresh button option
- Video controls (autoplay, loop, muted)
- Smart caching with Last-Modified header checking
- Theme-consistent styling throughout

### Fixed
- Media-source URL resolution and authentication
- Media browser dialog click-through issues
- Video playback state preservation during refresh

## [1.0.0] - 2025-08-30

### Added
- Initial release
- Image and video display support
- GUI media browser for file selection
- Home Assistant theme integration
- Media validation and error handling
- Responsive design for all screen sizes
