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
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { QueryVehicleTripsDto } from './dto/query-vehicle-trips.dto';
import { QueryVehicleRepairsDto } from './dto/query-vehicle-repairs.dto';
import { VehicleDetailQueryDto } from './dto/vehicle-detail-query.dto';
import {
  CreateVehicleExpenseDto,
  UpdateVehicleExpenseDto,
} from './dto/vehicle-expense-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyId } from '../../common/decorators/company-id.decorator';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  async create(
    @CompanyId() companyId: string,
    @Body() createVehicleDto: CreateVehicleDto,
  ) {
    const data = await this.vehiclesService.create(companyId, createVehicleDto);
    return { success: true, data };
  }

  @Get()
  async findAll(@CompanyId() companyId: string, @Query() query: QueryVehicleDto) {
    const result = await this.vehiclesService.findAll(companyId, query);
    return { success: true, ...result };
  }

  @Get('stats')
  async getStats(@CompanyId() companyId: string) {
    const data = await this.vehiclesService.getStats(companyId);
    return { success: true, data };
  }

  @Get(':id/detail')
  async getDetail(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: VehicleDetailQueryDto,
  ) {
    const data = await this.vehiclesService.getVehicleDetail(
      companyId,
      id,
      query.fromDate,
      query.toDate,
    );
    return { success: true, data };
  }

  @Get(':id/trips')
  async getTrips(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: QueryVehicleTripsDto,
  ) {
    const result = await this.vehiclesService.getTripsHistory(
      companyId,
      id,
      query,
    );
    return { success: true, ...result };
  }

  @Get(':id/repairs')
  async getRepairs(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Query() query: QueryVehicleRepairsDto,
  ) {
    const data = await this.vehiclesService.getRepairHistory(
      companyId,
      id,
      query,
    );
    return { success: true, data };
  }

  @Post(':id/fuels')
  async createFuel(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CreateVehicleExpenseDto,
  ) {
    const data = await this.vehiclesService.createVehicleFuel(companyId, id, dto);
    return { success: true, data };
  }

  @Patch(':id/fuels/:fuelId')
  async updateFuel(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('fuelId') fuelId: string,
    @Body() dto: UpdateVehicleExpenseDto,
  ) {
    const data = await this.vehiclesService.updateVehicleFuel(
      companyId,
      id,
      fuelId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(':id/fuels/:fuelId')
  async deleteFuel(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('fuelId') fuelId: string,
  ) {
    const data = await this.vehiclesService.deleteVehicleFuel(
      companyId,
      id,
      fuelId,
    );
    return { success: true, data };
  }

  @Post(':id/repairs')
  async createRepairTx(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CreateVehicleExpenseDto,
  ) {
    const data = await this.vehiclesService.createVehicleRepair(companyId, id, dto);
    return { success: true, data };
  }

  @Patch(':id/repairs/:repairId')
  async updateRepairTx(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('repairId') repairId: string,
    @Body() dto: UpdateVehicleExpenseDto,
  ) {
    const data = await this.vehiclesService.updateVehicleRepair(
      companyId,
      id,
      repairId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(':id/repairs/:repairId')
  async deleteRepairTx(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('repairId') repairId: string,
  ) {
    const data = await this.vehiclesService.deleteVehicleRepair(
      companyId,
      id,
      repairId,
    );
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@CompanyId() companyId: string, @Param('id') id: string) {
    const data = await this.vehiclesService.findOne(companyId, id);
    return { success: true, data };
  }

  @Patch(':id')
  async update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    const data = await this.vehiclesService.update(
      companyId,
      id,
      updateVehicleDto,
    );
    return { success: true, data };
  }

  @Delete(':id')
  async remove(@CompanyId() companyId: string, @Param('id') id: string) {
    await this.vehiclesService.remove(companyId, id);
    return { success: true, message: 'Vehicle deleted successfully' };
  }
}
