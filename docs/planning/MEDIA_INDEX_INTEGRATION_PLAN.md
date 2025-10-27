# HA Media Index Integration Plan

## 🎯 Overview

A Home Assistant integration that efficiently scans, indexes, and serves media metadata for the media card and other consumers. Designed for large collections (25,000+ files) with intelligent caching and incremental updates.

**Repository Strategy:** This integration will be developed in a **separate GitHub repository** (`ha-media-index`) to allow independent versioning, releases, and HACS installation separate from the card itself.

**Reconfiguration Support:** The integration must support full reconfiguration via the Home Assistant UI without requiring restart or manual file editing. Users can change watched folders, scan schedules, and all settings through the integrations page.

**Deployment Strategy:** Automated PowerShell deployment script (`deploy-media-index.ps1`) enables rapid development iteration without manual intervention. Script handles file copying, HA restart, integration verification, and error log capture on failure. See **Deployment & Testing Strategy** section for full details.

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
│  - Interactive file actions (favorite/delete)   │
│  - Smart collections & filters                  │
└─────────────────────────────────────────────────┘
                      ↓ Services
┌─────────────────────────────────────────────────┐
│  HA Media Card (Frontend - Dashboard)           │
│  - Lovelace card for normal dashboards          │
│  - Queries index for media items                │
│  - Slideshow display & controls                 │
│  - Interactive actions (favorite/rate/delete)   │
│  - Keyboard shortcuts                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  HA Media Panel (Frontend - Full Screen)        │
│  - Custom panel component                       │
│  - Full screen slideshow (no sidebar/header)    │
│  - Auto-launch on idle                          │
│  - Screensaver mode                             │
│  - Quick action overlays                        │
└─────────────────────────────────────────────────┘
```

---

## 📦 File Structure

**Repository:** `ha-media-index` (separate from `ha-media-card`)

```
custom_components/
└── media_index/
    ├── __init__.py              # Integration setup & services
    ├── manifest.json            # Dependencies & metadata
    ├── config_flow.py           # UI configuration & reconfiguration
    ├── const.py                 # Constants
    ├── scanner.py               # Media file scanning
    ├── indexer.py               # Database indexing
    ├── exif_parser.py           # EXIF metadata extraction
    ├── watcher.py               # File system monitoring
    ├── cache_manager.py         # Intelligent caching
    ├── file_actions.py          # File operations (favorite/delete/move/rate)
    ├── services.yaml            # Service definitions
    ├── strings.json             # Translations
    └── translations/
        └── en.json              # English translations

scripts/
└── deploy-media-index.ps1       # Automated deployment script

tests/
├── test_scanner.py              # Unit tests for scanner
├── test_cache_manager.py        # Cache validation tests
├── test_file_actions.py         # File operations tests
└── fixtures/                    # Test media files

README.md                        # Installation & configuration
hacs.json                        # HACS repository metadata
```

**Card Repository:** `ha-media-card` (existing)
```
www/
└── ha-media-card.js             # Lovelace card (existing)

scripts/
└── deploy-media-card.ps1        # Card deployment script
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

CREATE TABLE geocode_cache (
    id INTEGER PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    location_name TEXT,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT,
    location_country_code TEXT,
    cached_time INTEGER NOT NULL,  # Unix timestamp when cached
    access_count INTEGER DEFAULT 1,
    last_accessed INTEGER NOT NULL,  # Unix timestamp of last use
    UNIQUE(latitude, longitude)  # Prevent duplicate lookups
);

CREATE INDEX idx_geocode_coords ON geocode_cache(latitude, longitude);
CREATE INDEX idx_geocode_accessed ON geocode_cache(last_accessed);
```

**Geocoding Cache Notes:**
- GPS coordinates are rounded to 4 decimal places (~11 meters precision) before cache lookup
- This groups nearby photos (e.g., same park, same street) to minimize API calls
- Cache has no expiration - location names don't change frequently
- `access_count` tracks cache effectiveness
- `last_accessed` enables cleanup of rarely-used entries (optional housekeeping)

#### Geocoding Strategy

**Service Provider:** Nominatim (OpenStreetMap's free geocoding service)
- Free, no API key required
- Usage policy: Max 1 request/second, must include User-Agent
- Reverse geocoding endpoint: `https://nominatim.openstreetmap.org/reverse`

