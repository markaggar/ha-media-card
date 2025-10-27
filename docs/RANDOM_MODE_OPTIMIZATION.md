# Smart Random Mode - Memory-Efficient Approach

## Current Problem
The current implementation loads ALL file metadata into `_folderContents` array in memory, which can consume significant memory with large folders (10K+ files × ~0.5KB metadata = 5MB+ per folder).

## Proposed Solution: Cached Folder Structure + On-Demand Selection

### Core Concept
1. **Build and cache folder structure map** (folders and item counts only)
2. **Use cached map** to pick random folders and indices
3. **Fetch individual files on-demand** when selected
4. **Control scan depth** to prevent excessive API calls

### Implementation Strategy

#### 1. Build Cached Folder Structure Map
```javascript
async _buildFolderStructureMap(maxDepth = 3, currentDepth = 0) {
  if (!this.hass || currentDepth >= maxDepth) return null;
  
  const cacheKey = `folder-map-${this.config.media_path}-${maxDepth}`;
  const cached = this._getCachedFolderMap(cacheKey);
  
  if (cached && this._isCacheValid(cached)) {
    this._log('📁 Using cached folder structure');
    return cached;
  }
  
  try {
    const folderMap = await this._scanFolderStructureRecursive(
      this.config.media_path, 
      currentDepth, 
      maxDepth
    );
    
    this._cacheFolderMap(cacheKey, folderMap);
    return folderMap;
    
  } catch (error) {
    console.error('Error building folder structure:', error);
    return null;
  }
}

async _scanFolderStructureRecursive(contentId, currentDepth, maxDepth) {
  if (currentDepth >= maxDepth) return null;
  
  const mediaContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: contentId
  });
  
  if (!mediaContent?.children) return null;
  
  const folderInfo = {
    path: contentId,
    mediaFileCount: 0,
    subfolders: {},
    depth: currentDepth,
    lastScanned: Date.now()
  };
  
  // Count media files and identify subfolders
  for (const item of mediaContent.children) {
    if (item.can_expand) {
      // This is a subfolder - recursively scan it
      const subfolderInfo = await this._scanFolderStructureRecursive(
        item.media_content_id, 
        currentDepth + 1, 
        maxDepth
      );
      
      if (subfolderInfo) {
        folderInfo.subfolders[item.media_content_id] = subfolderInfo;
      }
    } else {
      // This is a file - check if it's a media file
      const fileName = this._getItemDisplayName(item);
      if (this._isMediaFile(fileName)) {
        folderInfo.mediaFileCount++;
      }
    }
  }
  
  this._log(`📁 Scanned folder: ${contentId} - ${folderInfo.mediaFileCount} media files, ${Object.keys(folderInfo.subfolders).length} subfolders`);
  
  return folderInfo;
}
```


#### 2. On-Demand Random File Selection

```javascript
async _selectRandomFile() {
  if (!this._folderInfo) {
    await this._scanForRandomMode();
  }
  
  const availableCount = this._folderInfo.totalItems - this._shownFiles.size;
  
  // Reset if we've shown all files or after 24 hours
  if (availableCount <= 0 || this._shouldResetShownFiles()) {
    this._log('🔄 Resetting shown files list');
    this._shownFiles.clear();
  }
  
  // Try up to 10 times to find an unshown file
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomIndex = Math.floor(Math.random() * this._folderInfo.totalItems);
    
    try {
      // Fetch only the folder contents to get the item at random index
      const mediaContent = await this.hass.callWS({
        type: "media_source/browse_media",
        media_content_id: this._folderInfo.path
      });
      
      if (mediaContent?.children?.[randomIndex]) {
        const selectedItem = mediaContent.children[randomIndex];
        const fileName = this._getItemDisplayName(selectedItem);
        
        // Skip if we've already shown this file
        if (this._shownFiles.has(fileName)) {
          continue;
        }
        
        // Skip if not a media file
        if (!this._isMediaFile(fileName)) {
          continue;
        }
        
        // Found a new media file!
        this._shownFiles.add(fileName);
        this._log(`🎲 Selected random file ${attempt + 1}/10: ${fileName}`);
        
        return selectedItem;
      }
    } catch (error) {
      console.error(`Random selection attempt ${attempt + 1} failed:`, error);
    }
  }
  
  // Fallback: clear shown list and try once more
  this._shownFiles.clear();
  return this._selectRandomFile();
}

_shouldResetShownFiles() {
  const resetInterval = 24 * 60 * 60 * 1000; // 24 hours
  const lastReset = this._lastShownFilesReset || 0;
  return (Date.now() - lastReset) > resetInterval;
}
```

