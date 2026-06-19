import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Tạo/cập nhật giao dịch FUEL hoặc REPAIR gắn xe (lưu trong bảng transactions) */
export class CreateVehicleExpenseDto {
  @IsDateString()
  transactionDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateVehicleExpenseDto {
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
