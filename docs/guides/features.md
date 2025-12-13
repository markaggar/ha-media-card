# Features

The Media Card provides powerful capabilities for displaying images and videos in your Home Assistant dashboard. This guide covers all available features and what they enable you to do.

## Media Display Modes

### Folder Modes

Display content from folders dynamically with multiple viewing strategies:

**Random Mode**
- Randomly select files from your media collection
- Perfect for photo slideshows and diverse content display
- Control sample size with `random_count` parameter
- Explore large collections without repetition

**Latest Mode** 
- Always show the most recent file from a folder
- Ideal for security cameras, dashcam feeds, and live monitoring
- Automatically detects timestamps in filenames
- Updates when new content arrives

**Sequential Mode**
- Display files in order from newest to oldest
- Great for reviewing security footage or camera rolls chronologically
- Navigate through your media timeline with keyboard or touch controls

### Single File Display

Display specific images or videos with auto-refresh capabilities:
- Security camera snapshots that update on a schedule
- Live status displays (weather radar, traffic cams)
- Featured content that changes programmatically

## Rich Metadata Display

Show contextual information about your media:

**Available Metadata**
- **Folder Path**: See where content originates from
- **Filename**: Display clean, readable filenames
- **Date Taken**: Show photo capture date (when available)
- **Position**: Display current file number (e.g., "3 of 15")

**Positioning Control**
- Place metadata in any corner (top-left, top-right, bottom-left, bottom-right)
- Automatically adjusts to avoid UI elements like video controls
- Professional appearance with semi-transparent backgrounds

**Use Cases**
- Security feeds: Show timestamp and camera location
- Photo galleries: Display date and source folder
- Media libraries: Show position in collection for context

## Navigation Controls

Multiple ways to browse through your media collection:

### Touch/Mouse Navigation

**Precision Navigation Zones**
- Small clickable areas on left and right sides for Previous/Next
- Rectangular buttons (80px × 120px) for easy targeting
- Avoids conflicts with video controls and other UI elements
- Visual indicators on hover show available actions

**Intelligent Button Placement**
- Pause/Resume button in top-right corner
- Navigation zones aligned to middle of screen
- Center area reserved for tap actions and video controls

### Keyboard Navigation

**Arrow Key Control**
- ← / → : Previous / Next file
- ↑ / ↓ : Jump to first / last file
- Space: Next file
- Enter: Refresh current file  
- P: Pause/Resume auto-refresh

**Focus Indication**
- Subtle outline shows when card is keyboard-ready
- Click card first to enable keyboard control
- Works across all folder modes

### Visual Feedback

- **Navigation Indicators**: Overlay hints showing available navigation
- **File Position**: Current item number in collection
- **Loading States**: Visual feedback during transitions

## Smart Slideshow System

Intelligent auto-advance with context awareness:

### Slideshow Behaviors

**Smart Slideshow**
- Prioritizes new content as it arrives
- Interrupts current display when fresh media appears
- Perfect for security monitoring and live feeds
- Balances between showing new items and exploring existing content

**Cycle Mode**
- Round-robin through your media collection
- Consistent rotation without repeating until all items shown
- Ideal for photo galleries and diverse content

**Static Mode**
- Display media until manual navigation
- Auto-refresh updates current file in place
- Best for featured content or specific monitoring

### Video-Aware Advancement

- Automatically advances when videos finish playing
- Respects manual pause—won't advance if user paused playback
- Works with slideshow timer for seamless transitions
- Configurable per video (autoplay, loop, muted options)

## Hierarchical Folder Scanning

Handle large media collections efficiently:

### SubfolderQueue System

**Automatic Discovery**
- Recursively scans nested folder structures
- Progressively discovers content while you browse
- No upfront delay for large collections
- Background scanning doesn't block UI

**Statistical Fairness**
- Each subfolder represented proportionally in random selection
- `estimated_total_photos` ensures consistent probability calculations
- Early folders don't dominate selection during discovery
- True randomness across your entire collection

### Priority Weighting

**Folder Prioritization**
- Multiply selection probability for specific folders
- Example: Recent photos (Camera Roll) get 3× more visibility
- Favorites folders can have higher representation
- Pattern-based matching for flexible configuration

**Use Cases**
- Prioritize recent photos while still showing older memories
- Boost visibility of curated "Best Of" folders
- Balance between new content and archive exploration

## Video Playback Control

Full-featured video display with customization:

**Playback Options**
- **Autoplay**: Start videos automatically when displayed
- **Loop**: Continuously repeat video content
- **Muted**: Start playback without sound

**Control Visibility**
- Hide native video controls for clean display
- Show controls for user interaction when needed
- Automatically position around video control areas

