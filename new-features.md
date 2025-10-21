# Home Assistant Media Card - New Features Since v2.0

**Current Version: v2.4.52** | **Base Version: v2.0.0**

This document tracks the major user-facing features implemented since the v2.0.0 release. The v2.0.0 release introduced the smart slideshow system as the foundation.

---

## 🚀 Major New Features

### 📂 **Hierarchical Folder Scanning System (v2.3+)**
*Revolutionary approach to handling large media collections*

**Core Capabilities:**
- **Smart Queue Management**: Intelligently discovers and processes thousands of folders
- **Progressive Content Discovery**: Shows content immediately while continuing background scanning
- **Balanced Folder Weighting**: Ensures fair representation from all folders regardless of size
- **Priority Folder Patterns**: Configure specific folders (like "Camera Roll") to receive higher priority
- **Concurrent Scanning**: Multiple folders processed simultaneously for faster discovery
- **Queue Persistence**: Maintains scan progress across navigation and page changes
- **Auto-Pause/Resume**: Scanning pauses when navigating away and resumes seamlessly when returning

**Configuration:**
```yaml
subfolder_queue:
  enabled: true
  initial_scan_limit: 20
  max_concurrent_scans: 3
  priority_folder_patterns:
    - path: "Camera Roll"
      weight_multiplier: 3.0
    - path: "Recent"
      weight_multiplier: 2.5
```

**User Benefits:**
- ✅ **Instant Content Display**: No waiting for full folder scans
- ✅ **Fair Content Distribution**: Large folders don't dominate small ones
- ✅ **Camera Roll Priority**: Recent photos get higher visibility
- ✅ **Seamless Navigation**: Queue survives page navigation and refreshes
- ✅ **Scalable Performance**: Handles thousands of folders efficiently
- ✅ **Resource Conservation**: Pauses when not visible to save system resources

---

### 🖼️ **Rich Metadata Display System (v2.2+)**
*Professional information overlay for media content*

**Metadata Components:**
- **📁 Folder Information**: Shows source folder path
- **📄 Filename Display**: Clean filename with auth signature removal
- **📅 Smart Date Extraction**: Automatic date parsing from filenames
  - `YYYY-MM-DD` format (e.g., 2024-03-15)
  - `YYYYMMDD` format (e.g., 20240315)
  - `MM-DD-YYYY` format (e.g., 03-15-2024)

**Display Options:**
- **Flexible Positioning**: 4 corner placement options
  - Bottom-left, Bottom-right
  - Top-left, Top-right
- **Individual Component Toggles**: Enable/disable folder, filename, or date display
- **Professional Styling**: Backdrop blur and fade animations
- **Smart Layout**: Pause button automatically moves when metadata is in top-right corner

**Configuration:**
```yaml
# Metadata Display
show_metadata: true
metadata_position: "bottom-left"  # bottom-left|bottom-right|top-left|top-right
show_folder: true
show_filename: true  
show_date: true
```

**User Benefits:**
- ✅ **Rich Context**: Know exactly where media files come from
- ✅ **Date Awareness**: See when photos/videos were taken
- ✅ **Clean Presentation**: Professional overlay that doesn't interfere with navigation
- ✅ **Flexible Layout**: Choose position that works best with your content

---

### ⏸️ **Video-Aware Slideshow Pausing**
*Small but important enhancement for video content*

**Feature:**
- **Smart Pause Detection**: Slideshow automatically pauses when a video is manually paused
- **Seamless Integration**: Works with existing video controls and navigation
- **User-Friendly**: Prevents videos from being skipped while paused

**User Benefits:**
- ✅ **Video Control**: Pause a video to examine it without auto-advance interruption
- ✅ **Natural Behavior**: Slideshow respects user video interactions
- ✅ **No Configuration**: Works automatically with all video content

---

## 🔧 **Configuration Examples**

### **Complete Configuration with New Features:**
```yaml
type: custom:ha-media-card
media_path: "media-source://media_source/local/"
folder_mode: "random"
auto_refresh_seconds: 30

# Hierarchical Scanning Configuration
subfolder_queue:
  enabled: true
  initial_scan_limit: 20
  max_concurrent_scans: 3
  priority_folder_patterns:
    - path: "Camera Roll"
      weight_multiplier: 3.0

# Metadata Display Configuration  
show_metadata: true
metadata_position: "bottom-left"
show_folder: true
show_filename: true
show_date: true

# Video Features
video_max_duration: 30
```

---

## 📈 **Version Evolution**

| Version | Key Features |
|---------|-------------|
| **v2.4.52** | Pause button layout fix, production-ready hierarchical scanning |
| **v2.4.49** | Hierarchical scanning pause/resume functionality |
| **v2.3+** | Hierarchical folder scanning system |
| **v2.2+** | Rich metadata display system |
| **v2.0.0** | **BASE VERSION** - Smart slideshow system foundation |

---

## 🎯 **Before vs Now Comparison**

### **Content Discovery:**
- **Before v2.0**: Basic folder scanning, poor performance with large collections
- **Now**: Intelligent hierarchical scanning with immediate display and fair distribution

### **Visual Information:**
- **Before v2.0**: Basic media display only
- **Now**: Rich metadata overlays with flexible positioning and smart date extraction

### **Video Handling:**
- **Before v2.0**: Videos could be auto-skipped even when manually paused
- **Now**: Smart pause detection respects user video interactions

### **Resource Management:**
- **Before v2.0**: Constant scanning regardless of visibility
- **Now**: Smart pause/resume conserves system resources when not visible

---

*This document highlights the three major enhancements to the Home Assistant Media Card since v2.0.0: Hierarchical Folder Scanning, Rich Metadata Display, and Video-Aware Slideshow Pausing.*