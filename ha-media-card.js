/**
 * Home Assistant Media Card
 * A custom card for displaying images and videos with GUI media browser
 * Version: 3.0.0.36 - Fix Priority Patterns UI editing and pathChanged boolean
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
    _isPaused: { state: true },
    _currentMetadata: { state: true }
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
    this._pausedByVideo = false; // Track if pause was caused by video pause
    this._loggedPausedState = false; // Prevent log spam when paused
    this._loggedPauseIndicator = false; // Prevent log spam for pause indicator
    this._currentMetadata = null; // Current media metadata (folder, filename, date)
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
    
    // Subfolder queue system
    this._subfolderQueue = null; // Will be initialized when needed
    this._lastKnownNewest = null; // Track newest file to detect new arrivals
    this._lastKnownFolderSize = null; // Track folder size to detect new content in random mode
    this._slideshowFiles = []; // Cached list of files for slideshow (latest: newest N, random: performance subset)

    // Image zoom state
    this._isImageZoomed = false; // Track whether the image is currently zoomed
    this._zoomOriginX = 50; // Percent
    this._zoomOriginY = 50; // Percent
    this._zoomLevel = 2.0;  // Default zoom level
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
    // Update actions attribute whenever hass is set
    if (this._hasAnyAction()) {
      this.setAttribute('data-has-actions', '');
    } else {
      this.removeAttribute('data-has-actions');
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
      
      // REMOVED: No more message filtering - show all debug messages
      
      // Still throttle certain frequent messages to avoid spam
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

  _getFileExtension(fileName) {
    return fileName?.split('.').pop()?.toLowerCase();
  }

  // Folder mode utility helpers
  _isFolderMode(mode) {
    return this.config.folder_mode === mode;
  }

  _isLatestMode() {
    return this._isFolderMode('latest');
  }

  // Path cleaning utility
  _cleanPath(path) {
    if (!path) return path;
    
    let cleanPath = path;
    
    // Remove auth signatures (case-insensitive)
    if (cleanPath.includes('?authsig=')) {
      cleanPath = cleanPath.split('?authsig=')[0];
    } else if (cleanPath.includes('?authSig=')) {
      cleanPath = cleanPath.split('?authSig=')[0];
    }
    
    return cleanPath;
  }

  // Metadata extraction utilities
  _extractMetadataFromPath(mediaPath, folderContents) {
    if (!mediaPath) return {};
    
    // Clean the path first
    const cleanedPath = this._cleanPath(mediaPath);
    const metadata = {};
    
    // Extract filename and clean it up
    const pathParts = cleanedPath.split('/');
    let filename = pathParts[pathParts.length - 1];
    
    // Decode URL encoding (%20 -> space, etc.)
    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      // If decoding fails, use the original filename
      this._log('⚠️ Failed to decode filename:', filename, e);
    }
    
    metadata.filename = filename;
    
    // Extract folder name (parent directory)
    if (pathParts.length > 1) {
      let folder = pathParts[pathParts.length - 2];
      
      // Decode URL encoding for folder name too
      try {
        folder = decodeURIComponent(folder);
      } catch (e) {
        // If decoding fails, use the original folder name
        this._log('⚠️ Failed to decode folder name:', folder, e);
      }
      
      metadata.folder = folder;
    }
    
    // Try to extract date from cleaned filename (multiple formats)
    const dateFromFilename = this._extractDateFromFilename(filename);
    if (dateFromFilename) {
      metadata.date = dateFromFilename;
    }
    
    // Try to get file modification date from folder contents
    if (folderContents && folderContents.children) {
      const fileItem = folderContents.children.find(child => 
        child.media_content_id === mediaPath || child.title === filename
      );
      if (fileItem && fileItem.thumbnail) {
        // Some HA integrations include timestamp in thumbnail URL
        const timestampFromThumbnail = this._extractTimestampFromUrl(fileItem.thumbnail);
        if (timestampFromThumbnail && !metadata.date) {
          metadata.date = new Date(timestampFromThumbnail);
        }
      }
    }
    
    this._log('📊 Extracted metadata from', mediaPath, ':', metadata);
    return metadata;
  }

  _extractDateFromFilename(filename) {
    if (!filename) return null;
    
    // Common date patterns in filenames
    const patterns = [
      // YYYY-MM-DD format
      /(\d{4})-(\d{2})-(\d{2})/,
      // YYYYMMDD format  
      /(\d{4})(\d{2})(\d{2})/,
      // MM-DD-YYYY format
      /(\d{2})-(\d{2})-(\d{4})/,
      // DD-MM-YYYY format (less common but possible)
      /(\d{2})-(\d{2})-(\d{4})/
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        let year, month, day;
        
        if (pattern.source.includes('(\\d{4})-(\\d{2})-(\\d{2})') || 
            pattern.source.includes('(\\d{4})(\\d{2})(\\d{2})')) {
          // YYYY-MM-DD or YYYYMMDD
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1; // JS Date months are 0-indexed
          day = parseInt(match[3]);
        } else {
          // MM-DD-YYYY format
          month = parseInt(match[1]) - 1;
          day = parseInt(match[2]);
          year = parseInt(match[3]);
        }
        
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime()) && year > 1900 && year < 2100) {
          return date;
        }
      }
    }
    
    return null;
  }

  _extractTimestampFromUrl(url) {
    if (!url) return null;
    
    // Look for timestamp parameters in URLs
    const timestampPattern = /[?&]t=(\d+)/;
    const match = url.match(timestampPattern);
    if (match) {
      return parseInt(match[1]) * 1000; // Convert to milliseconds
    }
    
    return null;
  }

  _formatMetadataDisplay(metadata) {
    if (!metadata || !this.config.metadata) return '';
    
    const parts = [];
    
    if (this.config.metadata.show_folder && metadata.folder) {
      parts.push(`📁 ${metadata.folder}`);
    }
    
    if (this.config.metadata.show_filename && metadata.filename) {
      parts.push(`📄 ${metadata.filename}`);
    }
    
    if (this.config.metadata.show_date && metadata.date) {
      const dateStr = metadata.date.toLocaleDateString();
      parts.push(`📅 ${dateStr}`);
    }
    
    return parts.join(' • ');
  }

  // Initialize subfolder queue if needed
  _initializeSubfolderQueue() {
    if (!this._subfolderQueue && this.config.subfolder_queue?.enabled) {
      // Check if there's a paused queue from a previous card instance
      if (window.mediaCardSubfolderQueue) {
        this._log('� Reconnecting to existing SubfolderQueue');
        this._subfolderQueue = window.mediaCardSubfolderQueue;
        this._subfolderQueue.resumeWithNewCard(this);
        window.mediaCardSubfolderQueue = null; // Clear global reference
      } else {
        this._log('�🚀 Initializing new subfolder queue system');
        this._subfolderQueue = new SubfolderQueue(this);
      }
    }
    return this._subfolderQueue;
  }

  // Monitor queue for immediate display as soon as items are available
  _startQueueMonitor() {
    if (this._queueMonitorInterval) {
      clearInterval(this._queueMonitorInterval);
    }
    
    this._log('👀 Starting queue monitor for immediate display');
    let checkCount = 0;
    const maxChecks = 100; // 10 seconds at 100ms intervals
    
    this._queueMonitorInterval = setInterval(async () => {
      checkCount++;
      
      if (!this._subfolderQueue || checkCount > maxChecks) {
        this._log('⏰ Queue monitor timeout or queue unavailable - stopping');
        clearInterval(this._queueMonitorInterval);
        this._queueMonitorInterval = null;
        return;
      }
      
      const queueSize = this._subfolderQueue.queue.length;
      if (queueSize > 0) {
        this._log('🎉 QUEUE MONITOR: Found', queueSize, 'items - triggering immediate display!');
        
        // Prevent race condition with main initialization
        if (this._initializingMedia) {
          this._log('🚫 Queue monitor blocked - main initialization in progress');
          return;
        }
        this._initializingMedia = true;
        
        clearInterval(this._queueMonitorInterval);
        this._queueMonitorInterval = null;
        
        // Immediately display first available item
        const randomResult = this._getRandomFileWithIndex();
        if (randomResult && randomResult.file) {
          this._log('🚀 Queue monitor triggering immediate display');
          await this._loadMediaFromItem(randomResult.file);
          
          // Set _lastRefreshTime to allow immediate next refresh
          // (subtract interval so next auto-refresh can happen right away)
          const configuredInterval = (this.config?.auto_refresh_seconds || 30) * 1000;
          this._lastRefreshTime = Date.now() - configuredInterval;
          this._log('🕒 Set _lastRefreshTime to allow immediate next refresh in', configuredInterval, 'ms');
          
          // Set minimal _folderContents to enable navigation controls
          this._folderContents = [randomResult.file, {}];
          this._log('🎮 Queue monitor enabled navigation controls');
          
          // Force UI update
          this.requestUpdate();
          
          // Clear initialization flag
          this._initializingMedia = false;
        }
      } else if (checkCount % 10 === 0) {
        this._log('👀 Queue monitor: still waiting... (check', checkCount + '/' + maxChecks + ')');
      }
    }, 100); // Check every 100ms for responsive display
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
      top: 76px;  /* Match pause button position to avoid metadata overlap */
      right: 8px;
      width: 60px;
      height: 60px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 8px;
      font-size: 1.2em;
      font-weight: 500;
      pointer-events: none;
      z-index: 12;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Metadata overlay */
    .metadata-overlay {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 0.85em;
      line-height: 1.2;
      pointer-events: none;
      z-index: 11;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      animation: fadeIn 0.3s ease;
      max-width: calc(100% - 16px);
      word-break: break-word;
    }

    /* Metadata positioning */
    .metadata-overlay.metadata-bottom-left {
      bottom: 8px;
      left: 8px;
    }

    .metadata-overlay.metadata-bottom-right {
      bottom: 8px;
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

    /* Pause button - positioned lower to avoid metadata overlap */
    .nav-zone-center {
      top: 76px;  /* Consistent lower position regardless of metadata */
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

    /* Only show hover icon when not paused (to avoid duplicate icons) */
    :host(:not([data-is-paused])) .nav-zone-center:hover::after {
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

    /* When no actions are configured, let clicks pass through neutral zone */
    :host(:not([data-has-actions])) .nav-zone-neutral {
      pointer-events: none;
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

    /* Image Zoom Styles */
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
    const pathChanged = !!(oldConfig && oldConfig.media_path !== config.media_path);
    
    this._log('🔧 setConfig called - oldPath:', oldConfig?.media_path, 'newPath:', config.media_path, 'pathChanged:', pathChanged);
    
    // Preserve pause state when switching between modes on the same folder path
    const preservePauseState = !pathChanged && 
                               wasFolder && isFolder && 
                               oldConfig?.folder_mode !== config.folder_mode;
    const savedPauseState = preservePauseState ? this._isPaused : false;
    
    this._log('🔧 setConfig called - was folder:', wasFolder, 'is folder:', isFolder, 'path changed:', pathChanged);
    if (preservePauseState) {
      this._log('🔧 Preserving pause state:', savedPauseState, 'for same path folder mode switch');
    }
    
    // Reset subfolder queue and history if path changed
    if (pathChanged && this._subfolderQueue) {
      this._log('🔄 Media path changed - resetting subfolder queue and history');
      // Reset the shown items history when path changes
      this._subfolderQueue.shownItems.clear();
      this._subfolderQueue.history = [];
      this._subfolderQueue.historyIndex = -1;
      this._subfolderQueue.queue = [];
      this._subfolderQueue.discoveredFolders = [];
      this._subfolderQueue = null;
      
      // Clear the last media path to force detection in _handleFolderMode
      this._lastMediaPath = null;
    }
    
    // Create new config object with metadata defaults
    this.config = {
      ...config,
      metadata: {
        show_folder: config.metadata?.show_folder !== false, // Default: true
        show_filename: config.metadata?.show_filename !== false, // Default: true  
        show_date: config.metadata?.show_date !== false, // Default: true
        position: config.metadata?.position || 'bottom-left', // Default: bottom-left
        ...config.metadata
      },
      subfolder_queue: {
        enabled: config.subfolder_queue?.enabled || false, // Default: disabled for now
        scan_depth: config.subfolder_queue?.scan_depth || 2, // Default: 2 levels deep
        queue_size: config.subfolder_queue?.queue_size || 30,
        priority_folder_patterns: config.subfolder_queue?.priority_folder_patterns || [],
        equal_probability_mode: config.subfolder_queue?.equal_probability_mode || false, // True equal probability per media item
        estimated_total_photos: config.subfolder_queue?.estimated_total_photos || null, // User estimate for better probability calculation
        use_hierarchical_scan: config.subfolder_queue?.use_hierarchical_scan !== false, // Default: true (use new hierarchical approach)
        ...config.subfolder_queue
      }
    };
    
    // Apply debug mode from config
    this._debugMode = this.config.debug_mode === true;
    this._log('🔧 Debug mode:', this._debugMode ? 'ENABLED' : 'disabled');
    this._log('🔧 Metadata config:', this.config.metadata);
    
    // Set aspect ratio mode data attribute for CSS styling
    const aspectMode = config.aspect_mode || 'default';
    if (aspectMode !== 'default') {
      this.setAttribute('data-aspect-mode', aspectMode);
    } else {
      this.removeAttribute('data-aspect-mode');
    }
    // Update actions attribute based on config
    if (this._hasAnyAction()) {
      this.setAttribute('data-has-actions', '');
    } else {
      this.removeAttribute('data-has-actions');
    }
    
    // Reset URL if switching between folder/file modes, path changed, or if it's a new config
    if (!oldConfig || (wasFolder !== isFolder) || pathChanged) {
      this._log('🔧 Resetting media URL due to', pathChanged ? 'path change' : 'mode change');
      this._mediaUrl = '';
      this._folderContents = null; // Reset folder contents when mode/path changes
      // Reset smart cycling tracking when folder contents are reset
      if (this._recentlyShown) {
        this._recentlyShown.clear();
      }
      this._hasInitializedHass = false; // Allow reinitialization with new config
    }
    
    this._mediaType = config.media_type || 'all';
    this.setAttribute('data-media-type', this._mediaType);
    
    // Set metadata position attribute for CSS targeting
    const metadataPosition = config.metadata?.position || 'bottom-left';
    this.setAttribute('data-metadata-position', metadataPosition);
    
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
    
    // Restore pause state if we preserved it (after folder mode initialization)
    if (preservePauseState && savedPauseState) {
      setTimeout(() => {
        this._setPauseState(true);
        this._log('🔧 Restored pause state after folder mode switch');
      }, 100);
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
      // Only log once when transitioning to paused state
      if (!this._loggedPausedState) {
        this._log('🔄 Auto-refresh setup skipped - currently paused');
        this._loggedPausedState = true;
      }
      return;
    } else {
      // Reset flag when not paused
      this._loggedPausedState = false;
    }
    
    if (this._backgroundPaused) {
      this._log('🔄 Auto-refresh setup skipped - background activity paused (not visible)');
      return;
    }

    // Set up auto-refresh if enabled in config
    const refreshSeconds = this.config?.auto_refresh_seconds;
    if (refreshSeconds && refreshSeconds > 0 && this.hass) {
      this._log(`🔄 Setting up auto-refresh every ${refreshSeconds} seconds for ${this.config?.is_folder ? 'folder' : 'file'} mode`);
      
      // Start auto-refresh immediately since media should be displayed when this is called
      this._log('🔄 Starting auto-refresh immediately - media is displayed');
      
      this._refreshInterval = setInterval(() => {
        // Check both pause states before running
        if (!this._isPaused && !this._backgroundPaused) {
          // Skip auto-refresh if folder discovery is actively in progress AND queue is empty
          if (this._subfolderQueue && this._subfolderQueue.isDiscoveryInProgress && this._subfolderQueue.isDiscoveryInProgress()) {
            // Only block if queue is empty - if we have items, continue slideshow while scanning in background
            if (this._subfolderQueue.queue && this._subfolderQueue.queue.length === 0) {
              this._log('🔄 Auto-refresh skipped - folder discovery in progress (queue empty)');
              return;
            } else {
              this._log('🔄 Auto-refresh proceeding - discovery in progress but queue has', this._subfolderQueue.queue?.length || 0, 'items');
            }
          }
          
          // Reduce logging noise - only log if debug mode or occasional
          if (this.config?.debug_mode || Math.random() < 0.1) {
            this._log('🔄 Auto-refresh timer triggered - active');
          }
          this._checkForMediaUpdates();
        } else {
          this._log('🔄 Auto-refresh skipped - isPaused:', this._isPaused, 'backgroundPaused:', this._backgroundPaused);
        }
      }, refreshSeconds * 1000);
      this._log('✅ Auto-refresh interval started immediately with ID:', this._refreshInterval);
    } else {
      this._log('🔄 Auto-refresh disabled or not configured:', {
        refreshSeconds,
        hasHass: !!this.hass,
        hasConfig: !!this.config
      });
    }
  }

  async _handleFolderMode() {
    // Check for media path changes and reset queue if needed
    const currentPath = this.config.media_path;
    this._log('🔍 Path check - last:', this._lastMediaPath, 'current:', currentPath, 'queue exists:', !!this._subfolderQueue);
    
    if (this._lastMediaPath && this._lastMediaPath !== currentPath) {
      this._log('🔄 Media path changed from', this._lastMediaPath, 'to', currentPath, '- resetting subfolder queue');
      if (this._subfolderQueue) {
        // Reset all queue state
        this._subfolderQueue.shownItems.clear();
        this._subfolderQueue.history = [];
        this._subfolderQueue.historyIndex = -1;
        this._subfolderQueue.queue = [];
        this._subfolderQueue.discoveredFolders = [];
        this._subfolderQueue = null;
        this._log('✅ Queue reset complete');
      }
    }
    this._lastMediaPath = currentPath;

    // Prevent multiple simultaneous initializations
    if (this._initializationInProgress) {
      this._log('📂 Folder initialization already in progress - skipping');
      return;
    }
    
    this._initializationInProgress = true;
    
    try {
      this._log('Handling folder mode:', this.config.folder_mode, 'for path:', this.config.media_path);
      
      // Initialize subfolder queue if enabled and in random mode
      if (this.config.subfolder_queue?.enabled && this._isRandomMode()) {
        this._log('🚀 Initializing subfolder queue for random mode');
        this._initializeSubfolderQueue();
        if (this._subfolderQueue) {
          this._log('🚀 Starting subfolder queue initialization...');
          
          // 🎯 IMMEDIATE DISPLAY: Start queue monitor RIGHT NOW, don't wait for initialization
          this._startQueueMonitor();
          
          // Start initialization in the background (non-blocking)
          try {
            const queueInitialized = await this._subfolderQueue.initialize();
            if (queueInitialized) {
              this._log('✅ Subfolder queue initialization completed (early population or full scan)');
            
              // Check if queue is populated (with null safety)
              if (this._subfolderQueue && this._subfolderQueue.queue) {
                const queueSize = this._subfolderQueue.queue.length;
                if (queueSize > 0) {
                  this._log('🎉 IMMEDIATE SUCCESS! Queue has', queueSize, 'items - displaying media');
                  
                  // Prevent race condition with queue monitor
                  if (this._initializingMedia) {
                    this._log('🚫 Main initialization blocked - queue monitor in progress');
                    return;
                  }
                  
                  // Check if media is already loaded (queue monitor may have loaded it)
                  if (this._mediaUrl) {
                    this._log('🚫 Main initialization skipped - media already loaded by queue monitor');
                    return;
                  }
                  
                  this._initializingMedia = true;
                  
                  // Cancel queue monitor since we have items now
                  if (this._queueMonitorInterval) {
                    clearInterval(this._queueMonitorInterval);
                    this._queueMonitorInterval = null;
                    this._log('⏹️ Cancelled queue monitor - items available');
                  }
                  
                  const randomResult = this._getRandomFileWithIndex();
                  if (randomResult && randomResult.file) {
                    this._log('🚀 Using available queue item for display');
                    await this._loadMediaFromItem(randomResult.file);
                    this._lastRefreshTime = Date.now();
                    
                    // Set minimal _folderContents to enable navigation controls
                    this._folderContents = [randomResult.file, {}]; // At least 2 items to enable navigation
                    this._log('🎮 Set minimal folder contents for navigation controls');
                    
                    // Clear initialization flag
                    this._initializingMedia = false;
                    
                    return; // Exit early - queue already available
                  }
                } else {
                  this._log('⚠️ Queue empty after initialization - checking if files are exhausted');
                  
                  // Check if all files are exhausted (exist but all shown)
                  const totalFiles = this._subfolderQueue.discoveredFolders.reduce((count, folder) => 
                    count + (folder.files ? folder.files.length : 0), 0);
                  
                  if (totalFiles > 0 && this._subfolderQueue.shownItems.size >= totalFiles) {
                    this._log('🔄 All', totalFiles, 'files have been shown - resetting history to start over');
                    this._subfolderQueue.shownItems.clear();
                    this._subfolderQueue.history = [];
                    this._subfolderQueue.historyIndex = -1;
                    
                    // Reinitialize to populate queue with fresh files
                    this._log('🚀 Re-running initialization with reset history');
                    this._initializeSubfolderQueue();
                    return;
                  }
                  
                  this._log('⚠️ Queue empty after initialization - starting immediate queue monitor');
                  // Start monitoring for queue population (streaming scans are in progress)
                  this._startQueueMonitor();
                  // Also fallback to normal mode in case queue never populates
                  this._log('📁 Starting fallback scanning while waiting for queue');
                }
              } else {
                this._log('⚠️ SubfolderQueue became null after initialization - reinitializing');
                // Queue was nullified (likely by disconnectedCallback), try to reconnect
                this._initializeSubfolderQueue();
              }
            } else {
              this._log('⚠️ Subfolder queue initialization failed, using normal mode');
            }
          } catch (error) {
            if (error.message === 'SCAN_PAUSED_NOT_VISIBLE') {
              this._log('⏸️ Scanning paused - card not visible');
              return; // Exit gracefully when card is not visible
            } else {
              this._log('❌ Subfolder queue initialization error:', error);
            }
          }
        }
      }
      
      // Fallback: scan folder contents for normal mode or queue failures
      this._log('📁 Scanning root folder contents (fallback mode)');
      await this._scanFolderContents();
      
      if (!this._folderContents || this._folderContents.length === 0) {
        console.warn('No media files found in folder:', this.config.media_path);
        this._mediaUrl = '';
        this._currentMediaIndex = 0;
        return;
      }

      // Select media based on mode (fallback for non-queue modes or queue failures)
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
          this._setMediaUrl(resolvedUrl, selectedFile.media_content_id);
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
    
    // Only log detailed timing info in debug mode to reduce spam
    if (this._debugMode) {
      this._log('Refreshing folder mode:', this.config.folder_mode, 'forceImmediate:', forceImmediate);
      this._log('Time since last refresh:', timeSinceLastRefresh, 'ms, configured interval:', configuredInterval, 'ms');
      this._log('Timestamps - now:', now, 'last:', this._lastRefreshTime);
    }
    
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
      // If subfolder queue is active, use it instead of scanning folder contents
      if (this._subfolderQueue && this._subfolderQueue.config.enabled && this._isRandomMode()) {
        if (this._debugMode) {
          this._log('🔄 Using subfolder queue for refresh');
        }
        
        // If queue is still scanning, wait rather than falling back to root folder
        if (this._subfolderQueue.isScanning && this._subfolderQueue.queue && this._subfolderQueue.queue.length === 0) {
          this._log('⏳ Queue still initializing - skipping refresh to avoid showing root folder images');
          this._lastRefreshTime = Date.now(); // Update timestamp to prevent rapid retries
          return;
        }
        
        const randomResult = this._getRandomFileWithIndex(true);
        if (randomResult && randomResult.file) {
          await this._loadMediaFromItem(randomResult.file);
          // Don't reset _lastRefreshTime to current time as this would delay the next auto-refresh
          // The next refresh should happen after the normal interval from now
          this._lastRefreshTime = Date.now();
          return;
        } else {
          this._log('⚠️ Subfolder queue failed during refresh - queue empty but not scanning');
        }
      }
      
      // Fallback: rescan folder contents
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
      if (!this._lastKnownFolderSize) {
        this._lastKnownFolderSize = this._folderContents.length;
        return [];
      }
      
      if (this._folderContents.length > this._lastKnownFolderSize) {
        // Folder grew - need to find the actual newest files
        const newCount = this._folderContents.length - this._lastKnownFolderSize;
        
        // For new content detection, we need to sort by timestamp to find truly new files
        // Create a temporary sorted copy just for new content detection
        const tempSorted = [...this._folderContents];
        tempSorted.forEach(item => {
          if (!item.estimated_mtime) {
            item.estimated_mtime = this._extractTimestampFromFilename(this._getItemDisplayName(item));
          }
        });
        
        // Sort to get newest first
        tempSorted.sort((a, b) => {
          if (a.estimated_mtime && b.estimated_mtime) {
            return b.estimated_mtime - a.estimated_mtime;
          }
          if (a.estimated_mtime) return -1;
          if (b.estimated_mtime) return 1;
          return b.sort_name?.localeCompare(a.sort_name) || 0;
        });
        
        // Take the newest files as new content
        newFiles.push(...tempSorted.slice(0, newCount));
        this._lastKnownFolderSize = this._folderContents.length;
        
        this._log(`🔄 Random mode: detected ${newCount} new files, prioritizing newest`);
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
    // Try to use subfolder queue if available and enabled
    if (this._subfolderQueue && this._subfolderQueue.config.enabled) {
      if (this._debugMode) {
        this._log('🔍 Attempting to get next queue item - queue size:', this._subfolderQueue.queue?.length || 0);
      }
      // Get item from queue (no special marking needed)
      const queueItem = this._subfolderQueue.getNextItem();
      if (queueItem) {
        this._log('🚀 Using item from subfolder queue:', queueItem.title, 'from path:', queueItem.media_content_id);
        // When using queue, don't map to folder contents index - queue items may be from different folders
        return { file: queueItem, index: -1 }; // Use -1 to indicate this is a queue item
      } else {
        this._log('❌ Queue getNextItem returned null/undefined - queue size:', this._subfolderQueue.queue?.length || 0, 'isScanning:', this._subfolderQueue.isScanning);
        this._log('⚠️ Queue empty or failed, falling back to normal random selection');
      }
    }

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
        return this._detectFileType(currentFile.media_content_id) || 'image';
      }
    }
    
    // Fallback to detecting from URL (for single file mode or edge cases)
    return this._detectFileType(this._mediaUrl) || 'image';
  }

  _isMediaFile(filePath) {
    // Extract filename from the full path and get extension  
    const fileName = filePath.split('/').pop() || filePath;
    const extension = this._getFileExtension(fileName);
    const isMedia = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
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
    
    const extension = this._getFileExtension(cleanFileName);
    
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
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

    // Check if current media is a video and if we should wait for completion
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
    
    // Only log detailed refresh info in debug mode to reduce spam
    if (this._debugMode) {
      this._log('Checking for media updates...', this.config.media_path);
    }
    
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

  _setMediaUrl(newUrl, mediaPath = null) {
    if (newUrl !== this._mediaUrl) {
      this._mediaUrl = newUrl;
      this._urlCreatedTime = Date.now();
      // Clear retry attempts for the new URL since it's fresh
      if (this._retryAttempts.has(newUrl)) {
        this._retryAttempts.delete(newUrl);
      }
      
      // Extract metadata from the media path, clean it first
      if (mediaPath || newUrl) {
        const pathToAnalyze = this._cleanPath(mediaPath || newUrl);
        const newMetadata = this._extractMetadataFromPath(pathToAnalyze, this._folderContents);
        
        // Only update metadata if it actually changed
        if (JSON.stringify(newMetadata) !== JSON.stringify(this._currentMetadata)) {
          this._currentMetadata = newMetadata;
        }
      } else {
        this._currentMetadata = null;
      }
      
      this._log('✅ Media URL set, triggering re-render:', newUrl.length > 50 ? newUrl.substring(0, 50) + '...' : newUrl);
    } else {
      // URL didn't change - don't trigger any updates
      this._log('🔄 URL unchanged, skipping render trigger');
    }
  }

  _isUrlExpired() {
    // Don't consider URL expired if we haven't set a creation time yet
    if (!this._urlCreatedTime || this._urlCreatedTime === 0) {
      return false;
    }
    
    // Consider URL expired after 45 minutes (before typical 1-hour timeout)
    const URL_EXPIRY_TIME = 45 * 60 * 1000; // 45 minutes in ms
    const urlAge = Date.now() - this._urlCreatedTime;
    return urlAge > URL_EXPIRY_TIME;
  }

  render() {
    if (!this.config) return html``;
    
    // Debug queue mode - show queue analysis instead of media
    // Only show debug mode if explicitly enabled (prevent auto-activation)
    if (this.config.debug_queue_mode === true) {
      this._log('🐛 Debug queue mode activated - showing debug interface');
      return this._renderDebugQueueMode();
    }
    
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
          ${this._renderMetadataOverlay()}
        </div>
      </div>
    `;
  }

  _renderDebugQueueMode() {
    if (!this.debugQueueData) {
      this.debugQueueData = {
        queueEvents: [],
        sessionStart: Date.now(),
        totalAdded: 0,
        folderStats: new Map(),
        lastRefresh: null
      };
    }

    const hasTitle = this.config.title && this.config.title.trim();
    
    // Debug: Log what we have access to
    this._log('🐛 Debug render - checking subfolderQueue availability:', !!this._subfolderQueue);
    if (this._subfolderQueue) {
      this._log('🐛 Debug render - discovered folders:', this._subfolderQueue.discoveredFolders?.map(f => `${f.title} (${f.path})`));
      this._log('🐛 Debug render - queue sample paths:', this._subfolderQueue.queue?.slice(0, 3).map(item => item.media_content_id));
    }
    
    // Access the correct queue data - it's stored as _subfolderQueue
    let queueSize = 0;
    let foldersFound = 0;
    let currentQueue = [];
    
    if (this._subfolderQueue) {
      queueSize = this._subfolderQueue.queue?.length || 0;
      const discoveredCount = this._subfolderQueue.discoveredFolders?.length || 0;
      foldersFound = discoveredCount;
      currentQueue = this._subfolderQueue.queue || [];
      this._log('🐛 Debug render - _subfolderQueue found, queue size:', queueSize, 'discovered folders:', discoveredCount, 'total:', foldersFound);
      this._log('🐛 Debug render - discoveredFolders array:', this._subfolderQueue.discoveredFolders);
      this._log('🐛 Debug render - foldersFound value:', foldersFound, 'type:', typeof foldersFound);
    } else {
      this._log('🐛 Debug render - NO _subfolderQueue found');
    }
    
    return html`
      <div class="card debug-mode ${!hasTitle ? 'no-title' : ''}">
        ${hasTitle ? html`<div class="title">🐛 DEBUG: ${this.config.title}</div>` : html`<div class="title">🐛 DEBUG QUEUE MODE</div>`}
        
        <div class="debug-container">
          <div class="debug-stats">
            <div><strong>Session:</strong> ${Math.floor((Date.now() - this.debugQueueData.sessionStart) / 1000)}s</div>
            <div><strong>Total Added:</strong> ${this.debugQueueData.totalAdded}</div>
            <div><strong>Queue Size:</strong> ${queueSize}</div>
            <div><strong>Folders Found:</strong> ${foldersFound}</div>
            <div><strong>Last Refresh:</strong> ${this.debugQueueData.lastRefresh ? new Date(this.debugQueueData.lastRefresh).toLocaleTimeString() : 'Never'}</div>
            <div><strong>Events Logged:</strong> ${this.debugQueueData.queueEvents.length}</div>
            <div><strong>Has _SubfolderQueue:</strong> ${!!this._subfolderQueue ? 'Yes' : 'No'}</div>
          </div>
          
          <div class="debug-controls">
            <button @click=${this._debugRefreshQueue} style="margin: 5px; padding: 5px 10px;">🔄 Refresh Queue</button>
            <button @click=${this._debugClearEvents} style="margin: 5px; padding: 5px 10px;">🗑️ Clear Events</button>
            <button @click=${this._debugCopyQueue} style="margin: 5px; padding: 5px 10px;">📋 Copy Queue</button>
          </div>
          
          <div class="debug-current-queue">
            <h4>📄 Current Queue (${queueSize} items):</h4>
            <textarea id="debug-queue-list" readonly style="width: 100%; height: 150px; font-family: monospace; font-size: 11px; background: #ffffff; color: #000000; border: 1px solid #000; resize: vertical; padding: 8px;">
${currentQueue.map((item, index) => {
  const filename = item.title || item.media_content_id?.split('/').pop() || 'Unknown';
  const folder = item.media_content_id?.split('/').slice(-2, -1)[0] || 'Unknown';
  return `${(index + 1).toString().padStart(3, ' ')}: ${folder.padEnd(20, ' ')} → ${filename}`;
}).join('\n')}
            </textarea>
          </div>
          
          <div class="debug-folder-stats">
            <h4>📊 Folder Statistics:</h4>
            <div style="background: #ffffff; border: 1px solid #000; padding: 8px; font-family: monospace;">
              <!-- Debug: foldersFound = ${foldersFound}, discoveredFolders length = ${this._subfolderQueue?.discoveredFolders?.length || 0} -->
              ${foldersFound > 0 && this._subfolderQueue?.discoveredFolders?.length > 0 ? html`
                ${(this._subfolderQueue?.discoveredFolders || []).map(folder => {
                  // Improved folder matching - use both title and path-based matching
                  const queueItems = currentQueue.filter(item => {
                    if (!item.media_content_id) return false;
                    
                    // Extract folder name from the file path (second to last part)
                    const itemFolderName = item.media_content_id.split('/').slice(-2, -1)[0];
                    
                    // Match by folder title or by path inclusion
                    return itemFolderName === folder.title || 
                           item.media_content_id.includes(folder.path) ||
                           item.media_content_id.includes('/' + folder.title + '/');
                  }).length;
                  
                  const percentage = queueSize > 0 ? (queueItems / queueSize * 100).toFixed(1) : '0.0';
                  return html`
                    <div style="margin: 4px 0; font-size: 12px; user-select: text; color: #000000;">
                      <span style="color: #0066cc; font-weight: bold;">${folder.title}</span>: 
                      <span style="color: #000000;">
                        ${folder.fileCount || 0} total, 
                        ${queueItems} in queue 
                        (${percentage}%) 
                        ${folder.isSynthetic ? '(synthetic)' : ''}
                      </span>
                    </div>
                  `;
                })}
              ` : html`
                <div style="color: #cc0000; font-style: italic;">
                  No folders discovered yet... 
                  <br>Debug: foldersFound=${foldersFound}, discoveredFolders.length=${this._subfolderQueue?.discoveredFolders?.length || 0}
                  <br>_subfolderQueue exists: ${!!this._subfolderQueue}
                  <br>discoveredFolders exists: ${!!this._subfolderQueue?.discoveredFolders}
                </div>
              `}
            </div>
          </div>
          
          <div class="debug-history">
            <h4>📚 Queue History (${(this._subfolderQueue?.queueHistory || []).length} files added):</h4>
            <textarea id="debug-history-list" readonly style="width: 100%; height: 200px; font-family: monospace; font-size: 11px; background: #ffffff; color: #000000; border: 1px solid #000; resize: vertical; padding: 8px;">
${(this._subfolderQueue?.queueHistory || []).map((entry, index) => {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();
  const filename = entry.file.title || entry.file.media_content_id?.split('/').pop() || 'Unknown';
  const folder = entry.folderName || 'Unknown';
  const source = entry.source || 'unknown';
  return `${(index + 1).toString().padStart(4, ' ')}: [${timestamp}] ${folder.padEnd(15, ' ')} → ${filename.padEnd(25, ' ')} (${source})`;
}).join('\n')}
            </textarea>
            <button @click=${this._debugCopyHistory} style="margin: 5px 0; padding: 5px 10px;">📋 Copy History</button>
          </div>
          
          <div class="debug-events" style="max-height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
            <h4>📝 Queue Events (Last 50):</h4>
            <div style="font-family: monospace; font-size: 11px; user-select: text;">
              ${this.debugQueueData.queueEvents.slice(-50).reverse().map((event, index) => html`
                <div style="margin: 4px 0; padding: 6px; background: ${event.type === 'queue_refill' ? '#fff3cd' : event.type === 'folder_added' ? '#cce5ff' : '#d4edda'}; border-radius: 3px; border: 1px solid ${event.type === 'queue_refill' ? '#ffeaa7' : event.type === 'folder_added' ? '#a3dcff' : '#c3e6cb'};">
                  <div style="font-weight: bold; color: #000000;">
                    [${new Date(event.timestamp).toLocaleTimeString()}] ${event.type.toUpperCase()}
                  </div>
                  <div style="margin-left: 10px; color: #333333;">
                    ${event.type === 'file_added' ? 
                      `📁 ${event.folder} → 📄 ${event.filename}` : 
                      event.type === 'folder_added' ? 
                      `📁 ${event.folder} (${event.fileCount} files, ${event.slots} slots, weight: ${event.weight})` : 
                      event.details
                    }
                  </div>
                </div>
              `)}
              ${this.debugQueueData.queueEvents.length === 0 ? html`
                <div style="color: #cc0000; font-style: italic; padding: 20px; text-align: center; background: #ffffff; border: 1px solid #000;">
                  No events yet... waiting for queue activity
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .debug-mode .debug-container {
          padding: 10px;
          font-family: Arial, sans-serif;
          font-size: 13px;
          background: #f0f0f0;
          border: 1px solid #000;
        }
        .debug-mode .debug-stats {
          background: #ffffff;
          color: #000000;
          padding: 10px;
          border: 1px solid #000;
          border-radius: 5px;
          margin-bottom: 10px;
        }
        .debug-mode .debug-stats div {
          margin: 3px 0;
          color: #000000;
        }
        .debug-mode .debug-folder-stats {
          background: #ffffff;
          padding: 0;
          border-radius: 5px;
          margin: 10px 0;
          max-height: 200px;
          overflow-y: auto;
        }
        .debug-mode h4 {
          color: #000000;
          margin: 10px 0 5px 0;
        }
      </style>
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
    // Show pause indicator when paused and in random mode OR subfolder queue mode
    const isRandomOrQueue = this._isRandomMode() || (this.config.subfolder_queue?.enabled && this._isRandomMode());
    if (!this._isPaused || !isRandomOrQueue) {
      return html``;
    }

    // Only log once when rendering pause indicator to avoid spam
    if (!this._loggedPauseIndicator) {
      this._log('🔴 Rendering pause indicator - isPaused:', this._isPaused, 'mode:', this.config.folder_mode);
      this._loggedPauseIndicator = true;
    }
    
    return html`
      <div class="pause-indicator">⏸️</div>
    `;
  }

  _renderMetadataOverlay() {
    // Only show if metadata is configured and available
    if (!this.config.metadata || !this._currentMetadata) {
      return html``;
    }

    const metadataText = this._formatMetadataDisplay(this._currentMetadata);
    if (!metadataText) {
      return html``;
    }

    const position = this.config.metadata.position || 'bottom-left';
    const positionClass = `metadata-${position}`;

    return html`
      <div class="metadata-overlay ${positionClass}">
        ${metadataText}
      </div>
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
    if (!this._mediaUrl && this.config?.is_folder && this.config?.folder_mode && this.hass && !this._initializationInProgress) {
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

    // Show loading state during initialization
    if (!this._mediaUrl && this.config?.is_folder && this.config?.folder_mode && this.hass && this._initializationInProgress) {
      return html`
        <div class="placeholder">
          <div style="font-size: 64px; margin-bottom: 24px; opacity: 0.3;">⚡</div>
          <div style="font-size: 1.2em; font-weight: 500; margin-bottom: 8px;">Scanning Folders...</div>
          <div style="font-size: 0.9em; opacity: 0.8; line-height: 1.4;">
            Discovering media files and populating queue
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
    
    // Only log rendering info once per media URL to avoid spam
    if (!this._lastRenderedUrl || this._lastRenderedUrl !== this._mediaUrl) {
      this._log('🎬 Rendering media with type:', currentMediaType, 'URL:', this._mediaUrl);
      this._lastRenderedUrl = this._mediaUrl;
    }
    
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
          @pause=${this._onVideoPause}
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
      <div class="zoomable-container"
           @click=${(e) => this._handleImageZoomClick(e)}
           @touchend=${(e) => this._handleImageZoomTouchEnd(e)}
      >
        <img 
          src="${this._mediaUrl}" 
          alt="${this.config.title || 'Media'}"
          @error=${this._onMediaError}
          @load=${this._onMediaLoaded}
          style="width: 100%; height: auto; display: block;"
        />
      </div>
    `;
  }

  _renderNavigationZones() {
    // Show navigation zones if:
    // 1. In folder mode with multiple items, OR
    // 2. In random mode with subfolder queue (even during initialization)
    const isFolder = this.config.is_folder;
    const hasMultipleContents = this._folderContents && this._folderContents.length > 1;
    const isRandomWithQueue = this._isRandomMode() && this.config.subfolder_queue?.enabled;
    const navigationDisabled = this.config.enable_navigation_zones === false;
    
    const shouldShowNavigation = isFolder && (hasMultipleContents || isRandomWithQueue);
    
    if (!shouldShowNavigation || navigationDisabled) {
      return html``;
    }
    

    return html`
      <div class="navigation-zones">
        <div class="nav-zone nav-zone-left"
             @click=${this._handlePrevClick}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Previous">
        </div>
        <div class="nav-zone nav-zone-center"
             @click=${this._handleCenterClick}
             @keydown=${this.config.enable_keyboard_navigation !== false ? this._handleKeyDown : null}
             tabindex="0"
             title="Pause/Resume">
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
             title="Next">
        </div>
      </div>
    `;
  }

  _renderNavigationIndicators() {
    // Don't show traditional navigation indicators in subfolder queue mode
    if (this._subfolderQueue && this._subfolderQueue.config.enabled && this._isRandomMode()) {
      return html``;
    }

    // Only show indicators if in folder mode and have multiple items
    if (!this.config.is_folder || !this._folderContents || this._folderContents.length <= 1) {
      return html``;
    }

    const currentIndex = this._getCurrentMediaIndex();
    if (currentIndex < 0) {
      // If we can't find the current index, don't show indicators
      return html``;
    }
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

  // ===== Image Zoom Helpers =====
  _handleImageZoomClick(e) {
    // Only for images and when enabled
    if (this._mediaType !== 'image') return;
    if (this.config.enable_image_zoom !== true) return;

    // If user configured tap_action, don't intercept
    if (this.config.tap_action) return;

    // Determine click point as percent within image container
    const container = e.currentTarget;
    const img = container.querySelector('img');
    if (!img) return;

    // Toggle zoom state
    if (this._isImageZoomed) {
      this._resetZoom(img);
      return;
    }

    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Use configured zoom level with bounds
    const level = Math.max(1.5, Math.min(5.0, this.config.zoom_level || this._zoomLevel));
    this._zoomToPoint(img, x, y, level);
  }

  _handleImageZoomTouchEnd(e) {
    // Treat touch end as click for simplicity
    if (e.changedTouches && e.changedTouches.length) {
      const touch = e.changedTouches[0];
      // Synthesize a click-like event object
      const synthetic = {
        currentTarget: e.currentTarget,
        clientX: touch.clientX,
        clientY: touch.clientY,
      };
      this._handleImageZoomClick(synthetic);
    }
  }

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
    
    // If slideshow was paused due to video pause, resume it when video plays
    if (this._isPaused && this._pausedByVideo) {
      this._log('🎬 Video resumed - resuming slideshow');
      this._setPauseState(false);
      this._pausedByVideo = false;
    }
  }

  _onVideoPause() {
    this._log('Video paused by user');
    // Only pause slideshow if video was manually paused (not ended)
    const videoElement = this.renderRoot?.querySelector('video');
    if (videoElement && !videoElement.ended && !this._isPaused) {
      this._log('🎬 Video manually paused - pausing slideshow');
      this._pausedByVideo = true;
      this._setPauseState(true);
    }
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
    // Reset image zoom when a new image loads
    if (this._mediaType === 'image') {
      const container = this.renderRoot?.querySelector('.zoomable-container');
      const img = container?.querySelector('img');
      if (img) this._resetZoom(img);
    }
    // Clear any previous error states and auto-advance timeout
    this._errorState = null;
    if (this._errorAutoAdvanceTimeout) {
      clearTimeout(this._errorAutoAdvanceTimeout);
      this._errorAutoAdvanceTimeout = null;
    }
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
            // For subfolder queue mode, get current item from queue
            if (this.config.subfolder_queue?.enabled && this._subfolderQueue && this._subfolderQueue.history.length > 0) {
              const currentItem = this._subfolderQueue.history[this._subfolderQueue.historyIndex];
              if (currentItem) {
                this._log(`🔄 Refreshing queue file (attempt ${attempt}/${maxRetries}):`, currentItem.media_content_id);
                refreshedUrl = await this._resolveMediaPath(currentItem.media_content_id);
                this._log('🔄 Refreshed queue media URL:', refreshedUrl ? refreshedUrl.substring(0, 100) + '...' : 'null');
              }
            }
            // For traditional folder mode, refresh the current file
            else if (this._folderContents && this._folderContents[this._currentMediaIndex]) {
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
    
    // In folder mode with auto-refresh enabled, automatically advance to next image after a brief delay
    if (this.config?.is_folder && this.config?.auto_refresh_seconds > 0 && !this._isPaused) {
      const autoAdvanceDelay = Math.min(5000, (this.config.auto_refresh_seconds * 1000) / 2); // Max 5 seconds or half the refresh interval
      
      this._log(`⏭️ Auto-advancing to next image in ${autoAdvanceDelay}ms due to media error`);
      
      // Clear any existing auto-advance timeout
      if (this._errorAutoAdvanceTimeout) {
        clearTimeout(this._errorAutoAdvanceTimeout);
      }
      
      this._errorAutoAdvanceTimeout = setTimeout(async () => {
        if (this._errorState && !this._isPaused) {
          this._log('⏭️ Auto-advancing to next image after error');
          // Clear error state
          this._errorState = null;
          
          // Force next image without interfering with normal refresh timing
          try {
            // Save current refresh time to restore it after advancing
            const savedRefreshTime = this._lastRefreshTime;
            await this._handleFolderModeRefresh(true);
            // Restore the refresh time so normal auto-refresh timing isn't affected
            this._lastRefreshTime = savedRefreshTime;
            this._log('🕒 Restored refresh timing after error auto-advance');
          } catch (error) {
            this._log('❌ Auto-advance after error failed:', error);
          }
        }
      }, autoAdvanceDelay);
    }
  }

  async _handleRetryClick(forceRefresh = false) {
    this._log('🔄 Manual retry requested, force refresh:', forceRefresh);
    
    // Clear error state and any auto-advance timeout
    this._errorState = null;
    if (this._errorAutoAdvanceTimeout) {
      clearTimeout(this._errorAutoAdvanceTimeout);
      this._errorAutoAdvanceTimeout = null;
    }
    
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
    
    // Set initial data attributes when element is connected to DOM
    this.setAttribute('data-media-type', this._mediaType || 'image');
    // Initialize pause state attribute
    if (this._isPaused) {
      this.setAttribute('data-is-paused', '');
    }
    
    // Set up visibility detection for scanning pause
    this._setupVisibilityDetection();
    
    // Check for existing queue to reconnect after navigation
    if (window.mediaCardSubfolderQueue && !this._subfolderQueue) {
      this._log('🔗 Connected: Found existing queue - attempting reconnection');
      this._initializeSubfolderQueue();
    }
    
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
    
    this._log('🔌 Component disconnected - cleaning up resources');
    
    // Clean up visibility observers
    this._cleanupVisibilityObservers();
    
    // PAUSE SubfolderQueue instead of destroying it - preserve valuable scan data
    if (this._subfolderQueue) {
      this._log('⏸️ Pausing SubfolderQueue scanning (preserving queue data)');
      this._subfolderQueue.pauseScanning();
      
      // Store queue reference globally so new instances can reconnect
      window.mediaCardSubfolderQueue = this._subfolderQueue;
      this._subfolderQueue = null; // Clear local reference but don't destroy
    }
    
    // Clean up the refresh interval when component is removed
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    // Clean up queue monitor
    if (this._queueMonitorInterval) {
      clearInterval(this._queueMonitorInterval);
      this._queueMonitorInterval = null;
    }
    // Clean up hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
    // Clean up error auto-advance timeout
    if (this._errorAutoAdvanceTimeout) {
      clearTimeout(this._errorAutoAdvanceTimeout);
      this._errorAutoAdvanceTimeout = null;
    }
  }

  _setupVisibilityDetection() {
    this._log('�️ Setting up visibility detection for scanning pause');
    
    // Set up Intersection Observer to detect when card is visible
    if ('IntersectionObserver' in window) {
      this._intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const wasVisible = this._isCardVisible;
          this._isCardVisible = entry.isIntersecting;
          
          if (wasVisible !== this._isCardVisible) {
            this._log('👁️ Card visibility changed:', this._isCardVisible ? 'visible' : 'hidden');
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
    
    // Initialize visibility states - assume visible and active by default
    this._isCardVisible = true; 
    this._isPageVisible = !document.hidden;
    this._backgroundPaused = false; // CRITICAL: Start as active, not paused
    
    this._log('🟢 Visibility detection initialized - backgroundPaused:', this._backgroundPaused);
  }

  _cleanupVisibilityObservers() {
    this._log('🧹 Cleaning up visibility observers');
    
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
    const shouldBeActive = this._isCardVisible && this._isPageVisible;
    
    // Add debug info about visibility state
    this._log('👁️ Visibility check - cardVisible:', this._isCardVisible, 'pageVisible:', this._isPageVisible, 'shouldBeActive:', shouldBeActive, 'currentlyPaused:', this._backgroundPaused);
    
    if (shouldBeActive && this._backgroundPaused) {
      this._log('🔄 Resuming - card is now visible');
      this._backgroundPaused = false;
    } else if (!shouldBeActive && !this._backgroundPaused) {
      this._log('⏸️ Pausing - card is not visible');
      this._backgroundPaused = true;
    }
    
    // The SubfolderQueue will check this._backgroundPaused in its _waitIfBackgroundPaused method
  }

  // DEBUG METHOD: Manual pause/resume for testing
  _debugPauseResume(shouldPause = null) {
    if (shouldPause === null) {
      // Toggle current state
      shouldPause = !this._backgroundPaused;
    }
    
    this._log('🐛 DEBUG: Manual pause/resume called - setting to:', shouldPause);
    this._backgroundPaused = shouldPause;
    
    if (shouldPause) {
      this._log('⏸️ DEBUG: Manually paused background activity');
      if (this._refreshInterval) {
        clearInterval(this._refreshInterval);
        this._refreshInterval = null;
      }
    } else {
      this._log('▶️ DEBUG: Manually resumed background activity');
      this._setupAutoRefresh();
    }
    
    return `Background activity ${shouldPause ? 'paused' : 'resumed'}`;
  }

  // SIMPLIFIED: Force pause when user navigates away - manual test approach
  _debugSimulateHidden() {
    this._log('🐛 DEBUG: Simulating card hidden - forcing pause');
    this._log('🐛 DEBUG: Before - _backgroundPaused:', this._backgroundPaused);
    this._backgroundPaused = true;
    this._log('🐛 DEBUG: After - _backgroundPaused:', this._backgroundPaused);
    this._log('🐛 DEBUG: Card instance ID:', this._componentStartTime, 'SubfolderQueue exists:', !!this._subfolderQueue);
    
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    return 'Simulated hidden state - scanning should pause';
  }

  _debugSimulateVisible() {
    this._log('🐛 DEBUG: Simulating card visible - forcing resume');
    this._log('🐛 DEBUG: Before - _backgroundPaused:', this._backgroundPaused);
    this._backgroundPaused = false;
    this._log('🐛 DEBUG: After - _backgroundPaused:', this._backgroundPaused);
    this._setupAutoRefresh();
    return 'Simulated visible state - scanning should resume';
  }

  _debugForceResume() {
    this._log('🔓 Force resuming all background activity');
    this._backgroundPaused = false;
    this._isCardVisible = true;
    this._isPageVisible = true;
    this._setupAutoRefresh();
    if (this._subfolderQueue) {
      this._subfolderQueue.isScanning = true;
    }
    return 'All activity forcibly resumed';
  }

  _debugResetScanning() {
    this._log('🔄 Resetting scanning state');
    if (this._subfolderQueue) {
      this._log('📂 Before reset - isScanning:', this._subfolderQueue.isScanning, 'queue size:', this._subfolderQueue.queue?.length || 0);
      this._subfolderQueue.isScanning = false;
      this._subfolderQueue.discoveryInProgress = false;
      this._log('📂 After reset - isScanning:', this._subfolderQueue.isScanning, 'queue size:', this._subfolderQueue.queue?.length || 0);
      
      // Force a refill attempt
      setTimeout(() => {
        this._log('🔄 Attempting refill after reset');
        this._subfolderQueue.refillQueue();
      }, 100);
    }
    return 'Scanning state reset and refill triggered';
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    
    // Only log component updates if they're significant (not just hass changes)
    const significantChange = !changedProperties.has('hass') || changedProperties.size > 1;
    if (significantChange && this._debugMode) {
      this._log('📱 Component updated, changed properties:', Array.from(changedProperties.keys()));
    }
    
    // 🎯 IMMEDIATE DISPLAY: Check if queue has been populated and we need to display first item
    if (this._subfolderQueue && this._subfolderQueue.queue && this._subfolderQueue.queue.length > 0 && !this._mediaUrl && this.config.subfolder_queue?.enabled) {
      this._log('🎉 UPDATED: Queue has', this._subfolderQueue.queue.length, 'items - checking for immediate display');
      const randomResult = this._getRandomFileWithIndex();
      if (randomResult && randomResult.file) {
        this._log('🚀 UPDATED: Triggering immediate display from queue');
        this._loadMediaFromItem(randomResult.file).then(() => {
          this._lastRefreshTime = Date.now();
          this._folderContents = [randomResult.file, {}]; // Enable navigation
          this._log('🎮 UPDATED: Set folder contents for navigation');
        }).catch(error => {
          this._log('❌ UPDATED: Failed to load media:', error.message);
        });
      }
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
    
    // ONLY set up auto-refresh on INITIAL hass/config changes
    // NOT on subsequent hass or _folderContents changes
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

  // Debug mode control methods
  _debugRefreshQueue() {
    this._log('🐛 DEBUG: Manual queue refresh triggered');
    this._debugLogEvent('queue_refill', 'Manual refresh triggered');
    this.debugQueueData.lastRefresh = Date.now();
    if (this._subfolderQueue) {
      this._subfolderQueue.refillQueue();
    }
    // Force update debug stats
    this._updateDebugStats();
    this.requestUpdate();
  }

  _updateDebugStats() {
    if (!this.debugQueueData || !this._subfolderQueue) return;
    
    // Update last refresh time when queue activities happen
    if (this._subfolderQueue.queue && this._subfolderQueue.queue.length > 0) {
      this.debugQueueData.lastRefresh = Date.now();
    }
    
    // Force re-render to show updated stats
    this.requestUpdate();
  }

  _debugClearEvents() {
    this._log('🐛 DEBUG: Clearing event log');
    this.debugQueueData.queueEvents = [];
    this.debugQueueData.folderStats.clear();
    this.debugQueueData.totalAdded = 0;
    this.requestUpdate();
  }

  _debugCopyQueue() {
    if (!this._subfolderQueue?.queue) {
      alert('No queue available to copy');
      return;
    }
    
    const queueText = this._subfolderQueue.queue.map((item, index) => {
      const filename = item.title || item.media_content_id?.split('/').pop() || 'Unknown';
      const folder = item.media_content_id?.split('/').slice(-2, -1)[0] || 'Unknown';
      return `${(index + 1).toString().padStart(3, ' ')}: ${folder.padEnd(20, ' ')} → ${filename}`;
    }).join('\n');
    
    navigator.clipboard.writeText(queueText).then(() => {
      this._log('🐛 DEBUG: Queue copied to clipboard');
    }).catch(err => {
      this._log('🐛 DEBUG: Failed to copy queue:', err);
      // Fallback - select the textarea content
      const textarea = this.shadowRoot.getElementById('debug-queue-list');
      if (textarea) {
        textarea.select();
      }
    });
  }

  _debugCopyHistory() {
    if (!this._subfolderQueue?.queueHistory) {
      alert('No queue history available to copy');
      return;
    }
    
    const historyText = this._subfolderQueue.queueHistory.map((entry, index) => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      const filename = entry.file.title || entry.file.media_content_id?.split('/').pop() || 'Unknown';
      const folder = entry.folderName || 'Unknown';
      const source = entry.source || 'unknown';
      return `${(index + 1).toString().padStart(4, ' ')}: [${timestamp}] ${folder.padEnd(15, ' ')} → ${filename.padEnd(25, ' ')} (${source})`;
    }).join('\n');
    
    navigator.clipboard.writeText(historyText).then(() => {
      this._log('🐛 DEBUG: Queue history copied to clipboard');
    }).catch(err => {
      this._log('🐛 DEBUG: Failed to copy history:', err);
      // Fallback - select the textarea content
      const textarea = this.shadowRoot.getElementById('debug-history-list');
      if (textarea) {
        textarea.select();
      }
    });
  }

  _debugLogEvent(type, details, extraData = {}) {
    if (!this.debugQueueData) return;
    
    const event = {
      timestamp: Date.now(),
      type: type,
      details: details,
      ...extraData
    };
    
    this.debugQueueData.queueEvents.push(event);
    
    // Update folder stats for file additions
    if (type === 'file_added' && extraData.folder && extraData.filename) {
      const folder = extraData.folder;
      if (!this.debugQueueData.folderStats.has(folder)) {
        this.debugQueueData.folderStats.set(folder, {
          count: 0,
          files: [],
          percentage: 0
        });
      }
      
      const stats = this.debugQueueData.folderStats.get(folder);
      stats.count++;
      stats.files.push(extraData.filename);
      this.debugQueueData.totalAdded++;
      
      // Update percentages
      this.debugQueueData.folderStats.forEach(folderStats => {
        folderStats.percentage = (folderStats.count / this.debugQueueData.totalAdded) * 100;
      });
      
      this.requestUpdate();
    }
  }

  // Navigation zone event handlers
  _handlePrevClick(e) {
    e.stopPropagation();
    this._log('🖱️ Previous button clicked');
    // Reset zoom before navigating
    try {
      const img = this.renderRoot?.querySelector('.zoomable-container img');
      if (img) this._resetZoom(img);
    } catch {}
    this._navigatePrevious().catch(err => console.error('Navigation error:', err));
  }

  _handleNextClick(e) {
    e.stopPropagation();
    this._log('🖱️ Next button clicked');
    // Reset zoom before navigating
    try {
      const img = this.renderRoot?.querySelector('.zoomable-container img');
      if (img) this._resetZoom(img);
    } catch {}
    this._navigateNext().catch(err => console.error('Navigation error:', err));
  }

  _setPauseState(isPaused) {
    this._isPaused = isPaused;
    
    // Reset log flags when pause state changes to allow new logs
    this._loggedPausedState = false;
    this._loggedPauseIndicator = false;
    
    // Update DOM attribute for CSS styling
    if (isPaused) {
      this.setAttribute('data-is-paused', '');
    } else {
      this.removeAttribute('data-is-paused');
    }
    // Force re-render to update pause indicator
    this.requestUpdate();
  }

  _handleCenterClick(e) {
    e.stopPropagation();
    
    this._log('🖱️ Center click detected - current mode:', this.config.folder_mode, 'isPaused:', this._isPaused);
    
    // Only allow pause/resume in random mode
    if (this._isRandomMode()) {
      this._setPauseState(!this._isPaused);
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
          this._setPauseState(!this._isPaused);
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
    // If subfolder queue is enabled, use history for backward navigation
    if (this._subfolderQueue && this._subfolderQueue.config.enabled) {
      this._log('◀️ Navigate Previous: Using subfolder queue history');
      
      // Handle auto-advance mode
      this._handleAutoAdvanceMode();
      
      const previousItem = this._subfolderQueue.getPreviousItem();
      if (previousItem) {
        this._log('✅ Got previous item from history:', previousItem.title);
        await this._loadMediaFromItem(previousItem);
        return;
      } else {
        this._log('⚠️ No previous item in history, staying at current');
        return;
      }
    }
    
    // Fallback to standard folder navigation
    if (!this._folderContents || this._folderContents.length <= 1) return;
    
    const currentIndex = this._getCurrentMediaIndex();
    const newIndex = currentIndex > 0 ? currentIndex - 1 : this._folderContents.length - 1;
    
    this._log(`🔄 Navigate Previous (folder): ${currentIndex} -> ${newIndex}`);
    
    // Handle auto-advance mode
    this._handleAutoAdvanceMode();
    
    await this._loadMediaAtIndex(newIndex);
  }

  async _navigateNext() {
    // If subfolder queue is enabled, use queue for forward navigation
    if (this._subfolderQueue && this._subfolderQueue.config.enabled) {
      this._log('▶️ Navigate Next: Using subfolder queue');
      
      // Handle auto-advance mode
      this._handleAutoAdvanceMode();
      
      const nextItem = this._subfolderQueue.getNextItem();
      if (nextItem) {
        this._log('✅ Got next item from queue/history:', nextItem.title);
        await this._loadMediaFromItem(nextItem);
        return;
      } else {
        this._log('⚠️ Queue navigation failed, falling back to folder navigation');
      }
    }
    
    // Fallback to standard folder navigation
    if (!this._folderContents || this._folderContents.length <= 1) return;
    
    const currentIndex = this._getCurrentMediaIndex();
    const newIndex = currentIndex < this._folderContents.length - 1 ? currentIndex + 1 : 0;
    
    this._log(`🔄 Navigate Next (folder): ${currentIndex} -> ${newIndex}`);
    
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

    const mode = this.config.auto_advance_mode || 'reset';
    
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
      // Safety check: ensure item and media_content_id exist
      if (!item || !item.media_content_id || !this._mediaUrl) {
        return false;
      }
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
    await this._loadMediaFromItem(item, index);
  }

  async _loadMediaFromItem(item, index = -1) {
    if (!item) return;
    
    this._log(`📂 Loading media item:`, item.title);
    
    try {
      const mediaUrl = await this._resolveMediaPath(item.media_content_id);
      
      // Extract metadata from the item and its path
      const metadata = this._extractMetadataFromPath(mediaUrl, null);
      
      // Update current media
      this._mediaUrl = mediaUrl;
      this._mediaType = this._detectFileType(item.title) || 'image'; // Default to image if unknown
      this.setAttribute('data-media-type', this._mediaType);
      this._currentMediaIndex = index >= 0 ? index : (this._folderContents ? this._folderContents.findIndex(f => f.media_content_id === item.media_content_id) : -1);
      this._currentMetadata = metadata;
      
      this._log('✅ Media URL set, triggering re-render:', this._mediaUrl);
      
      // Force re-render
      this.requestUpdate();
    } catch (error) {
      console.error('Error loading media item:', item.title, error);
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
      auto_advance_mode: 'reset',
      // Debug options
      debug_queue_mode: false
    };
  }
}

// Subfolder Queue System for Random Mode
class SubfolderQueue {
  constructor(card) {
    this.card = card;
    this.config = card.config.subfolder_queue;
    this.queue = [];
    this.shownItems = new Set();
    this.discoveredFolders = [];
    this.folderWeights = new Map();
    this.isScanning = false;
    this.scanProgress = { current: 0, total: 0 };
    this.discoveryStartTime = null;
    this.discoveryInProgress = false;
    this._queueCreatedTime = Date.now(); // Track when this queue instance was created
    
    // Queue history - tracks every file ever added to the queue for debug purposes
    this.queueHistory = [];
    
    // NEW: Hierarchical scan queue management - Phase 1.2
    this.queueShuffleCounter = 0; // Tracks files added since last shuffle for percentage-based optimization
    this.SHUFFLE_MIN_BATCH = 10; // Minimum batch size for small queues
    this.SHUFFLE_MAX_BATCH = 1000; // Maximum batch size for very large queues
    this.SHUFFLE_PERCENTAGE = 0.10; // Shuffle when new items >= 10% of current queue size
    
    // Removed batch scheduler - unnecessary complexity, direct queue addition works better
    
    // Navigation history for back/forward functionality
    this.history = []; // Array of shown items in chronological order
    this.historyIndex = -1; // Current position in history (-1 = latest)
    
    // Cache for probability calculations - prevents recalculation on every refill
    this.cachedTotalCount = null;
    this.cachedCountSource = null; // 'user_estimate' | 'adaptive' | 'discovery_complete'
    this.lastDiscoveredCount = 0;
    this.totalCountLocked = false; // Prevent recalculation once stable
    
    this._log('🚀 SubfolderQueue initialized with config:', this.config);
    this._log('📋 Priority patterns configured:', this.config.priority_folder_patterns);
  }

  // Wait while the parent card has background activity paused (visibility/page hidden)
  async _waitIfBackgroundPaused(timeoutMs = 60000) {
    // If queue has been stopped, don't continue
    if (!this.card) {
      this._log('❌ Queue has no card reference - stopping');
      return; // Queue has been stopped/destroyed
    }
    
    // Check both DOM presence and visibility state
    const cardInDOM = document.contains(this.card);
    const cardBackgroundPaused = this.card._backgroundPaused;
    
    // SIMPLIFIED: Don't force pause based on DOM detection - rely only on visibility observers
    // The IntersectionObserver and Page Visibility API will handle proper pause detection
    
    // Only log status occasionally to avoid spam
    if (!this._lastStatusLog || (Date.now() - this._lastStatusLog) > 5000) {
      this._log('🔍 Status: Card in DOM =', cardInDOM, 'Background paused =', !!this.card._backgroundPaused);
      this._lastStatusLog = Date.now();
    }
    
    // Check if we should be paused - only use explicit background pause, not DOM detection
    const shouldPause = this.card._backgroundPaused;
    
    if (shouldPause) {
      if (!this._autoPaused) {
        this._log('⏸️ Pausing scanning - DOM:', cardInDOM, 'Background paused:', !!this.card._backgroundPaused);
        this._autoPaused = true;
        this.isScanning = false; // Stop the scanning flag
        
        // AGGRESSIVE: Also clear any scanning timers
        if (this._scanTimeout) {
          clearTimeout(this._scanTimeout);
          this._scanTimeout = null;
          this._log('🛑 Cleared scan timeout');
        }
        
        // Store queue globally for reconnection
        if (!window.mediaCardSubfolderQueue) {
          window.mediaCardSubfolderQueue = this;
          this._log('💾 Stored queue globally for reconnection');
        }
      }
      
      // AGGRESSIVE: Throw an error to completely stop the async chain
      throw new Error('SCAN_PAUSED_NOT_VISIBLE');
    }
    
    // Reset auto-pause flag if conditions are good
    if (this._autoPaused) {
      this._log('▶️ Resuming scanning - conditions are good');  
      this._autoPaused = false;
      // Note: Don't restart isScanning here - let the initialization process handle it
    }
    
    // Continue with scanning if we get here
    return;
  }

  _log(...args) {
    // Safety check - if card reference is cleared, skip logging
    if (!this.card || !this.card._debugMode) {
      return;
    }
    
    // Check if SubfolderQueue logging is suppressed
    if (this.card.config?.suppress_subfolder_logging) {
      return;
    }
    
    console.log('📂 SubfolderQueue:', ...args);
  }

  // Pause all scanning activity - called when card is destroyed but preserve queue data
  pauseScanning() {
    this._log('⏸️ SubfolderQueue: Pausing scanning activity (preserving queue data)');
    
    this.isScanning = false;
    this.discoveryInProgress = false;
    
    // Clear any running timers/intervals
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }
    
    // Keep the card reference and queue data intact for reconnection
    this._log('⏸️ SubfolderQueue: Scanning paused - queue preserved with', this.queue.length, 'items');
  }

  // Resume scanning activity with a new card instance
  resumeWithNewCard(newCard) {
    this._log('▶️ SubfolderQueue: Resuming with new card instance');
    this._log('▶️ SubfolderQueue: Previous card:', !!this.card, 'New card:', !!newCard);
    this.card = newCard;
    this._log('▶️ SubfolderQueue: Reconnected - queue has', this.queue.length, 'items,', this.discoveredFolders.length, 'folders');
    this._log('▶️ SubfolderQueue: isScanning:', this.isScanning, 'discoveryInProgress:', this.discoveryInProgress);
  }

  // Stop all scanning activity - called when card is destroyed
  stopScanning() {
    this._log('🛑 SubfolderQueue: Stopping all scanning activity');
    this._log('🛑 SubfolderQueue: Scanning stopped and card reference will be cleared');
    
    this.isScanning = false;
    this.discoveryInProgress = false;
    
    // Clear any running timers/intervals
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }
    
    // Clear the card reference LAST to prevent further activity
    this.card = null;
  }

  // Check if folder discovery is actively in progress
  isDiscoveryInProgress() {
    if (!this.discoveryInProgress) return false;
    
    // Consider discovery finished after 30 seconds to prevent permanent blocking
    const discoveryDuration = Date.now() - (this.discoveryStartTime || 0);
    if (discoveryDuration > 30000) {
      this._log('⏰ Discovery timeout reached - allowing auto-refresh');
      this.discoveryInProgress = false;
      return false;
    }
    
    return true;
  }

  // Calculate weight multiplier based on folder path patterns
  getPathWeightMultiplier(folderPath) {
    let multiplier = 1.0;
    
    if (this.config.priority_folder_patterns.length === 0) {
      this._log('⚠️ No priority patterns configured');
      return multiplier;
    }
    
    this._log('🔍 Checking path:', folderPath, 'against', this.config.priority_folder_patterns.length, 'patterns');
    
    for (const pattern of this.config.priority_folder_patterns) {
      const patternPath = pattern.path || pattern; // Handle both old and new format
      this._log('  • Testing pattern:', patternPath, 'against path:', folderPath);
      
      if (folderPath.includes(patternPath)) {
        multiplier = Math.max(multiplier, pattern.weight_multiplier || 3.0);
        this._log('✨ Path weight match:', folderPath, 'pattern:', patternPath, 'multiplier:', pattern.weight_multiplier || 3.0);
      }
    }
    
    if (multiplier === 1.0) {
      this._log('📍 No pattern matches for:', folderPath);
    }
    
    return multiplier;
  }

  // Calculate folder weight based on file count and path patterns
  calculateFolderWeight(folder) {
    // Balanced weighting system that prevents massive folder dominance
    // Use logarithmic scaling to compress the range between small and large folders
    
    let baseWeight;
    if (folder.fileCount === 0) {
      return 0; // Empty folders get no weight
    } else if (folder.fileCount < 5) {
      baseWeight = folder.fileCount * 0.5; // Very small folders get minimal weight
    } else {
      // Logarithmic scaling prevents massive folders from completely dominating
      // This compresses the range significantly: 100 files ≈ 2.0, 10,000 files ≈ 4.0
      baseWeight = Math.log10(folder.fileCount) * 10;
    }
    
    const pathMultiplier = this.getPathWeightMultiplier(folder.path);
    
    // Much more balanced bonus system - prevents 10K+ folders from getting 5x advantage
    let sizeMultiplier = 1.0;
    if (folder.fileCount > 10000) {
      sizeMultiplier = 1.8; // Modest bonus for ultra-large folders
    } else if (folder.fileCount > 1000) {
      sizeMultiplier = 1.5; // Small bonus for large folders  
    } else if (folder.fileCount > 100) {
      sizeMultiplier = 1.2; // Tiny bonus for medium folders
    }
    
    const finalWeight = baseWeight * pathMultiplier * sizeMultiplier;
    
    // Log with percentage representation to make bias clear
    this._log('📊 Weight calculation:', folder.title, 'files:', folder.fileCount, 'weight:', finalWeight.toFixed(1), 
              'log10:', Math.log10(folder.fileCount).toFixed(1), 'multiplier:', sizeMultiplier);
    
    return finalWeight;
  }

  // Get cached total media count to ensure consistent probability calculations
  getTotalMediaCount(currentDiscoveredCount) {
    // 1. If user provided estimate, use it BUT with a special case during discovery
    if (this.config.estimated_total_photos) {
      // During active discovery, if estimate >> discovered, use discovered count
      // This prevents empty queues during initial scanning
      if (this.discoveryInProgress && this.config.estimated_total_photos > currentDiscoveredCount * 20) {
        // Estimate is 20x+ larger than discovered - still early in discovery
        const tempCount = Math.max(currentDiscoveredCount * 3, 100); // Use 3x discovered or min 100
        this._log('📊 Early discovery mode: estimate', this.config.estimated_total_photos, 
                  '>> discovered', currentDiscoveredCount, '- using temporary count:', tempCount);
        return tempCount;
      }
      
      // Normal case: use the estimate
      if (this.cachedTotalCount !== this.config.estimated_total_photos) {
        this.cachedTotalCount = this.config.estimated_total_photos;
        this.cachedCountSource = 'user_estimate';
        this._log('📊 Using user estimate for total count:', this.cachedTotalCount);
      }
      return this.cachedTotalCount;
    }
    
    // 2. If we've locked the count (discovery complete), use cached value
    if (this.totalCountLocked && this.cachedTotalCount) {
      return this.cachedTotalCount;
    }
    
    // 3. If significant change in discovered count, recalculate
    const changeThreshold = 0.2; // 20% change
    const countGrowth = this.lastDiscoveredCount > 0 
      ? (currentDiscoveredCount - this.lastDiscoveredCount) / this.lastDiscoveredCount 
      : 1.0;
    
    if (!this.cachedTotalCount || countGrowth > changeThreshold) {
      // Use conservative adaptive estimate
      const conservativeMultiplier = this.discoveryInProgress ? 3.0 : 1.2;
      this.cachedTotalCount = Math.max(currentDiscoveredCount, Math.round(currentDiscoveredCount * conservativeMultiplier));
      this.lastDiscoveredCount = currentDiscoveredCount;
      this.cachedCountSource = 'adaptive';
      
      this._log('📊 Updated adaptive total count estimate:', this.cachedTotalCount, 
                'discovered:', currentDiscoveredCount, 'growth:', (countGrowth * 100).toFixed(1) + '%');
    }
    
    return this.cachedTotalCount;
  }

  // Lock the total count when discovery is complete
  lockTotalCount() {
    if (!this.config.estimated_total_photos && this.cachedTotalCount) {
      this.totalCountLocked = true;
      this.cachedCountSource = 'discovery_complete';
      this._log('🔒 Total count locked at discovery completion:', this.cachedTotalCount);
    }
  }

  // Start the queue system
  async initialize() {
    if (!this.config.enabled || this.card.config.folder_mode !== 'random') {
      this._log('❌ Queue disabled or not in random mode');
      return false;
    }

    // SIMPLIFIED: Only check if explicitly paused, don't check DOM at initialization
    if (this.card._backgroundPaused) {
      this._log('❌ Skipping initialization - explicitly paused:', !!this.card._backgroundPaused);
      return false;
    }

    this._log('🚀 Starting subfolder queue initialization');
    this.isScanning = true;
    this.discoveryInProgress = true;
    this.discoveryStartTime = Date.now();
    
    try {
      // Start scan and wait for completion
      await this.quickScan();
      this._log('✅ Initialize completed via full scan');
      
      return true;
    } catch (error) {
      this._log('❌ Queue initialization failed:', error);
      this.isScanning = false;
      this.discoveryInProgress = false;
      return false;
    } finally {
      // Always clear discovery flag when initialization completes or fails
      this.discoveryInProgress = false;
      // Lock total count for consistent probability calculations
      this.lockTotalCount();
    }
  }

  // Quick initial scan of all available folders (legacy mode)
  async quickScan() {
    this._log('⚡ Starting legacy quick scan for all folders');
    
    try {
      // Get the base media path from the card's configuration
      const basePath = this.card.config.media_path;
      if (!basePath) {
        this._log('❌ No base media path configured');
        this.isScanning = false;
        return false;
      }

      this._log('🔍 Discovering subfolders from base path:', basePath, 'max depth:', this.config.scan_depth);
      
      // Check if hierarchical scan is enabled (Phase 2.3 integration)
      if (this.config.use_hierarchical_scan) {
        this._log('🏗️ Using NEW hierarchical scan architecture');
        
        try {
          // Use the new hierarchical scan approach
          const scanResult = await this.hierarchicalScanAndPopulate(basePath, 0);
          
          if (!scanResult || scanResult.error) {
            this._log('⚠️ Hierarchical scan failed:', scanResult?.error || 'unknown error');
            // Fallback to legacy system
            this._log('🔄 Falling back to legacy streaming scan...');
            return await this.legacyQuickScan(basePath);
          }
          
          this._log('✅ Hierarchical scan completed:', 
                   'files processed:', scanResult.filesProcessed,
                   'files added:', scanResult.filesAdded, 
                   'folders processed:', scanResult.foldersProcessed,
                   'queue size:', this.queue.length);
          
          // Final shuffle to ensure good randomization of all items
          if (this.queue.length > 0) {
            this.shuffleQueue();
            this.queueShuffleCounter = 0;
            this._log('🔀 Final shuffle completed after hierarchical scan - queue size:', this.queue.length);
          }
          
          // Early population complete since we populated immediately during scan
          if (this.resolveEarlyPopulation) {
            this.resolveEarlyPopulation('early-population-complete');
          }
          
          return true;
          
        } catch (error) {
          this._log('❌ Hierarchical scan error:', error.message);
          // Fallback to legacy system on error
          this._log('🔄 Falling back to legacy streaming scan...');
          return await this.legacyQuickScan(basePath);
        }
      } else {
        // Use legacy streaming approach
        this._log('🔄 Using legacy streaming scan architecture');
        return await this.legacyQuickScan(basePath);
      }
      
    } catch (error) {
      this._log('❌ Quick scan failed:', error);
      this.isScanning = false;
      return false;
    }
  }

  // Legacy quickScan implementation (preserved for compatibility)
  async legacyQuickScan(basePath) {
    try {
      // Use a progressive approach - scan what we can and complete even if some folders timeout
      let subfolders = [];
      
      // Use streaming initialization instead of early population
      this._log('🚀 Starting legacy streaming folder scan...');
      
      const streamingSuccess = await this.initializeWithStreamingScans(basePath);
      
      if (!streamingSuccess) {
        this._log('⚠️ No subfolders found, subfolder queue disabled');
        this.isScanning = false;
        return false;
      }
      
      this._log('✅ Legacy streaming initialization started - queue will populate as scans complete');
      
      // Scanning continues in background, mark as complete
      this.isScanning = false;
      this._log('📁 Found', subfolders.length, 'subfolders total');
      
      // Note: Queue population is handled during folder discovery
      this._log('✅ Discovery and queue population complete, queue has', this.queue.length, 'items from', this.discoveredFolders.length, 'discovered folders');
      this._log('📊 Queue summary:', this.queue.slice(0, 3).map(item => item.title || 'unknown').join(', '), this.queue.length > 3 ? '...' : '');
      
      // Legacy mode complete - hierarchical scan is now the preferred method
      
      return true;
      
    } catch (error) {
      this._log('⚠️ Legacy streaming initialization failed:', error.message);
      this.isScanning = false;
      return false;
    }
  }

  // NEW HIERARCHICAL SCAN METHODS - Phase 1.1 Implementation
  
  /**
   * Hierarchical scan and populate - single-pass folder scanning with immediate queue population
   * Replaces the two-phase discovery/streaming system with elegant level-by-level processing
   * @param {string} basePath - The root media path to scan
   * @param {number} currentDepth - Current scanning depth (0 = root level)  
   * @param {number} maxDepth - Maximum depth to scan (uses config.scan_depth if not provided)
   */
  async hierarchicalScanAndPopulate(basePath, currentDepth = 0, maxDepth = null) {
    // Pause scanning if the card has background activity paused (e.g., not visible)
    await this._waitIfBackgroundPaused();
    
    // Check if scanning has been stopped/paused
    if (!this.isScanning) {
      this._log('🛑 Scanning stopped/paused - exiting hierarchical scan');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    // Use configured scan depth if maxDepth not explicitly provided
    const effectiveMaxDepth = maxDepth !== null ? maxDepth : (this.config.scan_depth || 2);
    
    this._log('🏗️ Hierarchical scan starting at:', basePath, 'depth:', currentDepth, 'max:', effectiveMaxDepth);
    
    // Depth limiting with configuration support
    if (currentDepth >= effectiveMaxDepth) {
      this._log('📁 Max depth reached:', currentDepth, '(configured limit:', effectiveMaxDepth, ')');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    try {
      // Get folder contents with timeout (3 minutes for all folders)
      // Processing in parallel handles the wait
      const timeoutDuration = 180000; // 3 minutes for all folders
      
      const apiTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`API timeout at depth ${currentDepth} after ${timeoutDuration/1000}s`)), timeoutDuration)
      );
      
      // Pause before making API call if background is paused
      await this._waitIfBackgroundPaused();
      
      // Check if scanning has been stopped/paused
      if (!this.isScanning) {
        this._log('🛑 Scanning stopped/paused - exiting before API call');
        return { filesProcessed: 0, foldersProcessed: 0 };
      }
      
      const folderContents = await Promise.race([
        this.card.hass.callWS({
          type: "media_source/browse_media",
          media_content_id: basePath
        }),
        apiTimeout
      ]);

      if (!folderContents?.children) {
        this._log('📁 No children found at depth:', currentDepth);
        return;
      }

      // Extract folder name for metadata tracking
      const folderName = basePath.split('/').pop() || 'root';
      
      // Separate files and subfolders - filter for supported media files only
      const allFiles = folderContents.children.filter(child => child.media_class === 'image' || child.media_class === 'video');
      const files = allFiles.filter(file => this.card._isMediaFile(file.media_content_id || file.title || ''));
      const subfolders = folderContents.children.filter(child => child.can_expand);

      this._log('📁 Processing folder:', folderName, 'files:', files.length, 'subfolders:', subfolders.length, 'depth:', currentDepth);

      // Track this folder in discoveredFolders for debug interface
      if (files.length > 0 || subfolders.length > 0) {
        const folderInfo = {
          path: basePath,
          title: folderName,
          fileCount: files.length,
          files: files,
          depth: currentDepth,
          isSampled: false // This is hierarchical, not sampled
        };
        
        // Add to discoveredFolders if not already present
        const existingIndex = this.discoveredFolders.findIndex(f => f.path === basePath);
        if (existingIndex === -1) {
          this.discoveredFolders.push(folderInfo);
          this._log('📂 Added folder to discoveredFolders:', folderName, '(total:', this.discoveredFolders.length, 'files:', files.length, ')');
        } else {
          // Update existing entry
          this.discoveredFolders[existingIndex] = folderInfo;
        }
      }

      // Process files in current folder with weighted probability sampling
      let filesAdded = 0;
      const basePerFileProbability = this.calculatePerFileProbability();
      const weightMultiplier = this.getPathWeightMultiplier(basePath);
      const perFileProbability = Math.min(basePerFileProbability * weightMultiplier, 1.0); // Cap at 100%
      
      // Log priority weighting info
      if (weightMultiplier > 1.0) {
        this._log('⭐ PRIORITY FOLDER detected:', folderName, 'weight multiplier:', weightMultiplier + 'x', 
                  'probability boosted from', (basePerFileProbability * 100).toFixed(4) + '%', 
                  'to', (perFileProbability * 100).toFixed(4) + '%');
      }
      
      // Filter files to exclude already shown items and items already in queue
      const existingQueueIds = new Set(this.queue.map(item => item.media_content_id));
      const availableFiles = files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !existingQueueIds.has(file.media_content_id)
      );
      
      this._log('📁 Hierarchical filtering:', availableFiles.length, 'of', files.length, 'files available (excluding shown:', this.shownItems.size, 'and queued:', existingQueueIds.size, ')');
      
      for (const file of availableFiles) {
        // Check if we should pause before processing each file
        await this._waitIfBackgroundPaused();
        
        if (Math.random() < perFileProbability) {
          await this.addFileToQueueWithBatching(file, folderName);
          filesAdded++;
        }
      }
      
      // Log sampling results for this folder
      this._log('📊 HIERARCHICAL sampling for', folderName + ':', availableFiles.length, 'available files, per-file probability:', 
                (perFileProbability * 100).toFixed(4) + '%' + (weightMultiplier > 1.0 ? ' (boosted ' + weightMultiplier + 'x)' : ''), 
                filesAdded, 'files selected');

      if (filesAdded > 0) {
        this._log('✅ Added', filesAdded, 'files from folder:', folderName, 'total queue size:', this.queue.length);
      }

      // Process subfolders recursively with proper depth control and async coordination
      let subfoldersProcessed = 0;
      if (subfolders.length > 0 && currentDepth < effectiveMaxDepth - 1) {
        this._log('🔄 Recursing into', subfolders.length, 'subfolders at depth:', currentDepth + 1);
        // Ensure we don't proceed while background activity is paused
        await this._waitIfBackgroundPaused();

        const subfolderResults = await this.processLevelConcurrently(
          subfolders, 
          2, // maxConcurrent 
          currentDepth + 1, 
          effectiveMaxDepth
        );
        
        subfoldersProcessed = subfolderResults?.foldersProcessed || subfolders.length;
      }

      // Return progress tracking information
      return {
        filesProcessed: files.length,
        filesAdded: filesAdded,
        foldersProcessed: subfoldersProcessed,
        depth: currentDepth
      };

    } catch (error) {
      this._log('⚠️ Hierarchical scan error at depth', currentDepth, ':', error.message);
      // Return error state but don't fail completely  
      return {
        filesProcessed: 0,
        filesAdded: 0, 
        foldersProcessed: 0,
        depth: currentDepth,
        error: error.message
      };
    }
  }

  /**
   * Process multiple folders concurrently with controlled parallelism
   * @param {Array} folders - Folders to process
   * @param {number} maxConcurrent - Maximum concurrent operations (default: 2)
   * @param {number} nextDepth - Depth for recursive calls
   * @param {number} maxDepth - Maximum scan depth
   */
  async processLevelConcurrently(folders, maxConcurrent = 2, nextDepth, maxDepth) {
    if (!folders || folders.length === 0) return;
    
    this._log('🔄 Processing', folders.length, 'folders concurrently (max:', maxConcurrent, 'depth:', nextDepth, ')');
    
    let processedCount = 0;
    let errorCount = 0;
    
    // Process folders in batches to control concurrency
    for (let i = 0; i < folders.length; i += maxConcurrent) {
      const batch = folders.slice(i, i + maxConcurrent);
      const batchSize = batch.length;
      
      this._log('📦 Processing batch', Math.floor(i / maxConcurrent) + 1, 'of', Math.ceil(folders.length / maxConcurrent), '(' + batchSize + ' folders)');
      
      const batchPromises = batch.map((folder, index) => (async () => {
        // Respect background pause before starting each folder scan
        await this._waitIfBackgroundPaused();
        try {
          await this.hierarchicalScanAndPopulate(folder.media_content_id, nextDepth, maxDepth);
          processedCount++;
          this._log('✅ Completed folder:', folder.title || 'unnamed', `(${processedCount}/${folders.length})`);
        } catch (error) {
          errorCount++;
          this._log('❌ Failed folder:', folder.title || 'unnamed', error.message);
        }
      })());
      
      try {
        await Promise.allSettled(batchPromises);
      } catch (error) {
        this._log('⚠️ Unexpected batch processing error:', error.message);
      }
    }
    
    this._log('🏁 Level processing complete:', processedCount, 'successful,', errorCount, 'errors, queue size:', this.queue.length);
    
    // Return progress information for async coordination
    return {
      foldersProcessed: processedCount,
      folderErrors: errorCount,
      totalFolders: folders.length,
      depth: nextDepth
    };
  }

  /**
   * Add file to queue with batched shuffling optimization  
   * @param {Object} file - Media file object to add
   * @param {string} folderName - Optional folder name for history tracking
   */
  async addFileToQueueWithBatching(file, folderName = null) {
    if (!file) return;

    // Add file to main queue (use original file format like existing implementation)
    this.queue.push(file);

    // Add to history with metadata (matching existing addFilesToQueue pattern)
    const historyEntry = {
      file: file,
      timestamp: new Date().toISOString(),
      folderName: folderName || this.extractFolderName(file),
      source: 'hierarchical_scan'
    };
    this.queueHistory.push(historyEntry);

    // Increment shuffle counter
    this.queueShuffleCounter = (this.queueShuffleCounter || 0) + 1;

    // Calculate dynamic shuffle threshold based on current queue size (10% with min/max limits)
    const shuffleThreshold = Math.min(
      this.SHUFFLE_MAX_BATCH, 
      Math.max(this.SHUFFLE_MIN_BATCH, Math.floor(this.queue.length * this.SHUFFLE_PERCENTAGE))
    );

    // Shuffle when counter reaches the dynamic threshold
    if (this.queueShuffleCounter >= shuffleThreshold) {
      this.shuffleQueue();
      this.queueShuffleCounter = 0;
      this._log('🔀 Queue shuffled at', this.queue.length, 'items (threshold:', shuffleThreshold, '- 10% of', this.queue.length, ')');
    }

    // Log file addition for first few files (debug purposes)
    if (this.queue.length <= 5) {
      this._log('📎 Added file to queue:', file.title, 'queue size:', this.queue.length);
    }

    // Debug logging for debug mode (matching existing pattern from addFilesToQueue)
    if (this.card && this.card.config && this.card.config.debug_queue_mode) {
      this.card._debugLogEvent('file_added', `Added to queue`, {
        folder: historyEntry.folderName,
        filename: file.title || file.media_content_id.split('/').pop(),
        source: 'hierarchical_scan',
        queueSize: this.queue.length,
        historySize: this.queueHistory.length
      });
    }
  }

  // Discover all subfolders under the base path (recursive with reliability)
  async discoverSubfolders(basePath, currentDepth = 0, forceMaxDepth = null) {
    const maxDepth = forceMaxDepth || this.config.scan_depth || 2;
    this._log('🔍 Starting recursive subfolder discovery from:', basePath, 'depth:', currentDepth, 'max:', maxDepth);
    
    if (currentDepth >= maxDepth) {
      this._log('📁 Max depth reached:', currentDepth);
      return [];
    }
    
    try {
      // Get folder contents with timeout (3 minutes for all folders)
      const apiTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`API timeout at depth ${currentDepth} after 180s`)), 180000)
      );
      
      const folderContents = await Promise.race([
        this.card.hass.callWS({
          type: "media_source/browse_media",
          media_content_id: basePath
        }),
        apiTimeout
      ]);

      const allSubfolders = [];
      
      if (!folderContents || !folderContents.children) {
        this._log('📁 No children found at depth:', currentDepth);
        return [];
      }
      
      this._log('📁 Found', folderContents.children.length, 'items at depth:', currentDepth);
      
      // Process directories only - RANDOMIZE ORDER for variety
      const directories = folderContents.children.filter(item => item.media_class === 'directory');
      
      // Shuffle directories to ensure different folders get early population each time
      const shuffledDirectories = [...directories];
      for (let i = shuffledDirectories.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledDirectories[i], shuffledDirectories[j]] = [shuffledDirectories[j], shuffledDirectories[i]];
      }
      this._log('🎲 Randomized folder processing order - starting with:', shuffledDirectories.slice(0, 3).map(d => d.title).join(', '));
      
      // Start batch scheduler for processing concurrent results
      this.startBatchScheduler();
      this._log('🎛️ Batch scheduler started for concurrent folder processing');
      
      // Start all folder scans concurrently instead of sequentially
      const folderScanPromises = shuffledDirectories.map(async (dir) => {
        let folderInfo = null;
        try {
          this._log('🚀 CONCURRENT: Processing folder:', dir.title, 'at depth:', currentDepth + 1);
          
          // Scan this folder for files (with timeout)
          const folderScanStartTime = Date.now();
          this._log('🕐 Concurrent scan starting at', folderScanStartTime, 'for', dir.title);
          
          const folderScanTimeout = new Promise((_, reject) => 
            setTimeout(() => {
              const elapsed = Date.now() - folderScanStartTime;
              this._log('⏰ Concurrent timeout triggered after', elapsed + 'ms for', dir.title);
              reject(new Error(`Folder scan timeout: ${dir.title}`));
            }, 20000) // 20 second timeout - balance between thoroughness and UX
          );
          
          folderInfo = await Promise.race([
            this.scanFolderFiles(dir.media_content_id).then(result => {
              const elapsed = Date.now() - folderScanStartTime;
              this._log('✅ Main folder scan completed after', elapsed + 'ms for', dir.title);
              return result;
            }).catch(error => {
              const elapsed = Date.now() - folderScanStartTime;
              this._log('❌ Main folder scan failed after', elapsed + 'ms for', dir.title, ':', error.message);
              throw error;
            }),
            folderScanTimeout
          ]);
          
          // Add this folder if it has files
          if (folderInfo.fileCount > 0) {
            const sampleInfo = folderInfo.isSampled ? ` (random sampled 1:${folderInfo.sampleRatio})` : '';
            this._log('✅ Folder has files:', dir.title, 'count:', folderInfo.fileCount + sampleInfo);
            const folderData = {
              path: dir.media_content_id,
              title: dir.title,
              fileCount: folderInfo.fileCount,
              files: folderInfo.files,
              depth: currentDepth + 1,
              isSampled: folderInfo.isSampled,
              sampleRatio: folderInfo.sampleRatio
            };
            allSubfolders.push(folderData);
          }
          
          // Recursively scan deeper if within depth limit
          if (currentDepth + 1 < maxDepth) {
            this._log('� Recursing into:', dir.title, 'next depth:', currentDepth + 2);
            
            // Skip recursion for large folders to prevent timeouts and hangs
            if (folderInfo.fileCount > 3000) {
              this._log('⚡ Skipping recursion for large folder (performance):', dir.title, 'files:', folderInfo.fileCount);
            } else {
              this._log('🔄 Recursing into:', dir.title, 'next depth:', currentDepth + 2, 'files:', folderInfo.fileCount);
              
              try {
                // Simple recursive call with timeout
                const recursiveTimeout = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Recursive timeout: ${dir.title}`)), 15000) // 15 seconds max
                );
                
                const nestedFolders = await Promise.race([
                  this.discoverSubfolders(dir.media_content_id, currentDepth + 1, maxDepth),
                  recursiveTimeout
                ]);
                
                if (nestedFolders && nestedFolders.length > 0) {
                  this._log('📂 Found', nestedFolders.length, 'nested folders in:', dir.title);
                  allSubfolders.push(...nestedFolders);
                }
                
              } catch (recursiveError) {
                this._log('⚠️ Recursive scan failed for:', dir.title, recursiveError.message);
                // Continue processing other folders - don't let one failure stop everything
              }
            }
          }
          
        } catch (error) {
          this._log('⚠️ Folder processing error:', dir.title, 'error:', error.message);
          
          // Emergency timeout recovery for large folders
          const isTimeoutError = error.message.toLowerCase().includes('timeout');
          
          // Apply emergency recovery to any folder that times out
          if (isTimeoutError) {
            this._log(`🚨 Emergency quick scan timeout for ${dir.title} - attempting recovery (error: ${error.message})`);
            try {
              const emergencyResult = await this.emergencyQuickScan(dir.media_content_id, dir.title);
              if (emergencyResult) {
                this._log(`✅ Emergency scan successful for ${dir.title} - adding to discovered folders`);
                // Add the emergency result to discovered folders
                if (!this.tempDiscoveredFolders) {
                  this.tempDiscoveredFolders = [];
                }
                this.tempDiscoveredFolders.push(emergencyResult);
                
                // Also try to add to queue immediately if we have one
                if (this.queue && this.queue.length > 0) {
                  try {
                    await this.addFolderToQueue(emergencyResult);
                    this._log(`✅ Emergency folder ${dir.title} added to queue immediately`);
                  } catch (queueError) {
                    this._log(`⚠️ Could not add emergency folder to queue: ${queueError.message}`);
                  }
                }
                return { dir, folderInfo: emergencyResult, success: true };
              } else {
                this._log(`❌ Emergency scan returned null for ${dir.title} - no synthetic folder created`);
              }
            } catch (emergencyError) {
              this._log(`❌ Emergency scan also failed for ${dir.title}: ${emergencyError.message}`);
              // Emergency scan failed completely - create a synthetic folder as last resort
              const syntheticFolder = this.createSyntheticFolderEntry(dir.media_content_id, dir.title);
              this._log(`🔄 Created last-resort synthetic folder for ${dir.title} with estimated ${syntheticFolder.fileCount} files`);
              return { dir, folderInfo: syntheticFolder, success: true };
            }
          } else if (isTimeoutError) {
            this._log(`⏰ Timeout detected for non-camera folder: ${dir.title}`);
          }
          
          // If we at least got the file count, add this folder anyway (important for large folders)
          if (folderInfo && folderInfo.fileCount > 0) {
            this._log('🚨 Adding folder despite error (has', folderInfo.fileCount, 'files):', dir.title);
            const folderData = {
              path: dir.media_content_id,
              title: dir.title,
              fileCount: folderInfo.fileCount,
              files: folderInfo.files,
              depth: currentDepth + 1,
              isSampled: folderInfo.isSampled,
              sampleRatio: folderInfo.sampleRatio,
              hasError: true
            };
            allSubfolders.push(folderData);
            
            // Also track for early population and progressive enhancement
            if (this.tempDiscoveredFolders) {
              this.tempDiscoveredFolders.push(folderData);
              this._log('📦 Added error-recovered folder to temp discovered folders (now', this.tempDiscoveredFolders.length, 'total)');
            }
          } else if (error.message && error.message.includes('timeout')) {
            // Special handling for timeouts - try a quick emergency scan
            this._log('🚨 Timeout detected, attempting emergency quick scan for:', dir.title);
            try {
              const emergencyInfo = await this.emergencyQuickScan(dir.media_content_id, dir.title);
              if (emergencyInfo && emergencyInfo.fileCount > 0) {
                this._log('✅ Emergency scan successful for', dir.title, '- found', emergencyInfo.fileCount, 'files');
                allSubfolders.push(emergencyInfo);
                
                if (this.tempDiscoveredFolders) {
                  this.tempDiscoveredFolders.push(emergencyInfo);
                  this._log('📦 Added emergency-scanned folder to temp discovered folders (now', this.tempDiscoveredFolders.length, 'total)');
                }
              }
            } catch (emergencyError) {
              this._log('⚠️ Emergency scan also failed for:', dir.title, emergencyError.message);
            }
          }
          // Continue with other folders even if one fails
        }
        
        return { dir, folderInfo, success: true };
      });
      
      // Limit concurrent execution to prevent I/O overload
      const MAX_DISCOVERY_CONCURRENT = 2; 
      this._log('⏳ Executing', folderScanPromises.length, 'folder scans with max', MAX_DISCOVERY_CONCURRENT, 'concurrent...');
      const results = await this.executeWithConcurrencyLimit(folderScanPromises, MAX_DISCOVERY_CONCURRENT);
      
      // Process results from concurrent scans
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.folderInfo && result.value.folderInfo.fileCount > 0) {
          const { dir, folderInfo } = result.value;
          this._log('✅ CONCURRENT: Successfully processed', dir.title, 'with', folderInfo.fileCount, 'files');
          
          const folderData = {
            path: dir.media_content_id,
            title: dir.title,
            fileCount: folderInfo.fileCount,
            files: folderInfo.files,
            depth: currentDepth + 1,
            isSampled: folderInfo.isSampled,
            sampleRatio: folderInfo.sampleRatio
          };
          allSubfolders.push(folderData);
          
          // Add to temp discovered folders for early population
          if (this.tempDiscoveredFolders) {
            this.tempDiscoveredFolders.push(folderData);
          }
          
        } else if (result.status === 'rejected') {
          this._log('❌ CONCURRENT: Folder scan failed:', shuffledDirectories[index]?.title, result.reason?.message);
        }
      });

      // Sort by file count (largest first) at the top level only
      if (currentDepth === 0) {
        allSubfolders.sort((a, b) => b.fileCount - a.fileCount);
        this._log('✅ Recursive discovery complete:', allSubfolders.length, 'total subfolders found');
        
        // Log depth distribution
        const depthCounts = {};
        allSubfolders.forEach(folder => {
          depthCounts[folder.depth] = (depthCounts[folder.depth] || 0) + 1;
        });
        this._log('📊 Depth distribution:', depthCounts);
        
        // Log all discovered paths for debugging
        this._log('📁 All discovered folder paths:');
        allSubfolders.forEach(folder => {
          this._log(`  • ${folder.title} (${folder.fileCount} files) - Path: ${folder.path}`);
        });
      }
      
      return allSubfolders;
      
    } catch (error) {
      this._log('❌ Failed at depth', currentDepth, ':', error.message);
      return [];
    }
  }

  // Helper method to execute promises with concurrency limit
  async executeWithConcurrencyLimit(promises, limit) {
    const results = [];
    const executing = [];
    
    for (const promise of promises) {
      const p = promise.then(result => {
        executing.splice(executing.indexOf(p), 1);
        return { status: 'fulfilled', value: result };
      }).catch(error => {
        executing.splice(executing.indexOf(p), 1);
        return { status: 'rejected', reason: error };
      });
      
      results.push(p);
      executing.push(p);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
    
    return Promise.all(results);
  }

  // Discover subfolders with immediate early population
  // Stream files from a folder in real-time batches (NEW STREAMING APPROACH)
  async streamFolderFiles(folderPath, folderTitle) {
    const BATCH_SIZE = 100; // Process files in batches of 100
    const TIMEOUT_MS = 300000; // 5 minutes safety timeout
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const batchBuffer = [];
      let totalProcessed = 0;
      let isComplete = false;
      
      // Safety timeout
      const safetyTimeout = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        this._log('⏰ SAFETY TIMEOUT after', Math.round(elapsed/1000) + 's for folder:', folderTitle);
        isComplete = true;
        reject(new Error(`Safety timeout: ${folderTitle}`));
      }, TIMEOUT_MS);
      
      this._log('🚀 Starting streaming scan for:', folderTitle);
      
      // Start the WebSocket call
      this.card.hass.callWS({
        type: "media_source/browse_media", 
        media_content_id: folderPath
      }).then(folderContents => {
        clearTimeout(safetyTimeout);
        
        if (isComplete) return; // Already timed out
        
        const totalChildren = folderContents?.children?.length || 0;
        this._log('📁 Streaming folder has', totalChildren, 'total items:', folderTitle);
        
        if (!folderContents || !folderContents.children || folderContents.children.length === 0) {
          this._log('📂 Empty folder:', folderTitle);
          resolve({ files: [], fileCount: 0, title: folderTitle, path: folderPath });
          return;
        }
        
        // Process files in streaming batches using the batch scheduler
        this.processFolderChildrenInBatches(folderContents.children, BATCH_SIZE, (batch, batchIndex, isLastBatch) => {
          if (isComplete) return;
          
          totalProcessed += batch.length;
          this._log('📦 Processing batch', batchIndex + 1, 'of', folderTitle + ':', batch.length, 'files (total processed:', totalProcessed + ')');
          
          // Schedule batch for interleaved processing instead of adding directly
          if (batch.length > 0) {
            const onComplete = isLastBatch ? () => {
              isComplete = true;
              this._log('✅ Completed streaming scan for:', folderTitle, '- total files:', totalProcessed);
              resolve({ 
                files: [], // Don't return files (already added to queue via scheduler)
                fileCount: totalProcessed, 
                title: folderTitle, 
                path: folderPath,
                streamingComplete: true
              });
            } : null;
            
            this.addBatchToQueue(batch, folderTitle, batchIndex, onComplete);
          } else if (isLastBatch) {
            // Handle edge case of empty last batch
            isComplete = true;
            resolve({ 
              files: [], 
              fileCount: totalProcessed, 
              title: folderTitle, 
              path: folderPath,
              streamingComplete: true
            });
          }
        }, folderTitle);
        
      }).catch(error => {
        clearTimeout(safetyTimeout);
        if (!isComplete) {
          isComplete = true;
          this._log('❌ Streaming scan failed for:', folderTitle, error.message);
          reject(error);
        }
      });
    });
  }

  // Process folder children in batches with sampling and staggered timing for interleaving
  processFolderChildrenInBatches(children, batchSize, onBatch, folderTitle) {
    const allMediaFiles = [];
    
    // Filter media files first - check both media class and file extension
    for (const child of children) {
      if (child.media_class === 'image' || child.media_class === 'video') {
        if (child.media_content_type && 
            (child.media_content_type.startsWith('image/') || 
             child.media_content_type.startsWith('video/'))) {
          // Additional check: ensure file extension is supported
          if (this.card._isMediaFile(child.media_content_id || child.title || '')) {
            allMediaFiles.push(child);
          }
        }
      }
    }
    
    this._log('📄 Found', allMediaFiles.length, 'media files out of', children.length, 'total children in', folderTitle);
    
    // SAMPLING LOGIC - Don't take all files, sample based on folder size
    const maxFilesPerFolder = this.calculateMaxFilesForFolder(allMediaFiles.length, folderTitle);
    const mediaFiles = this.selectRandomFiles(allMediaFiles, maxFilesPerFolder);
    
    this._log('🎲 SAMPLING:', folderTitle, '-', mediaFiles.length, 'sampled from', allMediaFiles.length, 'available (max allowed:', maxFilesPerFolder, ', queue size target:', this.config.queue_size + ')');
    
    // Process in batches with randomized delays to encourage interleaving
    const totalBatches = Math.ceil(mediaFiles.length / batchSize);
    for (let i = 0; i < mediaFiles.length; i += batchSize) {
      const batch = mediaFiles.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      const isLastBatch = (i + batchSize) >= mediaFiles.length;
      
      // Use variable delays to encourage interleaving between folders
      const baseDelay = batchIndex * 50; // Base delay increases per batch
      const randomOffset = Math.random() * 100; // Random offset 0-100ms
      const totalDelay = baseDelay + randomOffset;
      
      setTimeout(() => {
        onBatch(batch, batchIndex, isLastBatch);
      }, totalDelay);
    }
  }

  // Legacy method kept for compatibility - now uses streaming internally
  async scanFolderFiles(folderPath) {
    try {
      const folderTitle = folderPath.split('/').pop() || 'Unknown';
      const result = await this.streamFolderFiles(folderPath, folderTitle);
      
      // For legacy compatibility, return the folder info
      return {
        files: result.files,
        fileCount: result.fileCount,
        title: result.title,
        path: result.path
      };
    } catch (error) {
      this._log('❌ Legacy scan fallback failed:', error.message);
      return { files: [], fileCount: 0, title: folderPath.split('/').pop() || 'Unknown', path: folderPath };
    }
  }

  // Calculate threshold for switching from local to global sampling
  calculateSufficientQueueSize() {
    const refreshRate = this.config.refresh_seconds || 5; // Default 5 seconds
    const targetMinutes = 3; // 3 minutes worth of content (180 seconds)
    const sufficientSize = Math.ceil((targetMinutes * 60) / refreshRate);
    return Math.max(sufficientSize, 30); // Minimum 30 items
  }

  // Calculate maximum files to sample from a folder using adaptive strategy
  calculateMaxFilesForFolder(folderSize, folderTitle) {
    const currentQueueSize = this.queue.length;
    const sufficientQueueSize = this.calculateSufficientQueueSize();
    const useGlobalSampling = currentQueueSize >= sufficientQueueSize;
    
    // Check if we're switching from local to global sampling mode
    if (this.samplingModeLogged !== useGlobalSampling && useGlobalSampling) {
      this._log('🔄 SWITCHING TO GLOBAL SAMPLING - Clearing queue for statistical rebuild (was:', currentQueueSize, 'items)');
      // Clear existing queue to rebuild with proper statistical sampling
      this.queue = [];
      this.queueHistory = [];
    }
    
    // Log sampling mode switch for first few folders
    if (this.samplingModeLogged !== useGlobalSampling) {
      this.samplingModeLogged = useGlobalSampling;
      const mode = useGlobalSampling ? 'GLOBAL probability' : 'LOCAL folder-based';
      this._log('🔄 SAMPLING MODE:', mode, '(queue:', this.queue.length, '/', sufficientQueueSize, 'threshold)');
    }
    
    if (useGlobalSampling && this.config.estimated_total_photos) {
      // Phase 2: Use global probability-based sampling (true statistical distribution)
      return this.calculateGlobalProbabilitySampling(folderSize, folderTitle);
    } else {
      // Phase 1: Use local folder-based sampling (fast initial population)
      return this.calculateLocalFolderSampling(folderSize, folderTitle);
    }
  }

  // Phase 1: Local folder-based sampling for initial queue population
  calculateLocalFolderSampling(folderSize, folderTitle) {
    const targetQueueSize = this.config.queue_size || 1000;
    const estimatedFolderCount = Math.max(this.discoveredFolders.length, 10);
    
    // Base allocation per folder
    const baseAllocation = Math.floor(targetQueueSize / estimatedFolderCount);
    
    let result;
    let category;
    
    // Smart sampling based on folder size
    if (folderSize <= 50) {
      // Small folders: take most files (up to 80%)
      result = Math.min(folderSize, Math.floor(folderSize * 0.8));
      category = 'small';
    } else if (folderSize <= 200) {
      // Medium folders: take moderate sample
      result = Math.min(baseAllocation * 2, Math.floor(folderSize * 0.5));
      category = 'medium';
    } else if (folderSize <= 1000) {
      // Large folders: take smaller percentage but reasonable absolute amount
      result = Math.min(baseAllocation * 3, Math.floor(folderSize * 0.3));
      category = 'large';
    } else {
      // Massive folders: take small percentage but cap at reasonable limit
      const maxForMassive = Math.min(200, baseAllocation * 4); // Cap at 200 files max
      const percentageSample = Math.floor(folderSize * 0.1); // 10% of massive folders
      result = Math.min(maxForMassive, percentageSample);
      category = 'massive';
    }
    
    this._log('📊 LOCAL sampling for', folderTitle + ':', category, 'folder with', folderSize, 'files → sample', result, 'files (base allocation:', baseAllocation + ')');
    
    return result;
  }

  // Phase 2: True per-file probability sampling using estimated_total_photos
  calculateGlobalProbabilitySampling(folderSize, folderTitle) {
    const totalPhotos = this.config.estimated_total_photos;
    const targetQueueSize = this.config.queue_size || 1000;
    
    if (!totalPhotos || totalPhotos <= 0) {
      this._log('⚠️ No estimated_total_photos configured, falling back to folder-based sampling');
      return Math.min(folderSize, 10); // Fallback to reasonable limit
    }
    
    // CORRECT FORMULA: targetQueueSize / totalPhotos (not 1 / totalPhotos)
    const perFileProbability = targetQueueSize / totalPhotos;
    
    // Evaluate each file in this folder independently
    let selectedCount = 0;
    for (let i = 0; i < folderSize; i++) {
      if (Math.random() < perFileProbability) {
        selectedCount++;
      }
    }
    
    this._log('📊 GLOBAL per-file sampling for', folderTitle + ':', folderSize, 'files, per-file probability:', (perFileProbability * 100).toFixed(4) + '%,', selectedCount, 'files selected');
    
    return selectedCount;
  }

  // Calculate per-file probability for hierarchical scanning with dynamic queue-based adjustment
  calculatePerFileProbability() {
    const totalPhotos = this.config.estimated_total_photos;
    const targetQueueSize = this.config.queue_size || 1000;
    const currentQueueSize = this.queue.length;
    
    if (!totalPhotos || totalPhotos <= 0) {
      this._log('⚠️ No estimated_total_photos configured for per-file probability');
      return 0.01; // Fallback: 1% chance per file
    }
    
    // Base probability: targetQueueSize / totalPhotos
    const baseProbability = targetQueueSize / totalPhotos;
    
    // Dynamic adjustment based on current queue size - only boost, never reduce
    let adjustmentMultiplier = 1.0;
    let reason = 'normal';
    
    if (currentQueueSize < 10) {
      // Queue critically low - boost significantly to fill quickly
      adjustmentMultiplier = 10.0; // 4% → 40%
      reason = 'queue critically low (<10)';
    } else if (currentQueueSize < 30) {
      // Queue low - moderate boost
      adjustmentMultiplier = 3.0; // 4% → 12%  
      reason = 'queue low (<30)';
    } else if (currentQueueSize < 50) {
      // Queue adequate - slight boost
      adjustmentMultiplier = 1.5; // 4% → 6%
      reason = 'queue adequate (<50)';
    }
    // else: normal probability (multiplier = 1.0) - never reduce below base probability
    
    const adjustedProbability = Math.min(baseProbability * adjustmentMultiplier, 1.0); // Cap at 100%
    
    this._log('🎲 Dynamic per-file probability:', 
              'base:', (baseProbability * 100).toFixed(4) + '%',
              'adjusted:', (adjustedProbability * 100).toFixed(4) + '%',
              'multiplier:', adjustmentMultiplier + 'x',
              'reason:', reason,
              'queue size:', currentQueueSize);
    
    return adjustedProbability;
  }

  // Direct queue addition - simpler than batch scheduling
  addBatchToQueue(batch, folderTitle, batchIndex, onComplete = null) {
    if (batch.length > 0) {
      this.addFilesToQueue(batch, folderTitle, 'streaming_scan');
      this._log('✨ Added batch', batchIndex + 1, 'from', folderTitle, ':', batch.length, 'files - queue size now:', this.queue.length);
      
      // 🎯 IMMEDIATE DISPLAY: Trigger card update if this is the first batch
      if (this.queue.length === batch.length && this.card && !this.card._mediaUrl) {
        this._log('🚀 FIRST BATCH: Triggering immediate display - queue has', this.queue.length, 'items');
        setTimeout(() => {
          if (this.card && typeof this.card.requestUpdate === 'function') {
            this.card.requestUpdate();
            this._log('🎬 Requested card update for immediate display');
          }
        }, 50);
      }
      
      // Debug mode event logging
      if (this.card && this.card.config && this.card.config.debug_queue_mode) {
        this.card._debugLogEvent('batch_added', `Batch directly added to queue`, {
          folder: folderTitle,
          batchSize: batch.length,
          queueSize: this.queue.length,
          batchIndex: batchIndex + 1
        });
      }
    }
    
    // Call completion callback immediately
    if (onComplete) {
      onComplete();
    }
  }

  // NEW CONCURRENT STREAMING SCAN MANAGER
  async startConcurrentStreamingScans(folders) {
    const MAX_CONCURRENT = 2; // Maximum concurrent folder scans - reduced to prevent I/O overload
    const scanQueue = [...folders]; // Copy of folders to scan
    const activescans = new Set(); // Track active scans
    const completedScans = [];
    
    this._log('🎯 Starting concurrent streaming scans for', folders.length, 'folders (max concurrent:', MAX_CONCURRENT + ')');
    
    return new Promise((resolve) => {
      const tryStartNextScan = () => {
        // Start new scans if we have capacity and folders waiting
        while (activescans.size < MAX_CONCURRENT && scanQueue.length > 0) {
          const folder = scanQueue.shift();
          const scanPromise = this.streamFolderFiles(folder.path, folder.title);
          
          activescans.add(scanPromise);
          this._log('▶️ Started streaming scan for:', folder.title, '(active scans:', activescans.size + ')');
          
          scanPromise.then(result => {
            activescans.delete(scanPromise);
            completedScans.push({ folder, result });
            this._log('✅ Completed streaming scan for:', folder.title, '(remaining active:', activescans.size, 'queue:', scanQueue.length + ')');
            
            // Try to start next scan
            tryStartNextScan();
            
            // Check if all scans complete
            if (activescans.size === 0 && scanQueue.length === 0) {
              this._log('🎉 All streaming scans completed! Total folders scanned:', completedScans.length);
              resolve(completedScans);
            }
          }).catch(error => {
            activescans.delete(scanPromise);
            this._log('❌ Streaming scan failed for:', folder.title, '-', error.message);
            
            // Continue with other scans
            tryStartNextScan();
            
            // Check if all scans complete
            if (activescans.size === 0 && scanQueue.length === 0) {
              this._log('🎉 All streaming scans completed! Total folders scanned:', completedScans.length);
              
              // Final shuffle to ensure good randomization of all items
              if (this.queue.length > 0) {
                this.shuffleQueue();
                this.queueShuffleCounter = 0;
                this._log('🔀 Final shuffle completed after streaming scan - queue size:', this.queue.length);
              }
              
              resolve(completedScans);
            }
          });
        }
        
        // If no folders to scan and no active scans, we're done
        if (scanQueue.length === 0 && activescans.size === 0) {
          this._log('🎉 All streaming scans completed! Total folders scanned:', completedScans.length);
          
          // Final shuffle to ensure good randomization of all items
          if (this.queue.length > 0) {
            this.shuffleQueue();
            this.queueShuffleCounter = 0;
            this._log('🔀 Final shuffle completed after streaming scan - queue size:', this.queue.length);
          }
          
          resolve(completedScans);
        }
      };
      
      // Start initial scans
      tryStartNextScan();
    });
  }

  // NEW STREAMING INITIALIZATION - replaces early population approach
  async initializeWithStreamingScans(basePath) {
    this._log('🚀 Initializing with streaming approach...');
    
    try {
      // First discover folders (but don't scan their files yet)
      const allFolders = await this.discoverSubfolders(basePath, 0);
      
      if (allFolders.length === 0) {
        this._log('⚠️ No subfolders found');
        return false;
      }
      
      this._log('📁 Discovered', allFolders.length, 'folders, starting concurrent streaming scans...');
      
      // Store folders for reference
      this.discoveredFolders = allFolders;
      
      // Randomize folder order for scanning
      const randomizedFolders = [...allFolders].sort(() => Math.random() - 0.5);
      
      // Start concurrent streaming scans (non-blocking)
      this.startConcurrentStreamingScans(randomizedFolders).then(results => {
        this._log('🎉 All streaming scans completed! Queue final size:', this.queue.length);
        
        // Update folder statistics with actual file counts
        results.forEach(({ folder, result }) => {
          const folderIndex = this.discoveredFolders.findIndex(f => f.path === folder.path);
          if (folderIndex >= 0) {
            this.discoveredFolders[folderIndex].fileCount = result.fileCount;
          }
        });
        
        // Update debug stats if in debug mode
        if (this.card && this.card.config && this.card.config.debug_queue_mode) {
          this.card._updateDebugStats();
        }
      }).catch(error => {
        this._log('❌ Streaming scans failed:', error.message);
      });
      
      // Return immediately - scans continue in background
      this._log('✅ Streaming initialization started - queue will grow as scans complete');
      return true;
      
    } catch (error) {
      this._log('❌ Streaming initialization failed:', error.message);
      return false;
    }
  }

  // LEGACY CODE BELOW - keeping for reference but will be replaced
  async scanFolderFiles_OLD(folderPath) {
    try {
      const folderContents = await this.card.hass.callWS({
        type: "media_source/browse_media", 
        media_content_id: folderPath
      });

      const files = [];
      let totalChildren = 0;
      
      if (folderContents && folderContents.children) {
        totalChildren = folderContents.children.length;
        this._log('📁 Folder has', totalChildren, 'total items:', folderPath.split('/').pop());
        
        // Smart handling for different folder sizes
        if (totalChildren > 5000) {
          // MASSIVE folders (5K+): Random sampling for performance
          const sampleRatio = 10;
          const targetSamples = Math.floor(totalChildren / sampleRatio);
          this._log('🚀 MASSIVE folder detected (', totalChildren, 'items) - random sampling', targetSamples, 'items');
          
          // Create array of random indices
          const randomIndices = [];
          for (let i = 0; i < targetSamples; i++) {
            randomIndices.push(Math.floor(Math.random() * totalChildren));
          }
          // Remove duplicates and sort
          const uniqueIndices = [...new Set(randomIndices)].sort((a, b) => a - b);
          
          for (const index of uniqueIndices) {
            const item = folderContents.children[index];
            if (item && item.media_class !== 'directory' && this.isMediaFile(item.media_content_id)) {
              files.push(item);
            }
          }
          
          // Estimate total files based on sample
          const estimatedFileCount = Math.floor(files.length * sampleRatio);
          this._log('📊 Random sampled', files.length, 'files, estimated total:', estimatedFileCount);
          
          return {
            fileCount: estimatedFileCount,
            files: files,
            isSampled: true,
            sampleRatio: sampleRatio
          };
          
        } else if (totalChildren > 1000) {
          // LARGE folders (1K-5K): Random sampling 
          const sampleRatio = 3;
          const targetSamples = Math.floor(totalChildren / sampleRatio);
          this._log('📂 LARGE folder detected (', totalChildren, 'items) - random sampling', targetSamples, 'items');
          
          // Create array of random indices
          const randomIndices = [];
          for (let i = 0; i < targetSamples; i++) {
            randomIndices.push(Math.floor(Math.random() * totalChildren));
          }
          // Remove duplicates and sort
          const uniqueIndices = [...new Set(randomIndices)].sort((a, b) => a - b);
          
          for (const index of uniqueIndices) {
            const item = folderContents.children[index];
            if (item && item.media_class !== 'directory' && this.isMediaFile(item.media_content_id)) {
              files.push(item);
            }
          }
          
          // Estimate total files based on sample
          const estimatedFileCount = Math.floor(files.length * sampleRatio);
          this._log('📊 Random sampled', files.length, 'files, estimated total:', estimatedFileCount);
          
          return {
            fileCount: estimatedFileCount,
            files: files,
            isSampled: true,
            sampleRatio: sampleRatio
          };
          
        } else {
          // NORMAL folders (<1K): Scan all files
          for (const item of folderContents.children) {
            if (item.media_class !== 'directory' && this.isMediaFile(item.media_content_id)) {
              files.push(item);
            }
          }
          
          return {
            fileCount: files.length,
            files: files,
            isSampled: false
          };
        }
      }

      return {
        fileCount: 0,
        files: [],
        isSampled: false
      };
      
    } catch (error) {
      this._log('❌ Failed to scan folder files:', folderPath, error);
      return { fileCount: 0, files: [], isSampled: false };
    }
  }

  // Emergency quick scan for folders that timeout - minimal sampling for basic info
  async emergencyQuickScan(folderPath, folderTitle, customTimeoutMs = null) {
    try {
      this._log('🚨 Emergency quick scan starting for:', folderTitle);
      
      // For known massive folders, use estimated approach instead of enumeration
      const isMassiveFolder = folderTitle.toLowerCase().includes('camera roll') || 
                              folderTitle.toLowerCase().includes('dcim') ||
                              folderTitle.toLowerCase().includes('photos');
      
      if (isMassiveFolder) {
        return this.handleMassiveFolderEstimation(folderPath, folderTitle);
      }
      
      // For other folders, try normal emergency scan with extended timeout
      const isCriticalFolder = folderTitle.toLowerCase().includes('camera') || 
                               folderTitle.toLowerCase().includes('dcim') ||
                               folderTitle.toLowerCase().includes('roll');
      
      // Use custom timeout if provided, otherwise use defaults
      const timeoutMs = customTimeoutMs || (isCriticalFolder ? 60000 : 30000); // 60s for critical, 30s for others
      
      this._log('⏰ Emergency timeout set to', timeoutMs + 'ms for', folderTitle, '(critical:', isCriticalFolder, 'custom:', !!customTimeoutMs + ')');
      
      const startTime = Date.now();
      this._log('🕐 Emergency scan starting at', startTime, 'for', folderTitle);
      
      const emergencyTimeout = new Promise((_, reject) => 
        setTimeout(() => {
          const elapsed = Date.now() - startTime;
          this._log('⏰ Emergency timeout triggered after', elapsed + 'ms for', folderTitle);
          reject(new Error(`Emergency scan timeout: ${folderTitle}`));
        }, timeoutMs)
      );
      
      const folderContents = await Promise.race([
        this.card.hass.callWS({
          type: "media_source/browse_media", 
          media_content_id: folderPath
        }).then(result => {
          const elapsed = Date.now() - startTime;
          this._log('✅ WebSocket call completed after', elapsed + 'ms for', folderTitle);
          return result;
        }).catch(error => {
          const elapsed = Date.now() - startTime;
          this._log('❌ WebSocket call failed after', elapsed + 'ms for', folderTitle, ':', error.message);
          throw error;
        }),
        emergencyTimeout
      ]);

      if (folderContents && folderContents.children && folderContents.children.length > 0) {
        const totalChildren = folderContents.children.length;
        this._log('🚨 Emergency scan found', totalChildren, 'total items in:', folderTitle);
        
        // Take only first 50 items for emergency sampling
        const emergencySampleSize = Math.min(50, totalChildren);
        const files = [];
        
        for (let i = 0; i < emergencySampleSize; i++) {
          const item = folderContents.children[i];
          if (item && item.media_class !== 'directory' && this.isMediaFile(item.media_content_id)) {
            files.push(item);
          }
        }
        
        // Estimate total based on sample
        const estimatedFileCount = Math.floor((files.length / emergencySampleSize) * totalChildren);
        this._log('🚨 Emergency scan: sampled', files.length, 'files from first', emergencySampleSize, 'items, estimated total:', estimatedFileCount);
        
        return {
          path: folderPath,
          title: folderTitle,
          fileCount: Math.max(estimatedFileCount, files.length),
          files: files,
          depth: 1, // Assume depth 1 for simplicity
          isSampled: true,
          sampleRatio: Math.ceil(totalChildren / emergencySampleSize),
          hasError: true,
          isEmergencyScan: true
        };
      }
      
      return null;
    } catch (error) {
      this._log('❌ Emergency scan failed for:', folderTitle, error.message);
      
      // Create a synthetic folder entry for timed-out folders
      // This allows the system to acknowledge the folder exists even if we can't scan it
      return this.createSyntheticFolderEntry(folderPath, folderTitle);
    }
  }

  // Handle massive folders with estimation instead of full enumeration
  handleMassiveFolderEstimation(folderPath, folderTitle) {
    this._log('🚀 Using estimation approach for massive folder:', folderTitle);
    
    // Create synthetic folder entry for massive folders
    const syntheticFolder = this.createSyntheticFolderEntry(folderPath, folderTitle);
    syntheticFolder.isLargeFolder = true;
    syntheticFolder.estimationReason = 'massive_folder_detection';
    
    this._log('📊 Created synthetic entry for massive folder:', folderTitle, 'estimated files:', syntheticFolder.fileCount);
    return syntheticFolder;
  }

  // Create a synthetic folder entry for folders that timeout during scanning
  createSyntheticFolderEntry(folderPath, folderTitle) {
    // Estimate folder size based on folder name patterns and context
    const estimatedFileCount = this.estimateFolderSize(folderTitle);
    
    this._log('🔄 Creating synthetic folder entry for:', folderTitle, 'estimated files:', estimatedFileCount);
    
    return {
      title: folderTitle,
      path: folderPath,
      media_content_id: folderPath,
      fileCount: estimatedFileCount,
      files: [], // Empty files array - will be populated via lazy loading if needed
      isSynthetic: true,
      isLargeFolder: true,
      depth: 1, // Assume shallow depth for synthetic entries
      hasError: true,
      errorType: 'timeout',
      canLazyLoad: true // Flag to indicate this folder can attempt lazy loading later
    };
  }

  // Estimate folder size based on name patterns and context
  estimateFolderSize(folderTitle) {
    const titleLower = folderTitle.toLowerCase();
    
    // Large photo repositories
    if (titleLower.includes('camera roll') || titleLower.includes('camera_roll')) {
      return 3000; // Typical camera roll size
    }
    if (titleLower.includes('dcim') || titleLower.includes('camera')) {
      return 2000; // DCIM folders are usually large
    }
    if (titleLower.includes('photos') || titleLower.includes('pictures')) {
      return 1500; // General photo folders
    }
    if (titleLower.includes('screenshot')) {
      return 200; // Screenshots folder
    }
    if (titleLower.includes('download')) {
      return 100; // Download folders
    }
    
    // Default estimate for unknown folders that timeout
    return 500; // Conservative estimate - if it times out, it's probably substantial
  }

  // Check if file is a media file
  isMediaFile(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
  }

  // Add a single folder to existing queue progressively
  async addFolderToQueue(folder) {
    try {
      this._log('➕ Adding folder to existing queue:', folder.title, 'files:', folder.fileCount, folder.isSynthetic ? '(synthetic)' : '');
      
      // Handle synthetic folders that need lazy loading
      if (folder.isSynthetic && (!folder.files || folder.files.length === 0)) {
        this._log('🔄 Attempting lazy load for synthetic folder:', folder.title);
        try {
          // Attempt a quick emergency scan with a very short timeout for lazy loading
          const lazyLoadResult = await this.emergencyQuickScan(folder.path, folder.title, 8000); // 8 second timeout for lazy loading
          if (lazyLoadResult && lazyLoadResult.files && lazyLoadResult.files.length > 0) {
            // Update the folder with real data
            folder.files = lazyLoadResult.files;
            folder.fileCount = lazyLoadResult.fileCount;
            folder.isSynthetic = false; // No longer synthetic
            this._log('✅ Lazy load successful for', folder.title, '- now has', folder.fileCount, 'real files');
          } else {
            this._log('❌ Lazy load failed for', folder.title, '- skipping queue addition for now');
            return; // Skip adding this folder to queue for now
          }
        } catch (error) {
          this._log('❌ Lazy load error for', folder.title, ':', error.message);
          return; // Skip adding this folder to queue
        }
      }
      
      // Calculate how many files to add from this folder (more balanced approach)
      const currentQueueSize = this.queue.length;
      
      // Progressive balancing: add more files if queue is small or if this folder is large
      let targetSlots;
      if (currentQueueSize < 50) {
        // Early stage: add significant portions to quickly build diversity
        targetSlots = Math.min(25, Math.max(15, Math.floor(folder.fileCount / 5)));
      } else if (currentQueueSize < 100) {
        // Medium stage: moderate additions
        targetSlots = Math.min(15, Math.max(10, Math.floor(folder.fileCount / 8)));
      } else {
        // Late stage: smaller additions
        targetSlots = Math.min(10, Math.max(5, Math.floor(folder.fileCount / 10)));
      }
      
      this._log('🎯 Adding', targetSlots, 'files from', folder.title, 'to queue of', currentQueueSize);
      
      // Select random files from this folder
      const selectedFiles = this.selectRandomFiles(folder.files || [], targetSlots);
      
      if (selectedFiles.length > 0) {
        // Add to queue with history tracking
        this.addFilesToQueue(selectedFiles, folder.title, 'addFolderToQueue');
        
        // Update debug stats
        if (this.card && this.card.config && this.card.config.debug_queue_mode) {
          this.card._updateDebugStats();
        }
      } else {
        this._log('⚠️ No new files available from', folder.title);
      }
      
    } catch (error) {
      this._log('❌ Error adding folder to queue:', folder.title, error);
    }
  }

  // Populate queue from discovered folders using weighted selection
  async populateQueueFromFolders(folders, customQueueSize = null) {
    try {
      const targetQueueSize = customQueueSize || this.config.queue_size;
      this._log('🎲 Populating queue from', folders.length, 'folders, target size:', targetQueueSize);
      
      if (folders.length === 0) {
        this._log('❌ No folders provided for queue population');
        return;
      }
      
      // Calculate weights for each folder
      for (const folder of folders) {
        try {
          const weight = this.calculateFolderWeight(folder);
          this.folderWeights.set(folder.path, weight);
          this._log('📊 Folder weight:', folder.title, 'files:', folder.fileCount, 'weight:', weight.toFixed(2));
        } catch (error) {
          this._log('❌ Error calculating weight for folder:', folder.title, error);
        }
      }

      // Choose allocation method based on configuration
      const queueSize = Math.max(targetQueueSize || 15, folders.length * 10);
      
      // For expansion, don't clear the queue, just add to it
      if (!customQueueSize) {
        this.queue = [];
      }
      
      const allocations = this.config.equal_probability_mode 
        ? this.calculateEqualProbabilityAllocations(folders, queueSize)
        : this.calculateBalancedFolderAllocations(folders, queueSize);
      
      // Now populate queue with allocated slots
      for (const allocation of allocations) {
        try {
          const allocatedSlots = allocation.proportionalSlots;
          
          this._log('🎯 Allocating', allocatedSlots, 'slots to', allocation.folder.title, 'weight:', allocation.weight.toFixed(1));
          
          // Randomly select files from this folder
          const selectedFiles = this.selectRandomFiles(allocation.folder.files || [], allocatedSlots);
          this._log('📄 Selected', selectedFiles.length, 'files from', allocation.folder.title);
          
          // Add files with history tracking - this handles shuffling automatically
          if (selectedFiles.length > 0) {
            this.addFilesToQueue(selectedFiles, allocation.folder.title, 'populateQueueFromFolders');
            
            // Log folder allocation for debug mode
            if (this.card && this.card.config && this.card.config.debug_queue_mode) {
              this.card._debugLogEvent('folder_added', `Folder allocated slots`, {
                folder: allocation.folder.title,
                fileCount: allocation.folder.fileCount || 0,
                slots: allocatedSlots,
                weight: allocation.weight
              });
            }
          }
          
          // Update debug stats after queue population
          if (this.card && this.card.config && this.card.config.debug_queue_mode) {
            this.card._updateDebugStats();
          }
        } catch (error) {
          this._log('❌ Error processing folder:', allocation.folder.title, error);
        }
      }

      this._log('✅ Queue populated with', this.queue.length, 'items from', folders.length, 'folders');
      
      // Final shuffle to ensure complete randomization
      this.shuffleQueue();
      
      // Log detailed queue composition
      if (this.queue.length > 0) {
        const folderCounts = {};
        this.queue.forEach(item => {
          // Extract folder name from path
          const pathParts = item.media_content_id.split('/');
          const folderName = pathParts[pathParts.length - 2] || 'root'; // Get parent folder name
          folderCounts[folderName] = (folderCounts[folderName] || 0) + 1;
        });
        
        this._log('📊 Queue composition by folder:');
        Object.entries(folderCounts)
          .sort(([,a], [,b]) => b - a) // Sort by count descending
          .forEach(([folder, count]) => {
            this._log(`   • ${folder}: ${count} items (${((count/this.queue.length)*100).toFixed(1)}%)`);
          });
        
        this._log('📋 First queue items:', this.queue.slice(0, 3).map(item => `${item.title} (${item.media_content_id.split('/').pop()})`).join(', '));
      } else {
        this._log('⚠️ Queue is empty after population attempt!');
      }
    } catch (error) {
      this._log('❌ Critical error in populateQueueFromFolders:', error);
    }
  }

  // Calculate equal probability allocation - each media item has equal chance
  calculateEqualProbabilityAllocations(folders, queueSize) {
    this._log('🎯 Using EQUAL PROBABILITY allocation - each media item has equal selection chance');
    this._log('📊 Working with', folders.length, 'discovered folders (more may be found later)');
    
    // Count synthetic vs real folders
    const syntheticFolders = folders.filter(f => f.isSynthetic);
    const realFolders = folders.filter(f => !f.isSynthetic);
    
    if (syntheticFolders.length > 0) {
      this._log('🔄 Including', syntheticFolders.length, 'synthetic folders in calculations (large folders that timed out)');
      syntheticFolders.forEach(folder => {
        this._log('   📁 Synthetic:', folder.title, 'estimated files:', folder.fileCount);
      });
    }
    
    // Calculate total number of media items
    const discoveredMediaItems = folders.reduce((sum, folder) => sum + folder.fileCount, 0);
    
    // Use cached total count instead of recalculating every time
    const totalMediaItems = this.getTotalMediaCount(discoveredMediaItems);
    
    this._log('📊 Probability calculation - discovered:', discoveredMediaItems, 
              'total (cached):', totalMediaItems, 'source:', this.cachedCountSource);
    
    if (totalMediaItems === 0) {
      this._log('❌ No media items found in folders');
      return [];
    }
    
    // Each item in the queue should represent (totalMediaItems / queueSize) items
    // So each folder gets slots proportional to its file count
    const allocations = [];
    let totalAllocated = 0;
    
    folders.forEach(folder => {
      // Exact proportional allocation based on file count
      const exactSlots = (folder.fileCount / totalMediaItems) * queueSize;
      
      // Use probabilistic rounding instead of guaranteed minimum
      // Small folders should sometimes get 0 slots for true statistical fairness
      let allocatedSlots;
      
      if (exactSlots < 1.0) {
        // For small allocations, use probabilistic rounding
        // e.g., if exactSlots = 0.3, there's a 30% chance of getting 1 slot, 70% chance of 0
        const random = Math.random();
        allocatedSlots = (random < exactSlots) ? 1 : 0;
        
        if (allocatedSlots === 0) {
          this._log('🎲 Small folder', folder.title, 'gets 0 slots this round (exact:', exactSlots.toFixed(3), ', random:', random.toFixed(3), ')');
        } else {
          this._log('🎲 Small folder', folder.title, 'gets 1 slot (exact:', exactSlots.toFixed(3), ', random:', random.toFixed(3), ')');
        }
      } else {
        // For larger allocations, use normal rounding
        allocatedSlots = Math.round(exactSlots);
      }
      
      // ALWAYS add folder to allocations list (even with 0 slots) so it can be selected during refills
      allocations.push({
        folder: folder,
        proportionalSlots: allocatedSlots,
        weight: Math.max(allocatedSlots, 0.1), // Minimum weight ensures folders can be selected during refills
        exactProbability: folder.fileCount / totalMediaItems,
        itemProbability: allocatedSlots > 0 ? (allocatedSlots / folder.fileCount) : (exactSlots / folder.fileCount) // Use exact probability even when slots = 0
      });
      
      totalAllocated += allocatedSlots;
      
      if (allocatedSlots > 0) {
        this._log('🎯 EQUAL PROBABILITY allocation:', folder.title, 
                  'files:', folder.fileCount, 
                  'slots:', allocatedSlots, 
                  'exact:', exactSlots.toFixed(2),
                  'per-item prob:', (allocatedSlots / folder.fileCount * 100).toFixed(2) + '%',
                  folder.isSynthetic ? '(synthetic)' : '');
      } else {
        this._log('🎯 EQUAL PROBABILITY allocation:', folder.title, 
                  'files:', folder.fileCount, 
                  'slots: 0 (kept in allocations with weight 0.1 for refills)',
                  'exact:', exactSlots.toFixed(2),
                  folder.isSynthetic ? '(synthetic)' : '');
      }
    });
    
    this._log('📊 Equal probability allocation complete:', totalAllocated, 'total slots,', totalMediaItems, 'total items');
    this._log('📊 Target per-item probability:', (queueSize / totalMediaItems * 100).toFixed(3) + '%');
    
    return allocations;
  }

  // Calculate balanced folder allocation - each folder gets fair representation  
  calculateBalancedFolderAllocations(folders, queueSize) {
    this._log('🎯 Using BALANCED FOLDER allocation - each folder gets fair representation');
    
    // Give each folder a more equal share (minimum 5 items per folder, rest distributed evenly)
    const minItemsPerFolder = Math.min(5, Math.floor(queueSize / folders.length));
    const baseSlotsNeeded = folders.length * minItemsPerFolder;
    const extraSlotsPool = Math.max(0, queueSize - baseSlotsNeeded);
    const bonusSlotsPerFolder = Math.floor(extraSlotsPool / folders.length);
    const extraSlots = extraSlotsPool % folders.length;
    
    const allocations = [];
    let totalAllocated = 0;
    
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      
      // Each folder gets: minimum + bonus + (1 extra if needed)
      const baseSlots = minItemsPerFolder + bonusSlotsPerFolder;
      const extraSlot = i < extraSlots ? 1 : 0;
      const finalSlots = baseSlots + extraSlot;
      
      allocations.push({
        folder: folder,
        proportionalSlots: finalSlots,
        weight: finalSlots,  // Use slot count as weight for balanced allocation
        itemProbability: finalSlots / folder.fileCount // Probability per item in this folder
      });
      
      totalAllocated += finalSlots;
      this._log('🎯 BALANCED FOLDER allocation:', folder.title, 
                'gets', finalSlots, 'slots',
                'per-item prob:', (finalSlots / folder.fileCount * 100).toFixed(2) + '%',
                '(min:', minItemsPerFolder, '+ bonus:', bonusSlotsPerFolder, '+ extra:', extraSlot, ')');
    }
    
    this._log('📊 Balanced folder allocation complete:', totalAllocated, 'total slots allocated');
    
    return allocations;
  }

  // Shuffle the queue to mix items from different folders
  shuffleQueue() {
    this._log('🎲 Shuffling queue to mix items from different folders - queue size:', this.queue.length);
    
    // Show first few items BEFORE shuffle
    this._log('📋 BEFORE shuffle - first 5 items:', this.queue.slice(0, 5).map(item => {
      const pathParts = item.media_content_id.split('/');
      const folderName = pathParts[pathParts.length - 2] || 'root';
      return `${item.title} (${folderName})`;
    }).join(', '));
    
    // Fisher-Yates shuffle algorithm
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    
    // Show first few items AFTER shuffle
    this._log('📋 AFTER shuffle - first 5 items:', this.queue.slice(0, 5).map(item => {
      const pathParts = item.media_content_id.split('/');
      const folderName = pathParts[pathParts.length - 2] || 'root';
      return `${item.title} (${folderName})`;
    }).join(', '));
  }

  // Add files to queue with history tracking and shuffling
  addFilesToQueue(files, folderName = null, source = 'unknown') {
    if (!files || files.length === 0) return;
    
    // Add to main queue
    this.queue.push(...files);
    
    // Add to history with metadata
    files.forEach(file => {
      const historyEntry = {
        file: file,
        timestamp: new Date().toISOString(),
        folderName: folderName || this.extractFolderName(file),
        source: source
      };
      this.queueHistory.push(historyEntry);
      
      // Debug logging for debug mode
      if (this.card && this.card.config && this.card.config.debug_queue_mode) {
        this.card._debugLogEvent('file_added', `Added to queue`, {
          folder: historyEntry.folderName,
          filename: file.title || file.media_content_id.split('/').pop(),
          source: source,
          queueSize: this.queue.length,
          historySize: this.queueHistory.length
        });
      }
    });
    
    // Shuffle immediately for proper mixing
    this.shuffleQueue();
    
    this._log('✅ Added', files.length, 'files from', folderName, '- queue now has', this.queue.length, 'items, history has', this.queueHistory.length, 'entries');
  }
  
  // Helper to extract folder name from file path
  extractFolderName(file) {
    if (!file || !file.media_content_id) return 'unknown';
    const pathParts = file.media_content_id.split('/');
    return pathParts[pathParts.length - 2] || 'root';
  }

  // Select N random files from an array, excluding already shown items
  selectRandomFiles(files, count) {
    if (!files || files.length === 0) {
      this._log('⚠️ selectRandomFiles: No files provided or empty array');
      return [];
    }
    
    // Filter out already shown items AND items already in queue
    const existingQueueIds = new Set(this.queue.map(item => item.media_content_id));
    const availableFiles = files.filter(file => 
      !this.shownItems.has(file.media_content_id) && 
      !existingQueueIds.has(file.media_content_id)
    );
    
    this._log('📁 Folder selection: available', availableFiles.length, 'of', files.length, 'total files (excluding shown:', this.shownItems.size, 'and queued:', existingQueueIds.size, ')');
    
    if (availableFiles.length === 0) {
      this._log('⚠️ All files in this folder have been shown or queued - skipping folder entirely');
      return []; // Don't add any items from this folder - critical fix!
    }
    
    if (availableFiles.length <= count) {
      return [...availableFiles]; // Return all available files if we need more than available
    }
    
    // Simple random selection - Math.random() is already random enough
    const selected = [];
    const shuffledFiles = [...availableFiles]; // Copy to avoid modifying original
    
    while (selected.length < count && shuffledFiles.length > 0) {
      const randomIndex = Math.floor(Math.random() * shuffledFiles.length);
      selected.push(shuffledFiles.splice(randomIndex, 1)[0]);
    }
    
    return selected;
  }





  // Get next item from queue (forward navigation)
  getNextItem() {
    this._log('🎯 getNextItem called - queue size:', this.queue.length, 'folders:', this.discoveredFolders.length, 'historyIndex:', this.historyIndex);
    
    // If we're navigating within history (not at the latest position)
    if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const item = this.history[this.historyIndex];
      this._log('▶️ Moving forward in history to index:', this.historyIndex, 'item:', item.title);
      return item;
    }

    // We're at the latest position, get a new item from queue
    if (this.queue.length === 0) {
      this._log('⚠️ Queue empty, attempting to refill');
      this.refillQueue();
      if (this.queue.length === 0) {
        this._log('❌ Queue refill failed, no items available');
        return null;
      }
    }

    // Find first unshown item (don't remove from queue, just mark as shown)
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      if (!this.shownItems.has(item.media_content_id)) {
        // Add to blacklist
        this.shownItems.add(item.media_content_id);
        
        // Add to navigation history
        this.history.push(item);
        this.historyIndex = this.history.length - 1; // Move to latest position
        
        // Limit history size to prevent memory issues
        if (this.history.length > 100) {
          this.history.shift(); // Remove oldest item
          this.historyIndex = this.history.length - 1;
        }
        
        // Remove item from queue since it's now shown
        this.queue.splice(i, 1);
        
        // Extract folder name for logging
        const pathParts = item.media_content_id.split('/');
        const folderName = pathParts[pathParts.length - 2] || 'root';
        
        this._log('✅ Served and removed from queue:', item.title, `from folder: ${folderName}`, 'queue size:', this.queue.length, 'history size:', this.history.length);
        
        // Check if we need to refill queue
        if (this.needsRefill()) {
          this._log('🔄 Queue running low, scheduling refill');
          setTimeout(() => this.refillQueue(), 100);
        }
        
        return item;
      }
    }

    this._log('⚠️ Queue is empty or all items shown (' + this.shownItems.size + ' total), aging out blacklist and refilling');
    this.ageOutShownItems();
    this.refillQueue();
    
    // Try again after refill
    if (this.queue.length > 0) {
      const item = this.queue[0];
      this.shownItems.add(item.media_content_id);
      
      // Add to navigation history
      this.history.push(item);
      this.historyIndex = this.history.length - 1;
      
      // Remove from queue since it's now shown
      this.queue.shift();
      
      this._log('✅ Served item after refill:', item.title, 'queue size:', this.queue.length, 'history size:', this.history.length);
      return item;
    }
    
    this._log('❌ No items available even after refill');
    return null;
  }

  // Get previous item from navigation history (backward navigation)
  getPreviousItem() {
    this._log('🎯 getPreviousItem called - history size:', this.history.length, 'historyIndex:', this.historyIndex);
    
    if (this.history.length === 0) {
      this._log('⚠️ No history available for backward navigation');
      return null;
    }

    // If we're at the latest position (historyIndex = -1 or at the end)
    if (this.historyIndex === -1) {
      this.historyIndex = this.history.length - 2; // Go to second-to-last item
    } else if (this.historyIndex > 0) {
      this.historyIndex--; // Go back one more step
    } else {
      this._log('⚠️ Already at the beginning of history');
      return this.history[0]; // Stay at first item
    }

    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      const item = this.history[this.historyIndex];
      this._log('◀️ Moving backward in history to index:', this.historyIndex, 'item:', item.title);
      return item;
    }

    this._log('⚠️ Invalid history index:', this.historyIndex);
    return null;
  }

  // Get count of remaining items in queue (all items are unshown now)
  getRemainingCount() {
    return this.queue.length; // Since we remove items when shown, all remaining items are unshown
  }

  // Check if queue needs refilling (since items stay in queue, check available unshown items)
  needsRefill() {
    const unshownCount = this.queue.filter(item => !this.shownItems.has(item.media_content_id)).length;
    return unshownCount < 15; // Refill when < 15 unshown items left for more proactive refilling
  }

  // Clear shown items tracking (reset exclusions)
  clearShownItems() {
    this._log('🔄 Clearing shown items tracking, resetting exclusions');
    this.shownItems.clear();
  }

  // Age out older shown items (partial clearing for better variety)
  ageOutShownItems() {
    const totalShown = this.shownItems.size;
    if (totalShown === 0) return;
    
    // Keep the most recent 30% of shown items, age out the rest
    const keepPercentage = 0.3;
    const itemsToKeep = Math.ceil(totalShown * keepPercentage);
    const itemsToAge = totalShown - itemsToKeep;
    
    if (itemsToAge <= 0) {
      this._log('🔄 Not enough shown items to age out, clearing all');
      this.clearShownItems();
      return;
    }
    
    // Convert Set to Array, keep the last N items (most recently shown)
    const shownArray = Array.from(this.shownItems);
    const itemsToKeep_array = shownArray.slice(-itemsToKeep);
    
    this._log('📅 Aging out', itemsToAge, 'older items, keeping', itemsToKeep, 'recent items');
    
    // Replace set with aged-out version
    this.shownItems.clear();
    itemsToKeep_array.forEach(item => this.shownItems.add(item));
  }

  // Refill queue with new random selections
  refillQueue() {
    if (this.isScanning) {
      this._log('⏳ Scan in progress, skipping refill');
      
      // Check if scan has been stuck for too long (over 3 minutes for large hierarchical scans)
      // Only check if we have a discovery start time
      if (this.discoveryStartTime && (Date.now() - this.discoveryStartTime) > 180000) {
        this._log('⚠️ Scan appears stuck (>3 min), forcing reset of isScanning flag');
        this.isScanning = false;
      } else {
        return;
      }
    }

    this._log('🔄 Refilling queue from discovered folders, available:', this.discoveredFolders.length);
    
    if (this.discoveredFolders.length === 0) {
      this._log('❌ No folders available for refill - rescanning');
      // Set scanning flag and run async rescan without blocking caller
      this.isScanning = true;
      
      // Add timeout to prevent stuck scanning flag
      const scanTimeout = setTimeout(() => {
        this._log('⚠️ Refill scan timeout - clearing isScanning flag');
        this.isScanning = false;
      }, 30000); // 30 second timeout
      
      this.quickScan()
        .then(() => {
          this._log('✅ Refill rescan completed successfully');
          clearTimeout(scanTimeout);
        })
        .catch((error) => {
          this._log('❌ Refill rescan failed:', error);
          clearTimeout(scanTimeout);
        })
        .finally(() => {
          this.isScanning = false;
          this._log('🔓 Refill rescan flag cleared');
        });
      return;
    }

    // Count total files available across all folders
    const totalFiles = this.discoveredFolders.reduce((sum, folder) => sum + (folder.files ? folder.files.length : 0), 0);
    this._log('📊 Total files available across all folders:', totalFiles);
    
    if (totalFiles === 0) {
      this._log('❌ No files found in any folder - rescanning');
      // Set scanning flag and run async rescan without blocking caller
      this.isScanning = true;
      
      // Add timeout to prevent stuck scanning flag
      const scanTimeout = setTimeout(() => {
        this._log('⚠️ Refill scan timeout - clearing isScanning flag');
        this.isScanning = false;
      }, 30000); // 30 second timeout
      
      this.quickScan()
        .then(() => {
          this._log('✅ Refill rescan completed successfully');
          clearTimeout(scanTimeout);
        })
        .catch((error) => {
          this._log('❌ Refill rescan failed:', error);
          clearTimeout(scanTimeout);
        })
        .finally(() => {
          this.isScanning = false;
          this._log('🔓 Refill rescan flag cleared');
        });
      return;
    }

    // Check if all files are exhausted before attempting refill
    const totalAvailableFiles = this.discoveredFolders.reduce((count, folder) => {
      if (!folder.files) return count;
      const availableInFolder = folder.files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !this.queue.some(qItem => qItem.media_content_id === file.media_content_id)
      ).length;
      return count + availableInFolder;
    }, 0);

    this._log('📊 Available unshown files:', totalAvailableFiles, 'of', totalFiles, 'total files, shown:', this.shownItems.size);

    // If no files are available (all have been shown), reset history to start over
    if (totalAvailableFiles === 0 && this.shownItems.size > 0) {
      this._log('🔄 All files exhausted, resetting history to start over');
      this.shownItems.clear();
      this.history = [];
      this.historyIndex = -1;
      this._log('✅ History reset - can now show', totalFiles, 'files again');
    }

    // Re-populate queue from ALL discovered folders (this will add to existing queue)
    const currentQueueSize = this.queue.length;
    this.populateQueueFromFolders(this.discoveredFolders);
    this._log('🔄 Refill complete - queue grew from', currentQueueSize, 'to', this.queue.length, 'items');
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
    return ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension);
  }

  _detectFileType(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
      return 'image';
    }
    
    return null;
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
          <div class="section-title">� Metadata Display</div>
          
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
            <div class="section-title">🚀 Subfolder Queue (Random Mode)</div>
            
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
                    min="1"
                    max="5"
                    .value=${this._config.subfolder_queue?.scan_depth || 2}
                    @input=${this._subfolderScanDepthChanged}
                  />
                  <div class="help-text">How many folder levels to scan (1-5). Higher = more subfolders, slower scan.</div>
                </div>
              </div>
              
              <div class="config-row">
                <label>Queue Size</label>
                <div>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    .value=${this._config.subfolder_queue?.queue_size || 30}
                    @input=${this._subfolderQueueSizeChanged}
                  />
                  <div class="help-text">Larger pool = better randomization, prevents repetition</div>
                </div>
              </div>
              
              <div class="config-row">
                <label>Priority Folder Patterns</label>
                <div>
                  <textarea
                    rows="4"
                    @change=${this._priorityPatternsChanged}
                    placeholder="DCIM/Camera&#10;Photos/Camera Roll&#10;Photos/2024"
                  >${this._formatPriorityPatterns()}</textarea>
                  <div class="help-text">Folder paths to prioritize (one per line). Paths containing these patterns get 3x weight.</div>
                </div>
              </div>
              
              <div class="config-row">
                <label class="switch-container">
                  <input
                    type="checkbox"
                    .checked=${this._config.subfolder_queue?.equal_probability_mode === true}
                    @change=${this._equalProbabilityModeChanged}
                  />
                  <span class="switch-slider"></span>
                  Equal Probability Mode
                </label>
                <div class="help-text">
                  <strong>Checked:</strong> Every media item has equal chance of selection (true statistical fairness)<br>
                  <strong>Unchecked:</strong> Each folder gets equal representation (folders with few items are overrepresented)
                </div>
              </div>
              
              ${this._config.subfolder_queue?.equal_probability_mode ? html`
                <div class="config-row">
                  <label>Estimated Total Photos (Optional)</label>
                  <div>
                    <input
                      type="number"
                      min="100"
                      max="100000"
                      .value=${this._config.subfolder_queue?.estimated_total_photos || ''}
                      @input=${this._estimatedTotalChanged}
                      placeholder="e.g., 5000"
                    />
                    <div class="help-text">
                      If you know roughly how many photos you have total, this ensures consistent probability calculations.<br>
                      <strong>Leave empty</strong> for adaptive mode (estimates total and caches for stability).
                    </div>
                  </div>
                </div>
              ` : ''}
            ` : ''}
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">�👆 Interactions</div>
          
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

    // Dialog close function with debugging and proper cleanup
    const closeDialog = () => {
      this._log('Closing media browser dialog');
      // CRITICAL: Remove keydown event listener to prevent memory leak
      document.removeEventListener('keydown', handleKeydown);
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

    // Escape key to close - defined after closeDialog to avoid hoisting issues
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this._log('Escape key pressed');
        closeDialog(); // closeDialog now handles the cleanup
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
    
    // Counter for limiting debug output
    let processedCount = 0;
    
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
    
    // Also check if there are subfolders (for random mode with subfolder queue)
    const hasSubfolders = itemsToCheck.some(item => item.can_expand);
    
    this._log('Has media files (checked first', itemsToCheck.length, 'items):', hasMediaFiles);
    this._log('Has subfolders:', hasSubfolders);
    this._log('Should show folder options:', (currentPath && currentPath !== '') && (hasMediaFiles || hasSubfolders));
    
    // If we're in a folder (not root) with media files OR subfolders, add special folder options at the top
    if ((currentPath && currentPath !== '') && (hasMediaFiles || hasSubfolders)) {
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
        processedCount++;
        
        // Only log details for first 5 files to avoid console spam
        if (processedCount <= 5) {
          this._log('🎯 Processing media file:', item.title, 'content_id:', item.media_content_id);
        }
        
        // Try to get extension from both title and content_id
        const titleExt = item.title?.split('.').pop()?.toLowerCase();
        const contentExt = item.media_content_id?.split('.').pop()?.toLowerCase();
        const ext = titleExt || contentExt;
        
        if (processedCount <= 5) {
          this._log('🎯 Extensions - title:', titleExt, 'content:', contentExt, 'using:', ext);
        }
        
        const isVideo = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'm4v'].includes(ext);
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
        
        if (processedCount <= 5) {
          this._log('🎯 File type detection - isImage:', isImage, 'isVideo:', isVideo);
        }
        
        if (isImage) {
          // Create image thumbnail with better error handling
          this._createImageThumbnail(thumbnailContainer, item);
        } else if (isVideo) {
          // Create video thumbnail (enhanced)
          this._createVideoThumbnail(thumbnailContainer, item);
        } else {
          // Unknown file type
          if (processedCount <= 5) {
            this._log('🎯 Unknown file type, showing generic icon');
          }
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

    // Debug: Log the item structure to understand what's available (limit to first few)
    const shouldLog = this._thumbnailDebugCount === undefined ? (this._thumbnailDebugCount = 0) < 5 : this._thumbnailDebugCount < 5;
    if (shouldLog) {
      this._thumbnailDebugCount++;
      this._log('🔍 Creating thumbnail for item:', item);
      this._log('🔍 Item properties:', Object.keys(item));
      if (item.thumbnail) {
        this._log('🖼️ Found thumbnail:', item.thumbnail);
      }
      if (item.thumbnail_url) {
        this._log('🖼️ Found thumbnail_url:', item.thumbnail_url);
      }
      if (item.children_media_class) {
        this._log('📁 Item media class:', item.children_media_class);
      }
    }

    try {
      // Try multiple approaches for getting the thumbnail
      let thumbnailUrl = null;
      
      // Approach 1: Check if item already has thumbnail URL (Synology Photos uses 'thumbnail' property)
      if (item.thumbnail) {
        thumbnailUrl = item.thumbnail;
        if (shouldLog) {
          this._log('✅ Using provided thumbnail:', thumbnailUrl);
        }
      }
      // Approach 1b: Check alternative thumbnail_url property
      else if (item.thumbnail_url) {
        thumbnailUrl = item.thumbnail_url;
        if (shouldLog) {
          this._log('✅ Using provided thumbnail_url:', thumbnailUrl);
        }
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
            if (shouldLog) {
              this._log('✅ Got thumbnail from resolve_media API:', thumbnailUrl);
            }
          }
        } catch (error) {
          if (shouldLog) {
            this._log('❌ Thumbnail resolve_media API failed:', error);
          }
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
        
        // CRITICAL: Store timeout reference to prevent memory leak
        let timeoutId;
        
        thumbnail.onload = () => {
          // Success! Replace loading indicator with thumbnail
          container.innerHTML = '';
          thumbnail.style.opacity = '1';
          container.appendChild(thumbnail);
          // CRITICAL: Clear timeout to prevent memory leak
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (shouldLog) {
            this._log('✅ Thumbnail loaded successfully:', item.media_content_id);
          }
        };
        
        thumbnail.onerror = () => {
          // Failed to load - show fallback icon
          this._showThumbnailFallback(container, '🖼️', 'Image thumbnail failed to load');
          // CRITICAL: Clear timeout to prevent memory leak
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (shouldLog) {
            this._log('❌ Thumbnail failed to load:', item.media_content_id);
          }
        };
        
        // Set source to start loading
        thumbnail.src = thumbnailUrl;
        
        // Timeout fallback (in case image takes too long) - store reference for cleanup
        timeoutId = setTimeout(() => {
          if (thumbnail.style.opacity === '0') {
            this._showThumbnailFallback(container, '🖼️', 'Image thumbnail timeout');
            if (shouldLog) {
              this._log('⏰ Thumbnail timeout:', item.media_content_id);
            }
          }
          timeoutId = null; // Clear reference after execution
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
    // Would require server-side thumbnail generation or canvas-based extraction
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

  _imageZoomChanged(ev) {
    this._config = { ...this._config, enable_image_zoom: ev.target.checked };
    this._fireConfigChanged();
  }

  _zoomLevelChanged(ev) {
    const level = parseFloat(ev.target.value) || 2.0;
    this._config = { ...this._config, zoom_level: level };
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

  // Metadata configuration event handlers
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

  // Subfolder queue configuration event handlers
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
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        scan_depth: Math.max(1, Math.min(5, parseInt(ev.target.value) || 2))
      }
    };
    this._fireConfigChanged();
  }

  _subfolderQueueSizeChanged(ev) {
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        queue_size: parseInt(ev.target.value) || 30
      }
    };
    this._fireConfigChanged();
  }

  _priorityPatternsChanged(ev) {
    const patterns = ev.target.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(path => ({ path, weight_multiplier: 3.0 }));

    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        priority_folder_patterns: patterns
      }
    };
    
    this._fireConfigChanged();
  }

  _formatPriorityPatterns() {
    const patterns = this._config.subfolder_queue?.priority_folder_patterns || [];
    return patterns.map(p => p.path).join('\n');
  }

  _equalProbabilityModeChanged(ev) {
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        equal_probability_mode: ev.target.checked
      }
    };
    this._fireConfigChanged();
  }

  _estimatedTotalChanged(ev) {
    const value = ev.target.value ? parseInt(ev.target.value) : null;
    this._config = {
      ...this._config,
      subfolder_queue: {
        ...this._config.subfolder_queue,
        estimated_total_photos: value
      }
    };
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
