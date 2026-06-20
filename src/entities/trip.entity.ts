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
import { Vehicle } from './vehicle.entity';
import { Employee } from './employee.entity';
import { Customer } from './customer.entity';
import { User } from './user.entity';
import { Transaction } from './transaction.entity';

@Entity('trips')
@Index(['companyId', 'tripCode'], { unique: true })
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'company_id' })
  @Index()
  companyId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'trip_code' })
  @Index()
  tripCode: string;

  @Column({ type: 'date', name: 'trip_date' })
  @Index()
  tripDate: Date;

  // Foreign Keys
  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column({ name: 'vehicle_id' })
  @Index()
  vehicleId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_id' })
  driver: Employee;

  @Column({ name: 'driver_id' })
  @Index()
  driverId: string;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'co_driver_id' })
  coDriver: Employee;

  @Column({ name: 'co_driver_id', nullable: true })
  coDriverId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'customer_id' })
  @Index()
  customerId: string;

  /** Trip-level commission contact (overrides customer.contactEmployeeId when set) */
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contact_employee_id' })
  contactEmployee: Employee;

  @Column({ name: 'contact_employee_id', nullable: true })
  contactEmployeeId: string;

  /** Nhân viên quản lý / phụ trách chuyến (chọn từ danh mục NV) */
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manager_id' })
  manager: Employee;

  @Column({ name: 'manager_id', nullable: true })
  managerId: string;

  /** Trip-level commission % (overrides customer.commissionRate when set) */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    name: 'commission_rate_applied',
  })
  commissionRateApplied: number;

  /** Amount customer paid for this trip (partial payment tracking) */
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    name: 'paid_amount',
  })
  paidAmount: number;

  // Cargo Information
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'cargo_type' })
  cargoType: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'cargo_weight' })
  cargoWeight: number;

  @Column({ type: 'int', nullable: true, name: 'cargo_quantity' })
  cargoQuantity: number;

  /** Địa chỉ / tuyến chuyến (một trường duy nhất) */
  @Column({ type: 'text', nullable: true, name: 'address' })
  address: string;

  // Financial
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  revenue: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'fuel_cost' })
  fuelCost: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'repair_cost' })
  repairCost: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'toll_cost' })
  tollCost: number;

  /** Vé vào cổng / gửi xe */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'ticket_cost' })
  ticketCost: number;

  /** Luật / phạt */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'fine_cost' })
  fineCost: number;

  /** Snapshot lương trừ chuyến — server gán từ `Employee.baseSalary` khi gán tài xế (không nhận từ FE) */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'driver_salary' })
  driverSalary: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'other_costs' })
  otherCosts: number;

  /** Ghi chú kèm chi phí phát sinh */
  @Column({ type: 'text', nullable: true, name: 'other_costs_note' })
  otherCostsNote: string;

  /** Ca ngày/đêm — ảnh hưởng % tài xế trên net (day 10%, night 15%) */
  @Column({ type: 'varchar', length: 10, default: 'day', name: 'driver_shift' })
  driverShift: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    name: 'assistant_allowance',
  })
  assistantAllowance: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    name: 'assistant_salary',
  })
  assistantSalary: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  profit: number; // Calculated: revenue - (fuel + toll + salary + other)

  // Status & Notes
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  @Index()
  status: string; // pending, in_progress, completed, cancelled

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Metadata
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by', nullable: true })
  createdById: string;

  // Relations
  @OneToMany(() => Transaction, (transaction) => transaction.trip)
  transactions: Transaction[];

  // Helper (not persisted)
  private _calculatedProfit: number;

  // Method to calculate profit
  calculateProfit(): number {
    return (
      this.revenue -
      (Number(this.fuelCost ?? 0) +
        Number(this.tollCost ?? 0) +
        Number(this.ticketCost ?? 0) +
        Number(this.fineCost ?? 0) +
        Number(this.driverSalary ?? 0) +
        Number(this.otherCosts ?? 0))
    );
  }
}