**Completion Detection**
- Advance slideshow when video finishes
- Respects user pause actions
- Works with all slideshow behaviors

## Aspect Ratio Optimization

Smart scaling for different dashboard layouts:

### Available Modes

**Default Mode**
- Images scale to 100% card width
- Height adjusts automatically to maintain aspect ratio
- Best for standard card layouts

**Smart Scale** - *Conservative, metadata-friendly*
- Limits image height to 80% of viewport
- Leaves room for metadata overlays without covering the image
- Prevents scrolling on tall portrait images
- Centers images vertically for balanced composition
- **Best for**: Dashboards where you want to see metadata clearly without obstruction

**Viewport Fit** - *Aggressive, maximize image size*
- Scales image to fit entirely within viewport, maximizing size
- No cropping, entire image always visible
- Fills available space as much as possible (may reach screen edges)
- Metadata overlays will typically appear on top of the image
- **Best for**: Fullscreen panel displays where image size is priority

**Viewport Fill** - *Immersive, edge-to-edge*
- Scales image to fill entire viewport completely
- May crop edges to eliminate letterboxing/pillarboxing
- Creates immersive edge-to-edge display
- Centers crop point for balanced composition
- **Best for**: Kiosk mode, background/wallpaper displays, artistic presentations

**Quick Selection Guide**
- Want metadata visible without covering image? → `smart-scale`
- Want biggest possible image that fits completely? → `viewport-fit`  
- Want edge-to-edge immersive display? → `viewport-fill`
- Using standard card layout? → `default`

## Kiosk Mode Integration

Professional fullscreen display with exit controls:

**Seamless Integration**
- Works with [Kiosk Mode HACS integration](https://github.com/NemesisRE/kiosk-mode)
- Shows visual exit hints when kiosk is active
- Configurable exit gestures (tap, double-tap, hold, swipe)
- State-aware display using Home Assistant boolean entities

**Exit Gestures**
- **Tap**: Quick single tap exit (fast access)
- **Double Tap**: Prevents accidental exits (recommended)
- **Hold**: Tap and hold for 1 second (secure environments)
- **Swipe Down**: Mobile/tablet gesture

**Professional Display**
- Non-intrusive bottom-center hint placement
- Elegant fade effects
- Only shows when kiosk mode is enabled
- Configurable visibility

**Use Cases**
- Photo frame displays with occasional access
- Security monitor displays
- Public information dashboards
- Automated home control panels

## Interactive Actions

Make your media cards respond to user interaction:

**Action Types**
- **Tap Action**: Single tap behavior
- **Double Tap Action**: Double tap gesture
- **Hold Action**: Press and hold (0.5 seconds)

**Available Actions**
- Navigate to other dashboards
- Show entity more-info dialog
- Call Home Assistant services
- Toggle entities
- Perform automations

**Confirmation Dialogs**
- Add styled confirmation dialogs to any action
- Template support for context-aware messages
- Show media details (filename, date, location) in prompts
- Professional UI matching card theme

**Example Uses**
- Tap camera snapshot to open full camera view
- Hold to trigger camera snapshot service with confirmation
- Double-tap to navigate to security dashboard
- Confirm before deleting or sharing media with templates

## Media Index Integration

Enhanced metadata and organization with Media Index backend:

**Extended Metadata**
- **Location Data**: Show where photos were taken (city, country)
- **Date Taken**: EXIF date extraction from photos
- **Favorite Button**: Mark favorite photos for curation
- **Edit Button**: Quick access to media management
- **Delete Button**: Remove unwanted media

**Database-Backed Selection**
- Fast queries across large collections
- Filter by date, location, folder, tags
- Smart random selection from database
- No filesystem scanning delays

**Requirements**
- [Media Index custom integration](https://github.com/markaggar/ha-media-index) installed
- Configured sensor entity
- Network share or filesystem access (not local HA folders)

**Compatibility Note**
Media Index cannot be used with `media-source://media_source/local/` paths due to path format mismatch. Use folder-based scanning for local content, or Media Index with network shares.

## Debugging and Development

Tools for troubleshooting and development:

**Debug Mode**
- Enable detailed console logging
- `debug_mode`: General card debug logging
- `debug_queue_mode`: SubfolderQueue visual overlay with statistics
- `suppress_subfolder_logging`: Reduce subfolder console spam while keeping other logs

**Development Features**
- Localhost automatic debug enable
- Console logging conditionally compiled out in production
- Visual queue state inspector
- Probability calculation verification

---

**Next Steps:**
- [Configuration Reference](configuration.md) - Complete parameter documentation
- [Examples](examples.md) - Real-world configuration examples
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
