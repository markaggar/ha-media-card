# Release Notes: v5.1.0

## Immich Integration Compatibility

**Complete Immich Support** - Full compatibility with Home Assistant's Immich media source integration.

### Fixes
- **Thumbnail Authentication**: Resolved 401 errors when browsing Immich albums - thumbnails now load using authenticated fullsize URLs
- **Pipe-Delimited Format**: Fixed filename extraction from Immich's `filename.jpg|image/jpeg` format
- **Media Type Filtering**: Fixed `media_type: image` returning 0 files due to pipe suffix in filenames
- **Path Normalization**: Corrected folder path extraction to handle Immich's pipe-separated path structure
- **Extension Detection**: Added centralized file type detection with Immich pipe-stripping and HEIC support

## Media Index Backend Integration

**Non-Recursive Scanning** - Added recursive parameter support to `media_index.get_random_items` service for precise folder filtering.

### Enhancements
- Non-recursive mode excludes subfolders (exact folder match only)
- Recursive mode includes all subfolders (backward compatible default)
- Feature parity with `get_ordered_items` service
- Frontend passes recursive setting from card config

## Display & Configuration

**Height Control** - Added `max_height_pixels` configuration option for custom media container height.

### Improvements
- Override aspect mode with pixel-based height limit
- Preserves aspect ratio while constraining vertical space
- Visual editor support with inline help text

## Sequential Mode Enhancements

**Improved Sorting** - Better handling of mixed file collections (dated and non-dated files).

### Fixes
- Files without datetime stamps appear last in both ascending and descending order
- Two-pass sorting ensures consistent ordering
- Sort direction properly applied to non-dated files

## Quality & Stability

**Media Validation** - Files verified for existence before rendering (prevents broken media display).

**Position Indicator** - Improved accuracy and stability in sequential mode progress display.

**Path Conversion** - Auto-convert filesystem paths to media-source URIs when switching between modes.

---

**Full Changelog**: [v5.0.1...v5.1.0](https://github.com/markaggar/ha-media-card/compare/v5.0.1...v5.1.0)
