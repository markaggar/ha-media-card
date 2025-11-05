# Home Assistant Media Card Project

This is a custom Home Assistant Lovelace card that can display both images and MP4 videos from the media folder with a GUI editor for file selection.

## Project Structure
- `src/` - Source JavaScript files using Lit Element
- `dist/` - Built distribution files  
- `ha-media-card.js` - Standalone card implementation (no build required)
- `package.json` - Dependencies and build scripts
- `rollup.config.js` - Build configuration
- `README.md` - Comprehensive documentation
- `docs/` - Documentation files
- `docs/planning/` - **Planning documents for features and integrations**
  - `MEDIA_INDEX_INTEGRATION_PLAN.md` - Backend integration strategy
  - `GEOCODING_CACHE_STRATEGY.md` - Geocoding implementation
  - `EXIF_INTEGRATION_PLAN.md` - EXIF data handling
  - `FULLSCREEN_MODE_PLAN.md` - Fullscreen display mode

## Development Guidelines
- Follow Home Assistant custom card conventions
- Use Lit-Element for web components
- Implement GUI editor for media file selection
- Support both image and video playback
- Base implementation on picture-entity-card and gallery-card patterns

## V5 Development - CODE REUSE MANDATE

**🚨 CRITICAL: V5 is a REORGANIZATION, not a rewrite 🚨**

### V5 Code Reuse Policy
**ALL code for `ha-media-card-v5a.js` MUST be based on existing V4 code from `ha-media-card.js`.**

**Rules:**
1. **Copy V4 code first** - Always start by copying the relevant V4 implementation
2. **Modify only when necessary** - Only change V4 code for:
   - Known bugs that need fixing
   - Architectural adaptations (e.g., provider pattern integration)
3. **No new implementations without justification** - Do not write new code unless V4 has no equivalent
4. **Explain after deploying** - If you must write new code:
   - Implement what's needed
   - Deploy it
   - Then explain to the user what was written and why V4 code couldn't be used
   - User will review and may ask for changes

**Examples:**
- ✅ CORRECT: Copy V4's `_renderMedia()`, `_onMediaError()`, navigation zones, aspect ratio handling
- ✅ CORRECT: Adapt V4's SubfolderQueue logic into MediaProvider pattern
- ✅ CORRECT: Write new provider factory if V4 has no equivalent, then explain why
- ❌ WRONG: Write new navigation controls without checking V4
- ❌ WRONG: Implement new error handling without copying V4's retry logic
- ❌ WRONG: Create simplified versions of existing V4 features
- ❌ WRONG: Write new code and not explain why V4 wasn't used

**Goal:** 0% new algorithms - 100% proven V4 code reorganized into provider architecture

**Reference:** See `dev-docs/v5-architecture-spec.md` for architecture details

## V5 MANDATORY IMPLEMENTATION WORKFLOW

**🚨 ENFORCE THIS WORKFLOW FOR EVERY V5a TASK 🚨**

Before writing ANY code in `ha-media-card-v5a.js`, follow this checklist:

### Pre-Implementation Checklist (REQUIRED)
1. ✋ **STOP** - Do not write code yet
2. 🔍 **Search V4** - Use `grep_search` to find similar functionality in `ha-media-card.js`
3. 📖 **Read V4** - Use `read_file` to read the V4 implementation
4. 📋 **Copy V4** - Start by copying V4's exact code as baseline
5. 🔧 **Adapt** - Only modify for provider pattern integration or documented bugs
6. 📝 **Document** - If no V4 equivalent exists, explain why after deploying

### Visible Workflow Pattern
When implementing any v5a feature, ALWAYS show this pattern in responses:

```
**Searching V4 for existing implementation...**
[grep_search results showing V4 has the code]

**Found V4 implementation at lines X-Y:**
[Code snippet from V4]

**Copying V4 code and adapting for provider pattern...**
[Show the adaptation]
```

### Violation Examples (DO NOT DO THIS)
- ❌ Writing code without searching V4 first
- ❌ "Simplifying" V4 code without justification
- ❌ Implementing from scratch when V4 has equivalent
- ❌ Not explaining why new code was necessary