**Cache-First Approach:**
```python
# geocoder.py
import aiohttp
import asyncio
from typing import Optional, Dict

class GeocodeCache:
    """Intelligent geocoding with aggressive caching."""
    
    NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
    COORD_PRECISION = 4  # Decimal places (4 = ~11m accuracy)
    RATE_LIMIT_DELAY = 1.0  # Seconds between API calls
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._last_request_time = 0
        self._cache_hits = 0
        self._cache_misses = 0
    
    def _round_coords(self, lat: float, lon: float) -> tuple[float, float]:
        """Round coordinates to reduce cache misses for nearby photos."""
        return (
            round(lat, self.COORD_PRECISION),
            round(lon, self.COORD_PRECISION)
        )
    
    async def reverse_geocode(self, latitude: float, longitude: float) -> Optional[Dict]:
        """Get location name from GPS coordinates (cache-first)."""
        
        # Round coordinates for cache lookup
        lat, lon = self._round_coords(latitude, longitude)
        
        # 1. Check cache first
        cached = await self._get_from_cache(lat, lon)
        if cached:
            self._cache_hits += 1
            return cached
        
        self._cache_misses += 1
        
        # 2. Rate limiting (Nominatim: max 1 req/sec)
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            await asyncio.sleep(self.RATE_LIMIT_DELAY - elapsed)
        
        # 3. Call Nominatim API
        try:
            async with aiohttp.ClientSession() as session:
                params = {
                    'lat': lat,
                    'lon': lon,
                    'format': 'json',
                    'zoom': 18,  # Street-level detail
                    'addressdetails': 1
                }
                headers = {
                    'User-Agent': 'HomeAssistant-MediaIndex/1.0'
                }
                
                async with session.get(self.NOMINATIM_URL, params=params, headers=headers) as resp:
                    self._last_request_time = asyncio.get_event_loop().time()
                    
                    if resp.status == 200:
                        data = await resp.json()
                        location = self._parse_nominatim_response(data)
                        
                        # 4. Cache the result
                        await self._save_to_cache(lat, lon, location)
                        
                        return location
                    else:
                        _LOGGER.warning(f"Nominatim returned status {resp.status}")
                        return None
        
        except Exception as e:
            _LOGGER.error(f"Geocoding failed for ({lat}, {lon}): {e}")
            return None
    
    def _parse_nominatim_response(self, data: dict) -> Dict:
        """Extract relevant location info from Nominatim response."""
        address = data.get('address', {})
        
        # Prefer neighborhood/suburb, fallback to city
        location_name = (
            address.get('suburb') or 
            address.get('neighbourhood') or 
            address.get('hamlet') or 
            address.get('village') or
            address.get('town') or
            address.get('city')
        )
        
        return {
            'location_name': location_name,
            'location_city': address.get('city') or address.get('town'),
            'location_state': address.get('state'),
            'location_country': address.get('country'),
            'location_country_code': address.get('country_code', '').upper()
        }
    
    async def _get_from_cache(self, lat: float, lon: float) -> Optional[Dict]:
        """Check geocode cache for existing result."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                UPDATE geocode_cache 
                SET access_count = access_count + 1,
                    last_accessed = ?
                WHERE latitude = ? AND longitude = ?
                RETURNING location_name, location_city, location_state, 
                         location_country, location_country_code
                """,
                (int(time.time()), lat, lon)
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    await db.commit()
                    return dict(row)
        return None
    
    async def _save_to_cache(self, lat: float, lon: float, location: Dict):
        """Save geocoding result to cache."""
        now = int(time.time())
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO geocode_cache 
                (latitude, longitude, location_name, location_city, location_state,
                 location_country, location_country_code, cached_time, last_accessed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lat, lon,
                    location.get('location_name'),
                    location.get('location_city'),
                    location.get('location_state'),
                    location.get('location_country'),
                    location.get('location_country_code'),
                    now, now
                )
            )
            await db.commit()
    
    def get_cache_stats(self) -> Dict:
        """Return cache effectiveness statistics."""
        total_requests = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'cache_hits': self._cache_hits,
            'cache_misses': self._cache_misses,
            'total_requests': total_requests,
            'hit_rate_percent': round(hit_rate, 2)
        }
```

**Integration with EXIF Extraction:**
```python
# exif_parser.py
async def extract_and_geocode(self, file_path: str) -> Dict:
    """Extract EXIF and optionally geocode GPS coordinates."""
    
    exif_data = await self._extract_exif(file_path)
    
    # If GPS data present and geocoding enabled
    if exif_data.get('latitude') and self.config.geocode_enabled:
        location = await self.geocoder.reverse_geocode(
            exif_data['latitude'],
            exif_data['longitude']
        )
        if location:
            exif_data.update(location)
    
    return exif_data
```

**Performance Expectations:**
- **Cache hit rate:** 60-80% for typical photo collections (recurring locations)
- **API calls for 25K photos:** 5K-10K unique locations (vs. 25K without caching)
- **Indexing time saved:** ~6-12 hours (at 1 req/sec) vs. ~7 hours with cache
- **Coordinate rounding:** Groups photos within ~11 meters to same location name

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

## 🎨 Interactive File Management

### Overview

Enable users to curate their collection directly from the slideshow - favorite, rate, delete, or move files without leaving the card. Actions persist to both the database and file metadata.

### UI Controls

#### Action Buttons (Card/Panel)

```javascript
// Navigation overlay with action buttons
_renderActionButtons() {
  return html`
    <div class="action-buttons">
      <button @click=${this._handleFavorite} class="action-btn favorite-btn">
        <ha-icon icon="mdi:heart${this._isFavorited ? '' : '-outline'}"></ha-icon>
        <span>Favorite</span>
      </button>
      
      <button @click=${this._handleRate} class="action-btn rate-btn">
        <ha-icon icon="mdi:star"></ha-icon>
        <span>Rate (${this._currentRating || 0}⭐)</span>
      </button>
      
      <button @click=${this._handleDelete} class="action-btn delete-btn">
        <ha-icon icon="mdi:delete-outline"></ha-icon>
        <span>Delete</span>
      </button>
      
      <button @click=${this._handleMove} class="action-btn move-btn">
        <ha-icon icon="mdi:folder-move"></ha-icon>
        <span>Move to...</span>
      </button>
    </div>
  `;
}
```

#### Frontend Service Calls

```javascript
async _handleFavorite() {
  const result = await this.hass.callService('media_index', 'favorite_file', {
    media_path: this._currentMediaPath,
    action: this._isFavorited ? 'unfavorite' : 'favorite'
  });
  
  if (result.success) {
    this._isFavorited = !this._isFavorited;
    this._showToast('Added to favorites!');
  }
}

async _handleDelete() {
  // Confirm dialog
  const confirmed = await this._showConfirmDialog(
    'Delete this file?',
    'This will move it to a trash folder. You can restore it later.'
  );
  
  if (confirmed) {
    await this.hass.callService('media_index', 'delete_file', {
      media_path: this._currentMediaPath,
      permanent: false  // Move to trash, not permanent delete
    });
    
    this._showToast('Moved to trash');
    this._loadNextMedia();  // Auto-advance to next item
  }
}

async _handleRate() {
  // Show rating dialog
  const rating = await this._showRatingDialog();
  
  if (rating) {
    await this.hass.callService('media_index', 'rate_file', {
      media_path: this._currentMediaPath,
      rating: rating  // 1-5 stars
    });
    
    this._currentRating = rating;
    this._showToast(`Rated ${rating} stars`);
  }
}

async _handleMove() {
  // Show folder picker
  const targetFolder = await this._showFolderPicker();
  
  if (targetFolder) {
    await this.hass.callService('media_index', 'move_file', {
      media_path: this._currentMediaPath,
      target_folder: targetFolder
    });
    
    this._showToast(`Moved to ${targetFolder}`);
    this._loadNextMedia();
  }
}
```

#### Keyboard Shortcuts

```javascript
_handleKeyPress(e) {
  switch(e.key) {
    case 'f':
      this._handleFavorite();
      break;
    case 'd':
      this._handleDelete();
      break;
    case '1': case '2': case '3': case '4': case '5':
      this._handleRate(parseInt(e.key));
      break;
    case 'm':
      this._handleMove();
      break;
  }
}
```

