import { translate, applyLanguage, watchLanguage } from './i18n.mjs';
const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="app-token"]').content;
let info = null, ready = false, parseController = null, pollTimer, jobs = [];
let preferences = { desktop: false, defaultSaveDirectory: '' };
let captureState = { active: false, items: [] }, currentView = 'download', captureBusy = false;
const tr = text => translate(text, preferences.language || 'zh');
watchLanguage(document, () => preferences.language || 'zh');
document.querySelectorAll('.language-select').forEach(select => select.addEventListener('change', async () => {
  const selected = select.value; document.querySelectorAll('.language-select').forEach(control => control.disabled = true);
  try {
    const settings = await api('/api/settings/language', { method: 'POST', body: JSON.stringify({ language: selected }) });
    preferences = { ...preferences, ...settings }; renderPreferences();
    jobNodes.forEach(node => delete node.dataset.signature); $('captured-list').dataset.signature = '';
    renderJobs(); renderCapture(); if (info) { const previousFormat = $('format').value; renderInfo(); const previousChoice = info.choices.find(choice => choice.id === previousFormat); if (previousChoice) { chooseHeight(previousChoice.height); $('format').value = previousFormat; updateEstimate(); } } applyLanguage(document, selected);
  } catch (error) { notice(tr(error.message || '语言切换失败，请重试。')); renderPreferences(); }
  finally { document.querySelectorAll('.language-select').forEach(control => control.disabled = false); }
}));
const desktopBridge = window.clipdeskDesktop;
if (desktopBridge?.isDesktop) {
  document.body.classList.add('desktop-app'); $('desktop-titlebar').hidden = false;
  document.querySelectorAll('[data-window]').forEach(button => button.addEventListener('click', () => desktopBridge.windowAction(button.dataset.window)));
}
function showView(view) {
  currentView = view;
  $('settings-view').hidden = view !== 'settings'; $('channels-view').hidden = view !== 'channels'; $('download-view').hidden = !['download', 'history'].includes(view);
  $('breadcrumb-current').textContent = view === 'settings' ? '设置' : view === 'channels' ? '视频号捕捉' : view === 'history' ? '下载记录' : '视频下载';
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'history') $('history').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
['top-settings', 'change-directory-link'].forEach(id => $(id).addEventListener('click', () => showView('settings')));
function renderPreferences() {
  document.querySelectorAll('.language-select').forEach(select => select.value = preferences.language || 'zh');
  $('default-save-directory').value = preferences.defaultSaveDirectory || '';
  $('default-directory-label').textContent = preferences.defaultSaveDirectory || '在下载前选择保存位置';
  $('default-directory-label').title = preferences.defaultSaveDirectory || '';
  $('download-button').innerHTML = preferences.desktop ? '选择位置并下载 <span aria-hidden="true">↓</span>' : '开始下载 <span aria-hidden="true">↓</span>';
}
$('choose-default-directory').addEventListener('click', async () => {
  const button = $('choose-default-directory'); button.disabled = true; $('settings-notice').hidden = true;
  try {
    const result = await api('/api/settings/default-folder', { method: 'POST', body: '{}' });
    if (result.cancelled) return;
    preferences.defaultSaveDirectory = result.defaultSaveDirectory; renderPreferences();
    $('settings-notice').className = 'notice success'; $('settings-notice').textContent = '默认保存文件夹已更新。'; $('settings-notice').hidden = false;
  } catch (error) { $('settings-notice').className = 'notice'; $('settings-notice').textContent = error.message; $('settings-notice').hidden = false; }
  finally { button.disabled = false; }
});
const terminal = new Set(['done', 'error', 'cancelled']);
const statusLabels = { queued: '等待下载', starting: '准备下载', downloading: '下载中', processing: '导出中', done: '已完成', error: '失败', cancelled: '已取消' };
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-App-Token': token, ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请重试。');
  return result;
}
function notice(message, success = false) { $('notice').textContent = message; $('notice').classList.toggle('success', success); $('notice').hidden = !message; }
function duration(seconds) { const s = Math.round(seconds || 0); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function size(bytes) { if (!bytes) return ''; return bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${(bytes / 1048576).toFixed(1)} MB`; }
function elem(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function invalidate() {
  parseController?.abort(); info = null;
  $('video-panel').hidden = true; $('loading').hidden = true; $('empty').hidden = false;
  $('parse-button').disabled = !ready; $('parse-button').innerHTML = '解析视频 <span aria-hidden="true">→</span>'; notice('');
}
$('url').addEventListener('input', invalidate);
$('proxy').addEventListener('input', invalidate);
$('paste').addEventListener('click', async () => {
  try { $('url').value = (await navigator.clipboard.readText()).trim(); invalidate(); $('url').focus(); }
  catch { notice('无法读取剪贴板，请在输入框中按 Ctrl+V 粘贴。'); $('url').focus(); }
});
$('parse-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ready) return;
  parseController?.abort(); const controller = new AbortController(); parseController = controller;
  info = null; notice(''); $('parse-button').disabled = true; $('parse-button').textContent = '解析中…';
  $('video-panel').hidden = true; $('empty').hidden = true; $('loading').hidden = false;
  try {
    const result = await api('/api/info', { method: 'POST', body: JSON.stringify({ url: $('url').value, proxy: $('proxy').value }), signal: controller.signal });
    if (controller.signal.aborted) return;
    info = result; renderInfo();
  } catch (error) { if (error.name !== 'AbortError') { notice(error.message); $('empty').hidden = false; } }
  finally { if (parseController === controller) { $('loading').hidden = true; $('parse-button').disabled = !ready; $('parse-button').innerHTML = '解析视频 <span aria-hidden="true">→</span>'; } }
});
function renderInfo() {
  $('video-title').textContent = info.title; $('video-channel').textContent = info.channel;
  $('duration').textContent = duration(info.duration); $('duration').hidden = !info.duration;
  $('thumbnail').hidden = true; $('thumb-fallback').hidden = false;
  if (info.thumbnail) {
    $('thumbnail').src = info.thumbnail;
    $('thumbnail').onload = () => { $('thumbnail').hidden = false; $('thumb-fallback').hidden = true; };
    $('thumbnail').onerror = () => { $('thumbnail').hidden = true; $('thumb-fallback').hidden = false; };
  }
  const heights = [...new Set(info.choices.map(c => c.height))];
  $('qualities').replaceChildren(...heights.map(height => {
    const button = elem('button', height ? `${height}p` : '捕捉源画质'); button.type = 'button'; button.dataset.height = height;
    button.addEventListener('click', () => chooseHeight(height)); return button;
  }));
  $('available-hint').textContent = `${heights.length} 种可用清晰度`;
  document.querySelector('.source-label').lastChild.textContent = info.source === 'channels' ? '微信视频号' : info.source === 'bilibili' ? 'Bilibili' : 'YouTube';
  chooseHeight(info.source === 'channels' ? heights[0] : (heights.find(h => h <= 1080) || heights.at(-1)));
  $('video-panel').hidden = false; $('empty').hidden = true;
}
function chooseHeight(height) {
  for (const button of $('qualities').children) { const selected = Number(button.dataset.height) === height; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); }
  const choices = info.choices.filter(c => c.height === height);
  $('format').replaceChildren(...choices.map(c => {
    const bitrate = c.bitrate ? `${(c.bitrate / 1000).toFixed(2)} Mbps` : '码率未知';
    const option = elem('option', `${c.fps ? c.fps + 'fps · ' : ''}${c.codec.toUpperCase()} · ${bitrate}`); option.value = c.id; return option;
  }));
  $('format').value = (choices.find(c => c.codec === 'avc1' && c.fps >= 24) || choices[0]).id;
  updateEstimate();
}
function updateEstimate() {
  if (!info) return;
  const choice = info.choices.find(c => c.id === $('format').value);
  const video = $('video-bitrate').value, audio = $('audio-bitrate').value;
  const vRate = video === 'original' ? choice?.bitrate || 0 : Number(video);
  const aRate = audio === 'original' ? info.audioBitrate || 192 : Number(audio);
  const estimate = info.duration && vRate ? size(info.duration * (vRate + aRate) * 1000 / 8) : '';
  const originalChannels = info.source === 'channels' && video === 'original' && audio === 'original';
  $('size-estimate').textContent = estimate ? `预计约 ${estimate} · 实际以导出为准` : originalChannels ? '原视频画质 · 原音质' : 'H.264 画面 · AAC 声音';
  $('encoding-note').textContent = originalChannels ? '视频号默认保留原画质与原音质，不重新编码。' : video === 'original' ? '兼容格式直接合并；其他编码转为 H.264 / AAC。提高码率不会提升源视频细节。' : '按所选目标码率重新编码，实际平均码率会随画面变化；提高码率不会增加源视频细节。';
}
['format', 'video-bitrate', 'audio-bitrate'].forEach(id => $(id).addEventListener('change', updateEstimate));
$('download-button').addEventListener('click', async () => {
  if (!info) return; const button = $('download-button'); button.disabled = true; notice('');
  try {
    let targetId;
    if (preferences.desktop) {
      const target = await api('/api/export-target', { method: 'POST', body: JSON.stringify({ title: info.title }) });
      if (target.cancelled) return;
      targetId = target.targetId;
    }
    await api('/api/jobs', { method: 'POST', body: JSON.stringify({ infoId: info.id, formatId: $('format').value, videoBitrate: $('video-bitrate').value, audioBitrate: $('audio-bitrate').value, proxy: $('proxy').value, targetId }) });
    notice(preferences.desktop ? '已加入下载队列，完成后会自动保存到你选择的位置。' : '已加入下载队列，完成后可在下载记录中保存 MP4。', true); await poll();
    $('history').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) { notice(error.message); }
  finally { button.disabled = false; }
});
const jobNodes = new Map();
function renderJobs() {
  $('job-count').textContent = jobs.length; $('history-total').textContent = jobs.length; $('no-jobs').hidden = !!jobs.length;
  const activeCount = jobs.filter(job => !terminal.has(job.status)).length;
  $('history-summary').textContent = activeCount ? `${activeCount} 个任务正在进行` : `${jobs.filter(job => job.status === 'done').length} 个视频已保存`;
  for (const [id, node] of jobNodes) if (!jobs.some(job => job.id === id)) { node.remove(); jobNodes.delete(id); }
  for (const job of jobs) {
    let node = jobNodes.get(job.id);
    if (!node) { node = elem('article', undefined, 'job'); jobNodes.set(job.id, node); $('jobs').append(node); }
    const signature = JSON.stringify(job); if (node.dataset.signature === signature) continue;
    node.dataset.signature = signature; node.className = `job ${job.status}`;
    const main = elem('div', undefined, 'job-main'); main.append(elem('div', job.title, 'job-title'));
    const meta = elem('div', undefined, 'job-meta');
    const date = new Date(job.createdAt).toLocaleString(preferences.language === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    meta.append(elem('span', `${job.source === 'channels' ? '微信视频号 · ' : job.source === 'bilibili' ? 'Bilibili · ' : ''}${job.height ? job.height + 'p · ' : ''}MP4`), elem('span', `${job.videoBitrate === 'original' ? '原画质优先' : Number(job.videoBitrate) / 1000 + ' Mbps'}`), elem('span', date));
    if (job.size) meta.append(elem('span', size(job.size))); main.append(meta);
    if (job.savePath) { const destination = elem('div', job.savePath, 'job-destination'); destination.title = job.savePath; main.append(destination); }
    main.append(elem('div', `${statusLabels[job.status] || job.status} · ${job.message}${!terminal.has(job.status) ? ` · ${job.progress}%` : ''}`, 'job-status'));
    if (!terminal.has(job.status)) { const progress = elem('div', undefined, 'progress'); progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100'); progress.setAttribute('aria-valuenow', job.progress); progress.setAttribute('aria-label', job.title); const fill = elem('span'); fill.style.width = `${job.progress}%`; progress.append(fill); main.append(progress); }
    const actions = elem('div', undefined, 'job-actions');
    if (job.status === 'done') {
      if (job.desktop) {
        for (const [action, text] of [['open', '打开视频'], ['reveal', '打开文件夹']]) {
          const openButton = elem('button', text, action === 'open' ? 'save-file' : ''); openButton.type = 'button';
          openButton.addEventListener('click', async () => { try { await api(`/api/jobs/${job.id}/${action}`, { method: 'POST', body: '{}' }); } catch (error) { notice(error.message); } }); actions.append(openButton);
        }
      } else { const link = elem('a', '保存 MP4 ↓', 'save-file'); link.href = job.fileUrl; link.setAttribute('download', ''); actions.append(link); }
    }
    const button = elem('button', terminal.has(job.status) ? '移除' : '取消'); button.type = 'button';
    button.addEventListener('click', async () => {
      if (terminal.has(job.status) && !confirm(tr(job.status === 'done' && !job.savePath ? '移除这条记录及程序缓存的导出文件？已保存到其他位置的副本不受影响。' : '移除这条记录？已经保存的视频文件会保留。'))) return;
      button.disabled = true;
      try { await api(`/api/jobs/${job.id}${terminal.has(job.status) ? '' : '/cancel'}`, { method: terminal.has(job.status) ? 'DELETE' : 'POST', body: '{}' }); await poll(); }
      catch (error) { notice(error.message); button.disabled = false; }
    }); actions.append(button);
    node.replaceChildren(elem('div', job.status === 'done' ? '✓' : '↧', 'job-icon'), main, actions);
  }
  const desired = jobs.map(j => jobNodes.get(j.id));
  desired.forEach((node, index) => { if ($('jobs').children[index] !== node) $('jobs').insertBefore(node, $('jobs').children[index] || null); });
}
let polling = false;
async function poll() {
  clearTimeout(pollTimer); if (polling) return;
  polling = true;
  try { jobs = await api('/api/jobs'); renderJobs(); if (currentView === 'channels' || captureState.active) { captureState = await api('/api/capture'); renderCapture(); } }
  catch { $('system-state').className = 'system error'; $('system-state').lastChild.textContent = '连接已断开'; }
  finally { polling = false; pollTimer = setTimeout(poll, jobs.some(j => !terminal.has(j.status)) || captureState.active || currentView === 'channels' ? 1000 : 5000); }
}
function captureNotice(text,success=false) { $('capture-notice').textContent=text; $('capture-notice').hidden=!text; $('capture-notice').classList.toggle('success',success); }
function renderCapture() {
  const items=captureState.items||[];
  $('capture-count').textContent=items.length; $('captured-total').textContent=items.length;
  $('capture-state').textContent=captureState.active?'正在捕捉 · 等待微信播放':'未开启捕捉'; $('capture-state').classList.toggle('on',captureState.active);
  $('capture-toggle').textContent=captureState.active?'停止捕捉':'开始捕捉';
  $('capture-empty').hidden=!!items.length;
  if(captureState.error)captureNotice(captureState.error);
  const signature=JSON.stringify(items); if($('captured-list').dataset.signature===signature)return; $('captured-list').dataset.signature=signature;
  $('captured-list').replaceChildren(...items.map(item=>{
    const card=elem('article',undefined,'card captured-item'), icon=elem('div','▶','captured-icon'), detail=elem('div',undefined,'captured-detail');
    detail.append(elem('h3',item.title));const meta=[item.channel,item.duration?duration(item.duration):'',item.height?item.height+'p':'源画质',item.size?size(item.size):''].filter(Boolean).join(' · '); detail.append(elem('p',meta));
    detail.append(elem('small',item.titleParsed?'✓ 已自动解析视频名称':'视频未提供名称，可在保存时修改文件名'));
    const button=elem('button','导出设置 →','secondary');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{info=await api('/api/capture/info',{method:'POST',body:JSON.stringify({id:item.id})});$('video-bitrate').value='original';$('audio-bitrate').value='original';showView('download');renderInfo();notice('已选择视频号视频。调整码率后，选择位置并下载。',true);$('video-panel').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){captureNotice(e.message);}finally{button.disabled=false;}});
    const copy=elem('button','复制下载链接','secondary');copy.type='button';copy.addEventListener('click',async()=>{copy.disabled=true;try{const result=await api('/api/capture/copy-link',{method:'POST',body:JSON.stringify({id:item.id})});if(!result.copied)await navigator.clipboard.writeText(result.url);captureNotice(result.encrypted?'已复制加密源链接，可能限时有效；请用 ClipDesk 保存以自动处理。':'下载链接已复制。',true);}catch(e){captureNotice(e.message);}finally{copy.disabled=false;}});
    const actions=elem('div',undefined,'captured-actions');actions.append(copy,button);card.append(icon,detail,actions);return card;
  }));
}
$('capture-toggle').addEventListener('click',async()=>{
  if(captureBusy)return;captureBusy=true;$('capture-toggle').disabled=true;captureNotice('');
  try{const result=await api('/api/capture/'+(captureState.active?'stop':'start'),{method:'POST',body:'{}'});if(result.cancelled)return;captureState=result;renderCapture();captureNotice(result.active?'捕捉已开启。请重新打开电脑微信中的视频号窗口，再播放视频。':'捕捉已停止，原代理设置已恢复。',true);}catch(e){captureNotice(e.message);}finally{captureBusy=false;$('capture-toggle').disabled=false;}
});
$('clear-capture').addEventListener('click',async()=>{try{captureState=await api('/api/capture/clear',{method:'POST',body:'{}'});renderCapture();}catch(e){captureNotice(e.message);}});
document.querySelector('[data-view="channels"]').addEventListener('click',()=>poll());
async function init() {
  $('parse-button').disabled = true;
  try {
    const [health, settings] = await Promise.all([api('/api/health'), api('/api/settings')]); ready = health.ready;
    preferences = settings; renderPreferences();
    $('system-state').className = `system ${ready ? 'ready' : 'error'}`;
    $('system-state').lastChild.textContent = ready ? '组件就绪' : '组件未安装';
    if (!ready) notice('下载组件尚未安装，请在程序文件夹中运行 setup.ps1，然后刷新页面。');
    $('parse-button').disabled = !ready;
  } catch { notice('无法连接本地服务，请运行 start.cmd 后重新打开页面。'); }
  await poll();
}
init();
