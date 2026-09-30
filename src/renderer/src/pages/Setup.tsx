import { useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { apiUrl } from "@/services/api";
import { AlertTriangle, CheckCircle2, KeyRound, Linkedin, RefreshCcw, Save, X } from "lucide-react";

interface SetupProps {
  token: string;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
  onContinue: () => void;
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

export function Setup({ token, darkMode, onToggleTheme, onLogout, onContinue }: SetupProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [hasLinkedInSession, setHasLinkedInSession] = useState(false);
  const [cv, setCv] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(true);
  const [hasPrefillProfile, setHasPrefillProfile] = useState(false);

  const setupMissing = useMemo(() => getMissingSetup(geminiKey, hasLinkedInSession), [geminiKey, hasLinkedInSession]);
  const setupComplete = setupMissing.length === 0;

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name);
    setFeedback(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao executar acao de configuracao.";
      if (msg.includes("SESSION_EXPIRED")) {
        window.dispatchEvent(new CustomEvent("session-expired"));
        return;
      }
      setFeedback({ kind: "error", text: msg });
    } finally {
      setBusyAction("");
    }
  };

  const refreshConfig = async () => {
    const cfg = await window.desktop.submitter.getConfig();
    setGeminiKey(cfg.geminiApiKey || "");
    setHasLinkedInSession(Boolean(cfg.hasLinkedInSession));
    setHasPrefillProfile(Boolean(cfg.hasPrefillProfile));
    if (!cfg.geminiApiKey || !cfg.hasLinkedInSession) {
      setShowSetupModal(true);
    }
  };

  const refreshCv = async () => {
    await runAction("get-cv", async () => {
      const cvContent = await window.desktop.submitter.getUserCv(token, apiUrl);
      setCv(cvContent);
      setFeedback({ kind: "success", text: "CV carregado do endpoint /users/me." });
    });
  };

  const saveGemini = async () => {
    await runAction("save-gemini", async () => {
      await window.desktop.submitter.setGeminiKey(geminiKey);
      await refreshConfig();
      setFeedback({ kind: "success", text: "Chave do Gemini salva com sucesso." });
    });
  };

  const doLinkedinLogin = async () => {
    await runAction("linkedin", async () => {
      await window.desktop.submitter.linkedinLogin();
      await refreshConfig();
      setFeedback({ kind: "success", text: "Sessao do LinkedIn salva com sucesso." });
    });
  };

  useEffect(() => {
    void refreshConfig();
    void refreshCv();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <DashboardHeader
        darkMode={darkMode}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        actions={
          <button
            onClick={() => {
              if (!setupComplete) {
                setShowSetupModal(true);
                setFeedback({ kind: "error", text: `Falta configurar: ${setupMissing.join(" | ")}.` });
                return;
              }
              onContinue();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Ir para Pre-preenchimento
          </button>
        }
      />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="card space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Configuracao previa obrigatoria</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Finalize os dois passos para liberar a tela de pre-preenchimento e iniciar submissoes com menor uso de tokens.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
              <p className="text-xs text-gray-500 dark:text-slate-400">Chave Gemini</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100">
                {geminiKey.trim() ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Configurada
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Pendente
                  </>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
              <p className="text-xs text-gray-500 dark:text-slate-400">Login LinkedIn (sessao)</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100">
                {hasLinkedInSession ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Sessao ativa
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Pendente
                  </>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700 md:col-span-2">
              <p className="text-xs text-gray-500 dark:text-slate-400">Perfil de respostas genericas</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100">
                {hasPrefillProfile ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Preenchido
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Ainda sera preenchido na proxima tela
                  </>
                )}
              </p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">CV do usuario (/users/me)</span>
            <textarea
              value={cv}
              onChange={(e) => setCv(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-gray-300 bg-transparent p-2 text-xs outline-none dark:border-slate-600"
              placeholder="CV carregado automaticamente."
            />
          </label>

          {feedback ? (
            <section
              className={`rounded-lg border p-3 text-sm ${
                feedback.kind === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                  : "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300"
              }`}
            >
              {feedback.text}
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              disabled={!!busyAction}
              onClick={() => setShowSetupModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              Configurar Agora
            </button>
            <button
              disabled={!!busyAction}
              onClick={() => void refreshConfig()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <RefreshCcw className="h-4 w-4" />
              Atualizar Status
            </button>
            <button
              disabled={!!busyAction}
              onClick={() => void refreshCv()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <RefreshCcw className="h-4 w-4" />
              Atualizar CV
            </button>
          </div>
        </section>
      </main>

      {showSetupModal ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Configuracao inicial</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  Cole sua chave Gemini e conclua o login no LinkedIn para continuar.
                </p>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-gray-600 dark:text-slate-300">Chave Gemini</span>
              <div className="flex items-center rounded-lg border border-gray-300 px-2 dark:border-slate-600">
                <KeyRound className="h-4 w-4 text-gray-400" />
                <input
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                  placeholder="Cole aqui a chave AIza..."
                />
                <button
                  disabled={!!busyAction}
                  onClick={() => void saveGemini()}
                  className="rounded-md bg-primary-600 px-2 py-1 text-xs text-white disabled:opacity-60"
                  title="Salvar chave Gemini"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            </label>

            <div className="mt-3 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
              <p className="text-xs text-gray-500 dark:text-slate-400">LinkedIn</p>
              <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">
                Abra o fluxo de login e finalize a autenticacao para salvar a sessao.
              </p>
              <button
                disabled={!!busyAction}
                onClick={() => void doLinkedinLogin()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <Linkedin className="h-4 w-4" />
                Login LinkedIn
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {setupComplete
                  ? "Tudo pronto. Voce seguira para o pre-preenchimento inteligente."
                  : "Finalize os dois passos para continuar."}
              </p>
              <button
                onClick={() => {
                  if (!setupComplete) {
                    setFeedback({ kind: "error", text: `Falta configurar: ${setupMissing.join(" | ")}.` });
                    return;
                  }
                  setShowSetupModal(false);
                  onContinue();
                }}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                {setupComplete ? "Concluir e avancar" : "Validar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
