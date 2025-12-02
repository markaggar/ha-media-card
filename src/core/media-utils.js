// Shared utility functions for media detection
export const MediaUtils = {
  detectFileType(filePath) {
    if (!filePath) return null;
    
    let cleanPath = filePath;
    
    // Strip Immich pipe-delimited MIME type suffix (e.g., "file.jpg|image/jpeg" -> "file.jpg")
    if (cleanPath.includes('|')) {
      cleanPath = cleanPath.split('|')[0];
    }
    
    // Strip query parameters
    if (cleanPath.includes('?')) {
      cleanPath = cleanPath.split('?')[0];
    }
    
    const fileName = cleanPath.split('/').pop() || cleanPath;
    let cleanFileName = fileName;
    if (fileName.endsWith('_shared')) {
      cleanFileName = fileName.replace('_shared', '');
    }
    
    const extension = cleanFileName.split('.').pop()?.toLowerCase();
    
    if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extension)) {
      return 'video';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(extension)) {
      return 'image';
    }
    
    return null;
  }
};
