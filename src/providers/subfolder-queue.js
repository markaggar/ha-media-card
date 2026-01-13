import { MediaProvider } from '../core/media-provider.js';

/**
 * SUBFOLDER QUEUE - Essential V4 code copied for v5
 * Handles random folder scanning with hierarchical scan
 */
export class SubfolderQueue {
  constructor(card) {
    this.card = card;
    this.config = card.config.subfolder_queue;
    this.queue = [];
    this.shownItems = new Set();  // V5: Will move to card level eventually
    this.discoveredFolders = [];
    this.folderWeights = new Map();
    this.isScanning = false;
    this.scanProgress = { current: 0, total: 0 };
    this.discoveryStartTime = null;
    this.discoveryInProgress = false;
    this._scanCancelled = false;
    this._queueCreatedTime = Date.now();
    
    this.queueHistory = [];
    
    // Hierarchical scan queue management
    this.queueShuffleCounter = 0;
    this.SHUFFLE_MIN_BATCH = 10;
    this.SHUFFLE_MAX_BATCH = 1000;
    this.SHUFFLE_PERCENTAGE = 0.10;
    
    // V5: Navigation history REMOVED - card owns this now
    // (Was: this.history = [], this.historyIndex = -1)
    
    // Probability calculation cache
    this.cachedTotalCount = null;
    this.cachedCountSource = null;
    this.lastDiscoveredCount = 0;
    this.totalCountLocked = false;
    
    this._log('🚀 SubfolderQueue initialized with config:', this.config);
    this._log('📋 Priority patterns configured:', this.config.priority_folder_patterns);
  }

  async _waitIfBackgroundPaused(timeoutMs = 60000) {
    if (!this.card) {
      this._log('❌ Queue has no card reference - stopping');
      return;
    }
    
    // V5: cardAdapter is not a DOM element, skip DOM check
    
    if (!this._lastStatusLog || (Date.now() - this._lastStatusLog) > 5000) {
      this._log('🔍 Status: Background paused =', !!this.card._backgroundPaused);
      this._lastStatusLog = Date.now();
    }
    
    const shouldPause = this.card._backgroundPaused;
    
    if (shouldPause) {
      if (!this._autoPaused) {
        this._log('⏸️ Pausing scanning - Background paused:', !!this.card._backgroundPaused);
        this._autoPaused = true;
        this.isScanning = false;
        
        if (this._scanTimeout) {
          clearTimeout(this._scanTimeout);
          this._scanTimeout = null;
          this._log('🛑 Cleared scan timeout');
        }
        
        const mediaPath = this.card.config.media_path;
        if (!window.mediaCardSubfolderQueues.has(mediaPath)) {
          window.mediaCardSubfolderQueues.set(mediaPath, this);
          this._log('💾 Stored queue in map for path:', mediaPath);
        }
      }
      
      throw new Error('SCAN_PAUSED_NOT_VISIBLE');
    }
    
    if (this._autoPaused) {
      this._log('▶️ Resuming scanning - conditions are good');  
      this._autoPaused = false;
    }
    
    return;
  }

  _log(...args) {
    if (!this.card || !this.card._debugMode) {
      return;
    }
    
    if (this.card.config?.suppress_subfolder_logging) {
      return;
    }
    
    console.log('📂 SubfolderQueue:', ...args);
  }

  _checkPathChange() {
    if (!this.card || !this.card.config) {
      this._log('❌ _checkPathChange: No card or config');
      return;
    }
    
    const currentPath = this.card.config.media_path;
    this._log('🔍 _checkPathChange called - currentPath:', currentPath, '_initializedPath:', this._initializedPath);
    
    if (!this._initializedPath) {
      this._initializedPath = currentPath;
      this._log('📍 Initialized path tracking:', currentPath);
      return;
    }
    
    if (this._initializedPath !== currentPath) {
      this._log('🔄 PATH CHANGE DETECTED in queue! From', this._initializedPath, 'to', currentPath, '- clearing queue');
      
      this.isScanning = false;
      this.discoveryInProgress = false;
      
      if (this._scanTimeout) {
        clearTimeout(this._scanTimeout);
        this._scanTimeout = null;
      }
      
      this.shownItems.clear();
      // V5: history removed - card owns navigation history
      this.queue = [];
      this.discoveredFolders = [];
      this.folderWeights.clear();
      this.scanProgress = { current: 0, total: 0 };
      this.discoveryStartTime = null;
      this.queueHistory = [];
      this.queueShuffleCounter = 0;
      this.cachedTotalCount = null;
      this.cachedCountSource = null;
      this.lastDiscoveredCount = 0;
      this.totalCountLocked = false;
      
      this._initializedPath = currentPath;
      this._log('✅ Queue cleared and scanning stopped due to path change - new path:', currentPath);
      
      // V5 FIX: Don't call pauseScanning() here - it sets _scanCancelled=true which prevents
      // initialize() from working. We already stopped scanning above (isScanning=false).
      
      this._log('🔄 Restarting queue scanning with new path');
      this.initialize().catch(error => {
        this._log('❌ Failed to restart queue after path change:', error);
      });
    } else {
      this._log('ℹ️ Path unchanged:', currentPath);
    }
  }

  pauseScanning() {
    this._log('⏸️ SubfolderQueue: Pausing scanning activity (preserving queue data)');
    
    this.isScanning = false;
    this.discoveryInProgress = false;
    this._scanCancelled = true;
    
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }
    
