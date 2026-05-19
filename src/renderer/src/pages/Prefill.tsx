import { useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { CheckCircle2, Save } from "lucide-react";

interface PrefillProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
  onBackToSetup: () => void;
  onContinueToDashboard: () => void;
}

const confidenceOptions = ["Basico", "Intermediario", "Avancado", "Fluente"];
const discoveryOptions = [
  "LinkedIn",
  "Indicacao",
  "Site da empresa",
  "Recrutador",
  "Comunidade/Evento",
  "Outro",
];
const familyOptions = ["Nao", "Sim", "Prefiro nao informar"];

const defaultProfile: PrefillProfile = {
  currentCity: "",
  currentCompany: "",
  englishConfidence: "",
  englishComfortText: "",
  spanishConfidence: "",
  jobDiscoverySource: "LinkedIn",
  hasFamilyAtCompany: "Nao",
  salaryExpectationClt: "A combinar",
  currentSalaryAndBenefits: "Prefiro nao informar no momento.",
  dataProcessingConsent: true,
  contactConsent: true,
};

function isPrefillComplete(profile: PrefillProfile): boolean {
  const required = [
    profile.currentCity,
    profile.currentCompany,
    profile.englishConfidence,
    profile.englishComfortText,
    profile.spanishConfidence,
    profile.jobDiscoverySource,
    profile.hasFamilyAtCompany,
    profile.salaryExpectationClt,
  ];
  return required.every((value) => value.trim().length > 0);
}

export function Prefill({
  darkMode,
  onToggleTheme,
  onLogout,
  onBackToSetup,
  onContinueToDashboard,
}: PrefillProps) {
  const [profile, setProfile] = useState<PrefillProfile>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const complete = useMemo(() => isPrefillComplete(profile), [profile]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await window.desktop.submitter.getPrefillProfile();
      setProfile({ ...defaultProfile, ...data });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setFeedback("");
    try {
      await window.desktop.submitter.setPrefillProfile(profile);
      setFeedback("Perfil de respostas salvo com sucesso.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar o perfil de respostas.";
      setFeedback(message);
      return false;
    } finally {
      setSaving(false);
    }
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
              onClick={onBackToSetup}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Voltar ao Setup
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Save className="h-4 w-4" />
              Salvar
            </button>
            <button
              onClick={() => {
                if (!complete) {
                  setFeedback("Preencha os campos obrigatorios para otimizar a inferencia antes de continuar.");
                  return;
                }
                void (async () => {
                  const ok = await save();
                  if (ok) onContinueToDashboard();
                })();
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              Ir para Vagas
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="card space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Pre-preenchimento inteligente</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Esses dados alimentam respostas genericas do LinkedIn Easy Apply e reduzem o uso de tokens da IA.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
            <p className="text-xs text-gray-500 dark:text-slate-400">Status do perfil</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100">
              <CheckCircle2 className={`h-4 w-4 ${complete ? "text-green-600" : "text-amber-600"}`} />
              {complete ? "Completo" : "Pendente de campos obrigatorios"}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Carregando perfil...</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Cidade atual *</span>
                <input
                  value={profile.currentCity}
                  onChange={(event) => setProfile((prev) => ({ ...prev, currentCity: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                  placeholder="Ex: Sao Paulo - SP"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Empresa atual *</span>
                <input
                  value={profile.currentCompany}
                  onChange={(event) => setProfile((prev) => ({ ...prev, currentCompany: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                  placeholder="Ex: NT Consult - Telefonica"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Confianca em ingles (select) *</span>
                <select
                  value={profile.englishConfidence}
                  onChange={(event) => setProfile((prev) => ({ ...prev, englishConfidence: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                >
                  <option value="">Selecione...</option>
                  {confidenceOptions.map((option) => (
                    <option key={`en-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Confianca em espanhol (select) *</span>
                <select
                  value={profile.spanishConfidence}
                  onChange={(event) => setProfile((prev) => ({ ...prev, spanishConfidence: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                >
                  <option value="">Selecione...</option>
                  {confidenceOptions.map((option) => (
                    <option key={`es-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Confortavel em ambiente em ingles? *</span>
                <input
                  value={profile.englishComfortText}
                  onChange={(event) => setProfile((prev) => ({ ...prev, englishComfortText: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                  placeholder="Ex: Sim, me sinto confortavel para colaborar em ingles no dia a dia."
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Como ficou sabendo da vaga? *</span>
                <select
                  value={profile.jobDiscoverySource}
                  onChange={(event) => setProfile((prev) => ({ ...prev, jobDiscoverySource: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                >
                  {discoveryOptions.map((option) => (
                    <option key={`src-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Possui familiar na empresa? *</span>
                <select
                  value={profile.hasFamilyAtCompany}
                  onChange={(event) => setProfile((prev) => ({ ...prev, hasFamilyAtCompany: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                >
                  {familyOptions.map((option) => (
                    <option key={`fam-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Pretensao salarial CLT *</span>
                <input
                  value={profile.salaryExpectationClt}
                  onChange={(event) => setProfile((prev) => ({ ...prev, salaryExpectationClt: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                  placeholder="Ex: R$ 12.000 a R$ 14.000 CLT (negociavel)"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">
                  Salario atual/ultimo e beneficios (opcional)
                </span>
                <input
                  value={profile.currentSalaryAndBenefits}
                  onChange={(event) => setProfile((prev) => ({ ...prev, currentSalaryAndBenefits: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-600"
                  placeholder="Ex: Prefiro nao informar no momento."
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={profile.dataProcessingConsent}
                  onChange={(event) => setProfile((prev) => ({ ...prev, dataProcessingConsent: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Concordo com o processamento de dados para recrutamento
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={profile.contactConsent}
                  onChange={(event) => setProfile((prev) => ({ ...prev, contactConsent: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Autorizo contato sobre novas oportunidades
              </label>
            </div>
          )}

          {feedback ? <p className="text-sm text-gray-700 dark:text-slate-200">{feedback}</p> : null}
        </section>
      </main>
    </div>
  );
}
