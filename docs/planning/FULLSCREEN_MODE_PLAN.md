# Fullscreen Mode Implementation Plan

## Project Overview

Add a fullscreen slideshow mode to the HA Media Card project that takes over the entire Home Assistant viewport, similar to Wall Panel's screensaver functionality. This will be a **separate component** from the existing card, sharing core media logic.

**Created:** October 24, 2025  
**Status:** Planning Phase  
**Target:** v4.0.0 Release

---

## Architecture Decision

### Why Two Separate Components?

After analyzing Wall Panel's architecture, we determined that **card mode and fullscreen mode are fundamentally incompatible** within a single codebase:

| Aspect | Card Mode (Existing) | Fullscreen Mode (New) |
|--------|---------------------|----------------------|
| **DOM Location** | Inside `hui-view` card slot | Direct child of `ha-main.shadowRoot` |
| **Positioning** | Relative within view container | Fixed: `position: fixed; width: 100vw; height: 100vh` |
| **Z-index** | Normal card stacking | High z-index (1000+) above all HA UI |
| **HA Chrome** | Respects toolbar/sidebar | Hides toolbar/sidebar programmatically |
| **Interaction** | Standard card behaviors | Click-anywhere-to-dismiss |
| **Configuration** | GUI editor friendly | Raw dashboard YAML only |
| **Lifecycle** | Managed by Lovelace view | Self-managed, idle-time triggered |

**Conclusion:** Two files sharing a common media engine is the cleanest approach.

---

## Project Structure

```
ha-media-card/
├── ha-media-card.js              # Existing Lovelace card (unchanged)
├── ha-media-fullscreen.js        # NEW: Fullscreen mode component
├── ha-media-engine-core.js       # NEW: Shared media logic (extracted)
├── README.md                     # Updated with fullscreen docs
├── FULLSCREEN_MODE_PLAN.md       # This document
└── MEDIA_INDEX_INTEGRATION_PLAN.md  # Future backend integration
```

### File Responsibilities

#### `ha-media-engine-core.js` (NEW - Shared Library)
**Purpose:** Extract and share media handling logic between card and fullscreen modes.

**Exports:**
```javascript
export class MediaEngine {
  // Core media management
  constructor(config)
  async loadMedia(folder, options)
  async refreshMedia()
  
  // SubfolderQueue system
  initializeQueue(folderStructure)
  getNextMedia()
  getPreviousMedia()
  
  // Media playback
  async displayImage(element, mediaUrl)
  async displayVideo(element, mediaUrl, autoplay)
  handleVideoEnded()
  
  // Metadata
  async loadMetadata(mediaUrl)
  formatMetadataDisplay(metadata)
  
  // State management
  getCurrentMedia()
  getQueueState()
  resetQueue()
}

export class MediaScanner {
  async scanFolder(path, recursive)
  async getMediaList(folder)
  filterByType(files, types)
  sortMedia(files, order)
}

export const MediaUtils = {
  isImage(filename)
  isVideo(filename)
  extractMetadata(file)
  formatDuration(seconds)
}
```

**Size Estimate:** ~1500 lines (extracted from existing ha-media-card.js)

---

#### `ha-media-card.js` (REFACTORED)
**Purpose:** Existing Lovelace card - refactored to use MediaEngine core.

**Changes:**
- Import `MediaEngine` from core
- Remove duplicated media logic
- Maintain exact same external API
- Keep all card-specific UI (navigation buttons, editor, etc.)
- **100% backward compatible**

**Size After Refactor:** ~7000 lines (down from 8762)

---

#### `ha-media-fullscreen.js` (NEW)
**Purpose:** Fullscreen slideshow mode injected into ha-main shadow DOM.

