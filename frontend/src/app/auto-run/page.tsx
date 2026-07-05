"use client";

import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import ExperimentCard from "@/components/ExperimentCard";
import { TEMPERATURES } from "@/components/AgentConfigCard";
import { createExperiment, getCategories, getModels, getTopics } from "@/lib/api";
import { AgentConfig, Category, ProviderWithModels, Topic } from "@/types/experiment";

const DEFAULT_CANDIDATE_PERSONA =
  "A sharp, evidence-driven debater who argues with concrete examples and anticipates counterarguments.";
const DEFAULT_JUDGE_PERSONA =
  "A rigorous, impartial judge who rewards evidence, logical coherence and penalizes rhetorical fluff.";

const RUN_COUNTS = [5, 10, 20, 30];

interface AutoRunResult {
  uuid: string;
  topic: string;
  category: string;
  candidate1: AgentConfig;
  candidate2: AgentConfig;
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomAgentConfig(number: 1 | 2, providers: ProviderWithModels[]): AgentConfig {
  const provider = randomItem(providers);
  const model = randomItem(provider.models);
  return {
    number,
    provider: provider.name,
    model: model.name,
    temperature: randomItem(TEMPERATURES),
  };
}

export default function AutoRunPage() {
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [topicPool, setTopicPool] = useState<Topic[]>([]);
  const [runsCount, setRunsCount] = useState<number>(RUN_COUNTS[0]);
  const [results, setResults] = useState<AutoRunResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getModels(), getCategories()])
      .then(async ([providerList, categoryList]) => {
        setProviders(providerList);
        setCategories(categoryList);
        const topicLists = await Promise.all(categoryList.map((c) => getTopics(c.id)));
        setTopicPool(topicLists.flat());
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function handleAutoRun() {
    if (submitting || providers.length === 0 || topicPool.length === 0) return;
    setSubmitting(true);
    setError(null);

    const requests = Array.from({ length: runsCount }, () => {
      const topic = randomItem(topicPool);
      const category = categories.find((c) => c.id === topic.categoryId);
      const candidates: AgentConfig[] = [randomAgentConfig(1, providers), randomAgentConfig(2, providers)];
      const judges: AgentConfig[] = [randomAgentConfig(1, providers), randomAgentConfig(2, providers)];
      return { topic, category, candidates, judges };
    });

    const settled = await Promise.allSettled(
      requests.map(async (r): Promise<AutoRunResult> => {
        const { uuid } = await createExperiment({
          topicId: r.topic.id,
          rounds: 1,
          candidates: r.candidates,
          candidatePersona: DEFAULT_CANDIDATE_PERSONA,
          judges: r.judges,
          judgePersona: DEFAULT_JUDGE_PERSONA,
        });
        return {
          uuid,
          topic: r.topic.topic,
          category: r.category?.name ?? "",
          candidate1: r.candidates[0],
          candidate2: r.candidates[1],
        };
      }),
    );

    const created = settled
      .filter((s): s is PromiseFulfilledResult<AutoRunResult> => s.status === "fulfilled")
      .map((s) => s.value);
    const failedCount = settled.length - created.length;

    setResults((prev) => [...created, ...prev]);
    if (created.length > 0) window.dispatchEvent(new Event("experiment-created"));
    if (failedCount > 0) setError(`${failedCount} of ${requests.length} experiment(s) failed to create.`);
    setSubmitting(false);
  }

  return (
    <main className="w-full max-w-none p-4">
      <div className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-lg shadow-slate-200/20 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:shadow-black/10">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-rose-400/20 blur-3xl dark:bg-rose-500/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Repeat size={22} />
          </span>
          <div>
            <h1 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-rose-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-rose-400">
              Auto Run
            </h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Fire off a batch of experiments with randomized topics, candidates and judges.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Runs</label>
          <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {RUN_COUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRunsCount(value)}
                className={`h-7 w-9 rounded-md text-sm font-medium transition-colors ${
                  runsCount === value
                    ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleAutoRun}
          disabled={submitting || topicPool.length === 0}
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
        >
          <Repeat size={16} />
          {submitting ? "Running…" : "Auto Run"}
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
