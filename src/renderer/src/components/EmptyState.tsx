export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card text-center text-gray-600 dark:text-gray-300">
      <p>{message}</p>
    </div>
  );
}