**Architecture (based on Wall Panel):**
```javascript
// Similar structure to Wall Panel's WallpanelView
class HaMediaFullscreenView extends HTMLElement {
  constructor() {
    super();
    this.mediaEngine = new MediaEngine(config);
    this.screensaverActive = false;
    this.idleTimer = null;
    this.idleSince = Date.now();
  }
  
  connectedCallback() {
    // Fixed positioning, full viewport
    this.style.position = 'fixed';
    this.style.top = '0';
    this.style.left = '0';
    this.style.width = '100vw';
    this.style.height = '100vh';
    this.style.zIndex = '1000';
    this.style.visibility = 'hidden';
    
    // Create shadow DOM with containers
    this.attachShadow({ mode: 'open' });
    this.createContainers();
    
    // Setup event listeners
    this.setupIdleDetection();
    this.setupInteractionHandlers();
  }
  
  createContainers() {
    // Image/video containers (dual-buffer for crossfade)
    // Metadata overlay
    // Progress indicators
  }
  
  setupIdleDetection() {
    // Monitor user activity
    // Start screensaver after idle_time
  }
  
  setupInteractionHandlers() {
    // Click/touch to dismiss
    // Swipe for navigation
    // Keyboard controls
  }
  
  async startScreensaver() {
    // Hide HA toolbar/sidebar
    // Show fullscreen container
    // Start media playback
    // Enable wake lock
  }
  
  stopScreensaver() {
    // Restore HA toolbar/sidebar
    // Hide fullscreen container
    // Reset idle timer
  }
  
  handleInteraction(evt) {
    // Dismiss on click (configurable)
    // Reset idle timer
    // Handle swipe navigation
  }
}

// Initialization - inject into HA
function initFullscreen() {
  const elHaMain = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main');
  const config = getDashboardConfig();
  
  if (!config || !config.ha_media_fullscreen?.enabled) {
    return;
  }
  
  const fullscreen = document.createElement('ha-media-fullscreen-view');
  elHaMain.shadowRoot.appendChild(fullscreen);
}

// Wait for HA environment, then initialize
waitForHA(initFullscreen);
```

**Size Estimate:** ~2000 lines

**Key Features:**
- Idle detection with configurable timeout
- Click-to-dismiss with fade animation
- Dual-buffer image/video containers for smooth crossfade
- Full viewport coverage (100vw × 100vh)
- HA chrome manipulation (hide toolbar/sidebar)
- Metadata overlay (optional)
- Keyboard navigation support
- Touch/swipe gestures
- Video autoplay with completion detection
- Browser wake lock support

---

## Configuration Schema

### Dashboard YAML (Raw Config Editor)

Users will add this to their dashboard's raw configuration:

```yaml
ha_media_fullscreen:
  # Core settings
  enabled: true                      # Enable fullscreen mode
  media_folder: /config/media/photos # Required: path to media
  
  # Behavior
  idle_time: 30                      # Seconds before screensaver starts
  display_duration: 10               # Seconds per image
  video_autoplay: true               # Auto-play videos
  video_loop: false                  # Loop videos
  
  # Interaction
  click_to_dismiss: true             # Click anywhere to exit
  show_navigation: false             # Show nav buttons (or swipe only)
  keyboard_enabled: true             # Arrow keys for navigation
  
  # Appearance
  crossfade_duration: 1.0            # Seconds for crossfade
  fade_in_time: 2.0                  # Fade in on start
  fade_out_time: 1.0                 # Fade out on dismiss
  background_color: '#000000'        # Behind media
  
  # Metadata (optional)
  show_metadata: true                # Show file info overlay
  metadata_position: bottom-right    # top-left, top-right, bottom-left, bottom-right
  metadata_template: '${filename} • ${date}'
  
  # Advanced
  hide_toolbar: true                 # Hide HA top toolbar
  hide_sidebar: true                 # Hide HA sidebar
  keep_screen_on: true               # Prevent screen sleep
  z_index: 1000                      # Stacking order
  
  # Media scanning (reuses card options)
  recursive: true
  include_subfolders: true
  media_order: sorted                # sorted, random, date
  image_fit: cover                   # cover, contain
  
views:
  - path: default_view
    title: Home
    cards:
      # ... regular cards
```

### Configuration Validation

The component will validate:
- `media_folder` exists and is accessible
- Numeric values are within valid ranges
- Enum values match allowed options
- Required fields are present

**Error Handling:**
- Show user-friendly error messages
- Gracefully disable if misconfigured
- Log detailed errors to console

---

## User Experience

### Installation (HACS)

