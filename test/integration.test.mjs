import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { binary, runProcess, probeFile, transcodeArgs, outputSettings } from '../core.mjs';
const fixtureInfo = { title: '测试画面与声音', channel: 'Test', duration: 2, formats: [{ format_id: 'v1', vcodec: 'avc1', acodec: 'none', height: 180, fps: 25, vbr: 1000, ext: 'mp4' }, { format_id: 'a1', vcodec: 'none', acodec: 'aac', ext: 'm4a', abr: 128 }] };
test('real FFmpeg exports MP4 with H.264 picture and audible AAC track; HTTP workflow saves and restores it', { timeout: 60000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'clipdesk-test-'));
  const source = path.join(temp, 'fixture.mkv');
  let app, restarted;
  try {
    await runProcess(binary('ffmpeg'), ['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libvpx-vp9', '-c:a', 'libopus', source]);
    const downloadRoot = path.join(temp, 'downloads');
    app = await createApp({ downloadRoot, metadataProvider: async () => fixtureInfo, downloader: async job => { const destination = path.join(job.dir, 'source.mkv'); await copyFile(source, destination); return destination; } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const request = (url, body, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-App-Token': app.token }, body: JSON.stringify(body) });
    assert.equal((await fetch(base + '/api/health').then(r => r.json())).ready, true);
    const page = await fetch(base).then(r => r.text()); assert.ok(page.includes(app.token)); assert.ok(!page.includes('__APP_TOKEN__'));
    assert.equal((await fetch(base + '/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/api/jobs', { headers: { Origin: 'https://malicious.example' } })).status, 403);
    assert.equal((await request('/api/info', { url: 'https://evil.test/video' })).status, 400);
    const info = await (await request('/api/info', { url: 'https://youtu.be/jNQXAC9IVRw' })).json();
    assert.equal(info.choices.length, 1);
    assert.equal((await request('/api/jobs', { infoId: info.id, formatId: 'v1', videoBitrate: '7;evil' })).status, 400);
    const response = await request('/api/jobs', { infoId: info.id, formatId: 'v1', videoBitrate: '1000', audioBitrate: '128' });
    assert.equal(response.status, 202); const job = await response.json();
    let completed;
    for (let i = 0; i < 150; i++) {
      const all = await fetch(base + '/api/jobs').then(r => r.json()); completed = all.find(j => j.id === job.id);
      if (['done', 'error', 'cancelled'].includes(completed.status)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(completed.status, 'done', completed.message);
    const output = path.join(downloadRoot, job.id, 'output.mp4');
    const result = await probeFile(output);
    assert.ok(result.format.format_name.includes('mp4'));
    assert.equal(result.streams.find(s => s.codec_type === 'video').codec_name, 'h264');
    assert.equal(result.streams.find(s => s.codec_type === 'audio').codec_name, 'aac');
    assert.ok(Number(result.format.duration) >= 1.9);
    const pcm = path.join(temp, 'audio.pcm');
    await runProcess(binary('ffmpeg'), ['-hide_banner', '-nostdin', '-y', '-i', output, '-vn', '-f', 's16le', pcm]);
    const bytes = await readFile(pcm); let peak = 0;
    for (let i = 0; i < bytes.length - 1; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
    assert.ok(peak > 100, 'Audio must contain sound, not just a silent track');
    const download = await fetch(base + completed.fileUrl);
    assert.equal(download.headers.get('Content-Type'), 'video/mp4'); assert.ok(download.headers.get('Content-Disposition').includes('filename*='));
    assert.equal((await download.arrayBuffer()).byteLength, (await stat(output)).size);
    // Wait until final record flush completes before simulating restart.
    for (let i = 0; i < 20; i++) { const saved = JSON.parse(await readFile(path.join(downloadRoot, job.id, 'job.json'))); if (saved.status === 'done') break; await new Promise(resolve => setTimeout(resolve, 50)); }
    await app.close(); app = undefined;
    restarted = await createApp({ downloadRoot }); await new Promise(resolve => restarted.server.listen(0, '127.0.0.1', resolve));
    const secondBase = `http://127.0.0.1:${restarted.server.address().port}`;
    const restored = await fetch(secondBase + '/api/jobs').then(r => r.json()); assert.equal(restored[0].status, 'done');
    assert.equal((await fetch(secondBase + '/api/jobs/' + job.id, { method: 'DELETE', headers: { 'X-App-Token': restarted.token } })).status, 200);
    assert.equal((await fetch(secondBase + '/api/jobs').then(r => r.json())).length, 0);
  } finally { if (app) await app.close(); if (restarted) await restarted.close(); await rm(temp, { recursive: true, force: true }); }
});
test('conversion rejects a silent video instead of reporting a successful audible MP4', () => {
  assert.throws(() => transcodeArgs('silent.mp4', 'out.mp4', outputSettings({}), { streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }] }), /缺少画面或声音/);
});
test('cancel closes an actual worker process promptly', { timeout: 10000 }, async () => {
  const controller = new AbortController();
  const operation = runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal, onSpawn: () => setTimeout(() => controller.abort(), 150) });
  await assert.rejects(operation, /取消/);
});
