# V5a Comprehensive Testing Guide

## Overview
This document provides a complete testing checklist for all implemented features in ha-media-card-v5a.js before shipping v5.0.

---

## Test Environment Setup

### Prerequisites
- Home Assistant HADev instance (10.0.0.62)
- Media Index integration installed and configured
- Test media library with:
  - Various image formats (JPG, PNG)
  - Video files (MP4)
  - Files with EXIF metadata (GPS, camera info, date)
  - Nested folder structure (2-3 levels deep)
  - Mix of recent and old files (for priority_new_files testing)

### Test Cards to Create
Create multiple test cards with different configurations:

**Card 1: Single Media**
```yaml
type: custom:ha-media-card-v5a
media_source_type: single_media
single_media:
  path: media-source://media_source/media/Photo/test-image.jpg
```

**Card 2: Media Index Random**
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/PhotoLibrary
  mode: random
  media_index:
    entity_id: sensor.media_index_media_photo_photolibrary_total_files
    priority_new_files: true
    new_files_threshold_seconds: 3600
slideshow_window: 20
auto_advance_seconds: 5
```

**Card 3: Media Index Sequential**
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/PhotoLibrary
  mode: sequential
  sequential:
    order_by: date_taken
    order_direction: desc
  media_index:
    entity_id: sensor.media_index_media_photo_photolibrary_total_files
slideshow_window: 50
auto_advance_seconds: 3
```

**Card 4: Filesystem Subfolder Queue**
```yaml
type: custom:ha-media-card-v5a
media_source_type: folder
folder:
  path: media-source://media_source/media/Photo/TestFolder
  mode: subfolder_queue
  priority_folders:
    - pattern: "/Priority/"
      weight: 3.0
    - pattern: "/Important/"
      weight: 2.0
  recursive: true
  scan_depth: 3
slideshow_window: 15
auto_advance_seconds: 7
```

---

## Feature Testing Checklist

### 1. Media Display

#### 1.1 Image Display
- [ ] **Basic image loads correctly**
  - Verify image displays without errors
  - Check aspect ratio is maintained
  - Test with different image sizes (portrait, landscape, square)

- [ ] **Image error handling**
  - Test with non-existent path (should show error state)
  - Test with corrupted image file
  - Verify retry button appears and works
  - Verify auto-retry logic (should retry 1 time automatically)

- [ ] **Image metadata display**
  - Check filename shows when enabled
  - Check folder path displays correctly
  - Check date_taken displays (requires EXIF)
  - Check location displays (requires GPS coordinates)
  - Check camera info displays (make/model)
  - Verify metadata position (top-right, etc.)

#### 1.2 Video Display
- [ ] **Basic video playback**
  - Verify video loads and autoplays (if enabled)
  - Check muted state matches config
  - Test loop functionality
  - Verify controls hidden when configured

- [ ] **Video advance behavior**
  - Test advance_on_end=true (should advance when video ends)
  - Test advance_on_end=false (should loop or pause)
  - Test max_duration_seconds (should force advance after timeout)

- [ ] **Video error handling**
  - Test with non-existent video path
  - Test with unsupported format
  - Verify error state displays correctly

#### 1.3 Aspect Ratio & Zoom
- [ ] **Aspect modes**
  - Test viewport-fit (should fill available space)
  - Test contain (should fit within card)
  - Test cover (should fill and crop)

- [ ] **Zoom levels**
  - Test zoom_level: 1.0 (default)
  - Test zoom_level: 1.5 (150%)
  - Test zoom_level: 0.8 (80%)

---

### 2. Navigation

#### 2.1 Manual Navigation
- [ ] **Next/Previous buttons**
  - Click "Next" button → should advance to next media
  - Click "Previous" button → should go back in history
  - Verify buttons appear/hide based on config

- [ ] **Keyboard navigation**
  - Press Right Arrow → should advance next
  - Press Left Arrow → should go previous
  - Press Space → should pause/resume auto-advance
  - Test with keyboard_navigation disabled

- [ ] **Navigation zones**
  - Click left 1/3 of image → should go previous
  - Click right 1/3 of image → should go next
  - Click center 1/3 → should pause/resume
  - Test with navigation_zones disabled

