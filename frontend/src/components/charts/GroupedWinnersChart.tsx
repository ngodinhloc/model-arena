"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { AnalyticsCategoryModelRow } from "@/types/experiment";
import { modelLabel, seriesColor, useChartTheme } from "./theme";

export interface WinnerGroup {
  name: string;
  models: AnalyticsCategoryModelRow[];
}

function GroupTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => (b.value as number) - (a.value as number));

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-1.5 font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const battles = (row.payload as Record<string, number>)[`${row.dataKey}__battles`];
          return (
            <div key={row.dataKey as string} className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: row.color }} />
              <span>{modelLabel(row.dataKey as string)}</span>
              <span className="ml-auto font-mono text-zinc-800 dark:text-zinc-200">{row.value}</span>
              <span>/ {battles}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GroupedWinnersChart({ groups, ariaLabel }: { groups: WinnerGroup[]; ariaLabel: string }) {
  const theme = useChartTheme();

  const models = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => g.models.forEach((m) => set.add(m.model)));
    return [...set].sort();
  }, [groups]);

  const data = useMemo(
    () =>
      groups.map((group) => {
        const row: Record<string, string | number> = { name: group.name };
        for (const model of models) {
          const found = group.models.find((m) => m.model === model);
          row[model] = found?.wins ?? 0;
          row[`${model}__battles`] = found?.battles ?? 0;
        }
        return row;
      }),
    [groups, models],
  );

  if (groups.length === 0) {
    return <p className="text-sm text-zinc-400">No completed experiments yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} aria-label={ariaLabel}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: theme.secondaryInk, fontSize: 12 }}
          axisLine={{ stroke: theme.axis }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: theme.mutedInk, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={GroupTooltip} cursor={{ fill: theme.grid, opacity: 0.4 }} />
        <Legend
          formatter={(value) => modelLabel(value as string)}
          wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }}
        />
        {models.map((model, i) => (
          <Bar key={model} dataKey={model} name={model} fill={seriesColor(theme, i)} radius={[4, 4, 0, 0]} maxBarSize={24} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
