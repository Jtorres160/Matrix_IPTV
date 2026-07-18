import { parseXmltvDate } from '../lib/epg/epgTime.js';

export async function fetchAndParseEPG(url) {
  if (!url) {
    return new Map();
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const programsByChannel = new Map();
    const allPrograms = xmlDoc.getElementsByTagName("programme");

    for (const prog of allPrograms) {
      const channelId = prog.getAttribute("channel");
      if (!channelId) continue;

      const startRaw = prog.getAttribute("start");
      const stopRaw = prog.getAttribute("stop");
      const start = parseXmltvDate(startRaw);
      const stop = parseXmltvDate(stopRaw);

      const progData = {
        title: prog.getElementsByTagName("title")[0]?.textContent || "No title",
        desc: prog.getElementsByTagName("desc")[0]?.textContent || "No description",
        // Parsed epoch millis for now/next lookup
        start,
        stop,
        // Legacy display string kept for the EPG overlay
        time: `${startRaw} - ${stopRaw}`,
      };

      if (!programsByChannel.has(channelId)) {
        programsByChannel.set(channelId, []);
      }
      programsByChannel.get(channelId).push(progData);
    }

    // Sort each channel's programs chronologically so now/next scans are cheap
    for (const list of programsByChannel.values()) {
      list.sort((a, b) => (a.start || 0) - (b.start || 0));
    }

    return programsByChannel;
  } catch (err) {
    console.error("[Matrix_IPTV] EPG fetch error:", err);
    throw err;
  }
}
