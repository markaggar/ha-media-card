# HA Media Index Integration Plan

## 🎯 Overview

A Home Assistant integration that efficiently scans, indexes, and serves media metadata for the media card and other consumers. Designed for large collections (25,000+ files) with intelligent caching and incremental updates.

---

## 🏗️ Architecture

### Three-Component System

```
┌─────────────────────────────────────────────────┐
│  HA Media Index Integration (Backend)           │
│  - Media scanning & indexing                    │
│  - EXIF metadata extraction                     │
│  - Smart caching with change detection          │
│  - File system monitoring                       │
│  - Service API for queries                      │
└─────────────────────────────────────────────────┘
                      ↓ Services
┌─────────────────────────────────────────────────┐
│  HA Media Card (Frontend - Dashboard)           │
│  - Lovelace card for normal dashboards          │
│  - Queries index for media items                │
│  - Slideshow display & controls                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  HA Media Panel (Frontend - Full Screen)        │
│  - Custom panel component                       │
│  - Full screen slideshow (no sidebar/header)    │
│  - Auto-launch on idle                          │
│  - Screensaver mode                             │
└─────────────────────────────────────────────────┘
```

---

## 📦 File Structure

```
custom_components/
└── media_index/
    ├── __init__.py              # Integration setup & services
    ├── manifest.json            # Dependencies & metadata
    ├── config_flow.py           # UI configuration
    ├── const.py                 # Constants
    ├── scanner.py               # Media file scanning
    ├── indexer.py               # Database indexing
    ├── exif_parser.py           # EXIF metadata extraction
    ├── watcher.py               # File system monitoring
    ├── cache_manager.py         # Intelligent caching
    └── services.yaml            # Service definitions

www/
├── ha-media-card.js             # Lovelace card (existing)
└── media-slideshow-panel.js     # Full screen panel (new)
```

---

## 🔧 Core Features

### 1. Smart Caching System

**Goal:** Never do a full scan on every restart. Only scan changes.

#### Cache Storage
```python
# SQLite database: .storage/media_index.db
CREATE TABLE media_files (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    folder TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    modified_time INTEGER NOT NULL,  # Unix timestamp
    created_time INTEGER,
    duration REAL,  # For videos
    width INTEGER,
    height INTEGER,
    orientation TEXT,
    last_scanned INTEGER NOT NULL,  # When we last verified this file exists
    INDEX idx_folder (folder),
    INDEX idx_modified (modified_time),
    INDEX idx_type (file_type)
);

CREATE TABLE exif_data (
    file_id INTEGER PRIMARY KEY,
    camera_make TEXT,
    camera_model TEXT,
    date_taken INTEGER,  # Unix timestamp
    latitude REAL,
    longitude REAL,
    location_name TEXT,
    location_city TEXT,
    location_country TEXT,
    iso INTEGER,
    aperture REAL,
    shutter_speed TEXT,
    focal_length REAL,
    flash TEXT,
    FOREIGN KEY (file_id) REFERENCES media_files(id)
);

CREATE TABLE scan_history (
    id INTEGER PRIMARY KEY,
    folder_path TEXT NOT NULL,
    scan_type TEXT NOT NULL,  # 'full', 'incremental', 'watched'
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    files_added INTEGER DEFAULT 0,
    files_updated INTEGER DEFAULT 0,
    files_removed INTEGER DEFAULT 0,
    status TEXT  # 'running', 'completed', 'failed'
);
```

#### Scan Strategy

**On HA Startup:**
```python
async def async_startup_scan(self):
    """Quick validation scan on startup."""
    
    # 1. Check for watched folders (priority)
    for watched_path in self.config.watched_folders:
        await self._incremental_scan(watched_path, priority=True)
    
    # 2. Quick validation of existing index
    #    Just check if folders still exist, don't scan contents
    await self._validate_index()
    
    # 3. Schedule background incremental scan
    #    Check for new files based on filesystem timestamps
    self.hass.async_create_background_task(
        self._background_incremental_scan(),
        "media_index_incremental_scan"
    )
```

**Incremental Scan (Smart):**
```python
async def _incremental_scan(self, folder_path: str, priority: bool = False):
    """Scan only new/modified files."""
    
    # Get last scan time for this folder
    last_scan = await self._get_last_scan_time(folder_path)
    
    # Get cached file list with modification times
    cached_files = await self._get_cached_files(folder_path)
    
    # Walk filesystem
    new_files = []
    modified_files = []
    
    for root, dirs, files in os.walk(folder_path):
        for filename in files:
            if not self._is_media_file(filename):
                continue
            
            full_path = os.path.join(root, filename)
            stat = os.stat(full_path)
            mtime = stat.st_mtime
            
            # Check cache
            if full_path not in cached_files:
                new_files.append(full_path)
            elif cached_files[full_path]['modified_time'] < mtime:
                modified_files.append(full_path)
    
    # Process new files (extract EXIF, index)
    if new_files:
        await self._index_files(new_files, is_new=True, priority=priority)
    
    # Update modified files
    if modified_files:
        await self._update_files(modified_files)
    
    # Remove deleted files from index
    deleted_files = set(cached_files.keys()) - set(all_current_files)
    if deleted_files:
        await self._remove_from_index(deleted_files)
```

