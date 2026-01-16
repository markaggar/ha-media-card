# Home Assistant Media Card Project

A feature-rich custom Lovelace card for displaying images and videos with metadata support, multiple media sources, and advanced slideshow controls.

## Project Overview
**Main File**: `ha-media-card.js` - Single-file Lit-Element web component (18K+ lines)

### Where to Make Changes

NEVER MAKE CHANGES TO HA-MEDIA-CARD.JS DIRECTLY! THIS IS LAW!

DO NOT UPDATE VERSION NUMBERS IN THE PACKAGE.JSON OR SOURCE FILES DIRECTLY! YOU MUST ASK FOR PERMISSION FIRST!

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
3. Deploy to test server (see `LOCAL_SETUP.md` for deployment commands)
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
- **MediaProvider** - Base class defining interface for all providers
- **SingleMediaProvider** - Single image/video with optional auto-refresh
- **FolderProvider** - Folder-based sources with hierarchical SubfolderQueue integration
- **MediaIndexProvider** - Database-backed random selection with queue system (100 items)
- **SequentialMediaIndexProvider** - Database-backed sequential/ordered playback with cursor pagination

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
- Do not update verisions unless asked to do so or you get permission
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


**Template Variables**: `{{filename}}`, `{{filename_ext}}`, `{{folder}}`, `{{folder_path}}`, `{{media_path}}`, `{{date}}`, `{{date_time}}`, `{{location}}`, `{{city}}`, `{{state}}`, `{{country}}`

## Deployment

**CRITICAL**: Always use hard refresh (Ctrl+Shift+R) after deployment to clear browser cache.

**See `LOCAL_SETUP.md` for actual deployment commands and server paths**

**Process**: Edit `src/` files → `npm run build:concat` → Deploy to test server → Hard refresh → Test → Deploy to production

## Git Workflow

**CRITICAL**: ALL development work on `dev` branch only. **NEVER push directly to `master`**.

- Work on `dev` for all development
- Optional feature branches for experimental work
- Merge to `master` only for releases via PR
- Branch naming: `feature/`, `fix/`, `docs/`, `chore/`

---

## Related Repositories

**ha-media-index** - Backend Python integration providing media scanning/indexing services. See `ha-media-index/.github/copilot-instructions.md` for development guidelines

---
