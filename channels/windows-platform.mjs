import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../core.mjs';
const script=fileURLToPath(new URL('./windows-proxy.ps1',import.meta.url));
export function windowsPlatform(directory){
  const args=mode=>['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode,'-Directory',directory];
  let watcher=null;
  return {
    recover:()=>runProcess('powershell.exe',args('Recover'),{timeout:20000}),
    async enable({port,certFile,thumbprint}){
      await runProcess('powershell.exe',[...args('Enable'),'-Port',String(port),'-CertFile',certFile,'-Thumbprint',thumbprint],{timeout:30000});
      watcher=spawn('powershell.exe',[...args('Watchdog'),'-ParentId',String(process.pid)],{windowsHide:true,detached:true,stdio:'ignore'});
      await new Promise((resolve,reject)=>{watcher.once('spawn',resolve);watcher.once('error',reject);});watcher.unref();
    },
    async disable(){await runProcess('powershell.exe',args('Disable'),{timeout:20000});if(watcher){watcher.kill();watcher=null;}}
  };
}
