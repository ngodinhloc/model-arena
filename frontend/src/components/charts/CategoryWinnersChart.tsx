"use client";

import { AnalyticsCategoryWinners } from "@/types/experiment";
import { GroupedWinnersChart } from "./GroupedWinnersChart";

export function CategoryWinnersChart({ categories = [] }: { categories: AnalyticsCategoryWinners[] }) {
  return (
    <GroupedWinnersChart
      groups={categories.map((c) => ({ name: c.category, models: c.models }))}
      ariaLabel="Wins by category and model"
    />
  );
}
