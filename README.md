![Version](https://img.shields.io/github/v/release/markaggar/ha-media-card?style=for-the-badge)

[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/frontend)

# HA Media Card 🎬
A powerful custom Home Assistant Dashboard card that displays images and videos with **smart slideshow behavior**, **hierarchical folder scanning**, **rich metadata displays**, and **intelligent content prioritization**. Features include **multi-level folder management**, **precision navigation controls**, **video completion detection**, and a **built-in media browser** for easy file selection. Perfect for displaying family photos, security camera snapshots, or any media files from your Home Assistant media folders with performance optimization. 100% developed in VS Code using GitHub Copilot with Claude Sonnet 4.0/4.5.

It is highly recommended you also install the [Media Index Integration](https://github.com/markaggar/ha-media-index) that is required for many of the cool features of Media Card - EXIF metadata extraction, favoriting, editing and deleting photos.

<img width="691" height="925" alt="Media Card displaying a photo with metadata" src="docs/media-card.gif" />

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
   - Type: JavaScript Module  
4. Restart Home Assistant and hard refresh browser

## 📚 [Documentation](docs/guides/) 

**Getting Started**

- **[Installation Guide](docs/guides/installation.md)** - Complete setup instructions for HACS and manual installation   

- **[Configuration Reference](docs/guides/configuration.md)** - All available options and parameters

- **[Examples](docs/guides/examples.md)** - Real-world configurations for common use cases
   
**Features & Advanced Usage**

- **[Features Guide](docs/guides/features.md)** - Detailed explanation of all capabilities

- **[Troubleshooting](docs/guides/troubleshooting.md)** - Solutions to common issues
   
**Development**   

- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes

- **[GitHub Issues](https://github.com/markaggar/ha-media-card/issues)** - Bug reports and feature discussions

**Built with ❤️ using GitHub Copilot + Claude Sonnet**

⭐ **Enjoying the Media Card?** Give it a star on GitHub!

 
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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Home Assistant community for inspiration and support
- Lit Element for the excellent web component framework
- All users who provide feedback and suggestions

---

**Enjoy your new Media Card!** 🎉

If you find this card useful, please consider giving it a ⭐ on GitHub!
