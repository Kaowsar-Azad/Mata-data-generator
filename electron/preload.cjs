const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  processEps: (filePath) => ipcRenderer.invoke('process-eps', filePath)
});