#### 2.2 Navigation History
- [ ] **History tracking**
  - Advance through 10 items
  - Go back 5 items → should show previously viewed media
  - Go forward again → should replay same sequence
  - Verify historyPosition updates correctly

- [ ] **History limit**
  - Set history_size: 5
  - Advance through 10 items
  - Go back → should only have 5 items in history

#### 2.3 Position Indicator
- [ ] **Position display**
  - Verify "X of Y" indicator shows (if enabled)
  - Check position updates when navigating
  - Test in random mode (should show queue position)
  - Test in sequential mode (should show total count)

- [ ] **Dots indicator**
  - Enable show_dots_indicator
  - Verify dots appear for slideshow window
  - Check active dot highlights current position
  - Test with slideshow_window: 10

---

### 3. Auto-Advance

#### 3.1 Basic Auto-Advance
- [ ] **Auto-advance enabled**
  - Set auto_advance_seconds: 5
  - Verify media advances automatically every 5 seconds
  - Check timer resets after manual navigation

- [ ] **Auto-advance disabled**
  - Set auto_advance_seconds: 0
  - Verify media does NOT auto-advance
  - Manual navigation should still work

#### 3.2 Auto-Advance Modes
- [ ] **Reset mode**
  - Set auto_advance_mode: "reset"
  - Manual next → timer resets to full interval
  - Verify delay starts fresh after interaction

- [ ] **Pause mode**
  - Set auto_advance_mode: "pause"
  - Manual next → auto-advance stops
  - Should resume only when explicitly resumed

- [ ] **Continue mode**
  - Set auto_advance_mode: "continue"
  - Manual next → timer continues without reset
  - Next auto-advance happens sooner

#### 3.3 Pause/Resume
- [ ] **Manual pause**
  - Click pause button → auto-advance stops
  - Click resume button → auto-advance restarts
  - Verify icon changes (play/pause)

- [ ] **Pause on interaction**
  - Set pause_on_interaction: true
  - Manual navigation → should pause auto-advance
  - Set pause_on_interaction: false
  - Manual navigation → should continue auto-advance

---

### 4. Provider Modes

#### 4.1 Single Media Provider
- [ ] **Static single image**
  - Configure single_media with image path
  - Verify image displays
  - Verify no navigation controls appear

- [ ] **Camera snapshot with refresh**
  - Configure single_media with camera snapshot URL
  - Set refresh_seconds: 10
  - Verify URL refreshes every 10 seconds
  - Check new timestamp in URL query params

#### 4.2 Media Index Random Provider
- [ ] **Basic random mode**
  - Configure folder with mode: random
  - Enable media_index backend
  - Verify random media loads
  - Check no duplicates in queue

- [ ] **Priority new files**
  - Set priority_new_files: true
  - Set new_files_threshold_seconds: 3600
  - Add new files to library
  - Verify new files appear first in slideshow
  - Check console logs for "Priority new files" queries

- [ ] **Queue refill**
  - Set slideshow_window: 10
  - Advance through 5 items
  - Verify queue refills when queue.length < 10
  - Check duplicate filtering (console logs)

- [ ] **Exhaustion optimization**
  - Let slideshow run until high filter rates
  - Check console for "High filter rate detected"
  - After 2 consecutive high-filter queries
  - Verify "Recent file cache EXHAUSTED" message
  - Confirm future queries skip priority_new_files

#### 4.3 Media Index Sequential Provider
- [ ] **Sequential by date_taken**
  - Configure sequential with order_by: date_taken, direction: desc
  - Verify media appears in chronological order (newest first)
  - Test direction: asc (oldest first)

- [ ] **Sequential by filename**
  - Configure order_by: filename, direction: asc
  - Verify media appears in alphabetical order
  - Test with numeric filenames (IMG_001, IMG_002)

- [ ] **Sequential by modified_time**
  - Configure order_by: modified_time
  - Verify order matches file modification dates

#### 4.4 Folder Provider (Subfolder Queue)
- [ ] **Basic recursive scanning**
  - Configure folder with recursive: true
  - Verify media from subfolders appears
  - Check console for "Scanning directory" logs

