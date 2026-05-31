const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  processEps: (filePath) => ipcRenderer.invoke('process-eps', filePath),
  removeBgLocal: (filePath) => ipcRenderer.invoke('remove-bg-local', filePath),
  removeBgApi: (filePath, apiKey) => ipcRenderer.invoke('remove-bg-api', filePath, apiKey),
  removeBgHf: (filePath, token) => ipcRenderer.invoke('remove-bg-hf', filePath, token),
  saveKey: (provider, key, index) => ipcRenderer.invoke('save-key', provider, key, index),
  getKey: (provider, index) => ipcRenderer.invoke('get-key', provider, index),
  deleteKey: (provider, index) => ipcRenderer.invoke('delete-key', provider, index),
  saveAllKeys: (allKeys) => ipcRenderer.invoke('save-all-keys', allKeys),
  loadAllKeys: () => ipcRenderer.invoke('load-all-keys'),
  writeMetadata: (filePath, title, description, keywords, categories) => ipcRenderer.invoke('write-metadata', filePath, title, description, keywords, categories),
  saveFtpConfig: (config) => ipcRenderer.invoke('save-ftp-config', config),
  getFtpConfig: () => ipcRenderer.invoke('get-ftp-config'),
  testFtp: (config) => ipcRenderer.invoke('test-ftp', config),
  uploadFtp: (config, filePaths, jobId) => ipcRenderer.invoke('upload-ftp', config, filePaths, jobId),
  cancelFtp: (jobId) => ipcRenderer.invoke('cancel-ftp', jobId),
  onFtpProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ftp-progress', listener);
    return () => {
      ipcRenderer.removeListener('ftp-progress', listener);
    };
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  generateEpsJpg: (filePath, addWhiteBgToPng) => ipcRenderer.invoke('generate-eps-jpg', filePath, addWhiteBgToPng),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFiles: (options) => ipcRenderer.invoke('select-files', options),
  saveFile: (filePath, bufferArray) => ipcRenderer.invoke('save-file', filePath, bufferArray),
  extractVideoFrame: (filePath) => ipcRenderer.invoke('extract-video-frame', filePath),
  startColab: (url) => ipcRenderer.invoke('start-colab', url),
  stopColab: () => ipcRenderer.invoke('stop-colab'),
  showColab: () => ipcRenderer.invoke('show-colab'),
  startKaggle: (url) => ipcRenderer.invoke('start-kaggle', url),
  fetchImage: (url) => ipcRenderer.invoke('fetch-image', url),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  getColabUrl: () => ipcRenderer.invoke('get-colab-url'),
  onColabStatus: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('colab-status', listener);
    return () => {
      ipcRenderer.removeListener('colab-status', listener);
    };
  }
});

