export interface ModelSeed {
  id: number;
  name: string;
}

export interface ProviderSeed {
  id: number;
  name: string;
  models: ModelSeed[];
}

export const PROVIDERS: ProviderSeed[] = [
  {
    id: 1,
    name: 'anthropic',
    models: [
      { id: 1, name: 'claude-opus-4-8' },
      { id: 2, name: 'claude-sonnet-5' },
      { id: 3, name: 'claude-haiku-4-5' },
    ],
  },
];