- [ ] **Scan depth limiting**
  - Set scan_depth: 2
  - Verify only folders up to 2 levels deep are scanned
  - Check subfolders at level 3+ are skipped

- [ ] **Priority folders**
  - Configure priority_folders with patterns
  - Verify folders matching patterns appear more frequently
  - Check console logs for "Priority folder detected"

- [ ] **Sequential filesystem mode**
  - Configure folder mode: sequential (no media_index)
  - Verify media appears in filename order
  - Test with nested folders

---

### 5. Media Index Features

#### 5.1 Metadata Display
- [ ] **EXIF metadata**
  - View image with EXIF data
  - Verify date_taken displays correctly
  - Check GPS coordinates convert to location names
  - Verify camera make/model displays

- [ ] **Geocoding**
  - View image with GPS coordinates
  - Check location_name, location_city displays
  - Verify geocoding cache is used (second load faster)

#### 5.2 Favorites
- [ ] **Mark as favorite**
  - Click favorite button (star icon)
  - Verify star fills in (favorited state)
  - Check backend updates (inspect media_index database)

- [ ] **Unfavorite**
  - Click favorite button on favorited item
  - Verify star empties (unfavorited state)

- [ ] **Favorite status persistence**
  - Mark item as favorite
  - Navigate away and back
  - Verify favorite status retained

#### 5.3 Mark for Edit
- [ ] **Mark for editing**
  - Click edit button (pencil icon)
  - Verify confirmation dialog appears
  - Confirm action
  - Check file moved to _Edit folder (backend)

- [ ] **Post-edit behavior**
  - After marking for edit
  - Verify card advances to next media
  - Click "Previous" button
  - Verify edited file is NOT in history (no 404)

- [ ] **Edit exclusion**
  - Mark file for edit
  - Continue slideshow
  - Verify edited file never appears again in queue

#### 5.4 Delete Media
- [ ] **Delete media**
  - Click delete button (trash icon)
  - Verify confirmation dialog appears
  - Confirm deletion
  - Check file moved to _Junk folder (backend)

- [ ] **Post-delete behavior**
  - After deleting file
  - Verify card advances to next media
  - Click "Previous" button
  - Verify deleted file is NOT in history (no 404)

- [ ] **Delete exclusion**
  - Delete file
  - Continue slideshow
  - Verify deleted file never appears again in queue

---

### 6. Configuration & Editor

#### 6.1 GUI Editor
- [ ] **Media source type selection**
  - Open card editor
  - Select "Single Media" radio button
  - Verify single_media config section appears
  - Select "Folder" radio button
  - Verify folder config section appears

- [ ] **Folder mode selection**
  - Select folder media source
  - Choose "Random" mode
  - Verify random-specific options appear
  - Choose "Sequential" mode
  - Verify sequential options appear (order_by, direction)
  - Choose "Subfolder Queue" mode
  - Verify priority_folders option appears

- [ ] **Media Index configuration**
  - Enable media_index entity
  - Select entity from dropdown
  - Enable priority_new_files checkbox
  - Adjust threshold slider
  - Verify config saves correctly

- [ ] **Display options**
  - Adjust auto_advance_seconds slider
  - Change slideshow_window
  - Toggle pause_on_interaction
  - Select aspect_mode dropdown
  - Verify all changes save

- [ ] **Video options**
  - Toggle autoplay checkbox
  - Toggle muted checkbox
  - Toggle loop checkbox
  - Set max_duration_seconds
  - Test changes apply to video playback

- [ ] **Metadata options**
  - Toggle show_filename
  - Toggle show_date
  - Toggle show_location
  - Change metadata position
  - Verify display updates immediately

- [ ] **Priority folders editor**
  - Add priority folder pattern
  - Set weight value
  - Add multiple patterns
  - Remove pattern
  - Verify JSON config is valid

#### 6.2 Config Validation
- [ ] **Required fields**
  - Try to save with empty media_path (single mode)
  - Verify validation error shows
  - Try to save with empty folder.path (folder mode)
  - Verify validation error shows

- [ ] **Invalid values**
  - Set auto_advance_seconds to negative number
  - Verify error or defaults to valid value
  - Set slideshow_window to 0
  - Verify error or defaults to minimum (10)

