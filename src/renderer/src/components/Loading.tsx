export function Loading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="text-sm text-gray-600 dark:text-gray-300">{label}</div>
    </div>
  );
}
