# YAML-Only Configuration Options

Some Media Card features are only configurable by editing the card's YAML directly. These options are intentionally omitted from the visual editor because they require list or nested inputs that are easier to express in YAML, or aren't broadly applicable to a large number of users.

To edit YAML in Home Assistant:
1. Open the card editor
2. Click **"Show code editor"** (bottom-left of the editor panel)
3. Make your changes and click **Save**

---

## Folder Filtering

### `excluded_paths`

Exclude media from specific subfolder paths using glob-style patterns. Useful for filtering out burst shots, thumbnails, temp folders, etc.

```yaml
excluded_paths:
  - "Burst/**"           # Exclude a specific subfolder and all its contents
  - "**/Thumbnails/**"   # Exclude any folder named "Thumbnails" at any depth
  - "**/_Junk/**"        # Exclude any hidden/junk folders
  - "/Archive/Old/**"    # Matches any "Archive/Old" segment at any depth (see note below)
```

| Pattern | Behaviour |
|---------|-----------|
| `Burst/**` | Matches `Burst/` folder and all contents at any depth |
| `**/Name/**` | Matches any folder named `Name` anywhere in the tree, recursively |
| `**/Name` | Matches only the folder named `Name`, not its subfolders |
| `/Exact/Path/**` | Segment-boundary match for `Exact/Path` — the leading `/` is notation, not a strict root anchor |
| `2024-??-*` | Glob wildcards: `?` = single char, `*` = any chars within one segment |

> **Note on leading `/`**: A pattern like `/Screenshots` is **not** strictly anchored to the root of your media folder. It matches any folder named `Screenshots` at any path-segment boundary — the same as writing `**/Screenshots`. The leading `/` is just a visual convention. To narrow the match, use a longer path, e.g. `/PhotoLibrary/Screenshots/**`.

Patterns are **case-insensitive** and matched against the **folder path**, not the filename.

