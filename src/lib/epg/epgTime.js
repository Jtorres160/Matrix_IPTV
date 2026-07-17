/**
 * src/lib/epg/epgTime.js
 *
 * XMLTV time parsing and now/next program lookup.
 * XMLTV timestamps look like "20231007141500 +0000" (offset optional).
 */

const XMLTV_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/;

/** Parses an XMLTV timestamp to epoch millis, or null. */
export function parseXmltvDate(str) {
  if (!str) return null;
  const m = XMLTV_RE.exec(String(str).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, off] = m;
  let ts = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (off) {
    const sign = off[0] === '-' ? -1 : 1;
    const offMin = sign * (parseInt(off.slice(1, 3), 10) * 60 + parseInt(off.slice(3, 5), 10));
    ts -= offMin * 60 * 1000;
  }
  // No offset: XMLTV spec says local time; treating as UTC is the common
  // compromise most players make when the feed omits the offset.
  return ts;
}

/**
 * Returns { now, next } programs for a channel's program list at time `at`.
 * Programs need numeric `start`/`stop` fields (millis). Either may be null.
 */
export function getNowNext(programs, at = Date.now()) {
  if (!Array.isArray(programs) || programs.length === 0) return { now: null, next: null };

  let now = null;
  let next = null;
  for (const p of programs) {
    if (p.start == null || p.stop == null) continue;
    if (p.start <= at && at < p.stop) {
      now = p;
    } else if (p.start > at) {
      if (!next || p.start < next.start) next = p;
    }
  }
  return { now, next };
}

/** Formats epoch millis as a local "1:15 PM" style string. */
export function formatTime(ms) {
  if (ms == null) return '';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** 0..1 progress of `now` program at time `at`, or null. */
export function programProgress(program, at = Date.now()) {
  if (!program || program.start == null || program.stop == null) return null;
  const span = program.stop - program.start;
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (at - program.start) / span));
}
