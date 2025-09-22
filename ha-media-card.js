/**
 * Home Assistant Media Card
 * A custom card for displaying images and videos with GUI media browser
 * Version: 1.0.31
 */

// Import Lit from CDN for standalone usage
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

class MediaCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    _mediaUrl: { state: true },
    _mediaType: { state: true },
    _lastModified: { state: true },
    _refreshInterval: { state: true },
    _folderContents: { state: true },
    _currentMediaIndex: { state: true },
    _lastRefreshTime: { state: true }
  };

  constructor() {
    super();
    this._mediaUrl = '';
    this._mediaType = 'image';
    this._lastModified = null;
    this._refreshInterval = null;
    this._mediaLoadedLogged = false;
    this._folderContents = null;
    this._currentMediaIndex = 0;
    this._lastRefreshTime = 0;
  }

  static styles = css`
    :host {
      display: block;
    }
    
    .card {
      background: var(--card-background-color);
      border-radius: var(--ha-card-border-radius);
      box-shadow: var(--ha-card-box-shadow);
      padding: 16px;
      overflow: hidden;
    }

    .card.no-title {
      padding: 0;
    }
    
    .media-container {
      position: relative;
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      margin-bottom: 16px;
    }

    .media-container.no-title {
      margin-bottom: 0;
      border-radius: var(--ha-card-border-radius);
    }
    
    img, video {
      width: 100%;
      height: auto;
      display: block;
    }
    
    video {
      max-height: 400px;
      object-fit: contain;
    }
    
    .title {
      font-size: 1.2em;
      font-weight: 500;
      margin-bottom: 12px;
      color: var(--primary-text-color);
    }
    
    .editor-button {
      padding: 8px 16px;
      background: var(--primary-color);
      color: var(--text-primary-color);
      border: none;
      border-radius: var(--ha-card-border-radius);
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      transition: background 0.2s;
    }
    
    .editor-button:hover {
      background: var(--primary-color-dark);
    }
    
    .placeholder {
      padding: 60px 20px;
      text-align: center;
      color: var(--secondary-text-color);
      background: var(--secondary-background-color);
      border-radius: 8px;
      border: 2px dashed var(--divider-color);
    }
    
    .video-controls {
      margin-top: 8px;
      font-size: 0.85em;
      color: var(--secondary-text-color);
    }

    .refresh-button {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      cursor: pointer;
      font-size: 16px;
      transition: background 0.2s;
      z-index: 10;
    }

    .refresh-button:hover {
      background: rgba(0, 0, 0, 0.9);
    }

    /* Navigation Zones */
    .navigation-zones {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      pointer-events: none;
      z-index: 10;
    }

    .nav-zone {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      pointer-events: auto;
      user-select: none;
    }

    .nav-zone-left {
      width: 25%;
      cursor: w-resize;
    }

    .nav-zone-center {
      width: 50%;
      cursor: inherit;
    }

    .nav-zone-right {
      width: 25%;
      cursor: e-resize;
    }

    .nav-zone:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .nav-zone-left:hover::after {
      content: '◀';
      color: white;
      font-size: 2em;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
      opacity: 0.8;
    }

    .nav-zone-right:hover::after {
      content: '▶';
      color: white;
      font-size: 2em;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
      opacity: 0.8;
    }

    /* Hide navigation zones when not in folder mode */
    :host(:not([data-has-folder-navigation])) .navigation-zones {
      display: none;
    }

    /* Position indicator */
    .position-indicator {
      position: absolute;
      bottom: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 500;
      pointer-events: none;
      z-index: 15;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    /* Dots indicator */
    .dots-indicator {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      pointer-events: none;
      z-index: 15;
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

    /* Hide indicators when not in folder mode */
    :host(:not([data-has-folder-navigation])) .position-indicator,
    :host(:not([data-has-folder-navigation])) .dots-indicator {
      display: none;
    }
  `;

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    
    const oldConfig = this.config;
    const wasFolder = oldConfig?.is_folder && oldConfig?.folder_mode;
    const isFolder = config.is_folder && config.folder_mode;
    
    console.log('🔧 setConfig called - was folder:', wasFolder, 'is folder:', isFolder);
    
    this.config = config;
    
    // Only reset URL if switching between folder/file modes or if it's a new config
    if (!oldConfig || (wasFolder !== isFolder)) {
      console.log('🔧 Resetting media URL due to mode change');
      this._mediaUrl = '';
      this._folderContents = null; // Reset folder contents when mode changes
    }
    
    this._mediaType = config.media_type || 'all';
    this._mediaLoadedLogged = false; // Reset logging flag for new config
    
    // Set up auto-refresh if config changed or if folder mode is enabled
    if (!oldConfig || 
        oldConfig.auto_refresh_seconds !== config.auto_refresh_seconds ||
        (isFolder && !wasFolder) ||
        (isFolder && oldConfig?.folder_mode !== config.folder_mode)) {
      this._setupAutoRefresh();
    }
    
    // Initialize folder mode if needed
    if (isFolder && this.hass) {
      console.log('🔧 Config set with folder mode - triggering initialization');
      setTimeout(() => this._handleFolderMode(), 50);
    }
  }

  _setupAutoRefresh() {
    // Clear any existing interval
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }

    // Set up auto-refresh if enabled in config
    const refreshSeconds = this.config?.auto_refresh_seconds;
    if (refreshSeconds && refreshSeconds > 0) {
      console.log(`Setting up auto-refresh every ${refreshSeconds} seconds`);
      this._refreshInterval = setInterval(() => {
        console.log('Auto-refresh timer triggered');
        this._checkForMediaUpdates();
      }, refreshSeconds * 1000);
    } else {
      console.log('Auto-refresh disabled or not configured');
    }
  }

  async _handleFolderMode() {
    console.log('Handling folder mode:', this.config.folder_mode, 'for path:', this.config.media_path);
    
    try {
      // Scan folder contents
      await this._scanFolderContents();
      
      if (!this._folderContents || this._folderContents.length === 0) {
        console.warn('No media files found in folder:', this.config.media_path);
        this._mediaUrl = '';
        this._currentMediaIndex = 0;
        return;
      }

      // Select media based on mode
      let selectedFile;
      let selectedIndex = 0;
      
      if (this.config.folder_mode === 'latest') {
        selectedFile = this._getLatestFile();
        // Find index of latest file
        selectedIndex = this._folderContents.findIndex(item => item === selectedFile);
      } else if (this.config.folder_mode === 'random') {
        const randomResult = this._getRandomFileWithIndex();
        selectedFile = randomResult.file;
        selectedIndex = randomResult.index;
      }

      if (selectedFile && selectedIndex >= 0) {
        const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
        if (resolvedUrl !== this._mediaUrl) {
          this._mediaUrl = resolvedUrl;
          this._currentMediaIndex = selectedIndex;
          this._detectMediaType(selectedFile.media_content_id);
          this._lastRefreshTime = Date.now(); // Set initial refresh time
          console.log(`📂 Selected media at index ${selectedIndex}:`, selectedFile.title);
          this.requestUpdate();
        }
      }
    } catch (error) {
      console.error('Error handling folder mode:', error);
    }
  }

  async _handleFolderModeRefresh() {
    const now = Date.now();
    const configuredInterval = (this.config.auto_refresh_seconds || 30) * 1000;
    const timeSinceLastRefresh = now - this._lastRefreshTime;
    
    console.log('Refreshing folder mode:', this.config.folder_mode);
    console.log('Time since last refresh:', timeSinceLastRefresh, 'ms, configured interval:', configuredInterval, 'ms');
    
    // Check if enough time has passed since last refresh (prevent rapid-fire refreshing)
    if (this._lastRefreshTime > 0 && timeSinceLastRefresh < configuredInterval * 0.8) { // Use 80% to be more conservative
      console.log('SKIPPING refresh - not enough time passed. Need to wait:', (configuredInterval * 0.8 - timeSinceLastRefresh), 'ms more');
      return;
    }
    
    try {
      // Rescan folder contents
      await this._scanFolderContents();
      
      if (!this._folderContents || this._folderContents.length === 0) {
        console.warn('No media files found during refresh');
        return;
      }

      let selectedFile;
      let shouldUpdate = false;
      
      if (this.config.folder_mode === 'latest') {
        // Check if there's a newer file
        selectedFile = this._getLatestFile();
        const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
        // Only update if we have a different file
        shouldUpdate = resolvedUrl && resolvedUrl !== this._mediaUrl;
        
        if (shouldUpdate) {
          console.log('Found newer file:', selectedFile.title || selectedFile.media_content_id);
        } else {
          console.log('No newer files found');
        }
      } else if (this.config.folder_mode === 'random') {
        // Get a different random file (avoid showing the same file repeatedly)
        const randomResult = this._getRandomFileWithIndex(true); // Pass true to avoid current file
        selectedFile = randomResult.file;
        shouldUpdate = selectedFile != null;
        
        if (shouldUpdate) {
          this._currentMediaIndex = randomResult.index;
          console.log('Selected new random file:', selectedFile.title || selectedFile.media_content_id);
        } else {
          console.log('No different random file available');
        }
      }

      if (shouldUpdate && selectedFile) {
        const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
        if (resolvedUrl) {
          console.log('UPDATING media URL and setting refresh time');
          this._mediaUrl = resolvedUrl;
          this._detectMediaType(selectedFile.media_content_id);
          this._lastRefreshTime = now;
          this._forceMediaReload();
        }
      } else {
        console.log('No update needed, but updating refresh time to prevent rapid retries');
        this._lastRefreshTime = now; // Update time even if no change to prevent rapid retries
      }
    } catch (error) {
      console.error('Error refreshing folder mode:', error);
    }
  }

  async _scanFolderContents() {
    if (!this.hass) return;

    console.log('Scanning folder contents for:', this.config.media_path);
    
    try {
      const mediaContent = await this.hass.callWS({
        type: "media_source/browse_media",
        media_content_id: this.config.media_path
      });

      if (mediaContent && mediaContent.children) {
        // Filter for media files only, respecting the configured media type
        this._folderContents = mediaContent.children
          .filter(item => {
            if (item.can_expand) return false; // Skip folders
            
            const fileName = item.title || item.media_content_id;
            const isMediaFile = this._isMediaFile(fileName);
            if (!isMediaFile) return false;
            
            // Filter by configured media type if specified
            if (this.config.media_type && this.config.media_type !== 'all') {
              const fileType = this._detectFileType(fileName);
              return fileType === this.config.media_type;
            }
            
            return true;
          })
          .map(item => ({
            ...item,
            // Try to extract timestamp from filename or use current time as fallback
            estimated_mtime: this._extractTimestampFromFilename(item.title || item.media_content_id) || Date.now()
          }))
          .sort((a, b) => b.estimated_mtime - a.estimated_mtime); // Sort by newest first

        console.log('Found', this._folderContents.length, 'media files in folder (filtered by type:', this.config.media_type, ')');
      } else {
        this._folderContents = [];
      }
    } catch (error) {
      console.error('Error scanning folder contents:', error);
      this._folderContents = [];
    }
  }

  _extractTimestampFromFilename(filename) {
    // Try to extract timestamp from common filename patterns
    // Format: YYYY-MM-DD, YYYYMMDD, timestamp, etc.
    const patterns = [
      /(\d{4}-\d{2}-\d{2})/,     // YYYY-MM-DD
      /(\d{8})/,                  // YYYYMMDD
      /(\d{13})/,                 // 13-digit timestamp
      /(\d{10})/                  // 10-digit timestamp
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        const value = match[1];
        let timestamp;
        
        if (value.length === 13) {
          // Milliseconds timestamp
          timestamp = parseInt(value);
        } else if (value.length === 10) {
          // Seconds timestamp
          timestamp = parseInt(value) * 1000;
        } else if (value.length === 8) {
          // YYYYMMDD format
          const year = value.substring(0, 4);
          const month = value.substring(4, 6);
          const day = value.substring(6, 8);
          timestamp = new Date(`${year}-${month}-${day}`).getTime();
        } else if (value.includes('-')) {
          // YYYY-MM-DD format
          timestamp = new Date(value).getTime();
        }
        
        if (timestamp && !isNaN(timestamp)) {
          return timestamp;
        }
      }
    }
    
    return null;
  }

  _getLatestFile() {
    if (!this._folderContents || this._folderContents.length === 0) return null;
    
    // Already sorted by newest first in _scanFolderContents
    return this._folderContents[0];
  }

  _getRandomFile(avoidCurrent = false) {
    if (!this._folderContents || this._folderContents.length === 0) return null;
    
    // If we only have one file, return it
    if (this._folderContents.length === 1) {
      this._currentMediaIndex = 0;
      return this._folderContents[0];
    }
    
    let randomIndex;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop
    
    do {
      randomIndex = Math.floor(Math.random() * this._folderContents.length);
      attempts++;
    } while (
      avoidCurrent && 
      randomIndex === this._currentMediaIndex && 
      attempts < maxAttempts
    );
    
    this._currentMediaIndex = randomIndex;
    return this._folderContents[randomIndex];
  }

  _getRandomFileWithIndex(avoidCurrent = false) {
    if (!this._folderContents || this._folderContents.length === 0) {
      return { file: null, index: 0 };
    }
    
    // If we only have one file, return it
    if (this._folderContents.length === 1) {
      return { file: this._folderContents[0], index: 0 };
    }
    
    let randomIndex;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop
    
    do {
      randomIndex = Math.floor(Math.random() * this._folderContents.length);
      attempts++;
    } while (
      avoidCurrent && 
      randomIndex === this._currentMediaIndex && 
      attempts < maxAttempts
    );
    
    return { file: this._folderContents[randomIndex], index: randomIndex };
  }

  _detectMediaType(filePath) {
    const fileType = this._detectFileType(filePath);
    if (fileType) {
      this._mediaType = fileType;
    }
  }

  _isMediaFile(filePath) {
    // Extract filename from the full path and get extension  
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    const isMedia = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
    if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
      console.log('🔥 _isMediaFile check:', filePath, 'fileName:', fileName, 'extension:', extension, 'isMedia:', isMedia);
    }
    return isMedia;
  }

  _detectFileType(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    return null;
  }

  async _checkForMediaUpdates() {
    if (!this.config?.media_path) {
      console.log('No media path configured for auto-refresh');
      return;
    }
    
    console.log('Checking for media updates...', this.config.media_path);
    
    // Handle folder mode updates
    if (this.config.is_folder && this.config.folder_mode) {
      await this._handleFolderModeRefresh();
      return;
    }
    
    try {
      // For media-source URLs, always get a fresh resolved URL
      if (this.config.media_path.startsWith('media-source://')) {
        console.log('Media-source URL detected, getting fresh resolved URL');
        const freshUrl = await this._resolveMediaPath(this.config.media_path);
        if (freshUrl && freshUrl !== this._mediaUrl) {
          console.log('Got fresh media URL:', freshUrl);
          this._mediaUrl = freshUrl;
          this._forceMediaReload();
        } else if (freshUrl) {
          console.log('URL unchanged, forcing reload anyway for media-source');
          this._forceMediaReload();
        }
        return;
      }

      // For direct URLs (/local/, /media/, etc.), check Last-Modified header
      const checkUrl = this.config.media_path.startsWith('/') ? this.config.media_path : this._mediaUrl;
      if (checkUrl) {
        console.log('Checking Last-Modified for:', checkUrl);
        const baseCheckUrl = checkUrl.split('?')[0]; // Remove any existing timestamp
        
        const response = await fetch(baseCheckUrl, { 
          method: 'HEAD',
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (response.ok) {
          const lastModified = response.headers.get('Last-Modified');
          console.log('Last-Modified check - Current:', lastModified, 'Stored:', this._lastModified);
          
          if (!this._lastModified) {
            // First time checking, store the timestamp
            this._lastModified = lastModified;
            console.log('Stored initial Last-Modified timestamp');
          } else if (lastModified && lastModified !== this._lastModified) {
            console.log('Media file modified, reloading!');
            this._lastModified = lastModified;
            this._forceMediaReload();
          } else {
            console.log('No changes detected');
          }
        } else {
          console.log('HEAD request failed:', response.status, response.statusText);
        }
      }
    } catch (error) {
      console.error('Error checking for media updates:', error);
    }
  }

  _forceMediaReload() {
    if (!this._mediaUrl) {
      console.log('No media URL to reload');
      return;
    }
    
    console.log('Force reloading media:', this._mediaUrl);
    
    // For media-source URLs, we should have already gotten a fresh URL
    // For direct URLs, we can use cache-busting
    const useUrl = this.config?.media_path?.startsWith('media-source://') 
      ? this._mediaUrl  // Use the fresh resolved URL as-is
      : `${this._mediaUrl.split('?')[0]}?_refresh=${Date.now()}`; // Add cache-busting for direct URLs
    
    console.log('Using URL for reload:', useUrl);
    
    // For images, update src directly
    if (this._mediaType === 'image') {
      const img = this.shadowRoot?.querySelector('img');
      if (img) {
        console.log('Refreshing image element');
        img.src = useUrl;
        // Don't update this._mediaUrl for media-source URLs since they're already fresh
        if (!this.config?.media_path?.startsWith('media-source://')) {
          this._mediaUrl = useUrl;
        }
      }
    } else if (this._mediaType === 'video') {
      const video = this.shadowRoot?.querySelector('video');
      if (video) {
        console.log('Refreshing video element');
        
        // Store current playback state
        const currentTime = video.currentTime;
        const wasPaused = video.paused;
        
        // Reload video with fresh URL
        video.src = useUrl;
        video.load();
        
        // Don't update this._mediaUrl for media-source URLs since they're already fresh
        if (!this.config?.media_path?.startsWith('media-source://')) {
          this._mediaUrl = useUrl;
        }
        
        // Restore playback state if needed
        if (!wasPaused && this.config.video_autoplay) {
          video.addEventListener('loadedmetadata', () => {
            video.currentTime = currentTime;
            // Ensure muted state is preserved during reload
            if (this.config.video_muted) {
              video.muted = true;
            }
            video.play().catch(() => {}); // Ignore autoplay errors
          }, { once: true });
        } else {
          // Just ensure muted state is preserved even if not autoplaying
          video.addEventListener('loadedmetadata', () => {
            if (this.config.video_muted) {
              video.muted = true;
            }
          }, { once: true });
        }
      }
    }
  }

  _fetchMediaItem(hass, mediaItemPath) {
    return hass.callWS({
      type: "media_source/resolve_media",
      media_content_id: mediaItemPath,
      expires: (60 * 60 * 3)  // 3 hours
    });
  }

  async _resolveMediaPath(mediaPath) {
    if (!mediaPath || !this.hass) return '';
    
    // If it's already a resolved URL, return as-is
    if (mediaPath.startsWith('/') || mediaPath.startsWith('http')) {
      return mediaPath;
    }
    
    // Use Home Assistant's media source resolution for media-source URLs
    if (mediaPath.startsWith('media-source://')) {
      try {
        const resolved = await this._fetchMediaItem(this.hass, mediaPath);
        return resolved.url;
      } catch (error) {
        console.error('Failed to resolve media path:', mediaPath, error);
        return '';
      }
    }
    
    // Return as-is for other formats
    return mediaPath;
  }

  render() {
    if (!this.config) return html``;
    
    // Set navigation attribute based on folder mode and content
    const hasNavigation = this.config.is_folder && 
                         this._folderContents && 
                         this._folderContents.length > 1;
    
    if (hasNavigation) {
      this.setAttribute('data-has-folder-navigation', '');
    } else {
      this.removeAttribute('data-has-folder-navigation');
    }
    
    const hasTitle = this.config.title && this.config.title.trim();
    
    return html`
      <div class="card ${!hasTitle ? 'no-title' : ''}">
        ${hasTitle ? html`<div class="title">${this.config.title}</div>` : ''}
        
        <div class="media-container ${!hasTitle ? 'no-title' : ''}"
             @click=${this._handleTap}
             @dblclick=${this._handleDoubleTap}
             @pointerdown=${this._handlePointerDown}
             @pointerup=${this._handlePointerUp}
             @pointercancel=${this._handlePointerCancel}
             @contextmenu=${this._handleContextMenu}
             style="cursor: ${this._hasAnyAction() ? 'pointer' : 'default'};">
          ${this._renderMedia()}
          ${this._renderNavigationZones()}
          ${this._renderNavigationIndicators()}
          ${this.config.show_refresh_button ? this._renderRefreshButton() : ''}
        </div>
      </div>
    `;
  }

  _renderRefreshButton() {
    return html`
      <button 
        class="refresh-button" 
        @click=${this._manualRefresh}
        title="Refresh media"
      >
        🔄
      </button>
    `;
  }

  async _manualRefresh() {
    console.log('Manual refresh triggered');
    
    // For media-source URLs, get a fresh resolved URL first
    if (this.config?.media_path?.startsWith('media-source://')) {
      console.log('Getting fresh media-source URL for manual refresh');
      const freshUrl = await this._resolveMediaPath(this.config.media_path);
      if (freshUrl) {
        this._mediaUrl = freshUrl;
      }
    }
    
    // Then force reload the media
    this._forceMediaReload();
  }

  async _resolveAndUpdate() {
    console.log('Re-resolving media path:', this.config.media_path);
    try {
      let freshUrl = '';
      
      // Handle different path types
      if (this.config.media_path.startsWith('media-source://')) {
        freshUrl = await this._resolveMediaPath(this.config.media_path);
      } else if (this.config.media_path.startsWith('/')) {
        // For direct paths, use them as-is
        freshUrl = this.config.media_path;
      }
      
      if (freshUrl) {
        console.log('Got fresh URL:', freshUrl);
        this._mediaUrl = freshUrl;
        this.requestUpdate();
        
        // Force reload the media element
        setTimeout(() => {
          this._forceMediaReload();
        }, 100);
      }
    } catch (error) {
      console.error('Failed to refresh media:', error);
      // Fallback to simple reload
      this._forceMediaReload();
    }
  }

  _renderMedia() {
    // Handle folder mode that hasn't been initialized yet
    if (!this._mediaUrl && this.config?.is_folder && this.config?.folder_mode && this.hass) {
      console.log('🔧 No media URL but have folder config - triggering initialization');
      // Trigger folder mode initialization asynchronously
      setTimeout(() => this._handleFolderMode(), 10);
      
      return html`
        <div class="placeholder">
          <div style="font-size: 64px; margin-bottom: 24px; opacity: 0.3;">📁</div>
          <div style="font-size: 1.2em; font-weight: 500; margin-bottom: 8px;">Loading Folder...</div>
          <div style="font-size: 0.9em; opacity: 0.8; line-height: 1.4;">
            Scanning for media files in folder
          </div>
        </div>
      `;
    }
    
    if (!this._mediaUrl) {
      return html`
        <div class="placeholder">
          <div style="font-size: 64px; margin-bottom: 24px; opacity: 0.3;">🎬</div>
          <div style="font-size: 1.2em; font-weight: 500; margin-bottom: 8px;">No Media Selected</div>
          <div style="font-size: 0.9em; opacity: 0.8; line-height: 1.4;">
            Click the configure button below to select an image or video
          </div>
        </div>
      `;
    }

    if (this._mediaType === 'video') {
      return html`
        <video 
          controls
          preload="metadata"
          playsinline
          crossorigin="anonymous"
          ?loop=${this.config.video_loop || false}
          ?autoplay=${this.config.video_autoplay || false}
          ?muted=${this.config.video_muted || false}
          @loadstart=${this._onVideoLoadStart}
          @loadeddata=${this._onMediaLoaded}
          @error=${this._onMediaError}
          @canplay=${this._onVideoCanPlay}
          @loadedmetadata=${this._onVideoLoadedMetadata}
          style="width: 100%; height: auto; display: block; background: #000; max-width: 100%;"
        >
          <source src="${this._mediaUrl}" type="video/mp4">
          <source src="${this._mediaUrl}" type="video/webm">
          <source src="${this._mediaUrl}" type="video/ogg">
          <p>Your browser does not support the video tag. <a href="${this._mediaUrl}" target="_blank">Download the video</a> instead.</p>
        </video>
        ${this._renderVideoInfo()}
      `;
    }
    
    return html`
      <img 
        src="${this._mediaUrl}" 
        alt="${this.config.title || 'Media'}"
        @error=${this._onMediaError}
        @load=${this._onMediaLoaded}
        style="width: 100%; height: auto; display: block;"
      />
    `;
  }

  _renderNavigationZones() {
    // Only show navigation zones if in folder mode and have multiple items
    if (!this.config.is_folder || !this._folderContents || this._folderContents.length <= 1) {
      return html``;
    }

    return html`
      <div class="navigation-zones">
        <div class="nav-zone nav-zone-left"
             @click=${this._handlePrevClick}
             @keydown=${this._handleKeyDown}
             tabindex="0"
             title="Previous image">
        </div>
        <div class="nav-zone nav-zone-center"></div>
        <div class="nav-zone nav-zone-right"  
             @click=${this._handleNextClick}
             @keydown=${this._handleKeyDown}
             tabindex="0"
             title="Next image">
        </div>
      </div>
    `;
  }

  _renderNavigationIndicators() {
    // Only show indicators if in folder mode and have multiple items
    if (!this.config.is_folder || !this._folderContents || this._folderContents.length <= 1) {
      return html``;
    }

    const currentIndex = this._getCurrentMediaIndex();
    const totalCount = this._folderContents.length;

    // Show position indicator (always)
    const positionIndicator = html`
      <div class="position-indicator">
        ${currentIndex + 1} of ${totalCount}
      </div>
    `;

    // Show dots indicator only if not too many items (limit to 15)
    let dotsIndicator = html``;
    if (totalCount <= 15) {
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

  async _validateMedia() {
    if (!this._mediaUrl) return false;
    
    try {
      const response = await fetch(this._mediaUrl, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.error('Media validation failed:', error);
      return false;
    }
  }

  async updated(changedProps) {
    super.updated(changedProps);
    
    // Handle folder vs file mode
    if ((changedProps.has('config') || changedProps.has('hass')) && this.config?.media_path) {
      if (this.config.is_folder && this.config.folder_mode) {
        // This is a folder configuration - scan for media files
        // Initialize if we don't have folder contents, config changed, or no media URL set
        if (!this._folderContents || changedProps.has('config') || !this._mediaUrl) {
          console.log('Initializing folder mode - contents:', !!this._folderContents, 'config changed:', changedProps.has('config'), 'has media URL:', !!this._mediaUrl);
          await this._handleFolderMode();
        } else {
          console.log('Skipping folder mode refresh - already initialized and hass updated');
        }
      } else {
        // This is a regular file configuration
        const resolvedUrl = await this._resolveMediaPath(this.config.media_path);
        if (resolvedUrl && resolvedUrl !== this._mediaUrl) {
          this._mediaUrl = resolvedUrl;
          this.requestUpdate();
          
          // Get initial last-modified timestamp
          this._getInitialTimestamp();
        }
      }
    }
    
    // Validate media when URL changes
    if (changedProps.has('_mediaUrl') && this._mediaUrl) {
      const isValid = await this._validateMedia();
      if (!isValid) {
        console.warn('Media file may not be accessible:', this._mediaUrl);
      }
    }
  }

  async _getInitialTimestamp() {
    try {
      const checkUrl = this._mediaUrl || this.config.media_path;
      if (checkUrl) {
        const response = await fetch(checkUrl, { 
          method: 'HEAD',
          cache: 'no-cache'
        });
        
        if (response.ok) {
          this._lastModified = response.headers.get('Last-Modified');
        }
      }
    } catch (error) {
      console.log('Could not get initial timestamp:', error);
    }
  }

  _onVideoLoadStart() {
    console.log('Video started loading:', this._mediaUrl);
  }

  _onVideoCanPlay() {
    console.log('Video can start playing:', this._mediaUrl);
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
      console.log('Video muted state applied:', video.muted);
    }
  }

  _onMediaLoaded() {
    // Only log once when media initially loads, not during auto-refresh cycles
    if (!this._mediaLoadedLogged) {
      console.log('Media loaded successfully:', this._mediaUrl);
      this._mediaLoadedLogged = true;
    }
    // Clear any previous error states
    this.requestUpdate();
  }

  _onMediaError(e) {
    console.error('Media failed to load:', this._mediaUrl, e);
    const target = e.target;
    const error = target.error;
    
    let errorMessage = 'Media file not found';
    if (error) {
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
          errorMessage = 'Media source not supported';
          break;
      }
    }
    
    // Force re-render to show error state
    setTimeout(() => {
      if (this.shadowRoot) {
        const container = this.shadowRoot.querySelector('.media-container');
        if (container && container.innerHTML.includes('video') || container.innerHTML.includes('img')) {
          container.innerHTML = `
            <div class="placeholder" style="border-color: var(--error-color, #f44336); background: rgba(244, 67, 54, 0.1);">
              <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
              <div style="color: var(--error-color, #f44336); font-weight: 500;">${errorMessage}</div>
              <div style="font-size: 0.85em; margin-top: 8px; opacity: 0.7; word-break: break-all;">
                ${this._mediaUrl}
              </div>
            </div>
          `;
        }
      }
    }, 100);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up the refresh interval when component is removed
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    // Clean up hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  // Interaction handling methods
  _hasAnyAction() {
    return this.config.tap_action || this.config.hold_action || this.config.double_tap_action;
  }

  _handleTap(e) {
    if (!this.config.tap_action) return;
    
    // Prevent default if we have a tap action
    e.preventDefault();
    e.stopPropagation();
    
    // Don't trigger tap if this was part of a double-tap sequence
    if (this._doubleTapTimer) return;
    
    // Set a small delay to check for double-tap
    this._doubleTapTimer = setTimeout(() => {
      this._doubleTapTimer = null;
      this._performAction(this.config.tap_action);
    }, 250);
  }

  _handleDoubleTap(e) {
    if (!this.config.double_tap_action) return;
    
    // Clear single tap timer if double tap occurs
    if (this._doubleTapTimer) {
      clearTimeout(this._doubleTapTimer);
      this._doubleTapTimer = null;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    this._performAction(this.config.double_tap_action);
  }

  _handlePointerDown(e) {
    if (!this.config.hold_action) return;
    
    // Start hold timer (500ms like standard HA cards)
    this._holdTimer = setTimeout(() => {
      this._performAction(this.config.hold_action);
      this._holdTriggered = true;
    }, 500);
    
    this._holdTriggered = false;
  }

  _handlePointerUp(e) {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  _handlePointerCancel(e) {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  _handleContextMenu(e) {
    // Prevent context menu if we have hold action
    if (this.config.hold_action) {
      e.preventDefault();
    }
  }

  // Navigation zone event handlers
  _handlePrevClick(e) {
    e.stopPropagation();
    this._navigatePrevious().catch(err => console.error('Navigation error:', err));
  }

  _handleNextClick(e) {
    e.stopPropagation(); 
    this._navigateNext().catch(err => console.error('Navigation error:', err));
  }

  _handleKeyDown(e) {
    // Handle keyboard navigation
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._navigatePrevious().catch(err => console.error('Navigation error:', err));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._navigateNext().catch(err => console.error('Navigation error:', err));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Space or Enter on navigation zones acts like a click
      if (e.target.classList.contains('nav-zone-left')) {
        this._navigatePrevious().catch(err => console.error('Navigation error:', err));
      } else if (e.target.classList.contains('nav-zone-right')) {
        this._navigateNext().catch(err => console.error('Navigation error:', err));
      }
    }
  }

  async _navigatePrevious() {
    if (!this._folderContents || this._folderContents.length <= 1) return;
    
    const currentIndex = this._getCurrentMediaIndex();
    const newIndex = currentIndex > 0 ? currentIndex - 1 : this._folderContents.length - 1;
    
    console.log(`🔄 Navigate Previous: ${currentIndex} -> ${newIndex}`);
    await this._loadMediaAtIndex(newIndex);
  }

  async _navigateNext() {
    if (!this._folderContents || this._folderContents.length <= 1) return;
    
    const currentIndex = this._getCurrentMediaIndex();
    const newIndex = currentIndex < this._folderContents.length - 1 ? currentIndex + 1 : 0;
    
    console.log(`🔄 Navigate Next: ${currentIndex} -> ${newIndex}`);
    await this._loadMediaAtIndex(newIndex);
  }

  _getCurrentMediaIndex() {
    if (!this._folderContents || !this._mediaUrl) return 0;
    
    // First try to use the stored current index if it's valid
    if (this._currentMediaIndex >= 0 && 
        this._currentMediaIndex < this._folderContents.length) {
      // For efficiency, trust the stored index if it exists and is valid
      return this._currentMediaIndex;
    }
    
    // Fallback: Find current media in folder contents by comparing media_content_id
    // Extract the base path from the current media URL for comparison
    const currentIndex = this._folderContents.findIndex(item => {
      // Try to match using the media_content_id portion
      return this._mediaUrl.includes(item.media_content_id.split('/').pop());
    });
    
    // Update stored index if we found it
    if (currentIndex >= 0) {
      this._currentMediaIndex = currentIndex;
      return currentIndex;
    }
    
    return 0;
  }

  async _loadMediaAtIndex(index) {
    if (!this._folderContents || index < 0 || index >= this._folderContents.length) return;
    
    const item = this._folderContents[index];
    
    console.log(`📂 Loading media at index ${index}:`, item.title);
    
    try {
      const mediaUrl = await this._resolveMediaPath(item.media_content_id);
      
      // Update current media
      this._mediaUrl = mediaUrl;
      this._mediaType = this._getMediaType(item.title);
      this._currentMediaIndex = index;
      
      // Force re-render
      this.requestUpdate();
    } catch (error) {
      console.error('Error loading media at index:', index, error);
    }
  }

  async _performAction(action) {
    if (!action || !this.hass) return;
    
    console.log('Performing action:', action);
    
    try {
      switch (action.action) {
        case 'more-info':
          this._showMoreInfo(action);
          break;
        case 'toggle':
          this._performToggle(action);
          break;
        case 'perform-action':
          this._performServiceCall(action);
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
          // Do nothing
          break;
        default:
          console.warn('Unknown action type:', action.action);
      }
    } catch (error) {
      console.error('Error performing action:', error);
    }
  }

  _showMoreInfo(action) {
    const entityId = action.entity || this.config.entity;
    if (entityId) {
      const event = new CustomEvent('hass-more-info', {
        detail: { entityId },
        bubbles: true,
        composed: true
      });
      this.dispatchEvent(event);
    } else {
      console.warn('No entity specified for more-info action');
    }
  }

  _performToggle(action) {
    const entityId = action.entity || this.config.entity;
    if (entityId && this.hass.states[entityId]) {
      this.hass.callService('homeassistant', 'toggle', {
        entity_id: entityId
      });
    } else {
      console.warn('No entity specified or entity not found for toggle action');
    }
  }

  async _performServiceCall(action) {
    if (!action.perform_action) {
      console.warn('No service specified for perform-action');
      return;
    }

    // Check for confirmation if required
    if (action.confirmation && !await this._showConfirmation(action.confirmation)) {
      return;
    }

    const [domain, service] = action.perform_action.split('.');
    const serviceData = action.data || {};
    const target = action.target || {};

    this.hass.callService(domain, service, serviceData, target);
  }

  _performNavigation(action) {
    if (!action.navigation_path) {
      console.warn('No navigation path specified');
      return;
    }

    const path = action.navigation_path;
    if (action.navigation_replace) {
      history.replaceState(null, '', path);
    } else {
      history.pushState(null, '', path);
    }
    
    // Trigger navigation event
    const event = new CustomEvent('location-changed', {
      detail: { replace: action.navigation_replace },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  _performUrlOpen(action) {
    if (!action.url_path) {
      console.warn('No URL specified for url action');
      return;
    }

    window.open(action.url_path, '_blank');
  }

  _performAssist(action) {
    // Voice assistant requires internal HA modules that aren't available to custom cards
    // Show a user-friendly message instead
    console.warn('Voice Assistant action not available in custom cards');
    alert('Voice Assistant actions are not supported in custom cards. Please use the main Home Assistant interface for voice commands.');
  }

  async _showConfirmation(confirmation) {
    const text = typeof confirmation === 'object' 
      ? confirmation.text || 'Are you sure?' 
      : 'Are you sure?';
    
    return confirm(text);
  }

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this.config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  getCardSize() {
    // Return card size for Lovelace layout
    if (this._mediaType === 'video') return 4;
    return 3;
  }

  static getConfigElement() {
    return document.createElement('media-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:media-card',
      media_type: 'all',
      media_path: '',
      title: 'My Media'
    };
  }
}

// Configuration Editor Component
class MediaCardEditor extends LitElement {
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

  setConfig(config) {
    this._config = { ...config };
  }

  render() {
    if (!this._config) {
      return html``;
    }

    return html`
      <div class="card-config">
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
          </div>
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
              ${this._renderActionConfig('tap_action')}
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
              ${this._renderActionConfig('hold_action')}
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
              ${this._renderActionConfig('double_tap_action')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

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

    console.log('Opening media browser...');
    
    // Try to browse media and create our own simple dialog
    try {
      const mediaContent = await this._fetchMediaContents(this.hass, '');
      if (mediaContent && mediaContent.children && mediaContent.children.length > 0) {
        this._showCustomMediaBrowser(mediaContent);
        return;
      }
    } catch (error) {
      console.log('Could not fetch media contents, using prompt fallback:', error);
    }
    
    // Final fallback: use a simple prompt with helpful guidance
    const currentPath = this._config.media_path || '';
    
    const helpText = `Enter the path to your media file:

Format options:
• media-source://media_source/local/folder/file.mp4 (recommended)
• /local/images/photo.jpg
• /media/videos/movie.mp4

Your current path: ${currentPath}

Tip: Check your Home Assistant media folder in Settings > System > Storage`;

    const mediaPath = prompt(helpText, currentPath);
    
    if (mediaPath && mediaPath.trim()) {
      console.log('Media path entered:', mediaPath);
      this._handleMediaPicked(mediaPath.trim());
    } else {
      console.log('No media path entered');
    }
  }

  async _showMediaBrowserDialog() {
    // Skip trying to use native HA media browser since it requires internal modules
    // that aren't available to custom cards
    throw new Error('Native media browser not available for custom cards');
  }

  _showCustomMediaBrowser(mediaContent) {
    console.log('Creating custom media browser with', mediaContent.children.length, 'items');
    
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
      justify-content: flex-end !important;
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

    // Dialog close function with debugging
    const closeDialog = () => {
      console.log('Closing media browser dialog');
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
        console.log('Dialog closed successfully');
      }
    };

    // Close button handler with debugging and force event handling
    closeButton.onclick = (e) => {
      console.log('Cancel button clicked via onclick');
      closeDialog();
      return false;
    };

    // Backdrop click handler - use onclick to force event handling
    dialog.onclick = (e) => {
      console.log('Dialog backdrop clicked via onclick', e.target === dialog);
      if (e.target === dialog) {
        closeDialog();
      }
    };

    // Escape key to close
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        console.log('Escape key pressed');
        closeDialog();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    buttonContainer.appendChild(closeButton);
    dialogContent.appendChild(title);
    dialogContent.appendChild(fileList);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    
    console.log('Appending dialog to document.body');
    document.body.appendChild(dialog);
    
    // Force focus, remove inert, and log status
    requestAnimationFrame(() => {
      // Force remove inert state from all elements
      dialog.removeAttribute('inert');
      dialogContent.removeAttribute('inert');
      document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
      
      dialog.focus();
      dialog.setAttribute('tabindex', '0');
      
      console.log('Media browser dialog opened and focused');
      console.log('Dialog element:', dialog);
      console.log('Dialog inert?', dialog.hasAttribute('inert'));
      console.log('Dialog position:', dialog.getBoundingClientRect());
      console.log('Dialog z-index:', window.getComputedStyle(dialog).zIndex);
      console.log('Dialog pointer-events:', window.getComputedStyle(dialog).pointerEvents);
    });
  }

  async _addMediaFilesToBrowser(container, mediaContent, dialog, currentPath = '') {
    console.log('�🚀🚀 LATEST VERSION 1.0.28-FIXED LOADED 🚀🚀🚀');
    console.log('�🔥 NEW VERSION - Adding media files to browser:', mediaContent.children.length, 'items');
    console.log('🔥 Current path:', currentPath);
    console.log('🔥 Media content ID:', mediaContent.media_content_id);
    
    // Check if this folder contains media files (not just subfolders)
    // For performance with large folders, just check the first 50 items
    const itemsToCheck = (mediaContent.children || []).slice(0, 50);
    const hasMediaFiles = itemsToCheck.some(item => {
      const isFolder = item.can_expand;
      // Use item.title (display name) if available, fallback to media_content_id
      const fileName = item.title || item.media_content_id;
      const isMedia = !isFolder && this._isMediaFile(fileName);
      if (!isFolder && itemsToCheck.length < 10) {
        console.log('🔥 Checking file:', fileName, 'isMedia:', isMedia);
      }
      return isMedia;
    });
    
    console.log('🔥 Has media files (checked first', itemsToCheck.length, 'items):', hasMediaFiles);
    console.log('🔥 Should show folder options:', (currentPath && currentPath !== '') && hasMediaFiles);
    
    // If we're in a folder (not root) with media files, add special folder options at the top
    if ((currentPath && currentPath !== '') && hasMediaFiles) {
      console.log('Adding folder options for path:', currentPath);
      this._addFolderOptions(container, dialog, currentPath);
    } else {
      console.log('Not adding folder options - currentPath:', currentPath, 'hasMediaFiles:', hasMediaFiles);
    }
    
    // Filter items to display based on media type configuration
    const itemsToShow = (mediaContent.children || []).filter(item => {
      // Always show folders
      if (item.can_expand) return true;
      
      // For files, check media type filter
      if (this._config.media_type && this._config.media_type !== 'all') {
        const fileName = item.title || item.media_content_id;
        const fileType = this._detectFileType(fileName);
        return fileType === this._config.media_type;
      }
      
      // Show all media files if no specific filter or "all" is selected
      const fileName = item.title || item.media_content_id;
      return this._isMediaFile(fileName);
    });
    
    console.log('🔥 Showing', itemsToShow.length, 'items (filtered by media type:', this._config.media_type, ')');
    
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

      // Use onmouseenter/onmouseleave instead of addEventListener
      fileItem.onmouseenter = (e) => {
        console.log('Mouse entered item:', item.title);
        fileItem.style.background = 'var(--secondary-background-color, #f5f5f5)';
        fileItem.style.borderColor = 'var(--primary-color, #007bff)';
        fileItem.style.transform = 'translateY(-1px)';
        fileItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
      };

      fileItem.onmouseleave = (e) => {
        console.log('Mouse left item:', item.title);
        fileItem.style.background = 'var(--card-background-color, #fff)';
        fileItem.style.borderColor = 'var(--divider-color, #ddd)';
        fileItem.style.transform = 'translateY(0)';
        fileItem.style.boxShadow = 'none';
      };

      const icon = document.createElement('span');
      icon.style.cssText = `
        font-size: 24px !important;
        flex-shrink: 0 !important;
        user-select: none !important;
        pointer-events: none !important;
      `;
      
      const name = document.createElement('span');
      name.textContent = item.title || item.media_content_id;
      name.style.cssText = `
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        user-select: none !important;
        pointer-events: none !important;
        color: var(--primary-text-color, #333) !important;
      `;

      if (item.can_expand) {
        // This is a folder
        icon.textContent = '📁';
        // Use onclick instead of addEventListener
        fileItem.onclick = async (e) => {
          console.log('FOLDER CLICKED VIA ONCLICK:', item.media_content_id);
          
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
              transition: all 0.2s ease !important;
              background: var(--secondary-background-color, #f5f5f5) !important;
              margin-bottom: 8px !important;
              user-select: none !important;
              pointer-events: auto !important;
              z-index: 999999999 !important;
            `;
            
            backButton.innerHTML = '<span style="font-size: 24px; pointer-events: none;">⬅️</span><span style="font-weight: 500; pointer-events: none; color: var(--primary-text-color, #333);">Back</span>';
            
            // Use onclick for back button too
            backButton.onclick = (e) => {
              console.log('BACK BUTTON CLICKED VIA ONCLICK');
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
              backButton.style.color = 'var(--primary-text-color, #333)';
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
        // This is a media file
        const ext = item.media_content_id.split('.').pop()?.toLowerCase();
        if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(ext)) {
          icon.textContent = '🎬';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
          icon.textContent = '🖼️';
        } else {
          icon.textContent = '📄';
        }

        // Use onclick for file selection
        fileItem.onclick = (e) => {
          console.log('FILE CLICKED VIA ONCLICK:', item.media_content_id);
          
          this._handleMediaPicked(item.media_content_id);
          // Close the dialog
          if (dialog && dialog.parentNode) {
            console.log('Closing dialog after file selection');
            document.body.removeChild(dialog);
          }
          return false;
        };
      }

      fileItem.appendChild(icon);
      fileItem.appendChild(name);
      container.appendChild(fileItem);
    }
    
    console.log('Added all items to browser container');
  }

  _addFolderOptions(container, dialog, folderPath) {
    console.log('Adding folder options for:', folderPath);
    
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

    option.onclick = (e) => {
      console.log('Folder option clicked:', title);
      clickHandler();
      return false;
    };

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = `
      font-size: 24px !important;
      flex-shrink: 0 !important;
      pointer-events: none !important;
    `;
    iconSpan.textContent = icon;

    const textContainer = document.createElement('div');
    textContainer.style.cssText = `
      flex: 1 !important;
      pointer-events: none !important;
    `;

    const titleSpan = document.createElement('div');
    titleSpan.style.cssText = `
      font-weight: 600 !important;
      font-size: 16px !important;
      color: var(--primary-text-color, #333) !important;
      margin-bottom: 4px !important;
      pointer-events: none !important;
    `;
    titleSpan.textContent = title;

    const descSpan = document.createElement('div');
    descSpan.style.cssText = `
      font-size: 13px !important;
      color: var(--secondary-text-color, #666) !important;
      line-height: 1.3 !important;
      pointer-events: none !important;
    `;
    descSpan.textContent = description;

    textContainer.appendChild(titleSpan);
    textContainer.appendChild(descSpan);
    option.appendChild(iconSpan);
    option.appendChild(textContainer);

    return option;
  }

  _handleFolderModeSelected(folderPath, mode, dialog) {
    console.log('Folder mode selected:', mode, 'for path:', folderPath);
    
    // Store the folder configuration
    this._config = { 
      ...this._config, 
      media_path: folderPath,
      folder_mode: mode,
      // Auto-detect that this is now a folder-based configuration
      is_folder: true
    };
    
    this._fireConfigChanged();
    
    // Close the dialog
    if (dialog && dialog.parentNode) {
      console.log('Closing dialog after folder mode selection');
      document.body.removeChild(dialog);
    }
  }

  _handleMediaPicked(mediaContentId) {
    console.log('Media picked:', mediaContentId);
    // Store the full media-source path for configuration
    this._config = { ...this._config, media_path: mediaContentId };
    
    // Auto-detect media type from extension
    const extension = mediaContentId.split('.').pop()?.toLowerCase();
    if (['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(extension)) {
      this._config.media_type = 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      this._config.media_type = 'image';
    }
    
    this._fireConfigChanged();
    console.log('Config updated:', this._config);
  }

  _titleChanged(ev) {
    this._config = { ...this._config, title: ev.target.value };
    this._fireConfigChanged();
  }

  _mediaTypeChanged(ev) {
    this._config = { ...this._config, media_type: ev.target.value };
    this._fireConfigChanged();
  }

  _mediaPathChanged(ev) {
    this._config = { ...this._config, media_path: ev.target.value };
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

  _autoRefreshChanged(ev) {
    const seconds = parseInt(ev.target.value) || 0;
    this._config = { ...this._config, auto_refresh_seconds: seconds };
    this._fireConfigChanged();
  }

  _refreshButtonChanged(ev) {
    this._config = { ...this._config, show_refresh_button: ev.target.checked };
    this._fireConfigChanged();
  }

  _hideVideoControlsDisplayChanged(ev) {
    this._config = { ...this._config, hide_video_controls_display: ev.target.checked };
    this._fireConfigChanged();
  }

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
        
        ${action.action === 'perform-action' ? html`
          <div style="margin-bottom: 8px;">
            <label style="display: block; font-size: 12px; margin-bottom: 4px;">Service:</label>
            <input
              type="text"
              .value=${action.perform_action || ''}
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
            <input
              type="text"
              .value=${JSON.stringify(action.data || {})}
              @input=${(e) => this._updateActionData(actionType, e.target.value)}
              placeholder='{"brightness": 255}'
              style="width: 100%; font-size: 12px;"
            />
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
          <label style="display: flex; align-items: center; font-size: 12px;">
            <input
              type="checkbox"
              .checked=${action.confirmation || false}
              @change=${(e) => this._updateActionField(actionType, 'confirmation', e.target.checked)}
              style="margin-right: 4px;"
            />
            Require confirmation
          </label>
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

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  _isMediaFile(filePath) {
    // Extract filename from the full path and get extension
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    const isMedia = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
    if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
      console.log('🔥 _isMediaFile check:', filePath, 'fileName:', fileName, 'extension:', extension, 'isMedia:', isMedia);
    }
    return isMedia;
  }

  _detectFileType(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    return null;
  }
}

// Register the custom elements
customElements.define('media-card', MediaCard);
customElements.define('media-card-editor', MediaCardEditor);

// Register with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'media-card',
  name: 'Media Card',
  description: 'Display images and videos with GUI media browser and auto-refresh',
  preview: true,
  documentationURL: 'https://github.com/markaggar/ha-media-card'
});

console.info(
  '%c  MEDIA-CARD  %c  1.0.23  ',
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);
