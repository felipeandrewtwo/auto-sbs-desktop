import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { clearToken, getToken, setToken } from "./token-store";
import {
  getSubmitterConfig,
  getSubmitterPrefillProfile,
  loginLinkedInAndSaveSession,
  runSubmitter,
  runSubmitterSingle,
  setGeminiApiKey,
  setSubmitterPrefillProfile,
} from "./submitter/service";
import type { SubmitterPrefillProfile, VagaAnalisada } from "./submitter/types";
import { getCurrentUserCv } from "./submitter/user-cv";

function loadCurrentUserCv(): Promise<string> {
  const apiUrl = process.env.VITE_API_URL || import.meta.env.VITE_API_URL || "http://localhost:3000";
  return getCurrentUserCv(getToken, apiUrl);
}

const isDev = !app.isPackaged;
let win: BrowserWindow | null = null;

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function createWindow(): void {
  win = new BrowserWindow({
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
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
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

app.whenReady().then(() => {
  ipcMain.handle("open-external", async (_event, url: string) => {
    if (!isSafeExternalUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("auth:get-token", () => getToken());
  ipcMain.handle("auth:set-token", (_event, token: string) => setToken(token));
  ipcMain.handle("auth:clear-token", () => clearToken());
  ipcMain.handle("submitter:get-config", () => getSubmitterConfig());
  ipcMain.handle("submitter:get-prefill-profile", () => getSubmitterPrefillProfile());
  ipcMain.handle("submitter:set-gemini-key", (_event, key: string) => setGeminiApiKey(key));
  ipcMain.handle("submitter:set-prefill-profile", (_event, profile: SubmitterPrefillProfile) =>
    setSubmitterPrefillProfile(profile),
  );
  ipcMain.handle("submitter:get-user-cv", () => loadCurrentUserCv());
  ipcMain.handle("submitter:linkedin-login", () => loginLinkedInAndSaveSession());
  ipcMain.handle("submitter:run", (_event, vagas: VagaAnalisada[]) => runSubmitter(vagas, loadCurrentUserCv));
  ipcMain.handle("submitter:run-single", (_event, vaga: VagaAnalisada) => runSubmitterSingle(vaga, loadCurrentUserCv));

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
