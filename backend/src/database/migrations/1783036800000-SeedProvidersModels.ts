import { MigrationInterface, QueryRunner } from 'typeorm';

const PROVIDERS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
};

export class SeedProvidersModels1783036800000 implements MigrationInterface {
  name = 'SeedProvidersModels1783036800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [providerName, models] of Object.entries(PROVIDERS)) {
      await queryRunner.query(
        `INSERT INTO providers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [providerName],
      );
      for (const modelName of models) {
        await queryRunner.query(
          `INSERT INTO models (provider_id, name)
           SELECT p.id, $2::varchar
           FROM providers p
           WHERE p.name = $1
             AND NOT EXISTS (
               SELECT 1 FROM models m WHERE m.provider_id = p.id AND m.name = $2
             )`,
          [providerName, modelName],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [providerName, models] of Object.entries(PROVIDERS)) {
      await queryRunner.query(
        `DELETE FROM models m
         USING providers p
         WHERE m.provider_id = p.id AND p.name = $1 AND m.name = ANY($2)`,
        [providerName, models],
      );
      await queryRunner.query(
        `DELETE FROM providers p
         WHERE p.name = $1 AND NOT EXISTS (SELECT 1 FROM models m WHERE m.provider_id = p.id)`,
        [providerName],
      );
    }
  }
}
