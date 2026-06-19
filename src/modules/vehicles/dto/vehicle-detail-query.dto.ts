import { IsDateString, IsOptional } from 'class-validator';

export class VehicleDetailQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
