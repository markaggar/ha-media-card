# Troubleshooting

Common issues and solutions for the Media Card.

## Installation Issues

### Card Not Appearing in Add Card Menu

**Symptoms:**
- Can't find "Media Card" when adding a new card
- Search for "media-card" returns no results

**Solutions:**

1. **Clear Browser Cache**
   - Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
   - macOS: `Cmd + Shift + R`
   - Mobile: Force close browser app and reopen
   
2. **Verify File Location**
   - File should be at: `/config/www/cards/ha-media-card.js`
   - Check file permissions (Home Assistant must have read access)
   
3. **Check Lovelace Resource**
   - Go to Settings → Dashboards → Resources
   - Verify resource URL: `/local/cards/ha-media-card.js`
   - Resource type: **JavaScript Module**
   - Delete and re-add if incorrect
   
4. **Restart Home Assistant**
   - Settings → System → Restart
   - Wait 1-2 minutes for full restart
   
5. **Try Different Browser**
   - Test in incognito/private mode
   - Try a different browser entirely
   - Rules out browser-specific caching issues

### "Custom element doesn't exist: media-card" Error

**Symptoms:**
- Error message in dashboard
- Card shows as "Custom element doesn't exist"

**Solutions:**

1. **Hard Refresh Browser**
   - `Ctrl + Shift + R` (Windows/Linux)
   - `Cmd + Shift + R` (macOS)
   - Must clear JavaScript cache

2. **Check Browser Console**
   - Press `F12` to open developer tools
   - Click "Console" tab
   - Look for red error messages
   - Common errors:
     - `404 Not Found` → File path wrong
     - `SyntaxError` → File corrupted during upload
     - `Failed to load resource` → Network/permission issue

3. **Verify File Integrity**
   - Re-download `ha-media-card.js` from GitHub
   - Compare file size with release
   - Upload again if different

4. **Check File Permissions**
   - File must be readable by Home Assistant user
   - On Linux: `chmod 644 /config/www/cards/ha-media-card.js`

### HACS Installation Failed

**Symptoms:**
- "Repository not found" error in HACS
- Can't add custom repository

**Solutions:**

1. **Verify Repository URL**
   - URL: `https://github.com/markaggar/ha-media-card`
   - Must be exact (case-sensitive)
   - No trailing slash

2. **Select Correct Category**
   - Must select **Lovelace** (not Integration)
   - Wrong category causes installation failure

3. **Check Internet Connection**
   - HACS needs GitHub access
   - Test: Visit `https://github.com/markaggar/ha-media-card` in browser

4. **Update HACS**
   - Settings → Add-ons → Home Assistant Community Store
   - Update to latest version

## Media Display Issues

### No Media Displayed

**Symptoms:**
- Card shows but no image/video appears
- Blank or loading spinner forever

**Solutions:**

1. **Verify Media Path**
   - Use media browser to confirm path
   - Click file browser button in card editor
   - Copy exact path from browser
   
2. **Check File Format**
   - **Images**: JPG, PNG, GIF, WebP, BMP
   - **Videos**: MP4, WebM, OGG
   - Case-insensitive file extensions

3. **Test Simple Configuration**
   ```yaml
   type: custom:media-card
   media_type: image
   media_path: media-source://media_source/local/
   folder_mode: latest
   ```

4. **Check File Permissions**
   - Home Assistant must have read access
   - On Linux: `chmod 644 /path/to/media/file.jpg`

5. **Enable Debug Mode**
   ```yaml
   debug_mode: true
   ```
   - Open browser console (F12)
   - Look for error messages
   - Common issues revealed: path errors, MIME type problems

### "Show Latest" Shows Wrong Files

**Symptoms:**
- Oldest file shown instead of newest
- Random file shown instead of latest

**Solutions:**

1. **Check Filename Timestamps**
   
   Files need timestamps in names. Supported formats:
   - `snapshot_20250122_143045.jpg`
   - `IMG_20250122_143045.jpg`
   - `2025-01-22_14-30-45.jpg`
   - `1695386245.jpg` (Unix timestamp)
   
   **Without timestamps**: Alphabetical sorting used

2. **Verify Format**
   ```yaml
   # Correct formats:
   driveway_snapshot_20250122_143045.jpg  ✓
   IMG_20250122_143045.jpg                ✓
   2025-01-22_14-30-45.jpg                ✓
   
   # Without timestamps (alphabetical):
   camera1.jpg                            ✗
   snapshot.jpg                           ✗
   ```

3. **Enable Debug Logging**
   ```yaml
   debug_mode: true
   ```
   - Check console for "Extracted timestamp" messages
   - Verify which files are being detected

