#!/usr/bin/env bash
# =============================================================================
# import_excel.sh — Import file Excel thu chi xe vào DB VanTaiVietAnh
#
# Usage:
#   ./scripts/import_excel.sh <path_to_excel_file>
#
# Ví dụ:
#   ./scripts/import_excel.sh "Các xe T7.2025.xls"
#   ./scripts/import_excel.sh ~/Downloads/"Các xe T8.2025.xls"
#
# Yêu cầu:
#   - python3 + openpyxl  (pip install openpyxl)
#   - libreoffice         (chuyển .xls → .xlsx nếu cần)
#   - psql                (PostgreSQL client)
#   - File .env ở thư mục gốc backend (vantaiAnhViet/)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"   # thư mục gốc (chứa .env)
PY_SCRIPT="$SCRIPT_DIR/migrate_excel.py"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# --- Colors ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Kiểm tra tham số
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path_to_excel_file> [--company <CODE>] [--clean]"
  echo "  --company DEMO001   Import vào company cụ thể"
  echo "  --clean             Xóa trips/vehicles/employees/customers cũ trước khi import"
  echo "  Example: $0 scripts/T7.2025.xls --company DEMO001 --clean"
  exit 1
fi

EXCEL_INPUT="$1"
COMPANY_CODE=""
CLEAN=0
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --company) COMPANY_CODE="$2"; shift 2 ;;
    --company=*) COMPANY_CODE="${1#*=}"; shift ;;
    --clean) CLEAN=1; shift ;;
    *) shift ;;
  esac
done

[[ -f "$EXCEL_INPUT" ]] || error "File không tồn tại: $EXCEL_INPUT"

# ---------------------------------------------------------------------------
# 2. Load .env (DB config)
# ---------------------------------------------------------------------------
ENV_FILE="$BACKEND_DIR/.env"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$SCRIPT_DIR/../.env"
[[ -f "$ENV_FILE" ]] || error ".env không tìm thấy. Đặt .env ở $BACKEND_DIR/"

info "Đọc config từ: $ENV_FILE"
set -a
# shellcheck disable=SC1090
source <(grep -E '^(DB_HOST|DB_PORT|DB_USERNAME|DB_PASSWORD|DB_DATABASE)=' "$ENV_FILE")
set +a

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-$(whoami)}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_DATABASE="${DB_DATABASE:-vantai_anh_viet}"

export PGPASSWORD="$DB_PASSWORD"

# macOS Homebrew PostgreSQL dùng Unix socket (/tmp), không phải TCP localhost
# Bỏ -h khi host=localhost để psql tự dùng socket
if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
  PSQL_CMD="psql -p $DB_PORT -U $DB_USERNAME -d $DB_DATABASE"
else
  PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_DATABASE"
fi

# ---------------------------------------------------------------------------
# 3. Test kết nối DB
# ---------------------------------------------------------------------------
info "Kết nối DB: $DB_USERNAME@$DB_HOST:$DB_PORT/$DB_DATABASE"
$PSQL_CMD -c "SELECT 1" -q > /dev/null 2>&1 || error "Không kết nối được DB. Kiểm tra lại .env"
success "Kết nối DB thành công"

# ---------------------------------------------------------------------------
# 4. Lấy company_id từ DB
# ---------------------------------------------------------------------------
if [[ -n "$COMPANY_CODE" ]]; then
  COMPANY_ID=$($PSQL_CMD -t -c "SELECT id FROM companies WHERE code = '$COMPANY_CODE';" 2>/dev/null | tr -d ' \n')
  [[ -n "$COMPANY_ID" ]] || error "Không tìm thấy company với code '$COMPANY_CODE' trong DB"
else
  COMPANY_ID=$($PSQL_CMD -t -c "SELECT id FROM companies LIMIT 1;" 2>/dev/null | tr -d ' \n')
  [[ -n "$COMPANY_ID" ]] || { warn "Chưa có company trong DB"; COMPANY_ID=$(python3 -c "import uuid; print(uuid.uuid4())"); }
