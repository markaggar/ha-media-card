# Home Assistant Media Card Project

A feature-rich custom Lovelace card for displaying images and videos with metadata support, multiple media sources, and advanced slideshow controls.

## Project Overview

**Current Version**: v5.0 (Complete rebuild with unified provider architecture)
**Status**: Production ready - v4→v5 migration complete
**Main File**: `ha-media-card.js` - Single-file Lit-Element web component (10K+ lines)

## Project Structure

- `ha-media-card.js` - **Main v5 card** (production file)
- `dev-docs/ha-media-card-v4.js` - **V4 reference** (for regression checking only)
- `dev-docs/` - Architecture specs, implementation plans, v5 migration docs
- `docs/` - User-facing documentation and guides
- `docs/planning/` - Feature planning documents
- `README.md` - User documentation
- `CHANGELOG.md` - Version history

## V5 Architecture (Current)

### Core Concepts

**Unified Provider Pattern**:
- All media sources implement common interface
- Single queue system handles all provider types
- Consistent state management across sources

**Provider Types**:
1. **SingleMediaProvider** - Display single image/video with optional auto-refresh
2. **MediaIndexProvider** - Integration with media-index backend for metadata-rich slideshows
3. **SubfolderProvider** - Hierarchical folder scanning with subfolder queue
4. **SimpleFolderProvider** - Flat folder listing

**Key Features**:
- Metadata display (EXIF, GPS, dates, locations)
- Multiple navigation modes (sequential, random, history)
- Keyboard/gesture controls with customizable tap actions
- Template support in confirmation dialogs
- Video autoplay with error handling
- Kiosk mode support
- Responsive design with HA theme integration

### Architecture References
- `dev-docs/v5-architecture-spec.md` - Complete architecture documentation
- `dev-docs/v5-implementation-plan.md` - Migration strategy (completed)
- `dev-docs/phase-1a-code-map.md` - V4→V5 code mapping (historical)

## Development Guidelines

**When Adding Features**:
1. Check if V4 had similar functionality in `dev-docs/ha-media-card-v4.js`
2. Reuse proven patterns from V4 where applicable
3. Follow Lit-Element conventions for web components
4. Maintain HA theme integration with CSS variables
5. Test on HADev before production deployment

**Code Style**:
- Use Lit `html` and `css` tagged templates
- Prefix private methods with underscore `_methodName()`
- Use async/await for asynchronous operations
- Handle errors gracefully with user feedback
- Add comments for complex logic


**Template Variables Available**:
For confirmation dialogs and service data:
- `{{filename}}` - Filename without extension
- `{{filename_ext}}` - Filename with extension
- `{{folder}}` - Folder name
- `{{folder_path}}` - Full folder path
- `{{media_path}}` - Complete media path
- `{{date}}` - Formatted date
- `{{date_time}}` - Date and time
- `{{location}}` - "City, State, Country"
- `{{city}}`, `{{state}}`, `{{country}}` - Individual location components

## Deployment

**CRITICAL**: Always deploy after code changes and use hard refresh (Ctrl+Shift+R) to clear browser cache.

### Media Card Deployment

#### Development Server (HADev - 10.0.0.62)
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.62\config\www\cards\ha-media-card.js" -Force
```

#### Production Server (10.0.0.26)
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.26\config\www\cards\ha-media-card.js" -Force
```

#### Deployment Process
1. Make changes to `ha-media-card.js`
2. Deploy to **HADev (10.0.0.62)** first
3. **Hard refresh browser** (Ctrl+Shift+R or Ctrl+F5) to clear cache
4. Test changes thoroughly on HADev
5. When stable, deploy to **Production (10.0.0.26)**
6. Check Home Assistant logs for any errors

#### File Locations
- **Development**: `c:\Users\marka\Media Item Card\ha-media-card.js`
- **HADev Server**: `\\10.0.0.62\config\www\cards\ha-media-card.js`
- **Production Server**: `\\10.0.0.26\config\www\cards\ha-media-card.js`

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

## Regression Checking

**V4 Reference Code**: `dev-docs/ha-media-card-v4.js`

When bugs are reported or features seem broken:
1. Check if feature existed in V4
2. Compare V4 implementation with current V5 code
3. Verify the V4→V5 migration preserved the logic correctly
4. Test the exact scenario that worked in V4

**V4 is the reference implementation** - if something worked in V4 and doesn't in V5, it's a regression.

**V4 is the reference implementation** - if something worked in V4 and doesn't in V5, it's a regression.

---

## Media Index Integration Deployment

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
