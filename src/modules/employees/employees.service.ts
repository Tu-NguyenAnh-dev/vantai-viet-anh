import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../../entities/employee.entity';
import { Commission } from '../../entities/commission.entity';
import { Trip } from '../../entities/trip.entity';
import { Transaction } from '../../entities/transaction.entity';
import { EmployeeSalaryAdvance } from '../../entities/employee-salary-advance.entity';
import { EmployeeAbsence } from '../../entities/employee-absence.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import {
  QueryEmployeeTripsDto,
  QueryEmployeeSalaryHistoryDto,
  QueryEmployeeIncomeDto,
} from './dto/query-employee-history.dto';
import { SalariesService } from '../salaries/salaries.service';
import {
  CreateSalaryAdvanceDto,
  UpdateSalaryAdvanceDto,
} from './dto/salary-advance.dto';
import { CreateAbsenceDto } from './dto/create-absence.dto';

/** Số ngày nghỉ không trừ lương trong tháng */
const ALLOWED_REST_DAYS_PER_MONTH = 2;
/** Mẫu số chia lương ngày (quy ước: lương cơ bản / 26) */
const WORK_DAYS_FOR_SALARY_PRORATION = 26;

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(EmployeeSalaryAdvance)
    private salaryAdvanceRepository: Repository<EmployeeSalaryAdvance>,
    @InjectRepository(EmployeeAbsence)
    private absenceRepository: Repository<EmployeeAbsence>,
    private salariesService: SalariesService,
  ) {}

  async create(companyId: string, createEmployeeDto: CreateEmployeeDto) {
    const { name, fullName: fn, baseSalary, ...rest } = createEmployeeDto;
    const fullName = (fn ?? name)?.trim();
    if (!fullName) {
      throw new BadRequestException('Cần fullName hoặc name');
    }

    const employee = this.employeeRepository.create({
      ...rest,
      fullName,
      companyId,
      baseSalary: Number(baseSalary),
    });
    return await this.employeeRepository.save(employee);
  }

  async findAll(companyId: string, query: QueryEmployeeDto) {
    const { page = 1, limit = 20, search, position, status } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.companyId = :companyId', { companyId });

    if (search) {
      queryBuilder.andWhere(
        '(employee.fullName ILIKE :search OR employee.employeeCode ILIKE :search OR employee.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (position) {
      queryBuilder.andWhere('employee.position = :position', { position });
    }

    if (status) {
      queryBuilder.andWhere('employee.status = :status', { status });
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(companyId: string, id: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id, companyId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async update(
    companyId: string,
    id: string,
    updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const employee = await this.findOne(companyId, id);
    const { name, fullName: fn, baseSalary, ...rest } =
      updateEmployeeDto as any;

    if (fn !== undefined || name !== undefined) {
      const next = (fn ?? name)?.trim();
      if (next) employee.fullName = next;
    }

    if (baseSalary !== undefined) {
      employee.baseSalary = Number(baseSalary);
    }

    Object.assign(employee, rest);
    return await this.employeeRepository.save(employee);
  }

  async remove(companyId: string, id: string) {
    const employee = await this.findOne(companyId, id);
    employee.status = 'inactive';
    return await this.employeeRepository.save(employee);
  }

  async getDrivers(companyId: string, search?: string) {
    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.companyId = :companyId', { companyId })
      .andWhere('employee.position = :position', { position: 'lái xe' })
      .andWhere('employee.status = :status', { status: 'active' });

    if (search) {
      queryBuilder.andWhere('employee.fullName ILIKE :search', {
        search: `%${search}%`,
      });
    }

    return await queryBuilder.getMany();
  }

  async getTripHistory(
    companyId: string,
    employeeId: string,
    query: QueryEmployeeTripsDto,
  ) {
    await this.findOne(companyId, employeeId);

    const {
      page = 1,
      limit = 20,
      fromDate,
      toDate,
    } = query;
    const skip = (page - 1) * limit;

    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.customer', 'customer')
      .where('trip.companyId = :companyId', { companyId })
      .andWhere('trip.driverId = :employeeId', { employeeId })
      .andWhere('trip.status != :cancelled', { cancelled: 'cancelled' });

    if (fromDate && toDate) {
      qb.andWhere('trip.tripDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      qb.andWhere('trip.tripDate >= :fromDate', { fromDate });
    } else if (toDate) {
      qb.andWhere('trip.tripDate <= :toDate', { toDate });
    }

    qb.orderBy('trip.tripDate', 'DESC');

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Option A: dynamic (trips + salary_configs) | Option B: transactions category SALARY */
  async getSalaryHistory(
    companyId: string,
    employeeId: string,
    q: QueryEmployeeSalaryHistoryDto,
  ) {
    await this.findOne(companyId, employeeId);
    const { fromDate, toDate, source = 'dynamic' } = q;

    if (source === 'transactions') {
      const qb = this.transactionRepository
        .createQueryBuilder('t')
        .where('t.companyId = :companyId', { companyId })
        .andWhere('t.employeeId = :employeeId', { employeeId })
        .andWhere('t.transactionDate BETWEEN :from AND :to', {
          from: fromDate,
          to: toDate,
        })
        .andWhere('t.transactionType = :exp', { exp: 'expense' })
        .andWhere(
          '(UPPER(TRIM(t.category)) = :s OR LOWER(TRIM(t.category)) IN (:...c))',
          { s: 'SALARY', c: ['salary', 'payroll'] },
        )
        .orderBy('t.transactionDate', 'DESC');

      const rows = await qb.getMany();
      const totalAmount = rows.reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        source: 'transactions',
        fromDate,
        toDate,
        totalAmount,
        items: rows.map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          date: t.transactionDate,
          description: t.description ?? null,
          category: t.category,
        })),
      };
    }

    const data = await this.salariesService.getReport(companyId, {
      fromDate,
      toDate,
      employeeId,
    });

    return { source: 'dynamic', fromDate, toDate, data };
  }

  async getIncome(
    companyId: string,
    employeeId: string,
    q: QueryEmployeeIncomeDto,
  ) {
    await this.findOne(companyId, employeeId);
    const { fromDate, toDate } = q;
    const rows = await this.salariesService.getReport(companyId, {
      fromDate,
      toDate,
      employeeId,
    });
    const row = rows[0];
    return {
      totalTrips: row?.totalTrips ?? 0,
      totalRevenue: row?.totalRevenue ?? 0,
      salary: row?.totalSalary ?? 0,
    };
  }

  async getCommissionByMonth(
    companyId: string,
    employeeId: string,
    start?: string, // YYYY-MM
    end?: string, // YYYY-MM
  ) {
    await this.findOne(companyId, employeeId);

    const qb = this.commissionRepository
      .createQueryBuilder('c')
      .select('c.period', 'period')
      .addSelect('COALESCE(SUM(c.amount), 0)', 'totalAmount')
      .addSelect('COUNT(c.id)', 'totalRecords')
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.employeeId = :employeeId', { employeeId });

    if (start) qb.andWhere('c.period >= :start', { start });
    if (end) qb.andWhere('c.period <= :end', { end });

    const rows = await qb.groupBy('c.period').orderBy('c.period', 'DESC').getRawMany<{
      period: string;
      totalAmount: string;
      totalRecords: string;
    }>();

    return rows.map((r) => ({
      period: r.period,
      totalAmount: parseFloat(r.totalAmount || '0'),
      totalRecords: parseInt(r.totalRecords || '0', 10),
    }));
  }

  /**
   * Chi tiết NV: thông tin + lịch sử chuyến (tài xế) gom theo tháng +
   * bảng lương theo tháng (lương nền + % chuyến − ứng − trừ nghỉ).
   */
  async getEmployeeDetail(
    companyId: string,
    employeeId: string,
    fromMonth?: string,
    toMonth?: string,
  ) {
    const employee = await this.findOne(companyId, employeeId);
    const { from, to } = this.resolveMonthRange(fromMonth, toMonth);
    if (from > to) {
      throw new BadRequestException('fromMonth không được sau toMonth');
    }
    const months = this.enumerateMonths(from, to);
    const rangeStart = `${from}-01`;
    const rangeEnd = this.lastDayOfMonthString(to);

    const trips = await this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.customer', 'customer')
      .where('trip.companyId = :companyId', { companyId })
      .andWhere('trip.driverId = :employeeId', { employeeId })
      .andWhere('trip.status != :cancelled', { cancelled: 'cancelled' })
      .andWhere('trip.tripDate >= :rs', { rs: rangeStart })
      .andWhere('trip.tripDate <= :re', { re: rangeEnd })
      .orderBy('trip.tripDate', 'DESC')
      .getMany();

    const tripIds = trips.map((t) => t.id);
    const commissionByTrip = new Map<string, number>();
    if (tripIds.length) {
      const comms = await this.commissionRepository.find({
        where: { tripId: In(tripIds) },
        select: ['tripId', 'amount'],
      });
      for (const c of comms) {
        commissionByTrip.set(c.tripId, Number(c.amount ?? 0));
      }
    }

    const tripsByMonth = new Map<string, Trip[]>();
    for (const ym of months) tripsByMonth.set(ym, []);
    for (const t of trips) {
      const ym = this.tripDateToYearMonth(t.tripDate);
      if (!tripsByMonth.has(ym)) tripsByMonth.set(ym, []);
      tripsByMonth.get(ym)!.push(t);
    }

    const tripHistoryByMonth = months.map((ym) => ({
      yearMonth: ym,
      trips: (tripsByMonth.get(ym) ?? []).map((t) =>
        this.mapDriverTripDetail(t, commissionByTrip.get(t.id) ?? 0),
      ),
    }));

    const baseSalary = Number(employee.baseSalary ?? 0);
    const dailyRate =
      WORK_DAYS_FOR_SALARY_PRORATION > 0
        ? baseSalary / WORK_DAYS_FOR_SALARY_PRORATION
        : 0;

    const payrollByMonth = await Promise.all(
      months.map(async (ym) => {
        const monthTrips = tripsByMonth.get(ym) ?? [];
        let driverPercentTotal = 0;
        for (const t of monthTrips) {
          driverPercentTotal += this.computeDriverIncentiveForTrip(
            t,
            commissionByTrip.get(t.id) ?? 0,
          );
        }

        const monthStart = `${ym}-01`;
        const monthEnd = this.lastDayOfMonthString(ym);

        const advances = await this.salaryAdvanceRepository
          .createQueryBuilder('a')
          .where('a.companyId = :companyId', { companyId })
          .andWhere('a.employeeId = :employeeId', { employeeId })
          .andWhere('a.advanceDate BETWEEN :ms AND :me', {
            ms: monthStart,
            me: monthEnd,
          })
          .orderBy('a.advanceDate', 'DESC')
          .getMany();

        const advanceTotal = advances.reduce(
          (s, a) => s + Number(a.amount ?? 0),
          0,
        );

        const absenceRows = await this.absenceRepository
          .createQueryBuilder('ab')
          .where('ab.companyId = :companyId', { companyId })
          .andWhere('ab.employeeId = :employeeId', { employeeId })
          .andWhere('ab.absenceDate BETWEEN :ms AND :me', {
            ms: monthStart,
            me: monthEnd,
          })
          .orderBy('ab.absenceDate', 'ASC')
          .getMany();

        const absentCount = absenceRows.length;
        const absenceDates = absenceRows.map((r) => ({
          id: r.id,
          absenceDate: r.absenceDate,
          note: r.note ?? null,
        }));

        const extraAbsentDays = Math.max(
          0,
          absentCount - ALLOWED_REST_DAYS_PER_MONTH,
        );
        const absenceDeduction = extraAbsentDays * dailyRate;

        const totalSalary =
          baseSalary +
          driverPercentTotal -
          advanceTotal -
          absenceDeduction;

        return {
          yearMonth: ym,
          baseSalary,
          driverPercentTotal,
          advances: advances.map((a) => ({
            id: a.id,
            advanceDate: a.advanceDate,
            amount: Number(a.amount),
            note: a.note ?? null,
          })),
          advanceTotal,
          attendance: {
            allowedRestDays: ALLOWED_REST_DAYS_PER_MONTH,
            absentDays: absentCount,
            absenceDates,
            extraAbsentDays,
            workDaysDenominator: WORK_DAYS_FOR_SALARY_PRORATION,
            dailyRateFromBase: dailyRate,
            absenceDeduction,
          },
          totalSalary,
        };
      }),
    );

    return {
      employee,
      tripHistoryByMonth,
      payrollByMonth,
      rules: {
        driverPercent:
          'Ca ngày 10% / ca đêm 15% trên lợi nhuận gộp chuyến (doanh thu − xăng trên chuyến − cầu đường − chi phí khác − hoa hồng contact − phụ cấp phụ xe), giống dashboard xe.',
        absence:
          `${ALLOWED_REST_DAYS_PER_MONTH} ngày nghỉ không trừ; ngày vượt × (lương cơ bản / ${WORK_DAYS_FOR_SALARY_PRORATION}).`,
      },
    };
  }

  async createSalaryAdvance(
    companyId: string,
    employeeId: string,
    dto: CreateSalaryAdvanceDto,
  ) {
    await this.findOne(companyId, employeeId);
    const row = this.salaryAdvanceRepository.create({
      companyId,
      employeeId,
      advanceDate: dto.advanceDate.split('T')[0],
      amount: dto.amount,
      note: dto.note ?? null,
    });
    return this.salaryAdvanceRepository.save(row);
  }

  async updateSalaryAdvance(
    companyId: string,
    employeeId: string,
    advanceId: string,
    dto: UpdateSalaryAdvanceDto,
  ) {
    await this.findOne(companyId, employeeId);
    const row = await this.salaryAdvanceRepository.findOne({
      where: { id: advanceId, companyId, employeeId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy khoản ứng lương');
    if (dto.advanceDate !== undefined) {
      row.advanceDate = dto.advanceDate.split('T')[0];
    }
    if (dto.amount !== undefined) row.amount = dto.amount;
    if (dto.note !== undefined) row.note = dto.note;
    return this.salaryAdvanceRepository.save(row);
  }

  async removeSalaryAdvance(
    companyId: string,
    employeeId: string,
    advanceId: string,
  ) {
    const row = await this.salaryAdvanceRepository.findOne({
      where: { id: advanceId, companyId, employeeId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy khoản ứng lương');
    await this.salaryAdvanceRepository.remove(row);
    return { success: true };
  }

  async createAbsence(
    companyId: string,
    employeeId: string,
    dto: CreateAbsenceDto,
  ) {
    await this.findOne(companyId, employeeId);
    const d = dto.absenceDate.split('T')[0];
    try {
      const row = this.absenceRepository.create({
        companyId,
        employeeId,
        absenceDate: d,
        note: dto.note ?? null,
      });
      return await this.absenceRepository.save(row);
    } catch {
      throw new BadRequestException('Ngày nghỉ đã tồn tại cho nhân viên này');
    }
  }

  async removeAbsence(
    companyId: string,
    employeeId: string,
    absenceId: string,
  ) {
    const row = await this.absenceRepository.findOne({
      where: { id: absenceId, companyId, employeeId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy ngày nghỉ');
    await this.absenceRepository.remove(row);
    return { success: true };
  }

  private mapDriverTripDetail(t: Trip, commissionAmount: number) {
    return {
      id: t.id,
      tripCode: t.tripCode,
      tripDate: t.tripDate,
      address: t.address ?? null,
      notes: t.notes ?? null,
      revenue: Number(t.revenue ?? 0),
      tollCost: Number(t.tollCost ?? 0),
      ticketCost: Number((t as any).ticketCost ?? 0),
      fineCost: Number((t as any).fineCost ?? 0),
      otherCosts: Number(t.otherCosts ?? 0),
      otherCostsNote: t.otherCostsNote ?? null,
      assistantAllowance: Number(t.assistantAllowance ?? 0),
      status: t.status,
      driverShift: t.driverShift ?? 'day',
      vehicle: t.vehicle
        ? { id: t.vehicle.id, licensePlate: t.vehicle.licensePlate }
        : null,
      customer: t.customer
        ? { id: t.customer.id, name: t.customer.name }
        : null,
      driverIncentiveThisTrip: this.computeDriverIncentiveForTrip(
        t,
        commissionAmount,
      ),
    };
  }

  /**
   * Lương % tài xế theo chuyến:
   * netBase = revenue - toll - ticket - fine - otherCosts - assistantAllowance - contactCommission
   * (fuelCost ghi qua vehicle expense transaction, không trừ tại đây)
   */
  private computeDriverIncentiveForTrip(
    trip: Trip,
    commissionTrip: number,
  ): number {
    const rev = Number(trip.revenue ?? 0);
    const toll = Number(trip.tollCost ?? 0);
    const ticket = Number((trip as any).ticketCost ?? 0);
    const fine = Number((trip as any).fineCost ?? 0);
    const other = Number(trip.otherCosts ?? 0);
    const comm = Number(commissionTrip ?? 0);
    const assistantAllowance = Number(trip.assistantAllowance ?? 0);
    const shift =
      String(trip.driverShift || 'day').toLowerCase() === 'night'
        ? 'night'
        : 'day';
    const rate = shift === 'night' ? 0.15 : 0.1;
    const netBase = rev - toll - ticket - fine - other - comm - assistantAllowance;
    if (netBase <= 0) return 0;
    return netBase * rate;
  }

  private tripDateToYearMonth(tripDate: Date | string): string {
    if (typeof tripDate === 'string') {
      return tripDate.split('T')[0].slice(0, 7);
    }
    const y = tripDate.getFullYear();
    const m = String(tripDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private resolveMonthRange(
    fromMonth?: string,
    toMonth?: string,
  ): { from: string; to: string } {
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    /** Không truyền kỳ: mặc định **một tháng hiện tại** (khớp FE chi tiết NV / tránh payload 12 tháng). */
    if (fromMonth == null && toMonth == null) {
      return { from: currentYm, to: currentYm };
    }
    const toDefault = currentYm;
    const fd = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const fromDefault = `${fd.getFullYear()}-${String(fd.getMonth() + 1).padStart(2, '0')}`;
    return {
      from: fromMonth ?? fromDefault,
      to: toMonth ?? toDefault,
    };
  }

  private enumerateMonths(fromYm: string, toYm: string): string[] {
    const out: string[] = [];
    let y = parseInt(fromYm.slice(0, 4), 10);
    let m = parseInt(fromYm.slice(5, 7), 10);
    const endY = parseInt(toYm.slice(0, 4), 10);
    const endM = parseInt(toYm.slice(5, 7), 10);
    while (y < endY || (y === endY && m <= endM)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }

  private lastDayOfMonthString(yearMonth: string): string {
    const y = parseInt(yearMonth.slice(0, 4), 10);
    const mo = parseInt(yearMonth.slice(5, 7), 10);
    const last = new Date(y, mo, 0).getDate();
    return `${yearMonth}-${String(last).padStart(2, '0')}`;
  }
}
