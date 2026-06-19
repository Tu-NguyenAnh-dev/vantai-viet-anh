import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSalaryAdvanceDto {
  @IsDateString()
  advanceDate: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateSalaryAdvanceDto {
  @IsOptional()
  @IsDateString()
  advanceDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
