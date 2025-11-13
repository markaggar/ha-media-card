![Version](https://img.shields.io/github/v/release/markaggar/ha-media-card?style=for-the-badge)![Version](https://img.shields.io/github/v/release/markaggar/ha-media-card?style=for-the-badge)

[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/frontend)[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/frontend)

# HA Media Card 🎬
A powerful custom Home Assistant Dashboard card that displays images and videos with **smart slideshow behavior**, **hierarchical folder scanning**, **rich metadata displays**, and **intelligent content prioritization**. Features include **multi-level folder management**, **precision navigation controls**, **video completion detection**, and a **built-in media browser** for easy file selection. Perfect for displaying family photos, security camera snapshots, or any media files from your Home Assistant media folders with performance optimization. 100% developed in VS Code using GitHub Copilot with Claude Sonnet 4.0/4.5.

<img width="691" height="925" alt="Media Card displaying a photo with metadata" src="/docs/media-card.gif" />

## ✨ Key Features  

### **Smart Media Display** 
- 🎬 **Mixed Media**: Display images and videos together seamlessly  
- 🎯 **Media Modes** - Single Media and Folder modes
- 📂 **Multiple Folder Modes**: Sequential or Random selection of media from folders with optional file system recursion
- 🔄 **Auto-Advance/Refresh**: Configurable intervals for dynamic content
- 🎥 **Video Controls**: Autoplay, loop, mute and limit video length
- 🖼️ **Aspect Ratio Control**: Optimize display for any layout (panel, card, fullscreen)
- **✨ Image Zoom**: Click to zoom into any point of an image, click again to reset (configurable zoom level 1.5-5x)
- **📱 Kiosk Mode**: Automatically activate/deactivate kiosk mode (full screen) (perfect for wall-mounted tablets)
- 🎭 **Manual Fullscreen Mode**: Dedicated button for immersive viewing of images (great for dashboards with small media cards)
### **Metadata Visibility & Management with Media Index**
- ❤️ **Favorite Button**: 'Heart' your favorite photos and videos, with Ratings written back to photos (video ratings are in the Media Index DB only due to technical limitations)
- ✏️ **Edit and Delete Buttons**: Move photos to _Edit or _Junk folders for further editing or review. Media Index provides a service to restore files in the _Edit folder to their original location.
- 📊 **Metadata Panel Button**: Popup shows full image metadata, including date/time, location and camera information
- 🏷️ **Metadata Display**: Selectively overlay key metadata elements - EXIF date, time and location, and folder and file name
### **Intelligent Navigation**
- ⏸️ **Manual Queue Navigation**: Manually pause/resume, advance forward and back in a queue.
- ⌨️ **Keyboard Shortcuts**: Arrow keys, space, and more
- 👆 **Interactive Actions**: Tap, hold, and double-tap customization with optional custom confirmation messages
### **Advanced Capabilities**
- 🖱️ **Point-and-click file and folder selection** with real image thumbnails. No more typing paths!
- 🔍 **Media Index Integration**: Database-backed selection with enhanced metadata
- 🌲 **Hierarchical Scanning**: Handle thousands of files across nested folders efficiently with near immediate display of images
- 🎯 **Priority Folders**: Boost visibility of recent photos or favorites (3x, 2x multipliers)
- ⏯️ **Smart Pause/Resume**: Slideshow automatically pauses when you pause a video, navigate away, or switch tabs. Resumes right where you left off when you return.

## Installation 

### Install via HACS
[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=markaggar&repository=ha-media-card&category=frontend)

**Manual Installation**
1. Download `ha-media-card.js` from [latest release](https://github.com/markaggar/ha-media-card/releases/latest)
2. Copy to `/config/www/cards/ha-media-card.js`  
3. Add resource in Settings → Dashboards → Resources:
   - URL: `/local/cards/ha-media-card.js`
   - Type: JavaScript Module>  
4. Restart Home Assistant and hard refresh browser

## 📚 Documentation 

**Getting Started**

- **[Installation Guide](docs/guides/installation.md)** - Complete setup instructions for HACS and manual installation   

- **[Configuration Reference](docs/guides/configuration.md)** - All available options and parameters

- **[Examples](docs/guides/examples.md)** - Real-world configurations for common use cases
   
**Features & Advanced Usage**

- **[Features Guide](docs/guides/features.md)** - Detailed explanation of all capabilities

- **[Troubleshooting](docs/guides/troubleshooting.md)** - Solutions to common issues
   
**Development**   

- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes

- **[GitHub Issues](https://github.com/markaggar/ha-media-card/issues)** - Bug reports and feature requests

**Built with ❤️ using GitHub Copilot + Claude Sonnet**

⭐ **Enjoying the Media Card?** Give it a star on GitHub!

[Report a Bug](https://github.com/markaggar/ha-media-card/issues) · [Request a Feature](https://github.com/markaggar/ha-media-card/discussions) · [View Documentation](docs/guides/)

## 📋 **Special Considerations**

### �️ Kiosk Mode Integration

The Media Card includes seamless integration with the popular [Kiosk Mode](https://github.com/NemesisRE/kiosk-mode) HACS integration for full-screen dashboard experiences. When kiosk mode is enabled, the media card provides visual hints and exit controls for a professional display setup.

#### 🛠️ **Setup Requirements**

##### 1. Install Kiosk Mode
Install the [Kiosk Mode integration](https://github.com/NemesisRE/kiosk-mode) via HACS:

```
HACS → Frontend → Search "Kiosk Mode" → Install
```

##### 2. Create Kiosk Mode Boolean
Add an input boolean to control kiosk mode state:

```yaml
# configuration.yaml
input_boolean:
  kiosk_mode:
    name: "Kiosk Mode"
    icon: mdi:fullscreen
```

##### 3. Configure Kiosk Mode
Add kiosk mode configuration to your dashboard view:

```yaml
# In your dashboard view configuration
kiosk_mode:
  hide_header: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
  hide_sidebar: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
```

###### ⚙️ **Media Card Configuration**

Add kiosk mode settings to your media card:

```yaml
type: custom:media-card
title: "Fullscreen Photo Display"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
auto_refresh_seconds: 30

# Kiosk Mode Integration
kiosk_mode_entity: input_boolean.kiosk_mode
double_tap_action:
  action: toggle-kiosk
kiosk_mode_auto_enable: true
kiosk_mode_show_indicator: true
```
### Media Index with Local Folders
Media Index **cannot be used with local HA folders** (e.g., `/config/www/local/`) due to path format mismatch. Media Card uses `media-source://` URIs while Media Index requires filesystem paths. 

**Workaround:** Use folder-based scanning for local content:
```yaml
media_source_type: folder
folder:
  path: media-source://media_source/local/
  mode: sequential
  recursive: true
```
Media Index works correctly with network shares (`/mnt/...`, `/media/...`) and will support Synology Photos. See [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) for details.

### HA Media Path config
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

#### Referring to files outside of Media Card
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

### 🎮 **Navigation & Keyboard Shortcuts**

#### **Mouse/Touch Navigation** 
- **Previous Button**: Small rectangular zone on the left side (80px × 120px)
- **Next Button**: Small rectangular zone on the right side (80px × 120px)  
- **Pause/Resume**: Top-right corner button (60px × 60px)
- **Main Action Area**: Large center region for tap/hold actions (avoids video controls)

#### **Keyboard Controls**

**⚠️ Important**: Click on the card first to focus it, then use these keys:

- **← Left Arrow**: Previous file
- **→ Right Arrow**: Next file  
- **↑ Up Arrow**: First file in folder
- **↓ Down Arrow**: Last file in folder
- **Space**: Next file
- **Enter**: Refresh current file
- **P**: Pause/Resume auto-refresh (random mode only)

> **💡 Tip**: You'll see a subtle outline around the card when it's focused and ready for keyboard input.

#### **Visual Indicators**
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
