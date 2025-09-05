import './globals.css';
import React from 'react';

export const metadata = {
  title: 'MCP Audit Compliance',
  description: 'Hybrid MCP-integrated audit compliance app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <header className="border-b border-gray-800 p-4">
          <nav className="container mx-auto flex gap-4 text-sm text-gray-300">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/upload" className="hover:text-white">Upload</a>
            <a href="/audit" className="hover:text-white">Audit</a>
            <a href="/dashboard" className="hover:text-white">Dashboard</a>
            <a href="/report" className="hover:text-white">Report</a>
          </nav>
        </header>
        <main className="container mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}
