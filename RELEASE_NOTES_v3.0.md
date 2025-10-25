# Home Assistant Media Card v3.0 🎉

Transform your photo and video collection into a beautiful, dynamic slideshow experience in Home Assistant.

## ✨ What's New

### 🌲 Smart Hierarchical Scanning
Your media card now intelligently scans deep folder structures, discovering photos and videos across hundreds of subdirectories. Perfect for large collections organized by year, event, or person.

**Why you'll love it:** No more seeing the same folder's images repeatedly. Get true variety from your entire collection without manual configuration.

### 🎬 Seamless Video Integration
Videos now play to completion before advancing, with proper pause/resume support. Mix photos and videos naturally in your slideshow.

**Why you'll love it:** Videos are first-class citizens now. No more jarring interruptions or skipped content.

### 📊 Beautiful Metadata Display
See exactly what's playing with elegant overlays showing filename, folder, and date information. Customize visibility and positioning to your preference.

**Why you'll love it:** Rediscover forgotten memories and know exactly where your photos came from.

### 🎯 Priority Folder Patterns
Mark your favorite folders (e.g., "Family", "Vacation") to appear 3x more often in the slideshow rotation.

**Why you'll love it:** See your best content more frequently while still enjoying variety from your full collection.

### 🎲 Enhanced Random Mode
True randomization with smart history tracking. Navigate backward and forward through previously shown media, with duplicate prevention.

**Why you'll love it:** Feels like a well-curated playlist, not a chaotic shuffle.

### ⏸️ Smart Pause System
Pause with a single click. Automatically pauses when you manually control videos. Visual indicators show pause state clearly.

**Why you'll love it:** Full control when you need it, smooth automation when you don't.

### 🖱️ Improved Navigation
Larger, easier-to-click navigation zones that work perfectly whether your photos are portrait or landscape.

**Why you'll love it:** No more hunting for tiny buttons when the image orientation changes.

## 🔧 Configuration Improvements

### Unified Settings
- **`slideshow_window`** replaces the old `queue_size` setting (automatic migration)
- Simplified configuration with sensible defaults
- Better documentation and examples

### Performance Tuning
- Optimized scanning for large collections (25,000+ photos tested)
- Concurrent folder processing for faster initialization
- Smart timeout protection prevents hanging on slow network shares

## 📦 Installation

### HACS (Recommended)
```yaml
# In your Lovelace dashboard:
type: custom:ha-media-card
media_path: /media/local/Photos
folder_mode: random
slideshow_window: 1000
estimated_total_photos: 5000
auto_refresh_seconds: 5
```

### Manual
1. Download `ha-media-card.js`
2. Copy to `/config/www/cards/`
3. Add resource in Lovelace

## ⚙️ Key Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `slideshow_window` | 1000 | Target number of items to randomize across |
| `estimated_total_photos` | 1000 | Approximate collection size (helps probability) |
| `scan_depth` | 5 | How deep to scan subdirectories |
| `auto_refresh_seconds` | 10 | Seconds between slideshow changes |
| `video_max_duration` | 30 | Maximum video playback time |
| `priority_folder_patterns` | `[]` | Folders to show 3x more often |

## 🆙 Upgrading from v2.x

Just update the file! Your existing configuration will work, with automatic migration of `queue_size` to `slideshow_window`.

**Note:** First scan of large collections may take 30-60 seconds. Subsequent loads are instant.

## 🙏 Made For

Photo lovers with large, organized collections who want a beautiful, hands-off slideshow experience that shows the right mix of everything.

---

**Full changelog:** See [CHANGELOG.md](CHANGELOG.md) for detailed technical changes.
