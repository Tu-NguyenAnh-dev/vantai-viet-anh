import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { Employee } from '../../entities/employee.entity';
import { Commission } from '../../entities/commission.entity';
import { Trip } from '../../entities/trip.entity';
import { Transaction } from '../../entities/transaction.entity';
import { EmployeeSalaryAdvance } from '../../entities/employee-salary-advance.entity';
import { EmployeeAbsence } from '../../entities/employee-absence.entity';
import { SalariesModule } from '../salaries/salaries.module';

@Module({
  imports: [
    SalariesModule,
    TypeOrmModule.forFeature([
      Employee,
      Commission,
      Trip,
      Transaction,
      EmployeeSalaryAdvance,
      EmployeeAbsence,
    ]),
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
