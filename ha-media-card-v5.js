/**
 * Home Assistant Media Card v5.0
 * A unified architecture rebuild with provider pattern for all media sources
 * 
 * KEY ARCHITECTURAL PRINCIPLES:
 * - Single queue system for all modes
 * - Provider pattern for media sources
 * - Unified state management
 * - Consistent navigation across all modes
 * - Zero new algorithms - reorganization of existing working code
 * 
 * ARCHITECTURE REFERENCE: dev-docs/v5-architecture-spec.md
 */

// Import Lit from CDN for standalone usage
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

console.log('🔄 Step 1: Lit imported successfully');

// ============================================================================
// SHARED UTILITIES (Preserve existing working code exactly)
// ============================================================================

console.log('🔄 Step 2: Starting utilities definition');

const MediaUtils = {
  /**
   * Detect file type (image/video) from file path
   * PRESERVED: Existing logic from v4.1.0 - works perfectly
   */
  detectFileType(filePath) {
    if (!filePath) return null;
    
    // Handle URLs with query parameters
    let cleanPath = filePath;
    if (filePath.includes('?')) {
      cleanPath = filePath.split('?')[0];
    }
    
    const fileName = cleanPath.split('/').pop() || cleanPath;
    
    // Handle special suffixes (e.g., Synology _shared)
    let cleanFileName = fileName;
    if (fileName.endsWith('_shared')) {
      cleanFileName = fileName.replace('_shared', '');
    }
    
    // Extract extension
    const extension = cleanFileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    return null;
  },

  /**
   * Extract filename from path
   * PRESERVED: Simple utility function
   */
  extractFilename(path) {
    if (!path) return '';
    return path.split('/').pop() || path;
  },

  /**
   * Generate unique ID for cards/queues
   */
  generateId() {
    return 'v5-' + Math.random().toString(36).substr(2, 9);
  }
};

// ============================================================================
// MEDIA PROVIDER INTERFACE DEFINITIONS
// ============================================================================

/**
 * Base MediaProvider Interface
 * All media sources must implement this contract
 */
class MediaProvider {
  constructor(config, hass, cardId) {
    this.config = config;
    this.hass = hass;
    this.cardId = cardId;
    this.state = 'uninitialized'; // uninitialized -> loading -> ready -> error
    this.currentItem = null;
  }

  // CORE INTERFACE METHODS (must be implemented by all providers)
  async initialize() { throw new Error('initialize() must be implemented'); }
  async getNext() { throw new Error('getNext() must be implemented'); }
  async getPrevious() { throw new Error('getPrevious() must be implemented'); }
  async getCurrentItem() { return this.currentItem; }
  
  // STATE METHODS
  getQueueSize() { return 0; }
  getHistorySize() { return 0; }
  canAdvance() { return true; }
  canGoBack() { return false; }
  
  // LIFECYCLE METHODS
  pause() { /* Override if needed */ }
  resume() { /* Override if needed */ }
  async disconnect() { /* Override if needed */ }
  async reconnect() { return await this.initialize(); }
  
  // DEBUG METHODS
  getDebugInfo() {
    return {
      providerType: this.constructor.name,
      state: this.state,
      queueSize: this.getQueueSize(),
      historySize: this.getHistorySize(),
      currentItem: this.currentItem?.filename || 'none'
    };
  }

  // UTILITY METHODS
  _log(...args) {
    console.log(`[${this.constructor.name}:${this.cardId}]`, ...args);
  }

  _error(...args) {
    console.error(`[${this.constructor.name}:${this.cardId}]`, ...args);
  }
}

/**
 * Media Item Structure
 * Standardized format for all media items
 */
class MediaItem {
  constructor(data) {
    this.path = data.path || '';
    this.filename = data.filename || MediaUtils.extractFilename(this.path);
    this.type = data.type || MediaUtils.detectFileType(this.path);
    this.metadata = data.metadata || null;
    this.sourceFolder = data.sourceFolder || null;
    this.lastModified = data.lastModified || null;
    this.id = data.id || MediaUtils.generateId();
  }

  isVideo() {
    return this.type === 'video';
  }

  isImage() {
    return this.type === 'image';
  }
}

// ============================================================================
// NAVIGATION HISTORY SYSTEM
// ============================================================================

/**
 * Unified Navigation History
 * REUSE STRATEGY: Unify existing navigation patterns into single system
 */
class NavigationHistory {
  constructor(maxSize = 100) {
    this.items = [];
    this.currentIndex = -1;
    this.maxSize = maxSize;
  }

  add(item) {
    // Remove any items after current position (user navigated back then forward to new item)
    if (this.currentIndex < this.items.length - 1) {
      this.items = this.items.slice(0, this.currentIndex + 1);
    }

    // Add new item
    this.items.push(item);
    this.currentIndex = this.items.length - 1;

    // Maintain size limit
    if (this.items.length > this.maxSize) {
      const removeCount = this.items.length - this.maxSize;
      this.items.splice(0, removeCount);
      this.currentIndex -= removeCount;
    }
  }

  canGoBack() {
    return this.currentIndex > 0;
  }

  canGoForward() {
    return this.currentIndex < this.items.length - 1;
  }

  previous() {
    if (this.canGoBack()) {
      this.currentIndex--;
      return this.items[this.currentIndex];
    }
    return null;
  }

  next() {
    if (this.canGoForward()) {
      this.currentIndex++;
      return this.items[this.currentIndex];
    }
    return null;
  }

  getCurrentItem() {
    return this.currentIndex >= 0 ? this.items[this.currentIndex] : null;
  }

  clear() {
    this.items = [];
    this.currentIndex = -1;
  }

  // Persistence for reconnection
  serialize() {
    return {
      items: this.items,
      currentIndex: this.currentIndex,
      maxSize: this.maxSize
    };
  }

  deserialize(data) {
    if (data && Array.isArray(data.items)) {
      this.items = data.items.map(item => new MediaItem(item));
      this.currentIndex = data.currentIndex || -1;
      this.maxSize = data.maxSize || 100;
    }
  }

  getDebugInfo() {
    return {
      size: this.items.length,
      currentIndex: this.currentIndex,
      canGoBack: this.canGoBack(),
      canGoForward: this.canGoForward()
    };
  }
}

// ============================================================================
// SINGLE MEDIA PROVIDER
// ============================================================================

/**
 * SingleMediaProvider
 * Handles single image/video with optional refresh for cameras
 */
class SingleMediaProvider extends MediaProvider {
  constructor(config, hass, cardId) {
    super(config, hass, cardId);
    this.mediaPath = config.single_media?.path || config.media_path; // Backward compatibility
    this.refreshSeconds = config.single_media?.refresh_seconds || 0;
    this.lastRefreshTime = 0;
  }

  async initialize() {
    this.state = 'loading';
    this._log('Initializing with path:', this.mediaPath);

    try {
      if (!this.mediaPath) {
        throw new Error('No media path configured');
      }

      this.currentItem = new MediaItem({
        path: this.mediaPath,
        filename: MediaUtils.extractFilename(this.mediaPath),
        type: MediaUtils.detectFileType(this.mediaPath)
      });

      this.state = 'ready';
      this._log('Single media initialized:', this.currentItem.filename);
      return true;

    } catch (error) {
      this.state = 'error';
      this._error('Failed to initialize single media:', error);
      return false;
    }
  }

  async getNext() {
    // For single media, "next" means refresh the URL if refresh_seconds is configured
    if (this.refreshSeconds > 0) {
      const now = Date.now();
      if (now - this.lastRefreshTime >= this.refreshSeconds * 1000) {
        await this._refreshMediaUrl();
        this.lastRefreshTime = now;
      }
    }
    return this.currentItem;
  }

  async getPrevious() {
    // Single media mode - always return the same item
    return this.currentItem;
  }

  async _refreshMediaUrl() {
    // Add timestamp to URL to force refresh (useful for camera snapshots)
    const separator = this.mediaPath.includes('?') ? '&' : '?';
    const refreshedPath = `${this.mediaPath}${separator}_t=${Date.now()}`;
    
    this.currentItem = new MediaItem({
      ...this.currentItem,
      path: refreshedPath
    });
    
    this._log('Refreshed media URL with timestamp');
  }

  getQueueSize() {
    return 1; // Always exactly one item
  }

  canAdvance() {
    return false; // Single media doesn't advance to different items
  }

  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      mediaPath: this.mediaPath,
      refreshSeconds: this.refreshSeconds,
      lastRefreshTime: this.lastRefreshTime
    };
  }
}

// ============================================================================
// MEDIA INDEX PROVIDER
// ============================================================================

/**
 * MediaIndexProvider
 * REUSE STRATEGY: Port existing media_index logic with provider interface
 */
class MediaIndexProvider extends MediaProvider {
  constructor(config, hass, cardId) {
    super(config, hass, cardId);
    
    // Configuration
    this.entityId = config.media_index?.entity_id;
    this.subfolder = config.media_index?.subfolder;
    this.queryLimit = config.media_index?.query_limit || 100;
    this.mode = config.media_index?.mode || 'random';
    this.traverseSubfolders = config.media_index?.traverse_subfolders !== false;
    
    // Queue management
    this.queue = [];
    this.currentIndex = 0;
    this.folderIndex = 0; // For folder_sequential mode
    this.excludedFiles = new Set(); // Track files moved to _Junk/_Edit
    
    // Navigation history
    this.history = new NavigationHistory(100);
    
    // Prefetch and caching
    this.prefetchOffset = config.media_index?.prefetch_offset || 3;
    this.lowThreshold = config.advanced?.queue_low_threshold || 10;
    this.refillSize = config.advanced?.queue_refill_size || 50;
  }

  async initialize() {
    this.state = 'loading';
    this._log('Initializing MediaIndex provider:', this.mode);

    try {
      if (!this.entityId) {
        throw new Error('media_index.entity_id is required');
      }

      // Initialize based on mode
      switch (this.mode) {
        case 'random':
          return await this._initializeRandom();
        case 'sequential':
          return await this._initializeSequential();
        case 'folder_sequential':
          return await this._initializeFolderSequential();
        default:
          throw new Error(`Unknown media_index mode: ${this.mode}`);
      }

    } catch (error) {
      this.state = 'error';
      this._error('Failed to initialize MediaIndex provider:', error);
      return false;
    }
  }

  async _initializeRandom() {
    const items = await this._queryMediaIndex(this.queryLimit);
    if (items && items.length > 0) {
      this.queue = items;
      this.currentIndex = 0;
      this.currentItem = this.queue[0];
      this.state = 'ready';
      
      // Start prefetch geocoding for upcoming items
      this._startGeocoding();
      
      this._log(`Random mode initialized with ${items.length} items`);
      return true;
    } else {
      throw new Error('No media items found');
    }
  }

  async _initializeSequential() {
    const items = await this._queryMediaIndex(this.queryLimit, { order: 'date_taken' });
    if (items && items.length > 0) {
      this.queue = items;
      this.currentIndex = 0;
      this.currentItem = this.queue[0];
      this.state = 'ready';
      
      this._log(`Sequential mode initialized with ${items.length} items`);
      return true;
    } else {
      throw new Error('No media items found');
    }
  }

  async _initializeFolderSequential() {
    // Get list of folders first
    const folders = await this._getFolders();
    if (folders && folders.length > 0) {
      this.currentFolder = folders[0];
      const folderContents = await this._loadFolderContents(this.currentFolder);
      
      if (folderContents && folderContents.length > 0) {
        this.queue = folderContents;
        this.currentIndex = 0;
        this.currentItem = this.queue[0];
        this.state = 'ready';
        
        this._log(`Folder sequential mode initialized with ${folderContents.length} items from folder: ${this.currentFolder}`);
        return true;
      }
    }
    
    throw new Error('No folders or media items found');
  }

