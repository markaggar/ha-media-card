/** 
 * Media Card v5.6.9
 */

import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module'

// Shared utility functions for media detection
export const MediaUtils = {
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
   * V5.6.7: Check if file exists using media_index service (lightweight filesystem check)
   * Shared by all providers that use media_index backend
   * @param {Object} mediaItem - Media item with path or URI
   * @returns {Promise<boolean|null>} true if exists, false if not, null if unavailable
   */
  async checkFileExists(mediaItem) {
    try {
      const entityId = this.config?.media_index?.entity_id;
      if (!entityId) {
        // No media_index entity configured
        return null;
      }

      const uri = mediaItem?.media_source_uri || mediaItem?.media_content_id;
      const path = mediaItem?.path;

      if (!uri && !path) {
        return null;
      }

      // Call media_index.check_file_exists service
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'check_file_exists',
        service_data: {
          media_source_uri: uri,
          file_path: path
        },
        return_response: true
      };
      
      if (entityId) {
        wsCall.target = { entity_id: entityId };
      }
      
      const response = await this.hass.callWS(wsCall);
      return response?.response?.exists === true;
    } catch (error) {
      // Service doesn't exist (old media_index version) or other error
      return null;
    }
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
   * V5.5: Support custom datetime extraction from folder path
   */
  static extractMetadataFromPath(mediaPath, config = null) {
    if (!mediaPath) return {};
    
    const metadata = {};
    const debugMode = config?.debug_mode || false;
    
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
        
        // V5.5: Try custom folder datetime extraction
        if (config?.custom_datetime_format?.folder_pattern) {
          const folderDatetime = MediaProvider._extractDateWithCustomFormat(
            metadata.folder,
            config.custom_datetime_format.folder_pattern,
            debugMode,
            'folder'
          );
          if (folderDatetime) {
            metadata.date = folderDatetime;
            if (debugMode) {
              console.log(`🕒 [Custom DateTime] Extracted from folder "${metadata.folder}":`, folderDatetime);
            }
          } else if (debugMode) {
            console.warn(`⚠️ [Custom DateTime] Failed to extract from folder "${metadata.folder}" with pattern "${config.custom_datetime_format.folder_pattern}"`);
          }
        }
      }
    }
    
    // Try to extract date from filename (basic support - full EXIF will come from media_index)
    // Filename extraction takes priority over folder extraction if no custom folder pattern
    const dateFromFilename = MediaProvider.extractDateFromFilename(filename, config);
    if (dateFromFilename && !metadata.date) {
      metadata.date = dateFromFilename;
    }
    
    return metadata;
  }
  
  /**
   * V4: Extract date from filename patterns (shared helper)
   * Moved from SingleMediaProvider to base class for reuse
   * Enhanced to extract time components when present
   * V5.5: Support custom datetime formats via config
   */
  static extractDateFromFilename(filename, config = null) {
    if (!filename) return null;
    
    const debugMode = config?.debug_mode || false;
    
    // Try custom format first if provided
    if (config?.custom_datetime_format?.filename_pattern) {
      const customResult = MediaProvider._extractDateWithCustomFormat(
        filename, 
        config.custom_datetime_format.filename_pattern,
        debugMode,
        'filename'
      );
      if (customResult) {
        if (debugMode) {
          console.log(`🕒 [Custom DateTime] Extracted from filename "${filename}":`, customResult);
        }
        return customResult;
      }
      if (debugMode) {
        console.warn(`⚠️ [Custom DateTime] Failed to extract from filename "${filename}" with pattern "${config.custom_datetime_format.filename_pattern}", falling back to default patterns`);
      }
    }
    
    // Common date+time patterns in filenames
    // NOTE: Patterns match anywhere in filename (e.g., "Tanya_20220727_140134.jpg")
    const patterns = [
      // YYYYMMDD_HHMMSS format (e.g., 20250920_211023 or Tanya_20220727_140134.jpg)
      /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
      // YYYYMMDDHHmmSS format (e.g., 20250920211023 - no separators, must be 14 consecutive digits)
      /(\d{14})/,
      // YYYY-MM-DD_HH-MM-SS format
      /(\d{4})-(\d{2})-(\d{2})[_T\s](\d{2})[:-](\d{2})[:-](\d{2})/,
      // YYYY-MM-DD format (date only)
      /(\d{4})-(\d{2})-(\d{2})/,
      // YYYYMMDD format (date only, 8 consecutive digits)
      /(\d{8})/,
      // DD-MM-YYYY format (date only)
      /(\d{2})-(\d{2})-(\d{4})/
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        try {
          let year, month, day, hour = 0, minute = 0, second = 0;
          
          // Handle 14-digit timestamp (YYYYMMDDHHmmSS)
          if (match[1] && match[1].length === 14) {
            const ts = match[1];
            year = parseInt(ts.substring(0, 4));
            month = parseInt(ts.substring(4, 6)) - 1;
            day = parseInt(ts.substring(6, 8));
            hour = parseInt(ts.substring(8, 10));
            minute = parseInt(ts.substring(10, 12));
            second = parseInt(ts.substring(12, 14));
          }
          // Handle 8-digit date (YYYYMMDD)
          else if (match[1] && match[1].length === 8) {
            const ts = match[1];
            year = parseInt(ts.substring(0, 4));
            month = parseInt(ts.substring(4, 6)) - 1;
            day = parseInt(ts.substring(6, 8));
          }
          // Handle patterns with separate capture groups
          else if (match.length > 6) {
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
            // YYYY-MM-DD (date only)
            year = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            day = parseInt(match[3]);
          } else {
            // DD-MM-YYYY (date only)
            day = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            year = parseInt(match[3]);
          }
          
          const result = new Date(year, month, day, hour, minute, second);
          return result;
        } catch (e) {
          // Invalid date, continue to next pattern
        }
      }
    }
    
    return null;
  }
  
  /**
   * V5.5: Extract date using custom format pattern
   * Supports moment.js-style format tokens: YYYY, MM, DD, HH, mm, ss
   * Example: "YYYY-MM-DD_HH-mm-ss" matches "2024-12-01_14-30-45"
   */
  static _extractDateWithCustomFormat(input, formatPattern, debugMode, source) {
    if (!input || !formatPattern) return null;
    
    try {
      // Convert format pattern to regex, capturing each component
      // YYYY -> (\d{4}), MM/DD/HH/mm/ss -> (\d{2})
      let regexPattern = formatPattern
        .replace(/YYYY/g, '(\\d{4})')
        .replace(/MM|DD|HH|mm|ss/g, '(\\d{2})');
      
      // Escape special regex characters that might be in the pattern
      regexPattern = regexPattern.replace(/[.*+?^${}()|[\]\\]/g, (match) => {
        // Don't escape our capture groups
        if (match === '(' || match === ')' || match === '\\') return match;
        return '\\' + match;
      });
      
      const regex = new RegExp(regexPattern);
      const match = input.match(regex);
      
      if (!match) {
        if (debugMode) {
          console.warn(`⚠️ [Custom DateTime] Pattern "${formatPattern}" did not match ${source}: "${input}"`);
        }
        return null;
      }
      
      // Extract components based on format pattern
      const tokenPositions = [];
      const tokens = ['YYYY', 'MM', 'DD', 'HH', 'mm', 'ss'];
      
      tokens.forEach(token => {
        const pos = formatPattern.indexOf(token);
        if (pos !== -1) {
          tokenPositions.push({ token, pos });
        }
      });
      
      // Sort by position to match capture groups
      tokenPositions.sort((a, b) => a.pos - b.pos);
      
      // Map capture groups to components
      const components = {
        year: 0,
        month: 0,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0
      };
      
      tokenPositions.forEach((tokenInfo, index) => {
        const value = match[index + 1]; // +1 because match[0] is full match
        if (!value) return;
        
        switch (tokenInfo.token) {
          case 'YYYY':
            components.year = parseInt(value);
            break;
          case 'MM':
            components.month = parseInt(value) - 1; // JavaScript months are 0-indexed
            break;
          case 'DD':
            components.day = parseInt(value);
            break;
          case 'HH':
            components.hour = parseInt(value);
            break;
          case 'mm':
            components.minute = parseInt(value);
            break;
          case 'ss':
            components.second = parseInt(value);
            break;
        }
      });
      
      // Validate components
      if (components.year < 1900 || components.year > 2100) {
        if (debugMode) {
          console.warn(`⚠️ [Custom DateTime] Invalid year ${components.year} from ${source}: "${input}"`);
        }
        return null;
      }
      
      const result = new Date(
        components.year,
        components.month,
        components.day,
        components.hour,
        components.minute,
        components.second
      );
      
      // Verify the date is valid
      if (isNaN(result.getTime())) {
        if (debugMode) {
          console.warn(`⚠️ [Custom DateTime] Invalid date components from ${source}: "${input}"`, components);
        }
        return null;
      }
      
      return result;
    } catch (error) {
      if (debugMode) {
        console.error(`❌ [Custom DateTime] Error parsing ${source} "${input}" with pattern "${formatPattern}":`, error);
      }
      return null;
    }
  }

  /**
   * V4: Extract metadata with optional media_index EXIF enrichment (shared helper)
   * Used by both SingleMediaProvider and card's _extractMetadataFromItem
   */
  static async extractMetadataWithExif(mediaPath, config, hass) {
    // Step 1: Extract path-based metadata
    let metadata = MediaProvider.extractMetadataFromPath(mediaPath, config);
    
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
    // Check if media_index integration is active (enabled flag or entity_id provided)
    const isMediaIndexActive = !!(config?.media_index?.enabled || config?.media_index?.entity_id);
    if (!hass || !isMediaIndexActive) return null;
    
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


/**
 * FOLDER PROVIDER - Wraps SubfolderQueue for folder slideshow
 */
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
      debug_mode: this.config.debug_mode || false,  // V5: Pass through debug_mode for SubfolderQueue logging
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
    this.cardAdapter._log('⚠️ Unsupported mode/configuration. Mode:', mode, 'Recursive:', recursive);
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
              const pathMetadata = MediaProvider.extractMetadataFromPath(filePath, this.config);
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
              item.metadata = MediaProvider.extractMetadataFromPath(pathFromUri, this.config);
            }
          } catch (error) {
            // Fallback to path-based metadata if service call fails
            console.error('[FolderProvider] ❌ Could not fetch media_index metadata:', error);
            // Extract path from URI for metadata fallback
            const pathFromUri = mediaUri.replace('media-source://media_source', '');
            item.metadata = MediaProvider.extractMetadataFromPath(pathFromUri);
          }
        } else {
          this.cardAdapter._log('⚠️ Could not extract file path from media_content_id');
        }
      } else {
        if (!item) {
          this.cardAdapter._log('⚠️ SubfolderQueue returned null item (file may have moved or been deleted)');
        } else if (!MediaProvider.isMediaIndexActive(this.config)) {
          this.cardAdapter._log('ℹ️ Media index not active, skipping metadata enrichment');
        }
      }
      
      return item;
    }
    
    this.cardAdapter._log('⚠️ getNext() called but no provider initialized');
    return null;
  }

  // V5.6.7: Delegate file existence check to wrapped provider
  // All providers inherit checkFileExists from base MediaProvider class
  async checkFileExists(mediaItem) {
    // Delegate to whichever provider is active (both inherit from MediaProvider)
    if (this.mediaIndexProvider) {
      return await this.mediaIndexProvider.checkFileExists(mediaItem);
    }
    
    if (this.sequentialProvider) {
      return await this.sequentialProvider.checkFileExists(mediaItem);
    }
    
    // SubfolderQueue doesn't use media_index, no validation available
    return null;
  }

  // V5.6.8: Delegate 404 file exclusion to wrapped provider
  // This allows the card to tell the provider to exclude files that 404
  excludeFile(path) {
    if (!path) return;
    
    this.cardAdapter._log(`🚫 FolderProvider.excludeFile: ${path}`);
    
    // Delegate to whichever provider is active
    if (this.sequentialProvider && typeof this.sequentialProvider.excludeFile === 'function') {
      this.sequentialProvider.excludeFile(path);
    }
    
    if (this.mediaIndexProvider && typeof this.mediaIndexProvider.excludeFile === 'function') {
      this.mediaIndexProvider.excludeFile(path);
    }
    
    // For SubfolderQueue, track excluded files locally
    if (this.subfolderQueue) {
      if (!this._excludedFiles) {
        this._excludedFiles = new Set();
      }
      this._excludedFiles.add(path);
    }
  }

  // Query for files newer than the given date (for queue refresh feature)
  async getFilesNewerThan(dateThreshold) {
    // Delegate to the underlying provider
    if (this.sequentialProvider && typeof this.sequentialProvider.getFilesNewerThan === 'function') {
      this.cardAdapter._log('🔍 Delegating getFilesNewerThan to SequentialMediaIndexProvider');
      return await this.sequentialProvider.getFilesNewerThan(dateThreshold);
    }
    
    if (this.mediaIndexProvider && typeof this.mediaIndexProvider.getFilesNewerThan === 'function') {
      this.cardAdapter._log('🔍 Delegating getFilesNewerThan to MediaIndexProvider');
      return await this.mediaIndexProvider.getFilesNewerThan(dateThreshold);
    }
    
    // For SubfolderQueue (filesystem-based), filter existing queue
    if (this.subfolderQueue && typeof this.subfolderQueue.getFilesNewerThan === 'function') {
      this.cardAdapter._log('🔍 Checking SubfolderQueue for files newer than', dateThreshold);
      return this.subfolderQueue.getFilesNewerThan(dateThreshold);
    }
    
    this.cardAdapter._log('⚠️ No provider available for getFilesNewerThan');
    return [];
  }

  async rescanForNewFiles(currentMediaId = null) {
    // Delegate to SequentialMediaIndexProvider for database-backed sources
    if (this.sequentialProvider && typeof this.sequentialProvider.rescanForNewFiles === 'function') {
      this.cardAdapter._log('🔍 Triggering SequentialMediaIndexProvider rescan');
      return await this.sequentialProvider.rescanForNewFiles(currentMediaId);
    }
    
    // Delegate to SubfolderQueue for filesystem-based sources
    if (this.subfolderQueue && typeof this.subfolderQueue.rescanForNewFiles === 'function') {
      this.cardAdapter._log('🔍 Triggering SubfolderQueue rescan');
      return await this.subfolderQueue.rescanForNewFiles(currentMediaId);
    }
    
    this.cardAdapter._log('⚠️ No rescan method available for this provider');
    return { queueChanged: false };
  }
  
  /**
   * V5.6.8: Check for new files since the slideshow started
   * Delegates to underlying provider (SequentialMediaIndexProvider or SubfolderQueue)
   * Returns array of new items to prepend to navigation queue
   */
  async checkForNewFiles() {
    // Delegate to SequentialMediaIndexProvider (database-backed)
    if (this.sequentialProvider && typeof this.sequentialProvider.checkForNewFiles === 'function') {
      this.cardAdapter._log('🔍 Delegating checkForNewFiles to SequentialMediaIndexProvider');
      return await this.sequentialProvider.checkForNewFiles();
    }
    
    // Delegate to SubfolderQueue (filesystem mode)
    if (this.subfolderQueue && typeof this.subfolderQueue.checkForNewFiles === 'function') {
      this.cardAdapter._log('🔍 Delegating checkForNewFiles to SubfolderQueue');
      return await this.subfolderQueue.checkForNewFiles();
    }
    
    this.cardAdapter._log('⚠️ No checkForNewFiles implementation for this provider');
    return [];
  }
  
  /**
   * V5.6.8: Reset provider to beginning for fresh query
   * Used when wrapping slideshow to start over with fresh data
   */
  async reset() {
    this.cardAdapter._log('🔄 Resetting FolderProvider');
    
    // Delegate to SequentialMediaIndexProvider (database-backed)
    if (this.sequentialProvider && typeof this.sequentialProvider.reset === 'function') {
      this.cardAdapter._log('🔄 Delegating reset to SequentialMediaIndexProvider');
      return await this.sequentialProvider.reset();
    }
    
    // For SubfolderQueue (filesystem), reinitialize
    if (this.subfolderQueue) {
      this.cardAdapter._log('🔄 Re-scanning filesystem via SubfolderQueue');
      // Clear and reinitialize the queue
      this.subfolderQueue.queue = [];
      this.subfolderQueue.shownItems = new Set();
      return await this.subfolderQueue.initialize();
    }
    
    // For MediaIndexProvider (random mode), reinitialize
    if (this.mediaIndexProvider && typeof this.mediaIndexProvider.reset === 'function') {
      this.cardAdapter._log('🔄 Delegating reset to MediaIndexProvider');
      return await this.mediaIndexProvider.reset();
    }
    
    this.cardAdapter._log('⚠️ No reset implementation for this provider');
    return false;
  }

}



