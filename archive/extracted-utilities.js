/**
 * EXTRACTED UTILITIES - From v2.1b25 Backup
 * Date: 2025-10-16
 * 
 * These utility functions worked well and should be reused in the clean implementation.
 * They need to be moved to display/metadata logic, NOT scanning logic.
 */

// METADATA EXTRACTION - Move to display logic
function extractTimestampFromFilename(filename) {
  if (!filename) {
    console.log('⚠️ No timestamp found in filename:', filename);
    return null;
  }

  // Priority patterns (higher precision first)
  const patterns = [
    /(\d{13})/,                                               // Milliseconds timestamp (13 digits)
    /(\d{10})/,                                               // Seconds timestamp (10 digits) 
    /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2})[:\.](\d{2})[:\.](\d{2})/, // ISO format variations
    /(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_T\s]?(\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/, // Various date-time formats
    /(\d{4})[-_](\d{2})[-_](\d{2})/,                         // YYYY-MM-DD or YYYY_MM_DD
    /(\d{2})[-_](\d{2})[-_](\d{4})/,                         // MM-DD-YYYY or MM_DD_YYYY  
    /(\d{8})/,                                                // YYYYMMDD (date only, lowest priority)
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const value = match[1];
      let timestamp;
      
      console.log(`🔍 Found timestamp pattern in ${filename}: "${value}"`);
      
      try {
        if (value.length === 13 && /^\d{13}$/.test(value)) {
          // Milliseconds timestamp
          timestamp = parseInt(value);
        } else if (value.length === 10 && /^\d{10}$/.test(value)) {
          // Seconds timestamp
          timestamp = parseInt(value) * 1000;
        } else if (value.length === 8 && /^\d{8}$/.test(value)) {
          // YYYYMMDD format
          const year = value.substring(0, 4);
          const month = value.substring(4, 6) - 1; // Month is 0-indexed
          const day = value.substring(6, 8);
          timestamp = new Date(year, month, day).getTime();
        } else if (match.length >= 4) {
          // Full date-time match
          const year = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // Month is 0-indexed  
          const day = parseInt(match[3]);
          const hour = match[4] ? parseInt(match[4]) : 0;
          const minute = match[5] ? parseInt(match[5]) : 0;
          const second = match[6] ? parseInt(match[6]) : 0;
          timestamp = new Date(year, month, day, hour, minute, second).getTime();
        }
        
        if (timestamp && !isNaN(timestamp) && timestamp > 0) {
          console.log(`✅ Extracted timestamp from ${filename}:`, new Date(timestamp).toISOString());
          return timestamp;
        }
      } catch (error) {
        console.warn(`Failed to parse timestamp from ${filename}:`, error);
      }
    }
  }
  
  console.log('⚠️ No timestamp found in filename:', filename);
  return null;
}

// FOLDER SCANNING - Keep for background queue system
async function browseFolderContents(hass, folderPath) {
  if (!hass || !folderPath) return [];

  try {
    const result = await hass.callWS({
      type: 'media_source/browse_media',
      media_content_id: folderPath
    });

    if (result && result.children) {
      return result.children;
    }
    
    return [];
  } catch (error) {
    console.warn(`Error browsing folder contents for ${folderPath}:`, error);
    return [];
  }
}

// MEDIA TYPE DETECTION
function isMediaFile(item) {
  if (!item || !item.title) return false;

  const fileName = item.title.toLowerCase();
  const mediaExtensions = [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tga', 'ico', 'heic', 'heif',
    // Videos  
    'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ogv', 'ts', 'mts', 'm2ts'
  ];

  const extension = fileName.split('.').pop();
  return mediaExtensions.includes(extension);
}

function detectFileType(filename) {
  if (!filename) return 'unknown';
  
  const ext = filename.toLowerCase().split('.').pop();
  
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tga', 'ico', 'heic', 'heif'];
  const videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ogv', 'ts', 'mts', 'm2ts'];
  
  if (imageExtensions.includes(ext)) return 'image';
  if (videoExtensions.includes(ext)) return 'video';
  
  return 'unknown';
}

// RANDOM SELECTION WITH EXCLUSION - Good for preventing duplicates
function selectRandomWithExclusion(files, contextKey) {
  if (!files || files.length === 0) return null;
  
  // Simple exclusion - avoid last shown file
  if (files.length === 1) return files[0];
  
  // For now, just return random - can enhance with proper exclusion later
  return files[Math.floor(Math.random() * files.length)];
}

export {
  extractTimestampFromFilename,
  browseFolderContents,
  isMediaFile,
  detectFileType,
  selectRandomWithExclusion
};