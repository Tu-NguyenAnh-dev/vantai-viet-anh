-- Add missing base_salary column to employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS base_salary DECIMAL(15,2) NOT NULL DEFAULT 0;