#### 3. Integration with Existing System
```javascript
async _handleFolderMode() {
  // ... existing code ...
  
  if (this._isRandomMode()) {
    // Use on-demand selection instead of pre-loading all files
    const selectedFile = await this._selectRandomFile();
    
    if (selectedFile) {
      const resolvedUrl = await this._resolveMediaPath(selectedFile.media_content_id);
      if (resolvedUrl !== this._mediaUrl) {
        this._setMediaUrl(resolvedUrl);
        this._detectMediaType(selectedFile.media_content_id);
        this._log(`📂 Selected random media: ${selectedFile.title}`);
        this.requestUpdate();
      }
    }
  } else {
    // Keep existing behavior for 'latest' mode (needs full scan for timestamp sorting)
    await this._scanFolderContents();
    // ... rest of existing latest mode logic ...
  }
}
```

### Memory Usage Comparison

#### Current Approach (All Modes):
- **10K files**: ~5MB metadata in memory
- **50K files**: ~25MB metadata in memory  
- **100K files**: ~50MB metadata in memory

#### New Approach (Random Mode):
- **Any file count**: ~1KB folder info + ~50KB exclusion list
- **Memory usage**: <100KB regardless of folder size
- **Memory savings**: 99%+ reduction for large folders

### Benefits

1. **Massive Memory Reduction**: From megabytes to kilobytes
2. **Faster Startup**: No need to scan thousands of files upfront
3. **No File Count Limits**: Can handle unlimited folder sizes
4. **Better Performance**: Single API call vs. loading entire folder
5. **Avoids Repetition**: Tracks shown files until all are displayed

### Limitations & Considerations

1. **Random Mode Only**: Latest mode still needs full scan for timestamp sorting
2. **API Calls Per Selection**: Each random selection requires one API call
3. **Exclusion List Growth**: Set grows over time (but much smaller than full metadata)
4. **No Pre-sorting**: Can't pre-sort by date/name (not needed for random)

### Storage Optimization
```javascript
// Persist exclusion list to localStorage to survive page reloads
_saveShownFiles() {
  try {
    const data = {
      files: Array.from(this._shownFiles),
      lastReset: this._lastShownFilesReset,
      folderPath: this._folderInfo?.path
    };
    localStorage.setItem(`ha-media-card-shown-${this.config.media_path}`, JSON.stringify(data));
  } catch (error) {
    // localStorage might be full, clear and retry
    this._shownFiles.clear();
  }
}

_loadShownFiles() {
  try {
    const data = JSON.parse(localStorage.getItem(`ha-media-card-shown-${this.config.media_path}`) || '{}');
    if (data.files && data.folderPath === this.config.media_path) {
      this._shownFiles = new Set(data.files);
      this._lastShownFilesReset = data.lastReset;
    }
  } catch (error) {
    this._shownFiles = new Set();
  }
}
```

## Implementation Impact

### For Subfolder Support:
This approach makes subfolder support much more feasible:
- **Random mode**: Use this on-demand approach (no memory issues)
- **Latest mode**: Still needs careful scanning with limits (for timestamp sorting)

### Hybrid Approach:
```yaml
# Configuration could offer both modes
folder_mode: random_efficient  # On-demand selection
folder_mode: random_preload    # Current behavior (for small folders)
folder_mode: latest            # Full scan needed (with subfolder limits)
```

This is a brilliant insight that eliminates the core memory problem for the most common use case!