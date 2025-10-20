# Optimized Subfolder Strategy - Two-Phase Approach

## Key Insight: Selective Scanning

The HA API allows us to scan **selectively** - we can get folder structure without loading all file metadata.

## Phase 1: Build Lightweight Folder Map

**Scan for folder structure only - skip file metadata:**

```javascript
async _buildLightweightFolderMap(contentId, currentDepth, maxDepth) {
  if (currentDepth >= maxDepth) return null;

  const mediaContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: contentId
  });

  if (!mediaContent?.children) return null;

  const folderInfo = {
    path: contentId,
    hasMediaFiles: false,  // Quick boolean check
    subfolders: {},
    depth: currentDepth
  };

  // Process children - but only track folder structure
  for (const item of mediaContent.children) {
    if (item.can_expand) {
      // This is a subfolder - recursively map it
      const subfolderInfo = await this._buildLightweightFolderMap(
        item.media_content_id,
        currentDepth + 1, 
        maxDepth
      );
      
      if (subfolderInfo) {
        folderInfo.subfolders[item.media_content_id] = subfolderInfo;
      }
    } else if (this._isMediaFile(item.title)) {
      // Found at least one media file - set flag and continue
      folderInfo.hasMediaFiles = true;
      // DON'T store file metadata - just note that files exist
    }
  }

  return folderInfo;
}
```

**Result: Lightweight folder map with minimal memory usage**

```javascript
{
  "/photos/": {
    hasMediaFiles: true,
    subfolders: {
      "/photos/2023/": { hasMediaFiles: true, subfolders: {} },
      "/photos/2024/": { hasMediaFiles: true, subfolders: {} },
      "/photos/old/": { hasMediaFiles: false, subfolders: {} }  // Empty folder
    }
  },
  "/videos/": {
    hasMediaFiles: true, 
    subfolders: {
      "/videos/recent/": { hasMediaFiles: true, subfolders: {} }
    }
  }
}
```

## Phase 2: On-Demand File Selection

**When we need a random file, scan only the selected folder:**

```javascript
async _selectRandomFileFromFolderMap(folderMap) {
  // Step 1: Collect all folders that have media files
  const foldersWithFiles = this._collectFoldersWithFiles(folderMap);
  
  if (foldersWithFiles.length === 0) {
    throw new Error('No folders with media files found');
  }

  // Step 2: Pick random folder (could be weighted by depth or other factors)
  const randomFolder = foldersWithFiles[Math.floor(Math.random() * foldersWithFiles.length)];
  
  // Step 3: NOW scan just that one folder for files
  return await this._selectRandomFileFromSpecificFolder(randomFolder.path);
}

async _selectRandomFileFromSpecificFolder(folderPath) {
  const mediaContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: folderPath
  });

  const mediaFiles = mediaContent.children.filter(item => 
    !item.can_expand && this._isMediaFile(item.title)
  );

  if (mediaFiles.length === 0) {
    throw new Error(`No media files in folder: ${folderPath}`);
  }

  // Handle exclusion list for "no repeats"
  const availableFiles = mediaFiles.filter(file => 
    !this._shownFiles.has(file.media_content_id)
  );

  if (availableFiles.length === 0) {
    // All files shown - reset exclusion list
    this._shownFiles.clear();
    return this._selectRandomFileFromSpecificFolder(folderPath); // Retry
  }

  const randomFile = availableFiles[Math.floor(Math.random() * availableFiles.length)];
  this._shownFiles.add(randomFile.media_content_id);
  
  return randomFile;
}
```

## Memory Usage Comparison

### Traditional Approach (Load Everything)
```
10 folders × 1000 files each = 10,000 file objects × ~0.5KB = ~5MB memory
```

### Two-Phase Approach (Folder Map + On-Demand)
```
Phase 1: Folder map = ~50 folder objects × ~0.1KB = ~5KB memory
Phase 2: Current folder files = ~1000 files × ~0.5KB = ~500KB memory  
Total: ~505KB (90% memory reduction)
```

### Random Mode Optimization
```
Phase 1: Folder map = ~5KB memory
Phase 2: Single folder scan = ~50KB average
Total: ~55KB (99% memory reduction)
```

## Key Benefits

1. **Selective Scanning**: Only scan for what we need when we need it
2. **Massive Memory Savings**: 90-99% reduction in memory usage
3. **Scalable**: Works with any number of folders/files
4. **Fast Folder Discovery**: Quickly map folder structure without file overhead
5. **On-Demand Loading**: Only load file metadata when selecting files

## Protection Mechanisms

1. **Depth Limiting**: Prevent deep recursion during folder mapping
2. **Timeout Protection**: Global timeout for folder mapping phase
3. **User Cancellation**: Progress dialog during folder mapping
4. **Cache Invalidation**: Re-map only when needed

## Implementation Priority

1. ✅ **Phase 1 works for all modes** - Always build lightweight folder map
2. ✅ **Phase 2 random optimization** - Use on-demand selection for random mode  
3. ✅ **Phase 2 traditional modes** - Load files only from folders that have them

This approach gives us the best of both worlds: comprehensive subfolder support with minimal memory impact!