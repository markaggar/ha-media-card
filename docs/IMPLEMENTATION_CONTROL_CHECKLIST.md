# Implementation Control Checklist - Hierarchical Scan Architecture

## 🚨 MANDATORY PROCESS - DO NOT DEVIATE WITHOUT APPROVAL

### Pre-Implementation Rules
- [ ] ✋ **STOP**: Any deviation from this checklist requires explicit user approval FIRST
- [ ] 📋 Each step must be completed and marked ✅ before proceeding to next step  
- [ ] ⚠️ If any step fails or needs modification, STOP and ask for guidance
- [ ] 🔍 User must approve each phase completion before moving to next phase

---

## Phase 1: Infrastructure Preparation ✅ MUST COMPLETE ALL ITEMS

### Step 1.1: Add New Method Structure
- [ ] Add `hierarchicalScanAndPopulate(basePath, currentDepth = 0, maxDepth = 3)` method
- [ ] Add `processLevelConcurrently(folders, maxConcurrent = 2)` helper
- [ ] Add `addFileToQueueWithBatching(file, shuffleCounter)` method 
- [ ] **CHECKPOINT**: Test new methods exist and are callable

### Step 1.2: Queue Management Updates  
- [ ] Add `queueShuffleCounter` property (tracks files added since last shuffle)
- [ ] Add `SHUFFLE_BATCH_SIZE = 10` constant
- [ ] Update queue addition to use batched shuffling (every 10 files)
- [ ] **CHECKPOINT**: Verify shuffle counter increments and resets properly

### Step 1.3: Preserve Current Infrastructure
- [ ] Keep `executeWithConcurrencyLimit` method (DO NOT REMOVE)
- [ ] Keep error handling patterns (tempDiscoveredFolders checks)
- [ ] Keep per-file probability logic (calculateGlobalProbabilitySampling)  
- [ ] **CHECKPOINT**: Verify existing functionality still works

**🛑 PHASE 1 APPROVAL REQUIRED BEFORE PROCEEDING** 

---

## Phase 2: Core Implementation ✅ MUST COMPLETE ALL ITEMS

### Step 2.1: Hierarchical Scan Logic
- [ ] Implement folder level processing (scan root → get subfolders)
- [ ] Implement concurrent folder processing (2-3 folders at once)
- [ ] Implement per-file probability evaluation and immediate queue addition
- [ ] **CHECKPOINT**: Single folder can be scanned and files added to queue

### Step 2.2: Recursion and Depth Control
- [ ] Implement recursive depth progression (level by level)
- [ ] Add depth limiting (maxDepth = 3) 
- [ ] Add proper async coordination between concurrent scans
- [ ] **CHECKPOINT**: Multi-level folder hierarchy processed correctly

### Step 2.3: Integration with Existing Systems
- [ ] Replace current initialize logic to call `hierarchicalScanAndPopulate`
- [ ] Preserve backward compatibility (same public interface)
- [ ] Maintain configuration parameter support
- [ ] **CHECKPOINT**: Full initialization works with new approach

**🛑 PHASE 2 APPROVAL REQUIRED BEFORE PROCEEDING**

---

## Phase 3: Legacy Removal ⚠️ ONLY AFTER PHASES 1-2 APPROVED

### Step 3.1: Remove Old Discovery System (CAREFUL - ONE AT A TIME)
- [ ] Remove `discoverSubfolders` method calls (replace with hierarchical)
- [ ] Remove `discoverSubfoldersWithEarlyPopulation` method
- [ ] Keep emergency recovery logic (move to hierarchical method)
- [ ] **CHECKPOINT**: No old discovery methods called, emergency handling preserved

### Step 3.2: Remove Streaming System (CAREFUL - ONE AT A TIME)  
- [ ] Remove `streamFolderFiles` method calls (replace with hierarchical)
- [ ] Remove `startConcurrentStreamingScans` method
- [ ] Remove `initializeWithStreamingScans` method
- [ ] **CHECKPOINT**: No old streaming methods called, functionality preserved

### Step 3.3: Remove Batch Scheduler (LAST - MOST DANGEROUS)
- [ ] Remove `startBatchScheduler` calls  
- [ ] Remove `batchScheduler` interval management
- [ ] Remove `scheduleBatch` method
- [ ] **CHECKPOINT**: No batch scheduler references, queue still populates

**🛑 PHASE 3 APPROVAL REQUIRED BEFORE PROCEEDING**

---

## Phase 4: Testing and Validation ✅ MANDATORY VERIFICATION

### Step 4.1: Functional Testing
- [ ] Test single folder scanning (files added to queue)
- [ ] Test multi-folder hierarchy (proper depth progression)  
- [ ] Test concurrent folder processing (2-3 at once, no overload)
- [ ] Test queue refill cycles (automatic when low)
- [ ] **CHECKPOINT**: All core functionality works

### Step 4.2: Performance Validation
- [ ] Verify <3 second first image display
- [ ] Confirm 50% reduction in network calls vs old approach
- [ ] Check memory usage stays reasonable (<100MB)
- [ ] Test with large folders (Camera Roll 11K+ files)
- [ ] **CHECKPOINT**: Performance meets design requirements  

### Step 4.3: Configuration Compatibility
- [ ] Test with existing estimated_total_photos (25000)
- [ ] Test with existing queue_size settings
- [ ] Test with existing concurrent limits
- [ ] Test debug mode functionality
- [ ] **CHECKPOINT**: All existing configs work

**🛑 FINAL APPROVAL REQUIRED FOR DEPLOYMENT**

---

## Mandatory Safety Rules

### 🚨 DEVIATION CONTROL
1. **Any step that fails** → STOP and ask for guidance
2. **Any unexpected behavior** → STOP and report issue  
3. **Any desire to modify approach** → STOP and get approval first
4. **Any performance concerns** → STOP and discuss alternatives

### 📋 CHECKPOINT PROTOCOL  
1. Mark each completed step with ✅
2. Test checkpoint requirements before proceeding
3. Report checkpoint status to user
4. Wait for approval before next phase

### ⚠️ ROLLBACK PLAN
- Keep git commits small (one per step)
- Test after each phase completion
- Be ready to revert if issues arise
- Maintain working backup at all times

---

## Implementation Tracking

**Phase 1 Status**: ⏸️ Not Started - AWAITING USER APPROVAL
**Phase 2 Status**: ⏸️ Blocked - Phase 1 must complete first  
**Phase 3 Status**: ⏸️ Blocked - Phase 2 must complete first
**Phase 4 Status**: ⏸️ Blocked - Phase 3 must complete first

**NEXT ACTION**: User must approve Phase 1 implementation plan before any code changes begin.