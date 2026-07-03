"use client";

import { Bot, Gavel, Trophy } from "lucide-react";
import {
  CandidateResponse,
  JudgeScoreSheet,
  Message,
  ScoreResponse,
} from "@/types/experiment";

export function ThinkingCard({ actor }: { actor: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{actor}</p>
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
        Thinking…
      </div>
    </div>
  );
}

export function CandidateCard({ actor, response }: { actor: string; response: CandidateResponse }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
        <Bot size={14} /> {actor}
      </p>
      <p className="mb-2 font-medium text-zinc-800 dark:text-zinc-200">{response.header}</p>
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        {response.arguments.map((argument, i) => (
          <li key={i}>{argument}</li>
        ))}
      </ul>
    </div>
  );
}

export function JudgeCard({ actor, sheets }: { actor: string; sheets: JudgeScoreSheet[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
        <Gavel size={14} /> {actor}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {sheets.map((sheet) => (
          <div key={sheet.candidateNumber}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Candidate {sheet.candidateNumber} — {sheet.cards.reduce((sum, c) => sum + c.point, 0)} pts
            </p>
            <table className="w-full text-sm">
              <tbody>
                {sheet.cards.map((card) => (
                  <tr key={card.cardName} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-2 text-zinc-600 dark:text-zinc-400">
                      <p className="font-medium">{card.cardName}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-600">{card.comment}</p>
                    </td>
                    <td className="py-1.5 text-right align-top font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      {card.point}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreCard({ response }: { response: ScoreResponse }) {
  return (
    <div className="rounded-lg border-2 border-indigo-500 bg-indigo-50 p-4 dark:bg-indigo-950/40">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
        <Trophy size={14} /> Final Result
      </p>
      <p className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
        {response.winner} wins with {response.score} points
        {response.tie && " (tie on points — arbiter decision)"}
      </p>
      {response.comment && (
        <p className="mb-3 text-sm italic text-zinc-600 dark:text-zinc-400">“{response.comment}”</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {response.candidateScores.map((cs) => {
          const isWinner = response.winner === `Candidate ${cs.candidateNumber}`;
          return (
            <div
              key={cs.candidateNumber}
              className={`rounded-md border p-3 ${
                isWinner
                  ? "border-indigo-400 bg-white dark:bg-zinc-900"
                  : "border-zinc-200 bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/60"
              }`}
            >
              <p className="text-xs text-zinc-500">Candidate {cs.candidateNumber}</p>
              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {cs.provider}/{cs.model}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400">{cs.score}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MessageCard({ message }: { message: Message }) {
  if (message.agentStatus === "isThinking" || message.response == null) {
    return <ThinkingCard actor={message.actor} />;
  }
  if (message.node === "candidate") {
    return <CandidateCard actor={message.actor} response={message.response as CandidateResponse} />;
  }
  if (message.node === "judge") {
    return <JudgeCard actor={message.actor} sheets={message.response as JudgeScoreSheet[]} />;
  }
  return <ScoreCard response={message.response as ScoreResponse} />;
}
