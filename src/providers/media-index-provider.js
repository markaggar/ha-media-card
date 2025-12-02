import { MediaProvider } from '../core/media-provider.js';
import { MediaUtils } from '../core/media-utils.js';

/**
 * MEDIA INDEX PROVIDER - Database-backed random media queries
 * V4 CODE REUSE: Copied from ha-media-card.js lines 2121-2250 (_queryMediaIndex)
 * Adapted for provider pattern architecture
 */
export class MediaIndexProvider extends MediaProvider {
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
}