  /**
   * Query media_index integration for items
   * PRESERVED: Exact logic from v4.1.0 _queryMediaIndex method
   */
  async _queryMediaIndex(count = 10, options = {}) {
    try {
      this._log('🔍 Querying media_index for', count, 'items...');
      
      // Extract folder filter from subfolder configuration
      let folderFilter = this.subfolder;
      
      // Build WebSocket call
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_random_items',
        service_data: {
          count: count,
          folder: folderFilter,
          file_type: this.config.media_type === 'all' ? undefined : this.config.media_type,
          ...options // Additional options like order
        },
        return_response: true
      };
      
      // Add target if entity specified
      if (this.entityId) {
        wsCall.target = { entity_id: this.entityId };
        this._log('🎯 Targeting entity:', this.entityId);
      }
      
      // Debug logging
      if (this.config.debug?.providers || this.config.debug?.all) {
        this._log('📤 WebSocket call:', JSON.stringify(wsCall, null, 2));
      }
      
      const wsResponse = await this.hass.callWS(wsCall);
      
      if (this.config.debug?.providers || this.config.debug?.all) {
        this._log('📥 WebSocket response:', JSON.stringify(wsResponse, null, 2));
      }

      // Handle different response formats
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;

      if (response && response.items && Array.isArray(response.items)) {
        this._log('✅ Received', response.items.length, 'items from media_index');
        
        // Filter out excluded files and unsupported formats
        const filteredItems = response.items.filter(item => {
          if (this.excludedFiles.has(item.path)) {
            this._log(`⏭️ Filtering out excluded file: ${item.path}`);
            return false;
          }
          
          if (!this._isMediaFile(item.path || '')) {
            this._log(`⏭️ Filtering out unsupported format: ${item.path}`);
            return false;
          }
          
          return true;
        });
        
        // Transform items to MediaItem format
        const mediaItems = await Promise.all(filteredItems.map(async (item) => {
          const resolvedUrl = await this._resolveMediaPath(item.path);
          
          return new MediaItem({
            path: resolvedUrl,
            filename: item.filename || item.path.split('/').pop(),
            type: MediaUtils.detectFileType(item.path),
            sourceFolder: item.folder || item.path.substring(0, item.path.lastIndexOf('/')),
            lastModified: item.date_taken || item.created_time,
            metadata: {
              // EXIF metadata
              dateTaken: item.date_taken,
              createdTime: item.created_time,
              locationCity: item.location_city,
              locationState: item.location_state,
              locationCountry: item.location_country,
              locationName: item.location_name,
              rating: item.rating,
              isFavorited: item.is_favorited || false,
              // Geocoding data
              hasCoordinates: item.has_coordinates || false,
              isGeocoded: item.is_geocoded || false,
              latitude: item.latitude,
              longitude: item.longitude,
              // Original database path for management operations
              dbPath: item.path
            }
          });
        }));
        
        this._log(`📊 Processed ${mediaItems.length} media items`);
        return mediaItems;
        
      } else {
        this._log('⚠️ Invalid response from media_index:', response);
        return null;
      }
      
    } catch (error) {
      this._error('Error querying media_index:', error);
      return null;
    }
  }

  /**
   * Get list of folders for folder_sequential mode
   */
  async _getFolders() {
    try {
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_folders',
        service_data: {
          folder: this.subfolder
        },
        return_response: true
      };

      if (this.entityId) {
        wsCall.target = { entity_id: this.entityId };
      }

      const wsResponse = await this.hass.callWS(wsCall);
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;

      if (response && response.folders && Array.isArray(response.folders)) {
        return response.folders;
      }

      return null;
    } catch (error) {
      this._error('Error getting folders:', error);
      return null;
    }
  }

  /**
   * Load contents of specific folder
   */
  async _loadFolderContents(folder) {
    return await this._queryMediaIndex(this.queryLimit, {
      folder: folder,
      order: 'filename'
    });
  }

  async getNext() {
    if (this.state !== 'ready' || this.queue.length === 0) {
      return null;
    }

    // Handle different modes
    switch (this.mode) {
      case 'random':
        return await this._getNextRandom();
      case 'sequential':
        return await this._getNextSequential();
      case 'folder_sequential':
        return await this._getNextFolderSequential();
      default:
        return await this._getNextRandom();
    }
  }

  async _getNextRandom() {
    // Move to next item in random queue
    this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    this.currentItem = this.queue[this.currentIndex];
    
    // Refill queue if running low
    if (this.currentIndex >= this.queue.length - this.lowThreshold) {
      this._refillQueue();
    }
    
    // Start geocoding for upcoming items
    this._scheduleGeocoding();
    
    return this.currentItem;
  }

  async _getNextSequential() {
    // Move to next item in sequential order
    this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    this.currentItem = this.queue[this.currentIndex];
    
    // TODO: In sequential mode, we might want to load more items when reaching end
    // For now, just cycle through existing items
    
    return this.currentItem;
  }

  async _getNextFolderSequential() {
    // Move to next item in current folder
    this.currentIndex++;
    
    if (this.currentIndex >= this.queue.length) {
      // Move to next folder
      this.folderIndex++;
      const folders = await this._getFolders();
      
      if (folders && this.folderIndex < folders.length) {
        // Load next folder
        this.currentFolder = folders[this.folderIndex];
        this.queue = await this._loadFolderContents(this.currentFolder);
        this.currentIndex = 0;
        
        this._log(`Moved to next folder: ${this.currentFolder} (${this.queue.length} items)`);
      } else {
        // Start over from first folder
        this.folderIndex = 0;
        this.currentFolder = folders[0];
        this.queue = await this._loadFolderContents(this.currentFolder);
        this.currentIndex = 0;
        
        this._log(`Restarted from first folder: ${this.currentFolder}`);
      }
    }
    
    this.currentItem = this.queue[this.currentIndex];
    return this.currentItem;
  }

  async getPrevious() {
    // Try to get previous item from history first
    // This allows proper back navigation across mode transitions
    if (this.history.canGoBack()) {
      const prevItem = this.history.previous();
      this.currentItem = prevItem;
      return prevItem;
    }
    
    // Fallback to queue previous
    if (this.queue.length === 0) {
      return null;
    }
    
    this.currentIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.queue.length - 1;
    this.currentItem = this.queue[this.currentIndex];
    
    return this.currentItem;
  }

  async getCurrentItem() {
    return this.currentItem;
  }

  /**
   * Queue refill for random mode
   */
  async _refillQueue() {
    try {
      this._log('🔄 Refilling queue...');
      
      const newItems = await this._queryMediaIndex(this.refillSize);
      if (newItems && newItems.length > 0) {
        // Add new items to end of queue
        this.queue.push(...newItems);
        this._log(`✅ Added ${newItems.length} new items to queue (total: ${this.queue.length})`);
        
        // Clear exclusion list when refreshing - backend handles deleted files
        this.excludedFiles.clear();
      }
    } catch (error) {
      this._error('Failed to refill queue:', error);
    }
  }

  /**
   * Start geocoding for items that have coordinates but no location names
   */
  _startGeocoding() {
    // Geocode current item if needed
    this._geocodeItem(this.currentItem);
    
    // Schedule geocoding for upcoming items
    this._scheduleGeocoding();
  }

  /**
   * Schedule geocoding for upcoming items in queue
   */
  _scheduleGeocoding() {
    const prefetchIndex = (this.currentIndex + this.prefetchOffset) % this.queue.length;
    const prefetchItem = this.queue[prefetchIndex];
    
    if (prefetchItem) {
      this._geocodeItem(prefetchItem);
    }
  }

  /**
   * Geocode individual item if needed
   * PRESERVED: Logic from v4.1.0 _prefetchGeocoding method
   */
  async _geocodeItem(item) {
    if (!item?.metadata?.hasCoordinates || item.metadata.isGeocoded || item.metadata._geocodingInProgress) {
      return;
    }

    try {
      this._log(`🗺️ Geocoding item: ${item.filename} (lat: ${item.metadata.latitude}, lon: ${item.metadata.longitude})`);
      
      // Mark as in-progress
      item.metadata._geocodingInProgress = true;

      const wsResponse = await this.hass.callWS({
        type: 'call_service',
        domain: 'media_index',
        service: 'geocode_file',
        service_data: {
          latitude: item.metadata.latitude,
          longitude: item.metadata.longitude
        },
        return_response: true
      });

      const response = wsResponse?.response || wsResponse;

      if (response && response.location_city && response.location_country) {
        // Update item metadata
        item.metadata.locationCity = response.location_city;
        item.metadata.locationCountry = response.location_country;
        item.metadata.locationName = response.location_name;
        item.metadata.isGeocoded = true;
        
        this._log(`✅ Geocoded to: ${response.location_city}, ${response.location_country}`);
        
        // If this is the current item, update display
        if (item === this.currentItem) {
          // Trigger update in parent card
          this.onCurrentItemUpdated?.(item);
        }
      }
    } catch (error) {
      this._error('Geocoding failed:', error);
    } finally {
      delete item.metadata._geocodingInProgress;
    }
  }

  /**
   * Media management operations (favorites, edit, delete)
   */
  async markAsFavorite(item) {
    if (!item?.metadata?.dbPath) return false;

    try {
      await this.hass.callService('media_index', 'mark_favorite', {
        file_path: item.metadata.dbPath
      });
      
      item.metadata.isFavorited = true;
      this._log(`✅ Marked as favorite: ${item.filename}`);
      return true;
    } catch (error) {
      this._error('Failed to mark as favorite:', error);
      return false;
    }
  }

  async markForEdit(item) {
    if (!item?.metadata?.dbPath) return false;

    try {
      await this.hass.callService('media_index', 'move_to_edit', {
        file_path: item.metadata.dbPath
      });
      
      // Add to exclusion list and remove from queue
      this.excludedFiles.add(item.metadata.dbPath);
      this._removeFromQueue(item);
      
      this._log(`✅ Marked for edit: ${item.filename}`);
      return true;
    } catch (error) {
      this._error('Failed to mark for edit:', error);
      return false;
    }
  }

  async deleteItem(item) {
    if (!item?.metadata?.dbPath) return false;

    try {
      await this.hass.callService('media_index', 'move_to_junk', {
        file_path: item.metadata.dbPath
      });
      
      // Add to exclusion list and remove from queue
      this.excludedFiles.add(item.metadata.dbPath);
      this._removeFromQueue(item);
      
      this._log(`✅ Moved to junk: ${item.filename}`);
      return true;
    } catch (error) {
      this._error('Failed to delete item:', error);
      return false;
    }
  }

  /**
   * Remove item from queue and adjust indices
   */
  _removeFromQueue(item) {
    const index = this.queue.indexOf(item);
    if (index !== -1) {
      this.queue.splice(index, 1);
      
      // Adjust current index if needed
      if (this.currentIndex > index) {
        this.currentIndex--;
      } else if (this.currentIndex >= this.queue.length) {
        this.currentIndex = 0;
      }
      
      // Update current item
      if (this.queue.length > 0) {
        this.currentItem = this.queue[this.currentIndex];
      } else {
        this.currentItem = null;
      }
    }
  }

  /**
   * Utility methods preserved from v4.1.0
   */
  async _resolveMediaPath(path) {
    // Use existing resolveMediaPath logic
    if (path.startsWith('media-source://')) {
      return path;
    }
    
    // Convert filesystem path to media-source URL
    if (path.startsWith('/media/')) {
      return `media-source://media_source${path}`;
    }
    
    return path;
  }

  _isMediaFile(path) {
    if (!path) return false;
    
    const extension = path.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
    
    return imageExts.includes(extension) || videoExts.includes(extension);
  }

  // Provider interface methods
  getQueueSize() {
    return this.queue.length;
  }

  getHistorySize() {
    return this.history.items.length;
  }

  canAdvance() {
    return this.queue.length > 1;
  }

  canGoBack() {
    return this.history.canGoBack();
  }

  pause() {
    // Stop any ongoing geocoding operations
    this._pauseGeocoding = true;
  }

  resume() {
    this._pauseGeocoding = false;
    // Resume geocoding
    this._scheduleGeocoding();
  }

  async disconnect() {
    this.queue = [];
    this.currentItem = null;
    this.excludedFiles.clear();
    this.history.clear();
  }

  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      mode: this.mode,
      entityId: this.entityId,
      queueSize: this.queue.length,
      currentIndex: this.currentIndex,
      excludedFiles: this.excludedFiles.size,
      subfolder: this.subfolder,
      folderIndex: this.folderIndex,
      currentFolder: this.currentFolder
    };
  }
}

// ============================================================================
// SUBFOLDER PROVIDER
// ============================================================================

/**
 * SubfolderProvider
 * REUSE STRATEGY: Wrap existing SubfolderQueue logic with provider interface
 * PRESERVE: All hierarchical scanning algorithms exactly as-is
 */
class SubfolderProvider extends MediaProvider {
  constructor(config, hass, cardId) {
    super(config, hass, cardId);
    
    // Configuration
    this.basePath = config.subfolder_queue?.path || config.media_path; // Backward compatibility
    this.scanDepth = config.subfolder_queue?.scan_depth;
    this.priorityFolders = config.subfolder_queue?.priority_folders || [];
    this.estimatedTotalPhotos = config.subfolder_queue?.estimated_total_photos;
    this.equalProbabilityMode = config.subfolder_queue?.equal_probability_mode !== false;
    
    // Queue system (preserve existing SubfolderQueue structure)
    this.queue = [];
    this.shownItems = new Set();
    this.discoveredFolders = [];
    this.folderWeights = new Map();
    this.isScanning = false;
    this.scanProgress = { current: 0, total: 0 };
    this.discoveryInProgress = false;
    this._scanCancelled = false;
    
    // Hierarchical scan optimization
    this.queueShuffleCounter = 0;
    this.SHUFFLE_MIN_BATCH = 10;
    this.SHUFFLE_MAX_BATCH = 1000;
    this.SHUFFLE_PERCENTAGE = 0.10;
    
    // Navigation history (separate from main history for subfolder-specific behavior)
    this.subfolderHistory = [];
    this.historyIndex = -1;
    
    // Probability calculations cache
    this.cachedTotalCount = null;
    this.cachedCountSource = null;
    this.lastDiscoveredCount = 0;
    this.totalCountLocked = false;
    
    // Store in global map for reconnection (preserve existing behavior)
    this.globalMapKey = this.basePath;
    
    this._log('🚀 SubfolderProvider initialized:', {
      basePath: this.basePath,
      scanDepth: this.scanDepth,
      priorityFolders: this.priorityFolders.length,
      estimatedTotal: this.estimatedTotalPhotos
    });
  }

  async initialize() {
    this.state = 'loading';
    this._log('Initializing SubfolderProvider for path:', this.basePath);

    try {
      if (!this.basePath) {
        throw new Error('subfolder_queue.path is required');
      }

      // Check for existing queue in global map (reconnection support)
      const existingQueue = this._checkForExistingQueue();
      if (existingQueue) {
        this._log('Found existing queue with', existingQueue.queue.length, 'items - reconnecting');
        this._restoreFromExistingQueue(existingQueue);
        this.state = 'ready';
        return true;
      }

      // Start fresh scanning
      const success = await this._startHierarchicalScan();
      
      if (success && this.queue.length > 0) {
        this.currentItem = this.queue[0];
        this.state = 'ready';
        
        // Store in global map for future reconnection
        this._storeInGlobalMap();
        
        this._log(`SubfolderProvider initialized with ${this.queue.length} items`);
        return true;
      } else {
        throw new Error('No media items found in subfolders');
      }

    } catch (error) {
      this.state = 'error';
      this._error('Failed to initialize SubfolderProvider:', error);
      return false;
    } finally {
      this.isScanning = false;
      this.discoveryInProgress = false;
    }
  }

  /**
   * Check for existing queue in global reconnection map
   * PRESERVED: Exact logic from v4.1.0 window.mediaCardSubfolderQueues
   */
  _checkForExistingQueue() {
    if (!window.mediaCardSubfolderQueues) {
      window.mediaCardSubfolderQueues = new Map();
      return null;
    }
    
    return window.mediaCardSubfolderQueues.get(this.globalMapKey);
  }

