import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, QueryFailedError, In } from 'typeorm';
import { Trip } from '../../entities/trip.entity';
import { Vehicle } from '../../entities/vehicle.entity';
import { Employee } from '../../entities/employee.entity';
import { Commission } from '../../entities/commission.entity';
import { Debt } from '../../entities/debt.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { QueryTripDto } from './dto/query-trip.dto';
import { DebtsService } from '../debts/debts.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
    @InjectRepository(Debt)
    private debtRepository: Repository<Debt>,
    private debtsService: DebtsService,
    private transactionsService: TransactionsService,
  ) {}

  async create(companyId: string, createTripDto: CreateTripDto) {
    const {
      price,
      route,
      paidAmount,
      commissionRateApplied,
      revenue,
      otherCosts,
      otherCostsNote,
      notes,
      contactEmployeeId,
      managerId,
      driverShift,
      assistantAllowance,
      coDriverId,
      tripCode: explicitTripCode,
      ...rest
    } = createTripDto;

    if (contactEmployeeId) {
      await this.assertEmployeeInCompany(
        companyId,
        contactEmployeeId,
        'Người liên hệ hoa hồng',
      );
    }
    if (managerId) {
      await this.assertEmployeeInCompany(companyId, managerId, 'Quản lý');
    }
    if (coDriverId) {
      await this.assertEmployeeInCompany(companyId, coDriverId, 'Phụ xe');
      if (createTripDto.driverId && coDriverId === createTripDto.driverId) {
        throw new BadRequestException('Phụ xe không được trùng tài xế');
      }
    }

    const revenueVal = revenue ?? price ?? 0;
    const otherCostsVal = Number(otherCosts ?? 0);
    const notesVal = notes ?? route;

    const trip = this.tripRepository.create({
      ...rest,
      coDriverId: coDriverId ?? null,
      revenue: revenueVal,
      otherCosts: otherCostsVal,
      otherCostsNote: otherCostsNote ?? null,
      notes: notesVal,
      paidAmount: paidAmount ?? 0,
      contactEmployeeId: contactEmployeeId ?? null,
      managerId: managerId ?? null,
      commissionRateApplied:
        commissionRateApplied != null ? commissionRateApplied : null,
      companyId,
      driverShift: this.normalizeDriverShift(driverShift),
      assistantAllowance: coDriverId
        ? Number(assistantAllowance ?? 0)
        : 0,
    });

    if (!coDriverId) {
      trip.assistantSalary = 0;
    }

    // Default status: NEW or ASSIGNED if vehicle + driver provided
    if (trip.vehicleId && trip.driverId) {
      trip.status = 'assigned';
    } else {
      trip.status = 'new';
    }

    const tripDateForCode = this.parseTripDateOnly(rest.tripDate as string);
    const trimmedCode = explicitTripCode?.trim();
    if (trimmedCode) {
      const exists = await this.tripRepository.exist({
        where: { companyId, tripCode: trimmedCode },
      });
      if (exists) {
        throw new BadRequestException('Mã chuyến đã tồn tại');
      }
      trip.tripCode = trimmedCode;
    } else {
      trip.tripCode = await this.generateNextTripCode(companyId, tripDateForCode);
    }

    if (trip.driverId) {
      await this.applyDriverSalaryFromEmployee(companyId, trip, trip.driverId);
    }
    if (trip.coDriverId) {
      await this.applyAssistantSalaryFromEmployee(
        companyId,
        trip,
        trip.coDriverId,
      );
    }

    // Calculate profit
    trip.profit = trip.calculateProfit();

    const saved = await this.saveTripWithTripCodeRetry(
      trip,
      companyId,
      tripDateForCode,
      Boolean(trimmedCode),
    );
    await this.debtsService.createReceivableFromTrip(companyId, saved);
    return saved;
  }

  /** Parse YYYY-MM-DD (or ISO) — dùng ngày theo lịch, tránh lệch timezone */
  private parseTripDateOnly(tripDate: string): Date {
    const [y, m, d] = tripDate
      .split('T')[0]
      .split('-')
      .map((v) => parseInt(v, 10));
    return new Date(y, m - 1, d);
  }

  /** Chuỗi YYYY-MM-DD để so khớp cột `date` trong DB (tránh lệch UTC vs local với `new Date('YYYY-MM-DD')`). */
  private tripDateToYmd(tripDate: Date | string): string {
    if (typeof tripDate === 'string') {
      return tripDate.split('T')[0];
    }
    const y = tripDate.getFullYear();
    const m = String(tripDate.getMonth() + 1).padStart(2, '0');
    const day = String(tripDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Mã tự sinh: TRIP-YYYYMMDD-0001, 0002... (theo company + ngày chuyến).
   * Trùng hiếm khi concurrent — saveTripWithTripCodeRetry xử lý retry.
   */
  private async generateNextTripCode(
    companyId: string,
    tripDate: Date,
  ): Promise<string> {
    const y = tripDate.getFullYear();
    const m = String(tripDate.getMonth() + 1).padStart(2, '0');
    const d = String(tripDate.getDate()).padStart(2, '0');
    const prefix = `TRIP-${y}${m}${d}-`;

    const last = await this.tripRepository.findOne({
      where: {
        companyId,
        tripCode: Like(`${prefix}%`),
      },
      order: { tripCode: 'DESC' },
    });

    let seq = 1;
    if (last?.tripCode?.startsWith(prefix)) {
      const suffix = last.tripCode.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private isPostgresUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }

  private async saveTripWithTripCodeRetry(
    trip: Trip,
    companyId: string,
    tripDateForCode: Date,
    usedExplicitCode: boolean,
  ): Promise<Trip> {
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.tripRepository.save(trip);
      } catch (err) {
        if (
          !usedExplicitCode &&
          this.isPostgresUniqueViolation(err) &&
          attempt < maxAttempts - 1
        ) {
          trip.tripCode = await this.generateNextTripCode(
            companyId,
            tripDateForCode,
          );
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('Không thể tạo mã chuyến duy nhất');
  }

  async findAll(companyId: string, query: QueryTripDto) {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      vehicleId,
      driverId,
      customerId,
      status,
      search,
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.driver', 'driver')
      .leftJoinAndSelect('trip.coDriver', 'coDriver')
      .leftJoinAndSelect('trip.customer', 'customer')
      .leftJoinAndSelect('trip.manager', 'manager')
      .leftJoinAndSelect('trip.contactEmployee', 'contactEmployee')
      .where('trip.companyId = :companyId', { companyId });

    if (startDate && endDate) {
      queryBuilder.andWhere('trip.tripDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.andWhere('trip.tripDate >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('trip.tripDate <= :endDate', { endDate });
    }

    if (vehicleId) {
      queryBuilder.andWhere('trip.vehicleId = :vehicleId', { vehicleId });
    }

    if (driverId) {
      queryBuilder.andWhere('trip.driverId = :driverId', { driverId });
    }

    if (customerId) {
      queryBuilder.andWhere('trip.customerId = :customerId', { customerId });
    }

    if (status) {
      queryBuilder.andWhere('trip.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        '(trip.tripCode ILIKE :search OR trip.address ILIKE :search OR trip.notes ILIKE :search OR customer.name ILIKE :search OR driver.fullName ILIKE :search OR vehicle.licensePlate ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy('trip.tripDate', 'DESC');

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const tripIds = data.map((t) => t.id);
    const debtMap = new Map<string, Debt>();
    if (tripIds.length) {
      const debts = await this.debtRepository.find({
        where: { companyId, tripId: In(tripIds) },
      });
      for (const d of debts) {
        debtMap.set(d.tripId, d);
      }
    }

    const rows = data.map((trip) => this.enrichTripListItem(trip, debtMap));

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Trường phẳng + alias phục vụ bảng danh sách chuyến (FE) */
  private enrichTripListItem(trip: Trip, debtMap: Map<string, Debt>) {
    const debt = debtMap.get(trip.id);
    const debtRemaining =
      debt != null
        ? Number(debt.remaining)
        : Math.max(
            0,
            Number(trip.revenue ?? 0) - Number(trip.paidAmount ?? 0),
          );
    return {
      ...trip,
      price: Number(trip.revenue ?? 0),
      debtRemaining,
      customerName: trip.customer?.name ?? null,
      managerName: trip.manager?.fullName ?? null,
      commissionContactName: trip.contactEmployee?.fullName ?? null,
    };
  }

  private readonly tripDetailRelations = [
    'vehicle',
    'driver',
    'coDriver',
    'customer',
    'manager',
    'contactEmployee',
  ] as const;

  /** Entity gốc (dùng nội bộ: save, cập nhật trạng thái) */
  private async findTripEntity(companyId: string, id: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id, companyId },
      relations: [...this.tripDetailRelations],
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  async findOne(companyId: string, id: string) {
    const trip = await this.findTripEntity(companyId, id);
    const debt = await this.debtRepository.findOne({
      where: { companyId, tripId: trip.id },
    });
    const debtMap = new Map<string, Debt>();
    if (debt) debtMap.set(trip.id, debt);
    return this.enrichTripListItem(trip, debtMap);
  }

  async update(companyId: string, id: string, updateTripDto: UpdateTripDto) {
    const trip = await this.findTripEntity(companyId, id);

    if (trip.status === 'completed') {
      throw new BadRequestException('Completed trip cannot be edited');
    }

    const effectiveTripDate =
      updateTripDto.tripDate != null
        ? this.parseTripDateOnly(
            typeof updateTripDto.tripDate === 'string'
              ? updateTripDto.tripDate
              : String(updateTripDto.tripDate),
          )
        : trip.tripDate;

    if (updateTripDto.vehicleId) {
      await this.assertVehicleAssignable(
        companyId,
        updateTripDto.vehicleId,
        effectiveTripDate,
        trip.id,
      );
    }

    if (updateTripDto.driverId) {
      await this.assertDriverAssignable(
        companyId,
        updateTripDto.driverId,
        effectiveTripDate,
        trip.id,
      );
    }

    const {
      price,
      route,
      paidAmount,
      commissionRateApplied,
      contactEmployeeId,
      managerId,
      revenue,
      otherCosts,
      otherCostsNote,
      notes,
      tripDate: tripDateInput,
      driverShift,
      assistantAllowance,
      coDriverId,
      ...rest
    } = updateTripDto;

    if (contactEmployeeId !== undefined) {
      if (contactEmployeeId) {
        await this.assertEmployeeInCompany(
          companyId,
          contactEmployeeId,
          'Người liên hệ hoa hồng',
        );
      }
      trip.contactEmployeeId = contactEmployeeId;
    }

    if (managerId !== undefined && managerId !== null) {
      await this.assertEmployeeInCompany(companyId, managerId, 'Quản lý');
    }

    Object.assign(trip, rest);

    if (tripDateInput !== undefined && tripDateInput !== null) {
      trip.tripDate = this.parseTripDateOnly(
        typeof tripDateInput === 'string'
          ? tripDateInput
          : String(tripDateInput),
      );
    }

    if (revenue !== undefined) {
      trip.revenue = revenue;
    } else if (price !== undefined) {
      trip.revenue = price;
    }

    if (otherCosts !== undefined) {
      trip.otherCosts = Number(otherCosts);
    }

    if (otherCostsNote !== undefined) {
      trip.otherCostsNote = otherCostsNote;
    }

    if (notes !== undefined) {
      trip.notes = notes;
    } else if (route !== undefined) {
      trip.notes = route;
    }

    if (paidAmount !== undefined) {
      trip.paidAmount = paidAmount;
    }
    if (managerId !== undefined) {
      trip.managerId = managerId;
    }
    if (commissionRateApplied !== undefined) {
      trip.commissionRateApplied = commissionRateApplied;
    }

    if (driverShift !== undefined) {
      trip.driverShift = this.normalizeDriverShift(driverShift);
    }

    // Recalculate driverSalary nếu tài xế hoặc bất kỳ field tài chính nào thay đổi
    const financialFieldsChanged =
      updateTripDto.driverId !== undefined ||
      revenue !== undefined ||
      price !== undefined ||
      updateTripDto.tollCost !== undefined ||
      (updateTripDto as any).ticketCost !== undefined ||
      (updateTripDto as any).fineCost !== undefined ||
      otherCosts !== undefined ||
      assistantAllowance !== undefined ||
      commissionRateApplied !== undefined ||
      driverShift !== undefined;

    if (financialFieldsChanged && trip.driverId) {
      await this.applyDriverSalaryFromEmployee(companyId, trip, trip.driverId);
    }

    if (coDriverId !== undefined) {
      if (coDriverId) {
        await this.assertEmployeeInCompany(companyId, coDriverId, 'Phụ xe');
        if (trip.driverId && coDriverId === trip.driverId) {
          throw new BadRequestException('Phụ xe không được trùng tài xế');
        }
        trip.coDriverId = coDriverId;
        await this.applyAssistantSalaryFromEmployee(companyId, trip, coDriverId);
      } else {
        trip.coDriverId = null;
        trip.assistantSalary = 0;
        trip.assistantAllowance = 0;
      }
    }

    if (assistantAllowance !== undefined) {
      trip.assistantAllowance = trip.coDriverId ? Number(assistantAllowance) : 0;
    }

    if (trip.driverId && trip.coDriverId && trip.driverId === trip.coDriverId) {
      throw new BadRequestException('Tài xế không được trùng phụ xe');
    }

    // Recalculate profit
    trip.profit = trip.calculateProfit();

    const saved = await this.tripRepository.save(trip);
    await this.debtsService.syncReceivableFromTrip(companyId, saved);
    return saved;
  }

  /**
   * Tính lương tài xế theo công thức:
   *   netBase = revenue - tollCost - ticketCost - fineCost - otherCosts
   *             - assistantAllowance - contactCommission
   *   driverSalary = netBase × (ca đêm ? 15% : 10%)
   */
  private calculateDriverSalary(trip: Trip): number {
    const rate = trip.driverShift === 'night' ? 0.15 : 0.10;
    const contactCommission =
      trip.commissionRateApplied != null
        ? (Number(trip.revenue) * Number(trip.commissionRateApplied)) / 100
        : 0;
    const netBase =
      Number(trip.revenue ?? 0) -
      Number(trip.tollCost ?? 0) -
      Number(trip.ticketCost ?? 0) -
      Number(trip.fineCost ?? 0) -
      Number(trip.otherCosts ?? 0) -
      Number(trip.assistantAllowance ?? 0) -
      contactCommission;
    return Math.max(0, netBase) * rate;
  }

  /**
   * Lương trừ trên chuyến — tính theo % doanh thu ròng.
   * Không nhận từ FE — chỉ đồng bộ khi có `driverId`.
   */
  private async applyDriverSalaryFromEmployee(
    companyId: string,
    trip: Trip,
    driverId: string,
  ): Promise<void> {
    const driver = await this.employeeRepository.findOne({
      where: { id: driverId, companyId },
      select: ['id'],
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    trip.driverSalary = this.calculateDriverSalary(trip);
  }

  /** Ca ngày / ca đêm — ảnh hưởng % tài xế trên net (dashboard xe: 10% / 15%) */
  private normalizeDriverShift(raw?: string | null): 'day' | 'night' {
    const s = String(raw ?? 'day').toLowerCase();
    return s === 'night' ? 'night' : 'day';
  }

  /**
   * Lương phụ xe trên chuyến = `baseSalary` của NV phụ xe (giống cách gán lương tài xế).
   * Không nhận từ FE.
   */
  private async applyAssistantSalaryFromEmployee(
    companyId: string,
    trip: Trip,
    coDriverId: string,
  ): Promise<void> {
    const emp = await this.employeeRepository.findOne({
      where: { id: coDriverId, companyId },
      select: ['id', 'baseSalary'],
    });
    if (!emp) {
      throw new NotFoundException('Phụ xe không tồn tại');
    }
    trip.assistantSalary = Number(emp.baseSalary ?? 0);
  }

  async assignVehicle(companyId: string, tripId: string, vehicleId: string) {
    const trip = await this.findTripEntity(companyId, tripId);
    await this.assertVehicleAssignable(
      companyId,
      vehicleId,
      trip.tripDate,
      trip.id,
    );
    trip.vehicleId = vehicleId;
    if (trip.driverId && trip.status === 'new') {
      trip.status = 'assigned';
    }
    return await this.tripRepository.save(trip);
  }

  async assign(
    companyId: string,
    tripId: string,
    vehicleId: string,
    driverId: string,
  ) {
    const trip = await this.findTripEntity(companyId, tripId);
    await this.assertVehicleAssignable(
      companyId,
      vehicleId,
      trip.tripDate,
      trip.id,
    );
    await this.assertDriverAssignable(
      companyId,
      driverId,
      trip.tripDate,
      trip.id,
    );
    trip.vehicleId = vehicleId;
    trip.driverId = driverId;
    await this.applyDriverSalaryFromEmployee(companyId, trip, driverId);
    trip.profit = trip.calculateProfit();
    if (trip.status === 'new') {
      trip.status = 'assigned';
    }
    return await this.tripRepository.save(trip);
  }

  async remove(companyId: string, id: string) {
    const trip = await this.findTripEntity(companyId, id);
    if (trip.status !== 'new') {
      throw new BadRequestException('Only NEW trips can be deleted');
    }
    trip.status = 'cancelled';
    return await this.tripRepository.save(trip);
  }

  /** Chuẩn hóa status cũ (vd: DB default `pending`) cho luồng new → assigned → … */
  private normalizeTripStatusForFlow(raw: string | undefined): string {
    const s = String(raw ?? '').toLowerCase();
    if (s === 'pending') return 'new';
    return s;
  }

  async updateStatus(companyId: string, id: string, nextStatus: string) {
    const trip = await this.findTripEntity(companyId, id);
    const current = this.normalizeTripStatusForFlow(trip.status);

    const to = nextStatus.toLowerCase();

    const allowed =
      (current === 'new' && to === 'assigned') ||
      (current === 'assigned' && to === 'in_progress') ||
      (current === 'assigned' && to === 'completed') ||
      (current === 'in_progress' && to === 'completed') ||
      to === 'cancelled';

    if (!allowed) {
      throw new BadRequestException('Invalid status transition');
    }

    if (to === 'in_progress' || to === 'completed') {
      if (!trip.vehicleId || !trip.driverId) {
        throw new BadRequestException('Vehicle and driver must be assigned first');
      }
    }

    trip.status = to;
    const saved = await this.tripRepository.save(trip);

    if (current !== 'completed' && to === 'completed') {
      const fullTrip = await this.findTripEntity(companyId, saved.id);
      await this.createCommissionIfEligible(fullTrip);
      await this.transactionsService.createIncomeFromCompletedTripIfAbsent(
        companyId,
        fullTrip,
      );
    }

    return saved;
  }

  /**
   * `trip.tripDate` từ DB có thể là `Date` hoặc chuỗi (pg driver / raw) — cần trước khi gọi getFullYear.
   */
  private coerceTripDateToDate(value: Date | string): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === 'string') {
      return this.parseTripDateOnly(value.split('T')[0]);
    }
    return new Date(String(value));
  }

  private toPeriod(tripDate: Date | string) {
    const d = this.coerceTripDateToDate(tripDate);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private async createCommissionIfEligible(trip: Trip) {
    // Avoid duplicates (e.g., repeated calls)
    const exists = await this.commissionRepository.findOne({
      where: { tripId: trip.id },
      select: ['id'],
    });
    if (exists) return;

    const customer = trip.customer;
    const employeeId =
      trip.contactEmployeeId || customer?.contactEmployeeId;
    if (!employeeId) return;

    const rate =
      trip.commissionRateApplied != null
        ? Number(trip.commissionRateApplied)
        : Number(customer?.commissionRate || 0);
    if (!rate || rate <= 0) return;

    const revenueBase = Number(trip.revenue || 0);
    const amount = (revenueBase * rate) / 100;

    if (amount <= 0) return;

    const tripDateNorm = this.coerceTripDateToDate(trip.tripDate as Date | string);

    const commission = this.commissionRepository.create({
      companyId: trip.companyId,
      employeeId,
      customerId: trip.customerId,
      tripId: trip.id,
      tripDate: tripDateNorm,
      period: this.toPeriod(trip.tripDate as Date | string),
      revenueBase,
      commissionRate: rate,
      amount,
    });
    await this.commissionRepository.save(commission);
  }

  async getStats(companyId: string, startDate?: string, endDate?: string) {
    const queryBuilder = this.tripRepository
      .createQueryBuilder('trip')
      .where('trip.companyId = :companyId', { companyId })
      .andWhere('trip.status = :status', { status: 'completed' });

    if (startDate && endDate) {
      queryBuilder.andWhere('trip.tripDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const trips = await queryBuilder.getMany();

    const totalTrips = trips.length;
    const totalRevenue = trips.reduce((sum, t) => sum + Number(t.revenue), 0);
    const totalCosts = trips.reduce(
      (sum, t) =>
        sum +
        Number(t.fuelCost) +
        Number(t.tollCost) +
        Number(t.driverSalary) +
        Number(t.otherCosts),
      0,
    );
    const totalProfit = trips.reduce((sum, t) => sum + Number(t.profit), 0);

    return {
      totalTrips,
      completedTrips: totalTrips,
      totalRevenue,
      totalCosts,
      totalProfit,
      averageProfitPerTrip: totalTrips > 0 ? totalProfit / totalTrips : 0,
    };
  }

  private async assertVehicleAssignable(
    companyId: string,
    vehicleId: string,
    tripDate: Date,
    excludeTripId?: string,
  ) {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id: vehicleId, companyId },
      select: ['id', 'status'],
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.status !== 'active') {
      throw new BadRequestException('Vehicle is not active');
    }

    const ymd = this.tripDateToYmd(tripDate);

    // Dùng tên cột DB (snake_case) + CAST ngày — tránh lệch so khớp khiến bản ghi hiện tại
    // không bị loại trừ đúng và báo trùng xe/tài sai khi PATCH trip.
    const qb = this.tripRepository
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere('t.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('t.trip_date = CAST(:ymd AS date)', { ymd })
      .andWhere('t.status != :cancelled', { cancelled: 'cancelled' });

    if (excludeTripId) {
      qb.andWhere('t.id <> :excludeId', { excludeId: excludeTripId });
    }

    const overlapping = await qb.getOne();

    if (overlapping) {
      throw new BadRequestException('Vehicle is already assigned for this date');
    }
  }

  private async assertEmployeeInCompany(
    companyId: string,
    employeeId: string,
    label: string,
  ) {
    const emp = await this.employeeRepository.findOne({
      where: { id: employeeId, companyId },
      select: ['id'],
    });
    if (!emp) {
      throw new NotFoundException(`${label}: nhân viên không tồn tại`);
    }
  }

  private async assertDriverAssignable(
    companyId: string,
    driverId: string,
    tripDate: Date,
    excludeTripId?: string,
  ) {
    const driver = await this.employeeRepository.findOne({
      where: { id: driverId, companyId },
      select: ['id', 'status', 'position'],
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status !== 'active') {
      throw new BadRequestException('Driver is not active');
    }

    if (driver.position !== 'lái xe') {
      throw new BadRequestException('Employee is not a driver');
    }

    const ymd = this.tripDateToYmd(tripDate);

    const qb = this.tripRepository
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere('t.driver_id = :driverId', { driverId })
      .andWhere('t.trip_date = CAST(:ymd AS date)', { ymd })
      .andWhere('t.status != :cancelled', { cancelled: 'cancelled' });

    if (excludeTripId) {
      qb.andWhere('t.id <> :excludeId', { excludeId: excludeTripId });
    }

    const overlapping = await qb.getOne();

    if (overlapping) {
      throw new BadRequestException('Driver is already assigned for this date');
    }
  }
}
