-- Migration: Thêm cột repair_cost còn thiếu trong bảng trips
-- Trip entity (src/entities/trip.entity.ts) đã khai báo repairCost từ trước nhưng chưa có
-- migration SQL tương ứng — khiến TypeORM synchronize (NODE_ENV=development) fail khi cố
-- ALTER COLUMN ... SET NOT NULL trên các dòng hiện có (không có giá trị mặc định để backfill).
-- Dùng cùng pattern "ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT 0" như các cột chi phí khác
-- (driver_salary, assistant_allowance, ...) trong 20260620_trips_missing_columns.sql.
-- Run: sudo -u postgres psql -d vantai_anh_viet -f /var/vantai-viet-anh/database/migrations/20260810_trips_repair_cost.sql

ALTER TABLE trips ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN trips.repair_cost IS 'Chi phí sửa chữa phát sinh trong chuyến (nếu có)';
