import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Company } from '../entities/company.entity';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { Employee } from '../entities/employee.entity';
import { Customer } from '../entities/customer.entity';
import { Trip } from '../entities/trip.entity';
import { Transaction } from '../entities/transaction.entity';
import { DataMapping } from '../entities/data-mapping.entity';
import { ImportLog } from '../entities/import-log.entity';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { UserRole } from '../entities/user-role.entity';
import { Commission } from '../entities/commission.entity';
import { Supplier } from '../entities/supplier.entity';
import { Debt } from '../entities/debt.entity';
import { SalaryConfig } from '../entities/salary-config.entity';
import { EmployeeSalaryAdvance } from '../entities/employee-salary-advance.entity';
import { EmployeeAbsence } from '../entities/employee-absence.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'vantai_anh_viet'),
        entities: [
          Company,
          User,
          Vehicle,
          Employee,
          Customer,
          Trip,
          Transaction,
          DataMapping,
          ImportLog,
          Role,
          Permission,
          RolePermission,
          UserRole,
          Commission,
          Supplier,
          Debt,
          SalaryConfig,
          EmployeeSalaryAdvance,
          EmployeeAbsence,
        ],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
