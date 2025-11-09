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
 * ReconnectionManager - Preserve queue state across disconnections
 * Copied from V4 (lines 12-13, 4945-4981, 643-666)
 * 
 * Uses global window.Map to survive card disconnections when navigating
 * between views in Home Assistant
 */
class ReconnectionManager {
  constructor() {
    // Copy from V4 lines 12-13 - Global Map initialization
    if (!window.mediaCardSubfolderQueues) {
      window.mediaCardSubfolderQueues = new Map();
    }
    this.globalQueues = window.mediaCardSubfolderQueues;
  }

  /**
   * Preserve queue state when card disconnects
   * Copy from V4 lines 4952-4981
   */
  preserveQueue(cardId, queueData) {
    this.globalQueues.set(cardId, {
      ...queueData,
      timestamp: Date.now()  // NEW - add timestamp for cleanup (V4 doesn't have this)
    });
  }

  /**
   * Restore queue state when card reconnects
   * Copy from V4 lines 643-666
   */
  restoreQueue(cardId) {
    if (this.globalQueues.has(cardId)) {
      const preserved = this.globalQueues.get(cardId);
      
      // NEW - check timestamp validity (V4 doesn't validate age)
      if (this._isValid(preserved)) {
        // Copy from V4 line 656 - delete after successful restore
        this.globalQueues.delete(cardId);
        return preserved;
      } else {
        // Expired - clean up
        this.globalQueues.delete(cardId);
      }
    }
    return null;
  }

  /**
   * Clean up old queues to prevent memory leaks
   * NEW - V4 has no cleanup mechanism
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [key, data] of this.globalQueues) {
      if (data.timestamp && (now - data.timestamp) > maxAge) {
        this.globalQueues.delete(key);
      }
    }
  }

  /**
   * Validate preserved queue is not too old
   * NEW - V4 doesn't validate timestamp
   */
  _isValid(preserved) {
    if (!preserved.timestamp) return true; // Backward compat - accept old data without timestamp
    const maxAge = 30 * 60 * 1000; // 30 minutes
    return (Date.now() - preserved.timestamp) < maxAge;
  }

  /**
   * Get count of preserved queues
   */
  getPreservedCount() {
    return this.globalQueues.size;
  }

  /**
   * Get all preserved queue IDs
   */
  getPreservedIds() {
    return Array.from(this.globalQueues.keys());
  }
}

/**
 * VisibilityManager - Handle card visibility and pause/resume
 * Copied from V4 (lines 5080-5156, 1632-1665)
 * 
 * Tracks both card visibility (IntersectionObserver) and page visibility
 * (document.visibilityState) to pause activity when card not visible
 */
class VisibilityManager {
  constructor(card) {
    this.card = card;
    
    // Copy from V4 lines 5080-5087 - Dual visibility tracking
    this.isCardVisible = true;      // IntersectionObserver - is card in viewport?
    this.isPageVisible = true;      // visibilitychange - is tab active?
    this.isBackgroundPaused = false; // Combined pause state
    this.isEditMode = false;         // NEW - track edit mode (V4 doesn't have this)
  }

  /**
   * Handle visibility changes for both card and page
   * Copy from V4 lines 5117-5156
   */
  handleVisibilityChange(isCardVisible, isPageVisible) {
    this.isCardVisible = isCardVisible;
    this.isPageVisible = isPageVisible;
    
    // Copy from V4 line 5119 - Calculate combined visibility
    const shouldBeActive = this.isCardVisible && this.isPageVisible;
    
    // Copy from V4 lines 5123-5155 - Resume or pause based on visibility
    if (shouldBeActive && this.isBackgroundPaused) {
      this._resume();
    } else if (!shouldBeActive && !this.isBackgroundPaused) {
      this._pause();
    }
  }

  /**
   * Resume all activity when card becomes visible
   * Copy from V4 lines 5123-5143
   */
  _resume() {
    this.isBackgroundPaused = false;
    
    // Callback to card to resume all activity
    if (this.card.resumeAllActivity) {
      this.card.resumeAllActivity();
    }
  }

  /**
   * Pause all activity when card becomes hidden
   * Copy from V4 lines 5145-5154
   */
  _pause() {
    this.isBackgroundPaused = true;
    
    // Callback to card to pause all activity
    if (this.card.pauseAllActivity) {
      this.card.pauseAllActivity();
    }
  }

  /**
   * Enter edit mode - destroy preview queues
   * NEW - V4 doesn't have explicit edit mode detection
   */
  onEditModeEnter() {
    this.isEditMode = true;
    if (this.card.destroyPreviewQueues) {
      this.card.destroyPreviewQueues();
    }
  }

  /**
   * Exit edit mode - reinitialize card
   * NEW - V4 doesn't have explicit edit mode detection
   */
  onEditModeExit() {
    this.isEditMode = false;
    if (this.card.reinitialize) {
      this.card.reinitialize();
    }
  }

  /**
   * Check if activity should be paused
   * Copy from V4 lines 1632-1665 - Used by timers to check before running
   */
  shouldPauseActivity() {
    return this.isBackgroundPaused || this.isEditMode;
  }

  /**
   * Get current visibility state for debugging
   */
  getState() {
    return {
      isCardVisible: this.isCardVisible,
      isPageVisible: this.isPageVisible,
      isBackgroundPaused: this.isBackgroundPaused,
      isEditMode: this.isEditMode,
      shouldBeActive: this.isCardVisible && this.isPageVisible
    };
  }
}

/**
 * VideoManager - Handle video playback and auto-advance
 * Copied from V4 (lines 4400-4453)
 * 
 * Manages video pause/resume events and auto-advance on video end
 */
class VideoManager {
  constructor(config) {
    this.maxDuration = config.video?.max_duration_seconds || 0;
    this.advanceOnEnd = config.video?.advance_on_end !== false;
    this.loop = config.video?.loop === true;
    
    // Copy from V4 lines 88-90 - Pause tracking
    this.pausedByVideo = false;
    this.currentTimer = null;
    this.isConnected = true; // Track connection state
  }

  /**
   * Handle video start event
   * Copy from V4 lines 4400-4413
   */
  onVideoStart(videoElement, advanceCallback, resumeCallback) {
    // Resume slideshow if it was paused by video pause
    // Copy from V4 lines 4406-4410
    if (this.pausedByVideo && resumeCallback) {
      resumeCallback();
      this.pausedByVideo = false;
    }

    // Set up max duration timer if configured
    // NEW - V4 doesn't have this in onVideoStart, but it's logical placement
    if (this.maxDuration > 0 && advanceCallback) {
      this.currentTimer = setTimeout(() => {
        advanceCallback();
      }, this.maxDuration * 1000);
    }

    // Set up end event listener
    // Copy from V4 pattern - advance on video end
    if (this.advanceOnEnd && !this.loop && videoElement && advanceCallback) {
      videoElement.addEventListener('ended', () => {
        this.onVideoEnd(advanceCallback);
      }, { once: true });
    }
  }

  /**
   * Handle video pause event
   * Copy from V4 lines 4415-4430
   */
  onVideoPause(pauseCallback) {
    // CRITICAL: Ignore pause events when disconnected
    // Copy from V4 lines 4417-4421
    if (!this.isConnected) {
      return;
    }

    // Pause slideshow when user manually pauses video
    // Copy from V4 lines 4424-4428
    if (!this.pausedByVideo && pauseCallback) {
      this.pausedByVideo = true;
      pauseCallback();
    }
  }

  /**
   * Handle video ended event
   * Copy from V4 lines 4432-4453
   */
  onVideoEnd(advanceCallback) {
    // Clear max duration timer
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }

    // Advance to next video with delay
    // Copy from V4 lines 4441-4451 - setTimeout delay pattern
    if (this.advanceOnEnd && !this.loop && advanceCallback) {
      setTimeout(() => {
        advanceCallback();
      }, 100); // Small delay to ensure video ended event is fully processed
    }
  }

  /**
   * Set connection state
   * Copy from V4 line 4417 logic - prevents pause events after disconnect
   */
  setConnectionState(isConnected) {
    this.isConnected = isConnected;
  }

  /**
   * Clean up timers
   */
  cleanup() {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    this.pausedByVideo = false;
  }
}

/**
 * MediaQueue - Unified queue management for all providers
 * Based on SubfolderQueue pattern from V4 (lines 6658-6750)
 */
