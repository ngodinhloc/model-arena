"use client";

import { useEffect, useState } from "react";
import { BarChart3, Crown, Star, Swords, TrendingUp, Trophy } from "lucide-react";
import { getAnalytics } from "@/lib/api";
import { Analytics } from "@/types/experiment";
import { CategoryWinnersChart } from "@/components/charts/CategoryWinnersChart";
import { ScoreCardMaxChart } from "@/components/charts/ScoreCardMaxChart";
import { ScoreCardWinnersChart } from "@/components/charts/ScoreCardWinnersChart";
import { seriesColor, useChartTheme } from "@/components/charts/theme";

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = useChartTheme();

  useEffect(() => {
    getAnalytics().then(setAnalytics).catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="w-full p-8">
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

          <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <Swords size={12} /> Battles
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <Trophy size={12} /> Wins
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <TrendingUp size={12} /> Win rate
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <Star size={12} /> Avg score
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.models.map((row, i) => (
                  <tr
                    key={row.model}
                    className={`border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60 ${
                      i === 0 ? "bg-amber-50/50 dark:bg-amber-500/[0.06]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex w-4 justify-center text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                          {i === 0 ? <Crown size={15} className="text-amber-500" /> : i + 1}
                        </span>
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: seriesColor(theme, i) }}
                        />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.model}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">{row.battles}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">{row.wins}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2.5">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
                          <div
                            className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
                            style={{ width: `${row.winRate}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {row.winRate}%
                        </span>
                      </div>
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

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Wins by category</h2>
              <CategoryWinnersChart categories={analytics.categoryWinners} />
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Winner by score card</h2>
              <ScoreCardWinnersChart cards={analytics.scoreCardWinners} />
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Highest score per score card</h2>
            <ScoreCardMaxChart cards={analytics.scoreCards} />
          </div>
        </>
      )}
    </main>
  );
}
