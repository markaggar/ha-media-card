# Filter System Usage Guide - v5.3.0

## Overview

The Media Card now supports filtering media items using the Media Index backend. This allows you to create targeted slideshows showing only favorites, specific date ranges, or combinations of filters.

## Supported Filters

### 1. Favorites Filter

Show only media items marked as favorites in Media Index.

**Direct Value Configuration:**
```yaml
filters:
  favorites: true
```

**Entity Reference Configuration:**
```yaml
filters:
  favorites: input_boolean.slideshow_favorites
```

When using entity references, the filter value updates automatically when the entity state changes. This enables:
- Toggle favorites filter via dashboard button
- Automate filter changes based on time of day
- Control filters from other automations

**Supported Entity Types:**
- `input_boolean` - Uses state (on = true, off = false)
- `sensor` - Interprets "on", "true", "1" as true

**Use Cases:**
- "Best of" slideshow on main dashboard
- Gallery of your favorite vacation photos
- Curated selection for guests

### 2. Date Range Filter

Filter by photo date using EXIF `date_taken` (falls back to `created_time` if no EXIF data).

**Direct Value Configuration:**
```yaml
filters:
  date_range:
    start: "2024-01-01"  # YYYY-MM-DD format
    end: "2024-12-31"
```

**Entity Reference Configuration:**
```yaml
filters:
  date_range:
    start: input_datetime.slideshow_start_date
    end: input_datetime.slideshow_end_date
```

**Supported Entity Types:**
- `input_datetime` - Extracts date portion (YYYY-MM-DD) from state
- `input_text` - Uses state as date string
- `sensor` - Uses state as date string

**Date Behavior:**
- Omit `start` for "everything before end date"
- Omit `end` for "everything after start date"
- Uses EXIF date when available (actual photo date)
- Falls back to filesystem created_time for videos/files without EXIF

**Use Cases:**

**"This Year" Slideshow:**
```yaml
filters:
  date_range:
    start: "2025-01-01"
```

**"2023 and Earlier" (Older Photos):**
```yaml
filters:
  date_range:
    end: "2023-12-31"
```

**Specific Year:**
```yaml
filters:
  date_range:
    start: "2023-01-01"
    end: "2023-12-31"
```

**Specific Month:**
```yaml
filters:
  date_range:
    start: "2024-06-01"
    end: "2024-06-30"
```

### 3. Combined Filters

Combine multiple filters for more specific selections.

**Favorite Photos from 2023:**
```yaml
filters:
  favorites: true
  date_range:
    start: "2023-01-01"
    end: "2023-12-31"
```

**Recent Favorites (Last 30 Days):**
```yaml
filters:
  favorites: true
  date_range:
    start: "2025-11-01"  # Adjust to current month
```

## Complete Example Configuration

```yaml
type: custom:media-card

# Source configuration
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true

# Media Index backend
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files

# Filter configuration
filters:
  # Only show favorites
  favorites: true
  
  # Only show photos from 2024
  date_range:
    start: "2024-01-01"
    end: "2024-12-31"

# Display options
metadata:
  show_filename: true
  show_date: true
  show_location: true
  position: bottom-left

# Slideshow settings
auto_advance: true
advance_interval: 8

# Debug mode (see filter info in console)
debug_mode: true
```

## Verifying Filters Work

1. **Enable debug mode** in your configuration:
   ```yaml
   debug_mode: true
   ```

2. **Open browser console** (F12)

3. **Look for filter logs:**
   ```
   [MediaIndexProvider] 🔍 Active filters: {
     favorites_only: true,
     date_from: "2024-01-01",
     date_to: "2024-12-31"
   }
   ```

4. **Check WebSocket call** (if `debug_queue_mode: true`):
   ```json
   {
     "type": "call_service",
     "domain": "media_index",
     "service": "get_random_items",
     "service_data": {
       "favorites_only": true,
       "date_from": "2024-01-01",
       "date_to": "2024-12-31"
     }
   }
   ```

## Testing Service Calls Directly

You can test the filters directly in Home Assistant Developer Tools → Services:

```yaml
service: media_index.get_random_items
target:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
data:
  count: 20
  favorites_only: true
  date_from: "2024-01-01"
  date_to: "2024-12-31"
```

