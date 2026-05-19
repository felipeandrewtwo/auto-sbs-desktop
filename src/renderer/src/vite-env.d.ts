/// <reference types="vite/client" />

interface PrefillProfile {
  currentCity: string;
  currentCompany: string;
  englishConfidence: string;
  englishComfortText: string;
  spanishConfidence: string;
  jobDiscoverySource: string;
  hasFamilyAtCompany: string;
  salaryExpectationClt: string;
  currentSalaryAndBenefits: string;
  dataProcessingConsent: boolean;
  contactConsent: boolean;
}

interface DesktopBridge {
  openExternal: (url: string) => Promise<boolean>;
  auth: {
    getToken: () => Promise<string | null>;
    setToken: (token: string) => Promise<void>;
    clearToken: () => Promise<void>;
  };
  submitter: {
    getConfig: () => Promise<{ geminiApiKey: string; hasLinkedInSession: boolean; hasPrefillProfile: boolean }>;
    getPrefillProfile: () => Promise<PrefillProfile>;
    setGeminiKey: (key: string) => Promise<void>;
    setPrefillProfile: (profile: PrefillProfile) => Promise<void>;
    getUserCv: (token: string, apiUrl: string) => Promise<string>;
    linkedinLogin: () => Promise<void>;
    run: (vagas: unknown[]) => Promise<{ total: number; success: number }>;
    runSingle: (vaga: unknown) => Promise<boolean>;
  };
}

interface Window {
  desktop: DesktopBridge;
}
