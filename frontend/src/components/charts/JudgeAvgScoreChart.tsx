"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, TooltipContentProps, XAxis, YAxis } from "recharts";
import { AnalyticsJudgeAvgScoreRow } from "@/types/experiment";
import { modelLabel, seriesColor, useChartTheme } from "./theme";

function JudgeTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as AnalyticsJudgeAvgScoreRow;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <div className="font-medium text-zinc-900 dark:text-zinc-100">{modelLabel(row.model)}</div>
      <div className="text-zinc-500 dark:text-zinc-400">
        <span className="font-mono text-zinc-800 dark:text-zinc-200">
          {row.avgScore}/{row.maxPossible}
        </span>{" "}
        avg pts
      </div>
      <div className="text-zinc-500 dark:text-zinc-400">{row.evaluations} evaluations</div>
    </div>
  );
}

export function JudgeAvgScoreChart({ judges = [] }: { judges: AnalyticsJudgeAvgScoreRow[] }) {
  const theme = useChartTheme();

  if (judges.length === 0) {
    return <p className="text-sm text-zinc-400">No completed experiments yet.</p>;
  }

  const maxPossible = Math.max(...judges.map((j) => j.maxPossible), 1);

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={judges} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey="model"
          tickFormatter={(value: string) => modelLabel(value)}
          tick={{ fill: theme.secondaryInk, fontSize: 12 }}
          axisLine={{ stroke: theme.axis }}
          tickLine={false}
        />
        <YAxis
          domain={[0, maxPossible]}
          ticks={[0, maxPossible * 0.25, maxPossible * 0.5, maxPossible * 0.75, maxPossible]}
          tick={{ fill: theme.mutedInk, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={JudgeTooltip} cursor={{ fill: theme.grid, opacity: 0.4 }} />
        <Bar dataKey="avgScore" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {judges.map((row, i) => (
            <Cell key={row.model} fill={seriesColor(theme, i)} />
          ))}
          <LabelList dataKey="avgScore" position="top" fill={theme.ink} fontSize={12} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
