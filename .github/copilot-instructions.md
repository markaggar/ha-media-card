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
**CRITICAL**: Always deploy changes after modifying ha-media-card.js

### Production Deployment Command
```powershell
Copy-Item "ha-media-card.js" "\\10.0.0.26\config\www\cards\media-card.js" -Force
```

### Deployment Process
1. Make changes to `ha-media-card.js`
2. Deploy using the command above
3. Hard refresh browser (Ctrl+F5) to clear cache
4. Check Home Assistant logs for any errors

### File Locations
- **Development**: `c:\Users\marka\Media Item Card\ha-media-card.js`
- **Production**: `\\10.0.0.26\config\www\cards\media-card.js`

## Next Steps
Since Node.js is not available in this environment, the project is ready to use as-is with the source files. Users can either:
1. Use the source files directly (src/ha-media-card.js, src/media-card-editor.js, src/index.js)
2. Install Node.js and run npm build process locally
3. Use the files as a starting point for further customization