1. **Install via HACS:**
   - Search for "HA Media Card"
   - Install (includes both card and fullscreen files)

2. **Register Resources:**
   ```yaml
   # configuration.yaml (or via UI)
   lovelace:
     resources:
       - url: /hacsfiles/ha-media-card/ha-media-card.js
         type: module
       - url: /hacsfiles/ha-media-card/ha-media-fullscreen.js
         type: module
       - url: /hacsfiles/ha-media-card/ha-media-engine-core.js
         type: module
   ```

3. **Configure Dashboard:**
   - Edit dashboard in raw YAML mode
   - Add `ha_media_fullscreen:` section at top level
   - Save and reload

### Usage Flow

1. **User opens dashboard** → Fullscreen component initializes
2. **Idle timer starts** → Counts seconds of inactivity
3. **After idle_time** → Screensaver activates:
   - Toolbar/sidebar hide
   - Fullscreen container fades in
   - Media playback begins
   - Wake lock engages
4. **User clicks/taps screen** → Screensaver dismisses:
   - Fullscreen container fades out
   - Toolbar/sidebar restore
   - Idle timer resets
5. **Repeat**

---

## Technical Implementation Details

### DOM Injection (Wall Panel Pattern)

```javascript
// Get HA's main element
const homeAssistant = document.querySelector('home-assistant');
const elHaMain = homeAssistant.shadowRoot.querySelector('home-assistant-main');

// Create and inject fullscreen view
const fullscreenView = document.createElement('ha-media-fullscreen-view');
fullscreenView.config = config;
elHaMain.shadowRoot.appendChild(fullscreenView);
```

**Why this works:**
- `ha-main` shadow root is the top-level container for all HA UI
- Fixed positioning with high z-index covers everything
- Shadow DOM provides style isolation
- Direct DOM access bypasses Lovelace constraints

### Hide HA Chrome

```javascript
function setToolbarVisibility(hidden) {
  const panelLovelace = elHaMain.shadowRoot.querySelector('ha-panel-lovelace');
  if (!panelLovelace) return;
  
  const huiRoot = panelLovelace.shadowRoot.querySelector('hui-root');
  if (!huiRoot) return;
  
  const appToolbar = huiRoot.shadowRoot.querySelector('app-toolbar') || 
                     huiRoot.shadowRoot.querySelector('div.toolbar');
  
  if (hidden) {
    appToolbar.style.setProperty('display', 'none');
    const view = huiRoot.shadowRoot.querySelector('#view');
    view.style.minHeight = '100vh';
    view.style.marginTop = '0';
    view.style.paddingTop = '0';
  } else {
    appToolbar.style.removeProperty('display');
  }
}

function setSidebarVisibility(hidden) {
  const drawer = elHaMain.shadowRoot.querySelector('ha-drawer');
  if (!drawer) return;
  
  const sidebar = drawer.shadowRoot.querySelector('aside');
  if (hidden) {
    sidebar.style.visibility = 'hidden';
    sidebar.style.width = '0';
  } else {
    sidebar.style.removeProperty('visibility');
    sidebar.style.removeProperty('width');
  }
}
```

### Idle Detection

```javascript
class IdleDetector {
  constructor(idleTime, onIdle, onActive) {
    this.idleTime = idleTime * 1000; // Convert to ms
    this.onIdle = onIdle;
    this.onActive = onActive;
    this.idleSince = Date.now();
    this.isIdle = false;
    this.timer = null;
    
    this.setupListeners();
    this.startTimer();
  }
  
  setupListeners() {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel'];
    events.forEach(event => {
      window.addEventListener(event, () => this.resetTimer(), { passive: true });
    });
  }
  
  resetTimer() {
    this.idleSince = Date.now();
    
    if (this.isIdle) {
      this.isIdle = false;
      this.onActive();
    }
    
    clearTimeout(this.timer);
    this.startTimer();
  }
  
  startTimer() {
    this.timer = setTimeout(() => {
      if (!this.isIdle) {
        this.isIdle = true;
        this.onIdle();
      }
    }, this.idleTime);
  }
  
  destroy() {
    clearTimeout(this.timer);
  }
}
```

