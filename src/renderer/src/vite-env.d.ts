/// <reference types="vite/client" />

interface DesktopBridge {
  openExternal: (url: string) => Promise<boolean>;
  auth: {
    getToken: () => Promise<string | null>;
    setToken: (token: string) => Promise<void>;
    clearToken: () => Promise<void>;
  };
  submitter: {
    getConfig: () => Promise<{ geminiApiKey: string }>;
    setGeminiKey: (key: string) => Promise<void>;
    getUserCv: (token: string, apiUrl: string) => Promise<string>;
    linkedinLogin: () => Promise<void>;
    run: (vagas: unknown[]) => Promise<{ total: number; success: number }>;
    runSingle: (vaga: unknown) => Promise<boolean>;
  };
}

interface Window {
  desktop: DesktopBridge;
}
