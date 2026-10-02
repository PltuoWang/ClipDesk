import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import forge from 'node-forge';
import { channelsKeystream } from './isaac64.mjs';

const PAGE_HOSTS = new Set(['channels.weixin.qq.com', 'channels.wechat.com', 'res.wx.qq.com']);
export function validMediaUrl(raw) {
  try { const url=new URL(raw); return url.protocol==='https:' && !url.username && !url.password && (!url.port || url.port==='443') && (url.hostname==='finder.video.qq.com' || url.hostname.endsWith('.finder.video.qq.com') || url.hostname==='mpvideo.qpic.cn'); } catch { return false; }
}
// Inspect only Channels objects. Neither messages nor request cookies are retained.
export function parseFeeds(input) {
  const feeds=[], seen=new Set(); let count=0;
  const visit=(item,depth=0)=>{
    if (!item || typeof item!=='object' || depth>16 || ++count>10000) return;
    const desc=item.objectDesc || item.object_desc || (Array.isArray(item.media)?item:null);
    if (desc && Array.isArray(desc.media)) for (const media of desc.media.slice(0,8)) {
      if (Number(media.mediaType)===9) continue;
      const raw=String(media.url||'')+String(media.urlToken||'');
      if (!validMediaUrl(raw)) continue;
      const key=media.decodeKey ?? media.decode_key ?? '';
      if (typeof key==='number' && !Number.isSafeInteger(key)) continue;
      if (key && (!/^\d{1,20}$/.test(String(key)) || BigInt(key)>0xffffffffffffffffn)) continue;
      const signature=createHash('sha256').update(raw.split('?')[0]).digest('hex');
      if (seen.has(signature)) continue; seen.add(signature);
      const title=String(desc.description||item.description||'').replace(/\s+/g,' ').trim().slice(0,240);
      feeds.push({ signature, url:raw, decodeKey:String(key), title:title||'未提供名称的视频号视频', titleParsed:!!title, channel:String(item.contact?.nickname||item.nickname||'微信视频号').slice(0,100), duration:Number(media.videoPlayLen||media.duration||0), height:Number(media.height||0), size:Number(media.fileSize||0) });
    }
    for (const child of Object.values(item)) if (typeof child==='object') visit(child,depth+1);
  };
  visit(input); return feeds;
}
function parseJSON(text) {
  // Prevent JSON's double precision from losing a numeric 64-bit key.
  return JSON.parse(text.replace(/("(?:decodeKey|decode_key)"\s*:\s*)(\d+)/g,'$1"$2"'));
}
export function modifyResponse(host, pathname, type, text, endpoint) {
  if ((host==='channels.weixin.qq.com'||host==='channels.wechat.com') && /text\/html/.test(type)) {
    const script=`<script>(()=>{if(window.__clipdeskCapture)return;window.__clipdeskCapture=1;const endpoint=${JSON.stringify(endpoint)};const send=x=>{try{fetch(endpoint,{method:'POST',mode:'no-cors',body:JSON.stringify(x)})}catch(e){}};const f=window.fetch;window.fetch=function(...a){const p=f.apply(this,a);if(!String(a[0]).includes('__clipdesk'))p.then(r=>{if((r.headers.get('content-type')||'').includes('json'))r.clone().json().then(send).catch(()=>{})}).catch(()=>{});return p};const o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(...a){this.addEventListener('load',()=>{try{if(!String(a[1]).includes('__clipdesk'))send(this.responseType==='json'?this.response:JSON.parse(this.responseText))}catch(e){}});return o.apply(this,a)}})();</script>`;
    // Changing script URLs makes WeChat fetch fresh code rather than a cached getter.
    return text.replace(/\s+integrity=["'][^"']+["']/g,'').replace(/(<script[^>]+src=["'])([^"']+\.js(?:\?[^"']*)?)(["'])/g,(_match,before,url,after)=>before+url+(url.includes('?')?'&':'?')+'clipdesk_capture=1'+after).replace(/<head([^>]*)>/i,`<head$1>${script}`);
  }
  if (host==='res.wx.qq.com' && /web-finder\/res\/js\//.test(pathname) && /javascript|text\/plain/.test(type)) {
    // Some PC clients hydrate objects from their internal bridge instead of XHR.
    return text.replace(/\.js(["'])/g,'.js?clipdesk_capture=1$1').replace(/get\s+media\s*\(\)\s*\{/g, match => `${match}try{if(this.objectDesc)fetch(${JSON.stringify(endpoint)},{method:'POST',mode:'no-cors',body:JSON.stringify(this.objectDesc)});}catch(_clipdeskError){}`);
  }
  return text;
}
async function certificateAuthority(directory) {
  await mkdir(directory,{recursive:true}); const keyFile=path.join(directory,'ca-key.pem'), certFile=path.join(directory,'ca.pem');
  let key, cert;
  try { key=forge.pki.privateKeyFromPem(await readFile(keyFile,'utf8')); cert=forge.pki.certificateFromPem(await readFile(certFile,'utf8')); if(cert.validity.notAfter<Date.now()) throw Error('expired'); }
  catch {
    const keys=forge.pki.rsa.generateKeyPair(2048); key=keys.privateKey; cert=forge.pki.createCertificate(); cert.publicKey=keys.publicKey; cert.serialNumber='01'+randomBytes(16).toString('hex'); cert.validity.notBefore=new Date(Date.now()-86400000); cert.validity.notAfter=new Date(Date.now()+365*86400000);
    const attrs=[{name:'commonName',value:'ClipDesk Local Channels Capture'}]; cert.setSubject(attrs); cert.setIssuer(attrs);
    cert.setExtensions([{name:'basicConstraints',cA:true},{name:'keyUsage',keyCertSign:true,cRLSign:true},{name:'subjectKeyIdentifier'}]); cert.sign(key,forge.md.sha256.create());
    await writeFile(keyFile,forge.pki.privateKeyToPem(key),{mode:0o600}); await writeFile(certFile,forge.pki.certificateToPem(cert));
  }
  return {key,cert,certFile,thumbprint:forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex().toUpperCase()};
}
export async function createCapture({directory, platform, request=https.request, downloadRequest=https.get, connect=net.connect}={}) {
  let active=false, starting=false, proxy=null, ca=null, error='', received=0, lastSeen=0;
  const feeds=new Map(), sockets=new Set(), leafs=new Map(); const nonce=randomBytes(24).toString('hex');
  const endpoint=`https://channels.weixin.qq.com/__clipdesk_capture/${nonce}`;
  const observe=text=>{try{for(const feed of parseFeeds(typeof text==='string'?parseJSON(text):text)){received++;lastSeen=Date.now(); const old=[...feeds].find(([,x])=>x.signature===feed.signature); const id=old?.[0]||randomUUID(); feeds.set(id,{...feed,id,capturedAt:Date.now()}); if(feeds.size>100)feeds.delete(feeds.keys().next().value);}}catch{/* Unrelated responses are ignored. */}};
  const visible=()=>[...feeds].map(([id,f])=>({id,title:f.title,titleParsed:f.titleParsed,channel:f.channel,height:f.height,duration:f.duration,size:f.size,capturedAt:f.capturedAt,encrypted:!!f.decodeKey})).reverse();
  function leaf(host) {
    if(leafs.has(host))return leafs.get(host);
    const cert=forge.pki.createCertificate(); cert.publicKey=ca.cert.publicKey; cert.serialNumber='01'+randomBytes(16).toString('hex'); cert.validity.notBefore=new Date(Date.now()-86400000); cert.validity.notAfter=new Date(Date.now()+30*86400000); cert.setSubject([{name:'commonName',value:host}]);cert.setIssuer(ca.cert.subject.attributes); cert.setExtensions([{name:'basicConstraints',cA:false},{name:'keyUsage',digitalSignature:true,keyEncipherment:true},{name:'extKeyUsage',serverAuth:true},{name:'subjectAltName',altNames:[{type:2,value:host}]}]);cert.sign(ca.key,forge.md.sha256.create());
    const pair={key:forge.pki.privateKeyToPem(ca.key),cert:forge.pki.certificateToPem(cert)};leafs.set(host,pair);return pair;
  }
  function track(socket) { sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{}); }
  async function forward(req,res,host) {
    try {
      if(req.url===`/__clipdesk_capture/${nonce}`) {
        if(req.method!=='POST'){res.writeHead(405);res.end();return;}
        let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024)throw Error('too large');chunks.push(chunk);} observe(Buffer.concat(chunks).toString('utf8'));res.writeHead(204);res.end();return;
      }
      const headers={...req.headers,host,'accept-encoding':'identity'};delete headers['proxy-connection'];delete headers['proxy-authorization'];
      const upstream=request({hostname:host,port:443,path:req.url,method:req.method,headers,timeout:30000,rejectUnauthorized:true},async response=>{
        const type=String(response.headers['content-type']||''); const contentLength=Number(response.headers['content-length']||0);
        const inspect=/json|text\/html|javascript/.test(type) && contentLength<16*1024*1024;
        const outHeaders={...response.headers};delete outHeaders['strict-transport-security'];
        if(!inspect){res.writeHead(response.statusCode,outHeaders);response.pipe(res);return;}
        try{
          const chunks=[];let size=0;for await(const chunk of response){size+=chunk.length;if(size>16*1024*1024)throw Error('响应过大');chunks.push(chunk);}
          let bytes=Buffer.concat(chunks);const encoding=response.headers['content-encoding'];
          if(encoding==='gzip')bytes=gunzipSync(bytes,{maxOutputLength:16*1024*1024});else if(encoding==='deflate')bytes=inflateSync(bytes,{maxOutputLength:16*1024*1024});else if(encoding==='br')bytes=brotliDecompressSync(bytes,{maxOutputLength:16*1024*1024});
          delete outHeaders['content-encoding'];let text=bytes.toString('utf8');if(/json/.test(type))observe(text);
          const changed=modifyResponse(host,req.url,type,text,endpoint);
          if(changed!==text){text=changed;delete outHeaders['content-security-policy'];delete outHeaders['content-security-policy-report-only'];delete outHeaders['etag'];outHeaders['cache-control']='no-store';}
          delete outHeaders['content-length'];delete outHeaders['transfer-encoding'];outHeaders['content-length']=Buffer.byteLength(text);res.writeHead(response.statusCode,outHeaders);res.end(text);
        }catch{res.destroy();}
      });
      upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('上游连接失败');});req.pipe(upstream);res.on('close',()=>upstream.destroy());
    }catch{if(!res.headersSent)res.writeHead(400);res.end();}
  }
  async function start() {
    if(active)return state();if(starting)throw Error('捕捉正在启动，请稍候。');starting=true;error='';
    try{
      if(!platform)throw Error('电脑微信捕捉需要 ClipDesk Windows 桌面版。');
      ca=await certificateAuthority(directory);
      proxy=http.createServer((req,res)=>{ // Non-Channels HTTP traffic is passed through without inspection.
        let url;try{url=new URL(req.url);if(url.protocol!=='http:')throw Error();}catch{res.writeHead(400);res.end();return;}
        const headers={...req.headers};delete headers['proxy-authorization'];delete headers['proxy-connection'];
        const up=http.request(url,{method:req.method,headers,timeout:30000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});up.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});up.on('timeout',()=>up.destroy());req.pipe(up);res.on('close',()=>up.destroy());
      });
      proxy.on('connection',track);
      proxy.on('connect',(req,socket,head)=>{
        const match=req.url.match(/^([a-z0-9.-]+):(\d+)$/i);if(!match||Number(match[2])<1||Number(match[2])>65535){socket.destroy();return;}const host=match[1].toLowerCase(),port=Number(match[2]);
        if(PAGE_HOSTS.has(host)&&port===443){
          const tunnel=https.createServer(leaf(host),(r,s)=>forward(r,s,host));tunnel.on('tlsClientError',()=>{error='微信未接受捕捉证书，请停止捕捉后重新开启，并重启视频号窗口。';});tunnel.on('connection',track);socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)socket.unshift(head);tunnel.emit('connection',socket);
        }else{
          const up=connect({host,port});track(up);up.once('connect',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)up.write(head);socket.pipe(up);up.pipe(socket);});up.on('error',()=>socket.destroy());socket.on('close',()=>up.destroy());
        }
      });
      await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
      await platform.enable({port:proxy.address().port,certFile:ca.certFile,thumbprint:ca.thumbprint});active=true;return state();
    }catch(e){error=e.message;await stop();throw e;}finally{starting=false;}
  }
  async function stop(){
    // Restore first so the user's network never points at a closed proxy.
    await platform?.disable(); active=false;
    for(const socket of sockets)socket.destroy();sockets.clear();
    if(proxy){await new Promise(resolve=>proxy.close(resolve));proxy=null;}leafs.clear();return state();
  }
  function state(){return {available:!!platform,active,starting,port:active?proxy.address().port:null,count:feeds.size,received,lastSeen,error,items:visible()};}
  function select(id){const feed=feeds.get(id);if(!feed)throw Error('捕捉记录已失效，请在微信中重新播放。');return {...feed,id};}
  async function download(feed,file,signal,onProgress){
    if(!validMediaUrl(feed.url))throw Error('视频地址无效，请重新播放。');
    const keystream=feed.decodeKey?channelsKeystream(feed.decodeKey):null;let offset=0;
    const source=await new Promise((resolve,reject)=>{
      const req=downloadRequest(feed.url,{headers:{Referer:'https://channels.weixin.qq.com/', 'User-Agent':'Mozilla/5.0'},signal,timeout:30000},res=>{if(res.statusCode!==200){res.resume();reject(Error('视频地址已过期或暂不可下载，请重新播放后再试。'));}else resolve(res);});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('视频下载超时。')));
    });
    const total=Number(source.headers['content-length']||feed.size||0);
    await pipeline(source,new Transform({transform(chunk,_encoding,callback){if(keystream)for(let j=0;j<chunk.length&&offset+j<keystream.length;j++)chunk[j]^=keystream[offset+j];offset+=chunk.length;if(total)onProgress?.(Math.min(74,Math.round(offset/total*74)));callback(null,chunk);}}),createWriteStream(file),{signal});
    if(!offset)throw Error('视频下载为空，请重新播放。');return file;
  }
  return {start,stop,state,select,download,observe,clear:()=>{feeds.clear();return state();}};
}
