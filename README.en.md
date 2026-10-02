# ClipDesk 2.1 · Video Download Workspace

[中文](README.md) | **English**

A Windows x64 desktop downloader for YouTube, Bilibili, and video capture from WeChat Channels on desktop. Choose resolution, video bitrate, and audio bitrate, then export an MP4 with sound. Includes a red application icon, native window, and Haifeng's supplied avatar, with the credit `vibe coding by Haifeng.`.

## Download the Windows EXE

Download the latest EXE from [Releases](https://github.com/PltuoWang/ClipDesk/releases). It runs directly without installing dependencies. Executables and runtime components are distributed through Releases rather than stored in Git history.

## Launch

Double-click `ClipDesk-2.1.0.exe`. No separate Node.js, FFmpeg, or yt-dlp installation is needed. The first launch extracts the bundled runtime; subsequent launches reuse it.

The application is unsigned, so Windows may show an unverified publisher message.

## Save locations

- Open **Settings → Download & save** to change the default folder. The initial default is the Windows Downloads folder, including a folder relocated through Windows settings.
- **Every download opens the Windows save dialog.** The filename comes from the resolved video title. You can change the folder and filename. The first dialog uses the default folder; later dialogs remember the last confirmed folder across restarts. Canceling does not create a task or change the remembered folder.
- Completed download records show the full path and provide actions to open the video or its folder.
- Removing a history entry does not delete a video saved by the desktop application.

## YouTube / Bilibili

1. Paste a YouTube, Shorts, or Bilibili link, including BV / av / b23.tv links, and analyze the video.
2. Select a resolution and format actually available from the source, plus video and audio target bitrates.
3. Choose a save location and confirm the destination to start downloading.

Video and separate audio streams are merged automatically. Exports target H.264 / AAC MP4 for compatibility. A task succeeds only after both video and audio streams are verified. Compatible source codecs can be preserved; other codecs are converted. Sources without audio report an error rather than generating a silent track.

YouTube requires a network that can reach its service. If needed, enter an existing HTTP / SOCKS5 proxy in network settings. Bilibili uses a direct connection by default, or the proxy entered in settings. For multipart Bilibili videos, only the part specified by `p` is downloaded; the first part is selected when `p` is absent. Available quality depends on the formats returned by the platform. Authentication, private videos, and DRM restrictions may prevent downloading.

Video targets: prefer original quality, or 1 / 2.5 / 5 / 8 / 12 / 20 / 40 Mbps. Audio targets: prefer original quality, or 96 / 128 / 192 / 256 / 320 kbps. A higher target bitrate cannot add detail absent from the source. Actual average bitrate varies with the content.

## Desktop WeChat Channels capture

1. Open **Channels capture** and start capture.
2. Read and confirm the capture explanation. ClipDesk installs a local certificate for the current Windows user and temporarily changes the system proxy.
3. **Close and reopen the Channels playback window in desktop WeChat**, then play the target video. Cached windows may not generate new requests.
4. The capture list uses the video description as its title and shows any available author, duration, and source quality. Replaying a video updates the existing entry.
5. Open export settings. They default to the captured source video and audio quality without re-encoding, even if you previously selected lower bitrates for another website. You can change the bitrates manually, then confirm the save location. The resolved title becomes the suggested filename, with invalid filename characters replaced.
6. Stop capture when finished. ClipDesk restores the previous system proxy and removes its certificate. Normal exit also restores settings; a separate watchdog handles unexpected exits, and startup checks for leftover configuration.

Capture parses Channels pages and playback data while forwarding other HTTPS connections directly. It does not record chats, login cookies, or complete network traffic. Media addresses and decoding parameters stay in process memory and are excluded from download history. The copy-link action copies the original media address, which may expire or contain encrypted media. Other tools may not be able to play encrypted addresses directly; ClipDesk handles decoding during download. Live streams and content with restricted viewing permissions are unsupported.

WeChat versions, caching, and proxy policies may affect capture. Reopen the playback window if no entries appear. Stop capture if certificate errors or network problems occur. Capture temporarily replaces the system proxy and restores it afterward; if another application changes the proxy during capture, recovery preserves that application's new configuration.

Default exports remux the original video and audio into MP4 without changing their encoding or media content. HEVC sources retain HEVC and need a compatible player. Choosing explicit bitrates converts to H.264 / AAC. If a source codec cannot be remuxed into MP4, the application reports an error and requires a manual transcoding choice rather than silently lowering quality.

## Language and avatar

Select **中文 / English** at the top right or in Settings. Switching takes effect immediately and is remembered. Application prompts and app-provided labels in native save dialogs follow the selected language; Windows system buttons follow the OS language. Video titles, authors, and file paths retain their original text. Haifeng's avatar appears only at the bottom left.

## Channels share-link status

Channels share links resolve to the official share page, but the unauthenticated media endpoint returns HTTP 401. Authenticated downloading has not yet been verified. This version provides desktop capture and copying captured media links; share-link downloading is not currently available.

**Validation scope:** isolated HTTPS proxy fixtures, page injection, title parsing, duplicate capture, 64-bit decoding parameters, real FFmpeg processing, and non-silent audio checks passed. All 19 automated tests, language-switching checks, original-quality defaults, and packaged desktop checks passed. A real Bilibili video was successfully analyzed and downloaded with sound. Capture from an actual logged-in WeChat client remains unverified. See the [validation summary](validation.json).

## Application data and source

Settings and task history are stored in `%APPDATA%\ClipDesk`. Runtime components are stored in `%LOCALAPPDATA%\ClipDesk\runtime`. Videos are saved at the destination confirmed in each save dialog.

Source archives exclude the large Electron, FFmpeg, ffprobe, and yt-dlp runtimes. `start.cmd` launches browser mode and installs download components on first use. Native desktop features require Electron.

### Run from source

Requires Node.js 24+ and an internet connection to install the download tools.

```powershell
git clone https://github.com/PltuoWang/ClipDesk.git
cd ClipDesk
npm install
npm install -D electron@44.5.1 resedit@3.1.0
node setup.mjs
npx electron .
```

For browser mode, run `npm start` and visit <http://127.0.0.1:8765>. WeChat capture and native Windows save dialogs require the desktop application.

### Test and build

```powershell
npm test
node build/package.mjs
```

Packaging requires Windows, PowerShell, and the .NET Framework C# compiler. The output is `dist/ClipDesk-2.1.0.exe`.

## License and credits

Project source code is licensed under [MIT](LICENSE). Electron, FFmpeg, yt-dlp, node-forge, and other third-party components retain their own licenses, including the GPL tools distributed with the EXE. See [third-party notices](THIRD_PARTY_NOTICES.md).

vibe coding by Haifeng.
