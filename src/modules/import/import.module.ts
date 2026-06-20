import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { Vehicle } from '../../entities/vehicle.entity';
import { Employee } from '../../entities/employee.entity';
import { Customer } from '../../entities/customer.entity';
import { Trip } from '../../entities/trip.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Employee, Customer, Trip]),
    MulterModule.register(),
  ],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
