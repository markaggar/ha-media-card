import { MediaProvider } from '../core/media-provider.js';
import { MediaUtils } from '../core/media-utils.js';
import { MediaIndexHelper } from '../core/media-index-helper.js';

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
        
        // V5.6.8: Use entry_id instead of target for non-admin user support
        MediaIndexHelper.addEntryId(this.hass, this.config, wsCall.service_data);
        
        if (this.config.media_index?.entity_id && iteration === 1) {
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
      
      // V5.6.8: Use entry_id instead of target for non-admin user support
      MediaIndexHelper.addEntryId(this.hass, this.config, wsCall.service_data);
      
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
      
      // V5.6.8: Use entry_id instead of target for non-admin user support
      MediaIndexHelper.addEntryId(this.hass, this.config, wsCall.service_data);
      
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

