# Tài liệu triển khai Frontend — Quản lý nhân viên (Employees)

**Prefix:** `/api/v1/employees` · **JWT** giống các module khác.

---

## 1. Danh sách & CRUD cơ bản

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/employees` | Danh sách (`page`, `limit`, `search`, `position`, `status`) |
| `POST` | `/employees` | Tạo nhân viên |
| `GET` | `/employees/drivers` | Danh sách tài xế active (dropdown) |
| `GET` | `/employees/:id` | Chi tiết entity thuần (chưa có lịch sử/lương) |
| `PATCH` | `/employees/:id` | Cập nhật |
| `DELETE` | `/employees/:id` | Đặt `status = inactive` |

### Body tạo (`POST`) — các field chính

| UI | JSON |
|----|------|
| Mã nhân viên | `employeeCode` |
| Họ tên | `fullName` hoặc `name` |
| Số điện thoại | `phone` |
| Email | `email` |
| Lương cơ bản | `baseSalary` (bắt buộc, ≥ 0) |
| Vị trí | `position` (vd `lái xe`, `phụ xe`) |
| Số GPLX | `licenseNumber` |
| Hạng GPLX | `licenseType` |
| Trạng thái | `status` (`active` / …) |

---

## 2. Chi tiết nhân viên (dashboard HR + vận hành)

```http
GET /employees/:id/detail?fromMonth=YYYY-MM&toMonth=YYYY-MM
```

- Mặc định không truyền: **12 tháng gần nhất** (từ đầu tháng `now−11` đến tháng hiện tại).

### `data` trả về

- **`employee`** — thông tin NV như `GET /employees/:id`.
- **`tripHistoryByMonth`** — mảng theo tháng, mỗi phần tử:
  - `yearMonth` — `YYYY-MM`
  - **`trips`** — các chuyến NV **là tài xế** (`driverId`) trong tháng (đã loại `cancelled`). Mỗi dòng có thêm `driverIncentiveThisTrip` (% theo chuyến, cùng logic dashboard xe).
- **`payrollByMonth`** — bảng lương theo tháng, mỗi phần tử:
  - `yearMonth`, `baseSalary` (lương cơ bản hiện tại của NV — áp đồng nhất mọi tháng trong kỳ)
  - `driverPercentTotal` — tổng % lái các chuyến trong tháng
  - `advances` — danh sách tạm ứng **trong tháng** (`id`, `advanceDate`, `amount`, `note`)
  - `advanceTotal`
  - `attendance`:
    - `allowedRestDays` — **2** (miễn trừ)
    - `absentDays` — số ngày nghỉ khai báo trong tháng
    - `absenceDates` — chi tiết từng ngày (`id`, `absenceDate`, `note`)
    - `extraAbsentDays` — `max(0, absentDays − 2)`
    - `workDaysDenominator` — **26** (mẫu chia lương ngày)
    - `dailyRateFromBase` — `baseSalary / 26`
    - `absenceDeduction` — `extraAbsentDays × dailyRateFromBase`
  - **`totalSalary`** = `baseSalary + driverPercentTotal − advanceTotal − absenceDeduction`
- **`rules`** — mô tả ngắn công thức (để hiển thị tooltip).

---

## 3. Ứng lương (CRUD)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/employees/:id/salary-advances` | `advanceDate`, `amount`, `note?` |
| `PATCH` | `/employees/:id/salary-advances/:advanceId` | field tùy chọn |
| `DELETE` | `/employees/:id/salary-advances/:advanceId` | — |

Ứng theo **ngày** `advanceDate`; tổng trong tháng cộng vào **`advanceTotal`** của tháng đó trên `detail`.

---

## 4. Chấm công / ngày nghỉ

→ Bảng `employee_absences`: mỗi ngày **tối đa một** dòng / NV.

| Method | Path | Body |
|--------|------|------|
| `POST` | `/employees/:id/absences` | `absenceDate`, `note?` |
| `DELETE` | `/employees/:id/absences/:absenceId` | — |

Trùng `absenceDate` cho cùng NV → **400**.

---

## 5. Endpoint cũ (vẫn dùng được)

- `GET /employees/:id/trips` — lịch sử chuyến phân trang (chỉ vai trò tài xế).
- `GET /employees/:id/salaries` — lịch sử lương (dynamic / transaction).
- `GET /employees/:id/commissions` — hoa hồng theo kỳ.

---

## 6. DB migration

Chạy SQL: `database/migrations/20260415_employee_payroll_tables.sql` trước khi dùng ứng lương / nghỉ.

---


*Tài liệu căn theo code backend; điều chỉnh UI (bảng theo tháng, form ứng, lịch nghỉ) theo `detail` + CRUD trên.*
