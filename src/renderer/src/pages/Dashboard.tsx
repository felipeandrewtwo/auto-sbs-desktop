import { useEffect, useState } from "react";
import { AnalysisCard } from "@/components/AnalysisCard";
import { DashboardHeader } from "@/components/DashboardHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { ApiError, fetchAnalises } from "@/services/api";
import type { VagaAnalisada } from "@/types";

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <DashboardHeader darkMode={darkMode} onToggleTheme={onToggleTheme} onLogout={onLogout} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 card">
          <p className="text-sm text-gray-500 dark:text-slate-400">Total de analises</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{analises.length}</p>
        </section>

        {loading ? <Loading label="Carregando analises..." /> : null}
        {!loading && error ? <EmptyState message={error} /> : null}
        {!loading && !error && analises.length === 0 ? (
          <EmptyState message="Nenhuma analise realizada" />
        ) : null}

        {!loading && !error && analises.length > 0 ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {analises.map((vaga) => (
              <AnalysisCard key={vaga.id} vaga={vaga} />
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
