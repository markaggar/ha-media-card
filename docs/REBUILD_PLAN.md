# 🚀 Media Card Rebuild Plan: Queue-Based Multi-Folder Support

## 📁 Files Saved
- `ha-media-card-v2.1b25-backup.js` - Complex implementation for reference
- `extracted-utilities.js` - Clean utility functions to reuse

## 🎯 Implementation Strategy: Step-by-Step with Validation

### Phase 1: Revert to Stable Base ✅
**Goal:** Get back to a working card that shows images and has basic navigation
**Commit:** Start from `bc64ebf` (last known stable commit)
**Success Criteria:**
- [ ] Auto-refresh works reliably (5-second intervals)
- [ ] Manual navigation (next/prev) works
- [ ] Metadata displays correctly
- [ ] No "media not found" flashes

### Phase 2: Implement Background Media Queue 🔄
**Goal:** Create a simple background worker that populates a media queue
**Features to Add:**
- [ ] `MediaQueue` class that runs in background
- [ ] Scans single folder, populates array of media URLs
- [ ] Main card pulls from queue for instant media switching
- [ ] Queue automatically refills when low

**Success Criteria:**
- [ ] Sub-second media switching (no scanning delays)
- [ ] Consistent 5-second auto-refresh
- [ ] Queue maintains 20-50 items
- [ ] Background scanning doesn't block UI

### Phase 3: Multi-Folder Queue Support 🗂️
**Goal:** Extend queue to scan multiple folders
**Features to Add:**
- [ ] Discovery scan to find all media folders
- [ ] Queue pulls from multiple folders randomly
- [ ] Configurable subfolder depth
- [ ] Memory-efficient folder caching

**Success Criteria:**
- [ ] True random selection across all folders
- [ ] Performance remains fast (<1 second switching)
- [ ] Memory usage stays reasonable
- [ ] Works with user's existing folder structure

### Phase 4: Metadata Optimization 📊
**Goal:** Decouple metadata from scanning for performance
**Features to Add:**
- [ ] Lazy metadata loading (after image is shown)
- [ ] Metadata caching system
- [ ] Timestamp extraction from filenames
- [ ] Smart metadata display updates

**Success Criteria:**
- [ ] Metadata doesn't slow down image switching
- [ ] Timestamps display correctly when available
- [ ] File info updates properly
- [ ] No metadata loading delays

### Phase 5: Advanced Features & Polish ✨
**Goal:** Add smart features and optimize user experience
**Features to Add:**
- [ ] Smart exclusion (avoid recent images)
- [ ] Folder weighting (some folders more likely)
- [ ] Error handling and recovery
- [ ] Performance monitoring and diagnostics

**Success Criteria:**
- [ ] No duplicate images in short timeframe
- [ ] Graceful error handling
- [ ] Smooth user experience
- [ ] Easy configuration

## 🔄 Commit Strategy
After each phase:
1. **Test thoroughly** - User validates functionality works
2. **Commit changes** - Save working state before moving forward
3. **Document what works** - Clear notes on functionality
4. **Move to next phase** - Only when current phase is solid

## 🚧 Key Architecture Principles

### 1. **Separation of Concerns**
- **Queue System:** Background media discovery and caching
- **Display Logic:** Fast media switching and rendering
- **Metadata System:** Lazy loading after media is displayed

### 2. **Performance First**
- **Sub-second media switching** (queue-based)
- **Consistent timing** (5-second intervals)
- **Non-blocking operations** (background workers)

### 3. **Incremental Complexity**
- **Start simple** (single folder queue)
- **Add features gradually** (multi-folder, then advanced features)
- **Validate at each step** (working functionality before proceeding)

## 🎮 Next Steps
1. Revert to commit `bc64ebf` 
2. Test that Phase 1 criteria work
3. Begin Phase 2 queue implementation
4. Commit and validate before proceeding

Ready to start Phase 1? 🚀