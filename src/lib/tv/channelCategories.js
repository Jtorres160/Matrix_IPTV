export const TV_CATEGORIES = {
  SPORTS: 'sports',
  NEWS: 'news',
  KIDS: 'kids',
  MOVIES: 'movies',
  ENTERTAINMENT: 'entertainment',
  INTERNATIONAL: 'international',
  OTHER: 'other'
};

const CATEGORY_KEYWORDS = {
  [TV_CATEGORIES.SPORTS]: ['sport', 'espn', 'nfl', 'nba', 'mlb', 'nhl', 'wwe', 'ufc', 'tennis', 'golf', 'football', 'soccer'],
  [TV_CATEGORIES.NEWS]: ['news', 'cnn', 'fox', 'msnbc', 'bbc', 'cnbc', 'bloomberg', 'weather'],
  [TV_CATEGORIES.KIDS]: ['kid', 'disney', 'nickelodeon', 'cartoon', 'nick jr', 'family', 'toons'],
  [TV_CATEGORIES.MOVIES]: ['movie', 'hbo', 'cinemax', 'starz', 'showtime', 'epix', 'tcm', 'amc', 'cinema'],
  [TV_CATEGORIES.ENTERTAINMENT]: ['comedy', 'mtv', 'vh1', 'bravo', 'e!', 'tlc', 'hgtv', 'food', 'discovery', 'history', 'animal planet', 'nat geo', 'a&e', 'usa', 'tbs', 'tnt', 'fx', 'syfy'],
};

export function inferCategory(channel) {
  if (!channel) return TV_CATEGORIES.OTHER;
  const name = (channel.name || '').toLowerCase();
  const group = (channel.groups?.[0] || '').toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => name.includes(kw) || group.includes(kw))) {
      return category;
    }
  }
  
  return TV_CATEGORIES.OTHER;
}

export function normalizeChannelMetadata(channel) {
  return {
    channelId: channel.id,
    category: inferCategory(channel),
    country: 'US', // default for now unless parsed from group
    language: 'en',
    tags: [inferCategory(channel)]
  };
}

export function getChannelsByCategory(channels, category) {
  return channels.filter(c => inferCategory(c) === category);
}
