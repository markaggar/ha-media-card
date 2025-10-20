# Subfolder Support Analysis for HA Media Card

## Current State
The card currently scans only the root folder specified in `media_path` and filters out subfolders (`if (item.can_expand) return false;`). The media browser supports navigating subfolders but the slideshow functionality ignores them.

## Proposed Implementation

### 1. Configuration Options
Add new config options to control subfolder behavior:

```yaml
type: custom:media-card
media_path: media-source://media_source/local/photos/
folder_mode: latest
# New subfolder options
include_subfolders: true
max_depth: 3  # Limit recursion depth (default: 1 = no subfolders)
max_scan_items: 10000  # Hard limit on total files scanned across all folders
max_items_per_folder: 5000  # Skip individual folders exceeding this limit
scan_timeout_seconds: 45  # Timeout in seconds (45 seconds for large collections)
show_scan_progress: true  # Show progress dialog during long scans
```

### 2. Recursive Scanning with Safeguards

#### Performance Protection Mechanisms:
1. **Depth Limiting**: Maximum recursion depth to prevent infinite loops
2. **Item Count Limiting**: Stop scanning when total items exceed threshold
3. **Timeout Protection**: Abort scan after configurable time limit
4. **Early Exit on Large Folders**: Skip folders with too many children
5. **Incremental Loading**: Load folders on-demand rather than all at once

#### Implementation Strategy:
```javascript
async _scanFolderContentsRecursive(contentId, currentDepth = 0, scannedCount = { value: 0 }) {
  // Protection: Check depth limit
  if (currentDepth >= (this.config.max_depth || 1)) {
    return [];
  }
  
  // Protection: Check total items scanned
  if (scannedCount.value >= (this.config.max_scan_items || 5000)) {
    this._log('⚠️ Stopping scan - item limit reached:', scannedCount.value);
    return [];
  }
  
  // Protection: Check timeout (convert seconds to milliseconds)
  if (Date.now() - this._scanStartTime > (this.config.scan_timeout_seconds || 45) * 1000) {
    this._log('⚠️ Stopping scan - timeout reached');
    return [];
  }
  
  const mediaContent = await this._fetchMediaContents(this.hass, contentId);
  const results = [];
  
  if (mediaContent?.children) {
    // Protection: Skip large folders (configurable per-folder limit)
    const folderLimit = this.config.max_items_per_folder || 5000;
    if (mediaContent.children.length > folderLimit) {
      this._log('⚠️ Skipping large folder:', contentId, 'items:', mediaContent.children.length);
      this._showFolderSkippedWarning(contentId, mediaContent.children.length, folderLimit);
      return [];
    }
    
    for (const item of mediaContent.children) {
      if (item.can_expand && this.config.include_subfolders) {
        // Recursively scan subfolder
        const subItems = await this._scanFolderContentsRecursive(
          item.media_content_id, 
          currentDepth + 1, 
          scannedCount
        );
        results.push(...subItems);
      } else if (!item.can_expand) {
        // Regular media file
        const fileName = this._getItemDisplayName(item);
        if (this._isMediaFile(fileName)) {
          results.push({
            ...item,
            folder_path: contentId,
            folder_depth: currentDepth
          });
          scannedCount.value++;
        }
      }
    }
  }
  
  return results;
}
```

### 3. GUI Editor Enhancements

Add subfolder controls to the configuration editor:

```javascript
// In MediaCardEditor render method
${this.config.is_folder ? html`
  <div class="config-row">
    <label>Include Subfolders</label>
    <input 
      type="checkbox" 
      .checked=${this.config.include_subfolders || false}
      @change=${this._includeSubfoldersChanged}
    />
  </div>
  
  ${this.config.include_subfolders ? html`
    <div class="config-row">
      <label>Max Depth</label>
      <input 
        type="number" 
        min="1" 
        max="10" 
        .value=${this.config.max_depth || 2}
        @input=${this._maxDepthChanged}
      />
    </div>
    
    <div class="config-row">
      <label>Max Items</label>
      <input 
        type="number" 
        min="100" 
        max="50000" 
        step="100"
        .value=${this.config.max_scan_items || 5000}
        @input=${this._maxScanItemsChanged}
      />
    </div>
  ` : ''}
` : ''}
```

### 4. Performance Considerations