### Backend Services

#### Service Definitions

```yaml
# services.yaml
media_index:
  favorite_file:
    name: "Favorite File"
    description: "Mark a file as favorite or unfavorite"
    fields:
      media_path:
        name: "Media Path"
        description: "Full path to media file"
        required: true
        example: "/media/Photos/Family/photo.jpg"
      action:
        name: "Action"
        description: "favorite or unfavorite"
        required: true
        selector:
          select:
            options:
              - "favorite"
              - "unfavorite"
  
  delete_file:
    name: "Delete File"
    description: "Delete or trash a media file"
    fields:
      media_path:
        name: "Media Path"
        required: true
      permanent:
        name: "Permanent Delete"
        description: "If false, moves to trash folder"
        required: false
        default: false
        selector:
          boolean:
  
  rate_file:
    name: "Rate File"
    description: "Assign a star rating to a file"
    fields:
      media_path:
        name: "Media Path"
        required: true
      rating:
        name: "Rating"
        description: "Star rating (1-5)"
        required: true
        selector:
          number:
            min: 1
            max: 5
            mode: slider
  
  move_file:
    name: "Move File"
    description: "Move file to a different folder"
    fields:
      media_path:
        name: "Source Path"
        required: true
      target_folder:
        name: "Target Folder"
        required: true
      create_folder:
        name: "Create Folder"
        description: "Create target folder if it doesn't exist"
        default: false
        selector:
          boolean:
  
  batch_action:
    name: "Batch Action"
    description: "Perform action on multiple files"
    fields:
      media_paths:
        name: "Media Paths"
        description: "List of file paths"
        required: false
        selector:
          object:
      query:
        name: "Query"
        description: "Query to select files"
        required: false
        selector:
          object:
      action:
        name: "Action"
        required: true
        selector:
          select:
            options:
              - "favorite"
              - "unfavorite"
              - "delete"
              - "move"
      target_folder:
        name: "Target Folder"
        description: "For move action"
        required: false
  
  restore_file:
    name: "Restore File"
    description: "Restore file from trash"
    fields:
      media_path:
        name: "Original Path"
        required: false
      trash_id:
        name: "Trash ID"
        description: "Database ID of trashed file"
        required: false
        selector:
          number:
            min: 1
```

#### Backend Implementation

