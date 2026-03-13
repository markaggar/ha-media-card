// Register the custom elements (guard against re-registration)
if (!customElements.get('media-card')) {
  customElements.define('media-card', MediaCard);
}
if (!customElements.get('media-card-editor')) {
  customElements.define('media-card-editor', MediaCardEditor);
}

// Register with Home Assistant
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'media-card')) {
  window.customCards.push({
    type: 'media-card',
    name: 'Media Card',
    description: 'Display images and videos from local media folders with slideshow, favorites, and metadata',
    preview: true,
    documentationURL: 'https://github.com/markaggar/ha-media-card'
  });
}

console.info(
  '%c  MEDIA-CARD  %c  v__VERSION__ Loaded  ',
  'color: lime; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: green'
);