**Periodic Full Reconciliation:**
```python
# configuration.yaml
media_index:
  watched_folders:
    - /media/Photos/Family
    - /media/Photos/Vacation
  scan_schedule:
    incremental: "hourly"      # Quick check for new files
    full_reconciliation: "weekly"  # Full validation & cleanup
  max_startup_scan_time: 30  # seconds - abort and continue in background
```

### 2. File System Monitoring

**Watchdog Integration:**
```python
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class MediaFileEventHandler(FileSystemEventHandler):
    """React to file system changes in real-time."""
    
    def on_created(self, event):
        if not event.is_directory and self._is_media_file(event.src_path):
            # Priority indexing for new files
            self.hass.async_create_task(
                self.indexer.index_file(event.src_path, priority=True)
            )
    
    def on_modified(self, event):
        if not event.is_directory and self._is_media_file(event.src_path):
            # Update existing index entry
            self.hass.async_create_task(
                self.indexer.update_file(event.src_path)
            )
    
    def on_deleted(self, event):
        if not event.is_directory:
            # Remove from index
            self.hass.async_create_task(
                self.indexer.remove_file(event.src_path)
            )

# Only watch specified folders to reduce overhead
for watched_path in config.watched_folders:
    observer.schedule(event_handler, watched_path, recursive=True)
```

### 3. Service API

```yaml
# Service: media_index.get_random_items
service: media_index.get_random_items
data:
  base_folder: "/media/Photos"
  count: 100
  filters:
    date_range:
      start: "2023-01-01"
      end: "2024-12-31"
    folders:
      include: ["Family", "Vacation"]
      exclude: ["Archive"]
    priority_folders: ["Family"]  # 3x weight
    file_types: ["jpg", "jpeg", "png", "mp4"]
    orientation: "landscape"  # or "portrait" or "any"
    has_location: true
  
# Returns:
# {
#   "items": [
#     {
#       "path": "media-source://media_source/local/Photos/Family/photo1.jpg",
#       "filename": "photo1.jpg",
#       "folder": "Family",
#       "file_type": "jpg",
#       "modified_time": 1704067200,
#       "width": 4032,
#       "height": 3024,
#       "orientation": "landscape",
#       "exif": {
#         "date_taken": "2023-06-15T14:30:00",
#         "camera": "iPhone 12",
#         "location": {
#           "latitude": 47.6062,
#           "longitude": -122.3321,
#           "city": "Seattle",
#           "country": "USA"
#         }
#       }
#     },
#     # ... 99 more
#   ],
#   "total_matches": 5432,
#   "cache_age_seconds": 45
# }
```

```yaml
# Service: media_index.force_scan
service: media_index.force_scan
data:
  folder: "/media/Photos/Family"
  scan_type: "full"  # or "incremental"
  extract_exif: true
```

```yaml
# Service: media_index.get_stats
service: media_index.get_stats
# Returns:
# {
#   "total_files": 25432,
#   "total_photos": 24500,
#   "total_videos": 932,
#   "folders_indexed": 1453,
#   "files_with_exif": 22100,
#   "files_with_location": 18500,
#   "last_full_scan": "2024-10-20T08:00:00",
#   "last_incremental_scan": "2024-10-24T14:30:00",
#   "cache_size_mb": 45.2,
#   "scan_in_progress": false
# }
```

---

## 🚀 Full Screen Panel Component

### Custom Panel Registration

```python
# custom_components/media_slideshow/__init__.py
from homeassistant.components.frontend import async_register_built_in_panel

async def async_setup(hass, config):
    """Set up the media slideshow panel."""
    
    # Register static path for panel JS
    hass.http.register_static_path(
        "/media-slideshow-panel",
        hass.config.path("www/media-slideshow-panel.js"),
        True,
    )
    
    # Register panel
    await hass.components.frontend.async_register_built_in_panel(
        component_name="custom",
        sidebar_title="Slideshow",
        sidebar_icon="mdi:presentation-play",
        frontend_url_path="media-slideshow",
        config={
            "_panel_custom": {
                "name": "media-slideshow-panel",
                "module_url": "/media-slideshow-panel",
                "embed_iframe": False,  # Full screen, not embedded
            }
        },
        require_admin=False,
    )
    
    return True
```

### Panel Features

