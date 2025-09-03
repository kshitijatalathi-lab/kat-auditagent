'use client';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { AuthGate } from '@/components/auth/AuthGate';

interface UploadResp { path: string; filename: string }
interface IndexResp { index_path?: string; meta_path?: string; count?: number; ok: boolean }

export default function UploadIndexPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploaded, setUploaded] = useState<UploadResp[]>([]);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const canIndex = useMemo(() => uploaded.length > 0 && !indexing, [uploaded, indexing]);

  const onChoose: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setFiles(e.target.files);
  };

  const doUpload = async () => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const results: UploadResp[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append('file', files[i]);
        const resp = await apiFetch<UploadResp>('/adk/upload', { method: 'POST', body: fd });
        results.push(resp);
        toast.success(`Uploaded ${resp.filename}`);
      }
      setUploaded(prev => [...prev, ...results]);
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const doIndex = async () => {
    if (!canIndex) return;
    setIndexing(true);
    try {
      const body = { files: uploaded.map(u => u.path) };
      const resp = await apiFetch<IndexResp>('/adk/index', { method: 'POST', body: JSON.stringify(body) });
      toast.success(`Indexed ${resp.count ?? 0} docs`);
    } catch (e) {
      toast.error('Indexing failed');
    } finally {
      setIndexing(false);
    }
  };

  return (
    <AuthGate>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Upload & Index</h1>
          <a className="underline" href="/dashboard">Back to Dashboard</a>
        </div>

        <div className="border rounded-lg p-4 bg-card space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Choose documents (PDF/TXT)</label>
            <input className="mt-2 block" type="file" multiple onChange={onChoose} />
          </div>
          <div className="flex gap-2">
            <button disabled={!files || uploading} onClick={doUpload} className={`px-4 py-2 rounded-md ${uploading ? 'bg-gray-300' : 'bg-blue-600 text-white'}`}>{uploading ? 'Uploading…' : 'Upload'}</button>
            <button disabled={!canIndex} onClick={doIndex} className="px-4 py-2 rounded-md border">{indexing ? 'Indexing…' : 'Build Index'}</button>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground mb-2">Uploaded Files</div>
          {uploaded.length === 0 ? (
            <div className="text-sm text-muted-foreground">No files uploaded yet.</div>
          ) : (
            <ul className="text-sm list-disc pl-6">
              {uploaded.map((u, i) => (
                <li key={i}>
                  <span className="font-medium">{u.filename}</span>
                  <span className="text-muted-foreground"> — {u.path}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AuthGate>
  );
}
