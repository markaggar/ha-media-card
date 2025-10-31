# Hybrid Mode Implementation Plan

## Overview
Enable simultaneous use of filesystem scanning (`subfolder_queue`) with metadata enrichment from `media_index` backend database.

## Use Cases

### 1. Security Camera Footage
- **Filesystem:** Real-time file discovery from camera upload folder
- **Media Index:** GPS location, timestamps, AI detection metadata
- **Result:** See newest footage immediately with enriched metadata

### 2. Large Photo Libraries
- **Filesystem:** Browse specific subfolders without full database
- **Media Index:** Show geocoding, ratings, EXIF data
- **Result:** Flexible browsing with rich metadata

### 3. Transient Content
- **Filesystem:** Rotating content (temp downloads, shared folders)
- **Media Index:** Metadata for known files (some may not be indexed)
- **Result:** Graceful degradation - show metadata when available

## Current Behavior (v3.1.0.56)

```javascript
// Line 2048: Mutually exclusive mode selection
if (this.config.media_index?.enabled) {
  // Use media_index for file discovery AND metadata
  this._queryMediaIndex(...)
} else if (this.config.subfolder_queue?.enabled) {
  // Use filesystem scanning only
  SubfolderQueue.getRandomItem(...)
} else {
  // Single file/entity mode
}
```

## Proposed Hybrid Mode (v3.3)

### Configuration
```yaml
type: custom:media-card

# Enable BOTH for hybrid mode:
media_index:
  enabled: true
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
  
subfolder_queue:
  enabled: true
  scan_depth: 1
  
# Behavior:
# - subfolder_queue provides file list
# - media_index enriches with metadata
# - Graceful fallback if file not in database
```

### Implementation Strategy

#### Step 1: Detect Hybrid Mode
```javascript
// Line ~2048 in setConfig
const isHybridMode = this.config.media_index?.enabled && 
                     this.config.subfolder_queue?.enabled;

if (isHybridMode) {
  this._log('🔗 HYBRID MODE: Filesystem + Metadata enrichment');
  this._hybridMode = true;
} else if (this.config.media_index?.enabled) {
  this._log('🗄️ Database mode: media_index only');
} else if (this.config.subfolder_queue?.enabled) {
  this._log('📁 Filesystem mode: subfolder_queue only');
}
```

#### Step 2: File Discovery (Filesystem)
```javascript
// Use SubfolderQueue to get random file from filesystem
const fileItem = await SubfolderQueue.getRandomItem(this.config.media_path, ...);

// fileItem structure:
// {
//   media_content_id: '/media/Photo/Security/camera1/2025-10-28_2200.jpg',
//   title: '2025-10-28_2200.jpg',
//   can_play: true
// }
```

#### Step 3: Metadata Enrichment (Database)
```javascript
// Query media_index for metadata using file path
async _enrichMetadata(fileItem) {
  if (!this._hybridMode) return fileItem;
  
  try {
    // Call media_index.get_file_metadata service
    const metadata = await this.hass.callService('media_index', 'get_file_metadata', {
      file_path: fileItem.media_content_id
    });
    
    if (metadata) {
      // Merge database metadata with filesystem item
      fileItem._metadata = {
        filename: metadata.filename,
        folder: metadata.folder,
        date_taken: metadata.date_taken,
        location_city: metadata.location_city,
        location_state: metadata.location_state,
        location_country: metadata.location_country,
        rating: metadata.rating,
        is_favorited: metadata.is_favorited,
        has_coordinates: metadata.has_coordinates,
        latitude: metadata.latitude,
        longitude: metadata.longitude
      };
      this._log(`✅ Enriched ${fileItem.title} with database metadata`);
    } else {
      this._log(`ℹ️ No metadata found for ${fileItem.title} (not in database)`);
    }
  } catch (error) {
    this._log(`⚠️ Metadata enrichment failed for ${fileItem.title}:`, error);
    // Continue without metadata - graceful degradation
  }
  
  return fileItem;
}
```

#### Step 4: Display Logic
```javascript
// Metadata overlay rendering - already supports optional fields
// Line ~359: _renderMetadataOverlay
if (this.config.metadata.show_location) {
  if (metadata.location_city || metadata.location_country) {
    // Show location if available from database
  } else {
    // Gracefully omit if not available
  }
}
```

