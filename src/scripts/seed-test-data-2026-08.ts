/**
 * Seed thêm dữ liệu demo tháng 8/2026 vào company TEST_SEED đã có (không tạo company/xe/NV/KH mới).
 * Đi qua các service thật (TripsService/EmployeesService/VehiclesService) để field tính toán
 * (driverSalary, assistantSalary, profit, debt status, commission...) đúng y hệt production,
 * và tự kích hoạt side-effect (debt/transaction/commission) qua đúng luồng thật.
 *
 * Yêu cầu: đã chạy `npm run seed:test` trước đó (company TEST_SEED tồn tại).
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/seed-test-data-2026-08.ts
 * Idempotent theo tháng: nếu đã có tripCode `TRIP-202608...` thì bỏ qua, không tạo trùng.
 */
import { NestFactory } from '@nestjs/core';
import { DataSource, Like } from 'typeorm';
import { AppModule } from '../app.module';
import { Company } from '../entities/company.entity';
import { Trip } from '../entities/trip.entity';
import { TripsService } from '../modules/trips/trips.service';
import { EmployeesService } from '../modules/employees/employees.service';
import { VehiclesService } from '../modules/vehicles/vehicles.service';
import { DebtsService } from '../modules/debts/debts.service';
import { TransactionsService } from '../modules/transactions/transactions.service';
import { SEED_COMPANY_CODE, IDS } from './seed-test-data';

const MONTH_PREFIX = 'TRIP-202608';

type TripPlan = {
  tripDate: string;
  vehicleId?: string;
  driverId?: string;
  coDriverId?: string;
  assistantAllowance?: number;
  customerId: string;
  contactEmployeeId?: string;
  commissionRateApplied?: number;
  driverShift?: 'day' | 'night';
  revenue: number;
  tollCost?: number;
  ticketCost?: number;
  fineCost?: number;
  otherCosts?: number;
  otherCostsNote?: string;
  paidAmount: number;
  address: string;
  /** Cột mới (migration 2026-08-10) — chưa có trong CreateTripDto, chỉ set được qua service trực tiếp như seed này */
  repairCost?: number;
  /** Trạng thái cuối cùng muốn đạt tới sau khi create() (mặc định: new/assigned tuỳ có gán xe+tài xế) */
  finalStatus?: 'new' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
};

const TRIP_PLANS: TripPlan[] = [
  {
    // Hoàn thành, đã qua hạn thanh toán 1 phần → demo debt OVERDUE
    tripDate: '2026-08-02',
    vehicleId: IDS.v1,
    driverId: IDS.d1,
    customerId: IDS.c1,
    contactEmployeeId: IDS.s1,
    revenue: 13_000_000,
    tollCost: 250_000,
    paidAmount: 5_000_000,
    address: 'TP.HCM → Bình Dương',
    finalStatus: 'completed',
  },
  {
    // Ca đêm (15%) + ticket/fine cost + đã trả đủ → demo debt PAID
    tripDate: '2026-08-03',
    vehicleId: IDS.v2,
    driverId: IDS.d2,
    customerId: IDS.c2,
    contactEmployeeId: IDS.s2,
    commissionRateApplied: 2.5,
    driverShift: 'night',
    revenue: 9_500_000,
    tollCost: 180_000,
    ticketCost: 50_000,
    fineCost: 100_000,
    paidAmount: 9_500_000,
    address: 'Hà Nội → Hải Phòng (chuyến đêm)',
    finalStatus: 'completed',
  },
  {
    // Có phụ xe → demo assistantSalary/assistantAllowance tự tính, chưa thu tiền + quá hạn → OVERDUE
    tripDate: '2026-08-05',
    vehicleId: IDS.v1,
    driverId: IDS.d1,
    coDriverId: IDS.co,
    assistantAllowance: 300_000,
    customerId: IDS.c1,
    contactEmployeeId: IDS.s1,
    revenue: 14_000_000,
    tollCost: 300_000,
    paidAmount: 0,
    address: 'Biên Hòa → Vũng Tàu',
    finalStatus: 'completed',
  },
  {
    // Huỷ chuyến (revenue = 0 để không để lại công nợ ảo)
    tripDate: '2026-08-06',
    vehicleId: IDS.v2,
    driverId: IDS.d2,
    customerId: IDS.c2,
    revenue: 0,
    paidAmount: 0,
    address: 'Huỷ — khách đổi lịch',
    finalStatus: 'cancelled',
  },
  {
    // Đang chạy (in_progress) — demo trip còn sửa được (chưa completed)
    tripDate: '2026-08-08',
    vehicleId: IDS.v1,
    driverId: IDS.d2,
    customerId: IDS.c3,
    revenue: 11_000_000,
    tollCost: 220_000,
    paidAmount: 3_000_000,
    address: 'Cần Thơ → An Giang',
    finalStatus: 'in_progress',
  },
  {
    // Đã gán xe+tài xế nhưng chưa chạy — demo trip để client tự thao tác chuyển trạng thái live
    tripDate: '2026-08-10',
    vehicleId: IDS.v2,
    driverId: IDS.d1,
    customerId: IDS.c1,
    revenue: 7_500_000,
    paidAmount: 0,
    address: 'Đà Nẵng → Huế',
    finalStatus: 'assigned',
  },
  {
    // Chưa gán xe/tài xế (status new) — demo trip để client tự "gán" live
    tripDate: '2026-08-12',
    customerId: IDS.c2,
    revenue: 6_000_000,
    paidAmount: 0,
    address: 'Báo giá — chờ điều phối',
    finalStatus: 'new',
  },
  {
    // Có repairCost (cột mới nhất, hiện thị trên VehicleDetailPage) + đã trả đủ
    tripDate: '2026-08-14',
    vehicleId: IDS.v1,
    driverId: IDS.d1,
    customerId: IDS.c1,
    contactEmployeeId: IDS.s1,
    revenue: 16_000_000,
    tollCost: 350_000,
    repairCost: 1_500_000,
    paidAmount: 16_000_000,
    address: 'TP.HCM → Cần Thơ',
    finalStatus: 'completed',
  },
  {
    // Trả một phần → demo debt UNPAID (chưa quá hạn khi seed cùng ngày với hôm nay)
    tripDate: '2026-08-16',
    vehicleId: IDS.v2,
    driverId: IDS.d2,
    customerId: IDS.c3,
    revenue: 10_500_000,
    tollCost: 200_000,
    paidAmount: 4_000_000,
    address: 'Hải Phòng → Lạng Sơn',
    finalStatus: 'completed',
  },
  {
    // Chuyến "hôm nay" — có phụ xe, chưa thu tiền, dueDate = hôm nay nên UNPAID chứ không OVERDUE
    tripDate: '2026-08-18',
    vehicleId: IDS.v1,
    driverId: IDS.d2,
    coDriverId: IDS.co,
    assistantAllowance: 350_000,
    customerId: IDS.c1,
    contactEmployeeId: IDS.s1,
    revenue: 18_000_000,
    tollCost: 400_000,
    ticketCost: 100_000,
    paidAmount: 0,
    address: 'TP.HCM → Đà Lạt',
    finalStatus: 'completed',
  },
];

