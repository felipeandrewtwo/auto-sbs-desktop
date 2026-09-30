import fs from "node:fs";
import { chromium } from "playwright";
import path from "node:path";
import type { SubmitterConfig, SubmitterPrefillProfile, VagaAnalisada } from "./types";
import { processarSubmissao } from "./dom_submitter";
export { getUserCv } from "./user-cv";

const ROOT_DIR = path.resolve(process.cwd());
const STATE_PATH = path.join(ROOT_DIR, "state.json");
const DESKTOP_SETTINGS_PATH = path.join(ROOT_DIR, "desktop", "settings.json");

const DEFAULT_PREFILL_PROFILE: SubmitterPrefillProfile = {
  currentCity: "",
  currentCompany: "",
  englishConfidence: "",
  englishComfortText: "",
  spanishConfidence: "",
  jobDiscoverySource: "LinkedIn",
  hasFamilyAtCompany: "Nao",
  salaryExpectationClt: "A combinar",
  currentSalaryAndBenefits: "Prefiro nao informar no momento.",
  dataProcessingConsent: true,
  contactConsent: true,
};

type StoredDesktopSettings = {
  geminiApiKey?: string;
  prefillProfile?: Partial<SubmitterPrefillProfile>;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePrefillProfile(profile?: Partial<SubmitterPrefillProfile>): SubmitterPrefillProfile {
  return {
    currentCity: normalizeString(profile?.currentCity),
    currentCompany: normalizeString(profile?.currentCompany),
    englishConfidence: normalizeString(profile?.englishConfidence),
    englishComfortText: normalizeString(profile?.englishComfortText),
    spanishConfidence: normalizeString(profile?.spanishConfidence),
    jobDiscoverySource: normalizeString(profile?.jobDiscoverySource) || DEFAULT_PREFILL_PROFILE.jobDiscoverySource,
    hasFamilyAtCompany: normalizeString(profile?.hasFamilyAtCompany) || DEFAULT_PREFILL_PROFILE.hasFamilyAtCompany,
    salaryExpectationClt: normalizeString(profile?.salaryExpectationClt) || DEFAULT_PREFILL_PROFILE.salaryExpectationClt,
    currentSalaryAndBenefits:
      normalizeString(profile?.currentSalaryAndBenefits) || DEFAULT_PREFILL_PROFILE.currentSalaryAndBenefits,
    dataProcessingConsent: normalizeBoolean(profile?.dataProcessingConsent, DEFAULT_PREFILL_PROFILE.dataProcessingConsent),
    contactConsent: normalizeBoolean(profile?.contactConsent, DEFAULT_PREFILL_PROFILE.contactConsent),
  };
}

function readStoredSettings(): StoredDesktopSettings {
  try {
    if (!fs.existsSync(DESKTOP_SETTINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(DESKTOP_SETTINGS_PATH, "utf8")) as StoredDesktopSettings;
  } catch {
    return {};
  }
}

function saveSettings(config: StoredDesktopSettings): void {
  const parent = path.dirname(DESKTOP_SETTINGS_PATH);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(DESKTOP_SETTINGS_PATH, JSON.stringify(config, null, 2), "utf8");
}

function hasMeaningfulPrefill(profile: SubmitterPrefillProfile): boolean {
  const requiredTextFields = [
    profile.currentCity,
    profile.currentCompany,
    profile.englishConfidence,
    profile.englishComfortText,
    profile.spanishConfidence,
    profile.jobDiscoverySource,
    profile.hasFamilyAtCompany,
    profile.salaryExpectationClt,
  ];

  return requiredTextFields.every((value) => value.trim().length > 0);
}

function readSettings(): SubmitterConfig {
  const stored = readStoredSettings();
  const profile = normalizePrefillProfile(stored.prefillProfile);
  return {
    geminiApiKey: normalizeString(stored.geminiApiKey),
    hasLinkedInSession: hasLinkedInSession(),
    hasPrefillProfile: hasMeaningfulPrefill(profile),
  };
}

function hasLinkedInSession(): boolean {
  return fs.existsSync(STATE_PATH);
}

export function getSubmitterConfig(): SubmitterConfig {
  return readSettings();
}

export function setGeminiApiKey(apiKey: string): void {
  const stored = readStoredSettings();
  saveSettings({ ...stored, geminiApiKey: apiKey.trim() });
}

export function getSubmitterPrefillProfile(): SubmitterPrefillProfile {
  const stored = readStoredSettings();
  return normalizePrefillProfile(stored.prefillProfile);
}

export function setSubmitterPrefillProfile(profile: SubmitterPrefillProfile): void {
  const stored = readStoredSettings();
  saveSettings({ ...stored, prefillProfile: normalizePrefillProfile(profile) });
}

export async function loginLinkedInAndSaveSession(): Promise<void> {
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

export async function runSubmitter(vagas: VagaAnalisada[], loadCv: () => Promise<string>): Promise<{ total: number; success: number }> {
  const cv = await loadCv();
  if (typeof cv !== "string" || !cv.trim()) throw new Error("CV_EMPTY");
  ensureGeminiKey();
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error("Sessao do LinkedIn nao encontrada. Faca login no LinkedIn primeiro.");
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();
  let success = 0;

  try {
    const elegiveis = vagas.filter(validarVaga);
    for (const vaga of elegiveis) {
      if (!vaga.linkVaga) continue;
      await page.goto(vaga.linkVaga, { waitUntil: "domcontentloaded" });
      const ok = await processarSubmissao(page, vaga, cv);
      if (ok) success += 1;
      await page.waitForTimeout(Number(process.env.DELAY_SUBMISSAO || "2500"));
    }
    return { total: elegiveis.length, success };
  } finally {
    await context.storageState({ path: STATE_PATH });
    await browser.close();
  }
}

export async function runSubmitterSingle(vaga: VagaAnalisada, loadCv: () => Promise<string>): Promise<boolean> {
  const result = await runSubmitter([vaga], loadCv);
  return result.success > 0;
}
