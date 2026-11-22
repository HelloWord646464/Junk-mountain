const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isApp: true,
  quit: () => ipcRenderer.send('quit'),
  setFullscreen: on => ipcRenderer.send('fullscreen', on),
});
