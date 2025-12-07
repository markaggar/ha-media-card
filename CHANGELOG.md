## v5.5.0 (In Development)
### Added
- **Video Thumbnail Support (v5.6)**
  - Dynamic video thumbnail generation in queue preview using HTML5 video elements
  - Browser-native frame extraction at configurable timestamp
  - Session-based caching for improved performance
  - Configuration: `video_thumbnail_time` (seconds, default: 1)
  - Automatic video detection via file extension
  - Fallback to video icon if thumbnail fails to load

- **Queue Preview Feature**
  - New "Queue Preview" button in action buttons (playlist icon)
  - Displays upcoming items from navigation queue in side panel
  - Page-based thumbnail navigation with Previous/Next buttons
  - Dynamic thumbnail count based on viewport height
  - Works in both sequential and random modes
  - Configuration options:
    - `action_buttons.enable_queue_preview`: Enable/disable feature
    - `action_buttons.auto_open_queue_preview`: Auto-open panel on card load
  - Smart paging: manually page through queue or auto-adjust when clicking thumbnails
  - Integrates with burst review: saves and restores queue panel state

- **Burst Metadata Persistence**
  - Save burst review session metadata to all files in a burst group
  - New `burst_favorites` (JSON array) and `burst_count` (integer) metadata fields
  - Metadata persists across sessions and survives file deletions
  - Enables future features: favorite indicators, burst filtering, review status tracking
  
- **Burst Review Improvements**
  - Favorite state restoration when re-entering reviewed burst
  - Heart icons show on thumbnails and main image for pre-favorited photos
  - Session favorites tracked separately and merged with database favorites
  - Always save metadata on panel exit (even with no favorites)

### Changed
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
