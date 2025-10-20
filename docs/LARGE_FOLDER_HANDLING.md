# Large Single Folder Handling Strategies

## The Problem

Even with our two-phase approach, a single folder with 10K+ files still requires scanning all files to pick a random one.

## Solution: Multiple Folder Scanning Strategies

### Strategy 1: Full Scan (Current Behavior)
```javascript
// Scan everything - works for folders up to configured limit
const allFiles = await scanEntireFolder(folderPath);
const randomFile = pickRandom(allFiles);
```
- **Pros**: Guarantees true randomness, sees all files
- **Cons**: Memory/performance issues with huge folders
- **Use Case**: Folders under 2000 files

### Strategy 2: Sampling Approach
```javascript
async _sampleFolderForRandomFile(folderPath, sampleSize = 100) {
  const mediaContent = await this.hass.callWS({
    type: "media_source/browse_media",
    media_content_id: folderPath
  });

  const mediaFiles = mediaContent.children.filter(item => 
    !item.can_expand && this._isMediaFile(item.title)
  );

  // If small folder, use full scan
  if (mediaFiles.length <= this.config.max_files_per_folder) {
    return this._selectFromFullList(mediaFiles);
  }

  // Large folder: take first N files as sample
  this._showLargeFolderWarning(folderPath, mediaFiles.length);
  
  const sample = mediaFiles.slice(0, sampleSize);
  const availableFiles = sample.filter(file => 
    !this._shownFiles.has(file.media_content_id)
  );

  if (availableFiles.length === 0) {
    // All sample files shown - get new sample
    this._shownFiles.clear();
    return this._sampleFolderForRandomFile(folderPath, sampleSize);
  }

  return availableFiles[Math.floor(Math.random() * availableFiles.length)];
}
```

### Strategy 3: Chunked Loading
```javascript
async _chunkScanFolder(folderPath, chunkSize = 500) {
  let allFiles = [];
  let totalScanned = 0;
  const maxFiles = this.config.max_files_per_folder || 2000;

  // Implementation would need API pagination support (if available)
  // Or load in chunks and stop at limit
  
  while (totalScanned < maxFiles) {
    const chunk = await this._loadFileChunk(folderPath, totalScanned, chunkSize);
    allFiles.push(...chunk.files);
    totalScanned += chunk.files.length;
    
    if (!chunk.hasMore) break;
  }
  
  return allFiles;
}
```

## File Caching and Change Detection

### Problem: Caching vs. Fresh Files
- **Cache files**: Fast subsequent selections, but might miss new files
- **Always re-scan**: Slow, but sees new files immediately

### Solution: Smart Caching with Invalidation

```javascript
class FolderFileCache {
  constructor() {
    this._folderCache = new Map();
    this._cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getFiles(folderPath, useCache = true) {
    const cached = this._folderCache.get(folderPath);
    
    // Check if cache is valid and not expired
    if (useCache && cached && this._isCacheValid(cached)) {
      this._log(`📁 Using cached files for ${folderPath} (${cached.files.length} files)`);
      return cached.files;
    }

    // Cache miss or expired - rescan folder
    this._log(`🔄 Scanning folder ${folderPath}...`);
    const files = await this._scanFolderWithLimit(folderPath);
    
    // Cache the results
    this._folderCache.set(folderPath, {
      files: files,
      scannedAt: Date.now(),
      folderPath: folderPath
    });

    return files;
  }

  _isCacheValid(cached) {
    const age = Date.now() - cached.scannedAt;
    return age < this._cacheTimeout;
  }

  invalidateFolder(folderPath) {
    this._folderCache.delete(folderPath);
    this._log(`❌ Invalidated cache for ${folderPath}`);
  }

  // Clear cache when config changes or manual refresh
  clearCache() {
    this._folderCache.clear();
    this._log('🗑️ Cleared all folder cache');
  }
}
```

### Usage in Random File Selection

```javascript
async _selectRandomFileWithCaching(folderPath) {
  // Try cached files first (fast)
  let files = await this._fileCache.getFiles(folderPath, true);
  
  // Filter out already shown files
  let availableFiles = files.filter(file => 
    !this._shownFiles.has(file.media_content_id)
  );

  if (availableFiles.length === 0) {
    // Option 1: Reset exclusion list and retry with cache
    this._shownFiles.clear();
    availableFiles = files;
  }

  if (availableFiles.length === 0) {
    // Option 2: Force fresh scan (maybe new files added?)
    this._log('🔄 No files in cache, forcing fresh scan...');
    files = await this._fileCache.getFiles(folderPath, false);
    availableFiles = files;
  }

  return this._pickRandomFromList(availableFiles);
}
```

## Configuration Options

```javascript
{
  // Large folder protection
  max_files_per_folder: 2000,           // Stop scanning after N files
  large_folder_warning: 1000,           // Warn at N files
  folder_scan_strategy: "full",         // "full" | "sample" | "chunked"
  sample_size: 100,                     // Files to sample in large folders
  
  // Caching behavior
  folder_cache_minutes: 5,              // Cache folder contents for N minutes
  auto_refresh_cache: true,             // Periodically refresh cache
  detect_new_files: "on_exhaustion",    // "never" | "on_exhaustion" | "periodic"
  
  // User experience
  show_folder_stats: true,              // Show "Folder: 1,234 files (cached)" 
  allow_cache_bypass: true,             // Let user force refresh
}
```

## Detecting New Files

### Option 1: On Exhaustion Detection
```javascript
// When we've shown all cached files, check for new ones
if (this._shownFiles.size >= this._cachedFiles.length) {
  this._log('🔍 All cached files shown, checking for new files...');
  await this._fileCache.invalidateFolder(folderPath);
  // Fresh scan will happen on next selection
}
```

### Option 2: Periodic Cache Refresh
```javascript
// Refresh cache every N selections or N minutes
if (this._selectionCount % 50 === 0) {
  this._log('🔄 Periodic cache refresh...');
  await this._fileCache.invalidateFolder(folderPath);
}
```

### Option 3: User Manual Refresh
```javascript
// Add refresh button to UI
_addRefreshButton() {
  return html`
    <ha-icon-button
      .label="Refresh folder contents"
      @click=${this._refreshFolderCache}
    >
      <ha-icon icon="mdi:refresh"></ha-icon>
    </ha-icon-button>
  `;
}

_refreshFolderCache() {
  this._fileCache.clearCache();
  this._shownFiles.clear();
  this._log('🔄 Manual cache refresh triggered');
}
```

## Recommended Approach

1. **Default Strategy**: Full scan up to 2000 files per folder
2. **Large Folder Fallback**: Sampling approach for folders > 2000 files
3. **Smart Caching**: 5-minute cache with on-exhaustion refresh
4. **User Control**: Manual refresh button for immediate updates
5. **Transparent UX**: Show folder stats ("Folder: 1,234 files, 45 shown")

This balances performance, memory usage, and user experience while handling the edge cases you identified.