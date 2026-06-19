import { IsOptional, Matches } from 'class-validator';

/** Tháng dạng YYYY-MM */
export class EmployeeDetailQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fromMonth phải là YYYY-MM' })
  fromMonth?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'toMonth phải là YYYY-MM' })
  toMonth?: string;
}
