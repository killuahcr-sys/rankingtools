'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  chooseImages: () => ipcRenderer.invoke('images:choose'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  exportExcel: (rows) => ipcRenderer.invoke('excel:export', rows)
});
