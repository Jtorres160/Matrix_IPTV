const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../electron/db.cjs');
const ipc = require('../electron/ipcHandlers.cjs');

async function main() {
  assert.ok(ipc.__testables, 'ipcHandlers must export __testables');
  const { syncM3UPlaylist } = ipc.__testables;

  const m3uText = fs.readFileSync(path.join(__dirname, 'fixtures', 'mixed.m3u'), 'utf8');
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
    res.end(m3uText);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/list.m3u`;

  db.initDatabase(':memory:');
  db.upsertPlaylist({ id: 'pl1', profile_id: 'prof1', name: 'Fixture', type: 'm3u', url });

  const result = await syncM3UPlaylist('pl1', url);
  server.close();

  assert.equal(result.success, true, `sync failed: ${result.error}`);
  assert.equal(result.channelCount, 2, 'only live entries land in channels');
  assert.equal(result.vodCount, 2);
  assert.equal(result.seriesCount, 2);
  assert.equal(result.episodeCount, 3);

  const raw = db.getDatabase();
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM channels WHERE playlist_id='pl1'`).get().c, 2);

  const vods = raw.prepare(`SELECT * FROM vod_streams WHERE playlist_id='pl1' ORDER BY name`).all();
  assert.deepEqual(vods.map((v) => v.name), ['Inception (2010)', 'Interstellar (2014)']);
  assert.ok(vods.every((v) => v.stream_url && v.stream_id.startsWith('m3u-')));

  const shows = raw.prepare(`SELECT * FROM series WHERE playlist_id='pl1' ORDER BY name`).all();
  assert.deepEqual(shows.map((s) => s.name), ['Breaking Bad', 'The Office']);

  const eps = raw.prepare(`SELECT * FROM series_episodes WHERE playlist_id='pl1' ORDER BY series_key, season, episode`).all();
  assert.equal(eps.length, 3);
  assert.ok(eps.every((e) => e.stream_url.startsWith('http://fixture/')));

  // Re-sync must replace, not duplicate (clear-before-insert on every table).
  const again = await new Promise((resolve) => {
    const s2 = http.createServer((_q, res) => { res.writeHead(200); res.end(m3uText); });
    s2.listen(0, '127.0.0.1', async () => {
      const r = await syncM3UPlaylist('pl1', `http://127.0.0.1:${s2.address().port}/list.m3u`);
      s2.close();
      resolve(r);
    });
  });
  assert.equal(again.success, true);
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM vod_streams WHERE playlist_id='pl1'`).get().c, 2);
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM series_episodes WHERE playlist_id='pl1'`).get().c, 3);

  console.log('OK: integration.sync-m3u');
}

main().catch((err) => { console.error(err); process.exit(1); });
