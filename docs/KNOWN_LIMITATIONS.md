# Known Limitations

## Media Index with Local Folders

**Status:** Not Supported  
**Affects:** v5.0.0+  
**Impact:** Media Index cannot be used with local folders (e.g., `/config/www/local/`)

### Problem Description

Media Card uses Home Assistant's virtual `media-source://` URIs (e.g., `media-source://media_source/local/`) to browse and display local media files. However, Media Index requires actual filesystem paths (e.g., `/config/www/local/`) for scanning and metadata storage.

This path mismatch prevents Media Index from enriching metadata for local media:
- Media Card passes: `media-source://media_source/local/photo.jpg`
- Media Index expects: `/config/www/local/photo.jpg`
- Result: No metadata match found

### Current Workaround

For local folders, use **Folder Provider with filesystem scanning** instead of Media Index:

```yaml
type: custom:media-card-v5a
media_source_type: folder
folder:
  path: media-source://media_source/local/
  mode: sequential
  recursive: true
```

Media Card will scan the folder directly and display files without Media Index metadata enrichment.

### Why Not Fix This Now?

1. **Limited Use Case**: Most local media libraries are small enough that filesystem scanning performs adequately
2. **Minimal Metadata Value**: Local folders typically lack rich EXIF/metadata that would benefit from Media Index
3. **Complexity**: Requires path translation layer or Media Index schema changes
4. **Priority**: Network shares and Synology Photos integration provide more value

### Potential Future Solutions

If user demand justifies the effort:

**Option 1: Automatic Path Translation**
- Map `media-source://media_source/local/` → `/config/www/local/`
- Map `media-source://media_source/media/` → `/media/`
- Pros: Transparent to user
- Cons: Assumes standard HA paths

**Option 2: User-Configured Path Mappings**
```yaml
media_index:
  entity_id: sensor.media_index_...
  path_mappings:
    - media_source: "media-source://media_source/local"
      filesystem: "/config/www/local"
```
- Pros: Flexible for custom mounts
- Cons: More configuration complexity

**Option 3: Media Index Native Support**
- Update Media Index to store both filesystem and `media-source://` URIs
- Pros: Most robust
- Cons: Requires integration changes

### Related Issues

- Media Index works correctly with network shares (`/mnt/...`, `/media/...`)
- Media Index works correctly with Synology Photos (planned feature)
- Only local HA folders (`/config/www/*`) are affected by this limitation

---

**Last Updated:** November 9, 2025  
**Affects Versions:** v5.0.0+

---

## Sequential Folder Mode with SubfolderQueue

**Status:** Limited Support  
**Affects:** v5.6.8+  
**Impact:** `slideshow_window` limits total files scanned in sequential filesystem mode

### Problem Description

When using **sequential mode with filesystem scanning** (i.e., `folder.mode: sequential` without Media Index), the `slideshow_window` setting constrains the total number of files discovered during the initial scan.

This means:
- If you have 500 files in your folder structure but `slideshow_window: 30`, only ~30 files will be loaded
- New files added after slideshow starts won't be detected until a page refresh
- The slideshow will loop through the limited set indefinitely

### Why This Happens

SubfolderQueue's filesystem scanning was designed for **random mode** where probability sampling limits files per folder. In sequential mode, this sampling still applies, limiting total discovery.

### Recommended Workaround

For sequential slideshows with large collections, use **Media Index** instead of filesystem scanning:

```yaml
type: custom:media-card
media_source_type: folder
media_index:
  entity_id: sensor.media_index_your_sensor
folder:
  path: /media/photos/
  mode: sequential
  use_media_index_for_discovery: true  # Uses database queries instead of filesystem
```

Media Index's `SequentialMediaIndexProvider`:
- Has no file count limits
- Properly paginates through entire collection
- Detects new files periodically
- Performs fresh queries on wrap

### Random Mode Works Fine

This limitation **only affects sequential mode**. Random mode with SubfolderQueue works correctly:
- Files are probabilistically sampled to ensure variety
- Queue refills automatically as items are shown
- New files are discovered on periodic refresh

---

**Last Updated:** January 13, 2026  
**Affects Versions:** v5.6.8+
