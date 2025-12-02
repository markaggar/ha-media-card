# Extract remaining modules from ha-media-card.js
# This script completes the modular refactoring

$sourceFile = "c:\Users\marka\Media Item Card\ha-media-card.js"
$content = Get-Content $sourceFile -Raw

Write-Host "📖 Reading source file (11,775 lines)..." -ForegroundColor Cyan

# Extract line ranges (calculated from grep results)
# SequentialMediaIndexProvider: lines 1646-1985 (340 lines)
# SubfolderQueue: lines 1986-3205 (1220 lines) 
# FolderProvider: lines 544-947 (404 lines) - already partially created but needs SubfolderQueue import
# MediaCard: lines 3206-8288 (5083 lines)
# MediaCardEditor: lines 8289-11751 (3463 lines)
# Registration: lines 11752-11775 (24 lines)

# Split by lines
$lines = $content -split "`r?`n"

Write-Host "✂️ Extracting SequentialMediaIndexProvider..." -ForegroundColor Yellow
$sequentialProvider = ($lines[1645..1985] -join "`n")

$sequentialContent = @"
import { MediaProvider } from '../core/media-provider.js';
import { MediaUtils } from '../core/media-utils.js';

/**
 * SEQUENTIAL MEDIA INDEX PROVIDER - Database-backed ordered queries
 * NEW V5 FEATURE: Sequential mode with cursor-based pagination
 * Uses media_index.get_ordered_files service for deterministic ordering
 */
$sequentialProvider
"@

Set-Content "src\providers\sequential-media-index-provider.js" $sequentialContent -Encoding UTF8
Write-Host "✅ Created sequential-media-index-provider.js" -ForegroundColor Green

Write-Host "`n✂️ Extracting SubfolderQueue..." -ForegroundColor Yellow
$subfolderQueue = ($lines[1985..3204] -join "`n")

$subfolderContent = @"
import { MediaProvider } from '../core/media-provider.js';
import { MediaIndexHelper } from '../core/media-index-helper.js';

/**
 * SUBFOLDER QUEUE - Essential V4 code copied for v5
 * Handles random folder scanning with hierarchical scan
 */
$subfolderQueue
"@

Set-Content "src\providers\subfolder-queue.js" $subfolderContent -Encoding UTF8
Write-Host "✅ Created subfolder-queue.js" -ForegroundColor Green

Write-Host "`n🔄 Note: FolderProvider needs manual completion to import SubfolderQueue and SequentialMediaIndexProvider" -ForegroundColor Cyan

Write-Host "`n✂️ Extracting MediaCard (this will take a moment - 5000+ lines)..." -ForegroundColor Yellow
$mediaCard = ($lines[3205..8287] -join "`n")

# NOTE: CDN import from unpkg.com is intentional for Home Assistant custom cards.
# HA custom cards are expected to import dependencies from CDN rather than bundle them.
# This follows the standard HA custom card development pattern.
$mediaCardContent = @"
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';
import { MediaProvider } from '../core/media-provider.js';
import { MediaUtils } from '../core/media-utils.js';

/**
 * MediaCard - Main card component
 * Phase 2: Now uses provider pattern to display media
 */
$mediaCard
"@

Set-Content "src\ui\media-card.js" $mediaCardContent -Encoding UTF8
Write-Host "✅ Created media-card.js (5,083 lines)" -ForegroundColor Green

Write-Host "`n✂️ Extracting MediaCardEditor (3400+ lines)..." -ForegroundColor Yellow
$editor = ($lines[8288..11750] -join "`n")

# NOTE: CDN import is standard practice for HA custom cards (see comment above)
$editorContent = @"
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

/**
 * MediaCardEditor - Card editor with full functionality
 * Will be adapted for v5 architecture in next phase
 */
$editor
"@

Set-Content "src\editor\media-card-editor.js" $editorContent -Encoding UTF8
Write-Host "✅ Created media-card-editor.js (3,463 lines)" -ForegroundColor Green

Write-Host "`n✅ Module extraction complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Create main.js entry point" -ForegroundColor White
Write-Host "2. Create rollup.config.js" -ForegroundColor White
Write-Host "3. Create package.json" -ForegroundColor White
Write-Host "4. Run npm install && npm run build" -ForegroundColor White