  /**
   * Restore state from existing queue (reconnection)
   */
  _restoreFromExistingQueue(existingQueue) {
    // Copy all relevant state from existing queue
    this.queue = existingQueue.queue || [];
    this.shownItems = existingQueue.shownItems || new Set();
    this.discoveredFolders = existingQueue.discoveredFolders || [];
    this.folderWeights = existingQueue.folderWeights || new Map();
    this.subfolderHistory = existingQueue.history || [];
    this.historyIndex = existingQueue.historyIndex || -1;
    this.cachedTotalCount = existingQueue.cachedTotalCount;
    this.cachedCountSource = existingQueue.cachedCountSource;
    
    // Update current item if we have queue items
    if (this.queue.length > 0) {
      this.currentItem = this._convertQueueItemToMediaItem(this.queue[0]);
    }
  }

  /**
   * Store current queue in global map for reconnection
   */
  _storeInGlobalMap() {
    if (!window.mediaCardSubfolderQueues) {
      window.mediaCardSubfolderQueues = new Map();
    }
    
    window.mediaCardSubfolderQueues.set(this.globalMapKey, {
      queue: this.queue,
      shownItems: this.shownItems,
      discoveredFolders: this.discoveredFolders,
      folderWeights: this.folderWeights,
      history: this.subfolderHistory,
      historyIndex: this.historyIndex,
      cachedTotalCount: this.cachedTotalCount,
      cachedCountSource: this.cachedCountSource,
      timestamp: Date.now()
    });
  }

  /**
   * Start hierarchical scanning
   * PRESERVED: Core hierarchical scan logic from SubfolderQueue
   */
  async _startHierarchicalScan() {
    this._log('🏗️ Starting hierarchical scan from:', this.basePath);
    
    this.isScanning = true;
    this.discoveryInProgress = true;
    this._scanCancelled = false;
    
    try {
      const scanResult = await this._hierarchicalScanAndPopulate(this.basePath, 0);
      
      if (scanResult && !scanResult.error) {
        this._log('✅ Hierarchical scan completed:', {
          filesProcessed: scanResult.filesProcessed,
          filesAdded: scanResult.filesAdded,
          foldersProcessed: scanResult.foldersProcessed,
          queueSize: this.queue.length
        });
        
        // Final shuffle for randomization
        if (this.queue.length > 0) {
          this._shuffleQueue();
          this._log('🔀 Final shuffle completed - queue size:', this.queue.length);
        }
        
        return true;
      } else {
        this._log('⚠️ Hierarchical scan failed:', scanResult?.error || 'unknown error');
        return false;
      }
      
    } catch (error) {
      this._log('❌ Hierarchical scan error:', error.message);
      return false;
    }
  }

  /**
   * Hierarchical scan and populate - single-pass folder scanning
   * PRESERVED: Exact algorithm from SubfolderQueue.hierarchicalScanAndPopulate
   */
  async _hierarchicalScanAndPopulate(basePath, currentDepth = 0, maxDepth = null) {
    // Use configured scan depth if maxDepth not specified
    const effectiveMaxDepth = maxDepth !== null ? maxDepth : this.scanDepth;
    
    this._log('🏗️ Hierarchical scan:', basePath, 'depth:', currentDepth, 'max:', effectiveMaxDepth || 'unlimited');
    
    // Check depth limit
    if (effectiveMaxDepth !== null && effectiveMaxDepth > 0 && currentDepth >= effectiveMaxDepth) {
      this._log('📁 Max depth reached:', currentDepth);
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    // Check if scanning cancelled
    if (this._scanCancelled) {
      this._log('🛑 Scanning cancelled');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    try {
      // Get folder contents with timeout
      const folderContents = await Promise.race([
        this.hass.callWS({
          type: "media_source/browse_media",
          media_content_id: basePath
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('API timeout')), 180000) // 3 minutes
        )
      ]);

      if (!folderContents?.children) {
        this._log('📁 No children found at depth:', currentDepth);
        return { filesProcessed: 0, foldersProcessed: 0 };
      }

      const folderName = basePath.split('/').pop() || 'root';
      
      // Separate files and subfolders
      const allFiles = folderContents.children.filter(child => 
        child.media_class === 'image' || child.media_class === 'video'
      );
      const files = allFiles.filter(file => this._isMediaFile(file.media_content_id || file.title || ''));
      const subfolders = folderContents.children.filter(child => child.can_expand);

      this._log('📁 Processing folder:', folderName, 'files:', files.length, 'subfolders:', subfolders.length);

      // Track folder in discoveredFolders
      if (files.length > 0 || subfolders.length > 0) {
        const folderInfo = {
          path: basePath,
          title: folderName,
          fileCount: files.length,
          files: files,
          depth: currentDepth
        };
        
        const existingIndex = this.discoveredFolders.findIndex(f => f.path === basePath);
        if (existingIndex === -1) {
          this.discoveredFolders.push(folderInfo);
        } else {
          this.discoveredFolders[existingIndex] = folderInfo;
        }
      }

      // Process files with weighted probability
      let filesAdded = 0;
      const basePerFileProbability = this._calculatePerFileProbability();
      const weightMultiplier = this._getPathWeightMultiplier(basePath);
      const perFileProbability = Math.min(basePerFileProbability * weightMultiplier, 1.0);
      
      if (weightMultiplier > 1.0) {
        this._log('⭐ Priority folder:', folderName, 'weight:', weightMultiplier + 'x');
      }
      
      // Filter out already shown/queued items
      const existingQueueIds = new Set(this.queue.map(item => item.media_content_id));
      const availableFiles = files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !existingQueueIds.has(file.media_content_id)
      );
      
      // Sample files based on probability
      for (const file of availableFiles) {
        if (Math.random() < perFileProbability) {
          await this._addFileToQueue(file, folderName);
          filesAdded++;
        }
      }
      
      this._log('📊 Sampled', filesAdded, 'files from', availableFiles.length, 'available in', folderName);

      // Process subfolders recursively
      let subfoldersProcessed = 0;
      if (subfolders.length > 0 && 
          (effectiveMaxDepth === null || effectiveMaxDepth === 0 || currentDepth < effectiveMaxDepth - 1)) {
        
        // Randomize subfolder order for better diversity
        const shuffledSubfolders = [...subfolders].sort(() => Math.random() - 0.5);
        
        for (const subfolder of shuffledSubfolders) {
          if (this._scanCancelled) break;
          
          try {
            const subResult = await this._hierarchicalScanAndPopulate(
              subfolder.media_content_id, 
              currentDepth + 1, 
              effectiveMaxDepth
            );
            subfoldersProcessed++;
          } catch (error) {
            this._log('⚠️ Subfolder scan error:', subfolder.title, error.message);
          }
        }
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

  /**
   * Add file to queue with batched shuffling
   * PRESERVED: Logic from SubfolderQueue.addFileToQueueWithBatching
   */
  async _addFileToQueue(file, folderName) {
    // Add file to queue
    this.queue.push(file);
    
    // Add to history
    this.subfolderHistory.push({
      file: file,
      timestamp: new Date().toISOString(),
      folderName: folderName,
      source: 'hierarchical_scan'
    });
    
    // Increment shuffle counter
    this.queueShuffleCounter++;
    
    // Calculate shuffle threshold (10% of queue size)
    const shuffleThreshold = Math.min(
      this.SHUFFLE_MAX_BATCH,
      Math.max(this.SHUFFLE_MIN_BATCH, Math.floor(this.queue.length * this.SHUFFLE_PERCENTAGE))
    );
    
    // Shuffle when threshold reached
    if (this.queueShuffleCounter >= shuffleThreshold) {
      this._shuffleQueue();
      this.queueShuffleCounter = 0;
    }
  }

  /**
   * Calculate per-file probability for sampling
   * PRESERVED: Probability calculation logic from SubfolderQueue
   */
  _calculatePerFileProbability() {
    const targetQueueSize = 100; // Target queue size for good performance
    const totalEstimate = this._getTotalMediaCount();
    
    if (totalEstimate <= targetQueueSize) {
      return 1.0; // Take all files if total is small
    }
    
    // Calculate probability to reach target queue size
    return Math.min(targetQueueSize / totalEstimate, 1.0);
  }

  /**
   * Get total media count estimate
   * PRESERVED: Total count logic from SubfolderQueue
   */
  _getTotalMediaCount() {
    // Use user estimate if provided
    if (this.estimatedTotalPhotos) {
      return this.estimatedTotalPhotos;
    }
    
    // Use cached total if locked
    if (this.totalCountLocked && this.cachedTotalCount) {
      return this.cachedTotalCount;
    }
    
    // Conservative adaptive estimate
    const currentDiscoveredCount = this.discoveredFolders.reduce((sum, folder) => sum + folder.fileCount, 0);
    const multiplier = this.discoveryInProgress ? 3.0 : 1.2;
    
    this.cachedTotalCount = Math.max(currentDiscoveredCount, Math.round(currentDiscoveredCount * multiplier));
    this.cachedCountSource = 'adaptive';
    
    return this.cachedTotalCount;
  }

  /**
   * Get path weight multiplier for priority folders
   * PRESERVED: Priority folder logic from SubfolderQueue
   */
  _getPathWeightMultiplier(folderPath) {
    let multiplier = 1.0;
    
    for (const priority of this.priorityFolders) {
      const pattern = priority.pattern || priority.path;
      if (folderPath.includes(pattern)) {
        multiplier = Math.max(multiplier, priority.weight || 3.0);
      }
    }
    
    return multiplier;
  }

  /**
   * Shuffle queue for randomization
   * PRESERVED: Shuffle logic from SubfolderQueue
   */
  _shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  /**
   * Convert subfolder queue item to MediaItem format
   */
  _convertQueueItemToMediaItem(queueItem) {
    return new MediaItem({
      path: queueItem.media_content_id,
      filename: queueItem.title,
      type: MediaUtils.detectFileType(queueItem.media_content_id),
      sourceFolder: this._extractFolderFromPath(queueItem.media_content_id)
    });
  }

  _extractFolderFromPath(path) {
    const segments = path.split('/');
    return segments.slice(0, -1).join('/');
  }

  // Provider interface implementation
  async getNext() {
    if (this.state !== 'ready' || this.queue.length === 0) {
      return null;
    }

    // Move to next item in queue
    const nextIndex = (this.queue.findIndex(item => 
      item.media_content_id === this.currentItem?.path) + 1) % this.queue.length;
    
    const nextQueueItem = this.queue[nextIndex];
    this.currentItem = this._convertQueueItemToMediaItem(nextQueueItem);
    
    // Add to shown items
    this.shownItems.add(nextQueueItem.media_content_id);
    
    // Check if queue needs refilling
    if (this.shownItems.size >= this.queue.length - 10) {
      this._scheduleQueueRefill();
    }
    
    return this.currentItem;
  }

  async getPrevious() {
    // Try history first for proper back navigation
    if (this.subfolderHistory.length > 0 && this.historyIndex > 0) {
      this.historyIndex--;
      const historyItem = this.subfolderHistory[this.historyIndex];
      this.currentItem = this._convertQueueItemToMediaItem(historyItem.file);
      return this.currentItem;
    }
    
    // Fallback to previous in queue
    if (this.queue.length === 0) {
      return null;
    }
    
    const currentIndex = this.queue.findIndex(item => 
      item.media_content_id === this.currentItem?.path);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : this.queue.length - 1;
    
    const prevQueueItem = this.queue[prevIndex];
    this.currentItem = this._convertQueueItemToMediaItem(prevQueueItem);
    
    return this.currentItem;
  }

  async getCurrentItem() {
    return this.currentItem;
  }

  /**
   * Schedule queue refill when running low
   */
  _scheduleQueueRefill() {
    if (this.isScanning || this._refillScheduled) {
      return; // Already scanning or refill scheduled
    }
    
    this._refillScheduled = true;
    this._log('🔄 Scheduling queue refill...');
    
    setTimeout(async () => {
      try {
        await this._refillQueue();
      } catch (error) {
        this._log('❌ Queue refill failed:', error.message);
      } finally {
        this._refillScheduled = false;
      }
    }, 1000);
  }

  /**
   * Refill queue by rescanning with different probability
   */
  async _refillQueue() {
    this._log('🔄 Refilling SubfolderQueue...');
    
    // Clear shown items for fresh sampling
    this.shownItems.clear();
    
    // Increase probability for refill to get more items
    const originalTotal = this.cachedTotalCount;
    this.cachedTotalCount = Math.round(originalTotal * 0.5); // Boost probability
    
    try {
      // Rescan existing folders with higher probability
      for (const folder of this.discoveredFolders) {
        if (folder.files && folder.files.length > 0) {
          const baseProb = this._calculatePerFileProbability();
          const weightMult = this._getPathWeightMultiplier(folder.path);
          const probability = Math.min(baseProb * weightMult * 2, 1.0); // 2x boost
          
          for (const file of folder.files) {
            if (!this.queue.find(q => q.media_content_id === file.media_content_id)) {
              if (Math.random() < probability) {
                await this._addFileToQueue(file, folder.title);
              }
            }
          }
        }
      }
      
      this._log(`✅ Queue refilled - new size: ${this.queue.length}`);
      
    } finally {
      // Restore original total count
      this.cachedTotalCount = originalTotal;
    }
  }

  /**
   * Media file type detection
   */
  _isMediaFile(path) {
    if (!path) return false;
    
    const extension = path.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
    
    return imageExts.includes(extension) || videoExts.includes(extension);
  }

  // Provider interface methods
  getQueueSize() {
    return this.queue.length;
  }

  getHistorySize() {
    return this.subfolderHistory.length;
  }

  canAdvance() {
    return this.queue.length > 1;
  }

  canGoBack() {
    return this.subfolderHistory.length > 0 && this.historyIndex > 0;
  }

  pause() {
    this.isScanning = false;
    this._scanCancelled = true;
  }

  resume() {
    this._scanCancelled = false;
  }

  async disconnect() {
    this.pause();
    
    // Update global map with current state
    this._storeInGlobalMap();
    
    this._log('SubfolderProvider disconnected - state preserved in global map');
  }

  async reconnect() {
    // Check for existing queue first
    const existingQueue = this._checkForExistingQueue();
    if (existingQueue) {
      this._restoreFromExistingQueue(existingQueue);
      this.state = 'ready';
      return true;
    }
    
    // Otherwise reinitialize
    return await this.initialize();
  }

  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      basePath: this.basePath,
      scanDepth: this.scanDepth,
      queueSize: this.queue.length,
      shownItems: this.shownItems.size,
      discoveredFolders: this.discoveredFolders.length,
      isScanning: this.isScanning,
      discoveryInProgress: this.discoveryInProgress,
      cachedTotalCount: this.cachedTotalCount,
      cachedCountSource: this.cachedCountSource
    };
  }
}

// ============================================================================
// SIMPLE FOLDER PROVIDER
// ============================================================================

/**
 * SimpleFolderProvider
 * Basic folder scanning without hierarchical algorithms
 */
class SimpleFolderProvider extends MediaProvider {
  constructor(config, hass, cardId) {
    super(config, hass, cardId);
    
    this.basePath = config.simple_folder?.path || config.media_path; // Backward compatibility
    this.mode = config.simple_folder?.mode || 'random';
    this.traverseSubfolders = config.simple_folder?.traverse_subfolders !== false;
    
    this.queue = [];
    this.currentIndex = 0;
  }

