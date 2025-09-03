export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full h-2 rounded bg-gray-200 dark:bg-gray-800 overflow-hidden">
      <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
    </div>
  );
}
