export function calculateWatchScore(historyItem) {
  if (!historyItem) return 0;
  
  const now = Date.now();
  const lastWatchedAt = historyItem.lastWatchedAt || historyItem.timestamp || now;
  const daysSinceLastWatch = Math.max(0, (now - lastWatchedAt) / (1000 * 60 * 60 * 24));
  
  // Recentness score (0 to 50): peaks at 0 days, drops off over 30 days
  const recentnessScore = Math.max(0, 50 - (daysSinceLastWatch * (50 / 30)));
  
  // Frequency score (0 to 30): 1 point per session, caps at 30
  const sessions = historyItem.sessions || 1;
  const frequencyScore = Math.min(30, sessions);
  
  // Duration score (0 to 20): 1 point per hour, caps at 20 (20 hours total)
  const durationSeconds = historyItem.totalWatchSeconds || historyItem.watchDuration || 0;
  const durationScore = Math.min(20, durationSeconds / 3600);
  
  return recentnessScore + frequencyScore + durationScore;
}

export function rankContinueWatching(watchHistory, channels) {
  return [...watchHistory]
    .map(item => {
      // Handle backward compatibility
      const id = item.channelId || (typeof item === 'string' ? item : null);
      const channel = channels.find(c => c.id === id);
      return { 
        ...item, 
        channelId: id,
        channel,
        score: calculateWatchScore(item) 
      };
    })
    .filter(item => item.channel) // Only keep if channel exists in current playlist
    .sort((a, b) => b.score - a.score);
}

export function getRecommendedChannels(channels, watchHistory, favorites) {
  // Simple deterministic recommendation based on top categories watched
  const categoryScores = {};
  
  watchHistory.forEach(item => {
    const id = item.channelId || (typeof item === 'string' ? item : null);
    const channel = channels.find(c => c.id === id);
    if (channel) {
      // Import here or just infer based on channel group to avoid circular deps
      const group = (channel.groups?.[0] || 'other').toLowerCase();
      const score = calculateWatchScore(item);
      categoryScores[group] = (categoryScores[group] || 0) + score;
    }
  });
  
  const topCategories = Object.keys(categoryScores).sort((a, b) => categoryScores[b] - categoryScores[a]);
  
  // Recommend channels from top categories that are NOT in watch history or favorites
  const excludeIds = new Set([
    ...watchHistory.map(h => h.channelId || (typeof h === 'string' ? h : null)),
    ...favorites
  ]);
  
  let recommended = [];
  for (const category of topCategories) {
    if (recommended.length >= 15) break;
    const candidates = channels.filter(c => 
      (c.groups?.[0] || 'other').toLowerCase() === category && 
      !excludeIds.has(c.id)
    );
    recommended = [...recommended, ...candidates.slice(0, 5)];
  }
  
  // Deduplicate
  const uniqueRecommended = [];
  const seenIds = new Set();
  for (const c of recommended) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      uniqueRecommended.push(c);
    }
  }
  
  return uniqueRecommended;
}