### Success Metrics
- **Every v5a method** should trace back to V4 code or have documented justification
- **Zero surprised "you wrote new code" feedback** from user
- **Visible V4 search** in every implementation response

**This workflow is NON-NEGOTIABLE for v5 development.**

## Git Workflow
**CRITICAL**: ALL development work must be done on feature branches

### Branch Protection Rules
- **NEVER push directly to `master` branch**
- Master branch is for stable releases only
- All new features/fixes must use feature branches

### Development Workflow
1. **Create feature branch** for any new work:
   ```powershell
   git checkout -b feature/integration-support
   # or
   git checkout -b fix/bug-description
   ```

2. **Make changes and commit** to feature branch:
   ```powershell
   git add .
   git commit -m "feat: add integration support for metadata display"
   git push -u origin feature/integration-support
   ```

3. **Create Pull Request** on GitHub when ready
4. **Merge to master** only after review and testing
5. **Tag releases** on master branch for version control

### Current Development Branch
- `feature/integration-support` - For integration with media-index backend

### Branch Naming Convention
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `chore/description` - Maintenance tasks

## Checklist Progress
- [x] Verify copilot-instructions.md file created
- [x] Clarify Project Requirements - Creating HA custom card for image/video display
- [x] Scaffold the Project - Created directory structure and core files
- [x] Customize the Project - Implemented media card and editor components
- [ ] Install Required Extensions
- [ ] Compile the Project
- [ ] Create and Run Task
- [ ] Launch the Project
- [x] Ensure Documentation is Complete - README and project docs created

## Implementation Status
- ✅ v4.1.0: Complete media slideshow system with SubfolderQueue, Media Index, and folder navigation
- ✅ Main media card component with image/video display
- ✅ GUI editor for media file selection  
- ✅ Video controls (autoplay, loop, muted options)
- ✅ Responsive design with HA theme integration
- ✅ Mock media browser functionality
- ✅ Comprehensive documentation
- ✅ Project structure for Home Assistant compatibility

## v5 Architecture Development
**🚨 CRITICAL: v5 Rebuild In Progress 🚨**

**Active Development Reference**: `dev-docs/v5-architecture-spec.md`

### v5 Architecture Overview
- **Unified Provider Pattern**: SingleMediaProvider, MediaIndexProvider, SubfolderProvider, SimpleFolderProvider
- **Configuration Rationalization**: Radio button media source selection with context-sensitive options
- **Code Reuse Strategy**: 0% new algorithms - reorganization of existing working code
- **Implementation Phases**: Interface definitions → Provider classes → Configuration system → Integration testing

### Critical Implementation Notes
- **Preserve All Existing Logic**: Keep metadata display, navigation controls, queue algorithms, history management
- **Unify Architecture**: Single queue interface, unified state management, consistent reconnection system  
- **Auto-advance vs Auto-refresh**: Timer-based advancement vs URL refresh for single media/cameras
- **Context-Sensitive Features**: Show relevant options based on selected media source type

**🚨 V5 CODE REUSE ENFORCEMENT 🚨**

Before implementing ANY feature in v5a:
1. Search `ha-media-card.js` (V4) for existing implementation
2. Copy the V4 code as-is
3. Only modify for:
   - Adapting to provider pattern architecture
   - Fixing known bugs documented in dev-docs
4. If no V4 equivalent exists:
   - Implement what's needed (don't stop and wait)
   - Deploy it
   - Explain to user what was written and why V4 had no equivalent
   - User will review and may request changes

**Examples of V4 Code to Copy:**
- `_renderMedia()` - Media rendering with error states
- `_onMediaError()` - Comprehensive error handling with retry logic
- Navigation zones - Invisible overlay controls
- Aspect ratio handling - CSS attribute-based scaling
- Video controls - Full V4 video option support
- Error state UI - Retry buttons, Synology detection

**ALWAYS** reference `dev-docs/v5-architecture-spec.md` when working on v5 development tasks.

## Deployment
**CRITICAL**: Always deploy changes after modifying code files

### Media Card Deployment

