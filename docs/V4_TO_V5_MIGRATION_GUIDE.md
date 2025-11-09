# V4 to V5 Config Migration Guide

## Overview

This document outlines the configuration differences between v4.x and v5.0 of ha-media-card and provides automatic migration rules.

---

## Key Configuration Changes

### 1. Media Source Type (New in V5)

**V5 Introduces**: `media_source_type` as the primary discriminator

**Options**:
- `single_media` - Single image/video (optionally auto-refreshing)
- `folder` - Folder-based slideshow with multiple modes

---

## Migration Rules

### Single Media Configuration

**V4 Format**:
```yaml
type: custom:ha-media-card
media_path: "media-source://media_source/local/camera_snapshot.jpg"
```

**V5 Format**:
```yaml
type: custom:ha-media-card-v5a
media_source_type: single_media
single_media:
  path: "media-source://media_source/local/camera_snapshot.jpg"
```

**Auto-Detection**: If `media_path` exists and no `folder_mode` or `media_index` configured → single_media

---

### Random Folder Mode

**V4 Format**:
```yaml
type: custom:ha-media-card
media_path: "media-source://media_source/media/Photos"
folder_mode: random
```

**V5 Format**:
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: "media-source://media_source/media/Photos"
  mode: random
```

---

### Sequential Folder Mode

**V4 Format**:
```yaml
type: custom:ha-media-card
media_path: "media-source://media_source/media/Photos"
folder_mode: sequential
sequential_config:
  order_by: filename
  order_direction: asc
```

**V5 Format**:
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: "media-source://media_source/media/Photos"
  mode: sequential
  sequential:
    order_by: filename
    order_direction: asc
```

---

### Media Index Integration

**V4 Format**:
```yaml
type: custom:ha-media-card
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
random_mode: true
priority_new_files: true
new_files_threshold_seconds: 3600
```

**V5 Format**:
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: "media-source://media_source/media/Photo/PhotoLibrary"  # Extracted from entity
  mode: random
  media_index:
    entity_id: sensor.media_index_media_photo_photolibrary_total_files
    priority_new_files: true
    new_files_threshold_seconds: 3600
```

**Note**: V5 extracts `folder.path` from media_index entity attributes (`base_folder` attribute)

---

### Subfolder Queue (Recursive Scanning)

**V4 Format**:
```yaml
type: custom:ha-media-card
media_path: "media-source://media_source/media/Photos"
subfolder_config:
  enable_subfolder_queue: true
  priority_folders:
    - pattern: "/DCIM/"
      weight: 3.0
  scan_depth: 3
```

**V5 Format**:
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: "media-source://media_source/media/Photos"
  mode: subfolder_queue
  recursive: true
  scan_depth: 3
  priority_folders:
    - pattern: "/DCIM/"
      weight: 3.0
```

---

## Common Configuration Mappings

### Display Options

| V4 Config | V5 Config | Notes |
|-----------|-----------|-------|
| `auto_advance_enabled` | `auto_advance_enabled` | No change |
| `auto_advance_seconds` | `auto_advance_seconds` | No change |
| `pause_on_interaction` | `pause_on_interaction` | No change |
| `aspect_mode` | `aspect_mode` | No change |
| `slideshow_window` | `slideshow_window` | No change |

### Video Options

| V4 Config | V5 Config | Notes |
|-----------|-----------|-------|
| `autoplay` | `video.autoplay` | Moved under `video` namespace |
| `muted` | `video.muted` | Moved under `video` namespace |
| `loop` | `video.loop` | Moved under `video` namespace |
| `controls` | `video.controls` | Moved under `video` namespace |

### Metadata Options

| V4 Config | V5 Config | Notes |
|-----------|-----------|-------|
| `show_filename` | `metadata.show_filename` | Moved under `metadata` namespace |
| `show_folder` | `metadata.show_folder` | Moved under `metadata` namespace |
| `show_date` | `metadata.show_date` | Moved under `metadata` namespace |
| `show_location` | `metadata.show_location` | Moved under `metadata` namespace |
| `metadata_position` | `metadata.position` | Renamed |

---

## Automatic Migration Implementation

### Migration Function Pseudocode

