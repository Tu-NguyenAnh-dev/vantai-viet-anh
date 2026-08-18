# Dữ liệu test (seed)

## Dữ liệu tháng 8/2026 (demo)

Chạy sau khi đã có seed tháng 3 (bên dưới). Bổ sung 10 chuyến `TRIP-202608-xxxx` + nghỉ phép/ứng lương thật + bảo trì xe + công nợ/thu chi cho tháng 8, vào **cùng company `TEST_SEED`** — không tạo company/xe/NV/KH mới.

```bash
npm run seed:test:2026-08
```

Idempotent theo tháng: nếu đã có `tripCode` bắt đầu bằng `TRIP-202608` thì bỏ qua. Đi qua service thật (`TripsService`/`EmployeesService`/`VehiclesService`) nên field tính toán và side-effect (debt/transaction/commission) đúng y hệt sản phẩm thật.

**Không seed được**: Excel Import (cần file .xlsx thật) — nếu cần demo phần này, upload file qua UI.

**Dọn dữ liệu demo sau này** (xoá cả company + mọi dữ liệu liên quan, cascade tự động):
```sql
DELETE FROM companies WHERE code = 'TEST_SEED';
```

## Yêu cầu

- PostgreSQL đúng cấu hình trong `.env` (`DB_*`).
- Redis (Bull) — cùng điều kiện với `npm run start:dev`; nếu app chạy được thì seed chạy được.

## Chạy seed

```bash
npm run seed:test
```

Script **idempotent**: nếu đã có công ty mã `TEST_SEED` thì thoát và **không** ghi đè. Muốn seed lại: xóa công ty đó (và dữ liệu liên quan) trong DB, rồi chạy lại.

## Thông tin đăng nhập (API)

| Trường  | Giá trị |
|--------|---------|
| Email  | `test-seed@vantai.local` |
| Mật khẩu | `Test@123` |
| Mã công ty | `TEST_SEED` |
| `companyId` (UUID cố định) | `a0000001-0000-4000-8000-000000000001` |

Gửi kèm header JWT + `companyId` theo quy ước API của dự án.

## Tháng dữ liệu & báo cáo lương

Toàn bộ chuyến và số liệu minh họa **một tháng**:

| Trường | Giá trị |
|--------|---------|
| Tháng | **2025-03** (tháng 3 năm 2025) |
| `fromDate` / `toDate` (báo cáo lương) | `2025-03-01` → `2025-03-31` |

Gọi API **báo cáo lương** (`SalariesService.getReport`) với `fromDate=2025-03-01`, `toDate=2025-03-31` để thấy:

- **Lương cứng** (từ `employees.baseSalary` hoặc `salary_configs.baseSalary` nếu set).
- **Lương theo chuyến** = `perTrip` × số chuyến (chuyến không `cancelled`, trong khoảng ngày).
- **Thưởng % doanh thu** = `%` × tổng doanh thu các chuyến của tài xế (cùng kỳ).

Hai tài xế có **cấu hình riêng** trong `salary_configs` (lương/chuyến + % DT khác nhau).

## Nội dung tạo (tóm tắt)

| Nhóm | Chi tiết |
|------|-----------|
| **Xe** | 3 xe (2 active, 1 maintenance), biển `51A-SEED01`, `51B-SEED02`, `51C-SEED03` |
| **Nhân viên** | 2 lái xe, 1 phụ xe, 2 kinh doanh, 1 kế toán — đều có `baseSalary` |
| **salary_configs** | 2 dòng (hai tài xế): `perTrip` + `revenuePercent` |
| **Khách hàng** | 3 KH, gắn NVKD + `%` hoa hồng |
| **Chuyến** | 10 chuyến trong **2025-03** (`TRIP-202503-001` … `010`): `completed`, `assigned`, `in_progress`, `cancelled` |
| **Công nợ** | Phải thu **theo từng chuyến** + 1 khoản phải thu **không gắn trip** + 2 khoản **phải trả** NCC |
| **Thu chi** | Doanh thu chuyến (tự động khi `completed` + `revenue > 0`) + chi **FUEL**, **REPAIR**, **SALARY** (tổng lương + tạm ứng tài xế) |
| **Hoa hồng** | Bảng `commissions` cho các chuyến `completed` có doanh thu (logic giống `TripsService`) |

## Gợi ý kiểm tra nhanh

- **Thu chi**: lọc tháng 3/2025 — thấy dòng thu `TRIP_PAYMENT` từ chuyến + các chi `FUEL` / `REPAIR` / `SALARY`.
- **Công nợ**: danh sách RECEIVABLE/PAYABLE trong kỳ.
- **Lương**: `fromDate=2025-03-01`, `toDate=2025-03-31` — hai tài xế có số chuyến & doanh thu khớp các chuyến seed (trừ `cancelled`).