#### V5a Development Deployment Command
```powershell
Copy-Item "ha-media-card-v5a.js" "\\10.0.0.62\config\www\cards\media-card-v5a.js" -Force
```

#### V4 Development Server Deployment Command
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.62\config\www\cards\media-card.js" -Force
```

#### Production Deployment Command
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.26\config\www\cards\media-card.js" -Force
```

#### Deployment Process
1. Make changes to `ha-media-card-v5a.js` or `ha-media-card.js`
2. Deploy to **HADev (10.0.0.62)** using the appropriate development command
3. Hard refresh browser (Ctrl+Shift+R or Ctrl+F5) to clear cache
4. Test changes on HADev
5. When stable, deploy to Production (10.0.0.26)
6. Check Home Assistant logs for any errors

#### File Locations
- **Development**: `c:\Users\marka\Media Item Card\ha-media-card.js`
- **HADev Server**: `\\10.0.0.62\config\www\cards\media-card.js`
- **Production Server**: `\\10.0.0.26\config\www\cards\media-card.js`

### Media Index Integration Deployment

The Media Index integration lives in a **separate repository** (`ha-media-index`) and has its own automated deployment script.

**🚨 CRITICAL: ALWAYS USE THE DEPLOYMENT SCRIPT 🚨**

**NEVER** use individual PowerShell commands for:
- ❌ Copying files manually with `Copy-Item`
- ❌ Restarting HA with `Invoke-RestMethod`
- ❌ Checking logs with multiple API calls
- ❌ Any manual deployment steps

**ALWAYS** use the deployment script for:
- ✅ Deploying code changes
- ✅ Restarting Home Assistant
- ✅ Verifying integration loaded
- ✅ Checking error logs
- ✅ Any integration development tasks

#### Deployment Script Location
```powershell
C:\Users\marka\ha-media-index\scripts\deploy-media-index.ps1
```

#### Standard Deployment Command
```powershell
# Change to ha-media-index repository
cd C:\Users\marka\ha-media-index

# Deploy with verification (HADev .62)
.\scripts\deploy-media-index.ps1 `
    -VerifyEntity "sensor.media_index_media_photo_photolibrary_total_files" `
    -DumpErrorLogOnFail
```

#### Force Restart (when no file changes detected)
```powershell
cd C:\Users\marka\ha-media-index

.\scripts\deploy-media-index.ps1 `
    -VerifyEntity "sensor.media_index_media_photo_photolibrary_total_files" `
    -DumpErrorLogOnFail `
    -AlwaysRestart
```

#### What the Script Does
1. Copies changed files from dev workspace to HA `custom_components/`
2. Validates HA configuration before restart
3. Restarts Home Assistant via REST API
4. Waits for HA to come back online
5. Verifies integration loaded by checking sensor availability
6. Validates sensor attributes are populated correctly
7. Captures error log on failure for debugging
8. Returns exit code 0 (success) or 2 (regression)

#### Environment Setup
```powershell
# Set once in PowerShell profile for HADev (.62)
$env:HA_BASE_URL = "http://10.0.0.62:8123"
$env:HA_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhMzU4N2QwZDkwMTI0MWY5YmMzMTJlZGQzMTBhZTY0YiIsImlhdCI6MTc2MTM3MTYzNiwiZXhwIjoyMDc2NzMxNjM2fQ.KN_dJi3PxMHCZh4M_MODinGVqyJ4RCjFcd6XE5zHnok"
$env:HA_VERIFY_ENTITY = "sensor.media_index_media_photo_photolibrary_total_files"
$env:WM_SAVE_ERROR_LOG_TO_TEMP = "1"
```

**Important**: The environment variable `$env:HA_BASE_URL` must be set to HADev (.62) not Production (.55) for media_index development!

#### File Locations
- **Development**: `c:\Users\marka\ha-media-index\custom_components\media_index\`
- **HADev Server**: `\\10.0.0.62\config\custom_components\media_index\`
- **Cache Database**: `\\10.0.0.62\config\.storage\media_index.db` (auto-created)

#### Testing Without Manual Intervention
```powershell
# Deploy and verify in one command
.\scripts\deploy-media-index.ps1 -VerifyEntity "sensor.media_index_media_photo_photolibrary_total_files" -DumpErrorLogOnFail

