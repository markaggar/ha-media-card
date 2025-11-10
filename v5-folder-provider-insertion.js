// INSERT THIS AFTER SingleMediaProvider (around line 1054)

  // =================================================================
  // FOLDER PROVIDER - Wraps SubfolderQueue for folder slideshow
  // =================================================================

  class FolderProvider extends MediaProvider {
    constructor(card) {
      super(card);
      this.subfolderQueue = null;
    }

    async initialize() {
      const config = this.card.config;
      
      // Check if subfolder queue is enabled for random mode
      if (config.folder_mode === 'random' && config.subfolder_queue?.enabled) {
        // Create SubfolderQueue instance
        this.subfolderQueue = new SubfolderQueue(this.card);
        const success = await this.subfolderQueue.initialize();
        
        if (!success) {
          this.card._log('⚠️ FolderProvider: SubfolderQueue initialization failed');
          return false;
        }
        
        this.card._log('✅ FolderProvider: SubfolderQueue initialized successfully');
        return true;
      }
      
      // TODO: Sequential mode, single folder mode, media_index mode
      this.card._log('❌ FolderProvider: Only random mode with subfolder queue is supported currently');
      return false;
    }

    async getNext() {
      if (this.subfolderQueue) {
        return this.subfolderQueue.getNextItem();
      }
      
      // TODO: Other modes
      return null;
    }

    async getPrevious() {
      if (this.subfolderQueue) {
        return this.subfolderQueue.getPreviousItem();
      }
      
      // TODO: Other modes
      return null;
    }
  } // End of FolderProvider


  // =================================================================
  // SUBFOLDER QUEUE - Essential V4 code copied for v5
  // Handles random folder scanning with hierarchical scan
  // =================================================================

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
      this._scanCancelled = false;
      this._queueCreatedTime = Date.now();
      
      this.queueHistory = [];
      
      // Hierarchical scan queue management
      this.queueShuffleCounter = 0;
      this.SHUFFLE_MIN_BATCH = 10;
      this.SHUFFLE_MAX_BATCH = 1000;
      this.SHUFFLE_PERCENTAGE = 0.10;
      
      // Navigation history
      this.history = [];
      this.historyIndex = -1;
      
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
      
      const cardInDOM = document.contains(this.card);
      const cardBackgroundPaused = this.card._backgroundPaused;
      
      if (!this._lastStatusLog || (Date.now() - this._lastStatusLog) > 5000) {
        this._log('🔍 Status: Card in DOM =', cardInDOM, 'Background paused =', !!this.card._backgroundPaused);
        this._lastStatusLog = Date.now();
      }
      
      const shouldPause = this.card._backgroundPaused;
      
      if (shouldPause) {
        if (!this._autoPaused) {
          this._log('⏸️ Pausing scanning - DOM:', cardInDOM, 'Background paused:', !!this.card._backgroundPaused);
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
        this.history = [];
        this.historyIndex = -1;
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
        
        this.pauseScanning();
        
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
      
      if (!this.config.enabled || this.card.config.folder_mode !== 'random') {
        this._log('❌ Queue disabled or not in random mode');
        return false;
      }

      if (this.card._backgroundPaused) {
        this._log('❌ Skipping initialization - explicitly paused:', !!this.card._backgroundPaused);
        return false;
      }

      if (this.queue.length > 0) {
        this._log('✅ Queue already populated with', this.queue.length, 'items - skipping scan');
        return true;
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
          const scanResult = await this.hierarchicalScanAndPopulate(basePath, 0);
          
          if (!scanResult || scanResult.error) {
            this._log('⚠️ Hierarchical scan failed:', scanResult?.error || 'unknown error');
            return false;
          }
          
          this._log('✅ Hierarchical scan completed:', 
                   'files processed:', scanResult.filesProcessed,
                   'files added:', scanResult.filesAdded, 
                   'folders processed:', scanResult.foldersProcessed,
                   'queue size:', this.queue.length);
          
          if (this.queue.length > 0) {
            this.shuffleQueue();
            this.queueShuffleCounter = 0;
            this._log('🔀 Final shuffle completed after hierarchical scan - queue size:', this.queue.length);
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
      await this._waitIfBackgroundPaused();
      
      if (!this.isScanning || this._scanCancelled) {
        this._log('🛑 Scanning stopped/paused/cancelled - exiting hierarchical scan');
        return { filesProcessed: 0, foldersProcessed: 0 };
      }
      
      const effectiveMaxDepth = maxDepth !== null ? maxDepth : this.config.scan_depth;
      
      if (effectiveMaxDepth !== null && effectiveMaxDepth > 0 && currentDepth >= effectiveMaxDepth) {
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

        if (!folderContents?.children) {
          this._log('📁 No children found at depth:', currentDepth);
          return { filesProcessed: 0, foldersProcessed: 0 };
        }

        const folderName = basePath.split('/').pop() || 'root';
        
        const allFiles = folderContents.children.filter(child => child.media_class === 'image' || child.media_class === 'video');
        const files = allFiles.filter(file => this.card._isMediaFile(file.media_content_id || file.title || ''));
        const subfolders = folderContents.children.filter(child => child.can_expand);

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
        const basePerFileProbability = this.calculatePerFileProbability();
        const weightMultiplier = this.getPathWeightMultiplier(basePath);
        const perFileProbability = Math.min(basePerFileProbability * weightMultiplier, 1.0);
        
        const existingQueueIds = new Set(this.queue.map(item => item.media_content_id));
        const availableFiles = files.filter(file => 
          !this.shownItems.has(file.media_content_id) && 
          !existingQueueIds.has(file.media_content_id)
        );
        
        for (const file of availableFiles) {
          await this._waitIfBackgroundPaused();
          
          if (Math.random() < perFileProbability) {
            await this.addFileToQueueWithBatching(file, folderName);
            filesAdded++;
          }
        }

        let subfoldersProcessed = 0;
        const shouldRecurse = subfolders.length > 0 && 
          (effectiveMaxDepth === null || effectiveMaxDepth === 0 || currentDepth < effectiveMaxDepth - 1);
        
        if (shouldRecurse) {
          await this._waitIfBackgroundPaused();

          const shuffledSubfolders = [...subfolders].sort(() => Math.random() - 0.5);

          const subfolderResults = await this.processLevelConcurrently(
            shuffledSubfolders, 
            2,
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

      this.queue.push(file);

      const historyEntry = {
        file: file,
        timestamp: new Date().toISOString(),
        folderName: folderName || this.extractFolderName(file),
        source: 'hierarchical_scan'
      };
      this.queueHistory.push(historyEntry);

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

    extractFolderName(file) {
      if (!file || !file.media_content_id) return 'unknown';
      const pathParts = file.media_content_id.split('/');
      return pathParts[pathParts.length - 2] || 'root';
    }

    getNextItem() {
      if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        const item = this.history[this.historyIndex];
        return item;
      }

      if (this.queue.length === 0) {
        this.refillQueue();
        if (this.queue.length === 0) {
          return null;
        }
      }

      for (let i = 0; i < this.queue.length; i++) {
        const item = this.queue[i];
        if (!this.shownItems.has(item.media_content_id)) {
          this.shownItems.add(item.media_content_id);
          
          this.history.push(item);
          this.historyIndex = this.history.length - 1;
          
          if (this.history.length > 100) {
            this.history.shift();
            this.historyIndex = this.history.length - 1;
          }
          
          this.queue.splice(i, 1);
          
          if (this.needsRefill()) {
            setTimeout(() => this.refillQueue(), 100);
          }
          
          return item;
        }
      }

      this.ageOutShownItems();
      this.refillQueue();
      
      if (this.queue.length > 0) {
        const item = this.queue[0];
        this.shownItems.add(item.media_content_id);
        
        this.history.push(item);
        this.historyIndex = this.history.length - 1;
        
        this.queue.shift();
        
        return item;
      }
      
      return null;
    }

    getPreviousItem() {
      if (this.history.length === 0) {
        return null;
      }

      if (this.historyIndex === -1) {
        this.historyIndex = this.history.length - 2;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      } else {
        return this.history[0];
      }

      if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
        const item = this.history[this.historyIndex];
        return item;
      }

      return null;
    }

    needsRefill() {
      const unshownCount = this.queue.filter(item => !this.shownItems.has(item.media_content_id)).length;
      const historyItems = this.card?.history?.length || 0;
      const minBuffer = Math.max(historyItems + 5, 15);
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

      if (totalAvailableFiles === 0 && this.shownItems.size > 0) {
        this.shownItems.clear();
      }

      const historyItems = this.card?.history?.length || 0;
      const minQueueSize = Math.max(historyItems + 15, 25);
      const currentQueueSize = this.queue.length;
      
      if (currentQueueSize < minQueueSize) {
        // TODO: Implement populateQueueFromFolders for v5
        this._log('❌ populateQueueFromFolders not yet implemented in v5');
      }
    }
  } // End of SubfolderQueue
