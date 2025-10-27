# Home Assistant Media Card Project

This is a custom Home Assistant Lovelace card that can display both images and MP4 videos from the media folder with a GUI editor for file selection.

## Project Structure
- `src/` - Source JavaScript files using Lit Element
- `dist/` - Built distribution files  
- `ha-media-card.js` - Standalone card implementation (no build required)
- `package.json` - Dependencies and build scripts
- `rollup.config.js` - Build configuration
- `README.md` - Comprehensive documentation

## Development Guidelines
- Follow Home Assistant custom card conventions
- Use Lit-Element for web components
- Implement GUI editor for media file selection
- Support both image and video playback
- Base implementation on picture-entity-card and gallery-card patterns

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
- ✅ Main media card component with image/video display
- ✅ GUI editor for media file selection  
- ✅ Video controls (autoplay, loop, muted options)
- ✅ Responsive design with HA theme integration
- ✅ Mock media browser functionality
- ✅ Comprehensive documentation
- ✅ Project structure for Home Assistant compatibility

## Deployment
**CRITICAL**: Always deploy changes after modifying code files

### Media Card Deployment

#### Development Server Deployment Command
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.62\config\www\cards\media-card.js" -Force
```

#### Production Deployment Command
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.26\config\www\cards\media-card.js" -Force
```

#### Deployment Process
1. Make changes to `ha-media-card.js`
2. Deploy to **HADev (10.0.0.62)** using the development command
3. Hard refresh browser (Ctrl+F5) to clear cache
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

# Deploy with verification
.\scripts\deploy-media-index.ps1 `
    -VerifyEntity "sensor.media_index_total_files" `
    -DumpErrorLogOnFail
```

#### Force Restart (when no file changes detected)
```powershell
cd C:\Users\marka\ha-media-index

.\scripts\deploy-media-index.ps1 `
    -VerifyEntity "sensor.media_index_total_files" `
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
# Set once in PowerShell profile
$env:HA_BASE_URL = "http://10.0.0.62:8123"
$env:HA_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhMzU4N2QwZDkwMTI0MWY5YmMzMTJlZGQzMTBhZTY0YiIsImlhdCI6MTc2MTM3MTYzNiwiZXhwIjoyMDc2NzMxNjM2fQ.KN_dJi3PxMHCZh4M_MODinGVqyJ4RCjFcd6XE5zHnok"
$env:HA_VERIFY_ENTITY = "sensor.media_index_total_files"
$env:WM_SAVE_ERROR_LOG_TO_TEMP = "1"
```

#### File Locations
- **Development**: `c:\Users\marka\ha-media-index\custom_components\media_index\`
- **Production**: `\\10.0.0.62\config\custom_components\media_index\`
- **Cache Database**: `\\10.0.0.62\config\.storage\media_index.db` (auto-created)

#### Testing Without Manual Intervention
```powershell
# Deploy and verify in one command
.\scripts\deploy-media-index.ps1 -VerifyEntity "sensor.media_index_total_files" -DumpErrorLogOnFail

# Check exit code
if ($LASTEXITCODE -eq 0) { 
    Write-Host "✅ Integration deployed and verified successfully" -ForegroundColor Green 
} else { 
    Write-Host "❌ Integration verification failed - check error log" -ForegroundColor Red 
}
```

See `MEDIA_INDEX_INTEGRATION_PLAN.md` for complete deployment documentation.

## One-off Command Runner (run-oneoff.ps1)

To reduce interactive approvals when I need to run a single helper command (log fetches, quick API queries, or short diagnostics), I will use a single, reusable PowerShell runner script that I will overwrite for each one-off operation.

- Script location:
```powershell
C:\Users\marka\Media Item Card\run-oneoff.ps1
```

How it works:
- The assistant will overwrite `run-oneoff.ps1` with the exact one-off commands to execute and then run that script.
- This centralizes one-off actions so you only need to review and approve the script once (or as you prefer).
- Do NOT put secrets in the script. Use environment variables (for example, `$env:HA_TOKEN`) instead.

Basic safety checklist:
- I will never run arbitrary long-running processes in this script. It's for quick checks and diagnostics only.
- The script will print clear markers (`run-oneoff: starting` / `run-oneoff: complete`) so logs are easy to audit.
- You can inspect the script before first use and then let me reuse it for future one-off commands.

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