#### Memory Usage:
- Large recursive scans could load thousands of file metadata objects
- Consider implementing pagination or virtual scrolling for UI
- Add memory usage monitoring and warnings

#### Network Traffic:
- Each subfolder requires a separate API call to Home Assistant
- Implement batching or concurrent request limiting
- Cache folder contents with TTL

#### User Experience:
- Show progress indicator during long scans
- Allow cancellation of in-progress scans
- Display folder structure in browser (breadcrumbs)

### 5. Progress Indicators and Memory Warnings

#### Progress Dialog Implementation:
```javascript
_showScanProgressDialog() {
  const progressDialog = document.createElement('div');
  progressDialog.id = 'subfolder-scan-progress';
  progressDialog.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: var(--card-background-color) !important;
    padding: 24px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    z-index: 1000000 !important;
    min-width: 300px !important;
    text-align: center !important;
  `;
  
  progressDialog.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 16px;">📁 Scanning Subfolders</div>
    <div id="scan-progress-text" style="margin-bottom: 12px;">Initializing...</div>
    <div style="background: var(--divider-color); height: 4px; border-radius: 2px; margin-bottom: 16px;">
      <div id="scan-progress-bar" style="background: var(--primary-color); height: 100%; border-radius: 2px; width: 0%; transition: width 0.3s;"></div>
    </div>
    <button id="cancel-scan-btn" style="padding: 8px 16px; background: var(--secondary-text-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
      Cancel Scan
    </button>
  `;
  
  document.body.appendChild(progressDialog);
  
  // Cancel button handler
  progressDialog.querySelector('#cancel-scan-btn').onclick = () => {
    this._cancelScan = true;
    this._hideScanProgressDialog();
  };
  
  return progressDialog;
}

_updateScanProgress(foldersScanned, totalEstimated, itemsFound, currentFolder) {
  const progressText = document.getElementById('scan-progress-text');
  const progressBar = document.getElementById('scan-progress-bar');
  
  if (progressText && progressBar) {
    const percentage = Math.min((foldersScanned / totalEstimated) * 100, 100);
    progressText.textContent = `${foldersScanned}/${totalEstimated} folders • ${itemsFound} items found`;
    progressBar.style.width = `${percentage}%`;
    
    // Show current folder being scanned
    if (currentFolder) {
      const folderName = currentFolder.split('/').pop() || currentFolder;
      progressText.textContent += ` • ${folderName}`;
    }
  }
}
```

