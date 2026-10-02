import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { createApp } from '../server.mjs';
import { normalizeUrl, commonArgs, binary, runProcess, probeFile } from '../core.mjs';
import { createCapture } from '../channels/capture.mjs';
import { translate } from '../public/i18n.mjs';
test('Bilibili BV, av, b23 links and explicit parts normalize safely; direct access does not override a user proxy',()=>{
 assert.equal(normalizeUrl('https://m.bilibili.com/video/BV13x41117TL/?p=2&share_source=copy'),'https://www.bilibili.com/video/BV13x41117TL?p=2');
 assert.equal(normalizeUrl('https://www.bilibili.com/video/av8903802'),'https://www.bilibili.com/video/av8903802?p=1');
 assert.equal(normalizeUrl('https://b23.tv/aBc123/?share=1'),'https://b23.tv/aBc123');
 for(const url of ['https://bilibili.com.evil.test/video/BV13x41117TL','https://b23.tv.evil.test/aBc123','https://www.bilibili.com/video/BV13x41117TL?p=0','https://www.bilibili.com:9443/video/BV13x41117TL','https://bilibili.com/video/av0','https://b23.tv/a/b'])assert.throws(()=>normalizeUrl(url));
 const direct=commonArgs('','https://www.bilibili.com/video/BV13x41117TL?p=1');assert.equal(direct[direct.indexOf('--proxy')+1],'');
 const explicit=commonArgs('http://127.0.0.1:7890','https://b23.tv/aBc123');assert.equal(explicit[explicit.indexOf('--proxy')+1],'http://127.0.0.1:7890');
});
test('save folder starts at default, remembers the last confirmed selection across restart, and ignores cancellation; language persists',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'clipdesk-memory-'));let app,restarted;const one=path.join(root,'first'),two=path.join(root,'second');await mkdir(one);await mkdir(two);const calls=[],langs=[];let selected={path:path.join(two,'one.mp4')};
 const nativeHost={chooseSavePath:async initial=>{calls.push(initial);return selected;},setLanguage:lang=>langs.push(lang)};
 const options={downloadRoot:path.join(root,'tasks'),preferencesFile:path.join(root,'settings.json'),defaultSaveDirectory:one,nativeHost};
 try{
  app=await createApp(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${app.server.address().port}`;
  const post=async(url,data)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':app?.token||restarted.token},body:JSON.stringify(data)}).then(r=>r.json());
  await post('/api/export-target',{title:'first'});assert.equal(path.dirname(calls[0]),one);
  selected=null;assert.equal((await post('/api/export-target',{title:'cancelled'})).cancelled,true);assert.equal(path.dirname(calls[1]),two);
  assert.equal((await fetch(base+'/api/settings').then(r=>r.json())).lastSaveDirectory,two);
  await post('/api/settings/language',{language:'en'});assert.equal(langs.at(-1),'en');
  await app.close();app=undefined;restarted=await createApp(options);await new Promise(r=>restarted.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${restarted.server.address().port}`;
  const settings=await fetch(base+'/api/settings').then(r=>r.json());assert.equal(settings.lastSaveDirectory,two);assert.equal(settings.defaultSaveDirectory,one);assert.equal(settings.language,'en');
  await post('/api/export-target',{title:'after restart'});assert.equal(path.dirname(calls.at(-1)),two);
 }finally{await app?.close();await restarted?.close();await rm(root,{recursive:true,force:true});}
});
test('copying a captured link is explicit, authenticated, and does not leak decoding keys in the response',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'clipdesk-copy-'));let app;let copied='';const capture=await createCapture({directory:root});
 capture.observe({description:'标题',media:[{url:'https://finder.video.qq.com/source.mp4?token=short-lived',decodeKey:'123456789'}]});
 try{
  app=await createApp({downloadRoot:path.join(root,'tasks'),capture,nativeHost:{copyText:async text=>{copied=text;}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`,id=capture.state().items[0].id;
  assert.equal((await fetch(base+'/api/capture/copy-link',{method:'POST',body:JSON.stringify({id})})).status,403);
  const response=await fetch(base+'/api/capture/copy-link',{method:'POST',headers:{'X-App-Token':app.token},body:JSON.stringify({id})}).then(r=>r.json());assert.deepEqual(response,{copied:true,encrypted:true});assert.ok(copied.includes('token=short-lived'));assert.ok(!JSON.stringify(response).includes('123456789'));
 }finally{await app?.close();await rm(root,{recursive:true,force:true});}
});
test('English translates controls, statuses and native prompts; Chinese remains unchanged',()=>{
 assert.equal(translate('视频号捕捉','en'),'Channels capture');assert.equal(translate('2 个任务正在进行','en'),'2 active downloads');assert.equal(translate('保存并下载','en'),'Save & download');assert.equal(translate('复制下载链接','en'),'Copy download link');assert.equal(translate('视频号捕捉','zh'),'视频号捕捉');
});
test('default Channels export remuxes HEVC and AAC without changing encoded video or audio packets', {timeout:60000},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'clipdesk-source-quality-'));let app;
 try{
  const input=path.join(root,'source.mp4');await runProcess(binary('ffmpeg'),['-hide_banner','-nostdin','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=15','-f','lavfi','-i','sine=frequency=700:sample_rate=48000','-t','1','-c:v','libx265','-preset','ultrafast','-x265-params','pools=1:log-level=error','-c:a','aac',input]);
  const capture={state:()=>({active:false}),stop:async()=>{},select:()=>({title:'原画质',height:180,url:'https://finder.video.qq.com/test.mp4'}),download:async(_feed,file)=>{await copyFile(input,file);return file;}};
  app=await createApp({downloadRoot:path.join(root,'tasks'),capture});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'X-App-Token':app.token},body:JSON.stringify(data)}).then(r=>r.json());const info=await post('/api/capture/info',{id:'test'}),job=await post('/api/jobs',{infoId:info.id,formatId:'captured'});
  let final;for(let i=0;i<100;i++){final=(await fetch(base+'/api/jobs').then(r=>r.json()))[0];if(['done','error'].includes(final.status))break;await new Promise(r=>setTimeout(r,40));}assert.equal(final.status,'done',final.message);
  const output=path.join(root,'tasks',job.id,'output.mp4'),probe=await probeFile(output);assert.equal(probe.streams.find(s=>s.codec_type==='video').codec_name,'hevc');assert.equal(probe.streams.find(s=>s.codec_type==='audio').codec_name,'aac');
  for(const stream of ['0:v:0','0:a:0']){const hash=file=>runProcess(binary('ffmpeg'),['-v','error','-nostdin','-i',file,'-map',stream,'-c','copy','-f','hash','-hash','sha256','-']);assert.equal(await hash(output),await hash(input));}
 }finally{await app?.close();await rm(root,{recursive:true,force:true});}
});
