import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { Trip } from './trip.entity';
import { Transaction } from './transaction.entity';
import { EmployeeSalaryAdvance } from './employee-salary-advance.entity';
import { EmployeeAbsence } from './employee-absence.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'company_id' })
  @Index()
  companyId: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'employee_code' })
  @Index()
  employeeCode: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  @Index()
  fullName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  /** Lương nền (cố định); hoa hồng chuyến / thu nhập khác tính riêng (commission, v.v.) */
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    name: 'base_salary',
  })
  baseSalary: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  @Index()
  position: string; // lái xe, phụ xe, quản lý, etc.

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'license_number' })
  licenseNumber: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'license_type' })
  licenseType: string; // B2, C, D, E, etc.

  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index()
  status: string; // active, inactive, on_leave

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Trip, (trip) => trip.driver)
  tripsAsDriver: Trip[];

  @OneToMany(() => Trip, (trip) => trip.coDriver)
  tripsAsCoDriver: Trip[];

  @OneToMany(() => Trip, (trip) => trip.manager)
  tripsAsManager: Trip[];

  @OneToMany(() => Transaction, (transaction) => transaction.employee)
  transactions: Transaction[];

  @OneToMany(() => EmployeeSalaryAdvance, (r) => r.employee)
  salaryAdvances: EmployeeSalaryAdvance[];

  @OneToMany(() => EmployeeAbsence, (r) => r.employee)
  absenceRecords: EmployeeAbsence[];
}