---

### 7. Actions & Interactions

#### 7.1 Tap Actions
- [ ] **Tap action configuration**
  - Configure tap_action: more-info
  - Tap media → should open more-info dialog
  - Configure tap_action: toggle
  - Tap media → should toggle entity
  - Configure tap_action: call-service
  - Tap media → should call service

- [ ] **Double-tap action**
  - Configure double_tap_action: navigate
  - Double-tap media → should navigate to path
  - Test with different action types

- [ ] **Hold action**
  - Configure hold_action: more-info
  - Hold tap media → should trigger hold action
  - Test timing (should require 500ms+ hold)

#### 7.2 Kiosk Mode
- [ ] **Kiosk URL detection**
  - Add ?kiosk to dashboard URL
  - Verify card enters kiosk mode
  - Check header/sidebar hidden (if configured)

- [ ] **Kiosk exit**
  - In kiosk mode, tap media once
  - Verify URL kiosk parameter removed
  - Check UI returns to normal

- [ ] **Tap action override**
  - Configure tap_action while in kiosk mode
  - Verify kiosk exit takes precedence
  - Tap action should NOT trigger in kiosk mode

---

### 8. Performance & Edge Cases

#### 8.1 Large Libraries
- [ ] **1000+ files**
  - Test with library of 1000+ media files
  - Verify initial load time acceptable (<5s)
  - Check queue refill performance
  - Monitor browser memory usage

- [ ] **Deep folder structure**
  - Test with 5+ levels of nested folders
  - Verify scanning completes
  - Check scan_depth limiting works

#### 8.2 Error Recovery
- [ ] **Network errors**
  - Disconnect network during media load
  - Verify error state displays
  - Reconnect network
  - Click retry → should recover

- [ ] **Missing files**
  - Delete file from filesystem while in queue
  - Advance to deleted file
  - Verify error handling (skip to next)
  - Check exclusion list prevents retry

- [ ] **Backend unavailable**
  - Stop media_index integration
  - Verify error message shows
  - Restart integration
  - Reload card → should recover

#### 8.3 State Preservation
- [ ] **Reconnection on config change**
  - Open card editor
  - Change config (e.g., auto_advance_seconds)
  - Save changes
  - Verify queue/history preserved
  - Current media should NOT reset

- [ ] **Reconnection on page refresh**
  - Advance through slideshow
  - Refresh browser page (F5)
  - Verify card reconnects to same queue
  - History should be preserved
  - Position should resume where left off

- [ ] **Multiple cards sharing queue**
  - Create 2 cards with same folder path
  - Both use subfolder_queue mode
  - Verify they share the same queue instance
  - Check window.mediaCardSubfolderQueues registry

#### 8.4 Background/Visibility
- [ ] **Tab switching**
  - Start slideshow auto-advance
  - Switch to different browser tab
  - Wait 30 seconds
  - Switch back to HA tab
  - Verify slideshow paused while hidden (if configured)
  - Verify slideshow resumes when visible

- [ ] **Card visibility**
  - Scroll card out of viewport
  - Check if auto-advance pauses (based on config)
  - Scroll card back into viewport
  - Verify auto-advance resumes

- [ ] **Edit mode handling**
  - Enter dashboard edit mode
  - Verify card preview shows placeholder
  - Verify scanning stops (SubfolderQueue destroyed)
  - Exit edit mode
  - Verify full card functionality restored

---

### 9. Regression Testing (V4 Parity)

#### 9.1 V4 Features Working in V5a
- [ ] **SubfolderQueue functionality**
  - Recursive scanning with weighting
  - Priority folder patterns
  - Global queue registry
  - Pause/resume scanning

- [ ] **Media rendering**
  - Image display with error handling
  - Video playback controls
  - Aspect ratio handling
  - Navigation zones

- [ ] **Metadata display**
  - Filename/folder extraction
  - Date parsing
  - EXIF metadata
  - Location geocoding

- [ ] **Action buttons**
  - Favorites toggle
  - Mark for edit
  - Delete media
  - Refresh button

#### 9.2 V4 Bugs Fixed in V5a
- [ ] **Duplicate prevention**
  - V4 bug: Same files repeated in random mode
  - V5a: Duplicate filtering (queue + history)
  - Test: Advance through slideshow, verify no repeats

