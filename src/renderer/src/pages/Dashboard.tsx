import { useEffect, useMemo, useState } from "react";
import { AnalysisCard } from "@/components/AnalysisCard";
import { DashboardHeader } from "@/components/DashboardHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { ApiError, fetchAnalises } from "@/services/api";
import type { VagaAnalisada } from "@/types";
import { Play, Settings2 } from "lucide-react";

interface DashboardProps {
  token: string;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
  onSessionExpired: () => Promise<void>;
  onOpenSetup: () => void;
  onOpenPrefill: () => void;
}

type Feedback = {
  kind: "success" | "error";
  text: string;
};

function getMissingSetup(geminiKey: string, hasLinkedInSession: boolean): string[] {
  const missing: string[] = [];
  if (!geminiKey.trim()) missing.push("Salvar a chave do Gemini");
  if (!hasLinkedInSession) missing.push("Concluir login no LinkedIn");
  return missing;
}

export function Dashboard({
  token,
  darkMode,
  onToggleTheme,
  onLogout,
  onSessionExpired,
  onOpenSetup,
  onOpenPrefill,
}: DashboardProps) {
  const [analises, setAnalises] = useState<VagaAnalisada[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const data = await fetchAnalises(token);
        setAnalises(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await onSessionExpired();
          return;
        }
        setLoadError("Nao foi possivel carregar as analises.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token, onSessionExpired]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => analises.some((vaga) => vaga.id === id && !vaga.submetido)));
  }, [analises]);

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name);
    setFeedback(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao executar acao do submitter.";
      setFeedback({ kind: "error", text: msg });
    } finally {
      setBusyAction("");
    }
  };

  const selectableAnalises = useMemo(() => analises.filter((vaga) => !vaga.submetido), [analises]);
  const selectedVagas = useMemo(() => analises.filter((vaga) => selectedIds.includes(vaga.id)), [analises, selectedIds]);
  const allSelected = selectableAnalises.length > 0 && selectableAnalises.every((vaga) => selectedIds.includes(vaga.id));

  const refreshAnalises = async () => {
    const data = await fetchAnalises(token);
    setAnalises(data);
  };

  const runSubmitter = async () => {
    const cfg = await window.desktop.submitter.getConfig();
    const missing = getMissingSetup(cfg.geminiApiKey || "", Boolean(cfg.hasLinkedInSession));
    if (missing.length > 0) {
      setFeedback({ kind: "error", text: `Falta configurar: ${missing.join(" | ")}.` });
      onOpenSetup();
      return;
    }
    if (!cfg.hasPrefillProfile) {
      setFeedback({
        kind: "error",
        text: "Preencha o perfil de respostas genericas para reduzir tokens e aumentar a precisao antes de submeter.",
      });
      onOpenPrefill();
      return;
    }

    if (selectedVagas.length === 0) {
      setFeedback({ kind: "error", text: "Selecione pelo menos uma vaga para iniciar o submitter." });
      return;
    }

    await runAction("run", async () => {
      const result = await window.desktop.submitter.run(selectedVagas);
      setFeedback({ kind: "success", text: `Submitter concluido: ${result.success}/${result.total} submetidas.` });
      await refreshAnalises();
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <DashboardHeader
        darkMode={darkMode}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        actions={
          <>
            <button
              onClick={onOpenPrefill}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Perfil de Respostas
            </button>
            <button
              onClick={onOpenSetup}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Settings2 className="h-4 w-4" />
              Configuracao
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Vagas analisadas</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Selecione as vagas desejadas para submissao em lote no submitter.
              </p>
            </div>
            <button
              disabled={!!busyAction || analises.length === 0}
              onClick={() => void runSubmitter()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              Iniciar Submitter ({selectedVagas.length})
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!!busyAction || selectableAnalises.length === 0}
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedIds(selectableAnalises.map((vaga) => vaga.id));
                } else {
                  setSelectedIds([]);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-60"
            />
            Selecionar todas as vagas nao submetidas
          </label>
        </section>

        {feedback ? (
          <section
            className={`mb-4 rounded-lg border p-3 text-sm ${
              feedback.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                : "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300"
            }`}
          >
            {feedback.text}
          </section>
        ) : null}

        <section className="mb-6 card">
          <p className="text-sm text-gray-500 dark:text-slate-400">Total de analises</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{analises.length}</p>
        </section>

        {loading ? <Loading label="Carregando analises..." /> : null}
        {!loading && loadError ? <EmptyState message={loadError} /> : null}
        {!loading && !loadError && analises.length === 0 ? <EmptyState message="Nenhuma analise realizada" /> : null}

        {!loading && !loadError && analises.length > 0 ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {analises.map((vaga) => (
              <AnalysisCard
                key={vaga.id}
                vaga={vaga}
                running={!!busyAction}
                selected={selectedIds.includes(vaga.id)}
                onToggleSelect={(vagaId, checked) => {
                  if (checked) {
                    setSelectedIds((prev) => Array.from(new Set([...prev, vagaId])));
                  } else {
                    setSelectedIds((prev) => prev.filter((id) => id !== vagaId));
                  }
                }}
                onSubmitSingle={async (selected) => {
                  await runAction(`single-${selected.id}`, async () => {
                    const ok = await window.desktop.submitter.runSingle(selected);
                    setFeedback({
                      kind: ok ? "success" : "error",
                      text: ok ? "Submissao individual concluida." : "Submissao individual nao concluida.",
                    });
                    await refreshAnalises();
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
