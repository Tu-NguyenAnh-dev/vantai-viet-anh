/**
 * Import chuyến từ file Excel trong thư mục `docs/` (hoặc đường dẫn bất kỳ) vào PostgreSQL,
 * dùng cùng logic `ExcelService.importFromExcel` như API.
 *
 * **Chuẩn import (16 cột A–P)** — file export từ app / template:
 *   npm run import:excel -- --file docs/chuyen_chuan.xlsx --format standard --company-code DEMO001
 *
 * **Sổ Book1** (tiêu đề "THU CHI... THÁNG m/yyyy", header có Ngày + Lái xe) — mặc định nếu không --format:
 *   npm run import:excel -- --file docs/Book1.xlsx --company-code DEMO001
 *
 * Xem mã công ty:
 *   npm run import:excel -- --list-companies
 *
 * Biến môi trường: IMPORT_COMPANY_ID, IMPORT_COMPANY_CODE, BOOK1_MONTH, BOOK1_YEAR
 *
 * Cờ: --list-companies | --dry-run | --overwrite | --company-id | --company-code
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ExcelService } from '../modules/trips/excel.service';
import { Company } from '../entities/company.entity';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

/** Giống parseMoney trong ExcelService — chuỗi tiền VN có dấu phẩy / chấm nghìn */
function parseMoneyRaw(v: unknown): number {
  if (v == null || v === '') return 0;
  let cleaned = v
    .toString()
    .replace(/[₫$€£,\s]/g, '')
    .trim();
  if (cleaned === '-' || cleaned === '–') return 0;
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace('.', '');
    } else {
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  return parseFloat(cleaned) || 0;
}

function xeToPlate(xeCell: string): string {
  const s = xeCell.trim();
  if (!s) return '';
  return s.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
}

/**
 * Sổ Book1: header ở dòng có "Ngày" + "Lái xe"; dữ liệu từ dòng sau;
 * dòng 1 thường là tiêu đề "THU CHI... THÁNG m/yyyy"
 */
function book1ToStandardWorkbook(
  fileBuffer: Buffer,
  opts: { fallbackMonth?: number; fallbackYear?: number },
): { buffer: Buffer; stats: { usedRows: number; month: number; year: number } } {
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  let headerIdx = -1;
  let month = opts.fallbackMonth;
  let year = opts.fallbackYear;

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] as string[];
    const a = String(row?.[0] ?? '').trim();
    const b = String(row?.[1] ?? '').trim();
    if (/ngày/i.test(a) && /lái/i.test(b)) {
      headerIdx = r;
      break;
    }
    const title = String(row?.[0] ?? '');
    const m = title.match(/THÁNG\s*(\d{1,2})\s*\/\s*(\d{4})/i);
    if (m) {
      month = parseInt(m[1], 10);
      year = parseInt(m[2], 10);
    }
  }

  if (headerIdx < 0) {
    throw new Error(
      'Không tìm thấy dòng header (cột A: Ngày, cột B: Lái xe). Kiểm tra file hoặc dùng --format standard.',
    );
  }
  if (!month || !year) {
    throw new Error(
      'Không đọc được tháng/năm từ tiêu đề. Đặt BOOK1_MONTH và BOOK1_YEAR trong .env hoặc sửa dòng tiêu đề (vd. THÁNG 7/2025).',
    );
  }

  const out: unknown[][] = [];
  const headers = [
    'Ngày chuyến',
    'Mã chuyến',
    'Biển số xe',
    'Lái xe',
    'Phụ xe',
    'Khách hàng',
    'Địa chỉ chuyến',
    'Loại hàng',
    'Trọng lượng (tấn)',
    'Số lượng',
    'Doanh thu',
    'Chi phí xăng',
    'Chi phí cầu đường',
    'Chi phí khác',
    'Lợi nhuận',
    'Ghi chú',
  ];
  out.push(headers);

  let seq = 1;
  let used = 0;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const dayRaw = String(row[0] ?? '').trim();
    const driver = String(row[1] ?? '').trim();
    if (!dayRaw && !driver) continue;

    const dayNum = parseInt(dayRaw.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) continue;

    const dd = String(dayNum).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const tripDateStr = `${dd}/${mm}/${year}`;

    const xe = xeToPlate(String(row[2] ?? ''));
    const noiDung = String(row[3] ?? '').trim();
    const giaThanh = parseMoneyRaw(row[4]);
    const vet = parseMoneyRaw(row[10]);
    const ve = parseMoneyRaw(row[11]);
    const luat = parseMoneyRaw(row[12]);
    const pct10 = parseMoneyRaw(row[13]);
    const suaXe = parseMoneyRaw(row[14]);
    const dau = parseMoneyRaw(row[15]);
    const ghiChu = String(row[16] ?? '').trim();

    let tenKhach = String(row[9] ?? '').trim();
    const col8 = String(row[8] ?? '').trim();
    if (!tenKhach && col8) tenKhach = col8;
    if (!tenKhach) tenKhach = 'Khách (import sổ kế toán)';

    const tripCode = `BK${year}${mm}-${String(seq).padStart(5, '0')}`;
    seq += 1;

    const otherCosts = ve + luat + pct10 + suaXe;
    const notes = [noiDung, ghiChu].filter(Boolean).join(' | ').slice(0, 2000);

    const standardRow = [
      tripDateStr,
      tripCode,
      xe,
      driver,
      '',
      tenKhach,
      '',
      '',
      0,
      0,
      giaThanh,
      dau,
      vet,
      otherCosts,
      0,
      notes,
    ];
    out.push(standardRow);
    used++;
  }

  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(out);
  XLSX.utils.book_append_sheet(book, ws, 'Trips');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, stats: { usedRows: used, month, year } };
}

