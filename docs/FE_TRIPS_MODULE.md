# Tài liệu triển khai Frontend — Quản lý chuyến (Trips)

API REST cho **danh sách chuyến**, **tạo/sửa đơn vận chuyển**, thống kê và xuất Excel. **Prefix:** **`/api/v1/trips`** (cùng global prefix với toàn app).

**Xác thực:** `Authorization: Bearer <token>` + context công ty theo convention hiện tại của app.

**Envelope:**

```json
{ "success": true, "data": ... }
```

Danh sách có phân trang:

```json
{ "success": true, "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }
```

---

## 1. Bảng danh sách — map cột UI ↔ API

| Cột màn hình | Nguồn dữ liệu (ưu tiên) |
|--------------|-------------------------|
| Ngày | `tripDate` |
| Lái xe | `driver.fullName` |
| Xe | `vehicle.licensePlate` |
| Ghi chú | `notes` |
| Giá thành | `price` **hoặc** `revenue` (cùng giá trị) |
| Đã thanh toán | `paidAmount` |
| Công nợ | `debtRemaining` |
| Quản lý | `managerName` **hoặc** `manager.fullName` |
| Tên khách hàng | `customerName` **hoặc** `customer.name` |
| Người liên hệ hoa hồng (nếu cần cột) | `commissionContactName` **hoặc** `contactEmployee.fullName` |
| Phụ xe | `coDriver.fullName` (chọn NV giống flow người liên hệ — UUID `coDriverId`) |
| Ca làm việc | `driverShift`: `day` (ca ngày) \| `night` (ca đêm) — ảnh hưởng % tài xế trên dashboard xe |
| Phụ cấp phụ xe | `assistantAllowance` (chỉ có nghĩa khi có `coDriverId`) |
| Chi phí phát sinh | `otherCosts` + `otherCostsNote` (hiển thị `otherCosts` + dòng ghi chú) |
| Xăng trên chuyến | `fuelCost` (vào cơ sở tính % tài xế trên dashboard xe) |

**`GET /trips`** trả về từng phần tử trong `data` đã **join** `vehicle`, `driver`, `coDriver`, `customer`, `manager`, `contactEmployee` và thêm các trường phẳng:

- `price` — `number`, bằng `revenue`
- `debtRemaining` — `number`, lấy từ bản ghi **công nợ** (`debts`) gắn `tripId`; nếu chưa có thì `max(0, revenue - paidAmount)`
- `customerName`, `managerName`, `commissionContactName` — chuỗi hoặc `null`

---

