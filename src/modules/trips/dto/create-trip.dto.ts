import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsUUID,
  IsIn,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/** Tạo/cập nhật chuyến — khớp màn hình vận chuyển (không còn hàng hóa / phạt / sửa rời trong form) */
export class CreateTripDto {
  @IsString()
  @IsOptional()
  tripCode?: string;

  @IsDateString()
  tripDate: string;

  @IsUUID()
  @IsOptional()
  vehicleId?: string;

  @IsUUID()
  @IsOptional()
  driverId?: string;

  /**
   * Phụ xe — chọn nhân viên giống flow `contactEmployeeId` (UUID trong công ty).
   * Lương phụ xe trên chuyến = `baseSalary` của NV khi gán (server gán, không nhận từ FE).
   */
  @IsUUID()
  @IsOptional()
  coDriverId?: string | null;

  @IsUUID()
  customerId: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  revenue?: number;

  /** Alias FE: giá thành */
  @IsNumber()
  @IsOptional()
  price?: number;

  /** Đã thanh toán (đồng bộ công nợ phải thu) */
  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  /** Người liên hệ hưởng hoa hồng (nhân viên) */
  @IsUUID()
  @IsOptional()
  contactEmployeeId?: string | null;

  /**
   * Ca làm việc — ảnh hưởng % lương theo doanh thu ròng trên chuyến (xem dashboard xe):
   * ca ngày 10%, ca đêm 15% (sau khi trừ chi phí: xăng trên chuyến, cầu đường, chi phí khác, hoa hồng contact, phụ cấp phụ xe).
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['day', 'night'])
  driverShift?: 'day' | 'night';

  /** Phụ cấp phụ xe (trừ vào cơ sở tính % tài xế) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  assistantAllowance?: number;

  @IsNumber()
  @IsOptional()
  commissionRateApplied?: number | null;

  /** Quản lý / phụ trách chuyến (nhân viên) */
  @IsUUID()
  @IsOptional()
  managerId?: string | null;

  @IsNumber()
  @IsOptional()
  fuelCost?: number;

  /** Chi phí cầu đường */
  @IsNumber()
  @IsOptional()
  tollCost?: number;

  /** Vé vào cổng / gửi xe */
  @IsNumber()
  @IsOptional()
  ticketCost?: number;

  /** Luật / phạt */
  @IsNumber()
  @IsOptional()
  fineCost?: number;

  /** Chi phí phát sinh (số tiền) */
  @IsNumber()
  @IsOptional()
  otherCosts?: number;

  /** Ghi chú đi kèm chi phí phát sinh */
  @IsString()
  @IsOptional()
  otherCostsNote?: string;

  @IsString()
  @IsOptional()
  status?: string;

  /** Ghi chú chuyến */
  @IsString()
  @IsOptional()
  notes?: string;

  /** @deprecated Dùng `address` + `notes` — giữ tương thích cũ */
  @IsString()
  @IsOptional()
  route?: string;
}
