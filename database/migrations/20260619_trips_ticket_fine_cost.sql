-- Migration: Thêm ticket_cost (vé vào cổng) và fine_cost (luật/phạt) vào bảng trips
-- Date: 2026-06-19

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS ticket_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_cost   DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN trips.ticket_cost IS 'Vé vào cổng / gửi xe';
COMMENT ON COLUMN trips.fine_cost   IS 'Luật / phạt';
