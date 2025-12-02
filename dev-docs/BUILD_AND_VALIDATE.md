# Build and Validation Guide

## ✅ Refactoring Complete!

Your 11,775-line `ha-media-card.js` has been successfully refactored into a modular structure under `src/`.

## 📁 New Directory Structure

```
Media Item Card/
├── ha-media-card.js                    (ORIGINAL - backed up as ha-media-card-v5.4.0-backup.js)
├── ha-media-card-v5.4.0-backup.js     (11,775 lines - baseline for comparison)
├── package.json                        (NPM package manifest)
├── rollup.config.js                    (Build configuration)
├── BUILD_AND_VALIDATE.md              (This file)
└── src/                                (NEW - Modular source)
    ├── main.js                         (Entry point - 47 lines)
    ├── core/
    │   ├── media-utils.js              (File type detection - 38 lines)
    │   ├── media-provider.js           (Base class + static helpers - 307 lines)
    │   └── media-index-helper.js       (EXIF metadata fetching - 130 lines)
    ├── providers/
    │   ├── single-media-provider.js    (Single media display - 56 lines)
    │   ├── media-index-provider.js     (Random database queries - 697 lines)
    │   ├── sequential-media-index-provider.js (Sequential ordering - 350 lines)
    │   ├── subfolder-queue.js          (Hierarchical folder scanning - 1,228 lines)
    │   └── folder-provider.js          (Folder mode coordinator - 404 lines)
    ├── ui/
    │   └── media-card.js               (Main LitElement card - 5,092 lines)
    └── editor/
        └── media-card-editor.js        (Configuration editor - 3,470 lines)
```

**Total Source Lines**: ~11,819 (includes module import/export statements)

## 🚀 Build Instructions

### Step 1: Install Node.js

Node.js installation failed via winget. **Manually install**:

1. Download Node.js LTS from: https://nodejs.org/
2. Run installer (select "Add to PATH")
3. Open **new PowerShell window** (to refresh PATH)
4. Verify: `node --version` (should show v20.x or v22.x)

### Step 2: Install Dependencies

```powershell
cd "c:\Users\marka\Media Item Card"
npm install
```

This installs Rollup bundler (~10MB).

### Step 3: Build Bundle

```powershell
npm run build
```

This runs Rollup to bundle `src/**/*.js` → `ha-media-card.js`

**Expected Output**:
```
created ha-media-card.js in XXXms
```

### Step 4: Verify Line Count

```powershell
(Get-Content "ha-media-card.js" | Measure-Object -Line).Lines
```

**Target**: ~11,700-11,900 lines (may vary slightly due to import/export overhead)

**Baseline**: 11,775 lines (original backup)

### Step 5: Compare Files

```powershell
# Quick visual check - both should start with CDN import
Get-Content "ha-media-card-v5.4.0-backup.js" -TotalCount 10
Get-Content "ha-media-card.js" -TotalCount 10

# Both should end with editor registration
Get-Content "ha-media-card-v5.4.0-backup.js" -Tail 10
Get-Content "ha-media-card.js" -Tail 10
```

## ✅ Validation Checklist

After successful build:

- [ ] `ha-media-card.js` line count within 100 lines of 11,775
- [ ] File starts with `/** Media Card v5.4.0 */` header
- [ ] File contains CDN import: `import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';`
- [ ] File ends with editor registration and console.info
- [ ] No syntax errors: `node --check ha-media-card.js`
- [ ] Backup file unchanged: `ha-media-card-v5.4.0-backup.js` still 11,775 lines

## 🧪 Functional Testing

### Deploy to HADev

```powershell
# Deploy NEW modular build
Copy-Item "ha-media-card.js" "\\10.0.0.62\config\www\cards\ha-media-card.js" -Force
```

### Test in Browser

1. Navigate to HADev dashboard with media card
2. **Hard refresh**: Ctrl+Shift+R (clears cache)
3. Open DevTools Console (F12)
4. Look for: `MEDIA-CARD v5.4.0 Loaded` (green background)
5. Test key features:
   - Card loads and displays media
   - Navigation (prev/next) works
   - Action buttons (pause, refresh, fullscreen) function
   - Metadata overlay displays correctly
   - Editor opens without errors

### Rollback if Issues

