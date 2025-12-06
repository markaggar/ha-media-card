import { MediaProvider } from '../core/media-provider.js';

/**
 * SingleMediaProvider - Provider for single image/video
 * Phase 2: Simplest provider to validate architecture
 */
export class SingleMediaProvider extends MediaProvider {
  constructor(config, hass) {
    super(config, hass);
    this.mediaPath = config.single_media?.path || config.media_path;
    this.currentItem = null;
  }

  async initialize() {
    // Validate media path
    if (!this.mediaPath) {
      console.warn('[SingleMediaProvider] No media path configured');
      return false;
    }
    
    // V5: Use shared metadata extraction helper (path-based + optional EXIF)
    const metadata = await MediaProvider.extractMetadataWithExif(
      this.mediaPath,
      this.config,
      this.hass
    );
    
    this.currentItem = {
      media_content_id: this.mediaPath,
      title: MediaProvider.extractFilename(this.mediaPath),
      media_content_type: MediaProvider.detectMediaType(this.mediaPath),
      metadata: metadata  // Path-based + optional EXIF metadata
    };
    return true;
  }

  async getNext() {
    // Single media mode - always return same item
    // Return the base item - timestamp will be added during URL resolution if needed
    return this.currentItem;
  }

  serialize() {
    return {
      mediaPath: this.mediaPath,
      currentItem: this.currentItem
    };
  }

  deserialize(data) {
    this.mediaPath = data.mediaPath;
    this.currentItem = data.currentItem;
  }
}
