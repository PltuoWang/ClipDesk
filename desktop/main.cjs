const { app, BrowserWindow, dialog, ipcMain, shell, Menu, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const sourceRoot = path.join(__dirname, '..');
if (process.env.CLIPDESK_DATA) app.setPath('userData', path.resolve(process.env.CLIPDESK_DATA));
app.setName('ClipDesk');
app.setAppUserModelId('Haifeng.ClipDesk');
process.env.CLIPDESK_TOOLS = app.isPackaged ? path.join(process.resourcesPath, 'tools') : path.join(sourceRoot, 'tools');
let window, service, origin, closing = false, quitting = false;
let language = 'zh', translator = text => text;
const tr = text => translator(text, language);
const testMode = process.argv.includes('--smoke-test');
const testReport = process.env.CLIPDESK_TEST_REPORT;
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const { translate } = await import(pathToFileURL(path.join(sourceRoot, 'public/i18n.mjs')).href);
    translator = translate;
    const { createApp } = await import(pathToFileURL(path.join(sourceRoot, 'server.mjs')).href);
    const nativeHost = {
      setLanguage: value => { language = value; if (window) window.setTitle(tr('ClipDesk · 视频下载工作空间')); },
      copyText: async text => clipboard.writeText(text),
      chooseDirectory: async initial => {
        const selection = await dialog.showOpenDialog(window, { title: tr('选择默认保存文件夹'), defaultPath: initial, buttonLabel: tr('选择文件夹'), properties: ['openDirectory', 'createDirectory'] });
        return selection.canceled ? null : selection.filePaths[0];
      },
      chooseSavePath: async initial => {
        const selection = await dialog.showSaveDialog(window, { title: tr('保存有声 MP4'), defaultPath: initial, buttonLabel: tr('保存并下载'), filters: [{ name: tr('MP4 视频'), extensions: ['mp4'] }], properties: ['createDirectory', 'showOverwriteConfirmation'] });
        return selection.canceled || !selection.filePath ? null : { path: selection.filePath, overwriteAllowed: fs.existsSync(selection.filePath) };
      },
      openFile: async file => { const error = await shell.openPath(file); if (error) throw new Error(error); },
      revealFile: async file => shell.showItemInFolder(file)
    };
    nativeHost.confirmCapture = async () => {
      const answer = await dialog.showMessageBox(window, { type: 'question', title: tr('开启电脑微信视频号捕捉'), message: tr('允许 ClipDesk 配置本机视频号捕捉？'), detail: tr('将为当前 Windows 用户安装 ClipDesk 本地证书，并临时把系统代理切换至本机捕捉服务。仅解析视频号页面和播放数据；其他 HTTPS 连接直接转发。已有代理会暂时被切换。停止捕捉或退出后恢复原代理并移除本次安装的证书；异常退出由后台恢复程序处理。\n\n开启后，请关闭并重新打开微信的视频号播放窗口，再播放需要保存的视频。'), buttons: [tr('取消'), tr('允许并开始捕捉')], defaultId: 0, cancelId: 0 });
      return answer.response === 1;
    };
    const data = app.getPath('userData');
    fs.mkdirSync(data, { recursive: true });
    const { createCapture } = await import(pathToFileURL(path.join(sourceRoot, 'channels/capture.mjs')).href);
    const { windowsPlatform } = await import(pathToFileURL(path.join(sourceRoot, 'channels/windows-platform.mjs')).href);
    const captureDirectory = path.join(data, 'channels');
    const platform = process.platform === 'win32' ? windowsPlatform(captureDirectory) : null;
    await platform?.recover();
    const capture = await createCapture({ directory: captureDirectory, platform });
    service = await createApp({ downloadRoot: path.join(data, 'tasks'), preferencesFile: path.join(data, 'settings.json'), defaultSaveDirectory: process.env.CLIPDESK_DEFAULT_SAVE || app.getPath('downloads'), nativeHost, capture });
    await new Promise((resolve, reject) => { service.server.once('error', reject); service.server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${service.server.address().port}`;
    window = new BrowserWindow({ width: 1240, height: 900, minWidth: 960, minHeight: 700, show: false, title: tr('ClipDesk · 视频下载工作空间'), backgroundColor: '#f6f7f9', icon: path.join(sourceRoot, 'build', 'ClipDesk.ico'), frame: false, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true, backgroundThrottling: !testMode } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.once('ready-to-show', () => { if (!testMode) { window.show(); window.focus(); } });
    ipcMain.handle('window:action', (event, action) => {
      if (event.sender !== window.webContents || !event.senderFrame?.url?.startsWith(origin + '/')) throw new Error('Invalid window action');
      if (action === 'minimize') window.minimize();
      if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
      if (action === 'close') window.close();
    });
    window.on('close', event => {
      if (closing) return;
      event.preventDefault();
      (async () => {
        const response = await fetch(origin + '/api/jobs');
        const jobs = await response.json();
        if (jobs.some(job => !['done', 'error', 'cancelled'].includes(job.status))) {
          const answer = await dialog.showMessageBox(window, { type: 'question', title: tr('退出 ClipDesk'), message: tr('还有下载任务正在进行'), detail: tr('退出会取消尚未完成的任务。'), buttons: [tr('继续下载'), tr('取消任务并退出')], defaultId: 0, cancelId: 0 });
          if (answer.response !== 1) return;
        }
        closing = true; app.quit();
      })().catch(() => { closing = true; app.quit(); });
    });
    await window.loadURL(origin);
    if (testMode) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const health = await fetch(origin + '/api/health').then(r => r.json());
      const settings = await fetch(origin + '/api/settings').then(r => r.json());
      const text = await window.webContents.executeJavaScript('document.body.innerText');
      const bridge = await window.webContents.executeJavaScript('Boolean(window.clipdeskDesktop && window.clipdeskDesktop.isDesktop)');
      const resources = await window.webContents.executeJavaScript('Array.from(document.images).filter(i=>i.getAttribute("src")?.includes("haifeng")).map(i=>({loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth}))');
      if (!health.ready || !settings.desktop || !bridge || !text.includes('vibe coding by Haifeng.') || !resources.every(i => i.loaded)) throw new Error('Desktop smoke test failed');
      const { runProcess, binary, commonArgs } = await import(pathToFileURL(path.join(sourceRoot, 'core.mjs')).href);
      const runtimeCheck = await runProcess(process.execPath, ['-e', 'console.log(process.versions.node)']);
      const ytVersion = await runProcess(binary('yt-dlp'), ['--version']);
      const assertUI = (condition, message) => { if (!condition) throw new Error(message); };
      assertUI(resources.length === 1, 'Avatar must appear only in the lower-left profile');
      await window.webContents.executeJavaScript("document.getElementById('top-language').value='en';document.getElementById('top-language').dispatchEvent(new Event('change',{bubbles:true}));true");
      for (let i=0;i<40;i++) { if (await window.webContents.executeJavaScript("document.documentElement.lang==='en' && !document.getElementById('top-language').disabled")) break; await new Promise(resolve=>setTimeout(resolve,50)); }
      const english = await window.webContents.executeJavaScript('document.body.innerText');
      assertUI(english.includes('Video download') && english.includes('Analyze video') && !english.includes('解析视频'), 'English download UI failed');
      await window.webContents.executeJavaScript("document.querySelector('[data-view=settings]').click();true");
      await new Promise(resolve=>setTimeout(resolve,100));
      const englishSettings = await window.webContents.executeJavaScript('document.body.innerText');
      assertUI(englishSettings.includes('Download & save') && englishSettings.includes('Language'), 'English settings UI failed');
      await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if (process.env.CLIPDESK_TEST_SCREENSHOT) fs.writeFileSync(process.env.CLIPDESK_TEST_SCREENSHOT.replace(/\.png$/, '-english.png'), (await window.webContents.capturePage()).toPNG());
      capture.observe({ description: '测试视频名称保留中文', media: [{ url: 'https://finder.video.qq.com/test-original.mp4', height: 2160, decodeKey: '123456789' }] });
      await window.webContents.executeJavaScript("document.querySelector('[data-view=channels]').click();true");
      for (let i=0;i<40;i++) { if (await window.webContents.executeJavaScript("document.querySelector('.captured-item')!==null")) break; await new Promise(resolve=>setTimeout(resolve,50)); }
      const capturedEnglish = await window.webContents.executeJavaScript('document.body.innerText');
      assertUI(capturedEnglish.includes('Copy download link') && capturedEnglish.includes('测试视频名称保留中文'), 'English capture labels or original title failed');
      await window.webContents.executeJavaScript("document.getElementById('video-bitrate').value='5000';document.getElementById('audio-bitrate').value='128';document.querySelector('.captured-actions button:last-child').click();true");
      for (let i=0;i<40;i++) { if (await window.webContents.executeJavaScript("!document.getElementById('video-panel').hidden")) break; await new Promise(resolve=>setTimeout(resolve,50)); }
      const channelDefaults = await window.webContents.executeJavaScript("({video:document.getElementById('video-bitrate').value,audio:document.getElementById('audio-bitrate').value,quality:document.querySelector('.quality-options .selected')?.textContent})");
      assertUI(channelDefaults.video === 'original' && channelDefaults.audio === 'original' && channelDefaults.quality === '2160p', 'Channels must reset to the highest captured source quality and original audio');
      await window.webContents.executeJavaScript("document.getElementById('top-language').value='zh';document.getElementById('top-language').dispatchEvent(new Event('change',{bubbles:true}));true");
      for (let i=0;i<40;i++) { if (await window.webContents.executeJavaScript("document.documentElement.lang==='zh-CN' && !document.getElementById('top-language').disabled")) break; await new Promise(resolve=>setTimeout(resolve,50)); }
      const chinese = await window.webContents.executeJavaScript('document.body.innerText');
      assertUI(chinese.includes('视频号默认保留原画质与原音质') && !chinese.includes('Analyze video'), 'Switching back to Chinese failed');
      await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const result = { ok: true, health, settings, bridge, avatar: resources, englishSwitch: true, chineseSwitch: true, channelDefaults, originalTitlePreserved: true, electron: process.versions.electron, nodeSolver: runtimeCheck.trim(), ytDlp: ytVersion.trim(), url: origin, appPackaged: app.isPackaged };
      if (testReport) { fs.mkdirSync(path.dirname(testReport), { recursive: true }); fs.writeFileSync(testReport, JSON.stringify(result, null, 2)); }
      if (process.env.CLIPDESK_TEST_SCREENSHOT) fs.writeFileSync(process.env.CLIPDESK_TEST_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
      closing = true; app.quit();
    }
  }).catch(error => {
    if (testReport) fs.writeFileSync(testReport, JSON.stringify({ ok: false, error: error.stack }, null, 2));
    else dialog.showErrorBox(tr('ClipDesk 启动失败'), error.message);
    closing = true; app.exit(1);
  });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true; closing = true;
    Promise.resolve(service?.close()).finally(() => app.exit(0));
  });
  app.on('window-all-closed', () => app.quit());
}
