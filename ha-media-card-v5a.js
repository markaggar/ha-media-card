/**
 * Media Card v5a - Clean Rebuild
 * V4 editor with full functionality, ready for v5 enhancements
 */

// Import Lit from CDN for standalone usage
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

// Shared utility functions for media detection
const MediaUtils = {
  detectFileType(filePath) {
    if (!filePath) return null;
    
    let cleanPath = filePath;
    if (filePath.includes('?')) {
      cleanPath = filePath.split('?')[0];
    }
    
    const fileName = cleanPath.split('/').pop() || cleanPath;
    let cleanFileName = fileName;
    if (fileName.endsWith('_shared')) {
      cleanFileName = fileName.replace('_shared', '');
    }
    
    const extension = cleanFileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    return null;
  }
};

/**
 * V5 Core Infrastructure Classes
 * Phase 1A: Foundation for provider pattern
 */

/**
 * MediaQueue - Unified queue management for all providers
 * Based on SubfolderQueue pattern from V4 (lines 6658-6750)
 */
class MediaQueue {
  constructor() {
    this.items = [];              // Queue of media items to show
    this.shownItems = new Set();  // Blacklist of already shown items
    this.currentIndex = 0;        // For sequential modes
  }

  /**
   * Add single item to queue if not already present
   */
  add(item) {
    if (!this.items.find(i => i.media_content_id === item.media_content_id)) {
      this.items.push(item);
    }
  }

  /**
   * Add multiple items to queue
   */
  addBatch(items) {
    items.forEach(item => this.add(item));
  }

  /**
   * Get next unshown item from queue
   * Returns null if all items shown or queue empty
   */
  getNext() {
    // Find first unshown item
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!this.shownItems.has(item.media_content_id)) {
        this.shownItems.add(item.media_content_id);
        return item;
      }
    }
    return null; // All items shown or queue empty
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Check if queue needs refilling
   */
  needsRefill() {
    const unshownCount = this.items.filter(
      item => !this.shownItems.has(item.media_content_id)
    ).length;
    return unshownCount < 10; // Refill when less than 10 unshown items
  }

  /**
   * Clear the shown items blacklist
   */
  clearShownItems() {
    this.shownItems.clear();
  }

  /**
   * Serialize queue state for reconnection
   */
  serialize() {
    return {
      items: this.items,
      shownItems: Array.from(this.shownItems),
      currentIndex: this.currentIndex
    };
  }

  /**
   * Restore queue state from serialized data
   */
  deserialize(data) {
    this.items = data.items || [];
    this.shownItems = new Set(data.shownItems || []);
    this.currentIndex = data.currentIndex || 0;
  }
}

/**
 * NavigationHistory - Unified navigation history for all providers
 * Based on main card _navigationHistory from V4 (lines 102, 1560, 6204-6220)
 * Fixes dual history bug in SubfolderQueue reconnection
 */
class NavigationHistory {
  constructor(maxSize = 100) {
    this.items = [];        // Array of media items shown
    this.currentIndex = -1; // Current position in history (-1 = at latest)
    this.maxSize = maxSize;
  }

  /**
   * Add item to history
   * Truncates future history if user navigated back then forward
   */
  add(item) {
    // If we're in the middle of history, truncate future
    if (this.currentIndex < this.items.length - 1) {
      this.items = this.items.slice(0, this.currentIndex + 1);
    }
    
    this.items.push(item);
    
    // Limit history size
    if (this.items.length > this.maxSize) {
      this.items.shift();
    }
    
    this.currentIndex = this.items.length - 1;
  }

  /**
   * Navigate to previous item in history
   * Returns null if at beginning
   */
  previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.items[this.currentIndex];
    }
    return null;
  }

  /**
   * Navigate to next item in history
   * Returns null if at end
   */
  next() {
    if (this.currentIndex < this.items.length - 1) {
      this.currentIndex++;
      return this.items[this.currentIndex];
    }
    return null;
  }

  /**
   * Get current item without changing position
   */
  getCurrent() {
    if (this.currentIndex >= 0 && this.currentIndex < this.items.length) {
      return this.items[this.currentIndex];
    }
    return null;
  }

  /**
   * Check if we can go backward
   */
  canGoBack() {
    return this.currentIndex > 0;
  }

  /**
   * Check if we can go forward
   */
  canGoForward() {
    return this.currentIndex < this.items.length - 1;
  }

  /**
   * Get history size
   */
  getSize() {
    return this.items.length;
  }

  /**
   * Serialize history for reconnection
   */
  serialize() {
    return {
      items: this.items,
      currentIndex: this.currentIndex
    };
  }

  /**
   * Restore history from serialized data
   */
  deserialize(data) {
    this.items = data.items || [];
    this.currentIndex = data.currentIndex !== undefined ? data.currentIndex : -1;
  }
}

/**
 * MediaProvider - Base class for all media providers
 * All providers must implement: initialize(), getNext(), getPrevious()
 */
class MediaProvider {
  constructor(config, hass) {
    this.config = config;
    this.hass = hass;
    this.isPaused = false;
  }

  /**
   * Initialize provider (load initial data, scan folders, etc.)
   * Must be implemented by subclasses
   * @returns {Promise<boolean>} true if initialization successful
   */
  async initialize() {
    throw new Error('MediaProvider.initialize() must be implemented by subclass');
  }

  /**
   * Get next media item
   * Must be implemented by subclasses
   * @returns {Promise<Object|null>} media item or null if none available
   */
  async getNext() {
    throw new Error('MediaProvider.getNext() must be implemented by subclass');
  }

  /**
   * Get previous media item (uses external NavigationHistory)
   * Must be implemented by subclasses
   * @returns {Promise<Object|null>} media item or null if none available
   */
  async getPrevious() {
    throw new Error('MediaProvider.getPrevious() must be implemented by subclass');
  }

  /**
   * Pause provider activity (stop scanning, timers, etc.)
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resume provider activity
   */
  resume() {
    this.isPaused = false;
  }

  /**
   * V5: Check if media_index integration is active
   * Active if enabled flag is true OR entity_id is provided (implicit enablement)
   */
  static isMediaIndexActive(config) {
    return !!(config?.media_index?.enabled || config?.media_index?.entity_id);
  }

  /**
   * Serialize provider state for reconnection
   * Override in subclass to save provider-specific state
   */
  serialize() {
    return {
      isPaused: this.isPaused
    };
  }

  /**
   * Restore provider state from serialized data
   * Override in subclass to restore provider-specific state
   */
  deserialize(data) {
    this.isPaused = data.isPaused || false;
  }
}

/**
 * MediaIndexHelper - Shared utility for media_index integration
 * V5: Provides unified metadata fetching for all providers
 */
class MediaIndexHelper {
  /**
   * Fetch EXIF metadata from media_index backend for a single file
   * This is a NEW v5 feature - V4 only gets metadata via get_random_items
   */
  static async fetchFileMetadata(hass, config, filePath) {
    if (!hass || !MediaProvider.isMediaIndexActive(config)) return null;
    
    // V4: Strip media-source:// prefix before sending to media_index
    // Backend expects: /media/Photo/PhotoLibrary/New/file.jpg
    // Not: media-source://media_source/media/Photo/PhotoLibrary/New/file.jpg
    let cleanPath = filePath;
    if (cleanPath.startsWith('media-source://media_source')) {
      cleanPath = cleanPath.replace('media-source://media_source', '');
    }
    
    try {
      // Build WebSocket call to get_file_metadata service
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_file_metadata',
        service_data: {
          file_path: cleanPath  // Use cleaned path
        },
        return_response: true
      };
      
      // If user specified a media_index entity, add target to route to correct instance
      if (config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: config.media_index.entity_id
        };
      }
      
      const wsResponse = await hass.callWS(wsCall);
      
      // DEBUG: Log the actual response structure
      console.log('📡 WebSocket response from get_file_metadata:', wsResponse);
      
      // WebSocket response can be wrapped in different ways
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;
      console.log('📦 Unwrapped response:', response);
      
      // get_file_metadata returns EXIF data nested under response.exif
      // Unlike get_random_items which flattens fields to top level
      // Response structure: {id, path, filename, folder, exif: {date_taken, location_city, ...}}
      if (response) {
        const exif = response.exif || {};
        
        // Flatten EXIF data to match V4's get_random_items format
        return {
          // EXIF date/time (from nested exif object)
          date_taken: exif.date_taken,
          created_time: response.created_time, // Top level
          
          // GPS coordinates (from nested exif object)
          latitude: exif.latitude,
          longitude: exif.longitude,
          
          // Geocoded location (from nested exif object)
          location_city: exif.location_city,
          location_state: exif.location_state,
          location_country: exif.location_country,
          location_country_code: exif.location_country_code,
          location_name: exif.location_name,
          
          // Geocoding status - infer from presence of data
          has_coordinates: !!(exif.latitude && exif.longitude),
          is_geocoded: !!(exif.location_city || exif.location_state || exif.location_country),
          
          // Camera info (from nested exif object)
          camera_make: exif.camera_make,
          camera_model: exif.camera_model,
          
          // User flags (from nested exif object, convert 0/1 to boolean)
          is_favorited: exif.is_favorited === 1 || response.is_favorited === 1,
          marked_for_edit: false, // Not in get_file_metadata response
          
          // File info from top level
          filename: response.filename,
          folder: response.folder
        };
      }
      
      return null;
    } catch (error) {
      console.warn('MediaIndexHelper: Error fetching file metadata:', error);
      return null;
    }
  }
  
  /**
   * Parse metadata from get_random_items response (V4 pattern)
   * Transforms backend response into consistent metadata format
   */
  static parseRandomItemMetadata(item) {
    return {
      // File paths
      path: item.path,
      filename: item.filename || item.path?.split('/').pop(),
      folder: item.folder || item.path?.substring(0, item.path.lastIndexOf('/')),
      
      // EXIF date/time
      date_taken: item.date_taken,
      created_time: item.created_time,
      
      // GPS coordinates
      latitude: item.latitude,
      longitude: item.longitude,
      
      // Geocoded location
      location_city: item.location_city,
      location_state: item.location_state,
      location_country: item.location_country,
      location_country_code: item.location_country_code,
      location_name: item.location_name,
      
      // Geocoding status
      has_coordinates: item.has_coordinates || false,
      is_geocoded: item.is_geocoded || false,
      
      // Camera info
      camera_make: item.camera_make,
      camera_model: item.camera_model,
      
      // User flags
      is_favorited: item.is_favorited || false,
      marked_for_edit: item.marked_for_edit || false
    };
  }
}

/**
 * SingleMediaProvider - Provider for single image/video
 * Phase 2: Simplest provider to validate architecture
 */
class SingleMediaProvider extends MediaProvider {
  constructor(config, hass) {
    super(config, hass);
    this.mediaPath = config.single_media?.path || config.media_path;
    this.refreshSeconds = config.single_media?.refresh_seconds || 0;
    this.currentItem = null;
  }

  async initialize() {
    // Extract basic metadata from path
    let metadata = this._extractMetadataFromPath(this.mediaPath);
    console.log('📊 Path-based metadata:', metadata);
    
    // DEBUG: Log media_index config
    console.log('🔍 Checking media_index config:', {
      hasMediaIndex: !!this.config.media_index,
      enabled: this.config.media_index?.enabled,
      entityId: this.config.media_index?.entity_id,
      fullConfig: this.config.media_index,
      hasHass: !!this.hass
    });
    
    // V5: Fetch rich EXIF metadata from media_index if enabled (using shared helper)
    // V4 pattern: enabled flag OR presence of entity_id means integration is active
    if (MediaProvider.isMediaIndexActive(this.config) && this.hass) {
      console.log('🔍 media_index active - fetching EXIF metadata for:', this.mediaPath);
      try {
        const enrichedMetadata = await MediaIndexHelper.fetchFileMetadata(
          this.hass, 
          this.config, 
          this.mediaPath
        );
        console.log('📊 EXIF metadata from media_index:', enrichedMetadata);
        if (enrichedMetadata) {
          // Merge EXIF metadata with path-based metadata
          metadata = { ...metadata, ...enrichedMetadata };
          console.log('📊 Merged metadata:', metadata);
        }
      } catch (error) {
        console.warn('Failed to fetch media_index metadata:', error);
        // Continue with path-based metadata
      }
    } else {
      console.log('⏭️ media_index not enabled or no hass - using path-based metadata only');
    }
    
    this.currentItem = {
      media_content_id: this.mediaPath,
      title: this._extractFilename(this.mediaPath),
      media_content_type: this._detectMediaType(this.mediaPath),
      metadata: metadata  // Path-based + optional EXIF metadata
    };
    return true;
  }

