// Exported so the DB channel adapter (Phase 2) can reproduce the exact same
// `groups` array from a SQLite `group_title`, guaranteeing parity with the
// renderer parse path. This is the single source of truth for group mapping.
export function mapGroupToAllowed(groupString) {
  if (!groupString || !groupString.trim()) {
    return ['Other'];
  }
  const individualGroups = groupString.split(';');
  const mappedGroups = new Set();
  
  for (const group of individualGroups) {
    const cleanGroup = group.trim();
    if (cleanGroup) {
      mappedGroups.add(cleanGroup);
    }
  }
  
  const finalGroups = Array.from(mappedGroups);
  return finalGroups.length > 0 ? finalGroups : ['Other'];
}

export function parseM3UHeader(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  if (!header || !header.startsWith('#EXTM3U')) return null;

  const urlMatch = header.match(/x-tvg-url="([^"]+)"/i);
  return urlMatch ? urlMatch[1].trim() : null;
}

export function parseM3UChannels(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF')) {
      const meta = line;
      let url = '';
      
      // Find the next non-empty line that isn't a comment
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          url = nextLine;
          break;
        }
      }
      
      // Name = text after the last quoted attribute's closing comma; a plain
      // /,(.*)$/ splits inside attributes containing commas.
      const nameMatch = meta.match(/,([^"]*)$/);
      const name = nameMatch ? nameMatch[1].trim() : '';
      
      if (!name || !url) {
        continue; // Skip junk entries
      }

      const groupMatch = meta.match(/group-title="([^"]+)"/i);
      const group = groupMatch ? groupMatch[1].trim() : ''; 

      const tvgIdMatch = meta.match(/tvg-id="([^"]+)"/i);
      const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : null;

      const logoMatch = meta.match(/tvg-logo="([^"]+)"/i);
      const logo = logoMatch ? logoMatch[1].trim() : null;

      const tvgTypeMatch = meta.match(/tvg-type="([^"]+)"/i);
      const tvgType = tvgTypeMatch ? tvgTypeMatch[1].trim() : null;

      parsed.push({ name, url, group, tvgId, logo, tvgType });
    }
  }
  return parsed;
}

export function processPlaylistText(text) {
  const epgUrl = parseM3UHeader(text);
  const items = parseM3UChannels(text);
  
  const withGroups = items.map((it, idx) => {
    const groups = mapGroupToAllowed(it.group);
    return {
      id: `${it.name}-${idx}`,
      name: it.name,
      status: 'LIVE',
      url: it.url,
      groups: groups,
      tvgId: it.tvgId,
      logo: it.logo,
      tvgType: it.tvgType || null
    };
  });
  
  const allGroups = withGroups.flatMap(c => c.groups);
  const categories = Array.from(new Set(allGroups)).filter(Boolean).sort();
  
  return { channels: withGroups, categories, epgUrl };
}
