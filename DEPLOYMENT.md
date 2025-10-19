# Deployment Instructions

## Production Deployment
After making changes to `ha-media-card.js`, deploy to Home Assistant:

```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.26\config\www\cards\media-card.js" -Force
```

## Deployment Checklist
1. Make changes to `ha-media-card.js`
2. Test locally if needed
3. Copy to Home Assistant server: `\\10.0.0.26\config\www\cards\media-card.js`
4. Hard refresh browser (Ctrl+F5) to clear cache
5. Check Home Assistant logs for any errors

## File Locations
- **Development**: `c:\Users\marka\Media Item Card\ha-media-card.js`
- **Production**: `\\10.0.0.26\config\www\cards\media-card.js`

## Testing
- Use test files: `test-simple.html`, `test-optimized.html`, etc.
- Local server: `python -m http.server 8080`

## Important Notes
- Always deploy after making changes
- Clear browser cache after deployment
- Check HA logs for errors after deployment