# HA Media Card - Subfolder Implementation Plan

## Overview

This document outlines the final implementation approach for adding subfolder support to the HA Media Card, incorporating memory optimization insights and user feedback.

## Core Strategy

### Two-Phase Approach

1. **Folder Structure Mapping**: Build lightweight cached map of folder hierarchy
2. **On-Demand File Selection**: Select files only when needed (especially for random mode)

### Memory Optimization

- **Traditional Approach**: Load all file metadata → 10K files = ~5MB memory
- **Optimized Approach**: Folder structure map + on-demand selection = ~50KB memory regardless of file count

## Implementation Components

### 1. Configuration Parameters

```javascript
// In card configuration
{
  // Subfolder scanning controls
  subfolder_scan_depth: 3,           // Maximum depth to scan
  subfolder_timeout_seconds: 30,     // Global scan timeout in seconds
  subfolder_progress_dialog: true,   // Show progress during scan
  
  // Cache management  
  folder_structure_cache_hours: 24,  // How long to cache folder structure
  clear_cache_on_config_change: true // Clear cache when config changes
}
```

### 2. Folder Structure Mapping

```javascript
class MediaCardFolderManager {
  constructor(hass, config) {
    this.hass = hass;
    this.config = config;
    this._folderStructureCache = new Map();
    this._scanAbortController = null;
  }

  async buildFolderStructure() {
    const cacheKey = this._getCacheKey();
    const cached = this._folderStructureCache.get(cacheKey);
    
    if (cached && this._isCacheValid(cached)) {
      this._log('📁 Using cached folder structure');
      return cached.structure;
    }

    try {
      this._showProgressDialog('Scanning folder structure...');
      
      const structure = await this._scanFolderHierarchy(
        this.config.media_path,
        0,
        this.config.subfolder_scan_depth || 3
      );
      
      this._cacheStructure(cacheKey, structure);
      this._hideProgressDialog();
      
      return structure;
      
    } catch (error) {
      this._hideProgressDialog();
      this._showError(`Folder scan failed: ${error.message}`);
      throw error;
    }
  }

  async _scanFolderHierarchy(contentId, currentDepth, maxDepth) {
    if (currentDepth >= maxDepth) {
      return { path: contentId, mediaFiles: 0, subfolders: [], reachedDepthLimit: true };
    }

    // Check for abort signal
    if (this._scanAbortController?.signal.aborted) {
      throw new Error('Scan cancelled by user');
    }

    const mediaContent = await this._callWithTimeout(
      this.hass.callWS({
        type: "media_source/browse_media",
        media_content_id: contentId
      }),
      (this.config.subfolder_timeout_seconds || 30) * 1000
    );

    if (!mediaContent?.children) {
      return { path: contentId, mediaFiles: 0, subfolders: [] };
    }

    const folderInfo = {
      path: contentId,
      mediaFiles: 0,
      subfolders: [],
      depth: currentDepth,
      scannedAt: Date.now(),
      totalItems: mediaContent.children.length
    };

    let totalFilesFound = 0;

    for (const item of mediaContent.children) {
      if (item.can_expand) {
        // Subfolder - recursively scan
        const subfolderInfo = await this._scanFolderHierarchy(
          item.media_content_id,
          currentDepth + 1,
          maxDepth
        );
        
        folderInfo.subfolders.push({
          id: item.media_content_id,
          title: item.title,
          info: subfolderInfo
        });
        
        totalFilesFound += subfolderInfo.mediaFiles;
        
      } else if (this._isMediaFile(item.title || item.media_content_id)) {
        folderInfo.mediaFiles++;
        totalFilesFound++;
      }

      // Protection: Check for abort signal periodically
      if (totalFilesFound % 100 === 0 && this._scanAbortController?.signal.aborted) {
        throw new Error('Scan cancelled by user');
      }
    }

    this._updateProgressDialog(`Scanned: ${folderInfo.path} (${folderInfo.mediaFiles} files, ${folderInfo.subfolders.length} subfolders)`);
    
    return folderInfo;
  }
}
```

### 3. On-Demand File Selection (Random Mode)

