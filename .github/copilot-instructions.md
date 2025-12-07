# Home Assistant Media Card Project

A feature-rich custom Lovelace card for displaying images and videos with metadata support, multiple media sources, and advanced slideshow controls.

## Project Overview

**Current Version**: v5.x (Complete rebuild with unified provider architecture)
**Status**: Production ready - v4→v5 migration complete
**Main File**: `ha-media-card.js` - Single-file Lit-Element web component (10K+ lines)

### Where to Make Changes

NEVER MAKE CHANGES TO HA-MEDIA-CARD.JS DIRECTLY! THIS IS LAW!

- Edit source files only under `src/`:
  - `src/core/` for shared utilities and base classes
  - `src/providers/` for provider implementations and queues
  - `src/ui/media-card.js` for the main LitElement card
  - `src/editor/media-card-editor.js` for the visual editor
  - `src/main.js` for custom element registration

### Build Process
The card uses a custom concatenation build script that preserves class names and structure:
- `npm run build:concat` → concatenates modules in a deterministic order
- Strips internal `import` statements and converts `export class` → `class`
- Ensures a single CDN import for Lit is present at the top
- Preserves exact class names (unlike Rollup which renames to avoid collisions)

### Validation Steps
1. Build: `npm run build:concat`
2. Line count check (optional for regression-style diffs):
   - `(Get-Content "ha-media-card.js" | Measure-Object -Line).Lines`
3. Deploy to HADev:
   - `Copy-Item "ha-media-card.js" "\\10.0.0.62\config\www\cards\ha-media-card.js" -Force`
4. Hard refresh browser (Ctrl+Shift+R)
5. Verify console shows `MEDIA-CARD v5.4.0 Loaded` and test card behavior

### Commit & Push
- Work on `dev` branch only
- Commit modular source and build scripts
- The built `ha-media-card.js` may be committed when validating diffs; otherwise regenerate on demand

## Project Structure

- `src/*` - Modular source files within folders (ES modules)
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
1. **MediaProvider** (Base Class)
- Purpose: Abstract base class that defines the interface all providers must implement
- Key Methods:
  - initialize() - Setup and load initial data
  - getNext() - Get next media item
  - getPrevious() - Get previous media item
  - pause() / resume() - Control provider activity
2. **SingleMediaProvider**
- Extends: MediaProvider
- Purpose: Display a single image/video with optional auto-refresh
- Configuration: single_media.path or media_path (single file)
- Features:
  - Optional refresh interval
  - Metadata extraction from path and EXIF data
  - Supports single static media display
3. **FolderProvider**
- Extends: MediaProvider
- Purpose: Handle folder-based media sources with SubfolderQueue integration
- Features:
  - Wraps SubfolderQueue for hierarchical folder scanning
  - V4 compatibility layer (cardAdapter for legacy methods)
  - Supports both simple folder and complex hierarchical structures
  - Currently focused on random mode with subfolder queue
4. **MediaIndexProvider**
- Extends: MediaProvider
- Purpose: Database-backed random selection using Media Index integration
- Features:
  - Queue-based system (default 100 items)
  - Tracks excluded files (_Junk/_Edit folders)
  - Priority for new files with exhaustion detection
  - Optimized service calls to avoid wasteful queries
  - Works with media_index sensors
5. **SequentialMediaIndexProvider**
- Extends: MediaProvider
- Purpose: Sequential/ordered media playback using Media Index database
- Features:
  - Configurable ordering (by date_taken, date_modified, etc.)
  - Cursor-based pagination for large collections
  - Direction control (ascending/descending)
  - Recursive folder support
  - Tracks progress through collection with "reached end" flag

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

**CRITICAL: NEVER ASSUME, ALWAYS VERIFY**:
- **NEVER invent column names, service names, method names, or config fields**
- **ALWAYS read the actual code first** before referencing anything
- **ALWAYS check existing patterns** before writing new code
- Common mistakes to avoid:
  - Making up database column names (check CREATE TABLE statements)
  - Inventing service names (check const.py and services.yaml)
  - Assuming method signatures (grep for actual method definitions)
  - Guessing config structure (read actual schema files)

**Before Writing Any Code**:
1. **Read the actual implementation** you're modifying or referencing
2. **Search for similar patterns** in the codebase (use grep_search)
3. **Verify schema/structure** by reading relevant files (models, const files, schemas)
4. **Check existing tests** or usage examples to understand behavior
5. Only after verification, write code that matches actual patterns

