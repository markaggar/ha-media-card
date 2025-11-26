# Media Card Filter Test Configuration

Copy one of these configurations into a Lovelace dashboard card to test the filter functionality.

## Test 1: No Filters (Baseline)

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
metadata:
  show_filename: true
  show_date: true
auto_advance: true
advance_interval: 5
debug_mode: true
```

**Expected:** All media from PhotoLibrary

---

## Test 2: Favorites Only

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
filters:
  favorites: true
metadata:
  show_filename: true
  show_date: true
auto_advance: true
advance_interval: 5
debug_mode: true
```

**Expected:** Only favorited media
**Console log:** `🔍 Active filters: { favorites_only: true }`

---

## Test 3: Date Range - 2023 and Earlier

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
filters:
  date_range:
    end: "2023-12-31"
metadata:
  show_filename: true
  show_date: true
auto_advance: true
advance_interval: 5
debug_mode: true
```

**Expected:** Media from 2023 or older (uses EXIF date_taken)
**Console log:** `🔍 Active filters: { date_to: "2023-12-31" }`

---

## Test 4: Date Range - 2025 Onwards

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
filters:
  date_range:
    start: "2025-01-01"
metadata:
  show_filename: true
  show_date: true
auto_advance: true
advance_interval: 5
debug_mode: true
```

**Expected:** Media from 2025 or newer (uses EXIF date_taken)
**Console log:** `🔍 Active filters: { date_from: "2025-01-01" }`

---

## Test 5: Combined - Favorites from 2023

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true
media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files
filters:
  favorites: true
  date_range:
    start: "2023-01-01"
    end: "2023-12-31"
metadata:
  show_filename: true
  show_date: true
auto_advance: true
advance_interval: 5
debug_mode: true
```

**Expected:** Only favorited media from 2023
**Console log:** `🔍 Active filters: { favorites_only: true, date_from: "2023-01-01", date_to: "2023-12-31" }`

---

## Verification Steps

1. **Add card to dashboard** - Copy one of the configurations above
2. **Open browser console** (F12 → Console tab)
3. **Hard refresh page** (Ctrl+Shift+R) to clear cache
4. **Look for debug logs:**
   - `[MediaIndexProvider] 🔍 Active filters: { ... }`
   - `[MediaIndexProvider] ✅ Received X items from media_index`
5. **Verify media shown** - Check if files match filter criteria

## Troubleshooting

### No Items Shown

**If favorites filter returns nothing:**
- Run service call to mark some files as favorites:
  ```yaml
  service: media_index.mark_favorite
  data:
    file_path: /media/Photo/PhotoLibrary/vacation.jpg
    is_favorite: true
  ```

**If date range returns nothing:**
- Check console for actual query parameters
- Try wider date range (e.g., entire year)
- Verify photos have EXIF dates with `media_index.get_file_metadata`

### Filters Not Applied

1. **Clear browser cache** - Hard refresh (Ctrl+Shift+R)
2. **Check entity_id** - Ensure media_index entity exists and matches config
3. **Verify YAML syntax** - Indentation matters!
4. **Check console errors** - Look for red errors in browser console

## Next Steps

After verifying filters work:
1. Remove `debug_mode: true` from config
2. Adjust `advance_interval` to your preference
3. Customize `metadata` display options
4. Create multiple cards with different filters for different views
