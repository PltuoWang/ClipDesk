const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clipdeskDesktop', Object.freeze({ isDesktop: true, version: '2.1.0', windowAction: action => { if (!['minimize', 'maximize', 'close'].includes(action)) return Promise.reject(new Error('Invalid action')); return ipcRenderer.invoke('window:action', action); } }));