- [ ] **History cleanup on edit/delete**
  - V4 bug: 404 errors when clicking "previous" after edit
  - V5a: Files removed from history on edit/delete
  - Test: Edit file, click previous, no 404

- [ ] **Scanner timestamp accuracy**
  - V4 bug: last_scanned updates for all files on every scan
  - V5a: Only updates for new/modified files
  - Test: Rescan library, verify old files keep old timestamps

- [ ] **Exhaustion optimization**
  - V4 bug: Wasteful double queries when recent cache depleted
  - V5a: Tracks exhaustion, skips priority_new_files
  - Test: Let slideshow run, verify optimization kicks in

---

### 10. Browser Compatibility

#### 10.1 Desktop Browsers
- [ ] **Chrome/Edge (Chromium)**
  - Test all features on Chrome latest
  - Verify rendering correct
  - Check console for errors

- [ ] **Firefox**
  - Test all features on Firefox latest
  - Verify video playback works
  - Check for CSS rendering issues

- [ ] **Safari**
  - Test on Safari (Mac/iOS)
  - Verify media playback
  - Check for WebKit-specific issues

#### 10.2 Mobile Browsers
- [ ] **Mobile Chrome (Android)**
  - Test touch navigation
  - Verify responsive layout
  - Check performance on mobile

- [ ] **Mobile Safari (iOS)**
  - Test touch navigation
  - Verify video autoplay (iOS restrictions)
  - Check metadata display on small screen

---

### 11. Console Log Verification

#### 11.1 Expected Log Patterns
Monitor browser console during testing for key log messages:

- [ ] **Initialization logs**
  - `[MediaCardV5a] Initializing provider: folder`
  - `[FolderProvider] Initializing...`
  - `[MediaIndexProvider] ✅ Initialized with X items`

- [ ] **Queue management logs**
  - `[MediaIndexProvider] Queue low, refilling...`
  - `[MediaIndexProvider] Filtered X duplicate/history items`
  - `[MediaIndexProvider] 📊 High filter rate detected`

- [ ] **Navigation logs**
  - `[MediaCardV5a] 🔄 Loading next media`
  - `[MediaCardV5a] 🔙 Loading previous media`
  - `[MediaCardV5a] 📚 Added to history (position: X)`

- [ ] **Action logs**
  - `[MediaCardV5a] ✅ File marked for editing`
  - `[MediaCardV5a] 📝 Added to provider exclusion list`
  - `[MediaCardV5a] 📚 Removed from navigation history`

- [ ] **Error logs**
  - `[MediaCardV5a] Media failed to load: <url>`
  - `[MediaCardV5a] 🔄 Auto-retrying failed URL`
  - Verify no unexpected errors

---

## Test Execution Checklist

### Pre-Testing
- [ ] Clear browser cache
- [ ] Open browser DevTools console
- [ ] Set console filter to show only errors and logs
- [ ] Document HA version and integration versions

### During Testing
- [ ] Take screenshots of bugs/issues
- [ ] Copy console error messages
- [ ] Note steps to reproduce problems
- [ ] Test on multiple browsers

### Post-Testing
- [ ] Document all failures
- [ ] Create GitHub issues for bugs
- [ ] Update test results in this document
- [ ] Report test coverage percentage

---

## Test Results Template

```markdown
## Test Run: [Date]

**Tester**: [Name]
**Environment**: 
- HA Version: 
- Browser: 
- Media Index Version:

**Results Summary**:
- Total Tests: 
- Passed: 
- Failed: 
- Skipped: 

**Critical Issues**:
1. [Issue description]
2. [Issue description]

**Known Limitations**:
1. [Limitation description]
2. [Limitation description]
```

---

## Success Criteria

Card is ready to ship when:
- ✅ **95%+ tests passing**
- ✅ **Zero critical bugs**
- ✅ **V4 feature parity confirmed**
- ✅ **Performance acceptable** (loads <5s, no memory leaks)
- ✅ **Console clean** (no unexpected errors)
- ✅ **Cross-browser tested** (Chrome, Firefox, Safari)
