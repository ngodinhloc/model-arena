"use client";

import { Bot, Gavel, Trophy } from "lucide-react";
import {
  CandidateResponse,
  JudgeScoreSheet,
  Message,
  ScoreResponse,
} from "@/types/experiment";

export type CandidateSide = 1 | 2;

export function candidateSide(actor: string): CandidateSide {
  return actor.startsWith("Candidate 2") ? 2 : 1;
}

const CANDIDATE_THEME: Record<
  CandidateSide,
  { align: string; row: string; bubble: string; tail: string; avatar: string; accent: string }
> = {
  1: {
    align: "justify-start",
    row: "flex-row",
    bubble: "border-indigo-200/70 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-indigo-950/30",
    tail: "rounded-tl-md",
    avatar: "bg-indigo-600 dark:bg-indigo-500",
    accent: "text-indigo-700 dark:text-indigo-300",
  },
  2: {
    align: "justify-end",
    row: "flex-row-reverse",
    bubble: "border-rose-200/70 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/30",
    tail: "rounded-tr-md",
    avatar: "bg-rose-600 dark:bg-rose-500",
    accent: "text-rose-700 dark:text-rose-300",
  },
};

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" />
    </div>
  );
}

function Avatar({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function ThinkingCard({ actor, side }: { actor: string; side?: CandidateSide }) {
  if (!side) {
    return (
      <div className="mx-auto flex max-w-[85%] items-start gap-2.5">
        <Avatar className="bg-amber-500 dark:bg-amber-600">
          <Gavel size={15} />
        </Avatar>
        <div className="rounded-2xl rounded-tl-md border border-amber-200/70 bg-amber-50/70 px-4 py-3 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/20">
          <p className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-300">{actor}</p>
          <div className="text-amber-600/80 dark:text-amber-400/80">
            <TypingDots />
          </div>
        </div>
      </div>
    );
  }
  const theme = CANDIDATE_THEME[side];
  return (
    <div className={`flex ${theme.align}`}>
      <div className={`flex max-w-[75%] items-start gap-2.5 ${theme.row}`}>
        <Avatar className={theme.avatar}>
          <Bot size={15} />
        </Avatar>
        <div className={`rounded-2xl ${theme.tail} border px-4 py-3 shadow-sm ${theme.bubble}`}>
          <p className={`mb-1 text-sm font-semibold ${theme.accent}`}>{actor}</p>
          <div className={theme.accent}>
            <TypingDots />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CandidateCard({
  actor,
  response,
  side,
}: {
  actor: string;
  response: CandidateResponse;
  side: CandidateSide;
}) {
  const theme = CANDIDATE_THEME[side];
  return (
    <div className={`flex ${theme.align}`}>
      <div className={`flex max-w-[75%] items-start gap-2.5 ${theme.row}`}>
        <Avatar className={theme.avatar}>
          <Bot size={15} />
        </Avatar>
        <div className={`rounded-2xl ${theme.tail} border px-4 py-3 shadow-sm ${theme.bubble}`}>
          <p className={`mb-1.5 text-sm font-semibold ${theme.accent}`}>{actor}</p>
          <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{response.header}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {response.arguments.map((argument, i) => (
              <li key={i}>{argument}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function JudgeCard({ actor, sheets }: { actor: string; sheets: JudgeScoreSheet[] }) {
  return (
    <div className="mx-auto flex max-w-[85%] items-start gap-2.5">
      <Avatar className="bg-amber-500 dark:bg-amber-600">
        <Gavel size={15} />
      </Avatar>
      <div className="w-full rounded-2xl rounded-tl-md border border-amber-200/70 bg-amber-50/70 px-4 py-3 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/20">
        <p className="mb-3 text-sm font-semibold text-amber-700 dark:text-amber-300">{actor}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {sheets.map((sheet) => (
            <div
              key={sheet.candidateNumber}
              className="rounded-xl border border-amber-900/5 bg-white/70 p-3 dark:border-white/5 dark:bg-black/10"
            >
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Candidate {sheet.candidateNumber} — {sheet.cards.reduce((sum, c) => sum + c.point, 0)} pts
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {sheet.cards.map((card) => (
                    <tr key={card.cardName} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 pr-2 text-zinc-600 dark:text-zinc-400">
                        <p className="font-medium text-zinc-700 dark:text-zinc-300">{card.cardName}</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{card.comment}</p>
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
    </div>
  );
}

export function ScoreCard({ response }: { response: ScoreResponse }) {
  return (
    <div className="mx-auto flex max-w-[85%] items-start gap-2.5">
      <Avatar className="bg-indigo-600 dark:bg-indigo-500">
        <Trophy size={15} />
      </Avatar>
      <div className="w-full rounded-2xl rounded-tl-md border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-md dark:border-indigo-800 dark:from-indigo-950/40 dark:to-zinc-950">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
          Final Result
        </p>
        <p className="mb-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
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
                className={`relative rounded-xl border p-3 ${
                  isWinner
                    ? "border-indigo-400 bg-white shadow-sm dark:bg-zinc-900"
                    : "border-zinc-200 bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/60"
                }`}
              >
                {isWinner && (
                  <Trophy
                    size={14}
                    className="absolute right-3 top-3 text-indigo-500 dark:text-indigo-400"
                  />
                )}
                <p className="text-xs text-zinc-500">Candidate {cs.candidateNumber}</p>
                <p className="truncate pr-5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {cs.provider}/{cs.model}
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{cs.score}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MessageCard({ message }: { message: Message }) {
  const side = message.node === "candidate" ? candidateSide(message.actor) : undefined;

  if (message.agentStatus === "isThinking" || message.response == null) {
    return <ThinkingCard actor={message.actor} side={side} />;
  }
  if (message.node === "candidate") {
    return <CandidateCard actor={message.actor} response={message.response as CandidateResponse} side={side!} />;
  }
  if (message.node === "judge") {
    return <JudgeCard actor={message.actor} sheets={message.response as JudgeScoreSheet[]} />;
  }
  return <ScoreCard response={message.response as ScoreResponse} />;
}
