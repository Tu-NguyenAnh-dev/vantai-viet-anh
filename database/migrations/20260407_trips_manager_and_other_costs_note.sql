-- Quản lý chuyến: quản lý (nhân viên) + ghi chú chi phí phát sinh
ALTER TABLE trips ADD COLUMN IF NOT EXISTS manager_id UUID;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS other_costs_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trips_manager'
  ) THEN
    ALTER TABLE trips
      ADD CONSTRAINT fk_trips_manager
      FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trips_manager_id ON trips(manager_id);

COMMENT ON COLUMN trips.manager_id IS 'Nhân viên phụ trách/quản lý chuyến (chọn từ danh mục NV)';
COMMENT ON COLUMN trips.other_costs_note IS 'Ghi chú đi kèm chi phí phát sinh (other_costs)';
