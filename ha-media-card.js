/**
 * Home Assistant Media Card
 * A custom card for displaying images and videos with GUI media browser
 * Version: 2.0.0
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
    _lastRefreshTime: { state: true },
    _isPaused: { state: true }
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
    this._recentlyShown = null; // Smart cycling tracking for small collections
    this._pausedForNavigation = false;
    this._isPaused = false;
    this._urlCreatedTime = 0; // Track when current URL was created
    this._debugMode = true; // Enable debug logging for thumbnail development
    this._initializationInProgress = false; // Prevent multiple initializations
    this._scanInProgress = false; // Prevent multiple scans
    this._hasInitializedHass = false; // Track if we've done initial hass setup to prevent update loops
    this._componentStartTime = Date.now(); // Track when component was created for startup protection
    this._lastScanTime = 0; // Track when we last scanned folder contents to prevent rapid re-scanning
    this._errorState = null; // Track media loading errors with retry options
    this._retryAttempts = new Map(); // Track retry attempts per URL to prevent endless loops
    
    // Slideshow behavior state tracking 
    this._slideshowPosition = 0; // Current position in slideshow sequence
    this._newContentQueue = []; // Queue of new files to show with priority
    this._showingNewContent = false; // Are we currently showing priority new content?
    this._lastKnownNewest = null; // Track newest file to detect new arrivals
    this._lastKnownFolderSize = null; // Track folder size to detect new content in random mode
    this._slideshowFiles = []; // Cached list of files for slideshow (latest: newest N, random: performance subset)
  }

  connectedCallback() {
    super.connectedCallback();
    // Set initial data attributes when element is connected to DOM
    this.setAttribute('data-media-type', this._mediaType || 'image');
  }

  // Home Assistant calls this setter when hass becomes available
  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    this._log('💎 hass setter called - hasHass:', !!hass, 'hadOldHass:', !!oldHass, 'hasConfig:', !!this.config);
    
    // Trigger folder initialization when both hass and config are available
    if (hass && this.config && !oldHass) {
      this._log('💎 First time hass available - checking for folder initialization');
      
      if (this.config.is_folder && this.config.folder_mode) {
        this._log('💎 Triggering folder mode initialization from hass setter');
        setTimeout(() => this._handleFolderMode(), 100);
      } else if (this.config.media_path) {
        this._log('💎 Triggering single file load from hass setter');
        setTimeout(() => this._loadSingleFile(), 100);
      }
    }
    
    this.requestUpdate();
  }

  get hass() {
    return this._hass;
  }

  // Debug logging utility with throttling for frequent messages
  _log(...args) {
    if (this._debugMode || window.location.hostname === 'localhost') {
      const message = args.join(' ');
      
      // Throttle frequent messages to avoid spam
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
      
      console.log(...args);
    }
  }

  // String utility helpers
  _getItemDisplayName(item) {
    return item.title || item.media_content_id;
  }

  // Folder mode utility helpers
  _isFolderMode(mode) {
    return this.config.folder_mode === mode;
  }

  _isLatestMode() {
    return this._isFolderMode('latest');
  }

  _isRandomMode() {
    return this._isFolderMode('random');
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
      outline: none;
    }

    .card:focus {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
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
    
    /* Smart aspect ratio handling for panel layouts */
    :host([data-aspect-mode="viewport-fit"]) img {
      max-height: 100vh;
      max-width: 100vw;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 auto;
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
    
    video {
      max-height: 400px;
      object-fit: contain;
    }

    /* Smart aspect ratio handling for videos - matching image behavior */
    :host([data-aspect-mode="viewport-fit"]) video {
      max-height: 100vh;
      max-width: 100vw;
      width: auto;
      height: auto;
      object-fit: contain;
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

    /* Pause indicator */
    .pause-indicator {
      position: absolute;
      top: 8px;
      right: 50px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 6px 10px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      pointer-events: none;
      z-index: 12;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      gap: 4px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Navigation Zones */
    .navigation-zones {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 20; /* Higher z-index to ensure it's above video */
    }

    /* For videos, avoid covering the bottom controls area */
    :host([data-media-type="video"]) .navigation-zones {
      height: calc(100% - 40px); /* Leave space for video controls */
    }

    /* For images, use full height since they don't have controls */
    :host([data-media-type="image"]) .navigation-zones {
      height: 100%;
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

    /* Previous button - small rectangle on left side */
    .nav-zone-left {
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 80px;
      height: 120px;
      cursor: w-resize;
      border-radius: 8px;
    }

    /* Pause button - top right corner */
    .nav-zone-center {
      top: 8px;
      right: 8px;
      width: 60px;
      height: 60px;
      cursor: pointer;
      border-radius: 8px;
    }

    /* Main action area - center region, excluding button areas */
    .nav-zone-neutral {
      left: 100px;
      right: 100px;
      top: 80px;
      bottom: 20px;
      cursor: pointer;
      /* Large center area for tap/hold actions, avoiding button zones */
    }

    /* For videos, ensure main action area stays well above video controls */
    :host([data-media-type="video"]) .nav-zone-neutral {
      bottom: 60px; /* Extra space above video controls */
    }

    /* For images, can use more space since no controls */
    :host([data-media-type="image"]) .nav-zone-neutral {
      bottom: 20px;
    }

    /* Next button - small rectangle on right side */
    .nav-zone-right {
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 80px;
      height: 120px;
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

    .nav-zone-center:hover::after {
      content: '⏸️';
      color: white;
      font-size: 1.2em;
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

    /* No hover effect for neutral zone to keep it clean for actions */
    .nav-zone-neutral:hover {
      background: transparent;
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
    const wasFolder = !!(oldConfig?.is_folder && oldConfig?.folder_mode);
    const isFolder = !!(config.is_folder && config.folder_mode);
    
    this._log('🔧 setConfig called - was folder:', wasFolder, 'is folder:', isFolder);
    
    this.config = config;
    
    // Apply debug mode from config
    this._debugMode = config.debug_mode === true;
    this._log('🔧 Debug mode:', this._debugMode ? 'ENABLED' : 'disabled');
    
    // Set aspect ratio mode data attribute for CSS styling
    const aspectMode = config.aspect_mode || 'default';
    if (aspectMode !== 'default') {
      this.setAttribute('data-aspect-mode', aspectMode);
    } else {
      this.removeAttribute('data-aspect-mode');
    }
    
    // Only reset URL if switching between folder/file modes or if it's a new config
    if (!oldConfig || (wasFolder !== isFolder)) {
      this._log('🔧 Resetting media URL due to mode change');
      this._mediaUrl = '';
      this._folderContents = null; // Reset folder contents when mode changes
      // Reset smart cycling tracking when folder contents are reset
      if (this._recentlyShown) {
        this._recentlyShown.clear();
      }
      this._hasInitializedHass = false; // Allow reinitialization with new config
    }
    
    this._mediaType = config.media_type || 'all';
    this.setAttribute('data-media-type', this._mediaType);
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
      this._log('🔧 Config set with folder mode - triggering initialization');
      setTimeout(() => this._handleFolderMode(), 50);
    } else if (!isFolder && config.media_path && this.hass) {
      // For single file mode, ensure media loads even if auto-refresh is disabled
      this._log('🔧 Config set with single file mode - loading media');
      setTimeout(() => this._loadSingleFile(), 50);
    }
  }

  _setupAutoRefresh() {
    // Clear any existing interval FIRST to prevent multiple timers
    if (this._refreshInterval) {
      this._log('🔄 Clearing existing auto-refresh interval:', this._refreshInterval);
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }

    // Don't set up auto-refresh if paused or not visible
    if (this._isPaused) {
      this._log('🔄 Auto-refresh setup skipped - currently paused');
      return;
    }
    
    if (this._backgroundPaused) {
      this._log('🔄 Auto-refresh setup skipped - background activity paused (not visible)');
      return;
    }

    // Set up auto-refresh if enabled in config
    const refreshSeconds = this.config?.auto_refresh_seconds;
    if (refreshSeconds && refreshSeconds > 0 && this.hass) {
      this._log(`🔄 Setting up auto-refresh every ${refreshSeconds} seconds for ${this.config?.is_folder ? 'folder' : 'file'} mode`);
      this._refreshInterval = setInterval(() => {
        // Check both pause states before running
        if (!this._isPaused && !this._backgroundPaused) {
          this._log('🔄 Auto-refresh timer triggered - active');
          this._checkForMediaUpdates();
        } else {
          this._log('🔄 Auto-refresh skipped - isPaused:', this._isPaused, 'backgroundPaused:', this._backgroundPaused);
        }
      }, refreshSeconds * 1000);
      this._log('🔄 Auto-refresh interval created with ID:', this._refreshInterval);
    } else {
      this._log('🔄 Auto-refresh disabled or not configured:', {
        refreshSeconds,
        hasHass: !!this.hass,
        hasConfig: !!this.config
      });
    }
  }

  async _handleFolderMode() {
    // Prevent multiple simultaneous initializations
    if (this._initializationInProgress) {
      this._log('📂 Folder initialization already in progress - skipping');
      return;
    }
    
    this._initializationInProgress = true;
    
    try {
      this._log('Handling folder mode:', this.config.folder_mode, 'for path:', this.config.media_path);
      
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
      
      if (this._isLatestMode()) {
        selectedFile = this._getLatestFile();
        // Find index of latest file
        selectedIndex = this._folderContents.findIndex(item => item === selectedFile);
      } else if (this._isRandomMode()) {
        const randomResult = this._getRandomFileWithIndex();
        selectedFile = randomResult.file;
        selectedIndex = randomResult.index;
      }

      if (selectedFile && selectedIndex >= 0) {
        const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
        if (resolvedUrl !== this._mediaUrl) {
          this._setMediaUrl(resolvedUrl);
          this._currentMediaIndex = selectedIndex;
          this._detectMediaType(selectedFile.media_content_id);
          this._lastRefreshTime = Date.now(); // Set initial refresh time
          this._log(`📂 Selected media at index ${selectedIndex}:`, selectedFile.title);
          this.requestUpdate();
        }
      }
    } catch (error) {
      console.error('Error handling folder mode:', error);
    } finally {
      this._initializationInProgress = false;
    }
  }

  async _loadSingleFile() {
    this._log('Loading single file:', this.config.media_path);
    
    try {
      const resolvedUrl = await this._resolveMediaPath(this.config.media_path);
      if (resolvedUrl !== this._mediaUrl) {
        this._setMediaUrl(resolvedUrl);
        this._detectMediaType(this.config.media_path);
        this._log('📄 Loaded single file:', resolvedUrl);
        this.requestUpdate();
      }
    } catch (error) {
      console.error('Error loading single file:', error);
    }
  }

  async _handleFolderModeRefresh(forceImmediate = false) {
    // Exit immediately if paused
    if (this._isPaused) {
      this._log('🔄 Folder mode refresh skipped - currently paused');
      return;
    }

    const now = Date.now();
    const configuredInterval = (this.config.auto_refresh_seconds || 30) * 1000;
    
    // Fix timestamp calculation - ensure _lastRefreshTime is reasonable
    if (this._lastRefreshTime > now || this._lastRefreshTime < (now - 86400000)) {
      this._log('⚠️ Invalid _lastRefreshTime detected, resetting:', this._lastRefreshTime);
      this._lastRefreshTime = now - configuredInterval; // Set to allow immediate refresh
    }
    
    const timeSinceLastRefresh = now - this._lastRefreshTime;
    
    this._log('Refreshing folder mode:', this.config.folder_mode, 'forceImmediate:', forceImmediate);
    this._log('Time since last refresh:', timeSinceLastRefresh, 'ms, configured interval:', configuredInterval, 'ms');
    this._log('Timestamps - now:', now, 'last:', this._lastRefreshTime);
    
    // Check if enough time has passed since last refresh (prevent rapid-fire refreshing)
    // BUT allow immediate refresh when forced (e.g., video ended)
    if (!forceImmediate && this._lastRefreshTime > 0 && timeSinceLastRefresh < configuredInterval * 0.8) { // Use 80% to be more conservative
      this._log('SKIPPING refresh - not enough time passed. Need to wait:', (configuredInterval * 0.8 - timeSinceLastRefresh), 'ms more');
      return;
    }
    
    if (forceImmediate) {
      this._log('🎬 FORCING immediate refresh (video ended)');
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
      
      // Handle slideshow behavior
      const slideshowBehavior = this.config.slideshow_behavior || 'static';
      
      if (slideshowBehavior === 'smart_slideshow') {
        const result = await this._handleSmartSlideshow();
        selectedFile = result.file;
        shouldUpdate = result.shouldUpdate;
      } else if (slideshowBehavior === 'cycle') {
        const result = await this._handleCycleSlideshow();
        selectedFile = result.file;
        shouldUpdate = result.shouldUpdate;
      } else {
        // Static behavior (default)
        const result = await this._handleStaticBehavior();
        selectedFile = result.file;
        shouldUpdate = result.shouldUpdate;
      }

      if (shouldUpdate && selectedFile) {
        const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
        if (resolvedUrl) {
          this._log('UPDATING media URL and setting refresh time');
          this._setMediaUrl(resolvedUrl);
          this._detectMediaType(selectedFile.media_content_id);
          this._lastRefreshTime = now;
          this._forceMediaReload();
        }
      } else {
        this._log('No update needed, but updating refresh time to prevent rapid retries');
        this._lastRefreshTime = now; // Update time even if no change to prevent rapid retries
      }
    } catch (error) {
      console.error('Error refreshing folder mode:', error);
    }
  }

  async _scanFolderContents() {
    if (!this.hass) return;
    
    // Prevent multiple simultaneous scans
    if (this._scanInProgress) {
      this._log('📁 Folder scan already in progress - skipping');
      return;
    }
    
    // Prevent rapid re-scanning if we already have recent results and a selected media
    const timeSinceLastScan = Date.now() - (this._lastScanTime || 0);
    if (this._folderContents && this._folderContents.length > 0 && this._mediaUrl && timeSinceLastScan < 5000) {
      this._log('📁 Folder scan skipped - recent results exist (', timeSinceLastScan, 'ms ago)');
      return;
    }
    
    this._scanInProgress = true;
    this._lastScanTime = Date.now();
    
    try {
      this._log('Scanning folder contents for:', this.config.media_path);
      
      const mediaContent = await this.hass.callWS({
        type: "media_source/browse_media",
        media_content_id: this.config.media_path
      });

      // Only log the response in debug mode to reduce console spam
      if (this._debugMode) {
        this._log('📊 Raw media browser API response:', JSON.stringify(mediaContent, null, 2));
      }

      if (mediaContent && mediaContent.children) {
        // Filter for media files only, respecting the configured media type
        const filteredItems = mediaContent.children
          .filter(item => {
            if (item.can_expand) return false; // Skip folders
            
            const fileName = this._getItemDisplayName(item);
            const isMediaFile = this._isMediaFile(fileName);
            if (!isMediaFile) return false;
            
            // Filter by configured media type if specified
            if (this.config.media_type && this.config.media_type !== 'all') {
              const fileType = this._detectFileType(fileName);
              return fileType === this.config.media_type;
            }
            
            return true;
          });

        // Try to get actual file modification times for better sorting
        this._folderContents = await Promise.all(
          filteredItems.map(async (item, index) => {
            // Log the full structure of the first few items to understand available data (only in debug mode)
            if (index < 3 && this._debugMode) {
              this._log(`📄 Media item ${index + 1} structure:`, JSON.stringify(item, null, 2));
            }
            
            let actualMtime = null;
            let estimatedMtime = null;
            
            // Only extract timestamp from filename if we're in 'latest' mode
            // This saves processing cycles in 'random' mode where timestamps aren't needed
            if (this._isLatestMode()) {
              estimatedMtime = this._extractTimestampFromFilename(this._getItemDisplayName(item));
            } else {
              // Skip timestamp extraction for random mode - saves processing cycles
              if (index === 0) { // Log once to avoid spam
                this._log('⚡ Skipping timestamp extraction in "' + this.config.folder_mode + '" mode for performance');
              }
            }
            
            // For now, focus on better filename timestamp extraction
            // In the future, could explore file system APIs if they become available
            
            return {
              ...item,
              estimated_mtime: estimatedMtime,
              sort_name: (this._getItemDisplayName(item)).toLowerCase(),
              original_index: index, // Preserve original API order
              actual_mtime: actualMtime // Will be null for now
            };
          })
        );

        // Only sort if we're in 'latest' mode - random mode doesn't need sorting
        if (this._isLatestMode()) {
          // Sort based on available timing information
          this._folderContents.sort((a, b) => {
            // Prioritize items with actual modification times
            if (a.actual_mtime && b.actual_mtime) {
              return b.actual_mtime - a.actual_mtime; // Newest first
            }
            if (a.actual_mtime && !b.actual_mtime) return -1;
            if (!a.actual_mtime && b.actual_mtime) return 1;
            
            // Fall back to filename timestamp parsing
            if (a.estimated_mtime && b.estimated_mtime) {
              return b.estimated_mtime - a.estimated_mtime;
            }
            if (a.estimated_mtime && !b.estimated_mtime) return -1;
            if (!a.estimated_mtime && b.estimated_mtime) return 1;
            
            // Final fallback: reverse alphabetical (often newer files have higher names)
            return b.sort_name.localeCompare(a.sort_name); // Z to A
          });

          this._log('📁 Sorted', this._folderContents.length, 'files for "latest" mode');
          
          // Debug logging for sorting
          if (this._folderContents.length > 0) {
            this._log('📁 First few files after sorting:');
            this._folderContents.slice(0, 3).forEach((file, idx) => {
              const timestamp = file.actual_mtime 
                ? `📅 REAL: ${new Date(file.actual_mtime).toISOString()}` 
                : file.estimated_mtime 
                  ? `📄 FILENAME: ${new Date(file.estimated_mtime).toISOString()}`
                  : 'no timestamp';
              this._log(`  ${idx + 1}. ${file.title} (${timestamp})`);
            });
          }
        } else {
          this._log('📁 Found', this._folderContents.length, 'files for "' + this.config.folder_mode + '" mode (skipping sort)');
        }
        
        // Reset smart cycling tracking when folder contents change
        if (this._recentlyShown) {
          this._log('🔄 Resetting smart cycling tracking - folder contents updated');
          this._recentlyShown.clear();
        }
      } else {
        this._folderContents = [];
        // Reset smart cycling tracking for empty folders too
        if (this._recentlyShown) {
          this._recentlyShown.clear();
        }
      }
    } catch (error) {
      console.error('Error scanning folder contents:', error);
      this._folderContents = [];
    } finally {
      this._scanInProgress = false;
    }
  }

  _extractTimestampFromFilename(filename) {
    // Try to extract timestamp from common filename patterns
    // Enhanced patterns for better detection - ORDER MATTERS: specific patterns first!
    const patterns = [
      // ISO date formats with time
      /(\d{4}-\d{2}-\d{2}[T_\s]\d{2}[:\-]\d{2}[:\-]\d{2})/,  // 2024-01-15T10:30:45 or 2024-01-15_10-30-45
      // Camera/device specific patterns with time
      /IMG[_\-](\d{8}_\d{6})/,                                 // IMG_20240115_103045
      /VID[_\-](\d{8}_\d{6})/,                                 // VID_20240115_103045
      /(\d{8}_\d{6})/,                                         // YYYYMMDD_HHMMSS (generic)
      /(\d{4}\d{2}\d{2}_?\d{6})/,                              // YYYYMMDD_HHMMSS or YYYYMMDDHHMMSS
      /(\d{4}\d{2}\d{2}\d{2}\d{2}\d{2})/,                      // YYYYMMDDHHMMSS (14 digits)
      // Home Assistant snapshot patterns
      /snapshot[_\-](\d{4}-\d{2}-\d{2}[T_]\d{2}[:\-]\d{2}[:\-]\d{2})/i, // snapshot_2024-01-15T10:30:45
      /(\w+_snapshot_\d{8}_\d{6})/,                            // entity_snapshot_YYYYMMDD_HHMMSS
      /.*_(\d{8}_\d{6})\.?\w*/,                                // Any filename ending with _YYYYMMDD_HHMMSS.ext
      // Timestamps (high precision)
      /(\d{13})/,                                               // 13-digit milliseconds timestamp
      /(\d{10})/,                                               // 10-digit seconds timestamp
      // Date only formats (less specific, so last)
      /(\d{4}-\d{2}-\d{2})/,                                    // YYYY-MM-DD
      /(\d{2}-\d{2}-\d{4})/,                                    // MM-DD-YYYY or DD-MM-YYYY
      /(\d{8})/,                                                // YYYYMMDD (date only, lowest priority)
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        const value = match[1];
        let timestamp;
        
        this._log(`🔍 Found timestamp pattern in ${filename}: "${value}"`);
        
        try {
          if (value.length === 13 && /^\d{13}$/.test(value)) {
            // Milliseconds timestamp
            timestamp = parseInt(value);
          } else if (value.length === 10 && /^\d{10}$/.test(value)) {
            // Seconds timestamp
            timestamp = parseInt(value) * 1000;
          } else if (value.length === 8 && /^\d{8}$/.test(value)) {
            // YYYYMMDD format
            const year = value.substring(0, 4);
            const month = value.substring(4, 6);
            const day = value.substring(6, 8);
            timestamp = new Date(`${year}-${month}-${day}`).getTime();
          } else if (value.length === 15 && /^\d{8}_\d{6}$/.test(value)) {
            // YYYYMMDD_HHMMSS format (camera files)
            const datePart = value.substring(0, 8);
            const timePart = value.substring(9);
            const year = datePart.substring(0, 4);
            const month = datePart.substring(4, 6);
            const day = datePart.substring(6, 8);
            const hour = timePart.substring(0, 2);
            const minute = timePart.substring(2, 4);
            const second = timePart.substring(4, 6);
            timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
          } else if (value.length === 14 && /^\d{14}$/.test(value)) {
            // YYYYMMDDHHMMSS format
            const year = value.substring(0, 4);
            const month = value.substring(4, 6);
            const day = value.substring(6, 8);
            const hour = value.substring(8, 10);
            const minute = value.substring(10, 12);
            const second = value.substring(12, 14);
            timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
          } else if (value.includes('_snapshot_') && /_(\d{8}_\d{6})/.test(value)) {
            // Handle entity_snapshot_YYYYMMDD_HHMMSS format
            const timeMatch = value.match(/_(\d{8}_\d{6})/);
            if (timeMatch) {
              const timeValue = timeMatch[1];
              const datePart = timeValue.substring(0, 8);
              const timePart = timeValue.substring(9);
              const year = datePart.substring(0, 4);
              const month = datePart.substring(4, 6);
              const day = datePart.substring(6, 8);
              const hour = timePart.substring(0, 2);
              const minute = timePart.substring(2, 4);
              const second = timePart.substring(4, 6);
              timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
            }
          } else if (value.includes('-') || value.includes('T') || value.includes('_')) {
            // Various date-time formats
            let dateStr = value.replace(/_/g, 'T').replace(/-/g, ':');
            // Fix common format issues
            if (dateStr.match(/^\d{4}:\d{2}:\d{2}$/)) {
              dateStr = dateStr.replace(/:/g, '-'); // YYYY-MM-DD format
            }
            timestamp = new Date(dateStr).getTime();
          }
          
          if (timestamp && !isNaN(timestamp) && timestamp > 0) {
            this._log(`✅ Extracted timestamp from ${filename}:`, new Date(timestamp).toISOString());
            return timestamp;
          }
        } catch (e) {
          this._log(`❌ Failed to parse timestamp "${value}" from ${filename}:`, e.message);
          continue;
        }
      }
    }
    
    this._log(`⚠️ No timestamp found in filename: ${filename}`);
    return null;
  }

  async _handleStaticBehavior() {
    // Static behavior - original logic
    let selectedFile;
    let shouldUpdate = false;
    
    if (this._isLatestMode()) {
      // Check if there's a newer file
      selectedFile = this._getLatestFile();
      const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
      // Only update if we have a different file
      shouldUpdate = resolvedUrl && resolvedUrl !== this._mediaUrl;
      
      if (shouldUpdate) {
        this._log('Found newer file:', this._getItemDisplayName(selectedFile));
      } else {
        this._log('No newer files found');
      }
    } else if (this._isRandomMode()) {
      // Get a different random file (avoid showing the same file repeatedly)
      const randomResult = this._getRandomFileWithIndex(true); // Pass true to avoid current file
      selectedFile = randomResult.file;
      shouldUpdate = selectedFile != null;
      
      if (shouldUpdate) {
        this._currentMediaIndex = randomResult.index;
        this._log('Selected new random file:', this._getItemDisplayName(selectedFile));
      } else {
        this._log('No different random file available');
      }
    }
    
    return { file: selectedFile, shouldUpdate };
  }

  async _handleCycleSlideshow() {
    // Cycle behavior - round-robin through recent files
    const windowSize = this.config.slideshow_window || 1000;
    let selectedFile;
    let shouldUpdate = false;
    
    if (this._isLatestMode()) {
      // Cycle through newest N files
      const cycleFiles = this._folderContents.slice(0, windowSize);
      this._slideshowPosition = (this._slideshowPosition + 1) % cycleFiles.length;
      selectedFile = cycleFiles[this._slideshowPosition];
      shouldUpdate = true;
      
      // CRITICAL: Update _currentMediaIndex to match slideshow position
      this._currentMediaIndex = this._slideshowPosition;
      
      this._log(`🔄 Cycling through latest files: ${this._slideshowPosition + 1}/${cycleFiles.length}, file: ${this._getItemDisplayName(selectedFile)}`);
    } else if (this._isRandomMode()) {
      // Get a different random file from the window
      const randomResult = this._getRandomFileWithIndex(true);
      selectedFile = randomResult.file;
      shouldUpdate = selectedFile != null;
      
      if (shouldUpdate) {
        this._currentMediaIndex = randomResult.index;
        this._log('🔄 Cycling random file:', this._getItemDisplayName(selectedFile));
      }
    }
    
    return { file: selectedFile, shouldUpdate };
  }

  async _handleSmartSlideshow() {
    // Smart slideshow - context-aware with new content priority
    let selectedFile;
    let shouldUpdate = false;
    
    // First, check for new content
    const newFiles = await this._detectNewContent();
    
    if (newFiles.length > 0) {
      // New content found - show it with priority
      if (this._newContentQueue.length === 0) {
        // First time seeing new content - add to queue
        this._newContentQueue = [...newFiles];
        this._showingNewContent = true;
        this._log(`🚨 New content detected: ${newFiles.length} files, adding to priority queue`);
      }
    }
    
    if (this._showingNewContent && this._newContentQueue.length > 0) {
      // Show next item from new content queue
      selectedFile = this._newContentQueue.shift();
      shouldUpdate = true;
      
      // CRITICAL: Update _currentMediaIndex to match the selected file
      const fileIndex = this._folderContents.findIndex(f => f.media_content_id === selectedFile.media_content_id);
      if (fileIndex >= 0) {
        this._currentMediaIndex = fileIndex;
      }
      
      // Add to "already shown" list for random mode
      if (this._isRandomMode() && selectedFile && fileIndex >= 0 && this._recentlyShown) {
        this._recentlyShown.add(fileIndex);
      }
      
      this._log(`🆕 Showing new content: ${this._getItemDisplayName(selectedFile)} (${this._newContentQueue.length} remaining in queue)`);
      
      // If queue is empty, resume normal slideshow
      if (this._newContentQueue.length === 0) {
        this._showingNewContent = false;
        this._log('✅ Finished showing new content, will resume slideshow on next refresh');
      }
    } else {
      // No new content - continue normal slideshow
      if (this._isLatestMode()) {
        // Slideshow through recent files
        const windowSize = this.config.slideshow_window || 1000;
        const slideshowFiles = this._folderContents.slice(0, windowSize);
        this._slideshowPosition = (this._slideshowPosition + 1) % slideshowFiles.length;
        selectedFile = slideshowFiles[this._slideshowPosition];
        shouldUpdate = true;
        
        // CRITICAL: Update _currentMediaIndex to match slideshow position
        this._currentMediaIndex = this._slideshowPosition;
        
        this._log(`📽️ Latest slideshow: ${this._slideshowPosition + 1}/${slideshowFiles.length} (window: ${windowSize}), file: ${this._getItemDisplayName(selectedFile)}`);
      } else if (this._isRandomMode()) {
        // Random slideshow with memory
        const randomResult = this._getRandomFileWithIndex(true);
        selectedFile = randomResult.file;
        shouldUpdate = selectedFile != null;
        
        if (shouldUpdate) {
          this._currentMediaIndex = randomResult.index;
          this._log(`📽️ Random slideshow: ${this._getItemDisplayName(selectedFile)}`);
        }
      }
    }
    
    return { file: selectedFile, shouldUpdate };
  }

  async _detectNewContent() {
    // Detect new files that weren't in the last known state
    if (!this._folderContents || this._folderContents.length === 0) {
      return [];
    }
    
    const newFiles = [];
    
    if (this._isLatestMode()) {
      // For latest mode, detect files newer than the last known newest
      const currentNewest = this._folderContents[0];
      
      if (!this._lastKnownNewest) {
        // First time - current newest becomes the baseline
        this._lastKnownNewest = currentNewest;
        return [];
      }
      
      // Check if there are newer files
      const lastKnownIndex = this._folderContents.findIndex(f => 
        f.media_content_id === this._lastKnownNewest.media_content_id
      );
      
      if (lastKnownIndex > 0) {
        // There are files newer than our last known newest
        newFiles.push(...this._folderContents.slice(0, lastKnownIndex));
        this._lastKnownNewest = currentNewest; // Update baseline
      }
    } else if (this._isRandomMode()) {
      // For random mode, detect files that weren't in the folder before
      // This is more complex and might need folder comparison
      // For now, we'll use a simpler approach - detect significant folder size changes
      if (!this._lastKnownFolderSize) {
        this._lastKnownFolderSize = this._folderContents.length;
        return [];
      }
      
      if (this._folderContents.length > this._lastKnownFolderSize) {
        // Folder grew - show newest files as new content
        const newCount = this._folderContents.length - this._lastKnownFolderSize;
        newFiles.push(...this._folderContents.slice(0, newCount));
        this._lastKnownFolderSize = this._folderContents.length;
      }
    }
    
    return newFiles;
  }

  _getLatestFile() {
    if (!this._folderContents || this._folderContents.length === 0) return null;
    
    // Already sorted by timestamp (if available) or filename in _scanFolderContents
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
    
    const totalFiles = this._folderContents.length;
    const slideshowWindow = this.config?.slideshow_window || 1000;
    const effectiveWindow = Math.min(totalFiles, slideshowWindow);
    
    // Use smart cycling for collections within slideshow window
    if (effectiveWindow <= 1000) {
      this._log(`🎲 Using smart cycling for ${effectiveWindow} files (window: ${slideshowWindow})`);
      return this._getSmartRandomFile(avoidCurrent, effectiveWindow);
    }
    
    this._log(`🎲 Using simple random within ${effectiveWindow} files (total: ${totalFiles}, window: ${slideshowWindow})`);
    
    // For large collections, use simple random within slideshow window
    // For random mode, we use the newest N files as the window for better performance
    const windowFiles = this._folderContents.slice(0, effectiveWindow);
    
    let randomIndex;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop
    
    do {
      randomIndex = Math.floor(Math.random() * windowFiles.length);
      attempts++;
    } while (
      avoidCurrent && 
      randomIndex === this._currentMediaIndex && 
      attempts < maxAttempts
    );
    
    return { file: windowFiles[randomIndex], index: randomIndex };
  }

  _getSmartRandomFile(avoidCurrent = false, windowSize = null) {
    // Initialize recently shown tracking if not exists
    if (!this._recentlyShown) {
      this._recentlyShown = new Set();
    }
    
    const totalFiles = this._folderContents.length;
    const effectiveWindow = windowSize || totalFiles;
    const windowFiles = this._folderContents.slice(0, effectiveWindow);
    
    // Get available files (not recently shown) within the window
    let availableIndices = [];
    for (let i = 0; i < effectiveWindow; i++) {
      if (!this._recentlyShown.has(i) && (!avoidCurrent || i !== this._currentMediaIndex)) {
        availableIndices.push(i);
      }
    }
    
    // If no available files (all shown recently), reset the tracking
    if (availableIndices.length === 0) {
      this._log(`🔄 Smart cycling: All ${effectiveWindow} files shown, resetting cycle (total: ${totalFiles})`);
      this._recentlyShown.clear();
      
      // Rebuild available indices, still avoiding current if requested
      availableIndices = [];
      for (let i = 0; i < effectiveWindow; i++) {
        if (!avoidCurrent || i !== this._currentMediaIndex) {
          availableIndices.push(i);
        }
      }
    }
    
    // If still no available files (edge case: only 1 file and avoid current), return current
    if (availableIndices.length === 0) {
      return { file: windowFiles[this._currentMediaIndex || 0], index: this._currentMediaIndex || 0 };
    }
    
    // Pick random from available files
    const randomChoice = Math.floor(Math.random() * availableIndices.length);
    const selectedIndex = availableIndices[randomChoice];
    
    // Mark as recently shown
    this._recentlyShown.add(selectedIndex);
    
    this._log(`🎲 Smart cycling: Selected ${selectedIndex + 1}/${effectiveWindow}, recently shown: ${this._recentlyShown.size}/${effectiveWindow} (total files: ${totalFiles})`);
    
    return { file: windowFiles[selectedIndex], index: selectedIndex };
  }

  _detectMediaType(filePath) {
    const fileType = this._detectFileType(filePath);
    if (fileType) {
      this._mediaType = fileType;
      this.setAttribute('data-media-type', fileType);
    }
  }

  _getCurrentMediaType() {
    // Get the current file from folder contents if available
    if (this._folderContents && this._currentMediaIndex >= 0 && this._currentMediaIndex < this._folderContents.length) {
      const currentFile = this._folderContents[this._currentMediaIndex];
      if (currentFile && currentFile.media_content_id) {
        const detectedType = this._detectFileType(currentFile.media_content_id) || 'image';
        this._log('🎯 Media type from folder contents:', detectedType, 'file:', currentFile.media_content_id, 'index:', this._currentMediaIndex);
        return detectedType;
      }
    }
    
    // Fallback to detecting from URL (for single file mode or edge cases)
    const fallbackType = this._detectFileType(this._mediaUrl) || 'image';
    this._log('🎯 Media type from URL fallback:', fallbackType, 'url:', this._mediaUrl, 'hasFolder:', !!this._folderContents, 'index:', this._currentMediaIndex);
    return fallbackType;
  }

  _isMediaFile(filePath) {
    // Extract filename from the full path and get extension  
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    const isMedia = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
    if (Math.random() < 0.01) { // Only log 1% of the time to avoid spam
      this._log('🔥 _isMediaFile check:', filePath, 'fileName:', fileName, 'extension:', extension, 'isMedia:', isMedia);
    }
    return isMedia;
  }

  _detectFileType(filePath) {
    if (!filePath) return null;
    
    // Handle URLs with query parameters by extracting the path portion
    let cleanPath = filePath;
    if (filePath.includes('?')) {
      // For URLs like "/path/file.mp4?token=123", extract just "/path/file.mp4"
      cleanPath = filePath.split('?')[0];
    }
    
    const fileName = cleanPath.split('/').pop() || cleanPath;
    
    // Handle Synology _shared suffix (e.g., "file.mp4_shared" -> "file.mp4")
    let cleanFileName = fileName;
    if (fileName.endsWith('_shared')) {
      cleanFileName = fileName.replace('_shared', '');
    }
    
    const extension = cleanFileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    return null;
  }

  async _shouldWaitForVideoCompletion() {
    const videoElement = this.shadowRoot?.querySelector('video');
    if (!videoElement) {
      return false;
    }

    // If video has ended, don't wait
    if (videoElement.ended) {
      return false;
    }

    // If video is paused, don't wait (user intentionally paused)
    if (videoElement.paused) {
      return false;
    }

    // Get configuration values
    const videoMaxDuration = this.config.video_max_duration || 0;
    const autoRefreshSeconds = this.config.auto_refresh_seconds || 30;

    this._log('🎬 Video completion check - videoMaxDuration:', videoMaxDuration, 'autoRefreshSeconds:', autoRefreshSeconds);

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

    // Use the larger of video_max_duration and auto_refresh_seconds as the actual limit
    // This prevents auto_refresh_seconds from cutting off long videos
    const effectiveMaxWaitMs = Math.max(maxWaitMs, autoRefreshSeconds * 1000);
    const effectiveMaxWaitSeconds = Math.floor(effectiveMaxWaitMs / 1000);

    if (waitTimeMs >= effectiveMaxWaitMs) {
      this._log(`🎬 Video max duration reached (${waitTimeSeconds}s/${effectiveMaxWaitSeconds}s), proceeding with refresh`);
      this._videoWaitStartTime = null; // Reset for next video
      return false;
    }

    this._log(`🎬 Video playing - waiting for completion (${waitTimeSeconds}s/${effectiveMaxWaitSeconds}s)`);
    return true;
  }

  async _checkForMediaUpdates() {
    // CRITICAL: Exit immediately if paused - this should stop rapid cycling
    if (this._isPaused) {
      this._log('🔄 Auto-refresh skipped - currently paused');
      return;
    }
    
    // Prevent rapid firing during startup - ensure at least 3 seconds since component created
    const timeSinceStartup = Date.now() - (this._componentStartTime || 0);
    if (timeSinceStartup < 3000) {
      this._log('🔄 Auto-refresh skipped - startup protection (need', 3000 - timeSinceStartup, 'ms more)');
      return;
    }

    // Check if current media is a video and if it's still playing
    if (this._mediaType === 'video' && await this._shouldWaitForVideoCompletion()) {
      this._log('🔄 Auto-refresh skipped - waiting for video to complete');
      return;
    }
    
    if (!this.config?.media_path) {
      this._log('No media path configured for auto-refresh');
      return;
    }

    // Proactive URL refresh if current URL is getting old (before expiry)
    if (this._mediaUrl && this._isUrlExpired()) {
      this._log('⏰ Current media URL is approaching expiry, refreshing proactively');
      const refreshSuccess = await this._attemptUrlRefresh();
      if (refreshSuccess) {
        this._log('✅ Proactive URL refresh successful');
        return; // Skip normal refresh cycle since we just refreshed
      } else {
        console.warn('⚠️ Proactive URL refresh failed, continuing with normal refresh');
      }
    }
    
    this._log('Checking for media updates...', this.config.media_path);
    
    // Handle folder mode updates
    if (this.config.is_folder && this.config.folder_mode) {
      await this._handleFolderModeRefresh();
      return;
    }
    
    try {
      // For media-source URLs, always get a fresh resolved URL
      if (this.config.media_path.startsWith('media-source://')) {
        this._log('Media-source URL detected, getting fresh resolved URL');
        const freshUrl = await this._resolveMediaPath(this.config.media_path);
        if (freshUrl && freshUrl !== this._mediaUrl) {
          this._log('Got fresh media URL:', freshUrl);
          this._setMediaUrl(freshUrl);
          this._forceMediaReload();
        } else if (freshUrl) {
          this._log('URL unchanged, forcing reload anyway for media-source');
          this._forceMediaReload();
        }
        return;
      }

      // For direct URLs (/local/, /media/, etc.), check Last-Modified header
      const checkUrl = this.config.media_path.startsWith('/') ? this.config.media_path : this._mediaUrl;
      if (checkUrl) {
        this._log('Checking Last-Modified for:', checkUrl);
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
          this._log('Last-Modified check - Current:', lastModified, 'Stored:', this._lastModified);
          
          if (!this._lastModified) {
            // First time checking, store the timestamp
            this._lastModified = lastModified;
            this._log('Stored initial Last-Modified timestamp');
          } else if (lastModified && lastModified !== this._lastModified) {
            this._log('Media file modified, reloading!');
            this._lastModified = lastModified;
            this._forceMediaReload();
          } else {
            this._log('No changes detected');
          }
        } else {
          this._log('HEAD request failed:', response.status, response.statusText);
        }
      }
    } catch (error) {
      console.error('Error checking for media updates:', error);
    }
  }

  _forceMediaReload() {
    if (!this._mediaUrl) {
      this._log('No media URL to reload');
      return;
    }
    
    this._log('Force reloading media:', this._mediaUrl);
    
    // For media-source URLs, we should have already gotten a fresh URL
    // For direct URLs, we can use cache-busting
    const useUrl = this.config?.media_path?.startsWith('media-source://') 
      ? this._mediaUrl  // Use the fresh resolved URL as-is
      : `${this._mediaUrl.split('?')[0]}?_refresh=${Date.now()}`; // Add cache-busting for direct URLs
    
    this._log('Using URL for reload:', useUrl);
    
    // For images, update src directly
    const currentMediaType = this._getCurrentMediaType();
    if (currentMediaType === 'image') {
      const img = this.shadowRoot?.querySelector('img');
      if (img) {
        this._log('Refreshing image element');
        img.src = useUrl;
        // Don't update this._mediaUrl for media-source URLs since they're already fresh
        if (!this.config?.media_path?.startsWith('media-source://')) {
          this._mediaUrl = useUrl;
        }
      }
    } else if (currentMediaType === 'video') {
      const video = this.shadowRoot?.querySelector('video');
      if (video) {
        this._log('Refreshing video element');
        
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

  _setMediaUrl(newUrl) {
    if (newUrl !== this._mediaUrl) {
      this._mediaUrl = newUrl;
      this._urlCreatedTime = Date.now();
      // Clear retry attempts for the new URL since it's fresh
      if (this._retryAttempts.has(newUrl)) {
        this._retryAttempts.delete(newUrl);
      }
      this._log('🔗 Set new media URL, age tracking started:', newUrl.length > 50 ? newUrl.substring(0, 50) + '...' : newUrl);
    }
  }

  _isUrlExpired() {
    // Consider URL expired after 45 minutes (before typical 1-hour timeout)
    const URL_EXPIRY_TIME = 45 * 60 * 1000; // 45 minutes in ms
    const urlAge = Date.now() - this._urlCreatedTime;
    return urlAge > URL_EXPIRY_TIME;
  }

  render() {
    if (!this.config) return html``;
    
    // Set navigation attribute based on folder mode, content, and configuration
    const hasNavigation = this.config.is_folder && 
                         this._folderContents && 
                         this._folderContents.length > 1 &&
                         (this.config.enable_navigation_zones !== false ||
                          this.config.show_position_indicator !== false ||
                          this.config.show_dots_indicator !== false);
    
    if (hasNavigation) {
      this.setAttribute('data-has-folder-navigation', '');
    } else {
      this.removeAttribute('data-has-folder-navigation');
    }
    
    const hasTitle = this.config.title && this.config.title.trim();
    
    return html`
      <div class="card ${!hasTitle ? 'no-title' : ''}"
           @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleGlobalKeyDown : null}
           tabindex="0">
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
          ${this._renderPauseIndicator()}
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

  _renderPauseIndicator() {
    // Only show pause indicator when paused in random mode
    if (!this._isPaused || this.config.folder_mode !== 'random') {
      return html``;
    }

    return html`
      <div class="pause-indicator">⏸</div>
    `;
  }

  async _manualRefresh() {
    this._log('Manual refresh triggered');
    
    // For media-source URLs, get a fresh resolved URL first
    if (this.config?.media_path?.startsWith('media-source://')) {
      this._log('Getting fresh media-source URL for manual refresh');
      const freshUrl = await this._resolveMediaPath(this.config.media_path);
      if (freshUrl) {
        this._mediaUrl = freshUrl;
      }
    }
    
    // Then force reload the media
    this._forceMediaReload();
  }

  async _resolveAndUpdate() {
    this._log('Re-resolving media path:', this.config.media_path);
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
        this._log('Got fresh URL:', freshUrl);
        this._setMediaUrl(freshUrl);
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
    // Handle error state
    if (this._errorState) {
      const isSynologyUrl = this._errorState.isSynologyUrl;
      return html`
        <div class="placeholder" style="border-color: var(--error-color, #f44336); background: rgba(244, 67, 54, 0.1);">
          <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
          <div style="color: var(--error-color, #f44336); font-weight: 500;">${this._errorState.message}</div>
          <div style="font-size: 0.85em; margin-top: 8px; opacity: 0.7; word-break: break-all;">
            ${this._mediaUrl ? this._mediaUrl.substring(0, 100) + (this._mediaUrl.length > 100 ? '...' : '') : 'No URL'}
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
    
    // Handle folder mode that hasn't been initialized yet
    if (!this._mediaUrl && this.config?.is_folder && this.config?.folder_mode && this.hass) {
      this._log('🔧 No media URL but have folder config - triggering initialization');
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

    // Handle single file mode that hasn't been initialized yet
    if (!this._mediaUrl && this.config?.media_path && !this.config?.is_folder && this.hass) {
      this._log('🔧 No media URL but have single file config - triggering initialization');
      // Trigger single file loading asynchronously
      setTimeout(() => this._loadSingleFile(), 10);
      
      return html`
        <div class="placeholder">
          <div style="font-size: 64px; margin-bottom: 24px; opacity: 0.3;">📄</div>
          <div style="font-size: 1.2em; font-weight: 500; margin-bottom: 8px;">Loading Media...</div>
          <div style="font-size: 0.9em; opacity: 0.8; line-height: 1.4;">
            Loading media file
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

    // CRITICAL FIX: Use the corrected media type detection method
    // This uses the original filename from folder contents instead of the resolved URL
    const currentMediaType = this._getCurrentMediaType();
    this._log('🎬 Rendering media with type:', currentMediaType, 'URL:', this._mediaUrl);
    
    if (currentMediaType === 'video') {
      return html`
        <video 
          controls
          preload="auto"
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
          @play=${this._onVideoPlay}
          @ended=${this._onVideoEnded}
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
    // Only show navigation zones if enabled, in folder mode and have multiple items
    if (!this.config.is_folder || 
        !this._folderContents || 
        this._folderContents.length <= 1 ||
        this.config.enable_navigation_zones === false) {
      return html``;
    }

    return html`
      <div class="navigation-zones">
        <div class="nav-zone nav-zone-left"
             @click=${this._handlePrevClick}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Previous (left side button)">
        </div>
        <div class="nav-zone nav-zone-center"
             @click=${this._handleCenterClick}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Pause/Resume (top-right corner)">
        </div>
        <div class="nav-zone nav-zone-neutral"
             @click=${this._handleTap}
             @dblclick=${this._handleDoubleTap}
             @pointerdown=${this._handlePointerDown}
             @pointerup=${this._handlePointerUp}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Main action area (tap/hold)">
        </div>
        <div class="nav-zone nav-zone-right"  
             @click=${this._handleNextClick}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Next (right side button)">
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

    // Show position indicator if enabled
    let positionIndicator = html``;
    if (this.config.show_position_indicator !== false) {
      positionIndicator = html`
        <div class="position-indicator">
          ${currentIndex + 1} of ${totalCount}
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
          this._log('Initializing folder mode - contents:', !!this._folderContents, 'config changed:', changedProps.has('config'), 'has media URL:', !!this._mediaUrl);
          await this._handleFolderMode();
        } else {
          this._log('Skipping folder mode refresh - already initialized and hass updated');
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
      this._log('Could not get initial timestamp:', error);
    }
  }

  _onVideoLoadStart() {
    this._log('Video started loading:', this._mediaUrl);
    // Reset video wait timer for new video
    this._videoWaitStartTime = null;
  }

  _onVideoCanPlay() {
    this._log('Video can start playing:', this._mediaUrl);
  }

  _onVideoPlay() {
    this._log('Video started playing:', this._mediaUrl);
    // Reset video wait timer when video starts playing
    this._videoWaitStartTime = null;
  }

  _onVideoEnded() {
    this._log('Video ended:', this._mediaUrl);
    // Reset video wait timer when video ends
    this._videoWaitStartTime = null;
    
    // Trigger immediate navigation to next video in folder mode
    if (this.config.is_folder && this.config.folder_mode && this._folderContents && this._folderContents.length > 1) {
      this._log('🎬 Video ended - triggering immediate next video');
      // Small delay to ensure video ended event is fully processed
      setTimeout(() => {
        this._handleFolderModeRefresh(true).catch(err => {
          console.error('Error advancing to next video after end:', err);
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

  _onMediaLoaded() {
    // Only log once when media initially loads, not during auto-refresh cycles
    if (!this._mediaLoadedLogged) {
      this._log('Media loaded successfully:', this._mediaUrl);
      this._mediaLoadedLogged = true;
    }
    // Clear any previous error states
    this._errorState = null;
    this.requestUpdate();
  }

  _onMediaError(e) {
    console.error('Media failed to load:', this._mediaUrl, e);
    const target = e.target;
    const error = target?.error;
    
    let errorMessage = 'Media file not found';
    
    // Handle case where target is null (element destroyed/replaced)
    if (!target) {
      errorMessage = 'Media element unavailable';
      console.warn('Media error event has null target - element may have been destroyed');
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
          errorMessage = 'Media source not supported';
          break;
      }
    }
    
    // Add specific handling for Synology DSM authentication errors
    if (this._mediaUrl && this._mediaUrl.includes('/synology_dsm/') && this._mediaUrl.includes('authSig=')) {
      errorMessage = 'Synology DSM authentication expired - try refreshing';
      console.warn('Synology DSM URL authentication may have expired:', this._mediaUrl);
    }
    
    // Check if we've already tried to retry this URL
    const currentUrl = this._mediaUrl || 'unknown';
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
      
      this._log(`🔄 Auto-retrying failed URL (attempt ${retryCount + 1}/${maxAutoRetries}):`, currentUrl.substring(0, 50) + '...');
      
      // Attempt URL refresh for expired URLs (common issue after ~1 hour)
      this._attemptUrlRefresh()
        .then(refreshed => {
          if (!refreshed) {
            // If refresh failed, show error state
            this._showMediaError(errorMessage);
          }
        })
        .catch(err => {
          console.error('URL refresh attempt failed:', err);
          this._showMediaError(errorMessage);
        });
    } else {
      // Already tried to retry this URL, show error immediately
      this._log(`❌ Max auto-retries reached for URL:`, currentUrl.substring(0, 50) + '...');
      this._showMediaError(errorMessage);
    }
  }

  async _attemptUrlRefresh(forceRefresh = false) {
    this._log('🔄 Attempting URL refresh due to media load failure');
    
    // Log additional context for Synology DSM URLs
    if (this._mediaUrl && this._mediaUrl.includes('/synology_dsm/')) {
      this._log('🔄 Synology DSM URL detected - checking authentication signature');
      console.warn('Synology DSM URL refresh needed:', this._mediaUrl.substring(0, 100) + '...');
    }
    
    try {
      let refreshedUrl = null;
      
      // Add retry logic with exponential backoff for Synology DSM URLs
      const isSynologyUrl = this._mediaUrl && this._mediaUrl.includes('/synology_dsm/');
      const maxRetries = isSynologyUrl ? 3 : 1;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (this.config.is_folder && this.config.folder_mode) {
            // For folder mode, refresh the current file
            if (this._folderContents && this._folderContents[this._currentMediaIndex]) {
              const currentFile = this._folderContents[this._currentMediaIndex];
              this._log(`🔄 Refreshing folder file (attempt ${attempt}/${maxRetries}):`, currentFile.media_content_id);
              refreshedUrl = await this._resolveMediaPath(currentFile.media_content_id);
              this._log('🔄 Refreshed folder media URL:', refreshedUrl ? refreshedUrl.substring(0, 100) + '...' : 'null');
            }
          } else if (this.config.media_path) {
            // For single file mode, refresh the configured path
            this._log(`🔄 Refreshing single file (attempt ${attempt}/${maxRetries}):`, this.config.media_path);
            refreshedUrl = await this._resolveMediaPath(this.config.media_path);
            this._log('🔄 Refreshed single file URL:', refreshedUrl ? refreshedUrl.substring(0, 100) + '...' : 'null');
          }
          
          // If we got a different URL or this is a forced refresh, consider it successful
          if (refreshedUrl && (refreshedUrl !== this._mediaUrl || forceRefresh)) {
            this._setMediaUrl(refreshedUrl);
            this._log('✅ URL refresh successful, updating media');
            this.requestUpdate();
            return true;
          } else if (refreshedUrl === this._mediaUrl && !forceRefresh) {
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
      
      console.warn('⚠️ All URL refresh attempts failed or returned same URL');
      return false;
      
    } catch (error) {
      console.error('❌ URL refresh failed:', error);
      return false;
    }
  }

  _showMediaError(errorMessage) {
    // Store error state
    this._errorState = {
      message: errorMessage,
      timestamp: Date.now(),
      isSynologyUrl: this._mediaUrl && this._mediaUrl.includes('/synology_dsm/')
    };
    
    // Force re-render to show error state
    this.requestUpdate();
  }

  async _handleRetryClick(forceRefresh = false) {
    this._log('🔄 Manual retry requested, force refresh:', forceRefresh);
    
    // Clear error state
    this._errorState = null;
    
    // Reset retry attempts for this URL since user manually requested retry
    const currentUrl = this._mediaUrl || 'unknown';
    if (this._retryAttempts.has(currentUrl)) {
      this._retryAttempts.delete(currentUrl);
      this._log('🔄 Reset retry attempts for manual retry');
    }
    
    // Show loading state briefly
    this.requestUpdate();
    
    try {
      const success = await this._attemptUrlRefresh(forceRefresh);
      if (success) {
        this._log('✅ Manual retry successful');
        this.requestUpdate();
      } else {
        this._log('❌ Manual retry failed');
        // Show error again but with updated message
        this._showMediaError('Retry failed - try refreshing the Home Assistant page');
      }
    } catch (error) {
      console.error('❌ Manual retry error:', error);
      this._showMediaError('Retry error: ' + error.message);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    
    // Set up visibility observers to pause background activity when not visible
    this._setupVisibilityObservers();
    
    // Ensure auto-refresh is set up when component is connected/reconnected
    if (this.config && this.hass && !this._isPaused) {
      this._log('🔌 Component connected - setting up auto-refresh');
      this._setupAutoRefresh();
      // Also try to resume if it was paused for navigation
      this._resumeAutoRefreshIfNeeded();
    } else if (this._isPaused) {
      this._log('🔌 Component connected but paused - skipping auto-refresh setup');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    // Clean up visibility observers
    this._cleanupVisibilityObservers();
    
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

  _setupVisibilityObservers() {
    // Set up Intersection Observer to detect when card is visible
    if ('IntersectionObserver' in window) {
      this._intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const wasVisible = this._isVisible;
          this._isVisible = entry.isIntersecting;
          
          if (wasVisible !== this._isVisible) {
            this._log('👁️ Card visibility changed:', this._isVisible ? 'visible' : 'hidden');
            this._handleVisibilityChange();
          }
        });
      }, {
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: '50px' // Start observing 50px before entering viewport
      });
      
      this._intersectionObserver.observe(this);
    }
    
    // Set up Page Visibility API to detect when page/tab is hidden
    this._handlePageVisibility = () => {
      const wasPageVisible = this._isPageVisible;
      this._isPageVisible = !document.hidden;
      
      if (wasPageVisible !== this._isPageVisible) {
        this._log('📄 Page visibility changed:', this._isPageVisible ? 'visible' : 'hidden');
        this._handleVisibilityChange();
      }
    };
    
    document.addEventListener('visibilitychange', this._handlePageVisibility);
    
    // Initialize visibility states
    this._isVisible = true; // Assume visible initially
    this._isPageVisible = !document.hidden;
  }

  _cleanupVisibilityObservers() {
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }
    
    if (this._handlePageVisibility) {
      document.removeEventListener('visibilitychange', this._handlePageVisibility);
      this._handlePageVisibility = null;
    }
  }

  _handleVisibilityChange() {
    const shouldBeActive = this._isVisible && this._isPageVisible;
    
    if (shouldBeActive && this._backgroundPaused) {
      this._log('🔄 Resuming background activity - card is now visible');
      this._backgroundPaused = false;
      this._setupAutoRefresh();
    } else if (!shouldBeActive && !this._backgroundPaused) {
      this._log('⏸️ Pausing background activity - card is not visible');
      this._backgroundPaused = true;
      if (this._refreshInterval) {
        clearInterval(this._refreshInterval);
        this._refreshInterval = null;
      }
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    
    // Only log component updates if they're significant (not just hass changes)
    const significantChange = !changedProperties.has('hass') || changedProperties.size > 1;
    if (significantChange && this._debugMode) {
      this._log('📱 Component updated, changed properties:', Array.from(changedProperties.keys()));
    }
    
    // Only handle hass changes for INITIAL setup - ignore subsequent hass updates to prevent loops
    const isInitialHassSetup = changedProperties.has('hass') && !this._hasInitializedHass && this.hass;
    const isConfigChange = changedProperties.has('config');
    
    if ((isInitialHassSetup || isConfigChange) && this.config && this.hass) {
      const isFolder = this.config.is_folder && this.config.folder_mode;
      
      if (isFolder) {
        // Folder mode - trigger folder handling (with debounce)
        this._log('🔄 Hass available - initializing folder mode');
        this._hasInitializedHass = true; // Mark as initialized to prevent further hass updates
        setTimeout(() => this._handleFolderMode(), 50);
      } else if (this.config.media_path) {
        // Single file mode - ensure media loads even if auto-refresh is disabled
        this._log('🔄 Hass available - loading single file');
        this._hasInitializedHass = true; // Mark as initialized to prevent further hass updates
        setTimeout(() => this._loadSingleFile(), 50);
      }
    }
    
    // ONLY set up auto-refresh on INITIAL hass/config changes - NOT on subsequent hass or _folderContents changes
    const shouldSetupAutoRefresh = (
      (isInitialHassSetup || isConfigChange)
    ) && 
    this.config && 
    this.hass && 
    this.config.auto_refresh_seconds > 0 && 
    !this._isPaused;
    
    if (shouldSetupAutoRefresh) {
      // Always clear and recreate to prevent multiple timers
      this._log('🔄 Property change detected - recreating auto-refresh timer');
      this._setupAutoRefresh();
    } else if (this._isPaused) {
      this._log('🔄 Auto-refresh setup skipped - currently paused');
    } else if (isConfigChange) {
      // Only log when config changes, not for frequent hass updates
      this._log('🔄 Auto-refresh setup skipped - conditions not met:', {
        hasHass: !!this.hass,
        hasConfig: !!this.config,
        autoRefresh: this.config?.auto_refresh_seconds,
        isPaused: this._isPaused,
        changedProps: Array.from(changedProperties.keys()),
        isInitialHassSetup,
        isConfigChange,
        hasInitializedHass: this._hasInitializedHass
      });
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

  _handleCenterClick(e) {
    e.stopPropagation();
    
    this._log('🖱️ Center click detected - current mode:', this.config.folder_mode, 'isPaused:', this._isPaused);
    
    // Only allow pause/resume in random mode
    if (this._isRandomMode()) {
      this._isPaused = !this._isPaused;
      this._log(`🎮 ${this._isPaused ? 'PAUSED' : 'RESUMED'} auto-refresh in random mode`);
      
      // Actually pause/resume the auto-refresh timer
      if (this._isPaused) {
        // Pause: Clear the interval
        if (this._refreshInterval) {
          this._log('🔄 Clearing interval on pause, ID:', this._refreshInterval);
          clearInterval(this._refreshInterval);
          this._refreshInterval = null;
        } else {
          this._log('🔄 No interval to clear on pause');
        }
      } else {
        // Resume: Restart the auto-refresh
        this._log('🔄 Resuming - calling _setupAutoRefresh');
        this._setupAutoRefresh();
      }
      
      this.requestUpdate();
    } else {
      this._log('🖱️ Center click ignored - not in random mode');
    }
  }

  _handleGlobalKeyDown(e) {
    // Only handle keyboard navigation if enabled and we have navigable content
    if (this.config.enable_keyboard_navigation === false || 
        !this.config.is_folder || 
        !this._folderContents || 
        this._folderContents.length <= 1) {
      return;
    }

    // Handle keyboard navigation
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this._navigatePrevious().catch(err => console.error('Navigation error:', err));
        break;
      case 'ArrowRight':
      case ' ': // Space bar for next
        e.preventDefault();
        this._navigateNext().catch(err => console.error('Navigation error:', err));
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Go to first file
        this._navigateToIndex(0).catch(err => console.error('Navigation error:', err));
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Go to last file
        this._navigateToIndex(this._folderContents.length - 1).catch(err => console.error('Navigation error:', err));
        break;
      case 'Enter':
        e.preventDefault();
        // Refresh current file
        this._manualRefresh().catch(err => console.error('Refresh error:', err));
        break;
      case 'p':
      case 'P':
        // Pause/Resume auto-refresh in random mode
        if (this._isRandomMode()) {
          e.preventDefault();
          this._isPaused = !this._isPaused;
          this._log(`🎮 ${this._isPaused ? 'Paused' : 'Resumed'} auto-refresh in random mode (keyboard)`);
          
          // Actually pause/resume the auto-refresh timer
          if (this._isPaused) {
            // Pause: Clear the interval
            if (this._refreshInterval) {
              clearInterval(this._refreshInterval);
              this._refreshInterval = null;
            }
          } else {
            // Resume: Restart the auto-refresh
            this._setupAutoRefresh();
          }
          
          this.requestUpdate();
        }
        break;
    }
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
    
    this._log(`🔄 Navigate Previous: ${currentIndex} -> ${newIndex}`);
    
    // Handle auto-advance mode
    this._handleAutoAdvanceMode();
    
    await this._loadMediaAtIndex(newIndex);
  }

  async _navigateNext() {
    if (!this._folderContents || this._folderContents.length <= 1) return;
    
    const currentIndex = this._getCurrentMediaIndex();
    const newIndex = currentIndex < this._folderContents.length - 1 ? currentIndex + 1 : 0;
    
    this._log(`🔄 Navigate Next: ${currentIndex} -> ${newIndex}`);
    
    // Handle auto-advance mode
    this._handleAutoAdvanceMode();
    
    await this._loadMediaAtIndex(newIndex);
  }

  async _navigateToIndex(targetIndex) {
    if (!this._folderContents || 
        this._folderContents.length <= 1 || 
        targetIndex < 0 || 
        targetIndex >= this._folderContents.length) {
      return;
    }
    
    this._log(`🔄 Navigate to index: ${this._getCurrentMediaIndex()} -> ${targetIndex}`);
    
    // Handle auto-advance mode
    this._handleAutoAdvanceMode();
    
    await this._loadMediaAtIndex(targetIndex);
  }

  _handleAutoAdvanceMode() {
    if (!this.config.auto_refresh_seconds || this.config.auto_refresh_seconds <= 0) {
      return; // No auto-refresh configured
    }

    const mode = this.config.auto_advance_mode || 'pause';
    
    switch (mode) {
      case 'pause':
        // Pause auto-refresh by clearing the interval
        if (this._refreshInterval) {
          this._log('🔄 Pausing auto-refresh due to manual navigation');
          clearInterval(this._refreshInterval);
          this._refreshInterval = null;
          // Mark that we paused due to navigation (for potential resume)
          this._pausedForNavigation = true;
        }
        break;
        
      case 'continue':
        // Do nothing - let auto-refresh continue normally
        this._log('🔄 Continuing auto-refresh during manual navigation');
        break;
        
      case 'reset':
        // Reset the auto-refresh timer
        this._log('🔄 Resetting auto-refresh timer due to manual navigation');
        this._lastRefreshTime = Date.now();
        // Restart the timer
        this._setupAutoRefresh();
        break;
    }
  }

  _resumeAutoRefreshIfNeeded() {
    // Resume auto-refresh if it was paused for navigation and should be running
    // But don't resume if manually paused
    if (this._pausedForNavigation && 
        this.config?.auto_refresh_seconds > 0 && 
        !this._refreshInterval && 
        !this._isPaused &&
        this.hass) {
      this._log('🔄 Resuming auto-refresh after being paused for navigation');
      this._setupAutoRefresh();
      this._pausedForNavigation = false;
    }
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
    
    this._log(`📂 Loading media at index ${index}:`, item.title);
    
    try {
      const mediaUrl = await this._resolveMediaPath(item.media_content_id);
      
      // Update current media
      this._mediaUrl = mediaUrl;
      this._mediaType = this._detectFileType(item.title) || 'image'; // Default to image if unknown
      this.setAttribute('data-media-type', this._mediaType);
      this._currentMediaIndex = index;
      
      // Force re-render
      this.requestUpdate();
    } catch (error) {
      console.error('Error loading media at index:', index, error);
    }
  }

  async _performAction(action) {
    if (!action || !this.hass) return;
    
    this._log('Performing action:', action);
    
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
      title: 'My Media',
      aspect_mode: 'default',
      // Navigation defaults (enabled by default)
      enable_navigation_zones: true,
      show_position_indicator: true, 
      show_dots_indicator: true,
      enable_keyboard_navigation: true,
      auto_advance_mode: 'pause'
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

  // Debug logging utility for the editor
  _log(...args) {
    console.log(...args);
  }

  // Utility methods needed by the editor
  _getItemDisplayName(item) {
    return item.title || item.media_content_id;
  }

  _isMediaFile(filePath) {
    // Extract filename from the full path and get extension  
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
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
          <label>Image Scaling</label>
          <div>
            <select @change=${this._aspectModeChanged} .value=${this._config.aspect_mode || 'default'}>
              <option value="default">Default (fit to card width)</option>
              <option value="smart-scale">Smart Scale (limit height, prevent scrolling)</option>
              <option value="viewport-fit">Viewport Fit (fit entire image in viewport)</option>
              <option value="viewport-fill">Viewport Fill (fill entire viewport)</option>
            </select>
            <div class="help-text">How images should be scaled, especially useful for panel layouts with mixed portrait/landscape images</div>
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
        
        ${this._config.media_type === 'video' || this._config.media_type === 'all' || this._config.is_folder ? html`
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
            
            <div class="config-row">
              <label>Auto-Advance on Navigate</label>
              <div>
                <select @change=${this._autoAdvanceModeChanged} .value=${this._config.auto_advance_mode || 'pause'}>
                  <option value="pause">Pause auto-refresh when navigating manually</option>
                  <option value="continue">Continue auto-refresh during manual navigation</option>
                  <option value="reset">Reset auto-refresh timer on manual navigation</option>
                </select>
                <div class="help-text">How auto-refresh behaves when navigating manually</div>
              </div>
            </div>
            
            <div class="config-row">
              <label>Slideshow Behavior</label>
              <div>
                <select @change=${this._slideshowBehaviorChanged} .value=${this._config.slideshow_behavior || 'static'}>
                  <option value="static">Static - Show single file, refresh in place</option>
                  <option value="cycle">Cycle - Round-robin through recent files</option>
                  <option value="smart_slideshow">Smart Slideshow - Context-aware with new content priority</option>
                </select>
                <div class="help-text">How auto-refresh cycles through files in latest/random mode</div>
              </div>
            </div>
            
            ${this._config.slideshow_behavior !== 'static' ? html`
              <div class="config-row">
                <label>Slideshow Window Size</label>
                <div>
                  <input
                    type="number"
                    min="5"
                    max="5000"
                    .value=${this._config.slideshow_window || 1000}
                    @input=${this._slideshowWindowChanged}
                  />
                  <div class="help-text">Number of files to include in slideshow (latest mode: newest N files, random mode: performance limit)</div>
                </div>
              </div>
            ` : ''}
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

  async _showMediaBrowserDialog() {
    // Skip trying to use native HA media browser since it requires internal modules
    // that aren't available to custom cards
    throw new Error('Native media browser not available for custom cards');
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

    const leftButtons = document.createElement('div');
    leftButtons.style.cssText = `
      display: flex !important;
      gap: 8px !important;
    `;

    const rightButtons = document.createElement('div');
    rightButtons.style.cssText = `
      display: flex !important;
      gap: 8px !important;
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
      this._log('Closing media browser dialog');
      if (dialog && dialog.parentNode) {
        document.body.removeChild(dialog);
        this._log('Dialog closed successfully');
      }
    };

    // Close button handler with debugging and force event handling
    closeButton.onclick = (e) => {
      this._log('Cancel button clicked via onclick');
      closeDialog();
      return false;
    };

    // Backdrop click handler - use onclick to force event handling
    dialog.onclick = (e) => {
      this._log('Dialog backdrop clicked via onclick', e.target === dialog);
      if (e.target === dialog) {
        closeDialog();
      }
    };

    // Escape key to close
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this._log('Escape key pressed');
        closeDialog();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    rightButtons.appendChild(closeButton);
    buttonContainer.appendChild(leftButtons);
    buttonContainer.appendChild(rightButtons);
    dialogContent.appendChild(title);
    dialogContent.appendChild(fileList);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    
    this._log('Appending dialog to document.body');
    document.body.appendChild(dialog);
    
    // Force focus, remove inert, and log status
    requestAnimationFrame(() => {
      // Force remove inert state from all elements
      dialog.removeAttribute('inert');
      dialogContent.removeAttribute('inert');
      document.querySelectorAll('[inert]').forEach(el => el.removeAttribute('inert'));
      
      dialog.focus();
      dialog.setAttribute('tabindex', '0');
      
      this._log('Media browser dialog opened and focused');
      this._log('Dialog element:', dialog);
      this._log('Dialog inert?', dialog.hasAttribute('inert'));
      this._log('Dialog position:', dialog.getBoundingClientRect());
      this._log('Dialog z-index:', window.getComputedStyle(dialog).zIndex);
      this._log('Dialog pointer-events:', window.getComputedStyle(dialog).pointerEvents);
    });
  }

  async _addMediaFilesToBrowser(container, mediaContent, dialog, currentPath = '') {
    this._log('Adding media files to browser:', mediaContent.children.length, 'items');
    this._log('Current path:', currentPath);
    this._log('Media content ID:', mediaContent.media_content_id);
    
    // Check if this folder contains media files (not just subfolders)
    // For performance with large folders, just check the first 50 items
    const itemsToCheck = (mediaContent.children || []).slice(0, 50);
    const hasMediaFiles = itemsToCheck.some(item => {
      const isFolder = item.can_expand;
      // Use item.title (display name) if available, fallback to media_content_id
      const fileName = this._getItemDisplayName(item);
      const isMedia = !isFolder && this._isMediaFile(fileName);
      if (!isFolder && itemsToCheck.length < 10) {
        this._log('Checking file:', fileName, 'isMedia:', isMedia);
      }
      return isMedia;
    });
    
    this._log('Has media files (checked first', itemsToCheck.length, 'items):', hasMediaFiles);
    this._log('Should show folder options:', (currentPath && currentPath !== '') && hasMediaFiles);
    
    // If we're in a folder (not root) with media files, add special folder options at the top
    if ((currentPath && currentPath !== '') && hasMediaFiles) {
      this._log('Adding folder options for path:', currentPath);
      this._addFolderOptions(container, dialog, currentPath);
    } else {
      this._log('Not adding folder options - currentPath:', currentPath, 'hasMediaFiles:', hasMediaFiles);
    }
    
    // Filter items to display based on media type configuration
    const itemsToShow = (mediaContent.children || []).filter(item => {
      // Always show folders
      if (item.can_expand) return true;
      
      // For files, check media type filter
      if (this._config.media_type && this._config.media_type !== 'all') {
        const fileName = this._getItemDisplayName(item);
        const fileType = this._detectFileType(fileName);
        return fileType === this._config.media_type;
      }
      
      // Show all media files if no specific filter or "all" is selected
      const fileName = this._getItemDisplayName(item);
      return this._isMediaFile(fileName);
    });
    
    this._log('Showing', itemsToShow.length, 'items (filtered by media type:', this._config.media_type, ')');
    
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
        this._log('Mouse entered item:', item.title);
        fileItem.style.background = 'var(--secondary-background-color, #f5f5f5)';
        fileItem.style.borderColor = 'var(--primary-color, #007bff)';
        fileItem.style.transform = 'translateY(-1px)';
        fileItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
      };

      fileItem.onmouseleave = (e) => {
        this._log('Mouse left item:', item.title);
        fileItem.style.background = 'var(--card-background-color, #fff)';
        fileItem.style.borderColor = 'var(--divider-color, #ddd)';
        fileItem.style.transform = 'translateY(0)';
        fileItem.style.boxShadow = 'none';
      };

      // Create thumbnail/icon container
      const thumbnailContainer = document.createElement('div');
      thumbnailContainer.style.cssText = `
        width: 60px !important;
        height: 60px !important;
        flex-shrink: 0 !important;
        user-select: none !important;
        pointer-events: none !important;
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
        user-select: none !important;
        pointer-events: none !important;
        color: var(--primary-text-color, #333) !important;
        margin-left: 8px !important;
      `;

      if (item.can_expand) {
        // This is a folder - show folder icon
        const folderIcon = document.createElement('span');
        folderIcon.textContent = '📁';
        folderIcon.style.cssText = `
          font-size: 24px !important;
        `;
        thumbnailContainer.appendChild(folderIcon);
        // Use onclick instead of addEventListener
        fileItem.onclick = async (e) => {
          this._log('FOLDER CLICKED VIA ONCLICK:', item.media_content_id);
          
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
              this._log('BACK BUTTON CLICKED VIA ONCLICK');
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
        // This is a media file - create thumbnail
        const ext = item.media_content_id.split('.').pop()?.toLowerCase();
        const isVideo = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(ext);
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
        
        if (isImage) {
          // Create image thumbnail with better error handling
          this._createImageThumbnail(thumbnailContainer, item);
        } else if (isVideo) {
          // Create video thumbnail (enhanced)
          this._createVideoThumbnail(thumbnailContainer, item);
        } else {
          // Unknown file type
          const fileIcon = document.createElement('span');
          fileIcon.textContent = '📄';
          fileIcon.style.cssText = `
            font-size: 24px !important;
          `;
          thumbnailContainer.appendChild(fileIcon);
        }

        // Use onclick for file selection
        fileItem.onclick = (e) => {
          this._log('FILE CLICKED VIA ONCLICK:', item.media_content_id);
          
          this._handleMediaPicked(item.media_content_id);
          // Close the dialog
          if (dialog && dialog.parentNode) {
            this._log('Closing dialog after file selection');
            document.body.removeChild(dialog);
          }
          return false;
        };
      }

      fileItem.appendChild(thumbnailContainer);
      fileItem.appendChild(name);
      container.appendChild(fileItem);
    }
    
    this._log('Added all items to browser container');
  }

  _addFolderOptions(container, dialog, folderPath) {
    this._log('Adding folder options for:', folderPath);
    
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
      this._log('Folder option clicked:', title);
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
    this._log('Folder mode selected:', mode, 'for path:', folderPath);
    
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
      this._log('Closing dialog after folder mode selection');
      document.body.removeChild(dialog);
    }
  }

  _handleMediaPicked(mediaContentId) {
    this._log('Media picked:', mediaContentId);
    // Store the full media-source path for configuration
    this._config = { ...this._config, media_path: mediaContentId };
    
    // Clear folder-specific options when selecting a single file
    // (since this is no longer a folder-based configuration)
    this._config = { 
      ...this._config, 
      is_folder: false,
      folder_mode: undefined
    };
    
    // Auto-detect media type from extension
    const extension = mediaContentId.split('.').pop()?.toLowerCase();
    if (['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(extension)) {
      this._config.media_type = 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      this._config.media_type = 'image';
    }
    
    this._fireConfigChanged();
    this._log('Config updated (file selected, folder options cleared):', this._config);
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
    loadingIcon.innerHTML = `
      <span style="font-size: 16px; opacity: 0.5;">⏳</span>
    `;
    container.appendChild(loadingIcon);

    // Debug: Log the item structure to understand what's available
    this._log('🔍 Creating thumbnail for item:', item);
    this._log('🔍 Item properties:', Object.keys(item));
    if (item.thumbnail_url) {
      this._log('🖼️ Found thumbnail_url:', item.thumbnail_url);
    }
    if (item.children_media_class) {
      this._log('📁 Item media class:', item.children_media_class);
    }

    try {
      // Try multiple approaches for getting the thumbnail
      let thumbnailUrl = null;
      
      // Approach 1: Check if item already has thumbnail URL (Synology Photos does this)
      if (item.thumbnail_url) {
        thumbnailUrl = item.thumbnail_url;
        this._log('✅ Using provided thumbnail_url:', thumbnailUrl);
      }
      
      // Approach 2: Try Home Assistant thumbnail API
      if (!thumbnailUrl) {
        try {
          const thumbnailResponse = await this.hass.callWS({
            type: "media_source/resolve_media",
            media_content_id: item.media_content_id,
            expires: 3600
          });
          
          if (thumbnailResponse && thumbnailResponse.url) {
            thumbnailUrl = thumbnailResponse.url;
            this._log('✅ Got thumbnail from resolve_media API:', thumbnailUrl);
          }
        } catch (error) {
          this._log('❌ Thumbnail resolve_media API failed:', error);
        }
      }
      
      // Approach 3: Try direct resolution
      if (!thumbnailUrl) {
        thumbnailUrl = await this._resolveMediaPath(item.media_content_id);
        if (thumbnailUrl) {
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
        
        thumbnail.onload = () => {
          // Success! Replace loading indicator with thumbnail
          container.innerHTML = '';
          thumbnail.style.opacity = '1';
          container.appendChild(thumbnail);
          this._log('✅ Thumbnail loaded successfully:', item.media_content_id);
        };
        
        thumbnail.onerror = () => {
          // Failed to load - show fallback icon
          this._showThumbnailFallback(container, '🖼️', 'Image thumbnail failed to load');
          this._log('❌ Thumbnail failed to load:', item.media_content_id);
        };
        
        // Set source to start loading
        thumbnail.src = thumbnailUrl;
        
        // Timeout fallback (in case image takes too long)
        setTimeout(() => {
          if (thumbnail.style.opacity === '0') {
            this._showThumbnailFallback(container, '🖼️', 'Image thumbnail timeout');
            this._log('⏰ Thumbnail timeout:', item.media_content_id);
          }
        }, 5000);
        
      } else {
        // No URL available - show fallback
        this._showThumbnailFallback(container, '🖼️', 'No thumbnail URL available');
      }
      
    } catch (error) {
      console.error('Error creating image thumbnail:', error);
      this._showThumbnailFallback(container, '🖼️', 'Thumbnail error: ' + error.message);
    }
  }

  async _createVideoThumbnail(container, item) {
    // For now, show a video icon, but we could enhance this to generate actual video thumbnails
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
    
    // TODO: Future enhancement - generate actual video thumbnails
    // This would involve creating a video element, loading the video,
    // seeking to a specific time, and drawing to canvas
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
      position: relative !important;
    `;
    
    fallbackIcon.innerHTML = `
      <span style="font-size: 24px; opacity: 0.7;">${icon}</span>
    `;
    
    // Add title attribute for debugging
    fallbackIcon.title = reason;
    
    container.appendChild(fallbackIcon);
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

  _videoMaxDurationChanged(ev) {
    const duration = parseInt(ev.target.value) || 0;
    this._config = { ...this._config, video_max_duration: duration };
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

  // Navigation configuration handlers
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

  _autoAdvanceModeChanged(ev) {
    this._config = { ...this._config, auto_advance_mode: ev.target.value };
    this._fireConfigChanged();
  }

  _slideshowBehaviorChanged(ev) {
    this._config = { ...this._config, slideshow_behavior: ev.target.value };
    // Reset slideshow state when behavior changes
    this._slideshowPosition = 0;
    this._newContentQueue = [];
    this._showingNewContent = false;
    this._fireConfigChanged();
  }

  _slideshowWindowChanged(ev) {
    const value = parseInt(ev.target.value) || 100;
    this._config = { ...this._config, slideshow_window: Math.max(5, Math.min(5000, value)) };
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
      this._log('🔥 _isMediaFile check:', filePath, 'fileName:', fileName, 'extension:', extension, 'isMedia:', isMedia);
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

// Only show version info in development
if (window.location.hostname === 'localhost' || window.location.hostname.includes('homeassistant')) {
  console.info(
    '%c  MEDIA-CARD  %c  1.3.2  ',
    'color: orange; font-weight: bold; background: black',
    'color: white; font-weight: bold; background: dimgray'
  );
}
