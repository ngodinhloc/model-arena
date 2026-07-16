"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Sparkles, Gavel, MessageSquareQuote, Swords } from "lucide-react";
import AgentConfigCard from "@/components/AgentConfigCard";
import { createExperiment, getCategories, getModels, getTopics } from "@/lib/api";
import { AgentConfig, Category, ProviderWithModels, Topic } from "@/types/experiment";

const DEFAULT_CANDIDATE_PERSONA =
  "A sharp, evidence-driven debater who argues with concrete examples and anticipates counterarguments.";
const DEFAULT_JUDGE_PERSONA =
  "A rigorous, impartial judge who rewards evidence, logical coherence and penalizes rhetorical fluff.";

function defaultAgent(number: 1 | 2, providers: ProviderWithModels[]): AgentConfig {
  const provider = providers[0];
  return {
    number,
    provider: provider?.name ?? "",
    model: provider?.models[0]?.name ?? "",
    temperature: 0.7,
  };
}

export default function NewExperimentPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [topicId, setTopicId] = useState<number | "">("");
  const [round, setRound] = useState<number>(1);
  const [candidates, setCandidates] = useState<AgentConfig[]>([]);
  const [judges, setJudges] = useState<AgentConfig[]>([]);
  const [candidatePersona, setCandidatePersona] = useState(DEFAULT_CANDIDATE_PERSONA);
  const [judgePersona, setJudgePersona] = useState(DEFAULT_JUDGE_PERSONA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getModels(), getCategories()])
      .then(([providerList, categoryList]) => {
        setProviders(providerList);
        setCategories(categoryList);
        setCandidates([defaultAgent(1, providerList), defaultAgent(2, providerList)]);
        setJudges([defaultAgent(1, providerList), defaultAgent(2, providerList)]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (categoryId === "") {
      // Resets topic selection derived from the cleared category; no fetch is needed here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTopics([]);
      setTopicId("");
      return;
    }
    getTopics(categoryId)
      .then((topicList) => {
        setTopics(topicList);
        setTopicId(topicList[0]?.id ?? "");
      })
      .catch((e) => setError(String(e)));
  }, [categoryId]);

  async function handleStart() {
    if (topicId === "" || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { uuid } = await createExperiment({
        topicId,
        rounds: round,
        candidates,
        candidatePersona,
        judges,
        judgePersona,
      });
      window.dispatchEvent(new Event("experiment-created"));
      router.push(`/experiments/${uuid}`);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const selectClass =
    "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:ring-indigo-950";
  const textareaClass =
    "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:ring-indigo-950";
  const cardClass =
    "rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60";

  return (
    <main className="w-full max-w-none p-4">
      <div className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-lg shadow-slate-200/20 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:shadow-black/10">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-rose-400/20 blur-3xl dark:bg-rose-500/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Swords size={22} />
          </span>
          <div>
            <h1 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-rose-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-rose-400">
              New Experiment
            </h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Pit two LLMs against each other in a judged debate.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Topic section */}
      <section className="mb-4 border-0 bg-transparent p-0">
        <div className="grid gap-3 items-stretch xl:grid-cols-[1fr_1fr] pb-4">
          <div className={`grid h-full gap-3 ${cardClass}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                <MessageSquareQuote size={13} />
              </span>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Topic</h2>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : "")}
                  className={selectClass}
                >
                  <option value="">Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Topic
                </label>
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value ? parseInt(e.target.value, 10) : "")}
                  className={selectClass}
                  disabled={categoryId === ""}
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.topic}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Rounds
                </label>
                <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRound(value)}
                      className={`h-7 w-8 rounded-md text-sm font-medium transition-colors ${
                        round === value
                          ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                          : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={`h-full text-sm text-zinc-700 dark:text-zinc-200 ${cardClass}`}>
            <div className="h-full">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Score Card
                </h3>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                  100 points
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "Technical Accuracy",
                  "Reasoning",
                  "Practicality",
                  "Completeness",
                  "Clarity",
                ].map((card) => (
                  <div
                    key={card}
                    className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <span>{card}</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">20%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Candidate section */}
      <section className="mb-4 border-0 bg-transparent p-0">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={15} className="text-indigo-500" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Candidates
          </h2>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {candidates.map((candidate, i) => (
            <AgentConfigCard
              key={candidate.number}
              label={`Candidate ${candidate.number} — argues ${candidate.number === 1 ? "FOR" : "AGAINST"}`}
              accent={candidate.number === 1 ? "indigo" : "rose"}
              config={candidate}
              providers={providers}
              onChange={(next) => setCandidates((prev) => prev.map((c, j) => (j === i ? next : c)))}
            />
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Candidate Persona
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">Shared by both candidates</span>
          </div>
          <textarea
            value={candidatePersona}
            onChange={(e) => setCandidatePersona(e.target.value)}
            rows={2}
            className={`${textareaClass} min-h-[64px]`}
          />
        </div>
      </section>

      {/* Judge section */}
      <section className="mb-5 border-0 bg-transparent p-0">
        <div className="mb-2 flex items-center gap-2">
          <Gavel size={15} className="text-amber-500" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Judges
          </h2>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {judges.map((judge, i) => (
            <AgentConfigCard
              key={judge.number}
              label={`Judge ${judge.number}`}
              accent="amber"
              config={judge}
              providers={providers}
              onChange={(next) => setJudges((prev) => prev.map((j, k) => (k === i ? next : j)))}
            />
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Judge Persona
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">Shared by both judges</span>
          </div>
          <textarea
            value={judgePersona}
            onChange={(e) => setJudgePersona(e.target.value)}
            rows={2}
            className={`${textareaClass} min-h-[64px]`}
          />
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={handleStart}
          disabled={topicId === "" || submitting}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
        >
          <Play size={16} />
          {submitting ? "Starting…" : "Start Experiment"}
        </button>
      </div>
    </main>
  );
}
