/**
 * Standardized error definitions for the TV platform.
 */
export const TVErrorCodes = {
  PLAYER_ERROR: 'PLAYER_ERROR',
  STREAM_OFFLINE: 'STREAM_OFFLINE',
  EPG_ERROR: 'EPG_ERROR',
  IMAGE_ERROR: 'IMAGE_ERROR',
  DATA_INVALID: 'DATA_INVALID',
  NETWORK_ERROR: 'NETWORK_ERROR'
};

const UserFriendlyMessages = {
  [TVErrorCodes.PLAYER_ERROR]: 'Channel unavailable. Please try another stream.',
  [TVErrorCodes.STREAM_OFFLINE]: 'This stream appears to be offline.',
  [TVErrorCodes.EPG_ERROR]: 'Unable to load TV guide data for this channel.',
  [TVErrorCodes.IMAGE_ERROR]: 'Failed to load channel logo.',
  [TVErrorCodes.DATA_INVALID]: 'Invalid channel data received.',
  [TVErrorCodes.NETWORK_ERROR]: 'Network connection issue detected.'
};

/**
 * Gets a user-friendly message for a given error code.
 */
export function getErrorMessage(code) {
  return UserFriendlyMessages[code] || 'An unexpected error occurred.';
}

export class TVError extends Error {
  constructor(code, originalError = null) {
    super(getErrorMessage(code));
    this.name = 'TVError';
    this.code = code;
    this.originalError = originalError;
  }
}
