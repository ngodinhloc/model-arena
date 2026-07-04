"use client";

import { AnalyticsScoreCardWinners } from "@/types/experiment";
import { GroupedWinnersChart } from "./GroupedWinnersChart";

export function ScoreCardWinnersChart({ cards = [] }: { cards: AnalyticsScoreCardWinners[] }) {
  return (
    <GroupedWinnersChart
      groups={cards.map((c) => ({ name: c.cardName, models: c.models }))}
      ariaLabel="Wins by score card and model"
    />
  );
}
