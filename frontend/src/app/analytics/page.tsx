"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { getAnalytics } from "@/lib/api";
import { Analytics } from "@/types/experiment";

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnalytics().then(setAnalytics).catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        <BarChart3 size={22} className="text-indigo-500" />
        Analytics
      </h1>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {analytics && (
        <>
          <p className="mb-6 text-sm text-zinc-500">
            {analytics.totalExperiments} completed experiment{analytics.totalExperiments === 1 ? "" : "s"}
          </p>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3 text-right">Battles</th>
                  <th className="px-4 py-3 text-right">Wins</th>
                  <th className="px-4 py-3 text-right">Win rate</th>
                  <th className="px-4 py-3 text-right">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {analytics.models.map((row) => (
                  <tr key={row.model} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">{row.model}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">{row.battles}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">{row.wins}</td>
                    <td className="px-4 py-3 text-right font-mono text-indigo-600 dark:text-indigo-400">
                      {row.winRate}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">{row.avgScore}</td>
                  </tr>
                ))}
                {analytics.models.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-400">
                      No completed experiments yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