```javascript
// www/media-slideshow-panel.js
class MediaSlideshowPanel extends HTMLElement {
  connectedCallback() {
    this.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 9999;
      background: black;
    `;
    
    // Auto-start slideshow
    if (this.config.auto_start) {
      this.startSlideshow();
    }
    
    // Exit on touch/click
    if (this.config.exit_on_interaction) {
      this.addEventListener('click', () => {
        // Navigate back to main dashboard
        window.history.back();
      });
    }
  }
  
  async startSlideshow() {
    // Query media index for items
    const items = await this.hass.callService('media_index', 'get_random_items', {
      base_folder: this.config.folder,
      count: this.config.slideshow_window || 1000
    });
    
    // Start slideshow loop
    this.playSlideshow(items);
  }
}

customElements.define('media-slideshow-panel', MediaSlideshowPanel);
```

### Auto-Launch on Idle

```yaml
# Automation to launch panel
automation:
  - alias: "Start Slideshow on Idle"
    trigger:
      - platform: state
        entity_id: input_boolean.slideshow_mode
        to: 'on'
      # OR use browser_mod for idle detection
      - platform: template
        value_template: "{{ is_state('sensor.tablet_last_activity', 'idle') }}"
    action:
      - service: browser_mod.navigate
        target:
          entity_id: media_player.wall_tablet
        data:
          path: /media-slideshow

# Exit slideshow on activity
automation:
  - alias: "Exit Slideshow on Activity"
    trigger:
      - platform: state
        entity_id: binary_sensor.tablet_motion
        to: 'on'
    action:
      - service: browser_mod.navigate
        target:
          entity_id: media_player.wall_tablet
        data:
          path: /lovelace/0
```

---

## 📊 Performance Optimizations

### 1. Batch Processing
- Process files in batches of 100
- Yield to event loop between batches
- Prevent blocking HA during scans

### 2. Concurrent Scanning
- Scan multiple folders in parallel (max 3 concurrent)
- EXIF extraction in thread pool executor

### 3. Index Optimization
- SQLite indexes on frequently queried fields
- Prepared statements for queries
- Connection pooling

### 4. Memory Management
- Stream large result sets
- Paginated queries for huge collections
- Clear caches on memory pressure

---

## 🔄 Migration Path

### Phase 1: Integration (Standalone)
- Build media_index integration
- Works independently
- Cards can optionally use it

### Phase 2: Card Enhancement
- Update media card to detect integration
- Fall back to current scanning if not available
- Configuration option to prefer integration

### Phase 3: Panel Component
- Build full screen panel
- Reuses card display logic
- Optional installation

---

## 🎯 Success Criteria

✅ **Startup Performance**
- HA restart < 30 seconds even with 25K+ photos
- Background scanning doesn't block UI

✅ **Incremental Updates**
- New photos detected within 5 seconds (watched folders)
- Hourly incremental scan catches everything else

✅ **Memory Efficiency**
- Integration uses < 100MB RAM
- Database < 50MB for 25K photos

✅ **Query Performance**
- Random item selection < 100ms
- Filtered queries < 500ms

✅ **Full Screen Mode**
- Panel takes entire viewport (no sidebar/header)
- Exit to dashboard on interaction
- Works with automation triggers

---

## 📝 Configuration Example

```yaml
# configuration.yaml
media_index:
  # Folders to watch for real-time updates
  watched_folders:
    - /media/Photos/Family
    - /media/Photos/Vacation
  
  # Base folder for scanning
  base_folder: /media/Photos
  
  # Scan scheduling
  scan_schedule:
    startup: incremental  # Quick check on startup
    incremental: hourly   # Regular incremental scans
    full: weekly          # Full reconciliation
  
  # Performance tuning
  max_startup_time: 30    # Abort startup scan after 30s, continue in background
  concurrent_scans: 3     # Max parallel folder scans
  batch_size: 100         # Files per batch
  
  # EXIF extraction
  extract_exif: true
  geocode_locations: true # Convert GPS to place names
  
  # Cache management
  cache_max_age_days: 90  # Remove files not seen in 90 days

# Full screen panel
media_slideshow:
  auto_start: true        # Auto-start slideshow when panel loads
  exit_on_interaction: true
  slideshow_window: 1000
  auto_refresh_seconds: 10
```

---

## 🚦 Implementation Priority

### High Priority (v1.0)
1. ✅ SQLite-based caching system
2. ✅ Incremental scanning logic
3. ✅ File system watcher for priority folders
4. ✅ Service API for random item queries
5. ✅ Basic EXIF extraction

### Medium Priority (v1.1)
1. ⏳ Full screen panel component
2. ⏳ Geocoding integration
3. ⏳ Advanced filtering (date range, location)
4. ⏳ Performance dashboard

### Low Priority (v2.0)
1. 🔮 ML-based photo quality scoring
2. 🔮 Face detection integration
3. 🔮 Duplicate detection
4. 🔮 Auto-categorization

---

## 🎬 Next Steps

1. **Prototype the cache manager** - Prove incremental scanning works
2. **Build service API** - Get random items from index
3. **Create config flow** - UI for watched folders
4. **Test with 25K+ collection** - Validate performance
5. **Panel component** - Full screen slideshow mode
