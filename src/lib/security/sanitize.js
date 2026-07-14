/**
 * Basic text sanitization to protect against XSS when rendering external IPTV metadata.
 * Escapes common HTML entities to ensure text renders purely as text, not DOM nodes.
 */
export function sanitizeText(input) {
  if (typeof input !== 'string') {
    return input; // Pass through non-strings (e.g. null, undefined, numbers)
  }
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates and sanitizes a complete channel object.
 */
export function sanitizeChannel(channel) {
  if (!channel) return channel;
  
  return {
    ...channel,
    name: sanitizeText(channel.name) || 'Unknown Channel',
    group: sanitizeText(channel.group) || 'Uncategorized',
    // Ensure URL properties remain strings but aren't necessarily HTML-escaped here;
    // URL safety is handled via imageSafety for logos or standard protocols for streams.
  };
}
