import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Result } from '../../database/entities/result.entity';
import {
  JudgeScoreSheet,
  SCORE_CARD_MAX_POINT,
  SCORE_CARD_NAMES,
} from '../contracts/experiment.interface';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Result) private readonly resultRepo: Repository<Result>,
  ) {}

  async getAnalytics() {
    const results = await this.resultRepo.find({
      relations: { experiment: true },
    });

    const modelStats = new Map<
      string,
      { wins: number; battles: number; totalScore: number }
    >();
    const categoryStats = new Map<
      string,
      Map<string, { wins: number; battles: number }>
    >();
    const cardScoreStats = new Map<string, { total: number; count: number }>();
    const cardWinnerStats = new Map<
      string,
      Map<string, { wins: number; battles: number }>
    >();
    const judgeStats = new Map<
      string,
      { totalScore: number; evaluations: number }
    >();

    for (const result of results) {
      const score = result.scoreResponse;
      if (!score?.candidateScores) continue;

      const category = result.experiment.category;
      const candidateModels = new Map<number, string>();

      for (const cs of score.candidateScores) {
        const key = `${cs.provider}/${cs.model}`;
        candidateModels.set(cs.candidateNumber, key);

        const stats = modelStats.get(key) ?? {
          wins: 0,
          battles: 0,
          totalScore: 0,
        };
        stats.battles += 1;
        stats.totalScore += cs.score;
        // The arbiter LLM always picks a definitive winner, even on tied totals.
        const isWinner = score.winner === `Candidate ${cs.candidateNumber}`;
        if (isWinner) stats.wins += 1;
        modelStats.set(key, stats);

        const catMap =
          categoryStats.get(category) ??
          new Map<string, { wins: number; battles: number }>();
        const catStat = catMap.get(key) ?? { wins: 0, battles: 0 };
        catStat.battles += 1;
        if (isWinner) catStat.wins += 1;
        catMap.set(key, catStat);
        categoryStats.set(category, catMap);
      }

      const cardTotals = new Map<number, Map<string, number>>();

      for (const msg of result.judgeResponse ?? []) {
        if (msg.node !== 'judge' || !msg.response) continue;
        // actor looks like "Judge 1 (anthropic/claude-opus-4-8)".
        const judgeModel = /\(([^)]+)\)\s*$/.exec(msg.actor)?.[1] ?? msg.actor;

        for (const sheet of msg.response as JudgeScoreSheet[]) {
          const totals =
            cardTotals.get(sheet.candidateNumber) ?? new Map<string, number>();
          let sheetTotal = 0;
          for (const card of sheet.cards) {
            const cardStat = cardScoreStats.get(card.cardName) ?? {
              total: 0,
              count: 0,
            };
            cardStat.total += card.point;
            cardStat.count += 1;
            cardScoreStats.set(card.cardName, cardStat);
            totals.set(
              card.cardName,
              (totals.get(card.cardName) ?? 0) + card.point,
            );
            sheetTotal += card.point;
          }
          cardTotals.set(sheet.candidateNumber, totals);

          const jStats = judgeStats.get(judgeModel) ?? {
            totalScore: 0,
            evaluations: 0,
          };
          jStats.totalScore += sheetTotal;
          jStats.evaluations += 1;
          judgeStats.set(judgeModel, jStats);
        }
      }

      // Sum each judge's per-card points per candidate, then the higher total wins that card for this battle.
      const totals1 = cardTotals.get(1);
      const totals2 = cardTotals.get(2);
      const model1 = candidateModels.get(1);
      const model2 = candidateModels.get(2);
      if (totals1 && totals2 && model1 && model2) {
        const cardNames = new Set([...totals1.keys(), ...totals2.keys()]);
        for (const cardName of cardNames) {
          const p1 = totals1.get(cardName) ?? 0;
          const p2 = totals2.get(cardName) ?? 0;
          const cardMap =
            cardWinnerStats.get(cardName) ??
            new Map<string, { wins: number; battles: number }>();
          const s1 = cardMap.get(model1) ?? { wins: 0, battles: 0 };
          const s2 = cardMap.get(model2) ?? { wins: 0, battles: 0 };
          s1.battles += 1;
          s2.battles += 1;
          if (p1 > p2) s1.wins += 1;
          else if (p2 > p1) s2.wins += 1;
          cardMap.set(model1, s1);
          cardMap.set(model2, s2);
          cardWinnerStats.set(cardName, cardMap);
        }
      }
    }

    return {
      totalExperiments: results.length,
      models: [...modelStats.entries()]
        .map(([model, s]) => ({
          model,
          wins: s.wins,
          battles: s.battles,
          winRate: s.battles ? Math.round((s.wins / s.battles) * 100) : 0,
          avgScore: s.battles ? Math.round(s.totalScore / s.battles) : 0,
        }))
        .sort((a, b) => b.winRate - a.winRate),
      categoryWinners: [...categoryStats.entries()].map(
        ([category, catMap]) => ({
          category,
          models: [...catMap.entries()]
            .map(([model, s]) => ({ model, wins: s.wins, battles: s.battles }))
            .sort((a, b) => b.wins - a.wins),
        }),
      ),
      scoreCards: SCORE_CARD_NAMES.filter((cardName) =>
        cardScoreStats.has(cardName),
      ).map((cardName) => {
        const stats = cardScoreStats.get(cardName);
        return {
          cardName,
          avgPoint: stats.count ? Math.round(stats.total / stats.count) : 0,
          maxPossible: SCORE_CARD_MAX_POINT,
          evaluations: stats.count,
        };
      }),
      scoreCardWinners: SCORE_CARD_NAMES.filter((cardName) =>
        cardWinnerStats.has(cardName),
      ).map((cardName) => ({
        cardName,
        models: [...cardWinnerStats.get(cardName).entries()]
          .map(([model, s]) => ({ model, wins: s.wins, battles: s.battles }))
          .sort((a, b) => b.wins - a.wins),
      })),
      judgeAvgScores: [...judgeStats.entries()]
        .map(([model, s]) => ({
          model,
          avgScore: s.evaluations
            ? Math.round(s.totalScore / s.evaluations)
            : 0,
          evaluations: s.evaluations,
          maxPossible: SCORE_CARD_NAMES.length * SCORE_CARD_MAX_POINT,
        }))
        .sort((a, b) => b.avgScore - a.avgScore),
    };
  }
}
