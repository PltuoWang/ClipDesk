const pairs = {
  'ClipDesk · 视频下载工作空间':'ClipDesk · Video workspace',
  '工作空间':'Workspace','视频下载':'Video download','视频号捕捉':'Channels capture','下载记录':'Downloads','偏好设置':'Preferences','设置':'Settings',
  '本地处理 · 私人工作空间':'Local processing · Your workspace','本地处理 · 文件由你掌控':'Local processing · Your files',
  '检查组件中':'Checking components','组件就绪':'Ready','组件未安装':'Components missing','连接已断开':'Disconnected','打开设置':'Open settings',
  '界面语言':'Language','中英文切换会立即生效，并在下次启动时保留。':'Switch instantly between Chinese and English. Your choice is remembered.',
  '选择清晰度与码率，把喜欢的视频保存到电脑。':'Choose quality and bitrate, then save videos to your computer.',
  '画面与声音':'Video + audio','默认保存位置':'Default save folder','默认保存文件夹':'Default save folder','正在读取保存位置…':'Loading save folder…','更改':'Change',
  '视频链接':'Video link','粘贴':'Paste','解析视频':'Analyze video','解析中…':'Analyzing…','粘贴 YouTube、Bilibili 或 b23.tv 视频链接':'Paste a YouTube, Bilibili or b23.tv video link',
  '支持 YouTube、Shorts、Bilibili 视频与 b23.tv 分享链接。':'Supports YouTube, Shorts, Bilibili and b23.tv sharing links.',
  '网络设置':'Network','代理地址（可选）':'Proxy address (optional)','无法连接 YouTube 时，可填写你已有的 HTTP / SOCKS5 代理。':'If YouTube is unreachable, enter your existing HTTP / SOCKS5 proxy.',
  '正在获取视频信息':'Loading video information','清晰度和码率将以实际可用格式为准。':'Quality and bitrates reflect the available source formats.',
  '添加你的第一个视频':'Add your first video','粘贴 YouTube 或 Bilibili 链接，其他交给 ClipDesk。':'Paste a YouTube or Bilibili link. ClipDesk handles the rest.',
  '按源视频选择清晰度':'Available source quality','自动合并声音':'Automatic audio merge','每次确认保存位置':'Choose a folder every time',
  '视频封面':'Video thumbnail','微信视频号':'WeChat Channels','✓ 自动保留声音':'✓ Keep source audio','MP4 格式':'MP4 format','导出设置':'Export settings','清晰度':'Quality',
  '源视频格式':'Source format','视频码率':'Video bitrate','音频码率':'Audio bitrate','优先保留原画质':'Keep original quality','优先保留原音质':'Keep original audio',
  '1 Mbps · 小文件':'1 Mbps · Small file','兼容格式直接合并；其他编码转为 H.264 / AAC。提高码率不会提升源视频细节。':'Compatible formats are merged directly; other codecs are converted to H.264 / AAC. A higher bitrate cannot add source detail.',
  '按所选目标码率重新编码，实际平均码率会随画面变化；提高码率不会增加源视频细节。':'Re-encode at the selected target bitrate. Actual bitrate varies with the content; it cannot add source detail.',
  '视频号默认保留原画质与原音质，不重新编码。':'Channels videos keep the original video and audio without re-encoding by default.',
  '有声 MP4':'MP4 with audio','H.264 画面 · AAC 声音':'H.264 video · AAC audio','原视频画质 · 原音质':'Original video · Original audio',
  '选择位置并下载':'Choose location & download','开始下载':'Download','文件保存在本机':'Files are saved locally','还没有下载记录':'No downloads yet',
  '开始第一个任务后，可在这里查看进度和打开文件。':'Start a download to see its progress and open the saved file here.',
  '在电脑微信中播放视频，ClipDesk 自动识别视频名称。':'Play a video in desktop WeChat. ClipDesk detects its title automatically.',
  '未开启捕捉':'Capture is off','捕捉电脑微信中播放的视频':'Capture videos playing in desktop WeChat','先开始捕捉，再重新打开微信的视频号播放窗口。':'Start capture, then reopen the Channels player in WeChat.',
  '开始捕捉':'Start capture','停止捕捉':'Stop capture','在微信播放':'Play in WeChat','选择视频并保存':'Select a video & save',
  '首次开启会确认本机证书和临时系统代理配置；停止捕捉或退出后恢复原设置。仅保留视频号视频信息。':'You will confirm a local certificate and temporary system proxy on first use. Stopping capture or quitting restores the settings. Only Channels video information is retained.',
  '默认保存原视频画质与音质。复制的下载链接可能限时有效或包含加密媒体，使用 ClipDesk 保存可自动处理。':'Original video and audio are saved by default. Copied links may expire or contain encrypted media; ClipDesk handles this when saving.',
  '已捕捉视频':'Captured videos','清空捕捉列表':'Clear capture list','等待你在微信中播放':'Waiting for playback in WeChat',
  '视频名称、时长和可用画质会显示在这里。':'Video titles, duration and available quality will appear here.',
  '开启后若没有记录，请重新打开视频号窗口并从头播放。':'If nothing appears, reopen the Channels player and play the video from the beginning.',
  '让每次下载，都按你的习惯进行。':'Make every download work the way you prefer.','下载与保存':'Download & save','管理文件的默认保存位置。':'Manage the default folder for your videos.',
  '首次下载从这里开始，以后记住上次选择的文件夹。':'The first download starts here. Later downloads use your last selected folder.',
  '选择文件夹':'Choose folder','每次下载前选择保存位置':'Choose a save location before every download','可以为每个视频指定文件夹和文件名。':'Choose a folder and filename for each video.','已开启':'Enabled',
  'YouTube 下载 · 微信视频号捕捉 · 2.1.0':'YouTube · Bilibili · WeChat Channels · 2.1.0',
  'YouTube / Bilibili 下载 · 微信视频号捕捉 · 2.1.0':'YouTube / Bilibili · WeChat Channels · 2.1.0',
  'Haifeng 的头像':'Haifeng avatar','ClipDesk 首页':'ClipDesk home','最小化':'Minimize','最大化或还原':'Maximize or restore','关闭':'Close',
  '在下载前选择保存位置':'Choose a location before downloading','默认保存文件夹已更新。':'Default save folder updated.',
  '请求失败，请重试。':'Request failed. Please try again.','无法读取剪贴板，请在输入框中按 Ctrl+V 粘贴。':'Clipboard is unavailable. Press Ctrl+V in the input field.',
  '捕捉源画质':'Captured source quality','源画质':'Source quality','码率未知':'Bitrate unknown','源视频':'Source video',
  '已加入下载队列，完成后会自动保存到你选择的位置。':'Added to the queue. The video will be saved to your chosen location.',
  '已加入下载队列，完成后可在下载记录中保存 MP4。':'Added to the queue. Save the MP4 from Downloads once it is ready.',
  '等待下载':'Queued','准备下载':'Preparing','下载中':'Downloading','导出中':'Exporting','已完成':'Completed','失败':'Failed','已取消':'Cancelled','原画质优先':'Keep source quality',
  '打开视频':'Open video','打开文件夹':'Show in folder','保存 MP4 ↓':'Save MP4 ↓','移除':'Remove','取消':'Cancel',
  '移除这条记录及程序缓存的导出文件？已保存到其他位置的副本不受影响。':'Remove this record and the cached export? Copies saved elsewhere will be kept.',
  '移除这条记录？已经保存的视频文件会保留。':'Remove this record? Your saved video will be kept.',
  '正在捕捉 · 等待微信播放':'Capturing · Waiting for WeChat','✓ 已自动解析视频名称':'✓ Title detected automatically','视频未提供名称，可在保存时修改文件名':'No title was provided. You can rename the file when saving.',
  '已选择视频号视频。调整码率后，选择位置并下载。':'Channels video selected. Original quality is selected by default. Choose a location to download.',
  '复制下载链接':'Copy download link','下载链接已复制。':'Download link copied.','已复制加密源链接，可能限时有效；请用 ClipDesk 保存以自动处理。':'Encrypted source link copied. It may expire; save with ClipDesk to decode it automatically.',
  '捕捉已开启。请重新打开电脑微信中的视频号窗口，再播放视频。':'Capture started. Reopen the Channels player in desktop WeChat, then play the video.',
  '捕捉已停止，原代理设置已恢复。':'Capture stopped. Your previous proxy settings were restored.',
  '下载组件尚未安装，请在程序文件夹中运行 setup.ps1，然后刷新页面。':'Download components are missing. Run setup.mjs in the application folder, then refresh.',
  '无法连接本地服务，请运行 start.cmd 后重新打开页面。':'Cannot reach the local service. Run start.cmd and reopen this page.',
  '请输入完整的 YouTube 或 Bilibili 视频链接。':'Enter a complete YouTube or Bilibili video link.','视频链接格式不正确。':'Invalid video link.',
  '请粘贴 Bilibili 的 BV 或 av 视频链接。':'Paste a Bilibili BV or av video link.','Bilibili 分 P 编号无效。':'Invalid Bilibili part number.',
  '支持 YouTube、Shorts、Bilibili 视频及 b23.tv 分享链接。':'Supported links: YouTube, Shorts, Bilibili videos and b23.tv.',
  'Bilibili 限制了当前请求或清晰度，请使用可访问的视频和网络后重试。':'Bilibili restricted this request or quality. Try an accessible video and network.',
  '代理地址格式不正确，例如 http://127.0.0.1:7890。':'Invalid proxy address, for example http://127.0.0.1:7890.',
  '代理仅支持 HTTP、HTTPS 或 SOCKS5 地址。':'Only HTTP, HTTPS and SOCKS5 proxies are supported.','视频码率无效。':'Invalid video bitrate.','音频码率无效。':'Invalid audio bitrate.',
  '暂不支持正在直播的视频，请在直播结束后重试。':'Live streams are not supported. Try again after the broadcast ends.','未找到可以下载的有声视频格式。':'No downloadable video format with audio was found.',
  '源文件缺少画面或声音，无法导出有声 MP4。':'The source is missing video or audio. An MP4 with sound cannot be exported.',
  '上次运行中断，请重新下载。':'The previous session was interrupted. Download again.','导出文件已被移动或删除。':'The saved file has been moved or deleted.',
  '正在下载视频与音轨':'Downloading video and audio','正在下载捕捉到的视频号视频':'Downloading captured Channels video','正在合并画面与音轨':'Merging video and audio',
  '正在保留原视频画质与音质':'Keeping the original video and audio','正在合并声音并导出 MP4':'Preparing audio and exporting MP4','正在保存到所选位置':'Saving to your selected location','有声 MP4 已就绪':'MP4 with audio is ready',
  '所选文件名已被其他任务或程序占用，请选择新文件名后重新下载。':'That filename is now in use. Choose another name and download again.',
  '任务已取消。':'Task cancelled.','导出文件为空。':'The exported file is empty.','导出文件的画面或音轨验证失败。':'Video or audio verification failed.',
  '请先为本次下载选择保存位置。':'Choose a save location for this download first.','视频信息已过期，请重新解析。':'Video information expired. Analyze the video again.',
  '请选择一个可用的视频格式。':'Select an available video format.','捕捉记录已失效，请在微信中重新播放。':'This capture is no longer available. Play the video again in WeChat.',
  '电脑微信捕捉需要 ClipDesk Windows 桌面版。':'Desktop WeChat capture requires ClipDesk for Windows.','请使用桌面版捕捉视频号。':'Use the desktop edition to capture Channels videos.',
  '视频地址已过期或暂不可下载，请重新播放后再试。':'The video link expired or is unavailable. Play it again and retry.','视频下载超时。':'Video download timed out.',
  '视频解码信息无效，请重新播放视频。':'Invalid decoding information. Play the video again.',
  '微信未接受捕捉证书，请停止捕捉后重新开启，并重启视频号窗口。':'WeChat did not accept the capture certificate. Stop and restart capture, then reopen the Channels player.',
  '请选择中文或 English。':'Choose Chinese or English.','语言切换失败，请重试。':'Language could not be changed. Please retry.',
  'YouTube 要求登录或验证当前网络。请更换可用网络后重试；此版本不自动读取浏览器登录信息。':'YouTube requires login or network verification. Retry on an accessible network; browser login data is not read automatically.',
  '视频不可用、已被删除或需要观看权限。':'The video is unavailable, deleted or requires permission.',
  '无法连接或获取视频，请检查网络、代理和下载组件是否为最新版。':'Unable to connect or fetch the video. Check your network, proxy and downloader version.',
  '选择默认保存文件夹':'Choose default save folder','保存有声 MP4':'Save MP4 with audio','保存并下载':'Save & download','MP4 视频':'MP4 video',
  '开启电脑微信视频号捕捉':'Start desktop WeChat capture','允许 ClipDesk 配置本机视频号捕捉？':'Allow ClipDesk to configure local Channels capture?',
  '允许并开始捕捉':'Allow & start capture','退出 ClipDesk':'Quit ClipDesk','还有下载任务正在进行':'Downloads are still running','退出会取消尚未完成的任务。':'Quitting will cancel unfinished downloads.','继续下载':'Continue downloading','取消任务并退出':'Cancel downloads & quit','ClipDesk 启动失败':'ClipDesk could not start'
};
pairs['将为当前 Windows 用户安装 ClipDesk 本地证书，并临时把系统代理切换至本机捕捉服务。仅解析视频号页面和播放数据；其他 HTTPS 连接直接转发。已有代理会暂时被切换。停止捕捉或退出后恢复原代理并移除本次安装的证书；异常退出由后台恢复程序处理。\n\n开启后，请关闭并重新打开微信的视频号播放窗口，再播放需要保存的视频。'] = 'ClipDesk will install a local certificate for the current Windows user and temporarily switch the system proxy to the local capture service. Only Channels pages and playback data are inspected; other HTTPS connections pass through. Your existing proxy is temporarily replaced. Stopping capture or quitting restores it and removes the certificate added for this session. A background recovery process handles unexpected exits.\n\nAfter enabling capture, close and reopen the Channels player in WeChat, then play the video you want to save.';
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fragmentPattern = new RegExp(Object.keys(pairs).sort((a,b)=>b.length-a.length).map(escaped).join('|'),'g');
export function translate(text, language='zh') {
  if(language!=='en')return String(text);
  let result=String(text);
  result=result.replace(/(\d+) 种可用清晰度/g,'$1 available qualities').replace(/(\d+) 个任务正在进行/g,'$1 active downloads').replace(/(\d+) 个视频已保存/g,'$1 videos saved').replace(/预计约 (.+?) · 实际以导出为准/g,'About $1 · Final size may vary').replace(/正在下载 · ([\d.]+) MB\/s/g,'Downloading · $1 MB/s');
  return result.replace(fragmentPattern, value=>pairs[value]);
}
const originals=new WeakMap();
const protectedContent='#video-title,#video-channel,#default-directory-label,.job-title,.job-destination,.captured-detail h3,.captured-detail p,[data-user-content],script,style,textarea';
export function applyLanguage(document,language) {
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  const walker=document.createTreeWalker(document.documentElement,4);
  let node;
  while((node=walker.nextNode())){
    if(node.parentElement?.closest(protectedContent)||node.parentElement?.closest('option[value="zh"]'))continue;
    const previous=originals.get(node),current=node.nodeValue;
    const original=previous&&(current===previous.output||current===previous.original)?previous.original:current;
    const output=translate(original,language);originals.set(node,{original,output});if(current!==output)node.nodeValue=output;
  }
  for(const element of document.querySelectorAll('[placeholder],[aria-label],[alt],[title]')){
    if(element.closest(protectedContent))continue;
    let attributes=originals.get(element);if(!attributes){attributes={};originals.set(element,attributes);}
    for(const name of ['placeholder','aria-label','alt','title'])if(element.hasAttribute(name)){
      const current=element.getAttribute(name),previous=attributes[name];
      const original=previous&&(current===previous.output||current===previous.original)?previous.original:current;
      const output=translate(original,language);attributes[name]={original,output};if(current!==output)element.setAttribute(name,output);
    }
  }
}
export function watchLanguage(document,getLanguage){
  let queued=false;
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;applyLanguage(document,getLanguage());});});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','alt','title']});
  applyLanguage(document,getLanguage());return observer;
}
