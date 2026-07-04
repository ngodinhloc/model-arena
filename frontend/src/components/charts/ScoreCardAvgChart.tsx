"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, TooltipContentProps, XAxis, YAxis } from "recharts";
import { AnalyticsScoreCardRow } from "@/types/experiment";
import { seriesColor, useChartTheme } from "./theme";

function ScoreCardTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const card = payload[0].payload as AnalyticsScoreCardRow;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <div className="font-medium text-zinc-900 dark:text-zinc-100">{card.cardName}</div>
      <div className="text-zinc-500 dark:text-zinc-400">
        <span className="font-mono text-zinc-800 dark:text-zinc-200">
          {card.avgPoint}/{card.maxPossible}
        </span>{" "}
        avg pts
      </div>
      <div className="text-zinc-500 dark:text-zinc-400">{card.evaluations} evaluations</div>
    </div>
  );
}

export function ScoreCardAvgChart({ cards = [] }: { cards: AnalyticsScoreCardRow[] }) {
  const theme = useChartTheme();

  if (cards.length === 0) {
    return <p className="text-sm text-zinc-400">No completed experiments yet.</p>;
  }

  const maxPossible = Math.max(...cards.map((c) => c.maxPossible), 1);

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={cards} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis dataKey="cardName" tick={{ fill: theme.secondaryInk, fontSize: 12 }} axisLine={{ stroke: theme.axis }} tickLine={false} />
        <YAxis
          domain={[0, maxPossible]}
          ticks={[0, maxPossible * 0.25, maxPossible * 0.5, maxPossible * 0.75, maxPossible]}
          tick={{ fill: theme.mutedInk, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={ScoreCardTooltip} cursor={{ fill: theme.grid, opacity: 0.4 }} />
        <Bar dataKey="avgPoint" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {cards.map((card, i) => (
            <Cell key={card.cardName} fill={seriesColor(theme, i)} />
          ))}
          <LabelList dataKey="avgPoint" position="top" fill={theme.ink} fontSize={12} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