    this._log('⏸️ SubfolderQueue: Scanning paused - queue preserved with', this.queue.length, 'items');
  }

  resumeWithNewCard(newCard) {
    this._log('▶️ SubfolderQueue: Resuming with new card instance');
    this._log('▶️ SubfolderQueue: Previous card:', !!this.card, 'New card:', !!newCard);
    
    this.card = newCard;
    
    if (!this.card._backgroundPaused) {
      this._scanCancelled = false;
      this._log('✅ Cleared cancellation flag - queue can resume scanning');
    } else {
      this._log('⏸️ Card is not visible - keeping queue paused (_scanCancelled stays true)');
    }
    
    this._log('▶️ SubfolderQueue: Reconnected - queue has', this.queue.length, 'items,', this.discoveredFolders.length, 'folders');
    this._log('▶️ SubfolderQueue: isScanning:', this.isScanning, 'discoveryInProgress:', this.discoveryInProgress);
    return true;
  }

  stopScanning() {
    this._log('🛑 SubfolderQueue: Stopping all scanning activity');
    this._log('🛑 SubfolderQueue: Scanning stopped and card reference will be cleared');
    
    this.isScanning = false;
    this.discoveryInProgress = false;
    
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }
    
    this.card = null;
  }

  isDiscoveryInProgress() {
    if (!this.discoveryInProgress) return false;
    
    const discoveryDuration = Date.now() - (this.discoveryStartTime || 0);
    if (discoveryDuration > 30000) {
      this._log('⏰ Discovery timeout reached - allowing auto-refresh');
      this.discoveryInProgress = false;
      return false;
    }
    
    return true;
  }

  getPathWeightMultiplier(folderPath) {
    let multiplier = 1.0;
    
    if (this.config.priority_folder_patterns.length === 0) {
      return multiplier;
    }
    
    for (const pattern of this.config.priority_folder_patterns) {
      const patternPath = pattern.path || pattern;
      
      if (folderPath.includes(patternPath)) {
        multiplier = Math.max(multiplier, pattern.weight_multiplier || 3.0);
      }
    }
    
    return multiplier;
  }

  calculateFolderWeight(folder) {
    let baseWeight;
    if (folder.fileCount === 0) {
      return 0;
    } else if (folder.fileCount < 5) {
      baseWeight = folder.fileCount * 0.5;
    } else {
      baseWeight = Math.log10(folder.fileCount) * 10;
    }
    
    const pathMultiplier = this.getPathWeightMultiplier(folder.path);
    
    let sizeMultiplier = 1.0;
    if (folder.fileCount > 10000) {
      sizeMultiplier = 1.8;
    } else if (folder.fileCount > 1000) {
      sizeMultiplier = 1.5;
    } else if (folder.fileCount > 100) {
      sizeMultiplier = 1.2;
    }
    
    const finalWeight = baseWeight * pathMultiplier * sizeMultiplier;
    
    return finalWeight;
  }

  getTotalMediaCount(currentDiscoveredCount) {
    if (this.config.estimated_total_photos) {
      if (this.discoveryInProgress && this.config.estimated_total_photos > currentDiscoveredCount * 20) {
        const tempCount = Math.max(currentDiscoveredCount * 3, 100);
        return tempCount;
      }
      
      if (this.cachedTotalCount !== this.config.estimated_total_photos) {
        this.cachedTotalCount = this.config.estimated_total_photos;
        this.cachedCountSource = 'user_estimate';
      }
      return this.cachedTotalCount;
    }
    
    if (this.totalCountLocked && this.cachedTotalCount) {
      return this.cachedTotalCount;
    }
    
    const changeThreshold = 0.2;
    const countGrowth = this.lastDiscoveredCount > 0 
      ? (currentDiscoveredCount - this.lastDiscoveredCount) / this.lastDiscoveredCount 
      : 1.0;
    
    if (!this.cachedTotalCount || countGrowth > changeThreshold) {
      const conservativeMultiplier = this.discoveryInProgress ? 3.0 : 1.2;
      this.cachedTotalCount = Math.max(currentDiscoveredCount, Math.round(currentDiscoveredCount * conservativeMultiplier));
      this.lastDiscoveredCount = currentDiscoveredCount;
      this.cachedCountSource = 'adaptive';
    }
    
    return this.cachedTotalCount;
  }

  lockTotalCount() {
    if (!this.config.estimated_total_photos && this.cachedTotalCount) {
      this.totalCountLocked = true;
      this.cachedCountSource = 'discovery_complete';
    }
  }

  async initialize() {
    this._checkPathChange();
    
    // V5: Allow both random and sequential modes
    const folderMode = this.card.config.folder_mode || 'random';
    if (!this.config.enabled && folderMode === 'random') {
      this._log('❌ Queue disabled');
      return false;
    }

    if (this.card._backgroundPaused) {
      this._log('❌ Skipping initialization - explicitly paused:', !!this.card._backgroundPaused);
      return false;
    }

    // Sequential mode: Always clear queue and rescan to ensure proper ordering from start
    // Random mode: Can reuse existing queue
    const isSequentialMode = folderMode === 'sequential';
    if (this.queue.length > 0) {
      if (isSequentialMode) {
        this._log('🔄 Sequential mode: Clearing existing queue (', this.queue.length, 'items) to rescan from beginning');
        this.queue = [];
        this.shownItems.clear();
      } else {
        this._log('✅ Queue already populated with', this.queue.length, 'items - skipping scan');
        return true;
      }
    }

    this._log('🚀 Starting subfolder queue initialization');
    this.isScanning = true;
    this.discoveryInProgress = true;
    this._scanCancelled = false;
    this.discoveryStartTime = Date.now();
    
    try {
      await this.quickScan();
      this._log('✅ Initialize completed via full scan');
      
      return true;
    } catch (error) {
      this._log('❌ Queue initialization failed:', error);
      return false;
    } finally {
      this.isScanning = false;
      this.discoveryInProgress = false;
      this.lockTotalCount();
    }
  }

  async quickScan() {
    if (this._scanCancelled) {
      this._log('🚫 Quick scan cancelled');
      this.isScanning = false;
      return false;
    }
    
    this._log('⚡ Starting quick scan for all folders');
    
    try {
      const basePath = this.card.config.media_path;
      if (!basePath) {
        this._log('❌ No base media path configured');
        this.isScanning = false;
        return false;
      }

      this._log('🔍 Discovering subfolders from base path:', basePath, 'max depth:', this.config.scan_depth);
      
      // V5: Always use hierarchical scan (config flag removed for simplicity)
      this._log('🏗️ Using hierarchical scan architecture');
      
      try {
        const scanResult = await this.hierarchicalScanAndPopulate(basePath, 0, this.config.scan_depth);
        
        if (!scanResult || scanResult.error) {
          this._log('⚠️ Hierarchical scan failed:', scanResult?.error || 'unknown error');
          return false;
        }
        
        this._log('✅ Hierarchical scan completed:', 
                 'files processed:', scanResult.filesProcessed,
                 'files added:', scanResult.filesAdded, 
                 'folders processed:', scanResult.foldersProcessed,
                 'queue size:', this.queue.length);
        
        this._log('📊 discoveredFolders array has', this.discoveredFolders.length, 'folders');
        if (this.discoveredFolders.length > 0) {
          this._log('📂 Discovered folder paths:', 
                    this.discoveredFolders.map(f => `${f.path} (${f.fileCount} files)`).join(', '));
        }
        
        // Only shuffle in random mode - sequential mode maintains sorted order
        const isSequentialMode = this.card.config.folder_mode === 'sequential';
        if (this.queue.length > 0 && !isSequentialMode) {
          this.shuffleQueue();
          this.queueShuffleCounter = 0;
          this._log('🔀 Final shuffle completed after hierarchical scan - queue size:', this.queue.length);
        } else if (isSequentialMode) {
          this._log('📋 Sequential mode: Sorting entire queue by date/timestamp...');
          // Sort entire queue to ensure newest files are first (or oldest, based on config)
          const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
          
          // Helper to extract sortable timestamp from any media source
          const getTimestampForSort = (file) => {
            const mediaId = file.media_content_id;
            
            // 1. Reolink: Extract the second timestamp (actual video start time)
            if (mediaId && mediaId.includes('reolink') && mediaId.includes('|')) {
              const parts = mediaId.split('|');
              const timestamps = parts.filter(p => /^\d{14}$/.test(p));
              const timestamp = timestamps.length > 1 ? timestamps[1] : timestamps[0];
              if (timestamp) return timestamp;
            }
            
            // 2. Try date_taken metadata if available
            if (file.metadata?.date_taken) {
              const date = new Date(file.metadata.date_taken);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              const seconds = String(date.getSeconds()).padStart(2, '0');
              return `${year}${month}${day}${hours}${minutes}${seconds}`;
            }
            
            // 3. Fallback to title/filename
            return (file.title || '').toLowerCase();
          };
          
          // Helper to get numeric value for comparison
          // If key is purely numeric, use it directly
          // If alphanumeric, try to extract date using MediaProvider helper
          const getNumericValue = (key) => {
            if (/^\d+$/.test(key)) {
              return BigInt(key);
            }
            // Try extracting date from the key (which is filename/title)
            const dateFromKey = MediaProvider.extractDateFromFilename(key, this.card.config);
            if (dateFromKey) {
              return BigInt(dateFromKey.getTime());
            }
            return null;
          };
          
          this.queue.sort((a, b) => {
            const keyA = getTimestampForSort(a);
            const keyB = getTimestampForSort(b);
            
            const numA = getNumericValue(keyA);
            const numB = getNumericValue(keyB);
            
            // Files with dates should come before files without dates
            if (numA !== null && numB === null) return -1;
            if (numA === null && numB !== null) return 1;
            
            // Both have numeric dates - compare them
            if (numA !== null && numB !== null) {
              if (orderDirection === 'desc') {
                return numB > numA ? 1 : numB < numA ? -1 : 0;
              } else {
                return numA > numB ? 1 : numA < numB ? -1 : 0;
              }
            }
            
            // Both are non-date filenames - use localeCompare for alphabetical
            if (orderDirection === 'desc') {
              return keyB.localeCompare(keyA);
            } else {
              return keyA.localeCompare(keyB);
            }
          });
          
          this._log('✅ Queue sorted', orderDirection, '- first item:', this.queue[0]?.title, 'last item:', this.queue[this.queue.length - 1]?.title);
        }
        
        return true;
        
      } catch (error) {
        this._log('❌ Hierarchical scan error:', error.message);
        return false;
      }
      
    } catch (error) {
      this._log('❌ Quick scan failed:', error);
      this.isScanning = false;
      return false;
    }
  }

  async hierarchicalScanAndPopulate(basePath, currentDepth = 0, maxDepth = null) {
    this._log('🔎 hierarchicalScanAndPopulate called:', 'basePath:', basePath, 'currentDepth:', currentDepth, 'maxDepth:', maxDepth);
    
    await this._waitIfBackgroundPaused();
    
    if (!this.isScanning || this._scanCancelled) {
      this._log('🛑 Scanning stopped/paused/cancelled - exiting hierarchical scan');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    const effectiveMaxDepth = maxDepth !== null ? maxDepth : this.config.scan_depth;
    
    // For scan_depth=0: scan base folder (depth 0) only, not subfolders (depth 1+)
    // For scan_depth=1: scan base folder + 1 level of subfolders (depth 0-1)
    if (effectiveMaxDepth !== null && effectiveMaxDepth >= 0 && currentDepth > effectiveMaxDepth) {
      this._log('📁 Max depth reached:', currentDepth, '(configured limit:', effectiveMaxDepth, ')');
      return { filesProcessed: 0, foldersProcessed: 0 };
    }
    
    try {
      const timeoutDuration = 180000;
      
      const apiTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`API timeout at depth ${currentDepth} after ${timeoutDuration/1000}s`)), timeoutDuration)
      );
      
      await this._waitIfBackgroundPaused();
      
      if (!this.isScanning || this._scanCancelled) {
        this._log('🛑 Scanning stopped/paused/cancelled - exiting before API call');
        return { filesProcessed: 0, foldersProcessed: 0 };
      }
      
      const folderContents = await Promise.race([
        this.card.hass.callWS({
          type: "media_source/browse_media",
          media_content_id: basePath
        }),
        apiTimeout
      ]);

      this._log('🔍 API Response for', basePath);
      this._log('   - children:', folderContents?.children?.length || 0);
      if (folderContents?.children && folderContents.children.length > 0) {
        this._log('   - First 3 items:', JSON.stringify(folderContents.children.slice(0, 3), null, 2));
      }

      if (!folderContents?.children) {
        this._log('📁 No children found at depth:', currentDepth);
        return { filesProcessed: 0, foldersProcessed: 0 };
      }

      const folderName = basePath.split('/').pop() || 'root';
      
      // Filter files - some media sources (like Synology) don't set media_class, so check by extension too
      const allFiles = folderContents.children.filter(child => {
        // Skip if it's explicitly a folder
        if (child.can_expand) return false;
        
        // Include if media_class indicates media
        if (child.media_class === 'image' || child.media_class === 'video') return true;
        
        // Otherwise check by file extension (prefer title for Immich compatibility)
        const pathForExtCheck = child.title || child.media_content_id || '';
        return this.card._isMediaFile(pathForExtCheck);
      });
      
      this._log('🔍 After initial filter:', allFiles.length, 'files (from', folderContents.children.length, 'total items)');
      
      let files = allFiles;
      
      // Filter by configured media_type (image/video/all)
      const configuredMediaType = this.card.config.media_type || 'all';
      this._log('🔍 Configured media_type:', configuredMediaType);
      
      if (configuredMediaType !== 'all') {
        const beforeFilter = files.length;
        files = files.filter(file => {
          // Use title for Immich compatibility (title = clean filename)
          const filePath = file.title || file.media_content_id || '';
          const fileType = MediaUtils.detectFileType(filePath);
          
          // If fileType is known, use it; otherwise, fall back to media_class
          if (fileType) {
            return fileType === configuredMediaType;
          } else if (file.media_class) {
            return file.media_class === configuredMediaType;
          }
          // If neither, exclude
          return false;
        });
        this._log('🔍 Media type filter (', configuredMediaType, '):', beforeFilter, '→', files.length, 'files');
      }
      
      // V5 FIX: Exclude _Junk and _Edit folders from root of media path
      const rootMediaPath = this.card.config.media_path;
      const subfolders = folderContents.children.filter(child => {
        if (!child.can_expand) return false;
        
        // Only exclude _Junk and _Edit if they're direct children of root
        if (basePath === rootMediaPath) {
          const folderName = (child.media_content_id || child.title || '').split('/').pop() || '';
          
          if (folderName === '_Junk' || folderName === '_Edit') {
            this._log('🚫 Excluding root folder:', folderName);
            return false;
          }
        }
        
        return true;
      });
      
      this._log('📊 At depth', currentDepth, 'found:', files.length, 'files,', subfolders.length, 'subfolders');
      if (subfolders.length > 0) {
        this._log('📂 Subfolder names:', subfolders.map(f => f.title || f.media_content_id.split('/').pop()).join(', '));
      }

      if (files.length > 0 || subfolders.length > 0) {
        const folderInfo = {
          path: basePath,
          title: folderName,
          fileCount: files.length,
          files: files,
          depth: currentDepth,
          isSampled: false
        };
        
        const existingIndex = this.discoveredFolders.findIndex(f => f.path === basePath);
        if (existingIndex === -1) {
          this.discoveredFolders.push(folderInfo);
        } else {
          this.discoveredFolders[existingIndex] = folderInfo;
        }
      }

      let filesAdded = 0;
      
      // Sequential mode: add ALL files (no probability sampling)
      // Random mode: use probability sampling for large folders
      const isSequentialMode = this.card.config.folder_mode === 'sequential';
      const basePerFileProbability = isSequentialMode ? 1.0 : this.calculatePerFileProbability();
      const weightMultiplier = this.getPathWeightMultiplier(basePath);
      const perFileProbability = Math.min(basePerFileProbability * weightMultiplier, 1.0);
      
      const existingQueueIds = new Set(this.queue.map(item => item.media_content_id));
      let availableFiles = files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !existingQueueIds.has(file.media_content_id)
      );
      
      // Sequential mode: Sort files within folder to match folder sort order
      if (isSequentialMode) {
        const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
        
        // Helper to extract sortable timestamp/date key from any media source
        const getTimestampForSort = (file) => {
          const mediaId = file.media_content_id;
          
          // 1. Reolink: Extract the second timestamp (actual video start time)
          if (mediaId && mediaId.includes('reolink') && mediaId.includes('|')) {
            const parts = mediaId.split('|');
            const timestamps = parts.filter(p => /^\d{14}$/.test(p));
            // Use second timestamp if available (matches video title time)
            const timestamp = timestamps.length > 1 ? timestamps[1] : timestamps[0];
            if (timestamp) {
              return timestamp; // YYYYMMDDHHMMSS format - sorts correctly as string
            }
          }
          
          // 2. Try extracting date from filename using MediaProvider's date extraction
          // For Immich and other sources, file.title is the clean filename
          const filename = file.title || MediaProvider.extractFilename(mediaId);
          const dateFromFilename = MediaProvider.extractDateFromFilename(filename, this.config);
          
          if (dateFromFilename) {
            // Convert to YYYYMMDDHHMMSS format for consistent sorting
            const year = dateFromFilename.getFullYear();
            const month = String(dateFromFilename.getMonth() + 1).padStart(2, '0');
            const day = String(dateFromFilename.getDate()).padStart(2, '0');
            const hours = String(dateFromFilename.getHours()).padStart(2, '0');
            const minutes = String(dateFromFilename.getMinutes()).padStart(2, '0');
            const seconds = String(dateFromFilename.getSeconds()).padStart(2, '0');
            return `${year}${month}${day}${hours}${minutes}${seconds}`;
          }
          
          // 3. Fallback to title or filename for alphabetical sorting
          return (file.title || filename || '').toLowerCase();
        };
        
        availableFiles = [...availableFiles].sort((a, b) => {
          const keyA = getTimestampForSort(a);
          const keyB = getTimestampForSort(b);
          
          // Helper to get numeric value for comparison
          // If key is purely numeric, use it directly
          // If alphanumeric, try to extract date using MediaProvider helper
          const getNumericValue = (key, file) => {
            if (/^\d+$/.test(key)) {
              return BigInt(key);
            }
            // Try extracting date from the key (which is filename/title)
            const dateFromKey = MediaProvider.extractDateFromFilename(key, this.card.config);
            if (dateFromKey) {
              return BigInt(dateFromKey.getTime());
            }
            return null;
          };
          
          const numA = getNumericValue(keyA, a);
          const numB = getNumericValue(keyB, b);
          
          // Files with dates should come before files without dates
          if (numA !== null && numB === null) return -1;
          if (numA === null && numB !== null) return 1;
          
          // Both have numeric dates - compare them
          if (numA !== null && numB !== null) {
            if (orderDirection === 'desc') {
              return numB > numA ? 1 : numB < numA ? -1 : 0; // Newest first
            } else {
              return numA > numB ? 1 : numA < numB ? -1 : 0; // Oldest first
            }
          }
          
          // Both are non-date filenames - use localeCompare for alphabetical
          if (orderDirection === 'desc') {
            return keyB.localeCompare(keyA);
          } else {
            return keyA.localeCompare(keyB);
          }
        });
        
        this._log('📅 Sequential: Sorted', availableFiles.length, 'files', orderDirection, 'in', folderName);
        
        // Sequential mode: Respect slideshow_window to limit scanning
        // Add files in order until we reach the target queue size
        const targetQueueSize = this.card.config.slideshow_window || 1000;
        for (const file of availableFiles) {
          // Stop adding if we've reached the target queue size
          if (this.queue.length >= targetQueueSize) {
            this._log('⏹️ Sequential: Reached target queue size', targetQueueSize, '- stopping scan');
            this._scanCancelled = true; // Stop hierarchical scan
            break;
          }
          
          await this._waitIfBackgroundPaused();
          await this.addFileToQueueWithBatching(file, folderName);
          filesAdded++;
        }
      } else {
        // Random mode: Use probability sampling
        for (const file of availableFiles) {
          await this._waitIfBackgroundPaused();
          
          if (Math.random() < perFileProbability) {
            await this.addFileToQueueWithBatching(file, folderName);
            filesAdded++;
          }
        }
      }

      let subfoldersProcessed = 0;
      // Recursion logic:
      // - scan_depth=null: Recurse infinitely
      // - scan_depth=0: Don't recurse (single folder only)
      // - scan_depth=N: Recurse up to depth N (e.g., scan_depth=1 means base + 1 level)
      const shouldRecurse = subfolders.length > 0 && 
        (effectiveMaxDepth === null || currentDepth < effectiveMaxDepth);
      
      this._log('🔍 Recursion check at depth', currentDepth, ':', 
                'subfolders:', subfolders.length, 
                'effectiveMaxDepth:', effectiveMaxDepth, 
                'currentDepth:', currentDepth,
                'shouldRecurse:', shouldRecurse,
                'stopScanning:', this.stopScanning);
      
      if (subfolders.length > 0) {
        this._log('📂 Subfolder sample:', subfolders[0]?.title || subfolders[0]?.media_content_id.split('/').pop(),
                  '| Full ID:', subfolders[0]?.media_content_id);
      }
      
      if (shouldRecurse) {
        await this._waitIfBackgroundPaused();

        // Sort subfolders for efficient sequential scanning
        const isSequentialMode = this.card.config.folder_mode === 'sequential';
        const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
        
        let sortedSubfolders;
        if (isSequentialMode) {
          // Sequential mode: Sort folders by name (descending = newest first, ascending = oldest first)
          // Most camera/NVR folders use date-based naming (YYYYMMDD, YYYY-MM-DD, YYYY/M/D, etc.)
          sortedSubfolders = [...subfolders].sort((a, b) => {
            const nameA = (a.title || a.media_content_id.split('/').pop() || '');
            const nameB = (b.title || b.media_content_id.split('/').pop() || '');
            
            // Extract numeric parts for proper date comparison
            // Handles: "2026/1/12", "2026-01-12", "20260112", etc.
            const extractDateValue = (name) => {
              // Try to extract all numbers from the name
              const numbers = name.match(/\d+/g);
              if (!numbers) return 0;
              
              // If looks like YYYYMMDD (8 digits), parse directly
              if (numbers.length === 1 && numbers[0].length === 8) {
                return parseInt(numbers[0], 10);
              }
              
              // If we have year/month/day parts (e.g., "2026/1/12" or "2026-01-12")
              if (numbers.length >= 3) {
                const year = parseInt(numbers[0], 10);
                const month = parseInt(numbers[1], 10);
                const day = parseInt(numbers[2], 10);
                // Create sortable number: YYYYMMDD
                return year * 10000 + month * 100 + day;
              }
              
              // If we have just one number (e.g., day folder "12" inside month folder)
              if (numbers.length === 1) {
                return parseInt(numbers[0], 10);
              }
              
              // Fallback: join all numbers
              return parseInt(numbers.join(''), 10) || 0;
            };
            
            const valueA = extractDateValue(nameA);
            const valueB = extractDateValue(nameB);
            
            if (orderDirection === 'desc') {
              // Descending: newest dates first (higher values first)
              return valueB - valueA;
            } else {
              // Ascending: oldest dates first (lower values first)
              return valueA - valueB;
            }
          });
          
          this._log('📅 Sequential mode: Sorted', subfolders.length, 'folders', orderDirection, 
                    '| First:', sortedSubfolders[0]?.title || sortedSubfolders[0]?.media_content_id.split('/').pop(),
                    '| Last:', sortedSubfolders[sortedSubfolders.length - 1]?.title || sortedSubfolders[sortedSubfolders.length - 1]?.media_content_id.split('/').pop());
        } else {
          // Random mode: Shuffle to prevent alphabetical bias
          sortedSubfolders = [...subfolders].sort(() => Math.random() - 0.5);
          this._log('🎲 Random mode: Shuffled', subfolders.length, 'folders');
        }

        // Sequential mode: Process folders one-at-a-time to maintain order
        // Random mode: Process 2 at a time for better performance
        const maxConcurrent = isSequentialMode ? 1 : 2;
        
        const subfolderResults = await this.processLevelConcurrently(
          sortedSubfolders, 
          maxConcurrent,
          currentDepth + 1, 
          effectiveMaxDepth
        );
        
        subfoldersProcessed = subfolderResults?.foldersProcessed || subfolders.length;
      }

      return {
        filesProcessed: files.length,
        filesAdded: filesAdded,
        foldersProcessed: subfoldersProcessed,
        depth: currentDepth
      };

    } catch (error) {
      this._log('⚠️ Hierarchical scan error at depth', currentDepth, ':', error.message);
      return {
        filesProcessed: 0,
        filesAdded: 0, 
        foldersProcessed: 0,
        depth: currentDepth,
        error: error.message
      };
    }
  }

  async processLevelConcurrently(folders, maxConcurrent = 2, nextDepth, maxDepth) {
    if (!folders || folders.length === 0) return;
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < folders.length; i += maxConcurrent) {
      const batch = folders.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map((folder, index) => (async () => {
        await this._waitIfBackgroundPaused();
        try {
          await this.hierarchicalScanAndPopulate(folder.media_content_id, nextDepth, maxDepth);
          processedCount++;
        } catch (error) {
          errorCount++;
        }
      })());
      
      try {
        await Promise.allSettled(batchPromises);
      } catch (error) {
        this._log('⚠️ Unexpected batch processing error:', error.message);
      }
    }
    
    return {
      foldersProcessed: processedCount,
      folderErrors: errorCount,
      totalFolders: folders.length,
      depth: nextDepth
    };
  }

  async addFileToQueueWithBatching(file, folderName = null) {
    if (!file) return;

    // Ensure media_content_type is set for video detection
    if (!file.media_content_type && file.media_class) {
      // Set based on media_class (image/video)
      if (file.media_class === 'video') {
        file.media_content_type = 'video';
      } else if (file.media_class === 'image') {
        file.media_content_type = 'image';
      }
    }
    
    // Fallback: detect from file extension if still not set
    if (!file.media_content_type) {
      const filePath = file.title || file.media_content_id || '';
      const fileType = MediaUtils.detectFileType(filePath);
      file.media_content_type = fileType || 'image';
    }

    this.queue.push(file);

    const historyEntry = {
      file: file,
      timestamp: new Date().toISOString(),
      folderName: folderName || MediaProvider.extractFolderName(file),
      source: 'hierarchical_scan'
    };
    this.queueHistory.push(historyEntry);

    // Skip shuffle logic in sequential mode (order must be preserved)
    const isSequentialMode = this.card.config.folder_mode === 'sequential';
    if (!isSequentialMode) {
      this.queueShuffleCounter = (this.queueShuffleCounter || 0) + 1;

      const shuffleThreshold = Math.min(
        this.SHUFFLE_MAX_BATCH, 
        Math.max(this.SHUFFLE_MIN_BATCH, Math.floor(this.queue.length * this.SHUFFLE_PERCENTAGE))
      );

      if (this.queueShuffleCounter >= shuffleThreshold) {
        this.shuffleQueue();
        this.queueShuffleCounter = 0;
      }
    }
  }

  calculatePerFileProbability() {
    const totalPhotos = this.config.estimated_total_photos;
    const targetQueueSize = this.card.config.slideshow_window || 1000;
    const currentQueueSize = this.queue.length;
    
    if (!totalPhotos || totalPhotos <= 0) {
      return 0.01;
    }
    
    const baseProbability = targetQueueSize / totalPhotos;
    
    let adjustmentMultiplier = 1.0;
    
    if (currentQueueSize < 10) {
      adjustmentMultiplier = 10.0;
    } else if (currentQueueSize < 30) {
      adjustmentMultiplier = 3.0;
    } else if (currentQueueSize < 50) {
      adjustmentMultiplier = 1.5;
    }
    
    const adjustedProbability = Math.min(baseProbability * adjustmentMultiplier, 1.0);
    
    return adjustedProbability;
  }

  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  // V5: Simplified - just return next item from queue
  // Card manages history/navigation, provider just supplies items
  getNextItem() {
    // Refill if empty
    if (this.queue.length === 0) {
      this.refillQueue();
      if (this.queue.length === 0) {
        return null;
      }
    }

    // Find first unshown item
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      if (!this.shownItems.has(item.media_content_id)) {
        this.shownItems.add(item.media_content_id);
        this.queue.splice(i, 1);
        
        // Trigger refill if running low
        if (this.needsRefill()) {
          setTimeout(() => this.refillQueue(), 100);
        }
        
        return item;
      }
    }

    // All items in queue have been shown - age out and try again
    this.ageOutShownItems();
    this.refillQueue();
    
    if (this.queue.length > 0) {
      const item = this.queue[0];
      this.shownItems.add(item.media_content_id);
      this.queue.shift();
      return item;
    }
    
    return null;
  }

  // V5: REMOVED - Card handles previous navigation via history
  // getPreviousItem() deleted - card.history manages this

  needsRefill() {
    const unshownCount = this.queue.filter(item => !this.shownItems.has(item.media_content_id)).length;
    const historyItems = this.card?.history?.length || 0;
    
    // Calculate total files available in discovered folders
    const totalFilesInCollection = this.discoveredFolders.reduce((sum, folder) => 
      sum + (folder.files ? folder.files.length : 0), 0);
    
    // For small collections, use a smaller buffer (50% of collection or 5, whichever is larger)
    // For large collections, use the standard buffer calculation
    let minBuffer;
    if (totalFilesInCollection > 0 && totalFilesInCollection < 30) {
      minBuffer = Math.max(Math.ceil(totalFilesInCollection * 0.5), 5);
    } else {
      minBuffer = Math.max(historyItems + 5, 15);
    }
    
    return unshownCount < minBuffer;
  }

  clearShownItems() {
    this.shownItems.clear();
  }

  ageOutShownItems() {
    const totalShown = this.shownItems.size;
    if (totalShown === 0) return;
    
    const keepPercentage = 0.3;
    const itemsToKeep = Math.ceil(totalShown * keepPercentage);
    const itemsToAge = totalShown - itemsToKeep;
    
    if (itemsToAge <= 0) {
      this.clearShownItems();
      return;
    }
    
    const shownArray = Array.from(this.shownItems);
    const itemsToKeep_array = shownArray.slice(-itemsToKeep);
    
    this.shownItems.clear();
    itemsToKeep_array.forEach(item => this.shownItems.add(item));
  }

  refillQueue() {
    this._checkPathChange();
    
    if (this.isScanning) {
      if (this.discoveryStartTime && (Date.now() - this.discoveryStartTime) > 180000) {
        this.isScanning = false;
      } else {
        return;
      }
    }

    if (this.discoveredFolders.length === 0) {
      this._log('❌ No folders available for refill');
      return;
    }

    const totalFiles = this.discoveredFolders.reduce((sum, folder) => sum + (folder.files ? folder.files.length : 0), 0);
    
    if (totalFiles === 0) {
      this._log('❌ No files found in any folder');
      return;
    }

    const totalAvailableFiles = this.discoveredFolders.reduce((count, folder) => {
      if (!folder.files) return count;
      const availableInFolder = folder.files.filter(file => 
        !this.shownItems.has(file.media_content_id) && 
        !this.queue.some(qItem => qItem.media_content_id === file.media_content_id)
      ).length;
      return count + availableInFolder;
    }, 0);

    this._log('🔍 Total available files:', totalAvailableFiles, 'shownItems.size:', this.shownItems.size, 'queue.length:', this.queue.length);
    
    const shouldClearShownItems = totalAvailableFiles === 0 && this.shownItems.size > 0;
    if (shouldClearShownItems) {
      this._log('♻️ All files shown - will clear shownItems after collecting files for refill');
    }

    const historyItems = this.card?.history?.length || 0;
    const minQueueSize = Math.max(historyItems + 15, 25);
    const currentQueueSize = this.queue.length;
    
    if (currentQueueSize < minQueueSize) {
      this._log('🔄 Queue needs refill:', currentQueueSize, 'items, target minimum:', minQueueSize);
      
      // Calculate how many items to add
      const targetSize = Math.min(minQueueSize * 2, this.config.slideshow_window || 1000);
      const itemsToAdd = Math.max(targetSize - currentQueueSize, 10);
      
      // V4: Copy populateQueueFromFolders logic for refilling queue
      this._populateQueueFromDiscoveredFolders(itemsToAdd, shouldClearShownItems);
      this._log('✅ Refill complete - queue now has', this.queue.length, 'items');
    } else {
      this._log('✅ Queue sufficient:', currentQueueSize, '(min needed:', minQueueSize, ')');
    }
  }

  // V4 CODE REUSE: Adapted from populateQueueFromFolders (ha-media-card.js lines 9312+)
  async _populateQueueFromDiscoveredFolders(itemsToAdd, clearShownItemsAfter = false) {
    const folderMode = this.card.config.folder_mode || 'random';
    
    this._log('🔍 Refill check - discoveredFolders:', this.discoveredFolders.length, 
              'folders, mode:', folderMode, 'clearShownItemsAfter:', clearShownItemsAfter);
    
    if (folderMode === 'sequential') {
      // Sequential mode: collect available items, add to queue, then sort entire queue
      
      // In sequential mode with loop-back, clear shownItems BEFORE collecting
      // so we can re-collect all files for the next loop
      if (clearShownItemsAfter) {
        this._log('♻️ Clearing shownItems BEFORE collecting (sequential loop-back)');
        this.shownItems.clear();
      }
      
      const availableFiles = [];
      
      for (const folder of this.discoveredFolders) {
        if (!folder.files) continue;
        
        this._log('📂 Checking folder:', folder.path, 'with', folder.files.length, 'files');
        
        for (const file of folder.files) {
          // Skip if already in queue or already shown
          if (this.queue.some(q => q.media_content_id === file.media_content_id)) continue;
          if (this.shownItems.has(file.media_content_id)) continue;
          
          availableFiles.push(file);
        }
      }
      
      this._log('🔍 Available files for refill:', availableFiles.length);
      
      // Sort available files first, then add to queue
      // This preserves queue order without re-sorting already-queued items
      const orderBy = this.card.config.folder?.order_by || 'date_taken';
      const orderDirection = this.card.config.folder?.sequential?.order_direction || 'desc';
      
      availableFiles.sort((a, b) => {
        const aValue = a.metadata?.[orderBy];
        const bValue = b.metadata?.[orderBy];
        if (!aValue || !bValue) return 0;
        const comparison = aValue < bValue ? -1 : (aValue > bValue ? 1 : 0);
        return orderDirection === 'desc' ? -comparison : comparison;
      });
      
      // Add sorted items to queue (up to itemsToAdd)
      const toAdd = availableFiles.slice(0, itemsToAdd);
      this.queue.push(...toAdd);
      
      this._log('🔄 Added', toAdd.length, 'sequential items to queue (pre-sorted, not re-sorting entire queue)');
    } else {
      // Random mode: randomly select from discoveredFolders
      const availableFiles = [];
      
      for (const folder of this.discoveredFolders) {
        if (!folder.files) continue;
        
        for (const file of folder.files) {
          // Skip if already in queue or already shown
          if (this.queue.some(q => q.media_content_id === file.media_content_id)) continue;
          if (this.shownItems.has(file.media_content_id)) continue;
          
          availableFiles.push(file);
        }
      }
      
      this._log('🔍 Available files for refill:', availableFiles.length);
      
      // NOW clear shownItems AFTER collecting available files (same as sequential mode)
      if (clearShownItemsAfter) {
        this._log('♻️ Clearing shownItems now (after collecting available files)');
        this.shownItems.clear();
      }
      
      // Randomly shuffle and add
      const shuffled = availableFiles.sort(() => Math.random() - 0.5);
      const toAdd = shuffled.slice(0, itemsToAdd);
      this.queue.push(...toAdd);
      
      this._log('🔄 Added', toAdd.length, 'random items to queue from', availableFiles.length, 'available');
    }
  }

  // Shared sorting logic for queue (used by initial fill and refill)
  _sortQueue() {
    const orderBy = this.card.config.folder?.order_by || 'date_taken';
    const direction = this.card.config.folder?.sequential?.order_direction || 'desc';
    const priorityNewFiles = this.card.config.folder?.priority_new_files || false;
    const thresholdSeconds = this.card.config.folder?.new_files_threshold_seconds || 3600;
    
    this._log('_sortQueue - orderBy:', orderBy, 'direction:', direction, 'priorityNewFiles:', priorityNewFiles);
    this._log('Full sequential config:', this.card.config.folder?.sequential);
    
    // For date-based sorting, use two-pass approach: dated files first, then non-dated
    if (orderBy === 'date_taken' || orderBy === 'modified_time') {
      const datedFiles = [];
      const nonDatedFiles = [];
      
      // Separate files into dated and non-dated groups
      for (const item of this.queue) {
        let hasDate = false;
        
        // Check EXIF data first
        if (item.metadata?.date_taken) {
          hasDate = true;
        } else {
          // Check filename
          const filename = MediaProvider.extractFilename(item.media_content_id);
          const dateFromFilename = MediaProvider.extractDateFromFilename(filename, this.config);
          hasDate = !!dateFromFilename;
        }
        
        if (hasDate) {
          datedFiles.push(item);
        } else {
          nonDatedFiles.push(item);
        }
      }
      
      // Sort dated files chronologically
      datedFiles.sort((a, b) => {
        let aVal, bVal;
        
        if (a.metadata?.date_taken && b.metadata?.date_taken) {
          aVal = new Date(a.metadata.date_taken).getTime();
          bVal = new Date(b.metadata.date_taken).getTime();
        } else {
          const aFilename = MediaProvider.extractFilename(a.media_content_id);
          const bFilename = MediaProvider.extractFilename(b.media_content_id);
          const aDate = MediaProvider.extractDateFromFilename(aFilename, this.config);
          const bDate = MediaProvider.extractDateFromFilename(bFilename, this.config);
          aVal = aDate ? aDate.getTime() : 0;
          bVal = bDate ? bDate.getTime() : 0;
        }
        
        const comparison = aVal - bVal;
        return direction === 'asc' ? comparison : -comparison;
      });
      
      // Sort non-dated files alphabetically
      nonDatedFiles.sort((a, b) => {
        const aFilename = MediaProvider.extractFilename(a.media_content_id);
        const bFilename = MediaProvider.extractFilename(b.media_content_id);
        const comparison = aFilename.localeCompare(bFilename);
        return direction === 'asc' ? comparison : -comparison;
      });
      
      // If ALL files are non-dated, preserve scan order (files were already sorted during hierarchical scan)
      if (datedFiles.length === 0 && nonDatedFiles.length === this.queue.length) {
        this._log('✅ All files non-dated - preserving scan order (already sorted during hierarchical scan)');
        return; // Keep existing queue order
      }
      
      // Combine: dated files first, then non-dated files
      this.queue = [...datedFiles, ...nonDatedFiles];
      
      this._log('✅ Two-pass sort complete:', datedFiles.length, 'dated files,', nonDatedFiles.length, 'non-dated files');
      return; // Skip the standard comparator below
    }
    
    // Standard sort comparator function for non-date sorting
    const compareItems = (a, b) => {
      let aVal, bVal;
      
      switch(orderBy) {
        case 'filename':
          aVal = MediaProvider.extractFilename(a.media_content_id);
          bVal = MediaProvider.extractFilename(b.media_content_id);
          break;
        case 'path':
          aVal = a.media_content_id;
          bVal = b.media_content_id;
          break;
        default:
          aVal = a.media_content_id;
          bVal = b.media_content_id;
      }
      
      const comparison = String(aVal).localeCompare(String(bVal));
      return direction === 'asc' ? comparison : -comparison;
    };
    
    // V5 FEATURE: Priority new files - filesystem scanning mode
    // Prepend recently discovered files to front of queue (V4 feature restoration)
    // Note: "New" means recently discovered by file scanner, not necessarily recent file dates
    if (priorityNewFiles) {
      const now = Date.now();
      const thresholdMs = thresholdSeconds * 1000;
      const newFiles = [];
      const oldFiles = [];
      
      for (const item of this.queue) {
        // Extract modification time from item (when file was last changed/added)
        // Browse_media returns items with extra.last_modified or check file creation time from metadata
        const lastModified = item.extra?.last_modified || item.created_time || 0;
        const modifiedMs = typeof lastModified === 'number' ? lastModified * 1000 : new Date(lastModified).getTime();
        
        if (modifiedMs && (now - modifiedMs) < thresholdMs) {
          newFiles.push(item);
          this._log('🆕 Priority file (discovered recently):', MediaProvider.extractFilename(item.media_content_id));
        } else {
          oldFiles.push(item);
        }
      }
      
      // Sort each group independently
      newFiles.sort(compareItems);
      oldFiles.sort(compareItems);
      
      // Reconstruct queue: newly discovered files first, then rest
      this.queue = [...newFiles, ...oldFiles];
      
      this._log('✅ Priority sorting complete:', newFiles.length, 'recently discovered,', oldFiles.length, 'older');
    } else {
      // Standard sorting without priority
      this.queue.sort(compareItems);
    }
  }

  /**
   * Rescan the folder to detect new files
   * Returns info about whether the queue changed
   * @returns {Object} { queueChanged: boolean, previousFirstItem: Object, newFirstItem: Object }
   */
  async rescanForNewFiles() {
    this._log('🔄 Rescanning folder to detect new files...');
    
    // Save the current first item details before rescan
    const previousFirstItem = this.queue.length > 0 ? {
      title: this.queue[0].title,
      media_content_id: this.queue[0].media_content_id,
      date_taken: this.queue[0].metadata?.date_taken
    } : null;
    const previousQueueSize = this.queue.length;
    
    this._log('🔍 Previous first item:', previousFirstItem);
    
    try {
      // Clear everything just like initialize() does
      this.queue = [];
      this.shownItems.clear();
      this.discoveryStartTime = Date.now();
      
      // Enable scanning flags to allow rescan
      this._scanCancelled = false;
      this.isScanning = true;
      this.discoveryInProgress = true;
      
      // Trigger a quick scan to rebuild the queue with latest files
      await this.quickScan();
      
      const newFirstItem = this.queue.length > 0 ? {
        title: this.queue[0].title,
        media_content_id: this.queue[0].media_content_id,
        date_taken: this.queue[0].metadata?.date_taken
      } : null;
      
      this._log('🔍 New first item:', newFirstItem);
      
      // Compare by title (which includes timestamp) for better change detection
      // Also compare by date_taken if available (more reliable than title)
      let queueChanged = false;
      
      if (!previousFirstItem && newFirstItem) {
        queueChanged = true; // Was empty, now has items
        this._log('📊 Queue changed: was empty, now has', this.queue.length, 'items');
      } else if (previousFirstItem && !newFirstItem) {
        queueChanged = true; // Had items, now empty
        this._log('📊 Queue changed: had items, now empty');
      } else if (previousFirstItem && newFirstItem) {
        // Compare date_taken first (most reliable), then title
        if (previousFirstItem.date_taken && newFirstItem.date_taken) {
          queueChanged = previousFirstItem.date_taken !== newFirstItem.date_taken;
          this._log('📊 Comparing by date_taken:', previousFirstItem.date_taken, '→', newFirstItem.date_taken, 'changed:', queueChanged);
        } else {
          queueChanged = previousFirstItem.title !== newFirstItem.title;
          this._log('📊 Comparing by title:', previousFirstItem.title, '→', newFirstItem.title, 'changed:', queueChanged);
        }
      }
      
      this._log(`✅ Rescan complete: queue was ${previousQueueSize}, now ${this.queue.length}, changed: ${queueChanged}`);
      
      return {
        queueChanged,
        previousFirstItem,
        newFirstItem,
        previousQueueSize,
        newQueueSize: this.queue.length
      };
    } catch (error) {
      this._log('⚠️ Rescan failed:', error);
      return {
        queueChanged: false,
        previousFirstItem,
        newFirstItem: previousFirstItem,
        previousQueueSize,
        newQueueSize: this.queue.length
      };
    } finally {
      // Clean up scanning flags
      this.isScanning = false;
      this.discoveryInProgress = false;
    }
  }

  /**
   * Get files from the queue that are newer than the specified date
   * This method filters the existing queue without rescanning
   * Note: Use rescanForNewFiles() to trigger a full rescan first
   * @param {Date} dateThreshold - Only return files newer than this date
   * @returns {Array} Files with date_taken newer than threshold
   */
  async getFilesNewerThan(dateThreshold) {
    if (!dateThreshold) {
      this._log('⚠️ getFilesNewerThan: No date threshold provided');
      return [];
    }

    // Filter existing queue for newer files
    const thresholdTime = dateThreshold.getTime();
    const newerFiles = this.queue.filter(item => {
      if (!item.metadata?.date_taken) {
        return false;
      }
      const itemDate = new Date(item.metadata.date_taken);
      return itemDate.getTime() > thresholdTime;
    });

    this._log(`🔍 getFilesNewerThan: Found ${newerFiles.length} files newer than ${dateThreshold.toISOString()} (checked ${this.queue.length} files in queue)`);
    return newerFiles;
  }
  
  /**
   * V5.6.8: Check for new files since the slideshow started
   * Rescans the folder tree and returns any files not seen in the original scan.
   * This is more expensive than the database version but works for filesystem mode.
   * @returns {Array} New items to prepend to navigation queue
   */
  async checkForNewFiles() {
    // Store the files we knew about at the start
    if (!this._knownFilesAtStart) {
      // First call - record current state as baseline
      this._knownFilesAtStart = new Set(this.queue.map(item => item.media_content_id));
      this._log(`📝 Recorded ${this._knownFilesAtStart.size} known files as baseline for periodic refresh`);
      return [];
    }
    
    this._log('🔄 Checking for new files (filesystem mode)...');
    
    // Save current queue state
    const originalQueue = [...this.queue];
    const originalShown = new Set(this.shownItems);
    
    try {
      // Do a fresh scan
      this.queue = [];
      this.shownItems.clear();
      this._scanCancelled = false;
      this.isScanning = true;
      this.discoveryInProgress = true;
      
      await this.quickScan();
      
      // Find new files (in fresh scan but not in baseline)
      const newFiles = this.queue.filter(item => 
        !this._knownFilesAtStart.has(item.media_content_id)
      );
      
      this._log(`📊 Scan found ${this.queue.length} total files, ${newFiles.length} are new since start`);
      
      // Restore original queue (don't disrupt current playback)
      this.queue = originalQueue;
      this.shownItems = originalShown;
      
      if (newFiles.length > 0) {
        // Update baseline to include new files
        newFiles.forEach(item => this._knownFilesAtStart.add(item.media_content_id));
        this._log(`✅ Found ${newFiles.length} new files during periodic refresh`);
      }
      
      return newFiles;
      
    } catch (error) {
      this._log('⚠️ checkForNewFiles failed:', error);
      // Restore original state on error
      this.queue = originalQueue;
      this.shownItems = originalShown;
      return [];
    } finally {
      this.isScanning = false;
      this.discoveryInProgress = false;
    }
  }
  
  /**
   * V5.6.8: Reset the queue for fresh start
   * Called when wrapping the slideshow to reload latest files
   */
  async reset() {
    this._log('🔄 Resetting SubfolderQueue');
    
    // KEEP the known files baseline across resets - this prevents duplicates
    // when periodic refresh runs after a wrap. The baseline represents
    // "files known at session start" and should persist across loops.
    // (Was: this._knownFilesAtStart = null - caused duplicates)
    
    // Clear queue and reinitialize
    this.queue = [];
    this.shownItems.clear();
    
    return await this.initialize();
  }
}

/**
 * MediaCard - Main card component
 * Phase 2: Now uses provider pattern to display media
 */
