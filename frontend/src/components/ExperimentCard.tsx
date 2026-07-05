"use client";

import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";

interface CandidateSummary {
  provider: string;
  model: string;
}

interface Props {
  uuid: string;
  topic: string;
  category: string;
  candidate1: CandidateSummary;
  candidate2: CandidateSummary;
}

export default function ExperimentCard({ uuid, topic, category, candidate1, candidate2 }: Props) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/experiments/${uuid}`)}
      className="w-full rounded-2xl border border-zinc-200/70 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
          {category}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Running
        </span>
      </div>
      <p className="mb-3 line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">"{topic}"</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
          <Bot size={12} />
          {candidate1.provider}/{candidate1.model}
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">vs</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <Bot size={12} />
          {candidate2.provider}/{candidate2.model}
        </span>
      </div>
    </button>
  );
}
