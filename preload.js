const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => {
    // Deliberately strip event as it includes `sender`
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // New function to request opening an external link
  openExternalLink: (url) => {
    if (typeof url === 'string') { // Basic validation
      ipcRenderer.send('open-external-link', url);
    } else {
      console.error('Invalid URL passed to openExternalLink:', url);
    }
  },

  checkFileExists: (filePath) => {
    if (typeof filePath === 'string' && filePath.length > 0) {
      return ipcRenderer.invoke('check-file-exists', filePath);
    } else {
      console.error('[Preload:checkFileExists] Invalid filePath provided:', filePath);
      return Promise.resolve(false); // Return a resolved promise with false for invalid input
    }
  }
});
