# Queue Statistics and Dynamic Filters

Guide for using queue statistics events and dynamic filter updates in Media Card v5.3+.

## Features

### Dynamic Filter Updates (Automatic)
When using entity references for filters, the card automatically reloads when entity states change.

**Example:**
```yaml
filters:
  favorites: input_boolean.slideshow_favorites  # Auto-reloads when toggled
  date_range:
    start: input_datetime.slideshow_start       # Auto-reloads when changed
    end: input_datetime.slideshow_end           # Auto-reloads when changed
```

**Behavior:**
- Detects entity state changes automatically
- Compares new vs old filter values
- Only reloads if filter values actually changed
- **Clears queue AND history** to show fresh filtered results
- Fetches new items from Media Index
- Shows error if new filters exclude all results

**Console Output:**
```
[MediaIndexProvider] 📡 Subscribing to filter entities: ["input_boolean.slideshow_favorites"]
[MediaIndexProvider] 🔄 Filter entity changed: input_boolean.slideshow_favorites → on
[MediaIndexProvider] ✨ Filter values changed, reloading queue: {favorites: true, date_from: null, date_to: null}
[MediaIndexProvider] 🗑️ Clearing card history due to filter change
[MediaIndexProvider] ✅ Queue reloaded with 45 items
```

### Queue Statistics Events (For Template Sensors)
The card fires `media_card_queue_stats` events through Home Assistant's event bus whenever the queue state changes.

**Event Type:** `media_card_queue_stats` (visible in Developer Tools → Events)

**Event Structure:**
```javascript
{
  detail: {
    queue_size: 45,              // Current number of items in queue
    queue_capacity: 100,         // Maximum queue size (slideshow_window)
    filters_active: ["favorites", "date_range"],  // Active filter types
    filter_config: {
      favorites: true,           // Current favorites filter value
      date_from: "2024-01-01",  // Current date range start
      date_to: "2024-12-31"      // Current date range end
    },
    timestamp: "2025-11-21T10:30:00.000Z"  // Event timestamp
  }
}
```

## Template Sensor Integration

### Basic Queue Size Sensor

Create a sensor that tracks the current queue size:

```yaml
# configuration.yaml
template:
  - trigger:
      - platform: event
        event_type: media_card_queue_stats
        id: media_card_1  # Match your card ID if multiple cards
    sensor:
      - name: "Media Card Queue Size"
        unique_id: media_card_queue_size
        state: "{{ trigger.event.data.queue_size }}"
        attributes:
          capacity: "{{ trigger.event.data.queue_capacity }}"
          filters: "{{ trigger.event.data.filters_active }}"
          last_updated: "{{ trigger.event.data.timestamp }}"
```

### Filter Status Sensor

Track which filters are currently active:

```yaml
template:
  - trigger:
      - platform: event
        event_type: media_card_queue_stats
    sensor:
      - name: "Media Card Filter Status"
        unique_id: media_card_filter_status
        state: >
          {% if trigger.event.data.filters_active | length == 0 %}
            No Filters
          {% else %}
            {{ trigger.event.data.filters_active | join(', ') | title }}
          {% endif %}
        attributes:
          favorites_active: >
            {{ trigger.event.data.filter_config.favorites != null }}
          date_range_active: >
            {{ trigger.event.data.filter_config.date_from != null or 
               trigger.event.data.filter_config.date_to != null }}
          date_from: "{{ trigger.event.data.filter_config.date_from }}"
          date_to: "{{ trigger.event.data.filter_config.date_to }}"
```

### Queue Health Sensor

Monitor if queue is running low (useful for alerts):

```yaml
template:
  - trigger:
      - platform: event
        event_type: media_card_queue_stats
    binary_sensor:
      - name: "Media Card Queue Healthy"
        unique_id: media_card_queue_healthy
        device_class: problem
        state: >
          {% set size = trigger.event.data.queue_size | int %}
          {% set capacity = trigger.event.data.queue_capacity | int %}
          {% set threshold = capacity * 0.1 %}
          {{ size > threshold }}
        attributes:
          queue_size: "{{ trigger.event.data.queue_size }}"
          threshold: "{{ (trigger.event.data.queue_capacity | int * 0.1) | int }}"
          percentage: >
            {{ ((trigger.event.data.queue_size / trigger.event.data.queue_capacity) * 100) | round(1) }}%
```

## Dashboard Integration Examples

### Display Queue Stats in Lovelace

**Entities Card:**
```yaml
type: entities
title: Media Card Status
entities:
  - entity: sensor.media_card_queue_size
    name: Queue Size
  - entity: sensor.media_card_filter_status
    name: Active Filters
  - entity: binary_sensor.media_card_queue_healthy
    name: Queue Health
```

