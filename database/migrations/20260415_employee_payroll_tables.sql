-- Ứng lương nhân viên
CREATE TABLE IF NOT EXISTS employee_salary_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  advance_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_salary_advances_company_employee ON employee_salary_advances(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_date ON employee_salary_advances(advance_date);

COMMENT ON TABLE employee_salary_advances IS 'Tạm ứng lương NV (ngày, số tiền, nội dung)';

-- Ngày nghỉ (chấm công): mỗi NV mỗi ngày tối đa 1 dòng
CREATE TABLE IF NOT EXISTS employee_absences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  absence_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, employee_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_absences_company_employee ON employee_absences(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_absences_date ON employee_absences(absence_date);

COMMENT ON TABLE employee_absences IS 'Ngày nghỉ không phép / nghỉ tính trừ lương (kỳ 2 ngày miễn trừ)';
