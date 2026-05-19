import { contextBridge, ipcRenderer } from "electron";

type PrefillProfile = {
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
};

contextBridge.exposeInMainWorld("desktop", {
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  auth: {
    getToken: () => ipcRenderer.invoke("auth:get-token") as Promise<string | null>,
    setToken: (token: string) => ipcRenderer.invoke("auth:set-token", token),
    clearToken: () => ipcRenderer.invoke("auth:clear-token"),
  },
  submitter: {
    getConfig: () =>
      ipcRenderer.invoke("submitter:get-config") as Promise<{
        geminiApiKey: string;
        hasLinkedInSession: boolean;
        hasPrefillProfile: boolean;
      }>,
    getPrefillProfile: () => ipcRenderer.invoke("submitter:get-prefill-profile") as Promise<PrefillProfile>,
    setGeminiKey: (key: string) => ipcRenderer.invoke("submitter:set-gemini-key", key),
    setPrefillProfile: (profile: PrefillProfile) => ipcRenderer.invoke("submitter:set-prefill-profile", profile),
    getUserCv: (token: string, apiUrl: string) =>
      ipcRenderer.invoke("submitter:get-user-cv", { token, apiUrl }) as Promise<string>,
    linkedinLogin: () => ipcRenderer.invoke("submitter:linkedin-login"),
    run: (vagas: unknown[]) => ipcRenderer.invoke("submitter:run", vagas) as Promise<{ total: number; success: number }>,
    runSingle: (vaga: unknown) => ipcRenderer.invoke("submitter:run-single", vaga) as Promise<boolean>,
  },
});
