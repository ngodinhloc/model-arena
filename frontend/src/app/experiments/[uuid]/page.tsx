"use client";

import { use, useEffect, useRef, useState } from "react";
import { Bot, MessagesSquare } from "lucide-react";
import { MessageCard, ScoreCard } from "@/components/MessageCards";
import { experimentWsUrl, getExperiment } from "@/lib/api";
import { ExperimentDetail, Message, ScoreResponse } from "@/types/experiment";

interface WsUpdate {
  event: string;
  data: {
    messages?: Message[];
    agentStatus?: string;
    topic?: string;
    category?: string;
  };
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  running: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const STATUS_DOT_STYLES: Record<string, string> = {
  running: "animate-pulse bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export default function ExperimentPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = use(params);
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scoreResponse, setScoreResponse] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    getExperiment(uuid)
      .then((experiment) => {
        if (cancelled) return;
        setDetail(experiment);
        setMessages(experiment.messages ?? []);
        setScoreResponse(experiment.scoreResponse ?? null);

        if (experiment.status === "running") {
          const ws = new WebSocket(experimentWsUrl(uuid));
          wsRef.current = ws;
          ws.onmessage = (msgEvent) => {
            try {
              const update: WsUpdate = JSON.parse(msgEvent.data);
              if (update.event === "experiment-update" && update.data.messages) {
                setMessages(update.data.messages);
              }
              if (update.event === "completed") {
                setDetail((d) => (d ? { ...d, status: "completed" } : d));
                window.dispatchEvent(new Event("experiment-completed"));
              }
              if (update.event === "failed") {
                setDetail((d) => (d ? { ...d, status: "failed" } : d));
              }
              if (update.event === "error") {
                setError(String(update.data));
              }
            } catch {
              // ignore malformed frames
            }
          };
          ws.onerror = () => setError("WebSocket connection failed.");
        }
      })
      .catch((e) => setError(String(e)));

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [uuid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, scoreResponse]);

  const scoreMessage = messages.find((m) => m.node === "score" && m.agentStatus === "hasReplied");
  const finalScore = scoreResponse ?? ((scoreMessage?.response ?? null) as ScoreResponse | null);
  const streamMessages = messages.filter((m) => m.node !== "score");
  const status = detail?.status ?? "running";
  const candidate1 = detail?.candidateConfig?.find((c) => c.candidateNumber === 1);
  const candidate2 = detail?.candidateConfig?.find((c) => c.candidateNumber === 2);

  return (
    <main className="w-full max-w-none p-4">
      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {detail && (
        <header className="mb-5 rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5 shadow-lg shadow-slate-200/20 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:shadow-black/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                  {detail.category}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLES[status]}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_STYLES[status]}`} />
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-100">
                “{detail.topic}”
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {candidate1 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
                    <Bot size={12} />
                    {candidate1.provider}/{candidate1.model}
                  </span>
                )}
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  vs
                </span>
                {candidate2 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                    <Bot size={12} />
                    {candidate2.provider}/{candidate2.model}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="space-y-5">
        {streamMessages.length === 0 && !finalScore && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 py-16 text-sm text-zinc-400 dark:border-zinc-800">
            <MessagesSquare size={22} className="animate-pulse text-indigo-400" />
            Waiting for the debate to start…
          </div>
        )}
        {streamMessages.map((message, i) => (
          <MessageCard key={`${message.actor}-${i}`} message={message} />
        ))}
        {finalScore && <ScoreCard response={finalScore} />}
        <div ref={bottomRef} />
      </div>
    </main>
  );
}
