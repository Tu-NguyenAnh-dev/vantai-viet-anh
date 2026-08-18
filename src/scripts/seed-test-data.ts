/**
 * Seed dữ liệu demo: nhân viên, xe, khách hàng, chuyến (1 tháng), công nợ, thu chi,
 * cấu hình lương (salary_configs), hoa hồng (commissions).
 *
 * Chạy: npm run seed:test
 * Cần: PostgreSQL (.env), Redis (Bull — giống khi chạy app).
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { TransactionsService } from '../modules/transactions/transactions.service';
import { DebtsService } from '../modules/debts/debts.service';
import { Company } from '../entities/company.entity';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { Employee } from '../entities/employee.entity';
import { Customer } from '../entities/customer.entity';
import { Trip } from '../entities/trip.entity';
import { Supplier } from '../entities/supplier.entity';
import { SalaryConfig } from '../entities/salary-config.entity';
import { Commission } from '../entities/commission.entity';

/** Mã công ty — nếu đã tồn tại thì bỏ qua (idempotent) */
export const SEED_COMPANY_CODE = 'TEST_SEED';

/** Tháng seed: tháng 3/2025 (mọi chuyến & báo cáo lương dùng khoảng này) */
export const SEED_MONTH = {
  year: 2025,
  /** 0-based: 2 = tháng 3 */
  monthIndex: 2,
  label: '2025-03',
  fromDate: '2025-03-01',
  toDate: '2025-03-31',
} as const;

/** UUID cố định (ổn định khi debug / doc) */
export const IDS = {
  company: 'a0000001-0000-4000-8000-000000000001',
  user: 'a0000001-0000-4000-8000-000000000002',
  v1: 'a0000001-0000-4000-8000-000000000003',
  v2: 'a0000001-0000-4000-8000-000000000004',
  v3: 'a0000001-0000-4000-8000-000000000005',
  d1: 'a0000001-0000-4000-8000-000000000006',
  d2: 'a0000001-0000-4000-8000-000000000007',
  co: 'a0000001-0000-4000-8000-000000000008',
  s1: 'a0000001-0000-4000-8000-000000000009',
  s2: 'a0000001-0000-4000-8000-00000000000a',
  office: 'a0000001-0000-4000-8000-00000000000b',
  c1: 'a0000001-0000-4000-8000-00000000000c',
  c2: 'a0000001-0000-4000-8000-00000000000d',
  c3: 'a0000001-0000-4000-8000-00000000000e',
  sup1: 'a0000001-0000-4000-8000-00000000000f',
  sup2: 'a0000001-0000-4000-8000-000000000010',
  scD1: 'a0000001-0000-4000-8000-000000000011',
  scD2: 'a0000001-0000-4000-8000-000000000012',
  t01: 'a0000001-0000-4000-8000-000000000013',
  t02: 'a0000001-0000-4000-8000-000000000014',
  t03: 'a0000001-0000-4000-8000-000000000015',
  t04: 'a0000001-0000-4000-8000-000000000016',
  t05: 'a0000001-0000-4000-8000-000000000017',
  t06: 'a0000001-0000-4000-8000-000000000018',
  t07: 'a0000001-0000-4000-8000-000000000019',
  t08: 'a0000001-0000-4000-8000-00000000001a',
  t09: 'a0000001-0000-4000-8000-00000000001b',
  t10: 'a0000001-0000-4000-8000-00000000001c',
} as const;

/** Đăng nhập API */
export const SEED_USER_EMAIL = 'test-seed@vantai.local';
export const SEED_USER_PASSWORD = 'Test@123';

function d(day: number): Date {
  return new Date(SEED_MONTH.year, SEED_MONTH.monthIndex, day);
}

function coerceTripDate(value: Date | string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const [y, m, dd] = value.split('T')[0].split('-').map((v) => parseInt(v, 10));
    return new Date(y, m - 1, dd);
  }
  return new Date(String(value));
}