### Dual-Buffer Crossfade

```javascript
class DualBufferDisplay {
  constructor(container) {
    this.container = container;
    this.bufferOne = this.createBuffer('buffer-one');
    this.bufferTwo = this.createBuffer('buffer-two');
    this.activeBuffer = this.bufferOne;
    this.inactiveBuffer = this.bufferTwo;
  }
  
  createBuffer(id) {
    const buffer = document.createElement('div');
    buffer.id = id;
    buffer.style.position = 'absolute';
    buffer.style.top = '0';
    buffer.style.left = '0';
    buffer.style.width = '100%';
    buffer.style.height = '100%';
    buffer.style.opacity = '0';
    buffer.style.transition = 'opacity 1s ease-in-out';
    this.container.appendChild(buffer);
    return buffer;
  }
  
  async crossfade(mediaUrl, isVideo) {
    const newBuffer = this.inactiveBuffer;
    const oldBuffer = this.activeBuffer;
    
    // Load new media in inactive buffer
    if (isVideo) {
      await this.loadVideo(newBuffer, mediaUrl);
    } else {
      await this.loadImage(newBuffer, mediaUrl);
    }
    
    // Crossfade animation
    newBuffer.style.opacity = '1';
    oldBuffer.style.opacity = '0';
    
    // Swap buffers
    this.activeBuffer = newBuffer;
    this.inactiveBuffer = oldBuffer;
    
    // Clean up old buffer after transition
    setTimeout(() => {
      oldBuffer.innerHTML = '';
    }, 1000);
  }
  
  async loadImage(buffer, url) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
      buffer.innerHTML = '';
      buffer.appendChild(img);
    });
  }
  
  async loadVideo(buffer, url) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.muted = false;
      video.autoplay = true;
      video.onloadeddata = resolve;
      video.src = url;
      buffer.innerHTML = '';
      buffer.appendChild(video);
    });
  }
}
```

### Wake Lock Support

```javascript
class WakeLockManager {
  constructor() {
    this.wakeLock = null;
    this.isSupported = 'wakeLock' in navigator;
  }
  
  async enable() {
    if (!this.isSupported) {
      console.warn('Wake Lock API not supported');
      return false;
    }
    
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock enabled');
      return true;
    } catch (err) {
      console.error('Failed to enable wake lock:', err);
      return false;
    }
  }
  
  async disable() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
      console.log('Wake lock released');
    }
  }
}
```

---

## Code Sharing Strategy

### Extract MediaEngine Core

**Step 1:** Identify shared logic in `ha-media-card.js`
- SubfolderQueue class (lines ~450-850)
- Media scanning functions
- Video completion detection
- Metadata parsing
- File type detection
- Media loading/caching

**Step 2:** Create `ha-media-engine-core.js`
```javascript
// ES6 module exports
export class MediaEngine { /* ... */ }
export class SubfolderQueue { /* ... */ }
export class MediaScanner { /* ... */ }
export const MediaUtils = { /* ... */ };
```

**Step 3:** Refactor `ha-media-card.js`
```javascript
// Import shared logic
import { MediaEngine, SubfolderQueue, MediaUtils } from './ha-media-engine-core.js';

class HaMediaCard extends LitElement {
  constructor() {
    super();
    this.mediaEngine = new MediaEngine(this.config);
  }
  
  // Use imported classes
  async _loadMedia() {
    await this.mediaEngine.loadMedia(this.config.media_folder);
  }
}
```

**Step 4:** Use in `ha-media-fullscreen.js`
```javascript
import { MediaEngine, MediaUtils } from './ha-media-engine-core.js';

class HaMediaFullscreenView extends HTMLElement {
  constructor() {
    super();
    this.mediaEngine = new MediaEngine(this.config);
  }
  
  async displayNextMedia() {
    const media = this.mediaEngine.getNextMedia();
    await this.dualBuffer.crossfade(media.url, media.isVideo);
  }
}
```

**Benefits:**
- Single source of truth for media logic
- Bug fixes apply to both components
- Easier testing and maintenance
- Smaller file sizes (no duplication)

---

## Development Phases

