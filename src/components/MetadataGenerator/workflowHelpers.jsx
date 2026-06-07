import React from "react";

export function StatusBadge({ status, progress }) {
  const map = {
    done: "bg-green-500/20 text-green-400",
    processing: "bg-primary/20 text-primary animate-pulse",
    upscaling: "bg-indigo-500/20 text-indigo-400 animate-pulse",
    upscale_queued: "bg-indigo-500/10 text-indigo-300",
    error: "bg-red-500/20 text-red-500",
    pending: "bg-surface text-muted",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider shrink-0 ${
        map[status] || map.pending
      }`}
    >
      {status === "upscaling" && progress !== undefined && progress > 0
        ? `upscaling (${Math.round(progress)}%)`
        : status === "upscale_queued" ? "Queued for Upscale" : status}
    </span>
  );
}

export const getScoreMeta = (score) => {
  if (score >= 80) return { label: 'Hot', emoji: '🔥', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', trackColor: '#10b981' };
  if (score >= 60) return { label: 'Good', emoji: '✅', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', trackColor: '#3b82f6' };
  if (score >= 40) return { label: 'Average', emoji: '⚠️', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', trackColor: '#f59e0b' };
  return { label: 'Low', emoji: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', trackColor: '#ef4444' };
};
