# Hierarchical Scan Architecture Design

## Overview
Replace the current complex two-phase scanning approach (discovery + streaming) with a single, elegant hierarchical scan that provides immediate queue population and perfect file interspersing.

## Current Problems Being Solved
1. **Dual Network Overhead**: Each folder scanned twice (discovery for counts, streaming for files)
2. **Delayed Queue Population**: Files only added after entire discovery phase completes
3. **Poor Interspersing**: Files added in folder-sized chunks, not mixed immediately
4. **Complex Architecture**: Two-phase coordination, batch scheduling, emergency recovery complexity
5. **Slow Initial Display**: Users wait for discovery phase before seeing any images

## New Architecture Design

### Core Principles
1. **Single Scan Per Folder**: Each folder scanned exactly once
2. **Immediate File Addition**: Selected files go to queue instantly, no batching
3. **Batch Queue Shuffling**: Reshuffle entire queue every 10 file additions (reduce overhead)
4. **Hierarchical Progression**: Process folder tree level by level
5. **Controlled Concurrency**: 2-3 concurrent folder scans to prevent I/O overload

### Detailed Flow

#### Phase 1: Initial Hierarchy Scan
```
1. Scan root folder → get subfolder list
2. For each subfolder at current level (2-3 concurrent):
   a) Start folder scan (WebSocket call)
   b) For each file discovered in folder:
      - Apply per-file probability (1/estimated_total_photos)
      - If selected (Math.random() < probability):
        * Add file to queue IMMEDIATELY
        * Increment addition counter
        * If counter reaches 10: shuffle entire queue + reset counter
        * Trigger UI update if queue was empty
   c) Continue processing remaining files in folder
   d) When folder scan complete, move to next folder
3. When current level complete, recurse to next depth
4. Repeat until entire hierarchy exhausted
5. Set "hierarchy scan complete" flag
```

#### Phase 2: Queue Refill Cycles
```
Monitor queue size continuously:
When queue drops below threshold (20 items):
1. Re-scan entire hierarchy using same approach
2. Use different random seed for different file selections
3. Skip files in blacklist (recently shown items)
4. Again: immediate addition + batch reshuffling (every 10 files)
5. Repeat cycle indefinitely
```

### Implementation Strategy

#### New Core Method
```javascript
async hierarchicalScanAndPopulate(basePath, currentDepth = 0, maxDepth = 3) {
  // Hybrid approach: keep current infrastructure, replace core logic
  
  1. Scan current level folders
  2. Process 2-3 folders concurrently 
  3. For each file: apply probability → add to queue → reshuffle
  4. Recurse to next depth level
  5. Continue until complete
}
```

#### What to Keep from Current Code
- **Concurrency limiting** (executeWithConcurrencyLimit, MAX_CONCURRENT)
- **Error handling and emergency recovery** (tempDiscoveredFolders checks)
- **Per-file probability logic** (calculateGlobalProbabilitySampling concept)
- **Queue management** (shuffling, blacklist integration)
- **Immediate display triggers** (queue monitoring, UI updates)

#### What to Replace/Remove
- **Two-phase discovery/streaming system** (discoverSubfolders + streamFolderFiles)
- **Batch scheduler complexity** (scheduleBatch, batchScheduler interval)
- **tempDiscoveredFolders vs discoveredFolders confusion** (single folder tracking)
- **Complex streaming batching** (processFolderChildrenInBatches)

### Key Benefits

#### Performance Improvements
- **50% fewer network calls** (single scan per folder vs dual scan)
- **Faster initial display** (first selected file shows immediately)
- **Lower memory usage** (process files immediately, don't accumulate)
- **Better I/O distribution** (controlled concurrency prevents overload)

#### User Experience Improvements
- **Perfect interspersing** (files from all folders mixed immediately)
- **No waiting for discovery** (queue populates as folders are scanned)
- **Predictable performance** (no complex batch scheduling delays)
- **Responsive interface** (immediate UI updates when files found)

#### Code Quality Improvements  
- **Simpler architecture** (single-pass processing)
- **Easier debugging** (linear flow vs complex coordination)
- **Better maintainability** (fewer moving parts)
- **Clearer separation of concerns** (scan + select + add pattern)

### Configuration Parameters

#### Queue Management
- `queue_target_size`: 50-100 items (working queue size)
- `queue_refill_threshold`: 20 items (when to start refill cycle)
- `estimated_total_photos`: 25000 (for probability calculations)

#### Scanning Control
- `max_concurrent_folders`: 2-3 (prevent I/O overload)
- `max_scan_depth`: 3 levels (prevent infinite recursion)
- `folder_timeout`: 30 seconds (per-folder timeout)

#### Probability Tuning
- `base_probability`: 1/estimated_total_photos (0.004% for 25K collection)
- `minimum_folder_representation`: Optional guarantee (1 file per folder minimum)
- `blacklist_duration`: 30 minutes (avoid recently shown files)

### Migration Plan

#### Phase 1: Infrastructure Preparation
1. Keep current method signatures for compatibility
2. Add new hierarchicalScanAndPopulate method
3. Preserve existing error handling and concurrency controls
4. Test new method in isolation

#### Phase 2: Core Replacement
1. Replace initialize logic to call hierarchicalScanAndPopulate
2. Remove old discovery/streaming methods
3. Update queue management to use continuous shuffling
4. Test full integration

#### Phase 3: Cleanup and Optimization
1. Remove unused batch scheduler code
2. Simplify folder tracking (single array)
3. Optimize queue operations for frequent shuffling
4. Performance testing and tuning

### Risk Mitigation

#### Potential Issues
1. **Queue shuffling overhead** (reshuffling after every file)
2. **Concurrency coordination** (managing 2-3 concurrent scans)
3. **Memory usage spikes** (if folders contain many selected files)
4. **Recursion depth** (deep folder hierarchies)

#### Mitigation Strategies
1. **Efficient shuffling**: Use Fisher-Yates algorithm, optimize for frequent use
2. **Proper async coordination**: Use semaphore pattern for concurrency control
3. **Queue size limits**: Cap queue at reasonable size, trigger early refills
4. **Depth limiting**: Hard limit recursion depth, user configurable

## Success Criteria

### Functional Requirements
- [x] ✅ Single scan per folder (no dual discovery/streaming phases)
- [ ] 🎯 Immediate queue population (files added as discovered)  
- [ ] 🎯 Perfect interspersing (continuous queue shuffling)
- [ ] 🎯 Controlled concurrency (2-3 concurrent folder scans max)
- [ ] 🎯 Queue refill automation (when drops below threshold)

### Performance Requirements  
- [ ] 🎯 50% reduction in network calls vs current approach
- [ ] 🎯 <3 seconds to first image display (immediate queue population)
- [ ] 🎯 Smooth slideshow (no gaps from queue depletion)  
- [ ] 🎯 Memory usage <100MB (efficient processing)

### Quality Requirements
- [ ] 🎯 Code complexity reduction (simpler architecture)
- [ ] 🎯 Error handling preservation (keep current robustness)
- [ ] 🎯 Configuration compatibility (existing settings work)
- [ ] 🎯 Debug visibility (clear logging and monitoring)

## Next Steps

**WAITING FOR APPROVAL** - Do not proceed with implementation until design is reviewed and approved.

Once approved:
1. Implement hierarchicalScanAndPopulate method
2. Add queue continuous shuffling logic  
3. Replace current initialize flow
4. Test with existing configuration
5. Performance validation and tuning
