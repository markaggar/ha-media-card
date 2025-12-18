# Display Entities Guide

Display Entities is a powerful feature that overlays Home Assistant entity states on your media card. Entities can rotate automatically with smooth fade transitions, respond to state changes with visual feedback, and be conditionally shown based on templates.

## Quick Start

### Basic Example

```yaml
type: custom:media-card
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/PhotoLibrary
  mode: sequential
  recursive: true
display_entities:
  enabled: true
  entities:
    - entity: sensor.outside_temperature
    - entity: binary_sensor.front_door
    - entity: sensor.weather_forecast
```

### What You'll See

- Entity states displayed as overlay text on the media
- Automatic rotation between entities every few seconds
- Smooth fade transitions between entities
- Real-time updates when entity states change
- Visual feedback (pulse animation) when states change

## Configuration Options

### Core Settings

```yaml
display_entities:
  enabled: true                      # Enable/disable the feature (default: false)
  cycle_interval: 5                  # Seconds between entity rotations (default: 10)
  transition_duration: 800           # Milliseconds for fade transition (default: 500)
  recent_change_window: 90           # Seconds to highlight recently changed entities (default: 60)
```

### Entity Configuration

Each entity in the `entities` list can be configured with:

```yaml
display_entities:
  entities:
    - entity: sensor.temperature      # Required: Entity ID
      name: "Living Room"             # Optional: Display name (overrides friendly_name)
      icon: mdi:thermometer           # Optional: Icon to display
      unit: "°F"                      # Optional: Override unit of measurement
      condition: "{{ is_state('sun.sun', 'below_horizon') }}"  # Optional: Show only when condition is true
      styles:                         # Optional: Custom styling (Jinja2 templates supported)
        color: >
          {% if states('sensor.temperature') | float > 75 %}
            red
          {% elif states('sensor.temperature') | float < 65 %}
            lightblue
          {% else %}
            white
          {% endif %}
        fontSize: "18px"
        fontWeight: "bold"
```

## Common Use Cases

### Weather Dashboard

Display current weather conditions over your photo slideshow:

```yaml
display_entities:
  enabled: true
  cycle_interval: 8
  entities:
    - entity: sensor.outside_temperature
      name: "Outside"
      icon: mdi:thermometer
      styles:
        color: >
          {% if states('sensor.outside_temperature') | float > 80 %}
            orange
          {% else %}
            lightblue
          {% endif %}
    
    - entity: sensor.weather_condition
      name: "Weather"
      icon: mdi:weather-partly-cloudy
    
    - entity: sensor.humidity
      name: "Humidity"
      icon: mdi:water-percent
```

### Security Status

Show security system status and motion detection:

```yaml
display_entities:
  enabled: true
  cycle_interval: 5
  recent_change_window: 120  # Keep motion alerts visible longer
  entities:
    - entity: binary_sensor.front_door
      name: "Front Door"
      icon: mdi:door
      styles:
        color: "{{ 'red' if is_state('binary_sensor.front_door', 'on') else 'lightgreen' }}"
        fontWeight: "{{ 'bold' if is_state('binary_sensor.front_door', 'on') else 'normal' }}"
    
    - entity: binary_sensor.driveway_motion
      name: "Driveway"
      icon: mdi:motion-sensor
      condition: "{{ is_state('binary_sensor.driveway_motion', 'on') }}"  # Only show when active
    
    - entity: alarm_control_panel.home
      name: "Alarm"
      icon: mdi:shield-home
```

### Smart Home Status

Display device states and activity:

```yaml
display_entities:
  enabled: true
  cycle_interval: 6
  entities:
    - entity: sensor.living_room_lights
      name: "Lights"
      icon: mdi:lightbulb
      condition: "{{ states('sensor.living_room_lights') | int > 0 }}"
    
    - entity: climate.downstairs
      name: "AC"
      icon: mdi:air-conditioner
      styles:
        color: "{{ 'orange' if is_state('climate.downstairs', 'heat') else 'lightblue' }}"
    
    - entity: sensor.energy_usage
      name: "Energy"
      icon: mdi:flash
      unit: "kW"
```

### Conditional Display - Day/Night

Show different entities based on time of day:

```yaml
display_entities:
  enabled: true
  entities:
    # Daytime entities
    - entity: sensor.solar_production
      name: "Solar"
      condition: "{{ is_state('sun.sun', 'above_horizon') }}"
      icon: mdi:solar-power
    
    - entity: sensor.ev_charging
      name: "EV Charging"
      condition: "{{ is_state('sun.sun', 'above_horizon') }}"
    
    # Nighttime entities
    - entity: binary_sensor.security_lights
      name: "Security"
      condition: "{{ is_state('sun.sun', 'below_horizon') }}"
      icon: mdi:security
    
    - entity: sensor.bedroom_temperature
      name: "Bedroom"
      condition: "{{ is_state('sun.sun', 'below_horizon') }}"
```

## Advanced Features

### Jinja2 Templates in Styles

Use powerful Jinja2 templates for dynamic styling:

```yaml
display_entities:
  entities:
    - entity: sensor.water_flow
      name: "Water"
      styles:
        color: >
          {% set flow = states('sensor.water_flow') | float(default=0) %}
          {% if flow > 5 %}
            red
          {% elif flow > 2 %}
            orange
          {% elif flow > 0 %}
            lightblue
          {% else %}
            gray
          {% endif %}
        fontSize: >
          {% if states('sensor.water_flow') | float(default=0) > 5 %}
            20px
          {% else %}
            14px
          {% endif %}
```

### State-Based Visibility

Show entities only when relevant:

