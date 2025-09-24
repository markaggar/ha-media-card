# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
