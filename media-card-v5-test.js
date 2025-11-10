// Minimal test version to debug registration issues
import { LitElement, html, css } from 'https://unpkg.com/lit@3/index.js?module';

console.log('🧪 Testing media card v5 minimal version...');

class MediaCardV5Test extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false }
  };

  setConfig(config) {
    this.config = config;
    console.log('✅ setConfig called with:', config);
  }

  render() {
    return html`<div>Media Card v5 Test - Working!</div>`;
  }
}

// Register the test card
customElements.define('media-card-v5-test', MediaCardV5Test);

// Register with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'media-card-v5-test',
  name: 'Media Card v5 Test',
  description: 'Test version to debug registration'
});

console.log('🎯 Test card registered:', customElements.get('media-card-v5-test'));
console.log('📋 Custom cards:', window.customCards);