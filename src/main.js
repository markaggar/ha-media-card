// Register the custom elements (guard against re-registration)
if (!customElements.get('media-viewer-card')) {
  customElements.define('media-viewer-card', MediaCard);
}
if (!customElements.get('media-viewer-card-editor')) {
  customElements.define('media-viewer-card-editor', MediaCardEditor);
}
// Backward-compat alias so existing configs using type: custom:media-card keep working
if (!customElements.get('media-card')) {
  customElements.define('media-card', MediaCard);
}

// Register with Home Assistant
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'media-viewer-card')) {
  window.customCards.push({
    type: 'media-viewer-card',
    name: 'Media Viewer Card',
    description: 'Display images and videos from local media folders with slideshow, favorites, and metadata',
    preview: true,
    documentationURL: 'https://github.com/markaggar/ha-media-card'
  });
}

console.info(
  '%c  MEDIA-VIEWER-CARD  %c  v__VERSION__ Loaded  ',
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: green'
);
