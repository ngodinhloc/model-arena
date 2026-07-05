"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import ExperimentCard from "@/components/ExperimentCard";
import { testRecover } from "@/lib/api";
import { StalledExperiment, StallState } from "@/types/experiment";

const COUNTS = [1, 2, 3, 4, 5];

const STALL_STATES: { value: StallState; label: string }[] = [
  { value: "candidate", label: "Candidate" },
  { value: "judge", label: "Judge" },
  { value: "score", label: "Score" },
];

export default function TestAutoRecoveryPage() {
  const [count, setCount] = useState<number>(COUNTS[0]);
  const [stallState, setStallState] = useState<StallState>("candidate");
  const [results, setResults] = useState<StalledExperiment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await testRecover(count, stallState);
      setResults((prev) => [...created, ...prev]);
      if (created.length > 0) window.dispatchEvent(new Event("experiment-created"));
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="w-full max-w-none p-4">
      <div className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-lg shadow-slate-200/20 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:shadow-black/10">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-rose-400/20 blur-3xl dark:bg-rose-500/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <LifeBuoy size={22} />
          </span>
          <div>
            <h1 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-rose-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-rose-400">
              Test Auto Recovery
            </h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Create stall experiments to test auto-recovery.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-4 rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center gap-3">
          <label className="whitespace-nowrap text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Count
          </label>
          <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {COUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCount(value)}
                className={`h-7 w-8 rounded-md text-sm font-medium transition-colors ${
                  count === value
                    ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="whitespace-nowrap text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Stall state
          </label>
          <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {STALL_STATES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStallState(s.value)}
                className={`h-7 rounded-md px-3 text-sm font-medium transition-colors ${
                  stallState === s.value
                    ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={submitting}
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
        >
          <LifeBuoy size={16} />
          {submitting ? "Starting…" : "Start"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((r) => (
            <ExperimentCard
              key={r.uuid}
              uuid={r.uuid}
              topic={r.topic}
              category={r.category}
              candidate1={r.candidate1}
              candidate2={r.candidate2}
            />
          ))}
        </div>
      )}
    </main>
  );
}
