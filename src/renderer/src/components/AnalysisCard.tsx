import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Languages,
  MapPin,
  Send,
  TrendingUp,
  SendHorizontal,
} from "lucide-react";
import type { VagaAnalisada } from "@/types";

function getAlinhamentoColor(porcentagem: number): string {
  if (porcentagem >= 80) return "bg-green-100 text-green-800";
  if (porcentagem >= 60) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export function AnalysisCard({
  vaga,
  onSubmitSingle,
  running,
}: {
  vaga: VagaAnalisada;
  onSubmitSingle: (vaga: VagaAnalisada) => Promise<void>;
  running: boolean;
}) {
  return (
    <div className={`card ${vaga.submetido ? "border-l-4 border-l-green-500" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">{vaga.cargo}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {vaga.empresa}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {vaga.localidade}
            </span>
          </div>
        </div>
        <button
          onClick={() => window.desktop.openExternal(vaga.linkVaga)}
          className="rounded-lg p-2 text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
          title="Ver vaga no LinkedIn"
        >
          <ExternalLink className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className={`badge ${getAlinhamentoColor(vaga.porcentagemAlinhamento || 0)}`}>
          <TrendingUp className="mr-1 h-3 w-3" />
          {vaga.porcentagemAlinhamento || 0}%
        </span>
        {vaga.submetido && (
          <span className="badge bg-green-100 text-green-800">
            <Send className="mr-1 h-3 w-3" />
            Submetida
          </span>
        )}
        {vaga.ingles !== undefined && (
          <span className="badge bg-slate-100 text-slate-700">
            <Languages className="mr-1 h-3 w-3" />
            {vaga.ingles ? "Ingles" : "Sem Ingles"}
          </span>
        )}
        {vaga.modoTrabalho && <span className="badge bg-blue-100 text-blue-800">{vaga.modoTrabalho}</span>}
        {vaga.tipoContrato && <span className="badge bg-emerald-100 text-emerald-800">{vaga.tipoContrato}</span>}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900">
        {vaga.recomendacao}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Pontos fortes
          </div>
          <ul className="space-y-1 text-xs text-gray-600 dark:text-slate-300">
            {(vaga.pontosFortes || []).map((item, idx) => (
              <li key={`${vaga.id}-good-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            Pontos de atencao
          </div>
          <ul className="space-y-1 text-xs text-gray-600 dark:text-slate-300">
            {(vaga.pontosFracos || []).map((item, idx) => (
              <li key={`${vaga.id}-risk-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          disabled={running || vaga.submetido}
          onClick={() => void onSubmitSingle(vaga)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          <SendHorizontal className="h-4 w-4" />
          Submeter
        </button>
      </div>
    </div>
  );
}
