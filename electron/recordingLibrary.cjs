// electron/recordingLibrary.cjs
// Pure helpers + loopback file server for the Recorded-Files Library.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');

// Strip a trailing `_<timestamp>.ts` (as written by RecordingManager, e.g.
// `_2026-07-17T10-30-00-000Z`) and the `.ts` extension for a display name.
function stripRecordingTimestamp(fileName) {
  const base = fileName.replace(/\.ts$/i, '');
  return base.replace(/_\d{4}-\d{2}-\d{2}T[\d-]+Z?$/i, '');
}

// List `*.ts` files in `dir`. Missing dir → []. Per-file stat failure → skip.
async function listRecordings(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  for (const fileName of entries) {
    if (!/\.ts$/i.test(fileName)) continue;
    try {
      const st = await fsp.stat(path.join(dir, fileName));
      if (!st.isFile()) continue;
      out.push({
        id: fileName,
        name: stripRecordingTimestamp(fileName),
        fileName,
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      });
    } catch (e) { /* skip unreadable file */ }
  }
  return out;
}

// Resolve `id` strictly inside `dir`; must end with `.ts`. Else null.
function resolveRecordingPath(dir, id) {
  if (typeof id !== 'string' || !/\.ts$/i.test(id)) return null;
  const resolvedDir = path.resolve(dir);
  const target = path.resolve(resolvedDir, id);
  const rel = path.relative(resolvedDir, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

// Loopback HTTP server that streams `*.ts` files out of `dir` with Range
// support. Bound to 127.0.0.1 on an ephemeral port.
function createRecordingServer(dir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let id;
      try {
        id = decodeURIComponent((req.url || '/').replace(/^\//, '').split('?')[0]);
      } catch (e) {
        res.writeHead(400); return res.end('Bad request');
      }
      const filePath = resolveRecordingPath(dir, id);
      if (!filePath) { res.writeHead(403); return res.end('Forbidden'); }

      fs.stat(filePath, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }

        const total = st.size;
        const range = req.headers.range;
        const baseHeaders = { 'Content-Type': 'video/mp2t', 'Accept-Ranges': 'bytes' };

        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
          if (isNaN(start) || isNaN(end) || start > end || end >= total) {
            res.writeHead(416, { 'Content-Range': `bytes */${total}` });
            return res.end();
          }
          res.writeHead(206, {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': end - start + 1,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
          fs.createReadStream(filePath).pipe(res);
        }
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ port, baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

module.exports = { stripRecordingTimestamp, listRecordings, resolveRecordingPath, createRecordingServer };
