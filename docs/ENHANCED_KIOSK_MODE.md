# Enhanced Kiosk Mode Implementation

## Overview
Enhanced kiosk mode adds entity-based kiosk control with auto-enable functionality to v5a. This replaces the URL-based kiosk detection from the initial v5a implementation with V4's proven entity-based approach, plus new auto-enable feature.

## Implementation Date
December 29, 2024

## What Was Implemented

### 1. Entity-Based Kiosk Control (V4 CODE REUSE)
**Copied from V4 (ha-media-card.js lines 5423-5492)**

- `_isKioskModeConfigured()` - Check if kiosk entity is configured
- `_shouldHandleKioskExit(actionType)` - Determine if tap/hold/double-tap should exit kiosk
- `_handleKioskExit()` - Toggle kiosk entity and show toast notification
- `_showToast(message)` - Display temporary notification

**Pattern**: Only handle kiosk exit if no other action is configured for that interaction type. This prevents conflicts with existing tap/hold/double-tap actions.

### 2. Updated Tap Handlers (V4 CODE REUSE)
**Copied from V4 (ha-media-card.js lines 5325-5403)**

- `_handleTap()` - Check for kiosk exit before processing tap action
- `_handleDoubleTap()` - Check for kiosk exit before processing double-tap action
- `_handlePointerDown()` - Check for kiosk exit before processing hold action

**Change**: Replaced URL-based kiosk detection (`window.location.search.includes('kiosk')`) with entity-based detection (`_shouldHandleKioskExit()`).

### 3. Kiosk Indicator Rendering (V4 CODE REUSE)
**Copied from V4 (ha-media-card.js lines 3847-3874)**

- `_renderKioskIndicator()` - Show exit hint when kiosk entity is 'on'
- Added to render() after `_renderPauseIndicator()`
- CSS for `.kiosk-exit-hint` (line 1346-1361 from V4)

**Display Logic**: 
- Only show if kiosk entity is configured
- Only show if `kiosk_mode_show_indicator !== false` (default: true)
- Only show when entity state is 'on'
- Shows configured exit action (Tap/Hold/Double-tap)

### 4. Auto-Enable Kiosk Mode (NEW FEATURE)
**NEW CODE - No V4 equivalent**

Added `_setupKioskModeMonitoring()` method:
- **Auto-enable on load**: If kiosk entity is 'off', turn it 'on' automatically
- **State monitoring**: Subscribe to entity state changes to update UI
- **Cleanup**: Unsubscribe in `_cleanupKioskModeMonitoring()` on disconnect

**Why new code**: V4 had no auto-enable feature. This was user's requested enhancement.

**Integration points**:
- Called from `connectedCallback()` if `config.kiosk_mode_auto_enable` is true
- Cleaned up in `disconnectedCallback()`

### 5. Configuration UI Updates

Added to editor (Kiosk Mode section):
```html
<div class="config-row">
  <label>Auto-Enable Kiosk</label>
  <div>
    <input type="checkbox" 
      .checked=${this._config.kiosk_mode_auto_enable !== false}
      @change=${this._kioskModeAutoEnableChanged} />
    <div class="help-text">Automatically turn on kiosk entity when card loads</div>
  </div>
</div>
```

Handler: `_kioskModeAutoEnableChanged()` - Updates config and fires change event

## Configuration Options

### kiosk_mode_entity (string)
Input boolean entity to control kiosk mode
- **Default**: `""` (disabled)
- **Example**: `input_boolean.kiosk_mode`
- **Required**: Yes (for kiosk functionality)

### kiosk_mode_auto_enable (boolean)
Automatically turn on kiosk entity when card loads
- **Default**: `true`
- **Behavior**: If entity is 'off', turns it 'on' in `connectedCallback()`
- **Use case**: Tablet dashboards that should auto-enter kiosk mode

### kiosk_mode_exit_action (string)
How to trigger kiosk mode exit
- **Options**: `'tap'`, `'hold'`, `'double_tap'`
- **Default**: `'tap'`
- **Behavior**: Only triggers if no other action configured for that interaction

