import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { Prefill } from "@/pages/Prefill";
import { Setup } from "@/pages/Setup";
import { ApiError, login } from "@/services/api";

type ViewState = "boot" | "login" | "setup" | "prefill" | "dashboard";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const msg = error.message.toLowerCase();
    if (msg.includes("verificado") || msg.includes("verified")) {
      return "Seu email ainda nao foi verificado. Verifique sua caixa de entrada.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return `Nao foi possivel autenticar. ${error.message}`;
  }
  return "Nao foi possivel autenticar. Tente novamente.";
}

export default function App() {
  const [view, setView] = useState<ViewState>("boot");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("desktop-theme");
    return stored === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("desktop-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const restore = async () => {
      const savedToken = await window.desktop.auth.getToken();
      if (!savedToken) {
        setView("login");
        return;
      }
      setToken(savedToken);

      try {
        const cfg = await window.desktop.submitter.getConfig();
        const setupComplete = Boolean(cfg.geminiApiKey?.trim()) && Boolean(cfg.hasLinkedInSession);
        if (!setupComplete) {
          setView("setup");
          return;
        }
        setView(cfg.hasPrefillProfile ? "dashboard" : "prefill");
      } catch {
        setView("setup");
      }
    };
    void restore();
  }, []);

  const actions = useMemo(
    () => ({
      logout: async () => {
        await window.desktop.auth.clearToken();
        setToken(null);
        setError("");
        setView("login");
      },
    }),
    [],
  );

  useEffect(() => {
    const handleSessionExpired = async () => {
      await actions.logout();
      setError("Sessao expirada. Faca login novamente.");
    };
    window.addEventListener("session-expired", handleSessionExpired);
    return () => window.removeEventListener("session-expired", handleSessionExpired);
  }, [actions]);

  if (view === "boot") {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-900" />;
  }

  if (view === "login") {
    return (
      <Login
        darkMode={darkMode}
        loading={loading}
        error={error}
        onToggleTheme={() => setDarkMode((prev) => !prev)}
        onSubmit={async (email, senha) => {
          setLoading(true);
          setError("");
          try {
            await window.desktop.auth.clearToken();
            const jwt = await login(email, senha);
            await window.desktop.auth.setToken(jwt);
            setToken(jwt);
            try {
              const cfg = await window.desktop.submitter.getConfig();
              const setupComplete = Boolean(cfg.geminiApiKey?.trim()) && Boolean(cfg.hasLinkedInSession);
              if (!setupComplete) {
                setView("setup");
              } else {
                setView(cfg.hasPrefillProfile ? "dashboard" : "prefill");
              }
            } catch {
              setView("setup");
            }
          } catch (err) {
            setToken(null);
            setView("login");
            try {
              await window.desktop.auth.clearToken();
            } catch (clearError) {
              console.warn("Falha ao limpar token no desktop:", clearError);
            }
            console.error("Falha no login desktop:", err);
            setError(getErrorMessage(err));
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  if (view === "setup") {
    return (
      <Setup
        token={token || ""}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((prev) => !prev)}
        onLogout={actions.logout}
        onContinue={() => setView("prefill")}
      />
    );
  }

  if (view === "prefill") {
    return (
      <Prefill
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((prev) => !prev)}
        onLogout={actions.logout}
        onBackToSetup={() => setView("setup")}
        onContinueToDashboard={() => setView("dashboard")}
      />
    );
  }

  return (
    <Dashboard
      token={token || ""}
      darkMode={darkMode}
      onToggleTheme={() => setDarkMode((prev) => !prev)}
      onLogout={actions.logout}
      onOpenSetup={() => setView("setup")}
      onOpenPrefill={() => setView("prefill")}
      onSessionExpired={async () => {
        await actions.logout();
        setError("Sessao expirada. Faca login novamente.");
      }}
    />
  );
}