function listDocsXlsx(): string[] {
  try {
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) return [];
    return fs.readdirSync(docsDir).filter((f) => /\.xlsx$/i.test(f));
  } catch {
    return [];
  }
}

async function main() {
  const listOnly = hasFlag('--list-companies');
  const fileRel = arg('--file') || 'docs/Book1.xlsx';
  /** Mặc định `book1` vì file mặc định là Book1; import file 16 cột cần `--format standard`. */
  const format = arg('--format') || 'book1';
  const companyIdArg = arg('--company-id') || process.env.IMPORT_COMPANY_ID || process.env.COMPANY_ID;
  const companyCodeArg = arg('--company-code') || process.env.IMPORT_COMPANY_CODE;
  const dryRun = hasFlag('--dry-run');
  const overwrite = hasFlag('--overwrite');

  const filePath = path.isAbsolute(fileRel) ? fileRel : path.join(process.cwd(), fileRel);
  if (!listOnly && !fs.existsSync(filePath)) {
    console.error(`Không tìm thấy file: ${filePath}`);
    const inDocs = listDocsXlsx();
    if (inDocs.length) {
      console.error(`Các file .xlsx hiện có trong docs/: ${inDocs.join(', ')}`);
      console.error(
        `Ví dụ (gõ đúng mã công ty, không dùng ký tự < >): npm run import:excel -- --file docs/${inDocs[0]} --format book1 --company-code DEMO001`,
      );
    } else {
      console.error('Đặt file .xlsx vào docs/ (vd. docs/Book1.xlsx) và chỉ lại --file.');
    }
    process.exit(1);
  }

  const raw = listOnly ? Buffer.alloc(0) : fs.readFileSync(filePath);
  let buffer: Buffer;
  let meta = '';

  if (!listOnly && format === 'book1') {
    const fbMonth = process.env.BOOK1_MONTH ? parseInt(process.env.BOOK1_MONTH, 10) : undefined;
    const fbYear = process.env.BOOK1_YEAR ? parseInt(process.env.BOOK1_YEAR, 10) : undefined;
    const conv = book1ToStandardWorkbook(raw, { fallbackMonth: fbMonth, fallbackYear: fbYear });
    buffer = conv.buffer;
    meta = ` [Book1 → ${conv.stats.usedRows} dòng, tháng ${conv.stats.month}/${conv.stats.year}]`;
  } else if (!listOnly && format === 'standard') {
    buffer = raw;
  } else if (!listOnly) {
    console.error('--format phải là "standard" hoặc "book1"');
    process.exit(1);
  } else {
    buffer = raw;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ds = app.get(DataSource);
    const excel = app.get(ExcelService);
    const companyRepo = ds.getRepository(Company);

    if (listOnly) {
      const all = await companyRepo.find({ order: { code: 'ASC' } });
      console.log('Danh sách công ty (dùng --company-id hoặc --company-code):\n');
      for (const c of all) {
        console.log(`  ${c.code}\t${c.id}\t${c.name}`);
      }
      console.log(
        '\nVí dụ (thay mã bằng một dòng ở trên, không bọc < >):\n' +
          `  npm run import:excel -- --file docs/Book1.xlsx --format book1 --company-code ${all[0]?.code ?? 'DEMO001'}`,
      );
      await app.close();
      return;
    }

    let cid = companyIdArg?.trim();
    const code = companyCodeArg?.trim();
    if (!cid && code) {
      const c = await companyRepo.findOne({ where: { code } });
      if (!c) {
        const all = await companyRepo.find({ take: 20 });
        console.error(`Không tìm thấy company với code="${code}".`);
        console.error('Gợi ý (tối đa 20 dòng):');
        for (const x of all) console.error(`  code=${x.code}  id=${x.id}  ${x.name}`);
        process.exit(1);
      }
      cid = c.id;
      console.log(`Đã chọn company: ${c.code} — ${c.name} (${cid})`);
    }

    if (!cid) {
      const companies = await companyRepo.find({ order: { createdAt: 'ASC' } });
      if (companies.length === 1) {
        cid = companies[0].id;
        console.log(`Dùng company duy nhất trong DB: ${companies[0].code} — ${cid}`);
      } else {
        console.error(
          'Có nhiều công ty trong DB — cần chọn một cách:\n' +
            '  • npm run import:excel -- --list-companies\n' +
            '  • --company-id <uuid> hoặc IMPORT_COMPANY_ID=...\n' +
            '  • --company-code DEMO001 (mã trong cột companies.code — không gõ ký tự < >)\n' +
            '    hoặc IMPORT_COMPANY_CODE=...\n',
        );
        console.error('Danh sách (code → id):');
        for (const c of companies) {
          console.error(`  ${c.code}\t${c.id}`);
        }
        process.exit(1);
      }
    }

    if (dryRun) {
      const v = await excel.validateExcel(cid!, buffer, undefined);
      console.log(`Dry-run${meta}:`, JSON.stringify({ ...v, preview: v.preview?.slice(0, 3) }, null, 2));
      await app.close();
      return;
    }

    console.log(`Đang import${meta}...`);
    const result = await excel.importFromExcel(cid!, buffer, undefined, overwrite);
    console.log(
      JSON.stringify(
        {
          success: result.success.length,
          errors: result.errors.length,
          warnings: result.warnings?.length ?? 0,
          sampleErrors: result.errors.slice(0, 15),
          sampleOk: result.success.slice(0, 5),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