See [configuration.md — Path Exclusion Filtering](configuration.md#path-exclusion-filtering) for full documentation.

---

## Folder / New Files Priority

### `folder.priority_new_files`

Prepend recently indexed files to the random selection queue, so newly added photos appear sooner.

```yaml
folder:
  path: media-source://media_source/media/Photo/
  mode: random
  priority_new_files: true
  new_files_threshold_seconds: 3600  # Files indexed within this window are "new" (default: 3600)
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `priority_new_files` | boolean | `false` | Prioritise recently indexed files |
| `new_files_threshold_seconds` | integer | `3600` | Time window (seconds) that defines "new" files |

---

## Folder / Hierarchical Scanning

These options apply when `folder.recursive: true` and `use_media_index_for_discovery: false` (filesystem scanning mode).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `folder.scan_depth` | integer | unlimited | Maximum subfolder levels to scan |
| `folder.estimated_total_photos` | integer | auto | Approximate total count; improves probability sampling. See [configuration.md](configuration.md#why-estimated_total_photos-is-critical) |

```yaml
folder:
  path: media-source://media_source/media/Photo/
  recursive: true
  scan_depth: 4
  estimated_total_photos: 5000
```

---

## Slideshow Window

### `slideshow_window`

Controls how many items are fetched per batch from the database, and how frequently the card checks for new files.

```yaml
slideshow_window: 100   # Default: 100
```

Increase this value if you have large excluded folders so the provider can scan through more items per cycle before refilling.

---

## Display Entities

The entity **list** itself must be defined in YAML (the visual editor only exposes the on/off toggle and timing options).

```yaml
display_entities:
  enabled: true
  cycle_interval: 10
  entities:
    - entity: sensor.weather_temperature
      label: "Temperature"
    - entity: sensor.living_room_humidity
      label: "Humidity"
    - entity: binary_sensor.front_door
      label: "Front Door"
```

See [configuration.md — Metadata Display](configuration.md#metadata-display) for full schema.

---

## Mute Preference Timeout

### `mute_preference_timeout`

Controls how long the user's manual mute/unmute choice persists before reverting to the `video_muted` default.

```yaml
mute_preference_timeout: 300   # Seconds (default: 300 = 5 minutes)
# Set to 0 to never expire (persists until page refresh)
```

---

## Debug Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `debug_mode` | boolean | `false` | Enable verbose per-item debug logging in browser console |
| `debug_queue_mode` | boolean | `false` | Log full WebSocket request/response payloads for media_index queries |

```yaml
debug_mode: true          # Enables [card-id] debug logs
debug_queue_mode: true    # Enables full WebSocket payload logging
```

---

## Live Photo Playback

### `live_photo`

Pairs a still image with a companion video (iCloud-style Live Photos). When enabled, the card shows the still briefly, overlays the companion video once, then waits before replaying. The motion loop does not advance the slideshow — normal `auto_advance_seconds` controls when the card moves to the next photo.

Companion video discovery tries each combination of `video_suffixes` × `video_extensions` appended to the still image's base name (e.g. `IMG_1234_HEVC.MOV`, `IMG_1234.mov`, etc.).

```yaml
live_photo:
  enabled: true
  still_duration: 1           # Seconds to show the still before playing motion
  repeat_delay: 10            # Seconds to wait after motion ends before replaying
  hide_companion_videos: true # Exclude companion videos from the normal slideshow queue
  video_suffixes:
    - "_HEVC"
    - "-HEVC"
    - ""
  video_extensions:
    - MOV
    - mov
    - mp4
    - MP4
    - m4v
    - M4V
  still_extensions:
    - JPG
    - jpg
    - JPEG
    - jpeg
    - PNG
    - png
    - WEBP
    - webp
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `live_photo.enabled` | boolean | `false` | Enable still + companion video pairing |
| `live_photo.still_duration` | number | `1` | Seconds to show the still before playing companion video |
| `live_photo.repeat_delay` | number | `10` | Seconds to wait after companion video ends before replaying |
| `live_photo.hide_companion_videos` | boolean | `true` | Hide companion videos from the normal slideshow queue |
| `live_photo.video_suffixes` | list | `["_HEVC", "-HEVC", ""]` | Suffixes tried when locating the companion video |
| `live_photo.video_extensions` | list | `["MOV", "mov", "mp4", "MP4", "m4v", "M4V"]` | Extensions tried when locating the companion video |
| `live_photo.still_extensions` | list | `["JPG", "jpg", ...]` | Still-image extensions used when identifying a video as a companion |

---

## iCloud Photos Preset

### `icloud_photos`

A convenience preset that configures the card for an iCloud Photos sync folder in one block. When `icloud_photos.enabled: true`, the card automatically sets `media_source_type: folder`, enables recursion, allows all media types, and applies Live Photo defaults. Individual settings in `folder` and `live_photo` override the preset.

The card does **not** authenticate to iCloud. Use a server-side add-on (e.g. [AncilTech iCloud Photo Sync](https://github.com/anciltech/ha-icloud-photo-sync)) to sync photos into `/media/icloud_photos`, then point the card at that folder.

```yaml
icloud_photos:
  enabled: true
  album: Favorites          # Optional sub-folder below the sync root
  media_source_path: media-source://media_source/local/icloud_photos
live_photo:
  still_duration: 1
  repeat_delay: 10
heic:
  enabled: true
auto_advance_seconds: 60
video_muted: true
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `icloud_photos.enabled` | boolean | `false` | Apply iCloud Photos display defaults |
| `icloud_photos.media_source_path` | string | `media-source://media_source/local/icloud_photos` | Root folder written by the sync backend |
| `icloud_photos.album` | string | `""` | Album sub-folder below the sync root |

---

## HEIC/HEIF Browser Conversion

### `heic`

Converts `.heic` and `.heif` files in the browser before display using the [`heic2any`](https://github.com/alexcorvi/heic2any) library. Enabled by default. Server-side JPEG conversion (e.g. via the iCloud sync add-on) is faster for always-on dashboards; this option is a useful fallback when unconverted originals reach the card.

```yaml
heic:
  enabled: true
  library_url: https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js
  output_type: image/jpeg
  quality: 0.92
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `heic.enabled` | boolean | `true` | Convert HEIC/HEIF images before display |
| `heic.library_url` | string | CDN URL above | URL for the converter script; host a local copy for offline dashboards |
| `heic.output_type` | string | `image/jpeg` | Output MIME type |
| `heic.quality` | number | `0.92` | JPEG quality (0–1) |

To disable HEIC conversion entirely (e.g. if your browser natively supports HEIC):

```yaml
heic:
  enabled: false
```

---

## Media Preloading

### `preload`

Controls off-DOM media preparation before the card switches to a new item. Enabled by default. Preloading helps avoid partially-painted images on slow hardware and lets rapid manual navigation discard stale in-flight loads immediately.

```yaml
preload:
  enabled: true
  image_decode: true
  video_mode: metadata      # metadata | canplay | none
  video_timeout_ms: 3000
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `preload.enabled` | boolean | `true` | Prepare media off-DOM before display |
| `preload.image_decode` | boolean | `true` | Call `image.decode()` before showing the image |
| `preload.video_mode` | string | `metadata` | Wait for `loadedmetadata`, `canplay`, or skip (`none`) |
| `preload.video_timeout_ms` | number | `3000` | Max milliseconds to wait for video preparation before displaying anyway |

---

## Sequential Mode — Date Range Filter

The visual editor exposes start/end date inputs, but values can also be **Home Assistant entity IDs**. When an entity ID is used, the card reads the entity's current state as the date (stripping any time component). This lets you drive the date range from input helpers or sensors.

```yaml
folder:
  mode: sequential
  use_media_index_for_discovery: true
  sequential:
    order_by: date_taken
    order_direction: desc
filters:
  date_range:
    start: input_datetime.photo_filter_start   # HA entity ID
    end: "2025-12-31"                          # or a static YYYY-MM-DD string
```

---

## Full Example with YAML-Only Options

```yaml
type: custom:media-card

# ── Media source ──────────────────────────────────────────────────────────────
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/PhotoLibrary/
  mode: sequential
  recursive: true
  use_media_index_for_discovery: true
  scan_depth: 4                        # Max subfolder depth (filesystem scan mode)
  estimated_total_photos: 5000         # Improves probability sampling
  priority_new_files: false
  new_files_threshold_seconds: 3600
  sequential:
    order_by: date_taken
    order_direction: desc

# ── Filtering ─────────────────────────────────────────────────────────────────
excluded_paths:
  - "Burst/**"
  - "**/Thumbnails/**"
  - "**/.thumbnails/**"

filters:
  date_range:
    start: "2023-01-01"                # YYYY-MM-DD string or HA entity ID
    end: input_datetime.photo_end_date # entity state is read at query time

# ── Live Photo playback ───────────────────────────────────────────────────────
live_photo:
  enabled: false
  still_duration: 1
  repeat_delay: 10
  hide_companion_videos: true
  video_suffixes:
    - "_HEVC"
    - "-HEVC"
    - ""
  video_extensions:
    - MOV
    - mov
    - mp4
    - MP4
    - m4v
    - M4V

# ── iCloud Photos preset (overrides folder/live_photo defaults when enabled) ──
icloud_photos:
  enabled: false
  media_source_path: media-source://media_source/local/icloud_photos
  album: ""                            # Optional sub-folder, e.g. "Favorites"

# ── HEIC/HEIF browser conversion ─────────────────────────────────────────────
heic:
  enabled: true
  library_url: https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js
  output_type: image/jpeg
  quality: 0.92

# ── Media preloading ──────────────────────────────────────────────────────────
preload:
  enabled: true
  image_decode: true
  video_mode: metadata                 # metadata | canplay | none
  video_timeout_ms: 3000

# ── Slideshow / queue ─────────────────────────────────────────────────────────
auto_select_burst_favorite: false
slideshow_window: 100
mute_preference_timeout: 300

# ── Debug ─────────────────────────────────────────────────────────────────────
debug_mode: false
debug_queue_mode: false
```

> **Tip:** `auto_select_burst_favorite` and `metadata.show_burst_info` are also configurable from the visual editor under the **Metadata** section.