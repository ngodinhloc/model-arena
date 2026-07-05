import { IsIn, IsInt, Max, Min } from 'class-validator';

export type StallState = 'candidate' | 'judge' | 'score';

export class TestRecoverDto {
  @IsInt()
  @Min(1)
  @Max(5)
  count!: number;

  @IsIn(['candidate', 'judge', 'score'])
  stallState!: StallState;
}

export interface StalledExperimentItem {
  uuid: string;
  topic: string;
  category: string;
  stallState: StallState;
  candidate1: { provider: string; model: string };
  candidate2: { provider: string; model: string };
}
