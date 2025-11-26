# Entity Resolution Testing Guide

Quick reference for testing dynamic filter control via entity references.

## Quick Setup (HADev)

### 1. Create Input Helpers

Add to `configuration.yaml` or use UI:

```yaml
input_boolean:
  slideshow_favorites:
    name: Show Favorites Only
    icon: mdi:star

input_datetime:
  slideshow_start_date:
    name: Slideshow Start Date
    has_date: true
    has_time: false
  
  slideshow_end_date:
    name: Slideshow End Date
    has_date: true
    has_time: false
```

Restart Home Assistant after adding to configuration.yaml.

### 2. Configure Media Card

```yaml
type: custom:media-card
media_source_type: folder
debug_mode: true  # Enable to see resolved values in console

folder:
  path: /media/Photo/PhotoLibrary
  mode: random
  use_media_index_for_discovery: true

media_index:
  entity_id: sensor.media_index_media_photo_photolibrary_total_files

# Use entity references instead of direct values
filters:
  favorites: input_boolean.slideshow_favorites
  date_range:
    start: input_datetime.slideshow_start_date
    end: input_datetime.slideshow_end_date
```

### 3. Test Entity Resolution

**Open browser console** (F12) and watch for debug logs:

```
[MediaIndexProvider] 🔍 Active filters: {
  favorites_only: true,
  date_from: "2024-01-01",
  date_to: "2024-12-31"
}
```

**Toggle favorites filter:**
1. Go to Settings → Devices & Services → Helpers
2. Toggle `slideshow_favorites` on/off
3. Reload card to see filter applied/removed
4. Check console for updated filter values

**Change date range:**
1. Update `slideshow_start_date` and `slideshow_end_date` values
2. Reload card to see new date range
3. Verify photos match the specified date range

## Expected Behaviors

### Valid Entity References

✅ **input_boolean.slideshow_favorites** (state: on)
```
favorites_only: true
```

✅ **input_boolean.slideshow_favorites** (state: off)
```
favorites_only: false  // or not included in service call
```

✅ **input_datetime.slideshow_start_date** (state: "2024-01-01")
```
date_from: "2024-01-01"
```

✅ **input_datetime.slideshow_start_date** (state: "2024-01-01 00:00:00")
```
date_from: "2024-01-01"  // Date extracted automatically
```

### Invalid/Missing Entities

⚠️ **Entity not found:**
```
[MediaIndexProvider] ⚠️ Filter entity not found: input_boolean.missing_entity
```
Filter value becomes `null` (no filter applied).

⚠️ **Invalid entity state:**
```
date_from: null  // No filter applied
```

## Test Scenarios

### Scenario 1: Dashboard Control
**Setup:**
- Add Entities card with `input_boolean.slideshow_favorites` toggle
- Add Entities card with date input helpers

**Test:**
1. Toggle favorites → reload → verify only favorites shown
2. Change dates → reload → verify date range applied
3. Clear dates (set to empty) → reload → verify all dates shown

### Scenario 2: Automation Control
**Create automation:**
```yaml
automation:
  - alias: "Weekend Favorites"
    trigger:
      - platform: time
        at: "08:00:00"
    condition:
      - condition: time
        weekday: [sat, sun]
    action:
      - service: input_boolean.turn_on
        target:
          entity_id: input_boolean.slideshow_favorites
```

**Test:**
1. Manually trigger automation
2. Reload card → verify favorites filter active

### Scenario 3: Mixed Direct + Entity
**Configuration:**
```yaml
filters:
  favorites: true  # Direct value
  date_range:
    start: input_datetime.slideshow_start_date  # Entity reference
    end: "2024-12-31"  # Direct value
```

**Test:**
- Verify all three filters applied correctly
- Change entity value → reload → verify entity resolved
- Verify direct values unchanged

## Troubleshooting

### Console Shows `null` Filter Values

**Check:**
1. Entity exists in Home Assistant (check `hass.states` in console)
2. Entity has valid state (not "unavailable" or "unknown")
3. Date format is YYYY-MM-DD (for date filters)
4. Entity type supported (input_boolean, input_datetime, etc.)

**Debug in Console:**
```javascript
// Check if entity exists
hass.states['input_boolean.slideshow_favorites']

// Check state value
hass.states['input_boolean.slideshow_favorites'].state

// Check all input helpers
Object.keys(hass.states).filter(e => e.startsWith('input_'))
```

### Filters Not Applied

**Verify:**
1. Media Index enabled: `use_media_index_for_discovery: true`
2. Media Index sensor exists and has data
3. Debug mode shows resolved values in console
4. Hard refresh browser (Ctrl+Shift+R) after code changes

### Entity Changes Not Reflected

**Expected Behavior:**
- Entity values resolved when card loads new media
- Not automatically reloaded when entity changes
- Manual reload or navigation required to see updates

**Future Enhancement:**
Dynamic filter updates (auto-reload on entity change) planned for future release.

## Verification Checklist

- [ ] Input helpers created in Home Assistant
- [ ] Card configured with entity references
- [ ] Debug mode enabled
- [ ] Browser console shows resolved filter values
- [ ] Toggle favorites → favorites filter applied
- [ ] Change dates → date range filter applied
- [ ] Missing entity → graceful fallback (no error)
- [ ] Invalid state → graceful fallback (no error)
- [ ] Mixed direct values + entity references work together

## Next Steps

Once entity resolution verified:
1. **Queue Statistics** - Track filtered queue size/state
2. **Dynamic Updates** - Auto-reload when entity changes
3. **Additional Filters** - Rating, location, file type

See `docs/FILTER_USAGE_GUIDE.md` for complete filter documentation.