class MediaQueue {
  constructor(config = {}) {
    this.items = [];              // Queue of media items to show
    this.shownItems = new Set();  // Blacklist of already shown items
    this.currentIndex = 0;        // For sequential modes
    
    // Copy from V4 lines 1611-1680 - Auto-advance timer
    this.autoRefreshSeconds = config.auto_refresh_seconds || 0;
    this.refreshInterval = null;
    this.isPaused = false;
    this.isBackgroundPaused = false;
    this.loggedPausedState = false;
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
   * Setup auto-advance timer
   * Copy from V4 lines 1611-1680
   */
  setupAutoAdvance(advanceCallback, isDiscoveryCallback = null) {
    // Clear any existing interval FIRST to prevent multiple timers
    // Copy from V4 lines 1613-1617
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Don't set up auto-refresh if paused or not visible
    // Copy from V4 lines 1619-1633
    if (this.isPaused) {
      // Only log once when transitioning to paused state
      if (!this.loggedPausedState) {
        console.log('[MediaQueue] Auto-advance setup skipped - currently paused');
        this.loggedPausedState = true;
      }
      return;
    } else {
      // Reset flag when not paused
      this.loggedPausedState = false;
    }
    
    if (this.isBackgroundPaused) {
      console.log('[MediaQueue] Auto-advance setup skipped - background activity paused (not visible)');
      return;
    }

    // Set up auto-advance if enabled
    // Copy from V4 lines 1635-1677
    if (this.autoRefreshSeconds > 0 && advanceCallback) {
      console.log(`[MediaQueue] Setting up auto-advance every ${this.autoRefreshSeconds} seconds`);
      
      this.refreshInterval = setInterval(() => {
        // Check both pause states before running
        // Copy from V4 lines 1648-1650
        if (!this.isPaused && !this.isBackgroundPaused) {
          // Skip if discovery is actively in progress AND queue is empty
          // Copy from V4 lines 1652-1663
          if (isDiscoveryCallback && isDiscoveryCallback()) {
            // Only block if queue is empty - if we have items, continue while scanning in background
            if (this.items.length === 0) {
              console.log('[MediaQueue] Auto-advance skipped - discovery in progress (queue empty)');
              return;
            } else {
              console.log(`[MediaQueue] Auto-advance proceeding - discovery in progress but queue has ${this.items.length} items`);
            }
          }
          
          // Trigger advance
          advanceCallback();
        } else {
          console.log(`[MediaQueue] Auto-advance skipped - isPaused: ${this.isPaused}, backgroundPaused: ${this.isBackgroundPaused}`);
        }
      }, this.autoRefreshSeconds * 1000);
      
      console.log('[MediaQueue] Auto-advance interval started with ID:', this.refreshInterval);
    } else {
      console.log('[MediaQueue] Auto-advance disabled or not configured:', {
        autoRefreshSeconds: this.autoRefreshSeconds,
        hasCallback: !!advanceCallback
      });
    }
  }

  /**
   * Stop auto-advance timer
   */
  stopAutoAdvance() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Set pause state
   * Copy from V4 pause/resume patterns
   */
  setPauseState(isPaused, isBackgroundPaused = false) {
    this.isPaused = isPaused;
    this.isBackgroundPaused = isBackgroundPaused;
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
   * V4: Extract filename from path (shared utility)
   * Moved from SingleMediaProvider for reuse by other providers
   */
  static extractFilename(path) {
    if (!path) return '';
    return path.split('/').pop() || path;
  }

  /**
   * V4: Extract parent folder name from file path (shared utility)
   * Moved from SubfolderQueue for reuse by other providers
   */
  static extractFolderName(pathOrFile) {
    const path = typeof pathOrFile === 'string' ? pathOrFile : pathOrFile?.media_content_id;
    if (!path) return 'unknown';
    const pathParts = path.split('/');
    return pathParts[pathParts.length - 2] || 'root';
  }

  /**
   * V4: Detect media type from path (shared utility)
   * Moved from SingleMediaProvider for reuse by other providers
   */
  static detectMediaType(path) {
    const type = MediaUtils.detectFileType(path);
    return type === 'video' ? 'video' : 'image';
  }

  /**
   * V4: Extract metadata from file path (shared by providers and card)
   * Moved from SingleMediaProvider to base class for reuse
   */
  static extractMetadataFromPath(mediaPath) {
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
    const dateFromFilename = MediaProvider.extractDateFromFilename(filename);
    if (dateFromFilename) {
      metadata.date = dateFromFilename;
    }
    
    return metadata;
  }
  
  /**
   * V4: Extract date from filename patterns (shared helper)
   * Moved from SingleMediaProvider to base class for reuse
   */
  static extractDateFromFilename(filename) {
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

  /**
   * V4: Extract metadata with optional media_index EXIF enrichment (shared helper)
   * Used by both SingleMediaProvider and card's _extractMetadataFromItem
   */
  static async extractMetadataWithExif(mediaPath, config, hass) {
    // Step 1: Extract path-based metadata
    let metadata = MediaProvider.extractMetadataFromPath(mediaPath);
    
    console.log('🔍 extractMetadataWithExif - mediaPath:', mediaPath);
    console.log('🔍 media_index configured?', MediaProvider.isMediaIndexActive(config));
    console.log('🔍 hass available?', !!hass);
    
    // Step 2: Enrich with media_index EXIF data if hass is available
    // Try to call media_index even if not explicitly configured as media source
    // This allows metadata enrichment for subfolder/simple folder modes
    if (hass) {
      console.log('📡 Attempting to fetch EXIF metadata from media_index...');
      try {
        const enrichedMetadata = await MediaIndexHelper.fetchFileMetadata(
          hass,
          config,  // Pass full config
          mediaPath
        );
        
        console.log('📊 Got enriched metadata:', enrichedMetadata);
        
        if (enrichedMetadata) {
          // Merge path-based and EXIF metadata (EXIF takes precedence)
          metadata = { ...metadata, ...enrichedMetadata };
          console.log('✅ Merged metadata:', metadata);
        }
      } catch (error) {
        console.warn('⚠️ Failed to fetch media_index metadata (service may not be installed):', error);
        // Fall back to path-based metadata only
      }
    } else {
      console.log('⏭️ Skipping EXIF enrichment - hass not available');
    }
    
    return metadata;
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
    // Validate media path
    if (!this.mediaPath) {
      console.warn('[SingleMediaProvider] No media path configured');
      return false;
    }
    
    // V5: Use shared metadata extraction helper (path-based + optional EXIF)
    const metadata = await MediaProvider.extractMetadataWithExif(
      this.mediaPath,
      this.config,
      this.hass
    );
    console.log('📊 Extracted metadata for single media:', metadata);
    
    this.currentItem = {
      media_content_id: this.mediaPath,
      title: MediaProvider.extractFilename(this.mediaPath),
      media_content_type: MediaProvider.detectMediaType(this.mediaPath),
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

// =================================================================
// FOLDER PROVIDER - Wraps SubfolderQueue for folder slideshow
// =================================================================

class FolderProvider extends MediaProvider {
  constructor(config, hass, card = null) {
    super(config, hass);
    this.subfolderQueue = null;
    this.card = card; // V5: Reference to card for accessing navigation history
    
    // Create a card-like object for SubfolderQueue (V4 compatibility)
    this.cardAdapter = {
      config: this._adaptConfigForV4(),
      hass: hass,
      _debugMode: true,  // TEMP: Force debug to see scan logs
      _backgroundPaused: false,
      _log: (...args) => console.log('[FolderProvider]', ...args),
      
      // V4 EXACT methods - copied from ha-media-card.js lines 253-3243
      _getFileExtension: (fileName) => {
        return fileName?.split('.').pop()?.toLowerCase();
      },
      
      _isMediaFile: function(filePath) {
        // Extract filename from the full path and get extension  
        const fileName = filePath.split('/').pop() || filePath;
        const extension = this._getFileExtension(fileName);
        const isMedia = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
        // Reduced logging - only log 0.1% of files (1 in 1000)
        if (Math.random() < 0.001) {
          this._log('📄', fileName);
        }
        return isMedia;
      }
    };
  }

  _adaptConfigForV4() {
    // V4 SubfolderQueue expects: card.config.subfolder_queue and card.config.media_path
    // V5 has: config.folder.path, config.folder.priority_folders, config.slideshow_window
    
    return {
      media_path: this.config.folder?.path || '',
      folder_mode: this.config.folder?.mode || 'random',  // V4 expects this at root level
      slideshow_window: this.config.slideshow_window || 1000,
      media_type: this.config.media_type || 'all',  // V5: Pass through media_type for filtering
      folder: {
        order_by: this.config.folder?.order_by || 'date_taken',
        sequential: {
          order_by: this.config.folder?.order_by || 'date_taken',
          order_direction: this.config.folder?.sequential?.order_direction || 'desc'
        }
      },
      subfolder_queue: {
        enabled: this.config.folder?.recursive !== false,
        scan_depth: this.config.folder?.scan_depth !== undefined ? this.config.folder.scan_depth : null, // null = unlimited
        priority_folder_patterns: this.config.folder?.priority_folders || [],
        equal_probability_mode: false,
        estimated_total_photos: this.config.folder?.estimated_total_photos || null,
        queue_size: this.config.slideshow_window || 1000,
        max_shown_items_history: this.config.slideshow_window || 1000,
        background_scan: true
      },
      suppress_subfolder_logging: false  // TEMP: Force logging to see what's happening
    };
  }

  async initialize() {
    // Determine mode from v5 config structure
    const recursive = this.config.folder?.recursive !== false; // Default true
    const mode = this.config.folder?.mode || 'random';
    
    console.log('[FolderProvider] Initialize - mode:', mode, 'recursive:', recursive);
    console.log('[FolderProvider] Config:', this.config);
    
    // V5 ARCHITECTURE: Check if media_index should be used for discovery
    // Default: true when media_index is configured (use_media_index_for_discovery defaults to true)
    const useMediaIndex = this.config.folder?.use_media_index_for_discovery !== false && 
                          MediaProvider.isMediaIndexActive(this.config);
    
    console.log('[FolderProvider] useMediaIndex:', useMediaIndex);
    
    // SEQUENTIAL MODE - Ordered iteration through files
    if (mode === 'sequential') {
      if (useMediaIndex) {
        // Full sequential mode with database ordering
        console.log('[FolderProvider] Using SequentialMediaIndexProvider for ordered queries');
        this.sequentialProvider = new SequentialMediaIndexProvider(this.config, this.hass);
        const success = await this.sequentialProvider.initialize();
        
        if (!success) {
          console.warn('[FolderProvider] SequentialMediaIndexProvider initialization failed');
          return false;
        }
        
        console.log('[FolderProvider] ✅ SequentialMediaIndexProvider initialized');
        return true;
        
      } else {
        // V5 FEATURE: Filesystem sequential mode with recursive support
        // Use case: Integration sources (Reolink cameras, Synology Photos) with hierarchical folders
        console.log('[FolderProvider] Using SubfolderQueue in sequential mode (filesystem with recursive scan)');
        
        // V5: Enable recursive scanning for sequential filesystem mode
        const adaptedConfig = this._adaptConfigForV4();
        adaptedConfig.subfolder_queue.enabled = recursive; // Use config recursive setting
        adaptedConfig.subfolder_queue.scan_depth = this.config.folder?.scan_depth || null; // Use config or unlimited
        
        // Use slideshow_window as scan limit (performance control)
        adaptedConfig.slideshow_window = this.config.slideshow_window || 1000;
        
        console.log('[FolderProvider] Sequential scan config:', {
          recursive: adaptedConfig.subfolder_queue.enabled,
          scan_depth: adaptedConfig.subfolder_queue.scan_depth || 'unlimited',
          slideshow_window: adaptedConfig.slideshow_window
        });
        
        // Update cardAdapter config
        this.cardAdapter.config = adaptedConfig;
        
        this.subfolderQueue = new SubfolderQueue(this.cardAdapter);
        const success = await this.subfolderQueue.initialize();
        
        if (!success) {
          console.warn('[FolderProvider] SubfolderQueue initialization failed');
          return false;
        }
        
        // Sort queue after scan
        await this._sortQueueSequential();
        
        console.log('[FolderProvider] ✅ SubfolderQueue initialized and sorted for sequential mode');
        return true;
      }
    }
    
    // RANDOM MODE - Random selection with weighted folders
    if (mode === 'random' && recursive) {
      // V5 ARCHITECTURE: Use MediaIndexProvider when enabled, fallback to SubfolderQueue
      if (useMediaIndex) {
        console.log('[FolderProvider] Using MediaIndexProvider for discovery');
        this.mediaIndexProvider = new MediaIndexProvider(this.config, this.hass, this.card);
        const success = await this.mediaIndexProvider.initialize();
        
        if (!success) {
          console.warn('[FolderProvider] MediaIndexProvider initialization failed, falling back to SubfolderQueue');
          // Fallback to filesystem scanning
          this.mediaIndexProvider = null;
        } else {
          console.log('[FolderProvider] ✅ MediaIndexProvider initialized');
          return true;
        }
      }
      
      // Use SubfolderQueue (filesystem scanning) if media_index disabled or failed
      if (!this.mediaIndexProvider) {
        console.log('[FolderProvider] Using SubfolderQueue for filesystem scanning');
        
        // V5 RECONNECTION: Check if card has existing SubfolderQueue from reconnection
        if (this.card && this.card._existingSubfolderQueue) {
          console.log('[FolderProvider] 🔗 Using reconnected SubfolderQueue from registry');
          this.subfolderQueue = this.card._existingSubfolderQueue;
          this.card._existingSubfolderQueue = null; // Clear reference after using
          
          // Update cardAdapter reference in reconnected queue
          this.subfolderQueue.card = this.cardAdapter;
          console.log('[FolderProvider] ✅ SubfolderQueue reconnected with', this.subfolderQueue.queue.length, 'items');
          return true;
        }
        
        console.log('[FolderProvider] Adapted config for SubfolderQueue:', this.cardAdapter.config);
        
        // Create SubfolderQueue instance with V4-compatible card adapter
        this.subfolderQueue = new SubfolderQueue(this.cardAdapter);
        console.log('[FolderProvider] SubfolderQueue created, calling initialize...');
        console.log('[FolderProvider] cardAdapter config:', this.cardAdapter.config);
        console.log('[FolderProvider] cardAdapter._debugMode:', this.cardAdapter._debugMode);
        
        const success = await this.subfolderQueue.initialize();
        
        console.log('[FolderProvider] Initialize returned:', success);
        console.log('[FolderProvider] Queue length after initialize:', this.subfolderQueue.queue.length);
        console.log('[FolderProvider] Discovered folders:', this.subfolderQueue.discoveredFolders.length);
        
        if (!success) {
          console.warn('[FolderProvider] SubfolderQueue initialization failed');
          return false;
        }
        
        console.log('[FolderProvider] ✅ SubfolderQueue initialized - enrichment will happen on-demand');
        return true;
      }
    }
    
    // Unsupported mode
    console.warn('[FolderProvider] Unsupported mode/configuration. Mode:', mode, 'Recursive:', recursive);
    return false;
  }

  // Sort SubfolderQueue for sequential mode (filesystem fallback)
  async _sortQueueSequential() {
    const orderBy = this.config.folder?.order_by || 'date_taken';
    const direction = this.config.folder?.sequential?.order_direction || 'desc';
    
    console.log('[FolderProvider] Sorting queue by', orderBy, direction);
    
    // If media_index is active AND we're sorting by EXIF data, enrich items first
    // Otherwise, enrichment happens on-demand when displaying items
    const needsUpfrontEnrichment = MediaProvider.isMediaIndexActive(this.config) && 
                                   (orderBy === 'date_taken' || orderBy === 'modified_time');
    
    if (needsUpfrontEnrichment) {
      console.log('[FolderProvider] Enriching items with EXIF data for sorting by', orderBy);
      
      // Enrich each item in queue using MediaIndexHelper
      let enrichedCount = 0;
      for (const item of this.subfolderQueue.queue) {
        if (item.metadata?.has_coordinates !== undefined) continue; // Already enriched
        
        try {
          const enrichedMetadata = await MediaIndexHelper.fetchFileMetadata(
            this.hass,
            this.config,
            item.media_content_id
          );
          
          if (enrichedMetadata) {
            item.metadata = { ...item.metadata, ...enrichedMetadata };
            enrichedCount++;
          }
        } catch (error) {
          // File might not be in database - skip
          continue;
        }
      }
      
      console.log('[FolderProvider] Enriched', enrichedCount, 'items for sorting');
      console.log('[FolderProvider] Sample item:', this.subfolderQueue.queue[0]);
    } else {
      console.log('[FolderProvider] Skipping upfront enrichment - will enrich on-demand when displaying');
    }
    
    // Use shared sorting method in SubfolderQueue
    this.subfolderQueue._sortQueue();
    
    console.log('[FolderProvider] Queue sorted:', this.subfolderQueue.queue.length, 'items');
  }

  // V5: Simple passthrough - delegate to active provider
  // Card manages history, provider just supplies items
  async getNext() {
    if (this.sequentialProvider) {
      return this.sequentialProvider.getNext();
    }
    
    if (this.mediaIndexProvider) {
      return this.mediaIndexProvider.getNext();
    }
    
    if (this.subfolderQueue) {
      const item = this.subfolderQueue.getNextItem();
      
      // V5: Enrich with metadata from media_index if available
      // Even when not using media_index for discovery, we can still use it for metadata
      if (item && MediaProvider.isMediaIndexActive(this.config)) {
        console.log('[FolderProvider] 🔍 Attempting to enrich item:', item.media_content_id);
        
        // Extract file path - media_index expects /media/... format
        let filePath = item.media_content_id?.replace('media-source://media_source/', '/') || '';
        console.log('[FolderProvider] 📂 Extracted file path:', filePath);
        
        if (filePath) {
          try {
            // Try to get full metadata from media_index service
            const wsCall = {
              type: 'call_service',
              domain: 'media_index',
              service: 'get_file_metadata',
              service_data: { file_path: filePath },
              return_response: true
            };
            
            console.log('[FolderProvider] 📡 Calling get_file_metadata with:', wsCall);
            const response = await this.hass.callWS(wsCall);
            console.log('[FolderProvider] 📥 Service response:', response);
            
            if (response?.response && !response.response.error) {
              // Flatten EXIF data to match MediaIndexProvider format
              const serviceMetadata = response.response;
              const exif = serviceMetadata.exif || {};
              
              // Merge media_index metadata with path-based metadata
              const pathMetadata = MediaProvider.extractMetadataFromPath(filePath);
              item.metadata = {
                ...pathMetadata,
                ...serviceMetadata,
                // Flatten EXIF fields to top level for metadata overlay compatibility
                date_taken: exif.date_taken,
                location_city: exif.location_city,
                location_state: exif.location_state,
                location_country: exif.location_country,
                location_name: exif.location_name,
                latitude: exif.latitude,
                longitude: exif.longitude,
                has_coordinates: exif.has_coordinates || false,
                is_geocoded: exif.is_geocoded || false
              };
              console.log('[FolderProvider] ✅ Enriched item with media_index metadata:', item.metadata);
            } else {
              console.warn('[FolderProvider] ⚠️ Service returned error or no metadata:', response?.response);
              item.metadata = MediaProvider.extractMetadataFromPath(filePath);
            }
          } catch (error) {
            // Fallback to path-based metadata if service call fails
            console.error('[FolderProvider] ❌ Could not fetch media_index metadata:', error);
            item.metadata = MediaProvider.extractMetadataFromPath(filePath);
          }
        } else {
          console.warn('[FolderProvider] ⚠️ Could not extract file path from media_content_id');
        }
      } else {
        if (!item) {
          console.warn('[FolderProvider] ⚠️ SubfolderQueue returned null item');
        } else if (!MediaProvider.isMediaIndexActive(this.config)) {
          console.log('[FolderProvider] ℹ️ Media index not active, skipping metadata enrichment');
        }
      }
      
      return item;
    }
    
    console.warn('[FolderProvider] getNext() called but no provider initialized');
    return null;
  }

  // V5: REMOVED - Card handles previous navigation via history
  // getPrevious() deleted - card manages this
}

// =================================================================
// MEDIA INDEX PROVIDER - Database-backed random media queries
// =================================================================
// V4 CODE REUSE: Copied from ha-media-card.js lines 2121-2250 (_queryMediaIndex)
// Adapted for provider pattern architecture

class MediaIndexProvider extends MediaProvider {
  constructor(config, hass, card = null) {
    super(config, hass);
    this.queue = []; // Internal queue of items from database
    this.queueSize = config.slideshow_window || 100;
    this.excludedFiles = new Set(); // Track excluded files (moved to _Junk/_Edit)
    this.card = card; // V5: Reference to card for accessing navigation history
    
    // V5 OPTIMIZATION: Track recent file exhaustion to avoid wasteful service calls
    this.recentFilesExhausted = false; // Flag: skip priority_new_files if recent cache exhausted
    this.consecutiveHighFilterCount = 0; // Counter: consecutive queries with >80% filter rate
    this.EXHAUSTION_THRESHOLD = 2; // After 2 consecutive high-filter queries, consider exhausted
  }

  async initialize() {
    console.log('[MediaIndexProvider] Initializing...');
    
    // Check if media_index is configured
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('[MediaIndexProvider] Media index not configured');
      return false;
    }
    
    // Initial query to fill queue
    const items = await this._queryMediaIndex(this.queueSize);
    
    if (!items || items.length === 0) {
      console.warn('[MediaIndexProvider] No items returned from media_index');
      return false;
    }
    
    this.queue = items;
    console.log('[MediaIndexProvider] ✅ Initialized with', this.queue.length, 'items');
    return true;
  }

  async getNext() {
    // Refill queue if running low
    if (this.queue.length < 10) {
      console.log('[MediaIndexProvider] Queue low, refilling...', 'current queue size:', this.queue.length);
      
      // V5 FIX: Track paths already in queue to avoid duplicates
      const existingPaths = new Set(this.queue.map(item => item.path));
      console.log('[MediaIndexProvider] Existing paths in queue:', existingPaths.size);
      
      // V5 FIX: Also exclude paths in navigation history
      const historyPaths = new Set();
      if (this.card && this.card.history) {
        this.card.history.forEach(historyItem => {
          if (historyItem.media_content_id) {
            historyPaths.add(historyItem.media_content_id);
          }
        });
        console.log('[MediaIndexProvider] Paths in history:', historyPaths.size);
      }
      
      // V5 OPTIMIZATION: Skip priority_new_files if recent cache is exhausted
      // This avoids wasteful double service calls when we know recent files are depleted
      const shouldUsePriority = this.config.folder?.priority_new_files && !this.recentFilesExhausted;
      
      if (!shouldUsePriority && this.config.folder?.priority_new_files) {
        console.log('[MediaIndexProvider] ⚡ Skipping priority_new_files query - recent cache exhausted (saves service call)');
      }
      
      const items = await this._queryMediaIndex(this.queueSize, shouldUsePriority ? null : false);
      if (items && items.length > 0) {
        // V5 FIX: Filter out items already in queue OR history to avoid duplicates
        const newItems = items.filter(item => 
          !existingPaths.has(item.path) && !historyPaths.has(item.path)
        );
        const filteredCount = items.length - newItems.length;
        const filteredPercent = (filteredCount / items.length) * 100;
        console.log('[MediaIndexProvider] Filtered', filteredCount, 'duplicate/history items (', filteredPercent.toFixed(1), '%)');
        
        // V5 OPTIMIZATION: Track consecutive high filter rates to detect cache exhaustion
        if (filteredPercent > 80) {
          this.consecutiveHighFilterCount++;
          console.log('[MediaIndexProvider] 📊 High filter rate detected (', this.consecutiveHighFilterCount, '/', this.EXHAUSTION_THRESHOLD, ' consecutive)');
          
          // Mark recent cache as exhausted after threshold
          if (this.consecutiveHighFilterCount >= this.EXHAUSTION_THRESHOLD && !this.recentFilesExhausted) {
            this.recentFilesExhausted = true;
            console.log('[MediaIndexProvider] 🚫 Recent file cache EXHAUSTED - will skip priority_new_files on future queries');
          }
        } else {
          // Good query - reset exhaustion tracking
          if (this.consecutiveHighFilterCount > 0) {
            console.log('[MediaIndexProvider] ✅ Good query (low filter rate) - resetting exhaustion counter');
          }
          this.consecutiveHighFilterCount = 0;
          this.recentFilesExhausted = false; // Reset exhaustion flag
        }
        
        // V5 SMART RETRY: If >80% filtered and priority_new_files was enabled, retry without it
        // This handles case where all recent files are in history, need non-recent random files
        // BUT: Only retry if we haven't already skipped priority_new_files due to exhaustion
        if (filteredPercent > 80 && shouldUsePriority && this.config.folder?.priority_new_files) {
          console.log('[MediaIndexProvider] 🔄 Most items filtered! Retrying with priority_new_files=false to get non-recent random files');
          const nonRecentItems = await this._queryMediaIndex(this.queueSize, false); // false = disable priority
          
          if (nonRecentItems && nonRecentItems.length > 0) {
            const additionalItems = nonRecentItems.filter(item => 
              !existingPaths.has(item.path) && !historyPaths.has(item.path)
            );
            console.log('[MediaIndexProvider] Retry got', additionalItems.length, 'non-recent items');
            newItems.push(...additionalItems);
          }
        }
        
        if (newItems.length > 0) {
          // V5: Prepend new items to queue (priority files come first from backend)
          this.queue.unshift(...newItems);
          console.log('[MediaIndexProvider] Refilled queue with', newItems.length, 'items, now', this.queue.length, 'total');
        } else {
          console.warn('[MediaIndexProvider] ⚠️ All items were duplicates/history and retry failed - queue not refilled');
        }
      }
    }
    
    // Return next item from queue
    if (this.queue.length > 0) {
      const item = this.queue.shift();
      
      // Extract metadata using MediaProvider helper (V5 architecture)
      // V4 code already includes EXIF fields in item, so we merge path-based + EXIF
      const pathMetadata = MediaProvider.extractMetadataFromPath(item.path);
      
      return {
        // V4: Use database path for media_content_id (service calls need this)
        // URL resolution happens separately in card's _resolveMediaUrl()
        media_content_id: item.path,
        media_content_type: item.path.match(/\.(mp4|webm|ogg|mov|m4v)$/i) ? 'video' : 'image',
        metadata: {
          ...pathMetadata,
          // EXIF data from media_index backend (V4 pattern)
          path: item.path, // V4: Store actual file path in metadata too
          date_taken: item.date_taken,
          created_time: item.created_time,
          location_city: item.location_city,
          location_state: item.location_state,
          location_country: item.location_country,
          location_name: item.location_name,
          has_coordinates: item.has_coordinates || false,
          is_geocoded: item.is_geocoded || false,
          latitude: item.latitude,
          longitude: item.longitude,
          is_favorited: item.is_favorited || false
        }
      };
    }
    
    console.warn('[MediaIndexProvider] Queue empty, no items to return');
    return null;
  }

  // V4 CODE REUSE: Copied from ha-media-card.js lines 2121-2250
  // Modified: Removed card-specific references (this.config → config, this.hass → hass)
  // V5 ENHANCEMENT: Added forcePriorityMode parameter for smart retry logic
  async _queryMediaIndex(count = 10, forcePriorityMode = null) {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('[MediaIndexProvider] Media index not configured');
      return null;
    }

    try {
      console.log('[MediaIndexProvider] 🔍 Querying media_index for', count, 'random items...');
      
      // V4 CODE: Extract folder path from media_path config
      // Database stores full paths like: /media/Photo/PhotoLibrary/2023/06
      // Config might be: media-source://media_source/media/Photo/PhotoLibrary
      // We need to extract: /media/Photo/PhotoLibrary
      let folderFilter = null;
      if (this.config.folder?.path) {
        let path = this.config.folder.path;
        // Remove media-source://media_source prefix if present
        if (path.startsWith('media-source://media_source')) {
          path = path.replace('media-source://media_source', '');
        }
        // Now path should be like: /media/Photo/PhotoLibrary
        folderFilter = path;
        console.log('[MediaIndexProvider] 🔍 Filtering by folder:', folderFilter);
      }
      
      // V4 CODE: Call media_index.get_random_items service with return_response via WebSocket
      // CRITICAL: Use config.media_type (user's preference), NOT current item's type
      const configuredMediaType = this.config.media_type || 'all';
      
      // V5 FEATURE: Priority new files parameters (with override for smart retry)
      const priorityNewFiles = forcePriorityMode !== null ? forcePriorityMode : (this.config.folder?.priority_new_files || false);
      const thresholdSeconds = this.config.folder?.new_files_threshold_seconds || 3600;
      
      console.log('[MediaIndexProvider] 🆕 Priority new files config:', {
        enabled: priorityNewFiles,
        forced: forcePriorityMode !== null,
        threshold: thresholdSeconds,
        'config.folder': this.config.folder
      });
      
      // V4 CODE: Build WebSocket call with optional target for multi-instance support
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_random_items',
        service_data: {
          count: count,
          folder: folderFilter,
          // Use configured media type preference
          file_type: configuredMediaType === 'all' ? undefined : configuredMediaType,
          // V5 FEATURE: Priority new files - prepend recently indexed files to results
          // Note: Recently indexed = newly discovered by scanner, not necessarily new files
          priority_new_files: priorityNewFiles,
          new_files_threshold_seconds: thresholdSeconds
        },
        return_response: true
      };
      
      // V4 CODE: If user specified a media_index entity, add target to route to correct instance
      if (this.config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: this.config.media_index.entity_id
        };
        console.log('[MediaIndexProvider] 🎯 Targeting specific media_index entity:', this.config.media_index.entity_id);
      }
      
      // V4 CODE: Log the actual WebSocket call for debugging (only in debug mode)
      if (this.config?.debug_queue_mode) {
        console.warn('[MediaIndexProvider] 📤 WebSocket call:', JSON.stringify(wsCall, null, 2));
      }
      
      const wsResponse = await this.hass.callWS(wsCall);
      
      // V4 CODE: Log the raw response (only in debug mode)
      if (this.config?.debug_queue_mode) {
        console.warn('[MediaIndexProvider] 📥 WebSocket response:', JSON.stringify(wsResponse, null, 2));
      }

      // V4 CODE: WebSocket response can be wrapped in different ways
      // - { response: { items: [...] } }  (standard WebSocket format)
      // - { service_response: { items: [...] } }  (REST API format)
      // Try both formats for maximum compatibility
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;

      if (response && response.items && Array.isArray(response.items)) {
        console.log('[MediaIndexProvider] ✅ Received', response.items.length, 'items from media_index');
        
        // V4 CODE: Filter out excluded files (moved to _Junk/_Edit) AND unsupported formats BEFORE processing
        const filteredItems = response.items.filter(item => {
          const isExcluded = this.excludedFiles.has(item.path);
          if (isExcluded) {
            console.log(`[MediaIndexProvider] ⏭️ Filtering out excluded file: ${item.path}`);
            return false;
          }
          
          // V4 CODE: Filter out unsupported media formats
          const fileName = item.path.split('/').pop() || item.path;
          const extension = fileName.split('.').pop()?.toLowerCase();
          const isMedia = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
          
          if (!isMedia) {
            console.log(`[MediaIndexProvider] ⏭️ Filtering out unsupported format: ${item.path}`);
            return false;
          }
          
          return true;
        });
        
        if (filteredItems.length < response.items.length) {
          console.log(`[MediaIndexProvider] 📝 Filtered ${response.items.length - filteredItems.length} excluded files (${filteredItems.length} remaining)`);
        }
        
        // V4 CODE: Transform items to include resolved URLs
        const items = await Promise.all(filteredItems.map(async (item) => {
          // Backend returns 'path', not 'file_path'
          const filePath = item.path;
          const resolvedUrl = await this._resolveMediaPath(filePath);
          return {
            ...item,
            url: resolvedUrl,
            path: filePath,
            filename: item.filename || filePath.split('/').pop(),
            folder: item.folder || filePath.substring(0, filePath.lastIndexOf('/')),
            // EXIF metadata (already present in backend response)
            date_taken: item.date_taken,
            created_time: item.created_time, // File creation time as fallback
            location_city: item.location_city,
            location_state: item.location_state,
            location_country: item.location_country,
            location_name: item.location_name,
            // Geocoding status
            has_coordinates: item.has_coordinates || false,
            is_geocoded: item.is_geocoded || false,
            latitude: item.latitude,
            longitude: item.longitude,
            // Favorite status
            is_favorited: item.is_favorited || false
          };
        }));
        
        console.warn(`[MediaIndexProvider] 📊 QUERY RESULT: Received ${items.length} items from database`);
        items.slice(0, 3).forEach((item, idx) => {
          console.warn(`[MediaIndexProvider] 📊 Item ${idx}: path="${item.path}", is_favorited=${item.is_favorited}`, item);
        });
        
        return items;
      } else {
        console.warn('[MediaIndexProvider] ⚠️ No items in response:', response);
        return null;
      }
    } catch (error) {
      console.error('[MediaIndexProvider] ❌ Error querying media_index:', error);
      return null;
    }
  }

  // V4 CODE REUSE: Copied from ha-media-card.js _resolveMediaPath (lines ~2350)
  // Convert /media/Photo/... path to media-source://media_source/media/Photo/...
  async _resolveMediaPath(filePath) {
    // V4 pattern: If path starts with /media/, convert to media-source:// URL
    if (filePath.startsWith('/media/')) {
      return `media-source://media_source${filePath}`;
    }
    // If already media-source:// format, return as-is
    if (filePath.startsWith('media-source://')) {
      return filePath;
    }
    // Otherwise assume it's a relative path under /media/
    return `media-source://media_source/media/${filePath}`;
  }

  // Track files that have been moved to _Junk/_Edit folders
  excludeFile(path) {
    this.excludedFiles.add(path);
  }
}

// =================================================================
// SEQUENTIAL MEDIA INDEX PROVIDER - Database-backed ordered queries
// =================================================================
// NEW V5 FEATURE: Sequential mode with cursor-based pagination
// Uses media_index.get_ordered_files service for deterministic ordering

class SequentialMediaIndexProvider extends MediaProvider {
  constructor(config, hass) {
    super(config, hass);
    this.queue = []; // Internal queue of items from database
    this.queueSize = config.slideshow_window || 100;
    this.excludedFiles = new Set(); // Track excluded files
    
    // Sequential mode configuration
    this.orderBy = config.folder?.sequential?.order_by || 'date_taken';
    this.orderDirection = config.folder?.sequential?.order_direction || 'desc';
    this.recursive = config.folder?.recursive !== false; // Default true
    this.lastSeenValue = null; // Cursor for pagination
    this.hasMore = true; // Flag to track if more items available
    this.reachedEnd = false; // Flag to track if we've hit the end
  }

  async initialize() {
    console.log('[SequentialMediaIndexProvider] Initializing...');
    console.log('[SequentialMediaIndexProvider] Order by:', this.orderBy, this.orderDirection);
    console.log('[SequentialMediaIndexProvider] Recursive:', this.recursive);
    
    // Check if media_index is configured
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('[SequentialMediaIndexProvider] Media index not configured');
      return false;
    }
    
    // Initial query to fill queue
    const items = await this._queryOrderedFiles();
    
    if (!items || items.length === 0) {
      console.warn('[SequentialMediaIndexProvider] No items returned from media_index');
      return false;
    }
    
    this.queue = items;
    console.log('[SequentialMediaIndexProvider] ✅ Initialized with', this.queue.length, 'items');
    return true;
  }

  async getNext() {
    // Refill queue if running low (and more items available)
    if (this.queue.length < 10 && this.hasMore && !this.reachedEnd) {
      console.log('[SequentialMediaIndexProvider] Queue low, refilling...');
      const items = await this._queryOrderedFiles();
      if (items && items.length > 0) {
        this.queue.push(...items);
        console.log('[SequentialMediaIndexProvider] Refilled queue, now', this.queue.length, 'items');
      } else {
        console.log('[SequentialMediaIndexProvider] No more items available from database');
        this.reachedEnd = true;
      }
    }
    
    // If queue is empty and we've reached the end, loop back to start
    if (this.queue.length === 0 && this.reachedEnd) {
      console.log('[SequentialMediaIndexProvider] 🔄 Reached end of sequence, looping back to start...');
      this.lastSeenValue = null;
      this.reachedEnd = false;
      this.hasMore = true;
      
      const items = await this._queryOrderedFiles();
      if (items && items.length > 0) {
        this.queue = items;
        console.log('[SequentialMediaIndexProvider] ✅ Restarted sequence with', this.queue.length, 'items');
      } else {
        console.warn('[SequentialMediaIndexProvider] ❌ Failed to restart sequence - no items returned');
        return null;
      }
    }
    
    // Return next item from queue
    if (this.queue.length > 0) {
      const item = this.queue.shift();
      
      // Update cursor for pagination
      // Store the value of the sort field for this item
      switch(this.orderBy) {
        case 'date_taken':
          this.lastSeenValue = item.date_taken;
          break;
        case 'filename':
          this.lastSeenValue = item.filename;
          break;
        case 'path':
          this.lastSeenValue = item.path;
          break;
        case 'modified_time':
          this.lastSeenValue = item.modified_time;
          break;
        default:
          this.lastSeenValue = item.path;
      }
      
      // Extract metadata using MediaProvider helper (V5 architecture)
      const pathMetadata = MediaProvider.extractMetadataFromPath(item.path);
      
      return {
        // V4: Use database path for media_content_id (service calls need this)
        media_content_id: item.path,
        media_content_type: item.path.match(/\.(mp4|webm|ogg|mov|m4v)$/i) ? 'video' : 'image',
        metadata: {
          ...pathMetadata,
          // EXIF data from media_index backend
          path: item.path, // V4: Store actual file path in metadata
          date_taken: item.date_taken,
          created_time: item.created_time,
          location_city: item.location_city,
          location_state: item.location_state,
          location_country: item.location_country,
          location_name: item.location_name,
          has_coordinates: item.has_coordinates || false,
          is_geocoded: item.is_geocoded || false,
          latitude: item.latitude,
          longitude: item.longitude,
          is_favorited: item.is_favorited || false
        }
      };
    }
    
    console.warn('[SequentialMediaIndexProvider] Queue empty, no items to return');
    return null;
  }

  // Query ordered files from media_index (similar to _queryMediaIndex but different service)
  async _queryOrderedFiles() {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('[SequentialMediaIndexProvider] Media index not configured');
      return null;
    }

    try {
      console.log('[SequentialMediaIndexProvider] 🔍 Querying media_index for ordered files...');
      
      // Extract folder path from config
      let folderFilter = null;
      if (this.config.folder?.path) {
        let path = this.config.folder.path;
        // Remove media-source://media_source prefix if present
        if (path.startsWith('media-source://media_source')) {
          path = path.replace('media-source://media_source', '');
        }
        folderFilter = path;
        console.log('[SequentialMediaIndexProvider] 🔍 Filtering by folder:', folderFilter);
      }
      
      // Build service data
      const serviceData = {
        count: this.queueSize,
        folder: folderFilter,
        recursive: this.recursive,
        file_type: this.config.media_type === 'all' ? undefined : this.config.media_type,
        order_by: this.orderBy,
        order_direction: this.orderDirection,
        // V5 FEATURE: Priority new files - prepend recently indexed files to results
        // Note: Recently indexed = newly discovered by scanner, not necessarily new files
        priority_new_files: this.config.folder?.priority_new_files || false,
        new_files_threshold_seconds: this.config.folder?.new_files_threshold_seconds || 3600
      };
      
      // Add cursor for pagination (if we've seen items before)
      if (this.lastSeenValue !== null) {
        serviceData.after_value = this.lastSeenValue;
        console.log('[SequentialMediaIndexProvider] 🔍 Using cursor (after_value):', this.lastSeenValue);
      }
      
      // Build WebSocket call
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_ordered_files',
        service_data: serviceData,
        return_response: true
      };
      
      // Target specific media_index entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: this.config.media_index.entity_id
        };
        console.log('[SequentialMediaIndexProvider] 🎯 Targeting entity:', this.config.media_index.entity_id);
      }
      
      // Debug logging
      if (this.config?.debug_queue_mode) {
        console.warn('[SequentialMediaIndexProvider] 📤 WebSocket call:', JSON.stringify(wsCall, null, 2));
      }
      
      const wsResponse = await this.hass.callWS(wsCall);
      
      if (this.config?.debug_queue_mode) {
        console.warn('[SequentialMediaIndexProvider] 📥 WebSocket response:', JSON.stringify(wsResponse, null, 2));
      }

      // Handle response formats
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;

      if (response && response.items && Array.isArray(response.items)) {
        console.log('[SequentialMediaIndexProvider] ✅ Received', response.items.length, 'items from media_index');
        
        // Check if we got fewer items than requested (indicates end of sequence)
        if (response.items.length < this.queueSize) {
          console.log('[SequentialMediaIndexProvider] 📝 Received fewer items than requested - may be at end of sequence');
          this.hasMore = false;
        }
        
        // Filter excluded files and unsupported formats
        const filteredItems = response.items.filter(item => {
          const isExcluded = this.excludedFiles.has(item.path);
          if (isExcluded) {
            console.log(`[SequentialMediaIndexProvider] ⏭️ Filtering out excluded file: ${item.path}`);
            return false;
          }
          
          // Filter unsupported formats
          const fileName = item.path.split('/').pop() || item.path;
          const extension = fileName.split('.').pop()?.toLowerCase();
          const isMedia = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
          
          if (!isMedia) {
            console.log(`[SequentialMediaIndexProvider] ⏭️ Filtering out unsupported format: ${item.path}`);
            return false;
          }
          
          return true;
        });
        
        if (filteredItems.length < response.items.length) {
          console.log(`[SequentialMediaIndexProvider] 📝 Filtered ${response.items.length - filteredItems.length} files (${filteredItems.length} remaining)`);
        }
        
        // Transform items to include resolved URLs
        const items = await Promise.all(filteredItems.map(async (item) => {
          const filePath = item.path;
          const resolvedUrl = await this._resolveMediaPath(filePath);
          return {
            ...item,
            url: resolvedUrl,
            path: filePath,
            filename: item.filename || filePath.split('/').pop(),
            folder: item.folder || filePath.substring(0, filePath.lastIndexOf('/')),
            // EXIF metadata from backend
            date_taken: item.date_taken,
            created_time: item.created_time,
            modified_time: item.modified_time,
            location_city: item.location_city,
            location_state: item.location_state,
            location_country: item.location_country,
            location_name: item.location_name,
            has_coordinates: item.has_coordinates || false,
            is_geocoded: item.is_geocoded || false,
            latitude: item.latitude,
            longitude: item.longitude,
            is_favorited: item.is_favorited || false
          };
        }));
        
        console.warn(`[SequentialMediaIndexProvider] 📊 QUERY RESULT: Received ${items.length} ordered items`);
        items.slice(0, 3).forEach((item, idx) => {
          console.warn(`[SequentialMediaIndexProvider] 📊 Item ${idx}: path="${item.path}", ${this.orderBy}=${item[this.orderBy]}`);
        });
        
        return items;
      } else {
        console.warn('[SequentialMediaIndexProvider] ⚠️ No items in response:', response);
        this.hasMore = false;
        return null;
      }
    } catch (error) {
      console.error('[SequentialMediaIndexProvider] ❌ Error querying media_index:', error);
      return null;
    }
  }

  // Reuse from MediaIndexProvider
  async _resolveMediaPath(filePath) {
    if (filePath.startsWith('/media/')) {
      return `media-source://media_source${filePath}`;
    }
    if (filePath.startsWith('media-source://')) {
      return filePath;
    }
    return `media-source://media_source/media/${filePath}`;
  }

  // Track excluded files
  excludeFile(path) {
    this.excludedFiles.add(path);
  }

  // Reset to beginning of sequence (for loop functionality)
  reset() {
    console.log('[SequentialMediaIndexProvider] Resetting to beginning of sequence');
    this.queue = [];
    this.lastSeenValue = null;
    this.hasMore = true;
    this.reachedEnd = false;
    return this.initialize();
  }
}