### Phase 1: Extract MediaEngine Core (1-2 days)
**Goal:** Create shared library without breaking existing card.

**Tasks:**
- [ ] Create `ha-media-engine-core.js`
- [ ] Extract SubfolderQueue class
- [ ] Extract MediaScanner functions
- [ ] Extract MediaUtils helpers
- [ ] Export as ES6 modules
- [ ] Write unit tests for core

**Deliverable:** `ha-media-engine-core.js` with full test coverage

---

### Phase 2: Refactor Card (1 day)
**Goal:** Update card to use MediaEngine core.

**Tasks:**
- [ ] Import MediaEngine into `ha-media-card.js`
- [ ] Replace inline logic with MediaEngine calls
- [ ] Test all card functionality
- [ ] Verify backward compatibility
- [ ] Test with existing configurations
- [ ] Update deployment script

**Deliverable:** Refactored card passing all tests

---

### Phase 3: Build Fullscreen Component (3-4 days)
**Goal:** Create working fullscreen mode.

**Tasks:**
- [ ] Create `ha-media-fullscreen.js` skeleton
- [ ] Implement DOM injection
- [ ] Create dual-buffer display system
- [ ] Add idle detection
- [ ] Implement interaction handlers
- [ ] Add HA chrome manipulation
- [ ] Integrate MediaEngine for media playback
- [ ] Add wake lock support
- [ ] Style fullscreen container
- [ ] Add metadata overlay

**Deliverable:** Functional fullscreen mode

---

### Phase 4: Configuration & Polish (2 days)
**Goal:** Complete user-facing features.

**Tasks:**
- [ ] Implement config validation
- [ ] Add error handling and user messages
- [ ] Create metadata templates
- [ ] Add keyboard navigation
- [ ] Implement touch gestures
- [ ] Add configuration examples
- [ ] Test on multiple devices/browsers
- [ ] Performance optimization

**Deliverable:** Production-ready fullscreen mode

---

### Phase 5: Documentation (1 day)
**Goal:** Comprehensive user documentation.

**Tasks:**
- [ ] Update README.md with fullscreen section
- [ ] Create FULLSCREEN_SETUP.md guide
- [ ] Add configuration examples
- [ ] Document keyboard shortcuts
- [ ] Create troubleshooting guide
- [ ] Add screenshots/GIFs
- [ ] Update CHANGELOG.md

**Deliverable:** Complete documentation

---

### Phase 6: Testing & Release (1-2 days)
**Goal:** Ensure quality and stability.

**Tasks:**
- [ ] Test on different HA versions
- [ ] Test on various browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test on mobile devices (iOS, Android)
- [ ] Test with different media types
- [ ] Performance testing (large libraries)
- [ ] Memory leak testing
- [ ] Create release notes
- [ ] Tag v4.0.0 release
- [ ] Submit to HACS

**Deliverable:** v4.0.0 release

---

## Testing Strategy

### Unit Tests (MediaEngine Core)
- SubfolderQueue logic
- Media scanning and filtering
- File type detection
- Metadata parsing
- Sort algorithms

### Integration Tests (Card)
- Card still works with refactored core
- All existing features functional
- Configuration migration
- Edge cases (empty folders, errors)

### Integration Tests (Fullscreen)
- Idle detection timing
- HA chrome manipulation
- Crossfade animations
- Video playback and completion
- Wake lock behavior
- Dismiss interactions

### Browser Compatibility
- Chrome/Chromium (primary)
- Firefox
- Safari (iOS/macOS)
- Edge
- HA Companion App

### Performance Tests
- Large media libraries (1000+ files)
- Memory usage over time
- CPU usage during playback
- Smooth 60fps animations

---

## Migration Guide for Users

### For Existing Card Users
**No changes required!** The card continues to work exactly as before.

- Existing configurations are preserved
- Card behavior is identical
- GUI editor still works
- No breaking changes

### For New Fullscreen Users

**1. Install/Update:**
```bash
# Via HACS - automatically includes all files
```

**2. Add Resources:**
Dashboard → Settings → Resources → Add:
- `/hacsfiles/ha-media-card/ha-media-fullscreen.js` (module)
- `/hacsfiles/ha-media-card/ha-media-engine-core.js` (module)

