"use client";

import { use, useEffect, useRef, useState } from "react";
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

export default function ExperimentPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = use(params);
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scoreResponse, setScoreResponse] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
                window.dispatchEvent(new Event("experiment-completed"));
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

  const scoreMessage = messages.find((m) => m.node === "score" && m.agentStatus === "hasReplied");
  const finalScore = scoreResponse ?? ((scoreMessage?.response ?? null) as ScoreResponse | null);
  const streamMessages = messages.filter((m) => m.node !== "score");

  return (
    <main className="mx-auto max-w-4xl p-8">
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {detail && (
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{detail.category}</p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{detail.topic}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {detail.candidateConfig?.map((c) => `${c.provider}/${c.model}`).join("  vs  ")}
          </p>
        </header>
      )}

      <div className="space-y-4">
        {streamMessages.length === 0 && !finalScore && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            Waiting for the debate to start…
          </div>
        )}
        {streamMessages.map((message, i) => (
          <MessageCard key={`${message.actor}-${i}`} message={message} />
        ))}
        {finalScore && <ScoreCard response={finalScore} />}
      </div>
    </main>
  );
}