**Markdown Card:**
```yaml
type: markdown
content: |
  ## Media Card Status
  
  **Queue:** {{ states('sensor.media_card_queue_size') }} / {{ state_attr('sensor.media_card_queue_size', 'capacity') }} items
  
  **Filters:** {{ states('sensor.media_card_filter_status') }}
  
  {% if state_attr('sensor.media_card_filter_status', 'date_from') %}
  **Date Range:** {{ state_attr('sensor.media_card_filter_status', 'date_from') }} to {{ state_attr('sensor.media_card_filter_status', 'date_to') }}
  {% endif %}
```

### Control Panel with Stats

Combine filter controls with live statistics:

```yaml
type: vertical-stack
cards:
  - type: entities
    title: Slideshow Filters
    entities:
      - entity: input_boolean.slideshow_favorites
        name: Show Favorites Only
      - entity: input_datetime.slideshow_start_date
        name: Start Date
      - entity: input_datetime.slideshow_end_date
        name: End Date
  
  - type: entities
    title: Current Status
    entities:
      - entity: sensor.media_card_queue_size
        name: Matching Photos
      - entity: sensor.media_card_filter_status
        name: Active Filters
```

## Automation Examples

### Alert When Queue is Low

```yaml
automation:
  - alias: "Media Card Queue Low Alert"
    trigger:
      - platform: numeric_state
        entity_id: sensor.media_card_queue_size
        below: 10
    condition:
      - condition: template
        value_template: "{{ state_attr('sensor.media_card_filter_status', 'filters_active') | length > 0 }}"
    action:
      - service: notify.mobile_app
        data:
          title: "Slideshow Queue Low"
          message: >
            Only {{ states('sensor.media_card_queue_size') }} photos match your current filters.
            Consider adjusting your filter criteria.
```

### Auto-Adjust Filters Based on Time

```yaml
automation:
  - alias: "Slideshow: Morning Favorites"
    trigger:
      - platform: time
        at: "08:00:00"
    action:
      - service: input_boolean.turn_on
        target:
          entity_id: input_boolean.slideshow_favorites
      - service: input_datetime.set_datetime
        target:
          entity_id: input_datetime.slideshow_start_date
        data:
          date: "{{ (now() - timedelta(days=365)).strftime('%Y-%m-%d') }}"
  
  - alias: "Slideshow: Evening All Photos"
    trigger:
      - platform: time
        at: "18:00:00"
    action:
      - service: input_boolean.turn_off
        target:
          entity_id: input_boolean.slideshow_favorites
```

## Debugging

### Enable Debug Mode

Add to card configuration:
```yaml
debug_mode: true
```

### Console Output

Watch browser console (F12) for queue statistics:

```
[MediaIndexProvider] 📊 Queue stats: {
  queue_size: 45,
  queue_capacity: 100,
  filters_active: ["favorites"],
  filter_config: { favorites: true, date_from: null, date_to: null },
  timestamp: "2025-11-21T10:30:00.000Z"
}
```

### Monitor Events

Use Developer Tools → Events to watch for `media_card_queue_stats` events:

1. Go to Developer Tools → Events
2. Listen for event type: `media_card_queue_stats`
3. Toggle a filter entity to trigger event
4. View event data structure

## Advanced Use Cases

### Multiple Cards with Different Filters

Track statistics for multiple cards by adding card identifiers:

```yaml
# Card 1: Favorites
type: custom:media-card
filters:
  favorites: input_boolean.slideshow_1_favorites

# Card 2: Date Range
type: custom:media-card
filters:
  date_range:
    start: input_datetime.slideshow_2_start
    end: input_datetime.slideshow_2_end
```

Each card dispatches its own queue stats events independently.

### Dynamic Queue Capacity

Adjust `slideshow_window` based on collection size:

```yaml
type: custom:media-card
slideshow_window: 100  # Queue capacity
filters:
  favorites: input_boolean.slideshow_favorites
```

Larger windows = fewer refills, but more memory usage.

## Troubleshooting

### Events Not Firing

**Check:**
1. Media Index is enabled: `use_media_index_for_discovery: true`
2. Debug mode shows queue stats in console
3. Card is actually loading media (check for errors)
4. Template sensor trigger is listening for correct event type

### Filter Changes Not Detected

**Check:**
1. Entity references use correct format: `input_boolean.entity_name`
2. Entities exist in Home Assistant (check States view)
3. Console shows subscription message: `📡 Subscribing to filter entities`
4. Filter values actually changed (not just entity state updated with same value)

### Queue Statistics Incorrect

**Check:**
1. Queue size reflects filtered results (not total collection)
2. `filters_active` array matches your configuration
3. `filter_config` values match resolved entity states
4. Events fire after queue loads/reloads (not before)

## Requirements

- **Media Card v5.3.0+** (dynamic filters and queue statistics)
- **Media Index v1.4.0+** (filter support)
- **Home Assistant 2023.1+** (template trigger sensors)
- Entity references for dynamic behavior (optional)

## See Also

- `FILTER_USAGE_GUIDE.md` - Complete filter documentation
- `ENTITY_RESOLUTION_TESTING.md` - Entity reference testing guide
- `FILTER_TEST_CONFIGS.md` - Copy-paste test configurations
