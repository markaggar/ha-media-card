# Configuration Examples

Real-world configurations organized by use case. Copy and adapt these examples for your own setup.

## Security & Monitoring

### Latest Security Camera Snapshot

Display the most recent image from a security camera folder:

```yaml
type: custom:media-card
title: "Front Door Camera"
media_type: image
media_path: media-source://media_source/local/security/front_door/
folder_mode: latest
auto_refresh_seconds: 30
show_refresh_button: true
enable_navigation_zones: true
show_file_position: true
show_metadata: true
metadata_position: top-right
show_filename: true
show_date: true
```

**What it does:**
- Shows newest image from folder every 30 seconds
- Manual refresh button for immediate update
- Click left/right to review previous captures
- Timestamp and filename shown in corner

### Multi-Camera Security Monitor

Combined view of multiple camera feeds:

```yaml
type: custom:media-card
title: "Security Monitor"
media_type: image
media_path: media-source://media_source/local/security/
folder_mode: latest
slideshow_behavior: smart_slideshow
slideshow_window: 500
auto_refresh_seconds: 10
aspect_mode: viewport-fit
show_metadata: true
metadata_position: top-left
show_folder: true
show_date: true
tap_action:
  action: navigate
  navigation_path: /lovelace/security
```

**What it does:**
- Prioritizes newest images from any camera
- Updates every 10 seconds
- Shows which camera captured image
- Tap to navigate to full security dashboard

### Dashcam Latest Clips

Latest dashcam footage with video playback:

```yaml
type: custom:media-card
title: "Dashcam - Latest Footage"
media_type: video
media_path: media-source://media_source/local/dashcam/
folder_mode: latest
auto_refresh_seconds: 60
video_autoplay: true
video_muted: true
enable_navigation_zones: true
show_file_position: true
```

