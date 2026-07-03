"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
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
    "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
  const textareaClass =
    "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">New Experiment</h1>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Topic section */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Topic</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</label>
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
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Topic</label>
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
        </div>
      </section>

      {/* Candidate section */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
          Candidates
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {candidates.map((candidate, i) => (
            <AgentConfigCard
              key={candidate.number}
              label={`Candidate ${candidate.number} — argues ${candidate.number === 1 ? "FOR" : "AGAINST"}`}
              config={candidate}
              providers={providers}
              onChange={(next) => setCandidates((prev) => prev.map((c, j) => (j === i ? next : c)))}
            />
          ))}
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Persona (applied to both candidates)
          </label>
          <textarea
            value={candidatePersona}
            onChange={(e) => setCandidatePersona(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>
      </section>

      {/* Judge section */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Judges</h2>
        <div className="grid grid-cols-2 gap-4">
          {judges.map((judge, i) => (
            <AgentConfigCard
              key={judge.number}
              label={`Judge ${judge.number}`}
              config={judge}
              providers={providers}
              onChange={(next) => setJudges((prev) => prev.map((j, k) => (k === i ? next : j)))}
            />
          ))}
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Persona (applied to both judges)
          </label>
          <textarea
            value={judgePersona}
            onChange={(e) => setJudgePersona(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>
      </section>

      <button
        onClick={handleStart}
        disabled={topicId === "" || submitting}
        className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play size={15} />
        {submitting ? "Starting…" : "Start Experiment"}
      </button>
    </main>
  );
}
