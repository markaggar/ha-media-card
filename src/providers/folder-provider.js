import { MediaProvider } from '../core/media-provider.js';
import { MediaIndexHelper } from '../core/media-index-helper.js';
import { MediaIndexProvider } from './media-index-provider.js';
import { SequentialMediaIndexProvider } from './sequential-media-index-provider.js';
import { SubfolderQueue } from './subfolder-queue.js';

/**
 * FOLDER PROVIDER - Wraps SubfolderQueue for folder slideshow
 */
export class FolderProvider extends MediaProvider {
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

  // V5.6.6: Delegate file existence check to wrapped provider (MediaIndexProvider only)
  async checkFileExists(mediaItem) {
    // Only MediaIndexProvider implements this - delegate if available
    if (this.mediaIndexProvider && typeof this.mediaIndexProvider.checkFileExists === 'function') {
      return await this.mediaIndexProvider.checkFileExists(mediaItem);
    }
    
    if (this.sequentialProvider && typeof this.sequentialProvider.checkFileExists === 'function') {
      return await this.sequentialProvider.checkFileExists(mediaItem);
    }
    
    // SubfolderQueue discovers files from disk, no validation needed
    return null;
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

}

