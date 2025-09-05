"use client";

import React from "react";
import { apiBase } from "../../lib/api";

export default function UploadPage() {
  const [fileId, setFileId] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Uploading and indexing...");
    try {
      const res = await fetch(`${apiBase()}/upload/gdrive?file_id=${encodeURIComponent(fileId)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Upload failed");
      setStatus(`Indexed ${data.chunks} chunks.`);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Upload</h1>
      <p className="text-gray-300">Provide a Google Drive File ID (via mcp-gdrive) to ingest PDF content.</p>
      <form onSubmit={onUpload} className="space-y-3">
        <input
          className="px-3 py-2 rounded bg-gray-900 border border-gray-700 w-full"
          placeholder="Google Drive file ID"
          value={fileId}
          onChange={(e) => setFileId(e.target.value)}
        />
        <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500" type="submit">
          Upload from GDrive
        </button>
      </form>
      {status && <div className="text-sm text-gray-300">{status}</div>}
    </div>
  );
}
