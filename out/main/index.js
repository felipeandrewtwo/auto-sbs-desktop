"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const node_module = require("node:module");
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
const LINKEDIN_ROOT_FROM_ENV = (process.env.AUTO_SBS_LINKEDIN_PATH || "").trim();
let cachedLinkedinRoot = null;
const DEFAULT_PREFILL_PROFILE = {
  jobDiscoverySource: "LinkedIn",
  hasFamilyAtCompany: "Nao",
  salaryExpectationClt: "A combinar",
  currentSalaryAndBenefits: "Prefiro nao informar no momento.",
  dataProcessingConsent: true,
  contactConsent: true
};
function resolveLinkedinProjectRoot() {
  if (cachedLinkedinRoot) return cachedLinkedinRoot;
  const candidates = [
    LINKEDIN_ROOT_FROM_ENV,
    path.join(ROOT_DIR, "node_modules", "auto-sbs-linkedin"),
    path.resolve(ROOT_DIR, "..", "auto-sbs-linkedin")
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      cachedLinkedinRoot = candidate;
      return candidate;
    }
  }
  throw new Error(
    "Nao foi possivel localizar o projeto auto-sbs-linkedin. Defina AUTO_SBS_LINKEDIN_PATH com o caminho absoluto do repositorio."
  );
}
function getLinkedinRequire() {
  const packageJsonPath = path.join(resolveLinkedinProjectRoot(), "package.json");
  return node_module.createRequire(packageJsonPath);
}
function loadChromium() {
  try {
    const { chromium } = require("playwright");
    return chromium;
  } catch {
    const linkedRequire = getLinkedinRequire();
    const { chromium } = linkedRequire("playwright");
    return chromium;
  }
}
function registerTsNodeTranspileOnly() {
  try {
    require("ts-node/register/transpile-only");
    return;
  } catch {
  }
  const linkedRequire = getLinkedinRequire();
  linkedRequire("ts-node/register/transpile-only");
}
function resolveLegacySubmitModulePath() {
  const localSubmitterModule = path.join(ROOT_DIR, "src", "modules", "submitter", "submit.ts");
  if (fs.existsSync(localSubmitterModule)) return localSubmitterModule;
  const linkedSubmitterModule = path.join(resolveLinkedinProjectRoot(), "src", "modules", "submitter", "submit.ts");
  if (fs.existsSync(linkedSubmitterModule)) return linkedSubmitterModule;
  throw new Error("Nao foi possivel localizar src/modules/submitter/submit.ts.");
}
function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function normalizePrefillProfile(profile) {
  return {
    currentCity: normalizeString(profile?.currentCity),
    currentCompany: normalizeString(profile?.currentCompany),
    englishConfidence: normalizeString(profile?.englishConfidence),
    englishComfortText: normalizeString(profile?.englishComfortText),
    spanishConfidence: normalizeString(profile?.spanishConfidence),
    jobDiscoverySource: normalizeString(profile?.jobDiscoverySource) || DEFAULT_PREFILL_PROFILE.jobDiscoverySource,
    hasFamilyAtCompany: normalizeString(profile?.hasFamilyAtCompany) || DEFAULT_PREFILL_PROFILE.hasFamilyAtCompany,
    salaryExpectationClt: normalizeString(profile?.salaryExpectationClt) || DEFAULT_PREFILL_PROFILE.salaryExpectationClt,
    currentSalaryAndBenefits: normalizeString(profile?.currentSalaryAndBenefits) || DEFAULT_PREFILL_PROFILE.currentSalaryAndBenefits,
    dataProcessingConsent: normalizeBoolean(profile?.dataProcessingConsent, DEFAULT_PREFILL_PROFILE.dataProcessingConsent),
    contactConsent: normalizeBoolean(profile?.contactConsent, DEFAULT_PREFILL_PROFILE.contactConsent)
  };
}
function readStoredSettings() {
  try {
    if (!fs.existsSync(DESKTOP_SETTINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(DESKTOP_SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveSettings(config) {
  const parent = path.dirname(DESKTOP_SETTINGS_PATH);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(DESKTOP_SETTINGS_PATH, JSON.stringify(config, null, 2), "utf8");
}
function hasMeaningfulPrefill(profile) {
  const requiredTextFields = [
    profile.currentCity,
    profile.currentCompany,
    profile.englishConfidence,
    profile.englishComfortText,
    profile.spanishConfidence,
    profile.jobDiscoverySource,
    profile.hasFamilyAtCompany,
    profile.salaryExpectationClt
  ];
  return requiredTextFields.every((value) => value.trim().length > 0);
}
function readSettings() {
  const stored = readStoredSettings();
  const profile = normalizePrefillProfile(stored.prefillProfile);
  return {
    geminiApiKey: normalizeString(stored.geminiApiKey),
    hasLinkedInSession: hasLinkedInSession(),
    hasPrefillProfile: hasMeaningfulPrefill(profile)
  };
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
function hasLinkedInSession() {
  return fs.existsSync(STATE_PATH);
}
function extractCvContent(payload) {
  const candidates = [
    payload?.cvContent,
    payload?.cv,
    payload?.curriculo,
    payload?.content,
    payload?.texto,
    payload?.data?.cvContent,
    payload?.data?.cv,
    payload?.data?.curriculo,
    payload?.data?.content,
    payload?.user?.cvContent,
    payload?.user?.cv
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
async function getUserCv(token, apiUrl) {
  const base = apiUrl.replace(/\/+$/, "");
  const endpoints = ["/users/me", "/cv/me", "/curriculo/me", "/usuarios/me/cv", "/user/cv", "/users/me/cv", "/me/cv"];
  for (const endpoint of endpoints) {
    const data = await fetchJson(`${base}${endpoint}`, token);
    if (!data) continue;
    const cv = extractCvContent(data);
    if (cv) return cv;
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
  const stored = readStoredSettings();
  saveSettings({ ...stored, geminiApiKey: apiKey.trim() });
}
function getSubmitterPrefillProfile() {
  const stored = readStoredSettings();
  return normalizePrefillProfile(stored.prefillProfile);
}
function setSubmitterPrefillProfile(profile) {
  const stored = readStoredSettings();
  saveSettings({ ...stored, prefillProfile: normalizePrefillProfile(profile) });
}
async function loginLinkedInAndSaveSession() {
  const chromium = loadChromium();
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
  registerTsNodeTranspileOnly();
  const legacyModulePath = resolveLegacySubmitModulePath();
  const legacy = require(legacyModulePath);
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
    throw new Error("Sessao do LinkedIn nao encontrada. Faca login no LinkedIn primeiro.");
  }
  const chromium = loadChromium();
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
  electron.ipcMain.handle("submitter:get-prefill-profile", () => getSubmitterPrefillProfile());
  electron.ipcMain.handle("submitter:set-gemini-key", (_event, key) => setGeminiApiKey(key));
  electron.ipcMain.handle(
    "submitter:set-prefill-profile",
    (_event, profile) => setSubmitterPrefillProfile(profile)
  );
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
