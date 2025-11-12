# Configuration Reference

Complete guide to all configuration options for the Media Card.

## Quick Reference

### Basic Configuration

```yaml
type: custom:media-card
media_type: image              # image, video, or all
media_path: media-source://... # Path to media file or folder
folder_mode: random            # random, latest, or sequential
auto_refresh_seconds: 60       # Auto-refresh interval (0 = disabled)
```

## Core Configuration

### Media Source Selection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `media_type` | string | `image` | Media type filter: `image`, `video`, or `all` |
| `media_path` | string | **Required** | Path to media file or folder (media-source:// URI) |
| `folder_mode` | string | `null` | Display mode: `random`, `latest`, `sequential`, or `null` (single file) |

### Display Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | `null` | Card title (shown in header) |
| `hide_title` | boolean | `false` | Hide the card title |
| `aspect_mode` | string | `default` | Image scaling: `default`, `smart-scale`, `viewport-fit`, `viewport-fill` |

### Auto-Refresh

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_refresh_seconds` | number | `0` | Seconds between refreshes (0 = disabled) |
| `show_refresh_button` | boolean | `false` | Show manual refresh button |

## Folder Mode Configuration

### Random Mode Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `random_count` | number | `5` | Number of random files to select |
| `slideshow_window` | number | `1000` | Probability target for sampling (not a hard limit) |

### Latest Mode Options

**Filename Requirements**: Files must have timestamps in names for proper sorting.

Supported formats:
- `entity_snapshot_YYYYMMDD_HHMMSS.jpg`
- `IMG_YYYYMMDD_HHMMSS.jpg`
- `YYYY-MM-DD_HH-MM-SS.jpg`
- `YYYYMMDD.jpg`
- Unix timestamps (10 or 13 digits)

### Sequential Mode Options

Displays files in order from newest to oldest. Uses same timestamp detection as Latest mode.

## Slideshow Behavior

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `slideshow_behavior` | string | `smart_slideshow` | Slideshow mode: `smart_slideshow`, `cycle`, or `static` |
| `slideshow_window` | number | `1000` | Number of items for probability sampling |

### Slideshow Behavior Modes

**`smart_slideshow`** (Default)
- Prioritizes new content as it arrives
- Interrupts current display when fresh media appears
- Best for: Security monitoring, live feeds

**`cycle`**
- Round-robin through media collection
- No repeats until all items shown
- Best for: Photo galleries, diverse content

**`static`**
- Display media until manual navigation
- Auto-refresh updates current file in place
- Best for: Featured content, specific monitoring

## Hierarchical Scanning (SubfolderQueue)

For large nested folder structures:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `subfolder_queue.enabled` | boolean | `false` | Enable hierarchical folder scanning |
| `subfolder_queue.estimated_total_photos` | number | `null` | **Critical**: Estimated total files for consistent probability |
| `subfolder_queue.priority_folder_patterns` | array | `[]` | Folders to prioritize with weight multipliers |

### Priority Folder Patterns

```yaml
subfolder_queue:
  priority_folder_patterns:
    - path: "Camera Roll"      # Folder name or path pattern
      weight_multiplier: 3.0   # 3x selection probability
    - path: "Favorites"
      weight_multiplier: 2.5
```

### Recommended Values by Collection Size

#### Small Collection (< 1,000 files)

```yaml
slideshow_window: 500
subfolder_queue:
  enabled: true
  estimated_total_photos: 500
```

#### Medium Collection (1,000 - 10,000 files)

```yaml
slideshow_window: 1000
subfolder_queue:
  enabled: true
  estimated_total_photos: 5000
```

#### Large Collection (10,000+ files)

```yaml
slideshow_window: 1500
subfolder_queue:
  enabled: true
  estimated_total_photos: 25000
```

### Why `estimated_total_photos` is Critical

**Without estimate**: Early folders get over-represented because total count grows during discovery.

**With estimate**: Probability calculations stay consistent, ensuring true statistical fairness across all folders.

## Metadata Display

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_metadata` | boolean | `false` | Enable metadata display |
| `metadata_position` | string | `bottom-left` | Position: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `show_folder` | boolean | `false` | Show source folder path |
| `show_filename` | boolean | `false` | Show clean filename |
| `show_date` | boolean | `false` | Show extracted date |
| `show_file_position` | boolean | `false` | Show position (e.g., "3 of 15") |

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

hold_action:
  action: perform-action      # Call a service
  perform_action: camera.snapshot
  target:
    entity_id: camera.front_door
  data:
    filename: "/config/www/snapshots/manual.jpg"

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
- `url`: Open URL

## Kiosk Mode Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kiosk_mode.enabled` | boolean | `false` | Enable kiosk mode integration |
| `kiosk_mode.kiosk_entity` | string | **Required** | Input boolean entity controlling kiosk state |
| `kiosk_mode.exit_action` | string | `double_tap` | Exit gesture: `tap`, `double_tap`, `hold`, `swipe_down` |
| `kiosk_mode.show_exit_hint` | boolean | `true` | Show exit instruction overlay |

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

Professional photo display with all features enabled:

```yaml
type: custom:media-card
title: "Photo Gallery"
media_type: all
media_path: media-source://media_source/local/photos/
folder_mode: random

# Slideshow Configuration
slideshow_window: 1000
slideshow_behavior: smart_slideshow
auto_refresh_seconds: 90

# Hierarchical Scanning
subfolder_queue:
  enabled: true
  estimated_total_photos: 15000
  priority_folder_patterns:
    - path: "Camera Roll"
      weight_multiplier: 3.0
    - path: "Favorites"
      weight_multiplier: 2.5

# Rich Metadata Display
show_metadata: true
metadata_position: bottom-left
show_folder: true
show_filename: true
show_date: true

# Navigation & Controls
enable_navigation_zones: true
enable_keyboard_navigation: true
show_navigation_indicators: true
show_file_position: true

# Video Settings
video_autoplay: true
video_muted: true
video_loop: false

# Interactive Actions
tap_action:
  action: more-info
hold_action:
  action: navigate
  navigation_path: /dashboard

# Aspect Ratio
aspect_mode: smart-scale
```

---

**Next Steps:**
- [Examples](examples.md) - Real-world configuration examples
- [Features Guide](features.md) - Learn what each feature does
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