### Backend Service (Required)

Need to add new service to `media_index`:

```python
# __init__.py
SERVICE_GET_FILE_METADATA_SCHEMA = vol.Schema({
    vol.Required("file_path"): cv.string,
})

async def handle_get_file_metadata(call):
    """Get metadata for a single file by path."""
    cache_manager = hass.data[DOMAIN][entry.entry_id]["cache_manager"]
    file_path = call.data["file_path"]
    
    metadata = await cache_manager.get_file_by_path(file_path)
    
    if not metadata:
        return {"error": "File not found in database"}
    
    # Get EXIF data if available
    exif_data = await cache_manager.get_exif_by_file_id(metadata['id'])
    
    # Merge file + EXIF data
    result = {**metadata}
    if exif_data:
        result.update({
            'date_taken': exif_data.get('date_taken'),
            'location_city': exif_data.get('location_city'),
            'location_state': exif_data.get('location_state'),
            'location_country': exif_data.get('location_country'),
            'has_coordinates': bool(exif_data.get('latitude')),
            'latitude': exif_data.get('latitude'),
            'longitude': exif_data.get('longitude')
        })
    
    return result
```

### Error Handling

```javascript
// Graceful fallback scenarios:

1. File not in database → Show filesystem file without metadata
2. Database query fails → Continue with filesystem-only mode
3. Media index sensor unavailable → Disable enrichment automatically
4. File deleted from filesystem but in DB → Skip (subfolder_queue won't return it)
5. File in filesystem but deleted from DB → Show without metadata
```

### Performance Considerations

#### Option A: Per-File Enrichment (Simple)
- Query database for each file as it's loaded
- Pro: Simple implementation
- Con: Database query per file (could be slow)

#### Option B: Batch Enrichment (Optimized)
- Get 100 files from subfolder_queue
- Query database for all 100 paths in one call
- Cache metadata for quick access
- Pro: Single database query
- Con: More complex implementation

**Recommendation:** Start with Option A, optimize to B if needed.

### Testing Scenarios

1. **Pure Filesystem:** `subfolder_queue.enabled=true`, `media_index.enabled=false`
   - Should work as before (no metadata)

2. **Pure Database:** `media_index.enabled=true`, `subfolder_queue.enabled=false`
   - Should work as before (current behavior)

3. **Hybrid - All Files Indexed:** Both enabled, all files in database
   - Should show filesystem files with full metadata

4. **Hybrid - Partial Index:** Both enabled, some files not in database
   - Should show all files, metadata where available

5. **Hybrid - Database Unavailable:** Both enabled, database offline
   - Should fall back to filesystem-only gracefully

### Migration Path

**v3.2 (Current):**
- Document mutually exclusive behavior
- Add config validation warning if both enabled

**v3.3 (Hybrid Mode):**
- Implement hybrid detection
- Add metadata enrichment
- Add backend `get_file_metadata` service
- Update documentation

**v4.0 (Simplified UI):**
- Single "mode" selector in editor
- Auto-configure appropriate settings

## Implementation Checklist

### Backend (media_index)
- [ ] Add `get_file_metadata` service in `__init__.py`
- [ ] Add service schema and registration
- [ ] Add to `services.yaml` for UI visibility
- [ ] Test service with sample file paths

### Frontend (ha-media-card)
- [ ] Add `_hybridMode` detection in `setConfig()`
- [ ] Add `_enrichMetadata()` method
- [ ] Update `_handleFolderModeRefresh()` to support hybrid
- [ ] Add graceful fallback for missing metadata
- [ ] Update editor to show hybrid mode indicator
- [ ] Add debug logging for hybrid operations

### Documentation
- [ ] Update README with hybrid mode examples
- [ ] Add configuration examples for each mode
- [ ] Document performance characteristics
- [ ] Add troubleshooting guide

### Testing
- [ ] Test pure filesystem mode (regression)
- [ ] Test pure database mode (regression)
- [ ] Test hybrid with full index
- [ ] Test hybrid with partial index
- [ ] Test graceful degradation scenarios
- [ ] Performance test with large folders

## Notes

- Hybrid mode provides "best of both worlds" flexibility
- Maintains backward compatibility with existing configs
- Enables new use cases (security cameras, mixed content)
- Sets foundation for v4.0 simplified configuration
