# Example Home Assistant Dashboard Configuration

## Basic Image Card
```yaml
type: custom:media-card
media_type: image
media_path: /local/images/sunset.jpg
title: "Beautiful Sunset"
```

## Video Card with Options
```yaml
type: custom:media-card
media_type: video
media_path: /local/videos/family-vacation.mp4
title: "Family Vacation Highlights"
video_autoplay: false
video_loop: true
video_muted: false
```

## Multiple Cards in a Grid
```yaml
type: grid
columns: 2
cards:
  - type: custom:media-card
    media_type: image
    media_path: /local/photos/garden.jpg
    title: "Garden Photos"
    
  - type: custom:media-card
    media_type: video
    media_path: /local/videos/pets.mp4
    title: "Pet Moments"
    video_loop: true
    video_muted: true

  - type: custom:media-card
    media_type: image
    media_path: /local/images/vacation.png
    title: "Vacation 2025"
    
  - type: custom:media-card
    media_type: video
    media_path: /local/videos/events.mp4
    title: "Special Events"
    video_autoplay: false
```

## Installation Steps

1. **Download the Card**
   - Copy `media-card.js` to your `config/www/` directory

2. **Add Resource to Lovelace**
   ```yaml
   resources:
     - url: /local/media-card.js
       type: module
   ```

3. **Add Card to Dashboard**
   - Edit your dashboard
   - Add card manually or use the visual editor
   - Search for "Media Card" in the card picker

4. **Configure Your Media**
   - Use the GUI browser to select files
   - Or manually specify paths in YAML
   - Media files should be in the `www` directory

## File Organization Tips

```
config/
└── www/
    ├── images/
    │   ├── family/
    │   │   ├── vacation-2024.jpg
    │   │   └── holidays.png
    │   └── nature/
    │       ├── sunset.jpg
    │       └── garden.jpg
    └── videos/
        ├── pets/
        │   ├── cat-compilation.mp4
        │   └── dog-tricks.mp4
        └── events/
            ├── birthday-2024.mp4
            └── wedding.mp4
```

Access files using paths like:
- `/local/images/family/vacation-2024.jpg`
- `/local/videos/pets/cat-compilation.mp4`
