import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import * as moment from 'moment';
import { Vehicle } from '../../entities/vehicle.entity';
import { Employee } from '../../entities/employee.entity';
import { Customer } from '../../entities/customer.entity';
import { DataMapping } from '../../entities/data-mapping.entity';
import { Trip } from '../../entities/trip.entity';
import { DebtsService } from '../debts/debts.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class ExcelService {
  private vehicleCache: Map<string, Vehicle> = new Map();
  private employeeCache: Map<string, Employee> = new Map();
  private customerCache: Map<string, Customer> = new Map();

  constructor(
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(DataMapping)
    private dataMappingRepository: Repository<DataMapping>,
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    private debtsService: DebtsService,
    private transactionsService: TransactionsService,
  ) {}

  async validateExcel(
    companyId: string,
    fileBuffer: Buffer,
    sheetName?: string,
  ) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const targetSheet = sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[targetSheet];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const errors: any[] = [];
    const warnings: any[] = [];
    const preview: any[] = [];

    // Assume header is row 0, data starts from row 1
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      try {
        const parsed = this.parseRow(row);
        const validation = this.validateRow(parsed, i + 1);
        if (validation.errors.length > 0) {
          errors.push(...validation.errors);
        }
        if (validation.warnings.length > 0) {
          warnings.push(...validation.warnings);
        }
        preview.push(parsed);
      } catch (error) {
        errors.push({
          row: i + 1,
          message: error.message,
        });
      }
    }

    return {
      valid: errors.length === 0,
      totalRows: rows.length - 1, // Exclude header
      errors,
      warnings,
      preview,
    };
  }

  async importFromExcel(
    companyId: string,
    fileBuffer: Buffer,
    sheetName?: string,
    overwrite: boolean = false,
  ) {
    // Clear caches
    this.vehicleCache.clear();
    this.employeeCache.clear();
    this.customerCache.clear();

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const targetSheet = sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[targetSheet];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const results = {
      success: [],
      errors: [],
      warnings: [],
    };

    // Process rows (skip header row 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      try {
        // Parse row
        const rowData = this.parseRow(row);

        // Validate
        const validation = this.validateRow(rowData, i + 1);
        if (validation.errors.length > 0) {
          results.errors.push(...validation.errors);
          continue;
        }
        if (validation.warnings.length > 0) {
          results.warnings.push(...validation.warnings);
        }

        // Lookup/Create entities
        const entities = {
          vehicle: await this.lookupOrCreateVehicle(companyId, rowData.licensePlate),
          driver: await this.lookupOrCreateEmployee(
            companyId,
            rowData.driverName,
            'lái xe',
          ),
          coDriver: rowData.coDriverName
            ? await this.lookupOrCreateEmployee(
                companyId,
                rowData.coDriverName,
                'phụ xe',
              )
            : null,
          customer: await this.lookupOrCreateCustomer(companyId, rowData.customerName),
        };

        // Check duplicate
        if (!overwrite) {
          const existing = await this.tripRepository.findOne({
            where: {
              companyId,
              tripCode: rowData.tripCode,
            },
          });

          if (existing) {
            results.errors.push({
              row: i + 1,
              message: `Mã chuyến ${rowData.tripCode} đã tồn tại`,
            });
            continue;
          }
        }

        // Create trip
        const trip = this.tripRepository.create({
          companyId,
          tripCode: rowData.tripCode,
          tripDate: rowData.tripDate,
          vehicleId: entities.vehicle.id,
          driverId: entities.driver.id,
          coDriverId: entities.coDriver?.id,
          customerId: entities.customer.id,
          cargoType: rowData.cargoType,
          cargoWeight: rowData.cargoWeight,
          cargoQuantity: rowData.cargoQuantity,
          address: rowData.address,
          revenue: rowData.revenue,
          fuelCost: rowData.fuelCost,
          tollCost: rowData.tollCost,
          driverSalary: Number(entities.driver.baseSalary ?? 0),
          otherCosts: rowData.otherCosts,
          notes: rowData.notes,
          status: 'completed',
        });

        trip.profit = trip.calculateProfit();
        await this.tripRepository.save(trip);
        await this.debtsService.createReceivableFromTrip(companyId, trip);
        await this.transactionsService.createIncomeFromCompletedTripIfAbsent(
          companyId,
          trip,
        );

        results.success.push({
          row: i + 1,
          tripId: trip.id,
          tripCode: trip.tripCode,
        });
      } catch (error) {
        results.errors.push({
          row: i + 1,
          message: error.message,
        });
      }
    }

    return results;
  }

  /** Nhận `Trip` hoặc bản đã enrich từ `findAll` (có thêm price, debtRemaining, …) */
  async exportToExcel(companyId: string, trips: any[]) {
    const workbook = XLSX.utils.book_new();

    // Header row
    /** Khớp thứ tự `parseRow` (import) — cột A–P; lương lái lấy từ NV khi import, không nhập từ Excel */
    const headers = [
      'Ngày chuyến',
      'Mã chuyến',
      'Biển số xe',
      'Lái xe',
      'Phụ xe',
      'Khách hàng',
      'Địa chỉ chuyến',
      'Loại hàng',
      'Trọng lượng (tấn)',
      'Số lượng',
      'Doanh thu',
      'Chi phí xăng',
      'Chi phí cầu đường',
      'Chi phí khác',
      'Lợi nhuận',
      'Ghi chú',
    ];

    // Data rows
    const data = trips.map((trip) => [
      moment(trip.tripDate).format('DD/MM/YYYY'),
      trip.tripCode || '',
      trip.vehicle?.licensePlate || '',
      trip.driver?.fullName || '',
      trip.coDriver?.fullName || '',
      trip.customer?.name || '',
      trip.address || '',
      trip.cargoType || '',
      trip.cargoWeight || 0,
      trip.cargoQuantity || 0,
      trip.revenue || 0,
      trip.fuelCost || 0,
      trip.tollCost || 0,
      trip.otherCosts || 0,
      trip.profit || 0,
      trip.notes || '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trips');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Helper methods
  private parseRow(row: any[]): any {
    // Assume Excel columns: A=0, B=1, C=2, etc.
    return {
      tripDate: this.parseDate(row[0]),
      tripCode: this.parseString(row[1]),
      licensePlate: this.parseString(row[2]),
      driverName: this.parseString(row[3]),
      coDriverName: this.parseString(row[4]),
      customerName: this.parseString(row[5]),
      address: this.parseString(row[6]),
      cargoType: this.parseString(row[7]),
      cargoWeight: this.parseNumber(row[8]),
      cargoQuantity: this.parseInt(row[9]),
      revenue: this.parseMoney(row[10]),
      fuelCost: this.parseMoney(row[11]),
      tollCost: this.parseMoney(row[12]),
      otherCosts: this.parseMoney(row[13]),
      profit: this.parseMoney(row[14]),
      notes: this.parseString(row[15]),
    };
  }

  private parseDate(dateStr: any): Date {
    if (!dateStr) return null;
    const formats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];
    for (const format of formats) {
      const parsed = moment(dateStr, format, true);
      if (parsed.isValid()) {
        return parsed.toDate();
      }
    }
    // Try default parsing
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  private parseMoney(moneyStr: any): number {
    if (!moneyStr) return 0;
    let cleaned = moneyStr
      .toString()
      .replace(/[₫$€£,\s]/g, '')
      .trim();

    if (cleaned.includes('.')) {
      const parts = cleaned.split('.');
      if (parts.length === 2 && parts[1].length <= 2) {
        cleaned = cleaned.replace('.', '');
      } else {
        cleaned = cleaned.replace(/\./g, '');
      }
    }

    return parseFloat(cleaned) || 0;
  }

  private parseNumber(numStr: any): number {
    if (!numStr) return 0;
    const cleaned = numStr.toString().replace(/[,\s]/g, '');
    return parseFloat(cleaned) || 0;
  }

  private parseInt(numStr: any): number {
    if (!numStr) return 0;
    return parseInt(numStr.toString()) || 0;
  }

  private parseString(str: any): string {
    if (!str) return '';
    return str.toString().trim();
  }

  private validateRow(rowData: any, rowNumber: number): any {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!rowData.tripDate) {
      errors.push({ row: rowNumber, message: 'Thiếu ngày chuyến' });
    }

    if (!rowData.licensePlate) {
      errors.push({ row: rowNumber, message: 'Thiếu biển số xe' });
    }

    if (!rowData.driverName) {
      errors.push({ row: rowNumber, message: 'Thiếu lái xe' });
    }

    if (!rowData.customerName) {
      errors.push({ row: rowNumber, message: 'Thiếu khách hàng' });
    }

    if (!rowData.revenue && rowData.revenue !== 0) {
      warnings.push({ row: rowNumber, message: 'Thiếu doanh thu' });
    }

    return { errors, warnings };
  }

  private normalizeLicensePlate(plate: string): string {
    return plate.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  private async lookupOrCreateVehicle(
    companyId: string,
    licensePlate: string,
  ): Promise<Vehicle> {
    const normalized = this.normalizeLicensePlate(licensePlate);

    // Check cache
    if (this.vehicleCache.has(normalized)) {
      return this.vehicleCache.get(normalized);
    }

    // Lookup in database
    let vehicle = await this.vehicleRepository.findOne({
      where: { companyId, licensePlate: normalized },
    });

    // Check data mappings
    if (!vehicle) {
      const mapping = await this.dataMappingRepository.findOne({
        where: {
          companyId,
          entityType: 'vehicle',
          sourceValue: licensePlate,
        },
      });

      if (mapping) {
        vehicle = await this.vehicleRepository.findOne({
          where: { id: mapping.targetId },
        });
      }
    }

    // Create new if not found
    if (!vehicle) {
      vehicle = this.vehicleRepository.create({
        companyId,
        licensePlate: normalized,
        status: 'active',
      });
      vehicle = await this.vehicleRepository.save(vehicle);
    }

    this.vehicleCache.set(normalized, vehicle);
    return vehicle;
  }

  private async lookupOrCreateEmployee(
    companyId: string,
    fullName: string,
    position: string,
  ): Promise<Employee> {
    const normalized = this.normalizeName(fullName);
    const cacheKey = `${normalized}_${position}`;

    // Check cache
    if (this.employeeCache.has(cacheKey)) {
      return this.employeeCache.get(cacheKey);
    }

    // Fuzzy search
    const employees = await this.employeeRepository.find({
      where: { companyId, position },
    });

    let bestMatch: Employee = null;
    let bestScore = 0;

    for (const emp of employees) {
      const empNormalized = this.normalizeName(emp.fullName);
      const distance = this.levenshteinDistance(normalized, empNormalized);
      const similarity =
        1 - distance / Math.max(normalized.length, empNormalized.length);

      if (similarity > 0.8 && similarity > bestScore) {
        bestMatch = emp;
        bestScore = similarity;
      }
    }

    if (bestMatch) {
      // Create mapping
      await this.dataMappingRepository.upsert(
        {
          companyId,
          entityType: 'employee',
          sourceValue: fullName,
          targetId: bestMatch.id,
          confidenceScore: bestScore,
        },
        ['companyId', 'entityType', 'sourceValue'],
      );

      this.employeeCache.set(cacheKey, bestMatch);
      return bestMatch;
    }

    // Create new
    const employee = this.employeeRepository.create({
      companyId,
      fullName,
      position,
      status: 'active',
    });
    const saved = await this.employeeRepository.save(employee);
    this.employeeCache.set(cacheKey, saved);
    return saved;
  }

  private async lookupOrCreateCustomer(
    companyId: string,
    name: string,
  ): Promise<Customer> {
    const normalized = this.normalizeName(name);

    // Check cache
    if (this.customerCache.has(normalized)) {
      return this.customerCache.get(normalized);
    }

    // Fuzzy search
    const customers = await this.customerRepository.find({
      where: { companyId },
    });

    let bestMatch: Customer = null;
    let bestScore = 0;

    for (const cust of customers) {
      const custNormalized = this.normalizeName(cust.name);
      const distance = this.levenshteinDistance(normalized, custNormalized);
      const similarity =
        1 - distance / Math.max(normalized.length, custNormalized.length);

      if (similarity > 0.8 && similarity > bestScore) {
        bestMatch = cust;
        bestScore = similarity;
      }
    }

    if (bestMatch) {
      await this.dataMappingRepository.upsert(
        {
          companyId,
          entityType: 'customer',
          sourceValue: name,
          targetId: bestMatch.id,
          confidenceScore: bestScore,
        },
        ['companyId', 'entityType', 'sourceValue'],
      );

      this.customerCache.set(normalized, bestMatch);
      return bestMatch;
    }

    // Create new
    const customer = this.customerRepository.create({
      companyId,
      name,
      status: 'active',
    });
    const saved = await this.customerRepository.save(customer);
    this.customerCache.set(normalized, saved);
    return saved;
  }
}
