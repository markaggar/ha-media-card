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
    ├── file_actions.py          # File operations (favorite/delete/move/rate)
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

## 🎬 Next Steps

1. **Prototype the cache manager** - Prove incremental scanning works
2. **Build service API** - Get random items from index
3. **Implement file actions** - Favorite/rate/delete functionality
4. **Create config flow** - UI for watched folders
5. **Test with 25K+ collection** - Validate performance
6. **Panel component** - Full screen slideshow mode
7. **Smart collections** - Dynamic folders based on metadata
