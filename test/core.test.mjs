import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, normalizeProxy, outputSettings, summarize, downloadSelector, transcodeArgs, friendlyError } from '../core.mjs';
const video = { format_id: '137', height: 1080, fps: 30, vcodec: 'avc1.640028', acodec: 'none', ext: 'mp4', vbr: 4500 };
const audio = { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', ext: 'm4a', abr: 128 };
test('canonical links strip playlist and reject unrelated URLs / malformed IDs', () => {
  const expected = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  for (const value of ['https://youtu.be/jNQXAC9IVRw?t=2', 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=ABC', 'https://youtube.com/shorts/jNQXAC9IVRw', 'https://m.youtube.com/watch?v=jNQXAC9IVRw']) assert.equal(normalizeUrl(value), expected);
  for (const value of ['https://youtube.com.evil.test/watch?v=jNQXAC9IVRw', 'file:///etc/passwd', 'https://youtube.com/playlist?list=ABC', 'https://www.youtube.com:999/watch?v=jNQXAC9IVRw', 'https://user:pw@youtube.com/watch?v=jNQXAC9IVRw', 'https://youtube.com/watch?v=bad']) assert.throws(() => normalizeUrl(value));
});
test('video-only streams need an audio companion; silent-only and DRM formats are rejected', () => {
  const info = summarize({ title: '<script>unsafe</script>', formats: [video, audio] });
  assert.equal(downloadSelector(info.choices[0], info.audioId), '137+140');
  assert.throws(() => summarize({ formats: [video] }));
  assert.throws(() => summarize({ formats: [{ ...video, has_drm: true }, audio] }));
  assert.throws(() => summarize({ is_live: true, formats: [video, audio] }));
  const muxed = summarize({ formats: [{ ...video, format_id: '18', acodec: 'mp4a.40.2' }] });
  assert.equal(downloadSelector(muxed.choices[0], undefined), '18');
});
test('bitrate controls affect encoder arguments and require both streams', () => {
  const probe = { streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio', codec_name: 'aac' }] };
  const passthrough = transcodeArgs('source.mkv', 'out.mp4', outputSettings({}), probe);
  assert.equal(passthrough[passthrough.indexOf('-c:v') + 1], 'copy');
  assert.equal(passthrough[passthrough.indexOf('-c:a') + 1], 'copy');
  const converted = transcodeArgs('source.mkv', 'out.mp4', outputSettings({ videoBitrate: '5000', audioBitrate: '128' }), probe);
  assert.equal(converted[converted.indexOf('-b:v') + 1], '5000k');
  assert.equal(converted[converted.indexOf('-b:a') + 1], '128k');
  assert.ok(converted.includes('0:a:0'));
  assert.throws(() => transcodeArgs('in', 'out', outputSettings({}), { streams: [probe.streams[0]] }));
  assert.throws(() => outputSettings({ videoBitrate: '5000; rm -rf /' }));
});
test('proxy values and diagnostic messages keep credentials out of UI', () => {
  assert.equal(normalizeProxy('socks5://127.0.0.1:1080'), 'socks5://127.0.0.1:1080');
  assert.throws(() => normalizeProxy('file:///etc/passwd'));
  const proxy = 'http://name:secret@127.0.0.1:7890';
  assert.ok(!friendlyError(new Error(`failed ${proxy}`), proxy).includes('secret'));
});
