export function validatePlaylistUrl(url) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'That playlist link is not valid.' };
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return { isValid: false, error: 'That playlist link is not valid.' };
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { isValid: false, error: 'That playlist link is not valid.' };
    }
    return { isValid: true, url: trimmedUrl };
  } catch (err) {
    return { isValid: false, error: 'That playlist link is not valid.' };
  }
}
