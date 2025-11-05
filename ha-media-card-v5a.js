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
 * MediaCardV5a - Main card component (minimal placeholder)
 */
class MediaCardV5a extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false }
  };

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

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this.config = config;
  }

  getCardSize() {
    return 3;
  }

  static styles = css`
    :host {
      display: block;
    }
    .card {
      padding: 16px;
      background: var(--card-background-color);
      border-radius: var(--ha-card-border-radius);
    }
    .placeholder {
      text-align: center;
      padding: 32px;
      color: var(--secondary-text-color);
    }
  `;

  render() {
    if (!this.config) {
      return html`
        <ha-card>
          <div class="card">
            <div class="placeholder">No configuration</div>
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card>
        <div class="card">
          <div class="placeholder">
            <h3>Media Card v5a</h3>
            <p>Card registered successfully!</p>
            <p>Path: ${this.config.media_path || 'Not set'}</p>
          </div>
        </div>
      </ha-card>
    `;
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

    console.log('Migrated v4 config to v5:', { original: config, migrated: result });
    return result;
  }

  // Utility methods
  _log(...args) {
    console.log(...args);
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
    this._config = { 
      ...this._config, 
      media_source_type: newMode 
    };
    
    // Clear mode-specific settings when switching modes
    if (newMode === 'single_media') {
      // Remove folder-specific settings
      delete this._config.is_folder;
      delete this._config.folder_mode;
      delete this._config.random_mode;
      delete this._config.subfolder_queue_enabled;
    } else {
      // Remove single-media specific settings
      delete this._config.auto_refresh_seconds;
    }
    
    this._fireConfigChanged();
  }

  _handleMediaIndexToggle(ev) {
    const enabled = ev.target.checked;
    this._config = { 
      ...this._config, 
      use_media_index: enabled 
    };
    
    if (!enabled) {
      delete this._config.media_index;
    } else if (!this._config.media_index) {
      this._config.media_index = { entity_id: '' };
    }
    
    this._fireConfigChanged();
  }

  _handleMediaIndexEntityChange(ev) {
    const entityId = ev.target.value;
    this._config = {
      ...this._config,
      media_index: {
        ...this._config.media_index,
        entity_id: entityId
      }
    };
    this._fireConfigChanged();
  }

  _getMediaIndexEntities() {
    if (!this.hass) return [];
    
    return Object.keys(this.hass.states)
      .filter(entityId => entityId.startsWith('sensor.media_index_'))
      .sort();
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

  _mediaIndexEnabledChanged(ev) {
    this._config = {
      ...this._config,
      media_index: {
        ...this._config.media_index,
        enabled: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _mediaIndexEntityChanged(ev) {
    this._config = {
      ...this._config,
      media_index: {
        ...this._config.media_index,
        entity_id: ev.target.value
      }
    };
    this._fireConfigChanged();
  }

  _renderMediaIndexEntityOptions() {
    if (!this.hass || !this.hass.states) {
      return html``;
    }

    const mediaIndexEntities = Object.keys(this.hass.states)
      .filter(entityId => entityId.startsWith('sensor.media_index'))
      .sort();

    return mediaIndexEntities.map(entityId => {
      const state = this.hass.states[entityId];
      const friendlyName = state.attributes.friendly_name || entityId;
      
      return html`
        <option value="${entityId}">${friendlyName}</option>
      `;
    });
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

  _subfolderQueueEnabledChanged(ev) {
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        enabled: ev.target.checked
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
        scan_depth: depth === 0 ? null : depth
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
        // Media file - show icon
        const ext = this._getFileExtension(this._getItemDisplayName(item));
        const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext);
        const icon = isVideo ? '🎬' : '🖼️';
        const iconSpan = document.createElement('span');
        iconSpan.textContent = icon;
        iconSpan.style.fontSize = '24px';
        thumbnailContainer.appendChild(iconSpan);

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
    this._log('Adding folder options for:', folderPath);
    
    const optionsHeader = document.createElement('div');
    optionsHeader.style.cssText = `
      padding: 8px 16px !important;
      background: var(--secondary-background-color, #f5f5f5) !important;
      border-radius: 6px !important;
      margin-bottom: 8px !important;
      font-weight: 500 !important;
      color: var(--primary-text-color) !important;
      border-left: 4px solid var(--primary-color, #007bff) !important;
      font-size: 14px !important;
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
      background: var(--card-background-color, #fff) !important;
      margin-bottom: 8px !important;
      pointer-events: auto !important;
    `;

    option.onmouseenter = () => {
      option.style.background = 'var(--primary-color, #007bff)';
      option.style.color = 'white';
      option.style.transform = 'translateY(-2px)';
      option.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
    };

    option.onmouseleave = () => {
      option.style.background = 'var(--card-background-color, #fff)';
      option.style.color = 'var(--primary-text-color)';
      option.style.transform = 'translateY(0)';
      option.style.boxShadow = 'none';
    };

    option.onclick = () => {
      this._log('Folder option clicked:', title);
      clickHandler();
      return false;
    };

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = `font-size: 24px; flex-shrink: 0;`;
    iconSpan.textContent = icon;

    const textContainer = document.createElement('div');
    textContainer.style.flex = '1';

    const titleSpan = document.createElement('div');
    titleSpan.style.cssText = `
      font-weight: 600;
      font-size: 16px;
      color: var(--primary-text-color);
      margin-bottom: 4px;
    `;
    titleSpan.textContent = title;

    const descSpan = document.createElement('div');
    descSpan.style.cssText = `
      font-size: 13px;
      color: var(--secondary-text-color);
      line-height: 1.3;
    `;
    descSpan.textContent = description;

    textContainer.appendChild(titleSpan);
    textContainer.appendChild(descSpan);
    option.appendChild(iconSpan);
    option.appendChild(textContainer);

    return option;
  }

  _handleFolderModeSelected(folderPath, mode, dialog) {
    this._log('Folder mode selected:', mode, 'for path:', folderPath);
    
    const mediaSourceType = this._config.media_source_type || 'simple_folder';
    
    // Validate: folder selection only allowed in folder modes
    if (mediaSourceType === 'single_media') {
      alert('⚠️ Folder selection not allowed in Single Media mode. Please select a file instead.');
      return;
    }
    
    this._config = { 
      ...this._config, 
      media_path: folderPath,
      folder_mode: mode,
      is_folder: true,
      // Set random_mode if user selected random
      random_mode: mode === 'random'
    };
    
    this._fireConfigChanged();
    
    if (dialog && dialog.parentNode) {
      this._log('Closing dialog after folder mode selection');
      document.body.removeChild(dialog);
    }
  }

  _handleMediaPicked(mediaContentId) {
    this._log('Media picked:', mediaContentId);
    
    const mediaSourceType = this._config.media_source_type || 'simple_folder';
    
    // Validate: file selection behavior depends on mode
    if (mediaSourceType === 'single_media') {
      // Single media mode: only individual files allowed
      this._config = { 
        ...this._config, 
        media_path: mediaContentId,
        is_folder: false,
        folder_mode: undefined,
        random_mode: undefined
      };
    } else {
      // Folder modes: allow file selection but warn user
      const confirmFile = confirm(
        '⚠️ You selected a file, but you\'re in folder mode.\n\n' +
        'Do you want to:\n' +
        'OK = Use the parent folder instead\n' +
        'Cancel = Keep the file selection (will switch to Single Media mode)'
      );
      
      if (confirmFile) {
        // Extract parent folder from file path
        const pathParts = mediaContentId.split('/');
        pathParts.pop(); // Remove filename
        const folderPath = pathParts.join('/');
        
        this._config = {
          ...this._config,
          media_path: folderPath,
          is_folder: true,
          folder_mode: 'latest'
        };
      } else {
        // Switch to single_media mode
        this._config = {
          ...this._config,
          media_source_type: 'single_media',
          media_path: mediaContentId,
          is_folder: false,
          folder_mode: undefined,
          random_mode: undefined
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

    const mediaSourceType = this._config.media_source_type || 'simple_folder';
    const useMediaIndex = this._config.use_media_index || false;

    return html`
      <div class="card-config">
        
        <!-- Mode Selection Section -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px 0; font-size: 18px;">📋 Media Source Mode</h3>
          <p style="margin: 0 0 12px 0; font-size: 13px; opacity: 0.9;">Choose how to display your media</p>
          
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
              <input
                type="radio"
                name="media_source_type"
                value="single_media"
                .checked=${mediaSourceType === 'single_media'}
                @change=${this._handleModeChange}
                style="margin-right: 8px;"
              />
              <div>
                <strong>Single Media</strong>
                <div style="font-size: 12px; opacity: 0.8;">Display one image/video at a time</div>
              </div>
            </label>
            
            <label style="display: flex; align-items: center; cursor: pointer; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
              <input
                type="radio"
                name="media_source_type"
                value="simple_folder"
                .checked=${mediaSourceType === 'simple_folder'}
                @change=${this._handleModeChange}
                style="margin-right: 8px;"
              />
              <div>
                <strong>Simple Folder</strong>
                <div style="font-size: 12px; opacity: 0.8;">Basic folder scanning with optional random mode</div>
              </div>
            </label>
            
            <label style="display: flex; align-items: center; cursor: pointer; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
              <input
                type="radio"
                name="media_source_type"
                value="subfolder_queue"
                .checked=${mediaSourceType === 'subfolder_queue'}
                @change=${this._handleModeChange}
                style="margin-right: 8px;"
              />
              <div>
                <strong>Subfolder Queue</strong>
                <div style="font-size: 12px; opacity: 0.8;">Advanced folder navigation with subfolder management</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Media Index Enhancement Section -->
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #e0e0e0;">
          <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: ${useMediaIndex ? '12px' : '0'};">
            <input
              type="checkbox"
              .checked=${useMediaIndex}
              @change=${this._handleMediaIndexToggle}
              style="margin-right: 8px;"
            />
            <strong>🚀 Use Media Index Enhancement</strong>
          </label>
          <p style="margin: 4px 0 ${useMediaIndex ? '12px' : '0'} 28px; font-size: 13px; color: #666;">
            Provides rich metadata, faster queries, and caching
          </p>
          
          ${useMediaIndex ? html`
            <div style="margin-left: 28px;">
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">Media Index Entity:</label>
              <select
                .value=${this._config.media_index?.entity_id || ''}
                @change=${this._handleMediaIndexEntityChange}
                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
              >
                <option value="">Select media_index sensor...</option>
                ${this._getMediaIndexEntities().map(entity => html`
                  <option value="${entity}">${entity}</option>
                `)}
              </select>
            </div>
          ` : ''}
        </div>

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
            <div class="help-text">How images should be scaled</div>
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

        <!-- Auto Refresh: Single Media Mode Only -->
        ${mediaSourceType === 'single_media' ? html`
          <div class="config-row">
            <label>Auto Advance</label>
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
              <div class="help-text">Automatically advance to next media every N seconds (0 = disabled)</div>
            </div>
          </div>
        ` : ''}

        <!-- Random Mode: Folder Modes Only -->
        ${mediaSourceType !== 'single_media' ? html`
          <div class="config-row">
            <label>Random Mode</label>
            <div>
              <input
                type="checkbox"
                .checked=${this._config.random_mode || false}
                @change=${this._randomModeChanged}
              />
              <div class="help-text">Show media files in random order</div>
            </div>
          </div>
        ` : ''}

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
        </div>

        ${this._config.is_folder ? html`
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
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">📋 Metadata Display</div>
          
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

        ${this._config.is_folder && this._config.folder_mode === 'random' ? html`
          <div class="section">
            <div class="section-title">🔌 Media Index Integration</div>
            
            <div class="config-row">
              <label>Enable Media Index</label>
              <div>
                <input
                  type="checkbox"
                  .checked=${this._config.media_index?.enabled || false}
                  @change=${this._mediaIndexEnabledChanged}
                />
                <div class="help-text">Use media_index integration for EXIF metadata and smart random selection</div>
              </div>
            </div>
            
            ${this._config.media_index?.enabled ? html`
              <div class="config-row">
                <label>Media Index Entity</label>
                <div>
                  <select @change=${this._mediaIndexEntityChanged} .value=${this._config.media_index?.entity_id || ''}>
                    <option value="">Select Media Index Entity...</option>
                    ${this._renderMediaIndexEntityOptions()}
                  </select>
                  <div class="help-text">Select your media_index sensor entity</div>
                </div>
              </div>
            ` : ''}
          </div>

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

          <!-- Subfolder Queue Section: Only for subfolder_queue mode -->
          ${mediaSourceType === 'subfolder_queue' ? html`
            <div class="section">
              <div class="section-title">🚀 Subfolder Queue Settings</div>
              
              <div class="config-row">
                <label>Enable Subfolder Queue</label>
                <div>
                  <input
                    type="checkbox"
                    .checked=${this._config.subfolder_queue?.enabled || false}
                    @change=${this._subfolderQueueEnabledChanged}
                  />
                  <div class="help-text">Use background queue for faster multi-folder random selection</div>
                </div>
              </div>
              
              ${this._config.subfolder_queue?.enabled ? html`
                <div class="config-row">
                  <label>Scan Depth</label>
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      .value=${this._config.subfolder_queue?.scan_depth ?? ''}
                      placeholder="unlimited"
                      @input=${this._subfolderScanDepthChanged}
                    />
                    <div class="help-text">How many folder levels to scan (empty/0 = unlimited, 1-10 = limit depth)</div>
                  </div>
                </div>
              ` : ''}
            </div>
          ` : ''}
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

        <div style="margin-top: 16px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
          <h4 style="margin-top: 0; color: white;">🎉 V4 Editor COMPLETE!</h4>
          <ul style="margin: 8px 0; padding-left: 20px; font-size: 13px; color: rgba(255,255,255,0.95);">
            <li>✅ Basic settings (title, media type, scaling)</li>
            <li>✅ Media path with validation</li>
            <li>✅ Auto refresh controls</li>
            <li>✅ Video options (autoplay, loop, muted, duration)</li>
            <li>✅ Image options (zoom)</li>
            <li>✅ Navigation options (zones, indicators, keyboard)</li>
            <li>✅ Metadata display (folder, filename, date, location)</li>
            <li>✅ Media Index integration</li>
            <li>✅ Action Buttons (favorite, delete, edit)</li>
            <li>✅ Subfolder Queue settings</li>
            <li>✅ Interactions (tap, hold, double-tap)</li>
            <li>✅ Kiosk mode</li>
            <li>✅ <strong>Full working media browser with folder navigation!</strong></li>
          </ul>
          <p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 13px;">
            <strong>Next step:</strong> Adapt for v5 Mode+Backend architecture
          </p>
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
