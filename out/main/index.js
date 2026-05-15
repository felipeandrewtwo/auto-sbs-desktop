"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
function getTokenFile() {
  if (electron.app && !electron.app.isReady()) {
    return path.join(process.cwd(), "desktop-session.bin");
  }
  return path.join(electron.app.getPath("userData"), "session.bin");
}
function setToken(token) {
  const tokenFile = getTokenFile();
  const payload = electron.safeStorage.isEncryptionAvailable() ? electron.safeStorage.encryptString(token) : Buffer.from(token, "utf8");
  fs.writeFileSync(tokenFile, payload);
}
function getToken() {
  const tokenFile = getTokenFile();
  if (!fs.existsSync(tokenFile)) return null;
  try {
    const payload = fs.readFileSync(tokenFile);
    if (electron.safeStorage.isEncryptionAvailable()) {
      return electron.safeStorage.decryptString(payload);
    }
    return payload.toString("utf8");
  } catch {
    return null;
  }
}
function clearToken() {
  const tokenFile = getTokenFile();
  if (fs.existsSync(tokenFile)) {
    fs.unlinkSync(tokenFile);
  }
}
const isDev = !electron.app.isPackaged;
let win = null;
function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) electron.shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.once("ready-to-show", () => win?.show());
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electron.ipcMain.handle("open-external", async (_event, url) => {
    if (!isSafeExternalUrl(url)) return false;
    await electron.shell.openExternal(url);
    return true;
  });
  electron.ipcMain.handle("auth:get-token", () => getToken());
  electron.ipcMain.handle("auth:set-token", (_event, token) => setToken(token));
  electron.ipcMain.handle("auth:clear-token", () => clearToken());
  createWindow();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
