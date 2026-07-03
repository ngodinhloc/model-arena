import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class AgentConfigDto {
  @IsInt()
  @IsIn([1, 2])
  number!: 1 | 2;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  temperature!: number;
}

export class CreateExperimentDto {
  @IsInt()
  topicId!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AgentConfigDto)
  candidates!: AgentConfigDto[];

  @IsString()
  candidatePersona!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AgentConfigDto)
  judges!: AgentConfigDto[];

  @IsString()
  judgePersona!: string;
}
