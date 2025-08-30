# Home Assistant Media Card

A custom Home Assistant Lovelace card that displays images and MP4 videos from the media folder with a GUI editor for file selection.

## Features

- �� Display images (JPG, PNG, GIF, etc.) from Home Assistant media folder
- 🎬 Play MP4 videos with full controls (play, pause, seek, volume)
- 🎛️ GUI editor for easy media file selection and browsing
- 🎨 Responsive design that adapts to different screen sizes
- ⚙️ Video options: autoplay, loop, muted
- 📱 Touch-friendly interface
- 🏠 Full Home Assistant theme integration

## Installation

### HACS (Recommended)
1. Go to HACS in your Home Assistant
2. Click on "Frontend" 
3. Click the "+" button in the bottom right
4. Search for "Media Card"
5. Install the card
6. Add the resource to your Lovelace configuration (see below)

### Manual Installation
1. Download `media-card.js` from the latest release
2. Copy it to your `www` folder in Home Assistant config directory
3. Add the resource to your Lovelace configuration:

```yaml
resources:
  - url: /local/media-card.js
    type: module
```

Or via UI: Settings -> Dashboards -> Resources -> Add Resource

## Configuration

### Basic Configuration
```yaml
type: custom:media-card
media_type: image
media_path: /local/images/sunset.jpg
title: "Beautiful Sunset"
```

### Video Configuration
```yaml
type: custom:media-card
media_type: video
media_path: /local/videos/family-vacation.mp4
title: "Family Vacation"
video_autoplay: false
video_loop: true
video_muted: false
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | **Required** | Must be `custom:media-card` |
| `media_type` | string | `image` | Type of media: `image` or `video` |
| `media_path` | string | | Path to the media file (e.g., `/local/image.jpg`) |
| `title` | string | | Optional title displayed above the media |
| `video_autoplay` | boolean | `false` | Auto-play videos when card loads |
| `video_loop` | boolean | `false` | Loop videos when they finish |
| `video_muted` | boolean | `false` | Start videos muted |

## Usage

### Using the GUI Editor
1. Add the card to your dashboard
2. Click "Browse Media" button
3. Select from available media files
4. Configure video options if needed
5. The card will update automatically

### Media File Organization
For best results, organize your media files in the `www` directory:

```
config/
└── www/
    ├── images/
    │   ├── sunset.jpg
    │   ├── vacation.png
    │   └── family-photo.jpg
    └── videos/
        ├── pets.mp4
        ├── travel.mp4
        └── events.mp4
```

Access them in the card using paths like:
- `/local/images/sunset.jpg`
- `/local/videos/pets.mp4`

## Development

### Prerequisites
- Node.js 16+ and npm
- Home Assistant instance for testing

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development Commands
```bash
# Build for production
npm run build

# Build and watch for changes
npm run dev

# Serve built files locally
npm run serve
```

### Project Structure
```
ha-media-card/
├── src/
│   ├── media-card.js          # Main card component
│   ├── media-card-editor.js   # Configuration editor
│   └── index.js               # Entry point
├── dist/                      # Built files
├── package.json
├── rollup.config.js          # Build configuration
└── README.md
```

## Technical Details

### Based On
- **Home Assistant picture-entity-card**: Core structure and styling patterns
- **Gallery card**: Video playback implementation and media handling
- **Lit Element**: Modern web components framework

### Browser Support
- Chrome 63+
- Firefox 63+
- Safari 12+
- Edge 79+

### Home Assistant Compatibility
- Home Assistant 2021.12+
- Lovelace dashboards
- All themes supported

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Issues & Support

- Report bugs and feature requests on GitHub Issues
- Check existing issues before creating new ones
- Include Home Assistant version and card version in bug reports

## License

MIT License - see LICENSE file for details

## Changelog

### Version 1.0.0
- Initial release
- Image and video display support
- GUI media browser
- Video controls and options
- Home Assistant theme integration
