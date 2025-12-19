# Configuration Reference

Complete guide to all configuration options for the Media Card.

## Quick Reference

### Basic Configuration

**Single Media (one file)**:
```yaml
type: custom:media-card
media_source_type: single_media
single_media:
  path: >-
    media-source://media_source/local/ai_image_notifications/driveway_dogwalk_capture.mp4
  refresh_seconds: 60
media_type: video
title: Latest Dogwalk
auto_refresh_seconds: 60
video_autoplay: true
video_muted: true
hide_video_controls_display: true
aspect_mode: smart-scale
action_buttons:
  enable_fullscreen: true
```

**Folder Mode (random slideshow)**:
```yaml
type: custom:media-card
media_source_type: folder
media_type: image
folder:
  path: media-source://media_source/local/photos/
  mode: random      # random, sequential, or subfolder_queue
  recursive: true   # Include subfolders
auto_advance_duration: 60
```

**Folder Mode (sequential slide show)**
```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: media-source://media_source/media/photo/OneDrive
  mode: sequential
  recursive: true
  sequential:
    order_by: date_taken
    order_direction: desc
media_type: all
auto_advance_duration: 5
```

## Core Configuration

### Media Source Selection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `media_source_type` | string | **Required** | Source type: `single_media` or `folder` |
| `media_type` | string | `image` | Media type filter: `image`, `video`, or `all` |
| `single_media.path` | string | Required for single | Path to single media file |
| `single_media.refresh_seconds` | number | `0` | Auto-refresh interval for single media |
| `folder.path` | string | Required for folder | Path to folder (media-source:// URI) |
| `folder.mode` | string | `random` | Display mode: `random`, `sequential` |
| `folder.recursive` | boolean | `false` | Include subfolders in scan |

### Display Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | `null` | Card title (shown in header) |
| `hide_title` | boolean | `false` | Hide the card title |
| `aspect_mode` | string | `default` | Image scaling mode (see [Aspect Modes](features.md#aspect-modes)): `default` (fixed height), `smart-scale` (metadata-friendly), `viewport-fit` (maximize size), `viewport-fill` (edge-to-edge) |
| `max_height_pixels` | number | `null` | Maximum media height in pixels (applies only in default aspect mode) |

### Auto-Refresh

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_refresh_seconds` | number | `0` | Seconds between refreshes (0 = disabled) |
| `show_refresh_button` | boolean | `false` | Show manual refresh button |

## Folder Mode Configuration

### Random Mode Options

Use `folder.mode: random` for random file selection:

```yaml
media_source_type: folder
folder:
  path: media-source://media_source/local/photos/
  mode: random
  random_count: 10  # Optional: queue size
slideshow_window: 1000  # Optional: probability sampling window
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `folder.random_count` | number | `5` | Number of random files to select |
| `slideshow_window` | number | `1000` | Probability target for sampling (not a hard limit) |

### Sequential Mode Options

Use `folder.mode: sequential` for ordered playback:

```yaml
media_source_type: folder
folder:
  path: media-source://media_source/local/photos/
  mode: sequential
  sequential:
    order_by: filename
    order_direction: asc
```

**Filename Requirements**: Files must have timestamps in names for proper sorting.

Supported formats:
- `entity_snapshot_YYYYMMDD_HHMMSS.jpg`
- `IMG_YYYYMMDD_HHMMSS.jpg`
- `YYYY-MM-DD_HH-MM-SS.jpg`
- `YYYYMMDD.jpg`
- Unix timestamps (10 or 13 digits)

## Hierarchical Scanning (Folder with file system scanning)

```yaml
media_source_type: folder
folder:
  path: media-source://media_source/local/photos/
  mode: random
  recursive: true
  scan_depth: 3  # Optional: limit depth (null = unlimited)
  estimated_total_photos: 200000
  priority_new_files: true  # Prioritize recently modified files
  new_files_threshold_seconds: 3600  # Files modified within 1 hour (default: 3600)
  priority_folders:
    - pattern: "/DCIM/"
      weight: 3.0
    - pattern: "/Favorites/"
      weight: 2.0
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `folder.mode` | string | random | random or sequential |
| `folder.recursive` | boolean | `false` | Enable recursive subfolder scanning |
| `folder.scan_depth` | number | `null` | Maximum depth (null = unlimited) |
| `folder.priority_new_files` | boolean | `false` | Prioritize recently modified files in random selection |
| `folder.new_files_threshold_seconds` | number | `3600` | Time window in seconds for "new" file prioritization (default: 1 hour) |
| `folder.priority_folders` | array | `[]` | Folders to prioritize with weight multipliers |

### Why `estimated_total_photos` is Critical

**Without estimate**: Early folders get over-represented because total count grows during discovery.

**With estimate**: Probability calculations stay consistent, ensuring true statistical fairness across all folders.

## Overlay System

### Global Overlay Opacity

Control background opacity for all overlays with a single setting:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `overlay_opacity` | number | `0.25` | Background opacity for all overlays (0.0-1.0, where 0=transparent, 1=opaque) |

Affects: metadata, clock, display entities, position indicator overlays

### Clock/Date Overlay

Real-time clock and date display:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clock.enabled` | boolean | `false` | Enable clock/date overlay |
| `clock.position` | string | `bottom-left` | Position: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center-top`, `center-bottom` |
| `clock.show_time` | boolean | `true` | Display current time |
| `clock.show_date` | boolean | `true` | Display current date |
| `clock.format` | string | `12h` | Time format: `12h` or `24h` |
| `clock.date_format` | string | `long` | Date format: `long` (e.g., "Monday, January 1, 2025") or `short` (e.g., "Jan 1, 2025") |
| `clock.show_background` | boolean | `true` | Show semi-transparent background (uses `overlay_opacity`) |

**Example Configuration:**
```yaml
overlay_opacity: 0.3
clock:
  enabled: true
  position: top-right
  show_time: true
  show_date: true
  format: 24h
  date_format: short
  show_background: true
```

## Metadata Display

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_metadata` | boolean | `false` | Enable metadata display |
| `metadata_position` | string | `bottom-left` | Position: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `show_folder` | boolean | `false` | Show source folder path |
| `show_filename` | boolean | `false` | Show clean filename |
| `show_date` | boolean | `false` | Show extracted date |
| `show_file_position` | boolean | `false` | Show position (e.g., "3 of 15") |

## Action Buttons

Overlay buttons for quick access to card features:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `action_buttons.position` | string | `top-right` | Button position: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `action_buttons.enable_pause` | boolean | `true` | Show pause/resume button |
| `action_buttons.enable_fullscreen` | boolean | `false` | Show fullscreen button |
| `show_refresh_button` | boolean | `false` | Show manual refresh button |
| `debug_button` | boolean | `false` | Show debug mode toggle button |

### Media Index Action Buttons

Require Media Index integration:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `action_buttons.enable_favorite` | boolean | `true` | Show favorite toggle button |
| `action_buttons.enable_edit` | boolean | `true` | Show edit button (moves to _Edit folder) |
| `action_buttons.enable_delete` | boolean | `true` | Show delete button (moves to _Junk folder) |
| `action_buttons.enable_info` | boolean | `true` | Show metadata info panel button |
| `action_buttons.enable_burst_review` | boolean | `false` | Show burst review button (rapid-fire photos) |
| `action_buttons.enable_related_photos` | boolean | `false` | Show same date button |
| `action_buttons.enable_on_this_day` | boolean | `false` | Show through years button (this date across years) |

### Queue Preview Button

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `action_buttons.enable_queue_preview` | boolean | `false` | Show queue preview button |
| `action_buttons.auto_open_queue_preview` | boolean | `false` | Automatically open queue on card load |

### Smart Touchscreen Timeout

Action buttons automatically adjust visibility timeout based on number of visible buttons:
- **Base**: 3 seconds for ≤3 buttons
- **Scaling**: +1 second per additional button
- **Maximum**: 15 seconds for 12+ buttons
- **Mouse**: Hover shows/hides immediately (no timeout)

### Example Configuration

```yaml
action_buttons:
  position: top-right
  enable_pause: true
  enable_fullscreen: true
  enable_favorite: true
  enable_delete: true
  enable_edit: true
  enable_info: true
  enable_burst_review: true
  enable_related_photos: true
  enable_on_this_day: true
  enable_queue_preview: true
  auto_open_queue_preview: false
```

## Navigation Controls

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable_navigation_zones` | boolean | `false` | Enable left/right click areas for navigation |
| `enable_keyboard_navigation` | boolean | `false` | Enable arrow key navigation |
| `show_navigation_indicators` | boolean | `false` | Show visual navigation hints |

### Navigation Zones

When enabled, provides:
- **Left zone**: 80px × 120px rectangular button for Previous
- **Right zone**: 80px × 120px rectangular button for Next
- **Top-right**: Pause/Resume button (60px × 60px)
- **Center**: Main action area (tap/hold actions)

### Keyboard Shortcuts

Requires `enable_keyboard_navigation: true` and card must be focused (click on it first).

- `←` / `→` : Previous / Next file
- `↑` / `↓` : First / Last file
- `Space` : Next file
- `Enter` : Refresh current file
- `P` : Pause/Resume auto-refresh

## Video Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `video_autoplay` | boolean | `false` | Auto-start video playback |
| `video_loop` | boolean | `false` | Loop video continuously |
| `video_muted` | boolean | `false` | Start video muted |
| `hide_video_controls_display` | boolean | `false` | Hide "Video options" text |

### Video Completion Auto-Advance

When `auto_refresh_seconds > 0` and a video finishes playing:
- Slideshow automatically advances to next item
- Respects manual pause - won't advance if user paused video
- Works with all slideshow behaviors

## Interactive Actions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tap_action` | object | `none` | Action on single tap |
| `hold_action` | object | `none` | Action on tap and hold (0.5s+) |
| `double_tap_action` | object | `none` | Action on double tap |

### Action Configuration

```yaml
tap_action:
  action: more-info           # Action type
  entity: camera.front_door   # Target entity (if applicable)
  confirmation_message: "Show camera details?"  # Optional confirmation

hold_action:
  action: perform-action      # Call a service
  perform_action: camera.snapshot
  target:
    entity_id: camera.front_door
  data:
    filename: "/config/www/snapshots/manual.jpg"
  confirmation_message: "Save snapshot of {{filename}}?"  # Supports templates

double_tap_action:
  action: navigate           # Navigate to dashboard
  navigation_path: /lovelace/security
```

### Available Action Types

- `none`: No action
- `more-info`: Show entity info dialog
- `navigate`: Go to dashboard
- `perform-action`: Call Home Assistant service
- `toggle`: Toggle entity state
- `toggle-kiosk`: Toggle kiosk mode on/off
- `url`: Open URL
- `zoom`: Click to zoom image 2x at click point, click again to reset

### Confirmation Dialogs

Add `confirmation_message` to any action to show a styled confirmation dialog before executing:

```yaml
tap_action:
  action: perform-action
  perform_action: notify.mobile_app
  data:
    message: "Photo from {{location}}"
  confirmation_message: "Send {{filename}} from {{folder}} ({{date}}) to phone?"
```

**Template Variables:**
- `{{filename}}` - Filename without extension
- `{{filename_ext}}` - Filename with extension
- `{{folder}}` - Folder name
- `{{folder_path}}` - Full folder path
- `{{media_path}}` - Complete media path
- `{{date}}` - Formatted date (from EXIF or file)
- `{{date_time}}` - Date and time
- `{{location}}` - "City, State, Country" (from GPS)
- `{{city}}`, `{{state}}`, `{{country}}` - Individual location components

## Kiosk Mode Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kiosk_mode.enabled` | boolean | `false` | Enable kiosk mode integration |
| `kiosk_mode.kiosk_entity` | string | **Required** | Input boolean entity controlling kiosk state |
| `kiosk_mode.show_exit_hint` | boolean | `true` | Show exit instruction overlay |

Set the appropriate action (tap/double-tap/hold) to Kiosk Mode toggle to exit kiosk mode using an action.

### Prerequisites

1. Install [Kiosk Mode HACS integration](https://github.com/NemesisRE/kiosk-mode)
2. Create input boolean:

```yaml
input_boolean:
  kiosk_mode:
    name: "Kiosk Mode"
    icon: mdi:fullscreen
```

3. Configure kiosk mode in dashboard view:

```yaml
kiosk_mode:
  hide_header: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
  hide_sidebar: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
```

## Media Index Integration

Enhanced metadata with Media Index backend:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `media_index.entity_id` | string | **Required** | Media Index sensor entity |
| `media_index.show_favorite_button` | boolean | `false` | Show favorite toggle button |
| `media_index.show_edit_button` | boolean | `false` | Show edit media button |
| `media_index.show_delete_button` | boolean | `false` | Show delete media button |
| `media_index.show_location` | boolean | `false` | Show location data (city, country) |
| `media_index.show_date_taken` | boolean | `false` | Show EXIF date taken |

### Requirements

- [Media Index integration](https://github.com/markaggar/ha-media-index) installed
- Sensor entity configured and scanning
- Network share or filesystem paths (not `media-source://media_source/local/`)

### Compatibility Note

Media Index **cannot** work with local HA folders (`/config/www/local/`) due to path format mismatch. Use folder-based scanning for local content, or Media Index with network shares.

## Debug Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `debug_mode` | boolean | `false` | Enable general card debug logging to browser console |
| `debug_queue_mode` | boolean | `false` | Enable SubfolderQueue debug UI overlay |
| `suppress_subfolder_logging` | boolean | `false` | Suppress SubfolderQueue console logs (keeps other debug_mode logs) |

### Debug Mode Features

**`debug_mode: true`**
- Detailed console logging of all card operations
- Provider state changes logged
- Media loading and error details
- Navigation and slideshow behavior logs

**`debug_queue_mode: true`**
- Visual overlay showing SubfolderQueue state
- Folder statistics and probability calculations
- Discovery progress indicator
- Current queue composition

**`suppress_subfolder_logging: true`**
- Reduces console spam from subfolder scanning
- Keeps other debug_mode logs active
- Useful when debugging non-queue issues

### Automatic Debug Enable

Debug logging automatically enables when:
- `debug_mode: true` in configuration
- OR accessing from `localhost` (development convenience)

## Path Format

### Media Source URIs

All media paths must use Home Assistant's media-source URI format:

```yaml
# Local folder
media_path: media-source://media_source/local/folder/

# Specific file
media_path: media-source://media_source/local/folder/file.jpg

# Camera folder
media_path: media-source://media_source/camera/
```

### Home Assistant Media Configuration

Ensure your `configuration.yaml` has media directories configured:

```yaml
homeassistant:
  media_dirs:
    media: /media
    camera: /config/camera
    local: /config/www/local
  allowlist_external_dirs:
    - "/config/www/local"
    - "/media"
```

### Referring to Media Outside Card

**For camera.snapshot service**:

```yaml
service: camera.snapshot
target:
  entity_id: camera.front_door
data:
  filename: /config/www/local/snapshots/capture.jpg
```

**For AI services (Google Gemini, etc.)**:

```yaml
service: ai_task.generate_data
data:
  attachments:
    - media_content_id: media-source://media_source/local/snapshots/capture.jpg
      media_content_type: image/jpeg
```

## Complete Configuration Example

Automatice photo display using media index with most common features enabled:

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: media-source://media_source/media/photo/OneDrive
  mode: random
  recursive: true
  priority_new_files: true
  new_files_threshold_seconds: 3600
media_type: all
auto_advance_duration: 5
show_metadata: true
enable_navigation_zones: true
title: ""
media_index:
  entity_id: sensor.media_index_media_photo_onedrive_total_files
media_path: ""
video_autoplay: true
video_muted: true
hide_video_controls_display: true
aspect_mode: smart-scale
show_position_indicator: false
show_dots_indicator: false
metadata:
  show_root_folder: true
  show_filename: false
  position: bottom-right
action_buttons:
  enable_fullscreen: true
  position: top-left
tap_action:
  action: zoom
double_tap_action:
  action: toggle-kiosk
kiosk_mode_entity: input_boolean.kiosk_mode
```

---

**Next Steps:**
- [Examples](examples.md) - Real-world configuration examples
- [Features Guide](features.md) - Learn what each feature does
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
