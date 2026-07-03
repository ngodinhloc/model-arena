# ModelArena (LLM Evaluation & Debate Platform)
## Project Overview

ModelArena is a distributed, event-driven AI evaluation platform that benchmarks and compares LLM behavior using structured debates and multi-judge consensus scoring.

The system allows users to:

Define or select a debate topic (benchmark)
Configure two competing LLM candidates
Configure multiple LLM judges
Execute structured debates in a fully automated pipeline
Compute final scores and determine a winner using multi-judge consensus

The system is designed as a choreographed, event-driven architecture with no central orchestrator.

## Architectue

### Frontend:
- React (NextJS): please use ../architect-multi-agent/frontentd as sample for project structure, coding pattern
- Left menu: New Experiment button, Analytics button, Histories (vertical expanable)
- New Experiment page: 
- - Topic section: Category (dropdown list), Topic (dropdown list, based on Category)
- - Candidate section: Candidate 1, and Candidate 2, each has: Provider (dropdown), Model (dropdown), Temperature (dropdown), and one component applied for both candidate: Persona (text)
- - Judge section: Judge 1, and Judge 2, each has: Provider (dropdown), Model (dropdown), Temperature (dropdown), and one component applied for both Judges: Persona (text)
- - Start Button: send request to Backend POST /api/experiments/, Backend will return a uuid for the experiement, Frontend then will open a websocket to Backend at /ws/experiments/{uuid}

### Backend
- Node.js (NestJS); please use ../architect-multi-agent/backend as sample for project structure, coding pattern
- Database: 
- - providers table: {id, name},
- - models table: {id, provider_id, name}
- - categories table: {id (int), name}
- - topics table: {id(int), catgory_id, topic}
- - experiments table: {id, uuid, topic_id, candidate_config (jsonb), judge_config(json), created_at, modified_at}
- - results table: {id, experiement_id, candidate_response(jonsb), judge_response(json), created_at}

- API endpoints:
- - POST /api/experiments/: create a experiment entity in database (PostgreSQL), and store the entity in cache, then publish an message event
- - GET /api/experiments/: return the list of experiement entities, filter by category_id, topic_id
- - GET /api/experiments/{uudi}: return one experiment entity;
- - GET /api/models/; return a list of models entities
- - GET /api/topics: return a list of topics entities
- - websocket /ws/experiments/{uuid}: backend will poll the redis item for uuid and stream to this endpoint

- Interfaces
ExperimentEvent {
    eventName: model_arena.experiment.created    // publish to RabbitMQ exchange model_arena.experiment
    experiementId: string;
    category: string;
    topic: string;
    candidateConfigs: CandidateConfig[];
    judgeConfigs: JudeConfig[];
    scoreCards: ScoreCardConfig[];
}

CandidateConfig {
    candidateNumber: int (1, 2)
    provider: string;
    model: string;
    persona: string;
    temperature: float;
}

JudeConfig {
    judgeNumber: int (1, 2)
    provider: string;
    model: string;
    persona: string;
    temperature: float;
}

ScoreCardConfig {
    cardName: string (Technical Accuracy | Reasoning | Practicality | Completeness | Clarity):
    maxPoint: 20; // each card name has max point 20, total of 5 cards is 100 max
}

// this store in Redis
ExperimentCache extend ExperimentEvent{
    messages: Response[];
    agentStatus: isThinking|hasReplied
}

Message {
    node: string;
    actor: string;
    response: [CandidateResponse|JudgeResponse|ScoreResponse];
    agentStatus: isThinking|hasReplied
}

CandidateResposne {
    header: string;
    arguments: string[];
}

JudgeResponse {
    cardName: string (Technical Accuracy | Reasoning | Practicality | Completeness | Clarity);
    point: int;
    comment: string;
}

ScoreResponse {
   candidateScores: CandidateScore[];
   winner: Candidate 1 | Candidate 2;
   score: int; // total score of winner Candidate
}

CandidateScore {
    candidateNumber: int (1, 2)
    provider: string;
    model: string;
    score: int;
}
    
## Candidate Agent:
- fastAPI, LangGraph: please use ../architect-multi-agent/architect-agent as sample for project structure, coding pattern
- subscribe to exchange ModelArena.experiment for ModelArena.experiment.created only
- upon receiving the message ExperimentEvent:
- - build the candidates from ExperimentEvent.candidateConfigs, 
- - for each candidates, call LLM with topic and candidateConfigs to get a result: the LLM should respone as CandidateResponse
- - then append the result to redis ExperimentCache.messages
- - when both candidates have responded, then call publish_event tool to publish the event

ExperimentEvent {
    eventName: model_arena.candidates.responded    // publish to RabbitMQ exchange model_arena.candidates
    experiementId: string;
    category: string;
    topic: string;
    candidateConfigs: CandidateConfig[];
    judgeConfigs: JudeConfig[];
    scoreCards: ScoreCardConfig[];
    messages: Message[];
}


## Judge Agent:
- fastAPI, LangGraph: please use ../architect-multi-agent/architect-agent as sample for project structure, coding pattern
- subscribe to exchange model_arena.candidates for model_arena.candidates.responded only
- upon receiving the message ExperimentEvent:
- - build the judges from ExperimentEvent.judgeConfigs, 
- - for each judge, call LLM with topic and judgeConfigs and scoreCards to get a result: the LLM should resposne as JudgeResponse
- - append the result to redis ExperimentCache.messages
- - when both judeges have responded, then call publish_event tool to publish the event

ExperimentEvent {
    eventName: model_arena.judges.responded    // publish to RabbitMQ exchange model_arena.judges
    experiementId: string;
    category: string;
    topic: string;
    candidateConfigs: CandidateConfig[];
    judgeConfigs: JudeConfig[];
    scoreCards: ScoreCardConfig[];
    messages: Message[];
}

## Score Agent:

- fastAPI, LangGraph: please use ../architect-multi-agent/architect-agent as sample for project structure, coding pattern
- subscribe to exchange model_arena.judges for model_arena.judges.responded only
- upon receiving the message ExperimentEvent: go through the messages of JudgeResponse, and calculate the total score for each candidate
- - append the result to redis ExperimentCache.messages
- - then call publish_event tool to publish the event

ExperimentEvent {
    eventName: model_arena.scores.responded    // publish to RabbitMQ exchange model_arena.scores
    experiementId: string;
    category: string;
    topic: string;
    candidateConfigs: CandidateConfig[];
    judgeConfigs: JudeConfig[];
    scoreCards: ScoreCardConfig[];
    messages: Message[];
}

=> backend subscribes subscribe to exchange model_arena.scores for model_arena.scores.responded only and persiste the full cache item to database, also mark the experiment as completed:
- - for experiement that has been completed: backend should not poll redis for streamming on /ws/experiements/{uuid}


