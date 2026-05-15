/// <reference types="vite/client" />

interface DesktopBridge {
  openExternal: (url: string) => Promise<boolean>;
  auth: {
    getToken: () => Promise<string | null>;
    setToken: (token: string) => Promise<void>;
    clearToken: () => Promise<void>;
  };
}

interface Window {
  desktop: DesktopBridge;
}
