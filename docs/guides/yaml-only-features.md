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

## Prefer Burst Favorites

### `auto_select_burst_favorite`

When enabled, the card ensures only favorited images are shown from burst groups that have already been reviewed. Non-favorites from those groups are silently skipped throughout the entire session.

**How it works:**

**For already-reviewed burst groups** (burst panel was previously opened and favorites were saved):
- Non-favorite images from the group are removed from the navigation queue before they appear
- Once a favorite from a group is confirmed by `media_index`, all other non-favorites from that group are suppressed for the entire session
- This applies both to items already in the queue (checked on load) and new items fetched later

**For unreviewed burst groups** (burst group detected but no favorites saved yet):
- The original image is shown normally
- After a 2-second delay, the card fetches the burst group via `get_related_files`
- If any favorited items are found, it crossfades to a randomly selected one
- The original is then blocked from appearing again in that session

**Requirements:**
- `media_source_type: media_index` or `folder` with `use_media_index_for_discovery: true`
- Burst groups must have been reviewed via the burst panel at least once (favorites written by `update_burst_metadata`), or use the new `index_burst_groups` service to scan the full library
- The `ha-media-index` integration must be v1.5.10 or later

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/PhotoLibrary/
  mode: random
  use_media_index_for_discovery: true
auto_select_burst_favorite: true
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `auto_select_burst_favorite` | boolean | `false` | Show only favorited images from reviewed burst groups; suppress non-favorites |

> **Note:** Suppression is session-scoped — it resets when the card reloads. Images that arrive in the queue before their burst group is confirmed may be displayed briefly before being skipped.

> **Visual editor:** `auto_select_burst_favorite` is also available as **Prefer Burst Favorites** in the card's visual editor under the **Metadata** section.

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

## Full Example with YAML-Only Options

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/PhotoLibrary/
  mode: sequential
  recursive: true
  use_media_index_for_discovery: true
  priority_new_files: false
  new_files_threshold_seconds: 3600
  sequential:
    order_by: date_taken
    order_direction: desc
excluded_paths:
  - "Burst/**"
  - "**/Thumbnails/**"
  - "**/.thumbnails/**"
auto_select_burst_favorite: false
slideshow_window: 100
debug_mode: false
```

> **Tip:** `auto_select_burst_favorite` and `metadata.show_burst_info` are also configurable from the visual editor under the **Metadata** section.