```python
# file_actions.py
import os
import shutil
from datetime import datetime
from pathlib import Path
import json

class FileActionService:
    """Handle file system operations and metadata management."""
    
    def __init__(self, hass, config):
        self.hass = hass
        self.config = config
        self.db = hass.data['media_index']['db']
        
        # Strategy: Where to store metadata
        self.metadata_strategy = config.get('metadata_strategy', 'sidecar')
        # Options: 'sidecar', 'database', 'xmp', 'exif'
    
    async def favorite_file(self, media_path: str, action: str):
        """Mark file as favorite."""
        
        # Update database
        await self.db.execute(
            "UPDATE media_files SET is_favorite = ?, favorited_at = ? WHERE path = ?",
            (action == 'favorite', datetime.now().timestamp(), media_path)
        )
        
        # Also write to file metadata (multiple strategies)
        if self.metadata_strategy == 'sidecar':
            await self._write_sidecar_metadata(media_path, {
                'favorite': action == 'favorite',
                'favorited_at': datetime.now().isoformat()
            })
        
        elif self.metadata_strategy == 'xmp':
            await self._write_xmp_metadata(media_path, {
                'Rating': 5 if action == 'favorite' else 0
            })
        
        elif self.metadata_strategy == 'exif':
            # Write to EXIF Rating field
            await self._write_exif_rating(media_path, 
                5 if action == 'favorite' else 0)
        
        # Fire event for other integrations
        self.hass.bus.async_fire('media_index_file_favorited', {
            'path': media_path,
            'is_favorite': action == 'favorite'
        })
        
        return {'success': True}
    
    async def delete_file(self, media_path: str, permanent: bool = False):
        """Delete or move file to trash."""
        
        if not os.path.exists(media_path):
            return {'success': False, 'error': 'File not found'}
        
        if permanent:
            # Permanent delete - be very careful!
            if self.config.get('allow_permanent_delete', False):
                os.remove(media_path)
                action = 'deleted'
            else:
                return {'success': False, 'error': 'Permanent delete disabled'}
        else:
            # Move to trash folder
            trash_folder = self.config.get('trash_folder', '/media/.trash')
            
            # Create trash folder if needed
            Path(trash_folder).mkdir(parents=True, exist_ok=True)
            
            # Preserve folder structure in trash
            relative_path = os.path.relpath(
                media_path, 
                self.config['base_folder']
            )
            trash_path = os.path.join(trash_folder, relative_path)
            
            # Create parent dirs
            Path(trash_path).parent.mkdir(parents=True, exist_ok=True)
            
            # Move file
            shutil.move(media_path, trash_path)
            action = 'trashed'
            
            # Store deletion metadata for restore
            await self.db.execute("""
                INSERT INTO deleted_files 
                (original_path, trash_path, deleted_at)
                VALUES (?, ?, ?)
            """, (media_path, trash_path, datetime.now().timestamp()))
        
        # Remove from active index
        await self.db.execute(
            "DELETE FROM media_files WHERE path = ?",
            (media_path,)
        )
        
        # Fire event
        self.hass.bus.async_fire('media_index_file_deleted', {
            'path': media_path,
            'action': action
        })
        
        return {'success': True, 'action': action}
    
    async def rate_file(self, media_path: str, rating: int):
        """Assign star rating to file."""
        
        if not 1 <= rating <= 5:
            return {'success': False, 'error': 'Rating must be 1-5'}
        
        # Update database
        await self.db.execute(
            "UPDATE media_files SET rating = ?, rated_at = ? WHERE path = ?",
            (rating, datetime.now().timestamp(), media_path)
        )
        
        # Write to file metadata
        if self.metadata_strategy == 'sidecar':
            await self._write_sidecar_metadata(media_path, {
                'rating': rating,
                'rated_at': datetime.now().isoformat()
            })
        
        elif self.metadata_strategy in ['xmp', 'exif']:
            # Standard XMP/EXIF Rating field (0-5)
            await self._write_exif_rating(media_path, rating)
        
        return {'success': True, 'rating': rating}
    
    async def move_file(self, media_path: str, target_folder: str, 
                       create_folder: bool = False):
        """Move file to different folder."""
        
        if not os.path.exists(media_path):
            return {'success': False, 'error': 'Source file not found'}
        
        # Create target folder if requested
        if create_folder and not os.path.exists(target_folder):
            Path(target_folder).mkdir(parents=True, exist_ok=True)
        
        if not os.path.exists(target_folder):
            return {'success': False, 'error': 'Target folder not found'}
        
        # Get filename
        filename = os.path.basename(media_path)
        target_path = os.path.join(target_folder, filename)
        
        # Check for conflicts
        if os.path.exists(target_path):
            # Auto-rename with timestamp
            name, ext = os.path.splitext(filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{name}_{timestamp}{ext}"
            target_path = os.path.join(target_folder, filename)
        
        # Move file (and sidecar if exists)
        shutil.move(media_path, target_path)
        
        sidecar_path = f"{media_path}.json"
        if os.path.exists(sidecar_path):
            target_sidecar = f"{target_path}.json"
            shutil.move(sidecar_path, target_sidecar)
        
        # Update index
        await self.db.execute("""
            UPDATE media_files 
            SET path = ?, folder = ?
            WHERE path = ?
        """, (target_path, os.path.basename(target_folder), media_path))
        
        return {
            'success': True, 
            'new_path': target_path
        }
    
    async def batch_action(self, media_paths: list = None, query: dict = None,
                          action: str = None, **kwargs):
        """Perform action on multiple files."""
        
        # Get file list from paths or query
        if media_paths:
            files = media_paths
        elif query:
            files = await self._query_files(query)
        else:
            return {'success': False, 'error': 'Must provide media_paths or query'}
        
        results = {
            'success': 0,
            'failed': 0,
            'errors': []
        }
        
        for file_path in files:
            try:
                if action == 'favorite':
                    await self.favorite_file(file_path, 'favorite')
                elif action == 'unfavorite':
                    await self.favorite_file(file_path, 'unfavorite')
                elif action == 'delete':
                    await self.delete_file(file_path, permanent=False)
                elif action == 'move':
                    await self.move_file(file_path, kwargs.get('target_folder'))
                
                results['success'] += 1
            except Exception as e:
                results['failed'] += 1
                results['errors'].append({
                    'file': file_path,
                    'error': str(e)
                })
        
        return results
    
    async def restore_file(self, media_path: str = None, trash_id: int = None):
        """Restore file from trash."""
        
        # Get trash record
        if trash_id:
            row = await self.db.fetchone(
                "SELECT * FROM deleted_files WHERE id = ?",
                (trash_id,)
            )
        elif media_path:
            row = await self.db.fetchone(
                "SELECT * FROM deleted_files WHERE original_path = ? AND restored_at IS NULL ORDER BY deleted_at DESC LIMIT 1",
                (media_path,)
            )
        else:
            return {'success': False, 'error': 'Must provide media_path or trash_id'}
        
        if not row:
            return {'success': False, 'error': 'File not found in trash'}
        
        original_path = row['original_path']
        trash_path = row['trash_path']
        
        if not os.path.exists(trash_path):
            return {'success': False, 'error': 'Trash file not found'}
        
        # Ensure parent directory exists
        Path(original_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Restore file
        shutil.move(trash_path, original_path)
        
        # Restore sidecar if exists
        trash_sidecar = f"{trash_path}.json"
        if os.path.exists(trash_sidecar):
            shutil.move(trash_sidecar, f"{original_path}.json")
        
        # Update trash record
        await self.db.execute(
            "UPDATE deleted_files SET restored_at = ? WHERE id = ?",
            (datetime.now().timestamp(), row['id'])
        )
        
        # Re-index file
        await self.hass.data['media_index']['scanner'].index_file(original_path)
        
        return {'success': True, 'restored_path': original_path}
    
    async def _write_sidecar_metadata(self, media_path: str, metadata: dict):
        """Write JSON sidecar file alongside media file."""
        sidecar_path = f"{media_path}.json"
        
        # Load existing sidecar if exists
        existing = {}
        if os.path.exists(sidecar_path):
            with open(sidecar_path, 'r') as f:
                existing = json.load(f)
        
        # Merge metadata
        existing.update(metadata)
        
        # Write sidecar
        with open(sidecar_path, 'w') as f:
            json.dump(existing, f, indent=2)
    
    async def _write_exif_rating(self, media_path: str, rating: int):
        """Write rating to EXIF data."""
        from PIL import Image
        import piexif
        
        img = Image.open(media_path)
        
        # Load existing EXIF
        exif_dict = piexif.load(img.info.get('exif', b''))
        
        # Set rating (0-5 scale in EXIF)
        exif_dict['0th'][piexif.ImageIFD.Rating] = rating
        
        # Save with updated EXIF
        exif_bytes = piexif.dump(exif_dict)
        img.save(media_path, exif=exif_bytes)
    
    async def _query_files(self, query: dict):
        """Query files based on filters."""
        sql = "SELECT path FROM media_files WHERE 1=1"
        params = []
        
        if query.get('folder'):
            sql += " AND folder = ?"
            params.append(query['folder'])
        
        if query.get('date_range'):
            start, end = query['date_range'].split(' to ')
            sql += " AND created_time BETWEEN ? AND ?"
            params.extend([start, end])
        
        if query.get('rating'):
            sql += " AND rating >= ?"
            params.append(query['rating'])
        
        rows = await self.db.fetchall(sql, params)
        return [row['path'] for row in rows]
```

### Database Schema Updates

