import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ClauseCard({ clause }: { clause: any }) {
  const law = clause?.law || clause?.source || "Law";
  const article = clause?.article || clause?.article_id || "";
  const id = clause?.clause_id ?? clause?.chunk_id ?? "";
  const conf = clause?.confidence ?? clause?.score;
  const title = clause?.title || '';
  const text = clause?.text || clause?.clause_text || '';
  const citation = `${law}${article ? `.${article}` : ''}${id ? ` #${id}` : ''}`;

  const onCopyCitation = async () => {
    try { await navigator.clipboard.writeText(citation); toast.success('Copied citation'); } catch {}
  };
  const onCopyText = async () => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied clause text'); } catch {}
  };

  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline">{law}{article ? `.${article}` : ''}</Badge>
        {id && <Badge>#{id}</Badge>}
        {title && <span className="text-xs text-muted-foreground truncate">{title}</span>}
        {typeof conf === 'number' && (
          <span className="ml-auto text-xs text-muted-foreground">conf {Number(conf).toFixed(2)}</span>
        )}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono text-muted-foreground">{citation}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onCopyCitation}>Copy citation</Button>
          <Button size="sm" variant="outline" onClick={onCopyText}>Copy text</Button>
        </div>
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
