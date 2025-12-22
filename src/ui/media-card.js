import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';
import { MediaProvider } from '../core/media-provider.js';
import { MediaUtils } from '../core/media-utils.js';

/**
 * MediaCard - Main card component
 * Phase 2: Now uses provider pattern to display media
 */
export class MediaCard extends LitElement {
  // Card height validation constants
  static CARD_HEIGHT_MIN = 100;
  static CARD_HEIGHT_MAX = 5000;
  static CARD_HEIGHT_STEP = 50;
  
  // Friendly state names for HA binary sensor device classes (v5.6)
  static FRIENDLY_STATES = {
    'battery': { 'on': 'Low', 'off': 'Normal' },
    'battery_charging': { 'on': 'Charging', 'off': 'Not Charging' },
    'cold': { 'on': 'Cold', 'off': 'Normal' },
    'connectivity': { 'on': 'Connected', 'off': 'Disconnected' },
    'door': { 'on': 'Open', 'off': 'Closed' },
    'garage_door': { 'on': 'Open', 'off': 'Closed' },
    'gas': { 'on': 'Detected', 'off': 'Clear' },
    'heat': { 'on': 'Hot', 'off': 'Normal' },
    'light': { 'on': 'Detected', 'off': 'Clear' },
    'lock': { 'locked': 'Locked', 'unlocked': 'Unlocked' },
    'moisture': { 'on': 'Wet', 'off': 'Dry' },
    'motion': { 'on': 'Detected', 'off': 'Clear' },
    'occupancy': { 'on': 'Detected', 'off': 'Clear' },
    'opening': { 'on': 'Open', 'off': 'Closed' },
    'plug': { 'on': 'Plugged In', 'off': 'Unplugged' },
    'power': { 'on': 'On', 'off': 'Off' },
    'presence': { 'on': 'Home', 'off': 'Away' },
    'problem': { 'on': 'Problem', 'off': 'OK' },
    'running': { 'on': 'Running', 'off': 'Not Running' },
    'safety': { 'on': 'Unsafe', 'off': 'Safe' },
    'smoke': { 'on': 'Detected', 'off': 'Clear' },
    'sound': { 'on': 'Detected', 'off': 'Clear' },
    'tamper': { 'on': 'Tampered', 'off': 'OK' },
    'update': { 'on': 'Available', 'off': 'Up-to-date' },
    'vibration': { 'on': 'Detected', 'off': 'Clear' },
    'window': { 'on': 'Open', 'off': 'Closed' }
  };
  
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    currentMedia: { state: true },
    mediaUrl: { state: true },
    isLoading: { state: true },
    _actionButtonsVisible: { state: true },
    _panelPageStartIndex: { state: true } // Unified paging for all panel modes
  };

  // V4: Image Zoom Helpers
  _zoomToPoint(img, xPercent, yPercent, level) {
    this._isImageZoomed = true;
    this._zoomOriginX = xPercent;
    this._zoomOriginY = yPercent;
    this._zoomLevel = level;

    // Set host attribute for styling/cursor
    this.setAttribute('data-image-zoomed', '');

    // Apply transform
    img.style.transformOrigin = `${xPercent}% ${yPercent}%`;
    img.style.transform = `scale(${level})`;
  }

  _resetZoom(img) {
    this._isImageZoomed = false;
    this.removeAttribute('data-image-zoomed');
    if (img) {
      img.style.transformOrigin = '50% 50%';
      img.style.transform = 'none';
    }
  }

  static getConfigElement() {
    return document.createElement('media-card-editor');
  }

  static getStubConfig() {
    return {
      media_source_type: 'folder',
      folder: {
        path: '/media',
        mode: 'random',
        recursive: true
      },
      media_type: 'all',
      auto_advance_duration: 5,
      show_metadata: true,
      enable_navigation_zones: true,
      title: 'Media Slideshow'
    };
  }

  constructor() {
    super();
    this.provider = null;
    
    // V5 Unified Architecture: Card owns queue/history, providers just populate
    this.queue = [];              // Upcoming items from provider
    this.history = [];            // Navigation trail (what user has seen)
    this.historyIndex = -1;       // Current position in history (-1 = at end)
    this.shownItems = new Set();  // Prevent duplicate display until aged out
    this._maxQueueSize = 0;       // Track highest queue size seen (for position indicator)
    
    // V5.4: Navigation Queue - Separate from provider queue
    // This is what the user navigates through (populated on-demand via getNext())
    this.navigationQueue = [];    // Array of items user can navigate
    this.navigationIndex = -1;    // Current position (-1 = uninitialized, first increment → 0)
    this.maxNavQueueSize = 200;   // Will be updated in setConfig based on slideshow_window * 2
    this.isNavigationQueuePreloaded = false; // V5.4: Track if small collection was pre-loaded
    
    this.currentMedia = null;
    this.mediaUrl = '';
    this.isLoading = false;
    this._cardId = 'card-' + Math.random().toString(36).substr(2, 9);
    this._retryAttempts = new Map(); // Track retry attempts per URL (V4)
    this._errorState = null; // V4 error state tracking
    this._currentMetadata = null; // V4 metadata tracking for action buttons/display
    this._currentMediaPath = null; // V4 current file path for action buttons
    this._tapTimeout = null; // V4 tap action double-tap detection
    this._frontLayerUrl = ''; // V5.6: Front layer for crossfade
    this._backLayerUrl = ''; // V5.6: Back layer for crossfade
    this._frontLayerActive = true; // V5.6: Which layer is currently visible
    this._pendingLayerSwap = false; // V5.6: Flag to trigger swap after image loads
    
    // V5.6: Display Entities System
    this._displayEntitiesVisible = false; // Current visibility state
    this._currentEntityIndex = 0; // Index in filtered entities array
    this._entityStates = new Map(); // entity_id -> state object
    this._entityCycleTimer = null; // Timer for rotating entities
    this._entityFadeTimeout = null; // Timeout for fade transitions
    this._recentlyChangedEntities = new Set(); // Track entities that changed recently
    this._unsubscribeEntities = null; // Unsubscribe function for entity state changes
    this._entityConditionCache = new Map(); // entity_id -> boolean (cached condition results)
    this._evaluatingConditions = false; // Flag to prevent concurrent evaluations
    this._entityStyleCache = new Map(); // entity_id -> string (cached style results)
    
    this._holdTimeout = null; // V4 hold action detection
    this._debugMode = false; // V4 debug logging (set via YAML config in setConfig)
    this._lastLogTime = {}; // V4 log throttling
    this._isPaused = false; // V4 pause state for slideshow
    this._pauseLogShown = false; // Track if pause log message has been shown
    this._showInfoOverlay = false; // Info overlay toggle
    this._editorPreview = false; // V5.5: Flag to indicate card is in config editor preview
    this._cachedHeaderElement = null; // V5.6: Cached HA header element for viewport height calculation
    this._cachedHeaderSelector = null; // V5.6: Selector that found the cached header
    
    // V5.5: Side Panel System (Burst Review & Queue Preview)
    // Panel state
    this._panelMode = null;            // null | 'burst' | 'queue' | 'history'
    this._panelOpen = false;           // Panel visibility
    this._panelQueue = [];             // Items to display in panel
    this._panelQueueIndex = 0;         // Current position within panel queue
    this._panelLoading = false;        // Loading indicator
    
    // Main queue (preserved during panel modes)
    this._mainQueue = [];              // Original navigation queue
    this._mainQueueIndex = 0;          // Position before entering panel mode
    
    // Burst-specific state
    this._burstReferencePhoto = null;  // Original photo that triggered burst
    this._burstFavoritedFiles = [];    // Paths favorited during burst session
    this._burstAllFiles = [];          // All files in burst session for metadata update
    
    // Deprecated (replaced by panel system)
    this._burstMode = false;           // DEPRECATED: Use _panelOpen && _panelMode === 'burst'
    this._burstPhotos = [];            // DEPRECATED: Use _panelQueue
    this._burstCurrentIndex = 0;       // DEPRECATED: Use _panelQueueIndex
    this._burstLoading = false;        // DEPRECATED: Use _panelLoading
    
    // V5.5: On This Day state (anniversary mode)
    this._onThisDayLoading = false;    // Loading indicator for anniversary query
    this._onThisDayWindowDays = 0;     // Current window size (±N days)
    
    // V5.6.0: Play randomized option for panels
    this._playRandomized = false;      // Toggle for randomizing panel playback order
    
    // Modal overlay state (gallery-card pattern)
    this._modalOpen = false;
    this._modalImageUrl = '';
    this._modalCaption = '';
    
    // V4: Circuit breaker for 404 errors
    this._consecutive404Count = 0;
    this._last404Time = 0;
    this._errorAutoAdvanceTimeout = null;
    
    // V5.6: Video thumbnail cache (session-scoped)
    this._videoThumbnailCache = new Map();
    this._thumbnailObserver = null;
    
    // Auto-hide action buttons for touch screens
    this._showButtonsExplicitly = false; // true = show via touch tap (independent of hover)
    this._hideButtonsTimer = null;
    this._actionButtonsBaseTimeout = 3000;  // 3s minimum for touchscreen
    this._actionButtonsMaxTimeout = 15000;  // 15s maximum for touchscreen
    
    this._log('💎 Constructor called, cardId:', this._cardId);
  }

  connectedCallback() {
    super.connectedCallback();
    this._log('💎 connectedCallback - card attached to DOM');
    
    // V4: Set data attributes for CSS styling
    const mediaType = this.currentMedia?.media_content_type || 'image';
    this.setAttribute('data-media-type', mediaType);
    
    // V4: Initialize pause state attribute
    if (this._isPaused) {
      this.setAttribute('data-is-paused', '');
    }
    
    // NEW: Auto-enable kiosk mode if configured
    // This monitors the kiosk entity and auto-enables it when card loads
    if (this.config.kiosk_mode_auto_enable && this._isKioskModeConfigured()) {
      this._setupKioskModeMonitoring();
    }
    
    // V5.6: Setup dynamic viewport height calculation
    this._setupDynamicViewportHeight();
    
    // V5.6: Start clock update timer if clock enabled
    if (this.config.clock?.enabled) {
      this._startClockTimer();
    }
    
    // V5: Restart auto-refresh if it was running before disconnect
    // Only restart if we have a provider, currentMedia, and auto_advance is configured
    if (this.provider && this.currentMedia && this.config.auto_advance_seconds > 0) {
      this._log('🔄 Reconnected - restarting auto-refresh timer');
      this._setupAutoRefresh();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    this._log('🔌 Component disconnected - cleaning up resources');
    
    // NEW: Cleanup kiosk mode monitoring
    this._cleanupKioskModeMonitoring();
    
    // V5.6: Cleanup viewport height observer
    this._cleanupDynamicViewportHeight();
    
    // Cleanup provider subscriptions to prevent memory leaks
    if (this.provider?.dispose) {
      this.provider.dispose();
    }
    
    // V4 CODE REUSE: Store navigation history and queue for reconnection (ha-media-card.js lines 4945-4975)
    const mediaPath = this.config?.folder?.path || this.config?.media_path;
    if (mediaPath && (this.provider || this.history.length > 0)) {
      this._log('💾 Storing state for reconnection - path:', mediaPath);
      
      const stateToStore = {
        navigationHistory: [...this.history],  // Clone array
        historyIndex: this.historyPosition
      };
      
      // If using SubfolderQueue, store the queue instance for reconnection
      // V5 FIX: Don't pause the queue on disconnect - other cards may be using it!
      // The queue is shared globally per media_path, so pausing affects all cards.
      if (this.provider && this.provider.subfolderQueue) {
        const queue = this.provider.subfolderQueue;
        stateToStore.queue = queue;
        this._log('💾 Stored queue with', queue.queue.length, 'items,', queue.discoveredFolders?.length || 0, 'folders');
      }
      
      // Store in global registry
      if (!window.mediaCardSubfolderQueues) {
        window.mediaCardSubfolderQueues = new Map();
      }
      window.mediaCardSubfolderQueues.set(mediaPath, stateToStore);
      this._log('✅ State stored in registry for path:', mediaPath);
    }
    
    // V4: Stop auto-refresh interval to prevent zombie card
    if (this._refreshInterval) {
      this._log('🧹 Clearing auto-refresh interval:', this._refreshInterval);
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    
    // V4: Clear pause flags from video-induced pauses
    if (this._pausedByVideo) {
      this._log('🎬 Clearing video pause flags on disconnect');
      this._pausedByVideo = false;
      this._isPaused = false;
      this.removeAttribute('data-is-paused');
    }
    
    // V4: Clear hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
    
    // V5.6: Cleanup display entities
    this._cleanupDisplayEntities();
    
    // V5.6: Cleanup clock timer
    this._stopClockTimer();
  }

  // V4: Force video reload when URL changes
  updated(changedProperties) {
    super.updated(changedProperties);
    
    // NEW: Setup kiosk monitoring when hass becomes available
    // This handles the case where connectedCallback runs before hass is ready
    if (changedProperties.has('hass') && this.hass && 
        this.config.kiosk_mode_auto_enable && this._isKioskModeConfigured() &&
        !this._kioskStateSubscription) {
      this._log('🖼️ Hass available - setting up kiosk mode monitoring');
      this._setupKioskModeMonitoring();
    }
    
    if (changedProperties.has('mediaUrl')) {
      // Wait for next frame to ensure video element is rendered
      requestAnimationFrame(() => {
        const videoElement = this.shadowRoot?.querySelector('video');
        
        if (videoElement && this.mediaUrl) {
          videoElement.load(); // Force browser to reload the video with new source
          
          // Auto-play if configured
          if (this.config.video_autoplay) {
            videoElement.play().catch(err => {
              // AbortError happens when video is removed from DOM before play() completes (rapid navigation)
              // This is normal during fast navigation and can be safely ignored
              if (err.name !== 'AbortError') {
                console.warn('Video autoplay failed (user interaction may be required):', err);
              }
            });
          }
        }
      });
    }
  }
  
  /**
   * V5.6: Setup dynamic viewport height calculation
   * Detects panel mode and adjusts CSS variable to account for HA header
   * In panel mode (fullscreen), use full viewport; otherwise subtract header height
   */
  _setupDynamicViewportHeight() {
    // Calculate and set initial height
    this._updateAvailableHeight();
    
    // Setup resize observer to recalculate on window resize and element changes
    if (!this._viewportResizeObserver) {
      this._viewportResizeObserver = new ResizeObserver(() => {
        this._updateAvailableHeight();
      });
      this._viewportResizeObserver.observe(document.body);
    }
    
    // Setup polling-based header visibility check for kiosk mode
    // This is more reliable than MutationObserver since kiosk integration may
    // manipulate DOM in ways that don't trigger observers
    if (!this._headerVisibilityInterval) {
      this._lastHeaderVisible = null;
      this._headerVisibilityInterval = setInterval(() => {
        // Use cached header element if available, otherwise search once
        let header = this._cachedHeaderElement;
        
        if (!header) {
          const haRoot = document.querySelector('home-assistant');
          if (!haRoot?.shadowRoot) return;
          
          // Find and cache header element (only happens once)
          const findHeader = (root) => {
            const element = root.querySelector('div.header, .header, app-header, app-toolbar');
            if (element) return element;
            const elementsWithShadow = root.querySelectorAll('*');
            for (const el of elementsWithShadow) {
              if (el.shadowRoot) {
                const found = findHeader(el.shadowRoot);
                if (found) return found;
              }
            }
            return null;
          };
          
          header = findHeader(haRoot.shadowRoot);
          if (header) {
            this._cachedHeaderElement = header;
          }
        }
        
        if (header) {
          const isVisible = header.offsetHeight > 0;
          
          // Only recalculate if visibility state changed
          if (this._lastHeaderVisible !== isVisible) {
            this._log(`📐 Header visibility changed: ${isVisible ? 'visible' : 'hidden'}`);
            this._lastHeaderVisible = isVisible;
            this._updateAvailableHeight();
          }
        }
      }, 200); // Check every 200ms
    }
  }
  
  /**
   * V5.6: Cleanup viewport height observer
   */
  _cleanupDynamicViewportHeight() {
    if (this._viewportResizeObserver) {
      this._viewportResizeObserver.disconnect();
      this._viewportResizeObserver = null;
    }
    if (this._headerVisibilityInterval) {
      clearInterval(this._headerVisibilityInterval);
      this._headerVisibilityInterval = null;
    }
  }
  
  /**
   * V5.6: Calculate actual available viewport height
   * Detects if HA header is visible and adjusts accordingly
   * Sets CSS variable --available-viewport-height for use in styles
   */
  _updateAvailableHeight() {
    // Get actual window height
    const windowHeight = window.innerHeight;

    // V5.6: Use cached header if available, otherwise search for it
    let header = this._cachedHeaderElement;
    let matchedSelector = this._cachedHeaderSelector;
    
    if (!header) {
      // Helper to search through shadow DOM recursively with depth limit
      const findInShadowDOM = (root, selector, depth = 0, maxDepth = 5) => {
        // Limit recursion depth to avoid performance issues
        if (depth > maxDepth) return null;
        
        // Try in current root
        const element = root.querySelector(selector);
        if (element) return element;
        
        // Search recursively in shadow roots
        const elementsWithShadow = root.querySelectorAll('*');
        for (const el of elementsWithShadow) {
          if (el.shadowRoot) {
            const found = findInShadowDOM(el.shadowRoot, selector, depth + 1, maxDepth);
            if (found) return found;
          }
        }
        return null;
      };

      // Try to find header in shadow DOM (Home Assistant hides it there)
      // Start from home-assistant root element
      const haRoot = document.querySelector('home-assistant');
      if (haRoot?.shadowRoot) {
        const headerSelectors = [
          'div.header',
          '.header',
          'app-header',
          'app-toolbar'
        ];
        
        for (const selector of headerSelectors) {
          header = findInShadowDOM(haRoot.shadowRoot, selector);
          if (header) {
            matchedSelector = selector;
            // Cache for future calls
            this._cachedHeaderElement = header;
            this._cachedHeaderSelector = selector;
            this._log('📍 Cached header element:', matchedSelector);
            break;
          }
        }
      }
    }
    
    const headerHeight = header?.offsetHeight || 0;
    
    // Check if header is actually visible (offsetHeight > 0 and not hidden)
    const isHeaderVisible = headerHeight > 0 && 
                           header && 
                           window.getComputedStyle(header).display !== 'none' &&
                           window.getComputedStyle(header).visibility !== 'hidden';
    
    let availableHeight = windowHeight;
    
    if (isHeaderVisible) {
      // Header is visible, subtract its height
      availableHeight = windowHeight - headerHeight;
    }
    
    // Only log if available height actually changed (throttle logging)
    if (this._lastLoggedHeight !== availableHeight) {
      if (isHeaderVisible) {
        this._log(`📐 [${this._cardId}] Header visible (${matchedSelector}): ${availableHeight}px available (window: ${windowHeight}px, header: ${headerHeight}px)`);
      } else {
        this._log(`📐 [${this._cardId}] Header hidden: Using full viewport ${windowHeight}px (selector: ${matchedSelector}, found: ${!!header}, height: ${headerHeight})`);
      }
      this._lastLoggedHeight = availableHeight;
    }
    
    // Set CSS variable for use in styles
    this.style.setProperty('--available-viewport-height', `${availableHeight}px`);
  }
  
  // V4: Debug logging with throttling
  _log(...args) {
    if (this._debugMode || window.location.hostname === 'localhost') {
      // Prefix all logs with card ID and path for debugging
      const path = this.config?.single_media?.path?.split('/').pop() || 
                   this.config?.media_path?.split('/').pop() || 'no-path';
      const prefix = `[${this._cardId}:${path}]`;
      const message = args.join(' ');
      
      // Throttle certain frequent messages to avoid spam
      const throttlePatterns = [
        'hass setter called',
        'Component updated',
        'Media type from folder contents',
        'Rendering media with type'
      ];
      
      const shouldThrottle = throttlePatterns.some(pattern => message.includes(pattern));
      
      if (shouldThrottle) {
        const now = Date.now();
        const lastLog = this._lastLogTime?.[message] || 0;
        
        // Only log throttled messages every 10 seconds
        if (now - lastLog < 10000) {
          return;
        }
        
        if (!this._lastLogTime) this._lastLogTime = {};
        this._lastLogTime[message] = now;
      }
      
      console.log(prefix, ...args);
    }
  }

  /**
   * Utility: Check if card is currently in editor mode
   * Walks up parent chain to detect if inside hui-dialog-edit-card
   * @returns {boolean} True if card is being edited in the card editor
   */
  _isInEditorMode() {
    let element = this;
    while (element) {
      const parent = element.parentElement || element.getRootNode()?.host;
      if (parent?.tagName === 'HUI-DIALOG-EDIT-CARD') {
        return true;
      }
      if (!parent || parent === document.body || parent === document.documentElement) {
        break;
      }
      element = parent;
    }
    return false;
  }

  // V4 → V5a Config Migration
  _migrateV4ConfigToV5a(v4Config) {
    this._log('🔄 Starting V4 → V5a config migration');
    
    const v5aConfig = { ...v4Config };
    
    // 1. Detect media source type and create folder/single_media structure
    if (v4Config.is_folder === true) {
      v5aConfig.media_source_type = 'folder';
      
      // Extract path from media-source:// URI
      let path = v4Config.media_path || '';
      if (path.startsWith('media-source://media_source')) {
        path = path.replace('media-source://media_source', '');
      }
      
      v5aConfig.folder = {
        path: path,
        mode: v4Config.folder_mode || 'random', // random, sequential, shuffle
        recursive: true, // V4 always recursive with subfolder_queue
        use_media_index_for_discovery: v4Config.media_index?.enabled === true,
        priority_new_files: v4Config.subfolder_queue?.priority_folder_patterns?.length > 0,
        new_files_threshold_seconds: 86400, // Default 1 day
        scan_depth: v4Config.subfolder_queue?.scan_depth || 5,
        estimated_total_photos: v4Config.subfolder_queue?.estimated_total_photos || 100
      };
      
      // Remove old V4 properties
      delete v5aConfig.media_path;
      delete v5aConfig.is_folder;
      delete v5aConfig.folder_mode;
      delete v5aConfig.subfolder_queue;
    } else {
      // Single media file
      v5aConfig.media_source_type = 'single_media';
      
      let path = v4Config.media_path || '';
      if (path.startsWith('media-source://media_source')) {
        path = path.replace('media-source://media_source', '');
      }
      
      v5aConfig.single_media = {
        path: path
      };
      
      delete v5aConfig.media_path;
      delete v5aConfig.is_folder;
    }
    
    // 2. Migrate auto-advance timing
    if (v4Config.auto_refresh_seconds !== undefined) {
      v5aConfig.auto_advance_seconds = v4Config.auto_refresh_seconds;
      delete v5aConfig.auto_refresh_seconds;
    }
    
    // 3. Migrate slideshow behavior (V5a is always smart)
    delete v5aConfig.slideshow_behavior;
    
    // 4. Migrate media_index config structure
    if (v4Config.media_index?.enabled === true && v4Config.media_index?.entity_id) {
      v5aConfig.media_index = {
        entity_id: v4Config.media_index.entity_id
      };
      // prefetch_offset removed in V5a
    }
    
    // 5. Keep all other V4 options that are compatible
    // These work in both V4 and V5a:
    // - video_autoplay, video_muted, video_loop, video_max_duration
    // - aspect_mode (viewport-fit, viewport-fill, smart-scale)
    // - metadata (show_filename, position, show_location, show_folder, etc.)
    // - action_buttons (position, enable_favorite, enable_delete, enable_edit)
    // - enable_navigation_zones, show_position_indicator, show_dots_indicator
    // - enable_keyboard_navigation
    // - enable_image_zoom, zoom_level
    // - slideshow_window
    // - hide_video_controls_display
    // - debug_mode
    // - kiosk_mode_entity, kiosk_mode_exit_action, kiosk_mode_auto_enable
    // - tap_action, double_tap_action, hold_action
    
    // 6. Map auto_advance_mode (V4's slideshow continuation behavior)
    if (v4Config.auto_advance_mode) {
      v5aConfig.auto_advance_mode = v4Config.auto_advance_mode; // reset | continue
    }
    
    // 7. Remove V4-specific properties that don't exist in V5a
    delete v5aConfig.debug_queue_mode; // V5a doesn't have queue debug mode
    
    this._log('✅ Migration complete:', {
      media_source_type: v5aConfig.media_source_type,
      folder: v5aConfig.folder,
      single_media: v5aConfig.single_media,
      auto_advance_seconds: v5aConfig.auto_advance_seconds
    });
    
    return v5aConfig;
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this._log('📝 setConfig called with:', config);
    
    // MIGRATION: Detect V4 config and convert to V5a format
    if (!config.media_source_type && config.media_path) {
      this._log('🔄 Detected V4 config - migrating to V5a format');
      config = this._migrateV4ConfigToV5a(config);
      this._log('✅ V4 config migrated:', config);
    }
    
    // V5: Clear auto-advance timer when reconfiguring (prevents duplicate timers)
    if (this._refreshInterval) {
      this._log('🧹 Clearing existing auto-advance timer before reconfiguration');
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    
    // V5: Validate and clamp max_height_pixels if present
    if (config.max_height_pixels !== undefined) {
      const height = parseInt(config.max_height_pixels);
      if (isNaN(height) || height <= 0) {
        // Invalid value - remove it
        const originalValue = config.max_height_pixels;
        delete config.max_height_pixels;
        this._log('⚠️ Removed invalid max_height_pixels:', originalValue);
      } else if (height < MediaCard.CARD_HEIGHT_MIN || height > MediaCard.CARD_HEIGHT_MAX) {
        // Out of range - clamp to valid range
        config.max_height_pixels = Math.max(MediaCard.CARD_HEIGHT_MIN, Math.min(MediaCard.CARD_HEIGHT_MAX, height));
        this._log('⚠️ Clamped max_height_pixels to valid range (100-5000):', config.max_height_pixels);
      }
    }
    
    // V5.3: Validate and clamp card_height if present (PR #37 by BasicCPPDev)
    if (config.card_height !== undefined) {
      const height = parseInt(config.card_height);
      if (isNaN(height) || height <= 0) {
        // Invalid value - remove it
        const originalValue = config.card_height;
        delete config.card_height;
        this._log('⚠️ Removed invalid card_height:', originalValue);
      } else if (height < MediaCard.CARD_HEIGHT_MIN || height > MediaCard.CARD_HEIGHT_MAX) {
        // Out of range - clamp to valid range
        config.card_height = Math.max(MediaCard.CARD_HEIGHT_MIN, Math.min(MediaCard.CARD_HEIGHT_MAX, height));
        this._log('⚠️ Clamped card_height to valid range (100-5000):', config.card_height);
      }
    }
    
    // V5: Reset provider to force reinitialization with new config
    if (this.provider) {
      this._log('🧹 Clearing existing provider before reconfiguration');
      this.provider = null;
    }
    
    // V5 FIX: Don't clear navigation state on reconfiguration
    // Reconnection logic will restore from registry if available
    // Only clear if this is initial configuration (no history yet)
    if (!this.history || this.history.length === 0) {
      this._log('📋 Initializing empty navigation state (new card)');
      this.queue = [];
      this.history = [];
      this.historyPosition = -1;
      this.shownItems = new Set();
      this.currentMedia = null;
      this._currentMediaPath = null;
      this._currentMetadata = null;
    } else {
      this._log('📋 Preserving navigation state during reconfiguration (', this.history.length, 'items in history)');
    }
    
    // Apply defaults for metadata display and media source type
    this.config = {
      media_source_type: 'single_media', // Default to single_media mode
      // V4: Navigation options defaults
      enable_navigation_zones: true,
      show_position_indicator: true,
      show_dots_indicator: true,
      enable_keyboard_navigation: true,
      auto_advance_mode: 'reset', // V4: reset | continue
      // V5: Video defaults - autoplay and muted for better UX
      video_autoplay: true,
      video_muted: true,
      ...config,
      metadata: {
        show_filename: false,
        show_folder: true,
        show_date: true,
        show_time: false,
        show_location: true,
        show_rating: false,
        show_root_folder: true,
        position: 'bottom-left',
        ...config.metadata
      },
      // V5.6: Display Entities defaults
      display_entities: {
        enabled: false,
        position: 'top-left',
        entities: [], // Array of entity configs (YAML only)
        cycle_interval: 10, // seconds
        transition_duration: 500, // milliseconds
        prefer_recent_changes: false,
        recent_change_window: 60, // seconds
        ...config.display_entities
      },
      // V5.6: Clock/Date Overlay defaults
      clock: {
        enabled: false,
        position: 'bottom-left',
        show_time: true,
        show_date: true,
        format: '12h', // or '24h'
        date_format: 'long', // or 'short'
        show_background: true, // V5.6: Optional background
        ...config.clock
      },
      // V5.6: Global overlay opacity control
      overlay_opacity: config.overlay_opacity ?? 0.25,
      // V5.7: Card background blending - default true for seamless look
      blend_with_background: config.blend_with_background !== false,
      // V5.7: Edge fade strength (0 = disabled, 1-100 = enabled with fade intensity)
      edge_fade_strength: config.edge_fade_strength ?? 0
    };
    
    // V4: Set debug mode from config
    // Honor debug_mode config (YAML setting or runtime toggle via debug button)
    // This ensures debug button respects existing debug_mode: true in config
    // Don't override if already set by debug button (runtime toggle)
    if (this._debugMode === undefined || this._debugMode === false) {
      this._debugMode = this.config.debug_mode === true;
    }
    
    // Set aspect ratio mode data attribute for CSS styling (from V4)
    const aspectMode = config.aspect_mode || 'default';
    if (aspectMode !== 'default') {
      this.setAttribute('data-aspect-mode', aspectMode);
    } else {
      this.removeAttribute('data-aspect-mode');
    }
    
    // V5.3: Set card height CSS variables with precedence logic (PR #37 by BasicCPPDev)
    // card_height takes precedence over max_height_pixels when both are present
    if (config.card_height && config.card_height > 0) {
      this.style.setProperty('--card-height', `${config.card_height}px`);
      this.setAttribute('data-card-height', 'true');
      // Remove max_height if card_height is set (precedence)
      this.style.removeProperty('--media-max-height');
    } else {
      this.style.removeProperty('--card-height');
      this.removeAttribute('data-card-height');
      // Apply max_height_pixels only if card_height is not set (backward compatibility)
      if (config.max_height_pixels && config.max_height_pixels > 0) {
        this.style.setProperty('--media-max-height', `${config.max_height_pixels}px`);
      } else {
        this.style.removeProperty('--media-max-height');
      }
    }
    
    // V5: Set media source type attribute for CSS targeting
    const mediaSourceType = this.config.media_source_type || 'single_media';
    this.setAttribute('data-media-source-type', mediaSourceType);
    
    // V5.7: Set blend with background attribute for CSS targeting
    if (this.config.blend_with_background !== false) {
      this.setAttribute('data-blend-with-background', 'true');
    } else {
      this.removeAttribute('data-blend-with-background');
    }
    
    // V5.7: Set edge fade attribute and strength for CSS targeting
    if (this.config.edge_fade_strength > 0) {
      this.setAttribute('data-edge-fade', 'true');
      this.style.setProperty('--edge-fade-strength', this.config.edge_fade_strength);
    } else {
      this.removeAttribute('data-edge-fade');
      this.style.removeProperty('--edge-fade-strength');
    }
    
    // V5: Set position indicator position attribute for CSS targeting
    const positionIndicatorPosition = this.config.position_indicator?.position || 'bottom-right';
    this.setAttribute('data-position-indicator-position', positionIndicatorPosition);
    
    // V5.3: Set max navigation queue size based on slideshow_window
    const slideshowWindow = this.config.slideshow_window || 100;
    this.maxNavQueueSize = slideshowWindow * 2;
    this._log('Set maxNavQueueSize to', this.maxNavQueueSize, '(slideshow_window * 2)');
    
    // V5: Trigger reinitialization if we already have hass
    if (this._hass) {
      this._log('📝 setConfig: Triggering provider reinitialization with existing hass');
      this._initializeProvider();
    }
  }

  set hass(hass) {
    const hadHass = !!this._hass;
    this._hass = hass;
    
    // Only log on first hass to prevent log spam
    if (!hadHass) {
      this._log('💎 hass setter called. Had hass before:', hadHass, 'Has provider:', !!this.provider);
    }
    
    // Initialize provider when hass is first set
    if (hass && !this.provider) {
      this._log('💎 Triggering provider initialization');
      this._initializeProvider();
    }
    
    // V5.6: Subscribe to display entities when hass is available
    if (hass && this.config?.display_entities?.enabled) {
      if (!this._displayEntitiesInitialized) {
        this._displayEntitiesInitialized = true;
        this._initDisplayEntities();
      } else {
        // Just update entity states, don't re-initialize
        this._updateDisplayEntityStates();
      }
    }
    
    // V5.4: Monitor media_index entity state for auto-recovery after HA restart
    // If card is in error state and media_index entity exists and is available, retry init
    if (hass && this._errorState && this.config?.media_index?.entity_id) {
      const entityId = this.config.media_index.entity_id;
      const entityState = hass.states[entityId];
      
      // Check if entity exists and has valid state (not unavailable/unknown)
      if (entityState && entityState.state !== 'unavailable' && entityState.state !== 'unknown') {
        // Entity is now available - retry initialization
        this._log('🔄 Media index entity available - retrying initialization');
        this._errorState = null; // Clear error state
        this._initializeProvider();
      }
    }
    
    // Note: Don't call requestUpdate() here - Lit will handle it automatically
    // since hass is a reactive property. We can't prevent the auto-update,
    // but we can make render() cheap when paused.
  }

  get hass() {
    return this._hass;
  }

  async _initializeProvider() {
    if (!this.config || !this.hass) {
      this._log('Cannot initialize - missing config or hass');
      return;
    }

    // Reset max queue size when initializing new provider
    this._maxQueueSize = 0;

    // Auto-detect media source type if not set
    let type = this.config.media_source_type;
    if (!type) {
      if (this.config.media_path && this.config.media_path.trim()) {
        type = 'single_media';
        this._log('Auto-detected single_media mode from media_path');
      } else {
        this._log('⚙️ Card configuration incomplete - waiting for media source setup');
        return;
      }
    }

    // V4 CODE REUSE: Check for existing queue in registry (ha-media-card.js lines 643-660)
    // Reconnection logic - restore history/position from paused provider
    const mediaPath = this.config.folder?.path || this.config.media_path;
    if (mediaPath && window.mediaCardSubfolderQueues?.has(mediaPath)) {
      this._log('🔗 Reconnecting to existing queue for path:', mediaPath);
      const storedData = window.mediaCardSubfolderQueues.get(mediaPath);
      
      // Restore navigation history and position
      if (storedData.navigationHistory) {
        this.history = storedData.navigationHistory;
        this.historyPosition = storedData.historyIndex !== undefined ? storedData.historyIndex : -1;
        this._log('📚 Restored navigation history:', this.history.length, 'items, position:', this.historyPosition);
      }
      
      // For SubfolderQueue, reconnect to existing queue instance
      if (storedData.queue) {
        this._log('🔗 Queue has', storedData.queue.queue.length, 'items,', storedData.queue.discoveredFolders?.length || 0, 'folders');
        
        // Resume the queue with this card instance
        if (storedData.queue.resumeWithNewCard) {
          const reconnected = storedData.queue.resumeWithNewCard(this);
          if (reconnected) {
            // FolderProvider will use this existing queue
            this._existingSubfolderQueue = storedData.queue;
            this._log('✅ SubfolderQueue reconnected successfully');
          } else {
            this._log('⚠️ SubfolderQueue reconnection failed - will create new queue');
          }
        }
      }
      
      // Remove from registry after reconnecting
      window.mediaCardSubfolderQueues.delete(mediaPath);
      this._log('🗑️ Removed queue from registry after reconnection');
    }

    this._log('Initializing provider:', type, 'Config:', this.config);
    
    try {
      switch(type) {
        case 'single_media':
          this.provider = new SingleMediaProvider(this.config, this.hass);
          break;
        
        case 'folder':
          // Validate folder configuration
          if (!this.config.folder || !this.config.folder.path) {
            this._log('⚠️ Folder mode requires folder.path - please configure media path');
            this.isLoading = false;
            return;
          }
          
          // Determine folder mode (default to subfolder_queue for backward compatibility)
          const folderMode = this.config.folder.mode || 'subfolder_queue';
          this._log(`📁 Initializing FolderProvider - mode: ${folderMode}, path: ${this.config.folder.path}`);
          
          this.provider = new FolderProvider(this.config, this.hass, this);
          break;
        
        default:
          console.warn('[MediaCard] Unknown media source type:', type, '- defaulting to single_media');
          this.provider = new SingleMediaProvider(this.config, this.hass);
      }

      // Initialize provider
      this.isLoading = true;
      this._log('Calling provider.initialize()');
      const success = await this.provider.initialize();
      this._log('Provider initialized:', success);
      
      if (success) {
        // V5 FIX: If we reconnected with history, restore current media from history
        if (this.history.length > 0 && this.historyPosition >= 0) {
          this._log('🔄 Reconnected with history - loading media at position', this.historyPosition);
          const historyItem = this.history[this.historyPosition];
          if (historyItem) {
            this.currentMedia = historyItem;
            await this._resolveMediaUrl();
          } else {
            // Fallback to loading next if history position invalid
            await this._loadNext();
          }
        } else {
          this._log('Loading first media');
          
          // V5.3: Smart pre-load - only for small collections
          await this._smartPreloadNavigationQueue();
          
          await this._loadNext();
        }
        
        // V5.5: Auto-open queue preview if configured
        // Now that panel renders inside card, no need to prevent opening in editor mode
        if (this.config.action_buttons?.auto_open_queue_preview === true && 
            this.config.action_buttons?.enable_queue_preview === true) {
          // Open queue preview immediately if queue has any items
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            if (this.navigationQueue && this.navigationQueue.length > 0) {
              this._enterQueuePreviewMode();
            } else {
              // Queue not ready yet, wait a bit longer
              setTimeout(() => {
                if (this.navigationQueue && this.navigationQueue.length > 0) {
                  this._enterQueuePreviewMode();
                }
              }, 500);
            }
          });
        }
      } else {
        console.error('[MediaCard] Provider initialization failed');
        this._errorState = 'Provider initialization failed';
      }
    } catch (error) {
      console.error('[MediaCard] Error initializing provider:', error);
      // V5.3: Store error message for display in card UI
      this._errorState = error.message || 'Provider initialization failed';
    } finally {
      this.isLoading = false;
    }
  }

  // V5.3: Smart pre-load - only for small collections that fit in window
  async _smartPreloadNavigationQueue() {
    // Check if this is a small collection that we should pre-load
    // Need to access the actual provider (might be wrapped by FolderProvider)
    let actualProvider = this.provider;
    
    // Unwrap FolderProvider to get actual provider
    if (actualProvider.sequentialProvider) {
      actualProvider = actualProvider.sequentialProvider;
    } else if (actualProvider.mediaIndexProvider) {
      actualProvider = actualProvider.mediaIndexProvider;
    } else if (actualProvider.subfolderQueue) {
      // File system scanning via SubfolderQueue
      const queue = actualProvider.subfolderQueue;
      const queueSize = queue.queue?.length || 0;
      const isScanComplete = !queue.isScanning && !queue.discoveryInProgress;
      
      // Check mode - pre-loading only makes sense for sequential mode
      // Random mode manages its own queue dynamically with refills
      const mode = this.config.folder?.mode || 'random';
      
      // Pre-load ONLY for sequential mode if scan is complete and collection is small
      if (mode === 'sequential' && isScanComplete && queueSize > 0 && queueSize <= this.maxNavQueueSize) {
        this._log(`Small sequential collection (${queueSize} items), pre-loading...`);
        
        // Transform queue items directly
        for (const rawItem of queue.queue) {
          // SubfolderQueue stores full media browser items - use media_content_id directly
          const mediaId = rawItem.media_content_id;
          const pathForMetadata = rawItem.title || rawItem.media_content_id;
          
          // Extract metadata from path/title
          const pathMetadata = MediaProvider.extractMetadataFromPath(pathForMetadata, this.config);
          
          // For Reolink URIs, try to extract timestamp from media_content_id
          // Format: media-source://reolink/FILE|device_id|channel|sub|timestamp1|timestamp2|timestamp3
          // timestamp2 appears to be the actual video start time (matches title "HH:MM:SS duration")
          if (mediaId && mediaId.includes('reolink') && mediaId.includes('|')) {
            const parts = mediaId.split('|');
            // Look for 14-digit timestamps (YYYYMMDDHHmmSS)
            const timestamps = parts.filter(p => /^\d{14}$/.test(p));
            
            // Use second timestamp if available (actual video start time), otherwise first
            const timestampToUse = timestamps.length > 1 ? timestamps[1] : timestamps[0];
            
            if (timestampToUse) {
              const timestampDate = MediaProvider.extractDateFromFilename(timestampToUse, this.config);
              if (timestampDate) {
                pathMetadata.date = timestampDate;
                pathMetadata.date_taken = timestampDate;
                this._log(`📅 Extracted Reolink timestamp [${timestamps.indexOf(timestampToUse) + 1}/${timestamps.length}]: ${timestampToUse} → ${timestampDate.toISOString()}`);
              }
            }
          }
          
          const transformedItem = {
            media_content_id: mediaId,
            media_content_type: rawItem.media_class || MediaUtils.detectFileType(pathForMetadata) || 'image',
            title: rawItem.title, // Keep title at top level for display
            metadata: {
              ...pathMetadata,
              title: rawItem.title,
              path: pathForMetadata
            }
          };
          
          this.navigationQueue.push(transformedItem);
          
          if (this.navigationQueue.length >= this.maxNavQueueSize) break;
        }
        
        this._log(`✅ Pre-loaded ${this.navigationQueue.length} items from SubfolderQueue`);
        this.isNavigationQueuePreloaded = true;
      }
      
      return; // Exit early, SubfolderQueue handled
    }
    
    // Determine if small collection based on provider type
    let isSmallCollection = false;
    let estimatedSize = 0;
    
    if (actualProvider.hasMore !== undefined) {
      // SequentialMediaIndexProvider: Use hasMore flag
      isSmallCollection = actualProvider.hasMore === false;
      estimatedSize = actualProvider.queue?.length || 0;
    } else if (actualProvider.queue) {
      // MediaIndexProvider (random mode): Small if initial query returned less than requested
      estimatedSize = actualProvider.queue.length;
      const requestedSize = actualProvider.queueSize || 100;
      isSmallCollection = estimatedSize < requestedSize;
    }
    
    if (!isSmallCollection) {
      return;
    }
    
    if (estimatedSize > this.maxNavQueueSize) {
      return;
    }
    
    this._log(`Pre-loading ${estimatedSize} items...`);
    
    // Different pre-load strategy based on provider type
    if (actualProvider.hasMore !== undefined) {
      // SequentialMediaIndexProvider: Disable auto-loop and call getNext()
      actualProvider.disableAutoLoop = true;
      
      let loadedCount = 0;
      while (loadedCount < this.maxNavQueueSize) {
        const item = await this.provider.getNext();
        if (!item) {
          break;
        }
        this.navigationQueue.push(item);
        loadedCount++;
      }
      
      actualProvider.disableAutoLoop = false;
    } else if (actualProvider.queue) {
      // MediaIndexProvider (random): Manually transform queue items (can't disable auto-refill)
      
      for (const rawItem of actualProvider.queue) {
        // Transform using same logic as getNext() (but don't shift from queue)
        const pathMetadata = MediaProvider.extractMetadataFromPath(rawItem.path, this.config);
        const mediaId = rawItem.media_source_uri || rawItem.path;
        
        const transformedItem = {
          media_content_id: mediaId,
          media_content_type: MediaUtils.detectFileType(rawItem.path) || 'image',
          metadata: {
            ...pathMetadata,
            path: rawItem.path,
            media_source_uri: rawItem.media_source_uri,
            date_taken: rawItem.date_taken,
            created_time: rawItem.created_time,
            location_city: rawItem.location_city,
            location_state: rawItem.location_state,
            location_country: rawItem.location_country,
            location_name: rawItem.location_name,
            has_coordinates: rawItem.has_coordinates || false,
            is_geocoded: rawItem.is_geocoded || false,
            latitude: rawItem.latitude,
            longitude: rawItem.longitude,
            is_favorited: rawItem.is_favorited || false
          }
        };
        
        this.navigationQueue.push(transformedItem);
        
        if (this.navigationQueue.length >= this.maxNavQueueSize) break;
      }
    }
    
    this._log(`✅ Pre-loaded ${this.navigationQueue.length} items`);
    this.isNavigationQueuePreloaded = true; // Mark as pre-loaded
  }

  // V5: Unified navigation - card owns queue/history, provider just supplies items
  async _loadNext() {
    // V5.6: Set flag FIRST to ignore video pause events during navigation
    // The browser auto-pauses videos when they're removed from DOM
    this._navigatingAway = true;

    // V5.5: Panel Navigation Override
    if (this._panelOpen && this._panelQueue.length > 0) {
      this._navigatingAway = false;
      return await this._loadNextPanel();
    }
    
    if (!this.provider) {
      this._log('_loadNext called but no provider');
      this._navigatingAway = false;
      return;
    }

    // V4: Handle auto_advance_mode when manually navigating
    this._handleAutoAdvanceModeOnNavigate();

    try {
      // V5.3: Navigation Queue Architecture
      // Store pending index (will be applied when media loads to sync with metadata)
      const nextIndex = this.navigationIndex + 1;
      
      // Need to load more items?
      if (nextIndex >= this.navigationQueue.length) {
        // V5.3: If this was a pre-loaded small collection, don't load more - just wrap
        if (this.isNavigationQueuePreloaded) {
          this._log('Pre-loaded collection exhausted, wrapping to beginning');
          
          // V5.4: Check for new files before wrapping back to position 1
          // This ensures files that arrived mid-carousel are shown immediately
          const queueRefreshed = await this._checkForNewFiles();
          if (queueRefreshed) {
            // Queue was refreshed and reset to position 1 with new files
            return;
          }
          
          this._pendingNavigationIndex = 0;
        } else {
          this._log('Navigation queue exhausted, loading from provider');
          let item = await this.provider.getNext();
        
          if (item) {
            this._log('Got item from provider:', item.title);
          
            // V5.3: Check if item already exists in navigation queue (prevent duplicates)
            let alreadyInQueue = this.navigationQueue.some(q => q.media_content_id === item.media_content_id);
            let attempts = 0;
            const maxAttempts = 10; // Prevent infinite loop if provider keeps returning same item
            
            while (alreadyInQueue && attempts < maxAttempts) {
              this._log(`⚠️ Item already in navigation queue (attempt ${attempts + 1}), getting next:`, item.media_content_id);
              item = await this.provider.getNext();
              if (!item) break;
              alreadyInQueue = this.navigationQueue.some(q => q.media_content_id === item.media_content_id);
              attempts++;
            }
            
            // Log if we hit the safety limit (indicates provider may be stuck)
            if (attempts >= maxAttempts && alreadyInQueue) {
              this._log('⚠️ Max attempts reached in duplicate detection - provider may be returning same item repeatedly');
              // Treat as provider exhaustion - wrap to beginning
              this._log('Treating as provider exhaustion, wrapping to beginning');
              
              // Validate queue has items before wrapping
              if (this.navigationQueue.length === 0) {
                this._log('ERROR: Cannot wrap - navigation queue is empty');
                this._errorState = 'Provider exhausted with no items in queue';
                return;
              }
              
              // V5.4: Check for new files before wrapping back to position 1
              const queueRefreshed = await this._checkForNewFiles();
              if (queueRefreshed) {
                // Queue was refreshed and reset to position 1 with new files
                return;
              }
              
              this._pendingNavigationIndex = 0;
              return;
            }
            
            if (!item || alreadyInQueue) {
              // All items are duplicates or provider exhausted, wrap to beginning
              this._log('Provider exhausted or only returning duplicates, wrapping to beginning');
              
              // Validate queue has items before wrapping
              if (this.navigationQueue.length === 0) {
                this._log('ERROR: Cannot wrap - navigation queue is empty');
                this._errorState = 'No media available in navigation queue';
                return;
              }
              
              // V5.4: Check for new files before wrapping back to position 1
              const queueRefreshed = await this._checkForNewFiles();
              if (queueRefreshed) {
                // Queue was refreshed and reset to position 1 with new files
                return;
              }
              
              this._pendingNavigationIndex = 0;
              return;
            }
            
            this._log('✅ Adding new item to navigation queue:', item.title);
          
            // V5: Extract metadata if not provided
            if (!item.metadata) {
              this._log('Extracting metadata for:', item.media_content_id);
              item.metadata = await this._extractMetadataFromItem(item);
            }
          
            // Add to navigation queue
            this.navigationQueue.push(item);
          
            // Implement sliding window: remove oldest if exceeding max size
            if (this.navigationQueue.length > this.maxNavQueueSize) {
              this._log('Navigation queue exceeds max size, removing oldest item');
              this.navigationQueue.shift();
              this.navigationIndex--; // Adjust index for removed item
            }
          } else {
            // No more items available from provider, wrap to beginning
            this._log('Provider exhausted, wrapping to beginning');
            
            // Validate queue has items before wrapping
            if (this.navigationQueue.length === 0) {
              this._log('ERROR: Cannot wrap - navigation queue is empty');
              this._errorState = 'No media available from provider';
              return;
            }
            
            // V5.4: Check for new files before wrapping back to position 1
            const queueRefreshed = await this._checkForNewFiles();
            if (queueRefreshed) {
              // Queue was refreshed and reset to position 1 with new files
              return;
            }
            
            this._pendingNavigationIndex = 0;
          }
        }
      }
      
      // Get item at current navigation index
      const item = this.navigationQueue[nextIndex];
      if (!item) {
        this._log('ERROR: No item at navigationIndex', nextIndex);
        return;
      }
      
      // Extract filename from path for logging
      const filename = item.metadata?.filename || item.media_content_id?.split('/').pop() || 'unknown';
      this._log('Displaying navigation queue item:', filename, 'at index', nextIndex);
      
      // Store pending index (will apply when media loads)
      this._pendingNavigationIndex = nextIndex;
      
      // Add to history for tracking (providers use this for exclusion)
      // Check by media_content_id to avoid duplicate object references
      const alreadyInHistory = this.history.some(h => h.media_content_id === item.media_content_id);
      if (!alreadyInHistory) {
        this.history.push(item);
        
        // V5: Dynamic history size formula
        const queueSize = this.config.slideshow_window || 100;
        // Support legacy field names
        const autoAdvanceInterval = this.config.auto_advance_seconds || 
                                    this.config.auto_advance_interval || 
                                    this.config.auto_advance_duration || 5;
        const discoveryWindow = this.config.folder?.new_files_threshold_seconds || 3600;
        
        const minQueueMultiplier = 5;
        const discoveryWindowItems = Math.floor(discoveryWindow / autoAdvanceInterval);
        const maxHistory = Math.min(
          Math.max(
            queueSize * minQueueMultiplier,
            discoveryWindowItems,
            100
          ),
          5000
        );
        
        if (this.history.length > maxHistory) {
          this.history.shift();
        }
      }
      
      // Display the item
      this.currentMedia = item;
      
      // V5.7: Store in pending state - will apply when image/video loads (syncs all overlays)
      this._pendingMediaPath = item.media_content_id;
      this._pendingMetadata = item.metadata || null;
      
      // V5: Clear caches when media changes
      this._fullMetadata = null;
      this._folderDisplayCache = null;
      
      await this._resolveMediaUrl();
      this.requestUpdate();
      
      // V5: Setup auto-advance after successfully loading media
      this._setupAutoRefresh();

      // V5.6: Clear navigation flag after render cycle completes
      // Use setTimeout to ensure old video element is removed from DOM first
      setTimeout(() => {
        this._navigatingAway = false;
      }, 0);

      // NOTE: Do NOT restart timer here - let it expire naturally during slideshow
      // Timer only restarts on manual button clicks

      // Refresh metadata from media_index in background after navigation
      // Ensures overlay reflects latest EXIF/location/favorite flags
      this._refreshMetadata().catch(err => this._log('⚠️ Metadata refresh failed:', err));
    } catch (error) {
      console.error('[MediaCard] Error loading next media:', error);
    }
  }

  async _loadPrevious() {
    // V5.6: Set flag FIRST to ignore video pause events during navigation
    this._navigatingAway = true;

    // V5.5: Panel Navigation Override
    if (this._panelOpen && this._panelQueue.length > 0) {
      this._navigatingAway = false;
      return await this._loadPreviousPanel();
    }
    
    if (!this.provider) {
      this._log('_loadPrevious called but no provider');
      this._navigatingAway = false;
      return;
    }

    // V4: Handle auto_advance_mode when manually navigating
    this._handleAutoAdvanceModeOnNavigate();

    // V5.3: Navigation Queue Architecture
    if (this.navigationQueue.length === 0) {
      this._log('No items in navigation queue');
      return;
    }

    // Move backward in navigation queue
    this.navigationIndex--;
    
    // Wrap to last item if going before beginning
    if (this.navigationIndex < 0) {
      this._log('Wrapping to last item in navigation queue');
      this.navigationIndex = this.navigationQueue.length - 1;
    }
    
    // Get item at current navigation index
    const item = this.navigationQueue[this.navigationIndex];
    if (!item) {
      this._log('ERROR: No item at navigationIndex', this.navigationIndex);
      return;
    }
    
    this._log('Going back to navigation queue item:', item.title, 'at index', this.navigationIndex);
    
    // Display the item
    this.currentMedia = item;
    
    // V5.7: Store in pending state - will apply when image/video loads (syncs all overlays)
    this._pendingNavigationIndex = this.navigationIndex;
    this._pendingMediaPath = item.media_content_id;
    this._pendingMetadata = item.metadata || null;
    
    // V5: Clear cached full metadata when media changes
    this._fullMetadata = null;
    this._folderDisplayCache = null;
    
    await this._resolveMediaUrl();
    this.requestUpdate();
    
    // V5.6.4: Auto-refresh timer starts in _onMediaLoaded/_onVideoCanPlay
    // This prevents timer expiring before media has loaded (especially on slow connections)
    // Timer will be set up when image loads or video is ready to play

    // V5.6: Clear navigation flag after render cycle completes
    setTimeout(() => {
      this._navigatingAway = false;
    }, 0);

    // NOTE: Do NOT restart timer here - let it expire naturally during slideshow
    // Timer only restarts on manual button clicks
  }

  // V4: Handle auto_advance_mode behavior when user manually navigates
  _handleAutoAdvanceModeOnNavigate() {
    const mode = this.config.auto_advance_mode || 'reset';
    
    switch (mode) {
      case 'pause':
        // Pause auto-refresh by clearing the interval
        if (this._refreshInterval) {
          clearInterval(this._refreshInterval);
          this._refreshInterval = null;
          // Mark that we paused due to navigation (for potential resume)
          this._pausedForNavigation = true;
        }
        break;
        
      case 'continue':
        // Do nothing - let auto-refresh continue normally
        this._log('🔄 Continuing auto-refresh during manual navigation (interval', this._refreshInterval, 'remains active)');
        break;
        
      case 'reset':
        // Reset the auto-refresh timer
        this._lastRefreshTime = Date.now();
        // Restart the timer (this will clear old interval and create new one)
        this._setupAutoRefresh();
        break;
    }
  }

  // V5.5: Panel Navigation Methods
  async _loadNextPanel() {
    if (this._panelQueueIndex < this._panelQueue.length - 1) {
      this._panelQueueIndex++;
      await this._loadPanelItem(this._panelQueueIndex);
    } else {
      // Wrap to beginning
      this._panelQueueIndex = 0;
      await this._loadPanelItem(this._panelQueueIndex);
    }
  }

  async _loadPreviousPanel() {
    if (this._panelQueueIndex > 0) {
      this._panelQueueIndex--;
      await this._loadPanelItem(this._panelQueueIndex);
    } else {
      // Wrap to end
      this._panelQueueIndex = this._panelQueue.length - 1;
      await this._loadPanelItem(this._panelQueueIndex);
    }
  }

  async _loadPanelItem(index) {
    // V5.6: Set flag to ignore video pause events during thumbnail click
    this._navigatingAway = true;
    
    const item = this._panelQueue[index];
    if (!item) {
      console.error('[MediaCard] No item at panel index:', index);
      this._navigatingAway = false;
      return;
    }
    
    console.log(`📱 Loading panel item ${index + 1}/${this._panelQueue.length}:`, item.filename || item.path);
    
    // Update panel index
    this._panelQueueIndex = index;
    
    // Build metadata object from panel item
    const metadata = {
      filename: item.filename,
      date_taken: item.date_taken,
      is_favorited: item.is_favorited,
      latitude: item.latitude,
      longitude: item.longitude,
      // Include any other metadata from the item
      ...item
    };
    
    // Update current media - THIS IS CRITICAL for main image display
    const mediaUri = item.media_source_uri || item.path;
    this.currentMedia = {
      media_content_id: mediaUri,
      media_content_type: item.filename?.toLowerCase().endsWith('.mp4') ? 'video' : 'image',
      metadata: metadata
    };
    
    // V5.7: Store in pending state - will apply when image/video loads
    this._pendingMediaPath = mediaUri;
    this._pendingMetadata = metadata;
    
    // Update deprecated state for compatibility
    if (this._panelMode === 'burst') {
      this._burstCurrentIndex = index;
    }
    
    // Clear cached metadata to force refresh
    this._fullMetadata = null;
    this._folderDisplayCache = null;
    
    // Update display
    await this._resolveMediaUrl();
    this.requestUpdate();
    
    // Clear navigation flag after display updates
    this._navigatingAway = false;
  }

  async _jumpToQueuePosition(queueIndex) {
    // V5.6: Set flag to ignore video pause events during thumbnail click
    this._navigatingAway = true;
    
    if (!this.navigationQueue || queueIndex < 0 || queueIndex >= this.navigationQueue.length) {
      console.error('[MediaCard] Invalid queue position:', queueIndex);
      this._navigatingAway = false;
      return;
    }

    console.log(`🎯 Jumping to queue position ${queueIndex + 1}/${this.navigationQueue.length}`);

    // Clear manual page flag - user is now navigating to items, allow auto-adjustment
    this._manualPageChange = false;
    this._manualPageRenderCount = 0;

    // Load the item from the queue
    const item = this.navigationQueue[queueIndex];
    this.currentMedia = item;
    
    // V5.7: Store in pending state - will apply when image/video loads  
    this._pendingNavigationIndex = queueIndex;
    this._pendingMediaPath = item.media_content_id;
    this._pendingMetadata = item.metadata || null;

    // Clear cached metadata
    this._fullMetadata = null;
    this._folderDisplayCache = null;

    // Resolve and display media
    await this._resolveMediaUrl();
    this.requestUpdate();
    
    // Clear navigation flag after display updates
    this._navigatingAway = false;
    
    // V5: Setup auto-advance after jumping to position
    this._setupAutoRefresh();
  }

  /**
   * Insert panel items into navigation queue at current position and start playing
   */
  async _playPanelItems() {
    if (!this._panelQueue || this._panelQueue.length === 0) {
      console.warn('No panel items to play');
      return;
    }

    console.warn(`🎬 Inserting ${this._panelQueue.length} items into navigation queue at position ${this.navigationIndex + 1}`);

    // Get panel items (may randomize if checkbox is enabled)
    let panelItems = [...this._panelQueue]; // Copy array
    
    // V5.6.0: Randomize if checkbox is enabled
    if (this._playRandomized) {
      console.warn('🎲 Randomizing panel items for playback');
      // Fisher-Yates shuffle
      for (let i = panelItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [panelItems[i], panelItems[j]] = [panelItems[j], panelItems[i]];
      }
    }

    // Convert panel items to navigation queue format
    const queueItems = panelItems.map(item => ({
      media_content_id: item.media_source_uri || item.media_content_id || `media-source://media_source${item.path}`,
      media_content_type: item.file_type === 'video' ? 'video' : 'image',
      title: item.filename || item.path.split('/').pop(),
      metadata: {
        filename: item.filename,
        path: item.path,
        date_taken: item.date_taken,
        created_time: item.created_time,
        is_favorited: item.is_favorited,
        rating: item.rating,
        folder: item.folder
      },
      // Keep original item data
      ...item
    }));

    // Remove duplicates from queue first (items that exist elsewhere in the queue)
    const itemUris = new Set(queueItems.map(item => item.media_content_id));
    let removedCount = 0;
    let adjustedIndex = this.navigationIndex;
    
    for (let i = this.navigationQueue.length - 1; i >= 0; i--) {
      const queueItem = this.navigationQueue[i];
      const queueItemUri = queueItem.media_content_id || queueItem.media_source_uri;
      
      if (itemUris.has(queueItemUri)) {
        this.navigationQueue.splice(i, 1);
        removedCount++;
        
        // Adjust current index if we removed items before it
        if (i < this.navigationIndex) {
          adjustedIndex--;
        }
      }
    }

    console.warn(`🗑️ Removed ${removedCount} duplicate items from queue`);

    // Update navigation index after removals
    this.navigationIndex = adjustedIndex;

    // Insert items into navigation queue after current position
    const insertPosition = this.navigationIndex + 1;
    this.navigationQueue.splice(insertPosition, 0, ...queueItems);

    console.warn(`✅ Inserted ${queueItems.length} items at position ${insertPosition}, queue now has ${this.navigationQueue.length} items`);

    // Close panel WITHOUT restoring queue (we want to keep our insertions)
    this._panelOpen = false;
    this._panelMode = null;
    this._panelQueue = [];
    this._panelQueueIndex = 0;
    this._panelPageStartIndex = null;
    this._burstMode = false; // Clear deprecated flag
    
    // V5.6.0: Resume playback if paused
    if (this._isPaused) {
      console.warn('▶️ Resuming playback to play panel items');
      this._isPaused = false;
    }
    
    this.requestUpdate();
    
    // Jump to first inserted item
    await this._jumpToQueuePosition(insertPosition);
  }

  // V5: Setup auto-advance timer (copied from V4 lines 1611-1680)
  _setupAutoRefresh() {
    // Clear any existing interval/timeout FIRST to prevent multiple timers
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
      this._timerStoppedForVideo = false; // Reset flag when manually stopping timer
    }
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      this._refreshTimeout = null;
    }

    // Don't set up auto-refresh if paused
    if (this._isPaused) {
      this._log('🔄 Auto-refresh setup skipped - currently paused');
      return;
    }
    
    if (this._backgroundPaused) {
      this._log('🔄 Auto-refresh setup skipped - background paused (not visible)');
      return;
    }

    // V5: Get refresh/advance seconds based on mode
    // Single media: use auto_refresh_seconds
    // Folder/slideshow: prefer auto_advance_seconds, fallback to auto_refresh_seconds
    let refreshSeconds = 0;
    let isRefreshMode = false; // True if reloading current, false if advancing
    
    if (this.provider instanceof SingleMediaProvider) {
      refreshSeconds = this.config?.auto_refresh_seconds || 0;
      isRefreshMode = true; // Single media always reloads current
    } else {
      // In folder mode: auto_advance takes priority
      // Support legacy field names: auto_advance_interval, auto_advance_duration
      const autoAdvance = this.config?.auto_advance_seconds || 
                         this.config?.auto_advance_interval || 
                         this.config?.auto_advance_duration || 0;
      const autoRefresh = this.config?.auto_refresh_seconds || 0;
      
      if (autoAdvance > 0) {
        refreshSeconds = autoAdvance;
        isRefreshMode = false; // Advance to next
      } else if (autoRefresh > 0) {
        refreshSeconds = autoRefresh;
        isRefreshMode = true; // Reload current
      }
    }
    
    if (refreshSeconds && refreshSeconds > 0 && this.hass) {
      const modeLabel = isRefreshMode ? 'auto-refresh (reload current)' : 'auto-advance (next media)';
      const intervalMs = refreshSeconds * 1000;
      
      // Check if resuming from pause with remaining time
      const remainingMs = this._pausedRemainingMs || intervalMs;
      if (this._pausedRemainingMs) {
        this._pausedRemainingMs = null; // Clear saved time
      }
      
      // Track when timer started for pause calculation
      this._timerStartTime = Date.now();
      this._timerIntervalMs = intervalMs;
      
      // Define the timer callback
      const timerCallback = async () => {
        // Track when timer fires and reset start time
        this._lastRefreshCheckTime = Date.now();
        this._timerStartTime = Date.now(); // Reset for next interval
        
        // If in error state, clear it and attempt reload
        if (this._errorState) {
          this._log('🔄 Error state detected - clearing and attempting reload');
          this._errorState = null;
          this._retryAttempts.clear();
          if (this.currentMedia) {
            await this._resolveMediaUrl();
            this.requestUpdate();
          } else if (this.provider) {
            // Try to get next media if no current media
            try {
              await this._loadNext();
            } catch (err) {
              this._log('❌ Failed to load next after error:', err);
            }
          }
          return;
        }
        
        // Check pause states before advancing
        if (!this._isPaused && !this._backgroundPaused) {
          // Reset pause log flag (timer is active again)
          this._pauseLogShown = false;
          
          // Check for new files FIRST (before video completion check)
          // This allows queue refresh to interrupt video playback in manual mode at position 1
          let queueWasRefreshed = false;
          if (this.provider && this.provider.constructor.name !== 'SingleMediaProvider') {
            queueWasRefreshed = await this._checkForNewFiles();
          }
          
          // If queue was refreshed, skip the rest of the timer logic
          if (queueWasRefreshed) {
            return;
          }
          
          // V4 CODE REUSE: Check if we should wait for video to complete
          // Based on V4 lines 3259-3302
          // V5.6: Don't stop timer if video_loop is enabled - let timer interrupt the loop
          if (await this._shouldWaitForVideoCompletion() && !this.config.video_loop) {
            // Stop the timer to prevent unnecessary database queries while video plays
            if (!this._timerStoppedForVideo) {
              clearInterval(this._refreshInterval);
              this._refreshInterval = null;
              this._timerStoppedForVideo = true;
            }
            return;
          }
          
          if (isRefreshMode) {
            // Reload current media (for single_media or folder with auto_refresh only)
            if (this.currentMedia) {
              await this._resolveMediaUrl();
              this.requestUpdate();
              // Refresh metadata from media_index in background to keep overlay up-to-date
              this._refreshMetadata().catch(err => this._log('⚠️ Metadata refresh failed:', err));
            }
          } else {
            // Advance to next media (folder mode with auto_advance)
            this._loadNext();
          }
        } else {
          // Silently skip when paused
          this._pauseLogShown = true;
        }
      };
      
      // If resuming with remaining time, use setTimeout first, then setInterval
      if (remainingMs < intervalMs) {
        this._log(`⏱️ Using timeout for remaining ${Math.round(remainingMs / 1000)}s, then switching to interval`);
        this._refreshTimeout = setTimeout(() => {
          timerCallback();
          // After first fire, switch to regular interval
          this._refreshInterval = setInterval(timerCallback, intervalMs);
          this._log('✅ Switched to regular interval after resume, ID:', this._refreshInterval);
        }, remainingMs);
        this._log('✅ Resume timeout started with ID:', this._refreshTimeout);
      } else {
        // Normal startup - use setInterval from the beginning
        this._refreshInterval = setInterval(timerCallback, intervalMs);
      }
    }
  }

  // Check for new files in folder mode and refresh queue if needed
  // Returns true if queue was refreshed, false otherwise
  async _checkForNewFiles() {
    // Only for sequential mode providers
    const isSeq = this._isSequentialMode();
    if (!isSeq) {
      return false;
    }
    
    // Skip rescan on first timer tick (card just loaded)
    if (!this._firstScanComplete) {
      this._firstScanComplete = true;
      return false;
    }
    
    // Respect navigation grace period (avoid interrupting active navigation)
    const timeSinceLastNav = Date.now() - (this._lastNavigationTime || 0);
    if (timeSinceLastNav < 5000) {
      return false;
    }
    
    // Check if we're at position 1 (index 0) before rescan
    const wasAtPositionOne = this.navigationIndex === 0;
    
    if (!wasAtPositionOne) {
      return false;
    }
    
    try {
      // Trigger full rescan to detect new files
      if (!this.provider || typeof this.provider.rescanForNewFiles !== 'function') {
        return false;
      }
      
      const scanResult = await this.provider.rescanForNewFiles();
      
      // If the first item in queue changed, refresh display
      if (scanResult.queueChanged) {
        this._log(`🆕 New files detected - refreshing display`);
        await this._refreshQueue();
        return true; // Queue was refreshed
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error checking for new files:', error);
    }
    
    return false; // Queue was not refreshed
  }
  
  // Check if provider is in sequential mode
  _isSequentialMode() {
    // SequentialMediaIndexProvider is always sequential
    if (this.provider && this.provider.constructor.name === 'SequentialMediaIndexProvider') {
      return true;
    }
    
    // FolderProvider with sequential mode
    if (this.provider && this.provider.constructor.name === 'FolderProvider') {
      const folderMode = this.config?.folder?.mode;
      return folderMode === 'sequential';
    }
    
    return false;
  }
  
  // Get time until next auto-refresh timer check (for logging)
  _getTimeUntilNextRefresh() {
    if (!this._lastRefreshCheckTime || !this.config?.auto_refresh_seconds) {
      return 'unknown';
    }
    const elapsed = (Date.now() - this._lastRefreshCheckTime) / 1000;
    const remaining = Math.max(0, this.config.auto_refresh_seconds - elapsed);
    return Math.round(remaining);
  }
  
  // Check if at end of navigation queue
  _isAtEndOfQueue() {
    if (!this.navigationQueue || this.navigationQueue.length === 0) {
      return false;
    }
    
    const currentIndex = this.navigationQueue.indexOf(this.currentMedia);
    return currentIndex === this.navigationQueue.length - 1;
  }
  
  // Full queue refresh - clear navigation state and reinitialize provider
  async _refreshQueue() {
    this._log('🔄 Starting full queue refresh...');
    
    try {
      // Save current media to compare after refresh
      const currentMediaId = this.currentMedia?.media_content_id;
      const currentDateTaken = this.currentMedia?.metadata?.date_taken;
      this._log('🔄 Current media before refresh:', currentMediaId, 'date_taken:', currentDateTaken);
      
      // Save queue size before refresh (for position indicator)
      const previousQueueSize = this.navigationQueue.length;
      this._log('🔄 Previous navigation queue size:', previousQueueSize);
      
      // CRITICAL: Clear and rebuild entire navigation queue
      // Just updating position 0 leaves stale items at positions 1-19
      this.navigationQueue = [];
      this.navigationHistory = [];
      this.navigationIndex = 0; // Will be at first position after loading
      
      // Reset provider cursor to beginning (critical for sequential mode)
      // Check if provider has reset() method (SequentialMediaIndexProvider)
      let providerToReset = this.provider;
      
      // Unwrap FolderProvider to get actual provider
      if (this.provider?.sequentialProvider) {
        providerToReset = this.provider.sequentialProvider;
      } else if (this.provider?.mediaIndexProvider) {
        providerToReset = this.provider.mediaIndexProvider;
      }
      
      if (providerToReset && typeof providerToReset.reset === 'function') {
        this._log('🔄 Calling provider.reset() to clear cursor');
        await providerToReset.reset();
      } else if (this.provider && typeof this.provider.initialize === 'function') {
        this._log('🔄 Provider has no reset(), calling initialize()');
        await this.provider.initialize();
      }
      
      // Get access to the underlying provider's queue
      let providerQueue = null;
      if (this.provider?.subfolderQueue?.queue) {
        providerQueue = this.provider.subfolderQueue.queue;
        this._log('🔍 Found SubfolderQueue with', providerQueue.length, 'items');
      } else if (this.provider?.sequentialProvider?.queue) {
        providerQueue = this.provider.sequentialProvider.queue;
        this._log('🔍 Found SequentialProvider with', providerQueue.length, 'items');
      } else if (this.provider?.mediaIndexProvider?.queue) {
        providerQueue = this.provider.mediaIndexProvider.queue;
        this._log('🔍 Found MediaIndexProvider with', providerQueue.length, 'items');
      } else if (this.provider?.queue) {
        providerQueue = this.provider.queue;
        this._log('🔍 Found direct provider queue with', providerQueue.length, 'items');
      }
      
      // DEBUG: Log provider structure to understand the data
      this._log('🔍 Provider structure:', {
        hasSubfolderQueue: !!this.provider?.subfolderQueue,
        hasSequentialProvider: !!this.provider?.sequentialProvider,
        hasMediaIndexProvider: !!this.provider?.mediaIndexProvider,
        hasDirectQueue: !!this.provider?.queue,
        providerType: this.provider?.constructor?.name
      });
      
      if (providerQueue && providerQueue.length > 0) {
        // DEBUG: Log first item structure to understand the format
        this._log('🔍 First item in provider queue:', providerQueue[0]);
        this._log('🔍 First item keys:', Object.keys(providerQueue[0] || {}));
      }
      
      // Reload navigation queue by copying from provider's queue (don't call getNext!)
      // Calling getNext() repeatedly advances the provider's cursor incorrectly
      if (providerQueue && providerQueue.length > 0) {
        // Copy all items from provider queue to navigation queue
        // Don't limit to 20 - we need the full queue for proper navigation
        const itemsToCopy = providerQueue.length;
        this._log('🔄 Copying', itemsToCopy, 'items from provider queue (size:', providerQueue.length, ')');
        
        for (let i = 0; i < itemsToCopy; i++) {
          const item = providerQueue[i];
          
          // DEBUG: Log each item being copied
          if (i < 3) { // Only log first 3 to avoid spam
            this._log('🔍 Copying item', i, ':', {
              type: typeof item,
              hasMediaContentId: !!item?.media_content_id,
              keys: Object.keys(item || {}),
              item: item
            });
          }
          
          // Validate item has required properties
          if (item && item.media_content_id) {
            // V5: Only refresh metadata if missing or if this is position 1 and it's a NEW file
            const needsMetadata = !item.metadata || 
                                  (i === 0 && item.media_content_id !== currentMediaId);
            
            if (needsMetadata) {
              this._log(`🔄 Extracting metadata for item ${i} (position ${i + 1})`);
              item.metadata = await this._extractMetadataFromItem(item);
            } else if (i === 0) {
              this._log(`✅ Position 1 already has metadata (same file as before, no re-extraction needed)`);
            }
            this.navigationQueue.push(item);
          } else {
            this._log('⚠️ Skipping invalid item at index', i, '- missing media_content_id:', item);
          }
        }
        
        this._log('🔄 Navigation queue after copy:', this.navigationQueue.length, 'items');
        if (this.navigationQueue.length > 0) {
          this._log('🔍 First item in navigation queue:', this.navigationQueue[0]);
        }
      } else {
        // Fallback: if we can't access the queue directly, use getNext() method
        this._log('🔄 No direct queue access, using getNext() method');
        const itemsToLoad = Math.min(previousQueueSize || 20, 20);
        
        for (let i = 0; i < itemsToLoad; i++) {
          if (this.provider && typeof this.provider.getNext === 'function') {
            const item = await this.provider.getNext();
            if (!item) {
              this._log('🔄 Provider exhausted after', i, 'items');
              break;
            }
            
            // V5: Extract metadata if not provided
            if (!item.metadata) {
              item.metadata = await this._extractMetadataFromItem(item);
            }
            
            this.navigationQueue.push(item);
          }
        }
      }
      
      this._log('🔄 Reloaded navigation queue with', this.navigationQueue.length, 'items');
      
      // Set current media to first item in refreshed queue
      if (this.navigationQueue.length > 0) {
        const firstItem = this.navigationQueue[0];
        
        // Check if we should display this new first item
        const shouldUpdate = !currentMediaId || firstItem.media_content_id !== currentMediaId;
        
        this.currentMedia = firstItem;
        
        // CRITICAL: Update _currentMetadata and _currentMediaPath for overlay display
        this._currentMediaPath = firstItem.media_content_id;
        this._currentMetadata = firstItem.metadata || null;
        this._pendingMetadata = firstItem.metadata || null;
        this._log('🔄 Updated _currentMetadata with fresh metadata:', !!this._currentMetadata);
        
        if (shouldUpdate) {
          this._log('🆕 New file detected - updating display to:', firstItem.media_content_id);
          await this._resolveMediaUrl();
          this.requestUpdate();
          
          // Force media element to reload immediately (don't wait for Lit render cycle)
          await this.updateComplete; // Wait for Lit to finish rendering
          
          // Check if it's a video or image and reload appropriately
          const videoElement = this.shadowRoot?.querySelector('video');
          const imgElement = this.shadowRoot?.querySelector('.media-container > img');
          
          if (videoElement) {
            this._log('🎬 Forcing video reload after queue refresh');
            videoElement.load();
            if (this.config.video_autoplay !== false) {
              videoElement.play().catch(err => {
                if (err.name !== 'AbortError') {
                  console.warn('Video autoplay failed after refresh:', err);
                }
              });
            }
          } else if (imgElement) {
            this._log('🖼️ Forcing image reload after queue refresh');
            // For images, just updating src via Lit is enough, but we can force it
            const currentSrc = imgElement.src;
            imgElement.src = this.mediaUrl;
            // If src didn't change (unlikely but possible), force reload
            if (currentSrc === this.mediaUrl) {
              imgElement.src = '';
              imgElement.src = this.mediaUrl;
            }
          }
        } else {
          this._log('✅ Queue refreshed - current file is still newest, no display update needed');
        }
        
        this._log('✅ Queue refreshed with', this.navigationQueue.length, 'items (index 0, metadata:', !!firstItem.metadata, ')');
      } else {
        this._log('⚠️ No items returned after queue refresh');
      }
    } catch (error) {
      this._log('⚠️ Error during queue refresh:', error);
    }
  }

  // V5: Extract metadata from browse_media item (uses shared helper with media_index support)
  async _extractMetadataFromItem(item) {
    if (!item) return {};
    
    const mediaPath = item.media_content_id || item.title;
    
    // Use shared MediaProvider helper for consistent extraction across providers and card
    return await MediaProvider.extractMetadataWithExif(mediaPath, this.config, this.hass);
  }
  
  // Add cache-busting timestamp to URL (forces browser to bypass cache)
  _addCacheBustingTimestamp(url, forceAdd = false) {
    if (!url) return url;
    
    // CRITICAL: Never add timestamp to signed URLs (breaks signature validation)
    if (url.includes('authSig=')) {
      return url;
    }
    
    // For auto-refresh: only add if refresh configured
    // For manual refresh: always add (forceAdd = true)
    const refreshSeconds = this.config.auto_refresh_seconds || 0;
    const shouldAdd = forceAdd || (refreshSeconds > 0);
    
    if (!shouldAdd) return url;
    
    const timestamp = Date.now();
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${timestamp}`;
  }
  
  // V5: Refresh metadata from media_index (for action button updates)
  async _refreshMetadata() {
    if (!MediaProvider.isMediaIndexActive(this.config) || !this._currentMediaPath || !this.hass) {
      return;
    }
    
    try {
      // Use shared helper to fetch metadata
      const freshMetadata = await MediaIndexHelper.fetchFileMetadata(
        this.hass,
        this.config,
        this._currentMediaPath
      );
      
      if (freshMetadata) {
        // Merge updated metadata with existing path-based metadata
        this._currentMetadata = {
          ...this._currentMetadata,
          ...freshMetadata
        };
        
        // Update currentMedia.metadata as well
        if (this.currentMedia) {
          this.currentMedia.metadata = this._currentMetadata;
        }
        
        this.requestUpdate();
        this._log('📊 Refreshed metadata from media_index');
      }
    } catch (error) {
      this._log('⚠️ Failed to refresh metadata:', error);
    }
  }

  // V5.6: Helper to set mediaUrl with crossfade transition
  _setMediaUrl(url) {
    this.mediaUrl = url;
    
    // Only use crossfade for images, not videos
    const isVideo = this._isVideoFile(url);
    
    if (!isVideo) {
      const duration = this.config?.transition?.duration ?? 300;
      
      // For instant transitions (0ms), bypass double-buffering entirely
      if (duration === 0) {
        // Just update - render will show single image directly
        this.requestUpdate();
      } else {
        // Crossfade: set new image on hidden layer, then swap after it loads
        // Special case: If both layers are empty (first load or after video), show immediately without crossfade
        if (!this._frontLayerUrl && !this._backLayerUrl) {
          this._frontLayerUrl = url;
          this._frontLayerActive = true;
          this._pendingLayerSwap = false;
          this.requestUpdate();
        } else {
          // Normal crossfade: load on hidden layer then swap
          if (this._frontLayerActive) {
            this._backLayerUrl = url;
          } else {
            this._frontLayerUrl = url;
          }
          
          // Set flag to trigger swap when the new image loads
          this._pendingLayerSwap = true;
          this._transitionDuration = duration;
          this.requestUpdate();
        }
      }
    } else {
      // For videos, just clear the image layers immediately
      this._frontLayerUrl = '';
      this._backLayerUrl = '';
      this.requestUpdate();
    }
  }

  async _resolveMediaUrl() {
    if (!this.currentMedia || !this.hass) {
      this._log('Cannot resolve URL - missing currentMedia or hass');
      return;
    }

    const mediaId = this.currentMedia.media_content_id;
    
    // Validate mediaId exists
    if (!mediaId) {
      this._log('ERROR: currentMedia has no media_content_id:', this.currentMedia);
      this._errorState = 'Invalid media item (no media_content_id)';
      return;
    }
    
    // If already a full URL, use it
    if (mediaId.startsWith('http')) {
      this._setMediaUrl(mediaId);
      this.requestUpdate();
      return;
    }

    // If media-source:// format, resolve through HA API
    if (mediaId.startsWith('media-source://')) {
      try {
        // V5: Copy V4's approach - just pass through to HA without modification
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaId,
          expires: (60 * 60 * 3) // 3 hours
        });
        
        // Add timestamp for auto-refresh (camera snapshots, etc.)
        const finalUrl = this._addCacheBustingTimestamp(resolved.url);
        
        this._setMediaUrl(finalUrl);
        this.requestUpdate();
      } catch (error) {
        console.error('[MediaCard] Failed to resolve media URL:', error);
        this._setMediaUrl('');
        this._nextMediaUrl = '';
        this.requestUpdate();
      }
      return;
    }

    // Track recursion depth to prevent infinite loops
    if (!this._validationDepth) this._validationDepth = 0;
    const MAX_VALIDATION_ATTEMPTS = 10;
    
    // If /media/ path, convert to media-source:// and validate existence
    if (mediaId.startsWith('/media/')) {
      const mediaSourceId = 'media-source://media_source' + mediaId;
      this._log('Converting /media/ to media-source://', mediaSourceId);
      
      try {
        // Validate file exists by attempting to resolve it
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaSourceId,
          expires: (60 * 60 * 3)
        });
        this._log('✅ File exists and resolved to:', resolved.url);
        this._validationDepth = 0; // Reset on success
        this._setMediaUrl(resolved.url);
        this.requestUpdate();
        return; // Success - don't fall through to fallback
      } catch (error) {
        // File doesn't exist or can't be accessed - skip to next
        console.warn('[MediaCard] File not found or inaccessible, skipping to next:', mediaId, error.message);
        
        // Track file as missing to avoid re-querying from media_index
        if (this.provider?.mediaIndexProvider) {
          this.provider.mediaIndexProvider.excludedFiles.add(mediaId);
          this._log('Added to excluded files set:', mediaId);
        }
        
        // Remove the bad item from history at the current position
        if (this.history.length > 0) {
          const idx = this.historyIndex === -1 ? this.history.length - 1 : this.historyIndex;
          if (this.history[idx]?.media_content_id === mediaId) {
            this._log('Removing invalid item from history at index', idx);
            this.history.splice(idx, 1);
            // Adjust historyIndex if needed
            if (this.historyIndex > idx || this.historyIndex === this.history.length) {
              this.historyIndex = this.history.length - 1;
            }
          }
        }
        
        // Clear the current media to avoid showing broken state
        this._setMediaUrl('');
        
        // Check recursion depth before recursive call
        this._validationDepth = (this._validationDepth || 0) + 1;
        if (this._validationDepth >= MAX_VALIDATION_ATTEMPTS) {
          console.error('[MediaCard] Too many consecutive missing files, stopping validation');
          this._validationDepth = 0;
          return;
        }
        
        // Recursively skip to next item without adding to history
        this._log('⏭️ Skipping to next item due to missing file (depth:', this._validationDepth, ')');
        await this.next(); // Get next item (will validate recursively)
        return;
      }
    }

    // Fallback: use as-is
    this._log('Using media ID as-is (fallback)');
    this._setMediaUrl(mediaId);
    this.requestUpdate();
  }

  // V4 CODE REUSE: Helper to resolve a media path parameter (for dialogs, etc)
  // Copied from ha-media-card.js _resolveMediaPath (lines 3489-3515)
  async _resolveMediaPathParam(mediaPath) {
    if (!mediaPath || !this.hass) return '';
    
    // If it's already a fully resolved authenticated URL, return as-is
    if (mediaPath.startsWith('http')) {
      return mediaPath;
    }
    
    // Convert local media paths to media-source format
    if (mediaPath.startsWith('/media/')) {
      mediaPath = 'media-source://media_source' + mediaPath;
    }
    
    // Use Home Assistant's media source resolution for media-source URLs
    if (mediaPath.startsWith('media-source://')) {
      try {
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaPath,
          expires: (60 * 60 * 3) // 3 hours
        });
        return resolved.url;
      } catch (error) {
        console.error('[MediaCard] Failed to resolve media path:', mediaPath, error);
        return '';
      }
    }
    
    // Return as-is for other formats
    return mediaPath;
  }
  
  _onMediaError(e) {
    // V4 comprehensive error handling
    const target = e.target;
    const error = target?.error;
    
    let errorMessage = 'Media file not found';
    let is404 = false;
    
    // Handle case where target is null (element destroyed/replaced)
    if (!target) {
      errorMessage = 'Media element unavailable';
      console.warn('[MediaCard] Media error event has null target - element may have been destroyed');
    } else if (error) {
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          errorMessage = 'Media loading was aborted';
          break;
        case error.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error loading media';
          break;
        case error.MEDIA_ERR_DECODE:
          errorMessage = 'Media format not supported';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          // This is typically a 404 (file not found)
          errorMessage = 'Media file not found';
          is404 = true;
          break;
      }
    }
    
    // Only log errors that aren't 404s - 404s are expected when database is out of sync
    if (!is404 && this._debugMode) {
      console.error('[MediaCard] Media failed to load:', this.mediaUrl, e);
    } else {
      this._log('📭 Media file not found (404) - likely deleted/moved:', this.mediaUrl);
    }
    
    // Add specific handling for Synology DSM authentication errors
    const isSynologyUrl = this.mediaUrl && this.mediaUrl.includes('/synology_dsm/') && this.mediaUrl.includes('authSig=');
    if (isSynologyUrl) {
      errorMessage = 'Synology DSM authentication expired - try refreshing';
      console.warn('[MediaCard] Synology DSM URL authentication may have expired:', this.mediaUrl);
    }
    
    // Apply pending metadata even on error to avoid stale metadata from previous media
    if (this._pendingMetadata !== null) {
      this._currentMetadata = this._pendingMetadata;
      this._pendingMetadata = null;
      this._log('Applied pending metadata on error to clear stale data');
    }
    if (this._pendingMediaPath !== null) {
      this._currentMediaPath = this._pendingMediaPath;
      this._pendingMediaPath = null;
    }
    
    // Check if we've already tried to retry this URL
    const currentUrl = this.mediaUrl || 'unknown';
    const retryCount = this._retryAttempts.get(currentUrl) || 0;
    const maxAutoRetries = 1; // Only auto-retry once per URL
    
    if (retryCount < maxAutoRetries) {
      // Clean up old retry attempts to prevent memory leaks (keep last 50)
      if (this._retryAttempts.size > 50) {
        const oldestKey = this._retryAttempts.keys().next().value;
        this._retryAttempts.delete(oldestKey);
      }
      
      // Mark this URL as attempted
      this._retryAttempts.set(currentUrl, retryCount + 1);
      
      this._log(`Auto-retrying failed URL (attempt ${retryCount + 1}/${maxAutoRetries}):`, currentUrl.substring(0, 50) + '...');
      
      // For single media mode, attempt URL refresh
      if (this.config.media_source_type === 'single_media') {
        this._attemptUrlRefresh(isSynologyUrl)
          .then(refreshed => {
            if (!refreshed) {
              // If refresh failed, show error state
              this._showMediaError(errorMessage, isSynologyUrl);
            }
          })
          .catch(err => {
            console.error('[MediaCard] URL refresh attempt failed:', err);
            this._showMediaError(errorMessage, isSynologyUrl);
          });
      } else {
        // For folder/queue modes, will implement later
        this._showMediaError(errorMessage, isSynologyUrl);
      }
    } else {
      // Already tried to retry this URL, show error immediately
      this._log(`Max auto-retries reached for URL:`, currentUrl.substring(0, 50) + '...');
      this._showMediaError(errorMessage, isSynologyUrl);
    }
  }
  
  async _attemptUrlRefresh(forceRefresh = false) {
    this._log('🔄 Attempting URL refresh due to media load failure');
    
    // V4: Log additional context for Synology DSM URLs
    if (this.mediaUrl && this.mediaUrl.includes('/synology_dsm/')) {
      this._log('🔄 Synology DSM URL detected - checking authentication signature');
      console.warn('[MediaCard] Synology DSM URL refresh needed:', this.mediaUrl.substring(0, 100) + '...');
    }
    
    try {
      let refreshedUrl = null;
      
      // V4: Add retry logic with exponential backoff for Synology DSM URLs
      const isSynologyUrl = this.mediaUrl && this.mediaUrl.includes('/synology_dsm/');
      const maxRetries = isSynologyUrl ? 3 : 1;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // For single media mode, re-resolve the media URL
          if (this.config.media_source_type === 'single_media' && this.currentMedia) {
            this._log(`🔄 Refreshing single media (attempt ${attempt}/${maxRetries}):`, this.currentMedia.media_content_id);
            await this._resolveMediaUrl(this.currentMedia.media_content_id);
            refreshedUrl = this.mediaUrl;
          }
          
          // If we got a different URL or this is a forced refresh, consider it successful
          if (refreshedUrl && (refreshedUrl !== this.mediaUrl || forceRefresh)) {
            this._log('✅ URL refresh successful, updating media');
            // Clear retry attempts for the new URL
            if (this._retryAttempts.has(refreshedUrl)) {
              this._retryAttempts.delete(refreshedUrl);
            }
            this._errorState = null; // Clear error state
            this.requestUpdate();
            return true;
          } else if (refreshedUrl === this.mediaUrl && !forceRefresh) {
            this._log(`⚠️ URL refresh returned same URL (attempt ${attempt}/${maxRetries})`);
            if (attempt < maxRetries) {
              // Wait before retrying (exponential backoff)
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              this._log(`⏱️ Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          } else {
            this._log(`❌ No URL returned (attempt ${attempt}/${maxRetries})`);
            if (attempt < maxRetries) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
        } catch (attemptError) {
          this._log(`❌ Attempt ${attempt}/${maxRetries} failed:`, attemptError.message);
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw attemptError;
        }
      }
      
      console.warn('[MediaCard] ⚠️ All URL refresh attempts failed or returned same URL');
      return false;
      
    } catch (error) {
      console.error('[MediaCard] ❌ URL refresh failed:', error);
      return false;
    }
  }
  
  _showMediaError(errorMessage, is404 = false) {
    // V4: If not explicitly provided, check if this is a 404 error (file not found - likely deleted/moved)
    if (!is404) {
      is404 = this.mediaUrl && errorMessage.includes('not found');
    }
    const currentPath = this.currentMedia?.media_content_id;
    const now = Date.now();
    
    // V4: 🚨 CIRCUIT BREAKER: Detect if we're stuck in 404 loop with deleted files
    if (is404 || errorMessage.includes('Media file not found')) {
      // Check if this is a rapid succession 404 (within 10 seconds of last)
      if (now - this._last404Time < 10000) {
        this._consecutive404Count++;
        this._log(`⚠️ Consecutive 404 error #${this._consecutive404Count} for: ${currentPath}`);
      } else {
        // Reset counter if it's been more than 10 seconds
        this._consecutive404Count = 1;
        this._log(`⚠️ First 404 in new time window for: ${currentPath}`);
      }
      this._last404Time = now;
      
      // V4: CIRCUIT BREAKER TRIGGERED - For folder mode, remove from queue
      if (this._consecutive404Count >= 3) {
        this._log(`🚨 CIRCUIT BREAKER TRIGGERED: ${this._consecutive404Count} consecutive 404s`);
        this._consecutive404Count = 0; // Reset
        
        // V5: For folder mode, trigger provider refresh
        if (this.config.media_source_type === 'folder' && this.provider) {
          this._log('🔄 Circuit breaker: Requesting provider to refresh');
          // Provider will handle its own queue refresh logic
        }
      }
    } else {
      // Non-404 error, reset circuit breaker
      this._consecutive404Count = 0;
    }
    
    // V4: For 404s in folder mode, skip silently without showing error UI - just auto-advance
    if (is404 && this.config.media_source_type === 'folder') {
      this._log('🔇 Skipping 404 error UI - will auto-advance silently');
      
      // V4: Remove from queue if provider supports it
      if (currentPath && this.provider && this.queue) {
        this._log(`🗑️ File not found (404) - removing from queue: ${currentPath}`);
        
        // Find and remove from queue
        const queueIndex = this.queue.findIndex(item => item.media_content_id === currentPath);
        if (queueIndex !== -1) {
          this.queue.splice(queueIndex, 1);
          this._log(`🗑️ Removed from queue at index ${queueIndex} (${this.queue.length} remaining)`);
        }
        
        // Also mark in shownItems to avoid showing again
        this.shownItems.add(currentPath);
      }
      
      // V4: In folder mode with auto-refresh enabled, automatically advance to next image immediately
      const effectiveRefreshSeconds = this.config.auto_advance_seconds || 0;
      if (effectiveRefreshSeconds > 0 && !this._isPaused) {
        const autoAdvanceDelay = 100; // Very brief delay for 404s to avoid flickering
        
        this._log(`⏭️ Auto-advancing to next image in ${autoAdvanceDelay}ms (silent 404 skip)`);
        
        // Clear any existing auto-advance timeout
        if (this._errorAutoAdvanceTimeout) {
          clearTimeout(this._errorAutoAdvanceTimeout);
        }
        
        this._errorAutoAdvanceTimeout = setTimeout(async () => {
          if (!this._isPaused) {
            this._log('⏭️ Auto-advancing to next image after 404 (silent)');
            
            try {
              await this._loadNext();
            } catch (error) {
              this._log('❌ Auto-advance after 404 failed:', error);
            }
          }
        }, autoAdvanceDelay);
      }
      return; // Skip error UI rendering for 404s in folder mode
    }
    
    // V4: For non-404 errors, or 404s in single media mode, store error state and show UI
    if (this._debugMode) {
      console.error('[MediaCard] Showing media error:', errorMessage);
    }
    this._errorState = {
      message: errorMessage,
      timestamp: now,
      isSynologyUrl: this.mediaUrl && this.mediaUrl.includes('/synology_dsm/')
    };
    this.requestUpdate();
  }
  
  _handleRetryClick(forceRefresh) {
    this._log('Retry button clicked, force refresh:', forceRefresh);
    this._errorState = null;
    this._retryAttempts.clear();
    
    if (this.currentMedia) {
      this._resolveMediaUrl(this.currentMedia.media_content_id, forceRefresh);
    }
  }

  // V4: Video event handlers
  _onVideoLoadStart() {
    this._log('Video load initiated:', this.mediaUrl);
    // Reset video wait timer for new video
    this._videoWaitStartTime = null;
    // Reset user interaction flag for new video
    this._videoUserInteracted = false;
  }

  _onVideoCanPlay() {
    // V5.7: Apply pending navigation index when video is ready (sync with metadata)
    if (this._pendingNavigationIndex !== null) {
      this.navigationIndex = this._pendingNavigationIndex;
      this._pendingNavigationIndex = null;
      this._log('✅ Applied pending navigation index on video canplay');
      this.requestUpdate();
    }
    
    // V5.6.4: Start auto-advance timer now that video is ready to play
    // Prevents timer expiring before video has loaded (especially for large files)
    this._setupAutoRefresh();
  }

  _onVideoPlay() {
    // Reset video wait timer when video starts playing
    this._videoWaitStartTime = null;
    
    // If slideshow was paused due to video pause, resume it when video plays
    if (this._isPaused && this._pausedByVideo) {
      this._log('🎬 Video resumed - resuming slideshow');
      this._setPauseState(false);
      this._pausedByVideo = false;
    }
  }

  _onVideoPause() {
    this._log('Video paused by user');
    
    // CRITICAL: Ignore pause events when card is disconnected
    // Browser fires pause AFTER disconnectedCallback when navigating away
    if (!this.isConnected) {
      this._log('⏸️ Ignoring video pause - card is disconnected');
      return;
    }
    
    // V5.6: Ignore pause events during navigation
    // Browser auto-pauses videos when navigating away (clicking next/prev)
    if (this._navigatingAway) {
      this._log('⏸️ Ignoring video pause - navigating away');
      return;
    }
    
    // Mark that user has interacted with the video
    this._videoUserInteracted = true;
    this._log('🎬 User interacted with video (pause) - will play to completion');
    
    // Only pause slideshow if video was manually paused (not ended)
    // Also verify we're actually showing a video (not navigated to image)
    const videoElement = this.renderRoot?.querySelector('video');
    const isCurrentlyVideo = this._isVideoFile(this.currentMedia?.media_content_id || '');
    if (videoElement && !videoElement.ended && !this._isPaused && isCurrentlyVideo) {
      this._log('🎬 Video manually paused - pausing slideshow');
      this._pausedByVideo = true;
      this._setPauseState(true);
    }
  }

  // V5: Track video seeking (user interaction)
  _onVideoSeeking() {
    this._videoUserInteracted = true;
    this._log('🎬 User interacted with video (seek) - will play to completion');
  }
  
  // V5: Track video click (user interaction)
  _onVideoClick() {
    this._videoUserInteracted = true;
    this._log('🎬 User interacted with video (click) - will play to completion');
  }

  // V4 CODE REUSE: Check if we should wait for video to complete before advancing
  // Based on V4 lines 3259-3302
  // V5 ENHANCEMENT: If user has interacted with video, ignore video_max_duration and play to end
  async _shouldWaitForVideoCompletion() {
    const videoElement = this.renderRoot?.querySelector('video');
    
    // No video playing, don't wait
    if (!videoElement || !this.mediaUrl || this.currentMedia?.media_content_type?.startsWith('image')) {
      return false;
    }

    // If video is paused, don't wait (user intentionally paused)
    if (videoElement.paused) {
      this._log('🎬 Video is paused - not waiting');
      return false;
    }

    // V5 ENHANCEMENT: If user has interacted with video, wait indefinitely for completion
    if (this._videoUserInteracted) {
      this._log('🎬 User has interacted with video - waiting for full completion (ignoring video_max_duration)');
      return true;
    }

    // Get configuration values
    const videoMaxDuration = this.config.video_max_duration || 0;
    const autoAdvanceSeconds = this.config.auto_advance_seconds || 0;

    // If video_max_duration is 0, wait indefinitely for video completion
    if (videoMaxDuration === 0) {
      return true;
    }

    // Check if we've been waiting too long based on video_max_duration
    const now = Date.now();
    if (!this._videoWaitStartTime) {
      this._videoWaitStartTime = now;
    }

    const waitTimeMs = now - this._videoWaitStartTime;
    const waitTimeSeconds = Math.floor(waitTimeMs / 1000);
    const maxWaitMs = videoMaxDuration * 1000;

    // Use the larger of video_max_duration and auto_advance_seconds as the actual limit
    // This prevents auto_advance_seconds from cutting off long videos
    const effectiveMaxWaitMs = Math.max(maxWaitMs, autoAdvanceSeconds * 1000);
    const effectiveMaxWaitSeconds = Math.floor(effectiveMaxWaitMs / 1000);

    if (waitTimeMs >= effectiveMaxWaitMs) {
      this._log(`🎬 Video max duration reached (${waitTimeSeconds}s/${effectiveMaxWaitSeconds}s), proceeding with refresh`);
      this._videoWaitStartTime = null; // Reset for next video
      return false;
    }

    this._log(`🎬 Video playing - waiting for completion (${waitTimeSeconds}s/${effectiveMaxWaitSeconds}s)`);
    return true;
  }

  _onVideoEnded() {
    const endTime = new Date();
    this._log(`🎬 Video ended at ${endTime.toLocaleTimeString()}:`, this.mediaUrl);
    
    // V5.6: If video_loop is enabled, don't advance - video will loop until auto-refresh timer
    if (this.config.video_loop) {
      this._log('🔁 Video loop enabled - video will restart automatically, waiting for auto-refresh timer');
      return;
    }
    
    // Reset video wait timer when video ends
    this._videoWaitStartTime = null;
    
    // Restart timer if it was stopped for video playback, then trigger immediate action
    if (this._timerStoppedForVideo) {
      this._log('🎬 Restarting auto-timer after video completion');
      this._timerStoppedForVideo = false;
      this._setupAutoRefresh();
      
      // Trigger immediate action instead of waiting for next timer interval
      const hasAutoRefresh = (this.config?.auto_refresh_seconds || 0) > 0;
      const hasAutoAdvance = (this.config?.auto_advance_seconds || 
                             this.config?.auto_advance_interval || 
                             this.config?.auto_advance_duration || 0) > 0;
      
      if (hasAutoRefresh || hasAutoAdvance) {
        this._log('🎬 Triggering immediate action after video completion');
        setTimeout(async () => {
          // Check for new files first (at position 1 in sequential mode)
          const queueRefreshed = await this._checkForNewFiles();
          
          // If queue wasn't refreshed and we have auto_advance, advance to next
          if (!queueRefreshed && hasAutoAdvance) {
            this._loadNext().catch(err => {
              console.error('Error advancing after video:', err);
            });
          } else if (!queueRefreshed && hasAutoRefresh) {
            // Reload current media
            await this._resolveMediaUrl();
            this.requestUpdate();
          }
        }, 100);
        return; // Skip manual mode logic below
      }
    }
    
    // V4: For slideshow mode without auto-advance/refresh, trigger immediate navigation
    if (this.provider && !this.config?.auto_advance_seconds && 
        !this.config?.auto_advance_interval && !this.config?.auto_advance_duration &&
        !this.config?.auto_refresh_seconds) {
      // Manual mode: advance to next media
      const isSeq = this._isSequentialMode();
      const atPositionOne = this.navigationIndex === 0;
      
      if (isSeq && atPositionOne) {
        // At position 1 in sequential mode: stay there (no auto-advance configured)
        this._log(`🎬 Manual mode: Video ended at position 1 (${endTime.toLocaleTimeString()}) - staying at position 1`);
      } else {
        // Not at position 1: advance to next
        this._log('🎬 Manual mode: Video ended - advancing to next media');
        setTimeout(() => {
          this._loadNext().catch(err => {
            console.error('Error advancing to next media after video end:', err);
          });
        }, 100);
      }
    }
  }

  _onVideoLoadedMetadata() {
    const video = this.shadowRoot?.querySelector('video');
    if (video && this.config.video_muted) {
      // Ensure video is actually muted and the mute icon is visible
      video.muted = true;
      // Force the video controls to update by toggling muted state
      setTimeout(() => {
        video.muted = false;
        video.muted = true;
      }, 50);
    }
  }

  // V4: Keyboard navigation handler
  _handleKeyDown(e) {
    // Handle keyboard navigation
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._loadPrevious();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._loadNext();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Space or Enter on navigation zones acts like a click
      if (e.target.classList.contains('nav-zone-left')) {
        this._loadPrevious();
      } else if (e.target.classList.contains('nav-zone-right')) {
        this._loadNext();
      }
    } else if (e.key === 'p' || e.key === 'P') {
      // V4: Pause/Resume with 'P' key
      e.preventDefault();
      this._setPauseState(!this._isPaused);
      this._log(`🎮 ${this._isPaused ? 'PAUSED' : 'RESUMED'} slideshow (keyboard)`);
      
      // Pause/resume the auto-advance timer
      if (this._isPaused) {
        if (this._refreshInterval) {
          clearInterval(this._refreshInterval);
          this._refreshInterval = null;
        }
      } else {
        this._setupAutoRefresh();
      }
      
      this.requestUpdate();
    }
  }

  // V4: Center click handler for pause/resume
  _handleCenterClick(e) {
    e.stopPropagation();
    
    this._log('🖱️ Center click detected - isPaused:', this._isPaused);
    
    // Toggle pause state
    this._setPauseState(!this._isPaused);
    this._log(`🎮 ${this._isPaused ? 'PAUSED' : 'RESUMED'} slideshow`);
    
    // Pause/resume the auto-advance timer
    if (this._isPaused) {
      this._pauseTimer();
    } else {
      this._resumeTimer();
    }
  }
  
  // V4: Pause state management (copied from ha-media-card.js)
  _setPauseState(isPaused) {
    this._isPaused = isPaused;
    
    // Update DOM attribute for CSS styling
    if (isPaused) {
      this.setAttribute('data-is-paused', '');
    } else {
      this.removeAttribute('data-is-paused');
    }
    
    // Force re-render to update pause indicator
    this.requestUpdate();
  }

  _onMediaLoaded(e) {
    // Log media loaded for images (videos log in _onVideoLoadStart)
    if (!this._isVideoFile(this.mediaUrl)) {
      this._log('Media loaded successfully:', this.mediaUrl);
    }
    
    // V5: Clear error state and retry attempts on successful load
    this._errorState = null;
    if (this._retryAttempts.has(this.mediaUrl)) {
      this._retryAttempts.delete(this.mediaUrl);
    }
    
    // V5.6: Handle crossfade layer swap when new image loads
    if (this._pendingLayerSwap) {
      const loadedUrl = e?.target?.src;
      const expectedUrl = this.mediaUrl; // Use mediaUrl which has the resolved URL
      
      // Check if the loaded URL matches the expected URL (compare mediaUrl which is the resolved URL)
      if (loadedUrl && expectedUrl) {
        // Extract pathname from loaded URL if it's a full URL (e.g., http://10.0.0.62:8123/media/...)
        let normalizedLoaded = loadedUrl;
        try {
          const url = new URL(loadedUrl);
          normalizedLoaded = url.pathname + url.search; // Get /media/... path with query params
        } catch (e) {
          // If not a valid URL, use as-is (already a path)
        }
        
        // Both URLs should now be paths - strip query params for comparison
        normalizedLoaded = normalizedLoaded.split('?')[0];
        const normalizedExpected = expectedUrl.split('?')[0];
        
        // Require exact normalized URL match to avoid race conditions
        if (normalizedLoaded === normalizedExpected) {
          this._pendingLayerSwap = false;
          
          // Swap layers to trigger crossfade
          this._frontLayerActive = !this._frontLayerActive;
          this.requestUpdate();
          
          // Clear old layer after transition
          const duration = this._transitionDuration || 300;
          setTimeout(() => {
            if (this._frontLayerActive) {
              this._backLayerUrl = '';
            } else {
              this._frontLayerUrl = '';
            }
            this.requestUpdate();
          }, duration + 100);
        }
      }
    }
    
    // V5.3: Apply default zoom AFTER image loads (PR #37 by BasicCPPDev)
    // This ensures the inline transform style isn't lost during re-render
    if (this.config.default_zoom && this.config.default_zoom > 1) {
      const img = this.shadowRoot.querySelector('.media-container img');
      if (img) {
        const level = Math.max(1.0, Math.min(5.0, this.config.default_zoom));
        this._zoomToPoint(img, 50, 50, level);
      }
    }
    
    // V5.6.4: Start auto-advance timer now that media is loaded and visible
    // Prevents timer expiring before image has rendered (especially on slow connections)
    this._setupAutoRefresh();
    
    // V5: Apply pending metadata AND navigation index now that image has loaded
    // This synchronizes metadata/counter/position indicator updates with the new image appearing
    if (this._pendingMetadata !== null) {
      this._currentMetadata = this._pendingMetadata;
      this._pendingMetadata = null;
      this._log('✅ Applied pending metadata on image load');
    }
    if (this._pendingMediaPath !== null) {
      this._currentMediaPath = this._pendingMediaPath;
      this._pendingMediaPath = null;
    }
    if (this._pendingNavigationIndex !== null) {
      this.navigationIndex = this._pendingNavigationIndex;
      this._pendingNavigationIndex = null;
      this._log('✅ Applied pending navigation index on image load');
    }
    
    // Trigger re-render to show updated metadata/counters
    this.requestUpdate();
  }
  
  // V5.6: Handle image load for specific layer (transition system)
  _onLayerLoaded(e, layer) {
    this._log(`Image layer ${layer} loaded successfully`);
    
    // If this is the next layer (not currently active), trigger transition
    if (layer !== this._currentLayer) {
      this._log(`Swapping to layer ${layer} - transitioning from ${this._currentLayer} to ${layer}`);
      
      // Update mediaUrl to match the newly visible layer
      this.mediaUrl = this._nextMediaUrl;
      this._currentLayer = layer;
      
      this._log(`Updated mediaUrl to: ${this.mediaUrl}`);
    }
    
    // Call the regular media loaded handler for other processing
    this._onMediaLoaded();
  }
  
  // V4: Metadata display methods
  _renderMetadataOverlay() {
    // Only show if metadata is configured and available
    if (!this.config.metadata || !this._currentMetadata) {
      return html``;
    }

    const metadataText = this._formatMetadataDisplay(this._currentMetadata);
    if (!metadataText) {
      return html``;
    }

    const position = this.config.metadata.position || 'top-left';
    const positionClass = `metadata-${position}`;

    return html`
      <div class="metadata-overlay ${positionClass}">
        ${metadataText}
      </div>
    `;
  }
  
  // V4: Format metadata for display
  _formatMetadataDisplay(metadata) {
    if (!metadata || !this.config.metadata) return '';
    
    const parts = [];
    
    if (this.config.metadata.show_folder && metadata.folder) {
      const folderDisplay = this._formatFolderForDisplay(
        metadata.folder,
        this.config.metadata.show_root_folder
      );
      // Only show folder icon if we have a folder name to display
      if (folderDisplay && folderDisplay.trim()) {
        parts.push(`📁 ${folderDisplay}`);
      }
    }
    
    if (this.config.metadata.show_filename && metadata.filename) {
      parts.push(`📄 ${metadata.filename}`);
    }
    
    // Show date with fallback priority: date_taken (EXIF) -> created_time (file metadata) -> date (filesystem)
    if (this.config.metadata.show_date) {
      let date = null;
      
      // Priority 1: EXIF date_taken if available (from media_index)
      if (metadata.date_taken) {
        // Backend returns date_taken as Unix timestamp (number)
        if (typeof metadata.date_taken === 'number') {
          date = new Date(metadata.date_taken * 1000); // Convert Unix timestamp to milliseconds
        } 
        // Or as string "YYYY-MM-DD HH:MM:SS" or "YYYY:MM:DD HH:MM:SS"
        else if (typeof metadata.date_taken === 'string') {
          // Replace colons in date part with dashes for proper parsing
          const dateStr = metadata.date_taken.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          date = new Date(dateStr);
        }
      }
      
      // Priority 2: File created_time if no EXIF date (from media_index file metadata)
      if (!date && metadata.created_time) {
        // created_time is ISO string like "2019-09-24T18:51:12"
        if (typeof metadata.created_time === 'string') {
          date = new Date(metadata.created_time);
        }
        // Or Unix timestamp
        else if (typeof metadata.created_time === 'number') {
          date = new Date(metadata.created_time * 1000);
        }
      }
      
      // Priority 3: Filesystem date as last fallback
      if (!date && metadata.date) {
        date = metadata.date;
      }
      
      if (date && !isNaN(date.getTime())) {
        // Use Home Assistant's locale for date formatting
        const locale = this.hass?.locale?.language || this.hass?.language || navigator.language || 'en-US';
        parts.push(`📅 ${date.toLocaleDateString(locale)}`);
        
        // V5: Add time if configured
        if (this.config.metadata.show_time) {
          parts.push(`🕐 ${date.toLocaleTimeString(locale)}`);
        }
      }
    }
    
    // Show rating/favorite if available (from media_index)
    if (this.config.metadata.show_rating) {
      if (metadata.is_favorited) {
        parts.push('❤️');
      } else if (metadata.rating && metadata.rating > 0) {
        parts.push('⭐'.repeat(Math.min(5, Math.max(0, metadata.rating))));
      }
    }
    
    // Show geocoded location if available (from media_index)
    if (this.config.metadata.show_location) {
      if (metadata.location_city || metadata.location_country) {
        // Get server's country from Home Assistant config (ISO code like "US")
        const serverCountryCode = this.hass?.config?.country || null;
        
        // Map common country codes to full names for comparison
        // Also includes common variations (e.g., "United States of America")
        const countryMap = {
          'US': ['United States', 'United States of America', 'USA'],
          'CA': ['Canada'],
          'GB': ['United Kingdom', 'Great Britain', 'UK'],
          'AU': ['Australia'],
          'NZ': ['New Zealand'],
          'DE': ['Germany', 'Deutschland'],
          'FR': ['France'],
          'IT': ['Italy', 'Italia'],
          'ES': ['Spain', 'España'],
          'JP': ['Japan'],
          'CN': ['China'],
          'IN': ['India'],
          'BR': ['Brazil', 'Brasil'],
          'MX': ['Mexico', 'México'],
          'NL': ['Netherlands', 'The Netherlands', 'Holland'],
          'SE': ['Sweden', 'Sverige'],
          'NO': ['Norway', 'Norge'],
          'DK': ['Denmark', 'Danmark'],
          'FI': ['Finland', 'Suomi'],
          'PL': ['Poland', 'Polska'],
          'CZ': ['Czech Republic', 'Czechia'],
          'AT': ['Austria', 'Österreich'],
          'CH': ['Switzerland', 'Schweiz', 'Suisse'],
          'BE': ['Belgium', 'België', 'Belgique'],
          'IE': ['Ireland', 'Éire'],
          'PT': ['Portugal'],
          'GR': ['Greece', 'Hellas'],
          'RU': ['Russia', 'Russian Federation'],
          'ZA': ['South Africa'],
          'AR': ['Argentina'],
          'CL': ['Chile'],
          'CO': ['Colombia'],
          'KR': ['South Korea', 'Korea'],
          'TH': ['Thailand'],
          'SG': ['Singapore'],
          'MY': ['Malaysia'],
          'ID': ['Indonesia'],
          'PH': ['Philippines'],
          'VN': ['Vietnam', 'Viet Nam'],
          'IL': ['Israel'],
          'SA': ['Saudi Arabia'],
          'AE': ['United Arab Emirates', 'UAE'],
          'EG': ['Egypt'],
          'TR': ['Turkey', 'Türkiye']
        };
        
        const serverCountryNames = serverCountryCode ? countryMap[serverCountryCode] : null;
        
        // Build location text
        let locationText = '';
        
        // Add location name (specific place) if available
        if (metadata.location_name && metadata.location_name.trim()) {
          locationText = metadata.location_name;
        }
        
        // Add city if available (skip if empty string)
        if (metadata.location_city && metadata.location_city.trim()) {
          if (locationText && locationText !== metadata.location_city) {
            locationText += `, ${metadata.location_city}`;
          } else if (!locationText) {
            locationText = metadata.location_city;
          }
          
          // Add state if available and different from city
          if (metadata.location_state && metadata.location_state !== metadata.location_city) {
            locationText += `, ${metadata.location_state}`;
          }
        } else if (metadata.location_state && metadata.location_state.trim()) {
          // No city, but we have state - add it
          locationText += locationText ? `, ${metadata.location_state}` : metadata.location_state;
        }
        
        // Only show country if we have a server country AND it doesn't match
        // Compare ISO code and all country name variations
        if (metadata.location_country) {
          const countryMatches = serverCountryCode && (
            metadata.location_country === serverCountryCode ||
            (serverCountryNames && serverCountryNames.includes(metadata.location_country))
          );
          
          if (!countryMatches) {
            locationText += locationText ? `, ${metadata.location_country}` : metadata.location_country;
          }
        }
        
        if (locationText) {
          parts.push(`📍 ${locationText}`);
        } else if (metadata.has_coordinates) {
          // Has GPS but no city/state/country text yet - geocoding pending
          parts.push(`📍 Loading location...`);
        }
      }
    }
    
    return parts.join(' • ');
  }
  
  // Render display entities overlay
  _renderDisplayEntities() {
    const config = this.config?.display_entities;
    if (!config?.enabled || !config.entities?.length) {
      return html``;
    }

    const entities = this._getFilteredEntities();
    if (!entities.length) {
      return html``;
    }

    // Get current entity
    const entityId = entities[this._currentEntityIndex % entities.length];
    const entityConfig = config.entities.find(e => e.entity === entityId);
    const state = this.hass?.states?.[entityId];

    if (!state) {
      return html``;
    }

    // Format entity display
    const label = entityConfig?.label || '';
    
    // Format state value
    let stateText = state.state;
    
    // Use device_class friendly names if available (all HA binary sensor device classes)
    const deviceClass = state.attributes?.device_class;
    if (deviceClass && MediaCard.FRIENDLY_STATES[deviceClass]?.[stateText]) {
      stateText = MediaCard.FRIENDLY_STATES[deviceClass][stateText];
    }
    
    // Round numeric values to 1 decimal place
    if (!isNaN(parseFloat(stateText)) && isFinite(stateText)) {
      stateText = parseFloat(stateText).toFixed(1);
    }
    
    const unit = state.attributes?.unit_of_measurement || '';
    const displayText = label 
      ? `${label} ${stateText}${unit}` 
      : `${stateText}${unit}`;

    // Icon support
    const icon = entityConfig?.icon;
    const baseIconColor = entityConfig?.icon_color || 'currentColor';

    // Evaluate JavaScript/Jinja2 styles (returns { containerStyles, iconColor })
    const styleResult = this._evaluateEntityStyles(entityConfig, state);
    const containerStyles = styleResult.containerStyles || '';
    const iconColor = styleResult.iconColor || baseIconColor;

    // Position class
    const position = config.position || 'top-left';
    const positionClass = `position-${position}`;
    const visibleClass = this._displayEntitiesVisible ? 'visible' : '';

    return html`
      <div class="display-entities ${positionClass} ${visibleClass}" style="${containerStyles}">
        ${icon ? html`<ha-icon icon="${icon}" style="color: ${iconColor};"></ha-icon>` : ''}
        ${displayText}
      </div>
    `;
  }

  // V5.6: Clock/Date Overlay
  _renderClock() {
    const config = this.config?.clock;
    if (!config?.enabled) {
      return html``;
    }

    // Don't show clock if neither time nor date is enabled
    if (!config.show_time && !config.show_date) {
      return html``;
    }

    const now = new Date();
    const position = config.position || 'bottom-left';
    const positionClass = `clock-${position}`;

    // Format time
    let timeDisplay = '';
    if (config.show_time !== false) {
      const format = config.format || '12h';
      if (format === '24h') {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeDisplay = `${hours}:${minutes}`;
      } else {
        // 12-hour format
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeDisplay = `${hours}:${minutes} ${ampm}`;
      }
    }

    // Format date
    let dateDisplay = '';
    if (config.show_date !== false) {
      const dateFormat = config.date_format || 'long';
      if (dateFormat === 'short') {
        dateDisplay = now.toLocaleDateString();
      } else {
        // Long format
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay = now.toLocaleDateString(undefined, options);
      }
    }

    const backgroundClass = config.show_background === false ? 'no-background' : '';
    const showMediaIndexButtons = MediaProvider.isMediaIndexActive(this.config);
    const enableOnThisDay = this.config.action_buttons?.enable_on_this_day !== false;
    const clockClickable = showMediaIndexButtons && enableOnThisDay;
    
    return html`
      <div 
        class="clock-overlay ${positionClass} ${backgroundClass} ${clockClickable ? 'clickable' : ''}"
        @click=${clockClickable ? this._handleOnThisDayClick : null}
        title="${clockClickable ? 'Through the Years' : ''}">
        ${timeDisplay ? html`<div class="clock-time">${timeDisplay}</div>` : ''}
        ${dateDisplay ? html`<div class="clock-date">${dateDisplay}</div>` : ''}
      </div>
    `;
  }

  // V4: Format folder path for display
  _formatFolderForDisplay(fullFolderPath, showRoot) {
    if (!fullFolderPath) return '';
    
    // Cache key for memoization
    const cacheKey = `${fullFolderPath}|${showRoot}`;
    if (this._folderDisplayCache && this._folderDisplayCache.key === cacheKey) {
      return this._folderDisplayCache.value;
    }
    
    // Extract the scan path prefix from config (folder.path takes precedence over legacy media_path)
    // e.g., "media-source://media_source/media/Photo/OneDrive" -> "/media/Photo/OneDrive"
    let scanPrefix = '';
    const mediaPath = this.config?.folder?.path || this.config?.single_media?.path || this.config?.media_path;
    if (mediaPath) {
      const match = mediaPath.match(/media-source:\/\/media_source(\/.+)/);
      if (match) {
        scanPrefix = match[1];
      }
    }
    
    // Normalize folder path to absolute if it's relative
    let absoluteFolderPath = fullFolderPath;
    if (!absoluteFolderPath.startsWith('/')) {
      absoluteFolderPath = '/media/' + absoluteFolderPath;
    }
    
    // Remove the scan prefix from the folder path
    let relativePath = absoluteFolderPath;
    if (scanPrefix && absoluteFolderPath.startsWith(scanPrefix)) {
      relativePath = absoluteFolderPath.substring(scanPrefix.length);
    }
    
    // Clean up path (remove leading/trailing slashes)
    relativePath = relativePath.replace(/^\/+/, '').replace(/\/+$/, '');
    
    // Split into parts
    const parts = relativePath.split('/').filter(p => p.length > 0);
    
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0]; // Only one folder level
    
    if (showRoot) {
      // Format: "first...last"
      const first = parts[0];
      const last = parts[parts.length - 1];
      const result = `${first}...${last}`;
      this._folderDisplayCache = { key: cacheKey, value: result };
      return result;
    } else {
      // Just show last folder
      const result = parts[parts.length - 1];
      this._folderDisplayCache = { key: cacheKey, value: result };
      return result;
    }
  }
  
  // V4: Video info overlay
  _renderVideoInfo() {
    // Check if we should hide video controls display (default: true)
    if (this.config.hide_video_controls_display !== false) {
      return '';
    }
    
    const options = [];
    if (this.config.video_autoplay) options.push('Autoplay');
    if (this.config.video_loop) options.push('Loop');
    if (this.config.video_muted) options.push('Muted');
    
    if (options.length > 0) {
      return html`
        <div class="video-controls">
          Video options: ${options.join(', ')}
        </div>
      `;
    }
    return '';
  }
  
  // V4: Action Buttons (Favorite/Delete/Edit)
  _renderActionButtons() {
    // V4: Show pause button always (if enabled in config)
    // Show media_index action buttons only when media_index active and file loaded
    const showMediaIndexButtons = MediaProvider.isMediaIndexActive(this.config) && this._currentMediaPath;
    
    // Check individual button enable flags (default: true)
    const config = this.config.action_buttons || {};
    const enablePause = config.enable_pause !== false;
    const enableFavorite = config.enable_favorite !== false;
    const enableDelete = config.enable_delete !== false;
    const enableEdit = config.enable_edit !== false;
    const enableInfo = config.enable_info !== false;
    const enableFullscreen = config.enable_fullscreen === true;
    const enableRefresh = this.config.show_refresh_button === true;
    const enableDebugButton = this.config.debug_button === true;
    
    // V5.5: Burst review feature (At This Moment)
    const enableBurstReview = this.config.action_buttons?.enable_burst_review === true;
    
    // V5.5: Related photos feature (same timeframe)
    const enableRelatedPhotos = this.config.action_buttons?.enable_related_photos === true;
    
    // V5.5: On This Day feature (anniversary mode - same date across years)
    const enableOnThisDay = this.config.action_buttons?.enable_on_this_day === true;
    
    // V5.6: Queue Preview mode (Show Queue) - works without media_index
    const enableQueuePreview = this.config.action_buttons?.enable_queue_preview === true;
    // Show button if enabled and queue has items (or still loading)
    const showQueueButton = enableQueuePreview && this.navigationQueue && this.navigationQueue.length >= 1;
    
    // Don't render anything if all buttons are disabled
    const anyButtonEnabled = enablePause || enableDebugButton || enableRefresh || enableFullscreen || 
                            (showMediaIndexButtons && (enableFavorite || enableDelete || enableEdit || enableInfo || enableBurstReview || enableRelatedPhotos || enableOnThisDay)) ||
                            showQueueButton;
    if (!anyButtonEnabled) {
      return html``;
    }

    // Check both metadata AND burst session favorites
    const currentUri = this._currentMediaPath;
    const isFavorite = this._currentMetadata?.is_favorited || 
                       (this._burstFavoritedFiles && this._burstFavoritedFiles.includes(currentUri)) || 
                       false;
    const isPaused = this._isPaused || false;
    const isInfoActive = this._showInfoOverlay || false;
    const isBurstActive = this._burstMode || false;
    const isRelatedActive = this._panelMode === 'related';
    const isOnThisDayActive = this._panelMode === 'on_this_day';
    const isQueueActive = this._panelMode === 'queue';
    const position = config.position || 'top-right';

    return html`
      <div class="action-buttons action-buttons-${position} ${this._showButtonsExplicitly ? 'show-buttons' : ''}">
        ${enablePause ? html`
          <button
            class="action-btn pause-btn ${isPaused ? 'paused' : ''}"
            @click=${this._handlePauseClick}
            title="${isPaused ? 'Resume' : 'Pause'}">
            <ha-icon icon="${isPaused ? 'mdi:play' : 'mdi:pause'}"></ha-icon>
          </button>
        ` : ''}
        ${enableDebugButton ? html`
          <button
            class="action-btn debug-btn ${this._debugMode ? 'active' : ''}"
            @click=${this._handleDebugButtonClick}
            title="${this._debugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}">
            <ha-icon icon="${this._debugMode ? 'mdi:bug' : 'mdi:bug-outline'}"></ha-icon>
          </button>
        ` : ''}
        ${enableRefresh ? html`
          <button
            class="action-btn refresh-btn"
            @click=${this._handleRefreshClick}
            title="Refresh">
            <ha-icon icon="mdi:refresh"></ha-icon>
          </button>
        ` : ''}
        ${enableFullscreen ? html`
          <button
            class="action-btn fullscreen-btn"
            @click=${this._handleFullscreenButtonClick}
            title="Fullscreen">
            <ha-icon icon="mdi:fullscreen"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableInfo ? html`
          <button
            class="action-btn info-btn ${isInfoActive ? 'active' : ''}"
            @click=${this._handleInfoClick}
            title="Show Info">
            <ha-icon icon="mdi:information-outline"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableBurstReview ? html`
          <button
            class="action-btn burst-btn ${isBurstActive ? 'active' : ''} ${this._burstLoading ? 'loading' : ''}"
            @click=${this._handleBurstClick}
            title="${isBurstActive ? 'Burst Review Active' : 'Burst Review'}">
            <ha-icon icon="mdi:camera-burst"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableRelatedPhotos ? html`
          <button
            class="action-btn related-btn ${isRelatedActive ? 'active' : ''} ${this._relatedLoading ? 'loading' : ''}"
            @click=${this._handleRelatedClick}
            title="${isRelatedActive ? 'Same Date Active' : 'Same Date'}">
            <ha-icon icon="mdi:calendar-outline"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableOnThisDay ? html`
          <button
            class="action-btn on-this-day-btn ${isOnThisDayActive ? 'active' : ''} ${this._onThisDayLoading ? 'loading' : ''}"
            @click=${this._handleOnThisDayClick}
            title="${isOnThisDayActive ? 'Through Years Active' : `Through Years (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`}">
            <ha-icon icon="mdi:calendar-multiple"></ha-icon>
          </button>
        ` : ''}
        ${showQueueButton ? html`
          <button
            class="action-btn queue-btn ${isQueueActive ? 'active' : ''}"
            @click=${this._handleQueueClick}
            title="${isQueueActive ? 'Queue Active' : 'Show Queue'}">
            <ha-icon icon="mdi:playlist-play"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableFavorite ? html`
          <button
            class="action-btn favorite-btn ${isFavorite ? 'favorited' : ''}"
            @click=${this._handleFavoriteClick}
            title="${isFavorite ? 'Unfavorite' : 'Favorite'}">
            <ha-icon icon="${isFavorite ? 'mdi:heart' : 'mdi:heart-outline'}"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableEdit ? html`
          <button
            class="action-btn edit-btn"
            @click=${this._handleEditClick}
            title="Mark for Editing">
            <ha-icon icon="mdi:pencil-outline"></ha-icon>
          </button>
        ` : ''}
        ${showMediaIndexButtons && enableDelete ? html`
          <button
            class="action-btn delete-btn"
            @click=${this._handleDeleteClick}
            title="Delete">
            <ha-icon icon="mdi:delete-outline"></ha-icon>
          </button>
        ` : ''}
      </div>
    `;
  }

  // V4 CODE REUSE: Navigation indicators (position and dots)
  // Based on V4 lines 4187-4233
  _renderNavigationIndicators() {
    // Don't show in single_media mode
    if (this.config.media_source_type === 'single_media') {
      return html``;
    }

    // Get current queue size from appropriate provider and track the maximum seen
    let currentQueueSize = 0;
    
    // Check different provider types for queue size
    if (this.provider?.subfolderQueue?.queue?.length) {
      // FolderProvider with SubfolderQueue
      currentQueueSize = this.provider.subfolderQueue.queue.length;
    } else if (this.provider?.queue?.length) {
      // MediaIndexProvider or SequentialMediaIndexProvider
      currentQueueSize = this.provider.queue.length;
    } else if (this.provider?.mediaIndexProvider?.queue?.length) {
      // FolderProvider wrapping MediaIndexProvider
      currentQueueSize = this.provider.mediaIndexProvider.queue.length;
    } else if (this.provider?.sequentialProvider?.queue?.length) {
      // FolderProvider wrapping SequentialMediaIndexProvider
      currentQueueSize = this.provider.sequentialProvider.queue.length;
    }
    
    // Track maximum queue size, but allow it to decrease if queue shrinks significantly
    // (e.g., due to filtering or folder changes)
    if (currentQueueSize > this._maxQueueSize) {
      this._maxQueueSize = currentQueueSize;
    } else if (currentQueueSize > 0 && this._maxQueueSize > currentQueueSize * 2) {
      // If queue is less than half of recorded max, reset to current size
      // This handles filtering/folder changes while avoiding flicker during normal operation
      this._maxQueueSize = currentQueueSize;
      this._log('Reset _maxQueueSize to', currentQueueSize, '(queue shrunk significantly)');
    }
    
    // V5.3: Use navigation queue for position indicator
    const totalCount = this.navigationQueue.length;
    if (totalCount === 0 || this.navigationIndex < 0) {
      return html``; // Don't show until initialized (navigationIndex starts at -1)
    }

    // Current position is navigationIndex (starts at 0 after first increment from -1)
    const currentIndex = this.navigationIndex;
    const currentPosition = currentIndex + 1;
    
    // Total is the max of queue length and history length
    const totalSeen = Math.max(totalCount, this.history.length);

    // Show position indicator if enabled
    let positionIndicator = html``;
    if (this.config.show_position_indicator !== false) {
      // ALWAYS show "X of Y" format (removed the confusing hide-when-equal logic)
      // This ensures consistent display even when at position 1 after refresh
      positionIndicator = html`
        <div class="position-indicator">
          ${currentPosition} of ${totalSeen}
        </div>
      `;
    }

    // Show dots indicator if enabled and not too many items (limit to 15)
    let dotsIndicator = html``;
    if (this.config.show_dots_indicator !== false && totalCount <= 15) {
      const dots = [];
      for (let i = 0; i < totalCount; i++) {
        dots.push(html`
          <div class="dot ${i === currentIndex ? 'active' : ''}"></div>
        `);
      }
      dotsIndicator = html`
        <div class="dots-indicator">
          ${dots}
        </div>
      `;
    }

    return html`
      ${positionIndicator}
      ${dotsIndicator}
    `;
  }

  // Info overlay rendering with formatted metadata
  _renderInfoOverlay() {
    if (!this._showInfoOverlay) {
      return html``;
    }

    // If overlay is open but we don't have full metadata, fetch it now
    if (!this._fullMetadata && this._currentMediaPath && MediaProvider.isMediaIndexActive(this.config)) {
      // Trigger async fetch (don't await, will update on next render)
      this._fetchFullMetadataAsync();
    }

    // Use full metadata if available, otherwise fall back to current metadata
    const metadata = this._fullMetadata || this._currentMetadata || {};
    const exif = metadata.exif || {};

    // Format timestamp to locale date/time
    const formatTimestamp = (timestamp) => {
      if (!timestamp) return 'N/A';
      const date = new Date(timestamp * 1000);
      return date.toLocaleString();
    };

    // Format file size to human-readable
    const formatFileSize = (bytes) => {
      if (!bytes) return 'N/A';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    return html`
      <div class="info-overlay">
        <div class="info-content">
          <div class="info-header">
            <h3>Media Information</h3>
            <button class="info-close-btn" @click=${() => { this._showInfoOverlay = false; this.requestUpdate(); }}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="info-body">
            ${metadata.path ? html`
              <div class="info-section">
                <div class="info-label">Path:</div>
                <div class="info-value">${metadata.path}</div>
              </div>
            ` : ''}
            ${metadata.rating !== null && metadata.rating !== undefined ? html`
              <div class="info-section">
                <div class="info-label">Rating:</div>
                <div class="info-value">${metadata.rating} ${'⭐'.repeat(Math.min(5, Math.max(0, metadata.rating)))}</div>
              </div>
            ` : ''}
            
            ${exif.date_taken || exif.location_name || exif.location_city ? html`
              <div class="info-group-header">📍 Location & Time</div>
            ` : ''}
            ${exif.date_taken ? html`
              <div class="info-section">
                <div class="info-label">Date Taken:</div>
                <div class="info-value">${formatTimestamp(exif.date_taken)}</div>
              </div>
            ` : ''}
            ${exif.location_name ? html`
              <div class="info-section">
                <div class="info-label">Location Name:</div>
                <div class="info-value">${exif.location_name}</div>
              </div>
            ` : ''}
            ${exif.location_city ? html`
              <div class="info-section">
                <div class="info-label">City:</div>
                <div class="info-value">${exif.location_city}</div>
              </div>
            ` : ''}
            ${exif.location_state ? html`
              <div class="info-section">
                <div class="info-label">State:</div>
                <div class="info-value">${exif.location_state}</div>
              </div>
            ` : ''}
            ${exif.location_country ? html`
              <div class="info-section">
                <div class="info-label">Country:</div>
                <div class="info-value">${exif.location_country}</div>
              </div>
            ` : ''}
            ${exif.altitude !== null && exif.altitude !== undefined ? html`
              <div class="info-section">
                <div class="info-label">Altitude:</div>
                <div class="info-value">${exif.altitude} m</div>
              </div>
            ` : ''}
            ${exif.latitude || exif.longitude ? html`
              <div class="info-section">
                <div class="info-label">Coordinates:</div>
                <div class="info-value">${exif.latitude?.toFixed(6)}, ${exif.longitude?.toFixed(6)}</div>
              </div>
            ` : ''}
            
            ${exif.camera_make || exif.camera_model ? html`
              <div class="info-group-header">📷 Camera</div>
            ` : ''}
            ${exif.camera_make ? html`
              <div class="info-section">
                <div class="info-label">Make:</div>
                <div class="info-value">${exif.camera_make}</div>
              </div>
            ` : ''}
            ${exif.camera_model ? html`
              <div class="info-section">
                <div class="info-label">Model:</div>
                <div class="info-value">${exif.camera_model}</div>
              </div>
            ` : ''}
            ${exif.flash ? html`
              <div class="info-section">
                <div class="info-label">Flash:</div>
                <div class="info-value">${exif.flash}</div>
              </div>
            ` : ''}
            ${exif.iso ? html`
              <div class="info-section">
                <div class="info-label">ISO:</div>
                <div class="info-value">${exif.iso}</div>
              </div>
            ` : ''}
            ${exif.aperture ? html`
              <div class="info-section">
                <div class="info-label">Aperture:</div>
                <div class="info-value">f/${exif.aperture}</div>
              </div>
            ` : ''}
            ${exif.shutter_speed ? html`
              <div class="info-section">
                <div class="info-label">Shutter Speed:</div>
                <div class="info-value">${exif.shutter_speed}</div>
              </div>
            ` : ''}
            ${exif.focal_length ? html`
              <div class="info-section">
                <div class="info-label">Focal Length:</div>
                <div class="info-value">${exif.focal_length} mm</div>
              </div>
            ` : ''}
            ${exif.focal_length_35mm ? html`
              <div class="info-section">
                <div class="info-label">Focal Length (35mm):</div>
                <div class="info-value">${exif.focal_length_35mm} mm</div>
              </div>
            ` : ''}
            ${exif.exposure_compensation ? html`
              <div class="info-section">
                <div class="info-label">Exposure Compensation:</div>
                <div class="info-value">${exif.exposure_compensation}</div>
              </div>
            ` : ''}
            ${exif.metering_mode ? html`
              <div class="info-section">
                <div class="info-label">Metering Mode:</div>
                <div class="info-value">${exif.metering_mode}</div>
              </div>
            ` : ''}
            ${exif.white_balance ? html`
              <div class="info-section">
                <div class="info-label">White Balance:</div>
                <div class="info-value">${exif.white_balance}</div>
              </div>
            ` : ''}
            ${metadata.orientation ? html`
              <div class="info-section">
                <div class="info-label">Orientation:</div>
                <div class="info-value">${metadata.orientation}</div>
              </div>
            ` : ''}
            
            <div class="info-group-header">📁 File Info</div>
            ${metadata.file_size ? html`
              <div class="info-section">
                <div class="info-label">File Size:</div>
                <div class="info-value">${formatFileSize(metadata.file_size)}</div>
              </div>
            ` : ''}
            ${metadata.file_id ? html`
              <div class="info-section">
                <div class="info-label">File ID:</div>
                <div class="info-value">${metadata.file_id}</div>
              </div>
            ` : ''}
            ${metadata.modified_time ? html`
              <div class="info-section">
                <div class="info-label">Modified:</div>
                <div class="info-value">${new Date(metadata.modified_time).toLocaleString()}</div>
              </div>
            ` : ''}
            ${metadata.created_time ? html`
              <div class="info-section">
                <div class="info-label">Created:</div>
                <div class="info-value">${new Date(metadata.created_time).toLocaleString()}</div>
              </div>
            ` : ''}
            ${metadata.duration !== null && metadata.duration !== undefined ? html`
              <div class="info-section">
                <div class="info-label">Duration:</div>
                <div class="info-value">${metadata.duration ? `${metadata.duration.toFixed(1)}s` : 'N/A'}</div>
              </div>
            ` : ''}
            ${metadata.width && metadata.height ? html`
              <div class="info-section">
                <div class="info-label">Dimensions:</div>
                <div class="info-value">${metadata.width} × ${metadata.height}</div>
              </div>
            ` : ''}
            ${metadata.last_scanned ? html`
              <div class="info-section">
                <div class="info-label">Last Scanned:</div>
                <div class="info-value">${formatTimestamp(metadata.last_scanned)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  getCardSize() {
    return 3;
  }
  
  // V5.6: Display Entities System
  _initDisplayEntities() {
    if (!this.hass || !this.config?.display_entities?.enabled) return;
    
    const entities = this.config.display_entities.entities || [];
    if (entities.length === 0) return;
    
    // Extract entity IDs
    const entityIds = entities.map(e => typeof e === 'string' ? e : e.entity).filter(Boolean);
    if (entityIds.length === 0) return;
    
    this._log('📊 Initializing display entities:', entityIds.length, 'entities');
    
    // Initialize state tracking
    entityIds.forEach(entityId => {
      const state = this.hass.states[entityId];
      if (state) {
        this._entityStates.set(entityId, state);
      }
    });
    
    // Evaluate conditions and styles before starting cycle
    // CRITICAL: Wait for conditions before showing any entities
    Promise.all([
      this._evaluateAllConditions(),
      this._evaluateAllEntityStyles()
    ]).then(() => {
      // Start cycle timer if multiple entities pass conditions
      const filteredCount = this._getFilteredEntities().length;
      if (filteredCount > 1) {
        this._startEntityCycle();
      } else if (filteredCount === 1) {
        // Single entity - just show it
        this._displayEntitiesVisible = true;
        this.requestUpdate();
      } else {
        // No entities pass conditions - hide display entities
        this._displayEntitiesVisible = false;
        this.requestUpdate();
      }
    });
  }

  // Update entity states on hass changes (called after initial setup)
  _updateDisplayEntityStates() {
    if (!this.hass || !this.config?.display_entities?.enabled) return;
    
    const entities = this.config.display_entities.entities || [];
    const entityIds = entities.map(e => typeof e === 'string' ? e : e.entity).filter(Boolean);
    
    let stateChanged = false;
    entityIds.forEach(entityId => {
      const state = this.hass.states[entityId];
      if (state) {
        const oldState = this._entityStates.get(entityId);
        if (oldState && oldState.state !== state.state) {
          // State changed - track it
          this._recentlyChangedEntities.add(entityId);
          const recentWindow = (this.config.display_entities.recent_change_window || 60) * 1000;
          setTimeout(() => {
            this._recentlyChangedEntities.delete(entityId);
          }, recentWindow);
          stateChanged = true;
        }
        this._entityStates.set(entityId, state);
      }
    });
    
    // Re-evaluate conditions when state changes (with debouncing)
    if (stateChanged) {
      const now = Date.now();
      const minInterval = 500; // 500ms debounce
      const lastEval = this._lastConditionEvalTs || 0;
      const elapsed = now - lastEval;

      const runEvaluation = () => {
        this._lastConditionEvalTs = Date.now();
        this._pendingConditionEval = null;
        this._evaluateAllConditions();
        this.requestUpdate();
      };

      if (!lastEval || elapsed >= minInterval) {
        runEvaluation();
      } else if (!this._pendingConditionEval) {
        const delay = minInterval - elapsed;
        this._pendingConditionEval = setTimeout(runEvaluation, delay);
      }
    }
  }

  
  _startEntityCycle() {
    // Clear existing timer
    if (this._entityCycleTimer) {
      clearInterval(this._entityCycleTimer);
    }
    
    const entities = this.config.display_entities.entities || [];
    if (entities.length <= 1) return;
    
    // Show first entity immediately
    this._currentEntityIndex = 0;
    this._displayEntitiesVisible = true;
    this.requestUpdate();
    
    // Set up rotation timer
    const interval = (this.config.display_entities.cycle_interval || 10) * 1000;
    this._entityCycleTimer = setInterval(() => {
      this._cycleToNextEntity();
    }, interval);
    
    this._log('📊 Started entity cycle timer, interval:', interval, 'ms');
  }
  
  _cycleToNextEntity() {
    const filteredEntities = this._getFilteredEntities();
    if (filteredEntities.length <= 1) return;
    
    // Fade out
    this._displayEntitiesVisible = false;
    this.requestUpdate();
    
    // Wait for fade transition, then update and fade in
    const duration = this.config.display_entities.transition_duration || 500;
    setTimeout(() => {
      // Increment based on filtered count, not total count
      this._currentEntityIndex = (this._currentEntityIndex + 1) % filteredEntities.length;
      this._displayEntitiesVisible = true;
      this.requestUpdate();
    }, duration / 2); // Half duration for fade out, half for fade in
  }
  
  async _evaluateEntityCondition(condition) {
    if (!condition || !this.hass) return true;
    
    try {
      // render_template is a subscription API - we need to subscribe, get result, unsubscribe
      return await new Promise((resolve, reject) => {
        let unsubscribe;
        const timeout = setTimeout(() => {
          if (unsubscribe) unsubscribe();
          reject(new Error('Template evaluation timeout'));
        }, 5000);
        
        this.hass.connection.subscribeMessage(
          (message) => {
            clearTimeout(timeout);
            if (unsubscribe) unsubscribe();
            
            // Don't process if card was disconnected
            if (!this.isConnected) {
              resolve(false);
              return;
            }
            
            // Extract the actual result from the message object
            const result = message?.result !== undefined ? message.result : message;
            this._log('🔍 Template result:', condition, '→', result);
            
            // Handle different result formats
            const resultStr = String(result).trim().toLowerCase();
            const passes = resultStr === 'true' || result === true;
            
            resolve(passes);
          },
          {
            type: "render_template",
            template: condition
          }
        ).then(unsub => {
          unsubscribe = unsub;
        });
      });
    } catch (error) {
      console.warn('[MediaCard] Failed to evaluate entity condition:', condition, error);
      return false;
    }
  }
  
  _evaluateEntityStyles(entityConfig, state) {
    if (!entityConfig?.styles) return { containerStyles: '', iconColor: null };
    
    const entity = state;
    const stateStr = state.state;
    const stateValue = parseFloat(state.state);
    
    const styles = [];
    let iconColor = null;
    const entityId = state.entity_id;
    
    try {
      Object.entries(entityConfig.styles).forEach(([property, template]) => {
        let value;
        
        if (typeof template === 'string' && template.includes('[[[') && template.includes(']]]')) {
          // JavaScript template syntax: [[[ return ... ]]]
          const jsCode = template.match(/\[\[\[(.*?)\]\]\]/s)?.[1];
          if (jsCode) {
            const func = new Function('entity', 'state', 'stateNum', jsCode);
            value = func(entity, stateStr, stateValue);
          }
        } else if (typeof template === 'string' && (template.includes('{{') || template.includes('{%'))) {
          // Jinja2 template - use cached value if available
          const cacheKey = `${entityId}:${property}`;
          if (this._entityStyleCache?.has(cacheKey)) {
            value = this._entityStyleCache.get(cacheKey);
          } else {
            // No cache yet, will be filled by async evaluation
            value = null;
          }
        } else {
          // Static value
          value = template;
        }
        
        if (value !== undefined && value !== null && value !== '') {
          // Special handling for iconColor
          if (property === 'iconColor') {
            iconColor = value;
          } else {
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            styles.push(`${cssProperty}: ${value} !important`);
          }
        }
      });
    } catch (error) {
      console.warn('[MediaCard] Failed to evaluate entity styles:', error);
    }
    
    return { containerStyles: styles.join('; '), iconColor };
  }
  
  async _evaluateAllEntityStyles() {
    if (!this.hass || !this.config?.display_entities?.enabled) return;
    
    const entities = this.config.display_entities.entities || [];
    
    for (const entityConfig of entities) {
      const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
      if (!entityId || !entityConfig.styles) continue;
      
      const state = this.hass.states[entityId];
      if (!state) continue;
      
      // Evaluate each Jinja2 style property and cache individually
      for (const [property, template] of Object.entries(entityConfig.styles)) {
        if (typeof template === 'string') {
          if (template.includes('[[[') && template.includes(']]]')) {
            // JavaScript template - skip (evaluated synchronously on render)
            continue;
          } else if (template.includes('{{') || template.includes('{%')) {
            // Jinja2 template - evaluate async and cache per property
            try {
              const value = await this._evaluateJinjaTemplate(template);
              const cacheKey = `${entityId}:${property}`;
              if (!this._entityStyleCache) {
                this._entityStyleCache = new Map();
              }
              this._entityStyleCache.set(cacheKey, value);
              this._log('🎨 Jinja2 style:', property, '→', value, 'for', entityId);
            } catch (error) {
              console.warn('[MediaCard] Failed to evaluate Jinja2 style:', property, error);
            }
          }
          // Static values don't need caching
        }
      }
    }
    
    this.requestUpdate();
  }
  
  async _evaluateJinjaTemplate(template) {
    if (!this.hass) return null;
    
    try {
      return await new Promise((resolve, reject) => {
        let unsubscribe;
        const timeout = setTimeout(() => {
          if (unsubscribe) unsubscribe();
          reject(new Error('Template evaluation timeout'));
        }, 5000);
        
        this.hass.connection.subscribeMessage(
          (message) => {
            clearTimeout(timeout);
            if (unsubscribe) unsubscribe();
            const result = message?.result !== undefined ? message.result : message;
            resolve(result);
          },
          {
            type: "render_template",
            template: template
          }
        ).then(unsub => {
          unsubscribe = unsub;
        });
      });
    } catch (error) {
      console.warn('[MediaCard] Failed to evaluate Jinja2 template:', template, error);
      return null;
    }
  }
  
  async _evaluateAllConditions() {
    if (this._evaluatingConditions || !this.hass) return;
    this._evaluatingConditions = true;
    
    const entities = this.config.display_entities.entities || [];
    const promises = entities.map(async (entityConfig) => {
      const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
      if (!entityId) return;
      
      const condition = typeof entityConfig === 'object' ? entityConfig.condition : null;
      const result = await this._evaluateEntityCondition(condition);
      this._entityConditionCache.set(entityId, result);
    });
    
    await Promise.all(promises);
    this._evaluatingConditions = false;
    this.requestUpdate();
  }
  
  _getFilteredEntities() {
    const entities = this.config.display_entities.entities || [];
    if (entities.length === 0) return [];
    
    // Filter entities based on cached condition results
    return entities
      .map((e, index) => ({ entityId: typeof e === 'string' ? e : e.entity, index }))
      .filter(({ entityId, index }) => {
        if (!entityId) return false;
        // If entity has no condition, show it. If it has a condition but not yet evaluated, exclude it.
        const entityConfig = entities[index];
        const hasCondition = entityConfig && typeof entityConfig === 'object' && entityConfig.condition;
        if (hasCondition && !this._entityConditionCache.has(entityId)) return false;
        // If no condition, default to true (show it)
        return hasCondition ? this._entityConditionCache.get(entityId) : true;
      })
      .map(({ entityId }) => entityId);
  }
  
  _cleanupDisplayEntities() {
    if (this._entityCycleTimer) {
      clearInterval(this._entityCycleTimer);
      this._entityCycleTimer = null;
    }
    
    if (this._entityFadeTimeout) {
      clearTimeout(this._entityFadeTimeout);
      this._entityFadeTimeout = null;
    }
    
    // Cancel pending debounced evaluations
    if (this._pendingConditionEval) {
      clearTimeout(this._pendingConditionEval);
      this._pendingConditionEval = null;
    }
    
    this._entityConditionCache.clear();
    this._entityStyleCache.clear();
    this._evaluatingConditions = false;
    
    this._entityStates.clear();
    this._recentlyChangedEntities.clear();
    this._displayEntitiesVisible = false;
    this._displayEntitiesInitialized = false;
  }

  // V5.6: Clock Timer Management
  _startClockTimer() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
    }
    
    // Update every second
    this._clockTimer = setInterval(() => {
      this.requestUpdate();
    }, 1000);
    
    this._log('⏰ Started clock update timer');
  }

  _stopClockTimer() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
      this._log('⏰ Stopped clock update timer');
    }
  }
  
  // V4: Action Button Handlers
  async _handleFavoriteClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    // CRITICAL: Capture current state NOW before async operations
    const targetUri = this._currentMediaPath;
    const isFavorite = this._currentMetadata?.is_favorited || 
                       (this._burstFavoritedFiles && this._burstFavoritedFiles.includes(targetUri)) ||
                       false;
    const newState = !isFavorite;
    
    console.warn(`💗 FAVORITE CAPTURE: uri="${targetUri}", current_is_favorited=${isFavorite}, new_state=${newState}`);
    console.warn(`💗 CURRENT METADATA:`, this._currentMetadata);
    
    try {
      // V5.2: Call media_index service with media_source_uri (no path conversion needed)
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'mark_favorite',
        service_data: {
          media_source_uri: targetUri,
          is_favorite: newState
        },
        return_response: true
      };
      
      // V4: If entity_id specified, add target object
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      console.warn(`✅ Favorite toggled for ${targetUri}: ${newState}`, response);
      
      // Update current metadata
      if (this._currentMetadata) {
        this._currentMetadata.is_favorited = newState;
      }
      
      // Update panel queue item if in panel mode
      if (this._panelOpen && this._panelQueue[this._panelQueueIndex]) {
        this._panelQueue[this._panelQueueIndex].is_favorited = newState;
      }
      
      // If in burst mode AND favoriting (not unfavoriting), track for burst metadata
      if (this._panelOpen && this._panelMode === 'burst' && newState === true) {
        if (!this._burstFavoritedFiles.includes(targetUri)) {
          this._burstFavoritedFiles.push(targetUri);
          console.warn(`🎯 Added to burst favorites: ${targetUri} (${this._burstFavoritedFiles.length} total)`);
        }
      } else if (this._panelOpen && this._panelMode === 'burst' && newState === false) {
        // Remove from favorites tracking if unfavorited
        const index = this._burstFavoritedFiles.indexOf(targetUri);
        if (index !== -1) {
          this._burstFavoritedFiles.splice(index, 1);
          console.warn(`🎯 Removed from burst favorites: ${targetUri} (${this._burstFavoritedFiles.length} remaining)`);
        }
      }
      
      this.requestUpdate();
      
    } catch (error) {
      console.error('Failed to mark favorite:', error);
      alert('Failed to mark favorite: ' + error.message);
    }
  }

  // Helper method to pause the auto-advance timer
  _pauseTimer() {
    if (this._refreshInterval || this._refreshTimeout) {
      if (this._timerStartTime && this._timerIntervalMs) {
        const elapsed = Date.now() - this._timerStartTime;
        const remaining = Math.max(0, this._timerIntervalMs - elapsed);
        this._pausedRemainingMs = remaining;
        this._log(`⏸️ Pausing with ${Math.round(elapsed / 1000)}s elapsed, ${Math.round(remaining / 1000)}s remaining`);
      }
      
      if (this._refreshInterval) {
        clearInterval(this._refreshInterval);
        this._refreshInterval = null;
      }
      if (this._refreshTimeout) {
        clearTimeout(this._refreshTimeout);
        this._refreshTimeout = null;
      }
    }
  }

  // Helper method to resume the auto-advance timer
  _resumeTimer() {
    this._setupAutoRefresh();
    this._pauseLogShown = false;
  }

  // V4: Handle pause button click
  _handlePauseClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    this._setPauseState(!this._isPaused);
    
    // Stop timer when pausing, restart when resuming
    if (this._isPaused) {
      this._pauseTimer();
      this._log('🎮 PAUSED slideshow - timer stopped');
    } else {
      this._resumeTimer();
      this._log('▶️ RESUMED slideshow - timer restarted');
    }
  }
  
  // Handle debug button click - toggle debug mode dynamically
  _handleDebugButtonClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    // Toggle debug mode
    this._debugMode = !this._debugMode;
    
    // Update config.debug_mode directly (bypass setConfig to avoid defaults)
    this.config.debug_mode = this._debugMode;
    
    // Fire config-changed event to persist
    const event = new CustomEvent('config-changed', {
      detail: { config: this.config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
    
    const status = this._debugMode ? 'ENABLED' : 'DISABLED';
    console.log(`🐛 [MediaCard] Debug mode ${status} - will persist across reloads`);
    console.log(`🐛 [MediaCard] Persisted config.debug_mode:`, this.config.debug_mode);
    
    // Force re-render to update button visual state
    this.requestUpdate();
  }
  
  // Handle refresh button click - reload current media
  async _handleRefreshClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    this._log('🔄 Refresh button clicked');
    
    // Check if in folder mode - if so, trigger full queue refresh
    if (this.config?.media_source_type === 'folder') {
      this._log('🔄 Folder mode detected - triggering full queue refresh');
      await this._refreshQueue();
      return;
    }
    
    // Single media mode - reload current media URL
    this._log('🔄 Single media mode - reloading current media');
    
    // Get the current media content ID
    const currentMediaId = this.currentMedia?.media_content_id || this._currentMediaPath;
    
    if (!currentMediaId) {
      this._log('⚠️ No current media to refresh');
      return;
    }
    
    try {
      // Re-resolve the media URL to get a fresh authSig and cache-busting timestamp
      this._log('🔄 Re-resolving media URL:', currentMediaId);
      await this._resolveMediaUrl();
      
      // Add cache-busting timestamp to force browser reload
      // Note: _resolveMediaUrl already adds timestamp if auto_refresh_seconds > 0,
      // but we force it here regardless of config for manual refresh
      if (this.config?.auto_refresh_seconds > 0) {
        // Already has timestamp from _resolveMediaUrl, don't add duplicate
        this._log('Cache-busting timestamp already added by _resolveMediaUrl');
      } else {
        // No auto-refresh configured, add timestamp now
        const timestampedUrl = this._addCacheBustingTimestamp(this.mediaUrl, true);
        if (timestampedUrl !== this.mediaUrl) {
          this._log('Added cache-busting timestamp:', timestampedUrl);
          this.mediaUrl = timestampedUrl;
        }
      }
      
      // Force reload by updating the img/video src
      this._mediaLoadedLogged = false; // Allow load success log again
      this.requestUpdate();
      
      // Refresh metadata from media_index in background so overlay stays current
      this._refreshMetadata().catch(err => this._log('⚠️ Metadata refresh failed:', err));

      this._log('✅ Media refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh media:', error);
      this._log('❌ Media refresh failed:', error.message);
    }
  }
  
  // Handle info button click - toggle overlay and fetch full metadata
  async _handleInfoClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    // Toggle state
    this._showInfoOverlay = !this._showInfoOverlay;
    
    // If opening overlay and we have a file path, fetch full metadata
    // Or if overlay is already open but media changed (no cached metadata)
    if (this._showInfoOverlay && this._currentMediaPath && !this._fullMetadata) {
      try {
        // V5.2: Pass media_source_uri as-is to Media Index
        const wsCall = {
          type: 'call_service',
          domain: 'media_index',
          service: 'get_file_metadata',
          service_data: {
            media_source_uri: this._currentMediaPath
          },
          return_response: true
        };
        
        if (this.config.media_index?.entity_id) {
          wsCall.target = { entity_id: this.config.media_index.entity_id };
        }
        
        const response = await this.hass.callWS(wsCall);
        
        // Store full metadata for overlay rendering
        // V5.6: Normalize metadata structure - flatten exif fields to top level
        const rawMetadata = response.response;
        this._fullMetadata = {
          ...rawMetadata,
          // Flatten exif.date_taken to top level if it exists
          date_taken: rawMetadata.date_taken || rawMetadata.exif?.date_taken,
          latitude: rawMetadata.latitude || rawMetadata.exif?.latitude,
          longitude: rawMetadata.longitude || rawMetadata.exif?.longitude,
          location_name: rawMetadata.location_name || rawMetadata.exif?.location_name,
          location_city: rawMetadata.location_city || rawMetadata.exif?.location_city,
          location_state: rawMetadata.location_state || rawMetadata.exif?.location_state,
          location_country: rawMetadata.location_country || rawMetadata.exif?.location_country,
          camera_make: rawMetadata.camera_make || rawMetadata.exif?.camera_make,
          camera_model: rawMetadata.camera_model || rawMetadata.exif?.camera_model,
          is_favorited: rawMetadata.is_favorited ?? rawMetadata.exif?.is_favorited,
          rating: rawMetadata.rating ?? rawMetadata.exif?.rating
        };
        this._log('📊 Fetched full metadata for info overlay:', this._fullMetadata);
        
      } catch (error) {
        console.error('Failed to fetch metadata:', error);
        this._fullMetadata = this._currentMetadata; // Fallback to basic metadata
      }
    }
    
    this.requestUpdate();
    this._log(`ℹ️ ${this._showInfoOverlay ? 'SHOWING' : 'HIDING'} info overlay`);
  }
  
  // V5.6: Queue Preview button handler
  async _handleQueueClick() {
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (this._panelMode === 'queue') {
      // Exit queue preview mode
      await this._exitPanelMode();
    } else {
      // If in burst mode, exit it first before entering queue preview
      if (this._panelMode === 'burst') {
        await this._exitPanelMode();
      }
      // Enter queue preview mode
      await this._enterQueuePreviewMode();
    }
  }

  // V5.5: Burst button handler - toggle burst review mode
  async _handleBurstClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (this._panelOpen && this._panelMode === 'burst') {
      // Exit panel mode (will call _exitPanelMode)
      this._exitBurstMode();
    } else if (this._burstMode) {
      // DEPRECATED path: Exit old burst mode
      this._exitBurstMode();
    } else {
      // Capture media path snapshot NOW before any auto-advance can change it
      const mediaPathSnapshot = this._currentMediaPath;
      
      // Enter burst mode with captured snapshot
      await this._enterBurstMode(mediaPathSnapshot);
    }
  }

  async _handleRelatedClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (this._panelOpen && this._panelMode === 'related') {
      // Exit related photos mode
      this._exitRelatedMode();
    } else {
      // Capture metadata snapshot NOW before any auto-advance can change it
      const metadataSnapshot = { ...this._currentMetadata };
      const mediaPathSnapshot = this._currentMediaPath;
      
      // Enter related photos mode with captured snapshot
      await this._enterRelatedMode(metadataSnapshot, mediaPathSnapshot);
    }
  }

  async _handleOnThisDayClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (this._panelOpen && this._panelMode === 'on_this_day') {
      // Exit on this day mode
      this._exitOnThisDayMode();
    } else {
      // Enter on this day mode (uses today's date, no snapshot needed)
      await this._enterOnThisDayMode();
    }
  }

  /**
   * Handle window size change for On This Day mode
   */
  async _handleWindowSizeChange(e) {
    const newWindow = parseInt(e.target.value, 10);
    this._onThisDayWindowDays = newWindow;
    
    // Re-query with new window size
    await this._enterOnThisDayMode();
  }
  
  // Helper to fetch full metadata asynchronously (called from render when overlay is open)
  async _fetchFullMetadataAsync() {
    // Prevent duplicate fetches
    if (this._fetchingMetadata) return;
    this._fetchingMetadata = true;
    
    try {
      // V5.2: Pass media_source_uri as-is to Media Index
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_file_metadata',
        service_data: {
          media_source_uri: this._currentMediaPath
        },
        return_response: true
      };
      
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      // Store full metadata and trigger re-render
      this._fullMetadata = response.response;
      this._log('📊 Auto-fetched full metadata for open info overlay:', this._fullMetadata);
      this.requestUpdate();
      
    } catch (error) {
      console.error('Failed to auto-fetch metadata:', error);
      this._fullMetadata = this._currentMetadata; // Fallback to basic metadata
      this.requestUpdate();
    } finally {
      this._fetchingMetadata = false;
    }
  }
  
  async _handleDeleteClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    // V4 PATTERN: Capture path at button click time to prevent wrong file deletion
    // if slideshow auto-advances while confirmation dialog is open
    const targetPath = this._currentMediaPath;
    const filename = this._currentMetadata?.filename || targetPath.split('/').pop();
    
    // Get actual thumbnail from media browser
    const thumbnailUrl = await this._getMediaThumbnail(targetPath);
    
    this._showDeleteConfirmation(targetPath, thumbnailUrl, filename);
  }

  // V5.2: _convertToFilesystemPath removed - Media Index v1.1.0+ accepts media_source_uri directly
  // No path conversion needed anymore
  
  // Get thumbnail URL from media browser (same as used in file picker)
  async _getMediaThumbnail(filePath) {
    this._log('🖼️ Getting thumbnail for:', filePath);
    
    try {
      // Convert filesystem path to media_content_id
      const mediaContentId = filePath.startsWith('media-source://') 
        ? filePath 
        : `media-source://media_source${filePath}`;
      
      this._log('📞 Calling resolve_media for:', mediaContentId);
      
      // Use resolve_media to get the signed URL (same as media browser)
      const response = await this.hass.callWS({
        type: "media_source/resolve_media",
        media_content_id: mediaContentId,
        expires: 3600
      });
      
      if (response?.url) {
        this._log('✅ Got thumbnail URL from resolve_media:', response.url);
        return response.url;
      }
      
      this._log('⚠️ No URL in resolve_media response');
    } catch (err) {
      this._log('❌ Failed to get thumbnail:', err);
    }
    
    // Return null instead of fallback - let dialog handle it
    this._log('⚠️ Returning null - no thumbnail available');
    return null;
  }
  
  async _showDeleteConfirmation(targetPath, thumbnailUrl, filename) {
    if (!targetPath) return;
    
    // V4 PATTERN: Use captured values, not current state
    // Detect if this is a video based on file extension
    const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(filename);
    
    // Construct the destination path for display
    // Extract the root path from the media_path config
    const rootPath = this.config?.media_path || this.config?.folder?.path || '';
    // Strip media-source:// prefix if present
    const cleanRootPath = rootPath.replace('media-source://media_source', '');
    const destinationPath = `${cleanRootPath}/_Junk/${filename}`;
    
    this._log('🖼️ THUMBNAIL DIAGNOSTIC:');
    this._log('  - thumbnailUrl:', thumbnailUrl);
    this._log('  - isVideo:', isVideo);
    this._log('  - panel mode:', this.hasAttribute('panel'));
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-overlay';
    dialog.innerHTML = `
      <div class="delete-confirmation-content">
        <h3>Delete Media?</h3>
        ${!isVideo ? `
        <div class="delete-thumbnail">
          ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="Preview">` : '<div style="padding: 40px; opacity: 0.5;">Loading preview...</div>'}
        </div>
        ` : ''}
        <p><strong>File:</strong> ${filename}</p>
        <p><strong>Moving to:</strong> ${destinationPath}</p>
        <div class="delete-actions">
          <button class="cancel-btn">Cancel</button>
          <button class="confirm-btn">Move to _Junk</button>
        </div>
      </div>
    `;
    
    // Add to card
    const cardElement = this.shadowRoot.querySelector('.card');
    cardElement.appendChild(dialog);
    
    // Handle cancel
    const cancelBtn = dialog.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      dialog.remove();
    });
    
    // Handle confirm - pass captured targetPath to perform delete
    const confirmBtn = dialog.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      dialog.remove();
      await this._performDelete(targetPath);
    });
  }
  
  async _performDelete(targetUri) {
    if (!targetUri || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    try {
      this._log('🗑️ Deleting file:', targetUri);
      
      // V5.2: Call media_index service with media_source_uri (no path conversion needed)
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'delete_media',
        service_data: {
          media_source_uri: targetUri
        },
        return_response: true
      };
      
      // V4: Target specific entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: this.config.media_index.entity_id
        };
      }
      
      await this.hass.callWS(wsCall);
      
      this._log('✅ Media deleted successfully');
      
      // V4 CODE REUSE: Remove file from history and exclude from future queries
      // Same logic as _performEdit - prevent showing deleted files
      
      // Add to provider's exclusion list (use captured targetUri for exclusion)
      if (this.provider && this.provider.excludedFiles) {
        this.provider.excludedFiles.add(targetUri);
        this._log(`📝 Added to provider exclusion list: ${targetUri}`);
      }
      
      // V5.3: Remove from navigation queue (use captured targetUri)
      const navIndex = this.navigationQueue.findIndex(item => item.media_content_id === targetUri);
      if (navIndex >= 0) {
        this.navigationQueue.splice(navIndex, 1);
        // Adjust navigation index if we removed an earlier item or current item
        if (navIndex <= this.navigationIndex) {
          this.navigationIndex--;
        }
        this._log(`📚 Removed from navigation queue at index ${navIndex} (${this.navigationQueue.length} remaining)`);
      }
      
      // V5.5: Remove from panel queue if in panel mode
      if (this._panelOpen && this._panelQueue.length > 0) {
        // Also remove from saved main queue to prevent 404 on exit
        const mainIndex = this._mainQueue.findIndex(item => item.media_content_id === targetUri);
        if (mainIndex >= 0) {
          this._mainQueue.splice(mainIndex, 1);
          // Adjust saved index if we removed an earlier item
          if (mainIndex <= this._mainQueueIndex) {
            this._mainQueueIndex--;
          }
          this._log(`🗑️ Removed from saved main queue at index ${mainIndex}`);
        }
        
        const panelIndex = this._panelQueue.findIndex(item => {
          const itemUri = item.media_source_uri || item.path;
          return itemUri === targetUri || `media-source://media_source${item.path}` === targetUri;
        });
        if (panelIndex >= 0) {
          this._panelQueue.splice(panelIndex, 1);
          this._log(`🗑️ Removed from panel queue at index ${panelIndex} (${this._panelQueue.length} remaining)`);
          
          // If we deleted the current panel item, advance to next
          if (panelIndex === this._panelQueueIndex) {
            if (this._panelQueue.length === 0) {
              // No more items in panel, exit panel mode
              this._exitPanelMode();
              return; // Don't call _loadNext, _exitPanelMode handles it
            } else {
              // Load next panel item (or wrap to first if we were at end)
              const nextIndex = panelIndex < this._panelQueue.length ? panelIndex : 0;
              await this._loadPanelItem(nextIndex);
              return; // Don't call _loadNext, stay in panel
            }
          } else if (panelIndex < this._panelQueueIndex) {
            // Deleted an earlier item, adjust current index
            this._panelQueueIndex--;
            this.requestUpdate();
            return; // Don't advance, stay on current
          } else {
            // Deleted a later item, just update display
            this.requestUpdate();
            return; // Don't advance, stay on current
          }
        }
      }
      
      // Advance to next media after delete (only if not in panel mode)
      await this._loadNext();
      
    } catch (error) {
      console.error('Failed to delete media:', error);
      alert('Failed to delete media: ' + error.message);
    }
  }
  
  async _handleEditClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    // V4 PATTERN: Capture path at button click time to prevent wrong file being marked
    // if slideshow auto-advances while confirmation dialog is open
    const targetPath = this._currentMediaPath;
    const filename = this._currentMetadata?.filename || targetPath.split('/').pop();
    
    // Get actual thumbnail from media browser
    const thumbnailUrl = await this._getMediaThumbnail(targetPath);
    
    this._showEditConfirmation(targetPath, thumbnailUrl, filename);
  }
  
  _handleFullscreenButtonClick(e) {
    e.stopPropagation();
    
    // Restart timer on touch (gives user full time to choose next action)
    if (this._showButtonsExplicitly) {
      this._startActionButtonsHideTimer();
    }
    
    // Detect if current media is video
    const isVideo = this.currentMedia?.media_content_type?.startsWith('video') || 
                    MediaUtils.detectFileType(this.currentMedia?.media_content_id || this.currentMedia?.title || this.mediaUrl) === 'video';
    
    // Get the media element (image or video)
    const mediaElement = isVideo 
      ? this.shadowRoot.querySelector('.media-container video')
      : this.shadowRoot.querySelector('.media-container img');
    
    if (!mediaElement) return;
    
    // Always pause slideshow when entering fullscreen (for examination)
    this._fullscreenWasPaused = this._isPaused;
    
    if (!this._isPaused) {
      this._setPauseState(true);
    }
    
    // Create exit button with inline styles
    const exitButton = document.createElement('button');
    exitButton.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      border: none;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      color: white;
      font-size: 24px;
      cursor: pointer;
      z-index: 10000;
      backdrop-filter: blur(4px);
      transition: background 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    exitButton.innerHTML = '✕';
    exitButton.onmouseover = () => exitButton.style.background = 'rgba(0, 0, 0, 0.85)';
    exitButton.onmouseout = () => exitButton.style.background = 'rgba(0, 0, 0, 0.7)';
    exitButton.onclick = (e) => {
      e.stopPropagation();
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    };
    
    // Wrap the media element in a container for fullscreen
    const fullscreenContainer = document.createElement('div');
    fullscreenContainer.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--primary-background-color);
    `;
    
    // Store original location to restore later
    const parent = mediaElement.parentNode;
    const nextSibling = mediaElement.nextSibling;
    
    // Store original styles to restore later
    const originalMaxHeight = mediaElement.style.maxHeight;
    const originalMaxWidth = mediaElement.style.maxWidth;
    const originalWidth = mediaElement.style.width;
    const originalHeight = mediaElement.style.height;
    const originalObjectFit = mediaElement.style.objectFit;
    
    // Override styles for fullscreen display - remove max-height constraint
    mediaElement.style.maxHeight = '100vh';
    mediaElement.style.maxWidth = '100vw';
    mediaElement.style.width = 'auto';
    mediaElement.style.height = 'auto';
    mediaElement.style.objectFit = 'contain';
    
    // Move media element into container temporarily
    fullscreenContainer.appendChild(mediaElement);
    fullscreenContainer.appendChild(exitButton);
    document.body.appendChild(fullscreenContainer);
    
    // Request fullscreen on the container
    const requestFullscreen = fullscreenContainer.requestFullscreen || 
                             fullscreenContainer.webkitRequestFullscreen || 
                             fullscreenContainer.msRequestFullscreen;
    
    if (requestFullscreen) {
      requestFullscreen.call(fullscreenContainer).then(() => {
        this._log('Fullscreen entered, exit button added');
      }).catch(err => {
        console.error('Fullscreen request failed:', err);
        // Restore original styles on failure
        mediaElement.style.maxHeight = originalMaxHeight;
        mediaElement.style.maxWidth = originalMaxWidth;
        mediaElement.style.width = originalWidth;
        mediaElement.style.height = originalHeight;
        mediaElement.style.objectFit = originalObjectFit;
        // Restore media element on failure
        if (nextSibling) {
          parent.insertBefore(mediaElement, nextSibling);
        } else {
          parent.appendChild(mediaElement);
        }
        if (fullscreenContainer.parentNode) {
          document.body.removeChild(fullscreenContainer);
        }
      });
      
      // Exit handler to cleanup and resume slideshow
      const exitFullscreenHandler = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
          // Restore original styles
          mediaElement.style.maxHeight = originalMaxHeight;
          mediaElement.style.maxWidth = originalMaxWidth;
          mediaElement.style.width = originalWidth;
          mediaElement.style.height = originalHeight;
          mediaElement.style.objectFit = originalObjectFit;
          
          // Restore media element to original location
          if (nextSibling) {
            parent.insertBefore(mediaElement, nextSibling);
          } else {
            parent.appendChild(mediaElement);
          }
          
          // Remove fullscreen container
          if (fullscreenContainer.parentNode) {
            document.body.removeChild(fullscreenContainer);
          }
          
          // Resume slideshow if needed
          if (!this._fullscreenWasPaused && this._isPaused) {
            this._setPauseState(false);
          }
          
          document.removeEventListener('fullscreenchange', exitFullscreenHandler);
          document.removeEventListener('webkitfullscreenchange', exitFullscreenHandler);
          document.removeEventListener('MSFullscreenChange', exitFullscreenHandler);
        }
      };
      
      document.addEventListener('fullscreenchange', exitFullscreenHandler);
      document.addEventListener('webkitfullscreenchange', exitFullscreenHandler);
      document.addEventListener('MSFullscreenChange', exitFullscreenHandler);
    }
  }
  
  async _showEditConfirmation(targetPath, thumbnailUrl, filename) {
    if (!targetPath) return;
    
    // V4 PATTERN: Use captured values, not current state
    // Detect if this is a video based on file extension
    const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(filename);
    
    // Construct the destination path for display
    // Extract the root path from the media_path config
    const rootPath = this.config?.media_path || this.config?.folder?.path || '';
    // Strip media-source:// prefix if present
    const cleanRootPath = rootPath.replace('media-source://media_source', '');
    const destinationPath = `${cleanRootPath}/_Edit/${filename}`;
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-overlay'; // Reuse delete dialog styles
    dialog.innerHTML = `
      <div class="delete-confirmation-content">
        <h3>Mark for Editing?</h3>
        ${!isVideo ? `
        <div class="delete-thumbnail">
          <img src="${thumbnailUrl}" alt="Preview">
        </div>
        ` : ''}
        <p><strong>File:</strong> ${filename}</p>
        <p><strong>Moving to:</strong> ${destinationPath}</p>
        <div class="delete-actions">
          <button class="cancel-btn">Cancel</button>
          <button class="confirm-btn">Move to _Edit</button>
        </div>
      </div>
    `;
    
    // Add to card
    const cardElement = this.shadowRoot.querySelector('.card');
    cardElement.appendChild(dialog);
    
    // Handle cancel
    const cancelBtn = dialog.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      dialog.remove();
    });
    
    // Handle confirm - pass captured targetPath to perform edit
    const confirmBtn = dialog.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      dialog.remove();
      await this._performEdit(targetPath);
    });
  }
  
  async _performEdit(targetUri) {
    if (!targetUri || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    try {
      this._log('✏️ Marking file for edit:', targetUri);
      
      // V5.2: Call media_index service with media_source_uri (no path conversion needed)
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'mark_for_edit',
        service_data: {
          media_source_uri: targetUri,
          mark_for_edit: true
        },
        return_response: true
      };
      
      // V4: Target specific entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: this.config.media_index.entity_id
        };
      }
      
      await this.hass.callWS(wsCall);
      
      this._log('✅ File marked for editing');
      
      // V5.3: Remove file from navigation queue and exclude from future queries
      
      // Add to provider's exclusion list to prevent reappearance (use captured targetUri)
      if (this.provider && this.provider.excludedFiles) {
        this.provider.excludedFiles.add(targetUri);
        this._log(`📝 Added to provider exclusion list: ${targetUri}`);
      }
      
      // V5.3: Remove from navigation queue (use captured targetUri)
      const navIndex = this.navigationQueue.findIndex(item => item.media_content_id === targetUri);
      if (navIndex >= 0) {
        this.navigationQueue.splice(navIndex, 1);
        // Adjust navigation index if we removed an earlier item or current item
        if (navIndex <= this.navigationIndex) {
          this.navigationIndex--;
        }
        this._log(`📚 Removed from navigation queue at index ${navIndex} (${this.navigationQueue.length} remaining)`);
      }
      
      // V5.5: Remove from panel queue if in panel mode
      if (this._panelOpen && this._panelQueue.length > 0) {
        // Also remove from saved main queue to prevent 404 on exit
        const mainIndex = this._mainQueue.findIndex(item => item.media_content_id === targetUri);
        if (mainIndex >= 0) {
          this._mainQueue.splice(mainIndex, 1);
          // Adjust saved index if we removed an earlier item
          if (mainIndex <= this._mainQueueIndex) {
            this._mainQueueIndex--;
          }
          this._log(`✏️ Removed from saved main queue at index ${mainIndex}`);
        }
        
        const panelIndex = this._panelQueue.findIndex(item => {
          const itemUri = item.media_source_uri || item.path;
          return itemUri === targetUri || `media-source://media_source${item.path}` === targetUri;
        });
        if (panelIndex >= 0) {
          this._panelQueue.splice(panelIndex, 1);
          this._log(`✏️ Removed from panel queue at index ${panelIndex} (${this._panelQueue.length} remaining)`);
          
          // If we edited the current panel item, advance to next
          if (panelIndex === this._panelQueueIndex) {
            if (this._panelQueue.length === 0) {
              // No more items in panel, exit panel mode
              this._exitPanelMode();
              return; // Don't call _loadNext, _exitPanelMode handles it
            } else {
              // Load next panel item (or wrap to first if we were at end)
              const nextIndex = panelIndex < this._panelQueue.length ? panelIndex : 0;
              await this._loadPanelItem(nextIndex);
              return; // Don't call _loadNext, stay in panel
            }
          } else if (panelIndex < this._panelQueueIndex) {
            // Edited an earlier item, adjust current index
            this._panelQueueIndex--;
            this.requestUpdate();
            return; // Don't advance, stay on current
          } else {
            // Edited a later item, just update display
            this.requestUpdate();
            return; // Don't advance, stay on current
          }
        }
      }
      
      // V4 CODE: Automatically advance to next media (line 6030-6032) (only if not in panel mode)
      await this._loadNext();
      
    } catch (error) {
      console.error('Failed to mark for edit:', error);
      alert('Failed to mark for edit: ' + error.message);
    }
  }
  
  // V5.5: Burst Review Mode Helper Methods (At This Moment feature)
  
  /**
   * Enter burst review mode - query service and display side panel
   */
  async _enterBurstMode(mediaPathSnapshot) {
    if (!mediaPathSnapshot || !MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('Cannot enter burst mode: no current media or media_index inactive');
      return;
    }
    
    // Show loading state
    this._panelLoading = true;
    this._burstLoading = true; // DEPRECATED: For compatibility
    this.requestUpdate();
    
    try {
      // Save main queue state
      this._mainQueue = [...this.navigationQueue];
      this._mainQueueIndex = this.navigationIndex;
      
      // Save previous panel mode to restore after burst closes
      this._previousPanelMode = this._panelMode; // Could be 'queue' or null
      
      // Call media_index.get_related_files service with burst mode
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_related_files',
        service_data: {
          mode: 'burst',
          media_source_uri: mediaPathSnapshot, // Use SNAPSHOT not current state
          time_window_seconds: 15, // ±15 seconds for tighter burst grouping
          prefer_same_location: true,
          location_tolerance_meters: 20, // ~20m walking distance in 30 seconds
          sort_order: 'time_asc'
        },
        return_response: true
      };
      
      // Target specific entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      console.warn('🎥 Burst photos response:', response);
      console.warn('🎥 First item:', response.response?.items?.[0]);
      
      // Store panel queue - items already have media_source_uri from backend
      const rawItems = response.response?.items || [];
      this._panelQueue = rawItems;
      this._panelQueueIndex = 0; // Start with first photo in burst
      this._panelMode = 'burst';
      this._panelOpen = true;
      
      // Store burst-specific state
      this._burstReferencePhoto = {
        path: this._currentMediaPath,
        metadata: { ...this._currentMetadata }
      };
      this._burstAllFiles = [...this._panelQueue]; // Track for metadata update
      
      // Initialize favorites from existing metadata
      this._burstFavoritedFiles = this._panelQueue
        .filter(item => item.is_favorited || item.rating >= 4)
        .map(item => item.media_source_uri || item.path);
      
      console.warn(`📸 Burst panel loaded: ${this._panelQueue.length} files, ${this._burstFavoritedFiles.length} pre-favorited`);
      
      // Deprecated state (for compatibility)
      this._burstPhotos = this._panelQueue;
      this._burstCurrentIndex = this._panelQueueIndex;
      this._burstMode = true;
      
      // Initialize paging for burst panel
      this._panelPageStartIndex = 0;
      
      // Load first burst photo
      if (this._panelQueue.length > 0) {
        await this._loadPanelItem(0);
      }
      
      // Pause auto-advance while in burst mode
      if (!this._isPaused) {
        this._setPauseState(true);
      }
      
      console.warn(`✅ Entered burst mode with ${this._panelQueue.length} photos`);
      
    } catch (error) {
      console.error('Failed to enter burst mode:', error);
      alert('Failed to load burst photos: ' + error.message);
    } finally {
      this._panelLoading = false;
      this._burstLoading = false;
      this.requestUpdate();
    }
  }

  async _enterRelatedMode(metadataSnapshot, mediaPathSnapshot) {
    if (!mediaPathSnapshot || !MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('Cannot enter related photos mode: no current media or media_index inactive');
      return;
    }
    
    // Show loading state
    this._panelLoading = true;
    this._relatedLoading = true;
    this.requestUpdate();
    
    try {
      // Save main queue state
      this._mainQueue = [...this.navigationQueue];
      this._mainQueueIndex = this.navigationIndex;
      
      // Save previous panel mode to restore after related closes
      this._previousPanelMode = this._panelMode;
      
      // Extract date from SNAPSHOT metadata (not current, which may have changed)
      const currentDate = metadataSnapshot?.date_taken || metadataSnapshot?.created_time;
      if (!currentDate) {
        throw new Error('No date available for current photo');
      }
      
      // Format as YYYY-MM-DD for service call (handle string, Date object, or Unix timestamp)
      let dateStr;
      if (typeof currentDate === 'number') {
        // Unix timestamp - convert to Date first
        const dateObj = new Date(currentDate * 1000); // Convert seconds to milliseconds
        dateStr = dateObj.toISOString().split('T')[0];
      } else if (typeof currentDate === 'string') {
        dateStr = currentDate.split('T')[0]; // Get just the date part
      } else if (currentDate instanceof Date) {
        dateStr = currentDate.toISOString().split('T')[0];
      } else {
        dateStr = String(currentDate).split('T')[0];
      }
      
      console.warn(`📅 Using date: ${dateStr} from metadata (original: ${currentDate})`);
      
      // Call media_index.get_random_items with date filtering
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_random_items',
        service_data: {
          count: 100, // Get up to 100 photos from this day
          date_from: dateStr,
          date_to: dateStr
        },
        return_response: true
      };
      
      // Target specific entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      console.warn('📅 Related photos response:', response);
      console.warn('📅 First item:', response.response?.items?.[0]);
      
      // Store panel queue and sort by time
      const rawItems = response.response?.items || [];
      
      // Sort by date_taken or created_time (chronological order)
      const sortedItems = rawItems.sort((a, b) => {
        const timeA = String(a.date_taken || a.created_time || '');
        const timeB = String(b.date_taken || b.created_time || '');
        return timeA.localeCompare(timeB);
      });
      
      this._panelQueue = sortedItems;
      this._panelQueueIndex = 0;
      this._panelMode = 'related';
      this._panelOpen = true;
      
      console.warn(`📸 Related photos panel loaded: ${this._panelQueue.length} files`);
      
      // Initialize paging for related panel
      this._panelPageStartIndex = 0;
      
      // Load first related photo
      if (this._panelQueue.length > 0) {
        await this._loadPanelItem(0);
      }
      
      // Pause auto-advance while in related mode
      if (!this._isPaused) {
        this._setPauseState(true);
      }
      
      console.warn(`✅ Entered related photos mode with ${this._panelQueue.length} photos`);
      
    } catch (error) {
      console.error('Failed to enter related photos mode:', error);
      alert('Failed to load related photos: ' + error.message);
    } finally {
      this._panelLoading = false;
      this._relatedLoading = false;
      this.requestUpdate();
    }
  }

  async _enterQueuePreviewMode() {
    if (!this.navigationQueue || this.navigationQueue.length === 0) {
      console.warn('Cannot enter queue preview: no items in queue');
      return;
    }

    // Show loading state
    this._panelLoading = true;
    this.requestUpdate();

    try {
      // Queue preview doesn't need to save/restore queue - it reads directly from navigationQueue
      // No need for _panelQueue - we'll reference navigationQueue directly
      
      this._panelMode = 'queue';
      this._panelOpen = true;
      
      // Initialize paging for queue preview
      // V5.7: Use pending index if available (syncs with deferred navigation updates)
      const currentIndex = this._pendingNavigationIndex ?? this.navigationIndex;
      this._panelPageStartIndex = currentIndex;
      
      // Load current item to show in panel
      const currentItem = this.navigationQueue[currentIndex];
      if (currentItem) {
        // Current item is already loaded, just open panel
        console.warn(`📋 Queue preview opened: ${this.navigationQueue.length} items, current position ${currentIndex + 1}`);
      }
      
    } catch (error) {
      console.error('Failed to enter queue preview mode:', error);
      alert('Failed to open queue preview: ' + error.message);
    } finally {
      this._panelLoading = false;
      this.requestUpdate();
    }
  }
  
  _exitRelatedMode() {
    console.warn('🚪 Exiting related photos mode');
    this._exitPanelMode();
  }

  /**
   * Enter "On This Day" mode - show photos from today's date across all years
   */
  async _enterOnThisDayMode() {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('Cannot enter On This Day mode: media_index inactive');
      return;
    }
    
    // Show loading state
    this._panelLoading = true;
    this._onThisDayLoading = true;
    this.requestUpdate();
    
    try {
      // Save main queue state
      this._mainQueue = [...this.navigationQueue];
      this._mainQueueIndex = this.navigationIndex;
      
      // Save previous panel mode to restore after closing
      this._previousPanelMode = this._panelMode;
      
      // Get today's month and day
      const today = new Date();
      const month = String(today.getMonth() + 1); // 1-12
      const day = String(today.getDate()); // 1-31
      
      // Use current window setting (default 0 = exact match)
      const windowDays = this._onThisDayWindowDays || 0;
      
      console.warn(`📅 Querying On This Day: month=${month}, day=${day}, window=±${windowDays} days`);
      
      // Call media_index.get_random_items with anniversary parameters
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_random_items',
        service_data: {
          count: 100, // Get up to 100 photos from this day across years
          anniversary_month: month,
          anniversary_day: day,
          anniversary_window_days: windowDays
        },
        return_response: true
      };
      
      // Target specific entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      console.warn('📅 On This Day response:', response);
      
      const items = response.response?.items || [];
      
      // Sort results chronologically by year (oldest to newest)
      items.sort((a, b) => {
        const timeA = a.date_taken || a.created_time;
        const timeB = b.date_taken || b.created_time;
        return String(timeA).localeCompare(String(timeB));
      });
      
      console.warn(`📅 Found ${items.length} photos from ${month}/${day} across years (window: ±${windowDays})`);
      
      // Enter panel mode (even if 0 results - user can adjust window)
      this._panelMode = 'on_this_day';
      this._panelOpen = true;
      this._panelQueue = items;
      this._panelQueueIndex = 0;
      this._panelPageStartIndex = 0; // Start at beginning
      this._panelLoading = false;
      this._onThisDayLoading = false;
      
      this.requestUpdate();
      
    } catch (error) {
      console.error('Failed to enter On This Day mode:', error);
      this._panelLoading = false;
      this._onThisDayLoading = false;
      this.requestUpdate();
    }
  }

  /**
   * Exit On This Day mode
   */
  _exitOnThisDayMode() {
    console.warn('🚪 Exiting On This Day mode');
    this._exitPanelMode();
  }

  /**
   * Exit panel mode - restore main queue and handle burst metadata updates
   */
  async _exitPanelMode() {
    console.warn(`🚪 Exiting panel mode: ${this._panelMode}, burstAllFiles: ${this._burstAllFiles?.length || 0}`);
    
    try {
      // Handle burst-specific exit actions - always save metadata to record burst_count
      if (this._panelMode === 'burst' && this._burstAllFiles && this._burstAllFiles.length > 0) {
        console.warn(`💾 Writing burst metadata to ${this._burstAllFiles.length} files (${this._burstFavoritedFiles?.length || 0} favorited)`);
        
        // Call update_burst_metadata service
        try {
          const wsCall = {
            type: 'call_service',
            domain: 'media_index',
            service: 'update_burst_metadata',
            service_data: {
              burst_files: this._burstAllFiles.map(item => item.media_source_uri || item.path),
              favorited_files: this._burstFavoritedFiles  // Already URIs from _handleFavoriteClick
            },
            return_response: true
          };
          
          if (this.config.media_index?.entity_id) {
            wsCall.target = { entity_id: this.config.media_index.entity_id };
          }
          
          const response = await this.hass.callWS(wsCall);
          console.warn('✅ Burst metadata saved:', `${response.response.files_updated} files, ${response.response.favorites_count} favorited`);
        } catch (metadataError) {
          console.error('Failed to update burst metadata:', metadataError);
          // Don't block exit on metadata failure
        }
      }
      
      // Restore main queue state
      if (this._mainQueue && this._mainQueue.length > 0) {
        this.navigationQueue = [...this._mainQueue];
        this.navigationIndex = this._mainQueueIndex;
        
        // Restore the media item we were on before entering panel
        const restoredItem = this.navigationQueue[this.navigationIndex];
        if (restoredItem) {
          // Properly restore display state (same as _loadNext)
          this.currentMedia = restoredItem;
          this._currentMediaPath = restoredItem.media_content_id;
          this._currentMetadata = restoredItem.metadata || null;
          
          // Clear caches
          this._fullMetadata = null;
          this._folderDisplayCache = null;
          
          // Resolve media URL to update display
          await this._resolveMediaUrl();
          
          console.warn(`↩️ Restored main queue position ${this.navigationIndex + 1}/${this.navigationQueue.length}`);
        }
      }
      
      // Clear panel state (but might restore queue panel below)
      const previousPanelMode = this._previousPanelMode;
      this._panelOpen = false;
      this._panelMode = null;
      this._panelQueue = [];
      this._panelQueueIndex = 0;
      this._panelLoading = false;
      
      // Clear burst-specific state
      this._burstReferencePhoto = null;
      this._burstAllFiles = [];
      this._burstFavoritedFiles = [];
      
      // Clear deprecated state
      this._burstMode = false;
      this._burstPhotos = [];
      this._burstCurrentIndex = 0;
      
      // Clear saved main queue
      this._mainQueue = [];
      this._mainQueueIndex = 0;
      this._previousPanelMode = null;
      
      // Restore previous panel mode if we were in queue preview before burst
      if (previousPanelMode === 'queue') {
        this._panelMode = 'queue';
        this._panelOpen = true;
        console.warn('↩️ Restored queue preview panel after burst review');
      }
      
      // Resume auto-advance if it was paused for panel mode (but not if we restored queue panel)
      if (this._isPaused && this._panelMode !== 'queue') {
        this._setPauseState(false);
      }
      
      this.requestUpdate();
      console.warn('✅ Panel mode exited, main queue restored');
      
    } catch (error) {
      console.error('Error exiting panel mode:', error);
      // Force cleanup on error
      this._panelOpen = false;
      this._panelMode = null;
      this.requestUpdate();
    }
  }
  
  /**
   * V5.6: Check if file path/URL is a video
   */
  _isVideoFile(path) {
    if (!path) return false;
    return MediaUtils.detectFileType(path) === 'video';
  }
  
  /**
   * V5.6: Check if item is a video file
   */
  _isVideoItem(item) {
    if (!item) return false;
    const path = item.media_content_id || item.path || '';
    return this._isVideoFile(path);
  }
  
  /**
   * V5.6: Check if video thumbnail is loaded
   */
  _isVideoThumbnailLoaded(item) {
    const cacheKey = item.media_content_id || item.path;
    return this._videoThumbnailCache.has(cacheKey);
  }
  
  /**
   * V5.6: Handle video thumbnail loaded event
   */
  _handleVideoThumbnailLoaded(e, item) {
    const videoElement = e.target;
    const cacheKey = item.media_content_id || item.path;
    
    // Mark as loaded in cache (video element stays rendered)
    this._videoThumbnailCache.set(cacheKey, true);
    
    // Mark as loaded for CSS styling
    videoElement.dataset.loaded = 'true';
  }
  
  /**
   * Page through queue preview thumbnails
   * @param {string} direction - 'prev' or 'next'
   */
  _pageQueueThumbnails(direction) {
    // Works for queue, burst, related, on_this_day, and history modes
    if (!['queue', 'burst', 'related', 'on_this_day', 'history'].includes(this._panelMode)) return;

    const oldIndex = this._panelPageStartIndex || 0;
    const items = this._panelMode === 'queue' ? this.navigationQueue : this._panelQueue;
    const totalLength = items?.length || 0;

    // V5.6: Use same calculation as _renderThumbnailStrip for consistency
    const maxDisplay = this._calculateOptimalThumbnailCount(items);

    if (direction === 'prev') {
      if (this._panelMode === 'queue' && this._panelPageStartIndex === 0) {
        // Queue mode: wrap to last page
        const maxStartIndex = Math.max(0, totalLength - maxDisplay);
        this._panelPageStartIndex = maxStartIndex;
      } else {
        this._panelPageStartIndex = Math.max(0, this._panelPageStartIndex - maxDisplay);
      }
    } else if (direction === 'next') {
      const maxStartIndex = Math.max(0, totalLength - maxDisplay);
      const newIndex = this._panelPageStartIndex + maxDisplay;
      if (this._panelMode === 'queue' && this._panelPageStartIndex >= maxStartIndex && maxStartIndex > 0) {
        // Queue mode: we're on the last page, wrap to beginning
        this._panelPageStartIndex = 0;
      } else {
        this._panelPageStartIndex = Math.min(maxStartIndex, newIndex);
      }
    }

    // Mark that user manually paged - don't auto-adjust until they navigate
    this._manualPageChange = true;
    
    this.requestUpdate();
  }
  
  /**
   * DEPRECATED: Use _exitPanelMode() instead
   * Exit burst review mode - restore original state
   */
  _exitBurstMode() {
    return this._exitPanelMode();
  }
  
  /**
   * Select a photo from burst panel - swap to main display
   * @param {number} index - Index in _burstPhotos array
   */
  async _selectBurstPhoto(index) {
    if (!this._burstMode || !this._burstPhotos || index < 0 || index >= this._burstPhotos.length) {
      console.warn(`Invalid burst photo selection: index=${index}, photos=${this._burstPhotos?.length}`);
      return;
    }
    
    const selectedPhoto = this._burstPhotos[index];
    console.warn(`📸 Selected burst photo ${index + 1}/${this._burstPhotos.length}: ${selectedPhoto.path}`);
    
    // Update current media to selected photo
    this._currentMediaPath = selectedPhoto.path;
    this._burstCurrentIndex = index;
    
    // Fetch metadata for selected photo (may not be in cache)
    try {
      const metadata = await this._fetchMetadata(selectedPhoto.path);
      this._currentMetadata = metadata;
    } catch (error) {
      console.error('Failed to fetch metadata for burst photo:', error);
      // Use basic metadata from burst response
      this._currentMetadata = {
        date_taken: selectedPhoto.date_taken,
        latitude: selectedPhoto.latitude,
        longitude: selectedPhoto.longitude,
        is_favorited: selectedPhoto.is_favorited
      };
    }
    
    this.requestUpdate();
  }
  
  // GALLERY-CARD PATTERN: Modal overlay for image viewing (lines 238-268, 908-961)
  // V4 CODE REUSE: Based on gallery-card's proven modal implementation
  // Direct fullscreen on image click (simplified UX)
  // V4: Tap Action Handlers
  _hasAnyAction() {
    return this.config.tap_action || this.config.double_tap_action || this.config.hold_action;
  }
  
  _handleTap(e) {
    // Check if tap is in center 50% of card (not on nav zones)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const leftEdge = width * 0.25;
    const rightEdge = width * 0.75;
    
    const isCenterTap = x > leftEdge && x < rightEdge;
    
    // Tap detection for center vs edges
    
    // Center tap ALWAYS toggles button visibility (takes priority over configured actions)
    if (isCenterTap) {
      // Center tap toggles explicit action buttons
      this._toggleActionButtons();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Otherwise handle configured tap action
    if (!this.config.tap_action) return;
    
    // Prevent default to avoid navigation zone clicks
    e.preventDefault();
    e.stopPropagation();
    
    // Wait 250ms to see if this is a double-tap
    if (this._tapTimeout) {
      clearTimeout(this._tapTimeout);
    }
    
    this._tapTimeout = setTimeout(() => {
      this._performAction(this.config.tap_action);
      this._tapTimeout = null;
    }, 250);
  }
  
  _toggleActionButtons() {
    // Toggle explicit action buttons visibility
    
    if (this._showButtonsExplicitly) {
      // Already showing - hide them
      // Hide explicit buttons if currently showing
      this._showButtonsExplicitly = false;
      
      // Clear timer
      if (this._hideButtonsTimer) {
        clearTimeout(this._hideButtonsTimer);
        this._hideButtonsTimer = null;
      }
    } else {
      // Not showing - show them and start timer
      // Show explicit buttons and start timer
      this._showButtonsExplicitly = true;
      
      // Start/restart 3s hide timer
      this._startActionButtonsHideTimer();
    }
    
    this.requestUpdate();
  }
  
  _countVisibleActionButtons() {
    // Count visible action buttons to calculate smart timeout
    const config = this.config.action_buttons || {};
    const showMediaIndexButtons = MediaProvider.isMediaIndexActive(this.config) && this._currentMediaPath;
    
    let count = 0;
    if (config.enable_pause !== false) count++;
    if (showMediaIndexButtons && config.enable_favorite !== false) count++;
    if (showMediaIndexButtons && config.enable_delete !== false) count++;
    if (showMediaIndexButtons && config.enable_edit !== false) count++;
    if (showMediaIndexButtons && config.enable_info !== false) count++;
    if (config.enable_fullscreen === true) count++;
    if (this.config.show_refresh_button === true) count++;
    if (showMediaIndexButtons && config.enable_burst_review === true) count++;
    if (showMediaIndexButtons && config.enable_related_photos === true) count++;
    if (showMediaIndexButtons && config.enable_on_this_day === true) count++;
    if (config.enable_queue_preview === true && this.navigationQueue && this.navigationQueue.length >= 1) count++;
    if (this.config.debug_button === true) count++;
    
    return count;
  }
  
  _calculateActionButtonTimeout() {
    // Calculate smart timeout based on visible button count
    // Formula: 3s base + 1s per button over 3 buttons
    // Examples: 3 buttons → 3s, 5 buttons → 5s, 8 buttons → 8s, 15+ buttons → 15s (capped)
    const buttonCount = this._countVisibleActionButtons();
    
    const timeout = Math.min(
      this._actionButtonsBaseTimeout + (Math.max(0, buttonCount - 3) * 1000),
      this._actionButtonsMaxTimeout
    );
    
    return timeout;
  }
  
  _startActionButtonsHideTimer() {
    // Start/restart hide timer with smart timeout based on button count
    
    // Clear existing timer
    if (this._hideButtonsTimer) {
      clearTimeout(this._hideButtonsTimer);
    }
    
    // Calculate smart timeout (scales with button count for touchscreen)
    const timeout = this._calculateActionButtonTimeout();
    
    // Start fresh timer with calculated timeout
    this._hideButtonsTimer = setTimeout(() => {
      // Timer expired - hide explicit buttons
      this._showButtonsExplicitly = false;
      this._hideButtonsTimer = null;
      this.requestUpdate();
    }, timeout);
  }
  
  _handleDoubleTap(e) {
    if (!this.config.double_tap_action) return;
    
    // Prevent default and stop single tap
    e.preventDefault();
    e.stopPropagation();
    
    if (this._tapTimeout) {
      clearTimeout(this._tapTimeout);
      this._tapTimeout = null;
    }
    
    this._performAction(this.config.double_tap_action);
  }
  
  _handlePointerDown(e) {
    if (!this.config.hold_action) return;
    
    // Start hold timer (500ms like standard HA cards)
    this._holdTimeout = setTimeout(() => {
      this._performAction(this.config.hold_action);
      this._holdTriggered = true;
    }, 500);
    
    this._holdTriggered = false;
  }
  
  _handlePointerUp(e) {
    if (this._holdTimeout) {
      clearTimeout(this._holdTimeout);
      this._holdTimeout = null;
    }
  }
  
  _handlePointerCancel(e) {
    if (this._holdTimeout) {
      clearTimeout(this._holdTimeout);
      this._holdTimeout = null;
    }
  }

  // V4 CODE: Kiosk mode methods (line 5423-5492)
  _isKioskModeConfigured() {
    return !!(this.config.kiosk_mode_entity && this.config.kiosk_mode_entity.trim());
  }

  _shouldHandleKioskExit(actionType) {
    if (!this._isKioskModeConfigured()) return false;
    
    const exitAction = this.config.kiosk_mode_exit_action || 'tap';
    if (exitAction !== actionType) return false;
    
    // Only handle kiosk exit if no other action is configured for this interaction
    // This prevents conflicts with existing tap/hold/double-tap actions
    if (actionType === 'tap' && this.config.tap_action) return false;
    if (actionType === 'hold' && this.config.hold_action) return false;
    if (actionType === 'double_tap' && this.config.double_tap_action) return false;
    
    return true;
  }

  async _handleKioskExit() {
    if (!this._isKioskModeConfigured()) return false;
    
    const entity = this.config.kiosk_mode_entity.trim();
    
    try {
      // Toggle the boolean to exit kiosk mode
      await this.hass.callService('input_boolean', 'toggle', {
        entity_id: entity
      });
      
      // Show toast notification
      this._showToast('Exiting full-screen mode...');
      
      this._log('🖼️ Kiosk mode exit triggered, toggled:', entity);
      return true;
    } catch (error) {
      console.warn('Failed to toggle kiosk mode entity:', entity, error);
      return false;
    }
  }

  _showToast(message) {
    // V4 CODE: Simple toast notification (line 5470-5492)
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  // NEW: Auto-enable kiosk mode monitoring
  async _setupKioskModeMonitoring() {
    if (!this._isKioskModeConfigured()) return;
    
    const entity = this.config.kiosk_mode_entity.trim();
    
    // Check if entity is off and auto-enable it
    if (this.hass?.states?.[entity]?.state === 'off') {
      try {
        await this.hass.callService('input_boolean', 'turn_on', {
          entity_id: entity
        });
        this._log('🖼️ Auto-enabled kiosk mode entity:', entity);
      } catch (error) {
        console.warn('Failed to auto-enable kiosk mode entity:', entity, error);
      }
    }
    
    // Set up state monitoring to track entity changes
    // This allows the card to react when kiosk mode is manually toggled
    this._log('🖼️ Setting up kiosk mode state listener for entity:', entity);
    this._kioskStateSubscription = this.hass.connection.subscribeEvents(
      (event) => {
        if (event.data.entity_id === entity) {
          const newState = event.data.new_state.state;
          this._log('🖼️ Kiosk mode entity state changed:', newState);
          // V5.6: Invalidate header cache - kiosk mode changes header visibility
          this._cachedHeaderElement = null;
          this._cachedHeaderSelector = null;
          // Delay viewport height recalculation to allow header transition to complete
          setTimeout(() => {
            this._log('🖼️ Triggering viewport height recalculation after kiosk toggle to:', newState);
            this._updateAvailableHeight();
          }, 300);
          this.requestUpdate(); // Re-render to show/hide kiosk indicator
        }
      },
      'state_changed'
    );
    this._log('🖼️ Kiosk mode state listener subscribed');
  }

  _cleanupKioskModeMonitoring() {
    if (this._kioskStateSubscription && typeof this._kioskStateSubscription === 'function') {
      this._kioskStateSubscription();
      this._kioskStateSubscription = null;
    }
  }
  
  async _performAction(action) {
    if (!action) return;
    
    // Handle confirmation if specified
    if (action.confirmation_message) {
      const confirmed = await this._showConfirmationDialog(action.confirmation_message);
      if (!confirmed) return;
    }
    
    switch (action.action) {
      case 'zoom':
        this._performZoomAction();
        break;
      case 'toggle-kiosk':
        this._performToggleKiosk();
        break;
      case 'more-info':
        this._showMoreInfo(action);
        break;
      case 'toggle':
        await this._performToggle(action);
        break;
      case 'call-service':
      case 'perform-action':
        await this._performServiceCall(action);
        break;
      case 'navigate':
        this._performNavigation(action);
        break;
      case 'url':
        this._performUrlOpen(action);
        break;
      case 'assist':
        this._performAssist(action);
        break;
      case 'none':
        break;
      default:
        console.warn('Unknown action:', action.action);
    }
  }
  
  _showMoreInfo(action) {
    const entityId = action.entity || action.target?.entity_id;
    if (!entityId) {
      console.warn('No entity specified for more-info action');
      return;
    }
    
    const event = new Event('hass-more-info', {
      bubbles: true,
      composed: true,
    });
    event.detail = { entityId };
    this.dispatchEvent(event);
  }
  
  async _performToggle(action) {
    const entityId = action.entity || action.target?.entity_id;
    if (!entityId) {
      console.warn('No entity specified for toggle action');
      return;
    }
    
    try {
      await this.hass.callService('homeassistant', 'toggle', {
        entity_id: entityId
      });
    } catch (error) {
      console.error('Failed to toggle entity:', error);
    }
  }
  
  async _performServiceCall(action) {
    if (!action.service && !action.perform_action) {
      console.warn('No service specified for call-service action');
      return;
    }
    
    // Parse service
    const service = action.service || action.perform_action;
    const [domain, serviceAction] = service.split('.');
    if (!domain || !serviceAction) {
      console.warn('Invalid service format:', service);
      return;
    }
    
    // Prepare service data with template variable support
    let serviceData = action.service_data || action.data || {};
    
    // Process templates: replace {{media_path}} with current media path
    serviceData = this._processServiceDataTemplates(serviceData);
    
    // Add target if specified
    if (action.target) {
      Object.assign(serviceData, action.target);
    }
    
    try {
      await this.hass.callService(domain, serviceAction, serviceData);
    } catch (error) {
      console.error('Failed to call service:', error);
    }
  }

  _processServiceDataTemplates(data) {
    // Deep clone to avoid mutating original config
    const processed = JSON.parse(JSON.stringify(data));
    
    // Get current media path
    const mediaPath = this.currentMedia?.media_content_id || 
                      this.currentMedia?.title || 
                      this._currentMediaPath || 
                      this.mediaUrl || '';
    
    // Recursively process all string values
    const processValue = (obj) => {
      if (typeof obj === 'string') {
        return obj.replace(/\{\{media_path\}\}/g, mediaPath);
      } else if (Array.isArray(obj)) {
        return obj.map(processValue);
      } else if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = processValue(value);
        }
        return result;
      }
      return obj;
    };
    
    return processValue(processed);
  }
  
  _performNavigation(action) {
    if (!action.navigation_path) {
      console.warn('No navigation_path specified for navigate action');
      return;
    }
    
    window.history.pushState(null, '', action.navigation_path);
    const event = new Event('location-changed', {
      bubbles: true,
      composed: true,
    });
    event.detail = { replace: false };
    this.dispatchEvent(event);
  }
  
  _performUrlOpen(action) {
    if (!action.url_path) {
      console.warn('No url_path specified for url action');
      return;
    }
    
    window.open(action.url_path, '_blank');
  }
  
  _performAssist(action) {
    alert('Voice assistant is not supported in custom cards. Please use the Home Assistant mobile app or a voice assistant device.');
  }

  _performZoomAction() {
    // Only zoom images
    if (this.currentMedia?.media_content_type !== 'image') return;

    const img = this.shadowRoot.querySelector('.media-container img');
    if (!img) return;

    // Toggle zoom state
    if (this._isImageZoomed) {
      this._resetZoom(img);
      return;
    }

    // Zoom to center with configured level (default 2.5)
    const level = Math.max(1.5, Math.min(5.0, this.config.zoom_level || 2.5));
    this._zoomToPoint(img, 50, 50, level);
  }

  _performToggleKiosk() {
    if (!this.config.kiosk_mode_entity || !this._hass) return;

    // Toggle the kiosk entity
    this._hass.callService('input_boolean', 'toggle', {
      entity_id: this.config.kiosk_mode_entity
    });
  }

  // V5: Confirmation dialog with template support
  async _showConfirmationDialog(messageTemplate) {
    return new Promise((resolve) => {
      // Process template to replace variables
      const message = this._processConfirmationTemplate(messageTemplate);
      
      // Create dialog state
      this._confirmationDialogResolve = resolve;
      this._confirmationDialogMessage = message;
      
      // Trigger re-render to show dialog
      this.requestUpdate();
    });
  }

  _processConfirmationTemplate(template) {
    if (!template || typeof template !== 'string') return 'Are you sure?';
    
    // Get metadata from current media
    const metadata = this.currentMedia?.metadata || this._currentMetadata || {};
    const mediaPath = this.currentMedia?.media_content_id || this._currentMediaPath || '';
    
    // Extract components from path
    const pathParts = mediaPath.split('/');
    const filename = pathParts[pathParts.length - 1] || '';
    const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    // Build folder path (everything except filename)
    const folderPath = pathParts.slice(0, -1).join('/');
    const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
    
    // Get date with fallback priority: date_taken (EXIF) -> date (filesystem)
    let dateStr = '';
    if (metadata.date_taken) {
      const date = typeof metadata.date_taken === 'number'
        ? new Date(metadata.date_taken * 1000)
        : new Date(metadata.date_taken.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
      
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString();
      }
    } else if (metadata.date) {
      dateStr = metadata.date.toLocaleDateString ? metadata.date.toLocaleDateString() : String(metadata.date);
    }
    
    // Get date_time (date + time)
    let dateTimeStr = '';
    if (metadata.date_taken) {
      const date = typeof metadata.date_taken === 'number'
        ? new Date(metadata.date_taken * 1000)
        : new Date(metadata.date_taken.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
      
      if (!isNaN(date.getTime())) {
        dateTimeStr = date.toLocaleString();
      }
    }
    
    // Get location string
    let locationStr = '';
    if (metadata.location) {
      // Handle location as object {city, state, country}
      if (typeof metadata.location === 'object') {
        const parts = [];
        if (metadata.location.city) parts.push(metadata.location.city);
        if (metadata.location.state) parts.push(metadata.location.state);
        if (metadata.location.country) parts.push(metadata.location.country);
        locationStr = parts.join(', ');
      } else {
        locationStr = String(metadata.location);
      }
    }
    
    // Get city, state, country separately
    const city = metadata.location?.city || '';
    const state = metadata.location?.state || '';
    const country = metadata.location?.country || '';
    
    // Replace all templates
    let processed = template;
    processed = processed.replace(/\{\{filename\}\}/g, filenameWithoutExt);
    processed = processed.replace(/\{\{filename_ext\}\}/g, filename);
    processed = processed.replace(/\{\{folder\}\}/g, folderName);
    processed = processed.replace(/\{\{folder_path\}\}/g, folderPath);
    processed = processed.replace(/\{\{media_path\}\}/g, mediaPath);
    processed = processed.replace(/\{\{date\}\}/g, dateStr);
    processed = processed.replace(/\{\{date_time\}\}/g, dateTimeStr);
    processed = processed.replace(/\{\{location\}\}/g, locationStr);
    processed = processed.replace(/\{\{city\}\}/g, city);
    processed = processed.replace(/\{\{state\}\}/g, state);
    processed = processed.replace(/\{\{country\}\}/g, country);
    
    return processed;
  }

  _handleConfirmationConfirm() {
    if (this._confirmationDialogResolve) {
      this._confirmationDialogResolve(true);
      this._confirmationDialogResolve = null;
      this._confirmationDialogMessage = null;
      this.requestUpdate();
    }
  }

  _handleConfirmationCancel() {
    if (this._confirmationDialogResolve) {
      this._confirmationDialogResolve(false);
      this._confirmationDialogResolve = null;
      this._confirmationDialogMessage = null;
      this.requestUpdate();
    }
  }

  static styles = css`
    :host {
      display: block;
      /* Smart-scale mode max-height - leaves ~20vh buffer for metadata visibility */
      --smart-scale-max-height: 80vh;
    }
    
    /* V5.7: Ensure ha-card properly clips content to rounded corners when NOT blending */
    :host(:not([data-blend-with-background])) ha-card {
      overflow: hidden;
    }
    
    /* V5.7: When blending, remove borders for seamless integration */
    :host([data-blend-with-background]) ha-card {
      border: none;
      box-shadow: none;
    }
    
    .card {
      position: relative;
      overflow: hidden;
      background: var(--card-background-color);
    }
    
    /* When NOT blending, use proper card background and rounded corners */
    :host(:not([data-blend-with-background])) .card {
      background: var(--card-background-color);
      border-radius: var(--ha-card-border-radius);
    }
    
    /* When blending (default), use transparent/primary background with square corners */
    :host([data-blend-with-background]) .card {
      background: transparent;
      border-radius: 0;
    }
    
    .media-container {
      position: relative;
      width: 100%;
      background: var(--primary-background-color);
      /* Enable container-based sizing for child elements (cqi/cqw units) */
      container-type: inline-size;
      /* V5.6: Enable flex centering by default for all modes */
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    
    /* When NOT blending, inherit border radius and use card background */
    :host(:not([data-blend-with-background])) .media-container {
      background: var(--card-background-color);
      border-radius: var(--ha-card-border-radius);
    }
    
    /* V5.6: Crossfade layers - both images stacked on top of each other */
    .media-container .image-layer {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      transition: opacity var(--transition-duration, 300ms) ease-in-out;
    }
    
    .media-container .image-layer.active {
      opacity: 1;
      z-index: 2;
    }
    
    .media-container .image-layer.inactive {
      opacity: 0;
      z-index: 1;
    }
    
    /* V5.7: Edge fade effect - smooth rectangular fade using intersecting gradients */
    :host([data-edge-fade]) img,
    :host([data-edge-fade]) video,
    :host([data-edge-fade]) .image-layer {
      --edge-px: calc(var(--edge-fade-strength, 0) * 1px);
      /* Single combined mask using comma-separated list (implicit intersection) */
      mask-image: 
        linear-gradient(90deg, transparent 0, white var(--edge-px), white calc(100% - var(--edge-px)), transparent 100%),
        linear-gradient(180deg, transparent 0, white var(--edge-px), white calc(100% - var(--edge-px)), transparent 100%);
      mask-size: 100% 100%;
      mask-repeat: no-repeat;
      mask-composite: intersect;
      -webkit-mask-image: 
        linear-gradient(90deg, transparent 0, white var(--edge-px), white calc(100% - var(--edge-px)), transparent 100%),
        linear-gradient(180deg, transparent 0, white var(--edge-px), white calc(100% - var(--edge-px)), transparent 100%);
      -webkit-mask-size: 100% 100%;
      -webkit-mask-repeat: no-repeat;
      -webkit-mask-composite: source-in;
    }
    
    /* V4 Smart aspect ratio handling - base rules for default mode only */
    :host(:not([data-aspect-mode])) img,
    :host(:not([data-aspect-mode])) video {
      max-width: 100%;
      height: auto;
      margin: auto;
    }
    
    :host([data-aspect-mode="viewport-fit"]) img {
      max-height: var(--available-viewport-height, 100vh);
      max-width: 100vw;
      width: auto;
      height: auto;
      object-fit: contain;
      /* Explicit alignment for flex child */
      align-self: center;
    }
    
    :host([data-aspect-mode="viewport-fit"]) .card {
      height: var(--available-viewport-height, 100vh); /* Dynamic height accounts for HA header */
    }
    
    :host([data-aspect-mode="viewport-fit"]) .media-container {
      height: var(--available-viewport-height, 100vh);
      /* Use CSS Grid for reliable centering */
      display: grid !important;
      place-items: center;
      /* Override flex from base rules */
      flex: 0 0 auto;
      /* Constrain children to viewport */
      max-width: 100vw;
      max-height: var(--available-viewport-height, 100vh);
      overflow: hidden;
    }
    
    /* Ensure main-content fills viewport in viewport-fit mode */
    :host([data-aspect-mode="viewport-fit"]) .main-content {
      height: var(--available-viewport-height, 100vh);
    }
    
    /* When panel is open, viewport-fit still uses dynamic viewport height */
    :host([data-aspect-mode="viewport-fit"]) .card.panel-open .media-container {
      height: var(--available-viewport-height, 100vh);
      max-height: var(--available-viewport-height, 100vh);
      /* Use grid centering even with panel open */
      display: grid !important;
      place-items: center;
      flex: 1;
      justify-content: center;
    }
    
    /* Viewport-fill: Fill entire viewport with media */
    :host([data-aspect-mode="viewport-fill"]) .card {
      height: var(--available-viewport-height, 100vh);
    }
    
    :host([data-aspect-mode="viewport-fill"]) .main-content {
      height: 100%;
    }
    
    :host([data-aspect-mode="viewport-fill"]) .media-container {
      height: 100%;
      width: 100%;
      display: flex !important;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    
    :host([data-aspect-mode="viewport-fill"]) img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center center;
    }
    
    :host([data-aspect-mode="viewport-fill"]) .main-content video {
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: cover !important;
      object-position: center center;
    }
    
    :host([data-aspect-mode="smart-scale"]) .media-container {
      display: grid !important;
      place-items: center;
      /* Dynamic height for centering without scrolling. Fallback 50vh ensures minimum vertical centering space 
         when dynamic height unavailable (e.g., during initial render). 50vh chosen as safe minimum that leaves 
         room for metadata overlay while preventing content from being pushed off-screen. */
      min-height: var(--available-viewport-height, 50vh);
    }
    
    /* Smart-scale with panel open should use min-height like panel-closed for centering */
    :host([data-aspect-mode="smart-scale"]) .card.panel-open .media-container {
      /* Same fallback value as panel-closed for consistent behavior */
      min-height: var(--available-viewport-height, 50vh);
      height: auto; /* Allow container to size to content */
      display: grid !important;
      place-items: center;
    }
    
    :host([data-aspect-mode="smart-scale"]) .card.panel-open img {
      max-height: var(--smart-scale-max-height); /* Match centering behavior with panel-closed */
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    
    :host([data-aspect-mode="smart-scale"]) .card.panel-open video {
      max-height: var(--smart-scale-max-height);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
    }
    
    :host([data-aspect-mode="smart-scale"]) img {
      max-height: var(--smart-scale-max-height);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
    }
    
    /* V5.3: Fixed card height - only applies in default mode (PR #37 by BasicCPPDev) */
    /* Title is excluded from height constraint - rendered outside the fixed container */
    :host([data-card-height]:not([data-aspect-mode])) {
      display: block;
    }
    
    :host([data-card-height]:not([data-aspect-mode])) ha-card {
      display: block;
    }
    
    :host([data-card-height]:not([data-aspect-mode])) .card {
      display: flex;
      flex-direction: column;
    }
    
    /* Override to horizontal layout when panel is open */
    :host([data-card-height]:not([data-aspect-mode])) .card.panel-open {
      flex-direction: row;
    }
    
    :host([data-card-height]:not([data-aspect-mode])) .title {
      flex: 0 0 auto;
    }
    
    :host([data-card-height]:not([data-aspect-mode])) .media-container {
      height: var(--card-height);
      width: 100%;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    
    :host([data-card-height]:not([data-aspect-mode])) img,
    :host([data-card-height]:not([data-aspect-mode])) .image-layer,
    :host([data-card-height]:not([data-aspect-mode])) video {
      max-height: 100%;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
    }
    
    /* Default mode (no aspect-mode, no card-height): Center images and apply max-height */
    :host(:not([data-aspect-mode]):not([data-card-height])) .media-container {
      display: grid;
      place-items: center;
    }
    
    /* V5.6: Crossfade layers stack via grid in default mode */
    :host(:not([data-aspect-mode]):not([data-card-height])) .image-layer {
      position: static !important;
      top: auto;
      left: auto;
      transform: none;
      grid-area: 1 / 1;
      max-height: var(--media-max-height, 400px);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      justify-self: center;
      align-self: center;
    }
    
    :host(:not([data-aspect-mode]):not([data-card-height])) img {
      max-height: var(--media-max-height, 400px);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
    }
    :host(:not([data-aspect-mode]):not([data-card-height])) video {
      max-height: var(--media-max-height, 400px);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
    }
    
    /* Remove max-height constraint in fullscreen mode */
    :fullscreen img,
    :fullscreen video,
    :-webkit-full-screen img,
    :-webkit-full-screen video,
    :-moz-full-screen img,
    :-moz-full-screen video,
    :-ms-fullscreen img,
    :-ms-fullscreen video {
      max-height: 100vh !important;
      max-width: 100vw !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain;
    }

    /* V4: Image Zoom Styles */
    :host([data-media-type="image"]) .zoomable-container {
      position: relative;
      overflow: hidden;
      cursor: zoom-in;
    }
    :host([data-media-type="image"][data-image-zoomed]) .zoomable-container {
      cursor: zoom-out;
    }
    :host([data-media-type="image"]) .zoomable-container img {
      transition: transform 0.25s ease, transform-origin 0.1s ease;
      will-change: transform;
    }
    
    video {
      max-height: 400px;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      background: transparent;
      margin: auto;
    }

    :host([data-aspect-mode="viewport-fit"]) .main-content video {
      max-height: var(--available-viewport-height, 100vh) !important;
      max-width: 100vw !important;
      width: auto;
      height: auto;
      object-fit: contain;
      /* Explicit alignment for flex child */
      align-self: center;
    }
    
    :host([data-aspect-mode="smart-scale"]) video {
      max-height: var(--smart-scale-max-height);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
    }
    
    /* V4 Navigation Zones - invisible overlay controls */
    .navigation-zones {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      /* V5.7: Lower z-index to not interfere with card editor */
      z-index: 3;
    }

    .nav-zone {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      pointer-events: auto;
      user-select: none;
    }

    .nav-zone-left {
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 80px;
      height: 50%;
      min-height: 120px;
      max-height: 400px;
      cursor: w-resize;
      border-radius: 8px;
    }

    .nav-zone-right {
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 80px;
      height: 50%;
      min-height: 120px;
      max-height: 400px;
      cursor: e-resize;
      border-radius: 8px;
    }

    /* On mouse devices, show background overlay on hover */
    @media (hover: hover) and (pointer: fine) {
      .nav-zone:hover {
        background: rgba(0, 0, 0, 0.4);
      }
    }

    /* Base nav arrow pseudo-elements (hidden by default) */
    .nav-zone-left::after {
      content: '◀';
      color: white;
      font-size: 1.5em;
      text-shadow: 0 0 12px rgba(0, 0, 0, 1), 0 0 4px rgba(0, 0, 0, 1);
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .nav-zone-right::after {
      content: '▶';
      color: white;
      font-size: 1.5em;
      text-shadow: 0 0 12px rgba(0, 0, 0, 1), 0 0 4px rgba(0, 0, 0, 1);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    /* On mouse devices, show arrows on hover */
    @media (hover: hover) and (pointer: fine) {
      .nav-zone-left:hover::after,
      .nav-zone-right:hover::after {
        opacity: 0.9;
      }
    }

    /* In touch-explicit mode, show arrows */
    .nav-zone-left.show-buttons::after,
    .nav-zone-right.show-buttons::after {
      opacity: 0.9;
    }
    
    /* Show background when visible (not just hover) */
    /* In touch-explicit mode, show background overlay */
    .nav-zone.show-buttons {
      background: rgba(0, 0, 0, 0.4);
    }
    
    /* V4: Metadata overlay */
    .metadata-overlay {
      position: absolute;
      background: rgba(var(--rgb-primary-background-color, 255, 255, 255), var(--ha-overlay-opacity, 0.25));
      color: var(--primary-text-color);
      padding: 6px 12px;
      border-radius: 4px;
      /* Responsive size with user scale factor.
         Use container query units so size follows card viewport, not page. */
      font-size: calc(var(--ha-media-metadata-scale, 1) * clamp(0.9rem, 1.4cqi, 2.0rem));
      line-height: 1.2;
      pointer-events: none;
      /* Above nav zones, below HA header */
      z-index: 2;
      animation: fadeIn 0.3s ease;
      max-width: calc(100% - 16px);
      word-break: break-word;
    }
    
    .media-container:not(.transparent-overlays) .metadata-overlay {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    
    /* V5.7: When NOT blending with background, use card background color (same opacity) */
    :host(:not([data-blend-with-background])) .metadata-overlay {
      background: rgba(var(--rgb-card-background-color, 0, 0, 0), var(--ha-overlay-opacity, 0.25));
    }

    /* Metadata positioning */
    .metadata-overlay.metadata-bottom-left {
      bottom: 12px;
      left: 8px;
    }

    .metadata-overlay.metadata-bottom-right {
      bottom: 12px;
      right: 8px;
    }

    .metadata-overlay.metadata-top-left {
      top: 8px;
      left: 8px;
    }

    .metadata-overlay.metadata-top-right {
      top: 8px;
      right: 8px;
    }

    .metadata-overlay.metadata-center-top {
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .metadata-overlay.metadata-center-bottom {
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    /* Display Entities Overlay */
    .display-entities {
      position: absolute;
      background: rgba(var(--rgb-primary-background-color, 255, 255, 255), var(--ha-overlay-opacity, 0.25));
      color: var(--primary-text-color);
      padding: 8px 14px;
      border-radius: 6px;
      font-size: calc(var(--ha-media-metadata-scale, 1) * clamp(1.0rem, 1.6cqi, 2.2rem));
      line-height: 1.3;
      pointer-events: none;
      z-index: 2;
      opacity: 0;
      transition: opacity var(--display-entities-transition, 500ms) ease;
      max-width: calc(100% - 16px);
      word-break: break-word;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .media-container:not(.transparent-overlays) .display-entities {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    
    /* V5.7: When NOT blending with background, use card background color (same opacity) */
    :host(:not([data-blend-with-background])) .display-entities {
      background: rgba(var(--rgb-card-background-color, 0, 0, 0), var(--ha-overlay-opacity, 0.25));
    }
    
    .display-entities ha-icon {
      flex-shrink: 0;
      --mdc-icon-size: 1em;
    }

    .display-entities.visible {
      opacity: 1;
    }

    /* Display entities positioning */
    .display-entities.position-top-left {
      top: 8px;
      left: 8px;
    }

    .display-entities.position-top-right {
      top: 8px;
      right: 8px;
    }

    .display-entities.position-bottom-left {
      bottom: 12px;
      left: 8px;
    }

    .display-entities.position-bottom-right {
      bottom: 12px;
      right: 8px;
    }

    .display-entities.position-center-top {
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .display-entities.position-center-bottom {
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
    }

    /* V5.6: Clock/Date Overlay */
    .clock-overlay {
      position: absolute;
      background: rgba(var(--rgb-primary-background-color, 255, 255, 255), var(--ha-overlay-opacity, 0.25));
      color: var(--primary-text-color);
      padding: 8px 16px;
      border-radius: 8px;
      pointer-events: none;
      z-index: 2;
      text-align: center;
    }
    
    .clock-overlay.clickable {
      pointer-events: auto;
      cursor: pointer;
      transition: background-color 0.2s ease, transform 0.1s ease;
    }
    
    .clock-overlay.clickable:hover {
      background: rgba(var(--rgb-primary-background-color, 255, 255, 255), calc(var(--ha-overlay-opacity, 0.25) + 0.15));
      transform: scale(1.05);
    }
    
    .clock-overlay.clickable:active {
      transform: scale(0.98);
    }
    
    /* Only apply backdrop-filter if opacity > 0.05 to allow true transparency */
    .media-container:not(.transparent-overlays) .clock-overlay {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    
    /* V5.7: When NOT blending with background, use card background color (same opacity) */
    :host(:not([data-blend-with-background])) .clock-overlay {
      background: rgba(var(--rgb-card-background-color, 0, 0, 0), var(--ha-overlay-opacity, 0.25));
    }
    
    .clock-overlay.no-background {
      background: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      box-shadow: none;
      text-shadow: 
        0 0 8px rgba(0, 0, 0, 0.8),
        0 0 16px rgba(0, 0, 0, 0.6),
        2px 2px 4px rgba(0, 0, 0, 0.9);
    }

    .clock-time {
      font-size: calc(var(--ha-media-metadata-scale, 1) * clamp(2.5rem, 6cqi, 5rem));
      font-weight: 300;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .clock-date {
      font-size: calc(var(--ha-media-metadata-scale, 1) * clamp(1.0rem, 2cqi, 1.8rem));
      margin-top: 2px;
      opacity: 0.9;
    }

    /* Clock positioning */
    .clock-overlay.clock-top-left {
      top: 12px;
      left: 12px;
    }

    .clock-overlay.clock-top-right {
      top: 12px;
      right: 12px;
    }

    .clock-overlay.clock-bottom-left {
      bottom: 12px;
      left: 12px;
    }

    .clock-overlay.clock-bottom-right {
      bottom: 12px;
      right: 12px;
    }

    .clock-overlay.clock-center-top {
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
    }

    .clock-overlay.clock-center-bottom {
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
    }

    /* V4: Action Buttons (Favorite/Delete/Edit) */
    .action-buttons {
      position: absolute;
      display: flex;
      gap: 8px;
      /* Above overlays for click priority, below HA header */
      z-index: 3;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    /* Hover shows buttons on devices with mouse (not touch) */
    @media (hover: hover) and (pointer: fine) {
      .media-container:hover .action-buttons {
        opacity: 1;
      }
    }

    /* Explicit show for touch screens */
    .action-buttons.show-buttons {
      opacity: 1;
    }

    /* Positioning options */
    .action-buttons-top-right {
      top: 8px;
      right: 8px;
    }

    .action-buttons-top-left {
      top: 8px;
      left: 8px;
    }

    .action-buttons-bottom-right {
      bottom: 8px;
      right: 8px;
    }

    .action-buttons-bottom-left {
      bottom: 8px;
      left: 8px;
    }

    .action-buttons-center-top {
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .action-buttons-center-bottom {
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .action-btn {
      background: rgba(var(--rgb-card-background-color, 33, 33, 33), 0.8);
      border: 1px solid rgba(var(--rgb-primary-text-color, 255, 255, 255), 0.2);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      color: var(--primary-text-color);
      backdrop-filter: blur(10px);
    }

    .action-btn:hover {
      background: rgba(var(--rgb-card-background-color, 33, 33, 33), 0.95);
      transform: scale(1.15);
      border-color: rgba(var(--rgb-primary-text-color, 255, 255, 255), 0.4);
    }

    .action-btn ha-icon {
      --mdc-icon-size: 24px;
    }

    /* V4: Highlight pause button when paused */
    .pause-btn.paused {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.15);
    }

    .pause-btn.paused:hover {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.25);
    }

    /* Debug button active state - warning color when enabled */
    .debug-btn.active {
      color: var(--warning-color, #ff9800);
      background: rgba(255, 152, 0, 0.15);
    }

    .debug-btn.active:hover {
      color: var(--warning-color, #ff9800);
      background: rgba(255, 152, 0, 0.25);
    }

    .favorite-btn.favorited {
      color: var(--error-color, #ff5252);
    }

    .favorite-btn.favorited:hover {
      color: var(--error-color, #ff5252);
      background: rgba(255, 82, 82, 0.1);
    }

    .edit-btn:hover {
      color: var(--warning-color, #ff9800);
      transform: scale(1.15);
    }

    .delete-btn:hover {
      color: var(--error-color, #ff5252);
      transform: scale(1.15);
    }

    /* V4: Delete/Edit Confirmation Dialog */
    .delete-confirmation-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .delete-confirmation-content {
      background: rgba(0, 0, 0, 0.60);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      min-width: 300px;
      max-width: 500px;
      animation: dialogSlideIn 0.3s ease;
      padding: 20px 24px;
    }

    @keyframes dialogSlideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    /* V4: Pause Indicator (copied from ha-media-card.js) */
    .pause-indicator {
      position: absolute;
      top: 76px;
      right: 8px;
      width: 60px;
      height: 60px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 8px;
      font-size: 1.2em;
      font-weight: 500;
      pointer-events: none;
      /* Above nav zones, below HA header */
      z-index: 2;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
    }

    /* V4: Kiosk Exit Hint (line 1346-1361) */
    .kiosk-exit-hint {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      pointer-events: none;
      /* Above nav zones, below HA header */
      z-index: 2;
      opacity: 0.9;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      text-align: center;
    }

    /* Fullscreen Exit Button */
    .fullscreen-exit-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      transition: background 0.2s;
    }

    .fullscreen-exit-btn:hover {
      background: rgba(0, 0, 0, 0.85);
    }

    .fullscreen-exit-btn ha-icon {
      --mdc-icon-size: 24px;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* V4: Navigation Indicators (position and dots) */
    /* Copied from V4 lines 1362-1425 */
    .position-indicator {
      position: absolute;
      background: rgba(var(--rgb-primary-background-color, 255, 255, 255), var(--ha-overlay-opacity, 0.25));
      color: var(--primary-text-color);
      padding: 4px 8px;
      border-radius: 12px;
      /* Responsive size with user scale factor, matched to metadata overlay.
         Use container query units so size follows card viewport, not page. */
      font-size: calc(var(--ha-media-metadata-scale, 1) * clamp(0.7rem, 1.2cqi, 1.6rem));
      font-weight: 500;
      pointer-events: none;
      /* Above nav zones, below HA header */
      z-index: 2;
    }
    
    .media-container:not(.transparent-overlays) .position-indicator {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    
    /* V5.7: When NOT blending with background, use card background color (same opacity) */
    :host(:not([data-blend-with-background])) .position-indicator {
      background: rgba(var(--rgb-card-background-color, 0, 0, 0), var(--ha-overlay-opacity, 0.25));
    }
    
    /* Position indicator corner positioning - bottom-right is default */
    :host([data-position-indicator-position="bottom-right"]) .position-indicator,
    :host(:not([data-position-indicator-position])) .position-indicator {
      bottom: 12px;
      right: 12px;
    }
    
    :host([data-position-indicator-position="bottom-left"]) .position-indicator {
      bottom: 12px;
      left: 12px;
    }
    
    :host([data-position-indicator-position="top-right"]) .position-indicator {
      top: 12px;
      right: 12px;
    }
    
    :host([data-position-indicator-position="top-left"]) .position-indicator {
      top: 12px;
      left: 12px;
    }

    :host([data-position-indicator-position="center-top"]) .position-indicator {
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
    }

    :host([data-position-indicator-position="center-bottom"]) .position-indicator {
      bottom: 4px;
      left: 50%;
      transform: translateX(-50%);
    }

    .dots-indicator {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      pointer-events: none;
      /* Above overlays */
      z-index: 5;
      max-width: 200px;
      overflow: hidden;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .dot.active {
      background: rgba(255, 255, 255, 0.9);
      transform: scale(1.2);
    }

    /* Hide indicators when in single_media mode */
    :host([data-media-source-type="single_media"]) .position-indicator,
    :host([data-media-source-type="single_media"]) .dots-indicator {
      display: none;
    }

    .delete-confirmation-content h3 {
      margin: 0 0 16px;
      font-size: 16px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      letter-spacing: 0.3px;
    }

    .delete-thumbnail {
      width: 300px;
      height: 200px;
      margin: 0 auto 16px;
      border-radius: 4px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Smaller thumbnails in panel mode (dialog is smaller relative to card) */
    :host([panel]) .delete-thumbnail {
      width: 200px;
      height: 133px;
    }

    .delete-thumbnail img {
      max-width: 100% !important;
      max-height: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
    }

    .delete-confirmation-content p {
      margin: 0 0 12px;
      color: rgba(255, 255, 255, 0.9);
      line-height: 1.5;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    
    .delete-confirmation-content p strong {
      font-weight: 500;
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
    }

    .delete-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 20px;
    }

    .delete-actions button {
      padding: 8px 20px;
      border-radius: 4px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .cancel-btn {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .cancel-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 1);
    }

    .confirm-btn {
      background: var(--error-color, #ff5252);
      color: white;
    }

    .confirm-btn:hover {
      background: var(--error-color-dark, #d32f2f);
    }
    
    /* Info Overlay Styles - Modern dropdown design */
    .info-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 100;
      pointer-events: none;
    }

    .info-content {
      position: absolute;
      top: 56px;
      width: 400px;
      max-width: calc(100% - 32px);
      max-height: calc(100% - 72px);
      background: rgba(0, 0, 0, 0.60);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      animation: dropdownSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    /* Position info panel based on action button placement */
    .action-buttons-top-right ~ .info-overlay .info-content {
      right: 8px;
    }
    
    .action-buttons-top-left ~ .info-overlay .info-content {
      left: 8px;
    }

    @keyframes dropdownSlideIn {
      from {
        opacity: 0;
        transform: translateY(-12px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .info-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
    }

    .info-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      letter-spacing: 0.3px;
    }

    .info-close-btn {
      background: rgba(255, 255, 255, 0.08);
      border: none;
      cursor: pointer;
      color: rgba(255, 255, 255, 0.8);
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.2s ease;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .info-close-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 1);
    }

    .info-close-btn ha-icon {
      --mdc-icon-size: 20px;
    }

    .info-body {
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
      user-select: text;
      -webkit-user-select: text;
      -moz-user-select: text;
      -ms-user-select: text;
    }

    /* Webkit scrollbar styling for dark theme */
    .info-body::-webkit-scrollbar {
      width: 8px;
    }

    .info-body::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    }

    .info-body::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }

    .info-body::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .info-group-header {
      font-size: 11px;
      font-weight: 700;
      color: rgba(3, 169, 244, 0.9);
      margin: 20px 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(3, 169, 244, 0.2);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .info-group-header:first-child {
      margin-top: 0;
    }

    .info-section {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 12px;
      margin: 10px 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .info-label {
      font-weight: 500;
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
    }

    .info-value {
      color: rgba(255, 255, 255, 0.9);
      word-break: break-word;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    .info-btn.active {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.15);
    }

    .info-btn.active:hover {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.25);
    }
    
    .burst-btn.active {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.15);
    }

    .burst-btn.active:hover {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.25);
    }
    
    .queue-btn.active {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.15);
    }

    .queue-btn.active:hover {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.25);
    }
    
    .placeholder {
      text-align: center;
      padding: 32px;
      color: var(--secondary-text-color);
    }
    .loading {
      text-align: center;
      padding: 32px;
      color: var(--secondary-text-color);
    }
    .title {
      padding: 8px 16px;
      font-weight: 500;
      color: var(--primary-text-color);
      border-bottom: 1px solid var(--divider-color);
    }
    
    /* V5.7: When blending, title uses dashboard background */
    :host([data-blend-with-background]) .title {
      background: var(--primary-background-color);
      border-bottom: none;
    }
    
    /* V5.7: When NOT blending, title uses card background */
    :host(:not([data-blend-with-background])) .title {
      background: var(--card-background-color);
    }
    
    /* Confirmation dialog styles */
    .confirmation-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    }
    
    .confirmation-dialog {
      background: var(--card-background-color, #fff);
      border-radius: 8px;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      padding: 24px;
      max-width: 400px;
      min-width: 300px;
      margin: 16px;
    }
    
    .confirmation-message {
      color: var(--primary-text-color);
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 24px;
      text-align: center;
    }
    
    .confirmation-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    
    .confirmation-buttons button {
      padding: 10px 24px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .confirm-button {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }
    
    .confirm-button:hover {
      background: var(--dark-primary-color, #0288d1);
    }
    
    .cancel-button {
      background: var(--divider-color, #e0e0e0);
      color: var(--primary-text-color);
    }
    
    .cancel-button:hover {
      background: var(--secondary-text-color, #757575);
      color: var(--text-primary-color, #fff);
    }

    /* Side Panel Styles - Side-by-side mode */
    .card {
      position: relative;
      transition: all 0.3s ease-out;
      overflow: hidden;
    }
    
    .card.panel-open {
      display: flex;
    }

    /* Main content area (everything except panel) */
    .main-content {
      flex: 1;
      min-width: 0; /* Allow flexbox shrinking */
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Media container should fill available space */
    .main-content .media-container {
      flex: 1;
      min-height: 0; /* Allow flexbox shrinking */
      overflow: hidden;
      position: relative; /* For absolute positioned overlays */
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* V5.6: Fix viewport-fit image sizing when panel is open */
    /* When panel is open, images should fit within available space using dynamic height */
    /* Scope to .main-content to avoid affecting thumbnail images */
    :host([data-aspect-mode="viewport-fit"]) .card.panel-open .main-content img {
      max-width: 100% !important;
      max-height: var(--available-viewport-height, 100vh) !important;
      width: auto !important;
      height: auto !important;
    }

    :host([data-aspect-mode="viewport-fit"]) .card.panel-open .main-content video {
      max-width: 100% !important;
      max-height: var(--available-viewport-height, 100vh) !important;
      width: auto !important;
      height: auto !important;
    }

    /* Viewport-fill with panel open: only affect thumbnails in side panel */
    :host([data-aspect-mode="viewport-fill"]) .side-panel img {
      position: static !important;
      max-width: 100% !important;
      max-height: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
    }

    .side-panel {
      position: relative;
      width: 320px;
      max-width: 40%; /* Limit panel width on small screens */
      flex-shrink: 0;
      background: var(--card-background-color, #fff);
      box-shadow: -4px 0 8px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      animation: slideInRight 0.3s ease-out;
      overflow: hidden;
      max-height: 100%; /* Don't exceed card height */
    }

    @media (max-width: 768px) {
      .side-panel {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-width: 100%;
        z-index: 10;
      }
    }

    @keyframes slideInRight {
      from {
        transform: translateX(100%);
      }
      to {
        transform: translateX(0);
      }
    }

    .panel-header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 48px 16px 16px; /* Extra right padding for close button */
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      background: var(--primary-background-color);
      flex-wrap: wrap;
      gap: 8px;
    }

    .panel-title {
      flex: 1;
      min-width: 100%;
    }

    .title-text {
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-text-color);
      margin-bottom: 4px;
    }

    .subtitle-text {
      font-size: 13px;
      color: var(--secondary-text-color);
      opacity: 0.7;
    }

    .panel-subtitle-below {
      font-size: 13px;
      color: var(--secondary-text-color);
      opacity: 0.7;
      width: 100%;
      text-align: center;
      margin-top: 4px;
    }

    .panel-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      justify-content: center;
    }

    .panel-action-button {
      background: var(--primary-color, #03a9f4);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
      white-space: nowrap;
    }

    .panel-action-button:hover {
      opacity: 0.9;
    }

    .panel-action-button:active {
      opacity: 0.7;
    }

    .randomize-checkbox {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: var(--primary-text-color);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .randomize-checkbox input[type="checkbox"] {
      cursor: pointer;
      width: 16px;
      height: 16px;
      accent-color: var(--primary-color, #03a9f4);
    }

    .randomize-checkbox:hover {
      opacity: 0.8;
    }

    .window-selector {
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color, #e0e0e0);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }

    .window-selector:hover {
      border-color: var(--primary-color, #03a9f4);
    }

    .window-selector:focus {
      border-color: var(--primary-color, #03a9f4);
      box-shadow: 0 0 0 2px rgba(3, 169, 244, 0.2);
    }

    .panel-close-button {
      position: absolute;
      top: 8px;
      right: 8px;
      background: transparent;
      border: none;
      font-size: 24px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 50%;
      color: var(--primary-text-color);
      transition: background 0.2s;
      z-index: 10;
    }

    .panel-close-button:hover {
      background: var(--divider-color, #e0e0e0);
    }

    .thumbnail-strip {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      align-content: start;
    }

    .page-nav-button {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
      border: 1px solid var(--primary-color, #03a9f4);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      color: var(--primary-text-color);
      font-size: 14px;
      font-weight: 500;
    }

    .page-nav-button:hover {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
      transform: scale(1.02);
    }

    .page-nav-button:active {
      transform: scale(0.98);
    }

    .page-nav-button ha-icon {
      --mdc-icon-size: 20px;
      color: var(--primary-color, #03a9f4);
    }

    .page-nav-label {
      color: var(--primary-text-color);
    }

    .thumbnail {
      position: relative;
      /* V5.6: Height set dynamically via --thumbnail-height CSS variable */
      height: var(--thumbnail-height, 150px);
      width: 100%; /* Fill grid column */
      max-width: 100%; /* Prevent overflow */
      aspect-ratio: 4 / 3; /* Base ratio, actual content uses contain */
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 3px solid transparent;
      transition: border-color 0.2s, transform 0.2s;
      background: var(--primary-background-color);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .thumbnail:hover {
      transform: scale(1.05);
    }

    .thumbnail.active {
      border-color: var(--primary-color, #03a9f4);
    }

    .thumbnail img {
      max-width: 100% !important;
      max-height: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
    }
    
    /* V5.6: Video thumbnail styling */
    .thumbnail-video {
      max-width: 100% !important;
      max-height: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
      background: var(--primary-background-color);
      opacity: 0.5;
      transition: opacity 0.3s ease;
      pointer-events: none; /* Prevent video from intercepting clicks */
    }
    
    .thumbnail-video.loaded,
    .thumbnail-video[data-loaded="true"] {
      opacity: 1;
    }

    .thumbnail-loading {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      background: var(--primary-background-color);
      opacity: 0.5;
    }

    .time-badge {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      font-family: monospace;
    }

    .favorite-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      background: rgba(255, 0, 0, 0.9);
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      pointer-events: none;
      z-index: 3;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .video-icon-overlay {
      position: absolute;
      bottom: 4px;
      right: 4px;
      font-size: 24px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 4px;
      padding: 2px 4px;
      pointer-events: none;
      z-index: 2;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .no-items {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px 20px;
      color: var(--secondary-text-color);
      font-size: 14px;
    }
  `;

  render() {
    if (this.isLoading) {
      return html`
        <ha-card>
          <div class="card">
            <div class="loading">Loading media...</div>
          </div>
        </ha-card>
      `;
    }

    // V5.3: Show error state if provider initialization failed
    if (this._errorState) {
      const errorMessage = typeof this._errorState === 'string' 
        ? this._errorState 
        : (this._errorState.message || 'Unknown error');
      
      return html`
        <ha-card>
          <div class="card">
            <div class="placeholder" style="color: var(--error-color, #db4437); padding: 16px;">
              <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Media Loading Error</div>
              <div>${errorMessage}</div>
            </div>
          </div>
        </ha-card>
      `;
    }

    if (!this.currentMedia) {
      // Show helpful message based on media_type filter
      const mediaType = this.config.media_type || 'all';
      let message = 'No media configured';
      let hint = '';
      
      if (mediaType === 'image') {
        message = 'No images found';
        hint = 'Try changing Media Type to "video" or "all" if folder contains videos';
      } else if (mediaType === 'video') {
        message = 'No videos found';
        hint = 'Try changing Media Type to "image" or "all" if folder contains images';
      }
      
      return html`
        <ha-card>
          <div class="card">
            <div class="placeholder">
              <div style="font-weight: 500; margin-bottom: 8px;">${message}</div>
              ${hint ? html`<div style="font-size: 0.9em; opacity: 0.7;">${hint}</div>` : ''}
            </div>
          </div>
        </ha-card>
      `;
    }

    // V5.6: Set transition duration CSS variable (default 300ms)
    const transitionDuration = this.config.transition?.duration ?? 300;
    
    return html`
      <ha-card style="--transition-duration: ${transitionDuration}ms">
        <div class="card ${this._panelOpen ? 'panel-open' : ''}"
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0">
          <div class="main-content">
            ${this.config.title ? html`<div class="title">${this.config.title}</div>` : ''}
            ${this._renderMedia()}
            ${this._renderPauseIndicator()}
            ${this._renderKioskIndicator()}
            ${this._renderControls()}
          </div>
          ${this._renderPanel()}
        </div>
        ${this._confirmationDialogMessage ? html`
          <div class="confirmation-backdrop" @click=${this._handleConfirmationCancel}>
            <div class="confirmation-dialog" @click=${(e) => e.stopPropagation()}>
              <div class="confirmation-message">${this._confirmationDialogMessage}</div>
              <div class="confirmation-buttons">
                <button class="confirm-button" @click=${this._handleConfirmationConfirm}>Confirm</button>
                <button class="cancel-button" @click=${this._handleConfirmationCancel}>Cancel</button>
              </div>
            </div>
          </div>
        ` : ''}
      </ha-card>
    `;
  }

  _renderMedia() {
    // V4: Handle error state first
    if (this._errorState) {
      const isSynologyUrl = this._errorState.isSynologyUrl;
      return html`
        <div class="placeholder" style="border-color: var(--error-color, #f44336); background: rgba(244, 67, 54, 0.1);">
          <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
          <div style="color: var(--error-color, #f44336); font-weight: 500;">${this._errorState.message}</div>
          <div style="font-size: 0.85em; margin-top: 8px; opacity: 0.7; word-break: break-all;">
            ${this.mediaUrl ? this.mediaUrl.substring(0, 100) + (this.mediaUrl.length > 100 ? '...' : '') : 'No URL'}
          </div>
          <div style="font-size: 0.8em; margin-top: 12px; opacity: 0.6;">
            ${isSynologyUrl ? 'Synology DSM authentication may have expired' : 'Attempted URL refresh - check Home Assistant logs for more details'}
          </div>
          <div style="margin-top: 16px;">
            <button 
              style="margin-right: 8px; padding: 8px 16px; background: var(--primary-color); color: var(--text-primary-color); border: none; border-radius: 4px; cursor: pointer;"
              @click=${() => this._handleRetryClick(false)}
            >
              🔄 ${isSynologyUrl ? 'Retry Authentication' : 'Retry Load'}
            </button>
            ${isSynologyUrl ? html`
              <button 
                style="padding: 8px 16px; background: var(--accent-color, var(--primary-color)); color: var(--text-primary-color); border: none; border-radius: 4px; cursor: pointer;"
                @click=${() => this._handleRetryClick(true)}
              >
                🔄 Force Refresh
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }
    
    if (!this.mediaUrl) {
      return html`<div class="placeholder">Resolving media URL...</div>`;
    }

    // V4: Detect media type from media_content_type or filename
    const isVideo = this.currentMedia?.media_content_type?.startsWith('video') || 
                    MediaUtils.detectFileType(this.currentMedia?.media_content_id || this.currentMedia?.title || this.mediaUrl) === 'video';

    // Compute metadata overlay scale (defaults to 1.0; user configurable via metadata.scale)
    const metadataScale = Math.max(0.3, Math.min(4, Number(this.config?.metadata?.scale) || 1));

    const displayEntitiesTransition = this.config?.display_entities?.transition_duration || 500;
    
    const overlayOpacity = Math.max(0, Math.min(1, Number(this.config?.overlay_opacity) ?? 0.25));
    
    // Disable backdrop-filter when opacity <= 0.05 to allow true transparency
    const transparentClass = overlayOpacity <= 0.05 ? 'transparent-overlays' : '';

    return html`
      <div 
        class="media-container ${transparentClass}"
        style="--ha-media-metadata-scale: ${metadataScale}; --display-entities-transition: ${displayEntitiesTransition}ms; --ha-overlay-opacity: ${overlayOpacity}"
        @click=${this._handleTap}
        @dblclick=${this._handleDoubleTap}
        @pointerdown=${this._handlePointerDown}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerCancel}
      >
        ${isVideo ? html`
          <video 
            controls
            preload="auto"
            playsinline
            crossorigin="anonymous"
            ?loop=${this.config.video_loop || false}
            ?autoplay=${this.config.video_autoplay !== false}
            ?muted=${this.config.video_muted !== false}
            @loadstart=${this._onVideoLoadStart}
            @loadeddata=${this._onMediaLoaded}
            @error=${this._onMediaError}
            @canplay=${this._onVideoCanPlay}
            @loadedmetadata=${this._onVideoLoadedMetadata}
            @play=${this._onVideoPlay}
            @pause=${this._onVideoPause}
            @ended=${this._onVideoEnded}
            @seeking=${this._onVideoSeeking}
            @pointerdown=${(e) => { e.stopPropagation(); this._showButtonsExplicitly = true; this._startActionButtonsHideTimer(); this.requestUpdate(); }}
            @pointermove=${(e) => { e.stopPropagation(); this._showButtonsExplicitly = true; this._startActionButtonsHideTimer(); }}
            @touchstart=${(e) => { e.stopPropagation(); this._showButtonsExplicitly = true; this._startActionButtonsHideTimer(); this.requestUpdate(); }}
          >
            <source src="${this.mediaUrl}" type="video/mp4">
            <source src="${this.mediaUrl}" type="video/webm">
            <source src="${this.mediaUrl}" type="video/ogg">
            <p>Your browser does not support the video tag. <a href="${this.mediaUrl}" target="_blank">Download the video</a> instead.</p>
          </video>
          ${this._renderVideoInfo()}
        ` : (this.config?.transition?.duration ?? 300) === 0 ? html`
          <!-- V5.6: Instant mode - single image, no layers -->
          <img 
            src="${this.mediaUrl}" 
            alt="${this.currentMedia.title || 'Media'}"
            @error=${this._onMediaError}
            @load=${this._onMediaLoaded}
          />
        ` : (this._frontLayerUrl || this._backLayerUrl) ? html`
          <!-- V5.6: Crossfade with two layers (only render when we have image URLs) -->
          ${this._frontLayerUrl ? html`
            <img 
              class="image-layer ${this._frontLayerActive ? 'active' : 'inactive'}"
              src="${this._frontLayerUrl}" 
              alt="${this.currentMedia.title || 'Media'}"
              @error=${this._onMediaError}
              @load=${this._onMediaLoaded}
            />
          ` : ''}
          ${this._backLayerUrl ? html`
            <img 
              class="image-layer ${!this._frontLayerActive ? 'active' : 'inactive'}"
              src="${this._backLayerUrl}" 
              alt="${this.currentMedia.title || 'Media'}"
              @error=${this._onMediaError}
              @load=${this._onMediaLoaded}
            />
          ` : ''}
        ` : ''}
        ${this._renderNavigationZones()}
        ${this._renderMetadataOverlay()}
        ${this._renderDisplayEntities()}
        ${this._renderClock()}
        ${this._renderActionButtons()}
        ${this._renderNavigationIndicators()}
        ${this._renderInfoOverlay()}
      </div>
    `;
  }
  
  _renderNavigationZones() {
    // V4: Check if navigation zones should be shown
    // For single_media mode, don't show navigation zones
    if (this.config.media_source_type === 'single_media') {
      return html``;
    }
    
    // V4: Respect enable_navigation_zones config option
    if (this.config.enable_navigation_zones === false) {
      return html``;
    }
    
    // V4-style navigation zones with keyboard support
    return html`
      <div class="navigation-zones">
           <div class="nav-zone nav-zone-left ${this._showButtonsExplicitly ? 'show-buttons' : ''}"
             @click=${async (e) => { 
            e.stopPropagation(); 
            // Navigate first
            await this._loadPrevious(); 
            // If buttons are showing, restart the 3s timer to auto-hide
            if (this._showButtonsExplicitly) { this._startActionButtonsHideTimer(); }
             }}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Previous">
        </div>
           <div class="nav-zone nav-zone-right ${this._showButtonsExplicitly ? 'show-buttons' : ''}"  
             @click=${async (e) => { 
            e.stopPropagation(); 
            // Navigate first
            await this._loadNext(); 
            // If buttons are showing, restart the 3s timer to auto-hide
            if (this._showButtonsExplicitly) { this._startActionButtonsHideTimer(); }
             }}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Next">
        </div>
      </div>
    `;
  }
  
  // V4: Pause indicator (copied from ha-media-card.js line 3830)
  _renderPauseIndicator() {
    // Only show in folder mode when paused
    if (!this._isPaused || !this.config.is_folder) {
      return html``;
    }
    
    return html`
      <div class="pause-indicator">⏸️</div>
    `;
  }

  // V4 CODE: Kiosk indicator (line 3847-3874)
  _renderKioskIndicator() {
    // Show kiosk exit hint if kiosk mode is configured, indicator is enabled, and kiosk mode is active
    if (!this._isKioskModeConfigured() || 
        this.config.kiosk_mode_show_indicator === false) {
      return html``;
    }

    // Only show hint when kiosk mode boolean is actually 'on'
    const entity = this.config.kiosk_mode_entity.trim();
    if (!this.hass?.states?.[entity] || this.hass.states[entity].state !== 'on') {
      return html``;
    }

    // Detect which gesture has toggle-kiosk action
    let actionText = null;
    if (this.config.tap_action?.action === 'toggle-kiosk') {
      actionText = 'Tap';
    } else if (this.config.hold_action?.action === 'toggle-kiosk') {
      actionText = 'Hold';
    } else if (this.config.double_tap_action?.action === 'toggle-kiosk') {
      actionText = 'Double-tap';
    }

    // Only show hint if a toggle-kiosk action is configured
    if (!actionText) return html``;
    
    return html`
      <div class="kiosk-exit-hint">
        ${actionText} to exit full-screen
      </div>
    `;
  }

  _renderControls() {
    // TODO: Implement proper navigation controls after refactoring to unified queue/history
    // For now, controls are disabled - only click zones work
    return html``;
  }

  /**
   * Render side panel (burst review, queue preview, history, etc.)
   */
  _renderPanel() {
    if (!this._panelOpen) return html``;

    return html`
      <div class="side-panel ${this._panelMode || ''}">
        ${this._renderPanelHeader()}
        ${this._renderThumbnailStrip()}
      </div>
    `;
  }

  /**
   * Render panel header with title and close button
   */
  _renderPanelHeader() {
    let title = 'Panel';
    let subtitle = '';

    if (this._panelMode === 'burst') {
      title = '📸 Burst Review';
      subtitle = `${this._panelQueue.length} photos in this moment`;
    } else if (this._panelMode === 'related') {
      title = '📅 Same Date';
      subtitle = `${this._panelQueue.length} media items from this date/time`;
    } else if (this._panelMode === 'on_this_day') {
      const today = new Date();
      const monthDay = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const currentYear = today.getFullYear();
      // Calculate year range from photos if available, otherwise show reasonable range
      let yearRange = '';
      if (this._panelQueue.length > 0) {
        const years = this._panelQueue.map(item => {
          const timestamp = item.date_taken || item.created_time;
          return new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp).getFullYear();
        }).filter(y => !isNaN(y));
        if (years.length > 0) {
          const minYear = Math.min(...years);
          const maxYear = Math.max(...years);
          yearRange = minYear === maxYear ? ` ${minYear}` : ` (${minYear}-${maxYear})`;
        }
      }
      title = `📆 ${monthDay} Through the Years${yearRange}`;
      subtitle = `${this._panelQueue.length} media items across years`;
    } else if (this._panelMode === 'queue') {
      title = '📋 Queue';
      const queueLength = this.navigationQueue?.length || 0;
      const currentPos = this.navigationIndex + 1;
      subtitle = `Position ${currentPos} of ${queueLength}`;
    } else if (this._panelMode === 'history') {
      title = '🕐 History';
      subtitle = `${this._panelQueue.length} recent items`;
    }

    return html`
      <div class="panel-header">
        ${this._panelMode === 'on_this_day' ? html`
          <!-- On This Day: Special layout with stacked elements -->
          <div class="panel-title">
            <div class="title-text">${title}</div>
          </div>
          <div class="panel-header-actions">
            <select 
              class="window-selector" 
              .value=${String(this._onThisDayWindowDays)}
              @change=${this._handleWindowSizeChange}
              title="Adjust date range">
              <option value="0">Exact</option>
              <option value="1">±1 day</option>
              <option value="3">±3 days</option>
              <option value="7">±1 week</option>
              <option value="14">±2 weeks</option>
            </select>
            <label class="randomize-checkbox" title="Randomize playback order">
              <input 
                type="checkbox" 
                .checked=${this._playRandomized}
                @change=${(e) => { this._playRandomized = e.target.checked; this.requestUpdate(); }}
              />
              <span>🎲 Randomize</span>
            </label>
            <button 
              class="panel-action-button" 
              @click=${this._playPanelItems} 
              title="Insert into queue and play">
              ▶️ Play These
            </button>
          </div>
          <button class="panel-close-button" @click=${this._exitPanelMode} title="Close panel">
            ✕
          </button>
          ${subtitle ? html`<div class="panel-subtitle-below">${subtitle}</div>` : ''}
        ` : html`
          <!-- Standard layout for other modes -->
          <div class="panel-title">
            <div class="title-text">${title}</div>
            ${subtitle ? html`<div class="subtitle-text">${subtitle}</div>` : ''}
          </div>
          <div class="panel-header-actions">
            ${(this._panelMode === 'burst' || this._panelMode === 'related') ? html`
              <label class="randomize-checkbox" title="Randomize playback order">
                <input 
                  type="checkbox" 
                  .checked=${this._playRandomized}
                  @change=${(e) => { this._playRandomized = e.target.checked; this.requestUpdate(); }}
                />
                <span>🎲 Randomize</span>
              </label>
              <button 
                class="panel-action-button" 
                @click=${this._playPanelItems} 
                title="Insert into queue and play">
                ▶️ Play These
              </button>
            ` : ''}
          </div>
          <button class="panel-close-button" @click=${this._exitPanelMode} title="Close panel">
            ✕
          </button>
        `}
      </div>
    `;
  }

  /**
   * V5.6: Calculate optimal number of thumbnails to display
   * Target 5-7 rows, adjust based on typical aspect ratio to avoid overlap
   */
  _calculateOptimalThumbnailCount(items) {
    // Target rows (will flex between 5-7 based on content)
    const targetMinRows = 5;
    const targetMaxRows = 7;
    const columns = 2;
    
    // Estimate aspect ratios from a sample of items
    // Use width/height from metadata if available
    const sampleSize = Math.min(20, items.length);
    const aspectRatios = [];
    
    for (let i = 0; i < sampleSize; i++) {
      const item = items[i];
      const width = item.width || item.image_width;
      const height = item.height || item.image_height;
      
      if (width && height) {
        aspectRatios.push(width / height);
      }
    }
    
    // Calculate median aspect ratio (more robust than average)
    let medianAspect = 4/3; // Default fallback
    if (aspectRatios.length > 0) {
      aspectRatios.sort((a, b) => a - b);
      const mid = Math.floor(aspectRatios.length / 2);
      medianAspect = aspectRatios.length % 2 === 0
        ? (aspectRatios[mid - 1] + aspectRatios[mid]) / 2
        : aspectRatios[mid];
    }
    
    // Determine row count based on median aspect ratio
    // Portrait photos (< 1.0): Use more rows (7) since they're taller
    // Square photos (~1.0): Use middle rows (6)
    // Landscape photos (> 1.33): Use fewer rows (5) since they're wider
    let targetRows;
    if (medianAspect < 0.9) {
      targetRows = targetMaxRows; // Portrait-heavy: 7 rows
    } else if (medianAspect < 1.1) {
      targetRows = 6; // Square-ish: 6 rows
    } else {
      targetRows = targetMinRows; // Landscape: 5 rows
    }
    
    return targetRows * columns;
  }

  /**
   * Render horizontal thumbnail strip with time badges
   */
  _renderThumbnailStrip() {
    // For queue mode, read directly from navigationQueue
    const allItems = this._panelMode === 'queue' ? this.navigationQueue : this._panelQueue;
    
    if (!allItems || allItems.length === 0) {
      return html`
        <div class="thumbnail-strip">
          <div class="no-items">No items in ${this._panelMode || 'panel'}</div>
        </div>
      `;
    }

    // V5.6: Calculate optimal thumbnail size to fit 5-7 rows without overlap
    // Based on available height and median aspect ratio of content
    const maxDisplay = this._calculateOptimalThumbnailCount(allItems);
    
    // Initialize unified page start index
    if (this._panelPageStartIndex === undefined || this._panelPageStartIndex === null) {
      if (this._panelMode === 'queue') {
        this._panelPageStartIndex = this.navigationIndex;
      } else {
        this._panelPageStartIndex = 0; // Start at beginning for burst/related
      }
    }
    
    // Auto-adjust page for queue mode only (burst/related stay on current page)
    if (this._panelMode === 'queue' && !this._manualPageChange) {
      const currentPageEnd = this._panelPageStartIndex + maxDisplay;
      
      if (this.navigationIndex < this._panelPageStartIndex) {
        // Navigated backward beyond current page
        this._panelPageStartIndex = Math.max(0, this.navigationIndex - maxDisplay + 1);
      } else if (this.navigationIndex >= currentPageEnd) {
        // Navigated forward beyond current page
        this._panelPageStartIndex = this.navigationIndex;
      }
    }
    
    const displayStartIndex = this._panelPageStartIndex;
    const displayItems = allItems.slice(displayStartIndex, displayStartIndex + maxDisplay);

    // Calculate if we have previous/next pages
    // For queue mode: show buttons only when multiple pages exist (allows wrapping/cycling)
    // For other modes: only show when there are more pages
    const hasMultiplePages = allItems.length > maxDisplay;
    const hasPreviousPage = this._panelMode === 'queue' ? hasMultiplePages : displayStartIndex > 0;
    const hasNextPage = this._panelMode === 'queue' ? hasMultiplePages : (displayStartIndex + displayItems.length) < allItems.length;
    
    // V5.6: Calculate thumbnail height to fit rows in available space
    // Assumes panel height ~70% of viewport, header ~80px, padding/gap ~150px total
    const viewportHeight = window.innerHeight;
    const availableHeight = (viewportHeight * 0.7) - 230; // Conservative estimate
    const rows = maxDisplay / 2; // 2 columns
    const gapSpace = (rows - 1) * 16; // 16px gap between rows
    const thumbnailHeight = Math.max(100, Math.min(200, (availableHeight - gapSpace) / rows));

    // Resolve all thumbnail URLs upfront (async but doesn't block render)
    displayItems.forEach(async (item) => {
      if (!item._resolvedUrl && !item._resolving) {
        item._resolving = true;
        try {
          // For queue mode, use media_content_id directly; for burst mode, construct from path
          const mediaUri = item.media_source_uri 
            || item.media_content_id 
            || `media-source://media_source${item.path}`;
          const resolved = await this.hass.callWS({
            type: 'media_source/resolve_media',
            media_content_id: mediaUri,
            expires: 3600
          });
          item._resolvedUrl = resolved.url;
          this.requestUpdate();
        } catch (error) {
          console.error('Failed to resolve thumbnail:', error);
        } finally {
          item._resolving = false;
        }
      }
    });

    return html`
      <div class="thumbnail-strip" style="--thumbnail-height: ${thumbnailHeight}px">
        ${hasPreviousPage ? html`
          <button class="page-nav-button prev-page" @click=${() => this._pageQueueThumbnails('prev')}>
            <ha-icon icon="mdi:chevron-up"></ha-icon>
            <div class="page-nav-label">Previous</div>
          </button>
        ` : ''}
        
        ${displayItems.map((item, displayIndex) => {
          const actualIndex = displayStartIndex + displayIndex;
          const isActive = this._panelMode === 'queue' 
            ? actualIndex === this.navigationIndex 
            : actualIndex === this._panelQueueIndex;
          const itemUri = item.media_source_uri || item.media_content_id || item.path;
          // Check multiple sources for favorite status (check rating too - 5 stars = favorite)
          // Queue items store metadata inside item.metadata object
          const isFavoriteFlag = (value) =>
            value === true ||
            value === 1 ||
            value === 'true' ||
            value === '1';
          const isFavorited = isFavoriteFlag(item.is_favorited) ||
                              item.rating === 5 ||
                              isFavoriteFlag(item.metadata?.is_favorited) ||
                              item.metadata?.rating === 5 ||
                              this._burstFavoritedFiles.includes(itemUri) ||
                              (this.currentMedia?.media_content_id === itemUri &&
                                isFavoriteFlag(this.currentMedia?.metadata?.is_favorited));
          
          // Format badge based on mode
          let badge = '';
          if (this._panelMode === 'burst' && item.seconds_offset !== undefined) {
            // Time offset for burst mode
            const absSeconds = Math.abs(item.seconds_offset);
            if (absSeconds < 1) {
              badge = '0s';
            } else if (absSeconds < 60) {
              badge = `${Math.round(absSeconds)}s`;
            } else {
              const minutes = Math.floor(absSeconds / 60);
              const seconds = Math.round(absSeconds % 60);
              badge = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
            }
            // Add sign prefix
            if (item.seconds_offset > 0) badge = `+${badge}`;
            else if (item.seconds_offset < 0) badge = `-${badge}`;
          } else if (this._panelMode === 'queue') {
            // Position indicator for queue mode
            const queuePos = actualIndex + 1;
            const queueTotal = allItems.length;
            badge = `${queuePos}/${queueTotal}`;
          }

          const isVideo = this._isVideoItem(item);
          const videoThumbnailTime = this.config.video_thumbnail_time || 1;
          const isVideoLoaded = isVideo && this._isVideoThumbnailLoaded(item);
          
          return html`
            <div 
              class="thumbnail ${isActive ? 'active' : ''} ${isFavorited ? 'favorited' : ''}"
              @click=${() => this._panelMode === 'queue' ? this._jumpToQueuePosition(actualIndex) : this._loadPanelItem(actualIndex)}
              title="${item.filename || item.path}"
            >
              ${item._resolvedUrl ? (
                isVideo ? html`
                  <video 
                    class="thumbnail-video ${isVideoLoaded ? 'loaded' : ''}"
                    preload="metadata"
                    muted
                    playsinline
                    disablepictureinpicture
                    @click=${(e) => e.preventDefault()}
                    @play=${(e) => e.target.pause()}
                    src="${item._resolvedUrl}#t=${videoThumbnailTime}"
                    @loadeddata=${(e) => this._handleVideoThumbnailLoaded(e, item)}
                    @error=${() => console.warn('Video thumbnail failed to load:', item.filename)}
                  ></video>
                  <div class="video-icon-overlay">🎞️</div>
                ` : html`
                  <img src="${item._resolvedUrl}" alt="${item.filename || 'Thumbnail'}" />
                `
              ) : html`
                <div class="thumbnail-loading">⏳</div>
              `}
              ${badge ? html`<div class="time-badge">${badge}</div>` : ''}
              ${isFavorited ? html`<div class="favorite-badge">♥</div>` : ''}
            </div>
          `;
        })}
        
        ${hasNextPage ? html`
          <button class="page-nav-button next-page" @click=${() => this._pageQueueThumbnails('next')}>
            <div class="page-nav-label">Next</div>
            <ha-icon icon="mdi:chevron-down"></ha-icon>
          </button>
        ` : ''}
      </div>
    `;
  }
}

/**
 * MediaCardEditor - Card editor with full functionality
 * Will be adapted for v5 architecture in next phase
 */