async function seedTrip(tripsService: TripsService, companyId: string, plan: TripPlan) {
  const created = await tripsService.create(companyId, {
    tripDate: plan.tripDate,
    vehicleId: plan.vehicleId,
    driverId: plan.driverId,
    coDriverId: plan.coDriverId,
    assistantAllowance: plan.assistantAllowance,
    customerId: plan.customerId,
    contactEmployeeId: plan.contactEmployeeId,
    commissionRateApplied: plan.commissionRateApplied ?? null,
    driverShift: plan.driverShift,
    revenue: plan.revenue,
    tollCost: plan.tollCost,
    ticketCost: plan.ticketCost,
    fineCost: plan.fineCost,
    otherCosts: plan.otherCosts,
    otherCostsNote: plan.otherCostsNote,
    paidAmount: plan.paidAmount,
    address: plan.address,
    notes: `Seed 2026-08 — ${plan.address}`,
    // repairCost: cột entity đã có nhưng CreateTripDto chưa whitelist — chỉ set được qua service trực tiếp như đây
    ...(plan.repairCost != null ? { repairCost: plan.repairCost } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const status = plan.finalStatus ?? created.status;
  if (status === 'in_progress') {
    await tripsService.updateStatus(companyId, created.id, 'in_progress');
  } else if (status === 'completed') {
    if (created.status === 'assigned') {
      await tripsService.updateStatus(companyId, created.id, 'completed');
    }
  } else if (status === 'cancelled') {
    await tripsService.updateStatus(companyId, created.id, 'cancelled');
  }
  return created.id;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const ds = app.get(DataSource);
  const companyRepo = ds.getRepository(Company);
  const tripRepo = ds.getRepository(Trip);
  const tripsService = app.get(TripsService);
  const employeesService = app.get(EmployeesService);
  const vehiclesService = app.get(VehiclesService);
  const debtsService = app.get(DebtsService);
  const transactionsService = app.get(TransactionsService);

  const company = await companyRepo.findOne({ where: { code: SEED_COMPANY_CODE } });
  if (!company) {
    // eslint-disable-next-line no-console
    console.error(
      `[seed-08] Không tìm thấy company "${SEED_COMPANY_CODE}". Chạy \`npm run seed:test\` trước.`,
    );
    await app.close();
    process.exit(1);
  }
  const companyId = company!.id;

  const alreadySeeded = await tripRepo.count({
    where: { companyId, tripCode: Like(`${MONTH_PREFIX}%`) },
  });
  if (alreadySeeded > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[seed-08] Đã có ${alreadySeeded} chuyến "${MONTH_PREFIX}*" trong company này. Bỏ qua (idempotent theo tháng).`,
    );
    await app.close();
    process.exit(0);
  }

  // ---- Trips (qua TripsService thật — tự tạo debt/transaction/commission kèm theo) ----
  for (const plan of TRIP_PLANS) {
    await seedTrip(tripsService, companyId, plan);
  }

  // ---- Bảo trì xe qua đúng flow: set maintenanceCost khi xe đang ở status=maintenance
  //      (v3 đã ở trạng thái maintenance từ seed tháng 3) → tự sinh transaction REPAIR liên kết ----
  await vehiclesService.update(companyId, IDS.v3, { maintenanceCost: 4_500_000 });

  // ---- Nghỉ phép tài xế A: 2 ngày đầu miễn trừ, ngày thứ 3 trừ lương (baseSalary/26) ----
  await employeesService.createAbsence(companyId, IDS.d1, {
    absenceDate: '2026-08-04',
    note: 'Nghỉ việc gia đình',
  });
  await employeesService.createAbsence(companyId, IDS.d1, {
    absenceDate: '2026-08-09',
    note: 'Nghỉ ốm',
  });
  await employeesService.createAbsence(companyId, IDS.d1, {
    absenceDate: '2026-08-15',
    note: 'Nghỉ phép cá nhân (ngày thứ 3 trong tháng — bị trừ lương)',
  });

  // ---- Ứng lương thật (employee_salary_advances) — không phải transaction giả như seed tháng 3 ----
  await employeesService.createSalaryAdvance(companyId, IDS.d1, {
    advanceDate: '2026-08-10',
    amount: 1_500_000,
    note: 'Ứng lương sửa xe cá nhân',
  });
  await employeesService.createSalaryAdvance(companyId, IDS.d2, {
    advanceDate: '2026-08-06',
    amount: 2_000_000,
    note: 'Ứng lương giữa tháng',
  });

  // ---- Công nợ phải trả NCC + phải thu lẻ (không gắn trip) ----
  await debtsService.create(companyId, {
    type: 'PAYABLE',
    supplierId: IDS.sup1,
    amount: 15_000_000,
    paidAmount: 6_000_000,
    dueDate: '2026-08-25',
    note: 'Seed: công nợ xăng dầu tháng 8',
  });
  await debtsService.create(companyId, {
    type: 'PAYABLE',
    supplierId: IDS.sup2,
    amount: 5_000_000,
    paidAmount: 0,
    dueDate: '2026-08-10',
    note: 'Seed: phụ tùng thay thế (quá hạn)',
  });
  await debtsService.create(companyId, {
    type: 'RECEIVABLE',
    customerId: IDS.c3,
    amount: 2_500_000,
    paidAmount: 0,
    dueDate: '2026-08-20',
    note: 'Seed: phí bốc xếp tháng 8 (không gắn trip)',
  });

  // ---- Thu chi thủ công bổ sung ----
  await transactionsService.create(companyId, {
    transactionDate: '2026-08-04',
    transactionType: 'EXPENSE',
    category: 'FUEL',
    amount: 2_500_000,
    vehicleId: IDS.v1,
    description: 'Seed: đổ dầu đầu tháng 8',
    status: 'completed',
  });
  await transactionsService.create(companyId, {
    transactionDate: '2026-08-11',
    transactionType: 'EXPENSE',
    category: 'FUEL',
    amount: 1_900_000,
    vehicleId: IDS.v2,
    description: 'Seed: chi xăng cao tốc',
    status: 'completed',
  });
  await transactionsService.create(companyId, {
    transactionDate: '2026-08-27',
    transactionType: 'EXPENSE',
    category: 'SALARY',
    amount: 42_000_000,
    employeeId: IDS.office,
    description: 'Seed: chi lương nhân sự tháng 2026-08 (tổng hợp)',
    status: 'completed',
  });

  // eslint-disable-next-line no-console
  console.log(`
[seed-08] Hoàn tất dữ liệu tháng 2026-08 cho company ${SEED_COMPANY_CODE} (companyId=${companyId})

  Đã tạo:
  - 10 chuyến TRIP-202608-xxxx: đủ 5 trạng thái (new/assigned/in_progress/completed/cancelled),
    có ca đêm, ticket/fine/repair cost, phụ xe (assistantSalary/assistantAllowance tự tính)
  - Bảo trì xe 51C-SEED03: maintenanceCost → tự sinh transaction REPAIR liên kết
  - 3 ngày nghỉ tài xế A (2 miễn trừ + 1 bị trừ lương) — employee_absences thật
  - 2 khoản ứng lương — employee_salary_advances thật (không phải transaction giả)
  - Công nợ: 2 phải trả NCC (1 quá hạn) + 1 phải thu lẻ + phải thu theo từng chuyến (đủ PAID/UNPAID/OVERDUE)
  - Thu chi: FUEL x2 + SALARY tổng hợp (REPAIR tự sinh từ bảo trì xe ở trên)
  - Hoa hồng tự sinh cho các chuyến completed có doanh thu (qua TripsService thật)

  LƯU Ý — không seed được:
  - Excel Import (2 pipeline) cần file .xlsx upload thật, không có đường tạo qua service
  - RBAC nhiều role: theo yêu cầu, không tạo thêm user demo — chỉ có 1 tài khoản admin sẵn có

  Kiểm tra API: fromDate=2026-08-01 & toDate=2026-08-31 (báo cáo lương / thu chi / công nợ)
`);

  await app.close();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed-08] Lỗi:', e);
  process.exit(1);
});
