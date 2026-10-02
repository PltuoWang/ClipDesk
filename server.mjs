import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rm, stat, copyFile, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ROOT, binary, normalizeUrl, normalizeProxy, outputSettings, summarize, downloadSelector, transcodeArgs, runProcess, commonArgs, probeFile, friendlyError } from './core.mjs';
const terminal = new Set(['done', 'error', 'cancelled']);
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
export async function createApp({ downloadRoot = path.join(ROOT, 'downloads'), metadataProvider, downloader, processor, healthOverride, nativeHost = null, capture = null, preferencesFile = path.join(downloadRoot, 'preferences.json'), defaultSaveDirectory = path.join(ROOT, 'downloads') } = {}) {
  await mkdir(downloadRoot, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const infos = new Map(), jobs = new Map(), exportTargets = new Map();
  const taskPromises = new Set();
  let preferences = { defaultSaveDirectory, lastSaveDirectory: '', language: 'zh' };
  try {
    const stored = JSON.parse(await readFile(preferencesFile, 'utf8'));
    if (typeof stored.defaultSaveDirectory === 'string' && path.isAbsolute(stored.defaultSaveDirectory)) preferences.defaultSaveDirectory = stored.defaultSaveDirectory;
    if (typeof stored.lastSaveDirectory === 'string' && path.isAbsolute(stored.lastSaveDirectory)) preferences.lastSaveDirectory = stored.lastSaveDirectory;
    if (['zh', 'en'].includes(stored.language)) preferences.language = stored.language;
  } catch { /* First launch uses the platform Downloads directory. */ }
  const savePreferences = async () => { await mkdir(path.dirname(preferencesFile), { recursive: true }); await writeFile(preferencesFile + '.tmp', JSON.stringify(preferences, null, 2)); await rename(preferencesFile + '.tmp', preferencesFile); };
  nativeHost?.setLanguage?.(preferences.language);
  let running = 0, analyzing = 0, closed = false;
  const health = () => healthOverride || Object.fromEntries(['yt-dlp', 'ffmpeg', 'ffprobe'].map(name => [name, existsSync(binary(name))]));
  const publicJob = job => ({ id: job.id, title: job.title, source: job.source || 'youtube', status: job.status, progress: job.progress, message: job.message, height: job.height, videoBitrate: job.settings.videoBitrate, audioBitrate: job.settings.audioBitrate, createdAt: job.createdAt, size: job.size || 0, savePath: job.exportPath || '', desktop: !!nativeHost, fileUrl: job.status === 'done' ? `/api/jobs/${job.id}/file` : null });
  // Restore only bounded records in UUID-named app directories, never arbitrary paths.
  for (const entry of (await readdir(downloadRoot, { withFileTypes: true })).slice(-200)) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    try {
      const record = JSON.parse(await readFile(path.join(downloadRoot, entry.name, 'job.json'), 'utf8'));
      if (record.id !== entry.name || !record.settings || typeof record.title !== 'string') continue;
      if (!terminal.has(record.status)) { record.status = 'error'; record.message = '上次运行中断，请重新下载。'; }
      const savedPath = record.exportPath || path.join(downloadRoot, entry.name, 'output.mp4');
      if (record.status === 'done' && !existsSync(savedPath)) { record.status = 'error'; record.message = '导出文件已被移动或删除。'; }
      jobs.set(record.id, { ...record, dir: path.join(downloadRoot, entry.name), controller: new AbortController() });
    } catch { /* Incomplete record does not affect other jobs. */ }
  }
  async function save(job) {
    const record = { ...publicJob(job), settings: job.settings, exportPath: job.exportPath || '' };
    await writeFile(path.join(job.dir, 'job.json'), JSON.stringify(record, null, 2));
  }
  async function doDownload(job) {
    job.status = 'downloading'; job.message = '正在下载视频与音轨';
    await save(job);
    if (job.source === 'channels') {
      job.message = '正在下载捕捉到的视频号视频';
      return capture.download(job.capturedFeed, path.join(job.dir, 'source-video.mp4'), job.controller.signal, progress => { job.progress = progress; });
    }
    let progressBase = 0, progressWeight = job.selector.includes('+') ? 60 : 74;
    const onLine = line => {
      if (!line.startsWith('progress:')) return;
      try {
        const progress = JSON.parse(line.slice(9));
        const total = Number(progress.total_bytes || progress.total_bytes_estimate || 0);
        const pct = total > 0 ? Number(progress.downloaded_bytes || 0) / total : 0;
        job.progress = Math.max(job.progress, Math.min(74, progressBase + Math.round(pct * progressWeight)));
        if (progress.speed) job.message = `正在下载 · ${(Number(progress.speed) / 1048576).toFixed(1)} MB/s`;
      } catch { /* Some fragment downloads have no byte estimate. */ }
    };
    if (downloader) return downloader(job, onLine);
    const formats = job.selector.split('+');
    const sources = [];
    // Download each stream directly. Merge in our own tracked FFmpeg process,
    // so cancellation also controls the audio/video merge on Windows.
    for (let index = 0; index < formats.length; index++) {
      progressBase = index ? 60 : 0; progressWeight = index ? 14 : (formats.length === 2 ? 60 : 74);
      const prefix = index ? 'source-audio' : 'source-video';
      await runProcess(binary('yt-dlp'), [...commonArgs(job.proxy, job.url), '--fixup', 'never', '--newline', '--progress', '--progress-delta', '0.5', '--progress-template', 'download:progress:%(progress)j', '-f', formats[index], '-o', path.join(job.dir, `${prefix}.%(ext)s`), '--', job.url], { timeout: 6 * 3600000, signal: job.controller.signal, onLine });
      const source = (await readdir(job.dir)).find(name => new RegExp(`^${prefix}\\.(mp4|mkv|webm|mov|flv|ts|m4v|m4a|ogg|opus)$`).test(name));
      if (!source) throw new Error('下载未生成完整的视频或音轨文件。');
      sources.push(path.join(job.dir, source));
    }
    if (sources.length === 1) return sources[0];
    job.message = '正在合并画面与音轨'; job.progress = 74;
    const merged = path.join(job.dir, 'source.mkv');
    await runProcess(binary('ffmpeg'), ['-hide_banner', '-nostdin', '-y', '-i', sources[0], '-i', sources[1], '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', merged], { signal: job.controller.signal, timeout: 30 * 60000 });
    return merged;
  }
  async function processOutput(job, input) {
    const output = path.join(job.dir, 'output.mp4');
    if (processor) return processor(job, input, output);
    const probe = await probeFile(input, job.controller.signal);
    const duration = Number(probe.format?.duration || job.duration);
    const preserveSource = job.source === 'channels' && job.settings.videoBitrate === 'original' && job.settings.audioBitrate === 'original';
    if (preserveSource) job.message = '正在保留原视频画质与音质';
    await runProcess(binary('ffmpeg'), transcodeArgs(input, output, job.settings, probe, { preserveSource }), {
      timeout: 12 * 3600000, signal: job.controller.signal,
      onLine: line => {
        if (line.startsWith('out_time_us=') && duration > 0) job.progress = Math.max(job.progress, Math.min(98, 75 + Math.round(Number(line.slice(12)) / 1000000 / duration * 23)));
      }
    });
    const result = await probeFile(output, job.controller.signal);
    if (preserveSource ? (!result.streams.some(s => s.codec_type === 'video' && s.codec_name === probe.streams.find(s => s.codec_type === 'video').codec_name) || !result.streams.some(s => s.codec_type === 'audio' && s.codec_name === probe.streams.find(s => s.codec_type === 'audio').codec_name)) : (!result.streams.some(s => s.codec_type === 'video' && s.codec_name === 'h264') || !result.streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac'))) throw new Error('导出文件的画面或音轨验证失败。');
    const videoStream = result.streams.find(s => s.codec_type === 'video'); job.height = videoStream?.height || job.height;
    return output;
  }
  async function execute(job) {
    try {
      const input = await doDownload(job);
      if (job.controller.signal.aborted) throw new Error('任务已取消。');
      job.status = 'processing'; job.progress = 75; job.message = '正在合并声音并导出 MP4';
      const output = await processOutput(job, input);
      if (job.controller.signal.aborted) throw new Error('任务已取消。');
      job.size = (await stat(output)).size;
      if (!job.size) throw new Error('导出文件为空。');
      if (job.exportPath) {
        job.message = '正在保存到所选位置'; job.progress = 99;
        if (job.overwriteAllowed) {
          const staging = path.join(path.dirname(job.exportPath), `.clipdesk-${job.id}.tmp`);
          try { await copyFile(output, staging, constants.COPYFILE_EXCL); await rename(staging, job.exportPath); }
          finally { await rm(staging, { force: true }); }
        } else {
          try { await copyFile(output, job.exportPath, constants.COPYFILE_EXCL); }
          catch (error) { if (error.code === 'EEXIST') throw new Error('所选文件名已被其他任务或程序占用，请选择新文件名后重新下载。'); throw error; }
        }
      }
      job.status = 'done'; job.progress = 100; job.message = '有声 MP4 已就绪';
    } catch (error) {
      job.status = job.controller.signal.aborted ? 'cancelled' : 'error';
      job.message = friendlyError(error, job.proxy);
    } finally {
      // Keep only the verified deliverable and record; clean partial streams too.
      for (const name of await readdir(job.dir)) {
        if (name === 'job.json' || (name === 'output.mp4' && job.status === 'done' && !job.exportPath)) continue;
        await rm(path.join(job.dir, name), { force: true });
      }
      job.proxy = ''; delete job.capturedFeed; await save(job);
    }
  }
  function pump() {
    if (closed) return;
    for (const job of jobs.values()) {
      if (running >= 2) break;
      if (job.status !== 'queued') continue;
      job.status = 'starting'; job.active = true; running++;
      const task = execute(job).catch(error => { job.status = 'error'; job.message = friendlyError(error); }).finally(() => { job.active = false; running--; taskPromises.delete(task); pump(); });
      taskPromises.add(task);
    }
  }
  async function body(req) {
    let size = 0, text = '';
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('请求过大。'); text += chunk; }
    try { return JSON.parse(text); } catch { throw new Error('请求格式不正确。'); }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const expectedOrigin = `http://${req.headers.host}`;
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return json(res, 403, { error: '仅允许本机访问。' });
      if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '拒绝跨站请求。' });
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
      const url = new URL(req.url, expectedOrigin);
      if (['POST', 'DELETE', 'PATCH'].includes(req.method) && req.headers['x-app-token'] !== token) return json(res, 403, { error: '请刷新页面后重试。' });
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { tools: health(), ready: Object.values(health()).every(Boolean) });
      if (req.method === 'GET' && url.pathname === '/api/settings') return json(res, 200, { ...preferences, desktop: !!nativeHost, version: '2.1.0', alwaysChooseSaveLocation: true });
      if (req.method === 'POST' && url.pathname === '/api/settings/language') {
        const data = await body(req); if (!['zh', 'en'].includes(data.language)) throw new Error('请选择中文或 English。');
        preferences.language = data.language; await savePreferences(); nativeHost?.setLanguage?.(data.language);
        return json(res, 200, { ...preferences });
      }
      if (req.method === 'GET' && url.pathname === '/api/capture') return json(res, 200, capture?.state() || { available: false, active: false, items: [], count: 0 });
      if (req.method === 'POST' && url.pathname === '/api/capture/start') {
        if (!capture || !nativeHost) throw new Error('电脑微信捕捉需要 ClipDesk Windows 桌面版。');
        if (!capture.state().active && !(await nativeHost.confirmCapture())) return json(res, 200, { cancelled: true });
        return json(res, 200, await capture.start());
      }
      if (req.method === 'POST' && url.pathname === '/api/capture/stop') return json(res, 200, capture ? await capture.stop() : { active: false });
      if (req.method === 'POST' && url.pathname === '/api/capture/clear') return json(res, 200, capture?.clear() || { items: [] });
      if (req.method === 'POST' && url.pathname === '/api/capture/copy-link') {
        if (!capture) throw new Error('请使用桌面版捕捉视频号。');
        const data = await body(req), feed = capture.select(data.id);
        if (nativeHost?.copyText) { await nativeHost.copyText(feed.url); return json(res, 200, { copied: true, encrypted: !!feed.decodeKey }); }
        return json(res, 200, { url: feed.url, encrypted: !!feed.decodeKey });
      }
      if (req.method === 'POST' && url.pathname === '/api/capture/info') {
        if (!capture) throw new Error('请使用桌面版捕捉视频号。');
        const data = await body(req), feed = capture.select(data.id), id = randomUUID();
        const info = { id, source: 'channels', title: feed.title, channel: feed.channel, duration: feed.duration, thumbnail: '', audioId: '', choices: [{ id: 'captured', height: feed.height || 0, fps: 0, codec: '源视频', bitrate: 0, hasAudio: true }], capturedFeed: feed, expires: Date.now() + 30 * 60000 };
        for (const [key,item] of infos) if(item.expires < Date.now()) infos.delete(key);
        if(infos.size >= 100) infos.delete(infos.keys().next().value);
        infos.set(id, info); const { capturedFeed, ...visible } = info; return json(res, 200, visible);
      }
      if (req.method === 'POST' && url.pathname === '/api/settings/default-folder') {
        if (!nativeHost) return json(res, 409, { error: '请在 ClipDesk 桌面版中选择文件夹。' });
        const directory = await nativeHost.chooseDirectory(preferences.defaultSaveDirectory);
        if (!directory) return json(res, 200, { cancelled: true });
        if (!path.isAbsolute(directory) || !(await stat(directory)).isDirectory()) throw new Error('请选择有效的文件夹。');
        preferences.defaultSaveDirectory = directory; await savePreferences();
        return json(res, 200, { ...preferences, cancelled: false });
      }
      if (req.method === 'POST' && url.pathname === '/api/export-target') {
        if (!nativeHost) return json(res, 409, { error: '请使用桌面版选择保存位置。' });
        const data = await body(req);
        const title = String(data.title || 'YouTube 视频').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || 'YouTube 视频';
        let initialDirectory = preferences.lastSaveDirectory || preferences.defaultSaveDirectory;
        try { if (!(await stat(initialDirectory)).isDirectory()) initialDirectory = preferences.defaultSaveDirectory; } catch { initialDirectory = preferences.defaultSaveDirectory; }
        const selected = await nativeHost.chooseSavePath(path.join(initialDirectory, title + '.mp4'));
        if (!selected) return json(res, 200, { cancelled: true });
        if (!path.isAbsolute(selected.path) || path.extname(selected.path).toLowerCase() !== '.mp4') throw new Error('请选择 MP4 文件名。');
        if ([...jobs.values()].some(job => !terminal.has(job.status) && job.exportPath?.toLowerCase() === selected.path.toLowerCase())) throw new Error('已有任务正在保存至这个文件，请选择另一个文件名。');
        for (const [key, target] of exportTargets) if (target.expires < Date.now()) exportTargets.delete(key);
        const id = randomUUID();
        preferences.lastSaveDirectory = path.dirname(selected.path); await savePreferences();
        exportTargets.set(id, { path: selected.path, overwriteAllowed: !!selected.overwriteAllowed, expires: Date.now() + 30 * 60000 });
        return json(res, 200, { targetId: id, path: selected.path, cancelled: false });
      }
      if (req.method === 'POST' && url.pathname === '/api/info') {
        if (!Object.values(health()).every(Boolean)) return json(res, 503, { error: '下载组件尚未安装，请运行 setup.ps1。' });
        if (analyzing >= 2) return json(res, 429, { error: '正在解析视频，请稍后重试。' });
        const data = await body(req); const videoUrl = normalizeUrl(data.url); const proxy = normalizeProxy(data.proxy);
        const controller = new AbortController();
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        analyzing++;
        let info;
        try {
          info = metadataProvider ? await metadataProvider(videoUrl, proxy) : JSON.parse(await runProcess(binary('yt-dlp'), [...commonArgs(proxy, videoUrl), '--dump-single-json', '--skip-download', '--', videoUrl], { timeout: 90000, signal: controller.signal }));
        } catch (err) { return json(res, 400, { error: friendlyError(err, proxy) }); }
        finally { analyzing--; }
        const summary = summarize(info); const id = randomUUID();
        if (/bilibili\.com|b23\.tv/.test(new URL(videoUrl).hostname)) summary.source = 'bilibili';
        for (const [key, item] of infos) if (item.expires < Date.now()) infos.delete(key);
        if (infos.size >= 100) infos.delete(infos.keys().next().value);
        infos.set(id, { ...summary, url: videoUrl, expires: Date.now() + 30 * 60000 });
        const { audioId, ...visible } = summary;
        return json(res, 200, { id, ...visible });
      }
      if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(publicJob));
      if (req.method === 'POST' && url.pathname === '/api/jobs') {
        const data = await body(req), info = infos.get(data.infoId);
        if (!info || info.expires < Date.now()) return json(res, 400, { error: '视频信息已过期，请重新解析。' });
        const choice = info.choices.find(c => c.id === data.formatId);
        if (!choice) return json(res, 400, { error: '请选择一个可用的视频格式。' });
        const settings = outputSettings(data), proxy = normalizeProxy(data.proxy);
        const target = exportTargets.get(data.targetId);
        if (nativeHost && (!target || target.expires < Date.now())) return json(res, 400, { error: '请先为本次下载选择保存位置。' });
        if (target && [...jobs.values()].some(job => !terminal.has(job.status) && job.exportPath?.toLowerCase() === target.path.toLowerCase())) throw new Error('此保存位置已有正在运行的任务。');
        if ([...jobs.values()].filter(j => !terminal.has(j.status)).length >= 12) return json(res, 429, { error: '任务队列已满，请等待已有任务完成。' });
        const id = randomUUID(), dir = path.join(downloadRoot, id);
        const job = { id, dir, url: info.url, source: info.source || 'youtube', capturedFeed: info.capturedFeed, title: info.title, duration: info.duration, height: choice.height, selector: info.source === 'channels' ? 'captured' : downloadSelector(choice, info.audioId), settings, proxy, exportPath: target?.path || '', overwriteAllowed: !!target?.overwriteAllowed, createdAt: Date.now(), status: 'queued', progress: 0, message: '等待下载', controller: new AbortController() };
        if (target) exportTargets.delete(data.targetId);
        await mkdir(dir); await save(job); jobs.set(id, job); json(res, 202, publicJob(job)); pump(); return;
      }
      const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})(?:\/(file|cancel|open|reveal))?$/);
      if (match) {
        const job = jobs.get(match[1]); if (!job) return json(res, 404, { error: '任务不存在。' });
        if (req.method === 'POST' && ['open', 'reveal'].includes(match[2])) {
          if (!nativeHost || job.status !== 'done') return json(res, 409, { error: '文件尚未就绪。' });
          const file = job.exportPath || path.join(job.dir, 'output.mp4'); await stat(file);
          if (match[2] === 'open') await nativeHost.openFile(file); else await nativeHost.revealFile(file);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && match[2] === 'cancel') {
          if (terminal.has(job.status)) return json(res, 409, { error: '任务已经结束。' });
          job.controller.abort(); job.message = '正在取消';
          if (job.status === 'queued') { job.status = 'cancelled'; job.message = '任务已取消。'; await save(job); }
          return json(res, 200, publicJob(job));
        }
        if (req.method === 'GET' && match[2] === 'file') {
          if (job.status !== 'done') return json(res, 409, { error: '文件尚未导出。' });
          const file = job.exportPath || path.join(job.dir, 'output.mp4'), details = await stat(file);
          const name = (job.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || 'YouTube') + '.mp4';
          res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': details.size, 'Content-Disposition': `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, '%27')}` });
          const stream = createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); return;
        }
        if (req.method === 'DELETE' && !match[2]) {
          if (!terminal.has(job.status) || job.active) return json(res, 409, { error: '请等待任务结束后移除记录。' });
          const safe = path.resolve(job.dir); if (path.dirname(safe) !== path.resolve(downloadRoot)) throw new Error('任务路径无效。');
          await rm(safe, { recursive: true, force: true }); jobs.delete(job.id); return json(res, 200, { ok: true });
        }
      }
      const staticFiles = { '/': 'index.html', '/app.js': 'app.js', '/i18n.mjs': 'i18n.mjs', '/style.css': 'style.css', '/desktop.css': 'desktop.css', '/favicon.svg': 'favicon.svg', '/haifeng-avatar.png': 'haifeng-avatar.png', '/app-icon.png': 'app-icon.png' };
      if (req.method === 'GET' && staticFiles[url.pathname]) {
        let content = await readFile(path.join(ROOT, 'public', staticFiles[url.pathname]));
        if (url.pathname === '/') content = Buffer.from(content.toString('utf8').replace('__APP_TOKEN__', token));
        res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://i.ytimg.com https://img.youtube.com https://*.hdslb.com; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(staticFiles[url.pathname])], 'Cache-Control': 'no-store' }); res.end(content); return;
      }
      return json(res, 404, { error: '页面不存在。' });
    } catch (error) { if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 400, { error: friendlyError(error) }); else res.destroy(); }
  });
  server.requestTimeout = 120000;
  return { server, token, close: async () => { closed = true; for (const job of jobs.values()) if (!terminal.has(job.status)) job.controller.abort(); await capture?.stop(); await new Promise(resolve => server.close(resolve)); await Promise.allSettled([...taskPromises]); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = Number(process.env.PORT || 8765);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535');
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已使用。可设置 PORT 环境变量后重新启动。` : error.message); process.exitCode = 1; });
  app.server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`YouTube 下载器已启动：${url}\n按 Ctrl+C 停止。文件保存在 downloads 文件夹。`);
    if (process.argv.includes('--open')) {
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' }); child.on('error', () => {});
    }
  });
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
