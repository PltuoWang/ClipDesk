import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'tools');
await mkdir(dir, { recursive: true });
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'YouTube-Local-Downloader' }, signal: AbortSignal.timeout(600000) });
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status} (${url})`);
  return r;
}
async function download(url, destination) {
  console.log(`Downloading ${url}`);
  const r = await get(url);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(destination));
}
async function checksum(file, expected) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (!expected || hash.digest('hex').toLowerCase() !== expected.toLowerCase()) throw new Error(`Checksum mismatch: ${file}`);
}
if (process.argv.includes('--update') || !existsSync(path.join(dir, 'yt-dlp.exe'))) {
  const release = await (await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')).json();
  const asset = release.assets.find(a => a.name === 'yt-dlp.exe');
  const sums = release.assets.find(a => a.name === 'SHA2-256SUMS');
  if (!asset || !sums) throw new Error('Release assets not found');
  const pending = path.join(dir, 'yt-dlp.pending');
  await download(asset.browser_download_url, pending);
  const listing = await (await get(sums.browser_download_url)).text();
  const expected = listing.split('\n').find(line => /\s\*?yt-dlp\.exe\s*$/.test(line))?.split(/\s+/)[0];
  await checksum(pending, expected);
  await rename(pending, path.join(dir, 'yt-dlp.exe'));
  await writeFile(path.join(dir, 'yt-dlp-version.txt'), release.tag_name);
  console.log(`yt-dlp ${release.tag_name} installed`);
}
if (!existsSync(path.join(dir, 'ffmpeg.exe')) || !existsSync(path.join(dir, 'ffprobe.exe'))) {
  const url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
  const zip = path.join(dir, 'ffmpeg.zip');
  await download(url, zip);
  await checksum(zip, (await (await get(url + '.sha256')).text()).trim().split(/\s+/)[0]);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'extract-tools.ps1')], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('FFmpeg extraction failed');
  await rm(zip);
}
console.log('Setup complete. Run start.cmd.');
