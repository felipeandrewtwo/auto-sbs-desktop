"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("desktop", {
  openExternal: (url) => electron.ipcRenderer.invoke("open-external", url),
  auth: {
    getToken: () => electron.ipcRenderer.invoke("auth:get-token"),
    setToken: (token) => electron.ipcRenderer.invoke("auth:set-token", token),
    clearToken: () => electron.ipcRenderer.invoke("auth:clear-token")
  },
  submitter: {
    getConfig: () => electron.ipcRenderer.invoke("submitter:get-config"),
    setGeminiKey: (key) => electron.ipcRenderer.invoke("submitter:set-gemini-key", key),
    getUserCv: (token, apiUrl) => electron.ipcRenderer.invoke("submitter:get-user-cv", { token, apiUrl }),
    linkedinLogin: () => electron.ipcRenderer.invoke("submitter:linkedin-login"),
    run: (vagas) => electron.ipcRenderer.invoke("submitter:run", vagas),
    runSingle: (vaga) => electron.ipcRenderer.invoke("submitter:run-single", vaga)
  }
});