  async getNext() {
    // Single media mode - always return same item
    // Optional: refresh URL for camera snapshots
    if (this.refreshSeconds > 0) {
      await this._refreshMediaUrl();
    }
    return this.currentItem;
  }

  async getPrevious() {
    // Single media mode - always return same item
    return this.currentItem;
  }

  _extractFilename(path) {
    return path.split('/').pop() || path;
  }

  _detectMediaType(path) {
    const type = MediaUtils.detectFileType(path);
    return type === 'video' ? 'video' : 'image';
  }
  
  // V4: Extract metadata from file path
  _extractMetadataFromPath(mediaPath) {
    if (!mediaPath) return {};
    
    const metadata = {};
    
    // Extract filename and clean it up
    const pathParts = mediaPath.split('/');
    let filename = pathParts[pathParts.length - 1];
    
    // Decode URL encoding (%20 -> space, etc.)
    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      console.warn('Failed to decode filename:', filename, e);
    }
    
    metadata.filename = filename;
    
    // Extract folder path (parent directory/directories)
    if (pathParts.length > 1) {
      // Find where the actual media path starts (skip /media/ prefix)
      let folderStart = 0;
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (pathParts[i] === 'media' && i + 1 < pathParts.length && pathParts[i + 1] !== '') {
          folderStart = i + 1;
          break;
        }
      }
      
      // Extract folder parts (everything between media prefix and filename)
      if (folderStart < pathParts.length - 1) {
        const folderParts = pathParts.slice(folderStart, -1);
        
        // Decode URL encoding for each folder part
        const decodedParts = folderParts.map(part => {
          try {
            return decodeURIComponent(part);
          } catch (e) {
            console.warn('Failed to decode folder part:', part, e);
            return part;
          }
        });
        
        // Store as relative path (e.g., "Photo/OneDrive/Mark-Pictures/Camera")
        metadata.folder = decodedParts.join('/');
      }
    }
    
    // Try to extract date from filename (basic support - full EXIF will come from media_index)
    const dateFromFilename = this._extractDateFromFilename(filename);
    if (dateFromFilename) {
      metadata.date = dateFromFilename;
    }
    
    return metadata;
  }
  
  _extractDateFromFilename(filename) {
    if (!filename) return null;
    
    // Common date patterns in filenames
    const patterns = [
      // YYYY-MM-DD format
      /(\d{4})-(\d{2})-(\d{2})/,
      // YYYYMMDD format
      /(\d{4})(\d{2})(\d{2})/,
      // DD-MM-YYYY format
      /(\d{2})-(\d{2})-(\d{4})/
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        try {
          if (match[1].length === 4) {
            // YYYY-MM-DD or YYYYMMDD
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          } else {
            // DD-MM-YYYY
            return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
          }
        } catch (e) {
          // Invalid date, continue to next pattern
        }
      }
    }
    
    return null;
  }

  async _refreshMediaUrl() {
    // Force URL refresh by adding timestamp (useful for camera snapshots)
    const timestamp = Date.now();
    this.currentItem.media_content_id = this.mediaPath + (this.mediaPath.includes('?') ? '&' : '?') + `t=${timestamp}`;
  }

  serialize() {
    return {
      mediaPath: this.mediaPath,
      currentItem: this.currentItem
    };
  }

  deserialize(data) {
    this.mediaPath = data.mediaPath;
    this.currentItem = data.currentItem;
  }
}

/**
 * MediaCardV5a - Main card component
 * Phase 2: Now uses provider pattern to display media
 */
/**
 * MediaCardV5a - Main card component
 * Phase 2: Now uses provider pattern to display media
 */
