"use client";

import { AgentConfig, ProviderWithModels } from "@/types/experiment";

export const TEMPERATURES = [0, 0.3, 0.5, 0.7, 1.0];

interface Props {
  label: string;
  config: AgentConfig;
  providers: ProviderWithModels[];
  onChange: (config: AgentConfig) => void;
}

export default function AgentConfigCard({ label, config, providers, onChange }: Props) {
  const provider = providers.find((p) => p.name === config.provider);
  const models = provider?.models ?? [];

  function handleProviderChange(name: string) {
    const next = providers.find((p) => p.name === name);
    onChange({ ...config, provider: name, model: next?.models[0]?.name ?? "" });
  }

  const selectClass =
    "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Provider</label>
          <select value={config.provider} onChange={(e) => handleProviderChange(e.target.value)} className={selectClass}>
            {providers.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Model</label>
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
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Temperature</label>
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
