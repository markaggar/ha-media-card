import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;

const sourceFiles = [
  'src/core/media-utils.js',
  'src/core/media-provider.js',
  'src/core/media-index-helper.js',
  'src/providers/single-media-provider.js',
  'src/providers/folder-provider.js',
  'src/providers/subfolder-queue.js',
  'src/providers/media-index-provider.js',
  'src/providers/sequential-media-index-provider.js',
  'src/ui/media-card.js',
  'src/editor/media-card-editor.js',
  'src/main.js'
];

const litLoader = `// Async wrapper for dynamic Lit loading (supports offline mode)
(async () => {
  // Default CDN URL for Lit
  const LIT_CDN_URL = 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

  let LitElement, html, css;

  // Check if Lit was preloaded globally (for offline support)
  if (window.LitElement && window.html && window.css) {
    console.log('[Media Card] Using preloaded Lit from window');
    LitElement = window.LitElement;
    html = window.html;
    css = window.css;
  } else if (window.__LIT_PRELOAD_PROMISE__) {
    // Preload script is loading Lit - wait for it
    console.log('[Media Card] Waiting for Lit preload to complete...');
    try {
      await window.__LIT_PRELOAD_PROMISE__;
      LitElement = window.LitElement;
      html = window.html;
      css = window.css;
      console.log('[Media Card] Using preloaded Lit from window');
    } catch (e) {
      console.error('[Media Card] Lit preload failed:', e);
      console.error('[Media Card] For offline use, check your preload script. See docs/OFFLINE_MODE.md');
      return;
    }
  } else {
    // Load Lit dynamically from CDN
    try {
      const litModule = await import(LIT_CDN_URL);
      LitElement = litModule.LitElement;
      html = litModule.html;
      css = litModule.css;
      // Also set on window for consistency
      window.LitElement = LitElement;
      window.html = html;
      window.css = css;
      console.log('[Media Card] Loaded Lit from CDN');
    } catch (e) {
      console.error('[Media Card] Failed to load Lit:', e);
      console.error('[Media Card] For offline use, preload Lit before this card. See docs/OFFLINE_MODE.md');
      return; // Can't continue without Lit
    }
  }
`;

function transformSource(file) {
  return readFileSync(join(root, file), 'utf8')
    .replace(/^import\s+[^;]+;\r?\n/gm, '')
    .replace(/^export\s+class\s+/gm, 'class ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replaceAll('__VERSION__', version)
    .trimEnd();
}

const body = sourceFiles.map(transformSource).join('\n');
const bannerStart = '/** ';
const bundle = `${bannerStart}
 * Media Card v${version}
 */

${litLoader}${body}

})();
`;

writeFileSync(join(root, 'ha-media-card.js'), bundle);
console.log(`Built ha-media-card.js v${version} from ${sourceFiles.length} source files`);
