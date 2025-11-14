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
