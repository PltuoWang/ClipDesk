import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCapture, parseFeeds, validMediaUrl, modifyResponse } from '../channels/capture.mjs';
import { channelsKeystream } from '../channels/isaac64.mjs';
import { createApp } from '../server.mjs';
import { binary, runProcess, probeFile } from '../core.mjs';
const metadata={object:{contact:{nickname:'测试作者'},objectDesc:{description:'自动解析的视频名称 / 夜空',media:[{url:'https://finder.video.qq.com/251/fixture.mp4?ticket=test',decodeKey:'18446744073709551615',height:180,videoPlayLen:2,mediaType:4}]}}};
test('ISAAC-64 matches independent published decoder output, including a maximum 64-bit key',()=>{
  // Cross-checked against the Apache-2.0 WASM decoder in putyy/res-downloader.
  for(const [key,hash] of [['0','e1662af3b7e59867c919ad19055fc8cecea2b154d37e1459b2f96d1da14cef1f'],['123456789','1f972db9d304b9c779a59f9830f1b03c98e247a4e1102d926996dd61b60d8e67'],['18446744073709551615','5afbffd76305e81467f97c6370fa07916e9b197611bf5c357a854eb92a6354a1']])assert.equal(createHash('sha256').update(channelsKeystream(key)).digest('hex'),hash);
});
test('Channels extraction rejects arbitrary hosts, preserves 64-bit keys, and obtains actual titles',()=>{
  const feed=parseFeeds(metadata)[0];assert.equal(feed.title,'自动解析的视频名称 / 夜空');assert.equal(feed.decodeKey,'18446744073709551615');assert.equal(feed.channel,'测试作者');
  for(const url of ['https://finder.video.qq.com.evil.invalid/a','http://finder.video.qq.com/a','https://127.0.0.1/a','https://user@finder.video.qq.com/a'])assert.equal(validMediaUrl(url),false);
  assert.equal(parseFeeds({description:'image',media:[{url:feed.url,mediaType:9}]}).length,0);
  assert.equal(parseFeeds({description:'bad key',media:[{url:feed.url,decodeKey:18446744073709551615}]}).length,0);
});
test('injected PC getter reports the current media object without changing the getter result',async()=>{
  const source='globalThis.item=new class {constructor(){this.objectDesc='+JSON.stringify(metadata.object.objectDesc)+'}get media(){return this.objectDesc.media}}';
  const modified=modifyResponse('res.wx.qq.com','/web/web-finder/res/js/virtual_svg-icons-register.publish.js','application/javascript',source,'https://channels.weixin.qq.com/__clipdesk_capture/token');
  const reports=[];const context=vm.createContext({fetch:(url,options)=>reports.push({url,body:JSON.parse(options.body)})});vm.runInContext(modified,context);vm.runInContext('item.media',context);
  assert.equal(reports.length,1);assert.equal(reports[0].body.description,metadata.object.objectDesc.description);
  assert.equal(modifyResponse('unrelated.example','/app.js','application/javascript',source,'x'),source);
});
test('local HTTPS proxy captures metadata, rewrites PC page, deduplicates feeds, and restores configuration on stop', {timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'clipdesk-capture-'));let capture,proxyPort,restores=0,upstream;
  try{
    upstream=http.createServer((req,res)=>{if(req.url==='/feed'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(metadata));}else{res.setHeader('Content-Type','text/html');res.end('<html><head><script src="https://res.wx.qq.com/a.js" integrity="old"></script></head><body>Fixture</body></html>');}});
    await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
    capture=await createCapture({directory:dir,platform:{enable:async({port})=>{proxyPort=port;},disable:async()=>{restores++;}},request:(options,cb)=>http.request({...options,hostname:'127.0.0.1',port:upstream.address().port},cb)});
    await capture.start();assert.equal(capture.state().active,true);
    const ca=await readFile(path.join(dir,'ca.pem'));
    const get=async target=>{
      const socket=net.connect(proxyPort,'127.0.0.1');await new Promise((resolve,reject)=>{socket.once('error',reject);socket.once('connect',()=>socket.write('CONNECT channels.weixin.qq.com:443 HTTP/1.1\r\nHost: channels.weixin.qq.com:443\r\n\r\n'));socket.once('data',chunk=>{assert.match(chunk.toString(),/200 Connection/);resolve();});});
      const secure=tls.connect({socket,servername:'channels.weixin.qq.com',ca});
      return new Promise((resolve,reject)=>{let text='';secure.once('secureConnect',()=>secure.write(`GET ${target} HTTP/1.1\r\nHost: channels.weixin.qq.com\r\nConnection: close\r\n\r\n`));secure.on('data',x=>text+=x);secure.on('end',()=>{secure.destroy();resolve(text);});secure.on('error',reject);});
    };
    assert.match(await get('/'),/__clipdesk_capture/);await get('/feed');await get('/feed');
    const state=capture.state();assert.equal(state.count,1);assert.equal(state.items[0].title,metadata.object.objectDesc.description);assert.ok(!JSON.stringify(state).includes('ticket=test'));assert.ok(!JSON.stringify(state).includes('18446744073709551615'));
    await capture.stop();assert.equal(capture.state().active,false);assert.equal(restores,1);
  }finally{await capture?.stop();if(upstream)await new Promise(r=>upstream.close(r));await rm(dir,{recursive:true,force:true});}
});
test('captured encrypted video becomes audible MP4 with parsed filename through the native save workflow', {timeout:60000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'clipdesk-wx-export-'));let capture,mediaServer,app;
  try{
    const source=path.join(dir,'fixture.mp4');
    await runProcess(binary('ffmpeg'),['-hide_banner','-nostdin','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','2','-c:v','libx264','-c:a','aac',source]);
    const encrypted=Buffer.from(await readFile(source)),mask=channelsKeystream(metadata.object.objectDesc.media[0].decodeKey);
    for(let i=0;i<encrypted.length&&i<mask.length;i++)encrypted[i]^=mask[i];
    mediaServer=http.createServer((_req,res)=>{res.setHeader('Content-Length',encrypted.length);res.write(encrypted.subarray(0,113));res.end(encrypted.subarray(113));});await new Promise(r=>mediaServer.listen(0,'127.0.0.1',r));
    capture=await createCapture({directory:path.join(dir,'ca'),downloadRequest:(_url,options,callback)=>http.get(`http://127.0.0.1:${mediaServer.address().port}`,options,callback)});capture.observe(metadata);
    const exported=path.join(dir,'自动解析的视频名称 _ 夜空.mp4');let proposed;
    app=await createApp({downloadRoot:path.join(dir,'tasks'),capture,defaultSaveDirectory:dir,nativeHost:{confirmCapture:async()=>false,chooseSavePath:async initial=>{proposed=initial;return {path:exported};}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const api=(url,data)=>fetch(base+url,{method:'POST',headers:{'X-App-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());
    const feed=capture.state().items[0],info=await api('/api/capture/info',{id:feed.id}),target=await api('/api/export-target',{title:info.title});
    assert.match(proposed,/自动解析的视频名称 _ 夜空\.mp4$/);
    const job=await api('/api/jobs',{infoId:info.id,formatId:'captured',targetId:target.targetId,videoBitrate:'1000',audioBitrate:'128'});
    let finished;for(let i=0;i<200;i++){finished=(await fetch(base+'/api/jobs').then(r=>r.json())).find(x=>x.id===job.id);if(['done','error'].includes(finished.status))break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(finished.status,'done',finished.message);assert.equal(finished.source,'channels');
    const probe=await probeFile(exported);assert.equal(probe.streams.find(s=>s.codec_type==='video').codec_name,'h264');assert.equal(probe.streams.find(s=>s.codec_type==='audio').codec_name,'aac');
    const pcm=path.join(dir,'audio.pcm');await runProcess(binary('ffmpeg'),['-hide_banner','-nostdin','-y','-i',exported,'-vn','-f','s16le',pcm]);const audio=await readFile(pcm);let peak=0;for(let i=0;i<audio.length-1;i+=2)peak=Math.max(peak,Math.abs(audio.readInt16LE(i)));assert.ok(peak>100);
    const record=await readFile(path.join(dir,'tasks',job.id,'job.json'),'utf8');assert.ok(!record.includes('ticket=test'));assert.ok(!record.includes('decodeKey'));
  }finally{await app?.close();await capture?.stop();if(mediaServer)await new Promise(r=>mediaServer.close(r));await rm(dir,{recursive:true,force:true});}
});
