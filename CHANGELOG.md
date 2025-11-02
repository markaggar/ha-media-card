# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
