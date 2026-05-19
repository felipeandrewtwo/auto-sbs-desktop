import { useEffect, useState } from "react";
import { AnalysisCard } from "@/components/AnalysisCard";
import { DashboardHeader } from "@/components/DashboardHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { ApiError, apiUrl, fetchAnalises } from "@/services/api";
import type { VagaAnalisada } from "@/types";
import { KeyRound, Linkedin, Play, RefreshCcw, Save } from "lucide-react";

interface DashboardProps {
  token: string;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
  onSessionExpired: () => Promise<void>;
}

export function Dashboard({
  token,
  darkMode,
  onToggleTheme,
  onLogout,
  onSessionExpired,
}: DashboardProps) {
  const [analises, setAnalises] = useState<VagaAnalisada[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cv, setCv] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await window.desktop.submitter.getConfig();
      setGeminiKey(cfg.geminiApiKey || "");
    };
    void loadConfig();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAnalises(token);
        setAnalises(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await onSessionExpired();
          return;
        }
        setError("Nao foi possivel carregar as analises.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token, onSessionExpired]);

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name);
    setError("");
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao executar acao do submitter.";
      setError(msg);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <DashboardHeader darkMode={darkMode} onToggleTheme={onToggleTheme} onLogout={onLogout} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 card">
          <p className="text-sm text-gray-500 dark:text-slate-400">Total de analises</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{analises.length}</p>
        </section>
        <section className="mb-6 card space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Submitter Desktop</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Configure Gemini, recupere CV e execute submissao.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Chave Gemini</span>
              <div className="flex items-center rounded-lg border border-gray-300 px-2 dark:border-slate-600">
                <KeyRound className="h-4 w-4 text-gray-400" />
                <input
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                  placeholder="AIza..."
                />
                <button
                  onClick={() =>
                    void runAction("save-gemini", async () => {
                      await window.desktop.submitter.setGeminiKey(geminiKey);
                    })
                  }
                  className="rounded-md bg-primary-600 px-2 py-1 text-xs text-white"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">CV do usuario</span>
              <textarea
                value={cv}
                onChange={(e) => setCv(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-transparent p-2 text-xs outline-none dark:border-slate-600"
                placeholder="Clique em Atualizar CV para carregar."
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!!busyAction}
              onClick={() =>
                void runAction("get-cv", async () => {
                  const cvContent = await window.desktop.submitter.getUserCv(token, apiUrl);
                  setCv(cvContent);
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <RefreshCcw className="h-4 w-4" />
              Atualizar CV
            </button>
            <button
              disabled={!!busyAction}
              onClick={() => void runAction("linkedin", () => window.desktop.submitter.linkedinLogin())}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <Linkedin className="h-4 w-4" />
              Login LinkedIn
            </button>
            <button
              disabled={!!busyAction || analises.length === 0}
              onClick={() =>
                void runAction("run", async () => {
                  const result = await window.desktop.submitter.run(analises);
                  setError(`Submitter concluido: ${result.success}/${result.total} submetidas.`);
                  const data = await fetchAnalises(token);
                  setAnalises(data);
                })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              Iniciar Submitter
            </button>
          </div>
        </section>

        {loading ? <Loading label="Carregando analises..." /> : null}
        {!loading && error ? <EmptyState message={error} /> : null}
        {!loading && !error && analises.length === 0 ? (
          <EmptyState message="Nenhuma analise realizada" />
        ) : null}

        {!loading && !error && analises.length > 0 ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {analises.map((vaga) => (
              <AnalysisCard
                key={vaga.id}
                vaga={vaga}
                running={!!busyAction}
                onSubmitSingle={async (selected) => {
                  await runAction(`single-${selected.id}`, async () => {
                    const ok = await window.desktop.submitter.runSingle(selected);
                    setError(ok ? "Submissao individual concluida." : "Submissao individual nao concluida.");
                    const data = await fetchAnalises(token);
                    setAnalises(data);
                  });
                }}
              />
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
