# Running Media Card Offline

For Home Assistant client devices on isolated networks without internet access.

## How It Works

Media Card checks for preloaded Lit globals (`window.LitElement`, `window.html`, `window.css`) before loading from CDN. If you preload Lit locally, Media Card uses it - no CDN access needed.

## The Solution

### Step 1: Download Lit (Bundled Single File)

Lit provides a **bundled single-file version** (~17KB minified) that contains everything:

**Download URL:** https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js

Save to your HA `config/www/` folder as `lit-core.min.js`

**PowerShell:**
```powershell
$url = "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js"
$output = "C:\path\to\ha\config\www\lit-core.min.js"
Invoke-WebRequest -Uri $url -OutFile $output
```

**Curl:**
```bash
curl -o config/www/lit-core.min.js "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js"
```

### Step 2: Create Preload Script

Create file `config/www/preload-lit.js`:

```javascript
// Set promise FIRST so Media Card knows to wait
window.__LIT_PRELOAD_PROMISE__ = (async () => {
  const m = await import('/local/lit-core.min.js');
  window.LitElement = m.LitElement;
  window.html = m.html;
  window.css = m.css;
  console.log('[Media Card] Lit preloaded from local file');
})();
```

**Why this pattern?** The promise is set synchronously before the async import starts. Media Card checks for this promise and waits for it to complete, avoiding race conditions.

### Step 3: Add Both to Lovelace Resources

Add to your dashboard (Settings → Dashboards → Resources):

URL: /local/preload-lit.js
Resource type: JavaScript module

or:

```yaml
resources:
  - url: /local/preload-lit.js
    type: module
```

### Step 4: Verify

1. Hard refresh browser: **Ctrl+Shift+R**
2. Open DevTools: **F12**
3. Check Console for:
   - `[Media Card] Lit preloaded from local file`
   - `[Media Card] Using preloaded Lit from window` (or `Waiting for Lit preload to complete...` then `Using preloaded Lit`)
   - `MEDIA-CARD v5.6.10 Loaded`

Done! All Media Card features work offline.

## Troubleshooting

**"Failed to load Lit from /local/lit-core.min.js"**
- Does `config/www/lit-core.min.js` exist?
- Try accessing `http://YOUR_HA_IP:8123/local/lit-core.min.js` in browser

**Card not showing**
- Did you hard refresh? (Ctrl+Shift+R)
- Is preload script listed BEFORE Media Card in resources?
- Check console (F12) for errors

**"Lit module missing required export"**
- Re-download the Lit file
- Verify file contains `export { LitElement, html, css }`

## File Locations

- Downloaded Lit: `config/www/lit-core.min.js` (~17 KB minified)
- Preload script: `config/www/preload-lit.js` (<1 KB)
- Media Card resource: wherever you configured it