class MediaCardV5a extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    currentMedia: { state: true },
    mediaUrl: { state: true },
    isLoading: { state: true }
  };

  // V4: Image Zoom Helpers
  _handleImageZoomClick(e) {
    // Only for images and when enabled
    if (this.currentMedia?.media_content_type !== 'image') return;
    if (this.config.enable_image_zoom !== true) return;

    // If user configured tap_action, don't intercept
    if (this.config.tap_action) return;

    // Determine click point as percent within image container
    const container = e.currentTarget;
    const img = container.querySelector('img');
    if (!img) return;

    // Toggle zoom state
    if (this._isImageZoomed) {
      this._resetZoom(img);
      return;
    }

    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Use configured zoom level with bounds
    const level = Math.max(1.5, Math.min(5.0, this.config.zoom_level || this._zoomLevel));
    this._zoomToPoint(img, x, y, level);
  }

  _handleImageZoomTouchEnd(e) {
    // Treat touch end as click for simplicity
    if (e.changedTouches && e.changedTouches.length) {
      const touch = e.changedTouches[0];
      // Synthesize a click-like event object
      const synthetic = {
        currentTarget: e.currentTarget,
        clientX: touch.clientX,
        clientY: touch.clientY,
      };
      this._handleImageZoomClick(synthetic);
    }
  }

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
    return document.createElement('media-card-v5a-editor');
  }

  static getStubConfig() {
    return {
      media_path: '',
      title: '',
      media_type: 'all'
    };
  }

  constructor() {
    super();
    this.provider = null;
    this.history = new NavigationHistory();
    this.currentMedia = null;
    this.mediaUrl = '';
    this.isLoading = false;
    this._cardId = 'card-' + Math.random().toString(36).substr(2, 9);
    this._retryAttempts = new Map(); // Track retry attempts per URL (V4)
    this._errorState = null; // V4 error state tracking
    this._currentMetadata = null; // V4 metadata tracking for action buttons/display
    this._currentMediaPath = null; // V4 current file path for action buttons
    this._tapTimeout = null; // V4 tap action double-tap detection
    this._holdTimeout = null; // V4 hold action detection
    this._debugMode = true; // V4 debug logging (configurable via config.debug_mode)
    this._lastLogTime = {}; // V4 log throttling
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    this._log('🔌 Component disconnected - cleaning up resources');
    
    // V4: Stop auto-refresh interval to prevent zombie card
    if (this._refreshInterval) {
      this._log('🛑 Clearing auto-refresh interval:', this._refreshInterval);
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

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this._log('📝 setConfig called with:', config);
    this.config = config;
    
    // V4: Set debug mode from config
    this._debugMode = this.config.debug_mode === true;
    
    // Set aspect ratio mode data attribute for CSS styling (from V4)
    const aspectMode = config.aspect_mode || 'default';
    if (aspectMode !== 'default') {
      this.setAttribute('data-aspect-mode', aspectMode);
    } else {
      this.removeAttribute('data-aspect-mode');
    }
  }

  set hass(hass) {
    const hadHass = !!this._hass;
    this._hass = hass;
    
    this._log('💎 hass setter called. Had hass before:', hadHass, 'Has provider:', !!this.provider);
    
    // Initialize provider when hass is first set
    if (hass && !this.provider) {
      this._log('💎 Triggering provider initialization');
      this._initializeProvider();
    }
  }

  get hass() {
    return this._hass;
  }

  async _initializeProvider() {
    if (!this.config || !this.hass) {
      this._log('Cannot initialize - missing config or hass');
      return;
    }

    // Auto-detect media source type if not set
    let type = this.config.media_source_type;
    if (!type) {
      if (this.config.media_path) {
        type = 'single_media';
        this._log('Auto-detected single_media mode from media_path');
      } else {
        console.error('[MediaCardV5a] No media_source_type or media_path configured');
        return;
      }
    }

    this._log('Initializing provider:', type, 'Config:', this.config);
    
    try {
      switch(type) {
        case 'single_media':
          this.provider = new SingleMediaProvider(this.config, this.hass);
          break;
        
        // More providers in future phases
        default:
          console.warn('[MediaCardV5a] Unknown media source type:', type, '- defaulting to single_media');
          this.provider = new SingleMediaProvider(this.config, this.hass);
      }

      // Initialize provider
      this.isLoading = true;
      this._log('Calling provider.initialize()');
      const success = await this.provider.initialize();
      this._log('Provider initialized:', success);
      
      if (success) {
        this._log('Loading first media');
        await this._loadNext();
      } else {
        console.error('[MediaCardV5a] Provider initialization failed');
      }
    } catch (error) {
      console.error('[MediaCardV5a] Error initializing provider:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async _loadNext() {
    if (!this.provider) {
      this._log('_loadNext called but no provider');
      return;
    }

    try {
      this._log('Getting next item from provider');
      const item = await this.provider.getNext();
      this._log('Got item:', item);
      
      if (item) {
        this.history.add(item);
        this.currentMedia = item;
        this._log('Set currentMedia:', this.currentMedia);
        
        // V4: Set metadata for action buttons and display
        this._currentMediaPath = item.media_content_id;
        this._currentMetadata = item.metadata || null;
        
        await this._resolveMediaUrl();
        this.requestUpdate(); // Force re-render
      } else {
        console.warn('[MediaCardV5a] Provider returned null item');
      }
    } catch (error) {
      console.error('[MediaCardV5a] Error loading next media:', error);
    }
  }

  async _loadPrevious() {
    if (!this.provider) {
      this._log('_loadPrevious called but no provider');
      return;
    }

    try {
      this._log('Getting previous item from history');
      const item = this.history.previous();
      this._log('Got history item:', item);
      
      if (item) {
        this.currentMedia = item;
        this._log('Set currentMedia from history:', this.currentMedia);
        
        // V4: Set metadata for action buttons and display
        this._currentMediaPath = item.media_content_id;
        this._currentMetadata = item.metadata || null;
        
        await this._resolveMediaUrl();
        this.requestUpdate(); // Force re-render
      } else {
        console.warn('[MediaCardV5a] No previous item in history');
      }
    } catch (error) {
      console.error('[MediaCardV5a] Error loading previous media:', error);
    }
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

  async _resolveMediaUrl() {
    if (!this.currentMedia || !this.hass) {
      this._log('Cannot resolve URL - missing currentMedia or hass');
      return;
    }

    const mediaId = this.currentMedia.media_content_id;
    this._log('Resolving media URL for:', mediaId);
    
    // If already a full URL, use it
    if (mediaId.startsWith('http')) {
      this._log('Using direct HTTP URL');
      this.mediaUrl = mediaId;
      this.requestUpdate();
      return;
    }

    // If media-source:// format, resolve through HA API
    if (mediaId.startsWith('media-source://')) {
      try {
        this._log('Resolving media-source:// URL via HA API');
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaId,
          expires: (60 * 60 * 3) // 3 hours
        });
        this._log('Resolved to:', resolved.url);
        this.mediaUrl = resolved.url;
        this.requestUpdate();
      } catch (error) {
        console.error('[MediaCardV5a] Failed to resolve media URL:', error);
        this.mediaUrl = '';
        this.requestUpdate();
      }
      return;
    }

    // If /media/ path, convert to media-source://
    if (mediaId.startsWith('/media/')) {
      const mediaSourceId = 'media-source://media_source' + mediaId;
      this._log('Converting /media/ to media-source://', mediaSourceId);
      try {
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaSourceId,
          expires: (60 * 60 * 3)
        });
        this._log('Resolved to:', resolved.url);
        this.mediaUrl = resolved.url;
        this.requestUpdate();
      } catch (error) {
        console.error('[MediaCardV5a] Failed to resolve media URL:', error);
        this.mediaUrl = '';
        this.requestUpdate();
      }
      return;
    }

    // Fallback: use as-is
    this._log('Using media ID as-is (fallback)');
    this.mediaUrl = mediaId;
    this.requestUpdate();
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
      console.warn('[MediaCardV5a] Media error event has null target - element may have been destroyed');
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
    if (!is404) {
      console.error('[MediaCardV5a] Media failed to load:', this.mediaUrl, e);
    } else {
      this._log('📭 Media file not found (404) - likely deleted/moved:', this.mediaUrl);
    }
    
    // Add specific handling for Synology DSM authentication errors
    const isSynologyUrl = this.mediaUrl && this.mediaUrl.includes('/synology_dsm/') && this.mediaUrl.includes('authSig=');
    if (isSynologyUrl) {
      errorMessage = 'Synology DSM authentication expired - try refreshing';
      console.warn('[MediaCardV5a] Synology DSM URL authentication may have expired:', this.mediaUrl);
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
      
      console.log(`[MediaCardV5a] 🔄 Auto-retrying failed URL (attempt ${retryCount + 1}/${maxAutoRetries}):`, currentUrl.substring(0, 50) + '...');
      
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
            console.error('[MediaCardV5a] URL refresh attempt failed:', err);
            this._showMediaError(errorMessage, isSynologyUrl);
          });
      } else {
        // For folder/queue modes, will implement later
        this._showMediaError(errorMessage, isSynologyUrl);
      }
    } else {
      // Already tried to retry this URL, show error immediately
      console.log(`[MediaCardV5a] ❌ Max auto-retries reached for URL:`, currentUrl.substring(0, 50) + '...');
      this._showMediaError(errorMessage, isSynologyUrl);
    }
  }
  
  async _attemptUrlRefresh(forceRefresh = false) {
    this._log('🔄 Attempting URL refresh due to media load failure');
    
    try {
      // For single media mode, re-resolve the media URL
      if (this.config.media_source_type === 'single_media' && this.currentMedia) {
        await this._resolveMediaUrl(this.currentMedia.media_content_id);
        // Clear retry attempts for the new URL
        if (this._retryAttempts.has(this.mediaUrl)) {
          this._retryAttempts.delete(this.mediaUrl);
        }
        this._errorState = null; // Clear error state
        this.requestUpdate();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[MediaCardV5a] Failed to refresh URL:', error);
      return false;
    }
  }
  
  _showMediaError(errorMessage, isSynologyUrl = false) {
    console.error('[MediaCardV5a] Showing media error:', errorMessage);
    this._errorState = {
      message: errorMessage,
      isSynologyUrl: isSynologyUrl
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
    this._log('Video started loading:', this.mediaUrl);
    // Reset video wait timer for new video
    this._videoWaitStartTime = null;
  }

  _onVideoCanPlay() {
    this._log('Video can start playing:', this.mediaUrl);
  }

  _onVideoPlay() {
    this._log('Video started playing:', this.mediaUrl);
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
    
    // Only pause slideshow if video was manually paused (not ended)
    const videoElement = this.renderRoot?.querySelector('video');
    if (videoElement && !videoElement.ended && !this._isPaused) {
      this._log('🎬 Video manually paused - pausing slideshow');
      this._pausedByVideo = true;
      this._setPauseState(true);
    }
  }

  _onVideoEnded() {
    this._log('Video ended:', this.mediaUrl);
    // Reset video wait timer when video ends
    this._videoWaitStartTime = null;
    
    // V5: For single media with auto-refresh, reload after video ends
    // For folder mode (future), trigger next media
    // Will implement folder mode advancement in Phase 3+
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
      this._log('Video muted state applied:', video.muted);
    }
  }

  _onMediaLoaded() {
    // V4: Only log once when media initially loads
    if (!this._mediaLoadedLogged) {
      this._log('Media loaded successfully:', this.mediaUrl);
      this._mediaLoadedLogged = true;
    }
    
    // V5: Clear error state and retry attempts on successful load
    this._errorState = null;
    if (this._retryAttempts.has(this.mediaUrl)) {
      this._retryAttempts.delete(this.mediaUrl);
    }
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

    const position = this.config.metadata.position || 'bottom-left';
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
      parts.push(`📁 ${folderDisplay}`);
    }
    
    if (this.config.metadata.show_filename && metadata.filename) {
      parts.push(`📄 ${metadata.filename}`);
    }
    
    // Show date with fallback priority: date_taken (EXIF) -> created_time (file metadata) -> date (filesystem)
    if (this.config.metadata.show_date) {
      let date = null;
      let dateSource = null;
      
      // Priority 1: EXIF date_taken if available (from media_index)
      if (metadata.date_taken) {
        dateSource = 'date_taken';
        
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
        dateSource = 'created_time';
        
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
        dateSource = 'filesystem';
        date = metadata.date;
      }
      
      if (date && !isNaN(date.getTime())) {
        // Use Home Assistant's locale for date formatting
        const locale = this.hass?.locale?.language || this.hass?.language || navigator.language || 'en-US';
        parts.push(`📅 ${date.toLocaleDateString(locale)}`);
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
        }
      } else if (metadata.has_coordinates && !metadata.is_geocoded) {
        // Item has GPS coordinates but hasn't been geocoded yet
        parts.push(`📍 Loading location...`);
      }
    }
    
    return parts.join(' • ');
  }
  
  // V4: Format folder path for display
  _formatFolderForDisplay(fullFolderPath, showRoot) {
    if (!fullFolderPath) return '';
    
    // Extract the scan path prefix from config.media_path or config.single_media.path
    // e.g., "media-source://media_source/media/Photo/OneDrive" -> "/media/Photo/OneDrive"
    let scanPrefix = '';
    const mediaPath = this.config?.single_media?.path || this.config?.media_path;
    if (mediaPath) {
      const match = mediaPath.match(/media-source:\/\/media_source(\/.+)/);
      if (match) {
        scanPrefix = match[1];
      }
    }
    
    // Remove the scan prefix from the folder path
    // e.g., "/media/Photo/OneDrive/Mark-Pictures/Camera" -> "Mark-Pictures/Camera"
    let relativePath = fullFolderPath;
    if (scanPrefix && fullFolderPath.startsWith(scanPrefix)) {
      relativePath = fullFolderPath.substring(scanPrefix.length);
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
      return `${first}...${last}`;
    } else {
      // Just show last folder
      return parts[parts.length - 1];
    }
  }
  
  // V4: Video info overlay
  _renderVideoInfo() {
    // Check if we should hide video controls display
    if (this.config.hide_video_controls_display) {
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
    // Only show action buttons when media_index is enabled and we have a current file
    if (!MediaProvider.isMediaIndexActive(this.config) || !this._currentMediaPath) {
      return html``;
    }

    // Check individual button enable flags (default: true)
    const config = this.config.action_buttons || {};
    const enableFavorite = config.enable_favorite !== false;
    const enableDelete = config.enable_delete !== false;
    const enableEdit = config.enable_edit !== false;
    
    // Don't render anything if all are disabled
    if (!enableFavorite && !enableDelete && !enableEdit) {
      return html``;
    }

    const isFavorite = this._currentMetadata?.is_favorited || false;
    const position = config.position || 'top-right';

    return html`
      <div class="action-buttons action-buttons-${position}">
        ${enableFavorite ? html`
          <button
            class="action-btn favorite-btn ${isFavorite ? 'favorited' : ''}"
            @click=${this._handleFavoriteClick}
            title="${isFavorite ? 'Unfavorite' : 'Favorite'}">
            <ha-icon icon="${isFavorite ? 'mdi:heart' : 'mdi:heart-outline'}"></ha-icon>
          </button>
        ` : ''}
        ${enableEdit ? html`
          <button
            class="action-btn edit-btn"
            @click=${this._handleEditClick}
            title="Mark for Editing">
            <ha-icon icon="mdi:pencil-outline"></ha-icon>
          </button>
        ` : ''}
        ${enableDelete ? html`
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

  getCardSize() {
    return 3;
  }
  
  // V4: Action Button Handlers
  async _handleFavoriteClick(e) {
    e.stopPropagation();
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    const newState = !(this._currentMetadata?.is_favorited || false);
    
    try {
      // Call media_index service
      const serviceData = {
        file_path: this._currentMediaPath,
        is_favorited: newState
      };
      
      // If entity_id specified, target that instance
      if (this.config.media_index.entity_id) {
        serviceData.entity_id = this.config.media_index.entity_id;
      }
      
      await this.hass.callService('media_index', 'mark_favorite', serviceData, true);
      
      // V5: Refresh metadata from backend to get updated state
      await this._refreshMetadata();
      
    } catch (error) {
      console.error('Failed to mark favorite:', error);
      alert('Failed to mark favorite: ' + error.message);
    }
  }
  
  async _handleDeleteClick(e) {
    e.stopPropagation();
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    this._showDeleteConfirmation();
  }
  
  _showDeleteConfirmation() {
    if (!this._currentMediaPath) return;
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-overlay';
    dialog.innerHTML = `
      <div class="delete-confirmation-content">
        <h3>Delete Media?</h3>
        <div class="delete-thumbnail">
          <img src="${this._resolveMediaUrl(this._currentMediaPath)}" alt="Preview">
        </div>
        <p><strong>File:</strong> ${this._currentMetadata?.filename || this._currentMediaPath}</p>
        <p>This action cannot be undone.</p>
        <div class="delete-actions">
          <button class="cancel-btn">Cancel</button>
          <button class="confirm-btn">Delete</button>
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
    
    // Handle confirm
    const confirmBtn = dialog.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      dialog.remove();
      await this._performDelete();
    });
  }
  
  async _performDelete() {
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    try {
      // Call media_index delete service
      const serviceData = {
        file_path: this._currentMediaPath
      };
      
      // If entity_id specified, target that instance
      if (this.config.media_index.entity_id) {
        serviceData.entity_id = this.config.media_index.entity_id;
      }
      
      await this.hass.callService('media_index', 'delete_media', serviceData, true);
      
      // For single media mode, just clear the display
      this._currentMedia = null;
      this._currentMetadata = null;
      this._currentMediaPath = null;
      this.requestUpdate();
      
    } catch (error) {
      console.error('Failed to delete media:', error);
      alert('Failed to delete media: ' + error.message);
    }
  }
  
  async _handleEditClick(e) {
    e.stopPropagation();
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    this._showEditConfirmation();
  }
  
  _showEditConfirmation() {
    if (!this._currentMediaPath) return;
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-overlay'; // Reuse delete dialog styles
    dialog.innerHTML = `
      <div class="delete-confirmation-content">
        <h3>Mark for Editing?</h3>
        <div class="delete-thumbnail">
          <img src="${this._resolveMediaUrl(this._currentMediaPath)}" alt="Preview">
        </div>
        <p><strong>File:</strong> ${this._currentMetadata?.filename || this._currentMediaPath}</p>
        <p>This will mark the file for editing in the media index.</p>
        <div class="delete-actions">
          <button class="cancel-btn">Cancel</button>
          <button class="confirm-btn">Mark for Editing</button>
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
    
    // Handle confirm
    const confirmBtn = dialog.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      dialog.remove();
      await this._performEdit();
    });
  }
  
  async _performEdit() {
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    try {
      // Call media_index mark_for_edit service
      const serviceData = {
        file_path: this._currentMediaPath,
        mark_for_edit: true
      };
      
      // If entity_id specified, target that instance
      if (this.config.media_index.entity_id) {
        serviceData.entity_id = this.config.media_index.entity_id;
      }
      
      await this.hass.callService('media_index', 'mark_for_edit', serviceData, true);
      
      // V5: Refresh metadata from backend to get updated state
      await this._refreshMetadata();
      
    } catch (error) {
      console.error('Failed to mark for edit:', error);
      alert('Failed to mark for edit: ' + error.message);
    }
  }
  
  // V4: Tap Action Handlers
  _hasAnyAction() {
    return this.config.tap_action || this.config.double_tap_action || this.config.hold_action;
  }
  
  _handleTap(e) {
    // Check if in kiosk mode (URL contains kiosk parameter)
    const isKioskMode = window.location.search.includes('kiosk');
    
    // In kiosk mode, single tap exits kiosk
    if (isKioskMode && e.detail === 1) {
      // Remove kiosk parameter from URL
      const url = new URL(window.location);
      url.searchParams.delete('kiosk');
      window.history.pushState({}, '', url);
      window.location.reload();
      return;
    }
    
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
  
  _handleDoubleTap(e) {
    // Check if in kiosk mode (URL contains kiosk parameter)
    const isKioskMode = window.location.search.includes('kiosk');
    
    // In kiosk mode, don't process double-tap as action
    if (isKioskMode) return;
    
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
    // Check if in kiosk mode (URL contains kiosk parameter)
    const isKioskMode = window.location.search.includes('kiosk');
    
    // In kiosk mode, don't process hold action
    if (isKioskMode) return;
    
    if (!this.config.hold_action) return;
    
    this._holdTimeout = setTimeout(() => {
      this._performAction(this.config.hold_action);
      this._holdTimeout = null;
    }, 500);
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
  
  _performAction(action) {
    if (!action) return;
    
    switch (action.action) {
      case 'more-info':
        this._showMoreInfo(action);
        break;
      case 'toggle':
        this._performToggle(action);
        break;
      case 'call-service':
      case 'perform-action':
        this._performServiceCall(action);
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
    
    // Handle confirmation if specified
    if (action.confirmation) {
      const confirmText = typeof action.confirmation === 'string' 
        ? action.confirmation 
        : 'Are you sure?';
      if (!confirm(confirmText)) {
        return;
      }
    }
    
    // Parse service
    const service = action.service || action.perform_action;
    const [domain, serviceAction] = service.split('.');
    if (!domain || !serviceAction) {
      console.warn('Invalid service format:', service);
      return;
    }
    
    // Prepare service data
    const serviceData = action.service_data || action.data || {};
    
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

  static styles = css`
    :host {
      display: block;
    }
    .card {
      position: relative;
      overflow: hidden;
      background: var(--card-background-color);
      border-radius: var(--ha-card-border-radius);
    }
    .media-container {
      position: relative;
      width: 100%;
      background: #000;
    }
    
    /* V4 Smart aspect ratio handling */
    img, video {
      width: 100%;
      height: auto;
      display: block;
    }
    
    :host([data-aspect-mode="viewport-fit"]) img {
      max-height: 100vh;
      max-width: 100vw;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    
    :host([data-aspect-mode="viewport-fit"]) .media-container {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    :host([data-aspect-mode="viewport-fill"]) img {
      width: 100vw;
      height: 100vh;
      object-fit: cover;
      margin: 0;
    }
    
    :host([data-aspect-mode="smart-scale"]) img {
      max-height: 90vh;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 auto;
      display: block;
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
      object-fit: contain;
    }

    :host([data-aspect-mode="viewport-fit"]) video {
      max-height: 100vh;
      max-width: 100vw;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    
    :host([data-aspect-mode="viewport-fill"]) video {
      width: 100vw;
      height: 100vh;
      object-fit: cover;
    }
    
    :host([data-aspect-mode="smart-scale"]) video {
      max-height: 90vh;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    
    /* V4 Navigation Zones - invisible overlay controls */
    .navigation-zones {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 20;
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
      height: 200px;
      cursor: w-resize;
      border-radius: 8px;
    }

    .nav-zone-right {
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 80px;
      height: 200px;
      cursor: e-resize;
      border-radius: 8px;
    }

    .nav-zone:hover {
      background: rgba(0, 0, 0, 0.2);
    }

    .nav-zone-left:hover::after {
      content: '◀';
      color: white;
      font-size: 1.5em;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
      opacity: 0.9;
    }

    .nav-zone-right:hover::after {
      content: '▶';
      color: white;
      font-size: 1.5em;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
      opacity: 0.9;
    }
    
    /* V4: Metadata overlay */
    .metadata-overlay {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 0.85em;
      line-height: 1.2;
      pointer-events: none;
      z-index: 11;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      animation: fadeIn 0.3s ease;
      max-width: calc(100% - 16px);
      word-break: break-word;
    }

    /* Metadata positioning */
    .metadata-overlay.metadata-bottom-left {
      bottom: 8px;
      left: 8px;
    }

    .metadata-overlay.metadata-bottom-right {
      bottom: 8px;
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

    /* V4: Action Buttons (Favorite/Delete/Edit) */
    .action-buttons {
      position: absolute;
      display: flex;
      gap: 8px;
      z-index: 50;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    /* Show action buttons on hover over the corner area */
    .media-container:hover .action-buttons {
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

    .favorite-btn.favorited {
      color: var(--error-color, #ff5252);
    }

    .favorite-btn.favorited:hover {
      color: var(--error-color, #ff5252);
      background: rgba(255, 82, 82, 0.1);
    }

    .edit-btn:hover {
      color: var(--warning-color, #ff9800);
      background: rgba(255, 152, 0, 0.1);
    }

    .delete-btn:hover {
      color: var(--error-color, #ff5252);
      background: rgba(255, 82, 82, 0.1);
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
      background: var(--card-background-color);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
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

    .delete-confirmation-content h3 {
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .delete-thumbnail {
      width: 100%;
      max-height: 200px;
      margin: 0 0 16px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--secondary-background-color);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .delete-thumbnail img {
      max-width: 100%;
      max-height: 200px;
      object-fit: contain;
    }

    .delete-confirmation-content p {
      margin: 0 0 12px;
      color: var(--primary-text-color);
      line-height: 1.5;
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
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }

    .cancel-btn:hover {
      background: var(--divider-color);
    }

    .confirm-btn {
      background: var(--error-color, #ff5252);
      color: white;
    }

    .confirm-btn:hover {
      background: var(--error-color-dark, #d32f2f);
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

    if (!this.currentMedia) {
      return html`
        <ha-card>
          <div class="card">
            <div class="placeholder">No media configured</div>
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card>
        <div class="card">
          ${this.config.title ? html`<div class="title">${this.config.title}</div>` : ''}
          ${this._renderMedia()}
          ${this._renderControls()}
        </div>
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

    const isVideo = this.currentMedia.media_content_type === 'video';

    return html`
      <div 
        class="media-container"
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
            ?autoplay=${this.config.video_autoplay || false}
            ?muted=${this.config.video_muted || false}
            @loadstart=${this._onVideoLoadStart}
            @loadeddata=${this._onMediaLoaded}
            @error=${this._onMediaError}
            @canplay=${this._onVideoCanPlay}
            @loadedmetadata=${this._onVideoLoadedMetadata}
            @play=${this._onVideoPlay}
            @pause=${this._onVideoPause}
            @ended=${this._onVideoEnded}
            style="width: 100%; height: auto; display: block; background: #000; max-width: 100%;"
          >
            <source src="${this.mediaUrl}" type="video/mp4">
            <source src="${this.mediaUrl}" type="video/webm">
            <source src="${this.mediaUrl}" type="video/ogg">
            <p>Your browser does not support the video tag. <a href="${this.mediaUrl}" target="_blank">Download the video</a> instead.</p>
          </video>
          ${this._renderVideoInfo()}
        ` : html`
          <div class="zoomable-container"
               @click=${(e) => this._handleImageZoomClick(e)}
               @touchend=${(e) => this._handleImageZoomTouchEnd(e)}
          >
            <img 
              src="${this.mediaUrl}" 
              alt="${this.currentMedia.title || 'Media'}"
              @error=${this._onMediaError}
              @load=${this._onMediaLoaded}
              style="width: 100%; height: auto; display: block;"
            />
          </div>
        `}
        ${this._renderNavigationZones()}
        ${this._renderMetadataOverlay()}
        ${this._renderActionButtons()}
      </div>
    `;
  }
  
  _renderNavigationZones() {
    // For single_media mode, don't show navigation zones
    if (this.config.media_source_type === 'single_media') {
      return html``;
    }
    
    // V4-style navigation zones (will be used for folder/queue modes)
    return html`
      <div class="navigation-zones">
        <div class="nav-zone nav-zone-left"
             @click=${this._loadPrevious}
             title="Previous">
        </div>
        <div class="nav-zone nav-zone-right"  
             @click=${this._loadNext}
             title="Next">
        </div>
      </div>
    `;
  }

  _renderControls() {
    // In single_media mode, no controls needed
    if (this.config.media_source_type === 'single_media') {
      return html``;
    }
    
    const canGoBack = this.history.canGoBack();
    const canGoForward = this.history.canGoForward();

    return html`
      <div class="controls">
        <button 
          @click=${this._loadPrevious}
          ?disabled=${!canGoBack}
        >
          ◀ Previous
        </button>
        <span>${this.currentMedia.title}</span>
        <button @click=${this._loadNext}>
          Next ▶
        </button>
      </div>
    `;
  }
}

/**
 * MediaCardV5aEditor - V4 editor with full functionality
 * Will be adapted for v5 architecture in next phase
 */
class MediaCardV5aEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _config: { state: true }
  };

  constructor() {
    super();
    this._config = {};
  }

  setConfig(config) {
    // Migrate v4 config to v5 if needed
    const migratedConfig = this._migrateV4toV5(config);
    this._config = { ...migratedConfig };
  }

  // V4 to V5 Migration
  _migrateV4toV5(config) {
    // If already has media_source_type, it's v5 config
    if (config.media_source_type) {
      return config;
    }

    const result = { ...config };

    // Detect mode from v4 configuration
    if (config.is_folder) {
      if (config.subfolder_queue?.enabled) {
        result.media_source_type = 'subfolder_queue';
      } else {
        result.media_source_type = 'simple_folder';
      }
    } else {
      result.media_source_type = 'single_media';
    }

    // Migrate Media Index detection
    if (config.media_index?.entity_id) {
      result.use_media_index = true;
    }

    // Preserve other settings
    // auto_refresh_seconds → used in single_media mode
    // random_mode → used in folder modes
    // folder_mode → preserved for folder modes

    this._log('Migrated v4 config to v5:', { original: config, migrated: result });
    return result;
  }

  // Utility methods
  _log(...args) {
    // console.log(...args);
  }

  _getItemDisplayName(item) {
    return item.title || item.media_content_id;
  }

  _getFileExtension(fileName) {
    return fileName?.split('.').pop()?.toLowerCase();
  }

  _isMediaFile(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const extension = this._getFileExtension(fileName);
    return ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
  }

  _detectFileType(filePath) {
    return MediaUtils.detectFileType(filePath);
  }

  _fetchMediaContents(hass, contentId) {
    return hass.callWS({
      type: "media_source/browse_media",
      media_content_id: contentId
    });
  }

  async _resolveMediaPath(mediaPath) {
    if (!mediaPath || !this.hass) return '';
    
    if (mediaPath.startsWith('http')) {
      return mediaPath;
    }
    
    if (mediaPath.startsWith('/media/')) {
      mediaPath = 'media-source://media_source' + mediaPath;
    }
    
    if (mediaPath.startsWith('media-source://')) {
      try {
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaPath,
          expires: (60 * 60 * 3)
        });
        return resolved.url;
      } catch (error) {
        console.error('Failed to resolve media path:', mediaPath, error);
        return '';
      }
    }
    
    return mediaPath;
  }

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  // Event handlers
  _mediaPathChanged(ev) {
    this._config = { ...this._config, media_path: ev.target.value };
    this._fireConfigChanged();
  }

  // V5 Mode and Backend handlers
  _handleModeChange(ev) {
    const newMode = ev.target.value;
    this._config = { 
      ...this._config, 
      media_source_type: newMode 
    };
    
    // Clear mode-specific settings when switching modes
    if (newMode === 'single_media') {
      // Remove folder-specific settings
      delete this._config.is_folder;
      delete this._config.folder_mode;
      delete this._config.random_mode;
      delete this._config.subfolder_queue;
    } else if (newMode === 'subfolder_queue') {
      // Auto-enable File System Scanning for Folder Hierarchy mode
      this._config.subfolder_queue = {
        ...this._config.subfolder_queue,
        enabled: true
      };
      // Remove single-media specific settings
      delete this._config.auto_refresh_seconds;
    } else {
      // Simple folder mode
      delete this._config.auto_refresh_seconds;
      delete this._config.subfolder_queue;
    }
    
    this._fireConfigChanged();
  }

  _handleMediaIndexToggle(ev) {
    const enabled = ev.target.checked;
    this._config = { 
      ...this._config, 
      use_media_index: enabled 
    };
    
    if (!enabled) {
      delete this._config.media_index;
      // Re-enable File System Scanning if in Folder Hierarchy mode
      if (this._config.media_source_type === 'subfolder_queue') {
        this._config.subfolder_queue = {
          ...this._config.subfolder_queue,
          enabled: true
        };
      }
    } else {
      if (!this._config.media_index) {
        this._config.media_index = { entity_id: '' };
      }
      // Disable File System Scanning when Media Index enabled
      if (this._config.subfolder_queue) {
        this._config.subfolder_queue = {
          ...this._config.subfolder_queue,
          enabled: false
        };
      }
    }
    
    this._fireConfigChanged();
  }

  _handleMediaIndexEntityChange(ev) {
    const entityId = ev.target.value;
    
    // Get the media folder from the entity's attributes
    let mediaFolder = '';
    if (this.hass && entityId && this.hass.states[entityId]) {
      const entity = this.hass.states[entityId];
      mediaFolder = entity.attributes.media_folder || '';
    }
    
    this._config = {
      ...this._config,
      media_index: {
        ...this._config.media_index,
        entity_id: entityId
      },
      // Auto-set media_path to the indexed folder
      media_path: mediaFolder
    };
    this._fireConfigChanged();
  }

  _getMediaIndexEntities() {
    if (!this.hass) return [];
    
    return Object.keys(this.hass.states)
      .filter(entityId => entityId.startsWith('sensor.media_index_'))
      .map(entityId => {
        const state = this.hass.states[entityId];
        return {
          entity_id: entityId,
          friendly_name: state.attributes.friendly_name || entityId
        };
      })
      .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));
  }

  _parseMediaIndexPath(entityId) {
    // Parse entity_id like "sensor.media_index_media_photo_photolibrary_total_files"
    // to extract path "media-source://media_source/media/Photo/PhotoLibrary"
    
    if (!entityId || !entityId.startsWith('sensor.media_index_')) {
      return null;
    }
    
    // Try to get the path from the entity's friendly_name attribute
    // Format: "Media Index (/media/Photo/PhotoLibrary) Total Files"
    if (this.hass && this.hass.states[entityId]) {
      const entity = this.hass.states[entityId];
      const friendlyName = entity.attributes.friendly_name;
      
      if (friendlyName) {
        // Extract path from friendly name using regex: /media/...
        const match = friendlyName.match(/\((\/.+?)\)/);
        if (match && match[1]) {
          const path = match[1]; // e.g., "/media/Photo/PhotoLibrary"
          const fullPath = `media-source://media_source${path}`;
          this._log('🔍 Extracted path from friendly_name:', friendlyName, '→', fullPath);
          return fullPath;
        }
      }
    }
    
    // Fallback: parse entity_id (but this has capitalization issues)
    let pathPart = entityId
      .replace('sensor.media_index_', '')
      .replace(/_total_files$/, '')
      .replace(/_file_count$/, '');
    
    this._log('🔍 Parsing Media Index path (fallback):', pathPart);
    
    // Split by underscore and capitalize each part
    const parts = pathPart.split('_').map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    );
    
    this._log('🔍 Path parts (fallback):', parts);
    
    // Build path: media-source://media_source/Part1/Part2/Part3
    if (parts.length > 0) {
      const fullPath = `media-source://media_source/${parts.join('/')}`;
      this._log('🔍 Built path (fallback):', fullPath);
      return fullPath;
    }
    
    return null;
  }

  _titleChanged(ev) {
    this._config = { ...this._config, title: ev.target.value };
    this._fireConfigChanged();
  }

  _mediaTypeChanged(ev) {
    this._config = { ...this._config, media_type: ev.target.value };
    this._fireConfigChanged();
  }

  _aspectModeChanged(ev) {
    this._config = { ...this._config, aspect_mode: ev.target.value };
    this._fireConfigChanged();
  }

  _autoRefreshChanged(ev) {
    const seconds = parseInt(ev.target.value) || 0;
    this._config = { ...this._config, auto_refresh_seconds: seconds };
    this._fireConfigChanged();
  }

  _randomModeChanged(ev) {
    this._config = { ...this._config, random_mode: ev.target.checked };
    this._fireConfigChanged();
  }

  _autoAdvanceChanged(ev) {
    const seconds = parseInt(ev.target.value) || 0;
    this._config = { ...this._config, auto_advance_seconds: seconds };
    this._fireConfigChanged();
  }

  _refreshButtonChanged(ev) {
    this._config = { ...this._config, show_refresh_button: ev.target.checked };
    this._fireConfigChanged();
  }

  _autoplayChanged(ev) {
    this._config = { ...this._config, video_autoplay: ev.target.checked };
    this._fireConfigChanged();
  }

  _loopChanged(ev) {
    this._config = { ...this._config, video_loop: ev.target.checked };
    this._fireConfigChanged();
  }

  _mutedChanged(ev) {
    this._config = { ...this._config, video_muted: ev.target.checked };
    this._fireConfigChanged();
  }

  _hideVideoControlsDisplayChanged(ev) {
    this._config = { ...this._config, hide_video_controls_display: ev.target.checked };
    this._fireConfigChanged();
  }

  _videoMaxDurationChanged(ev) {
    const duration = parseInt(ev.target.value) || 0;
    this._config = { ...this._config, video_max_duration: duration };
    this._fireConfigChanged();
  }

  _imageZoomChanged(ev) {
    this._config = { ...this._config, enable_image_zoom: ev.target.checked };
    this._fireConfigChanged();
  }

  _zoomLevelChanged(ev) {
    const level = parseFloat(ev.target.value) || 2.0;
    this._config = { ...this._config, zoom_level: level };
    this._fireConfigChanged();
  }

  _navigationZonesChanged(ev) {
    this._config = { ...this._config, enable_navigation_zones: ev.target.checked };
    this._fireConfigChanged();
  }

  _positionIndicatorChanged(ev) {
    this._config = { ...this._config, show_position_indicator: ev.target.checked };
    this._fireConfigChanged();
  }

  _dotsIndicatorChanged(ev) {
    this._config = { ...this._config, show_dots_indicator: ev.target.checked };
    this._fireConfigChanged();
  }

  _keyboardNavigationChanged(ev) {
    this._config = { ...this._config, enable_keyboard_navigation: ev.target.checked };
    this._fireConfigChanged();
  }

  _metadataShowFolderChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_folder: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _metadataShowRootFolderChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_root_folder: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _metadataShowFilenameChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_filename: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _metadataShowDateChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_date: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _metadataShowLocationChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_location: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _metadataPositionChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        position: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsEnableFavoriteChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_favorite: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsEnableDeleteChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_delete: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsDeleteConfirmationChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        delete_confirmation: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsEnableEditChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_edit: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsPositionChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        position: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _subfolderScanDepthChanged(ev) {
    const value = ev.target.value;
    const depth = value === '' ? null : Math.max(0, Math.min(10, parseInt(value) || 0));
    
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        enabled: true, // Auto-enable when settings changed
        scan_depth: depth === 0 ? null : depth
      }
    };
    this._fireConfigChanged();
  }

  _priorityFoldersChanged(ev) {
    const value = ev.target.value;
    const folders = value.split(',').map(f => f.trim()).filter(f => f);
    
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        enabled: true,
        priority_folders: folders.length > 0 ? folders : undefined
      }
    };
    this._fireConfigChanged();
  }

  _equalProbabilityModeChanged(ev) {
    const enabled = ev.target.checked;
    
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        enabled: true,
        equal_probability_mode: enabled
      }
    };
    this._fireConfigChanged();
  }

  _estimatedLibrarySizeChanged(ev) {
    const value = parseInt(ev.target.value) || 0;
    
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        enabled: true,
        estimated_library_size: value > 0 ? value : undefined
      }
    };
    this._fireConfigChanged();
  }

  _calculateQueueSize() {
    const estimatedSize = this._config.subfolder_queue?.estimated_library_size || 0;
    if (estimatedSize > 0) {
      return Math.max(100, Math.floor(estimatedSize / 100));
    }
    return 100; // Default
  }

  _queueSizeChanged(ev) {
    const value = parseInt(ev.target.value) || 0;
    
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        enabled: true,
        queue_size: value > 0 ? value : undefined
      }
    };
    this._fireConfigChanged();
  }

  _tapActionChanged(ev) {
    const action = ev.target.value;
    if (action === 'none') {
      const { tap_action, ...configWithoutTapAction } = this._config;
      this._config = configWithoutTapAction;
    } else {
      this._config = { ...this._config, tap_action: { action } };
    }
    this._fireConfigChanged();
  }

  _holdActionChanged(ev) {
    const action = ev.target.value;
    if (action === 'none') {
      const { hold_action, ...configWithoutHoldAction } = this._config;
      this._config = configWithoutHoldAction;
    } else {
      this._config = { ...this._config, hold_action: { action } };
    }
    this._fireConfigChanged();
  }

  _doubleTapActionChanged(ev) {
    const action = ev.target.value;
    if (action === 'none') {
      const { double_tap_action, ...configWithoutDoubleTapAction } = this._config;
      this._config = configWithoutDoubleTapAction;
    } else {
      this._config = { ...this._config, double_tap_action: { action } };
    }
    this._fireConfigChanged();
  }

  _kioskModeEntityChanged(ev) {
    const entity = ev.target.value;
    if (entity === '') {
      const { kiosk_mode_entity, ...configWithoutKioskEntity } = this._config;
      this._config = configWithoutKioskEntity;
    } else {
      this._config = { ...this._config, kiosk_mode_entity: entity };
    }
    this._fireConfigChanged();
  }

  _kioskModeExitActionChanged(ev) {
    this._config = {
      ...this._config,
      kiosk_mode_exit_action: ev.target.value
    };
    this._fireConfigChanged();
  }

  _kioskModeShowIndicatorChanged(ev) {
    this._config = {
      ...this._config,
      kiosk_mode_show_indicator: ev.target.checked
    };
    this._fireConfigChanged();
  }

  _renderInputBooleanEntityOptions() {
    if (!this.hass || !this.hass.states) {
      return html``;
    }

    const inputBooleanEntities = Object.keys(this.hass.states)
      .filter(entityId => entityId.startsWith('input_boolean.'))
      .sort();

    return inputBooleanEntities.map(entityId => {
      const state = this.hass.states[entityId];
      const friendlyName = state.attributes.friendly_name || entityId;
      
      return html`
        <option value="${entityId}">${friendlyName}</option>
      `;
    });
  }

  _renderValidationStatus() {
    if (!this._config.media_path) return '';
    
    if (this._config.media_path.startsWith('media-source://') || 
        this._config.media_path.startsWith('/')) {
      return html`
        <div class="validation-status validation-success">
          ✅ Valid media path format
        </div>
      `;
    } else {
      return html`
        <div class="validation-status validation-error">
          ❌ Path should start with media-source:// or /
        </div>
      `;
    }
  }

  _renderFolderModeStatus() {
    if (!this._config.is_folder || !this._config.folder_mode) return '';
    
    const mode = this._config.folder_mode;
    const modeText = mode === 'latest' ? 'Show Latest File' : 'Show Random Files';
    const modeIcon = mode === 'latest' ? '📅' : '🎲';
    
    return html`
      <div class="folder-mode-status">
        <span>${modeIcon}</span>
        <strong>Folder Mode:</strong> ${modeText}
      </div>
    `;
  }

  async _openMediaBrowser() {
    if (!this.hass) {
      console.error('Home Assistant instance not available');
      return;
    }

    this._log('Opening media browser...');
    
    // Determine the starting path for the browser
    let startPath = '';
    
    // If Media Index is enabled, start from the indexed folder
    if (this._config.use_media_index && this._config.media_index?.entity_id) {
      const entityId = this._config.media_index.entity_id;
      const entity = this.hass.states[entityId];
      
      this._log('🔍 Media Index entity:', entityId);
      this._log('🔍 Entity attributes:', entity?.attributes);
      
      if (entity && entity.attributes.media_folder) {
        startPath = entity.attributes.media_folder;
        this._log('Starting browser from Media Index folder (attribute):', startPath);
      } else {
        // Fallback: parse entity_id to extract path
        // e.g., "sensor.media_index_media_photo_photolibrary_total_files" 
        // -> "media-source://media_source/media/Photo/PhotoLibrary"
        const parsedPath = this._parseMediaIndexPath(entityId);
        if (parsedPath) {
          startPath = parsedPath;
          this._log('Starting browser from Media Index folder (parsed):', startPath);
        }
      }
    } else {
      // Otherwise use configured path or try to infer from current path
      const configuredPath = this._config.media_path || '';
      
      if (configuredPath) {
        // If we have a current path, try to start from its parent folder
        if (configuredPath.includes('/')) {
          // Extract the parent folder from the current path
          const pathParts = configuredPath.split('/');
          pathParts.pop(); // Remove the filename
          startPath = pathParts.join('/');
          this._log('Starting browser from current folder:', startPath);
        }
      }
    }
    
    // Try to browse media and create our own simple dialog
    try {
      const mediaContent = await this._fetchMediaContents(this.hass, startPath);
      if (mediaContent && mediaContent.children && mediaContent.children.length > 0) {
        this._showCustomMediaBrowser(mediaContent);
        return;
      }
    } catch (error) {
      this._log('Could not fetch media contents for path:', startPath, 'Error:', error);
      
      // If starting from a specific folder failed, try from root
      if (startPath !== '') {
        this._log('Retrying from root...');
        try {
          const mediaContent = await this._fetchMediaContents(this.hass, '');
          if (mediaContent && mediaContent.children && mediaContent.children.length > 0) {
            this._showCustomMediaBrowser(mediaContent);
            return;
          }
        } catch (rootError) {
          this._log('Could not fetch root media contents either:', rootError);
        }
      }
    }
    
    // Final fallback: use a simple prompt with helpful guidance
    const helpText = `Enter the path to your media file:

Format options:
• media-source://media_source/local/folder/file.mp4 (recommended)
• /local/images/photo.jpg
• /media/videos/movie.mp4

Your current path: ${configuredPath}

Tip: Check your Home Assistant media folder in Settings > System > Storage`;

    const mediaPath = prompt(helpText, configuredPath);
    
    if (mediaPath && mediaPath.trim()) {
      this._log('Media path entered:', mediaPath);
      this._handleMediaPicked(mediaPath.trim());
    } else {
      this._log('No media path entered');
    }
  }

  _showCustomMediaBrowser(mediaContent) {
    this._log('Creating custom media browser with', mediaContent.children.length, 'items');
    
    // Force remove any existing dialogs first
    const existingDialogs = document.querySelectorAll('[data-media-browser-dialog="true"]');
    existingDialogs.forEach(d => d.remove());
    
    // Create a custom dialog element with proper event isolation
    const dialog = document.createElement('div');
    dialog.setAttribute('data-media-browser-dialog', 'true');
    
    // Remove any inert attributes and force interactive state
    dialog.removeAttribute('inert');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('role', 'dialog');
    
    dialog.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.9) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 2147483647 !important;
      backdrop-filter: blur(3px) !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      pointer-events: auto !important;
    `;

    const dialogContent = document.createElement('div');
    dialogContent.setAttribute('aria-labelledby', 'media-browser-title');
    dialogContent.style.cssText = `
      background: var(--card-background-color, #fff) !important;
      border-radius: 8px !important;
      padding: 20px !important;
      max-width: 600px !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      color: var(--primary-text-color, #333) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
      position: relative !important;
      margin: 20px !important;
      pointer-events: auto !important;
      transform: scale(1) !important;
    `;

    const title = document.createElement('h3');
    title.id = 'media-browser-title';
    title.textContent = 'Select Media File';
    title.style.cssText = `
      margin-top: 0 !important;
      margin-bottom: 16px !important;
      color: var(--primary-text-color, #333) !important;
      border-bottom: 1px solid var(--divider-color, #ddd) !important;
      padding-bottom: 8px !important;
      font-size: 18px !important;
      pointer-events: none !important;
    `;

    const fileList = document.createElement('div');
    fileList.style.cssText = `
      display: grid !important;
      gap: 8px !important;
      margin: 16px 0 !important;
      max-height: 400px !important;
      overflow-y: auto !important;
      pointer-events: auto !important;
    `;

    // Add media files to the list
    this._addMediaFilesToBrowser(fileList, mediaContent, dialog, mediaContent.media_content_id || '');

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      gap: 8px !important;
      margin-top: 16px !important;
      border-top: 1px solid var(--divider-color, #ddd) !important;
      padding-top: 16px !important;
      pointer-events: auto !important;
    `;

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Cancel';
    closeButton.style.cssText = `
      padding: 8px 16px !important;
      background: var(--primary-color, #007bff) !important;
      border: none !important;
      border-radius: 4px !important;
      cursor: pointer !important;
      color: white !important;
      font-size: 14px !important;
      pointer-events: auto !important;
      z-index: 999999999 !important;
    `;

    // Dialog close function with proper cleanup
    const closeDialog = () => {
      this._log('Closing media browser dialog');
      document.removeEventListener('keydown', handleKeydown);
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
        this._log('Dialog closed successfully');
      }
    };

    closeButton.onclick = (e) => {
      this._log('Cancel button clicked');
      closeDialog();
      return false;
    };

    dialog.onclick = (e) => {
      if (e.target === dialog) {
        closeDialog();
      }
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this._log('Escape key pressed');
        closeDialog();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    buttonContainer.appendChild(closeButton);
    dialogContent.appendChild(title);
    dialogContent.appendChild(fileList);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    
    this._log('Appending dialog to document.body');
    document.body.appendChild(dialog);
    
    // Force focus and remove inert state
    requestAnimationFrame(() => {
      dialog.removeAttribute('inert');
      dialogContent.removeAttribute('inert');
      document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
      dialog.focus();
      dialog.setAttribute('tabindex', '0');
      this._log('Media browser dialog opened and focused');
    });
  }

  async _addMediaFilesToBrowser(container, mediaContent, dialog, currentPath = '') {
    this._log('Adding media files to browser:', mediaContent.children.length, 'items');
    
    const itemsToCheck = (mediaContent.children || []).slice(0, 50);
    const hasMediaFiles = itemsToCheck.some(item => {
      const isFolder = item.can_expand;
      const fileName = this._getItemDisplayName(item);
      const isMedia = !isFolder && this._isMediaFile(fileName);
      return isMedia;
    });
    
    const hasSubfolders = itemsToCheck.some(item => item.can_expand);
    
    // If we're in a folder (not root) with media files OR subfolders, add special folder options at the top
    if ((currentPath && currentPath !== '') && (hasMediaFiles || hasSubfolders)) {
      this._log('Adding folder options for path:', currentPath);
      this._addFolderOptions(container, dialog, currentPath);
    }
    
    // Filter items to display based on media type configuration
    const itemsToShow = (mediaContent.children || []).filter(item => {
      if (item.can_expand) return true;
      
      if (this._config.media_type && this._config.media_type !== 'all') {
        const fileName = this._getItemDisplayName(item);
        const fileType = this._detectFileType(fileName);
        return fileType === this._config.media_type;
      }
      
      const fileName = this._getItemDisplayName(item);
      return this._isMediaFile(fileName);
    });
    
    for (const item of itemsToShow) {
      const fileItem = document.createElement('div');
      fileItem.style.cssText = `
        padding: 12px 16px !important;
        border: 1px solid var(--divider-color, #ddd) !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        transition: all 0.2s ease !important;
        background: var(--card-background-color, #fff) !important;
        user-select: none !important;
        position: relative !important;
        pointer-events: auto !important;
        z-index: 999999999 !important;
      `;

      fileItem.onmouseenter = () => {
        fileItem.style.background = 'var(--secondary-background-color, #f5f5f5)';
        fileItem.style.borderColor = 'var(--primary-color, #007bff)';
        fileItem.style.transform = 'translateY(-1px)';
        fileItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
      };

      fileItem.onmouseleave = () => {
        fileItem.style.background = 'var(--card-background-color, #fff)';
        fileItem.style.borderColor = 'var(--divider-color, #ddd)';
        fileItem.style.transform = 'translateY(0)';
        fileItem.style.boxShadow = 'none';
      };

      const thumbnailContainer = document.createElement('div');
      thumbnailContainer.style.cssText = `
        width: 60px !important;
        height: 60px !important;
        flex-shrink: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
        overflow: hidden !important;
        background: var(--secondary-background-color, #f5f5f5) !important;
      `;
      
      const name = document.createElement('span');
      name.textContent = this._getItemDisplayName(item);
      name.style.cssText = `
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        color: var(--primary-text-color, #333) !important;
        margin-left: 8px !important;
      `;

      if (item.can_expand) {
        // Folder icon
        const folderIcon = document.createElement('span');
        folderIcon.textContent = '📁';
        folderIcon.style.fontSize = '24px';
        thumbnailContainer.appendChild(folderIcon);
        
        fileItem.onclick = async () => {
          this._log('Folder clicked:', item.media_content_id);
          try {
            const subContent = await this._fetchMediaContents(this.hass, item.media_content_id);
            container.innerHTML = '';
            
            // Add back button
            const backButton = document.createElement('div');
            backButton.style.cssText = `
              padding: 12px 16px !important;
              border: 1px solid var(--divider-color, #ddd) !important;
              border-radius: 6px !important;
              cursor: pointer !important;
              display: flex !important;
              align-items: center !important;
              gap: 12px !important;
              background: var(--secondary-background-color, #f5f5f5) !important;
              margin-bottom: 8px !important;
              pointer-events: auto !important;
            `;
            
            backButton.innerHTML = '<span style="font-size: 24px;">⬅️</span><span style="font-weight: 500; color: var(--primary-text-color);">Back</span>';
            
            backButton.onclick = () => {
              this._log('Back button clicked');
              container.innerHTML = '';
              this._addMediaFilesToBrowser(container, mediaContent, dialog, currentPath);
              return false;
            };

            backButton.onmouseenter = () => {
              backButton.style.background = 'var(--primary-color, #007bff)';
              backButton.style.color = 'white';
              backButton.style.transform = 'translateY(-1px)';
            };

            backButton.onmouseleave = () => {
              backButton.style.background = 'var(--secondary-background-color, #f5f5f5)';
              backButton.style.color = 'var(--primary-text-color)';
              backButton.style.transform = 'translateY(0)';
            };
            
            container.appendChild(backButton);
            this._addMediaFilesToBrowser(container, subContent, dialog, item.media_content_id);
          } catch (error) {
            console.error('Error browsing folder:', error);
          }
          return false;
        };
      } else {
        // Media file - create thumbnail
        const ext = this._getFileExtension(this._getItemDisplayName(item));
        const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext);
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
        
        if (isImage) {
          // Create image thumbnail with proper loading
          this._createImageThumbnail(thumbnailContainer, item);
        } else if (isVideo) {
          // Create video thumbnail
          this._createVideoThumbnail(thumbnailContainer, item);
        } else {
          // Unknown file type - show generic icon
          const iconSpan = document.createElement('span');
          iconSpan.textContent = '📄';
          iconSpan.style.fontSize = '24px';
          thumbnailContainer.appendChild(iconSpan);
        }

        fileItem.onclick = () => {
          this._log('File clicked:', item.media_content_id);
          this._handleMediaPicked(item.media_content_id);
          if (dialog && dialog.parentNode) {
            document.body.removeChild(dialog);
          }
          return false;
        };
      }

      fileItem.appendChild(thumbnailContainer);
      fileItem.appendChild(name);
      container.appendChild(fileItem);
    }
  }

  _addFolderOptions(container, dialog, folderPath) {
    this._log('Adding folder selection option for:', folderPath);
    
    // Simple "Use This Folder" button
    const useFolderButton = document.createElement('div');
    useFolderButton.style.cssText = `
      padding: 16px !important;
      border: 2px solid var(--primary-color, #007bff) !important;
      border-radius: 8px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      background: var(--primary-color, #007bff) !important;
      color: white !important;
      margin-bottom: 16px !important;
      pointer-events: auto !important;
      font-weight: 500 !important;
      transition: all 0.2s ease !important;
    `;

    useFolderButton.innerHTML = `
      <span style="font-size: 24px;">📁</span>
      <div>
        <div style="font-size: 15px; font-weight: 600;">Use This Folder</div>
        <div style="font-size: 12px; opacity: 0.9;">Set this as the media source folder</div>
      </div>
    `;

    useFolderButton.onclick = () => {
      this._log('Use This Folder clicked for:', folderPath);
      this._config = {
        ...this._config,
        media_path: folderPath,
        is_folder: true
      };
      this._fireConfigChanged();
      
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
      }
    };

    useFolderButton.onmouseenter = () => {
      useFolderButton.style.background = 'var(--primary-color-dark, #0056b3)';
      useFolderButton.style.transform = 'translateY(-2px)';
      useFolderButton.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.4)';
    };

    useFolderButton.onmouseleave = () => {
      useFolderButton.style.background = 'var(--primary-color, #007bff)';
      useFolderButton.style.transform = 'translateY(0)';
      useFolderButton.style.boxShadow = 'none';
    };

    container.appendChild(useFolderButton);

    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = `
      height: 1px !important;
      background: var(--divider-color, #ddd) !important;
      margin: 16px 0 !important;
    `;
    container.appendChild(separator);

    const filesHeader = document.createElement('div');
    filesHeader.style.cssText = `
      padding: 8px 16px !important;
      font-weight: 500 !important;
      color: var(--secondary-text-color, #666) !important;
      font-size: 14px !important;
    `;
    filesHeader.textContent = 'Or select individual files:';
    container.appendChild(filesHeader);
  }

  async _createImageThumbnail(container, item) {
    // Show loading indicator first
    const loadingIcon = document.createElement('div');
    loadingIcon.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 100% !important;
      background: rgba(0, 0, 0, 0.05) !important;
      border-radius: 4px !important;
    `;
    loadingIcon.innerHTML = `<span style="font-size: 16px; opacity: 0.5;">⏳</span>`;
    container.appendChild(loadingIcon);

    // Debug counter to limit console spam
    const shouldLog = this._thumbnailDebugCount === undefined ? (this._thumbnailDebugCount = 0) < 5 : this._thumbnailDebugCount < 5;
    if (shouldLog) {
      this._thumbnailDebugCount++;
      this._log('🔍 Creating thumbnail for item:', item.title || item.media_content_id);
    }

    try {
      let thumbnailUrl = null;
      
      // Try multiple approaches for getting the thumbnail
      if (item.thumbnail) {
        thumbnailUrl = item.thumbnail;
        if (shouldLog) this._log('✅ Using provided thumbnail:', thumbnailUrl);
      } else if (item.thumbnail_url) {
        thumbnailUrl = item.thumbnail_url;
        if (shouldLog) this._log('✅ Using provided thumbnail_url:', thumbnailUrl);
      }
      
      // Try Home Assistant thumbnail API
      if (!thumbnailUrl) {
        try {
          const thumbnailResponse = await this.hass.callWS({
            type: "media_source/resolve_media",
            media_content_id: item.media_content_id,
            expires: 3600
          });
          
          if (thumbnailResponse && thumbnailResponse.url) {
            thumbnailUrl = thumbnailResponse.url;
            if (shouldLog) this._log('✅ Got thumbnail from resolve_media API:', thumbnailUrl);
          }
        } catch (error) {
          if (shouldLog) this._log('❌ Thumbnail resolve_media API failed:', error);
        }
      }
      
      // Try direct resolution
      if (!thumbnailUrl) {
        thumbnailUrl = await this._resolveMediaPath(item.media_content_id);
        if (thumbnailUrl && shouldLog) {
          this._log('✅ Got thumbnail from direct resolution:', thumbnailUrl);
        }
      }
      
      if (thumbnailUrl) {
        const thumbnail = document.createElement('img');
        thumbnail.style.cssText = `
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 4px !important;
          opacity: 0 !important;
          transition: opacity 0.3s ease !important;
        `;
        
        let timeoutId;
        
        thumbnail.onload = () => {
          container.innerHTML = '';
          thumbnail.style.opacity = '1';
          container.appendChild(thumbnail);
          if (timeoutId) clearTimeout(timeoutId);
          if (shouldLog) this._log('✅ Thumbnail loaded successfully');
        };
        
        thumbnail.onerror = () => {
          this._showThumbnailFallback(container, '🖼️', 'Image thumbnail failed to load');
          if (timeoutId) clearTimeout(timeoutId);
          if (shouldLog) this._log('❌ Thumbnail failed to load');
        };
        
        thumbnail.src = thumbnailUrl;
        
        // Timeout fallback (5 seconds)
        timeoutId = setTimeout(() => {
          if (thumbnail.style.opacity === '0') {
            this._showThumbnailFallback(container, '🖼️', 'Image thumbnail timeout');
            if (shouldLog) this._log('⏰ Thumbnail timeout');
          }
        }, 5000);
        
      } else {
        this._showThumbnailFallback(container, '🖼️', 'No thumbnail URL available');
      }
      
    } catch (error) {
      console.error('Error creating image thumbnail:', error);
      this._showThumbnailFallback(container, '🖼️', 'Thumbnail error: ' + error.message);
    }
  }

  async _createVideoThumbnail(container, item) {
    const videoIcon = document.createElement('div');
    videoIcon.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 100% !important;
      background: rgba(33, 150, 243, 0.1) !important;
      border-radius: 4px !important;
      position: relative !important;
    `;
    
    videoIcon.innerHTML = `
      <span style="font-size: 24px;">🎬</span>
      <div style="
        position: absolute !important;
        bottom: 2px !important;
        right: 2px !important;
        background: rgba(0, 0, 0, 0.7) !important;
        color: white !important;
        font-size: 8px !important;
        padding: 1px 3px !important;
        border-radius: 2px !important;
        text-transform: uppercase !important;
      ">VIDEO</div>
    `;
    
    container.appendChild(videoIcon);
  }

  _showThumbnailFallback(container, icon, reason) {
    container.innerHTML = '';
    const fallbackIcon = document.createElement('div');
    fallbackIcon.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 100% !important;
      background: rgba(0, 0, 0, 0.05) !important;
      border-radius: 4px !important;
    `;
    
    fallbackIcon.innerHTML = `<span style="font-size: 24px; opacity: 0.7;">${icon}</span>`;
    fallbackIcon.title = reason;
    
    container.appendChild(fallbackIcon);
  }

  _handleMediaPicked(mediaContentId) {
    this._log('Media picked:', mediaContentId);
    
    const mediaSourceType = this._config.media_source_type || 'simple_folder';
    
    // For single_media: just set the file
    if (mediaSourceType === 'single_media') {
      this._config = { 
        ...this._config, 
        media_path: mediaContentId,
        is_folder: false
      };
    } else {
      // For folder modes: warn user and offer to use parent folder
      const confirmFile = confirm(
        '⚠️ You selected a file, but you\'re in folder mode.\n\n' +
        'Do you want to:\n' +
        'OK = Use the parent folder instead\n' +
        'Cancel = Use this file (will switch to Single Media mode)'
      );
      
      if (confirmFile) {
        // Extract parent folder from file path
        const pathParts = mediaContentId.split('/');
        pathParts.pop(); // Remove filename
        const folderPath = pathParts.join('/');
        
        this._config = {
          ...this._config,
          media_path: folderPath,
          is_folder: true
        };
      } else {
        // Switch to single_media mode
        this._config = {
          ...this._config,
          media_source_type: 'single_media',
          media_path: mediaContentId,
          is_folder: false
        };
      }
    }
    
    // Auto-detect media type from extension
    const extension = mediaContentId.split('.').pop()?.toLowerCase();
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      this._config.media_type = 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      this._config.media_type = 'image';
    }
    
    this._fireConfigChanged();
    this._log('Config updated (media selected):', this._config);
  }

  static styles = css`
    .card-config {
      display: grid;
      grid-template-columns: 1fr;
      grid-gap: 16px;
      padding: 0;
    }
    
    .config-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      grid-gap: 16px;
      align-items: center;
      margin-bottom: 16px;
    }
    
    label {
      font-weight: 500;
      color: var(--primary-text-color);
      font-size: 14px;
    }
    
    input, select {
      padding: 8px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 4px;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font-family: inherit;
      font-size: 14px;
      width: 100%;
      box-sizing: border-box;
    }
    
    input:focus, select:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    
    input[type="checkbox"] {
      width: auto;
      margin: 0;
    }

    .browse-button {
      padding: 8px 16px;
      background: var(--primary-color);
      color: var(--text-primary-color);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      margin-left: 8px;
    }

    .browse-button:hover {
      background: var(--primary-color-dark);
    }

    .media-path-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .media-path-row input {
      flex: 1;
      margin: 0;
    }
    
    .section {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
    
    .section-title {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 16px;
      color: var(--primary-text-color);
    }
    
    .help-text {
      font-size: 12px;
      color: var(--secondary-text-color);
      margin-top: 4px;
      line-height: 1.4;
    }

    .validation-status {
      margin-top: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .validation-success {
      color: var(--success-color, green);
    }

    .validation-error {
      color: var(--error-color, red);
    }

    .folder-mode-status {
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--secondary-background-color, #f5f5f5);
      border-radius: 6px;
      border-left: 4px solid var(--primary-color, #007bff);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--primary-text-color);
    }
  `;

  render() {
    if (!this._config) {
      return html``;
    }

    const mediaSourceType = this._config.media_source_type || 'simple_folder';
    const useMediaIndex = this._config.use_media_index || false;

    return html`
      <div class="card-config">
        
        <!-- Mode Selection Dropdown -->
        <div class="config-row">
          <label>Media Source Mode</label>
          <div>
            <select @change=${this._handleModeChange} .value=${mediaSourceType}>
              <option value="single_media">Single Media - Display one image/video at a time</option>
              <option value="simple_folder">Simple Folder - Basic folder scanning with optional random</option>
              <option value="subfolder_queue">Folder Hierarchy - Advanced folder navigation</option>
            </select>
            <div class="help-text">Choose how to display your media</div>
          </div>
        </div>

        <!-- Media Index Enhancement Section -->
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #e0e0e0;">
          <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: ${useMediaIndex ? '12px' : '0'};">
            <input
              type="checkbox"
              .checked=${useMediaIndex}
              @change=${this._handleMediaIndexToggle}
              style="margin-right: 8px;"
            />
            <strong>🚀 Media Index Integration</strong>
          </label>
          <p style="margin: 4px 0 ${useMediaIndex ? '12px' : '0'} 28px; font-size: 13px; color: #666;">
            Provides faster queries, lower resource use, file metadata (location/date/rating) and rate/edit/delete actions capability. Download via HACS or <a href="https://github.com/markaggar/ha-media-index" target="_blank" style="color: var(--primary-color, #007bff);">GitHub</a>
          </p>
          
          ${useMediaIndex ? html`
            <div style="margin-left: 28px;">
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">Media Index Entity:</label>
              <select
                .value=${this._config.media_index?.entity_id || ''}
                @change=${this._handleMediaIndexEntityChange}
                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
              >
                <option value="">Select media_index sensor...</option>
                ${this._getMediaIndexEntities().map(entity => html`
                  <option 
                    value="${entity.entity_id}"
                    .selected=${this._config.media_index?.entity_id === entity.entity_id}
                  >${entity.friendly_name}</option>
                `)}
              </select>
            </div>
          ` : ''}
        </div>

        <!-- File System Scanning Enhancement Section -->
        ${mediaSourceType === 'subfolder_queue' && !useMediaIndex ? html`
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #e0e0e0;">
            <div style="margin-bottom: 12px;">
              <strong>🌳 File System Scanning</strong>
            </div>
            <p style="margin: 4px 0 16px 0; font-size: 13px; color: #666;">
              Advanced folder hierarchy scanning for multi-folder random selection
            </p>
            
            <div style="margin-left: 28px;">
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Scan Depth:</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  .value=${this._config.subfolder_queue?.scan_depth ?? ''}
                  placeholder="unlimited"
                  @input=${this._subfolderScanDepthChanged}
                  style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                />
                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                  How many folder levels to scan (empty/0 = unlimited, 1-10 = limit depth)
                </div>
              </div>
              
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Priority Folders:</label>
                <input
                  type="text"
                  .value=${(this._config.subfolder_queue?.priority_folders || []).join(', ')}
                  @input=${this._priorityFoldersChanged}
                  placeholder="e.g., favorites, best, 2024"
                  style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                />
                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                  Comma-separated folder names to scan first (optional)
                </div>
              </div>
              
              <div style="margin-bottom: 16px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                  <input
                    type="checkbox"
                    .checked=${this._config.subfolder_queue?.equal_probability_mode !== false}
                    @change=${this._equalProbabilityModeChanged}
                    style="margin-right: 8px;"
                  />
                  <strong>Equal Probability Mode</strong>
                </label>
                <div style="font-size: 12px; color: #666; margin-top: 4px; margin-left: 28px;">
                  <strong>Checked:</strong> Every media item has equal chance of selection (true statistical fairness)<br>
                  <strong>Unchecked:</strong> Each folder gets equal representation (smaller folders overrepresented)
                </div>
              </div>
              
              ${this._config.subfolder_queue?.equal_probability_mode !== false ? html`
                <div style="margin-bottom: 16px;">
                  <label style="display: block; margin-bottom: 4px; font-weight: 500;">Estimated Library Size:</label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    .value=${this._config.subfolder_queue?.estimated_library_size || ''}
                    @input=${this._estimatedLibrarySizeChanged}
                    placeholder="e.g., 10000 or 200000"
                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                  />
                  <div style="font-size: 12px; color: #666; margin-top: 4px;">
                    Estimated number of media files in your library (used to optimize queue size)
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Random Mode (for folder-based modes) -->
        ${mediaSourceType !== 'single_media' ? html`
          <div class="config-row">
            <label>Random Mode</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.random_mode || false}
                @change=${this._randomModeChanged}
              />
              <div class="help-text">Show media files in random order</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Queue Size</label>
            <div>
              <input
                type="number"
                min="10"
                max="10000"
                step="10"
                .value=${this._config.subfolder_queue?.queue_size || this._calculateQueueSize()}
                @input=${this._queueSizeChanged}
                placeholder="${this._calculateQueueSize()}"
              />
              <div class="help-text">Number of items to pre-load into queue (auto: max(100, library_size/100)). Useful for debugging.</div>
            </div>
          </div>
        ` : ''}

        <div class="config-row">
          <label>Media Type</label>
          <div>
            <select @change=${this._mediaTypeChanged} .value=${this._config.media_type || 'all'}>
              <option value="all">All Media (Images + Videos)</option>
              <option value="image">Images Only (JPG, PNG, GIF)</option>
              <option value="video">Videos Only (MP4, WebM, etc.)</option>
            </select>
            <div class="help-text">What types of media to display</div>
          </div>
        </div>

        <div class="config-row">
          <label>Media Path</label>
          <div>
            <div class="media-path-row">
              <input
                type="text"
                .value=${this._config.media_path || ''}
                @input=${this._mediaPathChanged}
                placeholder="media-source://media_source/local/folder/file.mp4"
              />
              <button class="browse-button" @click=${this._openMediaBrowser}>
                📁 Browse
              </button>
            </div>
            <div class="help-text">Path to media file or folder using media-source format</div>
            ${this._renderValidationStatus()}
            ${this._renderFolderModeStatus()}
          </div>
        </div>

        <!-- Single Media Mode Options -->
        ${mediaSourceType === 'single_media' ? html`
          <div class="config-row">
            <label>Refresh Interval</label>
            <div>
              <input
                type="number"
                .value=${this._config.auto_refresh_seconds || ''}
                @input=${this._autoRefreshChanged}
                placeholder="0"
                min="0"
                max="3600"
                step="1"
              />
              <div class="help-text">Refresh image/video every N seconds (0 = disabled, useful for cameras)</div>
            </div>
          </div>
        ` : ''}

        <!-- Folder Mode Options -->
        ${mediaSourceType !== 'single_media' ? html`
          <div class="config-row">
            <label>Auto-Advance Interval</label>
            <div>
              <input
                type="number"
                .value=${this._config.auto_advance_seconds || ''}
                @input=${this._autoAdvanceChanged}
                placeholder="0"
                min="0"
                max="3600"
                step="1"
              />
              <div class="help-text">Automatically advance to next media every N seconds (0 = disabled)</div>
            </div>
          </div>
        ` : ''}

        ${this._config.media_type === 'video' || this._config.media_type === 'all' ? html`
          <div class="section">
            <div class="section-title">🎬 Video Options</div>
            
            <div class="config-row">
              <label>Autoplay</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.video_autoplay || false}
                  @change=${this._autoplayChanged}
                />
                <div class="help-text">Start playing automatically when loaded</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Loop</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.video_loop || false}
                  @change=${this._loopChanged}
                />
                <div class="help-text">Restart video when it ends</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Muted</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.video_muted || false}
                  @change=${this._mutedChanged}
                />
                <div class="help-text">Start video without sound</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Hide Options Display</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.hide_video_controls_display || false}
                  @change=${this._hideVideoControlsDisplayChanged}
                />
                <div class="help-text">Hide the "Video options: ..." text below the video</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Max Video Duration</label>
              <div>
                <input
                  type="number"
                  min="0"
                  .value=${this._config.video_max_duration || 0}
                  @change=${this._videoMaxDurationChanged}
                  placeholder="0"
                />
                <div class="help-text">Maximum time to play videos in seconds (0 = play to completion)</div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">🖼️ Image Options</div>
          
          <div class="config-row">
            <label>Image Scaling</label>
            <div>
              <select @change=${this._aspectModeChanged} .value=${this._config.aspect_mode || 'default'}>
                <option value="default">Default (fit to card width)</option>
                <option value="smart-scale">Smart Scale (limit height, prevent scrolling)</option>
                <option value="viewport-fit">Viewport Fit (fit entire image in viewport)</option>
                <option value="viewport-fill">Viewport Fill (fill entire viewport)</option>
              </select>
              <div class="help-text">How images should be scaled</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Refresh Button</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.show_refresh_button || false}
                @change=${this._refreshButtonChanged}
              />
              <div class="help-text">Show manual refresh button on the card</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Enable Image Zoom</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.enable_image_zoom || false}
                @change=${this._imageZoomChanged}
              />
              <div class="help-text">Click/tap on images to zoom in at that point</div>
            </div>
          </div>
          
          ${this._config.enable_image_zoom ? html`
            <div class="config-row">
              <label>Zoom Level</label>
              <div>
                <input
                  type="number"
                  min="1.5"
                  max="5.0"
                  step="0.5"
                  .value=${this._config.zoom_level || 2.0}
                  @change=${this._zoomLevelChanged}
                />
                <div class="help-text">How much to zoom when clicked (1.5x to 5.0x)</div>
              </div>
            </div>
          ` : ''}
        </div>

        ${mediaSourceType === 'simple_folder' || mediaSourceType === 'subfolder_queue' ? html`
          <div class="section">
            <div class="section-title">🧭 Navigation Options</div>
            
            <div class="config-row">
              <label>Enable Navigation Zones</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.enable_navigation_zones !== false}
                  @change=${this._navigationZonesChanged}
                />
                <div class="help-text">Show clickable left/right zones for navigation (25% left, 25% right)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Show Position Indicator</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.show_position_indicator !== false}
                  @change=${this._positionIndicatorChanged}
                />
                <div class="help-text">Display "X of Y" counter in bottom right corner</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Show Dots Indicator</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.show_dots_indicator !== false}
                  @change=${this._dotsIndicatorChanged}
                />
                <div class="help-text">Show dot indicators in bottom center (for ≤15 items)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Keyboard Navigation</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.enable_keyboard_navigation !== false}
                  @change=${this._keyboardNavigationChanged}
                />
                <div class="help-text">Enable left/right arrow keys for navigation</div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">📋 Metadata Display</div>
          
          <div class="config-row">
            <label>Title</label>
            <div>
              <input
                type="text"
                .value=${this._config.title || ''}
                @input=${this._titleChanged}
                placeholder="Optional card title"
              />
              <div class="help-text">Displayed above the media</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Show Folder Name</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.metadata?.show_folder !== false}
                @change=${this._metadataShowFolderChanged}
              />
              <div class="help-text">Display the parent folder name</div>
            </div>
          </div>
          
          ${this._config.metadata?.show_folder !== false ? html`
            <div class="config-row">
              <label>Show Root Folder</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.metadata?.show_root_folder || false}
                  @change=${this._metadataShowRootFolderChanged}
                />
                <div class="help-text">Show "first...last" instead of just "last" folder</div>
              </div>
            </div>
          ` : ''}
          
          <div class="config-row">
            <label>Show File Name</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.metadata?.show_filename !== false}
                @change=${this._metadataShowFilenameChanged}
              />
              <div class="help-text">Display the media file name</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Show Date</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.metadata?.show_date !== false}
                @change=${this._metadataShowDateChanged}
              />
              <div class="help-text">Display the file date (if available in filename)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Show Location</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.metadata?.show_location !== false}
                @change=${this._metadataShowLocationChanged}
              />
              <div class="help-text">Display geocoded location from EXIF data (requires media_index integration)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Metadata Position</label>
            <div>
              <select @change=${this._metadataPositionChanged} .value=${this._config.metadata?.position || 'bottom-left'}>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
              </select>
              <div class="help-text">Where to display the metadata overlay</div>
            </div>
          </div>
        </div>

        ${useMediaIndex ? html`
          <div class="section">
            <div class="section-title">⭐ Action Buttons</div>
            
            <div class="config-row">
              <label>Enable Favorite Button</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.enable_favorite !== false}
                  @change=${this._actionButtonsEnableFavoriteChanged}
                />
                <div class="help-text">Show heart icon to favorite images (requires media_index)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Enable Delete Button</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.enable_delete !== false}
                  @change=${this._actionButtonsEnableDeleteChanged}
                />
                <div class="help-text">Show trash icon to delete images (requires media_index)</div>
              </div>
            </div>
            
            ${this._config.action_buttons?.enable_delete !== false ? html`
              <div class="config-row">
                <label>Delete Confirmation</label>
                <div>
                  <input
                    type="checkbox"
                    .checked=${this._config.action_buttons?.delete_confirmation !== false}
                    @change=${this._actionButtonsDeleteConfirmationChanged}
                  />
                  <div class="help-text">Require confirmation before deleting media files</div>
                </div>
              </div>
            ` : ''}
            
            <div class="config-row">
              <label>Enable Edit Button</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.enable_edit !== false}
                  @change=${this._actionButtonsEnableEditChanged}
                />
                <div class="help-text">Show pencil icon to mark images for editing (requires media_index)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Button Position</label>
              <div>
                <select @change=${this._actionButtonsPositionChanged}>
                  <option value="top-right" .selected=${(this._config.action_buttons?.position || 'top-right') === 'top-right'}>Top Right</option>
                  <option value="top-left" .selected=${this._config.action_buttons?.position === 'top-left'}>Top Left</option>
                  <option value="bottom-right" .selected=${this._config.action_buttons?.position === 'bottom-right'}>Bottom Right</option>
                  <option value="bottom-left" .selected=${this._config.action_buttons?.position === 'bottom-left'}>Bottom Left</option>
                </select>
                <div class="help-text">Corner position for action buttons</div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">👆 Interactions</div>
          
          <div class="config-row">
            <label>Tap Action</label>
            <div>
              <select @change=${this._tapActionChanged} .value=${this._config.tap_action?.action || 'none'}>
                <option value="none">No Action</option>
                <option value="more-info">More Info</option>
                <option value="toggle">Toggle Entity</option>
                <option value="perform-action">Call Service</option>
                <option value="navigate">Navigate</option>
                <option value="url">Open URL</option>
              </select>
              <div class="help-text">Action when card is tapped</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Hold Action</label>
            <div>
              <select @change=${this._holdActionChanged} .value=${this._config.hold_action?.action || 'none'}>
                <option value="none">No Action</option>
                <option value="more-info">More Info</option>
                <option value="toggle">Toggle Entity</option>
                <option value="perform-action">Call Service</option>
                <option value="navigate">Navigate</option>
                <option value="url">Open URL</option>
              </select>
              <div class="help-text">Action when card is held (0.5+ seconds)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Double Tap Action</label>
            <div>
              <select @change=${this._doubleTapActionChanged} .value=${this._config.double_tap_action?.action || 'none'}>
                <option value="none">No Action</option>
                <option value="more-info">More Info</option>
                <option value="toggle">Toggle Entity</option>
                <option value="perform-action">Call Service</option>
                <option value="navigate">Navigate</option>
                <option value="url">Open URL</option>
              </select>
              <div class="help-text">Action when card is double-tapped</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">🖼️ Kiosk Mode</div>
          
          <div class="config-row">
            <label>Kiosk Control Entity</label>
            <div>
              <select @change=${this._kioskModeEntityChanged} .value=${this._config.kiosk_mode_entity || ''}>
                <option value="">Select Input Boolean...</option>
                ${this._renderInputBooleanEntityOptions()}
              </select>
              <div class="help-text">Entity to toggle when exiting kiosk mode (requires kiosk-mode integration)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Kiosk Exit Action</label>
            <div>
              <select @change=${this._kioskModeExitActionChanged} .value=${this._config.kiosk_mode_exit_action || 'tap'}>
                <option value="tap">Single Tap</option>
                <option value="hold">Hold (0.5s)</option>
                <option value="double_tap">Double Tap</option>
              </select>
              <div class="help-text">How to trigger kiosk mode exit</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Show Exit Hint</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.kiosk_mode_show_indicator !== false}
                @change=${this._kioskModeShowIndicatorChanged}
              />
              <div class="help-text">Show subtle exit hint in corner (when kiosk entity is configured)</div>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
          <h4 style="margin-top: 0; color: white;">🎉 V4 Editor COMPLETE!</h4>
          <ul style="margin: 8px 0; padding-left: 20px; font-size: 13px; color: rgba(255,255,255,0.95);">
            <li>✅ Basic settings (title, media type, scaling)</li>
            <li>✅ Media path with validation</li>
            <li>✅ Auto refresh controls</li>
            <li>✅ Video options (autoplay, loop, muted, duration)</li>
            <li>✅ Image options (zoom)</li>
            <li>✅ Navigation options (zones, indicators, keyboard)</li>
            <li>✅ Metadata display (folder, filename, date, location)</li>
            <li>✅ Media Index integration</li>
            <li>✅ Action Buttons (favorite, delete, edit)</li>
            <li>✅ Subfolder Queue settings</li>
            <li>✅ Interactions (tap, hold, double-tap)</li>
            <li>✅ Kiosk mode</li>
            <li>✅ <strong>Full working media browser with folder navigation!</strong></li>
          </ul>
          <p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 13px;">
            <strong>Next step:</strong> Adapt for v5 Mode+Backend architecture
          </p>
        </div>
      </div>
    `;
  }
}

// Register the custom elements
customElements.define('media-card-v5a', MediaCardV5a);
customElements.define('media-card-v5a-editor', MediaCardV5aEditor);

// Register with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'media-card-v5a',
  name: 'Media Card v5a',
  description: 'Media Card v5 Clean Rebuild - V4 Editor with Dependencies',
  preview: true,
  documentationURL: 'https://github.com/markaggar/ha-media-card'
});

console.info(
  '%c  MEDIA-CARD-V5A  %c  V4 Editor Base Loaded  ',
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: green'
);
