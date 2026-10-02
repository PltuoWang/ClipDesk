import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server.mjs';
const fixture = { title: '保存位置测试', duration: 1, formats: [{ format_id: '18', vcodec: 'avc1', acodec: 'aac', height: 360, ext: 'mp4' }] };
test('native default folder persists; each download requires a one-use save-dialog grant; removing a record preserves exported video', { timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clipdesk-destinations-'));
  const directory = path.join(root, 'chosen-folder'); await mkdir(directory);
  const destination = path.join(directory, '我的视频.mp4');
  const downloadRoot = path.join(root, 'tasks'); const preferencesFile = path.join(root, 'settings.json');
  let selected = null, directoryCancel = false, saveCalls = [], openCalls = [], app, second;
  const nativeHost = { chooseDirectory: async initial => directoryCancel ? null : directory, chooseSavePath: async initial => { saveCalls.push(initial); return selected; }, openFile: async file => openCalls.push(['open', file]), revealFile: async file => openCalls.push(['reveal', file]) };
  try {
    app = await createApp({ downloadRoot, preferencesFile, defaultSaveDirectory: root, nativeHost, healthOverride: { 'yt-dlp': true, ffmpeg: true, ffprobe: true }, metadataProvider: async () => fixture, downloader: async job => { const file = path.join(job.dir, 'source.mp4'); await writeFile(file, 'source'); return file; }, processor: async (_job, _source, output) => { await writeFile(output, 'verified-fixture-output'); return output; } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const request = (url, data, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-App-Token': app.token }, body: JSON.stringify(data) });
    const prefs = await (await request('/api/settings/default-folder', {})).json(); assert.equal(prefs.defaultSaveDirectory, directory);
    directoryCancel = true;
    assert.equal((await (await request('/api/settings/default-folder', {})).json()).cancelled, true);
    assert.equal((await fetch(base + '/api/settings').then(r => r.json())).defaultSaveDirectory, directory);
    const info = await (await request('/api/info', { url: 'https://youtu.be/jNQXAC9IVRw' })).json();
    const data = { infoId: info.id, formatId: '18' };
    assert.equal((await request('/api/jobs', { ...data, savePath: destination })).status, 400, 'Client cannot bypass the dialog with a raw path');
    const cancelled = await (await request('/api/export-target', { title: fixture.title })).json(); assert.equal(cancelled.cancelled, true);
    assert.equal((await fetch(base + '/api/jobs').then(r => r.json())).length, 0, 'Cancelling the native dialog must not create a job');
    assert.equal(path.dirname(saveCalls[0]), directory);
    selected = { path: destination, overwriteAllowed: false };
    const target = await (await request('/api/export-target', { title: fixture.title })).json();
    const created = await (await request('/api/jobs', { ...data, targetId: target.targetId })).json();
    assert.equal((await request('/api/jobs', { ...data, targetId: target.targetId })).status, 400, 'A previous selection cannot authorize another download');
    let result;
    for (let i = 0; i < 100; i++) { result = (await fetch(base + '/api/jobs').then(r => r.json())).find(j => j.id === created.id); if (['done', 'error'].includes(result.status)) break; await new Promise(resolve => setTimeout(resolve, 30)); }
    assert.equal(result.status, 'done', result.message); assert.equal(result.savePath, destination);
    assert.equal(await readFile(destination, 'utf8'), 'verified-fixture-output');
    assert.equal((await request(`/api/jobs/${created.id}/open`, {})).status, 200);
    assert.equal((await request(`/api/jobs/${created.id}/reveal`, {})).status, 200);
    assert.deepEqual(openCalls, [['open', destination], ['reveal', destination]]);
    await app.close(); app = undefined;
    second = await createApp({ downloadRoot, preferencesFile, defaultSaveDirectory: root, nativeHost });
    await new Promise(resolve => second.server.listen(0, '127.0.0.1', resolve));
    const secondBase = `http://127.0.0.1:${second.server.address().port}`;
    assert.equal((await fetch(secondBase + '/api/settings').then(r => r.json())).defaultSaveDirectory, directory);
    const restored = await fetch(secondBase + '/api/jobs').then(r => r.json()); assert.equal(restored[0].status, 'done'); assert.equal(restored[0].savePath, destination);
    assert.equal((await fetch(secondBase + '/api/jobs/' + created.id, { method: 'DELETE', headers: { 'X-App-Token': second.token } })).status, 200);
    assert.equal(await readFile(destination, 'utf8'), 'verified-fixture-output', 'Removing a record never deletes the user export');
  } finally { if (app) await app.close(); if (second) await second.close(); await rm(root, { recursive: true, force: true }); }
});
test('new-file selection does not overwrite a file created after the save dialog', { timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clipdesk-conflict-')); let app;
  const destination = path.join(root, 'protected.mp4');
  try {
    app = await createApp({ downloadRoot: path.join(root, 'tasks'), defaultSaveDirectory: root, nativeHost: { chooseSavePath: async () => ({ path: destination, overwriteAllowed: false }) }, healthOverride: { a: true }, metadataProvider: async () => fixture, downloader: async job => { const source = path.join(job.dir, 'source.mp4'); await writeFile(source, 'source'); return source; }, processor: async (_job, _source, output) => { await writeFile(output, 'new video'); return output; } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const post = async (url, data) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': app.token }, body: JSON.stringify(data) }).then(r => r.json());
    const info = await post('/api/info', { url: 'https://youtu.be/jNQXAC9IVRw' });
    const target = await post('/api/export-target', { title: 'protected' }); await writeFile(destination, 'existing protected contents');
    const job = await post('/api/jobs', { infoId: info.id, formatId: '18', targetId: target.targetId });
    let result;
    for (let i = 0; i < 100; i++) { result = (await fetch(base + '/api/jobs').then(r => r.json())).find(j => j.id === job.id); if (['done', 'error'].includes(result.status)) break; await new Promise(resolve => setTimeout(resolve, 30)); }
    assert.equal(result.status, 'error'); assert.match(result.message, /占用/); assert.equal(await readFile(destination, 'utf8'), 'existing protected contents');
  } finally { if (app) await app.close(); await rm(root, { recursive: true, force: true }); }
});
