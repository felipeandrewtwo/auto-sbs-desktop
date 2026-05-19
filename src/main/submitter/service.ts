import fs from "node:fs";
import path from "node:path";
import type { SubmitterConfig, VagaAnalisada } from "./types";

const ROOT_DIR = path.resolve(process.cwd());
const STATE_PATH = path.join(ROOT_DIR, "state.json");
const DESKTOP_SETTINGS_PATH = path.join(ROOT_DIR, "desktop", "settings.json");
const CV_PATH = path.join(ROOT_DIR, "input", "cv.md");

function readSettings(): SubmitterConfig {
  try {
    if (!fs.existsSync(DESKTOP_SETTINGS_PATH)) return { geminiApiKey: "" };
    const parsed = JSON.parse(fs.readFileSync(DESKTOP_SETTINGS_PATH, "utf8"));
    return { geminiApiKey: parsed?.geminiApiKey || "" };
  } catch {
    return { geminiApiKey: "" };
  }
}

function saveSettings(config: SubmitterConfig): void {
  const parent = path.dirname(DESKTOP_SETTINGS_PATH);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(DESKTOP_SETTINGS_PATH, JSON.stringify(config, null, 2), "utf8");
}

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getUserCv(token: string, apiUrl: string): Promise<string> {
  const base = apiUrl.replace(/\/+$/, "");
  const endpoints = ["/cv/me", "/curriculo/me", "/usuarios/me/cv", "/user/cv", "/users/me/cv", "/me/cv"];

  for (const endpoint of endpoints) {
    const data = await fetchJson<any>(`${base}${endpoint}`, token);
    if (!data) continue;
    const cv =
      data?.cv ||
      data?.curriculo ||
      data?.content ||
      data?.texto ||
      data?.data?.cv ||
      data?.data?.curriculo ||
      data?.data?.content;
    if (typeof cv === "string" && cv.trim()) return cv;
  }

  if (fs.existsSync(CV_PATH)) {
    return fs.readFileSync(CV_PATH, "utf8");
  }

  throw new Error("Nao foi possivel obter o CV do usuario logado.");
}

export function getSubmitterConfig(): SubmitterConfig {
  return readSettings();
}

export function setGeminiApiKey(apiKey: string): void {
  saveSettings({ ...readSettings(), geminiApiKey: apiKey.trim() });
}

export async function loginLinkedInAndSaveSession(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/linkedin\.com\/(feed|checkpoint|mynetwork|jobs)/, { timeout: 180000 });
    await context.storageState({ path: STATE_PATH });
  } finally {
    await browser.close();
  }
}

function ensureGeminiKey(): void {
  const config = readSettings();
  if (!config.geminiApiKey) {
    throw new Error("Configure a chave do Gemini antes de iniciar o submitter.");
  }
  process.env.GEMINI_API_KEY = config.geminiApiKey;
}

async function processarSubmissaoLegacy(page: unknown, vaga: VagaAnalisada): Promise<boolean> {
  // Carrega o módulo legado sob demanda para evitar quebrar o boot do Electron.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("ts-node/register/transpile-only");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const legacy = require(path.join(ROOT_DIR, "src", "modules", "submitter", "submit.ts"));
  return legacy.processarSubmissao(page, vaga);
}

function validarVaga(vaga: VagaAnalisada): boolean {
  if (vaga.submetido) return false;
  const min = Number(process.env.PORCENTAGEM_SUBMISSAO || "0");
  if ((vaga.porcentagemAlinhamento || 0) < min) return false;
  const inglesEnv = (process.env.INGLES || "").toLowerCase() === "true";
  if (vaga.ingles === true && inglesEnv === false) return false;
  const tipo = (process.env.TIPO_CONTRATO || "").trim().toLowerCase();
  if (tipo && (vaga.tipoContrato || "").trim().toLowerCase() !== tipo) return false;
  return true;
}

export async function runSubmitter(vagas: VagaAnalisada[]): Promise<{ total: number; success: number }> {
  ensureGeminiKey();
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error("Sessao do LinkedIn nao encontrada. Faça login no LinkedIn primeiro.");
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
      const ok = await processarSubmissaoLegacy(page as any, vaga as any);
      if (ok) success += 1;
      await page.waitForTimeout(Number(process.env.DELAY_SUBMISSAO || "2500"));
    }
    return { total: elegiveis.length, success };
  } finally {
    await context.storageState({ path: STATE_PATH });
    await browser.close();
  }
}

export async function runSubmitterSingle(vaga: VagaAnalisada): Promise<boolean> {
  const result = await runSubmitter([vaga]);
  return result.success > 0;
}