4. **Update Automation**
   
   If using camera.snapshot automation:
   ```yaml
   filename: >-
     /config/www/local/camera/snapshot_{{ now().strftime('%Y%m%d_%H%M%S') }}.jpg
   ```

### Images Not Loading / Broken Images

**Symptoms:**
- Broken image icon
- "Failed to load" message

**Solutions:**

1. **Check Browser Console (F12)**
   - Look for HTTP error codes:
     - `403 Forbidden` → Permission issue
     - `404 Not Found` → Path wrong
     - `500 Server Error` → HA backend problem

2. **Test Direct URL**
   - Find media file in HA media browser
   - Copy file path
   - Try opening in new browser tab
   - If direct access fails, it's not a card issue

3. **Check CORS/Security Settings**
   - Some browsers block local file access
   - Try in different browser
   - Check browser security settings

4. **Verify Media Directory Configuration**
   ```yaml
   # In configuration.yaml
   homeassistant:
     media_dirs:
       local: /config/www/local
     allowlist_external_dirs:
       - "/config/www/local"
   ```

## Folder Mode Issues

### Random Mode Shows Same Files

**Symptoms:**
- Same images appear repeatedly
- Little variety in random selection

**Solutions:**

1. **Increase Random Count**
   ```yaml
   random_count: 20  # Default is 5
   ```

2. **Enable SubfolderQueue**
   ```yaml
   subfolder_queue:
     enabled: true
     estimated_total_photos: 1000  # Adjust to your collection size
   ```

3. **Adjust Slideshow Window**
   ```yaml
   slideshow_window: 1500  # Increase for larger collections
   ```

4. **Check Folder Contents**
   - Verify folder actually has multiple files
   - Check media_type filter isn't excluding files
   - Use `media_type: all` to include images and videos

### Subfolder Scanning Slow

**Symptoms:**
- Long delay before first image
- UI feels sluggish

**Solutions:**

1. **Set Estimated Total Photos**
   ```yaml
   subfolder_queue:
     enabled: true
     estimated_total_photos: 25000  # Critical for large collections
   ```
   - Prevents probability drift during discovery
   - Improves initial display speed

2. **Adjust Slideshow Window**
   ```yaml
   slideshow_window: 1000  # Lower for faster initial load
   ```

3. **Use Static Slideshow Behavior**
   ```yaml
   slideshow_behavior: static  # Stay on current until navigation
   ```

4. **Suppress Logging**
   ```yaml
   suppress_subfolder_logging: true  # Reduce console spam
   ```

### Folder Mode Not Working

**Symptoms:**
- Error: "Folder mode requires folder path"
- Shows single file instead of folder contents

**Solutions:**

1. **Verify Folder Path**
   ```yaml
   # Correct - ends with /
   media_path: media-source://media_source/local/photos/
   
   # Wrong - points to specific file
   media_path: media-source://media_source/local/photos/image.jpg
   ```

2. **Check Folder Contents**
   - Folder must contain files
   - Files must match `media_type` filter
   - Empty folders show "No media files found"

3. **Verify Folder Mode Setting**
   ```yaml
   folder_mode: random    # Must specify mode
   folder_mode: latest    # Or this
   folder_mode: sequential # Or this
   ```

## Navigation Issues

### Keyboard Navigation Not Working

**Symptoms:**
- Arrow keys don't navigate
- Keyboard shortcuts have no effect

**Solutions:**

1. **Enable Keyboard Navigation**
   ```yaml
   enable_keyboard_navigation: true
   ```

2. **Focus the Card**
   - **Click on the card image first**
   - Card shows subtle outline when focused
   - Keyboard events only work when focused

3. **Check Multiple Files**
   - Navigation requires multiple files
   - Single file mode has nothing to navigate

4. **Verify Folder Mode**
   - Keyboard navigation only works with folder modes
   - Not available for single file display

5. **Test in Different Browser**
   - Some browsers block keyboard events in iframes
   - Try Chrome, Firefox, or Edge

### Navigation Zones Not Visible

**Symptoms:**
- Can't see where to click for navigation
- No visual indicators

**Solutions:**

1. **Enable Navigation Indicators**
   ```yaml
   enable_navigation_zones: true
   show_navigation_indicators: true  # Shows visual hints
   ```

2. **Hover Over Zones**
   - Move mouse to left/right edges
   - Button symbols appear on hover
   - Zones are 80px × 120px rectangles

3. **Check Conflicting Styles**
   - Custom themes may hide indicators
   - Try default HA theme
   - Enable debug mode to verify zones exist

### Click Actions Not Working

**Symptoms:**
- Tap/hold actions don't trigger
- Nothing happens when clicking

**Solutions:**

1. **Verify Action Configuration**
   ```yaml
   tap_action:
     action: more-info       # Must specify action type
     entity: camera.front_door
   ```

