import { Badge } from "@/components/ui/badge";

export function ClauseCard({ clause }: { clause: any }) {
  const law = clause?.law || clause?.source || "Law";
  const article = clause?.article || clause?.article_id || "";
  const id = clause?.clause_id ?? clause?.chunk_id ?? "";
  const conf = clause?.confidence ?? clause?.score;
  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline">{law}{article ? `.${article}` : ''}</Badge>
        {id && <Badge>#{id}</Badge>}
        {typeof conf === 'number' && (
          <span className="text-xs text-muted-foreground">conf {conf.toFixed(2)}</span>
        )}
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {clause?.text || clause?.clause_text || ''}
      </div>
    </div>
  );
}