/**
 * SUBFOLDER QUEUE - Essential V4 code copied for v5
 * Handles random folder scanning with hierarchical scan
 */
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
          this._log('📋 Sequential mode: Sorting entire queue by date/timestamp...');
          // Sort entire queue to ensure newest files are first (or oldest, based on config)
          const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
          
          // Helper to extract sortable timestamp from any media source
          const getTimestampForSort = (file) => {
            const mediaId = file.media_content_id;
            
            // 1. Reolink: Extract the second timestamp (actual video start time)
            if (mediaId && mediaId.includes('reolink') && mediaId.includes('|')) {
              const parts = mediaId.split('|');
              const timestamps = parts.filter(p => /^\d{14}$/.test(p));
              const timestamp = timestamps.length > 1 ? timestamps[1] : timestamps[0];
              if (timestamp) return timestamp;
            }
            
            // 2. Try date_taken metadata if available
            if (file.metadata?.date_taken) {
              const date = new Date(file.metadata.date_taken);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              const seconds = String(date.getSeconds()).padStart(2, '0');
              return `${year}${month}${day}${hours}${minutes}${seconds}`;
            }
            
            // 3. Fallback to title/filename
            return (file.title || '').toLowerCase();
          };
          
          // Helper to get numeric value for comparison
          // If key is purely numeric, use it directly
          // If alphanumeric, try to extract date using MediaProvider helper
          const getNumericValue = (key) => {
            if (/^\d+$/.test(key)) {
              return BigInt(key);
            }
            // Try extracting date from the key (which is filename/title)
            const dateFromKey = MediaProvider.extractDateFromFilename(key, this.card.config);
            if (dateFromKey) {
              return BigInt(dateFromKey.getTime());
            }
            return null;
          };
          
          this.queue.sort((a, b) => {
            const keyA = getTimestampForSort(a);
            const keyB = getTimestampForSort(b);
            
            const numA = getNumericValue(keyA);
            const numB = getNumericValue(keyB);
            
            // Files with dates should come before files without dates
            if (numA !== null && numB === null) return -1;
            if (numA === null && numB !== null) return 1;
            
            // Both have numeric dates - compare them
            if (numA !== null && numB !== null) {
              if (orderDirection === 'desc') {
                return numB > numA ? 1 : numB < numA ? -1 : 0;
              } else {
                return numA > numB ? 1 : numA < numB ? -1 : 0;
              }
            }
            
            // Both are non-date filenames - use localeCompare for alphabetical
            if (orderDirection === 'desc') {
              return keyB.localeCompare(keyA);
            } else {
              return keyA.localeCompare(keyB);
            }
          });
          
          this._log('✅ Queue sorted', orderDirection, '- first item:', this.queue[0]?.title, 'last item:', this.queue[this.queue.length - 1]?.title);
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
        
        // Helper to extract sortable timestamp/date key from any media source
        const getTimestampForSort = (file) => {
          const mediaId = file.media_content_id;
          
          // 1. Reolink: Extract the second timestamp (actual video start time)
          if (mediaId && mediaId.includes('reolink') && mediaId.includes('|')) {
            const parts = mediaId.split('|');
            const timestamps = parts.filter(p => /^\d{14}$/.test(p));
            // Use second timestamp if available (matches video title time)
            const timestamp = timestamps.length > 1 ? timestamps[1] : timestamps[0];
            if (timestamp) {
              return timestamp; // YYYYMMDDHHMMSS format - sorts correctly as string
            }
          }
          
          // 2. Try extracting date from filename using MediaProvider's date extraction
          // For Immich and other sources, file.title is the clean filename
          const filename = file.title || MediaProvider.extractFilename(mediaId);
          const dateFromFilename = MediaProvider.extractDateFromFilename(filename, this.config);
          
          if (dateFromFilename) {
            // Convert to YYYYMMDDHHMMSS format for consistent sorting
            const year = dateFromFilename.getFullYear();
            const month = String(dateFromFilename.getMonth() + 1).padStart(2, '0');
            const day = String(dateFromFilename.getDate()).padStart(2, '0');
            const hours = String(dateFromFilename.getHours()).padStart(2, '0');
            const minutes = String(dateFromFilename.getMinutes()).padStart(2, '0');
            const seconds = String(dateFromFilename.getSeconds()).padStart(2, '0');
            return `${year}${month}${day}${hours}${minutes}${seconds}`;
          }
          
          // 3. Fallback to title or filename for alphabetical sorting
          return (file.title || filename || '').toLowerCase();
        };
        
        availableFiles = [...availableFiles].sort((a, b) => {
          const keyA = getTimestampForSort(a);
          const keyB = getTimestampForSort(b);
          
          // Helper to get numeric value for comparison
          // If key is purely numeric, use it directly
          // If alphanumeric, try to extract date using MediaProvider helper
          const getNumericValue = (key, file) => {
            if (/^\d+$/.test(key)) {
              return BigInt(key);
            }
            // Try extracting date from the key (which is filename/title)
            const dateFromKey = MediaProvider.extractDateFromFilename(key, this.card.config);
            if (dateFromKey) {
              return BigInt(dateFromKey.getTime());
            }
            return null;
          };
          
          const numA = getNumericValue(keyA, a);
          const numB = getNumericValue(keyB, b);
          
          // Files with dates should come before files without dates
          if (numA !== null && numB === null) return -1;
          if (numA === null && numB !== null) return 1;
          
          // Both have numeric dates - compare them
          if (numA !== null && numB !== null) {
            if (orderDirection === 'desc') {
              return numB > numA ? 1 : numB < numA ? -1 : 0; // Newest first
            } else {
              return numA > numB ? 1 : numA < numB ? -1 : 0; // Oldest first
            }
          }
          
          // Both are non-date filenames - use localeCompare for alphabetical
          if (orderDirection === 'desc') {
            return keyB.localeCompare(keyA);
          } else {
            return keyA.localeCompare(keyB);
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
          // Most camera/NVR folders use date-based naming (YYYYMMDD, YYYY-MM-DD, YYYY/M/D, etc.)
          sortedSubfolders = [...subfolders].sort((a, b) => {
            const nameA = (a.title || a.media_content_id.split('/').pop() || '');
            const nameB = (b.title || b.media_content_id.split('/').pop() || '');
            
            // Extract numeric parts for proper date comparison
            // Handles: "2026/1/12", "2026-01-12", "20260112", etc.
            const extractDateValue = (name) => {
              // Try to extract all numbers from the name
              const numbers = name.match(/\d+/g);
              if (!numbers) return 0;
              
              // If looks like YYYYMMDD (8 digits), parse directly
              if (numbers.length === 1 && numbers[0].length === 8) {
                return parseInt(numbers[0], 10);
              }
              
              // If we have year/month/day parts (e.g., "2026/1/12" or "2026-01-12")
              if (numbers.length >= 3) {
                const year = parseInt(numbers[0], 10);
                const month = parseInt(numbers[1], 10);
                const day = parseInt(numbers[2], 10);
                // Create sortable number: YYYYMMDD
                return year * 10000 + month * 100 + day;
              }
              
              // If we have just one number (e.g., day folder "12" inside month folder)
              if (numbers.length === 1) {
                return parseInt(numbers[0], 10);
              }
              
              // Fallback: join all numbers
              return parseInt(numbers.join(''), 10) || 0;
            };
            
            const valueA = extractDateValue(nameA);
            const valueB = extractDateValue(nameB);
            
            if (orderDirection === 'desc') {
              // Descending: newest dates first (higher values first)
              return valueB - valueA;
            } else {
              // Ascending: oldest dates first (lower values first)
              return valueA - valueB;
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
          const dateFromFilename = MediaProvider.extractDateFromFilename(filename, this.config);
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
          const aDate = MediaProvider.extractDateFromFilename(aFilename, this.config);
          const bDate = MediaProvider.extractDateFromFilename(bFilename, this.config);
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

  /**
   * Rescan the folder to detect new files
   * Returns info about whether the queue changed
   * @returns {Object} { queueChanged: boolean, previousFirstItem: Object, newFirstItem: Object }
   */
  async rescanForNewFiles() {
    this._log('🔄 Rescanning folder to detect new files...');
    
    // Save the current first item details before rescan
    const previousFirstItem = this.queue.length > 0 ? {
      title: this.queue[0].title,
      media_content_id: this.queue[0].media_content_id,
      date_taken: this.queue[0].metadata?.date_taken
    } : null;
    const previousQueueSize = this.queue.length;
    
    this._log('🔍 Previous first item:', previousFirstItem);
    
    try {
      // Clear everything just like initialize() does
      this.queue = [];
      this.shownItems.clear();
      this.discoveryStartTime = Date.now();
      
      // Enable scanning flags to allow rescan
      this._scanCancelled = false;
      this.isScanning = true;
      this.discoveryInProgress = true;
      
      // Trigger a quick scan to rebuild the queue with latest files
      await this.quickScan();
      
      const newFirstItem = this.queue.length > 0 ? {
        title: this.queue[0].title,
        media_content_id: this.queue[0].media_content_id,
        date_taken: this.queue[0].metadata?.date_taken
      } : null;
      
      this._log('🔍 New first item:', newFirstItem);
      
      // Compare by title (which includes timestamp) for better change detection
      // Also compare by date_taken if available (more reliable than title)
      let queueChanged = false;
      
      if (!previousFirstItem && newFirstItem) {
        queueChanged = true; // Was empty, now has items
        this._log('📊 Queue changed: was empty, now has', this.queue.length, 'items');
      } else if (previousFirstItem && !newFirstItem) {
        queueChanged = true; // Had items, now empty
        this._log('📊 Queue changed: had items, now empty');
      } else if (previousFirstItem && newFirstItem) {
        // Compare date_taken first (most reliable), then title
        if (previousFirstItem.date_taken && newFirstItem.date_taken) {
          queueChanged = previousFirstItem.date_taken !== newFirstItem.date_taken;
          this._log('📊 Comparing by date_taken:', previousFirstItem.date_taken, '→', newFirstItem.date_taken, 'changed:', queueChanged);
        } else {
          queueChanged = previousFirstItem.title !== newFirstItem.title;
          this._log('📊 Comparing by title:', previousFirstItem.title, '→', newFirstItem.title, 'changed:', queueChanged);
        }
      }
      
      this._log(`✅ Rescan complete: queue was ${previousQueueSize}, now ${this.queue.length}, changed: ${queueChanged}`);
      
      return {
        queueChanged,
        previousFirstItem,
        newFirstItem,
        previousQueueSize,
        newQueueSize: this.queue.length
      };
    } catch (error) {
      this._log('⚠️ Rescan failed:', error);
      return {
        queueChanged: false,
        previousFirstItem,
        newFirstItem: previousFirstItem,
        previousQueueSize,
        newQueueSize: this.queue.length
      };
    } finally {
      // Clean up scanning flags
      this.isScanning = false;
      this.discoveryInProgress = false;
    }
  }

  /**
   * Get files from the queue that are newer than the specified date
   * This method filters the existing queue without rescanning
   * Note: Use rescanForNewFiles() to trigger a full rescan first
   * @param {Date} dateThreshold - Only return files newer than this date
   * @returns {Array} Files with date_taken newer than threshold
   */
  async getFilesNewerThan(dateThreshold) {
    if (!dateThreshold) {
      this._log('⚠️ getFilesNewerThan: No date threshold provided');
      return [];
    }

    // Filter existing queue for newer files
    const thresholdTime = dateThreshold.getTime();
    const newerFiles = this.queue.filter(item => {
      if (!item.metadata?.date_taken) {
        return false;
      }
      const itemDate = new Date(item.metadata.date_taken);
      return itemDate.getTime() > thresholdTime;
    });

    this._log(`🔍 getFilesNewerThan: Found ${newerFiles.length} files newer than ${dateThreshold.toISOString()} (checked ${this.queue.length} files in queue)`);
    return newerFiles;
  }
  
  /**
   * V5.6.8: Check for new files since the slideshow started
   * Rescans the folder tree and returns any files not seen in the original scan.
   * This is more expensive than the database version but works for filesystem mode.
   * @returns {Array} New items to prepend to navigation queue
   */
  async checkForNewFiles() {
    // Store the files we knew about at the start
    if (!this._knownFilesAtStart) {
      // First call - record current state as baseline
      this._knownFilesAtStart = new Set(this.queue.map(item => item.media_content_id));
      this._log(`📝 Recorded ${this._knownFilesAtStart.size} known files as baseline for periodic refresh`);
      return [];
    }
    
    this._log('🔄 Checking for new files (filesystem mode)...');
    
    // Save current queue state
    const originalQueue = [...this.queue];
    const originalShown = new Set(this.shownItems);
    
    try {
      // Do a fresh scan
      this.queue = [];
      this.shownItems.clear();
      this._scanCancelled = false;
      this.isScanning = true;
      this.discoveryInProgress = true;
      
      await this.quickScan();
      
      // Find new files (in fresh scan but not in baseline)
      const newFiles = this.queue.filter(item => 
        !this._knownFilesAtStart.has(item.media_content_id)
      );
      
      this._log(`📊 Scan found ${this.queue.length} total files, ${newFiles.length} are new since start`);
      
      // Restore original queue (don't disrupt current playback)
      this.queue = originalQueue;
      this.shownItems = originalShown;
      
      if (newFiles.length > 0) {
        // Update baseline to include new files
        newFiles.forEach(item => this._knownFilesAtStart.add(item.media_content_id));
        this._log(`✅ Found ${newFiles.length} new files during periodic refresh`);
      }
      
      return newFiles;
      
    } catch (error) {
      this._log('⚠️ checkForNewFiles failed:', error);
      // Restore original state on error
      this.queue = originalQueue;
      this.shownItems = originalShown;
      return [];
    } finally {
      this.isScanning = false;
      this.discoveryInProgress = false;
    }
  }
  
  /**
   * V5.6.8: Reset the queue for fresh start
   * Called when wrapping the slideshow to reload latest files
   */
  async reset() {
    this._log('🔄 Resetting SubfolderQueue');
    
    // KEEP the known files baseline across resets - this prevents duplicates
    // when periodic refresh runs after a wrap. The baseline represents
    // "files known at session start" and should persist across loops.
    // (Was: this._knownFilesAtStart = null - caused duplicates)
    
    // Clear queue and reinitialize
    this.queue = [];
    this.shownItems.clear();
    
    return await this.initialize();
  }
}

/**
 * MediaCard - Main card component
 * Phase 2: Now uses provider pattern to display media
 */


/**
 * MEDIA INDEX PROVIDER - Database-backed random media queries
 * V4 CODE REUSE: Copied from ha-media-card.js lines 2121-2250 (_queryMediaIndex)
 * Adapted for provider pattern architecture
 */
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
  
  // V5.6.7: checkFileExists is inherited from base MediaProvider class
  // No need to duplicate - all providers share the same media_index.check_file_exists service
  
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
    // V5.6.8: Skip for non-admin users - fire_event requires admin permissions
    // This prevents HA from logging "Unauthorized" errors for dashboard-only users
    if (this.hass?.user?.is_admin === false) {
      this._log('⏭️ Skipping fire_event (non-admin user)');
    } else if (this.hass && this.hass.connection && this.hass.connection.sendMessage) {
      try {
        const promise = this.hass.connection.sendMessage({
          type: 'fire_event',
          event_type: 'media_card_queue_stats',
          event_data: stats
        });
        
        // Only add catch handler if sendMessage returned a promise
        if (promise && typeof promise.catch === 'function') {
          promise.catch(err => {
            // Silently ignore - this is optional functionality
            this._log('⚠️ fire_event failed (may require admin):', err?.message || err);
          });
        }
      } catch (err) {
        // Silently ignore - this is optional functionality
        this._log('⚠️ fire_event failed (may require admin):', err?.message || err);
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
  async _resolveFilterValue(configValue, expectedType, providedState = null) {
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
    // Use providedState if available (from state_changed event), otherwise lookup in hass.states
    const state = providedState || this.hass?.states[configValue];
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
   * V5.6.8: Gracefully handles non-admin users who can't subscribe to state_changed
   */
  async _subscribeToFilterEntities() {
    // V5.6.8: Skip for non-admin users - subscribeEvents('state_changed') requires admin permissions
    // This prevents HA from logging "Unauthorized" errors for dashboard-only users
    if (this.hass?.user?.is_admin === false) {
      this._log('⏭️ Skipping entity subscription (non-admin user - filter changes require page refresh)');
      return;
    }
    
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
    // NOTE: WebSocket API doesn't support entity-specific subscriptions for state_changed events,
    // so we receive ALL state changes and filter in the callback to our watched entities
    try {
      this._entityUnsubscribe = await this.hass.connection.subscribeEvents(
        async (event) => {
          // Only process state_changed events for our filter entities
          const changedEntityId = event.data?.entity_id;
          if (!changedEntityId || !this._entitySubscriptions.includes(changedEntityId)) {
            return; // Ignore non-filter entities
          }
          
          // Get the new state from event data
          const newState = event.data?.new_state;
          this._log('🔄 Filter entity changed:', changedEntityId, '→', newState?.state);
          
          // Resolve current filter values, passing new state directly to avoid mutating hass.states
          // For the changed entity, use new_state from event; others will lookup from hass.states
          const currentFilters = {
            favorites: await this._resolveFilterValue(
              filters.favorites, 
              'boolean', 
              filters.favorites === changedEntityId ? newState : null
            ),
            date_from: await this._resolveFilterValue(
              filters.date_range?.start, 
              'date',
              filters.date_range?.start === changedEntityId ? newState : null
            ),
            date_to: await this._resolveFilterValue(
              filters.date_range?.end, 
              'date',
              filters.date_range?.end === changedEntityId ? newState : null
            )
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
      // V5.6.8: Silently handle - this is optional functionality for dynamic filter updates
      // Non-admin users will need to refresh page when filters change
      this._log('⚠️ Entity subscription failed (filter changes require page refresh):', error?.message || error);
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
      const pathMetadata = MediaProvider.extractMetadataFromPath(item.path, this.config);
      
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

  /**
   * V5.6.8: Reset provider state for fresh query
   * Clears queue and excluded files, reinitializes
   */
  async reset() {
    this._log('🔄 Resetting MediaIndexProvider');
    this.queue = [];
    this.excludedFiles.clear();
    this.recentFilesExhausted = false;
    this._consecutiveEmptyResponses = 0;
    return await this.initialize();
  }

  // Query for new files (for queue refresh feature)
  // For random mode, we don't filter by date but can query with priority_new_files
  async getFilesNewerThan(dateThreshold) {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      this._log('⚠️ Media index not configured');
      return [];
    }

    try {
      this._log('🔍 Checking for new files (random mode - using priority_new_files)');
      
      // Query with priority_new_files to get recently indexed files
      const result = await this._queryMediaIndex({
        priority_new_files: true,
        new_files_threshold_seconds: 3600, // Last hour
        count: 50 // Check first 50 new files
      });
      
      if (result && result.length > 0) {
        this._log(`✅ Found ${result.length} new files`);
        return result;
      } else {
        this._log('No new files found');
        return [];
      }
    } catch (error) {
      console.error('[MediaIndexProvider] ❌ Error checking for new files:', error);
      return [];
    }
  }
}


/**
 * SEQUENTIAL MEDIA INDEX PROVIDER - Database-backed ordered queries
 * NEW V5 FEATURE: Sequential mode with cursor-based pagination
 * Uses media_index.get_ordered_files service for deterministic ordering
 */
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
    this.lastSeenValue = null; // Cursor for pagination (sort value)
    this.lastSeenId = null; // Secondary cursor for tie-breaking (row id)
    this.hasMore = true; // Flag to track if more items available
    // Set to true when all items have been paged and no more results are available from the database
    // Prevents further navigation attempts and unnecessary service calls
    this.reachedEnd = false;
    this.disableAutoLoop = false; // V5.3: Prevent auto-loop during pre-load
  }

  _log(...args) {
    if (this.config?.debug_mode) {
      console.log('[SequentialMediaIndexProvider]', ...args);
    }
  }
  
  /**
   * Convert a date value to Unix timestamp (seconds).
   * Handles: Unix timestamps, Date objects, ISO strings, EXIF date strings
   * @param {number|string|Date} value - The date value to convert
   * @returns {number|null} Unix timestamp in seconds, or null if invalid
   */
  _toUnixTimestamp(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Already a numeric timestamp
    if (typeof value === 'number') {
      // If it looks like milliseconds (13+ digits), convert to seconds
      return value > 9999999999 ? Math.floor(value / 1000) : value;
    }
    
    // Date object
    if (value instanceof Date) {
      return Math.floor(value.getTime() / 1000);
    }
    
    // String - try to parse
    if (typeof value === 'string') {
      // Try ISO format or other parseable date strings
      const parsed = Date.parse(value);
      if (!isNaN(parsed)) {
        return Math.floor(parsed / 1000);
      }
      
      // Try EXIF format: "2022:07:09 00:15:41"
      const exifMatch = value.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
      if (exifMatch) {
        const [, year, month, day, hour, min, sec] = exifMatch;
        const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
        if (!isNaN(date.getTime())) {
          return Math.floor(date.getTime() / 1000);
        }
      }
      
      this._log(`⚠️ Could not parse date string to timestamp: ${value}`);
    }
    
    return null;
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
    
    // V5.6.8: Store reference to first item for periodic refresh comparison
    if (items.length > 0) {
      const firstItem = items[0];
      this._firstItemAtStart = firstItem.media_source_uri || firstItem.path;
      this._firstItemDateAtStart = firstItem.date_taken || firstItem.modified_time || 0;
      this._log('📝 Reference point for periodic refresh:', this._firstItemAtStart);
    }
    
    this._log('✅ Initialized with', this.queue.length, 'items');
    return true;
  }

  async getNext() {
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
    
    // Return next item from queue (skip excluded files)
    if (this.queue.length > 0) {
      let item = this.queue.shift();
      
      // V5.6.8: Skip excluded files (404s) - keep checking until we find a non-excluded file
      // Use _isExcluded for normalized path comparison
      while (item && this._isExcluded(item.path)) {
        this._log(`⏭️ Skipping excluded file in getNext: ${item.path}`);
        if (this.queue.length === 0) {
          this._log('⚠️ Queue exhausted while skipping excluded files');
          return null;
        }
        item = this.queue.shift();
      }
      
      if (!item) {
        this._log('⚠️ No valid (non-excluded) items left in queue');
        return null;
      }
      
      // V5.6.8: Cursor is now managed by _queryOrderedFiles() after client-side sort
      // DO NOT update cursor here - it would overwrite the correct end-of-batch cursor
      // with the cursor of the item being returned, causing duplicate fetches
      
      // Extract metadata using MediaProvider helper (V5 architecture)
      const pathMetadata = MediaProvider.extractMetadataFromPath(item.path, this.config);
      
      // V5 URI WORKFLOW: Use media_source_uri from Media Index when available
      const mediaId = item.media_source_uri || item.path;
      
      return {
        // V5: Use URI for media_content_id (Media Index v1.1.0+ provides media_source_uri)
        media_content_id: mediaId,
        media_content_type: MediaUtils.detectFileType(item.path) || 'image',
        title: pathMetadata.filename, // V5.6.8: Add title field for card logging
        // V5.6.8: Add path and media_source_uri at top level for 404 exclusion
        path: item.path,
        media_source_uri: item.media_source_uri,
        filename: pathMetadata.filename,
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
  // V5.6.8: Now fetches additional batches if too many items are excluded (404s)
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
      
      // V5.6.8: Use local cursor for this query session (don't modify this.lastSeenValue until getNext)
      let localCursor = this.lastSeenValue;
      let localCursorId = this.lastSeenId;  // Secondary cursor for tie-breaking
      let allFilteredItems = [];
      let seenPaths = new Set(); // Track paths we've already added to avoid duplicates
      // Allow more iterations for larger queues, but cap to avoid infinite loops
      let maxIterations = Math.max(5, Math.min(20, Math.ceil(this.queueSize / 10)));
      let iteration = 0;
      
      // Keep fetching batches until we have enough valid items OR database is exhausted
      while (allFilteredItems.length < this.queueSize && iteration < maxIterations) {
        iteration++;
        
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
        
        // Add compound cursor for pagination (if we've seen items before)
        // Using (after_value, after_id) handles duplicate sort values correctly
        if (localCursor !== null) {
          serviceData.after_value = localCursor;
          if (localCursorId !== null) {
            serviceData.after_id = localCursorId;
          }
          this._log('🔍 Using cursor:', `after_value=${localCursor}, after_id=${localCursorId}`, `(iteration ${iteration})`);
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
          if (iteration === 1) {
            this._log('🎯 Targeting entity:', this.config.media_index.entity_id);
          }
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

        if (!response || !response.items || !Array.isArray(response.items)) {
          this._log('⚠️ No items in response - database exhausted');
          this.hasMore = false;
          break; // Exit loop - no more items available
        }
        
        this._log('✅ Received', response.items.length, 'items from media_index', `(iteration ${iteration})`);
        if (iteration === 1) {
          this._log(`📝 Currently ${this.excludedFiles.size} files in exclusion list`);
        }
        
        // Check if we got fewer items than requested (indicates end of sequence)
        if (response.items.length < this.queueSize) {
          this._log('📝 Received fewer items than requested - at end of sequence');
          this.hasMore = false;
        }
        
        // Filter excluded files, unsupported formats, AND duplicates from previous batches
        const filteredItems = response.items.filter(item => {
          // V5.6.8: Skip duplicates (same item returned in overlapping batches)
          if (seenPaths.has(item.path)) {
            this._log(`⏭️ Skipping duplicate from overlapping batch: ${item.path}`);
            return false;
          }
          
          // V5.6.8: Use _isExcluded for normalized path comparison
          const isExcluded = this._isExcluded(item.path);
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
          
          // Track this path as seen
          seenPaths.add(item.path);
          return true;
        });
        
        if (filteredItems.length < response.items.length) {
          this._log(`📝 Filtered ${response.items.length - filteredItems.length} files (${filteredItems.length} remaining in this batch)`);
        }
        
        // Add filtered items to our accumulated result
        allFilteredItems.push(...filteredItems);
        
        // Update compound cursor using the LAST item in the batch
        // The backend now uses (sort_field, id) compound ordering, so using the last item
        // guarantees we advance past ALL items in this batch, even with duplicate sort values
        if (response.items.length > 0) {
          const lastItem = response.items[response.items.length - 1];
          
          // Update the sort value cursor
          // V5.6.8: Use _toUnixTimestamp to ensure date fields are numeric (fixes ISO string errors)
          switch(this.orderBy) {
            case 'date_taken':
              localCursor = this._toUnixTimestamp(lastItem.date_taken) || 
                            this._toUnixTimestamp(lastItem.modified_time) || 
                            this._toUnixTimestamp(lastItem.created_time);
              break;
            case 'filename':
              localCursor = lastItem.filename;
              break;
            case 'path':
              localCursor = lastItem.path;
              break;
            case 'modified_time':
              localCursor = this._toUnixTimestamp(lastItem.modified_time);
              break;
            default:
              localCursor = lastItem.path;
          }
          
          // Update the id cursor for tie-breaking
          localCursorId = lastItem.id;
          
          this._log(`📍 Updated compound cursor: value=${localCursor}, id=${localCursorId}`);
        }
        
        // If we got enough items OR database is exhausted, exit loop
        if (allFilteredItems.length >= this.queueSize || !this.hasMore) {
          break;
        }
        
        this._log(`🔄 Need more items (have ${allFilteredItems.length}, need ${this.queueSize}) - fetching next batch...`);
      }
      
      // Now process all accumulated items
      if (allFilteredItems.length === 0) {
        this._log('⚠️ No valid items after filtering across all batches');
        this.hasMore = false;
        return null;
      }
      
      this._log(`📊 Total items after ${iteration} iteration(s): ${allFilteredItems.length}`);
        
      // CLIENT-SIDE SAFETY: Re-sort items to handle null date_taken gracefully
      // Backend should already sort correctly, but this prevents issues if:
      // - Videos have null date_taken but recent modified_time
      // - Backend fallback logic changes
      // - Network/caching returns stale data
      if (this.orderBy === 'date_taken') {
        allFilteredItems.sort((a, b) => {
          // Use date_taken, fallback to modified_time, then created_time
          const dateA = a.date_taken || a.modified_time || a.created_time || 0;
          const dateB = b.date_taken || b.modified_time || b.created_time || 0;
          
          // Apply direction
          return this.orderDirection === 'desc' ? dateB - dateA : dateA - dateB;
        });
        this._log('🔄 Applied client-side sort by date_taken with fallback to modified_time/created_time');
        
        // V5.6.8: CRITICAL - Update cursor based on LAST item in SORTED array
        // The cursor must reflect the actual last item we're returning, not the backend's order
        // Use _toUnixTimestamp to ensure numeric values (fixes ISO string errors)
        if (allFilteredItems.length > 0) {
          const lastSortedItem = allFilteredItems[allFilteredItems.length - 1];
          localCursor = this._toUnixTimestamp(lastSortedItem.date_taken) || 
                        this._toUnixTimestamp(lastSortedItem.modified_time) || 
                        this._toUnixTimestamp(lastSortedItem.created_time);
          localCursorId = lastSortedItem.id;
          this._log(`📍 Updated cursor AFTER client-side sort: value=${localCursor}, id=${localCursorId}`);
        }
      }
      
      // Transform items to include resolved URLs
      const items = await Promise.all(allFilteredItems.map(async (item) => {
        // V5 URI: Use media_source_uri for URL resolution when available
        const mediaId = item.media_source_uri || item.path;
        const resolvedUrl = await this._resolveMediaPath(mediaId);
        return {
          ...item,
          media_content_id: mediaId, // CRITICAL: Add media_content_id for queue validation
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
      
      // V5.6.8: Update class-level cursor so subsequent refills don't re-fetch same items
      // This is critical for proper pagination when queue.length < 10 triggers immediate refill
      this.lastSeenValue = localCursor;
      this.lastSeenId = localCursorId;
      
      return items;
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

  // Normalize a path for consistent comparison (handle URL encoding, special chars)
  _normalizePath(path) {
    if (!path) return '';
    // Decode URL-encoded characters for consistent comparison
    try {
      path = decodeURIComponent(path);
    } catch (e) {
      // Log decode failures for debugging while preserving original behavior
      this._log(`⚠️ Failed to decode path "${path}": ${e?.message || e}`);
    }
    // Strip media-source:// prefix if present
    path = path.replace(/^media-source:\/\/media_source/, '');
    return path;
  }

  // Track excluded files
  excludeFile(path) {
    if (!path) return;
    // Store both original and normalized versions to catch all variations
    const normalizedPath = this._normalizePath(path);
    this.excludedFiles.add(path);
    this.excludedFiles.add(normalizedPath);
    this._log(`🚫 Excluding file: ${path}`);
    this._log(`🚫 Normalized path: ${normalizedPath}`);
    this._log(`🚫 excludedFiles now has ${this.excludedFiles.size} entries`);
  }

  // Check if a file is excluded
  _isExcluded(path) {
    if (!path) return false;
    const normalizedPath = this._normalizePath(path);
    return this.excludedFiles.has(path) || this.excludedFiles.has(normalizedPath);
  }

  // Reset to beginning of sequence (for loop functionality)
  reset() {
    this._log('Resetting to beginning of sequence');
    this.queue = [];
    this.lastSeenValue = null;
    this.lastSeenId = null;  // V5.6.8: Also reset the secondary cursor
    this.hasMore = true;
    this.reachedEnd = false;
    return this.initialize();
  }

  // Query for files newer than the given date (for queue refresh feature)
  async getFilesNewerThan(dateThreshold) {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      this._log('⚠️ Media index not configured');
      return [];
    }

    try {
      this._log('🔍 Checking for files newer than:', dateThreshold);
      
      // Build query similar to _queryOrderedFiles but with date filter
      let folderFilter = null;
      if (this.config.folder?.path) {
        let path = this.config.folder.path;
        if (!path.startsWith('media-source://immich')) {
          folderFilter = path;
        }
      }
      
      const serviceData = {
        count: 100, // Check first 100 new files
        folder: folderFilter,
        recursive: this.recursive,
        file_type: this.config.media_type === 'all' ? undefined : this.config.media_type,
        order_by: this.orderBy,
        order_direction: this.orderDirection,
        date_taken_after: dateThreshold // Filter for files newer than threshold
      };
      
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_ordered_files',
        service_data: serviceData,
        return_response: true
      };
      
      if (this.config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: this.config.media_index.entity_id
        };
      }
      
      this._log('🔍 Service call:', wsCall);
      const response = await this.hass.callWS(wsCall);
      this._log('📥 Response:', response);
      
      if (response?.response?.items && Array.isArray(response.response.items)) {
        const items = response.response.items;
        this._log(`✅ Found ${items.length} files newer than ${dateThreshold}`);
        return items;
      } else {
        this._log('No new files found');
        return [];
      }
    } catch (error) {
      console.error('[SequentialMediaIndexProvider] ❌ Error checking for new files:', error);
      return [];
    }
  }

  // Rescan by resetting cursor and checking if first item changed
  async rescanForNewFiles(currentMediaId = null) {
    this._log('🔄 Rescanning database for new files...');
    
    // V5.6.5: Use provided currentMediaId for comparison (prevents false positives on wrap)
    // Fall back to queue[0] if not provided
    const previousFirstItem = currentMediaId || (this.queue.length > 0 ? this.queue[0].media_content_id : null);
    
    // Reset cursor to beginning
    this.lastSeenValue = null;
    this.lastSeenId = null;  // V5.6.8: Also reset the secondary cursor
    this.hasMore = true;
    this.reachedEnd = false;
    
    // Re-query from start
    const items = await this._queryOrderedFiles();
    
    if (!items || items.length === 0) {
      this._log('⚠️ Rescan returned no items');
      return {
        queueChanged: false,
        previousFirstItem,
        newFirstItem: previousFirstItem
      };
    }
    
    // Replace queue with fresh results
    this.queue = items;
    const newFirstItem = this.queue[0].media_content_id;
    const queueChanged = previousFirstItem !== newFirstItem;
    
    this._log(`📊 Rescan complete - first item changed: ${queueChanged}`);
    this._log(`   Previous: ${previousFirstItem}`);
    this._log(`   New: ${newFirstItem}`);
    
    return {
      queueChanged,
      previousFirstItem,
      newFirstItem
    };
  }
  
  /**
   * V5.6.8: Check for new files since the start of the slideshow
   * Called periodically by media-card to detect files added to the library.
   * Returns array of new items that weren't in the original query.
   * Does NOT reset cursor or change provider state.
   */
  async checkForNewFiles() {
    if (!MediaProvider.isMediaIndexActive(this.config)) {
      this._log('⚠️ Media index not configured - cannot check for new files');
      return [];
    }
    
    // Remember the first item we saw when slideshow started
    // This is stored when queue is first populated
    if (!this._firstItemAtStart) {
      this._log('📝 No reference point - cannot check for new files');
      return [];
    }
    
    this._log('🔍 Checking for files newer than session start...');
    
    try {
      // Query from the beginning (no cursor) to get current newest files
      let folderFilter = null;
      if (this.config.folder?.path) {
        let path = this.config.folder.path;
        if (!path.startsWith('media-source://immich')) {
          folderFilter = path;
        }
      }
      
      const serviceData = {
        count: this.queueSize, // Get same batch size as normal query
        folder: folderFilter,
        recursive: this.recursive,
        file_type: this.config.media_type === 'all' ? undefined : this.config.media_type,
        order_by: this.orderBy,
        order_direction: this.orderDirection
        // No cursor - query from beginning
      };
      
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_ordered_files',
        service_data: serviceData,
        return_response: true
      };
      
      if (this.config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: this.config.media_index.entity_id
        };
      }
      
      const wsResponse = await this.hass.callWS(wsCall);
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;
      
      if (!response || !response.items || !Array.isArray(response.items)) {
        this._log('⚠️ No items in periodic check response');
        return [];
      }
      
      // Find items that are newer than our reference point
      const newItems = [];
      for (const item of response.items) {
        // Stop when we hit the item we started with (or older)
        if (item.media_content_id === this._firstItemAtStart || 
            item.path === this._firstItemAtStart) {
          break;
        }
        
        // Also stop if date is older than reference (for safety)
        if (this._firstItemDateAtStart) {
          const itemDate = item.date_taken || item.modified_time || 0;
          if (itemDate <= this._firstItemDateAtStart) {
            break;
          }
        }
        
        // Transform item like _queryOrderedFiles does
        const pathMetadata = MediaProvider.extractMetadataFromPath(item.path, this.config);
        const mediaId = item.media_source_uri || item.path;
        
        newItems.push({
          media_content_id: mediaId,
          media_content_type: item.file_type === 'video' ? 'video' : 'image',
          title: pathMetadata.filename,
          path: item.path,
          media_source_uri: item.media_source_uri,
          filename: pathMetadata.filename,
          metadata: {
            ...pathMetadata,
            path: item.path,
            media_source_uri: item.media_source_uri,
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
        });
      }
      
      this._log(`🔍 Periodic check found ${newItems.length} new files`);
      return newItems;
      
    } catch (error) {
      console.error('[SequentialMediaIndexProvider] ❌ Error in checkForNewFiles:', error);
      return [];
    }
  }
}



/**
 * MediaCard - Main card component
 * Phase 2: Now uses provider pattern to display media
 */
class MediaCard extends LitElement {
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
    this._onThisDayUsePhotoDate = false; // V5.6.7: Use photo's date vs today's date
    
    // V5.6.7: Queue panel scroll position preservation
    this._previousQueuePageIndex = null;   // Saved queue scroll position before special panels
    this._previousPauseState = null;       // Saved pause state before special panels
    this._previousNavigationIndex = null;  // Saved navigation index before navigation
    this._isLoadingNext = false;  // Re-entrance guard for _loadNext()
    this._isManualNavigation = false; // V5.6.7: Track if navigation is user-initiated vs timer-driven
    
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
    
    // V5.6.7: Hide bottom overlays during video playback (to access video controls)
    this._hideBottomOverlaysForVideo = false;
    
    // V5.6.8: Video controls visibility (for controls-on-tap feature)
    this._videoControlsVisible = false;
    
    // V5.6.9: Safari detection - Safari needs conditional controls attribute, Chrome uses CSS
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    this._isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua);
    
    // V5.6: Video thumbnail cache (session-scoped)
    this._videoThumbnailCache = new Map();
    this._thumbnailObserver = null;
    
    // V5.6.7: Track panel content to prevent unnecessary thumbnail re-renders
    this._lastPanelItemsHash = null;
    this._cachedThumbnailStripTemplate = null;
    
    // V5.6.8: Periodic refresh counter - tracks items since last provider refresh
    // Triggers a check for new files every slideshow_window items
    this._itemsSinceRefresh = 0;
    
    // V5.6.7: Track which navigation index each crossfade layer belongs to
    this._frontLayerNavigationIndex = null;  // Navigation index for front layer image
    this._backLayerNavigationIndex = null;   // Navigation index for back layer image
    this._frontLayerGeneration = 0;   // Increment when front layer URL changes (prevents stale setTimeout clearing new URLs)
    this._backLayerGeneration = 0;    // Increment when back layer URL changes (prevents stale setTimeout clearing new URLs)
    
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
      // V5.6.7: Card background blending - default true for seamless look
      blend_with_background: config.blend_with_background !== false,
      // V5.6.7: Edge fade strength (0 = disabled, 1-100 = enabled with fade intensity)
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
    
    // V5.6.7: Set blend with background attribute for CSS targeting
    if (this.config.blend_with_background !== false) {
      this.setAttribute('data-blend-with-background', 'true');
    } else {
      this.removeAttribute('data-blend-with-background');
    }
    
    // V5.6.7: Set edge fade attribute and strength for CSS targeting
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
    
    // V5.6.8: Navigation queue size is now independent of slideshow_window
    // slideshow_window controls how frequently to check for new files (periodic refresh)
    // navigation_queue_size controls how many items to keep in back-navigation history
    // Default: max(slideshow_window, 100) - floor of 100, but at least holds one full batch
    const slideshowWindow = this.config.slideshow_window ?? 100;
    const defaultQueueSize = Math.max(slideshowWindow, 100);
    this.maxNavQueueSize = this.config.navigation_queue_size || defaultQueueSize;
    this._periodicRefreshInterval = slideshowWindow; // How often to check for new files
    this._log('Set maxNavQueueSize to', this.maxNavQueueSize, 'periodicRefreshInterval:', this._periodicRefreshInterval);
    
    // V5: Trigger reinitialization if we already have hass
    if (this._hass) {
      this._log('📝 setConfig: Triggering provider reinitialization with existing hass');
      this._initializeProvider();
    }
  }

  /**
   * V5.6.7: Update thumbnail active state without full re-render
   * Called after every render cycle by Lit
   */
  updated(changedProps) {
    super.updated(changedProps);
    
    // Update thumbnail active state whenever render completes
    if (this._panelOpen) {
      this._updateThumbnailActiveState();
    }
  }

  /**
   * V5.6.7: Update which thumbnail has 'active' class without re-rendering videos
   */
  _updateThumbnailActiveState() {
    const thumbnailStrip = this.shadowRoot?.querySelector('.thumbnail-strip');
    if (!thumbnailStrip) return;
    
    const thumbnails = thumbnailStrip.querySelectorAll('.thumbnail[data-item-index]');
    const activeIndex = this._panelMode === 'queue' ? this.navigationIndex : this._panelQueueIndex;
    
    thumbnails.forEach(thumb => {
      const itemIndex = parseInt(thumb.dataset.itemIndex);
      if (itemIndex === activeIndex) {
        thumb.classList.add('active');
      } else {
        thumb.classList.remove('active');
      }
    });
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
    // V5.6.7: Re-entrance guard - prevent concurrent calls to _loadNext
    if (this._isLoadingNext) {
      this._log('⏭️ Skipping _loadNext - already in progress');
      return;
    }
    this._isLoadingNext = true;

    try {
      // V5.6: Set flag FIRST to ignore video pause events during navigation
      // The browser auto-pauses videos when they're removed from DOM
      this._navigatingAway = true;

    // V5.5: Panel Navigation Override (burst/related/on_this_day use _panelQueue)
    // Queue preview mode uses navigationQueue directly, so skip panel navigation
    if (this._panelOpen && this._panelQueue.length > 0 && this._panelMode !== 'queue') {
      this._navigatingAway = false;
      this._isLoadingNext = false;
      return await this._loadNextPanel();
    }
    
    // V5.6.7: Reset manual page flag when navigating with arrow keys/buttons
    // This allows auto-adjustment to scroll panel to show newly navigated item
    // (Clicking thumbnails keeps _manualPageChange true to prevent flickering)
    // V5.6.7: Skip panel adjustment during auto-advance of videos (prevents flickering)
    // but allow panel adjustment during manual navigation, even from/to videos
    // V5.6.8: Simplified - render function now handles resetting _manualPageChange
    // when navigationIndex comes back onto the visible page
    
    if (!this.provider) {
      this._log('_loadNext called but no provider');
      this._navigatingAway = false;
      this._isLoadingNext = false;
      return;
    }

    // V4: Handle auto_advance_mode when manually navigating
    this._handleAutoAdvanceModeOnNavigate();

    // V5.3: Navigation Queue Architecture
    // Store pending index (will be applied when media loads to sync with metadata)
    let nextIndex = this.navigationIndex + 1;
      
      // Need to load more items?
      if (nextIndex >= this.navigationQueue.length) {
        // V5.3: If this was a pre-loaded small collection, don't load more - just wrap
        if (this.isNavigationQueuePreloaded) {
          this._log('Pre-loaded collection exhausted, wrapping to beginning');
          
          // V5.6.5: Check for new files before wrapping, but pass current media for comparison
          // This prevents false positives while still detecting actual new files
          const queueRefreshed = await this._checkForNewFiles();
          if (queueRefreshed) {
            // Queue was refreshed and reset to position 1 with new files
            return;
          }
          
          // V5.6.4: Update nextIndex to 0 after wrapping
          nextIndex = 0;
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
              // Treat as provider exhaustion - wrap to beginning with fresh query
              this._log('Treating as provider exhaustion, wrapping to beginning with refresh');
              
              // Validate queue has items before wrapping
              if (this.navigationQueue.length === 0) {
                this._log('ERROR: Cannot wrap - navigation queue is empty');
                this._errorState = 'Provider exhausted with no items in queue';
                return;
              }
              
              // V5.6.8: Do fresh query when wrapping to catch new files
              await this._wrapToBeginningWithRefresh();
              return;
            } else if (!item || alreadyInQueue) {
              // All items are duplicates or provider exhausted, wrap to beginning
              this._log('Provider exhausted or only returning duplicates, wrapping to beginning with refresh');
              
              // Validate queue has items before wrapping
              if (this.navigationQueue.length === 0) {
                this._log('ERROR: Cannot wrap - navigation queue is empty');
                this._errorState = 'No media available in navigation queue';
                return;
              }
              
              // V5.6.8: Do fresh query when wrapping to catch new files
              await this._wrapToBeginningWithRefresh();
              return;
            } else {
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
                // After shift, point nextIndex to the newly added item (now at end of queue)
                // We DON'T decrement navigationIndex here because we're intentionally moving
                // forward to the new item, not staying at the current position
                nextIndex = this.navigationQueue.length - 1;
              }
            }
          } else {
            // No more items available from provider, wrap to beginning with fresh query
            this._log('Provider exhausted, wrapping to beginning with refresh');
            
            // Validate queue has items before wrapping
            if (this.navigationQueue.length === 0) {
              this._log('ERROR: Cannot wrap - navigation queue is empty');
              this._errorState = 'No media available from provider';
              return;
            }
            
            // V5.6.8: Do fresh query when wrapping to catch new files
            await this._wrapToBeginningWithRefresh();
            return;
          }
        }
      }
      
      // Get item at current navigation index
      const item = this.navigationQueue[nextIndex];
      if (!item) {
        this._log('ERROR: No item at navigationIndex', nextIndex);
        return;
      }
      
      // V5.6.8: Increment periodic refresh counter and check if refresh needed
      // Works for both sequential and random modes - provider handles mode-specific logic
      this._itemsSinceRefresh++;
      if (this._itemsSinceRefresh >= this._periodicRefreshInterval) {
        this._log(`🔄 Periodic refresh triggered after ${this._itemsSinceRefresh} items (interval: ${this._periodicRefreshInterval})`);
        // Reset counter immediately to prevent multiple triggers
        this._itemsSinceRefresh = 0;
        // Do refresh in background (non-blocking) to check for new files
        this._doPeriodicRefresh().catch(err => this._log('⚠️ Periodic refresh failed:', err));
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
      
      // V5.6.7: Store in pending state - will apply when image/video loads (syncs all overlays)
      this._pendingMediaPath = item.media_content_id;
      this._pendingMetadata = item.metadata || null;
      
      // V5: Clear caches when media changes
      this._fullMetadata = null;
      this._folderDisplayCache = null;
      
      await this._resolveMediaUrl();
      this.requestUpdate();

      // V5.6.7: Don't clear _navigatingAway here - let _onVideoCanPlay/_onMediaLoaded clear it
      // when the new media actually loads. Clearing it early causes timer to fire prematurely
      // for short videos that end before the next video reaches canplay state.

      // NOTE: Do NOT restart timer here - let it expire naturally during slideshow
      // Timer only restarts on manual button clicks

    // Refresh metadata from media_index in background after navigation
    // Ensures overlay reflects latest EXIF/location/favorite flags
    this._refreshMetadata().catch(err => this._log('⚠️ Metadata refresh failed:', err));
  } catch (error) {
    console.error('[MediaCard] Error loading next media:', error);
  } finally {
    // V5.6.7: Always clear re-entrance guard
    this._isLoadingNext = false;
    // V5.6.7: Always clear manual navigation flag after navigation completes
    this._isManualNavigation = false;
  }
}

  async _loadPrevious() {
    // V5.6.7: Re-entrance guard - prevent concurrent calls to _loadPrevious
    if (this._isLoadingNext) {
      this._log('⏮️ Skipping _loadPrevious - already in progress');
      return;
    }
    this._isLoadingNext = true;

    try {
      // V5.6: Set flag FIRST to ignore video pause events during navigation
      this._navigatingAway = true;

      // V5.5: Panel Navigation Override (burst/related/on_this_day use _panelQueue)
      // Queue preview mode uses navigationQueue directly, so skip panel navigation
      if (this._panelOpen && this._panelQueue.length > 0 && this._panelMode !== 'queue') {
        this._navigatingAway = false;
        this._isLoadingNext = false;
        return await this._loadPreviousPanel();
      }
    
    // V5.6.7: Reset manual page flag when navigating with arrow keys/buttons
    // This allows auto-adjustment to scroll panel to show newly navigated item
    // (Same logic as _loadNext for consistency)
    // V5.6.8: Simplified - render function now handles resetting _manualPageChange
    // when navigationIndex comes back onto the visible page
    
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
    
    // V5.6.7: Store in pending state - will apply when image/video loads (syncs all overlays)
    this._pendingNavigationIndex = this.navigationIndex;
    this._pendingMediaPath = item.media_content_id;
    this._pendingMetadata = item.metadata || null;
    
    // V5: Clear cached full metadata when media changes
    this._fullMetadata = null;
    this._folderDisplayCache = null;
    
    await this._resolveMediaUrl();
    this.requestUpdate();
    
    // V5.6.4: Timer behavior
    // Images: Defer timer until loaded (prevents timer expiring before slow image loads)
    // Videos: Start timer immediately (will be ignored if max_video_duration=0 and video still playing)
    const isVideo = this._isVideoFile(item.media_content_id);
    if (isVideo) {
      // Video tracking flags already reset in _setMediaUrl() - no need to duplicate here
      // Always start timer for videos - timer callback will check if it should be ignored
      this._setupAutoRefresh();
    }
    // Images: Timer deferred to _onMediaLoaded() to prevent premature expiration

      // V5.6: Clear navigation flag after render cycle completes
      setTimeout(() => {
        this._navigatingAway = false;
      }, 0);

      // NOTE: Do NOT restart timer here - let it expire naturally during slideshow
      // Timer only restarts on manual button clicks
    } catch (error) {
      console.error('[MediaCard] Error loading previous media:', error);
    } finally {
      // V5.6.7: Always clear re-entrance guard
      this._isLoadingNext = false;
      // V5.6.7: Always clear manual navigation flag after navigation completes
      this._isManualNavigation = false;
    }
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
    
    console.log('[MediaCard] 📱 Loading panel item', index + 1, '/', this._panelQueue.length, ':', item.filename || item.path, 'Panel mode:', this._panelMode);
    
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
    
    // V5.6.7: Store in pending state - will apply when image/video loads
    this._pendingMediaPath = mediaUri;
    this._pendingMetadata = metadata;
    
    // V5.6.7: Panel navigation doesn't use queue navigation indices - set to special marker
    // This tells _resolveMediaUrl to skip stale navigation checks (only relevant for queue nav)
    this._pendingNavigationIndex = -1; // -1 = panel navigation, not queue navigation
    
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

    this._log(`🎯 Jumping to queue position ${queueIndex + 1}/${this.navigationQueue.length}`);

    // CRITICAL: Keep _manualPageChange true when in queue preview mode
    // User clicked a thumbnail on the current page - don't auto-adjust page position!
    // Only reset to false when NOT in panel mode (normal navigation with arrow keys)
    if (!this._panelOpen || this._panelMode !== 'queue') {
      this._manualPageChange = false;
      this._manualPageRenderCount = 0;
    }

    // Load the item from the queue
    const item = this.navigationQueue[queueIndex];
    this.currentMedia = item;
    
    // V5.6.7: Store in pending state - will apply when image/video loads  
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
      this._log('🎲 Randomizing panel items for playback');
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

    this._log(`🗑️ Removed ${removedCount} duplicate items from queue`);
    this.navigationIndex = adjustedIndex;

    // Insert items into navigation queue after current position
    const insertPosition = this.navigationIndex + 1;
    this.navigationQueue.splice(insertPosition, 0, ...queueItems);

    this._log(`✅ Inserted ${queueItems.length} items at position ${insertPosition}, queue now has ${this.navigationQueue.length} items`);

    // Close panel WITHOUT restoring queue (we want to keep our insertions)
    this._panelOpen = false;
    this._panelMode = null;
    this._panelQueue = [];
    this._panelQueueIndex = 0;
    this._panelPageStartIndex = null;
    this._burstMode = false; // Clear deprecated flag
    
    // V5.6.0: Resume playback if paused
    if (this._isPaused) {
      this._log('▶️ Resuming playback to play panel items');
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
      
      // V5.6.4: Timer always uses auto_advance interval (not max_video_duration)
      // Timer callback enforces max_duration cap using counter math
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
          // V5.6.7: Skip timer callback while navigating to new media
          // This prevents the timer from calling _loadNext() while the new video is still loading
          // (which happens when video is paused/buffering and timer fires before canplay event)
          if (this._navigatingAway) {
            this._log('⏱️ Timer skipped - navigation in progress');
            return;
          }
          
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
          
          // V5.6.4: Timer behavior for videos (counter-based, no timestamps):
          // - Short videos that loop: advance on FIRST timer fire after loop detected
          // - Long videos with max_duration: advance when timer count * interval >= max_duration
          // - Long videos without max_duration: never advance on timer (play to completion)
          const videoElement = this.shadowRoot?.querySelector('video');
          const maxDuration = this.config.video_max_duration;
          
          // Check if video is currently playing
          if (videoElement && !videoElement.paused && !videoElement.ended) {
            // Increment timer counter for this video
            this._videoTimerCount = (this._videoTimerCount || 0) + 1;
            
            const currentTime = Math.round(videoElement.currentTime * 10) / 10;
            const duration = Math.round(videoElement.duration * 10) / 10;
            const elapsedSeconds = this._videoTimerCount * refreshSeconds;
            this._log(`🎬 Timer fired #${this._videoTimerCount}: video at ${currentTime}s/${duration}s, hasEnded=${this._videoHasEnded}, elapsed≈${elapsedSeconds}s, maxDuration=${maxDuration}, userInteracted=${this._videoUserInteracted}`);
            
            // V5.6.4: If user interacted (pause, seek, click), let video play to completion
            if (this._videoUserInteracted && !this._videoHasEnded) {
              this._log('🎬 User interacted with video - playing to completion (ignoring timer/max_duration)');
              return;
            }
            
            // V5.6.5: Video advancement logic
            // Priority 1: Video ended naturally (no loop attribute when auto-advance active)
            if (this._videoHasEnded || (videoElement.ended && !videoElement.loop)) {
              this._log('🎬 Video ended - ADVANCING');
              // Fall through to advance
            }
            // Priority 2: max_video_duration > 0 - enforce interruption limit
            else if (maxDuration && maxDuration > 0) {
              if (elapsedSeconds < maxDuration) {
                this._log(`🎬 Timer #${this._videoTimerCount}: elapsed≈${elapsedSeconds}s < max ${maxDuration}s - CONTINUING`);
                return; // Keep playing
              } else {
                this._log(`🎬 Timer #${this._videoTimerCount}: elapsed≈${elapsedSeconds}s ≥ max ${maxDuration}s - INTERRUPTING`);
                // Fall through to advance
              }
            }
            // Priority 3: No max_video_duration and not ended - let video play
            else {
              this._log('🎬 Video playing to completion - IGNORING TIMER');
              return; // Let it play to completion
            }
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

  /**
   * V5.6.8: Wrap to beginning with fresh query
   * Called when reaching the end of the slideshow to loop back with updated data.
   * This ensures new files are detected on every loop iteration.
   * @returns {Promise<void>}
   */
  async _wrapToBeginningWithRefresh() {
    this._log('🔄 Wrapping to beginning with fresh query...');
    
    // V5.6.8: Remember total items seen before wrap (for position indicator)
    // This prevents "1 of 30" after wrap when user saw 86 items
    if (this.navigationQueue.length > 0) {
      this._totalItemsInLoop = this.navigationQueue.length;
      this._log(`🔄 Remembering ${this._totalItemsInLoop} items in loop for position indicator`);
    }
    
    // Reset provider to clear cursor and start fresh
    if (this.provider && typeof this.provider.reset === 'function') {
      this._log('🔄 Resetting provider for fresh query');
      await this.provider.reset();
    }
    
    // V5.6.8: DON'T clear navigation queue - keep it for back navigation
    // Just get fresh items from provider and prepend to queue
    // The user can still navigate back through previously seen items
    
    // Get first item from fresh provider
    const firstItem = await this.provider.getNext();
    if (!firstItem) {
      this._log('🔄 Provider exhausted during refresh');
      this._errorState = 'No media available after refresh';
      return;
    }
    
    // Extract metadata if needed
    if (!firstItem.metadata) {
      firstItem.metadata = await this._extractMetadataFromItem(firstItem);
    }
    
    // V5.6.8: Insert at beginning of queue (after current items if navigating back)
    // Or just set as current if queue is at end
    // Find if this item already exists in queue
    const existingIndex = this.navigationQueue.findIndex(item => 
      item.media_content_id === firstItem.media_content_id
    );
    
    if (existingIndex >= 0) {
      // Item already in queue - jump to it
      this._log(`🔄 First item already in queue at index ${existingIndex}, jumping to it`);
      this.navigationIndex = existingIndex;
    } else {
      // New item - add to end and navigate to it
      this.navigationQueue.push(firstItem);
      this.navigationIndex = this.navigationQueue.length - 1;
      this._log(`🔄 Added fresh item to queue, now at index ${this.navigationIndex}`);
    }
    
    // Trim queue if too large (remove oldest items from front)
    while (this.navigationQueue.length > this.maxNavQueueSize) {
      this.navigationQueue.shift();
      this.navigationIndex--;
    }
    
    this._log(`🔄 Queue has ${this.navigationQueue.length} items after refresh`);
    
    // V5.6.8: Reset periodic refresh counter
    this._itemsSinceRefresh = 0;
    
    const currentItem = this.navigationQueue[this.navigationIndex];
    this._pendingNavigationIndex = this.navigationIndex;
    
    // Display the media
    const filename = currentItem.metadata?.filename || currentItem.media_content_id?.split('/').pop() || 'unknown';
    this._log('🔄 Displaying first item after refresh:', filename);
    
    // Add to history
    const alreadyInHistory = this.history.some(h => h.media_content_id === currentItem.media_content_id);
    if (!alreadyInHistory) {
      this.history.push(currentItem);
    }
    
    // Display the media (same pattern as _loadNext)
    this.currentMedia = currentItem;
    this._pendingMediaPath = currentItem.media_content_id;
    this._pendingMetadata = currentItem.metadata || null;
    this._fullMetadata = null;
    this._folderDisplayCache = null;
    
    await this._resolveMediaUrl();
    this.requestUpdate();
  }

  /**
   * V5.6.8: Periodic refresh - check for new files without disrupting playback
   * Called every slideshow_window items to detect new files.
   * Unlike _wrapToBeginningWithRefresh(), this doesn't clear the queue or change position.
   * It queries the provider for any files newer than the current first item in queue.
   */
  async _doPeriodicRefresh() {
    this._log('🔄 Periodic refresh - checking for new files...');
    
    // Check if provider supports checkForNewFiles
    if (!this.provider) {
      this._log('🔄 No provider available for periodic refresh');
      return;
    }
    
    // Try provider directly first (FolderProvider delegates internally)
    // Also try sequentialProvider for wrapped providers
    const checkProvider = this.provider.checkForNewFiles ? this.provider :
                          (this.provider.sequentialProvider?.checkForNewFiles ? this.provider.sequentialProvider :
                           (this.provider.subfolderQueue?.checkForNewFiles ? this.provider.subfolderQueue : null));
    
    if (!checkProvider || typeof checkProvider.checkForNewFiles !== 'function') {
      this._log('🔄 Provider type does not support checkForNewFiles - periodic refresh skipped');
      return;
    }
    
    const newItems = await checkProvider.checkForNewFiles();
    if (newItems && newItems.length > 0) {
      this._log(`🔄 Found ${newItems.length} new files during periodic refresh`);
      
      // Prepend new items to the navigation queue (they're newer = come first in descending order)
      // But we need to be careful about where in the queue to add them
      // For descending date order: new files should go at the beginning
      
      for (const item of newItems) {
        // Check if already in queue OR already seen in session history
        const alreadyInQueue = this.navigationQueue.some(q => q.media_content_id === item.media_content_id);
        const alreadyInHistory = this.history.some(h => h.media_content_id === item.media_content_id);
        if (!alreadyInQueue && !alreadyInHistory) {
          // Extract metadata if needed
          if (!item.metadata) {
            item.metadata = await this._extractMetadataFromItem(item);
          }
          // Add to beginning of queue (newest first for descending date order)
          this.navigationQueue.unshift(item);
          // Adjust navigation index since we added before current position
          this.navigationIndex++;
          this._pendingNavigationIndex = this.navigationIndex;
          this._log(`🔄 Added new file to queue: ${item.metadata?.filename || item.media_content_id}`);
        }
      }
      
      // Trim queue if exceeds max size (remove oldest = end of array)
      while (this.navigationQueue.length > this.maxNavQueueSize) {
        this.navigationQueue.pop();
      }
    } else {
      this._log('🔄 No new files found during periodic refresh');
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
      
      // V5.6.5: Pass current media ID to prevent false positives on wrap
      const currentMediaId = this.currentMedia?.media_content_id || this._currentMediaPath;
      const scanResult = await this.provider.rescanForNewFiles(currentMediaId);
      
      // If the first item in queue changed, refresh display
      if (scanResult.queueChanged) {
        this._log(`🆕 New files detected - refreshing display`);
        await this._refreshQueue(true); // skipReset=true, provider already rescanned
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
  // skipReset: true when called from rescanForNewFiles (provider already rescanned)
  async _refreshQueue(skipReset = false) {
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
      
      // V5.6.5: Skip reset if provider was already rescanned (avoids duplicate query)
      if (!skipReset) {
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
      } else {
        this._log('🔄 Skipping provider reset (already rescanned)');
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
    // V5.6.5: Use pending path if available (during navigation), otherwise use current path
    const targetPath = this._pendingMediaPath || this._currentMediaPath;
    
    if (!MediaProvider.isMediaIndexActive(this.config) || !targetPath || !this.hass) {
      return;
    }
    
    try {
      // Use shared helper to fetch metadata
      const freshMetadata = await MediaIndexHelper.fetchFileMetadata(
        this.hass,
        this.config,
        targetPath
      );
      
      if (freshMetadata) {
        // V5.6.5: If we have pending metadata, update that instead of current
        // This prevents refreshed metadata from being applied before media loads
        if (this._pendingMetadata !== null) {
          // Merge with pending metadata (which contains path-based metadata)
          this._pendingMetadata = {
            ...this._pendingMetadata,
            ...freshMetadata
          };
          this._log('📊 Refreshed metadata from media_index (applied to pending)');
        } else {
          // No pending state - apply directly to current
          this._currentMetadata = {
            ...this._currentMetadata,
            ...freshMetadata
          };
          
          // Update currentMedia.metadata as well
          if (this.currentMedia) {
            this.currentMedia.metadata = this._currentMetadata;
          }
          
          this._log('📊 Refreshed metadata from media_index');
        }
        
        this.requestUpdate();
      }
    } catch (error) {
      this._log('⚠️ Failed to refresh metadata:', error);
    }
  }

  // V5.6.6: Check if file exists via provider (delegates to media_index service if available)
  async _checkFileExistsViaProvider(mediaItem) {
    // Validate mediaItem exists before proceeding
    if (!mediaItem) {
      this._log('⚠️ File check skipped - no mediaItem');
      return null;
    }
    
    // Ask provider to check - MediaIndexProvider has service, others return null
    if (typeof this.provider?.checkFileExists === 'function') {
      try {
        const result = await this.provider.checkFileExists(mediaItem);
        this._log(`📁 Provider file check result: ${result}`);
        return result;
      } catch (err) {
        this._log(`⚠️ Provider file check error: ${err.message}`);
        return null;
      }
    }
    this._log('📁 Provider does not support file existence checks');
    return null; // Provider doesn't support file existence checks
  }

  // V5.6: Helper to set mediaUrl with crossfade transition (validates first for images)
  async _setMediaUrl(url, expectedNavigationIndex) {
    // V5.6.7: Guard against stale async resolutions during rapid navigation
    // If expectedNavigationIndex is provided and doesn't match current pending index, abort
    if (expectedNavigationIndex !== undefined && this._pendingNavigationIndex !== expectedNavigationIndex) {
      this._log(`⏭️ Skipping stale media resolution (expected: ${expectedNavigationIndex}, current: ${this._pendingNavigationIndex})`);
      return;
    }
    
    // V5.6.7: Reset bottom overlay hiding when loading new media
    // This ensures overlays are visible again for new content
    if (this._hideBottomOverlaysForVideo) {
      this._hideBottomOverlaysForVideo = false;
    }
    
    // Only use crossfade for images, not videos
    const isVideo = this._isVideoFile(url);
    
    // For images, validate they exist before displaying (MediaIndexProvider only)
    if (!isVideo) {
      // V5.6.6: Try lightweight filesystem check first (provider delegates to media_index if available)
      const providerCheckResult = await this._checkFileExistsViaProvider(this.currentMedia);
      
      if (providerCheckResult === false) {
        // Service confirmed file doesn't exist - skip immediately
        this._log('❌ File does not exist (filesystem check):', url);
        this._log('⏭️ Skipping 404 file, removing from queues and advancing to next media');
        this._remove404FromQueues(this.currentMedia);
        setTimeout(() => this._loadNext(), 100);
        return; // Don't set mediaUrl, abort display
      } else if (providerCheckResult === true) {
        // File exists, confirmed by filesystem check
        this._log('✅ File exists (filesystem check):', url);
      }
      // If providerCheckResult is null, provider doesn't support checks (FolderProvider, SingleMediaProvider)
      // These providers discover files from disk, so 404s are unlikely - proceed without validation
    }
    
    this.mediaUrl = url;
    
    if (!isVideo) {
      const duration = this.config?.transition?.duration ?? 300;
      
      // For instant transitions (0ms), bypass double-buffering entirely
      if (duration === 0) {
        // Just update - render will show single image directly
        this.requestUpdate();
      } else {
        // V5.6.7: Check again before setting layer URLs - navigation may have moved on during file check
        // Use navigationIndex (not _pendingNavigationIndex) since pending gets cleared when image loads
        const currentNavIndex = this._pendingNavigationIndex ?? this.navigationIndex;
        if (expectedNavigationIndex !== undefined && currentNavIndex !== expectedNavigationIndex) {
          this._log(`⏭️ Skipping stale layer update (expected: ${expectedNavigationIndex}, current: ${currentNavIndex})`);
          return;
        }
        
        // Crossfade: set new image on hidden layer, then swap after it loads
        // V5.6.7: If there's already a pending swap, clear both layers and start fresh
        // This handles rapid navigation where the previous image hasn't loaded yet
        if (!this._frontLayerUrl && !this._backLayerUrl) {
          // Special case: Both layers empty (first load or after video), show immediately without crossfade
          this._frontLayerUrl = url;
          this._frontLayerActive = true;
          this._pendingLayerSwap = false;
          this._frontLayerNavigationIndex = expectedNavigationIndex;
          this.requestUpdate();
        } else if (this._pendingLayerSwap) {
          // Rapid navigation: Previous image hasn't loaded yet. Clear both and start fresh.
          this._log(`⏩ Rapid navigation detected - clearing both layers`);
          this._frontLayerUrl = url;
          this._frontLayerGeneration++; // Invalidate any pending setTimeout for front layer
          this._backLayerUrl = '';
          this._backLayerGeneration++; // Invalidate any pending setTimeout for back layer
          this._frontLayerActive = true;
          this._pendingLayerSwap = false; // Show immediately without waiting for load
          this._frontLayerNavigationIndex = expectedNavigationIndex;
          this._backLayerNavigationIndex = null;
          this.requestUpdate();
        } else {
          // Normal crossfade: load on hidden layer then swap
          if (this._frontLayerActive) {
            this._backLayerUrl = url;
            this._backLayerGeneration++; // Increment to invalidate any pending setTimeout for this layer
            this._backLayerNavigationIndex = expectedNavigationIndex;
          } else {
            this._frontLayerUrl = url;
            this._frontLayerGeneration++; // Increment to invalidate any pending setTimeout for this layer
            this._frontLayerNavigationIndex = expectedNavigationIndex;
          }
          
          // Set flag to trigger swap when the new image loads
          this._pendingLayerSwap = true;
          this._transitionDuration = duration;
          this.requestUpdate();
        }
      }
    } else {
      // V5.6.7: For videos, also check file existence before loading (prevents 404 errors getting stuck)
      this._log('🎬 Checking video file existence before load...');
      const providerCheckResult = await this._checkFileExistsViaProvider(this.currentMedia);
      this._log(`🎬 Video file check result: ${providerCheckResult}`);
      
      if (providerCheckResult === false) {
        // Service confirmed file doesn't exist - skip immediately
        this._log('❌ Video file does not exist (filesystem check):', url);
        this._log('⏭️ Skipping 404 video, removing from queues and advancing to next media');
        this._remove404FromQueues(this.currentMedia);
        setTimeout(() => this._loadNext(), 100);
        return; // Don't set mediaUrl, abort display
      } else if (providerCheckResult === true) {
        this._log('✅ Video file exists (filesystem check):', url);
      } else {
        this._log('⚠️ Video file check unavailable (null) - proceeding with load');
      }
      // If null, provider doesn't support checks - proceed and let error handler deal with 404s
      
      // Clear the image layers immediately
      this._frontLayerUrl = '';
      this._backLayerUrl = '';
      this._frontLayerNavigationIndex = null; // Clear layer navigation indices
      this._backLayerNavigationIndex = null;
      
      // V5.6.4: Reset video tracking flags when loading new video
      // This prevents stale flags from previous video affecting new video
      this._videoHasEnded = false;
      this._lastVideoTime = undefined;
      this._videoTimerCount = 0; // Reset timer counter for new video
      this._videoPlayStartTime = null; // Track when video playback starts
      this._log('🎬 Loading new video - reset tracking flags');
      
      this.requestUpdate();
      
      // V5.6.7: When going video → video, Lit reuses the same <video> element
      // and just updates <source src>. But changing source doesn't auto-reload!
      // We must explicitly call video.load() after render to trigger reload.
      // NOTE: Copilot suggested checking readyState first, but that's wrong -
      // readyState > 0 means the OLD video has data, not that the NEW source is loading.
      // We MUST call load() to force browser to load the new source.
      await this.updateComplete;
      const videoElement = this.shadowRoot?.querySelector('video');
      if (videoElement) {
        this._log('🎬 Explicitly reloading video element for video→video transition');
        videoElement.load();
      }
    }
  }

  async _resolveMediaUrl() {
    if (!this.currentMedia || !this.hass) {
      this._log('Cannot resolve URL - missing currentMedia or hass');
      return;
    }

    const mediaId = this.currentMedia.media_content_id;
    
    // V5.6.7: Capture pending index for async resolution guard
    const expectedIndex = this._pendingNavigationIndex;
    
    // Validate mediaId exists
    if (!mediaId) {
      this._log('ERROR: currentMedia has no media_content_id:', this.currentMedia);
      this._errorState = 'Invalid media item (no media_content_id)';
      return;
    }
    
    // If already a full URL, use it
    if (mediaId.startsWith('http')) {
      await this._setMediaUrl(mediaId, expectedIndex);
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
        
        await this._setMediaUrl(finalUrl, expectedIndex);
        this.requestUpdate();
      } catch (error) {
        console.error('[MediaCard] Failed to resolve media URL:', error);
        await this._setMediaUrl('', expectedIndex);
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
        await this._setMediaUrl(resolved.url, expectedIndex);
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
        await this._setMediaUrl('', expectedIndex);
        
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
    await this._setMediaUrl(mediaId, expectedIndex);
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
    // V5.6.7: Clear navigation flag to prevent slideshow getting stuck on 404 errors
    this._navigatingAway = false;
    
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
        // For folder/queue modes, if it's a 404, remove from queue and skip to next automatically
        if (is404) {
          this._log('⏭️ Skipping 404 file, removing from queues and advancing to next media');
          // Remove from navigation queue and panel queue to prevent showing again
          this._remove404FromQueues(this.currentMedia);
          // Skip to next without showing error
          setTimeout(() => this._loadNext(), 100);
        } else {
          this._showMediaError(errorMessage, isSynologyUrl);
        }
      }
    } else {
      // Already tried to retry this URL
      if (is404 && this.config.media_source_type !== 'single_media') {
        // For 404s in folder/queue mode, remove from queue and skip to next instead of showing error
        this._log('⏭️ Skipping 404 file after retry, removing from queues and advancing to next media');
        this._remove404FromQueues(this.currentMedia);
        setTimeout(() => this._loadNext(), 100);
      } else {
        // Show error for non-404 errors or single media mode
        this._log(`Max auto-retries reached for URL:`, currentUrl.substring(0, 50) + '...');
        this._showMediaError(errorMessage, isSynologyUrl);
      }
    }
  }
  
  // V5.6.7: Handle errors from <source> elements inside <video>
  // Source element errors don't bubble to the video element, so we need to handle them separately
  _onSourceError(e) {
    const sourceElement = e.target;
    const videoElement = sourceElement?.parentElement;
    
    this._log('🎬 Source element error:', sourceElement?.src);
    
    // Check if this is the last source that failed (video networkState becomes NETWORK_NO_SOURCE)
    // networkState 3 = NETWORK_NO_SOURCE (all sources failed)
    if (videoElement && videoElement.networkState === 3) {
      // Guard against duplicate handling - check if we're already processing this error
      if (this._sourceErrorHandled) {
        this._log('🎬 Source error already handled, skipping duplicate');
        return;
      }
      this._sourceErrorHandled = true;
      
      this._log('🎬 All video sources failed - treating as 404');
      // Simulate a media error event to trigger the same handling
      this._onMediaError({ target: videoElement });
      
      // Reset flag after a short delay to allow handling new videos
      setTimeout(() => { this._sourceErrorHandled = false; }, 100);
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
      
      // V5: Remove from queues to prevent showing again
      if (this.currentMedia) {
        this._log(`🗑️ File not found (404) - removing from queue: ${currentPath}`);
        this._remove404FromQueues(this.currentMedia);
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
    // V5.6.8: Reset video controls visibility and overlay state for new video
    this._videoControlsVisible = false;
    this._hideBottomOverlaysForVideo = false;
  }

  _onVideoCanPlay() {
    // V5.6.4: Timer uses simple counter, no timestamp needed
    this._log('🎬 Video ready - can play');
    
    // V5.6.7: Clear navigation flag now that video is actually ready to play
    // This prevents timer from firing prematurely during video-to-video transitions
    this._navigatingAway = false;
    
    // V5: Apply pending metadata AND navigation index when video is ready
    if (this._pendingMetadata !== null) {
      this._currentMetadata = this._pendingMetadata;
      this._pendingMetadata = null;
      this._log('✅ Applied pending metadata on video canplay');
    }
    if (this._pendingNavigationIndex !== null) {
      this.navigationIndex = this._pendingNavigationIndex;
      this._pendingNavigationIndex = null;
      this._log('✅ Applied pending navigation index on video canplay');
    }
    if (this._pendingMediaPath !== null) {
      this._currentMediaPath = this._pendingMediaPath;
      this._pendingMediaPath = null;
    }
    
    this.requestUpdate();
  }

  _onVideoPlay() {
    // V5.6.5: Track when video playback starts for elapsed time calculation
    if (!this._videoPlayStartTime) {
      this._videoPlayStartTime = Date.now();
    }
    
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
    
    // V5.6.4: Verify video element still exists in DOM before processing pause
    // Pause events can fire after navigation completes and video is removed
    const videoElement = this.renderRoot?.querySelector('video');
    const isCurrentlyVideo = this._isVideoFile(this.currentMedia?.media_content_id || '');
    
    if (!videoElement || !isCurrentlyVideo) {
      this._log('⏸️ Ignoring video pause - no video in DOM (navigated to image)');
      return;
    }
    
    this._log('Video paused by user');
    
    // Mark that user has interacted with the video
    this._videoUserInteracted = true;
    this._log('🎬 User interacted with video (pause) - will play to completion');
    
    // Only pause slideshow if video was manually paused (not ended)
    if (videoElement && !videoElement.ended && !this._isPaused) {
      this._log('🎬 Video manually paused - pausing slideshow');
      this._pausedByVideo = true;
      this._setPauseState(true);
    }
  }

  // V5: Track video seeking (user interaction)
  _onVideoSeeking(e) {
    // V5.6.8: Track that we're in the middle of a seek operation
    this._videoIsSeeking = true;
    
    // V5.6.4: Only mark as user interaction if video has started playing
    // Browser fires seeking events during initial load - ignore those
    const video = e.target;
    if (video && video.currentTime >= 0.5) {
      this._videoUserInteracted = true;
      this._log('🎬 User interacted with video (seek) - will play to completion');
    }
  }
  
  // V5.6.8: Track when seeking finishes
  _onVideoSeeked(e) {
    this._videoIsSeeking = false;
    // Update last video time to current position after seek completes
    // This prevents the next timeupdate from thinking video looped
    const video = e.target;
    if (video) {
      this._lastVideoTime = video.currentTime;
    }
  }
  
  // V5: Track video click (user interaction)
  _onVideoClick() {
    this._videoUserInteracted = true;
    this._log('🎬 User interacted with video (click) - will play to completion');
  }
  
  // V5.6.8: Handle video click - toggle controls and overlays together
  // Extracted to method for performance (avoids creating new function on every render)
  _onVideoClickToggle(e) {
    // Check if click is on video itself (not controls)
    if (e.target.tagName === 'VIDEO') {
      // Stop propagation to prevent _handleTap from also toggling
      e.stopPropagation();
      e.preventDefault();
      
      // Mark as user interaction for video timer logic
      this._videoUserInteracted = true;
      
      // Debug: log state before toggle
      this._log(`🎬 BEFORE: controlsVisible=${this._videoControlsVisible}, hideOverlays=${this._hideBottomOverlaysForVideo}`);
      
      // Toggle controls and overlays together (inverse relationship)
      if (this.config.video_controls_on_tap !== false) {
        this._videoControlsVisible = !this._videoControlsVisible;
        this._hideBottomOverlaysForVideo = !this._hideBottomOverlaysForVideo;
        this._log(`🎬 AFTER: controlsVisible=${this._videoControlsVisible}, hideOverlays=${this._hideBottomOverlaysForVideo}`);
      } else {
        // Legacy behavior when video_controls_on_tap: false
        this._hideBottomOverlaysForVideo = !this._hideBottomOverlaysForVideo;
        this._log(`🎬 Bottom overlays ${this._hideBottomOverlaysForVideo ? 'hidden' : 'shown'}`);
      }
      this.requestUpdate();
    } else {
      this._log(`🎬 Click on non-VIDEO element: ${e.target.tagName}`);
    }
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

    if (waitTimeMs >= maxWaitMs) {
      this._log(`🎬 Video max duration reached (${waitTimeSeconds}s/${videoMaxDuration}s), proceeding with refresh`);
      this._videoWaitStartTime = null; // Reset for next video
      return false;
    }

    this._log(`🎬 Video playing - waiting for completion (${waitTimeSeconds}s/${videoMaxDuration}s)`);
    return true;
  }

  _onVideoEnded() {
    const endTime = new Date();
    this._log(`🎬 Video ended at ${endTime.toLocaleTimeString()}:`, this.mediaUrl);
    
    // V5.6.4: Mark that video has completed first playthrough
    this._videoHasEnded = true;
    
    // V5.6.7: Show bottom overlays when video ends (if they were hidden)
    if (this._hideBottomOverlaysForVideo) {
      this._hideBottomOverlaysForVideo = false;
      this.requestUpdate();
    }
    
    // V5.6.5: Check if we should restart video (short video with loop enabled)
    const autoAdvanceSeconds = this.config?.auto_advance_seconds || 
                               this.config?.auto_advance_interval || 
                               this.config?.auto_advance_duration || 0;
    
    if (this.config.video_loop && autoAdvanceSeconds > 0 && this._videoPlayStartTime) {
      const elapsedMs = Date.now() - this._videoPlayStartTime;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      
      if (elapsedSeconds < autoAdvanceSeconds) {
        this._log(`🔁 Short video with loop enabled (${elapsedSeconds}s < ${autoAdvanceSeconds}s auto-advance) - restarting video`);
        const videoElement = this.shadowRoot?.querySelector('video');
        if (videoElement) {
          videoElement.currentTime = 0;
          videoElement.play().catch(err => this._log('Error restarting video:', err));
        }
        return;
      }
    }
    
    // Reset video wait timer when video ends
    this._videoWaitStartTime = null;
    
    // V5.6.4: Check if auto-advance is configured
    const hasAutoRefresh = (this.config?.auto_refresh_seconds || 0) > 0;
    const hasAutoAdvance = (this.config?.auto_advance_seconds || 
                           this.config?.auto_advance_interval || 
                           this.config?.auto_advance_duration || 0) > 0;
    
    // If we have auto-advance configured, advance to next media after video completes
    if (hasAutoAdvance) {
      // V5.6.9: Don't advance if slideshow is paused
      if (this._isPaused) {
        this._log('🎬 Video completed but slideshow is paused - not advancing');
        return;
      }
      
      this._log('🎬 Video completed naturally - advancing to next media');
      setTimeout(async () => {
        // Check for new files first (at position 1 in sequential mode)
        const queueRefreshed = await this._checkForNewFiles();
        
        // If queue wasn't refreshed, advance to next
        if (!queueRefreshed) {
          this._loadNext().catch(err => {
            console.error('Error advancing after video:', err);
          });
        }
      }, 100);
      return;
    }
    
    // If we have auto-refresh configured, reload current media
    if (hasAutoRefresh) {
      this._log('🎬 Video completed - reloading current media');
      setTimeout(async () => {
        await this._resolveMediaUrl();
        this.requestUpdate();
      }, 100);
      return;
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

  _onVideoTimeUpdate(e) {
    // V5.6.4: Detect when looping video wraps back to beginning
    // The 'ended' event doesn't fire for videos with loop attribute
    const video = e.target;
    if (!video || !this.config.video_loop) return;
    
    // V5.6.8: Ignore time updates during user seeking - seeking also causes backward time jumps
    // but shouldn't be treated as video loop completion
    if (this._videoIsSeeking) return;
    
    // V5.6.8: If user has interacted (seek, pause, etc), don't detect loops at all
    // User is controlling the video manually, we'll play to completion regardless
    if (this._videoUserInteracted) return;
    
    const currentTime = video.currentTime;
    
    // Simple, robust loop detection: currentTime went backwards
    // This happens when video loops from end to start
    // Use duration-aware tolerance to handle very short videos (e.g., 1-second videos)
    let tolerance = 0.5; // default for longer videos / unknown duration (backwards compatible)
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      // Use ~10% of duration, clamped between 0.05s and 0.5s
      tolerance = Math.min(Math.max(duration * 0.1, 0.05), 0.5);
    }
    
    // Defensive check: ensure tolerance is valid before comparison
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      tolerance = 0.5; // Fallback to safe default
    }
    
    if (this._lastVideoTime !== undefined && currentTime < (this._lastVideoTime - tolerance)) {
      // Video looped! Mark that it has completed first playthrough
      if (!this._videoHasEnded) {
        this._videoHasEnded = true;
        this._log(`🔁 Video looped (time jumped from ${Math.round(this._lastVideoTime * 10) / 10}s to ${Math.round(currentTime * 10) / 10}s, tolerance=${Math.round(tolerance * 100) / 100}s) - first playthrough complete, timer can now advance`);
      }
    }
    
    this._lastVideoTime = currentTime;
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
      this._isManualNavigation = true; // V5.6.7: Mark as manual navigation
      this._loadPrevious();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._isManualNavigation = true; // V5.6.7: Mark as manual navigation
      this._loadNext();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Space or Enter on navigation zones acts like a click
      if (e.target.classList.contains('nav-zone-left')) {
        this._isManualNavigation = true; // V5.6.7: Mark as manual navigation
        this._loadPrevious();
      } else if (e.target.classList.contains('nav-zone-right')) {
        this._isManualNavigation = true; // V5.6.7: Mark as manual navigation
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
      
      // V5.6.7: Clear navigation flag now that image is loaded
      // This prevents timer from firing prematurely during transitions
      this._navigatingAway = false;
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
      
      // V5.6.7: Determine which layer just loaded by comparing URLs
      let loadedLayerIndex = null;
      let normalizedLoaded = ''; // V5.6.7: Declare outside if block to avoid ReferenceError
      
      if (loadedUrl) {
        // Normalize loaded URL for comparison
        normalizedLoaded = loadedUrl;
        try {
          const url = new URL(loadedUrl);
          normalizedLoaded = url.pathname + url.search;
        } catch (e) {
          // Already a path
        }
        normalizedLoaded = normalizedLoaded.split('?')[0];
        
        // Check which layer this URL belongs to
        const normalizedFront = this._frontLayerUrl ? this._frontLayerUrl.split('?')[0] : '';
        const normalizedBack = this._backLayerUrl ? this._backLayerUrl.split('?')[0] : '';
        
        if (normalizedLoaded === normalizedFront) {
          loadedLayerIndex = this._frontLayerNavigationIndex;
        } else if (normalizedLoaded === normalizedBack) {
          loadedLayerIndex = this._backLayerNavigationIndex;
        }
      }
      
      // Check if the loaded layer's navigation index matches current position
      // This prevents swapping to an old image if navigation moved on during load
      const currentNavigationIndex = this._pendingNavigationIndex ?? this.navigationIndex;
      
      // V5.6.7: In panel mode (index -1), check URL match instead of navigation index
      // This handles the case where the same image is already loading when panel opens
      let normalizedExpected = expectedUrl || '';
      try {
        const expUrl = new URL(expectedUrl);
        normalizedExpected = expUrl.pathname;
      } catch (e) {
        // Already a path
      }
      normalizedExpected = normalizedExpected.split('?')[0];
      const urlMatches = normalizedLoaded && normalizedExpected && normalizedLoaded === normalizedExpected;
      
      // Skip layer swap if:
      // 1. Navigation index doesn't match AND
      // 2. We're not in panel mode OR the URL doesn't match what we want
      if (loadedLayerIndex !== null && loadedLayerIndex !== currentNavigationIndex && !(currentNavigationIndex === -1 && urlMatches)) {
        this._log(`⏭️ Skipping layer swap - loaded image is for navigation index ${loadedLayerIndex}, current is ${currentNavigationIndex}`);
        
        // Clear the stale layer URL but DON'T clear _pendingLayerSwap
        // We're still waiting for the correct image to load and swap in
        if (normalizedLoaded === this._frontLayerUrl?.split('?')[0]) {
          this._frontLayerUrl = '';
          this._frontLayerNavigationIndex = null;
        } else if (normalizedLoaded === this._backLayerUrl?.split('?')[0]) {
          this._backLayerUrl = '';
          this._backLayerNavigationIndex = null;
        }
        
        this.requestUpdate();
        return; // Don't swap layers, but keep _pendingLayerSwap = true
      }
      
      // V5.6.7: If we got here, the loaded image is for the current navigation position
      // Just swap immediately - no need to compare URLs since we already validated the navigation index
      this._pendingLayerSwap = false;
      
      // Swap layers to trigger crossfade
      this._frontLayerActive = !this._frontLayerActive;
      this._log(`🔄 Layer swap triggered - now showing layer: ${this._frontLayerActive ? 'front' : 'back'}`);
      this.requestUpdate();
      
      // Clear old layer after transition
      const duration = this._transitionDuration || 300;
      // Capture current generation to prevent clearing if layer gets reused during setTimeout delay
      const expectedFrontGen = this._frontLayerGeneration;
      const expectedBackGen = this._backLayerGeneration;
      setTimeout(() => {
        if (this._frontLayerActive && this._backLayerGeneration === expectedBackGen) {
          // Only clear if back layer hasn't been reused (generation unchanged)
          this._backLayerUrl = '';
          this._backLayerNavigationIndex = null;
        } else if (!this._frontLayerActive && this._frontLayerGeneration === expectedFrontGen) {
          // Only clear if front layer hasn't been reused (generation unchanged)
          this._frontLayerUrl = '';
          this._frontLayerNavigationIndex = null;
        }
        this.requestUpdate();
      }, duration + 100);
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
    
    // V5.6.4: Start auto-advance timer for images now that they're loaded
    // For videos, timer starts immediately in navigation method (not deferred)
    if (!this._isVideoFile(this.mediaUrl)) {
      this._setupAutoRefresh();
    }
    
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

    // Icon support (with template evaluation)
    let icon = entityConfig?.icon;
    // Check if icon was evaluated from a template
    if (icon && typeof icon === 'string' && (icon.includes('{{') || icon.includes('{%'))) {
      const iconCacheKey = `${entityId}:icon`;
      if (this._entityStyleCache?.has(iconCacheKey)) {
        icon = this._entityStyleCache.get(iconCacheKey);
      }
    }
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
    const hideOnThisDayButton = this.config.action_buttons?.hide_on_this_day_button === true;
    
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
        ${showMediaIndexButtons && enableOnThisDay && !hideOnThisDayButton ? html`
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
    
    // V5.6.8: Use remembered total from previous loop if queue is being repopulated
    // This prevents "1 of 30" showing when user saw 86 items before wrap
    let totalSeen;
    if (this._totalItemsInLoop && totalCount < this._totalItemsInLoop) {
      // Queue is being repopulated after wrap - use remembered total
      totalSeen = Math.min(this._totalItemsInLoop, this.maxNavQueueSize);
    } else {
      // Normal operation - use actual queue size (capped at max)
      totalSeen = Math.min(totalCount, this.maxNavQueueSize);
      // Update remembered total if queue grew
      if (totalCount > (this._totalItemsInLoop || 0)) {
        this._totalItemsInLoop = totalCount;
      }
    }

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
        this._evaluateAllEntityStyles(); // Re-evaluate styles and icon templates
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
      if (!entityId) continue;
      
      const state = this.hass.states[entityId];
      if (!state) continue;
      
      // Skip if entityConfig is not an object (could be a string entity ID)
      if (typeof entityConfig !== 'object' || entityConfig === null) continue;
      
      // Evaluate icon template if present
      if (entityConfig.icon && typeof entityConfig.icon === 'string') {
        if (entityConfig.icon.includes('{{') || entityConfig.icon.includes('{%')) {
          try {
            const iconValue = await this._evaluateJinjaTemplate(entityConfig.icon);
            const cacheKey = `${entityId}:icon`;
            if (!this._entityStyleCache) {
              this._entityStyleCache = new Map();
            }
            this._entityStyleCache.set(cacheKey, iconValue);
            this._log('🎨 Jinja2 icon:', iconValue, 'for', entityId);
          } catch (error) {
            console.warn('[MediaCard] Failed to evaluate icon template:', error);
          }
        }
      }
      
      // Evaluate each Jinja2 style property and cache individually
      if (entityConfig.styles) {
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
    
    this._log(`💗 FAVORITE CAPTURE: uri="${targetUri}", current_is_favorited=${isFavorite}, new_state=${newState}`);
    this._log(`💗 CURRENT METADATA:`, this._currentMetadata);
    
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
      
      this._log(`✅ Favorite toggled for ${targetUri}: ${newState}`, response);
      
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
          this._log(`🎯 Added to burst favorites: ${targetUri} (${this._burstFavoritedFiles.length} total)`);
        }
      } else if (this._panelOpen && this._panelMode === 'burst' && newState === false) {
        // Remove from favorites tracking if unfavorited
        const index = this._burstFavoritedFiles.indexOf(targetUri);
        if (index !== -1) {
          this._burstFavoritedFiles.splice(index, 1);
          this._log(`🎯 Removed from burst favorites: ${targetUri} (${this._burstFavoritedFiles.length} remaining)`);
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

  /**
   * V5.6.7: Handle photo date toggle for On This Day mode
   */
  async _handleUsePhotoDateChange(e) {
    this._onThisDayUsePhotoDate = e.target.checked;
    
    // Re-query with new date source
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
    // Use folder.path in folder mode, media_path in single_media mode
    const rootPath = this.config?.media_source_type === 'folder' 
      ? (this.config?.folder?.path || '')
      : (this.config?.media_path || '');
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
    // Use folder.path in folder mode, media_path in single_media mode
    const rootPath = this.config?.media_source_type === 'folder' 
      ? (this.config?.folder?.path || '')
      : (this.config?.media_path || '');
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
      
      // V5.6.7: Save queue panel scroll position if coming from queue mode
      if (this._panelMode === 'queue') {
        this._previousQueuePageIndex = this._panelPageStartIndex;
      }
      
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
      
      this._log('🎥 Burst photos response:', response);
      this._log('🎥 First item:', response.response?.items?.[0]);
      
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
      
      this._log(`📸 Burst panel loaded: ${this._panelQueue.length} files, ${this._burstFavoritedFiles.length} pre-favorited`);
      
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
      
      // V5.6.7: Save pause state before pausing, then pause auto-advance while in burst mode
      this._previousPauseState = this._isPaused;
      if (!this._isPaused) {
        this._setPauseState(true);
      }
      
      this._log(`✅ Entered burst mode with ${this._panelQueue.length} photos`);
      
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
      
      // V5.6.7: Save queue panel scroll position if coming from queue mode
      if (this._panelMode === 'queue') {
        this._previousQueuePageIndex = this._panelPageStartIndex;
      }
      
      // Extract date from SNAPSHOT metadata (not current, which may have changed)
      const currentDate = metadataSnapshot?.date_taken || metadataSnapshot?.created_time;
      if (!currentDate) {
        throw new Error('No date available for current photo');
      }
      
      // Extract the LOCAL date (what user sees displayed)
      let localDate;
      if (typeof currentDate === 'number') {
        const dateObj = new Date(currentDate * 1000);
        localDate = dateObj;
      } else if (typeof currentDate === 'string') {
        localDate = new Date(currentDate);
      } else if (currentDate instanceof Date) {
        localDate = currentDate;
      } else {
        localDate = new Date(String(currentDate));
      }
      
      // Get start and end of the local date as Unix timestamps
      // This ensures we match all photos from the calendar day user sees
      const localYear = localDate.getFullYear();
      const localMonth = localDate.getMonth();
      const localDay = localDate.getDate();
      
      // Start of day in local timezone (convert to Unix timestamp in seconds)
      const startOfDay = new Date(localYear, localMonth, localDay, 0, 0, 0);
      const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
      
      // End of day in local timezone as inclusive Unix timestamp in seconds
      // Use next day midnight minus 1 second to correctly handle DST transitions
      // (days can be 23 or 25 hours during DST changes)
      const endOfDay = new Date(localYear, localMonth, localDay + 1, 0, 0, 0);
      const endTimestamp = Math.floor(endOfDay.getTime() / 1000) - 1;
      
      this._log(`📅 Same Date filter: local date ${localYear}-${String(localMonth+1).padStart(2,'0')}-${String(localDay).padStart(2,'0')} → timestamp range ${startTimestamp} to ${endTimestamp}`);
      
      // Call media_index.get_random_items with timestamp filtering
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_random_items',
        service_data: {
          count: 100, // Get up to 100 photos from this day
          timestamp_from: startTimestamp,
          timestamp_to: endTimestamp
        },
        return_response: true
      };
      
      // Target specific entity if configured
      if (this.config.media_index?.entity_id) {
        wsCall.target = { entity_id: this.config.media_index.entity_id };
      }
      
      const response = await this.hass.callWS(wsCall);
      
      this._log('📅 Related photos response:', response);
      this._log('📅 First item:', response.response?.items?.[0]);
      
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
      
      this._log(`📸 Related photos panel loaded: ${this._panelQueue.length} files`);
      
      // Initialize paging for related panel
      this._panelPageStartIndex = 0;
      
      // Load first related photo
      if (this._panelQueue.length > 0) {
        await this._loadPanelItem(0);
      }
      
      // V5.6.7: Save pause state before pausing, then pause auto-advance while in related mode
      this._previousPauseState = this._isPaused;
      if (!this._isPaused) {
        this._setPauseState(true);
      }
      
      this._log(`✅ Entered related photos mode with ${this._panelQueue.length} photos`);
      
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
      // V5.6.7: Use pending index if available (syncs with deferred navigation updates)
      const currentIndex = this._pendingNavigationIndex ?? this.navigationIndex;
      this._panelPageStartIndex = currentIndex;
      
      // Load current item to show in panel
      const currentItem = this.navigationQueue[currentIndex];
      if (currentItem) {
        // Current item is already loaded, just open panel
        this._log(`📋 Queue preview opened: ${this.navigationQueue.length} items, current position ${currentIndex + 1}`);
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
    this._log('🚪 Exiting related photos mode');
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
    
    // V5.6.7: Save pause state early before operations that might fail
    this._previousPauseState = this._isPaused;
    
    this.requestUpdate();
    
    try {
      // Save main queue state
      this._mainQueue = [...this.navigationQueue];
      this._mainQueueIndex = this.navigationIndex;
      
      // Save previous panel mode to restore after closing
      this._previousPanelMode = this._panelMode;
      
      // V5.6.7: Save queue panel scroll position if coming from queue mode
      if (this._panelMode === 'queue') {
        this._previousQueuePageIndex = this._panelPageStartIndex;
      }
      
      // V5.6.7: Use photo's date or today's date based on toggle
      // Default (off): Use today's date (for "it's my kid's birthday today")
      // Checked (on): Use current photo's date (for "show me this birthday across years")
      let month, day;
      
      if (this._onThisDayUsePhotoDate) {
        // Use current photo's date
        const currentTimestamp = this._currentMetadata?.date_taken || this._currentMetadata?.created_time;
        if (!currentTimestamp) {
          console.warn('Cannot enter On This Day mode: no timestamp for current photo');
          this._panelLoading = false;
          this._onThisDayLoading = false;
          return;
        }
        
        const photoDate = new Date(currentTimestamp * 1000); // Convert Unix timestamp to Date
        month = String(photoDate.getMonth() + 1); // 1-12
        day = String(photoDate.getDate()); // 1-31
      } else {
        // Use today's date (default)
        const today = new Date();
        month = String(today.getMonth() + 1); // 1-12
        day = String(today.getDate()); // 1-31
      }
      
      // Use current window setting (default 0 = exact match)
      const windowDays = this._onThisDayWindowDays || 0;
      
      this._log(`📅 Querying On This Day: month=${month}, day=${day}, window=±${windowDays} days`);
      
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
      
      // V5.6.7: Pause auto-advance while in On This Day mode (pause state already saved earlier)
      if (!this._isPaused) {
        this._setPauseState(true);
      }
      
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
    this._log('🚪 Exiting On This Day mode');
    this._exitPanelMode();
  }

  /**
   * Exit panel mode - restore main queue and handle burst metadata updates
   */
  async _exitPanelMode() {
    this._log(`🚪 Exiting panel mode: ${this._panelMode}, burstAllFiles: ${this._burstAllFiles?.length || 0}`);
    
    try {
      // Handle burst-specific exit actions - always save metadata to record burst_count
      if (this._panelMode === 'burst' && this._burstAllFiles && this._burstAllFiles.length > 0) {
        this._log(`💾 Writing burst metadata to ${this._burstAllFiles.length} files (${this._burstFavoritedFiles?.length || 0} favorited)`);
        
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
          this._log('✅ Burst metadata saved:', `${response.response.files_updated} files, ${response.response.favorites_count} favorited`);
        } catch (metadataError) {
          console.error('Failed to update burst metadata:', metadataError);
          // Don't block exit on metadata failure
        }
      }
      
      // Restore main queue state (but NOT for queue preview - it doesn't replace the queue)
      const isQueuePreview = this._panelMode === 'queue';
      
      if (!isQueuePreview && this._mainQueue && this._mainQueue.length > 0) {
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
          
          this._log(`↩️ Restored main queue position ${this.navigationIndex + 1}/${this.navigationQueue.length}`);
        }
      }
      
      // Clear panel state (but might restore queue panel below)
      const previousPanelMode = this._previousPanelMode;
      const preservedPageStartIndex = this._panelPageStartIndex; // V5.6.7: Preserve for queue restoration
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
      
      // V5.6.7: Restore previous pause state BEFORE restoring queue panel
      // This ensures the pause state is correct whether we restore queue or not
      const shouldRestoreQueuePanel = (previousPanelMode === 'queue');
      const shouldRestorePauseState = !isQueuePreview; // Don't restore when closing queue itself
      
      if (shouldRestorePauseState && this._previousPauseState !== null) {
        if (!this._previousPauseState && this._isPaused) {
          // Was not paused before, currently paused, so resume
          this._setPauseState(false);
          // V5.6.7: Explicitly restart auto-refresh to ensure timer is active
          this._setupAutoRefresh();
        }
      }
      // V5.6.7: Always clear saved pause state after use (not just in restore branch)
      this._previousPauseState = null;
      
      // Restore previous panel mode if we were in queue preview before burst
      if (shouldRestoreQueuePanel) {
        this._panelMode = 'queue';
        this._panelOpen = true;
        // V5.6.7: Restore queue scroll position from saved value
        if (this._previousQueuePageIndex !== null) {
          this._panelPageStartIndex = this._previousQueuePageIndex;
          this._previousQueuePageIndex = null; // Clear saved value
        } else {
          this._panelPageStartIndex = preservedPageStartIndex;
        }
        console.warn('↩️ Restored queue preview panel after burst review');
      }
      
      // V5.6.7: When closing queue panel, ensure auto-refresh is active if not paused
      if (isQueuePreview && !this._isPaused) {
        this._log('▶️ Restarting auto-advance after closing queue panel');
        this._setupAutoRefresh();
      }
      
      this.requestUpdate();
      this._log('✅ Panel mode exited, main queue restored');
      
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
  
  _handleThumbnailError(e, item) {
    // Handle 404s for queue thumbnails - mark item as invalid and hide it
    this._log('📭 Thumbnail failed to load (404):', item.filename || item.path);
    
    // Mark the item as invalid so it won't be displayed
    if (item) {
      item._invalid = true;
      
      // Get identifier to match (prefer media_source_uri, fallback to media_content_id or path)
      const itemIdentifier = item.media_source_uri || item.media_content_id || item.path;
      
      // Helper to match items by identifier
      const matchesItem = (q) => {
        const qIdentifier = q.media_source_uri || q.media_content_id || q.path;
        return qIdentifier === itemIdentifier || q === item; // Also check reference for thumbnails
      };
      
      // Remove the invalid item from navigationQueue to prevent position mismatches
      if (this.navigationQueue && this.navigationQueue.length > 0) {
        const originalQueue = this.navigationQueue;
        const initialLength = originalQueue.length;
        let removedBeforeCurrent = 0;
        
        this.navigationQueue = originalQueue.filter((q, index) => {
          const isRemoved = matchesItem(q);
          if (isRemoved && index < this.navigationIndex) {
            removedBeforeCurrent++;
          }
          return !isRemoved;
        });
        
        if (this.navigationQueue.length < initialLength) {
          this._log(`🗑️ Removed invalid item from navigationQueue (${initialLength} → ${this.navigationQueue.length})`);
          
          // Adjust navigationIndex if needed (if current position was after any removed items)
          if (removedBeforeCurrent > 0) {
            const previousIndex = this.navigationIndex;
            this.navigationIndex = Math.max(0, this.navigationIndex - removedBeforeCurrent);
            this._log(`📍 Adjusted navigationIndex: ${previousIndex} → ${this.navigationIndex}`);
          }
        }
      }
      
      // V5.6.5: Also remove from panel queue if we're in panel mode
      // This fixes the same index mismatch issue for burst, related, on_this_day, and history panels
      if (this._panelQueue && this._panelQueue.length > 0 && this._panelMode) {
        const originalPanelQueue = this._panelQueue;
        const initialLength = originalPanelQueue.length;
        let removedBeforeCurrent = 0;
        
        this._panelQueue = originalPanelQueue.filter((q, index) => {
          const isRemoved = matchesItem(q);
          if (isRemoved && index < this._panelQueueIndex) {
            removedBeforeCurrent++;
          }
          return !isRemoved;
        });
        
        if (this._panelQueue.length < initialLength) {
          this._log(`🗑️ Removed invalid item from _panelQueue (${initialLength} → ${this._panelQueue.length})`);
          
          // Adjust _panelQueueIndex if needed (if current position was after any removed items)
          if (removedBeforeCurrent > 0) {
            const previousIndex = this._panelQueueIndex;
            this._panelQueueIndex = Math.max(0, this._panelQueueIndex - removedBeforeCurrent);
            this._log(`📍 Adjusted _panelQueueIndex: ${previousIndex} → ${this._panelQueueIndex}`);
          }
        }
      }
    }
    
    // Hide the entire thumbnail container
    const target = e.target;
    if (target) {
      // Find the parent thumbnail container and hide it
      const thumbnailContainer = target.closest('.thumbnail-item');
      if (thumbnailContainer) {
        thumbnailContainer.style.display = 'none';
      }
    }
    
    // Trigger a re-render to update the display without the broken item
    this.requestUpdate();
  }

  _remove404FromQueues(item) {
    // Remove 404 item from both navigation and panel queues
    // This is called from main media error handler to prevent showing the same 404 again
    if (!item) return;

    this._log('🗑️ Removing 404 item from all queues:', item.filename || item.path);
    this._log('🔍 Item identifiers:', {
      media_source_uri: item.media_source_uri,
      media_content_id: item.media_content_id,
      path: item.path
    });

    // Get identifier to match (prefer media_source_uri, fallback to media_content_id or path)
    const itemIdentifier = item.media_source_uri || item.media_content_id || item.path;
    if (!itemIdentifier) {
      this._log('⚠️ Cannot remove 404 item - no identifier found');
      return;
    }

    // V5.6.8: Tell provider to exclude this file so it won't be returned again
    // Pass all identifier formats - provider will normalize them
    if (this.provider && typeof this.provider.excludeFile === 'function') {
      // Exclude by path (filesystem path)
      if (item.path) {
        this.provider.excludeFile(item.path);
        this._log('🚫 Excluded file from provider (path):', item.path);
      }
      // Also exclude by media_source_uri if different from path
      if (item.media_source_uri && item.media_source_uri !== item.path) {
        this.provider.excludeFile(item.media_source_uri);
        this._log('🚫 Excluded file from provider (uri):', item.media_source_uri);
      }
    }

    // Helper to match items by identifier - handle both URI and path formats
    let debugMatchCount = 0;
    const matchesItem = (q, index) => {
      const qUri = q.media_source_uri || q.media_content_id;
      const qPath = q.path;
      
      // Debug first 3 queue items to see their identifiers
      if (debugMatchCount < 3) {
        this._log(`🔍 Queue item ${index}:`, {
          filename: q.filename,
          qUri: qUri,
          qPath: qPath
        });
        debugMatchCount++;
      }
      
      // Try exact match first
      if (qUri === itemIdentifier || qPath === itemIdentifier) {
        this._log(`✅ Exact match found at index ${index}`);
        return true;
      }
      
      // If item has URI and queue has path, extract path from URI for comparison
      if (item.media_source_uri && qPath) {
        // Extract path from media-source URI: media-source://media_source/path -> /path
        const uriPath = item.media_source_uri.replace(/^media-source:\/\/media_source/, '');
        if (uriPath === qPath) {
          this._log(`✅ URI-path match found at index ${index}: "${uriPath}" === "${qPath}"`);
          return true;
        } else if (debugMatchCount <= 3) {
          this._log(`❌ No match: URI "${uriPath}" !== path "${qPath}"`);
        }
      }
      
      // If queue has URI and item has path, extract path from queue URI
      if (qUri && item.path) {
        const qUriPath = qUri.replace(/^media-source:\/\/media_source/, '');
        if (qUriPath === item.path) {
          this._log(`✅ Path-URI match found at index ${index}`);
          return true;
        }
      }
      
      return false;
    };

    // Remove from navigation queue
    if (this.navigationQueue && this.navigationQueue.length > 0) {
      const originalQueue = this.navigationQueue;
      const initialLength = originalQueue.length;
      let removedBeforeCurrent = 0;

      this.navigationQueue = originalQueue.filter((q, index) => {
        const isRemoved = matchesItem(q, index);
        if (isRemoved && index < this.navigationIndex) {
          removedBeforeCurrent++;
        }
        return !isRemoved;
      });

      if (this.navigationQueue.length < initialLength) {
        this._log(`🗑️ Removed from navigationQueue (${initialLength} → ${this.navigationQueue.length})`);
        if (removedBeforeCurrent > 0) {
          const previousIndex = this.navigationIndex;
          this.navigationIndex = Math.max(0, this.navigationIndex - removedBeforeCurrent);
          this._log(`📍 Adjusted navigationIndex: ${previousIndex} → ${this.navigationIndex}`);
        }
      } else {
        this._log(`⚠️ Item not found in navigationQueue: ${itemIdentifier}`);
      }
    }

    // Remove from panel queue
    if (this._panelQueue && this._panelQueue.length > 0 && this._panelMode) {
      const originalPanelQueue = this._panelQueue;
      const initialLength = originalPanelQueue.length;
      let removedBeforeCurrent = 0;
      
      // Reset debug counter for panel queue filtering
      debugMatchCount = 0;

      this._panelQueue = originalPanelQueue.filter((q, index) => {
        const isRemoved = matchesItem(q, index);
        if (isRemoved && index < this._panelQueueIndex) {
          removedBeforeCurrent++;
        }
        return !isRemoved;
      });

      if (this._panelQueue.length < initialLength) {
        this._log(`🗑️ Removed from _panelQueue (${initialLength} → ${this._panelQueue.length})`);
        if (removedBeforeCurrent > 0) {
          const previousIndex = this._panelQueueIndex;
          this._panelQueueIndex = Math.max(0, this._panelQueueIndex - removedBeforeCurrent);
          this._log(`📍 Adjusted _panelQueueIndex: ${previousIndex} → ${this._panelQueueIndex}`);
        }
      }
    }
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
    this._log(`📸 Selected burst photo ${index + 1}/${this._burstPhotos.length}: ${selectedPhoto.path}`);
    
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
    
    // V5.6.7: Toggle bottom overlay visibility during video playback
    // This allows access to video controls (play/pause, seek bar, volume)
    const isVideo = this._isVideoFile(this.mediaUrl);
    if (isVideo) {
      this._hideBottomOverlaysForVideo = !this._hideBottomOverlaysForVideo;
      this._log(`🎬 Bottom overlays ${this._hideBottomOverlaysForVideo ? 'hidden' : 'shown'} for video controls access`);
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

    /* V5.6.8: Hide native video controls when controls-on-tap is enabled */
    video.hide-controls::-webkit-media-controls {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-enclosure {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-panel {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-play-button {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-timeline {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-current-time-display {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-time-remaining-display {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-mute-button {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-volume-slider {
      display: none !important;
    }
    video.hide-controls::-webkit-media-controls-fullscreen-button {
      display: none !important;
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
    
    /* V5.6.7: Preserve translateX centering on hover for center-positioned clocks */
    .clock-overlay.clock-center-top.clickable:hover,
    .clock-overlay.clock-center-bottom.clickable:hover {
      transform: translateX(-50%) scale(1.05);
    }
    
    .clock-overlay.clickable:active {
      transform: scale(0.98);
    }
    
    .clock-overlay.clock-center-top.clickable:active,
    .clock-overlay.clock-center-bottom.clickable:active {
      transform: translateX(-50%) scale(0.98);
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

    /* V5.6.7: Hide bottom overlays during video playback (tap center to toggle)
       This allows access to native video controls (play/pause, seek bar, volume) */
    .media-container.hide-bottom-overlays .metadata-overlay.metadata-bottom-left,
    .media-container.hide-bottom-overlays .metadata-overlay.metadata-bottom-right,
    .media-container.hide-bottom-overlays .metadata-overlay.metadata-center-bottom,
    .media-container.hide-bottom-overlays .display-entities.position-bottom-left,
    .media-container.hide-bottom-overlays .display-entities.position-bottom-right,
    .media-container.hide-bottom-overlays .display-entities.position-center-bottom,
    .media-container.hide-bottom-overlays .clock-overlay.clock-bottom-left,
    .media-container.hide-bottom-overlays .clock-overlay.clock-bottom-right,
    .media-container.hide-bottom-overlays .clock-overlay.clock-center-bottom {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
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

    .panel-header-actions.stacked {
      flex-direction: column;
      gap: 8px;
    }

    .panel-header-actions.stacked .top-row {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
    }

    .panel-header-actions.stacked .bottom-row {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
    }

    .use-photo-date-checkbox {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: var(--primary-text-color);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .use-photo-date-checkbox input[type="checkbox"] {
      cursor: pointer;
      width: 16px;
      height: 16px;
      accent-color: var(--primary-color, #03a9f4);
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
    
    // V5.6.7: Hide bottom overlays during video playback (tap center to toggle for video control access)
    const hideBottomOverlaysClass = this._hideBottomOverlaysForVideo ? 'hide-bottom-overlays' : '';

    return html`
      <div 
        class="media-container ${transparentClass} ${hideBottomOverlaysClass}"
        style="--ha-media-metadata-scale: ${metadataScale}; --display-entities-transition: ${displayEntitiesTransition}ms; --ha-overlay-opacity: ${overlayOpacity}"
        @click=${this._handleTap}
        @dblclick=${this._handleDoubleTap}
        @pointerdown=${this._handlePointerDown}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerCancel}
      >
        ${isVideo ? html`
          <video
            class="${!this._isSafari && this.config.video_controls_on_tap !== false && !this._videoControlsVisible ? 'hide-controls' : ''}"
            ?controls=${this._isSafari ? (this.config.video_controls_on_tap === false || this._videoControlsVisible) : true}
            preload="auto"
            playsinline
            crossorigin="anonymous"
            ?loop=${(this.config.video_loop || false) && !(this.config.auto_advance_seconds > 0)}
            ?autoplay=${this.config.video_autoplay !== false}
            ?muted=${this.config.video_muted !== false}
            @loadstart=${this._onVideoLoadStart}
            @error=${this._onMediaError}
            @canplay=${this._onVideoCanPlay}
            @loadedmetadata=${this._onVideoLoadedMetadata}
            @play=${this._onVideoPlay}
            @pause=${this._onVideoPause}
            @ended=${this._onVideoEnded}
            @timeupdate=${this._onVideoTimeUpdate}
            @seeking=${this._onVideoSeeking}
            @seeked=${this._onVideoSeeked}
            @click=${this._onVideoClickToggle}
            @pointerdown=${(e) => { e.stopPropagation(); this._showButtonsExplicitly = true; this._startActionButtonsHideTimer(); this.requestUpdate(); }}
            @pointermove=${(e) => { e.stopPropagation(); this._showButtonsExplicitly = true; this._startActionButtonsHideTimer(); }}
            @touchstart=${(e) => { e.stopPropagation(); this._showButtonsExplicitly = true; this._startActionButtonsHideTimer(); this.requestUpdate(); }}
          >
            <source src="${this.mediaUrl}" type="video/mp4" @error=${this._onSourceError}>
            <source src="${this.mediaUrl}" type="video/webm" @error=${this._onSourceError}>
            <source src="${this.mediaUrl}" type="video/ogg" @error=${this._onSourceError}>
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
            // V5.6.7: Mark as manual navigation
            this._isManualNavigation = true;
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
            // V5.6.7: Mark as manual navigation
            this._isManualNavigation = true;
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
      // V5.6.7: Use either today's date or current photo's date based on toggle
      let displayDate;
      if (this._onThisDayUsePhotoDate) {
        // Use current photo's date
        const currentTimestamp = this._currentMetadata?.date_taken || this._currentMetadata?.created_time;
        if (currentTimestamp) {
          displayDate = new Date(currentTimestamp * 1000);
        } else {
          displayDate = new Date(); // Fallback to today if no photo timestamp
        }
      } else {
        // Use today's date (default)
        displayDate = new Date();
      }
      
      const monthDay = displayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
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
          <div class="panel-header-actions stacked">
            <div class="top-row">
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
              <label class="use-photo-date-checkbox" title="Use photo's date instead of today's date">
                <input 
                  type="checkbox" 
                  .checked=${this._onThisDayUsePhotoDate}
                  @change=${this._handleUsePhotoDateChange}
                />
                <span>📸 Photo Date</span>
              </label>
            </div>
            <div class="bottom-row">
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
    
    // Auto-adjust page for queue mode only (burst/related/same_date/on_this_day stay on current page)
    // V5.6.8: Simplified logic for queue preview auto-paging:
    // - If current navigationIndex is ON the visible page, keep it visible (auto-page if moving off)
    // - If current navigationIndex is NOT on visible page AND user manually paged, don't auto-page
    // - If user navigates and the new position would be highlighted, allow auto-paging again
    if (this._panelMode === 'queue') {
      const currentPageEnd = this._panelPageStartIndex + maxDisplay;
      const isCurrentIndexOnPage = this.navigationIndex >= this._panelPageStartIndex && this.navigationIndex < currentPageEnd;
      
      // If current index IS on the page, clear manual flag - user is viewing active item
      if (isCurrentIndexOnPage) {
        this._manualPageChange = false;
      }
      
      // Auto-adjust if not manually paged away
      if (!this._manualPageChange) {
        if (this.navigationIndex < this._panelPageStartIndex) {
          // Navigated backward beyond current page
          this._panelPageStartIndex = Math.max(0, this.navigationIndex - maxDisplay + 1);
        } else if (this.navigationIndex >= currentPageEnd) {
          // Navigated forward beyond current page  
          this._panelPageStartIndex = this.navigationIndex;
        }
      }
    }
    
    const displayStartIndex = this._panelPageStartIndex;
    // Filter out invalid items (404s) before displaying
    const validItems = allItems.filter(item => !item._invalid);
    const displayItems = validItems.slice(displayStartIndex, displayStartIndex + maxDisplay);

    // Calculate if we have previous/next pages
    // For queue mode: show buttons only when multiple pages exist (allows wrapping/cycling)
    // For other modes: only show when there are more pages
    const hasMultiplePages = validItems.length > maxDisplay;
    const hasPreviousPage = this._panelMode === 'queue' ? hasMultiplePages : displayStartIndex > 0;
    const hasNextPage = this._panelMode === 'queue' ? hasMultiplePages : (displayStartIndex + displayItems.length) < validItems.length;
    
    // V5.6: Calculate thumbnail height to fit rows in available space
    // Assumes panel height ~70% of viewport, header ~80px, padding/gap ~150px total
    const viewportHeight = window.innerHeight;
    const availableHeight = (viewportHeight * 0.7) - 230; // Conservative estimate
    const rows = maxDisplay / 2; // 2 columns
    const gapSpace = (rows - 1) * 16; // 16px gap between rows
    const thumbnailHeight = Math.max(100, Math.min(200, (availableHeight - gapSpace) / rows));

    // Resolve all thumbnail URLs upfront (async but doesn't block render)
    // Batch updates: only request re-render once after all pending resolutions complete
    let pendingResolutions = 0;
    let hasRequestedUpdate = false;
    
    displayItems.forEach(async (item) => {
      if (!item._resolvedUrl && !item._resolving) {
        item._resolving = true;
        pendingResolutions++;
        
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
          
          // Only request update once after all thumbnails resolve
          pendingResolutions--;
          if (pendingResolutions === 0 && !hasRequestedUpdate) {
            hasRequestedUpdate = true;
            this.requestUpdate();
          }
        } catch (error) {
          console.error('Failed to resolve thumbnail:', error);
          pendingResolutions--;
          if (pendingResolutions === 0 && !hasRequestedUpdate) {
            hasRequestedUpdate = true;
            this.requestUpdate();
          }
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
          const cacheKey = item.media_content_id || item.path;
          
          return html`
            <div 
              class="thumbnail ${isFavorited ? 'favorited' : ''}"
              data-item-index="${actualIndex}"
              @click=${() => this._panelMode === 'queue' ? this._jumpToQueuePosition(actualIndex) : this._loadPanelItem(actualIndex)}
              title="${item.filename || item.path}"
              data-cache-key="${cacheKey}"
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
                    @error=${(e) => this._handleThumbnailError(e, item)}
                  ></video>
                  <div class="video-icon-overlay">🎞️</div>
                ` : html`
                  <img 
                    src="${item._resolvedUrl}" 
                    alt="${item.filename || 'Thumbnail'}"
                    @error=${(e) => this._handleThumbnailError(e, item)}
                  />
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


/**
 * MediaCardEditor - Card editor with full functionality
 * Will be adapted for v5 architecture in next phase
 */
class MediaCardEditor extends LitElement {
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
    
    // Sanitize numeric config values (convert "auto" or other strings to valid numbers/undefined)
    const sanitizedConfig = { ...migratedConfig };
    if (sanitizedConfig.auto_advance_seconds !== undefined && typeof sanitizedConfig.auto_advance_seconds !== 'number') {
      sanitizedConfig.auto_advance_seconds = undefined;
    }
    if (sanitizedConfig.auto_refresh_seconds !== undefined && typeof sanitizedConfig.auto_refresh_seconds !== 'number') {
      sanitizedConfig.auto_refresh_seconds = undefined;
    }
    
    this._config = sanitizedConfig;
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
        
        // V5.3: Prioritize media_source_uri (correct URI format for custom media_dirs)
        // Falls back to constructing URI from filesystem path if needed
        if (entity.attributes?.media_source_uri) {
          folderPath = entity.attributes.media_source_uri;
          this._log('📁 Auto-populated folder path from media_source_uri:', folderPath);
        } else {
          const filesystemPath = entity.attributes?.media_path || 
                                 entity.attributes?.folder_path || 
                                 entity.attributes?.base_path || null;
          
          if (filesystemPath) {
            // Convert filesystem path to media-source URI
            // e.g., /media/Photo/PhotoLibrary -> media-source://media_source/media/Photo/PhotoLibrary
            const normalizedPath = filesystemPath.startsWith('/') ? filesystemPath : '/' + filesystemPath;
            folderPath = `media-source://media_source${normalizedPath}`;
            this._log('📁 Auto-populated folder path from media_path:', filesystemPath, '→', folderPath);
          }
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
        
        // V5.3: Prioritize media_source_uri (correct URI format for custom media_dirs)
        // Falls back to constructing URI from filesystem path if needed
        let folderPath = null;
        
        if (entity.attributes?.media_source_uri) {
          // Use media_source_uri directly (already in correct format)
          folderPath = entity.attributes.media_source_uri;
          this._log('Using media_source_uri attribute:', folderPath);
        } else {
          // Fallback: construct URI from filesystem path attributes
          const mediaFolder = entity.attributes?.media_path ||   // media_index uses this
                             entity.attributes?.media_folder || 
                             entity.attributes?.folder_path ||
                             entity.attributes?.base_path;
          
          this._log('Extracted media folder:', mediaFolder);
          
          if (mediaFolder) {
            // Convert filesystem path to media-source URI format
            const normalizedPath = mediaFolder.startsWith('/') ? mediaFolder : '/' + mediaFolder;
            folderPath = `media-source://media_source${normalizedPath}`;
            this._log('Constructed URI from media_path:', mediaFolder, '→', folderPath);
          }
        }
        
        this._log('Is in folder mode?', this._config.media_source_type === 'folder');
        
        if (folderPath) {
          this._log('Auto-populating path from media_index entity:', folderPath);
          
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
          console.warn('⚠️ No media_source_uri or media_path attribute found on entity');
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
  
  _blendWithBackgroundChanged(ev) {
    this._config = { ...this._config, blend_with_background: ev.target.checked };
    this._fireConfigChanged();
  }

  _edgeFadeStrengthChanged(ev) {
    this._config = { ...this._config, edge_fade_strength: parseInt(ev.target.value) || 0 };
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

  _videoMaxDurationChanged(ev) {
    const duration = parseInt(ev.target.value) || 0;
    this._config = { ...this._config, video_max_duration: duration };
    this._fireConfigChanged();
  }
  
  _videoThumbnailTimeChanged(ev) {
    const time = parseFloat(ev.target.value) || 1;
    this._config = { ...this._config, video_thumbnail_time: time };
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

  // V5.6: Transition duration change handler
  _transitionDurationChanged(ev) {
    const duration = parseInt(ev.target.value, 10);
    this._config = {
      ...this._config,
      transition: {
        ...this._config.transition,
        duration: duration
      }
    };
    this._fireConfigChanged();
  }

  _displayEntitiesEnabledChanged(ev) {
    this._config = {
      ...this._config,
      display_entities: {
        ...this._config.display_entities,
        enabled: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _displayEntitiesPositionChanged(ev) {
    this._config = {
      ...this._config,
      display_entities: {
        ...this._config.display_entities,
        position: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _displayEntitiesCycleIntervalChanged(ev) {
    const value = parseInt(ev.target.value, 10);
    if (isNaN(value) || value < 1 || value > 60) return;
    
    this._config = {
      ...this._config,
      display_entities: {
        ...this._config.display_entities,
        cycle_interval: value
      }
    };
    this._fireConfigChanged();
  }

  _displayEntitiesTransitionDurationChanged(ev) {
    const value = parseInt(ev.target.value, 10);
    if (isNaN(value) || value < 0 || value > 2000) return;
    
    this._config = {
      ...this._config,
      display_entities: {
        ...this._config.display_entities,
        transition_duration: value
      }
    };
    this._fireConfigChanged();
  }

  _displayEntitiesRecentChangeWindowChanged(ev) {
    const value = parseInt(ev.target.value, 10);
    if (isNaN(value) || value < 0 || value > 300) return;
    
    this._config = {
      ...this._config,
      display_entities: {
        ...this._config.display_entities,
        recent_change_window: value
      }
    };
    this._fireConfigChanged();
  }

  _clockEnabledChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        enabled: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _clockPositionChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        position: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _clockShowTimeChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        show_time: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _clockFormatChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        format: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _clockShowDateChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        show_date: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _clockDateFormatChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        date_format: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _clockShowBackgroundChanged(ev) {
    this._config = {
      ...this._config,
      clock: {
        ...this._config.clock,
        show_background: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _overlayOpacityChanged(ev) {
    const value = parseFloat(ev.target.value);
    if (!isNaN(value)) {
      this._config = {
        ...this._config,
        overlay_opacity: value
      };
      this._fireConfigChanged();
    }
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

  _metadataShowRatingChanged(ev) {
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        show_rating: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _metadataScaleChanged(ev) {
    // Accept empty to clear (use default = 1)
    const raw = ev.target.value;
    if (raw === '' || raw === null || raw === undefined) {
      const newConfig = { ...this._config };
      newConfig.metadata = { ...(newConfig.metadata || {}) };
      delete newConfig.metadata.scale;
      this._config = newConfig;
      this._fireConfigChanged();
      return;
    }

    let value = parseFloat(raw);
    if (isNaN(value)) {
      return; // ignore invalid input until it becomes a number
    }
    // Clamp to safe range
    value = Math.max(0.3, Math.min(4, value));
    this._config = {
      ...this._config,
      metadata: {
        ...this._config.metadata,
        scale: value
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

  _actionButtonsEnableBurstReviewChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_burst_review: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsEnableRelatedPhotosChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_related_photos: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsEnableOnThisDayChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_on_this_day: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsHideOnThisDayButtonChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        hide_on_this_day_button: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsEnableQueuePreviewChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        enable_queue_preview: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _actionButtonsAutoOpenQueuePreviewChanged(ev) {
    this._config = {
      ...this._config,
      action_buttons: {
        ...this._config.action_buttons,
        auto_open_queue_preview: ev.target.checked
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
    
    // V5.3: FIRST priority - Check Media Index entity for media_source_uri attribute
    // This ensures custom media_dirs mappings work correctly
    if (this._config.media_index?.entity_id) {
      const entityId = this._config.media_index.entity_id;
      const entity = this.hass.states[entityId];
      
      this._log('🔍 Media Index entity:', entityId);
      this._log('🔍 Entity attributes:', entity?.attributes);
      
      // Media Index v1.4.0+ provides media_source_uri attribute
      if (entity && entity.attributes.media_source_uri) {
        startPath = entity.attributes.media_source_uri;
        this._log('Starting browser from Media Index URI (attribute):', startPath);
      }
    }
    
    // Second priority - try to get path from current config structure (v5)
    if (!startPath) {
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
      }
    }
    
    // Third priority - fallback to other Media Index attributes if no URI found
    if (!startPath && this._config.media_index?.entity_id) {
      const entityId = this._config.media_index.entity_id;
      const entity = this.hass.states[entityId];
      
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

    .support-footer {
      margin-top: 24px;
      padding: 16px;
      text-align: center;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }

    .support-footer a {
      display: block;
      color: var(--primary-color, #007bff);
      text-decoration: none;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .support-footer a:last-child {
      margin-bottom: 0;
    }

    .support-footer a:hover {
      text-decoration: underline;
    }

    .support-footer .coffee-icon {
      font-size: 16px;
      margin-right: 6px;
    }

    .support-footer .love-icon {
      font-size: 14px;
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
                .value=${typeof this._config.auto_advance_seconds === 'number' ? this._config.auto_advance_seconds : ''}
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
                  .checked=${this._config.video_autoplay ?? true}
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
                  .checked=${this._config.video_muted ?? true}
                  @change=${this._mutedChanged}
                />
                <div class="help-text">Start video without sound</div>
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
            
            <div class="config-row">
              <label>Video Thumbnail Time</label>
              <div>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  .value=${this._config.video_thumbnail_time || 1}
                  @change=${this._videoThumbnailTimeChanged}
                  placeholder="1"
                />
                <div class="help-text">Timestamp (seconds) to use for video thumbnails in queue preview (default: 1)</div>
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
                <option value="default">Default (Fixed Height)</option>
                <option value="smart-scale">Smart Scale (Leaves Space for Metadata)</option>
                <option value="viewport-fit">Viewport Fit (Maximize Image Size)</option>
                <option value="viewport-fill">Viewport Fill (Edge-to-Edge Immersive)</option>
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
            <label>Blend Card with Background</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.blend_with_background !== false}
                @change=${this._blendWithBackgroundChanged}
              />
              <div class="help-text">Blend card seamlessly with dashboard background (uncheck for card-style appearance)</div>
            </div>
          </div>
          
          <div class="config-row">
            <label>Edge Fade Strength (Beta)</label>
            <div>
              <input
                type="number"
                min="0"
                max="100"
                step="5"
                .value=${this._config.edge_fade_strength ?? 0}
                @input=${this._edgeFadeStrengthChanged}
                placeholder="0"
              />
              <div class="help-text">Fade image edges into background (0 = off, 1-100 = fade strength). Beta: May show faint lines on some images.</div>
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
                .value=${typeof this._config.auto_refresh_seconds === 'number' ? this._config.auto_refresh_seconds : ''}
                @input=${this._autoRefreshChanged}
                placeholder="0"
                min="0"
                max="3600"
                step="1"
              />
              <div class="help-text">Check for new files every N seconds (0 = disabled). Single media: reloads image URL. Folder mode: checks for new files and refreshes queue if at newest position.</div>
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

        <!-- V5.6: Transition Settings -->
        <div class="section">
          <div class="section-title">🎨 Transitions</div>
          
          <div class="config-row">
            <label>Transition Duration</label>
            <div>
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                .value=${this._config.transition?.duration ?? 300}
                @input=${this._transitionDurationChanged}
              />
              <span>${this._config.transition?.duration ?? 300}ms</span>
              <div class="help-text">Fade duration between photos (0 = instant). Default: 300ms</div>
            </div>
          </div>
        </div>

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
          
          <div class="config-row">
            <label>Show Rating/Favorite</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.metadata?.show_rating === true}
                @change=${this._metadataShowRatingChanged}
              />
              <div class="help-text">Display heart icon for favorites or star rating (requires media_index integration)</div>
            </div>
          </div>

          <div class="config-row">
            <label>Overlay Opacity</label>
            <div>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                .value=${this._config.overlay_opacity ?? ''}
                @input=${this._overlayOpacityChanged}
                placeholder="0.25"
              />
              <div class="help-text">Background opacity for ALL overlays (metadata, clock, display entities). Range: 0 (transparent) to 1 (opaque). Default: 0.25</div>
            </div>
          </div>

          <div class="config-row">
            <label>Overlay Scale</label>
            <div>
              <input
                type="number"
                min="0.3"
                max="4"
                step="0.1"
                .value=${typeof this._config.metadata?.scale === 'number' ? this._config.metadata.scale : ''}
                @input=${this._metadataScaleChanged}
                placeholder="1.0"
              />
              <div class="help-text">Adjust overlay text size relative to card viewport (affects metadata and position indicator). Default is 1.0; range 0.3–4.0.</div>
            </div>
          </div>
        </div>
        
        <!-- Display Entities Section -->
        <div class="section">
          <div class="section-title">📊 Display Entities</div>
          
          <div class="config-row">
            <label>Enable Display Entities</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.display_entities?.enabled === true}
                @change=${this._displayEntitiesEnabledChanged}
              />
              <div class="help-text">Show Home Assistant entity states with fade transitions</div>
            </div>
          </div>
          
          ${this._config.display_entities?.enabled ? html`
            <div class="config-row">
              <label>Cycle Interval (seconds)</label>
              <div>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  .value=${this._config.display_entities?.cycle_interval || 10}
                  @input=${this._displayEntitiesCycleIntervalChanged}
                  style="width: 80px;"
                />
                <div class="help-text">Time to display each entity before cycling to next (default: 10)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Transition Duration (ms)</label>
              <div>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  step="100"
                  .value=${this._config.display_entities?.transition_duration || 500}
                  @input=${this._displayEntitiesTransitionDurationChanged}
                  style="width: 80px;"
                />
                <div class="help-text">Fade animation speed (0 = instant, default: 500)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Recent Change Window (seconds)</label>
              <div>
                <input
                  type="number"
                  min="0"
                  max="300"
                  step="30"
                  .value=${this._config.display_entities?.recent_change_window || 60}
                  @input=${this._displayEntitiesRecentChangeWindowChanged}
                  style="width: 80px;"
                />
                <div class="help-text">Prioritize recently changed entities (0 = disabled, default: 60)</div>
              </div>
            </div>
            
            <div style="grid-column: 1 / -1; padding: 16px; background: var(--secondary-background-color); border-radius: 8px; border-left: 4px solid var(--primary-color); margin-top: 8px;">
              <div style="font-weight: 500; margin-bottom: 8px; color: var(--primary-text-color);">⚠️ Entity Configuration Required</div>
              <div style="margin-bottom: 8px; color: var(--primary-text-color);">To add entities to display, you must edit this card's YAML configuration:</div>
              <ol style="margin: 8px 0; padding-left: 20px; color: var(--secondary-text-color); line-height: 1.6;">
                <li>Click "Show code editor" (bottom-left of the Media Card configuration)</li>
                <li>Add an <code style="background: var(--code-editor-background-color, rgba(0,0,0,0.2)); padding: 2px 6px; border-radius: 3px; font-family: monospace;">entities:</code> array under <code style="background: var(--code-editor-background-color, rgba(0,0,0,0.2)); padding: 2px 6px; border-radius: 3px; font-family: monospace;">display_entities:</code></li>
              </ol>
              <div style="font-size: 13px; font-family: monospace; background: var(--code-editor-background-color, rgba(0,0,0,0.15)); padding: 12px; border-radius: 4px; margin: 8px 0; line-height: 1.5; color: var(--primary-text-color);">
                <div style="color: var(--secondary-text-color);">display_entities:</div>
                <div style="color: var(--secondary-text-color); padding-left: 20px;">enabled: true</div>
                <div style="color: var(--secondary-text-color); padding-left: 20px;">entities:</div>
                <div style="padding-left: 40px;">- entity: sensor.temperature</div>
                <div style="padding-left: 40px; padding-left: 60px;">label: "Temp:"</div>
                <div style="padding-left: 40px;">- entity: binary_sensor.motion</div>
                <div style="padding-left: 40px; padding-left: 60px;">icon: mdi:motion-sensor</div>
              </div>
              <div style="margin-top: 8px;">
                <a href="https://github.com/markaggar/ha-media-card/blob/master/docs/guides/display-entities.md" target="_blank" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">📖 View Full Documentation & Examples →</a>
              </div>
            </div>
          ` : ''}
        </div>
        
        <!-- Clock/Date Section -->
        <div class="section">
          <div class="section-title">🕐 Clock/Date</div>
          
          <div class="config-row">
            <label>Enable Clock/Date</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.clock?.enabled === true}
                @change=${this._clockEnabledChanged}
              />
              <div class="help-text">Show clock and/or date overlay (perfect for kiosk mode)</div>
            </div>
          </div>
          
          ${this._config.clock?.enabled ? html`
            <div class="config-row">
              <label>Show Time</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.clock?.show_time !== false}
                  @change=${this._clockShowTimeChanged}
                />
                <div class="help-text">Display the current time</div>
              </div>
            </div>
            
            ${this._config.clock?.show_time !== false ? html`
              <div class="config-row">
                <label>Time Format</label>
                <div>
                  <select @change=${this._clockFormatChanged} .value=${this._config.clock?.format || '12h'}>
                    <option value="12h">12-hour (3:45 PM)</option>
                    <option value="24h">24-hour (15:45)</option>
                  </select>
                  <div class="help-text">Clock time format</div>
                </div>
              </div>
            ` : ''}
            
            <div class="config-row">
              <label>Show Date</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.clock?.show_date !== false}
                  @change=${this._clockShowDateChanged}
                />
                <div class="help-text">Display the current date</div>
              </div>
            </div>
            
            ${this._config.clock?.show_date !== false ? html`
              <div class="config-row">
                <label>Date Format</label>
                <div>
                  <select @change=${this._clockDateFormatChanged} .value=${this._config.clock?.date_format || 'long'}>
                    <option value="long">Long (December 16, 2025)</option>
                    <option value="short">Short (12/16/2025)</option>
                  </select>
                  <div class="help-text">Date display format</div>
                </div>
              </div>
            ` : ''}
            
            <div class="config-row">
              <label>Show Background</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.clock?.show_background !== false}
                  @change=${this._clockShowBackgroundChanged}
                />
                <div class="help-text">Display subtle background behind clock/date (when unchecked, text will have shadow for readability)</div>
              </div>
            </div>
          ` : ''}
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
                <option value="center-top">Center Top</option>
                <option value="center-bottom">Center Bottom</option>
              </select>
              <div class="help-text">Where to display the metadata overlay (filename, date, location)</div>
            </div>
          </div>
          
          ${this._config.display_entities?.enabled ? html`
            <div class="config-row">
              <label>Display Entities Position</label>
              <div>
                <select @change=${this._displayEntitiesPositionChanged} .value=${this._config.display_entities?.position || 'top-left'}>
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="center-top">Center Top</option>
                  <option value="center-bottom">Center Bottom</option>
                </select>
                <div class="help-text">Where to display entity states overlay</div>
              </div>
            </div>
          ` : ''}
          
          ${this._config.clock?.enabled ? html`
            <div class="config-row">
              <label>Clock Position</label>
              <div>
                <select @change=${this._clockPositionChanged} .value=${this._config.clock?.position || 'bottom-left'}>
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="center-top">Center Top</option>
                  <option value="center-bottom">Center Bottom</option>
                </select>
                <div class="help-text">Where to display clock/date overlay</div>
              </div>
            </div>
          ` : ''}
          
          <div class="config-row">
            <label>Action Buttons Position</label>
            <div>
              <select @change=${this._actionButtonsPositionChanged}>
                <option value="top-right" .selected=${(this._config.action_buttons?.position || 'top-right') === 'top-right'}>Top Right</option>
                <option value="top-left" .selected=${this._config.action_buttons?.position === 'top-left'}>Top Left</option>
                <option value="bottom-right" .selected=${this._config.action_buttons?.position === 'bottom-right'}>Bottom Right</option>
                <option value="bottom-left" .selected=${this._config.action_buttons?.position === 'bottom-left'}>Bottom Left</option>
                <option value="center-top" .selected=${this._config.action_buttons?.position === 'center-top'}>Center Top</option>
                <option value="center-bottom" .selected=${this._config.action_buttons?.position === 'center-bottom'}>Center Bottom</option>
              </select>
              <div class="help-text">Position for action buttons (fullscreen, pause, refresh, favorite, etc.)</div>
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
                <option value="center-top">Center Top</option>
                <option value="center-bottom">Center Bottom</option>
              </select>
              <div class="help-text">Position for "X of Y" counter (only shown in folder mode)</div>
            </div>
          </div>
        </div>

        <!-- Fullscreen Button (always available) -->
        <div class="section">
          <div class="section-title">🖼️ Fullscreen</div>
          
          <div class="config-row">
            <label>Fullscreen Button</label>
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
              <label>Favorite Button</label>
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
              <label>Delete Button</label>
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
              <label>Edit Button</label>
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
              <label>Burst Review Button</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.enable_burst_review === true}
                  @change=${this._actionButtonsEnableBurstReviewChanged}
                />
                <div class="help-text">Review rapid-fire photos taken at the same time as current media item (requires media_index)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Same Date Button</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.enable_related_photos === true}
                  @change=${this._actionButtonsEnableRelatedPhotosChanged}
                />
                <div class="help-text">View other media items from the same date/time as current media item (requires media_index)</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Through the Years Button</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.enable_on_this_day === true}
                  @change=${this._actionButtonsEnableOnThisDayChanged}
                />
                <div class="help-text">View media items from today's date across all years in your library (requires media_index)</div>
              </div>
            </div>
            
            <div class="config-row" style="display: ${this._config.action_buttons?.enable_on_this_day === true ? 'flex' : 'none'}">
              <label style="padding-left: 20px;">Hide Button (Clock Only)</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.hide_on_this_day_button === true}
                  @change=${this._actionButtonsHideOnThisDayButtonChanged}
                />
                <div class="help-text">Hide the Through the Years action button; the feature remains accessible via the clock/date overlay</div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">📋 Queue Preview</div>
          
          <div class="config-row">
            <label>Queue Button</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.action_buttons?.enable_queue_preview === true}
                @change=${this._actionButtonsEnableQueuePreviewChanged}
              />
              <div class="help-text">View navigation queue (sequential: past and upcoming, random: recent history)</div>
            </div>
          </div>
          
          ${this._config.action_buttons?.enable_queue_preview === true ? html`
            <div class="config-row">
              <label>Auto-open Queue on Load</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.action_buttons?.auto_open_queue_preview === true}
                  @change=${this._actionButtonsAutoOpenQueuePreviewChanged}
                />
                <div class="help-text">Automatically open queue preview panel when card loads</div>
              </div>
            </div>
          ` : ''}
        </div>

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

        <div class="support-footer">
          <a href="https://github.com/markaggar/ha-media-card/issues" target="_blank" rel="noopener noreferrer">
            Report an issue or request a feature on GitHub
          </a>
 
          <a href="https://buymeacoffee.com/markaggar" target="_blank" rel="noopener noreferrer">
            Made with AI and <span class="love-icon">❤️</span> in Seattle. <strong>Enjoying Media Card? Buy me a coffee!</strong> <span class="coffee-icon">☕</span>
          </a>
        </div>
      </div>
    `;
  }
}

// Register the custom elements (guard against re-registration)
if (!customElements.get('media-card')) {
  customElements.define('media-card', MediaCard);
}
if (!customElements.get('media-card-editor')) {
  customElements.define('media-card-editor', MediaCardEditor);
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
  '%c  MEDIA-CARD  %c  v5.6.9 Loaded  ',
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: green'
);