  async initialize() {
    this.state = 'loading';
    this._log('Initializing SimpleFolderProvider:', this.basePath, 'mode:', this.mode);

    try {
      if (!this.basePath) {
        throw new Error('simple_folder.path is required');
      }

      const items = await this._scanFolder(this.basePath);
      
      if (items && items.length > 0) {
        this.queue = items;
        
        // Apply mode (random or sequential)
        if (this.mode === 'random') {
          this._shuffleQueue();
        } else {
          // Sort by filename for sequential
          this.queue.sort((a, b) => a.filename.localeCompare(b.filename));
        }
        
        this.currentIndex = 0;
        this.currentItem = this.queue[0];
        this.state = 'ready';
        
        this._log(`SimpleFolderProvider initialized with ${items.length} items (${this.mode} mode)`);
        return true;
      } else {
        throw new Error('No media files found in folder');
      }

    } catch (error) {
      this.state = 'error';
      this._error('Failed to initialize SimpleFolderProvider:', error);
      return false;
    }
  }

  /**
   * Simple folder scanning (non-recursive for now)
   */
  async _scanFolder(folderPath) {
    try {
      const folderContents = await this.hass.callWS({
        type: "media_source/browse_media",
        media_content_id: folderPath
      });

      if (!folderContents?.children) {
        return [];
      }

      // Filter media files
      const mediaFiles = folderContents.children.filter(child => {
        if (child.media_class === 'image' || child.media_class === 'video') {
          return this._isMediaFile(child.media_content_id || child.title || '');
        }
        return false;
      });

      // Convert to MediaItem format
      const mediaItems = mediaFiles.map(file => new MediaItem({
        path: file.media_content_id,
        filename: file.title,
        type: MediaUtils.detectFileType(file.media_content_id),
        sourceFolder: folderPath
      }));

      this._log(`Found ${mediaItems.length} media files in folder`);
      return mediaItems;

      // TODO: Add subfolder traversal if this.traverseSubfolders is true
      
    } catch (error) {
      this._error('Error scanning folder:', error);
      return [];
    }
  }

  _shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  _isMediaFile(path) {
    if (!path) return false;
    
    const extension = path.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
    
    return imageExts.includes(extension) || videoExts.includes(extension);
  }

  // Provider interface implementation
  async getNext() {
    if (this.state !== 'ready' || this.queue.length === 0) {
      return null;
    }

    this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    this.currentItem = this.queue[this.currentIndex];
    
    return this.currentItem;
  }

  async getPrevious() {
    if (this.state !== 'ready' || this.queue.length === 0) {
      return null;
    }

    this.currentIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.queue.length - 1;
    this.currentItem = this.queue[this.currentIndex];
    
    return this.currentItem;
  }

  async getCurrentItem() {
    return this.currentItem;
  }

  getQueueSize() {
    return this.queue.length;
  }

  canAdvance() {
    return this.queue.length > 1;
  }

  canGoBack() {
    return this.queue.length > 1;
  }

  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      basePath: this.basePath,
      mode: this.mode,
      traverseSubfolders: this.traverseSubfolders,
      currentIndex: this.currentIndex
    };
  }
}

// ============================================================================
// MEDIA CARD v5 MAIN CLASS
// ============================================================================

console.log('🔄 Step 3: Starting MediaCardV5 class definition');

/**
 * MediaCardV5
 * Unified architecture using provider pattern
 */
