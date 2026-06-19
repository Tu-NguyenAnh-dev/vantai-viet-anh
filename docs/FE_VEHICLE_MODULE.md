# Tài liệu triển khai Frontend — Module Xe (Vehicle)

Tài liệu mô tả API REST backend cho màn hình quản lý xe, dashboard tài chính/vận hành, và CRUD nhiên liệu/sửa chữa (giao dịch). **Prefix đầy đủ:** **`/api/v1/vehicles`** (xem `main.ts` — `setGlobalPrefix('api/v1')`).

**Xác thực:** mọi endpoint dùng **`JwtAuthGuard`** — gửi header `Authorization: Bearer <token>` và context công ty theo cách app đang dùng (ví dụ header/claim `companyId`).

**Envelope phản hồi thông thường:**

```json
{ "success": true, "data": ... }
```

hoặc danh sách có phân trang:

```json
{ "success": true, "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }
```

---

## 1. Model xe (response)

Dữ liệu lưu DB dùng tên cột kiểu `licensePlate`, `vehicleType`, `year`. API **bổ sung alias** để đồng bộ spec mới (không phá client cũ):

| Trường API (ưu tiên hiển thị mới) | Trường gốc trong DB / entity |
|----------------------------------|------------------------------|
| `plateNumber`                    | `licensePlate`               |
| `type`                           | `vehicleType`                |
| `manufactureYear`                | `year`                       |

Các trường khác: `id`, `brand`, `model`, `capacity`, `status`, `maintenanceCost`, `createdAt`, `updatedAt`, …

**`status`:** giá trị lưu dạng **chữ thường**: `active` | `inactive` | `maintenance`.  
Khi **gửi lên** (POST/PATCH), backend chấp nhận thêm dạng `ACTIVE` / `MAINTENANCE` / `INACTIVE` và tự chuẩn hóa.

---

