import { MediaUtils } from './media-utils.js';
import { MediaIndexHelper } from './media-index-helper.js';

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
export class MediaProvider {
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