### kiosk_mode_show_indicator (boolean)
Show exit hint in corner when kiosk is active
- **Default**: `true`
- **Display**: "Tap to exit full-screen" (or Hold/Double-tap based on exit action)

## Usage Example

```yaml
type: custom:media-card-v5a
folder:
  path: /media/local/photos
  mode: random
  include_subfolders: true
auto_advance_seconds: 10
kiosk_mode_entity: input_boolean.kiosk_mode
kiosk_mode_auto_enable: true
kiosk_mode_exit_action: hold
kiosk_mode_show_indicator: true
```

**Behavior**:
1. Card loads → Auto-enables `input_boolean.kiosk_mode` if off
2. Shows "Hold to exit full-screen" hint in corner
3. User holds card → Toggles entity off → kiosk-mode integration hides UI
4. Card monitors entity state changes for UI updates

## Integration with kiosk-mode Integration

The `kiosk-mode-entity` should be monitored by the `kiosk-mode` custom integration:
- When entity turns ON → Hide UI elements (header, sidebar)
- When entity turns OFF → Show UI elements again

**Example kiosk-mode config**:
```yaml
kiosk_mode:
  hide_header: input_boolean.kiosk_mode
  hide_sidebar: input_boolean.kiosk_mode
```

## Code Locations

### Card Implementation (ha-media-card-v5a.js)
- **Lines 3018-3043**: `connectedCallback()` - Auto-enable setup
- **Lines 3047-3050**: `disconnectedCallback()` - Cleanup monitoring
- **Lines 5198-5276**: Tap handlers with kiosk exit checks
- **Lines 5291-5363**: Kiosk helper methods
- **Lines 5365-5398**: Auto-enable monitoring (NEW)
- **Lines 6327-6354**: `_renderKioskIndicator()`
- **Lines 6169**: Added kiosk indicator to render()
- **Lines 5833-5848**: CSS for `.kiosk-exit-hint`

### Editor Configuration (ha-media-card-v5a.js)
- **Lines 9031-9044**: Auto-enable checkbox UI
- **Lines 7350-7360**: `_kioskModeAutoEnableChanged()` handler

## Testing Checklist

- [ ] Kiosk entity auto-enables on card load
- [ ] Exit hint shows when entity is 'on'
- [ ] Exit hint hides when entity is 'off'
- [ ] Tap/Hold/Double-tap exits kiosk (based on config)
- [ ] Exit action respects existing tap/hold/double-tap actions
- [ ] State monitoring updates UI when entity changes
- [ ] Cleanup prevents memory leaks on disconnect
- [ ] Config UI toggles auto-enable correctly

## V4 Code Reuse Summary

✅ **Copied from V4**:
- Kiosk mode helper methods (5 methods)
- Tap handler kiosk exit logic (3 handlers)
- Kiosk indicator rendering (1 method)
- CSS styling for exit hint

❌ **New Code** (justified):
- Auto-enable monitoring (`_setupKioskModeMonitoring`)
  - **Why**: V4 had no auto-enable feature
  - **User request**: "auto-enable entity on card load"
  - **Justification**: Core feature requirement, no V4 equivalent
- State change subscription handling
  - **Why**: Required for auto-enable feature
  - **Pattern**: Standard HA state subscription
- Config UI for auto-enable checkbox
  - **Why**: User needs way to configure the feature

## Deployment

**Status**: ✅ Deployed to HADev (10.0.0.62)

**File**: `\\10.0.0.62\config\www\cards\media-card-v5a.js`

**Next Steps**:
1. User testing of auto-enable feature
2. Verify entity state monitoring works correctly
3. Test with kiosk-mode integration
4. Confirm no memory leaks after multiple connect/disconnect cycles

## Related Documentation

- `V5A_COMPREHENSIVE_TESTING_GUIDE.md` - Test cases for kiosk mode
- `V5A_SHIP_READINESS.md` - Ship timeline and tasks
- `V4_TO_V5_MIGRATION_GUIDE.md` - Config migration notes
