# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