**3. Configure Dashboard:**
```yaml
# Dashboard raw config - add at top level
ha_media_fullscreen:
  enabled: true
  media_folder: /config/media/photos
  idle_time: 30
  display_duration: 10
```

**4. Reload Dashboard**

---

## Known Limitations

### Browser Restrictions
- **Wake Lock:** Requires user interaction first (browser security)
- **Fullscreen API:** May require user gesture on some browsers
- **Autoplay:** Videos may need muted on some browsers

### Home Assistant Integration
- **No Backend Component:** Runs entirely in browser (no server-side scanning)
- **Media Source:** Uses same media-source:// paths as card
- **File System:** Limited to HA accessible paths

### Performance
- **Large Libraries:** May have initial scan delay
- **Memory:** Keeps two media buffers loaded
- **Mobile:** Battery impact from wake lock

### Configuration
- **Raw YAML Only:** No GUI editor (limitation of dashboard-level config)
- **Per-Dashboard:** Must configure on each dashboard separately
- **No Live Preview:** Changes require dashboard reload

---

## Future Enhancements (Post-v4.0.0)

### Short Term (v4.1.x)
- [ ] Multiple media folders support
- [ ] Smart collections (favorites, recent, albums)
- [ ] Custom transition effects (slide, zoom, fade variants)
- [ ] Picture-in-picture mode for videos
- [ ] Background audio for video

### Medium Term (v4.2.x)
- [ ] Integration with Media Index (when available)
- [ ] File management UI (favorite/delete/move)
- [ ] Playlist support
- [ ] Schedule-based profiles (day/night themes)
- [ ] Motion detection via camera

### Long Term (v5.0.0)
- [ ] Backend integration component
- [ ] Real-time file system watching
- [ ] Advanced metadata (EXIF, location, faces)
- [ ] Cloud storage support (Google Photos, etc.)
- [ ] Multi-device synchronization

---

## Success Criteria

### Must Have (v4.0.0)
- ✅ Fullscreen mode takes over entire HA viewport
- ✅ Click-to-dismiss functionality
- ✅ Idle detection with configurable timeout
- ✅ Smooth crossfade between media
- ✅ Video autoplay support
- ✅ SubfolderQueue integration
- ✅ Zero breaking changes to existing card
- ✅ Comprehensive documentation

### Should Have
- ✅ Keyboard navigation
- ✅ Touch/swipe gestures
- ✅ Metadata overlay
- ✅ Wake lock support
- ✅ Mobile browser compatibility

### Nice to Have
- ⭕ Ken Burns effect
- ⭕ Ambient info overlay (weather, time, etc.)
- ⭕ Theme variants (dark/light)
- ⭕ Custom CSS support

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| HA DOM structure changes | High | Medium | Follow Wall Panel patterns; version testing |
| Browser compatibility issues | Medium | Medium | Comprehensive cross-browser testing |
| Memory leaks in long sessions | Medium | Low | Proper cleanup; periodic testing |
| MediaEngine extraction breaks card | High | Low | Extensive testing; gradual rollout |
| Wake lock not supported | Low | Medium | Graceful degradation; user notification |

### User Experience Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Configuration too complex | Medium | Medium | Clear docs; sensible defaults |
| Raw YAML editing barrier | Medium | High | Excellent examples; copy-paste configs |
| Unexpected behavior on mobile | Medium | Medium | Mobile-first testing |
| Performance issues large libraries | Medium | Low | Lazy loading; pagination |

---

## Compatibility Matrix

### Home Assistant Versions
- **Minimum:** 2023.1 (when tested)
- **Recommended:** 2024.1+
- **Tested:** 2024.10, 2025.1

### Browsers
- **Chrome/Edge:** 90+ ✅
- **Firefox:** 88+ ✅
- **Safari:** 14+ ⚠️ (limited wake lock)
- **Mobile Chrome:** Full support ✅
- **Mobile Safari:** Limited wake lock ⚠️
- **HA Companion:** Full support ✅

