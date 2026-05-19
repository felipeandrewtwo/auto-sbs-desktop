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
const ROOT_DIR = path.resolve(process.cwd());
const STATE_PATH = path.join(ROOT_DIR, "state.json");
const DESKTOP_SETTINGS_PATH = path.join(ROOT_DIR, "desktop", "settings.json");
const CV_PATH = path.join(ROOT_DIR, "input", "cv.md");
function readSettings() {
  try {
    if (!fs.existsSync(DESKTOP_SETTINGS_PATH)) return { geminiApiKey: "" };
    const parsed = JSON.parse(fs.readFileSync(DESKTOP_SETTINGS_PATH, "utf8"));
    return { geminiApiKey: parsed?.geminiApiKey || "" };
  } catch {
    return { geminiApiKey: "" };
  }
}
function saveSettings(config) {
  const parent = path.dirname(DESKTOP_SETTINGS_PATH);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(DESKTOP_SETTINGS_PATH, JSON.stringify(config, null, 2), "utf8");
}
async function fetchJson(url, token) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
async function getUserCv(token, apiUrl) {
  const base = apiUrl.replace(/\/+$/, "");
  const endpoints = ["/cv/me", "/curriculo/me", "/usuarios/me/cv", "/user/cv", "/users/me/cv", "/me/cv"];
  for (const endpoint of endpoints) {
    const data = await fetchJson(`${base}${endpoint}`, token);
    if (!data) continue;
    const cv = data?.cv || data?.curriculo || data?.content || data?.texto || data?.data?.cv || data?.data?.curriculo || data?.data?.content;
    if (typeof cv === "string" && cv.trim()) return cv;
  }
  if (fs.existsSync(CV_PATH)) {
    return fs.readFileSync(CV_PATH, "utf8");
  }
  throw new Error("Nao foi possivel obter o CV do usuario logado.");
}
function getSubmitterConfig() {
  return readSettings();
}
function setGeminiApiKey(apiKey) {
  saveSettings({ ...readSettings(), geminiApiKey: apiKey.trim() });
}
async function loginLinkedInAndSaveSession() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/linkedin\.com\/(feed|checkpoint|mynetwork|jobs)/, { timeout: 18e4 });
    await context.storageState({ path: STATE_PATH });
  } finally {
    await browser.close();
  }
}
function ensureGeminiKey() {
  const config = readSettings();
  if (!config.geminiApiKey) {
    throw new Error("Configure a chave do Gemini antes de iniciar o submitter.");
  }
  process.env.GEMINI_API_KEY = config.geminiApiKey;
}
async function processarSubmissaoLegacy(page, vaga) {
  require("ts-node/register/transpile-only");
  const legacy = require(path.join(ROOT_DIR, "src", "modules", "submitter", "submit.ts"));
  return legacy.processarSubmissao(page, vaga);
}
function validarVaga(vaga) {
  if (vaga.submetido) return false;
  const min = Number(process.env.PORCENTAGEM_SUBMISSAO || "0");
  if ((vaga.porcentagemAlinhamento || 0) < min) return false;
  const inglesEnv = (process.env.INGLES || "").toLowerCase() === "true";
  if (vaga.ingles === true && inglesEnv === false) return false;
  const tipo = (process.env.TIPO_CONTRATO || "").trim().toLowerCase();
  if (tipo && (vaga.tipoContrato || "").trim().toLowerCase() !== tipo) return false;
  return true;
}
async function runSubmitter(vagas) {
  ensureGeminiKey();
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error("Sessao do LinkedIn nao encontrada. Faça login no LinkedIn primeiro.");
  }
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();
  let success = 0;
  try {
    const elegiveis = vagas.filter(validarVaga);
    for (const vaga of elegiveis) {
      if (!vaga.linkVaga) continue;
      await page.goto(vaga.linkVaga, { waitUntil: "domcontentloaded" });
      const ok = await processarSubmissaoLegacy(page, vaga);
      if (ok) success += 1;
      await page.waitForTimeout(Number(process.env.DELAY_SUBMISSAO || "2500"));
    }
    return { total: elegiveis.length, success };
  } finally {
    await context.storageState({ path: STATE_PATH });
    await browser.close();
  }
}
async function runSubmitterSingle(vaga) {
  const result = await runSubmitter([vaga]);
  return result.success > 0;
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
  electron.ipcMain.handle("submitter:get-config", () => getSubmitterConfig());
  electron.ipcMain.handle("submitter:set-gemini-key", (_event, key) => setGeminiApiKey(key));
  electron.ipcMain.handle(
    "submitter:get-user-cv",
    (_event, payload) => getUserCv(payload.token, payload.apiUrl)
  );
  electron.ipcMain.handle("submitter:linkedin-login", () => loginLinkedInAndSaveSession());
  electron.ipcMain.handle("submitter:run", (_event, vagas) => runSubmitter(vagas));
  electron.ipcMain.handle("submitter:run-single", (_event, vaga) => runSubmitterSingle(vaga));
  createWindow();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
