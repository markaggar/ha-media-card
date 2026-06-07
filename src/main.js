// Register the custom elements (guard against re-registration)
if (!customElements.get('media-viewer-card')) {
  customElements.define('media-viewer-card', MediaCard);
}
if (!customElements.get('media-viewer-card-editor')) {
  customElements.define('media-viewer-card-editor', MediaCardEditor);
}
// Backward-compat alias so existing configs using type: custom:media-card keep working.
// Must be a subclass — the registry rejects registering the same constructor twice.
class MediaCardAlias extends MediaCard {}
if (!customElements.get('media-card')) {
  customElements.define('media-card', MediaCardAlias);
}

// Register with Home Assistant
if (!Array.isArray(window.customCards)) {
  window.customCards = [];
}
if (!window.customCards.some(card => card?.type === 'media-viewer-card')) {
  window.customCards.push({
    type: 'media-viewer-card',
    name: 'Media Viewer Card',
    description: 'Display images and videos from local media folders with slideshow, favorites, and metadata',
    preview: true,
    documentationURL: 'https://github.com/markaggar/ha-media-card',
    getEntitySuggestion(hass, entityId) {
      // Only suggest for media_index sensor entities, identified by the scan_status attribute
      // which is unique to the Media Index integration sensor.
      if (entityId.split('.')[0] !== 'sensor') return null;
      const attrs = hass.states[entityId]?.attributes || {};
      if (attrs.scan_status === undefined) return null;

      // Resolve the folder path: prefer media_source_uri (already a media-source:// URI),
      // fall back to constructing one from the filesystem media_path.
      let folderPath = attrs.media_source_uri || null;
      if (!folderPath && attrs.media_path) {
        const p = attrs.media_path.startsWith('/') ? attrs.media_path : '/' + attrs.media_path;
        folderPath = `media-source://media_source${p}`;
      }
      if (!folderPath) return null;

      return [
        {
          label: 'Random slideshow',
          config: {
            type: 'custom:media-viewer-card',
            media_source_type: 'folder',
            folder: { path: folderPath, mode: 'random', recursive: true },
          },
        },
        {
          label: 'Sequential slideshow',
          config: {
            type: 'custom:media-viewer-card',
            media_source_type: 'folder',
            folder: { path: folderPath, mode: 'sequential', recursive: true },
          },
        },
      ];
    },
  });
}

console.info(
  '%c  MEDIA-VIEWER-CARD  %c  v__VERSION__ Loaded  ',
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: green'
);