## 2. CRUD xe (giữ nguyên)

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/vehicles` | Tạo xe |
| `GET` | `/vehicles` | Danh sách + query (mục 3) |
| `GET` | `/vehicles/stats` | Thống kê nhanh: `total`, `active`, `inactive`, `maintenance` |
| `GET` | `/vehicles/:id` | Chi tiết một xe (entity thô) |
| `PATCH` | `/vehicles/:id` | Cập nhật |
| `DELETE` | `/vehicles/:id` | **Soft delete:** set `status = inactive` (không xóa bản ghi) |

### Body tạo/cập nhật (`POST` / `PATCH`)

Tất cả field tạo đều optional trừ khi ghi chú — thực tế **bắt buộc phải có biển số** qua một trong hai: `licensePlate` hoặc `plateNumber`.

- `licensePlate` **hoặc** `plateNumber` — biển số  
- `vehicleType` **hoặc** `type` — loại xe  
- `brand`, `model`, `year`, `capacity`  
- `status` — enum hoặc chuỗi chuẩn hóa như trên  
- `maintenanceCost` — khi `status = maintenance`, dùng đồng bộ giao dịch sửa chữa nội bộ (backend tự tạo/cập nhật transaction REPAIR)

---

## 3. Danh sách xe — tìm kiếm & sắp xếp

```http
GET /vehicles?search=&status=&vehicleType=&sort=&sortOrder=&page=&limit=&pageSize=
```

| Query | Ý nghĩa |
|-------|---------|
| `search` | Tìm **substring** (ILIKE) trên **biển số**, **brand**, **model** |
| `status` | Lọc đúng `vehicle.status` (giá trị lưu: `active`, …) |
| `vehicleType` | Lọc loại xe |
| `sort` | Hiện chỉ hỗ trợ: **`status`** |
| `sortOrder` | `ASC` \| `DESC` (chữ hoa/thường đều được) |
| `page` | Trang, mặc định `1` |
| `limit` hoặc `pageSize` | Số bản ghi/trang, mặc định `20` |

Nếu **không** có `sort=status`, mặc định sắp xếp theo **`licensePlate` ASC**.

---

## 4. Dashboard xe — `GET /vehicles/:id/detail`

```http
GET /vehicles/:id/detail?fromDate=&toDate=
```

| Query | Format | Mô tả |
|-------|--------|--------|
| `fromDate` | ISO date string (ví dụ `2026-01-01`) | Optional |
| `toDate` | ISO date string | Optional |

Lọc **chuyến** (`trips`) và **giao dịch** fuel/repair theo khoảng ngày khi có `fromDate`/`toDate`. Chuyến **hủy** (`status = cancelled`) **không** vào tính toán và không liệt kê.

### Cấu trúc `data`

```ts
{
  vehicle: {
    // toàn bộ entity Vehicle + alias:
    plateNumber,    // = licensePlate
    type,           // = vehicleType
    manufactureYear // = year
  },
  summary: {
    driverPercentCost: number,
    driverSalary: number,
    assistantSalary: number,
    commissionContact: number,
    fuelCost: number,
    repairCost: number,
    debtAmount: number,
    revenue: number,
    profit: number
  },
  operations: {
    trips: Array<{
      id, tripCode, tripDate, revenue, status, driverId,
      driverShift: 'day' | 'night'  // mặc định 'day' nếu null
    }>,
    fuels:   Array<{ id, amount, date, note, category }>,
    repairs: Array<{ id, amount, date, note, category }>,
    debts:   Debt[]  // entity debts gắn trip trong khoảng lọc
  }
}
```

### Logic tổng hợp (để FE hiển thị/tooltip — khớp backend)

- **`revenue`:** tổng **`trip.revenue`** của các chuyến trong filter (không dùng field tên `price` trên entity).
- **Hoa hồng contact (`commissionContact`):** tổng **`commissions.amount`** theo từng `tripId` tương ứng.
- **Lương tài xế / phụ xe:** tổng `driverSalary`, `assistantSalary` trên từng trip.
- **`driverPercentCost`:** với mỗi chuyến,  
  `net = revenue - fuelCost - tollCost - otherCosts - commissionTrip - assistantAllowance`  
  (`fuelCost` = chi phí xăng ghi trên chuyến; commission lấy từ bảng `commissions` theo trip; `assistantAllowance` = phụ cấp phụ xe).  
  Nếu `net > 0`: cộng `net * 0.1` (ca **ngày**, `driverShift` = `day`) hoặc `net * 0.15` (ca **đêm**, `driverShift` = `night`).
- **`fuelCost` / `repairCost`:** tổng **giao dịch chi** (`transactionType = expense`, `status = completed`) gắn `vehicleId`, category chuẩn **`FUEL`** / **`REPAIR`** (so khớp không phân biệt hoa thường khi aggregate).
- **`debtAmount`:** tổng **`debts.remaining`** cho các `tripId` thuộc chuyến đã lọc.
- **`profit`:**  
  `revenue - driverPercentCost - driverSalary - assistantSalary - commissionContact - fuelCost - repairCost`  
  (**không** trừ `debtAmount` trong công thức lợi nhuận — công nợ chỉ hiển thị riêng).

### Nhiều tài xế / phụ xe thay đổi trên cùng một xe — không dùng “lương cứng” gắn xe

Dashboard **không** lấy một mức lương cố định từ hồ sơ nhân viên rồi nhân số chuyến. Thay vào đó, **mỗi chuyến** (`trips`) lưu **snapshot** tại thời điểm gán:

- `driverSalary` — copy từ `baseSalary` của **đúng tài xế** được gán cho chuyến đó (khi tạo/cập nhật `driverId`).
- `assistantSalary` — copy từ `baseSalary` của **đúng phụ xe** nếu có `coDriverId`.

Khi **GET /vehicles/:id/detail** tổng hợp trong khoảng ngày, backend **cộng** `driverSalary` và `assistantSalary` **theo từng chuyến** trong filter. Vì vậy:

- Xe A hôm nay do lái **X**, mai do lái **Y** → mỗi dòng chuyến một mức snapshot khác nhau; tổng là tổng thực tế theo từng chuyến, **không** ép một người cố định.
- Phụ xe đổi theo chuyến → mỗi chuyến có `assistantSalary` / `assistantAllowance` riêng; tổng phụ xe trên dashboard là **tổng các chuyến**, không phải một số cứng.

Nếu cần đối soát theo người (lái X bao nhiêu, lái Y bao nhiêu), phải **lọc/bảng chi tiết theo chuyến** (danh sách `operations.trips` hoặc báo cáo riêng), không chỉ nhìn một con số tổng trên xe.

---

## 5. Lịch sử chuyến / sửa chữa (đã có)

```http
GET /vehicles/:id/trips?page=&limit=&fromDate=&toDate=
GET /vehicles/:id/repairs?fromDate=&toDate=
```

- **`trips`:** pagination `page`, `limit`; join driver, customer.  
- **`repairs`:** danh sách giao dịch chi loại sửa chữa (REPAIR/maintenance), map về `{ id, amount, date, note, category }`.

---

## 6. Nhiên liệu & sửa chữa — CRUD qua transaction

Không có bảng riêng: mọi thao tác tạo/sửa/xóa đều thao tác bảng **`transactions`** (`category` = `FUEL` hoặc `REPAIR`, `transactionType` = `EXPENSE`, `status` = `completed`).

### 6.1 Nhiên liệu

| Method | Path | Body |
|--------|------|------|
| `POST` | `/vehicles/:id/fuels` | Xem bảng dưới |
| `PATCH` | `/vehicles/:id/fuels/:fuelId` | Cùng schema, field optional |
| `DELETE` | `/vehicles/:id/fuels/:fuelId` | Không body — `fuelId` = **id transaction** |

**Tạo (`POST`) — bắt buộc:**

- `transactionDate` — ISO date string  
- `amount` — số > 0  

**Optional:** `description`, `note` (khi không có `description`, backend dùng `note` cho mô tả giao dịch).

### 6.2 Sửa chữa (giao dịch)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/vehicles/:id/repairs` | Giống fuel |
| `PATCH` | `/vehicles/:id/repairs/:repairId` | Giống fuel |
| `DELETE` | `/vehicles/:id/repairs/:repairId` | `repairId` = **id transaction** |

