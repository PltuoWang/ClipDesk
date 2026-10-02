# Third-party tools

This application invokes separate executable tools. Source-code archives of this application exclude these executables.

## yt-dlp

Official project: https://github.com/yt-dlp/yt-dlp

Release executable: https://github.com/yt-dlp/yt-dlp/releases

The yt-dlp project source is Unlicense. Its official PyInstaller Windows executable includes components with other licenses and is distributed under GPLv3+. Consult the upstream README and THIRD_PARTY_LICENSES.txt for the complete notices and source links: https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt

## FFmpeg and ffprobe

Official source: https://ffmpeg.org/download.html and https://github.com/FFmpeg/FFmpeg

Windows essentials binaries: https://www.gyan.dev/ffmpeg/builds/

Builds containing libx264 are GPL builds. The installation script copies the distribution's LICENSE file to tools/FFmpeg-LICENSE.txt. Build configuration and version details can be obtained by running tools/ffmpeg.exe -version. Source and build details are available from the provider's build page.

## Node.js

The desktop executable includes the Node.js runtime supplied by Electron. The browser-only source edition needs Node.js installed separately.

Official source and notices: https://github.com/nodejs/node and https://github.com/nodejs/node/blob/main/LICENSE

## Electron / Chromium

Desktop runtime: Electron 44.5.1, https://github.com/electron/electron/releases/tag/v44.5.1 . Electron is MIT licensed. The extracted desktop runtime retains Electron's LICENSE and Chromium's LICENSES.chromium.html, including third-party notices.

## node-forge

node-forge 1.4.0: https://github.com/digitalbazaar/forge . Distributed under its BSD-3-Clause / GPL-2.0 dual license; this application uses the BSD-3-Clause option. The packaged node_modules/node-forge/LICENSE and associated copyright notices are retained.

## ISAAC-64 Channels decoder

channels/isaac64.mjs adapts the MIT implementation in https://github.com/oliver-zch/wx-video-channel-download/blob/main/pkg/decrypt/decrypt.go . Its license is retained as channels/LICENSE-isaac.txt. The original algorithm is ISAAC-64 by Bob Jenkins. Compatibility was checked against independent test output from the Apache-2.0 decoder in https://github.com/putyy/res-downloader ; that WASM decoder is not bundled.

The application code's license does not replace the licenses of bundled standalone tools. Consult these upstream notices before redistributing the complete executable.
