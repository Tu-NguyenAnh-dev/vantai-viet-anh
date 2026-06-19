import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAbsenceDto {
  @IsDateString()
  absenceDate: string;

  @IsOptional()
  @IsString()
  note?: string;
}