**Lưu ý routing:** cùng prefix `/vehicles/:id/repairs` — `GET` = **đọc lịch sử**, `POST` = **tạo giao dịch** (khác HTTP method).

---

## 7. Import Excel — đã gỡ

API import **không** còn nhánh **vehicles**. Chỉ import kiểu `employees` / `customers` (theo module import hiện tại). FE nên ẩn/gỡ UI “Import xe” hoặc template tải xuống nếu có.

---

## 8. Gợi ý triển khai UI

1. **Danh sách xe:** ô tìm kiếm gửi `search`; filter trạng thái gửi `status` đúng giá trị lowercase; cột trạng thái sort: `sort=status&sortOrder=DESC`.  
2. **Màn chi tiết/dashboard:** gọi `GET .../detail` với `fromDate`/`toDate` từ date range picker; hiển thị `summary` + bảng `operations.trips` / tab nhiên liệu & sửa chữa & công nợ.  
3. **Form nhập xăng/sửa:** gọi POST/PATCH/DELETE như mục 6; sau khi thành công có thể refetch `detail` hoặc chỉ cập nhật local state.  
4. **Mapping hiển thị:** ưu tiên `plateNumber` / `type` / `manufactureYear` nếu có; fallback `licensePlate` / `vehicleType` / `year` cho dữ liệu cũ.

---

## 9. Checklist QA nhanh

- [ ] `GET /vehicles` không thêm query vẫn hoạt động như cũ.  
- [ ] `GET /vehicles?search=...` lọc biển số / hãng / model.  
- [ ] `GET /vehicles?sort=status&sortOrder=DESC` trả về thứ tự đúng.  
- [ ] `GET /vehicles/:id/detail` có/không `fromDate`&`toDate` — số liệu khớp quy tắc mục 4.  
- [ ] CRUD fuel/repair cập nhật đúng transaction và xuất hiện lại trong `detail.operations`.

---

## 10. Xử lý lỗi `404` — `Cannot GET .../vehicles/:id/detail`

Nếu response giống:

```json
{
  "message": "Cannot GET /api/v1/vehicles/<uuid>/detail?...",
  "error": "Not Found",
  "statusCode": 404
}
```

Đây là **Express không tìm thấy route** (handler chưa được đăng ký trên process đang chạy), **không** phải lỗi “không có xe” (trường hợp đó Nest thường trả `message: "Vehicle not found"`).

**Việc cần làm:**

1. **Backend đúng bản build** — Route `GET /vehicles/:id/detail` có trong source (`vehicles.controller.ts`). Cần **`npm run build`** (hoặc pipeline CI) và **restart** process (PM2/Docker/systemd) để process thực sự chạy code mới.
2. **Đúng host / không proxy sai** — FE phải gọi đúng URL API (ví dụ `VITE_API_URL` trỏ thẳng backend `:3000`, hoặc dev server **proxy** `/api` → backend). Nếu request lạc sang static server hoặc host cũ, sẽ 404 tương tự.
3. **Prefix** — Toàn app dùng `setGlobalPrefix('api/v1')` trong `main.ts`, nên path đầy đủ là **`/api/v1/vehicles/:id/detail`** (đúng với URL bạn đang gọi).

**Cách kiểm tra nhanh (có JWT):**

- Gọi `GET /api/v1/vehicles/stats` — nếu **200** thì module `vehicles` và prefix đúng; khi đó mà `/detail` vẫn 404 thì gần như chắc process chưa có bản có route `detail` (cần deploy lại).
- Gọi `GET /api/v1/vehicles/:id/detail` **không** token: nếu backend có route, thường nhận **401 Unauthorized**; nếu vẫn **404** thì route không tồn tại trên server đó.

---

**Tài liệu liên quan:** [FE — Quản lý chuyến (Trips)](./FE_TRIPS_MODULE.md)

---

*Tài liệu căn theo code backend trong repo; nếu deploy thêm global prefix hoặc versioning API, FE chỉ cần nối prefix tương ứng.*
