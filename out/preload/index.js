"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("desktop", {
  openExternal: (url) => electron.ipcRenderer.invoke("open-external", url),
  auth: {
    getToken: () => electron.ipcRenderer.invoke("auth:get-token"),
    setToken: (token) => electron.ipcRenderer.invoke("auth:set-token", token),
    clearToken: () => electron.ipcRenderer.invoke("auth:clear-token")
  }
});
