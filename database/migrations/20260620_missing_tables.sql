-- Migration: Tạo các bảng còn thiếu (RBAC + business tables)
-- Run: sudo -u postgres psql -d vantai_anh_viet -f /var/vantai-viet-anh/database/migrations/20260620_missing_tables.sql

-- =====================
-- RBAC Tables
-- =====================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description VARCHAR(255),
  CONSTRAINT roles_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(255) NOT NULL,
  description VARCHAR(255),
  CONSTRAINT permissions_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_user_id_role_id_key UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- =====================
-- Suppliers
-- =====================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);

-- =====================
-- Debts
-- =====================

CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL,
  paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  remaining NUMERIC(15,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_debts_company_id ON debts(company_id);
CREATE INDEX IF NOT EXISTS idx_debts_type ON debts(type);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_debts_due_date ON debts(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_company_trip ON debts(company_id, trip_id) WHERE trip_id IS NOT NULL;

-- =====================
-- Commissions
-- =====================

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_date DATE NOT NULL,
  period VARCHAR(7) NOT NULL,
  revenue_base NUMERIC(15,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commissions_trip_id_key UNIQUE (trip_id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_company_id ON commissions(company_id);
CREATE INDEX IF NOT EXISTS idx_commissions_employee_id ON commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_commissions_customer_id ON commissions(customer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_trip_id ON commissions(trip_id);
CREATE INDEX IF NOT EXISTS idx_commissions_trip_date ON commissions(trip_date);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON commissions(period);

-- =====================
-- Salary Configs
-- =====================

CREATE TABLE IF NOT EXISTS salary_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(15,2),
  per_trip NUMERIC(15,2) NOT NULL DEFAULT 0,
  revenue_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT salary_configs_company_employee_key UNIQUE (company_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_salary_configs_company_id ON salary_configs(company_id);

-- =====================
-- Employee Salary Advances
-- =====================

CREATE TABLE IF NOT EXISTS employee_salary_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  advance_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_advances_company_id ON employee_salary_advances(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_salary_advances_employee_id ON employee_salary_advances(employee_id);

-- =====================
-- Employee Absences
-- =====================

CREATE TABLE IF NOT EXISTS employee_absences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  absence_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_absences_company_employee_date_key UNIQUE (company_id, employee_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_absences_company_id ON employee_absences(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_absences_employee_id ON employee_absences(employee_id);

-- =====================
-- Grant permissions to vantai user
-- =====================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vantai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vantai;
