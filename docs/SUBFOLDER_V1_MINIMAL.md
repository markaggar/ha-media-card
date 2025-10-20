# Subfolder Support v1 - Minimal Implementation

## Core Strategy: Simple Two-Phase Approach

### Phase 1: Lightweight Folder Discovery
- Scan folder structure recursively up to depth limit
- Track which folders have media files (boolean flag only)
- No file metadata stored, just folder structure

### Phase 2: On-Demand File Selection
- Pick random folder from folders-with-files list
- Scan that specific folder for files (with per-folder limit)
- Cache current folder's file list for subsequent selections

## Minimal Configuration

```javascript
{
  subfolder_scan_depth: 3,        // Max recursion depth (default: 3)
  max_files_per_folder: 2000,     // Per-folder scan limit (default: 2000)  
  folder_cache_minutes: 5         // Cache folder contents (default: 5 min)
}
```

## Implementation Components

### 1. Folder Structure Discovery

```javascript
async _buildFolderMap(contentId, currentDepth, maxDepth) {
  if (currentDepth >= maxDepth) return null;
  
  const mediaContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: contentId
  });

  if (!mediaContent?.children) return null;

  const folderInfo = {
    path: contentId,
    hasFiles: false,
    subfolders: {}
  };

  for (const item of mediaContent.children) {
    if (item.can_expand) {
      // Subfolder - recurse
      const subfolder = await this._buildFolderMap(
        item.media_content_id, 
        currentDepth + 1, 
        maxDepth
      );
      if (subfolder) {
        folderInfo.subfolders[item.media_content_id] = subfolder;
      }
    } else if (this._isMediaFile(item.title)) {
      // Found media file - set flag and continue
      folderInfo.hasFiles = true;
    }
  }

  return folderInfo;
}
```

### 2. Simple File Caching

```javascript
class SimpleFolderCache {
  constructor(cacheMinutes = 5) {
    this._cache = new Map();
    this._cacheTimeout = cacheMinutes * 60 * 1000;
  }

  async getFiles(folderPath, maxFiles, scanFunction) {
    const cached = this._cache.get(folderPath);
    
    // Use cache if valid and not expired
    if (cached && (Date.now() - cached.timestamp) < this._cacheTimeout) {
      return cached.files;
    }

    // Cache miss - scan folder
    const files = await scanFunction(folderPath, maxFiles);
    
    // Cache results
    this._cache.set(folderPath, {
      files: files,
      timestamp: Date.now()
    });

    return files;
  }
}
```

### 3. Random File Selection with Protection

```javascript
async _selectRandomFileFromSubfolders() {
  // Step 1: Get folder map (cached or build new)
  if (!this._folderMap || this._shouldRebuildFolderMap()) {
    this._folderMap = await this._buildFolderMap(
      this.config.media_path, 
      0, 
      this.config.subfolder_scan_depth || 3
    );
  }

  // Step 2: Get all folders with files
  const foldersWithFiles = this._collectFoldersWithFiles(this._folderMap);
  if (foldersWithFiles.length === 0) {
    throw new Error('No folders with media files found');
  }

  // Step 3: Pick random folder
  const randomFolder = foldersWithFiles[Math.floor(Math.random() * foldersWithFiles.length)];

  // Step 4: Get files from that folder (cached)
  const files = await this._folderCache.getFiles(
    randomFolder, 
    this.config.max_files_per_folder || 2000,
    (folderPath, maxFiles) => this._scanFolderWithLimit(folderPath, maxFiles)
  );

  // Step 5: Select random file with exclusion tracking
  return this._selectRandomWithExclusion(files);
}

async _scanFolderWithLimit(folderPath, maxFiles) {
  const mediaContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: folderPath
  });

  const mediaFiles = mediaContent.children
    .filter(item => !item.can_expand && this._isMediaFile(item.title))
    .slice(0, maxFiles);  // Simple limit - take first N files

  // Debug logging only
  if (mediaFiles.length >= maxFiles) {
    this._log(`⚠️ Folder scan limited to ${maxFiles} files: ${folderPath}`);
  }

  return mediaFiles;
}
```

### 4. Simple New File Detection

```javascript
_selectRandomWithExclusion(files) {
  const availableFiles = files.filter(file => 
    !this._shownFiles.has(file.media_content_id)
  );

  if (availableFiles.length === 0) {
    // All files shown - clear exclusion list and check for new files
    this._shownFiles.clear();
    
    // Force cache refresh for this folder next time
    this._folderCache._cache.delete(this._lastSelectedFolder);
    
    // For now, just reuse existing files
    return files[Math.floor(Math.random() * files.length)];
  }

  const selected = availableFiles[Math.floor(Math.random() * availableFiles.length)];
  this._shownFiles.add(selected.media_content_id);
  
  return selected;
}
```

## What's NOT in v1

❌ Manual refresh button  
❌ Folder stats in UI  
❌ Large folder warnings in UI  
❌ Advanced sampling strategies  
❌ Periodic cache refresh  
❌ Progress dialogs  

## What IS in v1

✅ Two-phase folder mapping  
✅ Per-folder scan limits  
✅ Simple file caching  
✅ Basic new file detection  
✅ Debug logging for troubleshooting  
✅ Configurable depth limits  

## Debug Logging for Troubleshooting

```javascript
// Only debug messages - no UI clutter
this._log(`📁 Built folder map: ${foldersWithFiles.length} folders with files`);
this._log(`🎲 Selected folder: ${randomFolder} (${files.length} files)`);
this._log(`⚠️ Large folder detected: ${folderPath} (${fileCount} files, limited to ${maxFiles})`);
this._log(`🔄 Cache refreshed for folder: ${folderPath}`);
```

## Memory Usage Target

- **Folder map**: ~5-10KB (structure only)
- **Active folder cache**: ~500KB (single folder)
- **Total**: ~510KB vs current ~5MB+ (90% reduction)

This keeps the implementation simple while solving the core memory problem and adding basic subfolder support.