```sql
-- Add action tracking columns
ALTER TABLE media_files ADD COLUMN is_favorite BOOLEAN DEFAULT 0;
ALTER TABLE media_files ADD COLUMN favorited_at INTEGER;
ALTER TABLE media_files ADD COLUMN rating INTEGER;  -- 1-5 stars
ALTER TABLE media_files ADD COLUMN rated_at INTEGER;
ALTER TABLE media_files ADD COLUMN last_viewed INTEGER;  -- Unix timestamp
ALTER TABLE media_files ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE media_files ADD COLUMN custom_tags TEXT;  -- JSON array

-- Deleted files tracking (for restore)
CREATE TABLE deleted_files (
    id INTEGER PRIMARY KEY,
    original_path TEXT NOT NULL,
    trash_path TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    restored_at INTEGER,
    UNIQUE(original_path, deleted_at)
);

-- Create indexes for performance
CREATE INDEX idx_favorite ON media_files(is_favorite);
CREATE INDEX idx_rating ON media_files(rating);
CREATE INDEX idx_last_viewed ON media_files(last_viewed);
```

### Smart Collections

Auto-updating virtual folders based on user actions:

```python
# Smart collection queries
COLLECTIONS = {
    'favorites': {
        'query': "SELECT * FROM media_files WHERE is_favorite = 1",
        'icon': 'mdi:heart',
        'order': 'favorited_at DESC'
    },
    'highly_rated': {
        'query': "SELECT * FROM media_files WHERE rating >= 4",
        'icon': 'mdi:star',
        'order': 'rating DESC, rated_at DESC'
    },
    'recent': {
        'query': "SELECT * FROM media_files WHERE last_viewed > ? ORDER BY last_viewed DESC",
        'icon': 'mdi:clock-outline',
        'params': lambda: [int((datetime.now() - timedelta(days=7)).timestamp())]
    },
    'unrated': {
        'query': "SELECT * FROM media_files WHERE rating IS NULL",
        'icon': 'mdi:star-outline',
        'order': 'RANDOM()'
    },
    'trash': {
        'query': "SELECT * FROM deleted_files WHERE restored_at IS NULL",
        'icon': 'mdi:delete',
        'order': 'deleted_at DESC'
    }
}
```

### Configuration

```yaml
# configuration.yaml
media_index:
  # File action settings
  file_actions:
    enabled: true
    allow_delete: true
    allow_permanent_delete: false  # Safety!
    trash_folder: /media/.trash
    trash_retention_days: 30  # Auto-cleanup old trash
    
    # Metadata storage strategy
    metadata_strategy: sidecar  # or 'database', 'xmp', 'exif'
    
    # Confirmation requirements
    require_confirmation:
      delete: true
      move: false
      permanent_delete: true
    
    # Smart collections
    enable_collections: true
    collections:
      - favorites
      - highly_rated
      - recent
      - trash
```

### UI Styling

```css
/* Action buttons overlay */
.action-buttons {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 100;
}

.media-container:hover .action-buttons {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: rgba(0, 0, 0, 0.95);
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.favorite-btn.active ha-icon {
  color: var(--error-color);
}

.rate-btn.rated ha-icon {
  color: var(--warning-color);
}
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
  
  # Geocoding settings
  geocoding:
    enabled: true
    coordinate_precision: 4  # Decimal places (4 = ~11m grouping)
    rate_limit_delay: 1.0    # Seconds between API calls (Nominatim requirement)
    cache_cleanup_days: 365  # Remove unused geocode cache entries after 1 year
  
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
6. ✅ Interactive file actions (favorite/rate/delete)

### Medium Priority (v1.1)
1. ⏳ Full screen panel component
2. ⏳ Geocoding integration
3. ⏳ Advanced filtering (date range, location)
4. ⏳ Performance dashboard
5. ⏳ Batch file operations
6. ⏳ Smart collections (auto-updating queries)
7. ⏳ Trash management & restore

### Low Priority (v2.0)
1. 🔮 ML-based photo quality scoring
2. 🔮 Face detection integration
3. 🔮 Duplicate detection
4. 🔮 Auto-categorization
5. 🔮 XMP/EXIF metadata writing
6. 🔮 Advanced tagging system

---

## 🚀 Deployment & Testing Strategy

### Automated Deployment Script

The integration includes a PowerShell deployment script (`deploy-media-index.ps1`) that enables rapid development iteration without manual intervention.

#### Features
- **Automatic file copying** from dev workspace to HA `custom_components/`
- **Smart change detection** using Robocopy to only deploy modified files
- **Automatic HA restart** via REST API after deployment
- **Integration verification** by checking entity availability
- **Attribute validation** to ensure sensors have expected metadata
- **Error log capture** on failure for immediate debugging
- **Exit code signaling** for CI/CD integration (exit 2 on regression)

#### Script Parameters

```powershell
.\scripts\deploy-media-index.ps1 `
    -DestPath "\\10.0.0.26\config\custom_components\media_index" `
    -VerifyEntity "sensor.media_index_total_files" `
    -DumpErrorLogOnFail `
    -FailOnNoRestart
