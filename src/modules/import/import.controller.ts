import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import { ImportService } from './import.service';

@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post(':type')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        if (
          file.mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.originalname.toLowerCase().endsWith('.xlsx')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Chỉ hỗ trợ file .xlsx'), false);
        }
      },
    }),
  )
  async importExcel(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
    @CompanyId() companyId: string,
  ) {
    if (!file) throw new BadRequestException('Không có file');

    const allowed = ['vehicles', 'employees', 'customers', 'trips'];
    if (!allowed.includes(type)) {
      throw new BadRequestException(`Loại import không hợp lệ: ${type}`);
    }

    return this.importService.importExcel(
      type as 'vehicles' | 'employees' | 'customers' | 'trips',
      file.buffer,
      companyId,
    );
  }
}