// =================================================================
// SUBFOLDER QUEUE - Essential V4 code copied for v5
// Handles random folder scanning with hierarchical scan
// =================================================================

class SubfolderQueue {
  constructor(card) {
    this.card = card;
    this.config = card.config.subfolder_queue;
    this.queue = [];
    this.shownItems = new Set();  // V5: Will move to card level eventually
    this.discoveredFolders = [];
    this.folderWeights = new Map();
    this.isScanning = false;
    this.scanProgress = { current: 0, total: 0 };
    this.discoveryStartTime = null;
    this.discoveryInProgress = false;
    this._scanCancelled = false;
    this._queueCreatedTime = Date.now();
    
    this.queueHistory = [];
    
    // Hierarchical scan queue management
    this.queueShuffleCounter = 0;
    this.SHUFFLE_MIN_BATCH = 10;
    this.SHUFFLE_MAX_BATCH = 1000;
    this.SHUFFLE_PERCENTAGE = 0.10;
    
    // V5: Navigation history REMOVED - card owns this now
    // (Was: this.history = [], this.historyIndex = -1)
    
    // Probability calculation cache
    this.cachedTotalCount = null;
    this.cachedCountSource = null;
    this.lastDiscoveredCount = 0;
    this.totalCountLocked = false;
    
    this._log('🚀 SubfolderQueue initialized with config:', this.config);
    this._log('📋 Priority patterns configured:', this.config.priority_folder_patterns);
  }