```powershell
# Restore original
Copy-Item "ha-media-card-v5.4.0-backup.js" "ha-media-card.js" -Force
Copy-Item "ha-media-card.js" "\\10.0.0.62\config\www\cards\ha-media-card.js" -Force
```

## 🔍 Troubleshooting

### Build Fails

**Error**: `Cannot find module 'rollup'`
- **Fix**: Run `npm install` again
- **Check**: `node_modules/` folder exists

**Error**: `Cannot find module './src/main.js'`
- **Fix**: Ensure `src/` directory exists with all files
- **Check**: `Get-ChildItem -Recurse src/*.js`

### Line Count Mismatch

**Slight increase (+50 lines)**: Normal - caused by module import/export statements
**Large difference (±500 lines)**: Module extraction issue - check missing code

Compare sections:
```powershell
# Check if provider classes present
Select-String "class MediaIndexProvider" ha-media-card.js
Select-String "class FolderProvider" ha-media-card.js
Select-String "class MediaCard extends LitElement" ha-media-card.js
```

### Runtime Errors

**Console**: `Uncaught SyntaxError: Unexpected token`
- **Cause**: Rollup bundling error
- **Fix**: Check `rollup.config.js` - ensure `format: 'es'`

**Console**: `Failed to execute 'define' on 'CustomElementRegistry'`
- **Cause**: Duplicate registration
- **Fix**: Check `src/main.js` guards - `if (!customElements.get(...))`

## 📊 Module Dependencies (for reference)

```
main.js
├── Lit (CDN - external)
├── core/
│   ├── media-utils.js (no deps)
│   ├── media-provider.js (depends on: MediaUtils)
│   └── media-index-helper.js (depends on: MediaProvider)
├── providers/
│   ├── single-media-provider.js (depends on: MediaProvider, MediaUtils)
│   ├── subfolder-queue.js (depends on: MediaUtils)
│   ├── folder-provider.js (depends on: MediaProvider, SubfolderQueue)
│   ├── media-index-provider.js (depends on: MediaProvider, MediaIndexHelper)
│   └── sequential-media-index-provider.js (depends on: MediaProvider, MediaIndexHelper)
├── ui/
│   └── media-card.js (depends on: Lit, all providers, SubfolderQueue)
└── editor/
    └── media-card-editor.js (depends on: Lit)
```

## 🎯 Benefits of Modular Structure

### Development
- **Easier Navigation**: Find code in ~400-line files vs 11K monolith
- **Faster Edits**: Only modify relevant module
- **Better Testing**: Test providers in isolation
- **Clear Boundaries**: Provider interface enforced by exports

### Maintenance
- **Logical Organization**: Related code grouped
- **Reduced Conflicts**: Multiple devs can work on different modules
- **Cleaner Diffs**: Git shows which module changed, not "ha-media-card.js line 5403"

### Production
- **Identical Output**: Single-file bundle for deployment
- **No Runtime Change**: Still loads as one script
- **Cache Friendly**: Same filename for HA browser cache

## 🔄 Development Workflow

### Making Changes

1. **Edit Source**: Modify files under `src/` (NOT `ha-media-card.js`)
2. **Rebuild**: `npm run build`
3. **Deploy**: Copy to HADev
4. **Test**: Hard refresh browser

### Watch Mode (auto-rebuild on save)

```powershell
npm run watch
```

Rollup watches `src/` and rebuilds on any change.

### Adding New Providers

1. Create `src/providers/my-provider.js`
2. Export class extending `MediaProvider`
3. Import in `src/main.js`
4. Add to provider factory in `src/ui/media-card.js`

## 📝 Next Steps

1. **Install Node.js** (manual download)
2. **Run build** (`npm run build`)
3. **Verify line count** (~11,700-11,900 lines)
4. **Deploy to HADev** and test thoroughly
5. **If issues**: Restore backup and report discrepancies
6. **If success**: Update deployment docs to use `npm run build` workflow

## 🚨 Important Notes

- **NEVER edit `ha-media-card.js` directly** - it's generated by build
- **Source of truth**: `src/` directory
- **Backup preserved**: `ha-media-card-v5.4.0-backup.js` is your safety net
- **Build before deploy**: Always run `npm run build` after changes
- **Version bumps**: Update in `package.json` AND `src/main.js` header

---

**Status**: ✅ Refactoring Complete | ⏳ Build Pending (needs Node.js)