```javascript
class RandomFileSelector {
  constructor(folderManager) {
    this.folderManager = folderManager;
    this._shownFiles = new Set();
  }

  async selectRandomFile() {
    const structure = await this.folderManager.buildFolderStructure();
    const allFolderPaths = this._collectAllFolderPaths(structure);
    
    // Calculate weighted selection based on file counts
    const weightedFolders = allFolderPaths.map(folder => ({
      path: folder.path,
      weight: folder.mediaFiles,
      totalWeight: folder.mediaFiles
    }));

    if (weightedFolders.length === 0) {
      throw new Error('No folders with media files found');
    }

    // Select folder based on file count weighting
    const selectedFolder = this._selectWeightedRandom(weightedFolders);
    
    // Now select random file from this specific folder
    return await this._selectRandomFileFromFolder(selectedFolder.path);
  }

  async _selectRandomFileFromFolder(folderPath) {
    try {
      const mediaContent = await this.folderManager.hass.callWS({
        type: "media_source/browse_media",
        media_content_id: folderPath
      });

      if (!mediaContent?.children) {
        throw new Error(`No content found in folder: ${folderPath}`);
      }

      // Filter to media files only
      const mediaFiles = mediaContent.children.filter(item => 
        !item.can_expand && this._isMediaFile(item.title || item.media_content_id)
      );

      if (mediaFiles.length === 0) {
        throw new Error(`No media files found in folder: ${folderPath}`);
      }

      // Handle exclusion list for "no repeats"
      const availableFiles = mediaFiles.filter(file => 
        !this._shownFiles.has(file.media_content_id)
      );

      if (availableFiles.length === 0) {
        // All files shown - reset exclusion list
        this._shownFiles.clear();
        this._log('🔄 All files shown, resetting exclusion list');
        return this._selectRandomFileFromFolder(folderPath); // Retry
      }

      // Select random file
      const randomIndex = Math.floor(Math.random() * availableFiles.length);
      const selectedFile = availableFiles[randomIndex];

      // Add to exclusion list
      this._shownFiles.add(selectedFile.media_content_id);

      this._log(`🎲 Selected random file: ${selectedFile.title} from ${folderPath}`);
      
      return selectedFile;

    } catch (error) {
      console.error(`Error selecting random file from ${folderPath}:`, error);
      throw error;
    }
  }

  _collectAllFolderPaths(structure, paths = []) {
    if (structure.mediaFiles > 0) {
      paths.push({
        path: structure.path,
        mediaFiles: structure.mediaFiles
      });
    }

    if (structure.subfolders) {
      for (const subfolder of structure.subfolders) {
        this._collectAllFolderPaths(subfolder.info, paths);
      }
    }

    return paths;
  }

  _selectWeightedRandom(weightedItems) {
    const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
    let randomWeight = Math.random() * totalWeight;
    
    for (const item of weightedItems) {
      randomWeight -= item.weight;
      if (randomWeight <= 0) {
        return item;
      }
    }
    
    // Fallback to last item
    return weightedItems[weightedItems.length - 1];
  }
}
```

### 4. Integration with Existing Card

```javascript
// Modify existing _handleFolderMode method
async _handleFolderMode() {
  if (!this.config.media_path) return;

  try {
    // Initialize folder manager if needed
    if (!this._folderManager) {
      this._folderManager = new MediaCardFolderManager(this.hass, this.config);
    }

    if (this.config.folder_mode === 'random') {
      // Use optimized random selection
      if (!this._randomSelector) {
        this._randomSelector = new RandomFileSelector(this._folderManager);
      }
      
      const selectedFile = await this._randomSelector.selectRandomFile();
      this._currentMedia = selectedFile;
      this._updateDisplay();
      
    } else {
      // Traditional modes: sequential, alphabetical
      // Build full file list (with protection limits)
      const structure = await this._folderManager.buildFolderStructure();
      const allFiles = await this._collectAllMediaFiles(structure);
      
      // Apply existing sorting and selection logic
      this._folderContents = allFiles;
      this._handleSequentialMode();
    }
    
  } catch (error) {
    this._showError(`Folder processing failed: ${error.message}`);
    console.error('Folder mode error:', error);
  }
}

async _collectAllMediaFiles(structure, files = []) {
  // Only used for non-random modes where we need the full list
  const folderContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: structure.path
  });

  if (folderContent?.children) {
    for (const item of folderContent.children) {
      if (!item.can_expand && this._isMediaFile(item.title || item.media_content_id)) {
        files.push(item);
      }
    }
  }

  // Recursively collect from subfolders
  if (structure.subfolders) {
    for (const subfolder of structure.subfolders) {
      await this._collectAllMediaFiles(subfolder.info, files);
    }
  }

  return files;
}
```

## Memory Usage Comparison

### Current Implementation (All Modes)
- **1K files**: ~500KB metadata in memory
- **10K files**: ~5MB metadata in memory
- **50K files**: ~25MB metadata in memory

### New Implementation
- **Random mode**: ~1KB folder structure + ~50KB exclusion list (regardless of file count)
- **Sequential/Alphabetical**: Same as current (full file list needed for sorting)
- **Folder structure cache**: ~10KB for typical hierarchies

## Benefits

1. **Memory Efficiency**: 99%+ reduction in memory usage for random mode
2. **Scan Protection**: Multiple layers of protection against large folders
3. **User Experience**: Progress dialogs, cancellation, warnings
4. **Performance**: Cached folder structure reduces repeated scans
5. **Scalability**: Handles tens of thousands of files without memory issues

## Next Steps

1. Implement `MediaCardFolderManager` class
2. Implement `RandomFileSelector` class  
3. Add progress dialog UI components
4. Update configuration schema
5. Add comprehensive error handling
6. Implement cache management
7. Add user documentation

This approach provides the requested subfolder support while solving the memory consumption problem that was the main concern with large folder scanning.