```yaml
display_entities:
  entities:
    # Show warnings only when active
    - entity: binary_sensor.water_leak
      name: "⚠️ Water Leak"
      condition: "{{ is_state('binary_sensor.water_leak', 'on') }}"
      styles:
        color: "red"
        fontWeight: "bold"
        fontSize: "18px"
    
    # Show when garage is open
    - entity: cover.garage_door
      name: "Garage Open"
      condition: "{{ is_state('cover.garage_door', 'open') }}"
      styles:
        color: "orange"
```

### Multi-Sensor Aggregation

Display calculated values from multiple sensors:

```yaml
display_entities:
  entities:
    - entity: sensor.house_average_temp
      name: "Avg Temp"
      # This sensor calculates average from multiple sensors using a template sensor
    
    - entity: sensor.total_power_usage
      name: "Total Power"
      # Aggregates power usage from multiple devices
```

## Visual Behavior

### Rotation System

- Entities cycle automatically at the configured interval
- Currently displayed entity fades out
- Next entity fades in
- Smooth cross-fade transition for professional appearance

### State Change Detection

- Recently changed entities are tracked automatically
- Visual pulse animation draws attention to changes
- Configurable time window for "recent" changes (default: 60 seconds)
- Useful for motion sensors, door contacts, alerts

### Conditional Display

- Entities with `condition` are evaluated in real-time
- If condition becomes false, entity is hidden immediately
- When condition becomes true again, entity joins rotation
- Allows dynamic entity lists based on state

## Styling Reference

### Available Style Properties

All CSS properties are supported. Common ones:

```yaml
styles:
  color: "white"              # Text color
  fontSize: "16px"            # Font size
  fontWeight: "bold"          # Font weight (normal, bold, 100-900)
  backgroundColor: "rgba(0,0,0,0.5)"  # Background color with transparency
  padding: "8px 12px"         # Padding around text
  borderRadius: "8px"         # Rounded corners
  textShadow: "0 2px 4px rgba(0,0,0,0.5)"  # Text shadow
  opacity: "0.9"              # Transparency
```

### Jinja2 in Styles

Any style value can use Jinja2 templates:

```yaml
styles:
  color: "{{ 'red' if state > 100 else 'green' }}"
  fontSize: "{{ (12 + (state | int / 10)) }}px"
  fontWeight: "{{ 'bold' if is_state_attr('entity', 'critical', true) else 'normal' }}"
```

## Performance Considerations

### Cycle Interval

- Shorter intervals (3-5s): More dynamic, higher CPU usage
- Longer intervals (10-15s): More readable, lower resource usage
- Recommended: 6-10 seconds for good balance

### Number of Entities

- 1-5 entities: Excellent performance
- 6-10 entities: Good performance
- 11+ entities: May cause noticeable CPU usage on slower devices
- Use `condition` to limit active entities

### Template Complexity

- Simple templates (`{{ state }}`): Negligible impact
- Complex templates (multiple conditionals): Slight CPU increase
- Recommendation: Keep templates concise, use helper sensors for complex logic

### Disconnected Cards

- Display entities automatically stop updating when card is not visible
- No resources wasted on hidden dashboards/tabs
- Templates are not evaluated for disconnected cards

## Troubleshooting

### Entity Not Showing

1. Check entity exists: `entity: sensor.your_sensor` (must be exact ID)
2. Check condition is true (if configured)
3. Verify `enabled: true` in display_entities config
4. Check browser console for template errors

### State Not Updating

1. Verify entity is actually updating in Home Assistant
2. Check template syntax if using Jinja2
3. Hard refresh browser (Ctrl+Shift+R) to clear cache
4. Check for JavaScript errors in browser console

### Templates Not Working

1. Wrap multi-line templates in `>` for proper YAML formatting
2. Test template in Developer Tools → Template
3. Check for syntax errors (missing quotes, brackets)
4. Verify entity IDs are correct in template

### Performance Issues

1. Reduce number of entities
2. Increase cycle_interval
3. Use conditions to limit active entities
4. Simplify complex templates
5. Check if other dashboard elements are causing slowdown

## Migration from V5.5

If upgrading from v5.5 or earlier, display entities configuration may need adjustment:

**Old Format (v5.5)**:
```yaml
display_entities:
  - sensor.temperature
  - sensor.humidity
```

**New Format (v5.6+)**:
```yaml
display_entities:
  enabled: true
  entities:
    - entity: sensor.temperature
    - entity: sensor.humidity
```

## Examples by Category

### Minimalist

```yaml
display_entities:
  enabled: true
  entities:
    - entity: sensor.time
```

### Informative

```yaml
display_entities:
  enabled: true
  cycle_interval: 7
  entities:
    - entity: sensor.outside_temperature
      name: "Outside"
      icon: mdi:thermometer
    - entity: sensor.inside_temperature
      name: "Inside"
      icon: mdi:home-thermometer
    - entity: weather.home
      name: "Forecast"
      icon: mdi:weather-partly-cloudy
```

### Alert-Focused

```yaml
display_entities:
  enabled: true
  cycle_interval: 4
  recent_change_window: 120
  entities:
    - entity: binary_sensor.motion_detected
      condition: "{{ is_state('binary_sensor.motion_detected', 'on') }}"
      styles:
        color: "yellow"
        fontWeight: "bold"
    - entity: binary_sensor.door_open
      condition: "{{ is_state('binary_sensor.door_open', 'on') }}"
      styles:
        color: "orange"
    - entity: binary_sensor.water_leak
      condition: "{{ is_state('binary_sensor.water_leak', 'on') }}"
      styles:
        color: "red"
        fontSize: "20px"
```

## See Also

- [Configuration Reference](configuration.md) - Complete card configuration
- [Features Guide](features.md) - Overview of all card features
- [Examples](examples.md) - Complete card configuration examples
