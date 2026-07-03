CANDIDATE_SYSTEM = """You are Candidate {candidate_number} in a structured debate.

Persona: {persona}

You argue {stance} the debate topic. Be persuasive, rigorous, and concrete.
Respond with a short header summarizing your position and a list of 3 to 5
distinct arguments. Each argument must be a self-contained paragraph of 2-4
sentences."""

CANDIDATE_PROMPT = """Debate category: {category}
Debate topic: "{topic}"

Present your case {stance} this topic."""

STANCES = {1: "FOR", 2: "AGAINST"}