#### Memory Warning System:
```javascript
_checkMemoryUsage(itemCount) {
  // Estimate memory usage (rough calculation)
  const estimatedMemoryMB = (itemCount * 0.5) / 1000; // ~0.5KB per item metadata
  
  if (estimatedMemoryMB > 50) { // Warn at 50MB estimated
    this._showMemoryWarning(itemCount, estimatedMemoryMB);
  }
}

_showMemoryWarning(itemCount, estimatedMemoryMB) {
  const warning = document.createElement('div');
  warning.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    background: #ff9800 !important;
    color: white !important;
    padding: 16px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    z-index: 1000001 !important;
    max-width: 300px !important;
  `;
  
  warning.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Large Collection Warning</div>
    <div style="font-size: 14px; margin-bottom: 12px;">
      Found ${itemCount.toLocaleString()} items (~${estimatedMemoryMB.toFixed(1)}MB memory usage).
      Consider reducing max_depth or max_scan_items for better performance.
    </div>
    <button onclick="this.parentElement.remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
      Dismiss
    </button>
  `;
  
  document.body.appendChild(warning);
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (warning.parentElement) warning.remove();
  }, 10000);
}

_showFolderSkippedWarning(folderPath, itemCount, limit) {
  console.warn(`Skipped folder ${folderPath}: ${itemCount} items exceeds limit of ${limit}`);
  
  // Show toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: var(--secondary-text-color) !important;
    color: white !important;
    padding: 12px 20px !important;
    border-radius: 24px !important;
    z-index: 1000002 !important;
    font-size: 14px !important;
  `;
  
  const folderName = folderPath.split('/').pop() || folderPath;
  toast.textContent = `Skipped "${folderName}" (${itemCount.toLocaleString()} items > ${limit.toLocaleString()} limit)`;
  
  document.body.appendChild(toast);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 5000);
}
```

### 5. Error Handling

```javascript
async _scanWithErrorHandling() {
  try {
    this._scanStartTime = Date.now();
    const scannedCount = { value: 0 };
    
    this._folderContents = await this._scanFolderContentsRecursive(
      this.config.media_path, 
      0, 
      scannedCount
    );
    
    this._log(`📁 Scanned ${scannedCount.value} items across subfolders`);
    
    if (scannedCount.value >= this.config.max_scan_items) {
      this._showWarning('Scan stopped at item limit. Consider reducing max_scan_items or max_depth.');
    }
    
  } catch (error) {
    console.error('Subfolder scan failed:', error);
    this._showError('Failed to scan subfolders. Falling back to root folder only.');
    // Fallback to current single-folder behavior
    await this._scanFolderContents();
  }
}
```

### 6. Backward Compatibility

- Default `include_subfolders: false` maintains current behavior
- All existing configurations continue to work unchanged
- New options are opt-in only

## Risks and Mitigation

### High-Risk Scenarios:
1. **Deep directory trees** (e.g., date-based photo folders: /2023/01/01/...)
   - **Mitigation**: Strict depth limiting with reasonable defaults
   
2. **Very large media collections** (10,000+ files)
   - **Mitigation**: Item count limits and timeout protection
   
3. **Network-mounted storage** with slow response times
   - **Mitigation**: Configurable timeouts and progress indicators
   
4. **Memory exhaustion** from large file lists
   - **Mitigation**: Streaming processing and garbage collection

### Testing Strategy:
- Test with various folder structures (shallow/deep, few/many files)
- Performance testing with 1K, 10K, 50K+ files
- Network timeout and error condition testing
- Memory usage monitoring during large scans

## Implementation Phases

### Phase 1: Core Functionality
- Basic recursive scanning with depth/count limits
- Configuration options in GUI editor
- Error handling and fallbacks

### Phase 2: Performance Optimization
- Concurrent scanning with request limiting
- Memory usage optimization
- Progress indicators and cancellation

### Phase 3: Advanced Features
- Folder structure display in browser
- Smart caching and TTL
- Advanced filtering (by date, size, etc.)

## Estimated Development Time
- **Phase 1**: 2-3 days (core implementation)
- **Phase 2**: 1-2 days (optimization)
- **Phase 3**: 1-2 days (advanced features)
- **Testing**: 1-2 days (comprehensive testing)

**Total**: 5-9 days for complete implementation

## Revised Implementation Plan Summary

### Key Improvements Based on Feedback:
1. **Scan timeout in seconds** (not milliseconds) - more user-friendly
2. **Per-folder item limits** - handles camera rolls with 10K+ photos per folder
3. **Comprehensive progress indicators** - real-time scanning progress with cancel option
4. **Smart memory warnings** - proactive alerts about large collections
5. **Granular notifications** - folder-specific skip warnings with toast messages

### Default Configuration (Conservative but Practical):
```yaml
include_subfolders: false          # Opt-in only
max_depth: 3                       # Reasonable for most photo structures  
max_scan_items: 10000             # Total across all folders (up from 5K)
max_items_per_folder: 5000        # Per-folder limit for camera rolls
scan_timeout_seconds: 45          # Generous timeout for large collections
show_scan_progress: true          # Always show progress for transparency
```

### User Experience Enhancements:
- **Progress Dialog**: Shows folders scanned, items found, current folder, progress bar
- **Memory Warnings**: Alerts when approaching 50MB+ estimated memory usage  
- **Folder Skip Notifications**: Toast messages when folders exceed per-folder limits
- **Cancellation Support**: Users can abort long-running scans
- **Auto-dismissing Warnings**: Notifications disappear automatically but can be dismissed manually

### Protection Mechanisms (Multi-layered):
1. **Depth limiting** - Prevents infinite recursion
2. **Total item counting** - Global limit across all folders  
3. **Per-folder limits** - Skip individual large folders (configurable)
4. **Timeout protection** - Abort after configurable seconds
5. **Memory monitoring** - Warn about large memory usage
6. **User cancellation** - Allow manual abort of scans
7. **Progress transparency** - Always show what's happening

### Backward Compatibility:
- **Default disabled** - `include_subfolders: false` by default
- **Existing configs unchanged** - All current functionality preserved
- **Progressive enhancement** - New features are purely additive

This approach provides robust subfolder support while protecting against the "tens of thousands of files" scenario through multiple safety mechanisms and transparent user feedback.