2. **Check Action Area**
   - Center area is for tap actions
   - Navigation zones block tap actions on edges
   - Video controls area also blocks tap actions

3. **Test Different Action Types**
   ```yaml
   tap_action:
     action: none  # Disable if testing
   
   # Then try:
   tap_action:
     action: more-info
     entity: camera.test
   ```

4. **Enable Debug Mode**
   ```yaml
   debug_mode: true
   ```
   - Console shows click events
   - Verify actions are registered

## Auto-Refresh Issues

### Auto-Refresh Not Working

**Symptoms:**
- Media never updates automatically
- Stuck on same image

**Solutions:**

1. **Verify Configuration**
   ```yaml
   auto_refresh_seconds: 60  # Must be > 0
   ```

2. **Check Folder Mode**
   - Auto-refresh behavior varies by mode:
     - **Latest**: Checks for new files
     - **Random**: Selects new random file
     - **Sequential**: Advances to next file

3. **Test with Short Interval**
   ```yaml
   auto_refresh_seconds: 10  # 10 seconds for testing
   ```

4. **Enable Debug Mode**
   ```yaml
   debug_mode: true
   ```
   - Console shows "Auto-refresh" messages
   - Verify timer is running

5. **Check Browser Tab State**
   - Some browsers pause timers in background tabs
   - Bring tab to foreground and wait
   - Check if refresh happens when tab is active

### Auto-Refresh Too Frequent

**Symptoms:**
- Updates constantly
- Performance issues

**Solutions:**

1. **Increase Interval**
   ```yaml
   auto_refresh_seconds: 300  # 5 minutes
   ```

2. **Use Static Slideshow Behavior**
   ```yaml
   slideshow_behavior: static  # Only update current file
   ```

3. **Disable Auto-Refresh**
   ```yaml
   auto_refresh_seconds: 0  # Manual refresh only
   show_refresh_button: true  # Add manual button
   ```

## Video Issues

### Videos Not Auto-Playing

**Symptoms:**
- Videos load but don't play automatically
- Must click play button manually

**Solutions:**

1. **Enable Autoplay**
   ```yaml
   video_autoplay: true
   ```

2. **Mute Videos**
   ```yaml
   video_autoplay: true
   video_muted: true  # Browsers block unmuted autoplay
   ```
   - Most browsers block unmuted autoplay
   - Muted autoplay usually allowed

3. **Check Browser Settings**
   - Some browsers block all autoplay
   - Check browser autoplay settings
   - Try in incognito mode

4. **Test Different Formats**
   - MP4 has best browser support
   - WebM may not work in all browsers
   - Convert videos to MP4 if issues persist

### Video Completion Not Advancing

**Symptoms:**
- Slideshow doesn't advance when video ends
- Stuck on video

**Solutions:**

1. **Enable Auto-Refresh**
   ```yaml
   auto_refresh_seconds: 30  # Must be > 0
   ```
   - Video completion requires auto-refresh enabled
   - Advancement happens when video ends

2. **Check for Manual Pause**
   - If you manually paused video, it won't auto-advance
   - Feature prevents interrupting intentional viewing
   - Navigate manually or let next auto-refresh trigger

3. **Verify Video Format**
   - MP4, WebM, OGG support completion detection
   - Other formats may not fire completion event

4. **Enable Debug Mode**
   ```yaml
   debug_mode: true
   ```
   - Console shows "Video ended" messages
   - Verify completion event is firing

## Kiosk Mode Issues

### Kiosk Mode Not Activating

**Symptoms:**
- Exit hint not showing
- Kiosk features not working

**Solutions:**

