import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TripsModule } from './modules/trips/trips.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { DebtsModule } from './modules/debts/debts.module';
import { SalariesModule } from './modules/salaries/salaries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    RbacModule,
    AuthModule,
    CompaniesModule,
    VehiclesModule,
    EmployeesModule,
    CustomersModule,
    TripsModule,
    TransactionsModule,
    ReportsModule,
    UsersModule,
    SuppliersModule,
    DebtsModule,
    SalariesModule,
  ],
})
export class AppModule {}
