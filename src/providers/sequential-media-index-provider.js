import { MediaProvider } from '../core/media-provider.js';
import { MediaUtils } from '../core/media-utils.js';

/**
 * SEQUENTIAL MEDIA INDEX PROVIDER - Database-backed ordered queries
 * NEW V5 FEATURE: Sequential mode with cursor-based pagination
 * Uses media_index.get_ordered_files service for deterministic ordering
 */
export class SequentialMediaIndexProvider extends MediaProvider {
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
      const pathMetadata = MediaProvider.extractMetadataFromPath(item.path, this.config);
      
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
        
        // CLIENT-SIDE SAFETY: Re-sort items to handle null date_taken gracefully
        // Backend should already sort correctly, but this prevents issues if:
        // - Videos have null date_taken but recent modified_time
        // - Backend fallback logic changes
        // - Network/caching returns stale data
        if (this.orderBy === 'date_taken') {
          filteredItems.sort((a, b) => {
            // Use date_taken, fallback to modified_time, then created_time
            const dateA = a.date_taken || a.modified_time || a.created_time || 0;
            const dateB = b.date_taken || b.modified_time || b.created_time || 0;
            
            // Apply direction
            return this.orderDirection === 'desc' ? dateB - dateA : dateA - dateB;
          });
          this._log('🔄 Applied client-side sort by date_taken with fallback to modified_time/created_time');
        }
        
        // Transform items to include resolved URLs
        const items = await Promise.all(filteredItems.map(async (item) => {
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
}

// Note: SubfolderQueue is defined in src/providers/subfolder-queue.js
// Any hierarchical random folder logic should be imported from that module.

