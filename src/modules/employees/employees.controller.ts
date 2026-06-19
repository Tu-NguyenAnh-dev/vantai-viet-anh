import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import {
  QueryEmployeeTripsDto,
  QueryEmployeeSalaryHistoryDto,
  QueryEmployeeIncomeDto,
} from './dto/query-employee-history.dto';
import { EmployeeDetailQueryDto } from './dto/employee-detail-query.dto';
import {
  CreateSalaryAdvanceDto,
  UpdateSalaryAdvanceDto,
} from './dto/salary-advance.dto';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyId } from '../../common/decorators/company-id.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  async create(
    @CompanyId() companyId: string,
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    const data = await this.employeesService.create(companyId, createEmployeeDto);
    return { success: true, data };
  }

  @Get()
  async findAll(@CompanyId() companyId: string, @Query() query: QueryEmployeeDto) {
    const result = await this.employeesService.findAll(companyId, query);
    return { success: true, ...result };
  }

  @Get('drivers')
  async getDrivers(
    @CompanyId() companyId: string,
    @Query('search') search?: string,
  ) {
    const data = await this.employeesService.getDrivers(companyId, search);
    return { success: true, data };
  }

  /** Trước @Get(':id') — chi tiết + lịch sử chuyến + bảng lương theo tháng */
  @Get(':id/detail')
  async getDetail(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: EmployeeDetailQueryDto,
  ) {
    const data = await this.employeesService.getEmployeeDetail(
      companyId,
      id,
      query.fromMonth,
      query.toMonth,
    );
    return { success: true, data };
  }

  @Post(':id/salary-advances')
  async createSalaryAdvance(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CreateSalaryAdvanceDto,
  ) {
    const data = await this.employeesService.createSalaryAdvance(
      companyId,
      id,
      dto,
    );
    return { success: true, data };
  }

  @Patch(':id/salary-advances/:advanceId')
  async updateSalaryAdvance(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('advanceId') advanceId: string,
    @Body() dto: UpdateSalaryAdvanceDto,
  ) {
    const data = await this.employeesService.updateSalaryAdvance(
      companyId,
      id,
      advanceId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(':id/salary-advances/:advanceId')
  async removeSalaryAdvance(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('advanceId') advanceId: string,
  ) {
    const data = await this.employeesService.removeSalaryAdvance(
      companyId,
      id,
      advanceId,
    );
    return { success: true, data };
  }

  @Post(':id/absences')
  async createAbsence(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CreateAbsenceDto,
  ) {
    const data = await this.employeesService.createAbsence(companyId, id, dto);
    return { success: true, data };
  }

  @Delete(':id/absences/:absenceId')
  async removeAbsence(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('absenceId') absenceId: string,
  ) {
    const data = await this.employeesService.removeAbsence(
      companyId,
      id,
      absenceId,
    );
    return { success: true, data };
  }

  @Get(':id/trips')
  async getTrips(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: QueryEmployeeTripsDto,
  ) {
    const result = await this.employeesService.getTripHistory(
      companyId,
      id,
      query,
    );
    return { success: true, ...result };
  }

  @Get(':id/salaries')
  async getSalaries(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: QueryEmployeeSalaryHistoryDto,
  ) {
    const data = await this.employeesService.getSalaryHistory(
      companyId,
      id,
      query,
    );
    return { success: true, data };
  }

  @Get(':id/income')
  async getIncome(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: QueryEmployeeIncomeDto,
  ) {
    const data = await this.employeesService.getIncome(companyId, id, query);
    return { success: true, data };
  }

  @Get(':id/commissions')
  async getCommissions(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query('start') start?: string, // YYYY-MM
    @Query('end') end?: string, // YYYY-MM
  ) {
    const data = await this.employeesService.getCommissionByMonth(
      companyId,
      id,
      start,
      end,
    );
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@CompanyId() companyId: string, @Param('id') id: string) {
    const data = await this.employeesService.findOne(companyId, id);
    return { success: true, data };
  }

  @Patch(':id')
  async update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const data = await this.employeesService.update(
      companyId,
      id,
      updateEmployeeDto,
    );
    return { success: true, data };
  }

  @Delete(':id')
  async remove(@CompanyId() companyId: string, @Param('id') id: string) {
    await this.employeesService.remove(companyId, id);
    return { success: true, message: 'Employee deleted successfully' };
  }
}