### Media Formats
- **Images:** JPG, PNG, GIF, WebP, HEIC
- **Videos:** MP4, WebM, MOV (browser-dependent)

---

## Questions & Decisions Log

### Resolved
1. **Q:** Single codebase or separate components?  
   **A:** Separate components sharing MediaEngine core (decided 2025-10-24)

2. **Q:** Dashboard-level or card-level config?  
   **A:** Dashboard-level (Wall Panel pattern) for full viewport access

3. **Q:** How to share code?  
   **A:** Extract MediaEngine to separate ES6 module

### Open
1. **Q:** Support multiple instances on same dashboard?  
   **A:** TBD - probably not needed for v4.0.0

2. **Q:** Integration with future Media Index backend?  
   **A:** Design with this in mind, implement in v5.0.0

3. **Q:** Custom CSS injection for themes?  
   **A:** Consider for v4.1.0 if requested

---

## Resources & References

### Wall Panel Analysis
- **Repo:** https://github.com/j-a-n/lovelace-wallpanel
- **Key Insights:**
  - Extends `HuiView` class
  - Injects into `ha-main.shadowRoot`
  - Uses fixed positioning with 100vw/100vh
  - Manipulates HA DOM for chrome hiding
  - Event-based idle detection
  - Dual-buffer display system

### Home Assistant Lovelace
- **Custom Cards Guide:** https://developers.home-assistant.io/docs/frontend/custom-ui/lovelace-custom-card
- **Dashboard Config:** https://www.home-assistant.io/dashboards/

### Browser APIs
- **Wake Lock API:** https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- **Fullscreen API:** https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
- **Intersection Observer:** For visibility detection

---

## Appendix

### A. Example Configurations

#### Minimal Configuration
```yaml
ha_media_fullscreen:
  enabled: true
  media_folder: /config/media/photos
```

#### Full Configuration
```yaml
ha_media_fullscreen:
  # Core
  enabled: true
  media_folder: /config/media/photos
  
  # Timing
  idle_time: 30
  display_duration: 10
  crossfade_duration: 1.5
  fade_in_time: 2.0
  fade_out_time: 1.0
  
  # Video
  video_autoplay: true
  video_loop: false
  video_muted: false
  video_volume: 0.7
  
  # Interaction
  click_to_dismiss: true
  show_navigation: false
  keyboard_enabled: true
  swipe_enabled: true
  
  # Appearance
  background_color: '#000000'
  image_fit: cover
  
  # Metadata
  show_metadata: true
  metadata_position: bottom-right
  metadata_template: '${filename} • ${date|year:numeric,month:long}'
  
  # HA Integration
  hide_toolbar: true
  hide_sidebar: true
  keep_screen_on: true
  z_index: 1000
  
  # Media Options
  recursive: true
  include_subfolders: true
  media_order: sorted
  shuffle_on_restart: false
```

#### Device-Specific (Browser Mod)
```yaml
ha_media_fullscreen:
  enabled: false  # Disabled by default
  profiles:
    device.kitchen_tablet:  # Browser Mod device ID
      enabled: true
      media_folder: /config/media/kitchen
      idle_time: 15
```

### B. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `Escape` | Dismiss screensaver |
| `→` / `N` | Next media |
| `←` / `P` | Previous media |
| `F` | Toggle fullscreen browser |
| `M` | Toggle metadata display |
| `I` | Show debug info |

### C. Touch Gestures

| Gesture | Action |
|---------|--------|
| Tap | Dismiss screensaver |
| Swipe Right | Previous media |
| Swipe Left | Next media |
| Long Press | Show metadata |
| Two-finger Tap | Toggle pause (video) |

---

## Changelog

### 2025-10-24 - Initial Plan
- Created comprehensive implementation plan
- Decided on separate component architecture
- Defined MediaEngine extraction strategy
- Outlined development phases
- Established success criteria

---

## Sign-off

**Created by:** AI Assistant  
**Reviewed by:** [Pending]  
**Approved by:** [Pending]  
**Date:** October 24, 2025  
**Version:** 1.0

---

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1: MediaEngine extraction
3. Set up project tracking (GitHub Issues/Project)
4. Create feature branch: `feature/fullscreen-mode`
