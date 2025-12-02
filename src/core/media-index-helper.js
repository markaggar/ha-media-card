import { MediaProvider } from './media-provider.js';

/**
 * MediaIndexHelper - Shared utility for media_index integration
 * V5: Provides unified metadata fetching for all providers
 */
export class MediaIndexHelper {
  /**
   * Fetch EXIF metadata from media_index backend for a single file
   * This is a NEW v5 feature - V4 only gets metadata via get_random_items
   */
  static async fetchFileMetadata(hass, config, filePath) {
    if (!hass || !MediaProvider.isMediaIndexActive(config)) return null;
    
    try {
      // Build WebSocket call to get_file_metadata service
      const wsCall = {
        type: 'call_service',
        domain: 'media_index',
        service: 'get_file_metadata',
        service_data: {},  // Will populate based on path type
        return_response: true
      };
      
      // V5.3 / Media Index v1.4+: Use media_source_uri when path is a URI, file_path otherwise
      if (filePath.startsWith('media-source://')) {
        wsCall.service_data.media_source_uri = filePath;
      } else {
        wsCall.service_data.file_path = filePath;
      }
      
      // If user specified a media_index entity, add target to route to correct instance
      if (config.media_index?.entity_id) {
        wsCall.target = {
          entity_id: config.media_index.entity_id
        };
      }
      
      const wsResponse = await hass.callWS(wsCall);
      
      // WebSocket response can be wrapped in different ways
      const response = wsResponse?.response || wsResponse?.service_response || wsResponse;
      
      // get_file_metadata returns EXIF data nested under response.exif
      // Unlike get_random_items which flattens fields to top level
      // Response structure: {id, path, filename, folder, exif: {date_taken, location_city, ...}}
      if (response) {
        const exif = response.exif || {};
        
        // Flatten EXIF data to match V4's get_random_items format
        return {
          // EXIF date/time (from nested exif object)
          date_taken: exif.date_taken,
          created_time: response.created_time, // Top level
          
          // GPS coordinates (from nested exif object)
          latitude: exif.latitude,
          longitude: exif.longitude,
          
          // Geocoded location (from nested exif object)
          location_city: exif.location_city,
          location_state: exif.location_state,
          location_country: exif.location_country,
          location_country_code: exif.location_country_code,
          location_name: exif.location_name,
          
          // Geocoding status - infer from presence of data
          has_coordinates: !!(exif.latitude && exif.longitude),
          is_geocoded: !!(exif.location_city || exif.location_state || exif.location_country),
          
          // Camera info (from nested exif object)
          camera_make: exif.camera_make,
          camera_model: exif.camera_model,
          
          // User flags (from nested exif object, convert 0/1 to boolean)
          is_favorited: exif.is_favorited === 1 || response.is_favorited === 1,
          marked_for_edit: false, // Not in get_file_metadata response
          
          // File info from top level
          filename: response.filename,
          folder: response.folder
        };
      }
      
      return null;
    } catch (error) {
      console.warn('MediaIndexHelper: Error fetching file metadata:', error);
      return null;
    }
  }
  
  /**
   * Parse metadata from get_random_items response (V4 pattern)
   * Transforms backend response into consistent metadata format
   */
  static parseRandomItemMetadata(item) {
    return {
      // File paths
      path: item.path,
      filename: item.filename || item.path?.split('/').pop(),
      folder: item.folder || item.path?.substring(0, item.path.lastIndexOf('/')),
      
      // EXIF date/time
      date_taken: item.date_taken,
      created_time: item.created_time,
      
      // GPS coordinates
      latitude: item.latitude,
      longitude: item.longitude,
      
      // Geocoded location
      location_city: item.location_city,
      location_state: item.location_state,
      location_country: item.location_country,
      location_country_code: item.location_country_code,
      location_name: item.location_name,
      
      // Geocoding status
      has_coordinates: item.has_coordinates || false,
      is_geocoded: item.is_geocoded || false,
      
      // Camera info
      camera_make: item.camera_make,
      camera_model: item.camera_model,
      
      // User flags
      is_favorited: item.is_favorited || false,
      marked_for_edit: item.marked_for_edit || false
    };
  }
}