1. **Install Kiosk Mode Integration**
   - Install from [HACS](https://github.com/NemesisRE/kiosk-mode)
   - Restart Home Assistant

2. **Create Input Boolean**
   ```yaml
   # configuration.yaml
   input_boolean:
     kiosk_mode:
       name: "Kiosk Mode"
       icon: mdi:fullscreen
   ```

3. **Configure Dashboard Kiosk Mode**
   ```yaml
   # In dashboard view
   kiosk_mode:
     hide_header: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
     hide_sidebar: '{{ is_state("input_boolean.kiosk_mode", "on") }}'
   ```

4. **Turn On Boolean Entity**
   - Developer Tools → States
   - Find `input_boolean.kiosk_mode`
   - Set to "on"

5. **Verify Card Configuration**
   ```yaml
   kiosk_mode:
     enabled: true
     kiosk_entity: input_boolean.kiosk_mode  # Must match boolean entity
     show_exit_hint: true
   ```

### Can't Exit Kiosk Mode

**Symptoms:**
- Exit gesture not working
- Stuck in kiosk mode

**Solutions:**

1. **Try Correct Gesture**
   - `tap`: Single tap anywhere
   - `double_tap`: Quick double tap
   - `hold`: Press and hold 1 second
   - `swipe_down`: Swipe down from top

2. **Verify Exit Action**
   ```yaml
   kiosk_mode:
     exit_action: double_tap  # Verify this matches your gesture
   ```

3. **Manual Exit**
   - Navigate to: `http://your-ha-ip:8123/developer-tools/state`
   - Find `input_boolean.kiosk_mode`
   - Set to "off"

4. **Add Automation Fallback**
   ```yaml
   automation:
     - alias: "Reset Kiosk on Motion"
       trigger:
         platform: state
         entity_id: binary_sensor.motion
         to: "on"
       action:
         service: input_boolean.turn_off
         target:
           entity_id: input_boolean.kiosk_mode
   ```

## Media Index Issues

### Media Index Not Working

**Symptoms:**
- Media Index features not appearing
- "Entity not found" errors

**Solutions:**

1. **Install Media Index**
   - Install [Media Index integration](https://github.com/markaggar/ha-media-index)
   - Configure media folders
   - Wait for initial scan

2. **Verify Entity**
   - Developer Tools → States
   - Search for your media index sensor
   - Verify it exists and has state

3. **Check Path Compatibility**
   - Media Index **does not** work with `media-source://media_source/local/`
   - Requires network shares (`/mnt/...`, `/media/...`)
   - Use folder mode for local content

4. **Configure Card Correctly**
   ```yaml
   media_index:
     entity_id: sensor.media_index_photos_total_files  # Must match sensor
   ```

### Location/EXIF Data Not Showing

**Symptoms:**
- Location fields empty
- Date taken not displayed

**Solutions:**

1. **Verify EXIF Data Exists**
   - Not all photos have EXIF data
   - Location requires GPS coordinates in photo
   - Check photo properties on computer

2. **Wait for Scan**
   - Initial scan may take time
   - Check Media Index integration for scan status

3. **Enable in Configuration**
   ```yaml
   media_index:
     show_location: true
     show_date_taken: true
   ```

## Performance Issues

### Slow Loading / Lag

**Symptoms:**
- Images take long time to load
- UI feels sluggish

**Solutions:**

1. **Optimize Collection Size Settings**
   ```yaml
   slideshow_window: 1000  # Lower for faster performance
   subfolder_queue:
     enabled: true
     estimated_total_photos: 10000  # Set accurately
   ```

2. **Reduce Auto-Refresh Frequency**
   ```yaml
   auto_refresh_seconds: 120  # Increase interval
   ```

3. **Use Static Slideshow**
   ```yaml
   slideshow_behavior: static  # Less frequent updates
   ```

4. **Compress Media Files**
   - Large image files (>5MB) load slowly
   - Compress images to ~1-2MB
   - Use appropriate resolutions (1920x1080 sufficient for display)

5. **Disable Debug Mode**
   ```yaml
   debug_mode: false  # Reduces console overhead
   suppress_subfolder_logging: true  # If using subfolders
   ```

### High CPU Usage

**Symptoms:**
- Fan running constantly
- Browser slowing down

**Solutions:**

1. **Limit Debug Logging**
   ```yaml
   debug_mode: false
   debug_queue_mode: false
   suppress_subfolder_logging: true
   ```

2. **Increase Refresh Interval**
   ```yaml
   auto_refresh_seconds: 180  # 3 minutes
   ```

3. **Disable Video Autoplay**
   ```yaml
   video_autoplay: false  # Reduce video processing
   ```

4. **Close Unnecessary Browser Tabs**
   - Home Assistant UI can be resource-intensive
   - Close unused tabs to free resources

## Getting Additional Help

### Enable Debug Mode

Always enable debug mode when troubleshooting:

```yaml
type: custom:media-card
debug_mode: true
# ... rest of configuration
```

Then:
1. Press `F12` to open browser console
2. Click "Console" tab
3. Look for `[MediaCardV5a]` messages
4. Copy error messages when reporting issues

### Report Issues on GitHub

If you've tried everything:

1. Go to [GitHub Issues](https://github.com/markaggar/ha-media-card/issues)
2. Search existing issues first
3. Create new issue with:
   - **Home Assistant version**
   - **Browser and version**
   - **Card configuration** (remove sensitive paths)
   - **Console error messages** (F12 → Console)
   - **Steps to reproduce**
   - **Expected vs actual behavior**

### Community Support

- [Home Assistant Community Forum](https://community.home-assistant.io/)
- Search for "media card" or "ha-media-card"
- Ask in the Frontend section

---

**Still having issues?** Feel free to open a [GitHub Issue](https://github.com/markaggar/ha-media-card/issues) with full details!
