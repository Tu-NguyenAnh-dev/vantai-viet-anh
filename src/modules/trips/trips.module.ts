import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { ExcelService } from './excel.service';
import { Trip } from '../../entities/trip.entity';
import { Vehicle } from '../../entities/vehicle.entity';
import { Employee } from '../../entities/employee.entity';
import { Customer } from '../../entities/customer.entity';
import { DataMapping } from '../../entities/data-mapping.entity';
import { ImportLog } from '../../entities/import-log.entity';
import { TripImportProcessor } from './processors/trip-import.processor';
import { Commission } from '../../entities/commission.entity';
import { Debt } from '../../entities/debt.entity';
import { DebtsModule } from '../debts/debts.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    DebtsModule,
    TransactionsModule,
    TypeOrmModule.forFeature([
      Trip,
      Vehicle,
      Employee,
      Customer,
      Commission,
      Debt,
      DataMapping,
      ImportLog,
    ]),
    BullModule.registerQueue({
      name: 'trip-import',
    }),
  ],
  controllers: [TripsController],
  providers: [TripsService, ExcelService, TripImportProcessor],
  exports: [TripsService, ExcelService],
})
export class TripsModule {}
