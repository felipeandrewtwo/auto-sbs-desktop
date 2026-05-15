import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { ApiError, login } from "@/services/api";

type ViewState = "boot" | "login" | "dashboard";

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
      setView("dashboard");
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
            const jwt = await login(email, senha);
            setToken(jwt);
            setView("dashboard");
            try {
              await window.desktop.auth.setToken(jwt);
            } catch (persistError) {
              console.warn("Falha ao persistir token no desktop:", persistError);
            }
          } catch (err) {
            console.error("Falha no login desktop:", err);
            setError(getErrorMessage(err));
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  return (
    <Dashboard
      token={token || ""}
      darkMode={darkMode}
      onToggleTheme={() => setDarkMode((prev) => !prev)}
      onLogout={actions.logout}
      onSessionExpired={async () => {
        await actions.logout();
        setError("Sessao expirada. Faca login novamente.");
      }}
    />
  );
}