```

**Parameters:**
- `-DestPath`: Network path to HA `custom_components/media_index/` folder
- `-VerifyEntity`: Sensor to check after restart (confirms integration loaded)
- `-DumpErrorLogOnFail`: Fetch HA error log if verification fails
- `-FailOnNoRestart`: Exit with error if restart didn't occur
- `-ForceCopy`: Force copy even if files appear identical (Samba timestamp issues)
- `-AlwaysRestart`: Restart HA even if no file changes detected

#### Environment Variables

```powershell
# Set once in your PowerShell profile or dev environment
$env:HA_BASE_URL = "http://10.0.0.26:8123"
$env:HA_TOKEN = "eyJ0eXAiOiJKV1QiLCJhb..."  # Long-lived access token
$env:HA_VERIFY_ENTITY = "sensor.media_index_total_files"
$env:HA_RESTART_MAX_WAIT_SEC = "60"
$env:HA_VERIFY_MAX_WAIT_SEC = "45"
$env:WM_SAVE_ERROR_LOG_TO_TEMP = "1"  # Save error logs to %TEMP% for analysis
```

#### Deployment Workflow

**Standard development cycle:**

1. **Make changes** to integration code in `custom_components/media_index/`
2. **Deploy automatically:**
   ```powershell
   .\scripts\deploy-media-index.ps1
   ```
3. **Script executes:**
   - Copies changed files to HA server via network share
   - Validates HA configuration before restart
   - Requests HA Core restart via REST API
   - Waits for HA to come back online (polls `/api/config`)
   - Verifies `sensor.media_index_total_files` becomes available
   - Validates sensor attributes (e.g., `scan_status`, `last_scan_time`)
   - Captures error log if verification fails
   - Returns exit code 0 (success) or 2 (regression detected)

4. **Check results** - Script output shows:
   ```
   Deploying Media Index from: C:\dev\ha-media-index\custom_components\media_index
   To: \\10.0.0.26\config\custom_components\media_index
   Robocopy OK (code 1)
   Checking HA API: http://10.0.0.26:8123/api/config
   HA API reachable (HTTP 200).
   Running HA config check: http://10.0.0.26:8123/api/config/core/check_config
   Config check PASSED.
   Requesting HA Core restart via REST: http://10.0.0.26:8123/api/services/homeassistant/restart
   HA restart requested (HTTP 200).
   Waiting up to 60 s for HA to come back online...
   HA back online after 24s (HTTP 200).
   Verifying entity availability: sensor.media_index_total_files (timeout 45s)
   Entity sensor.media_index_total_files is available with state: 24653
   Attribute verification passed for sensor.media_index_total_files 
       (scan_status=idle, last_scan_time=2025-10-24T10:15:30)
   ```

**On failure, script automatically:**
- Fetches and displays last 120 lines of HA error log
- Filters for `media_index` specific errors
- Saves full log to `%TEMP%\ha-error-log-YYYYMMDD-HHmmss.log`
- Exits with code 2 to signal regression

#### Integration Verification

The deployment script validates the integration loaded correctly by checking:

1. **Entity availability:** `sensor.media_index_total_files` state is not `unknown` or `unavailable`
2. **Attribute presence:** Expected attributes exist:
   - `scan_status`: Current scan state (`idle`, `scanning`, `watching`)
   - `last_scan_time`: ISO timestamp of last scan completion
   - `total_folders`: Number of folders indexed
   - `watched_folders`: List of folders with active file system watchers
   - `cache_size_mb`: Size of SQLite cache database
   - `geocode_cache_entries`: Number of cached location lookups
   - `geocode_cache_hit_rate`: Percentage of GPS lookups served from cache
   - `files_with_location`: Count of files with GPS coordinates

3. **Log analysis:** No Python exceptions containing `media_index` in recent logs

**Example verification output:**
```
Entity sensor.media_index_total_files is available with state: 24653
Attribute verification passed (scan_status=idle, last_scan_time=2025-10-24T10:15:30, 
    total_folders=487, cache_size_mb=156.3, geocode_cache_entries=3842, 
    geocode_cache_hit_rate=73.2%, files_with_location=18653)
```

### Testing Without Manual Intervention

#### Unit Tests
```powershell
# Run pytest in integration directory
cd custom_components/media_index
pytest tests/ -v --cov=. --cov-report=html
```

#### Integration Tests
```powershell
# Deploy and verify in one command
.\scripts\deploy-media-index.ps1 -VerifyEntity "sensor.media_index_total_files" -DumpErrorLogOnFail
if ($LASTEXITCODE -eq 0) { 
    Write-Host "✅ Integration deployed and verified successfully" -ForegroundColor Green 
} else { 
    Write-Host "❌ Integration verification failed - check error log" -ForegroundColor Red 
}
```

#### CI/CD Integration
```yaml
# .github/workflows/deploy.yml
name: Deploy to HA Test Instance
on: [push]
jobs:
  deploy:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy and verify
        env:
          HA_BASE_URL: ${{ secrets.HA_BASE_URL }}
          HA_TOKEN: ${{ secrets.HA_TOKEN }}
        run: |
          .\scripts\deploy-media-index.ps1 `
            -DestPath "\\10.0.0.26\config\custom_components\media_index" `
            -VerifyEntity "sensor.media_index_total_files" `
            -DumpErrorLogOnFail `
            -FailOnNoRestart
      - name: Check exit code
        if: failure()
        run: exit 2
```

### Reconfiguration Support

The integration must support full reconfiguration without requiring HA restart or manual YAML editing.

#### Config Flow Implementation

**Initial Setup (ConfigFlow):**
```python
# config_flow.py
class MediaIndexConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Media Index."""
    
    VERSION = 1
    
    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}
        
        if user_input is not None:
            # Validate base folder exists
            base_folder = user_input[CONF_BASE_FOLDER]
            if not await self.hass.async_add_executor_job(os.path.isdir, base_folder):
                errors["base"] = "folder_not_found"
            else:
                # Create entry
                return self.async_create_entry(
                    title=f"Media Index ({base_folder})",
                    data=user_input
                )
        
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_BASE_FOLDER, default="/media"): str,
                vol.Optional(CONF_WATCHED_FOLDERS, default=[]): cv.ensure_list,
                vol.Optional(CONF_SCAN_ON_STARTUP, default=True): bool,
                vol.Optional(CONF_EXTRACT_EXIF, default=True): bool,
            }),
            errors=errors
        )
```

**Reconfiguration (OptionsFlow):**
```python
class MediaIndexOptionsFlow(config_entries.OptionsFlow):
    """Handle options flow for Media Index."""
    
    def __init__(self, config_entry: config_entries.ConfigEntry):
        """Initialize options flow."""
        self.config_entry = config_entry
    
    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            # Update config entry
            self.hass.config_entries.async_update_entry(
                self.config_entry,
                options=user_input
            )
            # Trigger reload of integration
            await self.hass.config_entries.async_reload(self.config_entry.entry_id)
            return self.async_create_entry(title="", data=user_input)
        
        current_watched = self.config_entry.options.get(
            CONF_WATCHED_FOLDERS, 
            self.config_entry.data.get(CONF_WATCHED_FOLDERS, [])
        )
        
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(
                    CONF_WATCHED_FOLDERS, 
                    default=current_watched
                ): cv.ensure_list,
                vol.Optional(
                    CONF_SCAN_SCHEDULE, 
                    default=self.config_entry.options.get(CONF_SCAN_SCHEDULE, "hourly")
                ): vol.In(["startup_only", "hourly", "daily", "weekly"]),
                vol.Optional(
                    CONF_EXTRACT_EXIF,
                    default=self.config_entry.options.get(CONF_EXTRACT_EXIF, True)
                ): bool,
                vol.Optional(
                    CONF_MAX_STARTUP_TIME,
                    default=self.config_entry.options.get(CONF_MAX_STARTUP_TIME, 30)
                ): vol.All(vol.Coerce(int), vol.Range(min=5, max=300)),
            })
        )
```

**Integration Reload on Config Change:**
```python
# __init__.py
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Media Index from a config entry."""
    
    # Register options update listener
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    
    # Initialize integration...
    