```javascript
function migrateV4toV5(v4Config) {
  const v5Config = {
    type: 'custom:ha-media-card-v5a'
  };
  
  // Detect media source type
  if (v4Config.media_index) {
    // Media Index mode
    v5Config.media_source_type = 'folder';
    v5Config.folder = {
      path: extractPathFromEntity(v4Config.media_index.entity_id),
      mode: v4Config.random_mode ? 'random' : 'sequential',
      media_index: {
        entity_id: v4Config.media_index.entity_id,
        priority_new_files: v4Config.priority_new_files,
        new_files_threshold_seconds: v4Config.new_files_threshold_seconds || 3600
      }
    };
  } else if (v4Config.subfolder_config?.enable_subfolder_queue) {
    // Subfolder Queue mode
    v5Config.media_source_type = 'folder';
    v5Config.folder = {
      path: v4Config.media_path,
      mode: 'subfolder_queue',
      recursive: true,
      scan_depth: v4Config.subfolder_config.scan_depth,
      priority_folders: v4Config.subfolder_config.priority_folders
    };
  } else if (v4Config.folder_mode) {
    // Simple folder mode
    v5Config.media_source_type = 'folder';
    v5Config.folder = {
      path: v4Config.media_path,
      mode: v4Config.folder_mode
    };
    
    if (v4Config.folder_mode === 'sequential' && v4Config.sequential_config) {
      v5Config.folder.sequential = v4Config.sequential_config;
    }
  } else if (v4Config.media_path) {
    // Single media mode
    v5Config.media_source_type = 'single_media';
    v5Config.single_media = {
      path: v4Config.media_path
    };
  }
  
  // Migrate video options
  if (v4Config.autoplay !== undefined || v4Config.muted !== undefined) {
    v5Config.video = {
      autoplay: v4Config.autoplay,
      muted: v4Config.muted,
      loop: v4Config.loop,
      controls: v4Config.controls
    };
  }
  
  // Migrate metadata options
  if (v4Config.show_filename !== undefined || v4Config.show_folder !== undefined) {
    v5Config.metadata = {
      show_filename: v4Config.show_filename,
      show_folder: v4Config.show_folder,
      show_date: v4Config.show_date,
      show_location: v4Config.show_location,
      position: v4Config.metadata_position
    };
  }
  
  // Copy unchanged options
  v5Config.auto_advance_enabled = v4Config.auto_advance_enabled;
  v5Config.auto_advance_seconds = v4Config.auto_advance_seconds;
  v5Config.pause_on_interaction = v4Config.pause_on_interaction;
  v5Config.slideshow_window = v4Config.slideshow_window;
  v5Config.aspect_mode = v4Config.aspect_mode;
  
  return v5Config;
}
```

---

## Breaking Changes

### 1. Type Name Change
- **V4**: `type: custom:ha-media-card`
- **V5**: `type: custom:ha-media-card-v5a` (during beta)
- **Future**: Will become `custom:ha-media-card` in v5.0 final

### 2. Required Config Structure
V5 requires `media_source_type` to be explicitly set (or auto-detected from legacy config)

### 3. Namespace Changes
- Video options moved under `video.*`
- Metadata options moved under `metadata.*`
- Folder options moved under `folder.*`

### 4. Renamed Options
- `metadata_position` → `metadata.position`
- `random_mode` → `folder.mode: random`
- `enable_subfolder_queue` → `folder.mode: subfolder_queue`

---

## Testing Migration

### Test Cases

1. **Single Media (V4 → V5)**
   - Input: V4 config with only `media_path`
   - Expected: V5 `single_media` type

2. **Random Folder (V4 → V5)**
   - Input: V4 config with `media_path` + `folder_mode: random`
   - Expected: V5 `folder` type with `mode: random`

3. **Media Index (V4 → V5)**
   - Input: V4 config with `media_index.entity_id`
   - Expected: V5 `folder` type with `media_index` backend

4. **Subfolder Queue (V4 → V5)**
   - Input: V4 config with `subfolder_config.enable_subfolder_queue: true`
   - Expected: V5 `folder` type with `mode: subfolder_queue`

---

## User Migration Instructions

### Option 1: Automatic Migration (Recommended)

V5 will auto-detect V4 config format and convert on first load:

1. Update to v5.0 via HACS
2. Refresh browser (Ctrl+Shift+R)
3. Open card editor
4. Click "Save" to persist migrated config
5. Check console for migration logs

### Option 2: Manual Migration

For users who want to manually update:

1. Open card in editor (edit mode)
2. Copy current configuration
3. Use migration guide above to convert
4. Paste new V5 config
5. Save and test

### Option 3: Fresh Configuration

Start from scratch with V5 GUI editor:

1. Delete existing card
2. Add new "Custom: Media Card V5a"
3. Use GUI editor to configure
4. No migration needed

---

## Migration Logging

V5 will log migration actions to console:

```
[MediaCardV5a] 🔄 Detected V4 config format - migrating to V5
[MediaCardV5a] 📋 V4 Config: { media_path: "...", folder_mode: "random" }
[MediaCardV5a] ✅ Migrated to V5 Config: { media_source_type: "folder", folder: { ... } }
[MediaCardV5a] 💾 Auto-saving migrated config
```

---

## Rollback Instructions

If migration causes issues, rollback to V4:

1. Open HACS
2. Find "Media Card"
3. Click "Redownload"
4. Select version 4.x
5. Refresh browser
6. V4 config will work as before

---

## Support

If migration fails or config doesn't work:

1. Check browser console for error messages
2. Open GitHub issue with:
   - V4 config (redact sensitive paths)
   - V5 config (what was generated)
   - Console error messages
3. Tag issue with `migration-bug`

---

## Future Plans

**v5.0 Final**: 
- Type name reverts to `custom:ha-media-card`
- V4 configs auto-migrate silently
- No user action required

**v5.1**:
- Migration warnings removed (assumed complete)
- V4 format detection deprecated
- All users expected on V5 format
