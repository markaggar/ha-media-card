# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]



## [5.0.0] - 2025-01-23

### 🏗️ Major Architecture Refactor

**Provider Pattern Implementation** - Complete reorganization from monolithic to modular architecture with clean separation of concerns.

#### Core Architecture Changes

**Media Provider System**
- **`SingleMediaProvider`**: Handles individual file display with auto-refresh
- **`FolderProvider`**: Manages random, latest, and sequential folder modes
- **`MediaIndexProvider`**: Database-backed selection with enhanced metadata
- **`SequentialMediaIndexProvider`**: Sequential playback with Media Index integration
- **`SubfolderQueue`**: Hierarchical scanning system for nested folder structures

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
