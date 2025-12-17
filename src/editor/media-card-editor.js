import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

/**
 * MediaCardEditor - Card editor with full functionality
 * Will be adapted for v5 architecture in next phase
 */
export class MediaCardEditor extends LitElement {
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
                .value=${this._config.metadata?.scale ?? ''}
                @input=${this._metadataScaleChanged}
                placeholder="1.0"
              />
              <div class="help-text">Adjust overlay text size relative to card viewport (affects metadata and position indicator). Default is 1.0; range 0.3–4.0.</div>
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
                <option value="center-top">Center Top</option>
                <option value="center-bottom">Center Bottom</option>
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
          
          <div class="config-row">
            <label>Display Entities</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.display_entities?.enabled === true}
                @change=${this._displayEntitiesEnabledChanged}
              />
              <div class="help-text">Show Home Assistant entity states with fade transitions. Configure entities in YAML (see documentation).</div>
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
          
          <div class="config-row">
            <label>Clock/Date</label>
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
      </div>
    `;
  }
}