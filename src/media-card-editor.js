import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('media-card-editor')
export class MediaCardEditor extends LitElement {
  @property({ attribute: false }) public hass;
  @property({ attribute: false }) public config;
  @state() private _config;

  static styles = css`
    .card-config {
      display: grid;
      grid-template-columns: 1fr;
      grid-gap: 16px;
      padding: 16px;
    }
    
    .config-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      grid-gap: 16px;
      align-items: center;
    }
    
    label {
      font-weight: 500;
      color: var(--primary-text-color);
    }
    
    input, select {
      padding: 8px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 4px;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font-family: inherit;
    }
    
    .media-browser {
      grid-column: 1 / -1;
      margin-top: 16px;
      padding: 16px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      background: var(--secondary-background-color);
    }
    
    .browser-item {
      display: flex;
      align-items: center;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      margin: 4px 0;
    }
    
    .browser-item:hover {
      background: var(--card-background-color);
    }
    
    .browser-item.selected {
      background: var(--primary-color);
      color: white;
    }
    
    .file-icon {
      margin-right: 8px;
      font-size: 18px;
    }
    
    .browse-button {
      padding: 8px 16px;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
    }
  `;

  setConfig(config) {
    this._config = { ...config };
  }

  render() {
    if (!this._config) {
      return html``;
    }

    return html`
      <div class="card-config">
        <div class="config-row">
          <label>Title</label>
          <input
            type="text"
            .value=${this._config.title || ''}
            @input=${this._titleChanged}
            placeholder="Optional title"
          />
        </div>
        
        <div class="config-row">
          <label>Media Type</label>
          <select @change=${this._mediaTypeChanged} .value=${this._config.media_type || 'image'}>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
        
        <div class="config-row">
          <label>Media Path</label>
          <input
            type="text"
            .value=${this._config.media_path || ''}
            @input=${this._mediaPathChanged}
            placeholder="/local/media/file.jpg"
          />
        </div>
        
        ${this._config.media_type === 'video' ? this._renderVideoOptions() : ''}
        
        <div class="media-browser">
          <h3>Browse Media Files</h3>
          <button class="browse-button" @click=${this._browseMedia}>
            Browse Media Folder
          </button>
          ${this._renderMediaFiles()}
        </div>
      </div>
    `;
  }

  _renderVideoOptions() {
    return html`
      <div class="config-row">
        <label>Autoplay</label>
        <input
          type="checkbox"
          .checked=${this._config.video_autoplay || false}
          @change=${this._autoplayChanged}
        />
      </div>
      
      <div class="config-row">
        <label>Loop</label>
        <input
          type="checkbox"
          .checked=${this._config.video_loop || false}
          @change=${this._loopChanged}
        />
      </div>
      
      <div class="config-row">
        <label>Muted</label>
        <input
          type="checkbox"
          .checked=${this._config.video_muted || false}
          @change=${this._mutedChanged}
        />
      </div>
    `;
  }

  _renderMediaFiles() {
    // Mock media files - in real implementation, fetch from HA media browser
    const mockFiles = [
      { name: 'images/sunset.jpg', type: 'image', path: '/local/images/sunset.jpg' },
      { name: 'videos/family.mp4', type: 'video', path: '/local/videos/family.mp4' },
      { name: 'images/vacation.jpg', type: 'image', path: '/local/images/vacation.jpg' },
      { name: 'videos/pets.mp4', type: 'video', path: '/local/videos/pets.mp4' },
      { name: 'images/nature.png', type: 'image', path: '/local/images/nature.png' }
    ];

    return mockFiles.map(file => html`
      <div 
        class="browser-item ${file.path === this._config.media_path ? 'selected' : ''}"
        @click=${() => this._selectMediaFile(file)}
      >
        <span class="file-icon">
          ${file.type === 'video' ? '🎬' : '🖼️'}
        </span>
        <span>${file.name}</span>
      </div>
    `);
  }

  _titleChanged(ev) {
    this._config = { ...this._config, title: ev.target.value };
    this._fireConfigChanged();
  }

  _mediaTypeChanged(ev) {
    this._config = { ...this._config, media_type: ev.target.value };
    this._fireConfigChanged();
  }

  _mediaPathChanged(ev) {
    this._config = { ...this._config, media_path: ev.target.value };
    this._fireConfigChanged();
  }

  _autoplayChanged(ev) {
    this._config = { ...this._config, video_autoplay: ev.target.checked };
    this._fireConfigChanged();
  }

  _loopChanged(ev) {
    this._config = { ...this._config, video_loop: ev.target.checked };
    this._fireConfigChanged();
  }

  _mutedChanged(ev) {
    this._config = { ...this._config, video_muted: ev.target.checked };
    this._fireConfigChanged();
  }

  _browseMedia() {
    // In a real implementation, this would open the HA media browser
    console.log('Browse media files using Home Assistant media browser');
  }

  _selectMediaFile(file) {
    this._config = {
      ...this._config,
      media_path: file.path,
      media_type: file.type
    };
    this._fireConfigChanged();
  }

  _fireConfigChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    }));
  }
}
