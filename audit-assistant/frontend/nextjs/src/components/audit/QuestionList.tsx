"use client";

export function QuestionList({
  questions,
  currentIndex,
  onSelect,
}: {
  questions: { id: string; text: string; score?: number }[];
  currentIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="p-2 space-y-1">
      {questions.map((q, i) => (
        <button
          key={q.id}
          onClick={() => onSelect(i)}
          className={`w-full text-left px-3 py-2 rounded-md border hover:bg-accent ${i === currentIndex ? 'bg-accent' : ''}`}
        >
          <div className="text-sm font-medium line-clamp-2">{q.text}</div>
          {typeof q.score === 'number' && (
            <div className="text-xs text-muted-foreground mt-1">Score: {q.score.toFixed(1)}</div>
          )}
        </button>
      ))}
    </div>
  );
}
