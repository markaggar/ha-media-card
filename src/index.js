import './media-card.js';
import './media-card-editor.js';

// Register the custom card with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'media-card',
  name: 'Media Card',
  description: 'Display images and videos with GUI file browser',
  preview: false,
  documentationURL: 'https://github.com/your-repo/ha-media-card'
});

console.info(
  '%c  MEDIA-CARD  %c  Version 1.0.0  ',
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);
