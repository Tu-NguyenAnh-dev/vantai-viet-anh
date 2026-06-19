import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { Vehicle } from '../../entities/vehicle.entity';
import { Trip } from '../../entities/trip.entity';
import { Transaction } from '../../entities/transaction.entity';
import { Commission } from '../../entities/commission.entity';
import { Debt } from '../../entities/debt.entity';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Trip, Transaction, Commission, Debt]),
    TransactionsModule,
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
