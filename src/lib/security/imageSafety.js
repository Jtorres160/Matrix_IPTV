/**
 * Validates external image URLs to prevent malicious protocol injections.
 * Only allows http:// and https:// URLs.
 * 
 * @param {string} url - The URL to validate
 * @param {string} fallbackUrl - The URL to return if validation fails (optional)
 * @returns {string|null} The safe URL or fallback/null
 */
export function getSafeImageUrl(url, fallbackUrl = null) {
  if (!url || typeof url !== 'string') {
    return fallbackUrl;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return url;
    }
    // Block javascript:, data:, file:, etc.
    return fallbackUrl;
  } catch (e) {
    // If URL parsing fails, it's malformed or a relative path which we don't expect for external logos
    return fallbackUrl;
  }
}
