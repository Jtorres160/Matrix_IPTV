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

      const progData = {
        title: prog.getElementsByTagName("title")[0]?.textContent || "No title",
        time: `${prog.getAttribute("start")} - ${prog.getAttribute("stop")}`,
        desc: prog.getElementsByTagName("desc")[0]?.textContent || "No description",
      };

      if (!programsByChannel.has(channelId)) {
        programsByChannel.set(channelId, []);
      }
      programsByChannel.get(channelId).push(progData);
    }
    
    return programsByChannel;
  } catch (err) {
    console.error("[Matrix_IPTV] EPG fetch error:", err);
    throw err;
  }
}
