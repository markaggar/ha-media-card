# Release Notes - v5.0.0

**Release Date:** 2025-11-13  
**Branch:** feature/v5-rebuild  
**Status:** In Development

## 🎯 Release Overview

v5.0 represents a major architectural refactor of HA Media Card, introducing a clean provider pattern for extensibility while maintaining 100% backward compatibility with v4 configurations. This release focuses on code organization, maintainability, and laying the foundation for future features like Synology Photos integration.

## 🏗️ Architecture Changes

### Provider Pattern Introduction

Complete refactor from monolithic code to modular provider architecture:

- **SingleMediaProvider**: Single image/video display with optional auto-refresh
- **FolderProvider**: Filesystem-based media scanning (sequential/random modes)
- **MediaIndexProvider**: Database-driven random media with rich metadata
- **Future**: SimpleFolderProvider, SubfolderProvider (planned), SynologyPhotosProvider (roadmap)

**Benefits:**
- Clean separation of concerns
- Easier to test and debug
- Foundation for new media sources
- Reduced code duplication

### Configuration Model Updates

New hierarchical configuration structure:

```yaml
# v5 Structure (recommended)
type: custom:media-card-v5a
media_source_type: folder  # or single_media, media_index

folder:
  path: media-source://media_source/local/
  mode: sequential
  recursive: true
  order_by: date_taken
  sequential:
    order_direction: desc

single_media:
  path: media-source://media_source/camera/snapshot.jpg
  auto_refresh: true
  refresh_interval: 5

media_index:
  entity_id: sensor.media_index_photos
  random_mode: true
  priority_new_files: true
```

**Backward Compatibility:** All v4 configurations continue to work unchanged. The card automatically adapts legacy config to the new structure.

## 🐛 Critical Bug Fixes

### Sequential Mode Recursive Scanning
**Issue:** Recursive folder scanning only scanned base folder, not subfolders  
**Cause:** `maxDepth` parameter not passed to `hierarchicalScanAndPopulate()`  
**Fix:** Properly pass scan depth configuration for recursive scanning  
**Impact:** Sequential mode now correctly scans all subfolders

### Queue Management in Sequential Mode
**Issue:** Same file (newest by date) repeated every 2-3 images instead of cycling through all files  
**Cause:** Two separate problems:
1. `shownItems` cleared too early, allowing just-shown files to be immediately re-added
2. Queue re-sorted after refill, causing newest file to bubble to front repeatedly

**Fixes:**
1. Clear `shownItems` AFTER collecting available files, not before
2. Pre-sort new files before appending to queue (don't re-sort entire queue)

**Impact:** Files now cycle through properly in sequential order

### Debug UI Options Removed
**Issue:** Config UI showed non-functional debug checkboxes (handlers never implemented)  
**Fix:** Removed developer options from UI, preserved YAML config support for debugging  
**Impact:** Cleaner config UI for regular users

## ✨ New Features

### Time Display in Metadata
- Shows current time with seconds precision
- Optional toggle in metadata settings
- Clock icon (🕐) indicator
- Uses `toLocaleTimeString()` for proper formatting

### Enhanced Logging
- Detailed queue operation logs for debugging
- Subfolder discovery tracking
- Refill operation visibility
- Can be disabled via `suppress_subfolder_logging`

## 📋 Known Limitations

### Media Index with Local Folders (v5.0.0+)

**Issue:** Media Index cannot enrich metadata for local HA folders (e.g., `/config/www/local/`)

**Reason:** Path format mismatch:
- Media Card uses: `media-source://media_source/local/photo.jpg`
- Media Index expects: `/config/www/local/photo.jpg`

**Workaround:** Use folder-based scanning for local content:
```yaml
media_source_type: folder
folder:
  path: media-source://media_source/local/
  mode: sequential
  recursive: true
```

**Why Not Fixed:**
- Most local media libraries are small enough that filesystem scanning performs adequately
- Local folders typically lack rich EXIF metadata that would benefit from Media Index
- Network shares (`/mnt/...`, `/media/...`) work correctly with Media Index
- Limited user demand for this specific use case

**Future:** May add path translation layer if user demand justifies the effort. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for potential solutions.

## 🔄 Migration Guide

### From v4.x to v5.0

**No action required!** v5.0 is 100% backward compatible. Your existing v4 configuration will continue to work exactly as before.

**Optional:** Modernize your configuration to v5 structure for better clarity:

#### Before (v4 - still works):
```yaml
type: custom:media-card
media_path: media-source://media_source/local/
folder_mode: sequential
subfolder_queue:
  enabled: true
  scan_depth: 5
```

#### After (v5 - recommended):
```yaml
type: custom:media-card-v5a
media_source_type: folder
folder:
  path: media-source://media_source/local/
  mode: sequential
  recursive: true
  scan_depth: 5
```

## 🧪 Testing Notes

### Test Coverage
- Sequential mode with recursive scanning (8 files across 2 folders)
- Queue refill behavior (verified proper cycling)
- Media Index metadata enrichment (network shares)
- Backward compatibility with v4 config

### Verified Environments
- HADev (10.0.0.62) - Development testing
- Home Assistant 2025.x

## 📚 Documentation Updates

- Added `docs/KNOWN_LIMITATIONS.md` for detailed limitation explanations
- Updated README.md with Media Index local folder limitation
- Enhanced inline code comments for provider pattern
- Updated `.github/copilot-instructions.md` with v5 architecture

## 🎯 Roadmap Items

### Post-v5.0 Features
- Entity state overlay display
- Image preview thumbnails for navigation
- Synology Photos integration
- Path translation layer for local folders (if demand warrants)

## 🙏 Acknowledgments

100% developed in VS Code using GitHub Copilot with Claude Sonnet 4.0/4.5.

Special thanks to the Home Assistant community for feature requests and bug reports that shaped this release.

---

**Full Changelog:** [v4.1.0...v5.0.0](https://github.com/markaggar/ha-media-card/compare/v4.1.0...v5.0.0)
