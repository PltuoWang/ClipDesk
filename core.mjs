import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS = process.env.CLIPDESK_TOOLS || path.join(ROOT, 'tools');
export const binary = name => path.join(TOOLS, name + (process.platform === 'win32' ? '.exe' : ''));
export function normalizeUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error('请输入完整的 YouTube 或 Bilibili 视频链接。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('视频链接格式不正确。');
  const host = url.hostname.toLowerCase();
  if (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(host)) {
    const match = url.pathname.match(/^\/video\/(BV[a-zA-Z0-9]{10}|av[1-9][0-9]{0,19})\/?$/);
    if (!match) throw new Error('请粘贴 Bilibili 的 BV 或 av 视频链接。');
    const page = url.searchParams.get('p') || '1';
    if (!/^[1-9][0-9]{0,3}$/.test(page)) throw new Error('Bilibili 分 P 编号无效。');
    return `https://www.bilibili.com/video/${match[1]}?p=${page}`;
  }
  if (host === 'b23.tv' && /^\/[a-zA-Z0-9]{1,64}\/?$/.test(url.pathname)) return `https://b23.tv${url.pathname.replace(/\/$/, '')}`;
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error('支持 YouTube、Shorts、Bilibili 视频及 b23.tv 分享链接。');
  return `https://www.youtube.com/watch?v=${id}`;
}
export function normalizeProxy(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('代理地址格式不正确，例如 http://127.0.0.1:7890。'); }
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) || !url.hostname || url.hash || url.search || (url.pathname && url.pathname !== '/')) throw new Error('代理仅支持 HTTP、HTTPS 或 SOCKS5 地址。');
  return value;
}
export function outputSettings(body) {
  const videoBitrate = String(body.videoBitrate || 'original');
  const audioBitrate = String(body.audioBitrate || 'original');
  if (!['original', '1000', '2500', '5000', '8000', '12000', '20000', '40000'].includes(videoBitrate)) throw new Error('视频码率无效。');
  if (!['original', '96', '128', '192', '256', '320'].includes(audioBitrate)) throw new Error('音频码率无效。');
  return { videoBitrate, audioBitrate };
}
export function summarize(info) {
  if (info.is_live || info.live_status === 'is_live') throw new Error('暂不支持正在直播的视频，请在直播结束后重试。');
  const all = (info.formats || []).filter(f => !f.has_drm && /^[a-zA-Z0-9._-]+$/.test(f.format_id));
  const audio = all.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
  const choices = all.filter(f => f.vcodec && f.vcodec !== 'none' && f.height && ((f.acodec && f.acodec !== 'none') || audio.length))
    .map(f => ({ id: f.format_id, height: f.height, width: f.width, fps: f.fps || 0, bitrate: Math.round(f.vbr || f.tbr || 0), codec: String(f.vcodec).split('.')[0], ext: f.ext, size: f.filesize || f.filesize_approx || 0, hasAudio: !!f.acodec && f.acodec !== 'none' }))
    .sort((a, b) => b.height - a.height || b.fps - a.fps || b.bitrate - a.bitrate);
  if (!choices.length) throw new Error('未找到可以下载的有声视频格式。');
  const bestAudio = [...audio].sort((a, b) => (b.language_preference || 0) - (a.language_preference || 0) || Number(b.ext === 'm4a') - Number(a.ext === 'm4a') || (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
  const source = /bili/i.test(info.extractor_key || info.extractor || '') || /bilibili\.com/.test(info.webpage_url || '') ? 'bilibili' : 'youtube';
  return { source, title: info.title || '视频', channel: info.channel || info.uploader || '', duration: info.duration || 0, thumbnail: /^https:\/\/(i\.ytimg\.com|img\.youtube\.com|(?:[a-z0-9-]+\.)?hdslb\.com)\//.test(info.thumbnail || '') ? info.thumbnail : '', choices, audioId: bestAudio?.format_id, audioBitrate: Math.round(bestAudio?.abr || bestAudio?.tbr || 0) };
}
export function downloadSelector(choice, audioId) {
  if (choice.hasAudio) return choice.id;
  if (!audioId || !/^[a-zA-Z0-9._-]+$/.test(audioId)) throw new Error('此格式缺少可用音轨。');
  return `${choice.id}+${audioId}`;
}
export function transcodeArgs(input, output, settings, probe, { preserveSource = false } = {}) {
  const video = probe.streams?.find(s => s.codec_type === 'video');
  const audio = probe.streams?.find(s => s.codec_type === 'audio');
  if (!video || !audio) throw new Error('源文件缺少画面或声音，无法导出有声 MP4。');
  const args = ['-hide_banner', '-nostdin', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0'];
  if (preserveSource && settings.videoBitrate === 'original' && settings.audioBitrate === 'original') return [...args, '-c', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output];
  if (settings.videoBitrate === 'original' && video.codec_name === 'h264' && video.pix_fmt === 'yuv420p') args.push('-c:v', 'copy');
  else {
    args.push('-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2');
    if (settings.videoBitrate === 'original') args.push('-crf', '18');
    else args.push('-b:v', `${settings.videoBitrate}k`, '-maxrate', `${settings.videoBitrate}k`, '-bufsize', `${Number(settings.videoBitrate) * 2}k`);
  }
  if (settings.audioBitrate === 'original' && audio.codec_name === 'aac') args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', `${settings.audioBitrate === 'original' ? '192' : settings.audioBitrate}k`);
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output);
  return args;
}
export function runProcess(command, args, { timeout = 120000, signal, onLine, onSpawn, maxOutput = 20 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('任务已取消。'));
    const child = spawn(command, args, { windowsHide: true, shell: false, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn?.(child);
    let output = '', errors = '', pending = '', failure, outputBytes = 0;
    let killFallback;
    const kill = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
        killer.on('close', code => { if (code !== 0) child.kill(); });
        // Some managed Windows environments cannot invoke taskkill. Never leave
        // the direct child running while waiting for a failed process-tree kill.
        killFallback = setTimeout(() => { child.kill(); killer.kill(); }, 1000);
      } else child.kill('SIGKILL');
    };
    const abort = () => { failure = new Error('任务已取消。'); kill(); };
    const timer = setTimeout(() => { failure = new Error('操作超时，请检查网络或代理后重试。'); kill(); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutput) { failure = new Error('处理输出超过限制。'); kill(); return; }
      output += chunk;
      if (onLine) {
        pending += chunk;
        const lines = pending.split(/\r?\n/); pending = lines.pop(); lines.forEach(onLine);
      }
    });
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-10000); });
    const cleanup = () => { clearTimeout(timer); clearTimeout(killFallback); signal?.removeEventListener('abort', abort); };
    child.on('error', err => { cleanup(); reject(new Error(err.code === 'ENOENT' ? '缺少下载组件，请运行 setup.ps1。' : err.message)); });
    child.on('close', code => {
      cleanup(); if (pending && onLine) onLine(pending);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(errors.trim().slice(-1600) || `处理失败（${code}）。`));
      else resolve(output);
    });
  });
}
export function commonArgs(proxy = '', sourceUrl = '') {
  const directBilibili = !proxy && /^https:\/\/(?:www\.)?(?:bilibili\.com|b23\.tv)\//.test(sourceUrl);
  return ['--ignore-config', '--no-plugin-dirs', '--no-playlist', '--no-colors', '--socket-timeout', '20', '--retries', '3', '--js-runtimes', `node:${process.execPath}`, '--ffmpeg-location', TOOLS, ...(proxy || directBilibili ? ['--proxy', proxy] : [])];
}
export async function probeFile(file, signal) {
  return JSON.parse(await runProcess(binary('ffprobe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { signal }));
}
export function friendlyError(error, proxy = '') {
  let message = String(error.message || error).replace(/\x1b\[[0-9;]*m/g, '');
  if (proxy) message = message.split(proxy).join('[代理]');
  message = message.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[凭据]@');
  if (/Sign in to confirm|bot|LOGIN_REQUIRED/i.test(message)) return 'YouTube 要求登录或验证当前网络。请更换可用网络后重试；此版本不自动读取浏览器登录信息。';
  if (/bilibili.*(?:login|premium|member)|(?:login|premium|member).*bilibili|HTTP Error 412/i.test(message)) return 'Bilibili 限制了当前请求或清晰度，请使用可访问的视频和网络后重试。';
  if (/Private video|members-only|not available|Video unavailable|removed/i.test(message)) return '视频不可用、已被删除或需要观看权限。';
  if (/Unable to download|timed out|proxy|Connection|HTTP Error 403|certificate/i.test(message)) return '无法连接或获取视频，请检查网络、代理和下载组件是否为最新版。';
  return message.slice(-600);
}
