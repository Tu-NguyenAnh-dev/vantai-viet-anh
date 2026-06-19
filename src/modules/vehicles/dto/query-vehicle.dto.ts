import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryVehicleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  // Support frontend param name `pageSize`
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  /** Sắp xếp theo cột (hiện hỗ trợ: status) */
  @IsOptional()
  @IsString()
  @IsIn(['status'])
  sort?: string;

  /** ASC | DESC */
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: string;

  /** YYYY-MM — gắn monthlyRevenue / monthlyExpense / profit (theo getVehicleDetail) */
  @IsOptional()
  @IsString()
  metricsMonth?: string;
}
