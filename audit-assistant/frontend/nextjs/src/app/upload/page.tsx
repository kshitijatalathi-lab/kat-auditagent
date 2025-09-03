'use client';
import { useMemo, useRef, useState } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canIndex = useMemo(() => uploaded.length > 0 && !indexing, [uploaded, indexing]);

  const onChoose: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setFiles(e.target.files);
  };

  const acceptTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  const maxSize = 50 * 1024 * 1024; // 50MB

  function filterValid(selected: FileList | File[]): File[] {
    const arr = Array.from(selected as any as File[]);
    const valid: File[] = [];
    for (const f of arr) {
      if (!acceptTypes.includes(f.type)) {
        toast.error(`${f.name}: unsupported type`);
        continue;
      }
      if (f.size > maxSize) {
        toast.error(`${f.name}: exceeds 50MB limit`);
        continue;
      }
      valid.push(f);
    }
    return valid;
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const valid = filterValid(e.dataTransfer.files);
      if (valid.length > 0) {
        // synthesize a FileList using DataTransfer to keep <input> in sync
        const dt = new DataTransfer();
        valid.forEach((f) => dt.items.add(f));
        setFiles(dt.files);
        if (inputRef.current) inputRef.current.files = dt.files;
      }
    }
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
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
        <div>
          <h1 className="text-2xl font-semibold">Document Upload</h1>
          <p className="text-muted-foreground">Upload policy documents for AI-powered compliance analysis</p>
        </div>

        {/* Upload Card */}
        <div className="border rounded-lg p-6 bg-card space-y-4">
          <div className="text-lg font-medium">Upload Documents</div>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-muted-foreground/30'}`}
          >
            <div className="font-medium">Drag and drop your documents</div>
            <div className="text-sm text-muted-foreground mt-1">Supports PDF, DOCX, and TXT files up to 50MB each</div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-2 rounded-md bg-blue-600 text-white"
              >
                Choose Files
              </button>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                multiple
                accept={acceptTypes.join(',')}
                onChange={(e) => {
                  const f = e.target.files;
                  if (!f) return;
                  const valid = filterValid(f);
                  const dt = new DataTransfer();
                  valid.forEach((x) => dt.items.add(x));
                  if (inputRef.current) inputRef.current.files = dt.files;
                  setFiles(dt.files);
                }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button disabled={!files || uploading} onClick={doUpload} className={`px-4 py-2 rounded-md ${uploading ? 'bg-gray-300' : 'bg-blue-600 text-white'}`}>{uploading ? 'Uploading…' : 'Upload'}</button>
            <button disabled={!canIndex} onClick={doIndex} className="px-4 py-2 rounded-md border">{indexing ? 'Indexing…' : 'Build Index'}</button>
          </div>
        </div>

        {/* Supported Types */}
        <div className="border rounded-lg p-6 bg-card">
          <div className="text-lg font-medium mb-3">Supported Document Types</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="font-medium">PDF Documents</div>
              <div className="text-sm text-muted-foreground">Policy manuals, regulations</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="font-medium">Word Documents</div>
              <div className="text-sm text-muted-foreground">Procedures, guidelines</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="font-medium">Text Files</div>
              <div className="text-sm text-muted-foreground">Plain text policies</div>
            </div>
          </div>
        </div>

        {/* Uploaded Files */}
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

