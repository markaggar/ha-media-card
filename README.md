# Home Assistant Media Card

A custom Home Assistant Dashboard card that displays images and videos with a built-in media browser for easy file selection. Perfect for displaying security camera snapshots, dashcam footage, family photos, or any media files stored in your Home Assistant media folder.  100% developed in VS Code by me directing GitHub Copilot with Claude Sonnet 4.0.

<img width="700" height="685" alt="image" src="https://github.com/user-attachments/assets/45dfe2cb-645e-4eb7-9042-994faf89273e" />

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

### Method 1: Manual Installation

1. **Download the card file**:
   Download the zip file or copy the contents of the ha-media-card.js from the repo

2. **Copy to your Home Assistant**:
   - Place (or create) `ha-media-card.js` in `/config/www/` or `/config/www/cards/` (and copy the repo ha-media-card.js contents to the file you just created)

3. **Add to Dashboard resources**:
   - Go to **Settings** → **Dashboards** → **Resources**
   - Click **Add Resource**
   - **URL**: `/local/ha-media-card.js?v1.0.19` (or `/local/cards/ha-media-card.js?v1.0.19`) (if you download a new version of media card in the future, increment the version number)
   - **Resource Type**: `JavaScript Module`
   - Click **Create**
  
4. **Refresh your browser cache (e.g. CTRL-F5, or restart the Home Assistant app on your phone).**

5. **Add the card to your dashboard**:
   - Edit your dashboard
   - Click **Add Card**
   - Search for Media Card

### Install via HACS


## 🚀 Quick Start

YAML Configuration (but use the UI, it's way simpler, and then you can show code and copy the YAML).

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
| `tap_action` | object | `none` | Action on single tap |
| `hold_action` | object | `none` | Action on tap and hold (0.5s+) |
| `double_tap_action` | object | `none` | Action on double tap |

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
media_path: media-source://synology_dsm/daily_photo.jpg_shared
auto_refresh_seconds: 3600  # Update hourly
```

### 👆 Interactive Media Card
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

## 🛣️ Supported Path Formats

The card supports multiple path formats for maximum flexibility:

### Media Source URLs (Recommended)
```yaml
media_path: media-source://media_source/local/folder/file.mp4
media_path: media-source://media_source/camera/snapshot.jpg
```

### Direct Paths (NOT TESTED, NOT RECOMMENDED, FRANKLY DOESN'T SEEM TO WORK AND I WILL NOT SPEND TIME ON THIS)
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
media_path: media-source://media_source/local/videos/background.mp4
video_autoplay: true
video_loop: true
video_muted: true
hide_video_controls_display: true
```

## HA Media Path config
Home Assistant media path setup has always been a bit confusing to me.  This is what I have in my configuration.yaml on my HA Dev instance.

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

## 🐛 Troubleshooting

### Media Not Loading?
1. **Check file path** - Use the built-in media browser to verify
2. **File permissions** - Ensure Home Assistant can read the file
3. **File format** - Verify the format is supported
4. **Browser console** - Check for error messages (F12 in the browser, click Console messages)

### Auto-Refresh Not Working?
1. **Check interval** - Must be > 0 to enable
2. **File changes** - System detects Last-Modified header changes
3. **Media-source URLs** - Always refresh regardless of headers

### Media Browser Issues?
1. **Refresh the page** - Sometimes needed after installation (CTRL-F5 to force cache to reload)
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
