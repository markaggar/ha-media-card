![Version](https://img.shields.io/github/v/release/markaggar/ha-media-card?style=for-the-badge)
[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/frontend)

# HA Media Card 🎬

A powerful custom Home Assistant Dashboard card that displays images and videos with **smart slideshow behavior**, **hierarchical folder scanning**, **rich metadata displays**, and **intelligent content prioritization**. Features include **multi-level folder management**, **precision navigation controls**, **video completion detection**, and a **built-in media browser** for easy file selection. Perfect for displaying security camera snapshots, family photos, or any media files from your Home Assistant media folders with enterprise-grade performance optimization. 100% developed in VS Code using GitHub Copilot with Claude Sonnet 4.0/4.5.

<img width="691" height="925" alt="image" src="https://github.com/user-attachments/assets/a64889ed-f0cc-4a86-bbe9-4714a787bf48" />

## 🚀 What's New in v4.0 - Media Index Integration

### ⚡ **Lightning-Fast Performance** 
*(Requires Media Index)*
No more waiting for folder scans! The [Media Index integration](https://github.com/markaggar/ha-media-index) pre-indexes your entire media collection for instant slideshow startup.

### 📍 **Rich Metadata Display**
*(Requires Media Index)*
- **GPS Locations**: Automatic geocoding shows where photos were taken ("Paris, France" vs coordinates)
- **Real Photo Dates**: EXIF creation dates from camera metadata, not file timestamps
- **Star Ratings**: Display favorite ratings extracted from photo metadata

### ⭐ **Interactive Media Controls** 
*(Requires Media Index)*
- **Favorite Button**: Star/unstar photos with visual feedback
- **Edit Workflow**: Mark photos for editing (moves to _Edit folder), then restore the files to their original locations when done editing with the Media Index restore service.
- **Safe Delete**: Move unwanted files to junk folder with confirmation

### 🎲 **True Database Randomization**
*(Requires Media Index)*
SQL-powered random selection eliminates filesystem bias for genuinely random slideshows across your entire collection.

### 📂 **About Media Index Integration**
The [Media Index](https://github.com/markaggar/ha-media-index) is a separate Home Assistant integration that:
- Scans and indexes your media files with metadata extraction
- Provides real-time file monitoring and geocoding services  
- Supports multiple media libraries with independent configuration

> **💡 Backwards Compatible**: All previous features continue to work without Media Index! The integration adds powerful enhancements but isn't required.

## 🔄 **Core Features** 

### 📂 **Hierarchical Folder Scanning**
Automatically discovers and displays photos/videos from your entire folder structure. Shows content immediately while intelligently scanning thousands of files across hundreds of folders in the background. Optional priority patterns let you feature specific folders like "Camera Roll" or "Favorites".

### 🖼️ **Rich Metadata Display**
See what you're viewing with automatic folder path, filename, and date information. Fully customizable positioning and toggle individual elements on/off.

### ⏸️ **Smart Pause & Background Management**
Slideshow automatically pauses when you pause a video, navigate away, or switch tabs. Resumes right where you left off when you return.

### 🎬 **Video Completion Detection**
Videos automatically advance to the next item when finished playing—no more waiting for the refresh timer.

### 🎯 **Flexible Slideshow Modes**
- **Show Latest**: Always display your most recent photo/video
- **Show Random**: Randomized slideshow from a single folder or entire hierarchy
- **Static**: Display a single file

### 🎮 **Interactive Navigation**
Click left/right sides to browse, center-top to pause, or use keyboard arrows. Full manual control alongside automatic slideshow.

### 📁 **Visual Media Browser**
Point-and-click file and folder selection with real image thumbnails. No more typing paths!

### 🔍 **Image Zoom**
Click/tap any image to zoom in on that spot. Click again to reset.

### 🎬 **Complete Video Support**
MP4, WebM, OGG with full HTML5 controls. Configurable autoplay, loop, and mute options.

### 👆 **Custom Actions**
Configure tap, hold, and double-tap actions for navigation, toggles, or any Home Assistant service.

## 📥 Installation

### Install via HACS

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=markaggar&repository=ha-media-card&category=frontend)

### Manual Installation

1. **Download the card file**:
   Download the zip file or copy the contents of the ha-media-card.js from the repo

2. **Copy to your Home Assistant**:
   - Place (or create) `ha-media-card.js` in `/config/www/` or `/config/www/cards/` (and copy the repo ha-media-card.js contents to the file you just created)

3. **Add to Dashboard resources**:
   - Go to **Settings** → **Dashboards** → **Resources**
   - Click **Add Resource**
   - **URL**: `/local/ha-media-card.js?v1xxx` (or `/local/cards/ha-media-card.js?vxxx`) (if you download a new version of media card in the future, increment the version number)
   - **Resource Type**: `JavaScript Module`
   - Click **Create**
  
4. **Refresh your browser cache (e.g. CTRL-F5, or restart the Home Assistant app on your phone).**

5. **Add the card to your dashboard**:
   - Edit your dashboard
   - Click **Add Card**
   - Search for Media Card

## 🚀 Quick Start

YAML Configuration (but use the UI, it's way simpler, and then you can show code and copy the YAML).

```yaml
type: custom:media-card
title: "Security Camera"
media_type: image
media_path: media-source://media_source/local/cameras/front_door.jpg
```
## ⚙️ Configuration Options

### Basic Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | **Required** | `custom:media-card` |
| `title` | string | `none` | Display title above media |
| `media_type` | string | `image` | `image`, `video`, or `all` |
| `media_path` | string | **Required** | Path to your media file or folder |
| `aspect_mode` | string | `default` | `default`, `smart-scale`, `viewport-fit`, or `viewport-fill` |
| `auto_refresh_seconds` | number | `0` | Auto-refresh interval (0 = disabled) |
| `show_refresh_button` | boolean | `false` | Show manual refresh button |

### Media Index Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `media_index` | object | `none` | Enable Media Index integration for enhanced features |
| `media_index.entity_id` | string | **Required** | Media Index sensor entity (e.g., `sensor.media_index_photos_total_files`) |
| `media_index.show_favorite_button` | boolean | `true` | Show favorite/star button on images |
| `media_index.show_edit_button` | boolean | `true` | Show edit workflow button |
| `media_index.show_delete_button` | boolean | `true` | Show safe delete button |
| `media_index.show_location` | boolean | `true` | Display geocoded location names |
| `media_index.show_date_taken` | boolean | `true` | Show EXIF creation date vs file date |

### Folder Mode Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `folder_mode` | string | `none` | `latest`, `random`, or `none` for single file |
| `random_count` | number | `1` | Number of random files to cycle through |
| `slideshow_behavior` | string | `static` | `static`, `cycle`, or `smart_slideshow` - Controls slideshow advancement behavior |
| `slideshow_window` | number | `1000` | Number of files to include in slideshow (performance protection) |

### Hierarchical Scanning Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `subfolder_queue.enabled` | boolean | `false` | Enable hierarchical folder scanning for large collections |
| `subfolder_queue.scan_depth` | number | `2` | How many folder levels to scan (1-5). Higher values = more subfolders discovered |
| `subfolder_queue.estimated_total_photos` | number | `null` | User estimate for total photos (critical for consistent probability calculations across folders) |
| `subfolder_queue.equal_probability_mode` | boolean | `false` | Give each photo equal selection chance regardless of folder size |
| `subfolder_queue.use_hierarchical_scan` | boolean | `true` | Use modern hierarchical scan (recommended). Set to `false` for legacy streaming mode |
| `subfolder_queue.priority_folder_patterns` | array | `[]` | List of folder patterns to prioritize with higher selection weight |
| `subfolder_queue.priority_folder_patterns[].path` | string | - | Folder path pattern to match (e.g., "/Camera Roll/", "/Favorites/") |
| `subfolder_queue.priority_folder_patterns[].weight_multiplier` | number | `3.0` | Selection weight multiplier for matched folders (e.g., 3.0 = 3x more likely) |


### Metadata Display Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_metadata` | boolean | `false` | Enable metadata overlay display |
| `metadata_position` | string | `bottom-left` | Metadata position: `bottom-left`, `bottom-right`, `top-left`, `top-right` |
| `show_folder` | boolean | `true` | Show source folder path in metadata |
| `show_filename` | boolean | `true` | Show filename in metadata |
| `show_date` | boolean | `true` | Show extracted date from filename in metadata |

### Navigation Controls
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable_navigation_zones` | boolean | `false` | Enable left/right click areas for navigation |
| `enable_keyboard_navigation` | boolean | `false` | Enable arrow key navigation |
| `show_navigation_indicators` | boolean | `false` | Show visual navigation hints |
| `show_file_position` | boolean | `false` | Display current file position (1 of 5) |

### Video Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `video_autoplay` | boolean | `false` | Auto-start video playbook |
| `video_loop` | boolean | `false` | Loop video continuously |
| `video_muted` | boolean | `false` | Start video muted |
| `hide_video_controls_display` | boolean | `false` | Hide "Video options" text |

### Debug Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `debug_mode` | boolean | `false` | Enable general card debug logging to browser console |
| `debug_queue_mode` | boolean | `false` | Enable SubfolderQueue debug UI overlay |
| `suppress_subfolder_logging` | boolean | `false` | Suppress SubfolderQueue console log messages (keeps other debug_mode logs) |

### Interactive Actions
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tap_action` | object | `none` | Action on single tap |
| `hold_action` | object | `none` | Action on tap and hold (0.5s+) |
| `double_tap_action` | object | `none` | Action on double tap |

## � **Image Aspect Ratio Modes**

The `aspect_mode` configuration helps optimize image display for different layouts, especially useful in panel layouts with mixed portrait and landscape images:

### **Available Modes**

| Mode | Description | Best For |
|------|-------------|----------|
| `default` | Images scale to 100% card width, height adjusts automatically | Standard card layouts |
| `smart-scale` | Limits image height to 90% viewport, prevents scrolling | Panel layouts with mixed orientations |
| `viewport-fit` | Scales image to fit entirely within viewport | Fullscreen panel layouts |
| `viewport-fill` | Scales image to fill entire viewport (may crop) | Background/wallpaper displays |

### **Panel Layout Examples**

#### Smart Scale (Recommended for Panels)
```yaml
type: custom:media-card
title: "Security Camera Feed"
media_path: media-source://media_source/local/cameras/
folder_mode: latest
aspect_mode: smart-scale  # Prevents scrolling on tall images
auto_refresh_seconds: 30
```

#### Viewport Fit (Full Panel Coverage)
```yaml
type: custom:media-card
media_path: media-source://media_source/local/wallpapers/
folder_mode: random
aspect_mode: viewport-fit  # Fits entire image in viewport
hide_title: true
auto_refresh_seconds: 300
```

## �📝 Configuration Examples

### ⚡ **Media Index Configuration (v4.0)**

#### Enhanced Random Slideshow with Media Index

```yaml
type: custom:media-card
title: "Photo Slideshow with Locations"
media_type: image
folder_mode: random
auto_refresh_seconds: 10
media_index:
  entity_id: sensor.media_index_photos_total_files
  show_favorite_button: true
  show_edit_button: true
  show_delete_button: true
  show_location: true
  show_date_taken: true
show_metadata: true
metadata_position: bottom-right
```

> **💡 Note**: Requires [Media Index integration](https://github.com/markaggar/ha-media-index) to be installed and configured first.

### � **Folder Mode Examples**

#### Show Latest File from Security Camera Folder

```yaml
type: custom:media-card
title: "Latest Security Alert"
media_type: image
media_path: media-source://media_source/local/security_alerts/
folder_mode: latest
auto_refresh_seconds: 30
show_refresh_button: true
enable_navigation_zones: true
show_file_position: true
```

#### Random Dashcam Clips

```yaml
type: custom:media-card
title: "Random Dashcam Footage"
media_type: video
media_path: media-source://media_source/local/dashcam/
folder_mode: random
random_count: 5
auto_refresh_seconds: 60
video_autoplay: true
video_muted: true
enable_keyboard_navigation: true
show_navigation_indicators: true
```

#### Family Photo Gallery with Navigation

```yaml
type: custom:media-card
title: "Family Memories"
media_type: image
media_path: media-source://media_source/local/photos/family/
folder_mode: random
random_count: 10
auto_refresh_seconds: 300  # 5 minutes
enable_navigation_zones: true
enable_keyboard_navigation: true
show_navigation_indicators: true
show_file_position: true
```

### � **Hierarchical Scanning Examples**

#### Large Photo Collection with Smart Discovery

```yaml
type: custom:media-card
title: "Photo Collection (25,000+ photos)"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
slideshow_window: 1000        # Probability target for SubfolderQueue mode
subfolder_queue:
  enabled: true
  estimated_total_photos: 25000  # Critical for consistent probabilities
auto_refresh_seconds: 60
```

#### Camera Roll Priority Configuration

```yaml
type: custom:media-card
title: "Recent Photos with Camera Roll Priority"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
slideshow_window: 1000        # Probability target for sampling
subfolder_queue:
  enabled: true
  priority_folder_patterns:
    - path: "Camera Roll"      # Recent photos get 3x weight
      weight_multiplier: 3.0
    - path: "Screenshots"      # Screenshots get 2x weight  
      weight_multiplier: 2.0
auto_refresh_seconds: 30
```

### 🖼️ **Metadata Display Examples**

#### Professional Photo Display with Full Metadata

```yaml
type: custom:media-card
title: "Photo Gallery with Info"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
show_metadata: true
metadata_position: "bottom-left"    # Bottom-left corner
show_folder: true                   # Show source folder
show_filename: true                 # Show clean filename  
show_date: true                     # Show extracted date
auto_refresh_seconds: 120
```

#### Security Camera with Top-Right Metadata

```yaml
type: custom:media-card
title: "Security Feed"
media_type: image
media_path: media-source://media_source/local/security/
folder_mode: latest
show_metadata: true
metadata_position: "top-right"      # Pause button auto-moves for this
show_folder: true
show_filename: false                # Don't show filename for security
show_date: true                     # Show timestamp
auto_refresh_seconds: 10
```

### 🚀 **Smart Slideshow Examples**

#### Smart Slideshow with New Content Priority

```yaml
type: custom:media-card
title: "Security Camera Smart Slideshow"
media_type: image
media_path: media-source://media_source/local/security/
folder_mode: latest
slideshow_behavior: smart_slideshow  # 🆕 Interrupts for new content
slideshow_window: 500  # Process last 500 files for performance
auto_refresh_seconds: 10
enable_navigation_zones: true
show_file_position: true
```

#### Video Gallery with Completion Auto-Advance

```yaml
type: custom:media-card
title: "Dashcam Highlights"
media_type: video
media_path: media-source://media_source/local/dashcam/
folder_mode: latest
slideshow_behavior: cycle  # 🆕 Round-robin through content
slideshow_window: 1000
auto_refresh_seconds: 30  # Videos advance immediately when done
video_autoplay: true
video_muted: true
enable_navigation_zones: true
```

#### Large Folder Performance Optimized

```yaml
type: custom:media-card
title: "Photo Archive (1000+ files)"
media_type: image
media_path: media-source://media_source/local/photos/archive/
folder_mode: random
slideshow_behavior: static  # 🆕 Stay on current until manual change
slideshow_window: 2000  # Handle large folders efficiently
auto_refresh_seconds: 120
enable_navigation_zones: true
enable_keyboard_navigation: true
```

### 🎯 **Complete Configuration (All New Features)**

#### Professional Photo Display with Everything Enabled

```yaml
type: custom:media-card
title: "Complete Photo Gallery"
media_type: all                      # Show both images and videos
media_path: media-source://media_source/local/photos/
folder_mode: random

# � Slideshow Configuration
slideshow_window: 1000               # Number of items for probability sampling

# �📂 Hierarchical Scanning - For Large Collections
subfolder_queue:
  enabled: true
  estimated_total_photos: 15000      # 🎯 Critical for consistent probabilities
  priority_folder_patterns:
    - path: "Camera Roll"            # Recent photos get priority
      weight_multiplier: 3.0
    - path: "Favorites"              # Favorites get extra weight
      weight_multiplier: 2.5

# 🖼️ Rich Metadata Display 
show_metadata: true
metadata_position: "bottom-left"     # Professional placement
show_folder: true                    # Show source folder path
show_filename: true                  # Show clean filename
show_date: true                      # Show extracted date

# 🎬 Smart Slideshow
slideshow_behavior: smart_slideshow  # Prioritize new content
slideshow_window: 1500              # Handle large datasets
auto_refresh_seconds: 90            # 90-second intervals

# 🎮 Navigation & Controls
enable_navigation_zones: true       # Left/right click navigation
enable_keyboard_navigation: true    # Arrow key support
show_navigation_indicators: true    # Visual navigation hints  
show_file_position: true           # "5 of 40" position display

# 🎥 Video Settings (with pause-aware slideshow)
video_autoplay: true               # Auto-start videos
video_muted: true                  # Start muted
video_loop: false                  # Don't loop videos

# 👆 Interactive Actions
tap_action:
  action: more-info               # Tap for details
hold_action:
  action: navigate               # Hold to navigate
  navigation_path: "/dashboard"
```

**Why This Configuration Works:**
- ✅ **`estimated_total_photos: 15000`** - Ensures consistent probability calculations across all folders
- ✅ **`slideshow_window: 1000`** - Probability target for sampling (not a hard limit)
- ✅ **Priority patterns** - Recent photos (Camera Roll) get 3x more visibility
- ✅ **Smart metadata** - Professional info display without UI conflicts
- ✅ **Video-aware pausing** - Slideshow respects manual video pauses

### 📸 **Single File Examples**

#### Security Camera Snapshot

```yaml
type: custom:media-card
title: "Front Door Camera"
media_type: image
media_path: media-source://media_source/local/cameras/front_door.jpg
auto_refresh_seconds: 30
show_refresh_button: true
```

#### Dashcam Video

```yaml
type: custom:media-card
title: "Latest Dashcam Footage"
media_type: video
media_path: media-source://media_source/local/dashcam/latest.mp4
video_autoplay: true
video_muted: true
video_loop: true
hide_video_controls_display: true
```

### 👆 **Interactive Media Card**

```yaml
type: custom:media-card
title: "Front Door Camera"
media_type: image
media_path: media-source://media_source/local/cameras/front_door.jpg
auto_refresh_seconds: 30
tap_action:
  action: more-info
  entity: camera.front_door
hold_action:
  action: perform-action
  perform_action: camera.snapshot
  target:
    entity_id: camera.front_door
  data:
    filename: "/config/www/local/snapshots/manual_{{ now().strftime('%Y%m%d_%H%M%S') }}.jpg"
double_tap_action:
  action: navigate
  navigation_path: /lovelace/security
```

## ⚙️ **Configuration Parameter Guide**

### 📊 **Key Parameters for Large Collections**

| Parameter | Small Collections (<1K files) | Medium Collections (1K-10K files) | Large Collections (10K+ files) | Purpose |
|-----------|----------------------------|-----------------------------------|-------------------------------|---------|
| `estimated_total_photos` | Optional | **Recommended** | **Critical** | Ensures consistent probability calculations |
| `slideshow_window` | 500-1000 | 1000-1500 | 1500-2000+ | Probability target for sampling |

### 🎯 **Why `estimated_total_photos` is Critical**

```yaml
# ❌ Without estimate - probability drift during scanning
subfolder_queue:
  enabled: true
  # Missing estimated_total_photos causes inconsistent folder representation

# ✅ With estimate - consistent statistical fairness  
subfolder_queue:
  enabled: true
  estimated_total_photos: 25000  # Prevents early folder bias
```

**The Problem:** Without `estimated_total_photos`, early folders get over-represented because the total count grows during discovery.

**The Solution:** Setting this value locks probability calculations, ensuring true statistical fairness across all folders.

### 📈 **Recommended Values by Collection Size**

#### Small Collection (< 1,000 photos)
```yaml
slideshow_window: 500           # Probability target
subfolder_queue:
  enabled: true
  estimated_total_photos: 500   # Conservative estimate
```

#### Medium Collection (1,000 - 10,000 photos)  
```yaml
slideshow_window: 1000          # Probability target
subfolder_queue:
  enabled: true
  estimated_total_photos: 5000  # Reasonable estimate
```

#### Large Collection (10,000+ photos)
```yaml
slideshow_window: 1500          # Probability target
subfolder_queue:
  enabled: true
  estimated_total_photos: 25000 # Critical for fairness
```

## 📅 **Filename Conventions for "Show Latest" Mode**

For the **Show Latest** folder mode to work correctly, your files should include timestamps in their names as the Media Browser in Home Assistant does not expose file creation times. The card can automatically detect and sort by various timestamp formats:

### ✅ **Supported Filename Formats**

#### **Recommended Formats (for camera snapshots)**
- `entity_snapshot_YYYYMMDD_HHMMSS.jpg` → `driveway_snapshot_20250922_143045.jpg`
- `IMG_YYYYMMDD_HHMMSS.jpg` → `IMG_20250922_143045.jpg`
- `VID_YYYYMMDD_HHMMSS.mp4` → `VID_20250922_143045.mp4`

#### **ISO DateTime Formats**
- `YYYY-MM-DD_HH-MM-SS.jpg` → `2025-09-22_14-30-45.jpg`
- `YYYY-MM-DDTHH:MM:SS.jpg` → `2025-09-22T14:30:45.jpg`

#### **Date-Only Formats**
- `YYYY-MM-DD.jpg` → `2025-09-22.jpg`
- `YYYYMMDD.jpg` → `20250922.jpg`

#### **Unix Timestamps**
- `1695386245_snapshot.jpg` (10-digit seconds)
- `1695386245123_snapshot.jpg` (13-digit milliseconds)

### 🛠️ **Home Assistant Integration Examples**

#### Camera Snapshot Automation

```yaml
automation:
  - alias: "Motion Detection Snapshot"
    trigger:
      platform: state
      entity_id: binary_sensor.driveway_motion
      to: "on"
    action:
      service: camera.snapshot
      target:
        entity_id: camera.driveway
      data:
        filename: >-
          /config/www/local/motion/driveway_snapshot_{{ now().strftime('%Y%m%d_%H%M%S') }}.jpg
```

#### Doorbell Ring Snapshot
```yaml
automation:
  - alias: "Doorbell Ring Capture"
    trigger:
      platform: state
      entity_id: binary_sensor.doorbell_ring
      to: "on"
    action:
      service: camera.snapshot
      target:
        entity_id: camera.front_door
      data:
        filename: >-
          /config/www/local/doorbell/visitor_{{ now().strftime('%Y-%m-%dT%H:%M:%S') }}.jpg
```

### 📋 **Jinja2 Templates for Filenames**

Use these templates in your Home Assistant automations to create properly timestamped filenames:

```jinja2
# Basic timestamp
{{ now().strftime('%Y%m%d_%H%M%S') }}

# With entity name
{{ trigger.to_state.name|lower|replace(' ', '_') }}_{{ now().strftime('%Y%m%d_%H%M%S') }}

# With area name
{{ area_name(trigger.entity_id)|lower|replace(' ', '_') }}_{{ now().strftime('%Y-%m-%d_%H-%M-%S') }}

# Camera-style format
IMG_{{ now().strftime('%Y%m%d_%H%M%S') }}

# ISO format
{{ now().strftime('%Y-%m-%dT%H:%M:%S') }}
```

### ⚠️ **Important Notes**
- Files **without** timestamps will be sorted alphabetically
- Files **with** timestamps are always prioritized over files without
- Mixed timestamp formats in the same folder work correctly
- The card extracts timestamps automatically—no configuration needed

## 🛣️ Supported Path Format

### Media Source URLs
```yaml
media_path: media-source://media_source/local/folder/file.mp4
media_path: media-source://media_source/camera/snapshot.jpg
```

## 🎯 Example Use Cases

### 🏠 **Home Security**
- Display latest camera snapshots
- Monitor dashcam clips
- Security system alerts - actionable notification pointing to media card with latest video clip

### 📱 **Smart Home Dashboard**
- Weather radar images
- Traffic camera feeds (mp4 or jpg)
- Package delivery photos

### 👨‍👩‍👧‍👦 **Family & Entertainment**
- Photo of the day
- Kids' latest artwork
- Pet monitoring cameras

## �️ Kiosk Mode Integration

The Media Card includes seamless integration with the popular [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) HACS integration for full-screen dashboard experiences. When kiosk mode is enabled, the media card provides visual hints and exit controls for a professional display setup.

### 🎯 **Key Features**

- **Smart Exit Hints**: Visual indicator appears when kiosk mode is active
- **Configurable Exit Gestures**: Support for tap, double-tap, hold, and swipe actions
- **State-Aware Display**: Exit hint only shows when your kiosk mode boolean is enabled
- **Elegant Positioning**: Non-intrusive bottom-center placement with fade effects

### 🛠️ **Setup Requirements**

#### 1. Install Kiosk Mode
Install the [Kiosk Mode integration](https://github.com/NemesisRE/kiosk-mode) via HACS:

```
HACS → Frontend → Search "Kiosk Mode" → Install
```

#### 2. Create Kiosk Mode Boolean
Add an input boolean to control kiosk mode state:

```yaml
# configuration.yaml
input_boolean:
  kiosk_mode:
    name: "Kiosk Mode"
    icon: mdi:fullscreen
```

#### 3. Configure Kiosk Mode
Add kiosk mode configuration to your dashboard view:

```yaml
# In your dashboard view configuration
kiosk_mode:
  hide_header: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
  hide_sidebar: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
```

### ⚙️ **Media Card Configuration**

Add kiosk mode settings to your media card:

```yaml
type: custom:media-card
title: "Fullscreen Photo Display"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
auto_refresh_seconds: 30

# Kiosk Mode Integration
kiosk_mode:
  enabled: true
  kiosk_entity: input_boolean.kiosk_mode
  exit_action: double_tap
  show_exit_hint: true
```

### 📋 **Configuration Options**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kiosk_mode.enabled` | boolean | `false` | Enable kiosk mode integration |
| `kiosk_mode.kiosk_entity` | string | **Required** | Input boolean entity controlling kiosk state |
| `kiosk_mode.exit_action` | string | `double_tap` | Exit gesture: `tap`, `double_tap`, `hold`, `swipe_down` |
| `kiosk_mode.show_exit_hint` | boolean | `true` | Show exit instruction overlay |

### 🎨 **Complete Example Configurations**

#### Photo Slideshow Kiosk

```yaml
type: custom:media-card
title: "Family Photo Kiosk"
media_type: image
media_path: media-source://media_source/local/photos/family/
folder_mode: random
auto_refresh_seconds: 60
aspect_mode: viewport-fit
show_metadata: true
metadata_position: bottom-right

# Kiosk Integration
kiosk_mode:
  enabled: true
  kiosk_entity: input_boolean.kiosk_mode
  exit_action: double_tap
  show_exit_hint: true

# Enhanced Navigation
enable_navigation_zones: true
show_navigation_indicators: false  # Hide for clean kiosk look
```

#### Security Monitor Kiosk

```yaml
type: custom:media-card
title: "Security Feed"
media_type: image
media_path: media-source://media_source/local/security/
folder_mode: latest
auto_refresh_seconds: 10
aspect_mode: viewport-fill

# Kiosk Integration
kiosk_mode:
  enabled: true
  kiosk_entity: input_boolean.security_kiosk
  exit_action: hold
  show_exit_hint: true

# Metadata for Context
show_metadata: true
metadata_position: top-left
show_folder: false
show_filename: true
show_date: true
```

### 🎮 **Exit Actions**

Configure how users can exit kiosk mode:

| Action | Description | Best For |
|--------|-------------|----------|
| `tap` | Single tap anywhere | Touch screens, quick access |
| `double_tap` | Double tap gesture | Prevents accidental exits |
| `hold` | Tap and hold (1 second) | Secure environments |
| `swipe_down` | Swipe down from top | Mobile/tablet interfaces |

### 💡 **Pro Tips**

#### Automation Integration
Automatically enable kiosk mode based on time or presence:

```yaml
automation:
  - alias: "Enable Evening Kiosk Mode"
    trigger:
      platform: time
      at: "18:00:00"
    action:
      service: input_boolean.turn_on
      target:
        entity_id: input_boolean.kiosk_mode

  - alias: "Disable Kiosk Mode on Motion"
    trigger:
      platform: state
      entity_id: binary_sensor.living_room_motion
      to: "on"
    action:
      service: input_boolean.turn_off
      target:
        entity_id: input_boolean.kiosk_mode
```

#### Multiple Display Support
Use different boolean entities for multiple kiosk displays:

```yaml
input_boolean:
  living_room_kiosk:
    name: "Living Room Kiosk"
  bedroom_kiosk:
    name: "Bedroom Kiosk"
  security_kiosk:
    name: "Security Monitor Kiosk"
```

## �🔧 Advanced Configuration

### Auto-Refresh for Security Cameras
```yaml
type: custom:media-card
title: "Live Camera Feed"
media_type: image
media_path: media-source://media_source/local/cameras/live_feed.jpg
auto_refresh_seconds: 5  # Update every 5 seconds
show_refresh_button: true
```

### Silent Background Video
```yaml
type: custom:media-card
media_type: video
media_path: media-source://media_source/local/videos/background.mp4
video_autoplay: true
video_loop: true
video_muted: true
hide_video_controls_display: true
```

## HA Media Path config
Home Assistant media path setup can be quite confusing.  You need to have something similar to following in configuration.yaml

```
homeassistant:
  media_dirs:
    media: /media
    camera: /config/camera
    local: /config/www/local
  allowlist_external_dirs:
    - "/config/www/local"
    - "/media"
```

When browsing, this provides a 'My Media' folder, which has media, camera and local folders.

### Referring to files outside of Media Card
If you want to use the camera.snapshot action to save an image you will display later with Media card, your path can be:

/config/www/local/filename1.jpg (you can create a folder between the '/local/' and the filename).

If you want to upload this image to an AI service such as Google Gemini via the AI Tasks action, you need to refer to the files as so:

```
      service: ai_task.generate_data
      data:
        task_name: "[task title]"
        instructions: >
          [Your instructions]
        attachments:
          - media_content_id: media-source://media_source/local/filename1.jpg
            media_content_type: image/jpeg
          - media_content_id: media-source://media_source/local/filename2.jpg
            media_content_type: image/jpeg
        entity_id: ai_task.google_ai_task
      response_variable: family_room_ai_response
```
Note: For video - the media_content_type is video/mp4

## 🎮 **Navigation & Keyboard Shortcuts**

### **Mouse/Touch Navigation** 🆕 v2.0 Precision Controls
- **Previous Button**: Small rectangular zone on the left side (80px × 120px)
- **Next Button**: Small rectangular zone on the right side (80px × 120px)  
- **Pause/Resume**: Top-right corner button (60px × 60px)
- **Main Action Area**: Large center region for tap/hold actions (avoids video controls)

### **Keyboard Controls**

**⚠️ Important**: Click on the card first to focus it, then use these keys:

- **← Left Arrow**: Previous file
- **→ Right Arrow**: Next file  
- **↑ Up Arrow**: First file in folder
- **↓ Down Arrow**: Last file in folder
- **Space**: Next file
- **Enter**: Refresh current file
- **P**: Pause/Resume auto-refresh (random mode only)

> **💡 Tip**: You'll see a subtle outline around the card when it's focused and ready for keyboard input.

### **Visual Indicators**
- **Navigation Zones**: Subtle overlay hints showing clickable areas
- **File Position**: Display current position (e.g., "3 of 12")
- **Loading States**: Visual feedback during file changes

## 🐛 Troubleshooting

### Media Not Loading?
1. **Check file path** - Use the built-in media browser to verify
2. **File permissions** - Ensure Home Assistant can read the file
3. **File format** - Verify the format is supported
4. **Browser console** - Check for error messages (F12 in the browser, click Console messages)

### Folder Modes Not Working?
1. **Check folder path** - Must point to a folder, not a specific file
2. **File naming** - For "Show Latest", ensure files have timestamps in names
3. **Media type filter** - Verify `media_type` matches your files (image/video/all)
4. **Folder contents** - Check the browser console for folder scanning results

### "Show Latest" Showing Wrong Files?
1. **Filename timestamps** - Files need timestamps in names (see filename conventions above)
2. **Multiple formats** - Mixed timestamp formats in same folder are supported
3. **Console debugging** - Check browser console for timestamp extraction logs
4. **File modification** - Without filename timestamps, alphabetical sorting is used

### Navigation Not Working?

1. **Enable features** - Set `enable_navigation_zones: true` and/or `enable_keyboard_navigation: true`
2. **Multiple files** - Navigation requires multiple files (folder mode or multiple visits)  
3. **Focus required** - **Click on the card first** to focus it for keyboard navigation
4. **Browser compatibility** - Modern browsers required for keyboard events
5. **Folder mode** - Navigation only works with folder modes (`latest` or `random`)

### Auto-Refresh Not Working?
1. **Check interval** - Must be > 0 to enable
2. **File changes** - System detects Last-Modified header changes
3. **Media-source URLs** - Always refresh regardless of headers
4. **Dashboard editor** - Auto-refresh persists after closing editor (new in v1.1.1+)

### Media Browser Issues?
1. **Refresh the page** - Sometimes needed after installation (CTRL-F5 to force cache to reload)
2. **Check resource URL** - Verify the JavaScript file is loaded correctly
3. **Console errors** - Look for JavaScript errors in browser console
4. **HACS installation** - Ensure proper installation through HACS or manual setup

### 🆕 v2.0 Features Not Working?

#### Smart Slideshow Issues
1. **Check slideshow_behavior** - Must be set to `smart_slideshow` for new content prioritization
2. **Slideshow window size** - Large folders may need `slideshow_window` adjustment (default: 1000)
3. **New content detection** - Requires folder refresh interval (`auto_refresh_seconds > 0`)
4. **Console debugging** - Check browser console for slideshow behavior logs

#### Video Completion Auto-Advance
1. **Video format support** - MP4, WebM, OGG formats supported for completion detection
2. **Auto-refresh enabled** - Requires `auto_refresh_seconds > 0` for advancement
3. **Browser compatibility** - Modern browsers required for video event handling
4. **Background tab behavior** - Auto-advance pauses when tab is inactive (performance feature)

#### Precision Navigation Controls
1. **Navigation zones enabled** - Set `enable_navigation_zones: true`
2. **Hover indicators** - Look for button symbols when hovering over navigation areas
3. **Video controls conflict** - Navigation automatically avoids video control areas
4. **Touch device testing** - Test with mouse/touch to verify button responsiveness

## 🤝 Contributing

Found a bug or want to contribute? Great! 

1. **Issues**: [Report bugs or request features](https://github.com/your-username/ha-media-card/issues)
2. **Pull Requests**: Contributions are welcome!
3. **Discussions**: [Share your setups and ideas](https://github.com/your-username/ha-media-card/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Home Assistant community for inspiration and support
- Lit Element for the excellent web component framework
- All users who provide feedback and suggestions

---

**Enjoy your new Media Card!** 🎉

If you find this card useful, please consider giving it a ⭐ on GitHub!
