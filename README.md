![Version](https://img.shields.io/github/v/release/markaggar/ha-media-card?style=for-the-badge)
[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/frontend)

# HA Media Card v1.1.7

A powerful custom Home Assistant Dashboard card that displays images and videos with advanced features including **folder-based media display**, **manual navigation controls**, and a **built-in media browser** for easy file selection. Perfect for displaying security camera snapshots, family photos, dashcam clips, or any media files from your Home Assistant media folders. 100% developed in VS Code using GitHub Copilot with Claude Sonnet 4.0.

<img width="700" height="685" alt="image" src="https://github.com/user-attachments/assets/45dfe2cb-645e-4eb7-9042-994faf89273e" />

## ✨ Features

### 🎬 **Media Display**
- **Images**: JPG, PNG, GIF, WebP, SVG, BMP
- **Videos**: MP4, WebM, OGG with full HTML5 controls
- Responsive design that adapts to container size
- Theme-aware styling (light/dark mode support)

### 📁 **Advanced Folder Management**

- **Show Latest**: Automatically displays the most recent file from a folder based on filename timestamps
- **Show Random**: Displays random files from a folder with configurable refresh intervals
- **Smart Timestamp Detection**: Extracts dates/times from various filename formats
- **Media Type Filtering**: Filter folder contents by image or video files only
- **Automatic Refresh**: Updates content based on configured intervals

### 🎮 **Manual Navigation System**

- **Click Navigation Zones**: Left/right areas of media for previous/next file browsing
- **Center Pause/Resume**: Click center area to pause auto-refresh in random mode
- **Keyboard Controls**: Arrow keys, space bar, Enter for navigation, P for pause/resume
- **Visual Indicators**: Subtle navigation hints and current file position display
- **Configurable Controls**: Enable/disable navigation features independently
- **Smart Folder Awareness**: Navigation works seamlessly with folder modes

### 📁 **Built-in Media Browser**

- **GUI file selection** - No more typing file paths!
- **Folder Mode Selection** - Choose between single file, latest, or random display
- Browse through your Home Assistant media folders
- Navigate subfolders with intuitive back/forward navigation
- File type icons (🎬 for videos, 🖼️ for images, 📁 for folders)
- **Auto-detection** of media type based on file extension
- **Smart Browse Navigation** - Starts from current folder location

### 🔄 **Auto-Refresh System**
- **Automatic updates** - Monitor files for changes every N seconds
- **Smart caching** - Uses Last-Modified headers for efficient updates
- **Manual refresh button** - Force immediate reload when needed
- **Media-source URL support** - Works with Home Assistant's authenticated media URLs

### 🎮 **Video Controls**
- **Autoplay** - Start playing automatically
- **Loop** - Continuous playbook 
- **Muted** - Start without sound
- **Hide controls display** - Clean presentation mode

### 🎨 **Customization**
- **Custom titles** for your media cards
- **Flexible path formats** - Support for both direct paths and media-source URLs
- **Theme integration** - Seamlessly matches your Home Assistant theme

### 👆 **Interactive Actions**
- **Tap Action** - Single tap/click actions
- **Hold Action** - Tap and hold (0.5+ seconds) actions  
- **Double Tap Action** - Quick double tap/click actions
- **Action Types**: more-info, toggle, perform-action, navigate, url, assist, none
- **Service Calls** - Call any Home Assistant service with data
- **Navigation** - Jump to other dashboard views
- **External URLs** - Open websites in new tabs
- **Confirmation Dialogs** - Optional confirmations for destructive actions

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

### Folder Mode Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `folder_mode` | string | `none` | `latest`, `random`, or `none` for single file |
| `random_count` | number | `1` | Number of random files to cycle through |

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

## 📅 **Filename Conventions for "Show Latest" Mode**

For the **Show Latest** folder mode to work correctly, your files should include timestamps in their names. The card can automatically detect and sort by various timestamp formats:

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

## 🔧 Advanced Configuration

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

### **Mouse/Touch Navigation**
- **Left Click Zone**: Click the left 25% of the media to go to previous file
- **Right Click Zone**: Click the right 25% of the media to go to next file
- **Center Click**: Pause/Resume auto-refresh (random mode only)

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