  async _waitIfBackgroundPaused(timeoutMs = 60000) {
    if (!this.card) {
      this._log('❌ Queue has no card reference - stopping');
      return;
    }
    
    // V5: cardAdapter is not a DOM element, skip DOM check
    const cardBackgroundPaused = this.card._backgroundPaused;
    
    if (!this._lastStatusLog || (Date.now() - this._lastStatusLog) > 5000) {
      this._log('🔍 Status: Background paused =', !!this.card._backgroundPaused);
      this._lastStatusLog = Date.now();
    }
    
    const shouldPause = this.card._backgroundPaused;
    
    if (shouldPause) {
      if (!this._autoPaused) {
        this._log('⏸️ Pausing scanning - Background paused:', !!this.card._backgroundPaused);
        this._autoPaused = true;
        this.isScanning = false;
        
        if (this._scanTimeout) {
          clearTimeout(this._scanTimeout);
          this._scanTimeout = null;
          this._log('🛑 Cleared scan timeout');
        }
        
        const mediaPath = this.card.config.media_path;
        if (!window.mediaCardSubfolderQueues.has(mediaPath)) {
          window.mediaCardSubfolderQueues.set(mediaPath, this);
          this._log('💾 Stored queue in map for path:', mediaPath);
        }
      }
      
      throw new Error('SCAN_PAUSED_NOT_VISIBLE');
    }
    
    if (this._autoPaused) {
      this._log('▶️ Resuming scanning - conditions are good');  
      this._autoPaused = false;
    }
    
    return;
  }

  _log(...args) {
    if (!this.card || !this.card._debugMode) {
      return;
    }
    
    if (this.card.config?.suppress_subfolder_logging) {
      return;
    }
    
    console.log('📂 SubfolderQueue:', ...args);
  }

  _checkPathChange() {
    if (!this.card || !this.card.config) {
      this._log('❌ _checkPathChange: No card or config');
      return;
    }
    
    const currentPath = this.card.config.media_path;
    this._log('🔍 _checkPathChange called - currentPath:', currentPath, '_initializedPath:', this._initializedPath);
    
    if (!this._initializedPath) {
      this._initializedPath = currentPath;
      this._log('📍 Initialized path tracking:', currentPath);
      return;
    }
    
    if (this._initializedPath !== currentPath) {
      this._log('🔄 PATH CHANGE DETECTED in queue! From', this._initializedPath, 'to', currentPath, '- clearing queue');
      
      this.isScanning = false;
      this.discoveryInProgress = false;
      
      if (this._scanTimeout) {
        clearTimeout(this._scanTimeout);
        this._scanTimeout = null;
      }
      
      this.shownItems.clear();
      // V5: history removed - card owns navigation history
      this.queue = [];
      this.discoveredFolders = [];
      this.folderWeights.clear();
      this.scanProgress = { current: 0, total: 0 };
      this.discoveryStartTime = null;
      this.queueHistory = [];
      this.queueShuffleCounter = 0;
      this.cachedTotalCount = null;
      this.cachedCountSource = null;
      this.lastDiscoveredCount = 0;
      this.totalCountLocked = false;
      
      this._initializedPath = currentPath;
      this._log('✅ Queue cleared and scanning stopped due to path change - new path:', currentPath);
      
      this.pauseScanning();
      
      this._log('🔄 Restarting queue scanning with new path');
      this.initialize().catch(error => {
        this._log('❌ Failed to restart queue after path change:', error);
      });
    } else {
      this._log('ℹ️ Path unchanged:', currentPath);
    }
  }

  pauseScanning() {
    this._log('⏸️ SubfolderQueue: Pausing scanning activity (preserving queue data)');
    
    this.isScanning = false;
    this.discoveryInProgress = false;
    this._scanCancelled = true;
    
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }
    
