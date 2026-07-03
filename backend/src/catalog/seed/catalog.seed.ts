export const PROVIDER_SEED: Record<string, string[]> = {
  anthropic: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
};

export const CATEGORY_SEED: Record<string, string[]> = {
  Technology: [
    'AI systems should be open-sourced rather than kept proprietary',
    'Microservices are a better default architecture than monoliths',
    'Strong static typing produces more maintainable software than dynamic typing',
    'The benefits of social media outweigh its harms',
  ],
  Philosophy: [
    'Free will is an illusion',
    'The ends can justify the means',
    'Artificial general intelligence would deserve moral consideration',
  ],
  Economics: [
    'Universal basic income is a net positive for society',
    'Remote work makes companies more productive',
    'Central banks should issue digital currencies',
  ],
};
