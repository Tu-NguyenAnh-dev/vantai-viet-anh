-- Optional fields for vehicle detail / driver % calculations (safe ADD)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_shift VARCHAR(10) DEFAULT 'day';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assistant_allowance DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assistant_salary DECIMAL(15, 2) DEFAULT 0;

COMMENT ON COLUMN trips.driver_shift IS 'day | night — % tài xế: day 10%, night 15%';
COMMENT ON COLUMN trips.assistant_allowance IS 'Phụ cấp phụ xe / trợ lý trên chuyến';
COMMENT ON COLUMN trips.assistant_salary IS 'Lương phụ xe trên chuyến (tách driver_salary)';
