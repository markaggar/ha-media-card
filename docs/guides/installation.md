# Installation

This guide walks you through installing the Media Card in your Home Assistant setup.

## Prerequisites

- **Home Assistant**: Version 2021.12 or newer
- **Modern Browser**: Chrome, Firefox, Safari, or Edge (recent versions)
- **Media Files**: Images or videos in your Home Assistant media directory

## Installation Methods

### Method 1: HACS (Recommended)

[HACS](https://hacs.xyz/) is the Home Assistant Community Store - the easiest way to install and manage custom cards.

#### Step 1: Add Custom Repository

1. Open HACS in Home Assistant
2. Click the three dots menu in the top right
3. Select **Custom repositories**
4. Add this URL: `https://github.com/markaggar/ha-media-card`
5. Select category: **Lovelace**
6. Click **Add**

#### Step 2: Install Media Card

1. In HACS, go to **Frontend**
2. Click **Explore & Download Repositories**
3. Search for "**Media Card**"
4. Click on the repository
5. Click **Download**
6. Select the latest version
7. Click **Download** again

#### Step 3: Restart Home Assistant

1. Go to **Settings** → **System** → **Restart**
2. Wait for Home Assistant to restart (usually 1-2 minutes)

#### Step 4: Clear Browser Cache

**Important**: You must clear your browser cache after installation.

- **Windows/Linux**: Press `Ctrl + Shift + R` or `Ctrl + F5`
- **macOS**: Press `Cmd + Shift + R`
- **Mobile**: Force close browser app and reopen

### Method 2: Manual Installation

If you prefer manual installation or don't use HACS:

#### Step 1: Download the File

1. Download `ha-media-card.js` from the [latest release](https://github.com/markaggar/ha-media-card/releases/latest)
2. Save the file to your computer

#### Step 2: Create WWW Directory

If you don't already have a `www` folder in your Home Assistant config directory:

1. Access your Home Assistant configuration directory
2. Create a folder named `www`
3. Inside `www`, create a folder named `cards`

Your path should be: `/config/www/cards/`

#### Step 3: Upload the File

1. Upload `ha-media-card.js` to `/config/www/cards/`
2. Final path should be: `/config/www/cards/ha-media-card.js`

#### Step 4: Add Resource to Lovelace

1. Go to **Settings** → **Dashboards**
2. Click the three dots menu in top right
3. Select **Resources**
4. Click **Add Resource**
5. Enter:
   - **URL**: `/local/cards/ha-media-card.js`
   - **Resource type**: JavaScript Module
6. Click **Create**

#### Step 5: Restart and Clear Cache

1. Restart Home Assistant
2. Hard refresh your browser (Ctrl+Shift+R)

## Verification

### Verify Installation

1. Open any dashboard in edit mode
2. Click **Add Card**
3. Search for "**Media Card**" or "**media-card**"
4. If you see it in the list, installation succeeded!

### Test Basic Functionality

Create a simple test card:

```yaml
type: custom:media-card
media_type: image
media_path: media-source://media_source/local/
folder_mode: latest
```

If you see media displayed (or a message about no files found), the card is working correctly.

## Updating

### Update via HACS

1. Open HACS
2. Go to **Frontend**
3. Find **Media Card**
4. Click **Update** if available
5. Restart Home Assistant
6. Hard refresh browser (Ctrl+Shift+R)

### Manual Update

1. Download the latest `ha-media-card.js` from releases
2. Replace the file in `/config/www/cards/`
3. Restart Home Assistant
4. Hard refresh browser (Ctrl+Shift+R)

## Common Installation Issues

### Card Not Appearing in Add Card Menu

**Solution:**
1. Verify file path is correct: `/config/www/cards/ha-media-card.js`
2. Check resource URL in Lovelace: `/local/cards/ha-media-card.js`
3. Restart Home Assistant
4. Clear browser cache with hard refresh (Ctrl+Shift+R)

### "Custom element doesn't exist" Error

**Solution:**
1. Clear browser cache completely (Ctrl+Shift+R)
2. Try a different browser to rule out cache issues
3. Check browser console (F12) for JavaScript errors
4. Verify the file was uploaded correctly (not corrupted)

### Card Shows But No Media Displays

**Solution:**
1. Verify media files exist in the specified path
2. Check file permissions (Home Assistant must have read access)
3. Test with a simple single-file path first
4. Check browser console (F12) for error messages

### HACS Shows "Repository not found"

**Solution:**
1. Verify repository URL: `https://github.com/markaggar/ha-media-card`
2. Ensure you selected **Lovelace** as category (not Integration)
3. Check your internet connection
4. Try again in a few minutes (GitHub may be temporarily unavailable)

## Optional: Media Index Integration

For enhanced metadata features (location data, EXIF info, favorites), you can install the companion Media Index integration:

1. Follow the [Media Index installation guide](https://github.com/markaggar/ha-media-index)
2. Configure media folders to scan
3. Wait for initial scan to complete
4. Use `media_index:` configuration in media card

**Note:** Media Index requires network shares or filesystem paths - it cannot work with `media-source://media_source/local/` paths.

## Next Steps

- **[Features Guide](features.md)** - Learn what the card can do
- **[Configuration Reference](configuration.md)** - Complete configuration options
- **[Examples](examples.md)** - Real-world configuration examples
- **[Troubleshooting](troubleshooting.md)** - Solutions to common issues

## Getting Help

If you encounter issues:

1. Check the [Troubleshooting Guide](troubleshooting.md)
2. Search existing [GitHub Issues](https://github.com/markaggar/ha-media-card/issues)
3. Enable `debug_mode: true` and check browser console (F12)
4. Create a new issue with:
   - Home Assistant version
   - Browser and version
   - Card configuration
   - Console error messages (if any)

---

**Installation successful?** Head to the [Configuration Guide](configuration.md) to customize your media card!