async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
```

#### Reconfigurable Settings

**Available via UI (no restart required):**
- ✅ Watched folders (add/remove file system watchers dynamically)
- ✅ Scan schedule (startup_only, hourly, daily, weekly)
- ✅ EXIF extraction enabled/disabled
- ✅ Geocoding enabled/disabled
- ✅ Geocoding coordinate precision (2-6 decimal places)
- ✅ Max startup scan time
- ✅ Concurrent scan workers
- ✅ Batch size for processing
- ✅ Cache max age
- ✅ Geocode cache cleanup age

**Requires restart:**
- ⚠️ Base folder path (structural change, requires reindex)

**Implementation Note:** When watched folders change, the integration dynamically adds/removes `watchdog` file system observers without restarting HA. When scan schedule changes, the integration cancels existing scheduled tasks and creates new ones with updated intervals. When geocoding is disabled, existing cached location names are preserved but no new API calls are made.

### Deployment Locations

#### Development Environment
```
C:\Users\marka\ha-media-index\
├── custom_components\media_index\  # Source code
├── scripts\deploy-media-index.ps1  # Deployment script
└── tests\                          # Unit tests
```

#### Home Assistant Production
```
\\10.0.0.26\config\
├── custom_components\
│   └── media_index\                # Deployed integration files
└── .storage\
    └── media_index.db              # SQLite cache (auto-created)
```

#### Card Deployment (Separate)
```
\\10.0.0.26\config\www\cards\
└── media-card.js                   # Card UI (from ha-media-card repo)
```

---

## 📘 Integration Design Best Practices

> **Source:** Lessons learned from Water Monitor integration post-mortem (January 2025). These patterns prevent common pitfalls in Home Assistant custom integration development.

### Configuration Flow Principles

**❌ AVOID: Non-Serializable Schema Types**
```python
# This FAILS with voluptuous_serialize error (500 Internal Server Error)
vol.Optional(CONF_WATCHED_FOLDERS, default=[]): cv.ensure_list
```

**✅ CORRECT: Use Basic Types, Parse in Handler**
```python
# Schema uses str type (serializable)
vol.Optional(CONF_WATCHED_FOLDERS, default=""): str

# Handler parses comma-separated string into list
watched = [f.strip() for f in user_input.get(CONF_WATCHED_FOLDERS, "").split(",") if f.strip()]
```

**Why:**
- `cv.ensure_list` returns a function object, not a data type
- `voluptuous_serialize` cannot serialize function objects for frontend display
- Results in config flow failing to load with HTTP 500 error
- Always use primitive types (`str`, `int`, `bool`, `float`) in schemas
- Perform complex parsing/validation in the flow handler after user input

### Dependency Management

**❌ AVOID: Pinning Versions of Core HA Packages**
```json
{
  "requirements": [
    "Pillow==10.0.0",    // ❌ Conflicts with HA core (has 11.3.0)
    "aiosqlite==0.19.0", // ❌ Too strict
    "watchdog==3.0.0"    // ❌ Prevents updates
  ]
}
```

**✅ CORRECT: Use Flexible Versioning, Remove Conflicts**
```json
{
  "requirements": [
    "aiosqlite>=0.19.0",  // ✅ Allows newer compatible versions
    "watchdog>=3.0.0"     // ✅ Future-proof
    // Pillow removed - already in HA core
  ]
}
```

**Why:**
- Home Assistant Core includes many common packages (Pillow, requests, etc.)
- Pinned versions (`==`) cause conflicts when HA updates its dependencies
- Error: `"Requirements for X not found: ['Pillow==10.0.0']"`
- Use `>=` for minimum version requirements
- Remove dependencies that conflict with HA core (rely on HA's version)
- Check HA Core's `requirements_all.txt` before adding dependencies

### Device and Entity Registry

**✅ CRITICAL: Shared Device Identifiers**
```python
# All entities MUST use same device identifier
device_info = DeviceInfo(
    identifiers={(DOMAIN, entry.entry_id)},  # Same for ALL entities
    name="Media Index Scanner",
    manufacturer="Custom Integration",        # Shown in UI
    model="Media Indexer v1.0",              # Shown in UI
)
```

**Why:**
- Different `identifiers` across platforms split entities into separate devices
- Use `entry.entry_id` (not `entry.unique_id`) for the identifier
- Set `manufacturer` and `model` to what you want shown in device list
- Respect `name_by_user` when updating device names via registry

**✅ CRITICAL: Stable Unique IDs**
```python
# NEVER change unique_id format after initial release
@property
def unique_id(self) -> str:
    return f"{self._entry.entry_id}_total_files"  # Stable forever
```

**Why:**
- Changing `unique_id` format causes orphaned entities (old ID not cleaned up)
- Users lose historical data and automations
- Define format in Phase 1 and commit to it permanently

### Configuration Storage

**✅ CORRECT: Separate Runtime Config from Initial Setup**
```python
# __init__.py - Merge data and options
config = {**entry.data, **entry.options}

# config_flow.py - Store minimal setup data
async def async_step_user(self, user_input=None):
    return self.async_create_entry(
        title=f"Media Index ({base_folder})",
        data={
            CONF_BASE_FOLDER: user_input[CONF_BASE_FOLDER],  # Immutable
        }
    )

# config_flow.py - Store runtime settings in options
class MediaIndexOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        return self.async_create_entry(
            title="",
            data={
                CONF_WATCHED_FOLDERS: user_input[CONF_WATCHED_FOLDERS],  # Mutable
                CONF_SCAN_SCHEDULE: user_input[CONF_SCAN_SCHEDULE],       # Mutable
            }
        )
```

**Why:**
- `entry.data` - Immutable setup values (base folder, name)
- `entry.options` - Reconfigurable runtime settings
- Always merge: `config = {**entry.data, **entry.options}`
- Define defaults in `const.py` to avoid missing key errors

### Options Flow Reconfiguration

**✅ CRITICAL: Add Update Listener**
```python
# __init__.py
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Register listener to reload on config changes
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    return True

