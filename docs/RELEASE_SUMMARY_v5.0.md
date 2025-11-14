# Media Card v5.0 - Quick Release Summary

## 🎉 Complete Architecture Rebuild

Media Card v5.0 is a ground-up rewrite delivering improved stability, maintainability, and powerful new features while remaining 100% backward compatible with v4 configurations.

## 🏗️ Unified Provider Architecture

**Key Innovation:** Replaced monolithic code with clean provider pattern

- **SingleMediaProvider** - Individual file display with auto-refresh
- **FolderProvider** - Random/sequential/latest folder modes
- **MediaIndexProvider** - Database-backed selection with rich metadata  
- **SequentialMediaIndexProvider** - Ordered Media Index playback

**Benefits:** Consistent behavior, single queue system, easier extensibility, organized codebase (10K+ lines)

## 🚀 Major Features

### Media Index Integration (v1.3)

✨ **Priority Mode** - Favor recently added photos (70/30 weighted)  
📊 **Sequential Playback** - Ordered slideshows with pagination  
🏷️ **Rich Metadata** - EXIF, camera settings, GPS, ratings display

### Subfolder Support

📁 **Hierarchical Scanning** - Auto-discover nested folders  
🎲 **Fair Distribution** - Random selection across entire tree  
🗂️ **Visual Navigation** - Breadcrumb path indicators

### Enhanced Navigation

⏮️ **History Support** - Navigate backward through viewed items  
🔀 **Random Memory** - Return without re-randomizing  
⌨️ **Full Control** - Keyboard shortcuts and gestures

## 🔧 Technical Wins

- Single provider instance (no race conditions)
- Robust reconnection logic
- Efficient queue pre-loading
- Better error handling
- Reduced network requests
- Comprehensive documentation

## 📝 Migration

**Zero Breaking Changes!** All v4 YAML configs work immediately. New features activate automatically.

## 🎯 Quick Start Examples

**Random with Subfolders:**

```yaml
type: custom:ha-media-card
media_source: folder
folder_path: /media/photo/Photos
subfolder_mode: random
```

**"What's New" Priority:**

```yaml
type: custom:ha-media-card
media_source: media_index
entity: sensor.media_index_photos_total_files
media_index_priority_new_files: true
```

**Sequential Playback:**

```yaml
type: custom:ha-media-card
media_source: media_index
entity: sensor.media_index_photos_total_files
mode: sequential
media_index_order_by: date_taken
```

---

**Full Documentation:** [RELEASE_NOTES_v5.0.md](RELEASE_NOTES_v5.0.md) | [README.md](../README.md)