function toPeriod(tripDate: Date | string): string {
  const dt = coerceTripDate(tripDate as Date | string);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function calcProfit(t: {
  revenue: number;
  fuelCost: number;
  tollCost: number;
  driverSalary: number;
  otherCosts: number;
}): number {
  return (
    t.revenue -
    (t.fuelCost + t.tollCost + t.driverSalary + t.otherCosts)
  );
}

type CustomerSeed = {
  id: string;
  commissionRate: number;
  contactEmployeeId: string | null;
};

function buildCommissionRow(
  companyId: string,
  trip: Trip,
  cust: CustomerSeed,
): Partial<Commission> | null {
  const employeeId = trip.contactEmployeeId || cust.contactEmployeeId;
  if (!employeeId) return null;
  const rate =
    trip.commissionRateApplied != null
      ? Number(trip.commissionRateApplied)
      : Number(cust.commissionRate || 0);
  if (!rate || rate <= 0) return null;
  const revenueBase = Number(trip.revenue || 0);
  const amount = (revenueBase * rate) / 100;
  if (amount <= 0) return null;
  const tripDateNorm = coerceTripDate(trip.tripDate as Date | string);
  return {
    companyId,
    employeeId,
    customerId: trip.customerId,
    tripId: trip.id,
    tripDate: tripDateNorm,
    period: toPeriod(trip.tripDate as Date | string),
    revenueBase,
    commissionRate: rate,
    amount,
  };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const ds = app.get(DataSource);
  const companyRepo = ds.getRepository(Company);
  const tripRepo = ds.getRepository(Trip);
  const commissionRepo = ds.getRepository(Commission);
  const transactionsService = app.get(TransactionsService);
  const debtsService = app.get(DebtsService);

  const existing = await companyRepo.findOne({
    where: { code: SEED_COMPANY_CODE },
  });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(
      `[seed] Đã có công ty mã "${SEED_COMPANY_CODE}" (id=${existing.id}). Bỏ qua. Xóa công ty này trong DB nếu muốn seed lại.`,
    );
    await app.close();
    process.exit(0);
  }

  const companyId = IDS.company;
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10);

  await companyRepo.save({
    id: companyId,
    name: 'Công ty Demo Seed (đầy đủ)',
    code: SEED_COMPANY_CODE,
    address: '123 Đường Seed, Hà Nội',
    phone: '0243999888',
    email: 'contact@seed.local',
    taxCode: '0123456789',
  });

  await ds.getRepository(User).save({
    id: IDS.user,
    companyId,
    email: SEED_USER_EMAIL,
    passwordHash,
    fullName: 'Admin Seed',
    role: 'admin',
    status: 'active',
  });

  await ds.getRepository(Vehicle).save([
    {
      id: IDS.v1,
      companyId,
      licensePlate: '51A-SEED01',
      vehicleType: 'container 20ft',
      brand: 'Hino',
      model: '500',
      year: 2022,
      capacity: 15,
      status: 'active',
    },
    {
      id: IDS.v2,
      companyId,
      licensePlate: '51B-SEED02',
      vehicleType: 'thùng kín',
      brand: 'Isuzu',
      model: 'NQR',
      year: 2021,
      capacity: 8,
      status: 'active',
    },
    {
      id: IDS.v3,
      companyId,
      licensePlate: '51C-SEED03',
      vehicleType: 'moóc',
      brand: 'Howo',
      model: 'A7',
      year: 2020,
      capacity: 40,
      status: 'maintenance',
    },
  ]);

  await ds.getRepository(Employee).save([
    {
      id: IDS.d1,
      companyId,
      employeeCode: 'NV-TX-001',
      fullName: 'Nguyễn Văn Tài Xế A',
      phone: '0901000001',
      email: 'driver1.seed@local',
      baseSalary: 5_000_000,
      position: 'lái xe',
      licenseNumber: 'GPLX100001',
      licenseType: 'C',
      status: 'active',
    },
    {
      id: IDS.d2,
      companyId,
      employeeCode: 'NV-TX-002',
      fullName: 'Phạm Văn Tài Xế B',
      phone: '0901000002',
      email: 'driver2.seed@local',
      baseSalary: 4_800_000,
      position: 'lái xe',
      licenseNumber: 'GPLX100002',
      licenseType: 'C',
      status: 'active',
    },
    {
      id: IDS.co,
      companyId,
      employeeCode: 'NV-PX-001',
      fullName: 'Trần Văn Phụ Xe',
      phone: '0901000003',
      baseSalary: 3_200_000,
      position: 'phụ xe',
      status: 'active',
    },
    {
      id: IDS.s1,
      companyId,
      employeeCode: 'NV-KD-001',
      fullName: 'Lê Thị Kinh Doanh 1',
      phone: '0901000004',
      baseSalary: 8_000_000,
      position: 'kinh doanh',
      status: 'active',
    },
    {
      id: IDS.s2,
      companyId,
      employeeCode: 'NV-KD-002',
      fullName: 'Hoàng Thị Kinh Doanh 2',
      phone: '0901000005',
      baseSalary: 7_500_000,
      position: 'kinh doanh',
      status: 'active',
    },
    {
      id: IDS.office,
      companyId,
      employeeCode: 'NV-VP-001',
      fullName: 'Đỗ Văn Kế Toán',
      phone: '0901000006',
      baseSalary: 9_000_000,
      position: 'kế toán',
      status: 'active',
    },
  ]);

  /** Cấu hình lương biến (ưu tiên khi báo cáo lương) — tài xế A/B */
  await ds.getRepository(SalaryConfig).save([
    {
      id: IDS.scD1,
      companyId,
      employeeId: IDS.d1,
      baseSalary: null,
      perTrip: 200_000,
      revenuePercent: 0.8,
    },
    {
      id: IDS.scD2,
      companyId,
      employeeId: IDS.d2,
      baseSalary: null,
      perTrip: 150_000,
      revenuePercent: 0.5,
    },
  ]);

  await ds.getRepository(Customer).save([
    {
      id: IDS.c1,
      companyId,
      customerCode: 'KH-SEED-01',
      name: 'Công ty Logistics Alpha',
      phone: '0283111222',
      email: 'alpha@demo.local',
      address: 'KCN Seed, TP.HCM',
      contactPerson: 'Mr. Alpha',
      contactEmployeeId: IDS.s1,
      commissionRate: 2.5,
      status: 'active',
    },
    {
      id: IDS.c2,
      companyId,
      customerCode: 'KH-SEED-02',
      name: 'TNHH Beta Transport',
      phone: '0243222333',
      email: 'beta@demo.local',
      address: 'Hà Nội',
      contactPerson: 'Ms. Beta',
      contactEmployeeId: IDS.s2,
      commissionRate: 2.0,
      status: 'active',
    },
    {
      id: IDS.c3,
      companyId,
      customerCode: 'KH-SEED-03',
      name: 'CTCP Gamma XNK',
      phone: '0238333444',
      email: 'gamma@demo.local',
      address: 'Hải Phòng',
      contactPerson: 'Mr. Gamma',
      contactEmployeeId: IDS.s1,
      commissionRate: 3.0,
      status: 'active',
    },
  ]);

  const customersById: Record<string, CustomerSeed> = {
    [IDS.c1]: {
      id: IDS.c1,
      commissionRate: 2.5,
      contactEmployeeId: IDS.s1,
    },
    [IDS.c2]: {
      id: IDS.c2,
      commissionRate: 2.0,
      contactEmployeeId: IDS.s2,
    },
    [IDS.c3]: {
      id: IDS.c3,
      commissionRate: 3.0,
      contactEmployeeId: IDS.s1,
    },
  };

  const baseSalaryD1 = 5_000_000;
  const baseSalaryD2 = 4_800_000;

  type TripDef = {
    id: string;
    code: string;
    day: number;
    vehicleId: string;
    driverId: string;
    coDriverId: string | null;
    customerId: string;
    contactEmployeeId: string | null;
    /** Nếu không set → dùng % trên khách hàng */
    commissionRateApplied?: number | null;
    paidAmount: number;
    status: string;
    revenue: number;
    fuel: number;
    toll: number;
    other: number;
    address: string;
    cargoType?: string;
  };

  const tripDefs: TripDef[] = [
    {
      id: IDS.t01,
      code: 'TRIP-202503-001',
      day: 3,
      vehicleId: IDS.v1,
      driverId: IDS.d1,
      coDriverId: IDS.co,
      customerId: IDS.c1,
      contactEmployeeId: IDS.s1,
      commissionRateApplied: null,
      paidAmount: 4_000_000,
      status: 'completed',
      revenue: 12_000_000,
      fuel: 600_000,
      toll: 200_000,
      other: 0,
      address: 'TP.HCM → Bình Dương',
      cargoType: 'Hàng tiêu dùng',
    },
    {
      id: IDS.t02,
      code: 'TRIP-202503-002',
      day: 5,
      vehicleId: IDS.v2,
      driverId: IDS.d1,
      coDriverId: null,
      customerId: IDS.c2,
      contactEmployeeId: IDS.s2,
      commissionRateApplied: 2.0,
      paidAmount: 8_000_000,
      status: 'completed',
      revenue: 8_000_000,
      fuel: 400_000,
      toll: 150_000,
      other: 100_000,
      address: 'Hà Nội → Hải Phòng',
    },
    {
      id: IDS.t03,
      code: 'TRIP-202503-003',
      day: 7,
      vehicleId: IDS.v1,
      driverId: IDS.d2,
      coDriverId: IDS.co,
      customerId: IDS.c3,
      contactEmployeeId: null,
      paidAmount: 0,
      status: 'completed',
      revenue: 15_000_000,
      fuel: 900_000,
      toll: 300_000,
      other: 0,
      address: 'Hải Phòng → Lạng Sơn',
    },
    {
      id: IDS.t04,
      code: 'TRIP-202503-004',
      day: 10,
      vehicleId: IDS.v2,
      driverId: IDS.d1,
      coDriverId: null,
      customerId: IDS.c1,
      contactEmployeeId: IDS.s1,
      paidAmount: 2_000_000,
      status: 'assigned',
      revenue: 9_000_000,
      fuel: 450_000,
      toll: 180_000,
      other: 0,
      address: 'Đà Nẵng → Huế',
    },
    {
      id: IDS.t05,
      code: 'TRIP-202503-005',
      day: 12,
      vehicleId: IDS.v1,
      driverId: IDS.d2,
      coDriverId: null,
      customerId: IDS.c2,
      contactEmployeeId: IDS.s2,
      paidAmount: 0,
      status: 'in_progress',
      revenue: 7_000_000,
      fuel: 350_000,
      toll: 120_000,
      other: 50_000,
      address: 'Nha Trang → Đà Lạt',
    },
    {
      id: IDS.t06,
      code: 'TRIP-202503-006',
      day: 14,
      vehicleId: IDS.v1,
      driverId: IDS.d1,
      coDriverId: IDS.co,
      customerId: IDS.c1,
      contactEmployeeId: IDS.s1,
      paidAmount: 12_000_000,
      status: 'completed',
      revenue: 12_000_000,
      fuel: 550_000,
      toll: 200_000,
      other: 0,
      address: 'Biên Hòa → Vũng Tàu',
    },
    {
      id: IDS.t07,
      code: 'TRIP-202503-007',
      day: 17,
      vehicleId: IDS.v2,
      driverId: IDS.d2,
      coDriverId: null,
      customerId: IDS.c3,
      contactEmployeeId: IDS.s1,
      paidAmount: 5_000_000,
      status: 'completed',
      revenue: 10_000_000,
      fuel: 500_000,
      toll: 200_000,
      other: 0,
      address: 'Cần Thơ → An Giang',
    },
    {
      id: IDS.t08,
      code: 'TRIP-202503-008',
      day: 19,
      vehicleId: IDS.v1,
      driverId: IDS.d1,
      coDriverId: null,
      customerId: IDS.c2,
      contactEmployeeId: IDS.s2,
      paidAmount: 0,
      status: 'completed',
      revenue: 5_500_000,
      fuel: 280_000,
      toll: 100_000,
      other: 0,
      address: 'Buôn Ma Thuột → Gia Lai',
    },
    {
      id: IDS.t09,
      code: 'TRIP-202503-009',
      day: 21,
      vehicleId: IDS.v2,
      driverId: IDS.d1,
      coDriverId: null,
      customerId: IDS.c1,
      contactEmployeeId: IDS.s1,
      paidAmount: 0,
      status: 'cancelled',
      revenue: 0,
      fuel: 0,
      toll: 0,
      other: 0,
      address: 'Hủy — khách đổi lịch',
    },
    {
      id: IDS.t10,
      code: 'TRIP-202503-010',
      day: 25,
      vehicleId: IDS.v1,
      driverId: IDS.d2,
      coDriverId: IDS.co,
      customerId: IDS.c1,
      contactEmployeeId: IDS.s1,
      paidAmount: 8_000_000,
      status: 'completed',
      revenue: 20_000_000,
      fuel: 1_100_000,
      toll: 400_000,
      other: 200_000,
      address: 'TP.HCM → Cần Thơ',
    },
  ];

  for (const def of tripDefs) {
    const driverSalary =
      def.status === 'cancelled' && Number(def.revenue) === 0
        ? 0
        : def.driverId === IDS.d1
          ? baseSalaryD1
          : baseSalaryD2;
    const revenue = def.revenue;
    const profit = calcProfit({
      revenue,
      fuelCost: def.fuel,
      tollCost: def.toll,
      driverSalary,
      otherCosts: def.other,
    });

    const trip = tripRepo.create({
      id: def.id,
      companyId,
      tripCode: def.code,
      tripDate: d(def.day),
      vehicleId: def.vehicleId,
      driverId: def.driverId,
      coDriverId: def.coDriverId,
      customerId: def.customerId,
      contactEmployeeId: def.contactEmployeeId,
      commissionRateApplied:
        def.commissionRateApplied !== undefined ? def.commissionRateApplied : null,
      paidAmount: def.paidAmount,
      cargoType: def.cargoType ?? 'Tổng hợp',
      cargoWeight: 10,
      address: def.address,
      revenue,
      fuelCost: def.fuel,
      tollCost: def.toll,
      driverSalary,
      otherCosts: def.other,
      profit,
      status: def.status,
      notes: `Seed ${SEED_MONTH.label} — ${def.code}`,
      createdById: IDS.user,
    });
    await tripRepo.save(trip);
  }

  /** Công nợ phải thu (theo chuyến) + thu từ chuyến completed + hoa hồng */
  for (const def of tripDefs) {
    const saved = await tripRepo.findOne({ where: { id: def.id } });
    if (!saved) continue;
    await debtsService.createReceivableFromTrip(companyId, saved);

    if (saved.status === 'completed' && Number(saved.revenue) > 0) {
      await transactionsService.createIncomeFromCompletedTripIfAbsent(
        companyId,
        saved,
      );
      const cust = customersById[saved.customerId];
      if (cust) {
        const row = buildCommissionRow(companyId, saved, cust);
        if (row) {
          const exists = await commissionRepo.findOne({
            where: { tripId: saved.id },
            select: ['id'],
          });
          if (!exists) {
            await commissionRepo.save(commissionRepo.create(row));
          }
        }
      }
    }
  }

  await ds.getRepository(Supplier).save([
    {
      id: IDS.sup1,
      companyId,
      name: 'NCC Xăng dầu Miền Nam',
      code: 'NCC-XD-01',
      status: 'active',
    },
    {
      id: IDS.sup2,
      companyId,
      name: 'NCC Sửa chữa & phụ tùng',
      code: 'NCC-SC-02',
      status: 'active',
    },
  ]);

  await debtsService.create(companyId, {
    type: 'PAYABLE',
    supplierId: IDS.sup1,
    amount: 12_000_000,
    paidAmount: 4_000_000,
    dueDate: '2025-03-28',
    note: 'Seed: công nợ xăng dầu tháng 3',
  });

  await debtsService.create(companyId, {
    type: 'PAYABLE',
    supplierId: IDS.sup2,
    amount: 8_500_000,
    paidAmount: 0,
    dueDate: '2025-03-30',
    note: 'Seed: phụ tùng thay thế',
  });

  /** RECEIVABLE không gắn chuyến (phí dịch vụ khách) */
  await debtsService.create(companyId, {
    type: 'RECEIVABLE',
    customerId: IDS.c2,
    amount: 3_000_000,
    paidAmount: 1_000_000,
    dueDate: '2025-03-20',
    note: 'Seed: phải thu phí kho / bốc xếp (không gắn trip)',
  });

  /** Thu chi thủ công (bổ sung) */
  await transactionsService.create(companyId, {
    transactionDate: '2025-03-04',
    transactionType: 'EXPENSE',
    category: 'FUEL',
    amount: 2_200_000,
    vehicleId: IDS.v1,
    description: 'Seed: đổ dầu đầu tháng 3',
    status: 'completed',
  });

  await transactionsService.create(companyId, {
    transactionDate: '2025-03-11',
    transactionType: 'EXPENSE',
    category: 'FUEL',
    amount: 1_800_000,
    vehicleId: IDS.v2,
    description: 'Seed: chi xăng cao tốc',
    status: 'completed',
  });

  await transactionsService.create(companyId, {
    transactionDate: '2025-03-16',
    transactionType: 'EXPENSE',
    category: 'REPAIR',
    amount: 6_500_000,
    vehicleId: IDS.v1,
    description: 'Seed: sửa hệ thống phanh',
    status: 'completed',
  });

  await transactionsService.create(companyId, {
    transactionDate: '2025-03-27',
    transactionType: 'EXPENSE',
    category: 'SALARY',
    amount: 42_000_000,
    employeeId: IDS.office,
    description: `Seed: chi lương nhân sự tháng ${SEED_MONTH.label} (tổng hợp)`,
    status: 'completed',
  });

  await transactionsService.create(companyId, {
    transactionDate: '2025-03-27',
    transactionType: 'EXPENSE',
    category: 'SALARY',
    amount: 5_000_000,
    employeeId: IDS.d1,
    description: 'Seed: tạm ứng lương tài xế A',
    status: 'completed',
  });

  // eslint-disable-next-line no-console
  console.log(`
[seed] Hoàn tất dữ liệu tháng ${SEED_MONTH.label}

  Công ty: ${SEED_COMPANY_CODE}  |  companyId: ${companyId}
  Đăng nhập: ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD}

  Đã tạo:
  - 3 xe, 6 nhân viên (2 lái xe, phụ xe, 2 KD, kế toán)
  - 2 dòng salary_configs (tài xế A/B: lương/chuyến + % doanh thu)
  - 3 khách hàng
  - 10 chuyến trong ${SEED_MONTH.label} (completed / assigned / in_progress / cancelled)
  - Công nợ: phải thu theo từng chuyến + 1 khoản phải thu lẻ + 2 khoản phải trả NCC
  - Thu chi: doanh thu chuyến (auto) + FUEL, REPAIR, SALARY
  - Hoa hồng (commissions) cho các chuyến completed có doanh thu

  Gợi ý API kiểm tra:
  - Báo cáo lương: fromDate=${SEED_MONTH.fromDate} & toDate=${SEED_MONTH.toDate}
  - Hoa hồng NV: period=${SEED_MONTH.label} (nếu có endpoint theo tháng)
`);

  await app.close();
  process.exit(0);
}

// Chỉ tự chạy khi gọi trực tiếp (npm run seed:test) — tránh side-effect khi file khác import IDS/SEED_COMPANY_CODE
if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Lỗi:', e);
    process.exit(1);
  });
}
