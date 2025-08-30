# Home Assistant Media Card

A custom Home Assistant Lovelace card that displays images and videos with a built-in media browser for easy file selection. Perfect for displaying security camera snapshots, dashcam footage, family photos, or any media files stored in your Home Assistant media folder.

![Media Card Example](https://via.placeholder.com/600x300/1f1f1f/ffffff?text=Media+Card+Demo)

## ✨ Features

### 🎬 **Media Display**
- **Images**: JPG, PNG, GIF, WebP, SVG, BMP
- **Videos**: MP4, WebM, OGG with full HTML5 controls
- Responsive design that adapts to container size
- Theme-aware styling (light/dark mode support)

### 📁 **Built-in Media Browser** 
- **GUI file selection** - No more typing file paths!
- Browse through your Home Assistant media folders
- Navigate subfolders with intuitive back/forward navigation
- File type icons (🎬 for videos, 🖼️ for images, 📁 for folders)
- **Auto-detection** of media type based on file extension

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

## 📥 Installation

### Method 1: Manual Installation

1. **Download the card file**:
   ```bash
   wget https://github.com/your-username/ha-media-card/releases/latest/download/media-card.js
   ```

2. **Copy to your Home Assistant**:
   - Place `media-card.js` in `/config/www/` or `/config/www/cards/`

3. **Add to Lovelace resources**:
   - Go to **Settings** → **Dashboards** → **Resources**
   - Click **Add Resource**
   - **URL**: `/local/media-card.js` (or `/local/cards/media-card.js`)
   - **Resource Type**: `JavaScript Module`
   - Click **Create**

4. **Add the card to your dashboard**:
   - Edit your dashboard
   - Click **Add Card** → **Manual Card**
   - Add the YAML configuration (see examples below)

### Method 2: HACS (Community Store)

> **Note**: This card is not yet available in HACS. Manual installation required for now.

## 🚀 Quick Start

Add this basic configuration to get started:

```yaml
type: custom:media-card
title: "Security Camera"
media_type: image
media_path: media-source://media_source/local/cameras/front_door.jpg
```
## ⚙️ Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | **Required** | `custom:media-card` |
| `title` | string | `none` | Display title above media |
| `media_type` | string | `image` | `image` or `video` |
| `media_path` | string | **Required** | Path to your media file |
| `auto_refresh_seconds` | number | `0` | Auto-refresh interval (0 = disabled) |
| `show_refresh_button` | boolean | `false` | Show manual refresh button |
| `video_autoplay` | boolean | `false` | Auto-start video playbook |
| `video_loop` | boolean | `false` | Loop video continuously |
| `video_muted` | boolean | `false` | Start video muted |
| `hide_video_controls_display` | boolean | `false` | Hide "Video options" text |

## 📝 Configuration Examples

### 📸 Security Camera Snapshot
```yaml
type: custom:media-card
title: "Front Door Camera"
media_type: image
media_path: media-source://media_source/local/cameras/front_door.jpg
auto_refresh_seconds: 30
show_refresh_button: true
```

### 🎬 Dashcam Video
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

### 🖼️ Family Photos
```yaml
type: custom:media-card
title: "Today's Memories"
media_type: image
media_path: /local/photos/daily_photo.jpg
auto_refresh_seconds: 3600  # Update hourly
```

## 🛣️ Supported Path Formats

The card supports multiple path formats for maximum flexibility:

### Media Source URLs (Recommended)
```yaml
media_path: media-source://media_source/local/folder/file.mp4
media_path: media-source://media_source/camera/snapshot.jpg
```

### Direct Paths
```yaml
media_path: /local/images/photo.jpg
media_path: /media/videos/movie.mp4
media_path: /config/www/custom/file.png
```

## 🎯 Use Cases

### 🏠 **Home Security**
- Display latest camera snapshots
- Monitor dashcam footage
- Security system alerts

### 📱 **Smart Home Dashboard**
- Weather radar images
- Traffic camera feeds
- Package delivery photos

### 👨‍👩‍👧‍👦 **Family & Entertainment**
- Photo of the day
- Kids' latest artwork
- Pet monitoring cameras

### 🏢 **Business & Monitoring**
- Server room cameras
- Manufacturing process videos
- Equipment status displays

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
media_path: /local/videos/background.mp4
video_autoplay: true
video_loop: true
video_muted: true
hide_video_controls_display: true
```

## 🐛 Troubleshooting

### Media Not Loading?
1. **Check file path** - Use the built-in media browser to verify
2. **File permissions** - Ensure Home Assistant can read the file
3. **File format** - Verify the format is supported
4. **Browser console** - Check for error messages

### Auto-Refresh Not Working?
1. **Check interval** - Must be > 0 to enable
2. **File changes** - System detects Last-Modified header changes
3. **Media-source URLs** - Always refresh regardless of headers

### Media Browser Issues?
1. **Refresh the page** - Sometimes needed after installation
2. **Check resource URL** - Verify the JavaScript file is loaded correctly
3. **Console errors** - Look for JavaScript errors in browser console

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
