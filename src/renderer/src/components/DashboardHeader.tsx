import { Briefcase, LogOut, Moon, Sun } from "lucide-react";

interface DashboardHeaderProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function DashboardHeader({ darkMode, onToggleTheme, onLogout }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-100 p-2 text-primary-700">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Auto SBS</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400">Inteligencia Artificial para Vagas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Alternar tema"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
