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
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif'].includes(extension)) {
      return 'image';
    }
    
    return null;
  },

  parseTimeOfDay(value) {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return (hours * 60) + minutes;
  },

  getTimeOfDayMinutes(value) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const timeMatch = trimmed.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/);
      if (timeMatch) {
        return (Number(timeMatch[1]) * 60) + Number(timeMatch[2]);
      }
    }

    if (typeof value === 'number') {
      const date = new Date(value > 9999999999 ? value : value * 1000);
      return (date.getHours() * 60) + date.getMinutes();
    }

    if (value instanceof Date) {
      return (value.getHours() * 60) + value.getMinutes();
    }

    if (typeof value === 'string') {
      const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const parsed = new Date(normalized);
      if (!isNaN(parsed.getTime())) {
        return (parsed.getHours() * 60) + parsed.getMinutes();
      }
    }

    return null;
  },

  matchesTimeOfDayRange(value, timeStart, timeEnd) {
    if (!timeStart && !timeEnd) return true;

    const startMinutes = MediaUtils.parseTimeOfDay(timeStart);
    const endMinutes = MediaUtils.parseTimeOfDay(timeEnd);
    const currentMinutes = MediaUtils.getTimeOfDayMinutes(value);

    if (startMinutes === null && endMinutes === null) return true;
    if (currentMinutes === null) return false;
    if (startMinutes === null) return currentMinutes <= endMinutes;
    if (endMinutes === null) return currentMinutes >= startMinutes;
    if (startMinutes === endMinutes) return true;
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
};
