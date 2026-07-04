// One-off script to seed 3 stalled experiments (one per stage) for manually testing
// recover-service's sweep. Run inside the recover-service container so it can reach
// `postgres`/`redis` by their docker-network hostnames:
//   docker exec model-arena-recover-service-1 node scratch-seed-stalls.js
const { Client } = require('pg');
const Redis = require('ioredis');
const crypto = require('crypto');

const CATEGORY = 'Technology';
const TOPIC = 'AI systems should be open-sourced rather than kept proprietary';
const ROUNDS = 1;

const CANDIDATE_CONFIGS = [
  { candidateNumber: 1, provider: 'anthropic', model: 'claude-haiku-4-5', persona: 'a pragmatic engineer', temperature: 0.7 },
  { candidateNumber: 2, provider: 'anthropic', model: 'claude-haiku-4-5', persona: 'a pragmatic engineer', temperature: 0.7 },
];
const JUDGE_CONFIGS = [
  { judgeNumber: 1, provider: 'anthropic', model: 'claude-haiku-4-5', persona: 'a fair and rigorous judge', temperature: 0.3 },
  { judgeNumber: 2, provider: 'anthropic', model: 'claude-haiku-4-5', persona: 'a fair and rigorous judge', temperature: 0.3 },
];
const SCORE_CARD_NAMES = ['Technical Accuracy', 'Reasoning', 'Practicality', 'Completeness', 'Clarity'];
const SCORE_CARDS = SCORE_CARD_NAMES.map((cardName) => ({ cardName, maxPoint: 20 }));

const staleTimestamp = () => new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago

// Pulls a real completed experiment's candidate/judge messages from the `results` table so
// seeded stall scenarios have realistic content instead of placeholder text (real content
// also produces meaningful, non-zero judge scores when a replayed stage re-runs).
async function fetchSampleMessages(pg) {
  const { rows } = await pg.query(`
    SELECT r.candidate_response, r.judge_response
    FROM results r
    JOIN experiments e ON e.id = r.experiment_id
    WHERE e.status = 'completed'
    ORDER BY r.created_at DESC
    LIMIT 1
  `);
  if (rows.length === 0) {
    throw new Error('No completed experiment with results found to sample from');
  }
  return { candidateMessages: rows[0].candidate_response, judgeMessages: rows[0].judge_response };
}

function baseCache(experimentId, messages, agentStatus) {
  return {
    eventName: 'model_arena.experiment.created',
    experimentId,
    category: CATEGORY,
    topic: TOPIC,
    rounds: ROUNDS,
    candidateConfigs: CANDIDATE_CONFIGS,
    judgeConfigs: JUDGE_CONFIGS,
    scoreCards: SCORE_CARDS,
    messages,
    agentStatus,
    updatedAt: staleTimestamp(),
    retryCount: 0,
  };
}

function buildScenarios({ candidateMessages, judgeMessages }) {
  const isThinking = (m) => ({ ...m, response: null, agentStatus: 'isThinking' });

  return [
    {
      label: 'stalled-at-candidate',
      messages: [isThinking(candidateMessages[0])],
      agentStatus: 'isThinking',
    },
    {
      label: 'stalled-at-judge',
      messages: [...candidateMessages, judgeMessages[0], isThinking(judgeMessages[1])],
      agentStatus: 'isThinking',
    },
    {
      label: 'stalled-at-score',
      messages: [
        ...candidateMessages,
        ...judgeMessages,
        { node: 'score', actor: 'ScoreKeeper', response: null, agentStatus: 'isThinking' },
      ],
      agentStatus: 'isThinking',
    },
  ];
}

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const redis = new Redis(process.env.REDIS_URL);

  const sample = await fetchSampleMessages(pg);
  const scenarios = buildScenarios(sample);

  for (const scenario of scenarios) {
    const uuid = crypto.randomUUID();

    await pg.query(
      `INSERT INTO experiments (uuid, candidate_config, judge_config, status, category, topic, rounds)
       VALUES ($1, $2, $3, 'running', $4, $5, $6)`,
      [uuid, JSON.stringify(CANDIDATE_CONFIGS), JSON.stringify(JUDGE_CONFIGS), CATEGORY, TOPIC, ROUNDS],
    );

    const cache = baseCache(uuid, scenario.messages, scenario.agentStatus);
    await redis.set(`experiment:${uuid}`, JSON.stringify(cache), 'EX', 7200);

    console.log(`${scenario.label}: uuid=${uuid}`);
  }

  await pg.end();
  redis.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
