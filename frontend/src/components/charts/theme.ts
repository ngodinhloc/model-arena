"use client";

import { useEffect, useState } from "react";

export interface ChartTheme {
  series: string[];
  ink: string;
  secondaryInk: string;
  mutedInk: string;
  grid: string;
  axis: string;
}

const LIGHT_THEME: ChartTheme = {
  series: ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"],
  ink: "#0b0b0b",
  secondaryInk: "#52514e",
  mutedInk: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
};

const DARK_THEME: ChartTheme = {
  series: ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"],
  ink: "#ffffff",
  secondaryInk: "#c3c2b7",
  mutedInk: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
};

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(LIGHT_THEME);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    // window.matchMedia is unavailable during SSR, so the OS preference can only be read here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(query.matches ? DARK_THEME : LIGHT_THEME);
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? DARK_THEME : LIGHT_THEME);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return theme;
}

export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.series[index % theme.series.length];
}

export function modelLabel(model: string): string {
  const parts = model.split("/");
  return parts.length > 1 ? parts[1] : model;
}
