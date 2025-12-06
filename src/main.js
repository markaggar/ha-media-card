import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';
import { MediaUtils } from './core/media-utils.js';
import { MediaProvider } from './core/media-provider.js';
import { MediaIndexHelper } from './core/media-index-helper.js';
import { SingleMediaProvider } from './providers/single-media-provider.js';
import { MediaIndexProvider } from './providers/media-index-provider.js';
import { SequentialMediaIndexProvider } from './providers/sequential-media-index-provider.js';
import { SubfolderQueue } from './providers/subfolder-queue.js';
import { FolderProvider } from './providers/folder-provider.js';
import { MediaCard } from './ui/media-card.js';
import { MediaCardEditor } from './editor/media-card-editor.js';

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
