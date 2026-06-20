-- Migration: Thêm các columns còn thiếu trong bảng trips
-- Run: sudo -u postgres psql -d vantai_anh_viet -f /var/vantai-viet-anh/database/migrations/20260620_trips_missing_columns.sql

-- contact_employee_id
ALTER TABLE trips ADD COLUMN IF NOT EXISTS contact_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_contact_employee_id ON trips(contact_employee_id);

-- manager_id
ALTER TABLE trips ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_manager_id ON trips(manager_id);

-- co_driver_id
ALTER TABLE trips ADD COLUMN IF NOT EXISTS co_driver_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_co_driver_id ON trips(co_driver_id);

-- commission_rate_applied
ALTER TABLE trips ADD COLUMN IF NOT EXISTS commission_rate_applied NUMERIC(5,2);

-- paid_amount
ALTER TABLE trips ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

-- cargo fields
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cargo_type VARCHAR(100);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cargo_weight NUMERIC(10,2);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cargo_quantity INT;

-- driver_salary
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_salary NUMERIC(15,2) NOT NULL DEFAULT 0;

-- driver_shift
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_shift VARCHAR(10) NOT NULL DEFAULT 'day';

-- assistant_allowance & assistant_salary
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assistant_allowance NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assistant_salary NUMERIC(15,2) NOT NULL DEFAULT 0;

-- profit
ALTER TABLE trips ADD COLUMN IF NOT EXISTS profit NUMERIC(15,2) NOT NULL DEFAULT 0;

-- other_costs_note
ALTER TABLE trips ADD COLUMN IF NOT EXISTS other_costs_note TEXT;

-- created_by
ALTER TABLE trips ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_created_by ON trips(created_by);

-- trip_code unique index (column might already exist)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_code VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_company_trip_code ON trips(company_id, trip_code) WHERE trip_code IS NOT NULL;

COMMENT ON COLUMN trips.contact_employee_id IS 'Nhân viên môi giới chuyến';
COMMENT ON COLUMN trips.driver_shift IS 'Ca lái: day=10%, night=15%';
