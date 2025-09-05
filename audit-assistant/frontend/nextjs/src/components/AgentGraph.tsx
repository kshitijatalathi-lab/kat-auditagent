"use client";
import React, { useMemo } from "react";

export type GraphData = {
  nodes: Array<{ id: string; label?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

export type StatusMap = Record<string, "idle" | "running" | "done" | "error">;

function colorFor(status: StatusMap[string]) {
  switch (status) {
    case "running":
      return { fill: "#e0f2fe", stroke: "#0284c7" };
    case "done":
      return { fill: "#ecfdf5", stroke: "#059669" };
    case "error":
      return { fill: "#fef2f2", stroke: "#dc2626" };
    default:
      return { fill: "#fff", stroke: "#cbd5e1" };
  }
}

// Very simple layered layout: compute breadth levels by incoming degree
function layout(graph: GraphData) {
  if (!graph || !graph.nodes || !graph.edges) {
    return { nodePos: {}, edgePos: [], width: 200, height: 100 };
  }
  
  const inDeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  const nodes = graph.nodes.map(n => n.id);
  nodes.forEach(n => {
    inDeg[n] = 0;
    adj[n] = [];
  });
  graph.edges.forEach(e => {
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
    adj[e.from].push(e.to);
  });
  const layers: string[][] = [];
  let frontier = nodes.filter(n => (inDeg[n] || 0) === 0);
  const indeg = { ...inDeg };
  const visited = new Set<string>();
  while (frontier.length > 0) {
    layers.push(frontier);
    const next: string[] = [];
    for (const u of frontier) {
      visited.add(u);
      for (const v of adj[u] || []) {
        indeg[v] = (indeg[v] || 0) - 1;
        if (indeg[v] === 0) next.push(v);
      }
    }
    frontier = next.filter(n => !visited.has(n));
    if (frontier.length === 0 && visited.size < nodes.length) {
      // cycle fallback: add remaining
      const remain = nodes.filter(n => !visited.has(n));
      layers.push(remain);
      break;
    }
  }
  // positions
  const nodePos: Record<string, { x: number; y: number }> = {};
  const layerGapX = 220;
  const layerGapY = 100;
  layers.forEach((layer, i) => {
    layer.forEach((n, j) => {
      nodePos[n] = { x: 100 + i * layerGapX, y: 60 + j * layerGapY };
    });
  });
  return { layers, nodePos };
}

export function AgentGraph({ graph, statuses }: { graph: GraphData; statuses?: StatusMap }) {
  const { nodePos } = useMemo(() => layout(graph), [graph]);
  const nodePositions = nodePos as Record<string, { x: number; y: number }>;
  const width = Math.max(400, ...Object.values(nodePositions).map(p => p.x + 140));
  const height = Math.max(200, ...Object.values(nodePositions).map(p => p.y + 80));

  return (
    <div className="w-full overflow-auto border rounded bg-white">
      <svg width={width} height={height} className="block">
        {/* edges */}
        {graph?.edges?.map((e, idx) => {
          const from = nodePositions[e.from];
          const to = nodePositions[e.to];
          if (!from || !to) return null;
          const status = statuses?.[`${e.from}->${e.to}`] || "idle";
          const color = colorFor(status).stroke;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={idx}>
              <defs>
                <marker id={`arrow-${idx}`} markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                </marker>
              </defs>
              <line x1={from.x + 100} y1={from.y + 24} x2={to.x} y2={to.y + 24} stroke={color} strokeWidth={2} markerEnd={`url(#arrow-${idx})`} />
              {e.label && (
                <text x={midX} y={midY - 6} fontSize="11" textAnchor="middle" fill="#475569">{e.label}</text>
              )}
            </g>
          );
        })}
        {/* nodes */}
        {graph?.nodes?.map((n, idx) => {
          const p = nodePositions[n.id];
          if (!p) return null;
          const status = statuses?.[n.id] || "idle";
          const { fill, stroke } = colorFor(status);
          return (
            <g key={idx}>
              <rect x={p.x} y={p.y} width={120} height={48} rx={8} ry={8} fill={fill} stroke={stroke} />
              <text x={p.x + 60} y={p.y + 28} textAnchor="middle" fontSize="12" fill="#0f172a">{n.label || n.id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
