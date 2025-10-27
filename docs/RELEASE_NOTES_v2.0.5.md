# HA Media Card v2.0.5 Release Notes

## 🚨 **Critical Memory Leak Fixes**

**URGENT UPDATE**: This release fixes severe memory leaks that could cause Home Assistant memory exhaustion and system unresponsiveness.

### Memory Leak Fixes
- **🔴 Media Browser Dialog Leak**: Fixed keydown event listener accumulation (not removed on dialog close)
- **🔴 Thumbnail Timeout Leak**: Fixed 5-second setTimeout accumulation in thumbnail loading
- **📊 Impact**: Prevents progressive memory growth, especially with large media collections (1000+ items)

**Recommendation**: Update immediately if using media browser with large collections (Synology, local media folders).

---

## 🚀 **What's New in v2.0**

### 🎯 **Smart Slideshow System**
- **Three slideshow behaviors**: `static`, `cycle`, and `smart_slideshow` modes
- **New Content Prioritization**: Automatically interrupts slideshow to show new arrivals
- **Intelligent Timing**: Context-aware advancement that respects content type
- **Performance Protection**: Configurable slideshow window (default: 1000 files)

### 🎬 **Video Completion Intelligence** 
- **Auto-advance after completion**: Videos advance immediately when finished
- **Smart wait detection**: Automatic handling of video duration vs refresh intervals
- **Background playback optimization**: Pauses processing when tab is inactive

### 🎮 **Precision Navigation Controls**
- **Focused click areas**: Small rectangular zones around actual buttons
- **Top-right pause control**: Dedicated corner area for pause/resume
- **Video-aware zones**: Navigation areas avoid video controls automatically
- **Center action preservation**: Main area reserved for tap/hold actions

### ⚡ **Performance Optimizations**
- **Background activity management**: Pauses updates when not visible
- **Large folder optimization**: Handles 1000+ file folders efficiently
- **Smart caching**: Reduced API calls with intelligent content detection
- **Enhanced Synology support**: Improved video detection and authentication

### 🖼️ **Smart Thumbnail Support**
- **Real Image Previews**: 60x60px thumbnails for images with fallback handling
- **Enhanced Video Icons**: Styled video thumbnails with "VIDEO" labels  
- **Multi-source Compatibility**: Works with Synology DSM, Home Assistant local media, and other sources
- **Smart Detection**: Automatic file type detection from both title and media content ID

### 🔍 **Image Zoom Functionality**
- **Click/Touch to Zoom**: Zoom into clicked/tapped point on images (2x default, configurable 1.5x-5.0x)
- **Smart Reset**: Second click/tap resets to normal view
- **Image-Only**: Videos remain unaffected
- **Safe Implementation**: No pan/drag, minimal CSS transforms for stability

### 📁 **Enhanced Media Browser**
- **Visual File Selection**: No more typing file paths
- **Thumbnail Previews**: See actual images before selection
- **Improved Navigation**: Intuitive folder browsing with back/forward
- **Performance Optimized**: Handles large folders efficiently with limited debug logging

---

## 🔧 **Technical Improvements**

### Performance & Stability
- **Memory Management**: Proper cleanup of all temporary resources and event listeners
- **Debug Logging**: Limited console output (first 5 items only) to prevent spam
- **Error Handling**: Enhanced fallback mechanisms for thumbnail loading failures
- **Background Processing**: Smart pause/resume for invisible cards

### Code Quality
- **Event Listener Cleanup**: All temporary listeners properly removed
- **Timeout Management**: All setTimeout calls tracked and cleared appropriately  
- **Resource Disposal**: Proper cleanup of media elements and containers
- **Observer Management**: IntersectionObserver properly disconnected on component removal

---

## 🛠️ **Configuration Options**

### New YAML Configuration
```yaml
type: custom:media-card
title: "Photo Viewer"
media_type: image
media_path: media-source://media_source/local/photos/
# New zoom options
enable_image_zoom: true
zoom_level: 2.0  # optional (1.5-5.0)
```

### GUI Editor Enhancements
- **Zoom Configuration**: Enable/disable zoom with level selection
- **Media Browser**: Visual file picker with thumbnail previews
- **Folder Options**: Easy folder mode selection

---

## 🔄 **Upgrade Instructions**

1. **Update the card file** in `/config/www/cards/` or via HACS
2. **Clear browser cache** (Ctrl+F5 or restart HA app)
3. **Restart Home Assistant** to clear any accumulated memory from previous version
4. **Test media browser** with your media sources to verify thumbnail functionality

---

## 🎯 **Who Should Update**

**Priority Users:**
- ✅ **Synology DSM users** with large photo collections
- ✅ **Local media users** with 100+ files
- ✅ **Heavy media browser users** who experienced HA slowdowns
- ✅ **Anyone experiencing memory issues** after using the card

**All Users:**
- ✅ **Enhanced experience** with thumbnails and zoom functionality
- ✅ **Better performance** with memory leak fixes
- ✅ **Improved usability** with visual media selection

---

## 🐛 **Bug Fixes**

- **Fixed media browser dialog not removing keydown event listeners** (Critical memory leak)
- **Fixed thumbnail timeout accumulation causing memory bloat** (Critical memory leak)
- **Fixed file extension detection for Synology shared space items**
- **Fixed debug logging spam with large media collections**
- **Enhanced error handling for thumbnail loading failures**
- **Fixed slideshow behavior inconsistencies** 
- **Fixed video completion detection timing issues**
- **Fixed navigation zone overlap with video controls**
- **Fixed background activity detection edge cases**

---

## 📊 **Compatibility**

- **Home Assistant**: 2023.x and newer
- **Media Sources**: Local files, Synology DSM, media_source integrations
- **Browsers**: Chrome, Firefox, Safari, HA mobile app
- **File Types**: JPG, PNG, GIF, WebP, MP4, WebM, OGG, and more

---

*This release represents significant stability and usability improvements. The memory leak fixes are critical for users with large media collections.*