fi
success "Dùng company_id: $COMPANY_ID"

# ---------------------------------------------------------------------------
# 4b. Clean data cũ (nếu có --clean)
# ---------------------------------------------------------------------------
if [[ "$CLEAN" -eq 1 ]]; then
  echo ""
  warn "⚠️  --clean: Sẽ xóa TOÀN BỘ trips, customers, employees, vehicles của company này!"
  read -rp "Xác nhận xóa data cũ? (yes/N): " CLEAN_CONFIRM
  if [[ "$CLEAN_CONFIRM" != "yes" ]]; then
    warn "Đã huỷ --clean. Chạy lại không có --clean nếu chỉ muốn import thêm."
    exit 0
  fi
  info "Đang xóa data cũ..."
  $PSQL_CMD -q -c "
    BEGIN;
    DELETE FROM trips     WHERE company_id = '$COMPANY_ID';
    DELETE FROM customers WHERE company_id = '$COMPANY_ID';
    DELETE FROM employees WHERE company_id = '$COMPANY_ID';
    DELETE FROM vehicles  WHERE company_id = '$COMPANY_ID';
    COMMIT;
  " || error "Xóa data thất bại"
  success "Đã xóa data cũ"
  echo ""
fi

# ---------------------------------------------------------------------------
# 5. Chuyển .xls → .xlsx nếu cần (dùng Node.js/xlsx, không cần LibreOffice)
# ---------------------------------------------------------------------------
FILENAME=$(basename "$EXCEL_INPUT")
EXT="${FILENAME##*.}"
XLSX_FILE="$EXCEL_INPUT"

if [[ "$(echo "$EXT" | tr '[:upper:]' '[:lower:]')" == "xls" ]]; then
  info "Chuyển .xls → .xlsx (Node.js)..."
  XLSX_FILE="$TEMP_DIR/converted.xlsx"
  node -e "
    const XLSX = require('$BACKEND_DIR/node_modules/xlsx');
    const wb = XLSX.readFile('$(realpath "$EXCEL_INPUT")');
    XLSX.writeFile(wb, '$XLSX_FILE');
  " || error "Chuyển đổi thất bại. Kiểm tra node và node_modules/xlsx"
  success "Đã chuyển xong"
fi

# ---------------------------------------------------------------------------
# 6. Generate SQL
# ---------------------------------------------------------------------------
SQL_OUT="$TEMP_DIR/import_data.sql"
info "Đang phân tích file Excel..."

python3 "$PY_SCRIPT" "$XLSX_FILE" \
  --company-id "$COMPANY_ID" \
  --out "$SQL_OUT"

# ---------------------------------------------------------------------------
# 7. Xem trước & xác nhận
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}========== XEM TRƯỚC ==========${NC}"
grep "^-- Summary" "$SQL_OUT" || true
echo -e "${YELLOW}================================${NC}"
echo ""
read -rp "Tiếp tục import vào DB '$DB_DATABASE'? (y/N): " CONFIRM
[[ "$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')" == "y" ]] || { warn "Đã huỷ."; exit 0; }

# ---------------------------------------------------------------------------
# 8. Chạy SQL vào DB
# ---------------------------------------------------------------------------
info "Đang import dữ liệu..."
$PSQL_CMD -f "$SQL_OUT" --set ON_ERROR_STOP=1 -q

echo ""
success "Import hoàn tất!"

# Thống kê nhanh
echo ""
echo -e "${BLUE}--- Thống kê DB sau import ---${NC}"
$PSQL_CMD -t -c "
  SELECT 'Vehicles' as type, COUNT(*) FROM vehicles WHERE company_id = '$COMPANY_ID'
  UNION ALL
  SELECT 'Employees', COUNT(*) FROM employees WHERE company_id = '$COMPANY_ID'
  UNION ALL
  SELECT 'Customers', COUNT(*) FROM customers WHERE company_id = '$COMPANY_ID'
  UNION ALL
  SELECT 'Trips', COUNT(*) FROM trips WHERE company_id = '$COMPANY_ID';
" 2>/dev/null || true