    this._log('⏸️ SubfolderQueue: Scanning paused - queue preserved with', this.queue.length, 'items');
  }

  resumeWithNewCard(newCard) {
    this._log('▶️ SubfolderQueue: Resuming with new card instance');
    this._log('▶️ SubfolderQueue: Previous card:', !!this.card, 'New card:', !!newCard);
    
    this.card = newCard;
    
    if (!this.card._backgroundPaused) {
      this._scanCancelled = false;
      this._log('✅ Cleared cancellation flag - queue can resume scanning');
    } else {
      this._log('⏸️ Card is not visible - keeping queue paused (_scanCancelled stays true)');
    }
    
    this._log('▶️ SubfolderQueue: Reconnected - queue has', this.queue.length, 'items,', this.discoveredFolders.length, 'folders');
    this._log('▶️ SubfolderQueue: isScanning:', this.isScanning, 'discoveryInProgress:', this.discoveryInProgress);
    return true;
  }

  stopScanning() {
    this._log('🛑 SubfolderQueue: Stopping all scanning activity');
    this._log('🛑 SubfolderQueue: Scanning stopped and card reference will be cleared');
    
    this.isScanning = false;
    this.discoveryInProgress = false;
    
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }
    
    this.card = null;
  }

  isDiscoveryInProgress() {
    if (!this.discoveryInProgress) return false;
    
    const discoveryDuration = Date.now() - (this.discoveryStartTime || 0);
    if (discoveryDuration > 30000) {
      this._log('⏰ Discovery timeout reached - allowing auto-refresh');
      this.discoveryInProgress = false;
      return false;
    }
    
    return true;
  }

  getPathWeightMultiplier(folderPath) {
    let multiplier = 1.0;
    
    if (this.config.priority_folder_patterns.length === 0) {
      return multiplier;
    }
    
    for (const pattern of this.config.priority_folder_patterns) {
      const patternPath = pattern.path || pattern;
      
      if (folderPath.includes(patternPath)) {
        multiplier = Math.max(multiplier, pattern.weight_multiplier || 3.0);
      }
    }
    
    return multiplier;
  }

  calculateFolderWeight(folder) {
    let baseWeight;
    if (folder.fileCount === 0) {
      return 0;
    } else if (folder.fileCount < 5) {
      baseWeight = folder.fileCount * 0.5;
    } else {
      baseWeight = Math.log10(folder.fileCount) * 10;
    }
    
    const pathMultiplier = this.getPathWeightMultiplier(folder.path);
    
    let sizeMultiplier = 1.0;
    if (folder.fileCount > 10000) {
      sizeMultiplier = 1.8;
    } else if (folder.fileCount > 1000) {
      sizeMultiplier = 1.5;
    } else if (folder.fileCount > 100) {
      sizeMultiplier = 1.2;
    }
    
    const finalWeight = baseWeight * pathMultiplier * sizeMultiplier;
    
    return finalWeight;
  }

  getTotalMediaCount(currentDiscoveredCount) {
    if (this.config.estimated_total_photos) {
      if (this.discoveryInProgress && this.config.estimated_total_photos > currentDiscoveredCount * 20) {
        const tempCount = Math.max(currentDiscoveredCount * 3, 100);
        return tempCount;
      }
      
      if (this.cachedTotalCount !== this.config.estimated_total_photos) {
        this.cachedTotalCount = this.config.estimated_total_photos;
        this.cachedCountSource = 'user_estimate';
      }
      return this.cachedTotalCount;
    }
    
    if (this.totalCountLocked && this.cachedTotalCount) {
      return this.cachedTotalCount;
    }
    
    const changeThreshold = 0.2;
    const countGrowth = this.lastDiscoveredCount > 0 
      ? (currentDiscoveredCount - this.lastDiscoveredCount) / this.lastDiscoveredCount 
      : 1.0;
    
    if (!this.cachedTotalCount || countGrowth > changeThreshold) {
      const conservativeMultiplier = this.discoveryInProgress ? 3.0 : 1.2;
      this.cachedTotalCount = Math.max(currentDiscoveredCount, Math.round(currentDiscoveredCount * conservativeMultiplier));
      this.lastDiscoveredCount = currentDiscoveredCount;
      this.cachedCountSource = 'adaptive';
    }
    
    return this.cachedTotalCount;
  }

  lockTotalCount() {
    if (!this.config.estimated_total_photos && this.cachedTotalCount) {
      this.totalCountLocked = true;
      this.cachedCountSource = 'discovery_complete';
    }
  }

  async initialize() {
    this._checkPathChange();
    
    // V5: Allow both random and sequential modes
    const folderMode = this.card.config.folder_mode || 'random';
    if (!this.config.enabled && folderMode === 'random') {
      this._log('❌ Queue disabled');
      return false;
    }

    if (this.card._backgroundPaused) {
      this._log('❌ Skipping initialization - explicitly paused:', !!this.card._backgroundPaused);
      return false;
    }

    if (this.queue.length > 0) {
      this._log('✅ Queue already populated with', this.queue.length, 'items - skipping scan');
      return true;
    }

    this._log('🚀 Starting subfolder queue initialization');
    this.isScanning = true;
    this.discoveryInProgress = true;
    this._scanCancelled = false;
    this.discoveryStartTime = Date.now();
    
    try {
      await this.quickScan();
      this._log('✅ Initialize completed via full scan');
      
      return true;
    } catch (error) {
      this._log('❌ Queue initialization failed:', error);
      return false;
    } finally {
      this.isScanning = false;
      this.discoveryInProgress = false;
      this.lockTotalCount();
    }
  }

  async quickScan() {
    if (this._scanCancelled) {
      this._log('🚫 Quick scan cancelled');
      this.isScanning = false;
      return false;
    }
    
    this._log('⚡ Starting quick scan for all folders');
    
    try {
      const basePath = this.card.config.media_path;
      if (!basePath) {
        this._log('❌ No base media path configured');
        this.isScanning = false;
        return false;
      }

      this._log('🔍 Discovering subfolders from base path:', basePath, 'max depth:', this.config.scan_depth);
      
      // V5: Always use hierarchical scan (config flag removed for simplicity)
      this._log('🏗️ Using hierarchical scan architecture');
      
      try {
        const scanResult = await this.hierarchicalScanAndPopulate(basePath, 0);
        
        if (!scanResult || scanResult.error) {
          this._log('⚠️ Hierarchical scan failed:', scanResult?.error || 'unknown error');
          return false;
        }
        
        this._log('✅ Hierarchical scan completed:', 
                 'files processed:', scanResult.filesProcessed,
                 'files added:', scanResult.filesAdded, 
                 'folders processed:', scanResult.foldersProcessed,
                 'queue size:', this.queue.length);
        
        if (this.queue.length > 0) {
          this.shuffleQueue();
          this.queueShuffleCounter = 0;
          this._log('🔀 Final shuffle completed after hierarchical scan - queue size:', this.queue.length);
        }
        
        return true;
        
      } catch (error) {
        this._log('❌ Hierarchical scan error:', error.message);
        return false;
      }
      
    } catch (error) {
      this._log('❌ Quick scan failed:', error);
      this.isScanning = false;
      return false;
    }
  }

  async hierarchicalScanAndPopulate(basePath, currentDepth = 0, maxDepth = null) {
    await this._waitIfBackgroundPaused();
    
    if (!this.isScanning || this._scanCancelled) {
      this._log('🛑 Scanning stopped/paused/cancelled - exiting hierarchical scan');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    const effectiveMaxDepth = maxDepth !== null ? maxDepth : this.config.scan_depth;
    
    // For scan_depth=0: scan base folder (depth 0) only, not subfolders (depth 1+)
    // For scan_depth=1: scan base folder + 1 level of subfolders (depth 0-1)
    if (effectiveMaxDepth !== null && effectiveMaxDepth >= 0 && currentDepth > effectiveMaxDepth) {
      this._log('📁 Max depth reached:', currentDepth, '(configured limit:', effectiveMaxDepth, ')');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    try {
      const timeoutDuration = 180000;
      
      const apiTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`API timeout at depth ${currentDepth} after ${timeoutDuration/1000}s`)), timeoutDuration)
      );
      
      await this._waitIfBackgroundPaused();
      
      if (!this.isScanning || this._scanCancelled) {
        this._log('🛑 Scanning stopped/paused/cancelled - exiting before API call');
        return { filesProcessed: 0, foldersProcessed: 0 };
      }
      
      const folderContents = await Promise.race([
        this.card.hass.callWS({
          type: "media_source/browse_media",
          media_content_id: basePath
        }),
        apiTimeout
      ]);

      if (!folderContents?.children) {
        this._log('📁 No children found at depth:', currentDepth);
        return { filesProcessed: 0, foldersProcessed: 0 };
      }

      const folderName = basePath.split('/').pop() || 'root';
      
      const allFiles = folderContents.children.filter(child => child.media_class === 'image' || child.media_class === 'video');
      let files = allFiles.filter(file => this.card._isMediaFile(file.media_content_id || file.title || ''));
      
      // Filter by configured media_type (image/video/all)
      const configuredMediaType = this.card.config.media_type || 'all';
      if (configuredMediaType !== 'all') {
        files = files.filter(file => {
          const filePath = file.media_content_id || file.title || '';
          const isVideo = filePath.match(/\.(mp4|webm|ogg|mov|m4v)$/i);
          const isImage = filePath.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i);
          
          if (configuredMediaType === 'video') return isVideo;
          if (configuredMediaType === 'image') return isImage;
          return true;
        });
      }
      
      // V5 FIX: Exclude _Junk and _Edit folders from root of media path
      const rootMediaPath = this.card.config.media_path;
      const subfolders = folderContents.children.filter(child => {
        if (!child.can_expand) return false;
        
        // Only exclude _Junk and _Edit if they're direct children of root
        if (basePath === rootMediaPath) {
          const folderName = (child.media_content_id || child.title || '').split('/').pop() || '';
          
          if (folderName === '_Junk' || folderName === '_Edit') {
            this._log('🚫 Excluding root folder:', folderName);
            return false;
          }
        }
        
        return true;
      });

      if (files.length > 0 || subfolders.length > 0) {
        const folderInfo = {
          path: basePath,
          title: folderName,
          fileCount: files.length,
          files: files,
          depth: currentDepth,
          isSampled: false
        };
        
        const existingIndex = this.discoveredFolders.findIndex(f => f.path === basePath);
        if (existingIndex === -1) {
          this.discoveredFolders.push(folderInfo);
        } else {
          this.discoveredFolders[existingIndex] = folderInfo;
        }
      }

      let filesAdded = 0;
      
      // Sequential mode: add ALL files (no probability sampling)
      // Random mode: use probability sampling for large folders
      const isSequentialMode = this.card.config.folder_mode === 'sequential';
      const basePerFileProbability = isSequentialMode ? 1.0 : this.calculatePerFileProbability();
      const weightMultiplier = this.getPathWeightMultiplier(basePath);
      const perFileProbability = Math.min(basePerFileProbability * weightMultiplier, 1.0);
      
      const existingQueueIds = new Set(this.queue.map(item => item.media_content_id));
      const availableFiles = files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !existingQueueIds.has(file.media_content_id)
      );
      
      for (const file of availableFiles) {
        await this._waitIfBackgroundPaused();
        
        if (Math.random() < perFileProbability) {
          await this.addFileToQueueWithBatching(file, folderName);
          filesAdded++;
        }
      }

      let subfoldersProcessed = 0;
      // Recursion logic:
      // - scan_depth=null: Recurse infinitely
      // - scan_depth=0: Don't recurse (single folder only)
      // - scan_depth=N: Recurse up to depth N (e.g., scan_depth=1 means base + 1 level)
      const shouldRecurse = subfolders.length > 0 && 
        (effectiveMaxDepth === null || currentDepth < effectiveMaxDepth);
      
      if (shouldRecurse) {
        await this._waitIfBackgroundPaused();

        const shuffledSubfolders = [...subfolders].sort(() => Math.random() - 0.5);

        const subfolderResults = await this.processLevelConcurrently(
          shuffledSubfolders, 
          2,
          currentDepth + 1, 
          effectiveMaxDepth
        );
        
        subfoldersProcessed = subfolderResults?.foldersProcessed || subfolders.length;
      }

      return {
        filesProcessed: files.length,
        filesAdded: filesAdded,
        foldersProcessed: subfoldersProcessed,
        depth: currentDepth
      };

    } catch (error) {
      this._log('⚠️ Hierarchical scan error at depth', currentDepth, ':', error.message);
      return {
        filesProcessed: 0,
        filesAdded: 0, 
        foldersProcessed: 0,
        depth: currentDepth,
        error: error.message
      };
    }
  }

  async processLevelConcurrently(folders, maxConcurrent = 2, nextDepth, maxDepth) {
    if (!folders || folders.length === 0) return;
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < folders.length; i += maxConcurrent) {
      const batch = folders.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map((folder, index) => (async () => {
        await this._waitIfBackgroundPaused();
        try {
          await this.hierarchicalScanAndPopulate(folder.media_content_id, nextDepth, maxDepth);
          processedCount++;
        } catch (error) {
          errorCount++;
        }
      })());
      
      try {
        await Promise.allSettled(batchPromises);
      } catch (error) {
        this._log('⚠️ Unexpected batch processing error:', error.message);
      }
    }
    
    return {
      foldersProcessed: processedCount,
      folderErrors: errorCount,
      totalFolders: folders.length,
      depth: nextDepth
    };
  }

  async addFileToQueueWithBatching(file, folderName = null) {
    if (!file) return;

    // Ensure media_content_type is set for video detection
    if (!file.media_content_type && file.media_class) {
      // Set based on media_class (image/video)
      if (file.media_class === 'video') {
        file.media_content_type = 'video';
      } else if (file.media_class === 'image') {
        file.media_content_type = 'image';
      }
    }
    
    // Fallback: detect from file extension if still not set
    if (!file.media_content_type) {
      const filePath = file.media_content_id || file.title || '';
      const isVideo = filePath.match(/\.(mp4|webm|ogg|mov|m4v)$/i);
      file.media_content_type = isVideo ? 'video' : 'image';
    }

    this.queue.push(file);

    const historyEntry = {
      file: file,
      timestamp: new Date().toISOString(),
      folderName: folderName || MediaProvider.extractFolderName(file),
      source: 'hierarchical_scan'
    };
    this.queueHistory.push(historyEntry);

    this.queueShuffleCounter = (this.queueShuffleCounter || 0) + 1;

    const shuffleThreshold = Math.min(
      this.SHUFFLE_MAX_BATCH, 
      Math.max(this.SHUFFLE_MIN_BATCH, Math.floor(this.queue.length * this.SHUFFLE_PERCENTAGE))
    );

    if (this.queueShuffleCounter >= shuffleThreshold) {
      this.shuffleQueue();
      this.queueShuffleCounter = 0;
    }
  }

  calculatePerFileProbability() {
    const totalPhotos = this.config.estimated_total_photos;
    const targetQueueSize = this.card.config.slideshow_window || 1000;
    const currentQueueSize = this.queue.length;
    
    if (!totalPhotos || totalPhotos <= 0) {
      return 0.01;
    }
    
    const baseProbability = targetQueueSize / totalPhotos;
    
    let adjustmentMultiplier = 1.0;
    
    if (currentQueueSize < 10) {
      adjustmentMultiplier = 10.0;
    } else if (currentQueueSize < 30) {
      adjustmentMultiplier = 3.0;
    } else if (currentQueueSize < 50) {
      adjustmentMultiplier = 1.5;
    }
    
    const adjustedProbability = Math.min(baseProbability * adjustmentMultiplier, 1.0);
    
    return adjustedProbability;
  }

  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  // V5: Simplified - just return next item from queue
  // Card manages history/navigation, provider just supplies items
  getNextItem() {
    // Refill if empty
    if (this.queue.length === 0) {
      this.refillQueue();
      if (this.queue.length === 0) {
        return null;
      }
    }

    // Find first unshown item
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      if (!this.shownItems.has(item.media_content_id)) {
        this.shownItems.add(item.media_content_id);
        this.queue.splice(i, 1);
        
        // Trigger refill if running low
        if (this.needsRefill()) {
          setTimeout(() => this.refillQueue(), 100);
        }
        
        return item;
      }
    }

    // All items in queue have been shown - age out and try again
    this.ageOutShownItems();
    this.refillQueue();
    
    if (this.queue.length > 0) {
      const item = this.queue[0];
      this.shownItems.add(item.media_content_id);
      this.queue.shift();
      return item;
    }
    
    return null;
  }

  // V5: REMOVED - Card handles previous navigation via history
  // getPreviousItem() deleted - card.history manages this

  needsRefill() {
    const unshownCount = this.queue.filter(item => !this.shownItems.has(item.media_content_id)).length;
    const historyItems = this.card?.history?.length || 0;
    const minBuffer = Math.max(historyItems + 5, 15);
    return unshownCount < minBuffer;
  }

  clearShownItems() {
    this.shownItems.clear();
  }

  ageOutShownItems() {
    const totalShown = this.shownItems.size;
    if (totalShown === 0) return;
    
    const keepPercentage = 0.3;
    const itemsToKeep = Math.ceil(totalShown * keepPercentage);
    const itemsToAge = totalShown - itemsToKeep;
    
    if (itemsToAge <= 0) {
      this.clearShownItems();
      return;
    }
    
    const shownArray = Array.from(this.shownItems);
    const itemsToKeep_array = shownArray.slice(-itemsToKeep);
    
    this.shownItems.clear();
    itemsToKeep_array.forEach(item => this.shownItems.add(item));
  }

  refillQueue() {
    this._checkPathChange();
    
    if (this.isScanning) {
      if (this.discoveryStartTime && (Date.now() - this.discoveryStartTime) > 180000) {
        this.isScanning = false;
      } else {
        return;
      }
    }

    if (this.discoveredFolders.length === 0) {
      this._log('❌ No folders available for refill');
      return;
    }

    const totalFiles = this.discoveredFolders.reduce((sum, folder) => sum + (folder.files ? folder.files.length : 0), 0);
    
    if (totalFiles === 0) {
      this._log('❌ No files found in any folder');
      return;
    }

    const totalAvailableFiles = this.discoveredFolders.reduce((count, folder) => {
      if (!folder.files) return count;
      const availableInFolder = folder.files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !this.queue.some(qItem => qItem.media_content_id === file.media_content_id)
      ).length;
      return count + availableInFolder;
    }, 0);

    if (totalAvailableFiles === 0 && this.shownItems.size > 0) {
      this.shownItems.clear();
    }

    const historyItems = this.card?.history?.length || 0;
    const minQueueSize = Math.max(historyItems + 15, 25);
    const currentQueueSize = this.queue.length;
    
    if (currentQueueSize < minQueueSize) {
      this._log('🔄 Queue needs refill:', currentQueueSize, 'items, target minimum:', minQueueSize);
      
      // Calculate how many items to add
      const targetSize = Math.min(minQueueSize * 2, this.config.slideshow_window || 1000);
      const itemsToAdd = Math.max(targetSize - currentQueueSize, 10);
      
      // V4: Copy populateQueueFromFolders logic for refilling queue
      this._populateQueueFromDiscoveredFolders(itemsToAdd);
      this._log('✅ Refill complete - queue now has', this.queue.length, 'items');
    } else {
      this._log('✅ Queue sufficient:', currentQueueSize, '(min needed:', minQueueSize, ')');
    }
  }

  // V4 CODE REUSE: Adapted from populateQueueFromFolders (ha-media-card.js lines 9312+)
  async _populateQueueFromDiscoveredFolders(itemsToAdd) {
    const folderMode = this.card.config.folder_mode || 'random';
    
    if (folderMode === 'sequential') {
      // Sequential mode: collect available items, add to queue, then sort entire queue
      const availableFiles = [];
      
      for (const folder of this.discoveredFolders) {
        if (!folder.files) continue;
        
        for (const file of folder.files) {
          // Skip if already in queue or already shown
          if (this.queue.some(q => q.media_content_id === file.media_content_id)) continue;
          if (this.shownItems.has(file.media_content_id)) continue;
          
          availableFiles.push(file);
        }
      }
      
      // Add items to queue (up to itemsToAdd)
      const toAdd = availableFiles.slice(0, itemsToAdd);
      this.queue.push(...toAdd);
      
      // Sort entire queue using shared sorting logic
      this._sortQueue();
      
      this._log('🔄 Added', toAdd.length, 'sequential items to queue and re-sorted');
    } else {
      // Random mode: randomly select from discoveredFolders
      const availableFiles = [];
      
      for (const folder of this.discoveredFolders) {
        if (!folder.files) continue;
        
        for (const file of folder.files) {
          // Skip if already in queue or already shown
          if (this.queue.some(q => q.media_content_id === file.media_content_id)) continue;
          if (this.shownItems.has(file.media_content_id)) continue;
          
          availableFiles.push(file);
        }
      }
      
      // Randomly shuffle and add
      const shuffled = availableFiles.sort(() => Math.random() - 0.5);
      const toAdd = shuffled.slice(0, itemsToAdd);
      this.queue.push(...toAdd);
      
      this._log('🔄 Added', toAdd.length, 'random items to queue from', availableFiles.length, 'available');
    }
  }

  // Shared sorting logic for queue (used by initial fill and refill)
  _sortQueue() {
    const orderBy = this.card.config.folder?.order_by || 'date_taken';
    const direction = this.card.config.folder?.sequential?.order_direction || 'desc';
    const priorityNewFiles = this.card.config.folder?.priority_new_files || false;
    const thresholdSeconds = this.card.config.folder?.new_files_threshold_seconds || 3600;
    
    console.log('[SubfolderQueue] _sortQueue - orderBy:', orderBy, 'direction:', direction, 'priorityNewFiles:', priorityNewFiles);
    console.log('[SubfolderQueue] Full sequential config:', this.card.config.folder?.sequential);
    
    // Standard sort comparator function
    const compareItems = (a, b) => {
      let aVal, bVal;
      
      switch(orderBy) {
        case 'filename':
          aVal = MediaProvider.extractFilename(a.media_content_id);
          bVal = MediaProvider.extractFilename(b.media_content_id);
          break;
        case 'path':
          aVal = a.media_content_id;
          bVal = b.media_content_id;
          break;
        case 'date_taken':
        case 'modified_time':
          // Use EXIF data if available from enrichment
          if (a.metadata?.date_taken && b.metadata?.date_taken) {
            aVal = new Date(a.metadata.date_taken).getTime();
            bVal = new Date(b.metadata.date_taken).getTime();
          } else {
            // Fallback: filename-based date extraction
            const aFilename = MediaProvider.extractFilename(a.media_content_id);
            const bFilename = MediaProvider.extractFilename(b.media_content_id);
            const aDate = MediaProvider.extractDateFromFilename(aFilename);
            const bDate = MediaProvider.extractDateFromFilename(bFilename);
            aVal = aDate ? aDate.getTime() : aFilename;
            bVal = bDate ? bDate.getTime() : bFilename;
          }
          break;
        default:
          aVal = a.media_content_id;
          bVal = b.media_content_id;
      }
      
      let comparison;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return direction === 'asc' ? comparison : -comparison;
    };
    
    // V5 FEATURE: Priority new files - filesystem scanning mode
    // Prepend recently discovered files to front of queue (V4 feature restoration)
    // Note: "New" means recently discovered by file scanner, not necessarily recent file dates
    if (priorityNewFiles) {
      const now = Date.now();
      const thresholdMs = thresholdSeconds * 1000;
      const newFiles = [];
      const oldFiles = [];
      
      for (const item of this.queue) {
        // Extract modification time from item (when file was last changed/added)
        // Browse_media returns items with extra.last_modified or check file creation time from metadata
        const lastModified = item.extra?.last_modified || item.created_time || 0;
        const modifiedMs = typeof lastModified === 'number' ? lastModified * 1000 : new Date(lastModified).getTime();
        
        if (modifiedMs && (now - modifiedMs) < thresholdMs) {
          newFiles.push(item);
          console.log('[SubfolderQueue] 🆕 Priority file (discovered recently):', MediaProvider.extractFilename(item.media_content_id));
        } else {
          oldFiles.push(item);
        }
      }
      
      // Sort each group independently
      newFiles.sort(compareItems);
      oldFiles.sort(compareItems);
      
      // Reconstruct queue: newly discovered files first, then rest
      this.queue = [...newFiles, ...oldFiles];
      
      console.log('[SubfolderQueue] ✅ Priority sorting complete:', newFiles.length, 'recently discovered,', oldFiles.length, 'older');
    } else {
      // Standard sorting without priority
      this.queue.sort(compareItems);
    }
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
    
    // V5 Unified Architecture: Card owns queue/history, providers just populate
    this.queue = [];              // Upcoming items from provider
    this.history = [];            // Navigation trail (what user has seen)
    this.historyIndex = -1;       // Current position in history (-1 = at end)
    this.shownItems = new Set();  // Prevent duplicate display until aged out
    
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
    this._isPaused = false; // V4 pause state for slideshow
    this._showInfoOverlay = false; // Info overlay toggle
    
    // V4: Circuit breaker for 404 errors
    this._consecutive404Count = 0;
    this._last404Time = 0;
    this._errorAutoAdvanceTimeout = null;
    
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
    
    // V4 CODE REUSE: Store navigation history and queue for reconnection (ha-media-card.js lines 4945-4975)
    const mediaPath = this.config?.folder?.path || this.config?.media_path;
    if (mediaPath && (this.provider || this.history.length > 0)) {
      this._log('💾 Storing state for reconnection - path:', mediaPath);
      
      const stateToStore = {
        navigationHistory: [...this.history],  // Clone array
        historyIndex: this.historyPosition
      };
      
      // If using SubfolderQueue, pause scanning and store the queue instance
      if (this.provider && this.provider.subfolderQueue) {
        this._log('⏸️ Pausing SubfolderQueue scanning for reconnection');
        const queue = this.provider.subfolderQueue;
        
        if (queue.pauseScanning) {
          queue.pauseScanning();
        }
        
        // Set cancellation flag to stop ongoing scans
        queue._scanCancelled = true;
        
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

  // V4: Force video reload when URL changes
  updated(changedProperties) {
    super.updated(changedProperties);
    
    if (changedProperties.has('mediaUrl')) {
      // Wait for next frame to ensure video element is rendered
      requestAnimationFrame(() => {
        const videoElement = this.shadowRoot?.querySelector('video');
        
        if (videoElement && this.mediaUrl) {
          videoElement.load(); // Force browser to reload the video with new source
          
          // Auto-play if configured
          if (this.config.video_autoplay) {
            videoElement.play().catch(err => {
              console.warn('Video autoplay failed (user interaction may be required):', err);
            });
          }
        }
      });
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
    
    // V5: Clear auto-advance timer when reconfiguring (prevents duplicate timers)
    if (this._refreshInterval) {
      this._log('🧹 Clearing existing auto-advance timer before reconfiguration');
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
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
      ...config,
      metadata: {
        show_filename: false,
        show_folder: true,
        show_date: true,
        show_location: true,
        show_root_folder: true,
        position: 'bottom-left',
        ...config.metadata
      }
    };
    
    // V4: Set debug mode from config
    this._debugMode = this.config.debug_mode === true;
    
    // Set aspect ratio mode data attribute for CSS styling (from V4)
    const aspectMode = config.aspect_mode || 'default';
    if (aspectMode !== 'default') {
      this.setAttribute('data-aspect-mode', aspectMode);
    } else {
      this.removeAttribute('data-aspect-mode');
    }
    
    // V5: Set media source type attribute for CSS targeting
    const mediaSourceType = this.config.media_source_type || 'single_media';
    this.setAttribute('data-media-source-type', mediaSourceType);
    
    // V5: Trigger reinitialization if we already have hass
    if (this._hass) {
      this._log('📝 setConfig: Triggering provider reinitialization with existing hass');
      this._initializeProvider();
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
          console.warn('[MediaCardV5a] Unknown media source type:', type, '- defaulting to single_media');
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
          await this._loadNext();
        }
      } else {
        console.error('[MediaCardV5a] Provider initialization failed');
      }
    } catch (error) {
      console.error('[MediaCardV5a] Error initializing provider:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // V5: Unified navigation - card owns queue/history, provider just supplies items
  async _loadNext() {
    if (!this.provider) {
      this._log('_loadNext called but no provider');
      return;
    }

    // V4: Handle auto_advance_mode when manually navigating
    this._handleAutoAdvanceModeOnNavigate();

    try {
      // Check if we're replaying history (went back, now going forward)
      if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        const item = this.history[this.historyIndex];
        this._log('📖 Replaying from history:', item.title);
        this.currentMedia = item;
        // V4: media_content_id should be the path for service calls
        this._currentMediaPath = item.media_content_id;
        this._currentMetadata = item.metadata || null;
        
        // V5: Clear cached full metadata when media changes
        this._fullMetadata = null;
        
        await this._resolveMediaUrl();
        this.requestUpdate();
        return;
      }

      // Get fresh item from provider
      this._log('Getting next item from provider');
      const item = await this.provider.getNext();
      this._log('Got item:', item);
      
      if (item) {
        // V5: Extract metadata from path if not provided by backend (now async with media_index support)
        console.log('🔍 Item metadata check - has metadata:', !!item.metadata, 'item:', item);
        if (!item.metadata) {
          console.log('📡 Calling _extractMetadataFromItem for:', item.media_content_id);
          item.metadata = await this._extractMetadataFromItem(item);
          console.log('📊 Extracted metadata:', item.metadata);
        } else {
          console.log('✅ Item already has metadata from queue enrichment');
          console.log('📋 Metadata content:', item.metadata);
        }
        
        // Add to history
        this.history.push(item);
        this.historyIndex = this.history.length - 1;
        
        // V5: Dynamic history size formula to prevent duplicates with priority_new_files
        // Formula considers:
        // - Multiple queue refills (5x multiplier ensures variety)
        // - Discovery window duration (prevent re-showing files within window)
        // Memory: ~600-800 bytes per item = 80KB @ 100, 800KB @ 1000, 4MB @ 5000 (negligible)
        const queueSize = this.config.slideshow_window || 100;
        const autoAdvanceInterval = this.config.auto_advance_interval || 5;
        const discoveryWindow = this.config.folder?.new_files_threshold_seconds || 3600;
        
        const minQueueMultiplier = 5; // See at least 5 queue refills before repeating
        const discoveryWindowItems = Math.floor(discoveryWindow / autoAdvanceInterval);
        const maxHistory = Math.min(
          Math.max(
            queueSize * minQueueMultiplier,  // e.g., 20 × 5 = 100
            discoveryWindowItems,             // e.g., 3600/5 = 720
            100                               // Absolute minimum
          ),
          5000 // Cap for memory sanity
        );
        
        if (this.history.length > maxHistory) {
          this.history.shift();
          this.historyIndex = this.history.length - 1;
        }
        
        this.currentMedia = item;
        this._log('Set currentMedia:', this.currentMedia);
        
        // V4: Set current path for action buttons
        // media_content_id should be the database path, not a media-source:// URL
        this._currentMediaPath = item.media_content_id;
        this._currentMetadata = item.metadata;
        
        // V5: Clear cached full metadata when media changes
        this._fullMetadata = null;
        
        await this._resolveMediaUrl();
        this.requestUpdate(); // Force re-render
        
        // V5: Setup auto-advance after successfully loading media
        this._setupAutoRefresh();
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

    // V4: Handle auto_advance_mode when manually navigating
    this._handleAutoAdvanceModeOnNavigate();

    // V5: Simple history navigation - just move index back
    if (this.history.length === 0) {
      this._log('📖 No history available');
      return;
    }

    // If at end (-1), go to second-to-last item
    if (this.historyIndex === -1) {
      this.historyIndex = this.history.length - 2;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    } else {
      this._log('📖 Already at oldest item in history');
      return;
    }

    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      const item = this.history[this.historyIndex];
      this._log('📖 Going back to history item:', item.title);
      
      this.currentMedia = item;
      // V4: media_content_id should be the path for service calls
      this._currentMediaPath = item.media_content_id;
      this._currentMetadata = item.metadata || null;
      
      // V5: Clear cached full metadata when media changes
      this._fullMetadata = null;
      
      await this._resolveMediaUrl();
      this.requestUpdate();
    } else {
      console.warn('[MediaCardV5a] Invalid history index:', this.historyIndex);
    }
  }

  // V4: Handle auto_advance_mode behavior when user manually navigates
  _handleAutoAdvanceModeOnNavigate() {
    const mode = this.config.auto_advance_mode || 'reset';
    
    this._log(`🎮 auto_advance_mode: "${mode}" - handling manual navigation`);
    
    switch (mode) {
      case 'pause':
        // Pause auto-refresh by clearing the interval
        if (this._refreshInterval) {
          this._log('🔄 Pausing auto-refresh due to manual navigation (clearing interval', this._refreshInterval, ')');
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
        const oldInterval = this._refreshInterval;
        this._log(`🔄 Resetting auto-refresh timer due to manual navigation (clearing interval ${oldInterval}, will create new one)`);
        this._lastRefreshTime = Date.now();
        // Restart the timer (this will clear old interval and create new one)
        this._setupAutoRefresh();
        this._log(`✅ Auto-refresh timer reset complete - old interval: ${oldInterval}, new interval: ${this._refreshInterval}`);
        break;
    }
  }

  // V5: Setup auto-advance timer (copied from V4 lines 1611-1680)
  _setupAutoRefresh() {
    // Clear any existing interval FIRST to prevent multiple timers
    if (this._refreshInterval) {
      this._log('🔄 Clearing existing auto-refresh interval:', this._refreshInterval);
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
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

    // V5: Get auto-advance seconds from config (NOT auto_refresh_seconds)
    const advanceSeconds = this.config?.auto_advance_seconds;
    if (advanceSeconds && advanceSeconds > 0 && this.hass) {
      this._log(`🔄 Setting up auto-advance every ${advanceSeconds} seconds`);
      
      this._refreshInterval = setInterval(async () => {
        // Check pause states before advancing
        if (!this._isPaused && !this._backgroundPaused) {
          // V4 CODE REUSE: Check if we should wait for video to complete
          // Based on V4 lines 3259-3302
          if (await this._shouldWaitForVideoCompletion()) {
            this._log('🔄 Auto-advance skipped - waiting for video to complete');
            return;
          }
          
          this._log('🔄 Auto-advance timer triggered - loading next');
          this._loadNext();
        } else {
          this._log('🔄 Auto-advance skipped - isPaused:', this._isPaused, 'backgroundPaused:', this._backgroundPaused);
        }
      }, advanceSeconds * 1000);
      
      this._log('✅ Auto-advance interval started with ID:', this._refreshInterval);
    } else {
      this._log('🔄 Auto-advance disabled or not configured:', {
        advanceSeconds,
        hasHass: !!this.hass
      });
    }
  }

  // V5: Extract metadata from browse_media item (uses shared helper with media_index support)
  async _extractMetadataFromItem(item) {
    if (!item) return {};
    
    const mediaPath = item.media_content_id || item.title;
    
    // Use shared MediaProvider helper for consistent extraction across providers and card
    return await MediaProvider.extractMetadataWithExif(mediaPath, this.config, this.hass);
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
      console.log('[MediaCardV5a] Cannot resolve URL - missing currentMedia or hass');
      return;
    }

    const mediaId = this.currentMedia.media_content_id;
    console.log('[MediaCardV5a] 🔍 _resolveMediaUrl called with mediaId:', mediaId);
    console.log('[MediaCardV5a] 🔍 currentMedia object:', this.currentMedia);
    
    // If already a full URL, use it
    if (mediaId.startsWith('http')) {
      console.log('[MediaCardV5a] Using direct HTTP URL');
      this.mediaUrl = mediaId;
      this.requestUpdate();
      return;
    }

    // If media-source:// format, resolve through HA API
    if (mediaId.startsWith('media-source://')) {
      try {
        console.log('[MediaCardV5a] ✅ Resolving media-source:// URL via HA API');
        
        // V5: Copy V4's approach - just pass through to HA without modification
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaId,
          expires: (60 * 60 * 3) // 3 hours
        });
        console.log('[MediaCardV5a] ✅ HA resolved to:', resolved.url);
        
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
      console.log('[MediaCardV5a] ⚠️ Converting /media/ to media-source://', mediaSourceId);
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
        console.error('[MediaCardV5a] Failed to resolve media path:', mediaPath, error);
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
    
    // V4: Log additional context for Synology DSM URLs
    if (this.mediaUrl && this.mediaUrl.includes('/synology_dsm/')) {
      this._log('🔄 Synology DSM URL detected - checking authentication signature');
      console.warn('[MediaCardV5a] Synology DSM URL refresh needed:', this.mediaUrl.substring(0, 100) + '...');
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
      
      console.warn('[MediaCardV5a] ⚠️ All URL refresh attempts failed or returned same URL');
      return false;
      
    } catch (error) {
      console.error('[MediaCardV5a] ❌ URL refresh failed:', error);
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
    console.error('[MediaCardV5a] Showing media error:', errorMessage);
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

  // V4 CODE REUSE: Check if we should wait for video to complete before advancing
  // Based on V4 lines 3259-3302
  async _shouldWaitForVideoCompletion() {
    const videoElement = this.renderRoot?.querySelector('video');
    
    // No video playing, don't wait
    if (!videoElement || !this.mediaUrl || this.currentMedia?.media_content_type?.startsWith('image')) {
      return false;
    }

    // If video is paused, don't wait (user intentionally paused)
    if (videoElement.paused) {
      return false;
    }

    // Get configuration values
    const videoMaxDuration = this.config.video_max_duration || 0;
    const autoAdvanceSeconds = this.config.auto_advance_seconds || 30;

    this._log('🎬 Video completion check - videoMaxDuration:', videoMaxDuration, 'autoAdvanceSeconds:', autoAdvanceSeconds);

    // If video_max_duration is 0, wait indefinitely for video completion
    if (videoMaxDuration === 0) {
      this._log('🎬 Video playing - waiting for completion (no time limit set)');
      return true;
    }

    // Check if we've been waiting too long based on video_max_duration
    const now = Date.now();
    if (!this._videoWaitStartTime) {
      this._videoWaitStartTime = now;
      this._log('🎬 Starting video wait timer at:', new Date(now).toLocaleTimeString());
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
    this._log('🎬 Video ended:', this.mediaUrl);
    // Reset video wait timer when video ends
    this._videoWaitStartTime = null;
    
    // V4: Trigger immediate navigation to next media in folder/slideshow mode
    if (this.provider) {
      this._log('🎬 Video ended - triggering immediate next media');
      // Small delay to ensure video ended event is fully processed
      setTimeout(() => {
        this._loadNext().catch(err => {
          console.error('Error advancing to next media after video end:', err);
        });
      }, 100);
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
      this._log('Video muted state applied:', video.muted);
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
      // Pause: Clear the interval
      if (this._refreshInterval) {
        this._log('🔄 Clearing interval on pause, ID:', this._refreshInterval);
        clearInterval(this._refreshInterval);
        this._refreshInterval = null;
      }
    } else {
      // Resume: Restart auto-advance
      this._setupAutoRefresh();
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
        } else if (metadata.has_coordinates) {
          // Has GPS but no city/state/country text yet - geocoding pending
          parts.push(`📍 Loading location...`);
        }
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
    
    // Don't render anything if all are disabled
    if (!enablePause && !showMediaIndexButtons) {
      return html``;
    }
    if (!enablePause && !enableFavorite && !enableDelete && !enableEdit && !enableInfo) {
      return html``;
    }

    const isFavorite = this._currentMetadata?.is_favorited || false;
    const isPaused = this._isPaused || false;
    const isInfoActive = this._showInfoOverlay || false;
    const position = config.position || 'top-right';

    return html`
      <div class="action-buttons action-buttons-${position}">
        ${enablePause ? html`
          <button
            class="action-btn pause-btn ${isPaused ? 'paused' : ''}"
            @click=${this._handlePauseClick}
            title="${isPaused ? 'Resume' : 'Pause'}">
            <ha-icon icon="${isPaused ? 'mdi:play' : 'mdi:pause'}"></ha-icon>
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

    // Get total count from provider queue (not history which grows unbounded)
    const totalCount = this.provider?.subfolderQueue?.queue?.length || 0;
    if (totalCount <= 1) {
      return html``;
    }

    // Current position in history (historyIndex === -1 means at end/latest)
    const currentIndex = this.historyIndex === -1 ? this.history.length - 1 : this.historyIndex;

    // Show position indicator if enabled
    let positionIndicator = html``;
    if (this.config.show_position_indicator !== false) {
      positionIndicator = html`
        <div class="position-indicator">
          ${currentIndex + 1} of ${totalCount}
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
  
  // V4: Action Button Handlers
  async _handleFavoriteClick(e) {
    e.stopPropagation();
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    // CRITICAL: Capture current state NOW before async operations
    const targetPath = this._currentMediaPath;
    const isFavorite = this._currentMetadata?.is_favorited || false;
    const newState = !isFavorite;
    
    console.warn(`💗 FAVORITE CAPTURE: path="${targetPath}", current_is_favorited=${isFavorite}, new_state=${newState}`);
    console.warn(`💗 CURRENT METADATA:`, this._currentMetadata);
    
    try {
      // V4: Call media_index service via WebSocket API
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'mark_favorite',
        service_data: {
          file_path: targetPath,
          is_favorite: newState
        },
        return_response: true
      };
      
      // V4: If entity_id specified, add target object
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      console.warn(`✅ Favorite toggled for ${targetPath}: ${newState}`, response);
      
      // Update current metadata
      if (this._currentMetadata) {
        this._currentMetadata.is_favorited = newState;
      }
      
      this.requestUpdate();
      
    } catch (error) {
      console.error('Failed to mark favorite:', error);
      alert('Failed to mark favorite: ' + error.message);
    }
  }

  // V4: Handle pause button click
  _handlePauseClick(e) {
    e.stopPropagation();
    this._setPauseState(!this._isPaused);
    this._log(`🎮 ${this._isPaused ? 'PAUSED' : 'RESUMED'} slideshow (action button)`);
  }
  
  // Handle info button click - toggle overlay and fetch full metadata
  async _handleInfoClick(e) {
    e.stopPropagation();
    
    // Toggle state
    this._showInfoOverlay = !this._showInfoOverlay;
    
    // If opening overlay and we have a file path, fetch full metadata
    // Or if overlay is already open but media changed (no cached metadata)
    if (this._showInfoOverlay && this._currentMediaPath && !this._fullMetadata) {
      try {
        // Convert media-source:// URL to database path format
        let filePath = this._currentMediaPath;
        if (filePath.startsWith('media-source://media_source/')) {
          filePath = filePath.replace('media-source://media_source/', '/');
        }
        
        const wsCall = {
          type: 'call_service',
          domain: 'media_index',
          service: 'get_file_metadata',
          service_data: {
            file_path: filePath
          },
          return_response: true
        };
        
        if (this.config.media_index?.entity_id) {
          wsCall.target = { entity_id: this.config.media_index.entity_id };
        }
        
        const response = await this.hass.callWS(wsCall);
        
        // Store full metadata for overlay rendering
        this._fullMetadata = response.response;
        this._log('📊 Fetched full metadata for info overlay:', this._fullMetadata);
        
      } catch (error) {
        console.error('Failed to fetch metadata:', error);
        this._fullMetadata = this._currentMetadata; // Fallback to basic metadata
      }
    }
    
    this.requestUpdate();
    this._log(`ℹ️ ${this._showInfoOverlay ? 'SHOWING' : 'HIDING'} info overlay`);
  }
  
  // Helper to fetch full metadata asynchronously (called from render when overlay is open)
  async _fetchFullMetadataAsync() {
    // Prevent duplicate fetches
    if (this._fetchingMetadata) return;
    this._fetchingMetadata = true;
    
    try {
      // Convert media-source:// URL to database path format
      let filePath = this._currentMediaPath;
      if (filePath.startsWith('media-source://media_source/')) {
        filePath = filePath.replace('media-source://media_source/', '/');
      }
      
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_file_metadata',
        service_data: {
          file_path: filePath
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
    
    if (!this._currentMediaPath || !MediaProvider.isMediaIndexActive(this.config)) return;
    
    this._showDeleteConfirmation();
  }

  // V5 FIX: Convert media-source URI to filesystem path for media_index services
  _convertToFilesystemPath(mediaSourceUri) {
    if (!mediaSourceUri) return null;
    
    // Strip media-source://media_source prefix if present
    // Example: media-source://media_source/media/Photo/PhotoLibrary/file.jpg -> /media/Photo/PhotoLibrary/file.jpg
    if (mediaSourceUri.startsWith('media-source://media_source')) {
      return mediaSourceUri.replace('media-source://media_source', '');
    }
    
    // Already a filesystem path
    return mediaSourceUri;
  }
  
  async _showDeleteConfirmation() {
    if (!this._currentMediaPath) return;
    
    // V4: Use current resolved URL for thumbnail (already resolved in _resolveMediaUrl)
    const thumbnailUrl = this.mediaUrl;
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-overlay';
    dialog.innerHTML = `
      <div class="delete-confirmation-content">
        <h3>Delete Media?</h3>
        <div class="delete-thumbnail">
          <img src="${thumbnailUrl}" alt="Preview">
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
      // V5 FIX: Convert media-source URI to filesystem path
      const filesystemPath = this._convertToFilesystemPath(this._currentMediaPath);
      
      if (!filesystemPath) {
        throw new Error('Invalid media path');
      }
      
      this._log('🗑️ Deleting file:', filesystemPath, '(from URI:', this._currentMediaPath, ')');
      
      // V4: Call media_index service via WebSocket API
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'delete_media',
        service_data: {
          file_path: filesystemPath
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
      
      // Add to provider's exclusion list (use original URI for exclusion)
      if (this.provider && this.provider.excludedFiles) {
        this.provider.excludedFiles.add(this._currentMediaPath);
        this._log(`📝 Added to provider exclusion list: ${this._currentMediaPath}`);
      }
      
      // Remove from navigation history
      const historyIndex = this.history.findIndex(h => h.media_content_id === pathToDelete);
      if (historyIndex >= 0) {
        this.history.splice(historyIndex, 1);
        // Adjust history position if we removed an earlier item
        if (historyIndex <= this.historyPosition) {
          this.historyPosition--;
        }
        this._log(`📚 Removed from navigation history at index ${historyIndex} (${this.history.length} remaining)`);
      }
      
      // Advance to next media after delete
      await this._loadNext();
      
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
  
  async _showEditConfirmation() {
    if (!this._currentMediaPath) return;
    
    // V4: Use already-resolved media URL for thumbnail
    const thumbnailUrl = this.mediaUrl;
    
    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-overlay'; // Reuse delete dialog styles
    dialog.innerHTML = `
      <div class="delete-confirmation-content">
        <h3>Mark for Editing?</h3>
        <div class="delete-thumbnail">
          <img src="${thumbnailUrl}" alt="Preview">
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
      // V5 FIX: Convert media-source URI to filesystem path
      const filesystemPath = this._convertToFilesystemPath(this._currentMediaPath);
      
      if (!filesystemPath) {
        throw new Error('Invalid media path');
      }
      
      this._log('✏️ Marking file for edit:', filesystemPath, '(from URI:', this._currentMediaPath, ')');
      
      // V4: Call media_index service via WebSocket API
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'mark_for_edit',
        service_data: {
          file_path: filesystemPath,
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
      
      // V4 CODE REUSE: Remove file from history and exclude from future queries
      // Copied from ha-media-card.js lines 6008-6020
      
      // Add to provider's exclusion list to prevent reappearance (use original URI)
      if (this.provider && this.provider.excludedFiles) {
        this.provider.excludedFiles.add(this._currentMediaPath);
        this._log(`📝 Added to provider exclusion list: ${this._currentMediaPath}`);
      }
      
      // Remove from navigation history
      const historyIndex = this.history.findIndex(h => h.media_content_id === this._currentMediaPath);
      if (historyIndex >= 0) {
        this.history.splice(historyIndex, 1);
        // Adjust history position if we removed an earlier item
        if (historyIndex <= this.historyPosition) {
          this.historyPosition--;
        }
        this._log(`📚 Removed from navigation history at index ${historyIndex} (${this.history.length} remaining)`);
      }
      
      // V4 CODE: Automatically advance to next media (line 6030-6032)
      await this._loadNext();
      
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
    // V4 CODE: Check for kiosk mode exit first (line 5326-5348)
    if (this._shouldHandleKioskExit('tap')) {
      e.preventDefault();
      e.stopPropagation();
      this._handleKioskExit();
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
    // V4 CODE: Check for kiosk mode exit first (line 5350-5376)
    if (this._shouldHandleKioskExit('double_tap')) {
      // Clear single tap timer if double tap occurs
      if (this._tapTimeout) {
        clearTimeout(this._tapTimeout);
        this._tapTimeout = null;
      }
      
      e.preventDefault();
      e.stopPropagation();
      this._handleKioskExit();
      return;
    }
    
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
    // V4 CODE: Check for kiosk mode exit (hold action) (line 5379-5403)
    if (this._shouldHandleKioskExit('hold')) {
      // Start hold timer (500ms like standard HA cards)
      this._holdTimeout = setTimeout(() => {
        this._handleKioskExit();
        this._holdTriggered = true;
      }, 500);
      
      this._holdTriggered = false;
      return;
    }
    
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
    this._kioskStateSubscription = this.hass.connection.subscribeEvents(
      (event) => {
        if (event.data.entity_id === entity) {
          this._log('🖼️ Kiosk mode entity state changed:', event.data.new_state.state);
          this.requestUpdate(); // Re-render to show/hide kiosk indicator
        }
      },
      'state_changed'
    );
  }

  _cleanupKioskModeMonitoring() {
    if (this._kioskStateSubscription) {
      this._kioskStateSubscription();
      this._kioskStateSubscription = null;
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

    /* V4: Highlight pause button when paused */
    .pause-btn.paused {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.15);
    }

    .pause-btn.paused:hover {
      color: var(--primary-color, #03a9f4);
      background: rgba(3, 169, 244, 0.25);
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
      z-index: 12;
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
      top: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      pointer-events: none;
      z-index: 12;
      opacity: 0.7;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* V4: Navigation Indicators (position and dots) */
    /* Copied from V4 lines 1362-1425 */
    .position-indicator {
      position: absolute;
      bottom: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 500;
      pointer-events: none;
      z-index: 15;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .dots-indicator {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      pointer-events: none;
      z-index: 15;
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
      background: rgba(0, 0, 0, 0.92);
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
          ${this._renderPauseIndicator()}
          ${this._renderKioskIndicator()}
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

    // V4: Detect media type from media_content_type or filename
    const isVideo = this.currentMedia?.media_content_type?.startsWith('video') || 
                    MediaUtils.detectFileType(this.currentMedia?.media_content_id || this.currentMedia?.title || this.mediaUrl) === 'video';

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
        <div class="nav-zone nav-zone-left"
             @click=${this._loadPrevious}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Previous">
        </div>
        <div class="nav-zone nav-zone-right"  
             @click=${this._loadNext}
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

    const exitAction = this.config.kiosk_mode_exit_action || 'tap';
    const actionText = exitAction === 'hold' ? 'Hold' : 
                      exitAction === 'double_tap' ? 'Double-tap' : 'Tap';
    
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
    
    if (newMode === 'single_media') {
      this._config = { 
        type: this._config.type, // Preserve card type
        media_source_type: 'single_media',
        single_media: {
          path: this._config.media_path || null,
          refresh_seconds: this._config.auto_refresh_seconds || 0
        },
        // Preserve common settings
        media_type: this._config.media_type,
        display: this._config.display,
        navigation: this._config.navigation,
        metadata: this._config.metadata,
        video: this._config.video,
        title: this._config.title,
        media_index: this._config.media_index // Preserve media_index for metadata/actions
      };
    } else if (newMode === 'folder') {
      // Get path from media_index entity if available
      let folderPath = this._config.media_path || null;
      const mediaIndexEntityId = this._config.media_index?.entity_id;
      
      if (!folderPath && mediaIndexEntityId && this.hass?.states[mediaIndexEntityId]) {
        const entity = this.hass.states[mediaIndexEntityId];
        folderPath = entity.attributes?.media_folder || 
                     entity.attributes?.folder_path || 
                     entity.attributes?.base_path || null;
        if (folderPath) {
          this._log('📁 Auto-populated folder path from media_index:', folderPath);
        }
      }
      
      this._config = { 
        type: this._config.type, // Preserve card type
        media_source_type: 'folder',
        folder: {
          path: folderPath,
          mode: 'random',
          recursive: true
        },
        // Preserve common settings
        media_type: this._config.media_type,
        display: this._config.display,
        navigation: this._config.navigation,
        metadata: this._config.metadata,
        video: this._config.video,
        title: this._config.title,
        media_index: this._config.media_index // Keep root-level for metadata/actions
      };
    }
    
    this._fireConfigChanged();
  }

  _handleFolderModeChange(ev) {
    const mode = ev.target.value;
    
    const folderConfig = {
      ...this._config.folder,
      mode: mode
    };
    
    // Add sequential defaults when switching to sequential mode
    if (mode === 'sequential') {
      folderConfig.sequential = {
        order_by: this._config.folder?.sequential?.order_by || 'date_taken',
        order_direction: this._config.folder?.sequential?.order_direction || 'desc'
      };
    } else {
      // Remove sequential config when switching to random
      delete folderConfig.sequential;
    }
    
    this._config = {
      ...this._config,
      folder: folderConfig
    };
    this._fireConfigChanged();
  }

  _handleRecursiveChanged(ev) {
    const recursive = ev.target.checked;
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        recursive: recursive
      }
    };
    this._fireConfigChanged();
  }

  _handleUseMediaIndexForDiscoveryChanged(ev) {
    const useMediaIndex = ev.target.checked;
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        use_media_index_for_discovery: useMediaIndex
      }
    };
    this._fireConfigChanged();
  }

  _handlePriorityNewFilesChanged(ev) {
    const priorityNewFiles = ev.target.checked;
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        priority_new_files: priorityNewFiles,
        // Set default threshold when enabling
        new_files_threshold_seconds: this._config.folder?.new_files_threshold_seconds || 3600
      }
    };
    this._fireConfigChanged();
  }

  _handleNewFilesThresholdChanged(ev) {
    const threshold = parseInt(ev.target.value, 10);
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        new_files_threshold_seconds: threshold
      }
    };
    this._fireConfigChanged();
  }

  _handleScanDepthChanged(ev) {
    const value = ev.target.value;
    const scanDepth = value === '' ? null : parseInt(value, 10);
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        scan_depth: scanDepth
      }
    };
    this._fireConfigChanged();
  }

  _handleEstimatedTotalChanged(ev) {
    const value = ev.target.value;
    const estimatedTotal = value === '' ? null : parseInt(value, 10);
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        estimated_total_photos: estimatedTotal
      }
    };
    this._fireConfigChanged();
  }

  _handleSlideshowWindowChanged(ev) {
    const value = ev.target.value;
    const slideshowWindow = value === '' ? null : parseInt(value, 10);
    this._config = {
      ...this._config,
      slideshow_window: slideshowWindow
    };
    this._fireConfigChanged();
  }

  _handlePriorityFoldersChanged(ev) {
    const patterns = ev.target.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(path => ({ path, weight_multiplier: 3.0 }));

    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        priority_folders: patterns
      }
    };
    this._fireConfigChanged();
  }

  _formatPriorityFolders(folders) {
    if (!folders || folders.length === 0) return '';
    return folders.map(p => p.path).join('\n');
  }

  _parsePriorityFolders(text) {
    // NOT USED - keeping for backward compatibility
    if (!text || text.trim() === '') return [];
    
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(path => ({ path, weight_multiplier: 3.0 }));
  }

  _handleSequentialOrderByChange(ev) {
    const orderBy = ev.target.value;
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        sequential: {
          order_by: orderBy,
          order_direction: this._config.folder?.sequential?.order_direction || 'desc'
        }
      }
    };
    this._fireConfigChanged();
  }

  _handleSequentialOrderDirectionChange(ev) {
    const direction = ev.target.value;
    this._config = {
      ...this._config,
      folder: {
        ...this._config.folder,
        sequential: {
          order_by: this._config.folder?.sequential?.order_by || 'date_taken',
          order_direction: direction
        }
      }
    };
    this._fireConfigChanged();
  }

  _handleRootMediaIndexEntityChange(ev) {
    const entityId = ev.target.value;
    console.log('🎯 _handleRootMediaIndexEntityChange called with:', entityId);
    console.log('🎯 Current media_source_type:', this._config.media_source_type);
    console.log('🎯 this.hass exists:', !!this.hass);
    
    if (entityId) {
      // Enable media_index at root level (works for both single_media and folder)
      this._config = {
        ...this._config,
        media_index: {
          ...this._config.media_index,
          entity_id: entityId
        }
      };
      
      // Auto-populate folder path from entity if available
      if (this.hass && this.hass.states[entityId]) {
        const entity = this.hass.states[entityId];
        console.log('🔍 Media Index entity FULL:', entity);
        console.log('🔍 Media Index entity attributes:', entity.attributes);
        console.log('🔍 Available attribute keys:', Object.keys(entity.attributes));
        
        // Try different possible attribute names
        const mediaFolder = entity.attributes?.media_path ||   // media_index uses this
                           entity.attributes?.media_folder || 
                           entity.attributes?.folder_path ||
                           entity.attributes?.base_path;
        
        console.log('📁 Extracted media folder:', mediaFolder);
        console.log('📁 Is in folder mode?', this._config.media_source_type === 'folder');
        
        if (mediaFolder) {
          console.log('✅ Auto-populating path from media_index entity:', mediaFolder);
          
          // For folder mode: set folder.path
          if (this._config.media_source_type === 'folder') {
            console.log('✅ Setting folder.path to:', mediaFolder);
            this._config.folder = {
              ...this._config.folder,
              path: mediaFolder
            };
            console.log('✅ Updated folder config:', this._config.folder);
          } else if (this._config.media_source_type === 'single_media') {
            // For single_media mode: optionally set as starting folder for browse
            // Don't auto-set single_media.path as it should be a file, not folder
            console.log('💡 Folder available for browsing:', mediaFolder);
          }
        } else {
          console.warn('⚠️ No media_folder attribute found on entity');
        }
      } else {
        console.warn('⚠️ Entity not found in hass.states:', entityId);
      }
    } else {
      // Disable media_index
      const newConfig = { ...this._config };
      delete newConfig.media_index;
      this._config = newConfig;
    }
    
    console.log('🎯 Final config before fire:', this._config);
    this._fireConfigChanged();
  }

  // Legacy handler - can be removed later
  _handleMediaIndexEntityChange(ev) {
    const entityId = ev.target.value;
    
    if (entityId) {
      // Enable media_index backend
      this._config = {
        ...this._config,
        folder: {
          ...this._config.folder,
          media_index: {
            ...this._config.folder?.media_index,
            entity_id: entityId
          }
        }
      };
    } else {
      // Disable media_index backend (use filesystem)
      this._config = {
        ...this._config,
        folder: {
          ...this._config.folder,
          media_index: {}
        }
      };
    }
    
    this._fireConfigChanged();
  }

  // Legacy handler - can be removed later
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

  _autoAdvanceModeChanged(ev) {
    this._config = { ...this._config, auto_advance_mode: ev.target.value };
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

  _kioskModeAutoEnableChanged(ev) {
    this._config = {
      ...this._config,
      kiosk_mode_auto_enable: ev.target.checked
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
    
    // First, try to get path from current config structure (v5)
    const mediaSourceType = this._config.media_source_type || 'single_media';
    let configuredPath = '';
    
    if (mediaSourceType === 'single_media') {
      configuredPath = this._config.single_media?.path || this._config.media_path || '';
    } else if (mediaSourceType === 'folder') {
      configuredPath = this._config.folder?.path || this._config.media_path || '';
    }
    
    this._log('🔍 Configured path:', configuredPath);
    
    if (configuredPath) {
      // If we have a path, start browsing from that location (or its parent)
      if (mediaSourceType === 'single_media' && configuredPath.includes('/')) {
        // For single media, start from parent folder
        const pathParts = configuredPath.split('/');
        pathParts.pop(); // Remove the filename
        startPath = pathParts.join('/');
        this._log('Starting browser from parent folder:', startPath);
      } else {
        // For folders, start from the folder itself
        startPath = configuredPath;
        this._log('Starting browser from configured folder:', startPath);
      }
    } else if (this._config.media_index?.entity_id) {
      // If Media Index is configured but no path, try to get from entity
      const entityId = this._config.media_index.entity_id;
      const entity = this.hass.states[entityId];
      
      this._log('🔍 Media Index entity:', entityId);
      this._log('🔍 Entity attributes:', entity?.attributes);
      
      if (entity && entity.attributes.media_folder) {
        startPath = entity.attributes.media_folder;
        this._log('Starting browser from Media Index folder (attribute):', startPath);
      } else {
        // Fallback: parse entity_id to extract path
        const parsedPath = this._parseMediaIndexPath(entityId);
        if (parsedPath) {
          startPath = parsedPath;
          this._log('Starting browser from Media Index folder (parsed):', startPath);
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
      
      const mediaSourceType = this._config.media_source_type || 'single_media';
      
      if (mediaSourceType === 'folder') {
        // Already in folder mode - just update the path
        this._config = {
          ...this._config,
          folder: {
            ...this._config.folder,
            path: folderPath
          }
        };
      } else {
        // In single_media mode - ask if they want to switch to folder mode
        const switchToFolder = confirm(
          '📁 You selected a folder.\n\n' +
          'Do you want to:\n' +
          'OK = Switch to Folder mode (random/sequential slideshow)\n' +
          'Cancel = Stay in Single Media mode (shows folder as single item)'
        );
        
        if (switchToFolder) {
          this._config = {
            ...this._config,
            media_source_type: 'folder',
            folder: {
              path: folderPath,
              mode: 'random',
              recursive: true
            }
          };
        } else {
          this._config = {
            ...this._config,
            single_media: {
              ...this._config.single_media,
              path: folderPath
            }
          };
        }
      }
      
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
    
    const mediaSourceType = this._config.media_source_type || 'single_media';
    
    // For single_media: just set the file in single_media.path
    if (mediaSourceType === 'single_media') {
      this._config = { 
        ...this._config,
        single_media: {
          ...this._config.single_media,
          path: mediaContentId
        }
      };
    } else if (mediaSourceType === 'folder') {
      // For folder mode: warn user and offer to use parent folder
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
          folder: {
            ...this._config.folder,
            path: folderPath
          }
        };
      } else {
        // Switch to single_media mode with this file
        this._config = {
          ...this._config,
          media_source_type: 'single_media',
          single_media: {
            path: mediaContentId,
            refresh_seconds: 0
          }
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

    const mediaSourceType = this._config.media_source_type || 'folder';
    const isFolderMode = mediaSourceType === 'folder';
    const folderConfig = this._config.folder || {};
    const folderMode = folderConfig.mode || 'random';
    const mediaIndexEntityId = this._config.media_index?.entity_id || folderConfig.media_index?.entity_id || '';
    const hasMediaIndex = !!mediaIndexEntityId;

    return html`
      <div class="card-config">
        
        <!-- Mode Selection Dropdown (2 options: single_media or folder) -->
        <div class="config-row">
          <label>Media Source Type</label>
          <div>
            <select @change=${this._handleModeChange} .value=${mediaSourceType}>
              <option value="single_media">Single Media</option>
              <option value="folder">Folder</option>
            </select>
            <div class="help-text">
              ${mediaSourceType === 'single_media' 
                ? 'Display a single image/video (with optional periodic refresh)' 
                : 'Display media from a folder (random or sequential)'}
            </div>
          </div>
        </div>

        <!-- Media Index Integration (Available for both Single Media and Folder modes) -->
        <div style="background: #f0f7ff; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #d0e7ff;">
          <div style="margin-bottom: 12px;">
            <strong>🚀 Media Index Integration (Optional)</strong>
          </div>
          <p style="margin: 4px 0 16px 0; font-size: 13px; color: #666;">
            Enable EXIF metadata display (date, location, camera info) and action buttons (favorite, delete, edit). 
            ${isFolderMode ? 'Also provides faster database-backed queries for folder scanning. ' : ''}
            Download via HACS or <a href="https://github.com/markaggar/ha-media-index" target="_blank" style="color: var(--primary-color, #007bff);">GitHub</a>
          </p>
          
          <div style="margin-left: 0;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Media Index Entity:</label>
            <select
              .value=${mediaIndexEntityId}
              @change=${this._handleRootMediaIndexEntityChange}
              style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
            >
              <option value="">(None - No metadata or action buttons)</option>
              ${this._getMediaIndexEntities().map(entity => html`
                <option 
                  value="${entity.entity_id}"
                  .selected=${mediaIndexEntityId === entity.entity_id}
                >${entity.friendly_name}</option>
              `)}
            </select>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              ${hasMediaIndex 
                ? `✅ Metadata and action buttons enabled${isFolderMode ? ' + database queries for folder scanning' : ''}` 
                : '❌ Metadata and action buttons disabled'}
            </div>
          </div>
          
          <!-- Use Media Index for Discovery (folder mode only) -->
          ${hasMediaIndex && isFolderMode ? html`
            <div style="margin-left: 0; margin-top: 16px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                <input
                  type="checkbox"
                  .checked=${folderConfig.use_media_index_for_discovery !== false}
                  @change=${this._handleUseMediaIndexForDiscoveryChanged}
                />
                <span>Use Media Index for file discovery</span>
              </label>
              <div style="font-size: 12px; color: #666; margin-top: 4px; margin-left: 24px;">
                ${folderConfig.use_media_index_for_discovery !== false
                  ? '🚀 Using database queries for fast random selection'
                  : '📁 Using filesystem scanning (slower but includes unindexed files)'}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Folder Configuration (when media_source_type = "folder") -->
        ${isFolderMode ? html`
          <div class="config-row">
            <label>Folder Mode</label>
            <div>
              <select @change=${this._handleFolderModeChange} .value=${folderMode}>
                <option value="random">Random</option>
                <option value="sequential">Sequential</option>
              </select>
              <div class="help-text">
                ${folderMode === 'random' 
                  ? 'Show files in random order' 
                  : 'Show files in sequential order'}
              </div>
            </div>
          </div>

          <div class="config-row">
            <label>Queue Size</label>
            <div>
              <input
                type="number"
                min="5"
                max="5000"
                .value=${this._config.slideshow_window || 100}
                @input=${this._handleSlideshowWindowChanged}
                placeholder="100"
              />
              <div class="help-text">
                ${folderMode === 'random' 
                  ? 'Number of random items to fetch from media index (smaller = faster refresh of new files)' 
                  : 'Maximum files to scan (performance limit for recursive scans)'}
              </div>
            </div>
          </div>

          <!-- Priority New Files (available when: random+media_index OR sequential mode) -->
          ${(folderMode === 'random' && hasMediaIndex && folderConfig.use_media_index_for_discovery !== false) || folderMode === 'sequential' ? html`
            <div class="config-row">
              <label style="display: flex; align-items: center; gap: 8px;">
                <input
                  type="checkbox"
                  .checked=${folderConfig.priority_new_files || false}
                  @change=${this._handlePriorityNewFilesChanged}
                />
                <span>Show recently discovered files first</span>
              </label>
              <div class="help-text">
                ${folderMode === 'random' 
                  ? 'Display newly discovered files before random selection' 
                  : 'Display newly discovered files at the start of the sequence'}
              </div>
            </div>

            ${folderConfig.priority_new_files ? html`
              <div class="config-row">
                <label>Discovery Window</label>
                <div>
                  <select 
                    @change=${this._handleNewFilesThresholdChanged}
                    .value=${folderConfig.new_files_threshold_seconds || 3600}
                  >
                    <option value="1800">30 minutes</option>
                    <option value="3600">1 hour</option>
                    <option value="7200">2 hours</option>
                    <option value="21600">6 hours</option>
                    <option value="86400">24 hours</option>
                  </select>
                  <div class="help-text">
                    How recently a file must be ${hasMediaIndex && folderConfig.use_media_index_for_discovery !== false ? 'indexed' : 'discovered'} to appear first
                  </div>
                </div>
              </div>
            ` : ''}
          ` : ''}

          <div class="config-row">
            <label>Recursive Scan</label>
            <div>
              <input
                type="checkbox"
                .checked=${folderConfig.recursive !== false}
                @change=${this._handleRecursiveChanged}
              />
              <div class="help-text">
                Include files from subfolders
                ${folderMode === 'sequential' && !hasMediaIndex
                  ? ' (supports integration sources like Reolink/Synology)'
                  : ''}
              </div>
            </div>
          </div>

          <!-- Subfolder Queue Options (only when recursive=true and no media_index) -->
          ${folderConfig.recursive !== false && !hasMediaIndex ? html`
            <div style="margin-left: 20px; padding: 12px; background: #f9f9f9; border-left: 3px solid #2196F3; border-radius: 4px;">
              <div style="font-weight: 500; margin-bottom: 8px;">📂 Subfolder Scanning Options</div>
              
              <div class="config-row">
                <label>Scan Depth</label>
                <div>
                  <input
                    type="number"
                    .value=${folderConfig.scan_depth ?? ''}
                    @input=${this._handleScanDepthChanged}
                    placeholder="unlimited"
                    min="0"
                    max="10"
                  />
                  <div class="help-text">How many subfolder levels to scan (blank = unlimited)</div>
                </div>
              </div>

              <div class="config-row">
                <label>Estimated Total Photos</label>
                <div>
                  <input
                    type="number"
                    .value=${folderConfig.estimated_total_photos ?? ''}
                    @input=${this._handleEstimatedTotalChanged}
                    placeholder="auto-detect"
                    min="1"
                  />
                  <div class="help-text">Approximate total photos in library (improves sampling probability)</div>
                </div>
              </div>

              <div class="config-row">
                <label>Priority Folders</label>
                <div>
                  <textarea
                    .value=${this._formatPriorityFolders(folderConfig.priority_folders)}
                    @input=${this._handlePriorityFoldersChanged}
                    placeholder="e.g., Favorites&#10;Vacation&#10;2024"
                    rows="3"
                    style="width: 100%; font-family: monospace; font-size: 12px;"
                  ></textarea>
                  <div class="help-text">Folder paths to prioritize (one per line, weight 3.0x applied automatically)</div>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Sequential Mode Options (only when mode = "sequential") -->
          ${folderMode === 'sequential' ? html`
            <div class="config-row">
              <label>Sort By</label>
              <div>
                <select @change=${this._handleSequentialOrderByChange} .value=${folderConfig.sequential?.order_by || 'date_taken'}>
                  <option value="date_taken">Date Taken (EXIF)</option>
                  <option value="filename">Filename</option>
                  <option value="path">Full Path</option>
                  <option value="modified_time">File Modified Time</option>
                </select>
                <div class="help-text">Field to use for sorting files</div>
              </div>
            </div>

            <div class="config-row">
              <label>Sort Direction</label>
              <div>
                <select @change=${this._handleSequentialOrderDirectionChange} .value=${folderConfig.sequential?.order_direction || 'desc'}>
                  <option value="asc">Ascending (oldest/A-Z first)</option>
                  <option value="desc">Descending (newest/Z-A first)</option>
                </select>
                <div class="help-text">Sort order direction</div>
              </div>
            </div>
          ` : ''}
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

        ${mediaSourceType === 'folder' ? html`
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
            
            <div class="config-row">
              <label>Auto-Advance on Navigate</label>
              <div>
                <select @change=${this._autoAdvanceModeChanged} .value=${this._config.auto_advance_mode || 'reset'}>
                  <option value="pause">Pause auto-refresh when navigating manually</option>
                  <option value="continue">Continue auto-refresh during manual navigation</option>
                  <option value="reset">Reset auto-refresh timer on manual navigation</option>
                </select>
                <div class="help-text">How auto-refresh behaves when navigating manually</div>
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

        ${hasMediaIndex ? html`
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
            <label>Auto-Enable Kiosk</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.kiosk_mode_auto_enable !== false}
                @change=${this._kioskModeAutoEnableChanged}
              />
              <div class="help-text">Automatically turn on kiosk entity when card loads (requires kiosk entity)</div>
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
