# HA Media Card v2.0.5 - Major v2.0 Release + Critical Fixes

## 🚨 **CRITICAL UPDATE** - Memory Leak Fixes
Fixed severe memory leaks causing Home Assistant memory exhaustion:
- Media browser dialog event listener accumulation
- Thumbnail timeout buildup with large collections (1000+ items)

**⚠️ Update immediately if using media browser with Synology or large local media folders.**

## 🚀 **Major v2.0 Features**
- **Smart Slideshow System**: 3 modes (static, cycle, smart_slideshow) with content prioritization
- **Video Completion Intelligence**: Auto-advance after video completion with smart timing
- **Precision Navigation**: Focused click areas, video-aware zones, pause controls
- **Performance Optimizations**: Large folder support (1000+ files), background activity management
- **Smart Thumbnails**: Real 60x60px image previews in media browser
- **Image Zoom**: Click/touch to zoom images (configurable 1.5x-5.0x)
- **Enhanced Media Browser**: Visual file selection with thumbnail previews

## 🔧 **Key Improvements**
- Enhanced Synology DSM support with improved authentication
- Background processing pauses when not visible
- Smart caching reduces API calls
- Proper resource cleanup prevents memory accumulation
- Debug logging optimized for large collections

## 📥 **Installation**
1. Update via HACS or manually replace card file
2. Clear browser cache (Ctrl+F5)
3. Restart Home Assistant to clear any accumulated memory

**Major upgrade with comprehensive slideshow, video, and navigation improvements plus critical stability fixes.**