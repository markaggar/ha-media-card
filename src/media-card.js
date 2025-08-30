import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('media-card')
export class MediaCard extends LitElement {
  @property({ attribute: false }) public hass;
  @property({ attribute: false }) public config;
  @state() private _mediaUrl = '';
  @state() private _mediaType = 'image';
  @state() private _showEditor = false;

  static styles = css`
    :host {
      display: block;
    }
    
    .card {
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .media-container {
      position: relative;
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
    }
    
    img, video {
      width: 100%;
      height: auto;
      display: block;
    }
    
    video {
      max-height: 400px;
    }
    
    .title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--primary-text-color);
    }
    
    .editor-button {
      margin-top: 8px;
      padding: 8px 16px;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .media-browser {
      margin-top: 16px;
      padding: 16px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      background: var(--card-background-color);
    }
    
    .browser-item {
      display: flex;
      align-items: center;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
    }
    
    .browser-item:hover {
      background: var(--secondary-background-color);
    }
    
    .file-icon {
      margin-right: 8px;
      font-size: 18px;
    }
  `;

  setConfig(config) {
    this.config = config;
    this._mediaUrl = config.media_path || '';
    this._mediaType = config.media_type || 'image';
  }

  render() {
    if (!this.config) return html``;
    
    return html`
      <div class="card">
        ${this.config.title ? html`<div class="title">${this.config.title}</div>` : ''}
        
        <div class="media-container">
          ${this._renderMedia()}
        </div>
        
        <button class="editor-button" @click=${this._toggleEditor}>
          ${this._showEditor ? 'Hide Browser' : 'Browse Media'}
        </button>
        
        ${this._showEditor ? this._renderMediaBrowser() : ''}
      </div>
    `;
  }

  _renderMedia() {
    if (!this._mediaUrl) {
      return html`<div style="padding: 40px; text-align: center; color: var(--secondary-text-color);">
        Select media file to display
      </div>`;
    }

    if (this._mediaType === 'video') {
      return html`
        <video 
          controls
          preload="metadata"
          ?loop=${this.config.video_loop || false}
          ?autoplay=${this.config.video_autoplay || false}
          ?muted=${this.config.video_muted || false}
        >
          <source src="${this._mediaUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      `;
    }
    
    return html`<img src="${this._mediaUrl}" alt="${this.config.title || 'Media'}" />`;
  }

  _renderMediaBrowser() {
    return html`
      <div class="media-browser">
        <h3>Select Media File</h3>
        ${this._renderMediaFiles()}
      </div>
    `;
  }

  _renderMediaFiles() {
    // Mock media files for demonstration
    // In a real implementation, this would fetch from Home Assistant's media browser
    const mockFiles = [
      { name: 'sunset.jpg', type: 'image', path: '/local/sunset.jpg' },
      { name: 'family-video.mp4', type: 'video', path: '/local/family-video.mp4' },
      { name: 'vacation.jpg', type: 'image', path: '/local/vacation.jpg' },
      { name: 'pet-video.mp4', type: 'video', path: '/local/pet-video.mp4' }
    ];

    return mockFiles.map(file => html`
      <div 
        class="browser-item" 
        @click=${() => this._selectFile(file)}
      >
        <span class="file-icon">
          ${file.type === 'video' ? '🎬' : '🖼️'}
        </span>
        <span>${file.name}</span>
      </div>
    `);
  }

  _toggleEditor() {
    this._showEditor = !this._showEditor;
  }

  _selectFile(file) {
    this._mediaUrl = file.path;
    this._mediaType = file.type;
    this._showEditor = false;
    
    // Update config
    this.config = {
      ...this.config,
      media_path: file.path,
      media_type: file.type
    };
    
    // Dispatch config change event for editor
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this.config },
      bubbles: true,
      composed: true
    }));
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement('media-card-editor');
  }
}
