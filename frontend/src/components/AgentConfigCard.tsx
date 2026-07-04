"use client";

import { Bot } from "lucide-react";
import { AgentConfig, ProviderWithModels } from "@/types/experiment";

export const TEMPERATURES = [0, 0.3, 0.5, 0.7, 1.0];

interface Props {
  label: string;
  accent: "indigo" | "rose" | "amber";
  config: AgentConfig;
  providers: ProviderWithModels[];
  onChange: (config: AgentConfig) => void;
}

const ACCENT_ICON: Record<Props["accent"], string> = {
  indigo: "bg-indigo-600 dark:bg-indigo-500",
  rose: "bg-rose-600 dark:bg-rose-500",
  amber: "bg-amber-500 dark:bg-amber-600",
};

export default function AgentConfigCard({ label, accent, config, providers, onChange }: Props) {
  const provider = providers.find((p) => p.name === config.provider);
  const models = provider?.models ?? [];

  function handleProviderChange(name: string) {
    const next = providers.find((p) => p.name === name);
    onChange({ ...config, provider: name, model: next?.models[0]?.name ?? "" });
  }

  const selectClass =
    "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:ring-indigo-950";

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${ACCENT_ICON[accent]}`}>
          <Bot size={13} />
        </span>
        {label}
      </p>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Provider</label>
          <select value={config.provider} onChange={(e) => handleProviderChange(e.target.value)} className={selectClass}>
            {providers.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Model</label>
          <select
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            className={selectClass}
          >
            {models.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Temperature</label>
          <select
            value={config.temperature}
            onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
            className={selectClass}
          >
            {TEMPERATURES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