class MediaCardV5 extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _currentItem: { state: true },
    _isLoading: { state: true },
    _errorMessage: { state: true },
    _isPaused: { state: true }
  };

  constructor() {
    super();
    
    // Generate unique card ID
    this._cardId = MediaUtils.generateId();
    
    // Core state
    this._currentItem = null;
    this._isLoading = false;
    this._errorMessage = null;
    this._isPaused = false;
    
    // Provider system
    this._provider = null;
    this._history = new NavigationHistory(100);
    this._state = 'uninitialized';
    
    // Timers and intervals
    this._autoAdvanceTimer = null;
    this._refreshTimer = null;
    
    // Configuration
    this.config = null;
    this._defaultConfig = this._getDefaultConfig();
    
    this._log('MediaCard v5 initialized with ID:', this._cardId);
  }

  /**
   * Home Assistant Configuration Setter
   */
  setConfig(config) {
    this._log('setConfig called with:', config);
    
    // Validate required configuration
    if (!config) {
      throw new Error('Configuration is required');
    }

    // Merge with defaults and migrate legacy config
    this.config = this._processConfiguration(config);
    
    // Reset state when config changes
    this._resetCardState();
    
    this._log('Configuration processed:', this.config);
  }

  /**
   * Home Assistant State Setter
   */
  set hass(hass) {
    const hadPreviousHass = !!this._hass;
    this._hass = hass;
    
    // Initialize provider when both hass and config are available
    if (hass && this.config && !hadPreviousHass) {
      this._log('First hass available - initializing provider');
      setTimeout(() => this._initializeProvider(), 100);
    }
    
    this.requestUpdate();
  }

  get hass() {
    return this._hass;
  }

  /**
   * Process and validate configuration
   * REUSE STRATEGY: Extend existing validation with v5 structure
   */
  _processConfiguration(config) {
    // Start with defaults
    let processedConfig = { ...this._defaultConfig };
    
    // Handle legacy configuration migration
    if (this._isLegacyConfig(config)) {
      processedConfig = this._migrateLegacyConfig(config, processedConfig);
    } else {
      // Modern v5 configuration
      processedConfig = { ...processedConfig, ...config };
    }
    
    // Validate media source type is specified
    if (!processedConfig.media_source_type) {
      throw new Error('media_source_type is required (single_media, media_index, subfolder_queue, simple_folder)');
    }
    
    // Validate media source configuration exists
    const sourceType = processedConfig.media_source_type;
    if (!processedConfig[sourceType]) {
      throw new Error(`Configuration for ${sourceType} is missing`);
    }
    
    return processedConfig;
  }

  /**
   * Check if configuration uses legacy v4 format
   */
  _isLegacyConfig(config) {
    return !config.media_source_type && (
      config.media_path || 
      config.is_folder || 
      config.subfolder_queue?.enabled || 
      config.media_index?.enabled
    );
  }

  /**
   * Migrate legacy v4 configuration to v5 format
   * REUSE STRATEGY: Preserve all existing functionality during migration
   */
  _migrateLegacyConfig(legacyConfig, defaultConfig) {
    this._log('Migrating legacy configuration to v5 format');
    
    let migratedConfig = { ...defaultConfig };
    
    // Determine media source type based on legacy flags
    let mediaSourceType = 'single_media'; // Default
    
    if (legacyConfig.subfolder_queue?.enabled) {
      mediaSourceType = 'subfolder_queue';
      migratedConfig.subfolder_queue = {
        path: legacyConfig.media_path,
        scan_depth: legacyConfig.subfolder_queue.scan_depth,
        priority_folders: legacyConfig.subfolder_queue.priority_folder_patterns,
        estimated_total_photos: legacyConfig.subfolder_queue.estimated_total_photos,
        equal_probability_mode: legacyConfig.subfolder_queue.equal_probability_mode
      };
    } else if (legacyConfig.media_index?.enabled) {
      mediaSourceType = 'media_index';
      migratedConfig.media_index = {
        entity_id: legacyConfig.media_index.entity_id,
        subfolder: legacyConfig.media_index.subfolder,
        query_limit: legacyConfig.media_index.query_limit,
        mode: legacyConfig.folder_mode || 'random',
        traverse_subfolders: true
      };
    } else if (legacyConfig.is_folder) {
      mediaSourceType = 'simple_folder';
      migratedConfig.simple_folder = {
        path: legacyConfig.media_path,
        mode: legacyConfig.folder_mode || 'random',
        traverse_subfolders: true
      };
    } else {
      // Single media
      migratedConfig.single_media = {
        path: legacyConfig.media_path,
        refresh_seconds: legacyConfig.auto_refresh_seconds || 0
      };
    }
    
    migratedConfig.media_source_type = mediaSourceType;
    
    // Migrate display settings
    if (legacyConfig.auto_refresh_seconds) {
      migratedConfig.display.auto_advance_seconds = legacyConfig.auto_refresh_seconds;
    }
    
    // Migrate video settings
    if (legacyConfig.video_autoplay !== undefined) {
      migratedConfig.video.autoplay = legacyConfig.video_autoplay;
    }
    if (legacyConfig.video_muted !== undefined) {
      migratedConfig.video.muted = legacyConfig.video_muted;
    }
    
    // Migrate other legacy settings...
    // (Add more migrations as needed)
    
    console.warn('[MediaCard v5] Legacy configuration detected. Consider updating to v5 format. See documentation for details.');
    
    return migratedConfig;
  }

  /**
   * Get default configuration
   * REUSE STRATEGY: Preserve all existing defaults from v4
   */
  _getDefaultConfig() {
    return {
      // REQUIRED: Media source type (radio button selection)
      media_source_type: null, // Must be specified
      
      // Media source configurations (only relevant one will be used)
      single_media: {
        path: null,
        refresh_seconds: 0
      },
      media_index: {
        entity_id: null,
        subfolder: null,
        query_limit: 100,
        mode: 'random',
        traverse_subfolders: true
      },
      subfolder_queue: {
        path: null,
        scan_depth: null,
        priority_folders: [],
        estimated_total_photos: null,
        equal_probability_mode: true
      },
      simple_folder: {
        path: null,
        mode: 'random',
        traverse_subfolders: true
      },
      
      // Display configuration
      display: {
        auto_advance_enabled: true,
        auto_advance_seconds: 5,
        auto_advance_mode: 'reset',
        pause_on_interaction: true,
        aspect_mode: 'viewport-fit',
        zoom_level: 1.0,
        slideshow_behavior: 'smart_slideshow',
        slideshow_window: 10
      },
      
      // Navigation configuration
      navigation: {
        show_controls: true,
        enable_navigation_zones: true,
        show_position_indicator: true,
        show_dots_indicator: false,
        enable_keyboard_navigation: true,
        history_size: 100,
        preserve_on_disconnect: true
      },
      
      // Metadata display
      metadata: {
        show_filename: false,
        show_folder: true,
        show_date: true,
        show_location: true,
        show_root_folder: true,
        position: 'top-right'
      },
      
      // Video configuration
      video: {
        autoplay: true,
        muted: true,
        loop: false,
        controls: false,
        hide_controls_display: true,
        max_duration_seconds: 600,
        advance_on_end: true
      },
      
      // Action buttons
      action_buttons: {
        position: 'top-left',
        enable_favorites: false,
        enable_mark_for_edit: false,
        enable_delete: false,
        enable_refresh: true,
        enable_fullscreen: true
      },
      
      // Kiosk mode
      kiosk: {
        mode_entity: null,
        exit_action: 'hold',
        hide_header: true,
        hide_sidebar: true,
        prevent_interaction: false
      },
      
      // Visibility & Performance
      visibility: {
        pause_when_hidden: true,
        pause_scanning_when_hidden: true
      },
      
      // Advanced configuration
      advanced: {
        scan_concurrency: 2,
        queue_low_threshold: 10,
        queue_refill_size: 50
      },
      
      // Debug configuration
      debug: {
        basic: false,
        queue: false,
        history: false,
        scanning: false,
        providers: false,
        reconnection: false,
        queue_mode: false, // Legacy compatibility
        all: false
      }
    };
  }

  /**
   * Reset card state for reinitialization
   */
  _resetCardState() {
    this._state = 'uninitialized';
    this._currentItem = null;
    this._isLoading = false;
    this._errorMessage = null;
    
    // Clean up existing provider
    if (this._provider) {
      this._provider.disconnect();
      this._provider = null;
    }
    
    // Clear timers
    this._clearTimers();
    
    // Reset history
    this._history.clear();
  }

  /**
   * Initialize the appropriate provider based on configuration
   */
  async _initializeProvider() {
    if (this._state !== 'uninitialized') {
      this._log('Provider already initializing or initialized');
      return;
    }
    
    this._state = 'loading';
    this._isLoading = true;
    this.requestUpdate();
    
    try {
      const sourceType = this.config.media_source_type;
      this._log('Initializing provider for source type:', sourceType);
      
      // Create appropriate provider
      switch (sourceType) {
        case 'single_media':
          this._provider = new SingleMediaProvider(this.config, this.hass, this._cardId);
          break;
          
        case 'media_index':
          this._provider = new MediaIndexProvider(this.config, this.hass, this._cardId);
          
        case 'subfolder_queue':
          this._provider = new SubfolderProvider(this.config, this.hass, this._cardId);
          break;
          
        case 'simple_folder':
          this._provider = new SimpleFolderProvider(this.config, this.hass, this._cardId);
          
        default:
          throw new Error(`Unknown media source type: ${sourceType}`);
      }
      
      // Initialize the provider
      const success = await this._provider.initialize();
      
      if (success) {
        this._state = 'ready';
        this._currentItem = await this._provider.getCurrentItem();
        this._isLoading = false;
        
        // Start auto-advance if configured
        this._startAutoAdvance();
        
        this._log('Provider initialized successfully');
      } else {
        throw new Error('Provider initialization failed');
      }
      
    } catch (error) {
      this._state = 'error';
      this._isLoading = false;
      this._errorMessage = error.message;
      this._error('Failed to initialize provider:', error);
    }
    
    this.requestUpdate();
  }

  /**
   * Navigation: Move to next item
   */
  async _handleNext() {
    if (!this._provider || this._state !== 'ready') {
      this._log('Cannot navigate - provider not ready');
      return;
    }
    
    try {
      const nextItem = await this._provider.getNext();
      if (nextItem) {
        // Add current item to history before advancing
        if (this._currentItem) {
          this._history.add(this._currentItem);
        }
        
        this._currentItem = nextItem;
        this._resetAutoAdvance(); // Reset timer after manual navigation
        this.requestUpdate();
        
        this._log('Navigated to next item:', nextItem.filename);
      }
    } catch (error) {
      this._error('Failed to get next item:', error);
    }
  }

  /**
   * Navigation: Move to previous item  
   */
  async _handlePrevious() {
    if (!this._provider || this._state !== 'ready') {
      this._log('Cannot navigate - provider not ready');
      return;
    }
    
    // Try history first
    const historyItem = this._history.previous();
    if (historyItem) {
      this._currentItem = historyItem;
      this._resetAutoAdvance(); // Reset timer after manual navigation
      this.requestUpdate();
      this._log('Navigated to previous item from history:', historyItem.filename);
      return;
    }
    
    // Fallback to provider's previous method
    try {
      const prevItem = await this._provider.getPrevious();
      if (prevItem) {
        this._currentItem = prevItem;
        this._resetAutoAdvance(); // Reset timer after manual navigation
        this.requestUpdate();
        this._log('Navigated to previous item:', prevItem.filename);
      }
    } catch (error) {
      this._error('Failed to get previous item:', error);
    }
  }

  /**
   * Auto-advance timer management
   */
  _startAutoAdvance() {
    if (!this.config.display.auto_advance_enabled || 
        this.config.display.auto_advance_seconds <= 0) {
      return;
    }
    
    this._clearAutoAdvanceTimer();
    
    const intervalMs = this.config.display.auto_advance_seconds * 1000;
    this._autoAdvanceTimer = setTimeout(() => {
      this._handleNext();
    }, intervalMs);
    
    this._log('Auto-advance timer started:', intervalMs + 'ms');
  }

  _resetAutoAdvance() {
    if (this.config.display.auto_advance_mode === 'reset') {
      this._startAutoAdvance();
    } else if (this.config.display.auto_advance_mode === 'pause') {
      this._clearAutoAdvanceTimer();
    }
    // 'continue' mode does nothing - timer keeps running
  }

  _clearAutoAdvanceTimer() {
    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }
  }

  _clearTimers() {
    this._clearAutoAdvanceTimer();
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  /**
   * Pause/Resume functionality
   */
  pause() {
    this._isPaused = true;
    this._clearTimers();
    if (this._provider) {
      this._provider.pause();
    }
    this._log('Card paused');
    this.requestUpdate();
  }

  resume() {
    this._isPaused = false;
    if (this._provider) {
      this._provider.resume();
    }
    if (this._state === 'ready') {
      this._startAutoAdvance();
    }
    this._log('Card resumed');
    this.requestUpdate();
  }

  /**
   * Lifecycle: Connected to DOM
   */
  connectedCallback() {
    super.connectedCallback();
    this._log('Connected to DOM');
    
    // Set up visibility observer for pause/resume
    this._setupVisibilityObserver();
  }

  /**
   * Lifecycle: Disconnected from DOM
   */
  disconnectedCallback() {
    this._log('Disconnected from DOM');
    
    // Clean up timers and observers
    this._clearTimers();
    if (this._visibilityObserver) {
      this._visibilityObserver.disconnect();
    }
    
    // Disconnect provider
    if (this._provider) {
      this._provider.disconnect();
    }
    
    super.disconnectedCallback();
  }

  /**
   * Set up visibility observer for automatic pause/resume
   */
  _setupVisibilityObserver() {
    if (!this.config?.visibility?.pause_when_hidden) {
      return;
    }
    
    this._visibilityObserver = new IntersectionObserver(
      (entries) => {
        const isVisible = entries[0].isIntersecting;
        if (isVisible && this._isPaused) {
          this.resume();
        } else if (!isVisible && !this._isPaused) {
          this.pause();
        }
      },
      { threshold: 0.1 }
    );
    
    this._visibilityObserver.observe(this);
  }

  /**
   * Render the card UI
   */
  render() {
    return html`
      <div class="media-card-v5">
        ${this._renderContent()}
        ${this._renderControls()}
        ${this._renderDebugInfo()}
      </div>
    `;
  }

  /**
   * Render main content area
   */
  _renderContent() {
    if (this._isLoading) {
      return html`
        <div class="loading">
          <div class="spinner"></div>
          <div class="loading-text">Loading media...</div>
        </div>
      `;
    }
    
    if (this._errorMessage) {
      return html`
        <div class="error">
          <div class="error-icon">⚠️</div>
          <div class="error-message">${this._errorMessage}</div>
          <button @click=${() => this._initializeProvider()}>Retry</button>
        </div>
      `;
    }
    
    if (!this._currentItem) {
      return html`
        <div class="no-media">
          <div class="no-media-icon">📁</div>
          <div class="no-media-text">No media available</div>
        </div>
      `;
    }
    
    // Render current media item
    if (this._currentItem.isVideo()) {
      return this._renderVideo();
    } else {
      return this._renderImage();
    }
  }

  /**
   * Render image
   */
  _renderImage() {
    return html`
      <div class="media-container image-container">
        <img 
          src="${this._currentItem.path}" 
          alt="${this._currentItem.filename}"
          @load=${this._handleMediaLoad}
          @error=${this._handleMediaError}
        />
        ${this._renderMetadata()}
      </div>
    `;
  }

  /**
   * Render video
   */
  _renderVideo() {
    const videoConfig = this.config.video;
    
    return html`
      <div class="media-container video-container">
        <video 
          src="${this._currentItem.path}"
          ?autoplay=${videoConfig.autoplay}
          ?muted=${videoConfig.muted}
          ?loop=${videoConfig.loop}
          ?controls=${videoConfig.controls}
          @loadeddata=${this._handleMediaLoad}
          @error=${this._handleMediaError}
          @ended=${this._handleVideoEnded}
        ></video>
        ${this._renderMetadata()}
      </div>
    `;
  }

  /**
   * Render metadata overlay
   */
  _renderMetadata() {
    if (!this.config.metadata.show_filename && !this.config.metadata.show_folder) {
      return '';
    }
    
    return html`
      <div class="metadata-overlay ${this.config.metadata.position}">
        ${this.config.metadata.show_filename ? html`
          <div class="metadata-filename">${this._currentItem.filename}</div>
        ` : ''}
        ${this.config.metadata.show_folder && this._currentItem.sourceFolder ? html`
          <div class="metadata-folder">${this._currentItem.sourceFolder}</div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render navigation controls
   */
  _renderControls() {
    if (!this.config.navigation.show_controls) {
      return '';
    }
    
    const canGoBack = this._provider?.canGoBack() || this._history.canGoBack();
    const canGoForward = this._provider?.canAdvance();
    
    return html`
      <div class="controls">
        <button 
          class="control-button prev-button"
          ?disabled=${!canGoBack}
          @click=${this._handlePrevious}
        >
          ⏮️
        </button>
        
        <div class="control-info">
          ${this._isPaused ? html`
            <button class="control-button play-button" @click=${this.resume}>▶️</button>
          ` : html`
            <button class="control-button pause-button" @click=${this.pause}>⏸️</button>
          `}
        </div>
        
        <button 
          class="control-button next-button"
          ?disabled=${!canGoForward}
          @click=${this._handleNext}
        >
          ⏭️
        </button>
      </div>
    `;
  }

  /**
   * Render debug information (if enabled)
   */
  _renderDebugInfo() {
    if (!this.config.debug.basic && !this.config.debug.all) {
      return '';
    }
    
    const providerDebug = this._provider?.getDebugInfo() || {};
    const historyDebug = this._history.getDebugInfo();
    
    return html`
      <div class="debug-info">
        <div class="debug-section">
          <strong>Card State:</strong> ${this._state}
        </div>
        <div class="debug-section">
          <strong>Provider:</strong> ${providerDebug.providerType || 'none'}
        </div>
        <div class="debug-section">
          <strong>Queue Size:</strong> ${providerDebug.queueSize || 0}
        </div>
        <div class="debug-section">
          <strong>History:</strong> ${historyDebug.size} items (${historyDebug.currentIndex + 1})
        </div>
        ${this.config.debug.all ? html`
          <details>
            <summary>Full Debug Info</summary>
            <pre>${JSON.stringify({ providerDebug, historyDebug }, null, 2)}</pre>
          </details>
        ` : ''}
      </div>
    `;
  }

  /**
   * Event handlers
   */
  _handleMediaLoad() {
    this._log('Media loaded successfully:', this._currentItem?.filename);
  }

  _handleMediaError(event) {
    this._error('Media load error:', event.target.src);
    // Could implement retry logic here
  }

  _handleVideoEnded() {
    if (this.config.video.advance_on_end && !this.config.video.loop) {
      this._log('Video ended - auto-advancing');
      this._handleNext();
    }
  }

  /**
   * Utility methods
   */
  _log(...args) {
    console.log(`[MediaCard v5:${this._cardId}]`, ...args);
  }

  _error(...args) {
    console.error(`[MediaCard v5:${this._cardId}]`, ...args);
  }

  /**
   * CSS Styles
   */
  static styles = css`
    :host {
      display: block;
      position: relative;
      background: var(--card-background-color, #fff);
      border-radius: var(--ha-card-border-radius, 4px);
      box-shadow: var(--ha-card-box-shadow, none);
      overflow: hidden;
    }

    .media-card-v5 {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 300px;
    }

    .media-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--primary-background-color);
    }

    .media-container img,
    .media-container video {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }

    .loading,
    .error,
    .no-media {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      padding: 20px;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid var(--divider-color);
      border-top: 4px solid var(--primary-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 10px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .loading-text,
    .error-message,
    .no-media-text {
      color: var(--primary-text-color);
      font-size: 14px;
    }

    .error-icon,
    .no-media-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }

    .error button {
      margin-top: 10px;
      padding: 8px 16px;
      background: var(--primary-color);
      color: var(--text-primary-color);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .metadata-overlay {
      position: absolute;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.3;
      max-width: 80%;
      word-wrap: break-word;
    }

    .metadata-overlay.top-left { top: 10px; left: 10px; }
    .metadata-overlay.top-right { top: 10px; right: 10px; }
    .metadata-overlay.bottom-left { bottom: 10px; left: 10px; }
    .metadata-overlay.bottom-right { bottom: 10px; right: 10px; }

    .metadata-filename {
      font-weight: bold;
    }

    .metadata-folder {
      opacity: 0.8;
      font-size: 11px;
    }

    .controls {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border-radius: 20px;
    }

    .control-button {
      background: transparent;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .control-button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.2);
    }

    .control-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .control-info {
      display: flex;
      align-items: center;
      min-width: 40px;
      justify-content: center;
    }

    .debug-info {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px;
      border-radius: 4px;
      font-size: 10px;
      font-family: monospace;
      max-width: 300px;
      z-index: 100;
    }

    .debug-section {
      margin-bottom: 4px;
    }

    .debug-info details {
      margin-top: 8px;
    }

    .debug-info pre {
      margin: 4px 0 0 0;
      font-size: 9px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  `;

  // ============================================================================
  // MEDIA BROWSER FUNCTIONALITY (Ported from v4.1.0)
  // ============================================================================

  /**
   * Utility methods for media browser
   */
  _getItemDisplayName(item) {
    return item.title || item.media_content_id || '';
  }

  _isMediaFile(filePath) {
    if (!filePath) return false;
    
    // Handle URLs with query parameters
    let cleanPath = filePath;
    if (filePath.includes('?')) {
      cleanPath = filePath.split('?')[0];
    }
    
    const fileName = cleanPath.split('/').pop() || cleanPath;
    
    // Handle special suffixes (e.g., Synology _shared)
    let cleanFileName = fileName;
    if (fileName.endsWith('_shared')) {
      cleanFileName = fileName.replace('_shared', '');
    }
    
    // Extract extension
    const extension = cleanFileName.split('.').pop()?.toLowerCase();
    
    return ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
  }

  /**
   * Fetch media contents from Home Assistant
   */
  async _fetchMediaContents(hass, contentId = '') {
    if (!hass) {
      throw new Error('Home Assistant instance not available');
    }

    return hass.callWS({
      type: "media_source/browse_media",
      media_content_id: contentId
    });
  }

  /**
   * Open the media browser dialog
   */
  async _openMediaBrowser() {
    if (!this.hass) {
      console.error('Home Assistant instance not available');
      return;
    }

    this._log('Opening media browser...');
    
    // Determine the starting path for the browser
    let startPath = '';
    const configuredPath = this.config.media_path || '';
    
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

  /**
   * Show custom media browser dialog
   */
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

    const leftButtons = document.createElement('div');
    leftButtons.style.cssText = `
      display: flex !important;
      gap: 8px !important;
    `;

    // Add Up button if not at root
    const currentPath = mediaContent.media_content_id || '';
    if (currentPath && currentPath !== '' && currentPath.includes('/')) {
      const upButton = document.createElement('button');
      upButton.textContent = '⬆️ Up';
      upButton.style.cssText = `
        padding: 8px 16px !important;
        background: var(--secondary-background-color, #f5f5f5) !important;
        border: 1px solid var(--divider-color, #ddd) !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        color: var(--primary-text-color, #333) !important;
        font-size: 14px !important;
        pointer-events: auto !important;
        z-index: 999999999 !important;
      `;
      
      upButton.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Navigate to parent folder
        const pathParts = currentPath.split('/');
        pathParts.pop(); // Remove current folder
        const parentPath = pathParts.join('/');
        
        try {
          const parentContent = await this._fetchMediaContents(this.hass, parentPath);
          // Clear current content and reload with parent
          fileList.innerHTML = '';
          this._addMediaFilesToBrowser(fileList, parentContent, dialog, parentPath);
        } catch (error) {
          this._log('Error navigating up:', error);
          alert('Could not navigate up: ' + error.message);
        }
      };
      
      leftButtons.appendChild(upButton);
    }

    const rightButtons = document.createElement('div');
    rightButtons.style.cssText = `
      display: flex !important;
      gap: 8px !important;
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

    // Dialog close function with debugging and proper cleanup
    const closeDialog = () => {
      this._log('Closing media browser dialog');
      // CRITICAL: Remove keydown event listener to prevent memory leak
      document.removeEventListener('keydown', handleKeydown);
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
        this._log('Dialog closed successfully');
      }
    };

    // Close button handler with debugging and force event handling
    closeButton.onclick = (e) => {
      this._log('Cancel button clicked via onclick');
      closeDialog();
      return false;
    };

    // Backdrop click handler - use onclick to force event handling
    dialog.onclick = (e) => {
      this._log('Dialog backdrop clicked via onclick', e.target === dialog);
      if (e.target === dialog) {
        closeDialog();
      }
    };

    // Escape key to close - defined after closeDialog to avoid hoisting issues
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this._log('Escape key pressed');
        closeDialog(); // closeDialog now handles the cleanup
      }
    };
    document.addEventListener('keydown', handleKeydown);

    rightButtons.appendChild(closeButton);
    buttonContainer.appendChild(leftButtons);
    buttonContainer.appendChild(rightButtons);
    dialogContent.appendChild(title);
    dialogContent.appendChild(fileList);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    
    this._log('Appending dialog to document.body');
    document.body.appendChild(dialog);
    
    // Force focus, remove inert, and log status
    requestAnimationFrame(() => {
      // Force remove inert state from all elements
      dialog.removeAttribute('inert');
      dialogContent.removeAttribute('inert');
      document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
      
      dialog.focus();
      dialog.setAttribute('tabindex', '0');
      
      this._log('Media browser dialog opened and focused');
    });
  }

  /**
   * Add media files to browser dialog
   */
  async _addMediaFilesToBrowser(container, mediaContent, dialog, currentPath = '') {
    this._log('Adding media files to browser:', mediaContent.children.length, 'items');
    this._log('Current path:', currentPath);
    
    // Counter for limiting debug output
    let processedCount = 0;
    
    // Check if this folder contains media files (not just subfolders)
    const itemsToCheck = (mediaContent.children || []).slice(0, 50);
    const hasMediaFiles = itemsToCheck.some(item => {
      const isFolder = item.can_expand;
      const fileName = this._getItemDisplayName(item);
      return !isFolder && this._isMediaFile(fileName);
    });
    
    const hasSubfolders = itemsToCheck.some(item => item.can_expand);
    
    this._log('Has media files:', hasMediaFiles);
    this._log('Has subfolders:', hasSubfolders);

    // Add folder selection options if we're in a folder with content
    if (currentPath && currentPath !== '' && (hasMediaFiles || hasSubfolders)) {
      this._addFolderOptions(container, dialog, currentPath);
    }

    // Process each child item
    for (const item of mediaContent.children || []) {
      if (processedCount >= 100) {
        this._log('Limiting browser display to first 100 items for performance');
        break;
      }

      const isFolder = item.can_expand;
      const fileName = this._getItemDisplayName(item);
      
      // For files, only show media files
      if (!isFolder && !this._isMediaFile(fileName)) {
        continue;
      }

      processedCount++;
      
      const itemElement = document.createElement('div');
      itemElement.style.cssText = `
        display: flex !important;
        align-items: center !important;
        padding: 8px 12px !important;
        border: 1px solid var(--divider-color, #ddd) !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        background: var(--card-background-color, white) !important;
        transition: background-color 0.2s !important;
        pointer-events: auto !important;
      `;

      itemElement.onmouseover = () => {
        itemElement.style.background = 'var(--primary-color, #007bff)';
        itemElement.style.color = 'white';
      };

      itemElement.onmouseout = () => {
        itemElement.style.background = 'var(--card-background-color, white)';
        itemElement.style.color = 'var(--primary-text-color, #333)';
      };

      const icon = document.createElement('span');
      icon.style.cssText = `
        margin-right: 8px !important;
        font-size: 16px !important;
        pointer-events: none !important;
      `;

      if (isFolder) {
        icon.textContent = '📁';
        itemElement.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._log('Folder clicked:', fileName);
          
          try {
            const subContent = await this._fetchMediaContents(this.hass, item.media_content_id);
            container.innerHTML = '';
            this._addMediaFilesToBrowser(container, subContent, dialog, item.media_content_id);
          } catch (error) {
            this._log('Error browsing folder:', error);
            alert('Could not browse folder: ' + error.message);
          }
        };
      } else {
        const fileType = MediaUtils.detectFileType(fileName);
        icon.textContent = fileType === 'video' ? '🎬' : '🖼️';
        
        itemElement.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._log('File selected:', fileName);
          this._handleMediaPicked(item.media_content_id);
          
          // Close dialog
          document.removeEventListener('keydown', () => {});
          if (dialog && dialog.parentNode) {
            document.body.removeChild(dialog);
          }
        };
      }

      const nameElement = document.createElement('span');
      nameElement.textContent = fileName;
      nameElement.style.cssText = `
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        pointer-events: none !important;
      `;

      itemElement.appendChild(icon);
      itemElement.appendChild(nameElement);
      container.appendChild(itemElement);
    }

    if (processedCount === 0) {
      const noItems = document.createElement('div');
      noItems.textContent = 'No media files found in this folder';
      noItems.style.cssText = `
        padding: 20px !important;
        text-align: center !important;
        color: var(--secondary-text-color, #666) !important;
        font-style: italic !important;
      `;
      container.appendChild(noItems);
    }
  }

  /**
   * Add folder options (Latest/Random) from v4 functionality
   */
  _addFolderOptions(container, dialog, folderPath) {
    this._log('Adding folder options for:', folderPath);
    const sourceType = this.config.media_source_type || 'single_media';
    
    // Only show folder options for folder modes
    if (sourceType === 'single_media') return;
    
    // Create a separator/header for folder options
    const optionsHeader = document.createElement('div');
    optionsHeader.style.cssText = `
      padding: 8px 16px !important;
      background: var(--secondary-background-color, #f5f5f5) !important;
      border-radius: 6px !important;
      margin-bottom: 8px !important;
      font-weight: 500 !important;
      color: var(--primary-text-color, #333) !important;
      border-left: 4px solid var(--primary-color, #007bff) !important;
      font-size: 14px !important;
      user-select: none !important;
    `;
    optionsHeader.textContent = 'Folder Display Options';
    container.appendChild(optionsHeader);

    // Show Latest option
    const latestOption = this._createFolderOption(
      '📅',
      'Show Latest',
      'Always display the newest file from this folder',
      () => this._handleFolderModeSelected(folderPath, 'latest', dialog)
    );
    container.appendChild(latestOption);

    // Show Random option  
    const randomOption = this._createFolderOption(
      '🎲',
      'Show Random',
      'Randomly cycle through files in this folder',
      () => this._handleFolderModeSelected(folderPath, 'random', dialog)
    );
    container.appendChild(randomOption);

    // Add separator line before individual files
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
      user-select: none !important;
    `;
    filesHeader.textContent = 'Individual Files';
    container.appendChild(filesHeader);
  }

  _createFolderOption(icon, title, description, clickHandler) {
    const option = document.createElement('div');
    option.style.cssText = `
      padding: 12px 16px !important;
      border: 2px solid var(--primary-color, #007bff) !important;
      border-radius: 8px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      transition: all 0.2s ease !important;
      background: var(--card-background-color, #fff) !important;
      margin-bottom: 8px !important;
      user-select: none !important;
      pointer-events: auto !important;
      z-index: 999999999 !important;
    `;

    option.onmouseenter = () => {
      option.style.background = 'var(--primary-color, #007bff)';
      option.style.color = 'white';
      option.style.transform = 'translateY(-2px)';
      option.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
    };

    option.onmouseleave = () => {
      option.style.background = 'var(--card-background-color, #fff)';
      option.style.color = 'var(--primary-text-color, #333)';
      option.style.transform = 'translateY(0)';
      option.style.boxShadow = 'none';
    };

    const iconElement = document.createElement('span');
    iconElement.textContent = icon;
    iconElement.style.cssText = `
      font-size: 20px !important;
      pointer-events: none !important;
    `;

    const textContainer = document.createElement('div');
    textContainer.style.cssText = `
      flex: 1 !important;
      pointer-events: none !important;
    `;

    const titleElement = document.createElement('div');
    titleElement.textContent = title;
    titleElement.style.cssText = `
      font-weight: 500 !important;
      margin-bottom: 2px !important;
      pointer-events: none !important;
    `;

    const descElement = document.createElement('div');
    descElement.textContent = description;
    descElement.style.cssText = `
      font-size: 12px !important;
      opacity: 0.8 !important;
      pointer-events: none !important;
    `;

    textContainer.appendChild(titleElement);
    textContainer.appendChild(descElement);
    option.appendChild(iconElement);
    option.appendChild(textContainer);
    
    option.onclick = clickHandler;
    
    return option;
  }

  _handleFolderModeSelected(folderPath, mode, dialog) {
    this._log(`Folder mode selected: ${mode} for path: ${folderPath}`);
    
    // Update config with folder path and mode
    this.config = { 
      ...this.config, 
      media_path: folderPath,
      is_folder: true,
      folder_mode: mode
    };
    
    this._fireConfigChanged();
    this.requestUpdate();

    // Close dialog
    if (dialog && dialog.parentNode) {
      document.body.removeChild(dialog);
    }
  }

  /**
   * Handle media selection from browser
   */
  _handleMediaPicked(mediaContentId) {
    this._log('Media picked:', mediaContentId);
    
    // Store the full media-source path for configuration
    this.config = { ...this.config, media_path: mediaContentId };
    
    // Clear folder-specific options when selecting a single file
    this.config = { 
      ...this.config, 
      is_folder: false,
      folder_mode: undefined
    };
    
    // Auto-detect media type from extension
    const extension = mediaContentId.split('.').pop()?.toLowerCase();
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      this.config.media_type = 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      this.config.media_type = 'image';
    }
    
    // Fire config changed event for editor
    this._fireConfigChanged();
    
    // Reinitialize with new config
    this._reinitialize();
    
    this._log('Config updated (file selected):', this.config);
  }

  /**
   * Fire configuration changed event (for use in card editor)
   */
  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this.config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }
}

// ============================================================================
// CARD REGISTRATION
// ============================================================================

console.log('🔄 Step 5: About to register MediaCardV5');

// Register the card with Home Assistant (only if not already registered)
if (!customElements.get('media-card-v5')) {
  customElements.define('media-card-v5', MediaCardV5);
  console.log('✅ MediaCardV5 registered successfully');
} else {
  console.log('ℹ️ MediaCardV5 already registered, skipping');
}

// Add to window for console access during development
window.MediaCardV5 = MediaCardV5;

// customCards registration will happen at the end after both elements are defined

// ============================================================================
// CARD EDITOR (Configuration UI with Media Browser)
// ============================================================================

console.log('🔄 Step 4: Starting MediaCardV5Editor class definition');

class MediaCardV5Editor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _config: { state: true },
    _mediaBrowserOpen: { state: true }
  };

  constructor() {
    super();
    this._mediaBrowserOpen = false;
  }

  // Debug logging utility for the editor
  _log(...args) {
    console.log(...args);
  }

  // Utility methods needed by the editor
  _getItemDisplayName(item) {
    return item.title || item.media_content_id;
  }

  _isMediaFile(filePath) {
    // Extract filename from the full path and get extension  
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
  }

  _detectFileType(filePath) {
    return MediaUtils.detectFileType(filePath);
  }

  setConfig(config) {
    // Convert v4 config to v5 format if needed, or use v5 config as-is
    if (!config.media_source_type) {
      // Legacy v4 config - convert to v5
      if (config.media_path && config.is_folder) {
        this._config = {
          media_source_type: 'simple_folder',
          media_path: config.media_path,
          folder_mode: config.folder_mode || 'random',
          ...config
        };
      } else if (config.media_path) {
        this._config = {
          media_source_type: 'single_media', 
          media_path: config.media_path,
          ...config
        };
      } else {
        // New blank config
        this._config = {
          media_source_type: 'single_media',
          media_path: '',
          ...config
        };
      }
    } else {
      // Already v5 config
      this._config = { ...config };
    }
    
    // Ensure required properties exist
    if (!this._config._config) {
      this._config._config = this._config;
    }
    
    this.config = this._config;
  }

  render() {
    if (!this._config) {
      return html``;
    }

    return html`
      <div class="card-config">
        <!-- V5 Mode Selection Header -->
        <div class="v5-mode-header">
          <div class="config-row">
            <label>Media Source Type</label>
            <div>
              <select @change=${this._v5ModeChanged} .value=${this._config.media_source_type || 'single_media'}>
                <option value="single_media">Single Media File</option>
                <option value="simple_folder">Simple Folder</option>
                <option value="subfolder_queue">Folder Hierarchy</option>
              </select>
              <div class="help-text">Choose how the card should handle media selection</div>
            </div>
          </div>
        </div>

        <!-- Standard V4 Configuration (proven working) -->
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
          <label>Image Scaling</label>
          <div>
            <select @change=${this._aspectModeChanged} .value=${this._config.aspect_mode || 'default'}>
              <option value="default">Default (fit to card width)</option>
              <option value="smart-scale">Smart Scale (limit height, prevent scrolling)</option>
              <option value="viewport-fit">Viewport Fit (fit entire image in viewport)</option>
              <option value="viewport-fill">Viewport Fill (fill entire viewport)</option>
            </select>
            <div class="help-text">How images should be scaled, especially useful for panel layouts with mixed portrait/landscape images</div>
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

        <div class="config-row">
          <label>Auto Refresh</label>
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
            <div class="help-text">Automatically check for media updates every N seconds (0 = disabled)<br>
              <em>For folder modes: controls how often to scan for new files and switch random images</em></div>
          </div>
        </div>

        <!-- Continue with full v4 configuration... -->
        <!-- This will be expanded with all v4 options in next update -->
      </div>
    `;
  }

  _renderMediaSourceSelection() {
    return html`
      <div class="config-section">
        <h3>1. Display Mode</h3>
        <div class="radio-group">
          <label class="radio-option">
            <input 
              type="radio" 
              name="media_source_type" 
              value="single_media"
              .checked=${this.config.media_source_type === 'single_media' || !this.config.media_source_type}
              @change=${this._mediaSourceChanged}
            />
            <span>Single Media</span>
            <div class="option-description">Display individual images/videos one at a time</div>
          </label>

          <label class="radio-option">
            <input 
              type="radio" 
              name="media_source_type" 
              value="simple_folder"
              .checked=${this.config.media_source_type === 'simple_folder'}
              @change=${this._mediaSourceChanged}
            />
            <span>Simple Folder</span>
            <div class="option-description">Basic folder scanning with optional random mode</div>
          </label>

          <label class="radio-option">
            <input 
              type="radio" 
              name="media_source_type" 
              value="subfolder_queue"
              .checked=${this.config.media_source_type === 'subfolder_queue'}
              @change=${this._mediaSourceChanged}
            />
            <span>Folder Hierarchy</span>
            <div class="option-description">Advanced folder navigation with subfolder management</div>
          </label>
        </div>
      </div>
    `;
  }

  _renderMediaIndexEnhancement() {
    return html`
      <div class="config-section">
        <h3>2. Backend Enhancement</h3>
        <label class="checkbox-option">
          <input 
            type="checkbox"
            .checked=${this.config.use_media_index || false}
            @change=${this._mediaIndexEnhancementChanged}
          />
          <span>Use Media Index Enhancement</span>
          <div class="option-description">
            Provides rich metadata, faster queries, and caching while monitoring file system for updates
          </div>
        </label>
        
        ${this.config.use_media_index ? this._renderMediaIndexEntitySelector() : ''}
      </div>
    `;
  }

  _renderMediaIndexEntitySelector() {
    const entities = this._getMediaIndexEntities();
    
    return html`
      <div class="media-index-config">
        <label>Media Index Entity:</label>
        <select @change=${this._mediaIndexEntityChanged} .value=${this.config.media_index?.entity_id || ''}>
          <option value="">Select media_index sensor...</option>
          ${entities.map(entity => html`
            <option value=${entity.entity_id}>${entity.attributes?.friendly_name || entity.entity_id}</option>
          `)}
        </select>
        <div class="help-text">Choose your media_index sensor entity for enhanced functionality</div>
      </div>
    `;
  }

  _renderMediaPathInput() {
    const sourceType = this.config.media_source_type || 'single_media';
    let placeholderText, labelText, helpText;

    switch (sourceType) {
      case 'single_media':
        placeholderText = 'media-source://media_source/local/images/photo.jpg';
        labelText = '3. Select Media File';
        helpText = 'Browse and select an individual image or video file';
        break;
      case 'simple_folder':
        placeholderText = 'media-source://media_source/local/photos/';
        labelText = '3. Select Media Folder';
        helpText = 'Browse and select a folder containing media files';
        break;
      case 'subfolder_queue':
        placeholderText = 'media-source://media_source/local/photos/';
        labelText = '3. Select Root Folder';
        helpText = 'Browse and select the root folder for subfolder navigation';
        break;
    }

    return html`
      <div class="config-section">
        <h3>${labelText}</h3>
        ${this._renderPathInputWithBrowser(helpText, placeholderText)}
      </div>
    `;
  }

  _renderPathInputWithBrowser(helpText, placeholderText) {
    const sourceType = this.config.media_source_type || 'single_media';
    const isFolder = sourceType !== 'single_media';
    const browseText = isFolder ? '📁 Browse Folders' : '📄 Browse Files';
    
    return html`
      <div class="path-input-container">
        <input
          type="text"
          .value=${this.config.media_path || ''}
          @input=${this._mediaPathChanged}
          placeholder=${placeholderText}
          class="path-input"
        />
        <button class="browse-button" @click=${this._openMediaBrowser}>
          ${browseText}
        </button>
      </div>
      <div class="help-text">${helpText}</div>
      ${this._renderPathValidation()}
    `;
  }

  _renderPathValidation() {
    const path = this.config.media_path;
    const sourceType = this.config.media_source_type || 'single_media';
    
    if (!path) {
      return html`<div class="validation-message info">Please select a media path</div>`;
    }

    // Basic validation feedback
    const isFolder = sourceType !== 'single_media';
    const looksLikeFolder = path.endsWith('/');
    const looksLikeFile = !looksLikeFolder && path.includes('.');

    if (isFolder && looksLikeFile) {
      return html`<div class="validation-message warning">⚠️ Selected path appears to be a file, but folder mode requires a folder</div>`;
    }
    
    if (!isFolder && looksLikeFolder) {
      return html`<div class="validation-message warning">⚠️ Selected path appears to be a folder, but single media mode requires a file</div>`;
    }

    return html`<div class="validation-message success">✓ Path looks correct for ${sourceType} mode</div>`;
  }

  _renderMediaIndexSelector() {
    const entities = this._getMediaIndexEntities();
    
    return html`
      <select @change=${this._mediaIndexEntityChanged} .value=${this.config.media_index?.entity_id || ''}>
        <option value="">Select Media Index Entity...</option>
        ${entities.map(entity => html`
          <option value=${entity.entity_id}>${entity.attributes?.friendly_name || entity.entity_id}</option>
        `)}
      </select>
      <div class="help-text">Choose your media_index sensor entity</div>
    `;
  }

  _renderContextSensitiveOptions() {
    const sourceType = this.config.media_source_type || 'single_media';
    
    return html`
      <div class="config-section">
        <h3>4. ${this._getOptionsTitle(sourceType)}</h3>
        ${this._renderModeSpecificOptions(sourceType)}
        ${this.config.use_media_index ? this._renderMediaIndexOptions() : ''}
      </div>
    `;
  }

  _getOptionsTitle(sourceType) {
    switch (sourceType) {
      case 'single_media': return 'Single Media Options';
      case 'simple_folder': return 'Simple Folder Options';  
      case 'subfolder_queue': return 'Folder Hierarchy Options';
      default: return 'Options';
    }
  }

  _renderModeSpecificOptions(sourceType) {
    switch (sourceType) {
      case 'single_media':
        return html`
          <div class="config-row">
            <label>Auto Advance</label>
            <div class="input-with-unit">
              <input
                type="number"
                min="0"
                .value=${this.config.auto_advance_seconds || ''}
                @input=${this._autoAdvanceChanged}
                placeholder="0"
              />
              <span class="unit">seconds (0 = disabled)</span>
            </div>
          </div>
        `;
        
      case 'simple_folder':
        return html`
          <div class="config-row">
            <label>Random Mode</label>
            <input
              type="checkbox"
              .checked=${this.config.random_mode || false}
              @change=${this._randomModeChanged}
            />
            <span class="checkbox-label">Enable random file selection</span>
          </div>
          <div class="config-row">
            <label>Auto Advance</label>
            <div class="input-with-unit">
              <input
                type="number"
                min="0"
                .value=${this.config.auto_advance_seconds || ''}
                @input=${this._autoAdvanceChanged}
                placeholder="0"
              />
              <span class="unit">seconds (0 = disabled)</span>
            </div>
          </div>
        `;
        
      case 'subfolder_queue':
        return html`
          <div class="config-row">
            <label>Random Mode</label>
            <input
              type="checkbox"
              .checked=${this.config.random_mode || false}
              @change=${this._randomModeChanged}
            />
            <span class="checkbox-label">Enable random file and folder selection</span>
          </div>
          <div class="config-row">
            <label>Max Files per Subfolder</label>
            <input
              type="number"
              min="1"
              max="200"
              .value=${this.config.max_files_per_folder || 50}
              @input=${this._maxFilesChanged}
            />
            <span class="unit">files (default: 50)</span>
          </div>
          <div class="config-row">
            <label>Auto Advance</label>
            <div class="input-with-unit">
              <input
                type="number"
                min="0"
                .value=${this.config.auto_advance_seconds || ''}
                @input=${this._autoAdvanceChanged}
                placeholder="0"
              />
              <span class="unit">seconds (0 = disabled)</span>
            </div>
          </div>
        `;
      
      default:
        return html``;
    }
  }

  _renderMediaIndexOptions() {
    return html`
      <div class="media-index-options">
        <h4>Media Index Enhancement Options</h4>
        <div class="config-row">
          <label>Media Type Filter</label>
          <select @change=${this._mediaTypeChanged} .value=${this.config.media_type || 'all'}>
            <option value="all">All Media (Images + Videos)</option>
            <option value="image">Images Only (JPG, PNG, GIF)</option>
            <option value="video">Videos Only (MP4, WebM, etc.)</option>
          </select>
          <div class="help-text">What types of media to display</div>
        </div>
        <div class="config-row">
          <label>Date Range Filter</label>
          <div class="date-range">
            <input
              type="date"
              .value=${this.config.media_index?.date_from || ''}
              @input=${this._dateFromChanged}
              placeholder="From date"
            />
            <span>to</span>
            <input
              type="date"
              .value=${this.config.media_index?.date_to || ''}
              @input=${this._dateToChanged}
              placeholder="To date"
            />
          </div>
        </div>
      </div>
    `;
  }

  _renderDebugOptions() {
    return html`
      <div class="config-section">
        <h3>5. Debug Options</h3>
        <div class="config-row">
          <label>Debug Mode</label>
          <select @change=${this._debugModeChanged} .value=${this.config.debug_mode || 'none'}>
            <option value="none">None</option>
            <option value="basic">Basic</option>
            <option value="detailed">Detailed</option>
            <option value="full">Full</option>
          </select>
          <span class="unit">Controls console logging detail</span>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  _mediaSourceChanged(e) {
    const sourceType = e.target.value;
    this.config = { 
      ...this.config, 
      media_source_type: sourceType,
      // Clear source-specific config when switching types
      media_index: sourceType === 'media_index' ? (this.config.media_index || {}) : undefined
    };
    this._fireConfigChanged();
  }

  _mediaPathChanged(e) {
    this.config = { ...this.config, media_path: e.target.value };
    this._fireConfigChanged();
  }

  _autoAdvanceChanged(e) {
    const value = parseInt(e.target.value) || 0;
    this.config = { ...this.config, auto_advance_seconds: value > 0 ? value : undefined };
    this._fireConfigChanged();
  }

  _debugModeChanged(e) {
    const value = e.target.value;
    this.config = { ...this.config, debug_mode: value !== 'none' ? value : undefined };
    this._fireConfigChanged();
  }

  _randomModeChanged(e) {
    this.config = { ...this.config, random_mode: e.target.checked };
    this._fireConfigChanged();
  }

  _mediaIndexEnhancementChanged(e) {
    this.config = { 
      ...this.config, 
      use_media_index: e.target.checked,
      media_index: e.target.checked ? (this.config.media_index || {}) : undefined
    };
    this._fireConfigChanged();
  }

  _mediaIndexEntityChanged(e) {
    const entityId = e.target.value;
    this.config = {
      ...this.config,
      media_index: {
        ...this.config.media_index,
        entity_id: entityId
      }
    };
    this._fireConfigChanged();
  }

  _fileExtensionsChanged(e) {
    const extensions = e.target.value.split(',').map(ext => ext.trim()).filter(ext => ext);
    this.config = {
      ...this.config,
      media_index: {
        ...this.config.media_index,
        file_extensions: extensions.length > 0 ? extensions : undefined
      }
    };
    this._fireConfigChanged();
  }

  _maxFilesChanged(e) {
    const value = parseInt(e.target.value) || 50;
    this.config = { ...this.config, max_files_per_folder: value };
    this._fireConfigChanged();
  }

  _dateFromChanged(e) {
    this.config = {
      ...this.config,
      media_index: {
        ...this.config.media_index,
        date_from: e.target.value
      }
    };
    this._fireConfigChanged();
  }

  _dateToChanged(e) {
    this.config = {
      ...this.config,
      media_index: {
        ...this.config.media_index,
        date_to: e.target.value
      }
    };
    this._fireConfigChanged();
  }

  async _openMediaBrowser() {
    if (!this.hass) {
      console.error('Home Assistant instance not available');
      return;
    }

    const sourceType = this.config.media_source_type || 'single_media';
    const useMediaIndex = this.config.use_media_index || false;
    
    // Determine starting path based on backend selection
    let startPath = '';
    if (useMediaIndex && this.config.media_index?.entity_id) {
      // Start at media_index root if available
      const entity = this.hass.states[this.config.media_index.entity_id];
      if (entity && entity.attributes && entity.attributes.media_folder) {
        startPath = entity.attributes.media_folder;
        console.log('Starting browser at media_index root:', startPath);
      }
    }

    // Create a temporary media card instance to use its browser functionality
    const tempCard = new MediaCardV5();
    tempCard.hass = this.hass;
    tempCard.config = { ...this.config, _browserMode: sourceType };
    
    // Override the _handleMediaPicked method to update our config with validation
    tempCard._handleMediaPicked = (mediaContentId) => {
      const isValid = this._validatePathSelection(mediaContentId, sourceType);
      if (isValid) {
        this.config = { ...this.config, media_path: mediaContentId };
        this._fireConfigChanged();
        this.requestUpdate();
      } else {
        // Show validation error but don't close browser
        alert(this._getValidationError(mediaContentId, sourceType));
      }
    };

    // Override browser starting path if needed
    if (startPath) {
      tempCard.config = { ...tempCard.config, media_path: startPath };
    }

    // Open the browser
    await tempCard._openMediaBrowser();
  }

  _validatePathSelection(mediaContentId, sourceType) {
    const isFolder = sourceType !== 'single_media';
    const pathLooksLikeFolder = mediaContentId.endsWith('/') || !mediaContentId.includes('.');
    
    return isFolder ? pathLooksLikeFolder : !pathLooksLikeFolder;
  }

  _getValidationError(mediaContentId, sourceType) {
    const isFolder = sourceType !== 'single_media';
    
    if (isFolder) {
      return `Please select a folder for ${sourceType} mode. The selected path "${mediaContentId}" appears to be a file.`;
    } else {
      return `Please select a media file for ${sourceType} mode. The selected path "${mediaContentId}" appears to be a folder.`;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  _getMediaIndexEntities() {
    if (!this.hass || !this.hass.states) return [];
    
    return Object.values(this.hass.states)
      .filter(entity => entity.entity_id.startsWith('sensor.media_index'))
      .sort((a, b) => {
        const aName = a.attributes?.friendly_name || a.entity_id;
        const bName = b.attributes?.friendly_name || b.entity_id;
        return aName.localeCompare(bName);
      });
  }

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this.config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  static styles = css`
    .editor-container {
      padding: 16px;
    }

    .config-section {
      margin-bottom: 24px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      padding: 16px;
    }

    .config-section h3 {
      margin: 0 0 16px 0;
      color: var(--primary-text-color);
      font-size: 16px;
      font-weight: 600;
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .radio-option {
      display: flex;
      flex-direction: column;
      padding: 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .radio-option:hover {
      background: var(--secondary-background-color, #f8f9fa);
      border-color: var(--primary-color, #007bff);
    }

    .radio-option input[type="radio"] {
      margin-right: 8px;
    }

    .radio-option span {
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .option-description {
      margin-top: 4px;
      font-size: 12px;
      color: var(--secondary-text-color, #666);
      margin-left: 20px;
    }

    .config-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .config-row label {
      flex: 1;
      margin-right: 12px;
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .config-row input,
    .config-row select {
      flex: 0 0 200px;
      padding: 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, white);
      color: var(--primary-text-color);
    }

    .path-input-container {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .path-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, white);
      color: var(--primary-text-color);
      font-size: 14px;
    }

    .browse-button {
      padding: 8px 16px;
      background: var(--primary-color, #007bff);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      white-space: nowrap;
      transition: background-color 0.2s;
    }

    .browse-button:hover {
      background: var(--primary-color-dark, #0056b3);
    }

    .help-text {
      margin-top: 8px;
      font-size: 12px;
      color: var(--secondary-text-color, #666);
      font-style: italic;
    }

    input[type="checkbox"] {
      transform: scale(1.2);
    }

    input[type="number"] {
      width: 100px;
    }

    .checkbox-option {
      display: flex;
      flex-direction: column;
      padding: 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .checkbox-option:hover {
      background: var(--secondary-background-color, #f8f9fa);
      border-color: var(--primary-color, #007bff);
    }

    .checkbox-option input[type="checkbox"] {
      margin-right: 8px;
      transform: scale(1.2);
    }

    .checkbox-option span {
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .media-index-config {
      margin-top: 12px;
      padding-left: 20px;
      border-left: 3px solid var(--primary-color, #007bff);
    }

    .media-index-options {
      margin-top: 16px;
      padding: 12px;
      background: var(--secondary-background-color, #f8f9fa);
      border-radius: 6px;
      border-left: 3px solid var(--primary-color, #007bff);
    }

    .media-index-options h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: var(--primary-text-color);
    }

    .input-with-unit {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .input-with-unit input {
      flex: 0 0 80px;
    }

    .unit {
      font-size: 12px;
      color: var(--secondary-text-color, #666);
    }

    .checkbox-label {
      font-size: 12px;
      color: var(--secondary-text-color, #666);
      margin-left: 8px;
    }

    .date-range {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .date-range input {
      flex: 1;
    }

    .date-range span {
      color: var(--secondary-text-color, #666);
      font-size: 14px;
    }

    .validation-message {
      margin-top: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .validation-message.info {
      background: var(--info-color, #e3f2fd);
      color: var(--info-text-color, #1976d2);
      border: 1px solid var(--info-border-color, #bbdefb);
    }

    .validation-message.success {
      background: var(--success-color, #e8f5e8);
      color: var(--success-text-color, #2e7d32);
      border: 1px solid var(--success-border-color, #c8e6c9);
    }

    .validation-message.warning {
      background: var(--warning-color, #fff3e0);
      color: var(--warning-text-color, #f57c00);
      border: 1px solid var(--warning-border-color, #ffcc02);
    }

    .validation-message.error {
      background: var(--error-color, #ffebee);
      color: var(--error-text-color, #c62828);
      border: 1px solid var(--error-border-color, #ef9a9a);
    }
  `;

  // Key methods from v4 that we need
  
  _renderValidationStatus() {
    if (!this._config.media_path) return '';
    
    // More flexible validation - just check if it starts with media-source:// or /
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

  _fetchMediaContents(hass, contentId) {
    return hass.callWS({
      type: "media_source/browse_media",
      media_content_id: contentId
    });
  }

  async _openMediaBrowser() {
    if (!this.hass) {
      console.error('Home Assistant instance not available');
      return;
    }

    this._log('Opening media browser...');
    
    // Determine the starting path for the browser
    let startPath = '';
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

  _handleMediaPicked(mediaContentId) {
    this._log('Media picked:', mediaContentId);
    
    // Store the full media-source path for configuration
    this._config = { ...this._config, media_path: mediaContentId };
    
    // Auto-detect folder mode based on path
    const isFolder = mediaContentId.endsWith('/') || (!mediaContentId.includes('.') && mediaContentId.length > 0);
    if (isFolder && !this._config.is_folder) {
      this._config.is_folder = true;
      this._config.folder_mode = 'random'; // default folder mode
    } else if (!isFolder && this._config.is_folder) {
      this._config.is_folder = false;
      delete this._config.folder_mode;
    }
    
    this.config = this._config;
    this._fireConfigChanged();
    this.requestUpdate();
  }

  // Missing render methods that are referenced in render()
  
  _renderCoreOptions() {
    return html`<div class="section">
      <div class="section-title">⚙️ Core Options</div>
      <div class="config-row">
        <label>Title</label>
        <input type="text" .value=${this.config.title || ''} @input=${this._titleChanged} placeholder="Optional card title" />
      </div>
    </div>`;
  }

  _renderVideoOptions() {
    return html`<div class="section">
      <div class="section-title">🎬 Video Options</div>
      <div class="config-row">
        <label>Autoplay</label>
        <input type="checkbox" .checked=${this.config.video_autoplay || false} @change=${this._videoAutoplayChanged} />
      </div>
    </div>`;
  }

  _renderImageOptions() {
    return html`<div class="section">
      <div class="section-title">🖼️ Image Options</div>
      <div class="config-row">
        <label>Enable Image Zoom</label>
        <input type="checkbox" .checked=${this.config.enable_image_zoom || false} @change=${this._imageZoomChanged} />
      </div>
    </div>`;
  }

  _renderNavigationOptions() {
    return html`<div class="section">
      <div class="section-title">🧭 Navigation Options</div>
      <div class="config-row">
        <label>Enable Navigation Zones</label>
        <input type="checkbox" .checked=${this.config.enable_navigation_zones !== false} @change=${this._navigationZonesChanged} />
      </div>
    </div>`;
  }

  _renderMetadataOptions() {
    return html`<div class="section">
      <div class="section-title">📋 Metadata Display</div>
      <div class="config-row">
        <label>Show Folder Name</label>
        <input type="checkbox" .checked=${this.config.metadata?.show_folder !== false} @change=${this._metadataShowFolderChanged} />
      </div>
    </div>`;
  }

  _renderMediaIndexIntegration() {
    return html`<div class="section">
      <div class="section-title">🔌 Media Index Integration</div>
      ${this._renderMediaIndexSelector()}
    </div>`;
  }

  _renderActionButtons() {
    return html`<div class="section">
      <div class="section-title">⭐ Action Buttons</div>
      <div class="config-row">
        <label>Enable Favorite Button</label>
        <input type="checkbox" .checked=${this.config.action_buttons?.enable_favorite !== false} @change=${this._actionButtonsEnableFavoriteChanged} />
      </div>
    </div>`;
  }

  _renderFolderHierarchyOptions() {
    return html`<div class="section">
      <div class="section-title">📂 Folder Hierarchy Options</div>
      <div class="config-row">
        <label>Equal Probability Mode</label>
        <input type="checkbox" .checked=${this.config.equal_probability_mode === true} @change=${this._equalProbabilityModeChanged} />
      </div>
    </div>`;
  }

  _renderInteractionOptions() {
    return html`<div class="section">
      <div class="section-title">👆 Interactions</div>
      <div class="config-row">
        <label>Tap Action</label>
        <select @change=${this._tapActionChanged} .value=${this.config.tap_action?.action || 'none'}>
          <option value="none">No Action</option>
          <option value="more-info">More Info</option>
        </select>
      </div>
    </div>`;
  }

  _renderKioskModeOptions() {
    return html`<div class="section">
      <div class="section-title">🖼️ Kiosk Mode</div>
      <div class="config-row">
        <label>Kiosk Control Entity</label>
        <select @change=${this._kioskModeEntityChanged} .value=${this.config.kiosk_mode_entity || ''}>
          <option value="">Select Input Boolean...</option>
        </select>
      </div>
    </div>`;
  }

  // V5 mode change handler
  _v5ModeChanged(e) {
    const newMode = e.target.value;
    this._config = { 
      ...this._config, 
      media_source_type: newMode 
    };
    this.config = this._config;
    this._fireConfigChanged();
  }

  // V4 event handlers (working from v4)
  _titleChanged(e) {
    this._config = { ...this._config, title: e.target.value };
    this.config = this._config;
    this._fireConfigChanged();
  }

  _mediaTypeChanged(e) {
    this._config = { ...this._config, media_type: e.target.value };
    this.config = this._config;
    this._fireConfigChanged();
  }

  _aspectModeChanged(e) {
    this._config = { ...this._config, aspect_mode: e.target.value };
    this.config = this._config;
    this._fireConfigChanged();
  }

  _mediaPathChanged(e) {
    this._config = { ...this._config, media_path: e.target.value };
    
    // Auto-detect folder mode based on path
    const isFolder = e.target.value.endsWith('/') || (!e.target.value.includes('.') && e.target.value.length > 0);
    if (isFolder && !this._config.is_folder) {
      this._config.is_folder = true;
      this._config.folder_mode = 'random'; // default folder mode
    } else if (!isFolder && this._config.is_folder) {
      this._config.is_folder = false;
      delete this._config.folder_mode;
    }
    
    this.config = this._config;
    this._fireConfigChanged();
  }

  _autoRefreshChanged(e) {
    this._config = { ...this._config, auto_refresh_seconds: parseInt(e.target.value) || 0 };
    this.config = this._config;
    this._fireConfigChanged();
  }

  // Event handler stubs (will add proper implementations later)  
  _titleChanged(e) { this.config = { ...this.config, title: e.target.value }; this._fireConfigChanged(); }
  _videoAutoplayChanged(e) { this.config = { ...this.config, video_autoplay: e.target.checked }; this._fireConfigChanged(); }
  _imageZoomChanged(e) { this.config = { ...this.config, enable_image_zoom: e.target.checked }; this._fireConfigChanged(); }
  _navigationZonesChanged(e) { this.config = { ...this.config, enable_navigation_zones: e.target.checked }; this._fireConfigChanged(); }
  _metadataShowFolderChanged(e) { 
    this.config = { ...this.config, metadata: { ...this.config.metadata, show_folder: e.target.checked } }; 
    this._fireConfigChanged(); 
  }
  _actionButtonsEnableFavoriteChanged(e) { 
    this.config = { ...this.config, action_buttons: { ...this.config.action_buttons, enable_favorite: e.target.checked } }; 
    this._fireConfigChanged(); 
  }
  _equalProbabilityModeChanged(e) { this.config = { ...this.config, equal_probability_mode: e.target.checked }; this._fireConfigChanged(); }
  _tapActionChanged(e) { 
    this.config = { ...this.config, tap_action: { ...this.config.tap_action, action: e.target.value } }; 
    this._fireConfigChanged(); 
  }
  _kioskModeEntityChanged(e) { this.config = { ...this.config, kiosk_mode_entity: e.target.value }; this._fireConfigChanged(); }

  // Fire configuration change event
  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this.config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }
}

// Register the editor (only if not already registered)
if (!customElements.get('media-card-v5-editor')) {
  customElements.define('media-card-v5-editor', MediaCardV5Editor);
  console.log('✅ MediaCardV5Editor registered successfully');
} else {
  console.log('ℹ️ MediaCardV5Editor already registered, skipping');
}

// Add getConfigElement method to main card
MediaCardV5.getConfigElement = () => {
  return document.createElement('media-card-v5-editor');
};

// Register with Home Assistant (exactly like v4 card)
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'media-card-v5',
  name: 'Media Card v5',
  description: 'Display images and videos with unified provider architecture',
  preview: true,
  documentationURL: 'https://github.com/markaggar/ha-media-card'
});

console.log('🚀 Home Assistant Media Card v5.0 loaded successfully!');
console.log('📦 MediaCardV5 class:', MediaCardV5);
console.log('🔧 Custom elements defined:', customElements.get('media-card-v5'));
console.log('📋 Custom cards registry:', window.customCards);
console.log('🔍 Looking for media-card-v5:', window.customCards.find(card => card.type === 'media-card-v5'));
console.log('📝 All card types:', window.customCards.map(card => card.type));