**What it does:**
- Shows most recent dashcam video
- Auto-plays muted (won't disturb)
- Navigate through recent clips with click zones
- Automatically checks for new footage every minute

## Family & Photo Galleries

### Random Family Photo Slideshow

Rotating family photo display:

```yaml
type: custom:media-card
title: "Family Memories"
media_type: image
media_path: media-source://media_source/local/photos/family/
folder_mode: random
random_count: 10
auto_refresh_seconds: 180  # 3 minutes per photo
enable_navigation_zones: true
enable_keyboard_navigation: true
show_navigation_indicators: true
show_file_position: true
show_metadata: true
metadata_position: bottom-right
show_filename: true
show_date: true
aspect_mode: smart-scale
```

**What it does:**
- Randomly selects 10 photos
- Changes every 3 minutes
- Arrow keys navigate through selection
- Shows photo date and filename
- Smart scaling prevents scrolling

### Priority Recent Photos

Photo gallery with recent photos prioritized:

```yaml
type: custom:media-card
title: "Photo Gallery"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
slideshow_window: 1000
auto_refresh_seconds: 120
subfolder_queue:
  enabled: true
  estimated_total_photos: 5000
  priority_folder_patterns:
    - path: "Camera Roll"
      weight_multiplier: 3.0
    - path: "Favorites"
      weight_multiplier: 2.5
show_metadata: true
metadata_position: bottom-left
show_folder: true
show_date: true
enable_keyboard_navigation: true
aspect_mode: smart-scale
```

**What it does:**
- Scans nested photo folders
- Camera Roll photos appear 3× more often
- Favorites appear 2.5× more often
- Changes every 2 minutes
- Shows source folder and date

### Large Photo Collection (10,000+ photos)

Optimized configuration for massive collections:

```yaml
type: custom:media-card
title: "Photo Archive"
media_type: image
media_path: media-source://media_source/local/photos/archive/
folder_mode: random
slideshow_window: 1500
slideshow_behavior: smart_slideshow
auto_refresh_seconds: 90
subfolder_queue:
  enabled: true
  estimated_total_photos: 25000
  priority_folder_patterns:
    - path: "2024"
      weight_multiplier: 3.0
    - path: "2023"
      weight_multiplier: 2.0
show_metadata: true
metadata_position: bottom-left
show_folder: true
show_filename: true
show_date: true
enable_navigation_zones: true
aspect_mode: smart-scale
```

**What it does:**
- Handles 25,000+ photos efficiently
- Prioritizes recent years
- Progressive folder discovery (no startup delay)
- Changes every 90 seconds
- Full metadata display

## Kiosk & Display Mode

### Photo Frame Kiosk

Fullscreen photo display with exit control:

```yaml
type: custom:media-card
title: "Photo Frame"
media_type: image
media_path: media-source://media_source/local/photos/family/
folder_mode: random
random_count: 20
auto_refresh_seconds: 60
aspect_mode: viewport-fit
kiosk_mode:
  enabled: true
  kiosk_entity: input_boolean.photo_frame_kiosk
  exit_action: double_tap
  show_exit_hint: true
show_metadata: true
metadata_position: bottom-right
show_date: true
enable_navigation_zones: false
show_navigation_indicators: false
```

**What it does:**
- Clean fullscreen photo display
- Double-tap anywhere to exit kiosk mode
- Changes photo every minute
- Shows date in corner
- No navigation clutter

### Security Monitor Kiosk

Locked-down security display:

```yaml
type: custom:media-card
title: "Security Feed"
media_type: image
media_path: media-source://media_source/local/security/
folder_mode: latest
auto_refresh_seconds: 10
aspect_mode: viewport-fill
kiosk_mode:
  enabled: true
  kiosk_entity: input_boolean.security_kiosk
  exit_action: hold
  show_exit_hint: true
show_metadata: true
metadata_position: top-left
show_folder: false
show_filename: true
show_date: true
```

**What it does:**
- Fullscreen security feed
- Tap and hold to exit (prevents accidental exits)
- Updates every 10 seconds
- Shows timestamp and camera name
- Fills entire viewport

## Mixed Media & Advanced

### Random Media Gallery (Photos + Videos)

Combined image and video slideshow:

```yaml
type: custom:media-card
title: "Media Gallery"
media_type: all
media_path: media-source://media_source/local/media/
folder_mode: random
random_count: 15
auto_refresh_seconds: 120
video_autoplay: true
video_muted: true
enable_navigation_zones: true
enable_keyboard_navigation: true
show_file_position: true
show_metadata: true
metadata_position: bottom-left
show_filename: true
```

**What it does:**
- Randomly shows both photos and videos
- Videos auto-play when displayed
- Advances when video finishes (if not manually paused)
- Keyboard arrow keys navigate
- Changes every 2 minutes

### Interactive Camera Snapshot

Camera display with service actions:

```yaml
type: custom:media-card
title: "Front Door Camera"
media_type: image
media_path: media-source://media_source/local/cameras/front_door.jpg
auto_refresh_seconds: 30
show_refresh_button: true
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

**What it does:**
- Updates every 30 seconds
- Tap: Show camera entity details
- Hold: Trigger manual snapshot
- Double-tap: Navigate to security dashboard

### Actions with Confirmation Dialogs

Add confirmation prompts with template variables:

```yaml
type: custom:media-card
title: "Photo Library"
media_source: media_index
media_index_entity: sensor.media_index_photos
slideshow_interval: 10
tap_action:
  action: perform-action
  perform_action: notify.mobile_app_phone
  data:
    message: "Photo from {{location}}"
    data:
      image: "{{media_path}}"
  confirmation_message: "Send {{filename}} taken on {{date}} to your phone?"
hold_action:
  action: perform-action
  perform_action: script.delete_media_file
  data:
    file_path: "{{media_path}}"
  confirmation_message: "Delete {{filename}} from {{folder}}? This cannot be undone."
double_tap_action:
  action: perform-action
  perform_action: script.add_to_favorites
  data:
    file: "{{media_path}}"
    date: "{{date_time}}"
    location: "{{location}}"
  confirmation_message: "Add {{filename}} ({{city}}, {{country}}) to favorites?"
```

**What it does:**
- Tap: Send photo to mobile device (with confirmation showing filename & date)
- Hold: Delete current photo (with confirmation showing filename & folder)
- Double-tap: Add to favorites (with confirmation showing location details)
- All actions show styled confirmation dialogs with media context

**Available Templates:**
- `{{filename}}`, `{{filename_ext}}` - File names
- `{{folder}}`, `{{folder_path}}` - Folder info
- `{{date}}`, `{{date_time}}` - Date information
- `{{location}}`, `{{city}}`, `{{state}}`, `{{country}}` - GPS data
- `{{media_path}}` - Complete file path

## Panel Mode Configurations

### Fullscreen Photo Panel

Optimized for panel view dashboards:

```yaml
type: custom:media-card
media_type: image
media_path: media-source://media_source/local/wallpapers/
folder_mode: random
auto_refresh_seconds: 300  # 5 minutes
aspect_mode: viewport-fit
hide_title: true
show_metadata: false
enable_navigation_zones: false
```

**What it does:**
- Fills entire panel viewport
- No header or metadata clutter
- Changes every 5 minutes
- Perfect for background displays

### Mixed Orientation Panel

Handles portrait and landscape images without scrolling:

```yaml
type: custom:media-card
title: "Photo Panel"
media_type: image
media_path: media-source://media_source/local/photos/
folder_mode: random
auto_refresh_seconds: 120
aspect_mode: smart-scale  # Prevents scrolling on tall images
enable_navigation_zones: true
show_file_position: true
```

**What it does:**
- Limits image height to 90% viewport
- No scrolling on portrait photos
- Click zones for navigation
- Changes every 2 minutes

## Media Index Integration

### Photo Slideshow with Metadata

Requires [Media Index integration](https://github.com/markaggar/ha-media-index):

```yaml
type: custom:media-card
title: "Photo Slideshow"
media_type: image
folder_mode: random
auto_refresh_seconds: 60
media_index:
  entity_id: sensor.media_index_photos_total_files
  show_favorite_button: true
  show_edit_button: true
  show_delete_button: true
  show_location: true
  show_date_taken: true
show_metadata: true
metadata_position: bottom-right
enable_navigation_zones: true
```

**What it does:**
- Shows photo location (city, country)
- EXIF date taken displayed
- Favorite button to curate photos
- Edit/delete buttons for management
- Database-backed random selection

### Location-Based Photo Display

Filter photos by location (requires Media Index):

```yaml
type: custom:media-card
title: "Vacation Photos"
media_type: image
folder_mode: random
auto_refresh_seconds: 90
media_index:
  entity_id: sensor.media_index_vacation_photos
  show_location: true
  show_date_taken: true
  show_favorite_button: true
show_metadata: true
metadata_position: bottom-left
aspect_mode: smart-scale
enable_keyboard_navigation: true
```

**What it does:**
- Shows photos from specific location
- Displays city and country
- Shows when photo was taken
- Favorite button for curation

## Performance Optimized

### Very Large Folder (Static Behavior)

For folders with thousands of files:

```yaml
type: custom:media-card
title: "Photo Archive"
media_type: image
media_path: media-source://media_source/local/photos/archive/
folder_mode: random
slideshow_behavior: static  # Stay on current until navigation
slideshow_window: 2000
auto_refresh_seconds: 120
enable_navigation_zones: true
enable_keyboard_navigation: true
show_file_position: true
```

**What it does:**
- Handles very large folders efficiently
- Stays on current photo until you navigate
- Auto-refresh updates current file
- Efficient memory usage

### Sequential Review with Video

Review media chronologically:

```yaml
type: custom:media-card
title: "Security Review"
media_type: all
media_path: media-source://media_source/local/security/
folder_mode: sequential
auto_refresh_seconds: 30
video_autoplay: true
video_muted: true
enable_navigation_zones: true
enable_keyboard_navigation: true
show_file_position: true
show_metadata: true
metadata_position: top-right
show_filename: true
show_date: true
```

**What it does:**
- Shows files in chronological order (newest first)
- Videos auto-play and advance when done
- Navigate with arrow keys or click zones
- See position in timeline
- Timestamp and filename shown

## Home Automation Integration

### Motion-Triggered Display

Update display when motion detected (combine with automation):

```yaml
# Media Card Configuration
type: custom:media-card
title: "Latest Motion Alert"
media_type: image
media_path: media-source://media_source/local/motion/
folder_mode: latest
auto_refresh_seconds: 5
show_metadata: true
metadata_position: top-left
show_date: true
```

```yaml
# Automation to capture on motion
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

**What it does:**
- Automation saves snapshot with timestamp
- Card refreshes every 5 seconds
- Shows latest motion alert automatically
- Timestamp displayed

### Timed Kiosk Mode

Automatically enable kiosk mode at specific times:

```yaml
# Media Card Configuration
type: custom:media-card
title: "Evening Slideshow"
media_type: image
media_path: media-source://media_source/local/photos/family/
folder_mode: random
auto_refresh_seconds: 60
aspect_mode: viewport-fit
kiosk_mode:
  enabled: true
  kiosk_entity: input_boolean.evening_kiosk
  exit_action: double_tap
  show_exit_hint: true
```

```yaml
# Automation for timed kiosk
automation:
  - alias: "Enable Evening Kiosk"
    trigger:
      platform: time
      at: "18:00:00"
    action:
      service: input_boolean.turn_on
      target:
        entity_id: input_boolean.evening_kiosk

  - alias: "Disable Morning Kiosk"
    trigger:
      platform: time
      at: "07:00:00"
    action:
      service: input_boolean.turn_off
      target:
        entity_id: input_boolean.evening_kiosk
```

**What it does:**
- Enters kiosk mode at 6 PM
- Exits kiosk mode at 7 AM
- Double-tap to manually exit anytime

---

## Tips for Creating Your Own

**Start Simple:**
- Begin with basic configuration (media_type, media_path, folder_mode)
- Add auto_refresh for dynamic content
- Enable navigation once you have multiple files

**Add Features Gradually:**
- Enable metadata display if you need context
- Add keyboard navigation for easier browsing
- Configure slideshow behavior for your use case

**Optimize for Your Collection:**
- Small collections (<1K): Use basic random/latest modes
- Medium collections (1-10K): Enable subfolder scanning
- Large collections (10K+): Set estimated_total_photos for fairness

**Test and Iterate:**
- Enable debug_mode to understand behavior
- Adjust auto_refresh_seconds for your needs
- Tweak slideshow_window for performance

---

**Need More Help?**
- [Features Guide](features.md) - What each feature does
- [Configuration Reference](configuration.md) - Complete parameter documentation
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