**When Adding Features**:
1. Check if V4 had similar functionality in `dev-docs/ha-media-card-v4.js`
2. Reuse proven patterns from V4 where applicable
3. Follow Lit-Element conventions for web components
4. Maintain HA theme integration with CSS variables
5. Test on HADev before production deployment

**CRITICAL: Configuration Field Names**:
- **NEVER assume config structure** - always verify actual field names in schema or config
- Common mistake: Using made-up field names like `folder.navigation_mode` when actual is `folder.mode`
- Always check: `src/editor/media-card-editor.js` for actual schema definitions
- Always check: User's actual config YAML before writing detection logic
- Document actual config structure when working with new features

**Code Style**:
- Use Lit `html` and `css` tagged templates
- Prefix private methods with underscore `_methodName()`
- Use async/await for asynchronous operations
- Handle errors gracefully with user feedback
- Add comments for complex logic

## Modular Source + Build Workflow (v5.4+)

The card is now developed under `src/` as ES modules and bundled into a single distributable `ha-media-card.js` for deployment.

### Version Management
- Version is defined **once** in `package.json`
- Build script automatically injects version into:
  - Top banner: `/** Media Card v5.4.0 */`
  - Console log: `v5.4.0 Loaded`
- To release: Update `package.json` version → run `npm run build:concat`
- Never hardcode version numbers in source files



### Common Pitfalls & Fixes
- Duplicate CDN imports can cause `Identifier 'LitElement' has already been declared`
  - Build script automatically removes duplicate CDN imports from modules
- Registration order issues can cause `Cannot access 'MediaCard' before initialization`
  - Ensure `src/main.js` (registration) is concatenated last; classes defined first
- Sticky caching in HA requires a hard refresh after deployment
  - Always use Ctrl+Shift+R or Ctrl+F5
- **Never use Rollup** - it renames classes causing runtime errors

### Recommended Flow for Changes
1. Edit `src/` files
2. Run `npm run build:concat`
3. Check line count and perform targeted diffs when needed
4. Deploy to HADev and hard refresh
5. Test and iterate
6. Commit and push to `dev`


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
**CRITICAL**: ALL development work must be done on the `dev` branch

### Branch Protection Rules
- **NEVER push directly to `master` branch**
- Master branch is for stable releases only
- All development work happens on `dev` branch
- Create feature branches from `dev` for experimental work

### Development Workflow
1. **Work on dev branch** for ongoing development:
   ```powershell
   git checkout dev
   git pull origin dev
   # Make changes
   git add .
   git commit -m "feat: add new feature"
   git push origin dev
   ```

2. **Optional: Create feature branch** for experimental/isolated work:
   ```powershell
   git checkout -b feature/experimental-feature
   # Work on feature
   git commit -m "feat: experimental feature"
   git push -u origin feature/experimental-feature
   # Merge back to dev when ready
   git checkout dev
   git merge feature/experimental-feature
   ```

3. **Merge to master** only for releases:
   - Create Pull Request from `dev` to `master`
   - After review and testing, merge to master
   - Tag release on master branch

### Current Development Branch
- `dev` - Main development branch (all ongoing work)

### Branch Naming Convention (for experimental branches off dev)
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

### CRITICAL: Code Verification Before Writing

**Database Schema & Queries:**
- **NEVER invent column names** - always check CREATE TABLE statements first
- Find schema: `grep_search` for "CREATE TABLE IF NOT EXISTS" in cache_manager.py or models files
- Check existing queries: Search for similar SELECT statements before writing new ones
- Example mistake: Writing `m.extension, m.size, m.date_modified` when actual columns are `m.filename, m.file_size, m.modified_time`
- Reference pattern: Look at existing queries in the same file (get_random_files, get_ordered_files)

**Service Names & Methods:**
- **NEVER invent service names** - check const.py for SERVICE_* constants
- **NEVER assume method exists** - grep_search for method definition before calling it
- Check services.yaml for actual service definitions and parameters
- Example mistake: Calling `cache_manager.execute_query()` when no such method exists
- Reference pattern: Look at existing service handlers to see what methods they call

**Before Writing ANY Database Query:**
1. Find and read the CREATE TABLE statement
2. List all actual column names
3. Find similar existing queries (grep_search for "FROM same_table")
4. Copy column names from existing query, don't invent them
5. Verify JOIN syntax matches existing patterns

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