## 2. CRUD & endpoint

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/trips` | Tạo chuyến |
| `GET` | `/trips` | Danh sách (mục 3) |
| `GET` | `/trips/stats` | Thống kê chuyến hoàn thành (`startDate`, `endDate`) |
| `GET` | `/trips/export` | Xuất Excel (base64 trong `data.buffer`) — dùng cùng query `QueryTripDto` |
| `GET` | `/trips/:id` | Chi tiết một chuyến — **cùng cấu trúc enrich** như danh sách (có `price`, `debtRemaining`, …) |
| `PATCH` | `/trips/:id` | Cập nhật (chuyến **completed** không cho sửa) |
| `PATCH` | `/trips/:id/assign` | Gán xe + tài xế (body riêng) |
| `PATCH` | `/trips/:id/status` | Đổi trạng thái workflow |
| `DELETE` | `/trips/:id` | Hủy (soft: chỉ khi status phù hợp — xem backend) |

Import Excel: `POST /trips/import`, `GET /trips/import/:importId`, `POST /trips/import/validate` (không mô tả chi tiết ở đây).

---

## 3. Query danh sách

```http
GET /trips?page=&limit=&startDate=&endDate=&vehicleId=&driverId=&customerId=&status=&search=
```

| Query | Ý nghĩa |
|-------|---------|
| `page` | Trang, mặc định `1` |
| `limit` | Số bản ghi/trang, mặc định `20` |
| `startDate` / `endDate` | Lọc `tripDate` (ISO date) |
| `vehicleId`, `driverId`, `customerId` | Lọc UUID |
| `status` | Trạng thái chuyến, ví dụ `new`, `assigned`, `in_progress`, `completed`, `cancelled` |
| `search` | Tìm **substring** trên: mã chuyến, địa chỉ, ghi chú, **tên khách**, **tên lái xe**, **biển số xe** |

---

## 4. Form tạo / sửa chuyến — body (`POST` / `PATCH`)

`PartialType` cho `PATCH`: chỉ gửi field cần đổi.

### Bắt buộc (tạo `POST`)

- `tripDate` — ISO date string  
- `customerId` — UUID khách hàng  

### Thường dùng trên form

| Trường UI | Body JSON |
|-----------|-----------|
| Khách hàng | `customerId` |
| Ngày chuyển | `tripDate` |
| Địa chỉ | `address` |
| Xe | `vehicleId` |
| Tài xế | `driverId` |
| Phụ xe | `coDriverId` — chọn nhân viên giống `contactEmployeeId` (UUID trong công ty). Backend kiểm tra tồn tại; **không trùng** `driverId`. |
| Giá thành | `revenue` **hoặc** `price` |
| Đã thanh toán | `paidAmount` |
| Quản lý | `managerId` (UUID nhân viên) |
| Người liên hệ hưởng hoa hồng | `contactEmployeeId` (nullable) |
| Giá trị % hoa hồng (nếu cần) | `commissionRateApplied` |
| Chi phí cầu đường | `tollCost` |
| Chi phí phát sinh (tiền) | `otherCosts` |
| Ghi chú chi phí phát sinh | `otherCostsNote` |
| Ghi chú chuyến | `notes` |
| **Ca làm việc** | `driverShift`: `day` \| `night` (mặc định `day`). Ca ngày → **10%**, ca đêm → **15%** trên **lợi nhuận gộp** (xem mục 4.1). |
| **Phụ cấp phụ xe** | `assistantAllowance` (≥ 0). Chỉ khi có `coDriverId`; nếu không có phụ xe thì backend gán 0. |
| **Lương phụ xe** | **Không gửi từ FE** — = `baseSalary` của nhân viên phụ xe khi gán (giống cách gán lương tài xế từ `driverId`). |

**Khác:** `fuelCost` (nên nhập nếu dùng dashboard xe — tính vào cơ sở % tài xế), `tripCode`, `status`.

### 4.1 % lương theo doanh thu ròng (dashboard xe — `GET /vehicles/:id/detail`)

Trên mỗi chuyến, **lợi nhuận gộp** trước khi áp % tài xế:

`net = revenue − fuelCost − tollCost − otherCosts − hoa_hồng_người_liên_hệ − assistantAllowance`

- Hoa hồng người liên hệ = số tiền trong bảng `commissions` theo chuyến (sau khi chuyến hoàn thành và đủ điều kiện tạo hoa hồng).  
- `assistantAllowance` = phụ cấp phụ xe trên chuyến.  
- Nếu `net > 0`: cộng vào `driverPercentCost` một khoản `net × 0.10` nếu `driverShift === 'day'`, hoặc `net × 0.15` nếu `driverShift === 'night'`.

Chi tiết công thức tổng hợp xe & lợi nhuận: xem [FE — Module Xe](./FE_VEHICLE_MODULE.md) mục 4.

**`route` (deprecated):** nếu gửi, backend dùng như `notes` khi không có `notes`.

### Công nợ

Không gửi trường “công nợ” riêng: backend tạo/cập nhật bản ghi **RECEIVABLE** trong `debts` từ **`revenue`** và **`paidAmount`** (`remaining = amount - paidAmount`). FE hiển thị **`debtRemaining`** từ danh sách/chi tiết.

### Đã bỏ khỏi API (không gửi — sẽ 400 nếu `forbidNonWhitelisted` bắt)

- Hàng hóa: `cargoType`, `cargoWeight`, `cargoQuantity`  
- Tách phạt/sửa rời: `repairCost`, `fineCost` — gộp vào **`otherCosts`** + **`otherCostsNote`**

---

## 5. Trạng thái chuyến (tóm tắt)

Backend chuẩn hóa luồng (ví dụ `assigned`, `in_progress`, `completed`, `cancelled`); `pending` cũ có thể được map sang `new`. Chi tiết chuyển trạng thái: `PATCH /trips/:id/status` với body `{ "status": "..." }`.

---

## 6. Migration DB (FE/DevOps)

Sau khi backend deploy bản có migration **`20260407_trips_manager_and_other_costs_note.sql`**, bảng `trips` có thêm **`manager_id`**, **`other_costs_note`**. Nếu DB chưa chạy migration, tạo/sửa có `managerId` / `otherCostsNote` có thể lỗi.

---

## 7. Liên kết module Xe

Dashboard xe (`GET /api/v1/vehicles/:id/detail`) dùng chuyến theo `vehicleId` + `trip.revenue`, `tollCost`, `otherCosts`, `paidAmount`, `debts`, … — đảm bảo chuyến nhập đúng theo tài liệu này.

**Tài liệu liên quan:** [FE — Module Xe (Vehicle)](./FE_VEHICLE_MODULE.md)

---

## 8. Checklist QA nhanh

- [ ] `GET /api/v1/trips` trả `data[]` có `price`, `debtRemaining`, `customerName`, `managerName`, `commissionContactName`.  
- [ ] `POST /trips` với `customerId`, `tripDate`, `revenue`, `paidAmount`, `managerId`, `otherCosts`, `otherCostsNote` tạo được và `GET /trips/:id` hiển thị đúng.  
- [ ] `search` tìm được theo khách / lái / biển số.  
- [ ] Chuyến `completed` không `PATCH` được (backend trả lỗi).