## Troubleshooting

### No Items Returned

**Favorites filter returns nothing:**
- Check if any files are actually marked as favorites
- Use `media_index.mark_favorite` service to favorite files
- Verify favorites are showing in Media Index sensor attributes

**Date range returns nothing:**
- Check date format is YYYY-MM-DD
- Verify photos have EXIF dates (check with `media_index.get_file_metadata`)
- Try wider date range to test
- Enable `debug_mode: true` to see actual query parameters

### Filters Not Applied

**Common issues:**
1. **Typo in configuration** - Check YAML indentation
2. **Media Index not active** - Ensure `use_media_index_for_discovery: true`
3. **Wrong entity_id** - Verify `media_index.entity_id` is correct
4. **Cache not cleared** - Hard refresh browser (Ctrl+Shift+R)

## Migration from Non-Filtered Setup

If you already have a working Media Card without filters:

**Before:**
```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
```

**After (with filters):**
```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files

# Add filters section
filters:
  favorites: true  # or date_range, or both
```

No other changes needed!

## Entity Resolution (v5.3+)

Filters support both **direct values** and **entity references** for dynamic control.

### Supported Entity Types

**input_boolean** (for favorites filter):
```yaml
filters:
  favorites: input_boolean.slideshow_favorites
```
- State "on" = true (show favorites)
- State "off" = false (show all)

**input_datetime** (for date ranges):
```yaml
filters:
  date_range:
    start: input_datetime.slideshow_start_date
    end: input_datetime.slideshow_end_date
```
- Automatically extracts date portion (YYYY-MM-DD)
- Supports both date-only and datetime formats

**input_text/input_select** (for date strings):
```yaml
filters:
  date_range:
    start: input_text.custom_start_date
```
- Uses state value directly as date string
- Must be in YYYY-MM-DD format

**sensor** (for computed values):
```yaml
filters:
  favorites: sensor.should_show_favorites
  date_range:
    start: sensor.dynamic_start_date
```
- Interprets sensor state based on expected type
- Boolean sensors: "on", "true", "1" = true
- Date sensors: Must return YYYY-MM-DD format

### Entity Resolution Examples

**Dashboard Toggle Control:**
```yaml
# configuration.yaml
input_boolean:
  slideshow_favorites:
    name: Show Favorites Only
    icon: mdi:star

# Lovelace card
type: custom:media-card
filters:
  favorites: input_boolean.slideshow_favorites
```

**Dynamic Date Range:**
```yaml
# configuration.yaml
input_datetime:
  slideshow_start:
    name: Slideshow Start Date
    has_date: true
    has_time: false
  
  slideshow_end:
    name: Slideshow End Date
    has_date: true
    has_time: false

# Lovelace card
type: custom:media-card
filters:
  date_range:
    start: input_datetime.slideshow_start
    end: input_datetime.slideshow_end
```

**Automation Example:**
```yaml
automation:
  - alias: "Weekend Favorites Slideshow"
    trigger:
      - platform: time
        at: "08:00:00"
    condition:
      - condition: time
        weekday:
          - sat
          - sun
    action:
      - service: input_boolean.turn_on
        target:
          entity_id: input_boolean.slideshow_favorites
```

### Entity Resolution Behavior

- **Real-time Updates**: Entity states resolved when card loads new media
- **Fallback**: Missing/invalid entities return null (no filter applied)
- **Type Safety**: Automatic type conversion based on filter context
- **Debug Logging**: Enable `debug_mode: true` to see resolved values in console

## Requirements

- **Media Card v5.3.0+** (with filter support and entity resolution)
- **Media Index v1.4.0+** (with favorites_only parameter)
- Photos marked as favorites (use `media_index.mark_favorite` service)
- EXIF dates extracted (automatic during scan)

## Future Enhancements

Planned for future releases:
- Dynamic filter updates (reload when entity changes)
- Queue statistics sensor
- Rating filter (`min_rating: 3`)
- Location filter (`location: "Paris, France"`)
- Dynamic filter updates without reload

Current implementation (v5.3.0) uses static boolean/date values only.
