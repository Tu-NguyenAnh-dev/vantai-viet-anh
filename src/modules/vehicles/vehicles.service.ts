import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Vehicle } from '../../entities/vehicle.entity';
import { Trip } from '../../entities/trip.entity';
import { Transaction } from '../../entities/transaction.entity';
import { Commission } from '../../entities/commission.entity';
import { Debt } from '../../entities/debt.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { QueryVehicleTripsDto } from './dto/query-vehicle-trips.dto';
import { QueryVehicleRepairsDto } from './dto/query-vehicle-repairs.dto';
import {
  CreateVehicleExpenseDto,
  UpdateVehicleExpenseDto,
} from './dto/vehicle-expense-transaction.dto';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
    @InjectRepository(Debt)
    private debtRepository: Repository<Debt>,
    private transactionsService: TransactionsService,
  ) {}

  async create(companyId: string, createVehicleDto: CreateVehicleDto) {
    const {
      plateNumber,
      type,
      licensePlate: lp,
      vehicleType: vt,
      status: st,
      ...rest
    } = createVehicleDto;

    const licensePlate = (lp ?? plateNumber)?.trim();
    if (!licensePlate) {
      throw new BadRequestException('Cần licensePlate hoặc plateNumber');
    }

    const vehicleType = vt ?? type;
    let status = st as string | undefined;
    if (status && typeof status === 'string') {
      const u = status.toUpperCase();
      if (u === 'ACTIVE') status = 'active';
      else if (u === 'INACTIVE') status = 'inactive';
      else if (u === 'MAINTENANCE') status = 'maintenance';
    }

    const vehicle = this.vehicleRepository.create({
      ...rest,
      licensePlate,
      vehicleType,
      status: status ?? 'active',
      companyId,
    });
    const saved = await this.vehicleRepository.save(vehicle);
    await this.syncMaintenanceTransaction(companyId, saved);
    return saved;
  }

  async findAll(companyId: string, query: QueryVehicleDto) {
    const {
      page = 1,
      limit,
      pageSize,
      search,
      status,
      vehicleType,
      sort,
      sortOrder,
      metricsMonth,
    } = query;
    const take = limit ?? pageSize ?? 20;
    const skip = (page - 1) * take;

    const queryBuilder = this.vehicleRepository
      .createQueryBuilder('vehicle')
      .where('vehicle.companyId = :companyId', { companyId });

    if (search) {
      queryBuilder.andWhere(
        '(vehicle.licensePlate ILIKE :search OR vehicle.brand ILIKE :search OR vehicle.model ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('vehicle.status = :status', { status });
    }

    if (vehicleType) {
      queryBuilder.andWhere('vehicle.vehicleType = :vehicleType', {
        vehicleType,
      });
    }

    if (sort === 'status') {
      const ord = String(sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      queryBuilder.orderBy('vehicle.status', ord);
    } else {
      queryBuilder.orderBy('vehicle.licensePlate', 'ASC');
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(take)
      .getManyAndCount();

    let rows = data;
    if (
      metricsMonth &&
      /^\d{4}-\d{2}$/.test(metricsMonth.trim())
    ) {
      const [y, m] = metricsMonth.split('-').map((x) => parseInt(x, 10));
      const pad = (n: number) => String(n).padStart(2, '0');
      const fromDate = `${y}-${pad(m)}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const toDate = `${y}-${pad(m)}-${pad(lastDay)}`;
      rows = await Promise.all(
        data.map(async (v) => {
          const d = await this.getVehicleDetail(
            companyId,
            v.id,
            fromDate,
            toDate,
          );
          const s = d.summary;
          const monthlyExpense =
            s.driverPercentCost +
            s.assistantSalary +
            s.assistantAllowance +
            s.commissionContact +
            s.fuelCost +
            s.repairCost +
            s.tollCost +
            s.ticketCost +
            s.fineCost +
            s.otherCosts;
          return {
            ...v,
            monthlyRevenue: s.revenue,
            monthlyExpense,
            profit: s.profit,
          } as Vehicle & {
            monthlyRevenue: number;
            monthlyExpense: number;
            profit: number;
          };
        }),
      );
    }

    return {
      data: rows,
      pagination: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findOne(companyId: string, id: string) {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id, companyId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return vehicle;
  }

  async update(companyId: string, id: string, updateVehicleDto: UpdateVehicleDto) {
    const vehicle = await this.findOne(companyId, id);
    const {
      plateNumber,
      type,
      licensePlate: lp,
      vehicleType: vt,
      status: st,
      ...rest
    } = updateVehicleDto;

    Object.assign(vehicle, rest);

    if (lp !== undefined || plateNumber !== undefined) {
      const next = (lp ?? plateNumber)?.trim();
      if (next) vehicle.licensePlate = next;
    }
    if (vt !== undefined || type !== undefined) {
      vehicle.vehicleType = vt ?? type;
    }
    if (st !== undefined && st !== null) {
      let status = st as string;
      const u = status.toUpperCase();
      if (u === 'ACTIVE') vehicle.status = 'active';
      else if (u === 'INACTIVE') vehicle.status = 'inactive';
      else if (u === 'MAINTENANCE') vehicle.status = 'maintenance';
      else vehicle.status = status;
    }

    if (updateVehicleDto.maintenanceCost !== undefined) {
      vehicle.maintenanceCost = updateVehicleDto.maintenanceCost;
    }

    const saved = await this.vehicleRepository.save(vehicle);
    await this.syncMaintenanceTransaction(companyId, saved);
    return saved;
  }

  /**
   * Đồng bộ giao dịch thu chi: khi xe status=maintenance và maintenanceCost > 0,
   * tạo/cập nhật transaction EXPENSE REPAIR để tracking thu chi.
   */
  private async syncMaintenanceTransaction(
    companyId: string,
    vehicle: Vehicle,
  ): Promise<void> {
    const cost = Number(vehicle.maintenanceCost ?? 0);
    const isMaintenance = vehicle.status === 'maintenance';

    if (!isMaintenance) {
      const oldTxId = vehicle.maintenanceTransactionId;
      vehicle.maintenanceCost = null;
      vehicle.maintenanceTransactionId = null;
      await this.vehicleRepository.save(vehicle);
      if (oldTxId) {
        const tx = await this.transactionRepository.findOne({
          where: { id: oldTxId, companyId },
        });
        if (tx) {
          tx.status = 'cancelled';
          await this.transactionRepository.save(tx);
        }
      }
      return;
    }

    if (cost <= 0) {
      if (vehicle.maintenanceTransactionId) {
        const tx = await this.transactionRepository.findOne({
          where: { id: vehicle.maintenanceTransactionId, companyId },
        });
        if (tx) {
          tx.status = 'cancelled';
          await this.transactionRepository.save(tx);
        }
        vehicle.maintenanceTransactionId = null;
        vehicle.maintenanceCost = null;
        await this.vehicleRepository.save(vehicle);
      }
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const desc = `Chi phí bảo trì xe ${vehicle.licensePlate}`;

    if (vehicle.maintenanceTransactionId) {
      const tx = await this.transactionRepository.findOne({
        where: { id: vehicle.maintenanceTransactionId, companyId },
      });
      if (tx) {
        tx.amount = cost;
        await this.transactionRepository.save(tx);
        return;
      }
    }

    try {
      const created = await this.transactionsService.create(companyId, {
        transactionDate: today,
        transactionType: 'EXPENSE',
        category: 'REPAIR',
        amount: cost,
        vehicleId: vehicle.id,
        description: desc,
        status: 'completed',
      });
      vehicle.maintenanceTransactionId = created.id;
      await this.vehicleRepository.save(vehicle);
    } catch (e) {
      this.logger.warn(
        `Không tạo giao dịch bảo trì cho xe ${vehicle.id}: ${(e as Error).message}`,
      );
    }
  }

  async remove(companyId: string, id: string) {
    const vehicle = await this.findOne(companyId, id);
    vehicle.status = 'inactive';
    return await this.vehicleRepository.save(vehicle);
  }

  async getStats(companyId: string) {
    const [total, active, inactive, maintenance] = await Promise.all([
      this.vehicleRepository.count({ where: { companyId } }),
      this.vehicleRepository.count({
        where: { companyId, status: 'active' },
      }),
      this.vehicleRepository.count({
        where: { companyId, status: 'inactive' },
      }),
      this.vehicleRepository.count({
        where: { companyId, status: 'maintenance' },
      }),
    ]);

    return { total, active, inactive, maintenance };
  }

  async getTripsHistory(
    companyId: string,
    vehicleId: string,
    query: QueryVehicleTripsDto,
  ) {
    await this.findOne(companyId, vehicleId);

    const {
      page = 1,
      limit = 20,
      fromDate,
      toDate,
    } = query;
    const skip = (page - 1) * limit;

    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.driver', 'driver')
      .leftJoinAndSelect('trip.customer', 'customer')
      .where('trip.companyId = :companyId', { companyId })
      .andWhere('trip.vehicleId = :vehicleId', { vehicleId })
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

  /** Chi phí sửa chữa: giao dịch expense gắn xe, category REPAIR / maintenance */
  async getRepairHistory(
    companyId: string,
    vehicleId: string,
    query: QueryVehicleRepairsDto,
  ) {
    await this.findOne(companyId, vehicleId);

    const { fromDate, toDate } = query;

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.vehicleId = :vehicleId', { vehicleId })
      .andWhere('t.transactionType = :exp', { exp: 'expense' })
      .andWhere(
        '(UPPER(TRIM(t.category)) = :re OR LOWER(TRIM(t.category)) IN (:...cats))',
        { re: 'REPAIR', cats: ['repair', 'maintenance'] },
      );

    if (fromDate && toDate) {
      qb.andWhere('t.transactionDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      qb.andWhere('t.transactionDate >= :fromDate', { fromDate });
    } else if (toDate) {
      qb.andWhere('t.transactionDate <= :toDate', { toDate });
    }

    qb.orderBy('t.transactionDate', 'DESC');

    const rows = await qb.getMany();

    return rows.map((txn) => ({
      id: txn.id,
      amount: Number(txn.amount),
      date: txn.transactionDate,
      note: txn.description ?? null,
      category: txn.category,
    }));
  }

  /** Response vehicle: thêm alias plateNumber, type, manufactureYear (không đổi DB) */
  mapVehicleToDetail(v: Vehicle) {
    return {
      ...v,
      plateNumber: v.licensePlate,
      type: v.vehicleType,
      manufactureYear: v.year ?? null,
    };
  }

  async getVehicleDetail(
    companyId: string,
    vehicleId: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const vehicle = await this.findOne(companyId, vehicleId);

    const tripQb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoin('trip.driver', 'driver')
      .leftJoin('trip.customer', 'customer')
      .addSelect(['driver.fullName', 'customer.name'])
      .where('trip.companyId = :companyId', { companyId })
      .andWhere('trip.vehicleId = :vehicleId', { vehicleId })
      .andWhere('trip.status != :cancelled', { cancelled: 'cancelled' });

    if (fromDate && toDate) {
      tripQb.andWhere('trip.tripDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      tripQb.andWhere('trip.tripDate >= :fromDate', { fromDate });
    } else if (toDate) {
      tripQb.andWhere('trip.tripDate <= :toDate', { toDate });
    }

    const trips = await tripQb.orderBy('trip.tripDate', 'DESC').getMany();
    const tripIds = trips.map((t) => t.id);

    const commissionByTrip = new Map<string, number>();
    if (tripIds.length > 0) {
      const comms = await this.commissionRepository.find({
        where: { tripId: In(tripIds) },
        select: ['tripId', 'amount'],
      });
      for (const c of comms) {
        commissionByTrip.set(c.tripId, Number(c.amount ?? 0));
      }
    }

    let revenue = 0;
    let paidAmount = 0;
    let tollCost = 0;
    let ticketCost = 0;
    let fineCost = 0;
    let otherCosts = 0;
    let driverPercentCost = 0;
    let assistantSalary = 0;
    let assistantAllowanceTotal = 0;
    let commissionContact = 0;

    for (const t of trips) {
      const rev = Number(t.revenue ?? 0);
      const paid = Number(t.paidAmount ?? 0);
      const fuelOnTrip = Number(t.fuelCost ?? 0);
      const toll = Number(t.tollCost ?? 0);
      const ticket = Number((t as any).ticketCost ?? 0);
      const fine = Number((t as any).fineCost ?? 0);
      const other = Number(t.otherCosts ?? 0);
      const comm = commissionByTrip.get(t.id) ?? 0;
      const allowance = Number(t.assistantAllowance ?? 0);
      const shift = String(t.driverShift || 'day').toLowerCase() === 'night' ? 'night' : 'day';
      const rate = shift === 'night' ? 0.15 : 0.1;

      revenue += rev;
      paidAmount += paid;
      tollCost += toll;
      ticketCost += ticket;
      fineCost += fine;
      otherCosts += other;
      assistantSalary += Number(t.assistantSalary ?? 0);
      assistantAllowanceTotal += allowance;
      commissionContact += comm;

      /**
       * Lương tài xế = netBase × 10% (ca ngày) / 15% (ca đêm)
       * netBase = revenue - toll - ticket - fine - otherCosts - assistantAllowance - contactCommission
       * (fuelOnTrip ghi qua vehicle expense transaction, không trừ tại đây)
       */
      const netBase = rev - toll - ticket - fine - other - allowance - comm;
      if (netBase > 0) {
        driverPercentCost += netBase * rate;
      }
    }

    const [fuelCost, repairCost] = await Promise.all([
      this.sumVehicleExpenseByCategory(companyId, vehicleId, 'FUEL', fromDate, toDate),
      this.sumVehicleExpenseByCategory(companyId, vehicleId, 'REPAIR', fromDate, toDate),
    ]);

    let debtAmount = 0;
    if (tripIds.length > 0) {
      const debtRow = await this.debtRepository
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.remaining), 0)', 'sum')
        .where('d.companyId = :companyId', { companyId })
        .andWhere('d.tripId IN (:...tripIds)', { tripIds })
        .getRawOne();
      debtAmount = Number(debtRow?.sum ?? 0);
    }

    /**
     * Lợi nhuận thực = Doanh thu
     *   - Chi phí chuyến: cầu, vé, luật, chi phí khác
     *   - Lương tài xế (% net), lương phụ xe, phụ cấp phụ xe
     *   - Hoa hồng liên hệ
     *   - Xăng dầu (expense transaction)
     *   - Sửa chữa (expense transaction)
     */
    const profit =
      revenue -
      tollCost - ticketCost - fineCost - otherCosts -
      driverPercentCost -
      assistantSalary - assistantAllowanceTotal -
      commissionContact -
      fuelCost -
      repairCost;

    const [fuelRows, repairRows, debtRows] = await Promise.all([
      this.listVehicleExpenseTransactions(companyId, vehicleId, 'FUEL', fromDate, toDate),
      this.listVehicleExpenseTransactions(companyId, vehicleId, 'REPAIR', fromDate, toDate),
      tripIds.length
        ? this.debtRepository.find({
            where: { companyId, tripId: In(tripIds) },
            order: { dueDate: 'DESC' },
          })
        : Promise.resolve([]),
    ]);

    return {
      vehicle: this.mapVehicleToDetail(vehicle),
      summary: {
        tripCount: trips.length,
        revenue,
        paidAmount,
        debtAmount,
        tollCost,
        ticketCost,
        fineCost,
        otherCosts,
        driverPercentCost,
        assistantSalary,
        assistantAllowance: assistantAllowanceTotal,
        commissionContact,
        fuelCost,
        repairCost,
        profit,
      },
      operations: {
        trips: trips.map((t) => ({
          id: t.id,
          tripCode: t.tripCode,
          tripDate: t.tripDate,
          address: t.address ?? null,
          revenue: Number(t.revenue ?? 0),
          paidAmount: Number(t.paidAmount ?? 0),
          tollCost: Number(t.tollCost ?? 0),
          ticketCost: Number((t as any).ticketCost ?? 0),
          fineCost: Number((t as any).fineCost ?? 0),
          otherCosts: Number(t.otherCosts ?? 0),
          otherCostsNote: t.otherCostsNote ?? null,
          driverSalary: Number(t.driverSalary ?? 0),
          status: t.status,
          driverId: t.driverId,
          driverName: (t as any).driver?.fullName ?? null,
          customerName: (t as any).customer?.name ?? null,
          driverShift: t.driverShift ?? 'day',
        })),
        fuels: fuelRows,
        repairs: repairRows,
        debts: debtRows,
      },
    };
  }

  private async sumVehicleExpenseByCategory(
    companyId: string,
    vehicleId: string,
    categoryUpper: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<number> {
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.vehicleId = :vehicleId', { vehicleId })
      .andWhere('t.transactionType = :exp', { exp: 'expense' })
      .andWhere('t.status = :st', { st: 'completed' })
      .andWhere('UPPER(TRIM(t.category)) = :cat', { cat: categoryUpper });

    if (fromDate && toDate) {
      qb.andWhere('t.transactionDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      qb.andWhere('t.transactionDate >= :fromDate', { fromDate });
    } else if (toDate) {
      qb.andWhere('t.transactionDate <= :toDate', { toDate });
    }

    const row = await qb.getRawOne();
    return Number(row?.sum ?? 0);
  }

  private async listVehicleExpenseTransactions(
    companyId: string,
    vehicleId: string,
    categoryUpper: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.vehicleId = :vehicleId', { vehicleId })
      .andWhere('t.transactionType = :exp', { exp: 'expense' })
      .andWhere('t.status = :st', { st: 'completed' })
      .andWhere('UPPER(TRIM(t.category)) = :cat', { cat: categoryUpper });

    if (fromDate && toDate) {
      qb.andWhere('t.transactionDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      qb.andWhere('t.transactionDate >= :fromDate', { fromDate });
    } else if (toDate) {
      qb.andWhere('t.transactionDate <= :toDate', { toDate });
    }

    const rows = await qb.orderBy('t.transactionDate', 'DESC').getMany();
    return rows.map((txn) => ({
      id: txn.id,
      amount: Number(txn.amount),
      date: txn.transactionDate,
      note: txn.description ?? null,
      category: txn.category,
    }));
  }

  async createVehicleFuel(
    companyId: string,
    vehicleId: string,
    dto: CreateVehicleExpenseDto,
  ) {
    await this.findOne(companyId, vehicleId);
    return this.transactionsService.create(companyId, {
      transactionDate: dto.transactionDate,
      transactionType: 'EXPENSE',
      category: 'FUEL',
      amount: dto.amount,
      vehicleId,
      description: dto.description ?? dto.note,
      status: 'completed',
    });
  }

  async updateVehicleFuel(
    companyId: string,
    vehicleId: string,
    fuelId: string,
    dto: UpdateVehicleExpenseDto,
  ) {
    await this.findOne(companyId, vehicleId);
    return this.updateVehicleExpenseTx(
      companyId,
      vehicleId,
      fuelId,
      'FUEL',
      dto,
    );
  }

  async deleteVehicleFuel(
    companyId: string,
    vehicleId: string,
    fuelId: string,
  ) {
    await this.findOne(companyId, vehicleId);
    return this.deleteVehicleExpenseTx(companyId, vehicleId, fuelId, 'FUEL');
  }

  async createVehicleRepair(
    companyId: string,
    vehicleId: string,
    dto: CreateVehicleExpenseDto,
  ) {
    await this.findOne(companyId, vehicleId);
    return this.transactionsService.create(companyId, {
      transactionDate: dto.transactionDate,
      transactionType: 'EXPENSE',
      category: 'REPAIR',
      amount: dto.amount,
      vehicleId,
      description: dto.description ?? dto.note,
      status: 'completed',
    });
  }

  async updateVehicleRepair(
    companyId: string,
    vehicleId: string,
    repairId: string,
    dto: UpdateVehicleExpenseDto,
  ) {
    await this.findOne(companyId, vehicleId);
    return this.updateVehicleExpenseTx(
      companyId,
      vehicleId,
      repairId,
      'REPAIR',
      dto,
    );
  }

  async deleteVehicleRepair(
    companyId: string,
    vehicleId: string,
    repairId: string,
  ) {
    await this.findOne(companyId, vehicleId);
    return this.deleteVehicleExpenseTx(companyId, vehicleId, repairId, 'REPAIR');
  }

  private async updateVehicleExpenseTx(
    companyId: string,
    vehicleId: string,
    txId: string,
    categoryUpper: string,
    dto: UpdateVehicleExpenseDto,
  ) {
    const t = await this.transactionRepository.findOne({
      where: { id: txId, companyId },
    });
    if (!t) throw new NotFoundException('Transaction not found');
    if (t.vehicleId !== vehicleId) {
      throw new BadRequestException('Transaction does not belong to this vehicle');
    }
    if (String(t.transactionType).toLowerCase() !== 'expense') {
      throw new BadRequestException('Invalid transaction type');
    }
    if (String(t.category || '').trim().toUpperCase() !== categoryUpper) {
      throw new BadRequestException('Invalid transaction category');
    }
    if (dto.amount != null) {
      if (dto.amount <= 0) throw new BadRequestException('amount phải > 0');
    }
    const merged = {
      transactionDate: dto.transactionDate ?? String(t.transactionDate).split('T')[0],
      transactionType: 'EXPENSE',
      category: categoryUpper,
      amount: dto.amount ?? Number(t.amount),
      description: dto.description ?? dto.note ?? t.description,
      vehicleId,
      status: 'completed',
    };
    return this.transactionsService.update(companyId, txId, merged as any);
  }

  private async deleteVehicleExpenseTx(
    companyId: string,
    vehicleId: string,
    txId: string,
    categoryUpper: string,
  ) {
    const t = await this.transactionRepository.findOne({
      where: { id: txId, companyId },
    });
    if (!t) throw new NotFoundException('Transaction not found');
    if (t.vehicleId !== vehicleId) {
      throw new BadRequestException('Transaction does not belong to this vehicle');
    }
    if (String(t.category || '').trim().toUpperCase() !== categoryUpper) {
      throw new BadRequestException('Invalid transaction category');
    }
    await this.transactionsService.remove(companyId, txId);
    return { success: true };
  }
}
