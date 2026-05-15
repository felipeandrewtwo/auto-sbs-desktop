import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  auth: {
    getToken: () => ipcRenderer.invoke("auth:get-token") as Promise<string | null>,
    setToken: (token: string) => ipcRenderer.invoke("auth:set-token", token),
    clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  },
});