async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload integration when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
```

**Why:**
- Without update listener, option changes don't take effect until HA restart
- `async_reload_entry()` reloads integration when user saves options
- Gate optional features with enable flags (avoid failing on missing deps)

### Common Pitfalls

1. **❌ Using `cv.ensure_list` in voluptuous schema**
   - Symptom: Config flow 500 error, `"Unable to convert schema: <function ensure_list>"`
   - Solution: Use `str` type, parse in handler

2. **❌ Pinning versions of core HA packages**
   - Symptom: `"Requirements for X not found: ['Pillow==10.0.0']"`
   - Solution: Use `>=` versions, remove conflicts

3. **❌ Changing `unique_id` format**
   - Symptom: Orphaned entities, lost historical data
   - Solution: Define stable format in Phase 1

4. **❌ Different `DeviceInfo` across platforms**
   - Symptom: Entities split into multiple devices in UI
   - Solution: Use same `identifiers` for all entities

5. **❌ Not handling missing optional config**
   - Symptom: `KeyError` on fresh installations
   - Solution: Define defaults in `const.py`, use `.get(key, default)`

6. **❌ Forgetting to add update listener**
   - Symptom: Options changes don't apply until restart
   - Solution: Call `entry.add_update_listener()` in `async_setup_entry`

### References

- **Water Monitor Post-Mortem:** `c:\Users\marka\Documents\AI\Water-Monitor\docs\post_mortem_and_ai_guide_home_assistant_integration.md`
- **Home Assistant Config Flow:** https://developers.home-assistant.io/docs/config_entries_config_flow_handler
- **Device Registry:** https://developers.home-assistant.io/docs/device_registry_index
- **Entity Unique IDs:** https://developers.home-assistant.io/docs/entity_registry_index#unique-id-requirements

---

## 🎬 Next Steps

### Phase 0: Repository Setup (Day 1)
1. **Create `ha-media-index` repository** on GitHub
2. **Initialize project structure:**
   - `custom_components/media_index/` - Integration code
   - `scripts/deploy-media-index.ps1` - Deployment automation
   - `tests/` - Unit and integration tests
   - `README.md` - Installation and configuration guide
   - `hacs.json` - HACS repository metadata
   - `.github/workflows/` - CI/CD pipelines
3. **Set up development environment:**
   - Clone repository to `c:\Users\marka\ha-media-index\`
   - Configure environment variables (HA_BASE_URL, HA_TOKEN)
   - Test deployment script against HA instance
4. **Create deployment script** based on Water Monitor pattern (see attached `deploy-water-monitor.ps1`)

### Phase 1: Core Integration (Days 2-4)
1. **Implement `manifest.json`** - Dependencies, domain, version
2. **Build `config_flow.py`** - Initial setup + reconfiguration (OptionsFlow)
3. **Create `const.py`** - Constants for config keys, defaults
4. **Implement `__init__.py`:**
   - Integration setup/teardown
   - Config entry reload on options change
   - Service registration
5. **Create basic sensor** - `sensor.media_index_total_files`
6. **Deploy and verify** - Ensure integration loads via automated script

### Phase 2: Smart Caching (Days 5-7)
1. **Implement `cache_manager.py`** - SQLite database schema
2. **Build `scanner.py`** - Incremental scanning logic
3. **Create `indexer.py`** - Database write operations
4. **Add scan service** - `media_index.scan_folder`
5. **Test with small dataset** (100 files) - Verify caching works
6. **Deploy and verify** - Check scan_status sensor attribute

### Phase 3: File System Monitoring (Days 8-9)
1. **Implement `watcher.py`** - watchdog integration
2. **Add watched_folders reconfiguration** - Dynamic watcher add/remove
3. **Test real-time updates** - Touch/delete files, verify sensor updates
4. **Deploy and verify** - Check watched_folders sensor attribute

### Phase 4: Service API (Days 10-11)
1. **Implement `media_index.get_random_items`** service
2. **Add filtering options** - folder, file_type, date_range
3. **Optimize queries** - Index tuning for performance
4. **Test with 25K+ collection** - Validate query speed (<100ms)
5. **Deploy and verify** - Call service from Developer Tools

### Phase 5: EXIF & Metadata (Days 12-14)
1. **Implement `exif_parser.py`** - Pillow/piexif integration
2. **Add metadata to cache** - GPS, camera, date_taken
3. **Create metadata sensors** - Latest photo location, camera stats
4. **Deploy and verify** - Check metadata attributes populated

### Phase 6: Interactive File Actions (Days 15-17)
1. **Implement `file_actions.py`** - Favorite/rate/delete/move operations
2. **Add action services:**
   - `media_index.favorite_file`
   - `media_index.rate_file`
   - `media_index.delete_file`
   - `media_index.move_file`
3. **Add favorites tracking** - SQLite table for starred items
4. **Test file operations** - Ensure files moved/deleted on disk
5. **Deploy and verify** - Call action services from card

### Phase 7: Documentation & Release (Days 18-20)
1. **Write comprehensive README** - Installation, configuration, services
2. **Create HACS metadata** - `hacs.json` for custom repository
3. **Add translations** - `strings.json` and `translations/en.json`
4. **CI/CD setup** - Automated testing and deployment
5. **Version tagging** - v1.0.0 release
6. **HACS submission** - Add to HACS default repository list

### Integration Testing Checklist
- [ ] Deployment script copies all files correctly
- [ ] HA restarts successfully after deployment
- [ ] Integration loads without errors
- [ ] `sensor.media_index_total_files` becomes available
- [ ] Sensor attributes populated (scan_status, last_scan_time, etc.)
- [ ] Reconfiguration via UI works without restart
- [ ] Watched folders dynamically add/remove watchers
- [ ] Services callable from Developer Tools
- [ ] File actions execute correctly
- [ ] Error log capture works on failures
- [ ] Exit code 0 on success, 2 on regression

### Success Metrics
- ✅ Initial scan of 25K files completes in <2 minutes
- ✅ Incremental scans complete in <10 seconds
- ✅ Real-time file changes detected within 5 seconds
- ✅ Service queries return in <100ms
- ✅ Integration loads in <5 seconds on HA restart
- ✅ Zero manual intervention required for deployment
- ✅ All tests pass in CI/CD pipeline