# Check exit code
if ($LASTEXITCODE -eq 0) { 
    Write-Host "✅ Integration deployed and verified successfully" -ForegroundColor Green 
} else { 
    Write-Host "❌ Integration verification failed - check error log" -ForegroundColor Red 
}
```

See `MEDIA_INDEX_INTEGRATION_PLAN.md` for complete deployment documentation.

---

## Repository Structure

### ha-media-card (This Repository)
- Custom Lovelace card for media display
- Frontend only (JavaScript)
- Deployed to `www/cards/`
- HACS installable as a Lovelace plugin

### ha-media-index (Separate Repository)
- Backend Home Assistant integration
- Python custom component
- Deployed to `custom_components/`
- HACS installable as an integration
- Provides services for media scanning and indexing
- See: `MEDIA_INDEX_INTEGRATION_PLAN.md` for architecture

## Home Assistant Integration Development Best Practices

### Configuration Flow Principles (from Water Monitor post-mortem)

**Critical Patterns for Config Flow:**
- Always use `str` type for list inputs in config flow schema (not `cv.ensure_list`)
- Parse comma-separated strings into lists in the flow handler, not in the schema
- Example that WORKS:
  ```python
  vol.Optional(CONF_WATCHED_FOLDERS, default=""): str
  # Then in handler:
  watched = [f.strip() for f in user_input.get(CONF_WATCHED_FOLDERS, "").split(",") if f.strip()]
  ```
- Example that FAILS (causes 500 error):
  ```python
  vol.Optional(CONF_WATCHED_FOLDERS, default=[]): cv.ensure_list  # ❌ Cannot serialize
  ```

**Dependency Management:**
- Never pin versions for packages that are core HA dependencies (like Pillow)
- Use `>=` instead of `==` for version requirements to allow compatibility
- If a package conflicts, remove it entirely from manifest.json and rely on HA's version
- Example fix:
  ```json
  "requirements": [
    "aiosqlite>=0.19.0",    // ✅ Flexible version
    "watchdog>=3.0.0"        // ✅ Allows newer versions
    // Pillow removed - already in HA core
  ]
  ```

**Device and Entity Registry:**
- All entities MUST share same `DeviceInfo.identifiers={(DOMAIN, entry.entry_id)}`
- Set `manufacturer` and `model` to what you want shown in UI device column
- Respect `name_by_user` when updating device names via registry
- Never change `unique_id` after initial release (causes orphaned entities)

**Configuration Best Practices:**
- Store minimal data in `entry.data`; runtime config goes in `entry.options`
- Always merge: `config = {**entry.data, **entry.options}`
- Define all defaults in `const.py`
- Add `entry.add_update_listener()` to reload on option changes
- Use multi-step ConfigFlow for complex setups

**Options Flow Reconfiguration:**
- Make all settings reconfigurable via OptionsFlow
- Use `async_reload_entry()` in update listener to apply changes
- Gate optional features with explicit enable flags
- Handle missing upstream dependencies gracefully

**Common Pitfalls to Avoid:**
1. ❌ Using `cv.ensure_list` in voluptuous schema (not serializable)
2. ❌ Pinning versions of core HA packages (causes conflicts)
3. ❌ Changing `unique_id` format (breaks existing installations)
4. ❌ Different `DeviceInfo` across platforms (splits device grouping)
5. ❌ Not handling missing optional config gracefully
6. ❌ Forgetting to add update listener for OptionsFlow

**See Also:**
- `Water-Monitor/docs/post_mortem_and_ai_guide_home_assistant_integration.md` for comprehensive guide
- Always test: fresh install, reconfiguration, adding entities, missing dependencies

---

## Next Steps
Since Node.js is not available in this environment, the project is ready to use as-is with the source files. Users can either:
1. Use the source files directly (src/ha-media-card.js, src/media-card-editor.js, src/index.js)
2. Install Node.js and run npm build process locally
3. Use the files as a starting point for further customization
