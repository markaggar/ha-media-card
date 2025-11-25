/** 
 * Media Card v5.3.0
 */

// Import Lit from CDN for standalone usage
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

// Shared utility functions for media detection
const MediaUtils = {
  detectFileType(filePath) {
    if (!filePath) return null;
    
    let cleanPath = filePath;
    
    // Strip Immich pipe-delimited MIME type suffix (e.g., "file.jpg|image/jpeg" -> "file.jpg")
    if (cleanPath.includes('|')) {
      cleanPath = cleanPath.split('|')[0];
    }
    
    // Strip query parameters
    if (cleanPath.includes('?')) {
      cleanPath = cleanPath.split('?')[0];
    }
    
    const fileName = cleanPath.split('/').pop() || cleanPath;
    let cleanFileName = fileName;
    if (fileName.endsWith('_shared')) {
      cleanFileName = fileName.replace('_shared', '');
    }
    
    const extension = cleanFileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(extension)) {
      return 'image';
    }
    
    return null;
  }
};

/**
 * V5 Core Infrastructure Classes
 */

/**
/**
 * VideoManager - Handle video playback and auto-advance
 * Copied from V4 (lines 4400-4453)
 * 
 * Manages video pause/resume events and auto-advance on video end
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
    let filename = path.split('/').pop() || path;
    
    // Strip Immich's pipe-delimited MIME type suffix (e.g., "file.jpg|image/jpeg" -> "file.jpg")
    if (filename.includes('|')) {
      filename = filename.split('|')[0];
    }
    
    return filename;
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
    
    // Normalize Immich pipe-delimited paths to slash-delimited
    // Immich uses: media-source://immich/uuid|albums|uuid|uuid|filename.jpg|image/jpeg
    // We need: media-source://immich/uuid/albums/uuid/uuid/filename.jpg
    let normalizedPath = mediaPath;
    if (normalizedPath.includes('|')) {
      // Only strip the last segment if it looks like a MIME type (contains '/')
      const lastPipeIndex = normalizedPath.lastIndexOf('|');
      const afterLastPipe = normalizedPath.substring(lastPipeIndex + 1);
      if (afterLastPipe.includes('/')) {
        // It's a MIME type, strip it
        normalizedPath = normalizedPath.substring(0, lastPipeIndex).replace(/\|/g, '/');
      } else {
        // No MIME type, just replace all pipes
        normalizedPath = normalizedPath.replace(/\|/g, '/');
      }
    }
    
    // Use extractFilename helper to get clean filename (now from normalized path)
    let filename = MediaProvider.extractFilename(normalizedPath);
    
    // Decode URL encoding (%20 -> space, etc.)
    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      console.warn('Failed to decode filename:', filename, e);
    }
    
    metadata.filename = filename;
    
    // Extract folder path (parent directory/directories)
    const pathParts = normalizedPath.split('/');
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
   * Enhanced to extract time components when present
   */
  static extractDateFromFilename(filename) {
    if (!filename) return null;
    
    // Common date+time patterns in filenames
    const patterns = [
      // YYYYMMDDHHmmSS format (e.g., 20250920211023 - no separators)
      /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
      // YYYYMMDD_HHMMSS format (e.g., 20250920_211023)
      /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
      // YYYY-MM-DD_HH-MM-SS format
      /(\d{4})-(\d{2})-(\d{2})[_T\s](\d{2})[:-](\d{2})[:-](\d{2})/,
      // YYYY-MM-DD format (date only)
      /(\d{4})-(\d{2})-(\d{2})/,
      // YYYYMMDD format (date only)
      /(\d{4})(\d{2})(\d{2})/,
      // DD-MM-YYYY format (date only)
      /(\d{2})-(\d{2})-(\d{4})/
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        try {
          let year, month, day, hour = 0, minute = 0, second = 0;
          
          if (match.length > 6) {
            // Date + time pattern matched
            if (match[1].length === 4) {
              // YYYY-MM-DD format with time
              year = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              day = parseInt(match[3]);
              hour = parseInt(match[4]);
              minute = parseInt(match[5]);
              second = parseInt(match[6]);
            }
          } else if (match[1].length === 4) {
            // YYYY-MM-DD or YYYYMMDD (date only)
            year = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            day = parseInt(match[3]);
          } else {
            // DD-MM-YYYY (date only)
            day = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            year = parseInt(match[3]);
          }
          
          return new Date(year, month, day, hour, minute, second);
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
    
    // Step 2: Enrich with media_index EXIF data if hass is available
    // Try to call media_index even if not explicitly configured as media source
    // This allows metadata enrichment for subfolder/simple folder modes
    if (hass) {
      try {
        const enrichedMetadata = await MediaIndexHelper.fetchFileMetadata(
          hass,
          config,  // Pass full config
          mediaPath
        );
        
        if (enrichedMetadata) {
          // Merge path-based and EXIF metadata (EXIF takes precedence)
          metadata = { ...metadata, ...enrichedMetadata };
        }
      } catch (error) {
        console.warn('⚠️ Failed to fetch media_index metadata (service may not be installed):', error);
        // Fall back to path-based metadata only
      }
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
    
    try {
      // Build WebSocket call to get_file_metadata service
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_file_metadata',
        service_data: {},  // Will populate based on path type
        return_response: true
      };
      
      // V5.3 / Media Index v1.4+: Use media_source_uri when path is a URI, file_path otherwise
      if (filePath.startsWith('media-source://')) {
        wsCall.service_data.media_source_uri = filePath;
      } else {
        wsCall.service_data.file_path = filePath;
      }
      
      // If user specified a media_index entity, add target to route to correct instance
      if (config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: config.media_index.entity_id
        };
      }
      
      const wsResponse = await hass.callWS(wsCall);
      
      // WebSocket response can be wrapped in different ways
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;
      
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
    // Return the base item - timestamp will be added during URL resolution if needed
    return this.currentItem;
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
      _debugMode: !!this.config.debug_mode,  // Controlled via YAML config
      _backgroundPaused: false,
      _log: (...args) => {
        if (this.config.debug_mode) {
          console.log('[FolderProvider]', ...args);
        }
      },
      
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
    
    // V5 FIX: Convert filesystem path to media-source:// URI if needed for browse_media API
    // When useMediaIndex is false, SubfolderQueue uses browse_media which requires media-source:// URIs
    let mediaPath = this.config.folder?.path || '';
    if (mediaPath && !mediaPath.startsWith('media-source://')) {
      // Convert /media/Photo/PhotoLibrary → media-source://media_source/media/Photo/PhotoLibrary
      mediaPath = `media-source://media_source${mediaPath}`;
    }
    
    return {
      media_path: mediaPath,
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
    
    this.cardAdapter._log('Initialize - mode:', mode, 'recursive:', recursive);
    this.cardAdapter._log('Config:', this.config);
    
    // V5 ARCHITECTURE: Check if media_index should be used for discovery
    // Default: true when media_index is configured (use_media_index_for_discovery defaults to true)
    const useMediaIndex = this.config.folder?.use_media_index_for_discovery !== false && 
                          MediaProvider.isMediaIndexActive(this.config);
    
    this.cardAdapter._log('useMediaIndex:', useMediaIndex);
    
    // SEQUENTIAL MODE - Ordered iteration through files
    if (mode === 'sequential') {
      if (useMediaIndex) {
        // Full sequential mode with database ordering
        this.cardAdapter._log('Using SequentialMediaIndexProvider for ordered queries');
        this.sequentialProvider = new SequentialMediaIndexProvider(this.config, this.hass);
        const success = await this.sequentialProvider.initialize();
        
        if (!success) {
          console.warn('[FolderProvider] SequentialMediaIndexProvider initialization failed');
          return false;
        }
        
        this.cardAdapter._log('✅ SequentialMediaIndexProvider initialized');
        return true;
        
      } else {
        // V5 FEATURE: Filesystem sequential mode with recursive support
        // Use case: Integration sources (Reolink cameras, Synology Photos) with hierarchical folders
        this.cardAdapter._log('Using SubfolderQueue in sequential mode (filesystem with recursive scan)');
        
        // V5: Enable recursive scanning for sequential filesystem mode
        const adaptedConfig = this._adaptConfigForV4();
        adaptedConfig.subfolder_queue.enabled = true; // Always use queue for sequential
        
        // Detect if this is Immich or other integration (not filesystem through media_source)
        const folderPath = this.config.folder?.path || '';
        const isImmich = folderPath.startsWith('media-source://immich');
        
        // Immich and similar integrations: Don't restrict scan_depth (let media browser handle it)
        // Filesystem paths (including media-source://media_source/...): Respect recursive setting
        if (isImmich) {
          // Immich albums - don't restrict depth, let media browser handle album hierarchy
          adaptedConfig.subfolder_queue.scan_depth = this.config.folder?.scan_depth || null;
        } else {
          // Filesystem paths (direct /media/ or via media_source) - respect recursive setting
          adaptedConfig.subfolder_queue.scan_depth = recursive ? (this.config.folder?.scan_depth || null) : 0;
        }
        
        // Use slideshow_window as scan limit (performance control)
        adaptedConfig.slideshow_window = this.config.slideshow_window || 1000;
        
        this.cardAdapter._log('Sequential scan config:', {
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
        
        // Skip post-scan sort for sequential mode - files already sorted during hierarchical scan
        // Sequential mode sorts by extracted Reolink timestamps (or filenames) during file processing
        // Post-scan sort by date_taken would reorder since EXIF dates aren't available yet
        this.cardAdapter._log('✅ SubfolderQueue initialized (sequential mode - preserving scan order)');
        return true;
      }
    }
    
    // RANDOM MODE - Random selection
    if (mode === 'random') {
      // V5.3: Use MediaIndexProvider when enabled - NO SILENT FALLBACK
      if (useMediaIndex) {
        this.cardAdapter._log('Using MediaIndexProvider for discovery');
        this.mediaIndexProvider = new MediaIndexProvider(this.config, this.hass, this.card);
        const success = await this.mediaIndexProvider.initialize();
        
        if (!success) {
          // V5.3: NEVER fallback silently - always show error when Media Index explicitly enabled
          const filters = this.config.filters || {};
          const hasFilters = filters.favorites || filters.date_range?.start || filters.date_range?.end;
          
          if (hasFilters) {
            console.error('[FolderProvider] ❌ Media Index returned no items due to active filters');
            console.error('[FolderProvider] 💡 Adjust your filters or set use_media_index_for_discovery: false');
            throw new Error('No items match filter criteria. Try adjusting your filters.');
          } else {
            console.error('[FolderProvider] ❌ Media Index initialization failed');
            console.error('[FolderProvider] 💡 Check Media Index entity exists and is populated, or set use_media_index_for_discovery: false');
            throw new Error('Media Index initialization failed. Check entity configuration.');
          }
        }
        
        this.cardAdapter._log('✅ MediaIndexProvider initialized');
        return true;
      }
      
      // Use SubfolderQueue (filesystem scanning) only when Media Index explicitly disabled
      if (!this.mediaIndexProvider) {
        this.cardAdapter._log('Using SubfolderQueue for filesystem scanning (recursive:', recursive, ')');
        
        // V5 RECONNECTION: Check if card has existing SubfolderQueue from reconnection
        if (this.card && this.card._existingSubfolderQueue) {
          this.cardAdapter._log('🔗 Using reconnected SubfolderQueue from registry');
          this.subfolderQueue = this.card._existingSubfolderQueue;
          this.card._existingSubfolderQueue = null; // Clear reference after using
          
          // Update cardAdapter reference in reconnected queue
          this.subfolderQueue.card = this.cardAdapter;
          this.cardAdapter._log('✅ SubfolderQueue reconnected with', this.subfolderQueue.queue.length, 'items');
          return true;
        }
        
        // Set scan_depth based on recursive setting in existing config
        // recursive: false = scan_depth: 0 (only base folder)
        // recursive: true = scan_depth: null (unlimited depth, or config value)
        // Defensive: ensure subfolder_queue exists
        if (!this.cardAdapter.config.subfolder_queue) {
          this.cardAdapter.config.subfolder_queue = {};
        }
        if (!recursive) {
          this.cardAdapter.config.subfolder_queue.enabled = true; // Still use queue, but limit depth
          this.cardAdapter.config.subfolder_queue.scan_depth = 0; // Only scan base folder
          this.cardAdapter._log('Non-recursive mode: scan_depth = 0 (base folder only)');
        } else {
          this.cardAdapter.config.subfolder_queue.enabled = true;
          this.cardAdapter.config.subfolder_queue.scan_depth = this.config.folder?.scan_depth || null;
          this.cardAdapter._log('Recursive mode: scan_depth =', this.cardAdapter.config.subfolder_queue.scan_depth || 'unlimited');
        }
        this.cardAdapter._log('Adapted config for SubfolderQueue:', this.cardAdapter.config);
        
        // Create SubfolderQueue instance with V4-compatible card adapter
        this.subfolderQueue = new SubfolderQueue(this.cardAdapter);
        this.cardAdapter._log('SubfolderQueue created, calling initialize...');
        this.cardAdapter._log('cardAdapter config:', this.cardAdapter.config);
        this.cardAdapter._log('cardAdapter._debugMode:', this.cardAdapter._debugMode);
        
        const success = await this.subfolderQueue.initialize();
        
        this.cardAdapter._log('Initialize returned:', success);
        this.cardAdapter._log('Queue length after initialize:', this.subfolderQueue.queue.length);
        this.cardAdapter._log('Discovered folders:', this.subfolderQueue.discoveredFolders.length);
        
        if (!success) {
          console.warn('[FolderProvider] SubfolderQueue initialization failed');
          return false;
        }
        
        this.cardAdapter._log('✅ SubfolderQueue initialized - enrichment will happen on-demand');
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
    
    this.cardAdapter._log('Sorting queue by', orderBy, direction);
    
    // If media_index is active AND we're sorting by EXIF data, enrich items first
    // Otherwise, enrichment happens on-demand when displaying items
    const needsUpfrontEnrichment = MediaProvider.isMediaIndexActive(this.config) && 
                                   (orderBy === 'date_taken' || orderBy === 'modified_time');
    
    if (needsUpfrontEnrichment) {
      this.cardAdapter._log('Enriching items with EXIF data for sorting by', orderBy);
      
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
      
      this.cardAdapter._log('Enriched', enrichedCount, 'items for sorting');
      this.cardAdapter._log('Sample item:', this.subfolderQueue.queue[0]);
    } else {
      this.cardAdapter._log('Skipping upfront enrichment - will enrich on-demand when displaying');
    }
    
    // Use shared sorting method in SubfolderQueue
    this.subfolderQueue._sortQueue();
    
    this.cardAdapter._log('Queue sorted:', this.subfolderQueue.queue.length, 'items');
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
        this.cardAdapter._log('🔍 Attempting to enrich item:', item.media_content_id);
        
        const mediaUri = item.media_content_id;
        this.cardAdapter._log('📂 Media URI:', mediaUri);
        
        if (mediaUri) {
          try {
            // V5.2: Call get_file_metadata with media_source_uri (no path conversion)
            const wsCall = {
              type: 'call_service',
              domain: 'media_index',
              service: 'get_file_metadata',
              service_data: { media_source_uri: mediaUri },
              return_response: true
            };
            
            // Add target entity_id if configured (required for multi-instance setups)
            if (this.config.media_index?.entity_id) {
              wsCall.target = {
                entity_id: this.config.media_index.entity_id
              };
            }
            
            this.cardAdapter._log('📡 Calling get_file_metadata with:', wsCall);
            const response = await this.hass.callWS(wsCall);
            this.cardAdapter._log('📥 Service response:', response);
            
            if (response?.response && !response.response.error) {
              // Flatten EXIF data to match MediaIndexProvider format
              const serviceMetadata = response.response;
              const exif = serviceMetadata.exif || {};
              
              // V5.2: Use path from service response (contains filesystem path)
              const filePath = serviceMetadata.path || '';
              
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
              this.cardAdapter._log('✅ Enriched item with media_index metadata:', item.metadata);
            } else {
              console.warn('[FolderProvider] ⚠️ Service returned error or no metadata:', response?.response);
              // Fallback to extracting path from URI
              const pathFromUri = mediaUri.replace('media-source://media_source', '');
              item.metadata = MediaProvider.extractMetadataFromPath(pathFromUri);
            }
          } catch (error) {
            // Fallback to path-based metadata if service call fails
            console.error('[FolderProvider] ❌ Could not fetch media_index metadata:', error);
            // Extract path from URI for metadata fallback
            const pathFromUri = mediaUri.replace('media-source://media_source', '');
            item.metadata = MediaProvider.extractMetadataFromPath(pathFromUri);
          }
        } else {
          console.warn('[FolderProvider] ⚠️ Could not extract file path from media_content_id');
        }
      } else {
        if (!item) {
          console.warn('[FolderProvider] ⚠️ SubfolderQueue returned null item');
        } else if (!MediaProvider.isMediaIndexActive(this.config)) {
          this.cardAdapter._log('ℹ️ Media index not active, skipping metadata enrichment');
        }
      }
      
      return item;
    }
    
    console.warn('[FolderProvider] getNext() called but no provider initialized');
    return null;
  }

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
    
    // V5.3: Entity subscription for dynamic filter updates
    this._entitySubscriptions = []; // Track subscribed entity IDs
    this._entityUnsubscribe = null; // Unsubscribe function
    this._lastFilterValues = {}; // Track last known filter values for change detection
  }
  
  /**
   * Clean up subscriptions when provider is destroyed
   */
  dispose() {
    if (this._entityUnsubscribe) {
      this._log('🧹 Unsubscribing from entity state changes');
      this._entityUnsubscribe();
      this._entityUnsubscribe = null;
    }
  }
  
  /**
   * V5.3: Dispatch queue statistics event for template sensor integration
   */
  _dispatchQueueStats() {
    if (!this.card) return;
    
    const filters = this.config.filters || {};
    const activeFilters = [];
    
    if (filters.favorites) activeFilters.push('favorites');
    if (filters.date_range?.start || filters.date_range?.end) activeFilters.push('date_range');
    
    const stats = {
      queue_size: this.queue.length,
      queue_capacity: this.queueSize,
      filters_active: activeFilters,
      filter_config: {
        favorites: filters.favorites || null,
        date_from: filters.date_range?.start || null,
        date_to: filters.date_range?.end || null
      },
      timestamp: new Date().toISOString()
    };
    
    this._log('📊 Queue stats:', stats);
    
    // V5.3: Fire event through Home Assistant event bus (shows in Developer Tools)
    if (this.hass && this.hass.connection && this.hass.connection.sendMessage) {
      try {
        const promise = this.hass.connection.sendMessage({
          type: 'fire_event',
          event_type: 'media_card_queue_stats',
          event_data: stats
        });
        
        // Only add catch handler if sendMessage returned a promise
        if (promise && typeof promise.catch === 'function') {
          promise.catch(err => {
            console.warn('[MediaIndexProvider] Failed to fire queue stats event:', err);
          });
        }
      } catch (err) {
        console.warn('[MediaIndexProvider] Error firing queue stats event:', err);
      }
    }
    
    // Also dispatch DOM event for backward compatibility
    if (this.card) {
      const event = new CustomEvent('media-card-queue-stats', {
        detail: stats,
        bubbles: true,
        composed: true
      });
      this.card.dispatchEvent(event);
    }
  }

  _log(...args) {
    if (this.config?.debug_mode) {
      console.log('[MediaIndexProvider]', ...args);
    }
  }

  /**
   * Resolve filter value - supports both direct values and entity references
   * @param {*} configValue - Value from config (direct value or entity_id)
   * @param {string} expectedType - Expected type: 'boolean', 'date', 'number', 'string'
   * @returns {Promise<*>} Resolved value or null
   */
  async _resolveFilterValue(configValue, expectedType) {
    if (configValue === null || configValue === undefined) {
      return null;
    }
    
    // If it's not a string, return as-is (direct value)
    if (typeof configValue !== 'string') {
      return configValue;
    }
    
    // Check if it looks like an entity_id (contains a dot)
    if (!configValue.includes('.')) {
      // Direct string value (e.g., date string "2024-01-01")
      return configValue;
    }
    
    // It's an entity_id - resolve it
    const state = this.hass?.states[configValue];
    if (!state) {
      this._log(`⚠️ Filter entity not found: ${configValue}`);
      return null;
    }
    
    const domain = state.entity_id.split('.')[0];
    
    // Resolve based on expected type and domain
    switch (domain) {
      case 'input_boolean':
        return state.state === 'on';
      
      case 'input_datetime':
        // Can be date-only or datetime
        // state.state format: "2024-01-01" or "2024-01-01 12:00:00"
        const dateValue = state.state.split(' ')[0]; // Extract date part
        return dateValue || null;
      
      case 'input_number':
        return parseFloat(state.state) || null;
      
      case 'input_text':
      case 'input_select':
        return state.state || null;
      
      case 'sensor':
        // Sensors can provide various types - infer from expected type
        if (expectedType === 'boolean') {
          return state.state === 'on' || state.state === 'true' || state.state === '1';
        } else if (expectedType === 'number') {
          return parseFloat(state.state) || null;
        } else {
          return state.state || null;
        }
      
      default:
        this._log(`⚠️ Unsupported entity domain for filter: ${domain}`);
        return null;
    }
  }

  async initialize() {
    this._log('Initializing...');
    
    // Check if media_index is configured
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('[MediaIndexProvider] Media index not configured');
      return false;
    }
    
    // Initial query to fill queue
    const items = await this._queryMediaIndex(this.queueSize);
    
    // V5.3: Distinguish between service failure (null) vs no results (empty array)
    if (items === null) {
      // Service call failed - this is a real error
      console.error('[MediaIndexProvider] ❌ Media Index service call failed');
      return false;
    }
    
    if (items.length === 0) {
      // Service succeeded but returned no items
      // V5.3: Check if filters are active - if so, this is likely filter exclusion
      const filters = this.config.filters || {};
      
      // Check if any filter has an actual value (not just undefined/null/false/empty string)
      const hasFavoritesFilter = filters.favorites === true || (typeof filters.favorites === 'string' && filters.favorites.trim().length > 0);
      const hasDateFromFilter = filters.date_range?.start && filters.date_range.start.trim().length > 0;
      const hasDateToFilter = filters.date_range?.end && filters.date_range.end.trim().length > 0;
      const hasFilters = hasFavoritesFilter || hasDateFromFilter || hasDateToFilter;
      
      if (hasFilters) {
        // Filters are active - this is expected behavior, not an error
        console.warn('[MediaIndexProvider] ⚠️ No items match filter criteria:', {
          favorites: filters.favorites || false,
          date_range: filters.date_range || 'none'
        });
        console.warn('[MediaIndexProvider] 💡 Try adjusting your filters or verify files match criteria');
        // Still return false to prevent display, but with clear user feedback
        return false;
      } else {
        // No filters but still no items - collection might be empty
        console.warn('[MediaIndexProvider] ⚠️ No items in collection (no filters active)');
        return false;
      }
    }
    
    this.queue = items;
    this._log('✅ Initialized with', this.queue.length, 'items');
    
    // V5.3: Dispatch queue statistics for template sensors
    this._dispatchQueueStats();
    
    // V5.3: Subscribe to filter entity state changes for dynamic updates
    await this._subscribeToFilterEntities();
    
    return true;
  }
  
  /**
   * V5.3: Subscribe to entity state changes for dynamic filter updates
   * Detects filter entity IDs and subscribes to their state changes
   */
  async _subscribeToFilterEntities() {
    const filters = this.config.filters || {};
    const entityIds = [];
    
    // Collect entity IDs from filter configuration
    if (filters.favorites && typeof filters.favorites === 'string' && filters.favorites.includes('.')) {
      entityIds.push(filters.favorites);
    }
    if (filters.date_range?.start && typeof filters.date_range.start === 'string' && filters.date_range.start.includes('.')) {
      entityIds.push(filters.date_range.start);
    }
    if (filters.date_range?.end && typeof filters.date_range.end === 'string' && filters.date_range.end.includes('.')) {
      entityIds.push(filters.date_range.end);
    }
    
    if (entityIds.length === 0) {
      this._log('No filter entities to subscribe to');
      return;
    }
    
    this._entitySubscriptions = entityIds;
    this._log('📡 Subscribing to filter entities:', entityIds);
    
    // Store initial filter values for change detection
    this._lastFilterValues = {
      favorites: await this._resolveFilterValue(filters.favorites, 'boolean'),
      date_from: await this._resolveFilterValue(filters.date_range?.start, 'date'),
      date_to: await this._resolveFilterValue(filters.date_range?.end, 'date')
    };
    
    this._log('📝 Initial filter values:', this._lastFilterValues);
    
    // Subscribe to state changes - use subscribeEvents but filter to our entities only
    try {
      this._entityUnsubscribe = await this.hass.connection.subscribeEvents(
        async (event) => {
          // Only process state_changed events for our filter entities
          const changedEntityId = event.data?.entity_id;
          if (!changedEntityId || !this._entitySubscriptions.includes(changedEntityId)) {
            return; // Ignore non-filter entities
          }
          
          const newState = event.data?.new_state?.state;
          this._log('🔄 Filter entity changed:', changedEntityId, '→', newState);
          
          // CRITICAL: Update hass.states immediately with new state from event
          // The state_changed event arrives BEFORE hass.states is updated
          if (event.data?.new_state) {
            this.hass.states[changedEntityId] = event.data.new_state;
          }
          
          // Resolve current filter values (now using updated hass.states)
          const currentFilters = {
            favorites: await this._resolveFilterValue(filters.favorites, 'boolean'),
            date_from: await this._resolveFilterValue(filters.date_range?.start, 'date'),
            date_to: await this._resolveFilterValue(filters.date_range?.end, 'date')
          };
          
          this._log('🔍 Resolved filter values:', currentFilters, 'vs last:', this._lastFilterValues);
              
              // Check if filter values actually changed
              const filtersChanged = 
                currentFilters.favorites !== this._lastFilterValues.favorites ||
                currentFilters.date_from !== this._lastFilterValues.date_from ||
                currentFilters.date_to !== this._lastFilterValues.date_to;
          
          if (filtersChanged) {
            this._log('✨ Filter values changed, reloading queue:', currentFilters);
            this._lastFilterValues = currentFilters;
            
            // V5.3: Clear EVERYTHING - queue, history, current media
            this.queue = [];
            
            // Clear card history so we don't show old filtered items
            if (this.card) {
              this._log('🗑️ Clearing card state due to filter change');
              this.card.history = [];
              this.card.historyPosition = -1;
              this.card.currentMedia = null;
              // V5.3: Also clear navigation queue so it rebuilds from new provider queue
              this.card.navigationQueue = [];
              this.card.navigationIndex = -1;
              this.card.isNavigationQueuePreloaded = false;
            }
            
            const newItems = await this._queryMediaIndex(this.queueSize);
            
            if (newItems && newItems.length > 0) {
              this.queue = newItems;
              this._log('✅ Queue reloaded with', this.queue.length, 'items');
              
              // V5.3: Dispatch updated queue statistics
              this._dispatchQueueStats();
              
              // Load first item from new queue
              if (this.card) {
                this._log('🔄 Loading first item with new filters');
                // Clear error state in case it was set
                this.card._errorState = null;
                this.card.isLoading = true;
                this.card.requestUpdate();
                
                if (this.card._loadNext) {
                  await this.card._loadNext();
                }
                
                this.card.isLoading = false;
                this.card.requestUpdate();
                this._log('✅ Card updated with new filtered media');
              }
            } else {
              this._log('⚠️ No items match new filter criteria');
              // Card will show error message via existing error handling
              if (this.card) {
                this.card._errorState = 'No items match filter criteria. Try adjusting your filters.';
                this.card.currentMedia = null;
                this.card.isLoading = false;
                this.card.requestUpdate();
              }
            }
          } else {
            this._log('Filter entity changed but values are same, no reload needed');
          }
        },
        'state_changed'
      );
      
      this._log('✅ Subscribed to filter entity state changes (filtering in callback)');
    } catch (error) {
      console.warn('[MediaIndexProvider] Failed to subscribe to entity changes:', error);
    }
  }

  async getNext() {
    // Refill queue if running low
    if (this.queue.length < 10) {
      this._log('Queue low, refilling...', 'current queue size:', this.queue.length);
      
      // V5 FIX: Track media_content_ids already in queue to avoid duplicates
      // V5 URI: Now uses URIs instead of paths for deduplication
      const existingPaths = new Set(this.queue.map(item => item.media_source_uri || item.path));
      this._log('Existing media IDs in queue:', existingPaths.size);
      
      // V5 FIX: Also exclude paths in navigation history
      const historyPaths = new Set();
      if (this.card && this.card.history) {
        this.card.history.forEach(historyItem => {
          if (historyItem.media_content_id) {
            historyPaths.add(historyItem.media_content_id);
          }
        });
        this._log('Paths in history:', historyPaths.size);
      }
      
      // V5 OPTIMIZATION: Skip priority_new_files if recent cache is exhausted
      // This avoids wasteful double service calls when we know recent files are depleted
      const shouldUsePriority = this.config.folder?.priority_new_files && !this.recentFilesExhausted;
      
      if (!shouldUsePriority && this.config.folder?.priority_new_files) {
        this._log('⚡ Skipping priority_new_files query - recent cache exhausted (saves service call)');
      }
      
      const items = await this._queryMediaIndex(this.queueSize, shouldUsePriority ? null : false);
      if (items && items.length > 0) {
        // V5 FIX: Filter out items already in queue OR history to avoid duplicates
        // V5 URI: Compare using media_source_uri when available
        const newItems = items.filter(item => {
          const mediaId = item.media_source_uri || item.path;
          return !existingPaths.has(mediaId) && !historyPaths.has(mediaId);
        });
        const filteredCount = items.length - newItems.length;
        const filteredPercent = (filteredCount / items.length) * 100;
        this._log('Filtered', filteredCount, 'duplicate/history items (', filteredPercent.toFixed(1), '%)');
        
        // V5 OPTIMIZATION: Track consecutive high filter rates to detect cache exhaustion
        if (filteredPercent > 80) {
          this.consecutiveHighFilterCount++;
          this._log('📊 High filter rate detected (', this.consecutiveHighFilterCount, '/', this.EXHAUSTION_THRESHOLD, ' consecutive)');
          
          // Mark recent cache as exhausted after threshold
          if (this.consecutiveHighFilterCount >= this.EXHAUSTION_THRESHOLD && !this.recentFilesExhausted) {
            this.recentFilesExhausted = true;
            this._log('🚫 Recent file cache EXHAUSTED - will skip priority_new_files on future queries');
          }
        } else {
          // Good query - reset exhaustion tracking
          if (this.consecutiveHighFilterCount > 0) {
            this._log('✅ Good query (low filter rate) - resetting exhaustion counter');
          }
          this.consecutiveHighFilterCount = 0;
          this.recentFilesExhausted = false; // Reset exhaustion flag
        }
        
        // V5 SMART RETRY: If >80% filtered and priority_new_files was enabled, retry without it
        // This handles case where all recent files are in history, need non-recent random files
        // BUT: Only retry if we haven't already skipped priority_new_files due to exhaustion
        if (filteredPercent > 80 && shouldUsePriority && this.config.folder?.priority_new_files) {
          this._log('🔄 Most items filtered! Retrying with priority_new_files=false to get non-recent random files');
          const nonRecentItems = await this._queryMediaIndex(this.queueSize, false); // false = disable priority
          
          if (nonRecentItems && nonRecentItems.length > 0) {
            const additionalItems = nonRecentItems.filter(item => {
              const mediaId = item.media_source_uri || item.path;
              return !existingPaths.has(mediaId) && !historyPaths.has(mediaId);
            });
            this._log('Retry got', additionalItems.length, 'non-recent items');
            newItems.push(...additionalItems);
          }
        }
        
        if (newItems.length > 0) {
          // V5: Prepend new items to queue (priority files come first from backend)
          this.queue.unshift(...newItems);
          this._log('Refilled queue with', newItems.length, 'items, now', this.queue.length, 'total');
        } else {
          this._log('All items were duplicates/history and retry failed - queue not refilled');
        }
      }
    }
    
    // Return next item from queue
    if (this.queue.length > 0) {
      const item = this.queue.shift();
      
      // Extract metadata using MediaProvider helper (V5 architecture)
      // V4 code already includes EXIF fields in item, so we merge path-based + EXIF
      const pathMetadata = MediaProvider.extractMetadataFromPath(item.path);
      
      // V5 URI WORKFLOW: Use media_source_uri from Media Index when available
      // Media Index v1.1.0+ provides both path and media_source_uri
      // Fallback to path for backward compatibility
      const mediaId = item.media_source_uri || item.path;
      
      return {
        // V5: Use URI for media_content_id (Media Index v1.1.0+ provides media_source_uri)
        // URL resolution happens separately in card's _resolveMediaUrl()
        media_content_id: mediaId,
        media_content_type: MediaUtils.detectFileType(item.path) || 'image',
        metadata: {
          ...pathMetadata,
          // EXIF data from media_index backend (V4 pattern)
          path: item.path, // V4: Store filesystem path in metadata for logging/fallback
          media_source_uri: item.media_source_uri, // V5: Store URI for service calls
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
    
    this._log('Queue empty, no items to return');
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
      this._log('🔍 Querying media_index for', count, 'random items...');
      
      // V5.2: Pass folder path as-is - Media Index v1.1.0+ handles URI ↔ path conversion
      // Config can be:
      //   - media-source://media_source/local/folder (Media Index will convert to /config/www/local/folder)
      //   - /media/Photo/PhotoLibrary (direct filesystem path)
      // Media Index uses media_source_uri config to do the mapping
      let folderFilter = null;
      if (this.config.folder?.path) {
        folderFilter = this.config.folder.path;
        this._log('🔍 Filtering by folder (URI or path):', folderFilter);
      }
      
      // V4 CODE: Call media_index.get_random_items service with return_response via WebSocket
      // CRITICAL: Use config.media_type (user's preference), NOT current item's type
      const configuredMediaType = this.config.media_type || 'all';
      
      // V5 FEATURE: Priority new files parameters (with override for smart retry)
      const priorityNewFiles = forcePriorityMode !== null ? forcePriorityMode : (this.config.folder?.priority_new_files || false);
      const thresholdSeconds = this.config.folder?.new_files_threshold_seconds || 3600;
      
      this._log('🆕 Priority new files config:', {
        enabled: priorityNewFiles,
        forced: forcePriorityMode !== null,
        threshold: thresholdSeconds,
        'config.folder': this.config.folder
      });
      
      // V5.3: Extract and resolve filter values from config
      // Supports both direct values (favorites: true) and entity references (favorites: input_boolean.show_favorites)
      const filters = this.config.filters || {};
      const favoritesOnly = await this._resolveFilterValue(filters.favorites, 'boolean');
      const dateFrom = await this._resolveFilterValue(filters.date_range?.start, 'date');
      const dateTo = await this._resolveFilterValue(filters.date_range?.end, 'date');
      
      if (favoritesOnly || dateFrom || dateTo) {
        this._log('🔍 Active filters:', {
          favorites_only: favoritesOnly,
          date_from: dateFrom,
          date_to: dateTo
        });
      }
      
      // V4 CODE: Build WebSocket call with optional target for multi-instance support
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_random_items',
        service_data: {
          count: count,
          folder: folderFilter,
          recursive: this.config.folder?.recursive !== false,
          // Use configured media type preference
          file_type: configuredMediaType === 'all' ? undefined : configuredMediaType,
          // V5.3: Favorites filter (uses EXIF is_favorited field)
          favorites_only: favoritesOnly || undefined,
          // V5.3: Date range filter (uses EXIF date_taken with fallback to created_time)
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
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
        this._log('🎯 Targeting specific media_index entity:', this.config.media_index.entity_id);
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
        this._log('✅ Received', response.items.length, 'items from media_index');
        
        // V4 CODE: Filter out excluded files (moved to _Junk/_Edit) AND unsupported formats BEFORE processing
        const filteredItems = response.items.filter(item => {
          const isExcluded = this.excludedFiles.has(item.path);
          if (isExcluded) {
            this._log(`⏭️ Filtering out excluded file: ${item.path}`);
            return false;
          }
          
          // V4 CODE: Filter out unsupported media formats
          const fileName = item.path.split('/').pop() || item.path;
          const extension = fileName.split('.').pop()?.toLowerCase();
          const isMedia = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
          
          if (!isMedia) {
            this._log(`⏭️ Filtering out unsupported format: ${item.path}`);
            return false;
          }
          
          return true;
        });
        
        if (filteredItems.length < response.items.length) {
          this._log(`📝 Filtered ${response.items.length - filteredItems.length} excluded files (${filteredItems.length} remaining)`);
        }
        
        // V4 CODE: Transform items to include resolved URLs
        const items = await Promise.all(filteredItems.map(async (item) => {
          // V5 URI: Use media_source_uri for URL resolution when available
          // Backend provides both path (filesystem) and media_source_uri (Media Index v1.1.0+)
          const mediaId = item.media_source_uri || item.path;
          const resolvedUrl = await this._resolveMediaPath(mediaId);
          return {
            ...item,
            url: resolvedUrl,
            path: item.path, // Keep filesystem path for metadata
            filename: item.filename || item.path.split('/').pop(),
            folder: item.folder || item.path.substring(0, item.path.lastIndexOf('/')),
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
        
        this._log(`QUERY RESULT: Received ${items.length} items from database`);
        if (this.config?.debug_mode) {
          items.slice(0, 3).forEach((item, idx) => {
            this._log(`Item ${idx}: path="${item.path}", is_favorited=${item.is_favorited}`, item);
          });
        }
        
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
    this.disableAutoLoop = false; // V5.3: Prevent auto-loop during pre-load
  }

  _log(...args) {
    if (this.config?.debug_mode) {
      console.log('[SequentialMediaIndexProvider]', ...args);
    }
  }

  async initialize() {
    this._log('Initializing...');
    this._log('Order by:', this.orderBy, this.orderDirection);
    this._log('Recursive:', this.recursive);
    
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
    this._log('✅ Initialized with', this.queue.length, 'items');
    return true;
  }

  async getNext() {
    this._log(`getNext() called - queue.length: ${this.queue.length}, hasMore: ${this.hasMore}, reachedEnd: ${this.reachedEnd}`);
    
    // Refill queue if running low (and more items available)
    if (this.queue.length < 10 && this.hasMore && !this.reachedEnd) {
      this._log('Queue low, refilling...');
      const items = await this._queryOrderedFiles();
      if (items && items.length > 0) {
        this.queue.push(...items);
        this._log('Refilled queue, now', this.queue.length, 'items');
      } else {
        this._log('No more items available from database');
        this.reachedEnd = true;
      }
    }
    
    // If queue is empty and hasMore is false, we've reached the end
    // (hasMore=false means last query returned fewer items than requested)
    if (this.queue.length === 0 && !this.hasMore) {
      // V5.3: Don't auto-loop if disabled (during pre-load)
      if (this.disableAutoLoop) {
        this._log('🛑 Reached end of sequence, auto-loop disabled, returning null');
        return null;
      }
      
      this._log('🔄 Reached end of sequence (queue empty, hasMore=false), looping back to start...');
      this.lastSeenValue = null;
      this.reachedEnd = false;
      this.hasMore = true;
      this.excludedFiles.clear(); // Clear excluded files when looping back
      
      const items = await this._queryOrderedFiles();
      if (items && items.length > 0) {
        this.queue = items;
        this._log('✅ Restarted sequence with', this.queue.length, 'items');
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
      
      // V5 URI WORKFLOW: Use media_source_uri from Media Index when available
      const mediaId = item.media_source_uri || item.path;
      
      return {
        // V5: Use URI for media_content_id (Media Index v1.1.0+ provides media_source_uri)
        media_content_id: mediaId,
        media_content_type: MediaUtils.detectFileType(item.path) || 'image',
        metadata: {
          ...pathMetadata,
          // EXIF data from media_index backend
          path: item.path, // V4: Store filesystem path in metadata for logging/fallback
          media_source_uri: item.media_source_uri, // V5: Store URI for service calls
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
    
    console.warn('[MediaCard] Sequential queue empty, no items to return');
    return null;
  }

  // Query ordered files from media_index (similar to _queryMediaIndex but different service)
  async _queryOrderedFiles() {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      console.warn('[SequentialMediaIndexProvider] Media index not configured');
      return null;
    }

    try {
      this._log('🔍 Querying media_index for ordered files...');
      
      // V5.2: Pass folder path as-is - Media Index v1.1.0+ handles URI ↔ path conversion
      // Config can be:
      //   - media-source://media_source/local/folder (Media Index will convert using media_source_uri mapping)
      //   - /media/Photo/PhotoLibrary (direct filesystem path)
      //   - media-source://immich/... (skip - Immich paths not supported by Media Index)
      let folderFilter = null;
      if (this.config.folder?.path) {
        let path = this.config.folder.path;
        
        // Skip Immich and other integration paths - media_index only works with filesystem/media_source paths
        if (path.startsWith('media-source://immich')) {
          this._log('⚠️ Immich path detected - media_index incompatible, skipping folder filter');
          // Don't set folderFilter - will query all media_index files
        } else {
          // Pass path as-is - Media Index will handle conversion
          folderFilter = path;
          this._log('🔍 Filtering by folder (URI or path):', folderFilter);
        }
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
        this._log('🔍 Using cursor (after_value):', this.lastSeenValue);
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
        this._log('🎯 Targeting entity:', this.config.media_index.entity_id);
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
        this._log('✅ Received', response.items.length, 'items from media_index');
        
        // Check if we got fewer items than requested (indicates end of sequence)
        if (response.items.length < this.queueSize) {
          this._log('📝 Received fewer items than requested - may be at end of sequence');
          this.hasMore = false;
        }
        
        // Filter excluded files and unsupported formats
        const filteredItems = response.items.filter(item => {
          const isExcluded = this.excludedFiles.has(item.path);
          if (isExcluded) {
            this._log(`⏭️ Filtering out excluded file: ${item.path}`);
            return false;
          }
          
          // Filter unsupported formats
          const fileName = item.path.split('/').pop() || item.path;
          const extension = fileName.split('.').pop()?.toLowerCase();
          const isMedia = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
          
          if (!isMedia) {
            this._log(`⏭️ Filtering out unsupported format: ${item.path}`);
            return false;
          }
          
          return true;
        });
        
        if (filteredItems.length < response.items.length) {
          this._log(`📝 Filtered ${response.items.length - filteredItems.length} files (${filteredItems.length} remaining)`);
        }
        
        // Transform items to include resolved URLs
        const items = await Promise.all(filteredItems.map(async (item) => {
          // V5 URI: Use media_source_uri for URL resolution when available
          const mediaId = item.media_source_uri || item.path;
          const resolvedUrl = await this._resolveMediaPath(mediaId);
          return {
            ...item,
            url: resolvedUrl,
            path: item.path, // Keep filesystem path for metadata
            filename: item.filename || item.path.split('/').pop(),
            folder: item.folder || item.path.substring(0, item.path.lastIndexOf('/')),
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
        
        this._log(`QUERY RESULT: Received ${items.length} ordered items`);
        if (this.config?.debug_mode) {
          items.slice(0, 3).forEach((item, idx) => {
            this._log(`Item ${idx}: path="${item.path}", ${this.orderBy}=${item[this.orderBy]}`);
          });
        }
        
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
    this._log('Resetting to beginning of sequence');
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
      
      // V5 FIX: Don't call pauseScanning() here - it sets _scanCancelled=true which prevents
      // initialize() from working. We already stopped scanning above (isScanning=false).
      
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

    // Sequential mode: Always clear queue and rescan to ensure proper ordering from start
    // Random mode: Can reuse existing queue
    const isSequentialMode = folderMode === 'sequential';
    if (this.queue.length > 0) {
      if (isSequentialMode) {
        this._log('🔄 Sequential mode: Clearing existing queue (', this.queue.length, 'items) to rescan from beginning');
        this.queue = [];
        this.shownItems.clear();
      } else {
        this._log('✅ Queue already populated with', this.queue.length, 'items - skipping scan');
        return true;
      }
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
        const scanResult = await this.hierarchicalScanAndPopulate(basePath, 0, this.config.scan_depth);
        
        if (!scanResult || scanResult.error) {
          this._log('⚠️ Hierarchical scan failed:', scanResult?.error || 'unknown error');
          return false;
        }
        
        this._log('✅ Hierarchical scan completed:', 
                 'files processed:', scanResult.filesProcessed,
                 'files added:', scanResult.filesAdded, 
                 'folders processed:', scanResult.foldersProcessed,
                 'queue size:', this.queue.length);
        
        this._log('📊 discoveredFolders array has', this.discoveredFolders.length, 'folders');
        if (this.discoveredFolders.length > 0) {
          this._log('📂 Discovered folder paths:', 
                    this.discoveredFolders.map(f => `${f.path} (${f.fileCount} files)`).join(', '));
        }
        
        // Only shuffle in random mode - sequential mode maintains sorted order
        const isSequentialMode = this.card.config.folder_mode === 'sequential';
        if (this.queue.length > 0 && !isSequentialMode) {
          this.shuffleQueue();
          this.queueShuffleCounter = 0;
          this._log('🔀 Final shuffle completed after hierarchical scan - queue size:', this.queue.length);
        } else if (isSequentialMode) {
          this._log('📋 Sequential mode: Preserving sorted order (no shuffle) - queue size:', this.queue.length);
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
    this._log('🔎 hierarchicalScanAndPopulate called:', 'basePath:', basePath, 'currentDepth:', currentDepth, 'maxDepth:', maxDepth);
    
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

      this._log('🔍 API Response for', basePath);
      this._log('   - children:', folderContents?.children?.length || 0);
      if (folderContents?.children && folderContents.children.length > 0) {
        this._log('   - First 3 items:', JSON.stringify(folderContents.children.slice(0, 3), null, 2));
      }

      if (!folderContents?.children) {
        this._log('📁 No children found at depth:', currentDepth);
        return { filesProcessed: 0, foldersProcessed: 0 };
      }

      const folderName = basePath.split('/').pop() || 'root';
      
      // Filter files - some media sources (like Synology) don't set media_class, so check by extension too
      const allFiles = folderContents.children.filter(child => {
        // Skip if it's explicitly a folder
        if (child.can_expand) return false;
        
        // Include if media_class indicates media
        if (child.media_class === 'image' || child.media_class === 'video') return true;
        
        // Otherwise check by file extension (prefer title for Immich compatibility)
        const pathForExtCheck = child.title || child.media_content_id || '';
        return this.card._isMediaFile(pathForExtCheck);
      });
      
      this._log('🔍 After initial filter:', allFiles.length, 'files (from', folderContents.children.length, 'total items)');
      
      let files = allFiles;
      
      // Filter by configured media_type (image/video/all)
      const configuredMediaType = this.card.config.media_type || 'all';
      this._log('🔍 Configured media_type:', configuredMediaType);
      
      if (configuredMediaType !== 'all') {
        const beforeFilter = files.length;
        files = files.filter(file => {
          // Use title for Immich compatibility (title = clean filename)
          const filePath = file.title || file.media_content_id || '';
          const fileType = MediaUtils.detectFileType(filePath);
          
          // If fileType is known, use it; otherwise, fall back to media_class
          if (fileType) {
            return fileType === configuredMediaType;
          } else if (file.media_class) {
            return file.media_class === configuredMediaType;
          }
          // If neither, exclude
          return false;
        });
        this._log('🔍 Media type filter (', configuredMediaType, '):', beforeFilter, '→', files.length, 'files');
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
      
      this._log('📊 At depth', currentDepth, 'found:', files.length, 'files,', subfolders.length, 'subfolders');
      if (subfolders.length > 0) {
        this._log('📂 Subfolder names:', subfolders.map(f => f.title || f.media_content_id.split('/').pop()).join(', '));
      }

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
      let availableFiles = files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !existingQueueIds.has(file.media_content_id)
      );
      
      // Sequential mode: Sort files within folder to match folder sort order
      if (isSequentialMode) {
        const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
        
        // Helper to extract timestamp from Reolink URI for accurate sorting
        const getTimestampForSort = (file) => {
          const mediaId = file.media_content_id;
          
          // For Reolink URIs, extract the second timestamp (actual video start time)
          if (mediaId && mediaId.includes('reolink') && mediaId.includes('|')) {
            const parts = mediaId.split('|');
            const timestamps = parts.filter(p => /^\d{14}$/.test(p));
            // Use second timestamp if available (matches video title time)
            const timestamp = timestamps.length > 1 ? timestamps[1] : timestamps[0];
            if (timestamp) {
              return timestamp; // Return as string for comparison (YYYYMMDDHHMMSS format sorts correctly)
            }
          }
          
          // Fallback to title for non-Reolink sources
          return (file.title || mediaId.split('/').pop() || '').toLowerCase();
        };
        
        availableFiles = [...availableFiles].sort((a, b) => {
          const keyA = getTimestampForSort(a);
          const keyB = getTimestampForSort(b);
          
          if (orderDirection === 'desc') {
            return keyB.localeCompare(keyA); // Newest first (higher timestamp = more recent)
          } else {
            return keyA.localeCompare(keyB); // Oldest first (lower timestamp = older)
          }
        });
        this._log('📅 Sequential: Sorted', availableFiles.length, 'files', orderDirection, 'in', folderName);
        
        // Sequential mode: Respect slideshow_window to limit scanning
        // Add files in order until we reach the target queue size
        const targetQueueSize = this.card.config.slideshow_window || 1000;
        for (const file of availableFiles) {
          // Stop adding if we've reached the target queue size
          if (this.queue.length >= targetQueueSize) {
            this._log('⏹️ Sequential: Reached target queue size', targetQueueSize, '- stopping scan');
            this._scanCancelled = true; // Stop hierarchical scan
            break;
          }
          
          await this._waitIfBackgroundPaused();
          await this.addFileToQueueWithBatching(file, folderName);
          filesAdded++;
        }
      } else {
        // Random mode: Use probability sampling
        for (const file of availableFiles) {
          await this._waitIfBackgroundPaused();
          
          if (Math.random() < perFileProbability) {
            await this.addFileToQueueWithBatching(file, folderName);
            filesAdded++;
          }
        }
      }

      let subfoldersProcessed = 0;
      // Recursion logic:
      // - scan_depth=null: Recurse infinitely
      // - scan_depth=0: Don't recurse (single folder only)
      // - scan_depth=N: Recurse up to depth N (e.g., scan_depth=1 means base + 1 level)
      const shouldRecurse = subfolders.length > 0 && 
        (effectiveMaxDepth === null || currentDepth < effectiveMaxDepth);
      
      this._log('🔍 Recursion check at depth', currentDepth, ':', 
                'subfolders:', subfolders.length, 
                'effectiveMaxDepth:', effectiveMaxDepth, 
                'currentDepth:', currentDepth,
                'shouldRecurse:', shouldRecurse,
                'stopScanning:', this.stopScanning);
      
      if (subfolders.length > 0) {
        this._log('📂 Subfolder sample:', subfolders[0]?.title || subfolders[0]?.media_content_id.split('/').pop(),
                  '| Full ID:', subfolders[0]?.media_content_id);
      }
      
      if (shouldRecurse) {
        await this._waitIfBackgroundPaused();

        // Sort subfolders for efficient sequential scanning
        const isSequentialMode = this.card.config.folder_mode === 'sequential';
        const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
        
        let sortedSubfolders;
        if (isSequentialMode) {
          // Sequential mode: Sort folders by name (descending = newest first, ascending = oldest first)
          // Most camera/NVR folders use date-based naming (YYYYMMDD, YYYY-MM-DD, etc.)
          sortedSubfolders = [...subfolders].sort((a, b) => {
            const nameA = (a.title || a.media_content_id.split('/').pop() || '').toLowerCase();
            const nameB = (b.title || b.media_content_id.split('/').pop() || '').toLowerCase();
            
            if (orderDirection === 'desc') {
              // Descending: Z to A, newest dates first (20251123 before 20251122)
              return nameB.localeCompare(nameA);
            } else {
              // Ascending: A to Z, oldest dates first (20251122 before 20251123)
              return nameA.localeCompare(nameB);
            }
          });
          
          this._log('📅 Sequential mode: Sorted', subfolders.length, 'folders', orderDirection, 
                    '| First:', sortedSubfolders[0]?.title || sortedSubfolders[0]?.media_content_id.split('/').pop(),
                    '| Last:', sortedSubfolders[sortedSubfolders.length - 1]?.title || sortedSubfolders[sortedSubfolders.length - 1]?.media_content_id.split('/').pop());
        } else {
          // Random mode: Shuffle to prevent alphabetical bias
          sortedSubfolders = [...subfolders].sort(() => Math.random() - 0.5);
          this._log('🎲 Random mode: Shuffled', subfolders.length, 'folders');
        }

        // Sequential mode: Process folders one-at-a-time to maintain order
        // Random mode: Process 2 at a time for better performance
        const maxConcurrent = isSequentialMode ? 1 : 2;
        
        const subfolderResults = await this.processLevelConcurrently(
          sortedSubfolders, 
          maxConcurrent,
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
      const filePath = file.title || file.media_content_id || '';
      const fileType = MediaUtils.detectFileType(filePath);
      file.media_content_type = fileType || 'image';
    }

    this.queue.push(file);

    const historyEntry = {
      file: file,
      timestamp: new Date().toISOString(),
      folderName: folderName || MediaProvider.extractFolderName(file),
      source: 'hierarchical_scan'
    };
    this.queueHistory.push(historyEntry);

    // Skip shuffle logic in sequential mode (order must be preserved)
    const isSequentialMode = this.card.config.folder_mode === 'sequential';
    if (!isSequentialMode) {
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
    
    // Calculate total files available in discovered folders
    const totalFilesInCollection = this.discoveredFolders.reduce((sum, folder) => 
      sum + (folder.files ? folder.files.length : 0), 0);
    
    // For small collections, use a smaller buffer (50% of collection or 5, whichever is larger)
    // For large collections, use the standard buffer calculation
    let minBuffer;
    if (totalFilesInCollection > 0 && totalFilesInCollection < 30) {
      minBuffer = Math.max(Math.ceil(totalFilesInCollection * 0.5), 5);
    } else {
      minBuffer = Math.max(historyItems + 5, 15);
    }
    
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

    this._log('🔍 Total available files:', totalAvailableFiles, 'shownItems.size:', this.shownItems.size, 'queue.length:', this.queue.length);
    
    const shouldClearShownItems = totalAvailableFiles === 0 && this.shownItems.size > 0;
    if (shouldClearShownItems) {
      this._log('♻️ All files shown - will clear shownItems after collecting files for refill');
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
      this._populateQueueFromDiscoveredFolders(itemsToAdd, shouldClearShownItems);
      this._log('✅ Refill complete - queue now has', this.queue.length, 'items');
    } else {
      this._log('✅ Queue sufficient:', currentQueueSize, '(min needed:', minQueueSize, ')');
    }
  }

  // V4 CODE REUSE: Adapted from populateQueueFromFolders (ha-media-card.js lines 9312+)
  async _populateQueueFromDiscoveredFolders(itemsToAdd, clearShownItemsAfter = false) {
    const folderMode = this.card.config.folder_mode || 'random';
    
    this._log('🔍 Refill check - discoveredFolders:', this.discoveredFolders.length, 
              'folders, mode:', folderMode, 'clearShownItemsAfter:', clearShownItemsAfter);
    
    if (folderMode === 'sequential') {
      // Sequential mode: collect available items, add to queue, then sort entire queue
      
      // In sequential mode with loop-back, clear shownItems BEFORE collecting
      // so we can re-collect all files for the next loop
      if (clearShownItemsAfter) {
        this._log('♻️ Clearing shownItems BEFORE collecting (sequential loop-back)');
        this.shownItems.clear();
      }
      
      const availableFiles = [];
      
      for (const folder of this.discoveredFolders) {
        if (!folder.files) continue;
        
        this._log('📂 Checking folder:', folder.path, 'with', folder.files.length, 'files');
        
        for (const file of folder.files) {
          // Skip if already in queue or already shown
          if (this.queue.some(q => q.media_content_id === file.media_content_id)) continue;
          if (this.shownItems.has(file.media_content_id)) continue;
          
          availableFiles.push(file);
        }
      }
      
      this._log('🔍 Available files for refill:', availableFiles.length);
      
      // Sort available files first, then add to queue
      // This preserves queue order without re-sorting already-queued items
      const orderBy = this.card.config.folder?.order_by || 'date_taken';
      const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
      
      availableFiles.sort((a, b) => {
        const aValue = a.metadata?.[orderBy];
        const bValue = b.metadata?.[orderBy];
        if (!aValue || !bValue) return 0;
        const comparison = aValue < bValue ? -1 : (aValue > bValue ? 1 : 0);
        return orderDirection === 'desc' ? -comparison : comparison;
      });
      
      // Add sorted items to queue (up to itemsToAdd)
      const toAdd = availableFiles.slice(0, itemsToAdd);
      this.queue.push(...toAdd);
      
      this._log('🔄 Added', toAdd.length, 'sequential items to queue (pre-sorted, not re-sorting entire queue)');
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
      
      this._log('🔍 Available files for refill:', availableFiles.length);
      
      // NOW clear shownItems AFTER collecting available files (same as sequential mode)
      if (clearShownItemsAfter) {
        this._log('♻️ Clearing shownItems now (after collecting available files)');
        this.shownItems.clear();
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
    
    this._log('_sortQueue - orderBy:', orderBy, 'direction:', direction, 'priorityNewFiles:', priorityNewFiles);
    this._log('Full sequential config:', this.card.config.folder?.sequential);
    
    // For date-based sorting, use two-pass approach: dated files first, then non-dated
    if (orderBy === 'date_taken' || orderBy === 'modified_time') {
      const datedFiles = [];
      const nonDatedFiles = [];
      
      // Separate files into dated and non-dated groups
      for (const item of this.queue) {
        let hasDate = false;
        
        // Check EXIF data first
        if (item.metadata?.date_taken) {
          hasDate = true;
        } else {
          // Check filename
          const filename = MediaProvider.extractFilename(item.media_content_id);
          const dateFromFilename = MediaProvider.extractDateFromFilename(filename);
          hasDate = !!dateFromFilename;
        }
        
        if (hasDate) {
          datedFiles.push(item);
        } else {
          nonDatedFiles.push(item);
        }
      }
      
      // Sort dated files chronologically
      datedFiles.sort((a, b) => {
        let aVal, bVal;
        
        if (a.metadata?.date_taken && b.metadata?.date_taken) {
          aVal = new Date(a.metadata.date_taken).getTime();
          bVal = new Date(b.metadata.date_taken).getTime();
        } else {
          const aFilename = MediaProvider.extractFilename(a.media_content_id);
          const bFilename = MediaProvider.extractFilename(b.media_content_id);
          const aDate = MediaProvider.extractDateFromFilename(aFilename);
          const bDate = MediaProvider.extractDateFromFilename(bFilename);
          aVal = aDate ? aDate.getTime() : 0;
          bVal = bDate ? bDate.getTime() : 0;
        }
        
        const comparison = aVal - bVal;
        return direction === 'asc' ? comparison : -comparison;
      });
      
      // Sort non-dated files alphabetically
      nonDatedFiles.sort((a, b) => {
        const aFilename = MediaProvider.extractFilename(a.media_content_id);
        const bFilename = MediaProvider.extractFilename(b.media_content_id);
        const comparison = aFilename.localeCompare(bFilename);
        return direction === 'asc' ? comparison : -comparison;
      });
      
      // If ALL files are non-dated, preserve scan order (files were already sorted during hierarchical scan)
      if (datedFiles.length === 0 && nonDatedFiles.length === this.queue.length) {
        this._log('✅ All files non-dated - preserving scan order (already sorted during hierarchical scan)');
        return; // Keep existing queue order
      }
      
      // Combine: dated files first, then non-dated files
      this.queue = [...datedFiles, ...nonDatedFiles];
      
      this._log('✅ Two-pass sort complete:', datedFiles.length, 'dated files,', nonDatedFiles.length, 'non-dated files');
      return; // Skip the standard comparator below
    }
    
    // Standard sort comparator function for non-date sorting
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
        default:
          aVal = a.media_content_id;
          bVal = b.media_content_id;
      }
      
      const comparison = String(aVal).localeCompare(String(bVal));
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
          this._log('🆕 Priority file (discovered recently):', MediaProvider.extractFilename(item.media_content_id));
        } else {
          oldFiles.push(item);
        }
      }
      
      // Sort each group independently
      newFiles.sort(compareItems);
      oldFiles.sort(compareItems);
      
      // Reconstruct queue: newly discovered files first, then rest
      this.queue = [...newFiles, ...oldFiles];
      
      this._log('✅ Priority sorting complete:', newFiles.length, 'recently discovered,', oldFiles.length, 'older');
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
    
    // V5.3: Navigation Queue - Separate from provider queue
    // This is what the user navigates through (populated on-demand via getNext())
    this.navigationQueue = [];    // Array of items user can navigate
    this.navigationIndex = -1;    // Current position (-1 = uninitialized, first increment → 0)
    this.maxNavQueueSize = 200;   // Will be updated in setConfig based on slideshow_window * 2
    this.isNavigationQueuePreloaded = false; // V5.3: Track if small collection was pre-loaded
    
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
    this._debugMode = false; // V4 debug logging (set via YAML config in setConfig)
    this._lastLogTime = {}; // V4 log throttling
    this._isPaused = false; // V4 pause state for slideshow
    this._showInfoOverlay = false; // Info overlay toggle
    
    // Modal overlay state (gallery-card pattern)
    this._modalOpen = false;
    this._modalImageUrl = '';
    this._modalCaption = '';
    
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
      } else if (height < 100 || height > 5000) {
        // Out of range - clamp to valid range
        config.max_height_pixels = Math.max(100, Math.min(5000, height));
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
      } else if (height < 100 || height > 5000) {
        // Out of range - clamp to valid range
        config.card_height = Math.max(100, Math.min(5000, height));
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
        show_root_folder: true,
        position: 'bottom-left',
        ...config.metadata
      }
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
          
          // V5.3: Smart pre-load - only for small collections
          await this._smartPreloadNavigationQueue();
          
          await this._loadNext();
        }
      } else {
        console.error('[MediaCardV5a] Provider initialization failed');
        this._errorState = 'Provider initialization failed';
      }
    } catch (error) {
      console.error('[MediaCardV5a] Error initializing provider:', error);
      // V5.3: Store error message for display in card UI
      this._errorState = error.message || 'Provider initialization failed';
    } finally {
      this.isLoading = false;
    }
  }

  // V5.3: Smart pre-load - only for small collections that fit in window
  async _smartPreloadNavigationQueue() {
    this._log('🔍 _smartPreloadNavigationQueue CALLED');
    
    // Check if this is a small collection that we should pre-load
    // Need to access the actual provider (might be wrapped by FolderProvider)
    let actualProvider = this.provider;
    
    this._log('_smartPreloadNavigationQueue - checking provider type:', actualProvider.constructor.name);
    this._log('actualProvider properties:', Object.keys(actualProvider));
    
    // Unwrap FolderProvider to get actual provider
    if (actualProvider.sequentialProvider) {
      this._log('Found sequentialProvider');
      actualProvider = actualProvider.sequentialProvider;
    } else if (actualProvider.mediaIndexProvider) {
      this._log('Found mediaIndexProvider');
      actualProvider = actualProvider.mediaIndexProvider;
    } else if (actualProvider.subfolderQueue) {
      this._log('Found subfolderQueue');
      // File system scanning via SubfolderQueue
      const queue = actualProvider.subfolderQueue;
      const queueSize = queue.queue?.length || 0;
      const isScanComplete = !queue.isScanning && !queue.discoveryInProgress;
      
      // Check mode - pre-loading only makes sense for sequential mode
      // Random mode manages its own queue dynamically with refills
      const mode = this.config.folder?.mode || 'random';
      this._log(`Checking SubfolderQueue: mode=${mode}, queue=${queueSize}, isScanning=${queue.isScanning}, discoveryInProgress=${queue.discoveryInProgress}, isScanComplete=${isScanComplete}`);
      
      // Pre-load ONLY for sequential mode if scan is complete and collection is small
      if (mode === 'sequential' && isScanComplete && queueSize > 0 && queueSize <= this.maxNavQueueSize) {
        this._log(`Small sequential collection (${queueSize} items), pre-loading...`);
        
        // Transform queue items directly
        for (const rawItem of queue.queue) {
          // SubfolderQueue stores full media browser items - use media_content_id directly
          const mediaId = rawItem.media_content_id;
          const pathForMetadata = rawItem.title || rawItem.media_content_id;
          
          // Extract metadata from path/title
          const pathMetadata = MediaProvider.extractMetadataFromPath(pathForMetadata);
          
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
              const timestampDate = MediaProvider.extractDateFromFilename(timestampToUse);
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
      } else {
        if (mode === 'random') {
          this._log(`Skipping pre-load: Random mode uses dynamic queue refills from ${queue.discoveredFolders?.length || 0} folders`);
        } else {
          this._log(`Skipping pre-load: mode=${mode}, isScanComplete=${isScanComplete}, queueSize=${queueSize}, maxNavQueueSize=${this.maxNavQueueSize}`);
        }
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
      this._log(`Checking sequential provider: hasMore=${actualProvider.hasMore}, queue=${estimatedSize}`);
    } else if (actualProvider.queue) {
      // MediaIndexProvider (random mode): Small if initial query returned less than requested
      estimatedSize = actualProvider.queue.length;
      const requestedSize = actualProvider.queueSize || 100;
      isSmallCollection = estimatedSize < requestedSize;
      this._log(`Checking random provider: queue=${estimatedSize}, requested=${requestedSize}, isSmall=${isSmallCollection}`);
    }
    
    if (!isSmallCollection) {
      this._log(`Large collection detected, skipping pre-load (estimated: ${estimatedSize})`);
      return;
    }
    
    if (estimatedSize > this.maxNavQueueSize) {
      this._log(`Collection too large (${estimatedSize} items), skipping pre-load`);
      return;
    }
    
    this._log(`Small collection detected (${estimatedSize} items), pre-loading all items...`);
    
    // Different pre-load strategy based on provider type
    if (actualProvider.hasMore !== undefined) {
      // SequentialMediaIndexProvider: Disable auto-loop and call getNext()
      actualProvider.disableAutoLoop = true;
      
      let loadedCount = 0;
      while (loadedCount < this.maxNavQueueSize) {
        const item = await this.provider.getNext();
        if (!item) {
          this._log(`Pre-load complete: loaded ${loadedCount} items (provider exhausted)`);
          break;
        }
        this.navigationQueue.push(item);
        loadedCount++;
      }
      
      actualProvider.disableAutoLoop = false;
    } else if (actualProvider.queue) {
      // MediaIndexProvider (random): Manually transform queue items (can't disable auto-refill)
      this._log('Random provider: manually transforming queue items...');
      
      for (const rawItem of actualProvider.queue) {
        // Transform using same logic as getNext() (but don't shift from queue)
        const pathMetadata = MediaProvider.extractMetadataFromPath(rawItem.path);
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
      
      this._log(`Transformed ${this.navigationQueue.length} items from provider queue`);
    }
    
    this._log(`✅ Pre-loaded ${this.navigationQueue.length} items into navigation queue`);
    this.isNavigationQueuePreloaded = true; // Mark as pre-loaded
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
      // V5.3: Navigation Queue Architecture
      // Always increment (starts at -1, first increment → 0)
      this.navigationIndex++;
      
      // Need to load more items?
      if (this.navigationIndex >= this.navigationQueue.length) {
        // V5.3: If this was a pre-loaded small collection, don't load more - just wrap
        if (this.isNavigationQueuePreloaded) {
          this._log('Pre-loaded collection exhausted, wrapping to beginning');
          this.navigationIndex = 0;
        } else {
          this._log('Navigation queue exhausted, loading from provider');
          let item = await this.provider.getNext();
        
          if (item) {
            this._log('Got item from provider:', item.title);
          
            // V5.3: Check if item already exists in navigation queue (prevent duplicates)
            let alreadyInQueue = this.navigationQueue.some(q => q.media_content_id === item.media_content_id);
            let attempts = 0;
            const maxAttempts = 10; // Prevent infinite loop
            
            while (alreadyInQueue && attempts < maxAttempts) {
              this._log(`⚠️ Item already in navigation queue (attempt ${attempts + 1}), getting next:`, item.media_content_id);
              item = await this.provider.getNext();
              if (!item) break;
              alreadyInQueue = this.navigationQueue.some(q => q.media_content_id === item.media_content_id);
              attempts++;
            }
            
            if (!item || alreadyInQueue) {
              // All items are duplicates or provider exhausted, wrap to beginning
              this._log('Provider exhausted or only returning duplicates, wrapping to beginning');
              this.navigationIndex = 0;
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
            this.navigationIndex = 0;
          }
        }
      }
      
      // Get item at current navigation index
      const item = this.navigationQueue[this.navigationIndex];
      if (!item) {
        this._log('ERROR: No item at navigationIndex', this.navigationIndex);
        return;
      }
      
      this._log('Displaying navigation queue item:', item.title, 'at index', this.navigationIndex);
      
      // Add to history for tracking (providers use this for exclusion)
      // Check by media_content_id to avoid duplicate object references
      const alreadyInHistory = this.history.some(h => h.media_content_id === item.media_content_id);
      if (!alreadyInHistory) {
        this.history.push(item);
        
        // V5: Dynamic history size formula
        const queueSize = this.config.slideshow_window || 100;
        const autoAdvanceInterval = this.config.auto_advance_interval || 5;
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
      this._currentMediaPath = item.media_content_id;
      this._currentMetadata = item.metadata || null;
      
      // V5: Store metadata in pending state until image loads
      this._pendingMediaPath = item.media_content_id;
      this._pendingMetadata = item.metadata;
      
      // V5: Clear caches when media changes
      this._fullMetadata = null;
      this._folderDisplayCache = null;
      
      await this._resolveMediaUrl();
      this.requestUpdate();
      
      // V5: Setup auto-advance after successfully loading media
      this._setupAutoRefresh();
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
    this._currentMediaPath = item.media_content_id;
    this._currentMetadata = item.metadata || null;
    
    // V5: Clear cached full metadata when media changes
    this._fullMetadata = null;
    this._folderDisplayCache = null;
    
    await this._resolveMediaUrl();
    this.requestUpdate();
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
      const autoAdvance = this.config?.auto_advance_seconds || 0;
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
      this._log(`🔄 Setting up ${modeLabel} every ${refreshSeconds} seconds`);
      
      this._refreshInterval = setInterval(async () => {
        // Check pause states before advancing
        if (!this._isPaused && !this._backgroundPaused) {
          // V4 CODE REUSE: Check if we should wait for video to complete
          // Based on V4 lines 3259-3302
          if (await this._shouldWaitForVideoCompletion()) {
            this._log('🔄 Auto-timer skipped - waiting for video to complete');
            return;
          }
          
          if (isRefreshMode) {
            // Reload current media (for single_media or folder with auto_refresh only)
            this._log('🔄 Auto-refresh timer triggered - reloading current media');
            if (this.currentMedia) {
              await this._resolveMediaUrl();
              this.requestUpdate();
            }
          } else {
            // Advance to next media (folder mode with auto_advance)
            this._log('🔄 Auto-advance timer triggered - loading next media');
            this._loadNext();
          }
        } else {
          this._log(`🔄 ${modeLabel} skipped - isPaused:`, this._isPaused, 'backgroundPaused:', this._backgroundPaused);
        }
      }, refreshSeconds * 1000);
      
      this._log('✅ Auto-refresh interval started with ID:', this._refreshInterval);
    } else {
      this._log('🔄 Auto-advance disabled or not configured:', {
        refreshSeconds,
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
  
  // Add cache-busting timestamp to URL (forces browser to bypass cache)
  _addCacheBustingTimestamp(url, forceAdd = false) {
    if (!url) return url;
    
    // CRITICAL: Never add timestamp to signed URLs (breaks signature validation)
    if (url.includes('authSig=')) {
      this._log('Skipping cache-busting timestamp - URL has authSig');
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

  async _resolveMediaUrl() {
    if (!this.currentMedia || !this.hass) {
      this._log('Cannot resolve URL - missing currentMedia or hass');
      return;
    }

    const mediaId = this.currentMedia.media_content_id;
    this._log('_resolveMediaUrl called with mediaId:', mediaId);
    this._log('currentMedia object:', this.currentMedia);
    
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
        
        // V5: Copy V4's approach - just pass through to HA without modification
        const resolved = await this.hass.callWS({
          type: "media_source/resolve_media",
          media_content_id: mediaId,
          expires: (60 * 60 * 3) // 3 hours
        });
        this._log('HA resolved to:', resolved.url);
        
        // Add timestamp for auto-refresh (camera snapshots, etc.)
        const finalUrl = this._addCacheBustingTimestamp(resolved.url);
        if (finalUrl !== resolved.url) {
          this._log('Added cache-busting timestamp for auto-refresh:', finalUrl);
        }
        
        this.mediaUrl = finalUrl;
        this.requestUpdate();
      } catch (error) {
        console.error('[MediaCardV5a] Failed to resolve media URL:', error);
        this.mediaUrl = '';
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
        this.mediaUrl = resolved.url;
        this.requestUpdate();
        return; // Success - don't fall through to fallback
      } catch (error) {
        // File doesn't exist or can't be accessed - skip to next
        console.warn('[MediaCardV5a] File not found or inaccessible, skipping to next:', mediaId, error.message);
        
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
        this.mediaUrl = '';
        
        // Check recursion depth before recursive call
        this._validationDepth = (this._validationDepth || 0) + 1;
        if (this._validationDepth >= MAX_VALIDATION_ATTEMPTS) {
          console.error('[MediaCardV5a] Too many consecutive missing files, stopping validation');
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
    if (!is404 && this._debugMode) {
      console.error('[MediaCard] Media failed to load:', this.mediaUrl, e);
    } else {
      this._log('📭 Media file not found (404) - likely deleted/moved:', this.mediaUrl);
    }
    
    // Add specific handling for Synology DSM authentication errors
    const isSynologyUrl = this.mediaUrl && this.mediaUrl.includes('/synology_dsm/') && this.mediaUrl.includes('authSig=');
    if (isSynologyUrl) {
      errorMessage = 'Synology DSM authentication expired - try refreshing';
      console.warn('[MediaCardV5a] Synology DSM URL authentication may have expired:', this.mediaUrl);
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
            console.error('[MediaCardV5a] URL refresh attempt failed:', err);
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
    this._log('Video started loading:', this.mediaUrl);
    // Reset video wait timer for new video
    this._videoWaitStartTime = null;
    // Reset user interaction flag for new video
    this._videoUserInteracted = false;
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
    
    // Mark that user has interacted with the video
    this._videoUserInteracted = true;
    this._log('🎬 User interacted with video (pause) - will play to completion');
    
    // Only pause slideshow if video was manually paused (not ended)
    const videoElement = this.renderRoot?.querySelector('video');
    if (videoElement && !videoElement.ended && !this._isPaused) {
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
    
    // V5.3: Apply default zoom AFTER image loads (PR #37 by BasicCPPDev)
    // This ensures the inline transform style isn't lost during re-render
    if (this.config.default_zoom && this.config.default_zoom > 1) {
      const img = this.shadowRoot.querySelector('.media-container img');
      if (img) {
        const level = Math.max(1.0, Math.min(5.0, this.config.default_zoom));
        this._zoomToPoint(img, 50, 50, level);
      }
    }
    
    // V5: Apply pending metadata now that image has loaded
    // This synchronizes metadata/counter updates with the new image appearing
    if (this._pendingMetadata !== null) {
      this._currentMetadata = this._pendingMetadata;
      this._pendingMetadata = null;
      this._log('✅ Applied pending metadata on image load');
    }
    if (this._pendingMediaPath !== null) {
      this._currentMediaPath = this._pendingMediaPath;
      this._pendingMediaPath = null;
    }
    
    // Trigger re-render to show updated metadata/counters
    this.requestUpdate();
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
    
    // Debug logging (only when cache miss)
    if (this.config?.debug_mode) {
      console.log('[_formatFolderForDisplay]', {
        fullFolderPath,
        mediaPath,
        scanPrefix,
        showRoot
      });
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
    
    if (this.config?.debug_mode) {
      console.log('[_formatFolderForDisplay] relativePath:', relativePath, 'parts:', parts);
    }
    
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
    const enableFullscreen = config.enable_fullscreen === true;
    const enableRefresh = this.config.show_refresh_button === true;
    const enableDebugButton = this.config.debug_button === true;
    
    // Don't render anything if all buttons are disabled
    const anyButtonEnabled = enablePause || enableDebugButton || enableRefresh || enableFullscreen || 
                            (showMediaIndexButtons && (enableFavorite || enableDelete || enableEdit || enableInfo));
    if (!anyButtonEnabled) {
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
      // Only show "X of Y" if X != Y (hide when they're equal to avoid "20 of 20")
      const showTotal = currentPosition !== totalSeen;
      
      positionIndicator = html`
        <div class="position-indicator">
          ${currentPosition}${showTotal ? ` of ${totalSeen}` : ''}
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
    const targetUri = this._currentMediaPath;
    const isFavorite = this._currentMetadata?.is_favorited || false;
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
  
  // Handle debug button click - toggle debug mode dynamically
  _handleDebugButtonClick(e) {
    e.stopPropagation();
    
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
    this._log('🔄 Refresh button clicked - reloading current media');
    
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
      
      this._log('✅ Media refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh media:', error);
      this._log('❌ Media refresh failed:', error.message);
    }
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
      
      // Remove from navigation history (use captured targetUri)
      const historyIndex = this.history.findIndex(h => h.media_content_id === targetUri);
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
      background: black;
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
      
      // V4 CODE REUSE: Remove file from history and exclude from future queries
      // Copied from ha-media-card.js lines 6008-6020
      
      // Add to provider's exclusion list to prevent reappearance (use captured targetUri)
      if (this.provider && this.provider.excludedFiles) {
        this.provider.excludedFiles.add(targetUri);
        this._log(`📝 Added to provider exclusion list: ${targetUri}`);
      }
      
      // Remove from navigation history (use captured targetUri)
      const historyIndex = this.history.findIndex(h => h.media_content_id === targetUri);
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
  
  // GALLERY-CARD PATTERN: Modal overlay for image viewing (lines 238-268, 908-961)
  // V4 CODE REUSE: Based on gallery-card's proven modal implementation
  // Direct fullscreen on image click (simplified UX)
  // V4: Tap Action Handlers
  _hasAnyAction() {
    return this.config.tap_action || this.config.double_tap_action || this.config.hold_action;
  }
  
  _handleTap(e) {
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
    :host([data-card-height]:not([data-aspect-mode])) video {
      max-height: 100%;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    
    /* Default mode (no aspect-mode, no card-height): Center images and apply max-height */
    :host(:not([data-aspect-mode]):not([data-card-height])) .media-container {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    :host(:not([data-aspect-mode]):not([data-card-height])) img {
      max-height: var(--media-max-height, 400px);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    :host(:not([data-aspect-mode]):not([data-card-height])) video {
      max-height: var(--media-max-height, 400px);
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
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
      object-fit: contain;
    }

    :host([data-aspect-mode="viewport-fit"]) video {
      max-height: 100vh;
      max-width: 100vw;
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
      z-index: 5;
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
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      pointer-events: none;
      z-index: 12;
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
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 500;
      pointer-events: none;
      z-index: 8;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
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

    .dots-indicator {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      pointer-events: none;
      z-index: 8;
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
              <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Configuration Error</div>
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

    return html`
      <ha-card>
        <div class="card"
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0">
          ${this.config.title ? html`<div class="title">${this.config.title}</div>` : ''}
          ${this._renderMedia()}
          ${this._renderPauseIndicator()}
          ${this._renderKioskIndicator()}
          ${this._renderControls()}
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
            @click=${this._onVideoClick}
            style="width: 100%; height: auto; display: block; background: #000; max-width: 100%;"
          >
            <source src="${this.mediaUrl}" type="video/mp4">
            <source src="${this.mediaUrl}" type="video/webm">
            <source src="${this.mediaUrl}" type="video/ogg">
            <p>Your browser does not support the video tag. <a href="${this.mediaUrl}" target="_blank">Download the video</a> instead.</p>
          </video>
          ${this._renderVideoInfo()}
        ` : html`
          <img 
            src="${this.mediaUrl}" 
            alt="${this.currentMedia.title || 'Media'}"
            @error=${this._onMediaError}
            @load=${this._onMediaLoaded}
          />
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
             @click=${(e) => { e.stopPropagation(); this._loadPrevious(); }}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Previous">
        </div>
        <div class="nav-zone nav-zone-right"  
             @click=${(e) => { e.stopPropagation(); this._loadNext(); }}
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
      // V5 uses 'folder' as media_source_type, with folder-specific config
      result.media_source_type = 'folder';
      
      // Create folder config object from v4 settings
      result.folder = {
        path: config.media_path || config.folder_path || '/media',
        mode: config.folder_mode || (config.random_mode ? 'random' : 'sequential'),
        recursive: config.recursive !== false, // Default true
        use_media_index_for_discovery: config.subfolder_queue?.enabled ? true : undefined
      };
      
      // Preserve subfolder_queue settings if they exist
      if (config.subfolder_queue?.enabled) {
        result.folder.subfolder_queue = config.subfolder_queue;
      }
    } else {
      result.media_source_type = 'single_media';
      // CRITICAL: Populate single_media.path from media_path for single media mode
      if (config.media_path) {
        result.single_media = {
          path: config.media_path
        };
      }
    }

    // Migrate Media Index detection
    if (config.media_index?.entity_id) {
      result.use_media_index = true;
    }

    // Migrate kiosk_mode_exit_action to new interaction system
    if (config.kiosk_mode_exit_action && !result.tap_action && !result.hold_action && !result.double_tap_action) {
      const exitAction = config.kiosk_mode_exit_action;
      if (exitAction === 'tap') {
        result.tap_action = { action: 'toggle-kiosk' };
      } else if (exitAction === 'hold') {
        result.hold_action = { action: 'toggle-kiosk' };
      } else if (exitAction === 'double_tap') {
        result.double_tap_action = { action: 'toggle-kiosk' };
      }
      // Remove old config key
      delete result.kiosk_mode_exit_action;
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
    if (this._debugMode || window.location.hostname === 'localhost') {
      console.log(...args);
    }
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
    const newPath = ev.target.value;
    const mediaSourceType = this._config.media_source_type || 'single_media';
    
    // Update both legacy media_path and nested structure
    if (mediaSourceType === 'single_media') {
      this._config = { 
        ...this._config, 
        media_path: newPath,
        single_media: {
          ...this._config.single_media,
          path: newPath
        }
      };
    } else if (mediaSourceType === 'folder') {
      this._config = { 
        ...this._config, 
        media_path: newPath,
        folder: {
          ...this._config.folder,
          path: newPath
        }
      };
    } else {
      // Fallback to legacy
      this._config = { ...this._config, media_path: newPath };
    }
    
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
          path: this._config.media_path || null
        },
        auto_refresh_seconds: this._config.auto_refresh_seconds || 0,
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
      // Get path from media_index entity if available and convert to media-source format
      let folderPath = this._config.media_path || null;
      const mediaIndexEntityId = this._config.media_index?.entity_id;
      
      if (!folderPath && mediaIndexEntityId && this.hass?.states[mediaIndexEntityId]) {
        const entity = this.hass.states[mediaIndexEntityId];
        const filesystemPath = entity.attributes?.media_path || 
                               entity.attributes?.folder_path || 
                               entity.attributes?.base_path || null;
        
        if (filesystemPath) {
          // Convert filesystem path to media-source URI
          // e.g., /media/Photo/PhotoLibrary -> media-source://media_source/media/Photo/PhotoLibrary
          const normalizedPath = filesystemPath.startsWith('/') ? filesystemPath : '/' + filesystemPath;
          folderPath = `media-source://media_source${normalizedPath}`;
          this._log('📁 Auto-populated folder path from media_index:', filesystemPath, '→', folderPath);
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

  // Filter event handlers
  _handleFavoritesFilterChanged(ev) {
    const favoritesEnabled = ev.target.checked;
    
    // Ensure filters object exists
    const filters = { ...this._config.filters };
    
    if (favoritesEnabled) {
      filters.favorites = true;
    } else {
      delete filters.favorites;
    }
    
    // Remove filters object if empty
    if (Object.keys(filters).length === 0) {
      const newConfig = { ...this._config };
      delete newConfig.filters;
      this._config = newConfig;
    } else {
      this._config = {
        ...this._config,
        filters: filters
      };
    }
    
    this._fireConfigChanged();
  }

  _handleDateRangeStartChanged(ev) {
    const startDate = ev.target.value || null;
    
    // Ensure filters and date_range objects exist
    const filters = { ...this._config.filters };
    const dateRange = { ...filters.date_range };
    
    if (startDate) {
      dateRange.start = startDate;
    } else {
      delete dateRange.start;
    }
    
    // Update or remove date_range
    if (dateRange.start || dateRange.end) {
      filters.date_range = dateRange;
    } else {
      delete filters.date_range;
    }
    
    // Update or remove filters
    if (Object.keys(filters).length === 0) {
      const newConfig = { ...this._config };
      delete newConfig.filters;
      this._config = newConfig;
    } else {
      this._config = {
        ...this._config,
        filters: filters
      };
    }
    
    this._fireConfigChanged();
  }

  _handleDateRangeEndChanged(ev) {
    const endDate = ev.target.value || null;
    
    // Ensure filters and date_range objects exist
    const filters = { ...this._config.filters };
    const dateRange = { ...filters.date_range };
    
    if (endDate) {
      dateRange.end = endDate;
    } else {
      delete dateRange.end;
    }
    
    // Update or remove date_range
    if (dateRange.start || dateRange.end) {
      filters.date_range = dateRange;
    } else {
      delete filters.date_range;
    }
    
    // Update or remove filters
    if (Object.keys(filters).length === 0) {
      const newConfig = { ...this._config };
      delete newConfig.filters;
      this._config = newConfig;
    } else {
      this._config = {
        ...this._config,
        filters: filters
      };
    }
    
    this._fireConfigChanged();
  }

  _getDateRangeDescription() {
    const filters = this._config.filters || {};
    const dateRange = filters.date_range || {};
    const start = dateRange.start;
    const end = dateRange.end;
    
    if (start && end) {
      return `📅 Showing media from ${start} to ${end}`;
    } else if (start) {
      return `📅 Showing media from ${start} onwards`;
    } else if (end) {
      return `📅 Showing media up to ${end}`;
    }
    return '';
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
    this._log('_handleRootMediaIndexEntityChange called with:', entityId);
    this._log('Current media_source_type:', this._config.media_source_type);
    this._log('this.hass exists:', !!this.hass);
    
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
        this._log('Media Index entity FULL:', entity);
        this._log('Media Index entity attributes:', entity.attributes);
        this._log('Available attribute keys:', Object.keys(entity.attributes));
        
        // Try different possible attribute names
        const mediaFolder = entity.attributes?.media_path ||   // media_index uses this
                           entity.attributes?.media_folder || 
                           entity.attributes?.folder_path ||
                           entity.attributes?.base_path;
        
        this._log('Extracted media folder:', mediaFolder);
        this._log('Is in folder mode?', this._config.media_source_type === 'folder');
        
        if (mediaFolder) {
          this._log('Auto-populating path from media_index entity:', mediaFolder);
          
          // Convert filesystem path to media-source URI format
          const normalizedPath = mediaFolder.startsWith('/') ? mediaFolder : '/' + mediaFolder;
          const folderPath = `media-source://media_source${normalizedPath}`;
          this._log('Converted path:', mediaFolder, '→', folderPath);
          
          // For folder mode: set folder.path
          if (this._config.media_source_type === 'folder') {
            this._log('Setting folder.path to:', folderPath);
            this._config.folder = {
              ...this._config.folder,
              path: folderPath
            };
            this._log('Updated folder config:', this._config.folder);
          } else if (this._config.media_source_type === 'single_media') {
            // For single_media mode: optionally set as starting folder for browse
            // Don't auto-set single_media.path as it should be a file, not folder
            this._log('Folder available for browsing:', mediaFolder);
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
    
    this._log('Final config before fire:', this._config);
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

  _maxHeightChanged(ev) {
    const value = parseInt(ev.target.value);
    // Only store positive integers; everything else removes the property
    if (!isNaN(value) && value > 0) {
      this._config = { ...this._config, max_height_pixels: value };
    } else {
      const { max_height_pixels, ...rest } = this._config;
      this._config = rest;
    }
    this._fireConfigChanged();
  }

  // V5.3: Card height handler (PR #37 by BasicCPPDev)
  _cardHeightChanged(ev) {
    const value = parseInt(ev.target.value);
    // Only store positive integers; everything else removes the property
    if (!isNaN(value) && value > 0) {
      this._config = { ...this._config, card_height: value };
    } else {
      const { card_height, ...rest } = this._config;
      this._config = rest;
    }
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

  _navigationZonesChanged(ev) {
    this._config = { ...this._config, enable_navigation_zones: ev.target.checked };
    this._fireConfigChanged();
  }

  _positionIndicatorChanged(ev) {
    this._config = { ...this._config, show_position_indicator: ev.target.checked };
    this._fireConfigChanged();
  }
  
  _positionIndicatorPositionChanged(ev) {
    this._config = { 
      ...this._config, 
      position_indicator: {
        ...this._config.position_indicator,
        position: ev.target.value
      }
    };
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

  _metadataShowTimeChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_time: ev.target.checked
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

  _actionButtonsEnableFullscreenChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_fullscreen: ev.target.checked
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

  // V4 CODE: Action configuration helpers (ha-media-card.js lines 11125-11240)
  _renderActionConfig(actionType) {
    const action = this._config[actionType];
    if (!action || action.action === 'none') return '';
    
    return html`
      <div style="margin-top: 8px; padding: 8px; border: 1px solid var(--divider-color); border-radius: 4px; background: var(--secondary-background-color);">
        ${action.action === 'more-info' || action.action === 'toggle' ? html`
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Entity ID:</label>
            <input
              type="text"
              .value=${action.entity || ''}
              @input=${(e) => this._updateActionField(actionType, 'entity', e.target.value)}
              placeholder="light.living_room"
              style="width: 100%; font-size: 12px;"
            />
          </div>
        ` : ''}
        
        ${action.action === 'call-service' || action.action === 'perform-action' ? html`
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Service:</label>
            <input
              type="text"
              .value=${action.perform_action || action.service || ''}
              @input=${(e) => this._updateActionField(actionType, 'perform_action', e.target.value)}
              placeholder="light.turn_on"
              style="width: 100%; font-size: 12px;"
            />
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Entity ID:</label>
            <input
              type="text"
              .value=${action.target?.entity_id || ''}
              @input=${(e) => this._updateActionTarget(actionType, 'entity_id', e.target.value)}
              placeholder="light.living_room"
              style="width: 100%; font-size: 12px;"
            />
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Data (JSON):</label>
            <textarea
              rows="3"
              .value=${JSON.stringify(action.data || {}, null, 2)}
              @input=${(e) => this._updateActionData(actionType, e.target.value)}
              placeholder='{"brightness": 255}'
              style="width: 100%; font-size: 12px; font-family: monospace; resize: vertical;"
            ></textarea>
            <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 4px;">
              Use <code style="background: var(--code-background-color, rgba(0,0,0,0.1)); padding: 2px 4px; border-radius: 3px;">{{media_path}}</code> to insert current media file path
            </div>
          </div>
        ` : ''}
        
        ${action.action === 'navigate' ? html`
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Navigation Path:</label>
            <input
              type="text"
              .value=${action.navigation_path || ''}
              @input=${(e) => this._updateActionField(actionType, 'navigation_path', e.target.value)}
              placeholder="/lovelace/dashboard"
              style="width: 100%; font-size: 12px;"
            />
          </div>
        ` : ''}
        
        ${action.action === 'url' ? html`
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">URL:</label>
            <input
              type="text"
              .value=${action.url_path || ''}
              @input=${(e) => this._updateActionField(actionType, 'url_path', e.target.value)}
              placeholder="https://www.example.com"
              style="width: 100%; font-size: 12px;"
            />
          </div>
        ` : ''}
        
        <div style="margin-top: 8px;">
          <label style="display: block; font-size: 12px; margin-bottom: 4px;">Confirmation Message (optional):</label>
          <textarea
            rows="2"
            .value=${action.confirmation_message || ''}
            @input=${(e) => this._updateActionField(actionType, 'confirmation_message', e.target.value)}
            placeholder="Are you sure?"
            style="width: 100%; font-size: 12px; resize: vertical;"
          ></textarea>
          <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 4px;">
            Supported templates: <code style="background: var(--code-background-color, rgba(0,0,0,0.1)); padding: 2px 4px; border-radius: 3px;">{{filename}}</code>, 
            <code style="background: var(--code-background-color, rgba(0,0,0,0.1)); padding: 2px 4px; border-radius: 3px;">{{date}}</code>, 
            <code style="background: var(--code-background-color, rgba(0,0,0,0.1)); padding: 2px 4px; border-radius: 3px;">{{location}}</code>, 
            <code style="background: var(--code-background-color, rgba(0,0,0,0.1)); padding: 2px 4px; border-radius: 3px;">{{folder}}</code>
          </div>
        </div>
      </div>
    `;
  }

  _updateActionField(actionType, field, value) {
    const currentAction = this._config[actionType] || { action: 'none' };
    const updatedAction = { ...currentAction, [field]: value };
    this._config = { ...this._config, [actionType]: updatedAction };
    this._fireConfigChanged();
  }

  _updateActionTarget(actionType, field, value) {
    const currentAction = this._config[actionType] || { action: 'none' };
    const currentTarget = currentAction.target || {};
    const updatedTarget = { ...currentTarget, [field]: value };
    const updatedAction = { ...currentAction, target: updatedTarget };
    this._config = { ...this._config, [actionType]: updatedAction };
    this._fireConfigChanged();
  }

  _updateActionData(actionType, jsonString) {
    try {
      const data = jsonString.trim() ? JSON.parse(jsonString) : {};
      this._updateActionField(actionType, 'data', data);
    } catch (error) {
      console.warn('Invalid JSON for action data:', error);
    }
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

  _hasZoomAction() {
    return this._config.tap_action?.action === 'zoom' ||
           this._config.hold_action?.action === 'zoom' ||
           this._config.double_tap_action?.action === 'zoom';
  }

  _zoomLevelChanged(ev) {
    this._config = {
      ...this._config,
      zoom_level: parseFloat(ev.target.value)
    };
    this._fireConfigChanged();
  }

  // V5.3: Default zoom handler (PR #37 by BasicCPPDev)
  _defaultZoomChanged(ev) {
    const value = parseFloat(ev.target.value);
    // Only store valid zoom levels; everything else removes the property
    if (!isNaN(value) && value > 1) {
      this._config = { ...this._config, default_zoom: value };
    } else {
      const { default_zoom, ...rest } = this._config;
      this._config = rest;
    }
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
    // ALWAYS log - bypassing debug check for diagnosis
    console.log('[MediaCard] 🔍 BROWSER DEBUG - _debugMode:', this._debugMode, 'config.debug_mode:', this.config?.debug_mode);
    console.log('[MediaCard] Adding media files to browser:', mediaContent.children.length, 'items');
    
    // Log first few items for debugging (especially for Reolink integration)
    if (mediaContent.children && mediaContent.children.length > 0) {
      console.log('[MediaCard] 📋 First 3 items in browser:', JSON.stringify(mediaContent.children.slice(0, 3), null, 2));
    }
    
    const itemsToCheck = (mediaContent.children || []).slice(0, 50);
    const hasMediaFiles = itemsToCheck.some(item => {
      const isFolder = item.can_expand;
      // Check media_class first (works for Reolink and other API-based sources)
      if (!isFolder && (item.media_class === 'image' || item.media_class === 'video')) {
        return true;
      }
      // Fallback to extension check for filesystem sources
      const fileName = this._getItemDisplayName(item);
      const isMedia = !isFolder && this._isMediaFile(fileName);
      console.log(`[MediaCard]   Item check: ${fileName} | can_expand=${item.can_expand} | media_class=${item.media_class} | isMedia=${isMedia}`);
      return isMedia;
    });
    
    const hasSubfolders = itemsToCheck.some(item => item.can_expand);
    
    // Add "Up to Parent" button if we're not at root level (empty string = root)
    if (currentPath && currentPath !== '') {
      this._log('Adding parent navigation button for current path:', currentPath);
      const parentButton = document.createElement('div');
      parentButton.style.cssText = `
        padding: 12px 16px !important;
        border: 2px solid var(--primary-color, #007bff) !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        background: var(--primary-color, #007bff) !important;
        color: white !important;
        margin-bottom: 12px !important;
        pointer-events: auto !important;
        font-weight: 500 !important;
      `;
      
      parentButton.innerHTML = '<span style="font-size: 24px;">⬆️</span><span>Up to Parent Folder</span>';
      
      parentButton.onclick = async () => {
        this._log('Navigating to parent from:', currentPath);
        try {
          // Calculate parent path properly handling media-source:// protocol
          let parentPath = '';
          
          if (currentPath.includes('://')) {
            // Handle media-source:// URIs
            const protocolEnd = currentPath.indexOf('://') + 3;
            const pathAfterProtocol = currentPath.substring(protocolEnd);
            
            if (pathAfterProtocol.includes('/')) {
              // Has path segments after protocol - go up one level
              const segments = pathAfterProtocol.split('/');
              segments.pop();
              const parentAfterProtocol = segments.join('/');
              parentPath = currentPath.substring(0, protocolEnd) + parentAfterProtocol;
            } else {
              // At top level after protocol (e.g., media-source://media_source)
              // Go to just the protocol (e.g., media-source://)
              parentPath = currentPath.substring(0, protocolEnd).replace(':///', '://');
            }
          } else {
            // Regular filesystem path
            const pathParts = currentPath.split('/');
            pathParts.pop();
            parentPath = pathParts.join('/');
          }
          
          this._log('Parent path:', parentPath);
          
          // Fetch parent content
          const parentContent = await this._fetchMediaContents(this.hass, parentPath);
          container.innerHTML = '';
          this._addMediaFilesToBrowser(container, parentContent, dialog, parentPath);
        } catch (error) {
          this._log('Error navigating to parent:', error);
          // If parent navigation fails, try going to root
          try {
            const rootContent = await this._fetchMediaContents(this.hass, '');
            container.innerHTML = '';
            this._addMediaFilesToBrowser(container, rootContent, dialog, '');
          } catch (rootError) {
            this._log('Error navigating to root:', rootError);
          }
        }
        return false;
      };

      parentButton.onmouseenter = () => {
        parentButton.style.background = 'var(--primary-color-dark, #0056b3)';
        parentButton.style.transform = 'translateY(-1px)';
        parentButton.style.boxShadow = '0 2px 8px rgba(0, 123, 255, 0.3)';
      };

      parentButton.onmouseleave = () => {
        parentButton.style.background = 'var(--primary-color, #007bff)';
        parentButton.style.transform = 'translateY(0)';
        parentButton.style.boxShadow = 'none';
      };
      
      container.appendChild(parentButton);
    }
    
    // If we're in a folder (not root) with media files OR subfolders, add special folder options at the top
    if ((currentPath && currentPath !== '') && (hasMediaFiles || hasSubfolders)) {
      this._log('Adding folder options for path:', currentPath);
      this._addFolderOptions(container, dialog, currentPath);
    }
    
    // Filter items to display based on media type configuration
    const itemsToShow = (mediaContent.children || []).filter(item => {
      if (item.can_expand) {
        console.log(`[MediaCard] ✅ Including folder: ${this._getItemDisplayName(item)}`);
        return true;
      }
      
      // Check media_class first (works for Reolink, Immich, and other API-based sources)
      if (item.media_class === 'image' || item.media_class === 'video') {
        console.log(`[MediaCard] ✅ media_class check: ${this._getItemDisplayName(item)} | media_class=${item.media_class}`);
        return true;
      }
      
      // If media type filtering is configured, check file type
      if (this._config.media_type && this._config.media_type !== 'all') {
        const fileName = this._getItemDisplayName(item);
        const fileType = this._detectFileType(fileName);
        const included = fileType === this._config.media_type;
        console.log(`[MediaCard] ${included ? '✅' : '❌'} Media type filter (${this._config.media_type}): ${fileName} → ${fileType}`);
        return included;
      }
      
      // Fallback to extension check for filesystem sources
      const fileName = this._getItemDisplayName(item);
      const isMedia = this._isMediaFile(fileName);
      console.log(`[MediaCard] ${isMedia ? '✅' : '❌'} Extension check: ${fileName} | media_class=${item.media_class} | media_content_id=${item.media_content_id}`);
      return isMedia;
    });
    
    console.log(`[MediaCard] 📊 Filter results: ${itemsToShow.length} items to show (from ${mediaContent.children.length} total)`);
    
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
        this._log('Folder mode: Updated path to', folderPath);
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
          this._log('Switched to folder mode with path:', folderPath);
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
      this._log('  📋 Item details:', JSON.stringify({
        media_content_id: item.media_content_id,
        thumbnail: item.thumbnail,
        thumbnail_url: item.thumbnail_url,
        can_play: item.can_play,
        can_expand: item.can_expand
      }, null, 2));
    }

    try {
      let thumbnailUrl = null;
      
      // Check if this is an Immich source
      const isImmich = item.media_content_id && item.media_content_id.includes('media-source://immich');
      
      // Try multiple approaches for getting the thumbnail
      // Skip item.thumbnail for Immich - those URLs lack authentication
      if (item.thumbnail && !isImmich) {
        thumbnailUrl = item.thumbnail;
        if (shouldLog) this._log('✅ Using provided thumbnail:', thumbnailUrl);
      } else if (item.thumbnail_url && !isImmich) {
        thumbnailUrl = item.thumbnail_url;
        if (shouldLog) this._log('✅ Using provided thumbnail_url:', thumbnailUrl);
      }
      
      // Try Home Assistant thumbnail API (or for Immich, always use this)
      if (!thumbnailUrl) {
        try {
          // For Immich media sources, replace /thumbnail/ with /fullsize/ to get authenticated URLs
          // Immich integration doesn't properly auth thumbnail endpoints
          let resolveId = item.media_content_id;
          if (shouldLog) this._log('  📍 Original media_content_id:', resolveId);
          
          if (resolveId && resolveId.includes('media-source://immich') && resolveId.includes('/thumbnail/')) {
            resolveId = resolveId.replace('/thumbnail/', '/fullsize/');
            if (shouldLog) this._log('  🔧 Immich thumbnail → fullsize:', resolveId);
          }
          
          const thumbnailResponse = await this.hass.callWS({
            type: "media_source/resolve_media",
            media_content_id: resolveId,
            expires: 3600
          });
          
          if (thumbnailResponse && thumbnailResponse.url) {
            thumbnailUrl = thumbnailResponse.url;
            if (shouldLog) this._log('  ✅ Got thumbnail from resolve_media API:', thumbnailUrl);
          }
        } catch (error) {
          if (shouldLog) this._log('  ❌ Thumbnail resolve_media API failed:', error);
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
    console.log('[MediaCard] Media picked:', mediaContentId);
    
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
            path: mediaContentId
          }
        };
      }
    }
    
    // Auto-detect media type from extension or media-source protocol
    let detectedType = null;
    
    // Check for Reolink video source
    if (mediaContentId.includes('media-source://reolink/')) {
      detectedType = 'video';
      console.log('[MediaCard] Detected Reolink video source');
    } else {
      // Try extension detection for filesystem sources
      const extension = mediaContentId.split('.').pop()?.toLowerCase();
      if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
        detectedType = 'video';
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
        detectedType = 'image';
      }
    }
    
    if (detectedType) {
      this._config.media_type = detectedType;
      console.log('[MediaCard] Auto-detected media type:', detectedType);
    }
    
    this._fireConfigChanged();
    console.log('[MediaCard] Config updated (media selected):', this._config);
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
    
    input::placeholder {
      color: var(--secondary-text-color);
      opacity: 0.6;
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
      cursor: text;
      user-select: text;
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
        <div style="background: var(--primary-background-color, #fafafa); padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--divider-color, #e0e0e0);">
          <div style="margin-bottom: 12px;">
            <strong>🚀 Media Index Integration (Optional)</strong>
          </div>
          <p style="margin: 4px 0 16px 0; font-size: 13px; color: var(--secondary-text-color, #666);">
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
            <div style="font-size: 12px; color: var(--secondary-text-color, #666); margin-top: 4px;">
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
              <div style="font-size: 12px; color: var(--secondary-text-color, #666); margin-top: 4px; margin-left: 24px;">
                ${folderConfig.use_media_index_for_discovery !== false
                  ? '🚀 Using database queries for fast random selection'
                  : '📁 Using filesystem scanning (slower but includes unindexed files)'}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Filters Section (available when Media Index is enabled) -->
        ${hasMediaIndex && isFolderMode && folderConfig.use_media_index_for_discovery !== false ? html`
          <div style="background: var(--primary-background-color, #fafafa); padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--divider-color, #e0e0e0);">
            <div style="margin-bottom: 12px;">
              <strong>🔍 Filters (Media Index Required)</strong>
            </div>
            <p style="margin: 4px 0 16px 0; font-size: 13px; color: var(--secondary-text-color, #666);">
              Filter media items by favorites, date ranges, or other criteria. Uses Media Index database for fast queries.
            </p>
            
            <!-- Favorites Filter -->
            <div class="config-row">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                <input
                  type="checkbox"
                  .checked=${this._config.filters?.favorites === true}
                  @change=${this._handleFavoritesFilterChanged}
                />
                <span>Show favorites only</span>
              </label>
              <div style="font-size: 12px; color: var(--secondary-text-color, #666); margin-top: 4px; margin-left: 24px;">
                ${this._config.filters?.favorites === true
                  ? '⭐ Only showing favorited media'
                  : 'Showing all media (favorites and non-favorites)'}
              </div>
            </div>

            <!-- Date Range Filter -->
            <div style="margin-top: 16px;">
              <div style="font-weight: 500; margin-bottom: 8px;">📅 Date Range Filter</div>
              <p style="margin: 4px 0 12px 0; font-size: 12px; color: var(--secondary-text-color, #666);">
                Filter by EXIF date_taken (falls back to created_time). Leave empty for no limit.
              </p>
              
              <div class="config-row">
                <label>Start Date</label>
                <div>
                  <input
                    type="date"
                    .value=${this._config.filters?.date_range?.start || ''}
                    @input=${this._handleDateRangeStartChanged}
                    placeholder="YYYY-MM-DD"
                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                  />
                  <div class="help-text">Show media from this date onwards (leave empty for no lower limit)</div>
                </div>
              </div>

              <div class="config-row">
                <label>End Date</label>
                <div>
                  <input
                    type="date"
                    .value=${this._config.filters?.date_range?.end || ''}
                    @input=${this._handleDateRangeEndChanged}
                    placeholder="YYYY-MM-DD"
                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                  />
                  <div class="help-text">Show media up to this date (leave empty for no upper limit)</div>
                </div>
              </div>

              ${this._config.filters?.date_range?.start || this._config.filters?.date_range?.end ? html`
                <div style="margin-top: 8px; padding: 8px; background: var(--info-color, #e3f2fd); border-radius: 4px; font-size: 12px;">
                  ${this._getDateRangeDescription()}
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

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
                    <option value="604800">1 week</option>
                    <option value="1209600">2 weeks</option>
                    <option value="2592000">1 month</option>
                    <option value="5184000">2 months</option>
                    <option value="7776000">3 months</option>
                    <option value="15552000">6 months</option>
                    <option value="31536000">1 year</option>
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
            <div style="margin-left: 20px; padding: 12px; background: var(--secondary-background-color); border-left: 3px solid var(--primary-color); border-radius: 4px;">
              <div style="font-weight: 500; margin-bottom: 8px; color: var(--primary-text-color);">📂 Subfolder Scanning Options</div>
              
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
                .value=${(() => {
                  // Show the actual path from current config structure
                  const mediaSourceType = this._config.media_source_type || 'single_media';
                  if (mediaSourceType === 'single_media') {
                    return this._config.single_media?.path || this._config.media_path || '';
                  } else if (mediaSourceType === 'folder') {
                    return this._config.folder?.path || this._config.media_path || '';
                  } else if (mediaSourceType === 'media_index') {
                    return this._config.media_index?.entity_id || '';
                  }
                  return this._config.media_path || '';
                })()}
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
          <!-- Single media settings moved to common sections -->
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
            <label>Max Height (pixels)</label>
            <div>
              <input
                type="number"
                min="100"
                max="5000"
                step="50"
                .value=${this._config.max_height_pixels || ''}
                @input=${this._maxHeightChanged}
                placeholder="Auto (no limit)"
              />
              <div class="help-text">Maximum height in pixels (100-5000, applies in default mode)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Card Height (pixels)</label>
            <div>
              <input
                type="number"
                min="100"
                max="5000"
                step="50"
                .value=${this._config.card_height || ''}
                @input=${this._cardHeightChanged}
                placeholder="Auto (no fixed height)"
              />
              <div class="help-text">Fixed card height in pixels (100-5000, takes precedence over max height)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Default Zoom Level</label>
            <div>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                .value=${this._config.default_zoom || ''}
                @input=${this._defaultZoomChanged}
                placeholder="No zoom"
              />
              <div class="help-text">Images load pre-zoomed at this level (1-5x, click image to reset)</div>
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
            <label>Auto-Refresh Interval</label>
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
              <div class="help-text">Reload current media every N seconds (0 = disabled). For single image mode (cameras) or folder mode when auto-advance is 0. Leave at 0 if auto-advance is configured.</div>
            </div>
          </div>
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
            <label>Show Time</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.metadata?.show_time === true}
                @change=${this._metadataShowTimeChanged}
              />
              <div class="help-text">Display the file time with seconds (if available)</div>
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
        </div>
        
        <!-- Overlay Positioning (consolidated section) -->
        <div class="section">
          <div class="section-title">📍 Overlay Positioning</div>
          
          <div class="config-row">
            <label>Metadata Position</label>
            <div>
              <select @change=${this._metadataPositionChanged} .value=${this._config.metadata?.position || 'bottom-left'}>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
              </select>
              <div class="help-text">Where to display the metadata overlay (filename, date, location)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Action Buttons Position</label>
            <div>
              <select @change=${this._actionButtonsPositionChanged}>
                <option value="top-right" .selected=${(this._config.action_buttons?.position || 'top-right') === 'top-right'}>Top Right</option>
                <option value="top-left" .selected=${this._config.action_buttons?.position === 'top-left'}>Top Left</option>
                <option value="bottom-right" .selected=${this._config.action_buttons?.position === 'bottom-right'}>Bottom Right</option>
                <option value="bottom-left" .selected=${this._config.action_buttons?.position === 'bottom-left'}>Bottom Left</option>
              </select>
              <div class="help-text">Corner position for action buttons (fullscreen, pause, refresh, favorite, etc.)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Position Indicator Corner</label>
            <div>
              <select @change=${this._positionIndicatorPositionChanged} .value=${this._config.position_indicator?.position || 'bottom-right'}>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
                <option value="top-left">Top Left</option>
              </select>
              <div class="help-text">Corner position for "X of Y" counter (only shown in folder mode)</div>
            </div>
          </div>
        </div>

        <!-- Fullscreen Button (always available) -->
        <div class="section">
          <div class="section-title">🖼️ Fullscreen</div>
          
          <div class="config-row">
            <label>Enable Fullscreen Button</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.action_buttons?.enable_fullscreen === true}
                @change=${this._actionButtonsEnableFullscreenChanged}
              />
              <div class="help-text">Show fullscreen button to automatically pause and initiate full screen mode (see Kiosk mode for automatic full screen options)</div>
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
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">👆 Interactions</div>
          
          <div class="config-row">
            <label>Tap Action</label>
            <div>
              <select @change=${this._tapActionChanged} .value=${this._config.tap_action?.action || 'none'}>
                <option value="none">No Action</option>
                <option value="zoom">🔍 Zoom Image</option>
                <option value="toggle-kiosk">🖥️ Toggle Kiosk Mode</option>
                <option value="more-info">More Info</option>
                <option value="toggle">Toggle Entity</option>
                <option value="call-service">Call Service</option>
                <option value="navigate">Navigate</option>
                <option value="url">Open URL</option>
              </select>
              <div class="help-text">Action when card is tapped</div>
              ${this._renderActionConfig('tap_action')}
            </div>
          </div>
          
          <div class="config-row">
            <label>Hold Action</label>
            <div>
              <select @change=${this._holdActionChanged} .value=${this._config.hold_action?.action || 'none'}>
                <option value="none">No Action</option>
                <option value="zoom">🔍 Zoom Image</option>
                <option value="toggle-kiosk">🖥️ Toggle Kiosk Mode</option>
                <option value="more-info">More Info</option>
                <option value="toggle">Toggle Entity</option>
                <option value="call-service">Call Service</option>
                <option value="navigate">Navigate</option>
                <option value="url">Open URL</option>
              </select>
              <div class="help-text">Action when card is held (0.5+ seconds)</div>
              ${this._renderActionConfig('hold_action')}
            </div>
          </div>
          
          <div class="config-row">
            <label>Double Tap Action</label>
            <div>
              <select @change=${this._doubleTapActionChanged} .value=${this._config.double_tap_action?.action || 'none'}>
                <option value="none">No Action</option>
                <option value="zoom">🔍 Zoom Image</option>
                <option value="toggle-kiosk">🖥️ Toggle Kiosk Mode</option>
                <option value="more-info">More Info</option>
                <option value="toggle">Toggle Entity</option>
                <option value="call-service">Call Service</option>
                <option value="navigate">Navigate</option>
                <option value="url">Open URL</option>
              </select>
              <div class="help-text">Action when card is double-tapped</div>
              ${this._renderActionConfig('double_tap_action')}
            </div>
          </div>

          <!-- Zoom Level (only show if zoom action configured) -->
          ${this._hasZoomAction() ? html`
            <div class="config-row">
              <label>Zoom Level</label>
              <div>
                <input
                  type="range"
                  min="1.5"
                  max="5"
                  step="0.1"
                  .value=${this._config.zoom_level || 2.5}
                  @input=${this._zoomLevelChanged}
                  style="width: 100%;"
                />
                <div class="help-text">Zoom magnification: ${(this._config.zoom_level || 2.5).toFixed(1)}x</div>
              </div>
            </div>
          ` : ''}
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
            <label>Show Exit Hint</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.kiosk_mode_show_indicator !== false}
                @change=${this._kioskModeShowIndicatorChanged}
              />
              <div class="help-text">Show exit instruction at bottom (detects which action has toggle-kiosk configured)</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Register the custom elements (guard against re-registration)
if (!customElements.get('media-card')) {
  customElements.define('media-card', MediaCardV5a);
}
if (!customElements.get('media-card-editor')) {
  customElements.define('media-card-editor', MediaCardV5aEditor);
}

// Register with Home Assistant
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'media-card')) {
  window.customCards.push({
    type: 'media-card',
    name: 'Media Card',
    description: 'Display images and videos from local media folders with slideshow, favorites, and metadata',
    preview: true,
    documentationURL: 'https://github.com/markaggar/ha-media-card'
  });
}

console.info(
  '%c  MEDIA-CARD  %c  v5.3.0 Loaded  ',
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: green'
);
