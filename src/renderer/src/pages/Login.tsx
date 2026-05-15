import { useState } from "react";
import { Briefcase, Lock, Mail, Moon, Sun } from "lucide-react";

interface LoginProps {
  darkMode: boolean;
  loading: boolean;
  error: string;
  onToggleTheme: () => void;
  onSubmit: (email: string, senha: string) => Promise<void>;
}

export function Login({ darkMode, loading, error, onToggleTheme, onSubmit }: LoginProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="absolute right-4 top-4">
        <button
          onClick={onToggleTheme}
          className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          title="Alternar tema"
        >
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex rounded-lg bg-primary-100 p-2 text-primary-700">
              <Briefcase className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Auto SBS</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Inteligencia Artificial para Vagas</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await onSubmit(email, senha);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm text-gray-700 dark:text-slate-300">Email</span>
              <div className="flex items-center rounded-lg border border-gray-300 px-3 dark:border-slate-600">
                <Mail className="h-4 w-4 text-gray-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent px-2 py-2.5 text-sm text-gray-900 outline-none dark:text-slate-100"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-700 dark:text-slate-300">Senha</span>
              <div className="flex items-center rounded-lg border border-gray-300 px-3 dark:border-slate-600">
                <Lock className="h-4 w-4 text-gray-400" />
                <input
                  required
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full bg-transparent px-2 py-2.5 text-sm text-gray-900 outline-none dark:text-slate-100"
                />
              </div>
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-70"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
