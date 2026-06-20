import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Vehicle } from '../../entities/vehicle.entity';
import { Employee } from '../../entities/employee.entity';
import { Customer } from '../../entities/customer.entity';
import { Trip } from '../../entities/trip.entity';

export interface ImportResult {
  success: number;
  failed: number;
  errors: { row: number; field: string; message: string }[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Trip) private tripRepo: Repository<Trip>,
  ) {}

  async importExcel(
    type: 'vehicles' | 'employees' | 'customers' | 'trips',
    buffer: Buffer,
    companyId: string,
  ): Promise<ImportResult> {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Remove header row
    const dataRows = rows.slice(1).filter((r) => r.some((c) => c != null));

    switch (type) {
      case 'vehicles': return this.importVehicles(dataRows, companyId);
      case 'employees': return this.importEmployees(dataRows, companyId);
      case 'customers': return this.importCustomers(dataRows, companyId);
      case 'trips': return this.importTrips(dataRows, companyId);
    }
  }

  // ---------------------------------------------------------------------------
  // Vehicles
  // Col: Biển số xe*, Loại xe, Hãng xe, Model, Năm SX, Tải trọng (tấn), Trạng thái
  // ---------------------------------------------------------------------------
  private async importVehicles(rows: any[][], companyId: string): Promise<ImportResult> {
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const [licensePlate, vehicleType, brand, model, year, capacity, status] = rows[i];

      if (!licensePlate) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Biển số xe', message: 'Biển số xe không được để trống' });
        continue;
      }

      try {
        const existing = await this.vehicleRepo.findOne({
          where: { companyId, licensePlate: String(licensePlate).trim() },
        });

        if (existing) {
          // Update
          if (vehicleType) existing.vehicleType = String(vehicleType).trim();
          if (brand) existing.brand = String(brand).trim();
          if (model) existing.model = String(model).trim();
          if (year) existing.year = Number(year);
          if (capacity) existing.capacity = Number(capacity);
          if (status) existing.status = String(status).trim();
          await this.vehicleRepo.save(existing);
        } else {
          await this.vehicleRepo.save(
            this.vehicleRepo.create({
              companyId,
              licensePlate: String(licensePlate).trim(),
              vehicleType: vehicleType ? String(vehicleType).trim() : undefined,
              brand: brand ? String(brand).trim() : undefined,
              model: model ? String(model).trim() : undefined,
              year: year ? Number(year) : undefined,
              capacity: capacity ? Number(capacity) : undefined,
              status: status ? String(status).trim() : 'active',
            }),
          );
        }
        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'general', message: (err as Error).message });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Employees
  // Col: Mã NV, Họ tên*, SĐT, Email, Lương cơ bản, Chức vụ, Số GPLX, Hạng GPLX, Trạng thái
  // ---------------------------------------------------------------------------
  private async importEmployees(rows: any[][], companyId: string): Promise<ImportResult> {
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const [employeeCode, fullName, phone, email, baseSalary, position, licenseNumber, licenseType, status] = rows[i];

      if (!fullName) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Họ tên', message: 'Họ tên không được để trống' });
        continue;
      }

      try {
        // Upsert by employeeCode if provided, else by fullName+phone
        let existing: Employee | null = null;
        if (employeeCode) {
          existing = await this.employeeRepo.findOne({
            where: { companyId, employeeCode: String(employeeCode).trim() },
          });
        }

        if (existing) {
          existing.fullName = String(fullName).trim();
          if (phone) existing.phone = String(phone).trim();
          if (email) existing.email = String(email).trim();
          if (baseSalary != null) existing.baseSalary = Number(baseSalary);
          if (position) existing.position = String(position).trim();
          if (licenseNumber) existing.licenseNumber = String(licenseNumber).trim();
          if (licenseType) existing.licenseType = String(licenseType).trim();
          if (status) existing.status = String(status).trim();
          await this.employeeRepo.save(existing);
        } else {
          await this.employeeRepo.save(
            this.employeeRepo.create({
              companyId,
              employeeCode: employeeCode ? String(employeeCode).trim() : undefined,
              fullName: String(fullName).trim(),
              phone: phone ? String(phone).trim() : undefined,
              email: email ? String(email).trim() : undefined,
              baseSalary: baseSalary != null ? Number(baseSalary) : 0,
              position: position ? String(position).trim() : undefined,
              licenseNumber: licenseNumber ? String(licenseNumber).trim() : undefined,
              licenseType: licenseType ? String(licenseType).trim() : undefined,
              status: status ? String(status).trim() : 'active',
            }),
          );
        }
        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'general', message: (err as Error).message });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Customers
  // Col: Mã KH, Tên*, SĐT, Email, Địa chỉ, MST, Người LH, Hoa hồng (%), Trạng thái
  // ---------------------------------------------------------------------------
  private async importCustomers(rows: any[][], companyId: string): Promise<ImportResult> {
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const [customerCode, name, phone, email, address, taxCode, contactPerson, commissionRate, status] = rows[i];

      if (!name) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Tên khách hàng', message: 'Tên không được để trống' });
        continue;
      }

      try {
        let existing: Customer | null = null;
        if (customerCode) {
          existing = await this.customerRepo.findOne({
            where: { companyId, customerCode: String(customerCode).trim() },
          });
        }

        if (existing) {
          existing.name = String(name).trim();
          if (phone) existing.phone = String(phone).trim();
          if (email) existing.email = String(email).trim();
          if (address) existing.address = String(address).trim();
          if (taxCode) existing.taxCode = String(taxCode).trim();
          if (contactPerson) existing.contactPerson = String(contactPerson).trim();
          if (commissionRate != null) existing.commissionRate = Number(commissionRate);
          if (status) existing.status = String(status).trim();
          await this.customerRepo.save(existing);
        } else {
          await this.customerRepo.save(
            this.customerRepo.create({
              companyId,
              customerCode: customerCode ? String(customerCode).trim() : undefined,
              name: String(name).trim(),
              phone: phone ? String(phone).trim() : undefined,
              email: email ? String(email).trim() : undefined,
              address: address ? String(address).trim() : undefined,
              taxCode: taxCode ? String(taxCode).trim() : undefined,
              contactPerson: contactPerson ? String(contactPerson).trim() : undefined,
              commissionRate: commissionRate != null ? Number(commissionRate) : 0,
              status: status ? String(status).trim() : 'active',
            }),
          );
        }
        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'general', message: (err as Error).message });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Trips
  // Col: Mã chuyến, Ngày*, Biển số xe*, Tài xế*, Khách hàng*,
  //      Tuyến đường, Doanh thu, Đã thanh toán,
  //      Phí cầu đường, Vé cổng, Tiền phạt, Tiền dầu, Sửa chữa,
  //      CP khác, Ghi chú CP, Ca (day/night), Phụ cấp phụ xe, Trạng thái, Ghi chú
  // ---------------------------------------------------------------------------
  private async importTrips(rows: any[][], companyId: string): Promise<ImportResult> {
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    // Cache vehicles, employees, customers to reduce DB queries
    const vehicles = await this.vehicleRepo.find({ where: { companyId } });
    const employees = await this.employeeRepo.find({ where: { companyId } });
    const customers = await this.customerRepo.find({ where: { companyId } });

    const findVehicle = (val: string) => {
      const v = String(val).trim().toLowerCase();
      return vehicles.find(
        (x) => x.licensePlate.toLowerCase() === v,
      );
    };

    const findEmployee = (val: string) => {
      const v = String(val).trim().toLowerCase();
      return employees.find(
        (x) =>
          x.fullName.toLowerCase() === v ||
          (x.employeeCode && x.employeeCode.toLowerCase() === v),
      );
    };

    const findCustomer = (val: string) => {
      const v = String(val).trim().toLowerCase();
      return customers.find(
        (x) =>
          x.name.toLowerCase() === v ||
          (x.customerCode && x.customerCode.toLowerCase() === v),
      );
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const [
        tripCode, tripDate, licensePlate, driverVal, customerVal,
        address, revenue, paidAmount,
        tollCost, ticketCost, fineCost, fuelCost, repairCost,
        otherCosts, otherCostsNote, driverShift, assistantAllowance, status, notes,
      ] = rows[i];

      // Validate required
      if (!tripDate) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Ngày', message: 'Ngày không được để trống' });
        continue;
      }
      if (!licensePlate) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Biển số xe', message: 'Biển số xe không được để trống' });
        continue;
      }
      if (!driverVal) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Tài xế', message: 'Tài xế không được để trống' });
        continue;
      }
      if (!customerVal) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Khách hàng', message: 'Khách hàng không được để trống' });
        continue;
      }

      const vehicle = findVehicle(String(licensePlate));
      if (!vehicle) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Biển số xe', message: `Không tìm thấy xe: ${licensePlate}` });
        continue;
      }

      const driver = findEmployee(String(driverVal));
      if (!driver) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Tài xế', message: `Không tìm thấy tài xế: ${driverVal}` });
        continue;
      }

      const customer = findCustomer(String(customerVal));
      if (!customer) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'Khách hàng', message: `Không tìm thấy khách hàng: ${customerVal}` });
        continue;
      }

      // Parse date — supports Date object, DD/MM/YYYY, YYYY-MM-DD
      let parsedDate: Date;
      if (tripDate instanceof Date) {
        parsedDate = tripDate;
      } else {
        const str = String(tripDate).trim();
        let d: Date;
        // DD/MM/YYYY
        const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
          d = new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`);
        } else {
          d = new Date(str);
        }
        if (isNaN(d.getTime())) {
          result.failed++;
          result.errors.push({ row: rowNum, field: 'Ngày', message: `Ngày không hợp lệ: ${tripDate}` });
          continue;
        }
        parsedDate = d;
      }

      try {
        // Check duplicate by tripCode
        if (tripCode) {
          const existing = await this.tripRepo.findOne({
            where: { companyId, tripCode: String(tripCode).trim() },
          });
          if (existing) {
            result.failed++;
            result.errors.push({ row: rowNum, field: 'Mã chuyến', message: `Mã chuyến đã tồn tại: ${tripCode}` });
            continue;
          }
        }

        const shift = String(driverShift || 'day').toLowerCase().startsWith('n') ? 'night' : 'day';
        const rev = revenue != null ? Number(revenue) : 0;
        const paid = paidAmount != null ? Number(paidAmount) : 0;
        const toll = tollCost != null ? Number(tollCost) : 0;
        const ticket = ticketCost != null ? Number(ticketCost) : 0;
        const fine = fineCost != null ? Number(fineCost) : 0;
        const fuel = fuelCost != null ? Number(fuelCost) : 0;
        const repair = repairCost != null ? Number(repairCost) : 0;
        const other = otherCosts != null ? Number(otherCosts) : 0;
        const assistantAllowanceNum = assistantAllowance != null ? Number(assistantAllowance) : 0;

        await this.tripRepo.save(
          this.tripRepo.create({
            companyId,
            tripCode: tripCode ? String(tripCode).trim() : undefined,
            tripDate: parsedDate,
            vehicleId: vehicle.id,
            driverId: driver.id,
            customerId: customer.id,
            address: address ? String(address).trim() : undefined,
            revenue: rev,
            paidAmount: paid,
            tollCost: toll,
            ticketCost: ticket,
            fineCost: fine,
            fuelCost: fuel,
            repairCost: repair,
            otherCosts: other,
            otherCostsNote: otherCostsNote ? String(otherCostsNote).trim() : undefined,
            driverShift: shift,
            assistantAllowance: assistantAllowanceNum,
            status: status ? String(status).trim() : 'completed',
            notes: notes ? String(notes).trim() : undefined,
          }),
        );
        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push({ row: rowNum, field: 'general', message: (err as Error).message });
      }
    }

    return result;
  }
}
