# Hướng dẫn Deploy Vận Tải Anh Việt lên VPS (Mat Bao)

> **Thư mục thực tế trên VPS (xác nhận 2026-08-18 qua `pm2 describe vantai-api`): `/var/vantai-viet-anh`** — không phải `/var/www/vantai/vantaiAnhViet` như hướng dẫn Bước 3 dưới đây. VPS chạy bằng user `root`. Nếu deploy lần đầu vào máy mới thì path ở Bước 3 vẫn áp dụng được (chỉ là quy ước), nhưng khi **redeploy** vào VPS hiện có, luôn `cd /var/vantai-viet-anh`.

## Bước 1: Cài đặt môi trường trên VPS

SSH vào VPS, chạy từng lệnh:

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Cài PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Cài Redis (cho Bull queue)
sudo apt install -y redis-server

# Cài PM2 (chạy app 24/7)
sudo npm install -g pm2

# Cài Nginx (reverse proxy)
sudo apt install -y nginx

# Cài Git
sudo apt install -y git
```

---

## Bước 2: Tạo Database PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER vantai WITH PASSWORD 'mat_khau_manh_cua_ban';"
sudo -u postgres psql -c "CREATE DATABASE vantai_anh_viet OWNER vantai;"
```

> Đổi `mat_khau_manh_cua_ban` thành mật khẩu mạnh (ít nhất 12 ký tự).

---

## Bước 3: Upload code lên VPS

### Cách 1: Dùng Git (khuyến nghị)

1. Đẩy code lên **GitHub** (hoặc GitLab) – **private repo** nếu có dữ liệu nhạy cảm.
2. Trên VPS:

```bash
cd /var/www
sudo mkdir -p vantai
sudo chown $USER:$USER vantai
cd vantai

# Clone (thay bằng URL repo của bạn)
git clone https://github.com/username/vantaiAnhViet.git
cd vantaiAnhViet
```

> Repo thật hiện tại: `git@github.com:vjrutBLACK/vantai-viet-anh.git` (SSH — VPS cần có deploy key add vào GitHub, hoặc dùng URL HTTPS tương ứng nếu chưa setup SSH).

### Cách 2: Dùng SCP (copy từ máy local)

Trên **máy Mac** (chạy trong thư mục dự án):

```bash
# Đổi YOUR_VPS_IP và đường dẫn
scp -r . root@YOUR_VPS_IP:/var/www/vantai/vantaiAnhViet
```

---

## Bước 4: Cấu hình .env trên VPS

```bash
cd /var/www/vantai/vantaiAnhViet

# Tạo file .env
cp .env.example .env
nano .env
```

Nội dung `.env` cho production:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=vantai
DB_PASSWORD=mat_khau_ban_da_tao
DB_DATABASE=vantai_anh_viet

JWT_SECRET=chuoi-bi-mat-rat-dai-ngau-nhien-64-ky-tu
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=chuoi-khac-ngau-nhien-64-ky-tu
JWT_REFRESH_EXPIRES_IN=30d

PORT=3000
NODE_ENV=production

REDIS_HOST=localhost
REDIS_PORT=6379
```

> Tạo JWT_SECRET ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Bước 5: Build và chạy ứng dụng

```bash
cd /var/www/vantai/vantaiAnhViet

# Cài dependencies
npm install

# Tạo bảng (chạy schema SQL) — chỉ cần lần đầu, DB đã có thì bỏ qua bước này
sudo -u postgres psql -d vantai_anh_viet -f database/schema.sql

# Chạy TẤT CẢ migration theo thứ tự tên file (không chỉ 1-2 file cụ thể)
# Mọi migration đều dùng IF NOT EXISTS/IF EXISTS nên chạy lại an toàn, kể cả file đã áp dụng trước đó
for f in database/migrations/*.sql; do
  echo "Applying $f"
  sudo -u postgres psql -d vantai_anh_viet -f "$f"
done

# (Tùy chọn) Seed dữ liệu test
npm run seed:test

# Build
npm run build

# Chạy bằng PM2
pm2 start npm --name "vantai-api" -- run start:prod

# PM2 chạy khi restart VPS
pm2 save
pm2 startup
```

Kiểm tra: `pm2 status` — app phải ở trạng thái **online**.

---

## Bước 6: Cấu hình Nginx

```bash
sudo nano /etc/nginx/sites-available/vantaianhviet
```

> Trên VPS thật, file này (`/etc/nginx/sites-enabled/vantaianhviet`) đã được cấu hình đầy đủ cho **cả FE lẫn BE** (root trỏ vào build FE + location `/api` proxy BE) — xem bản đầy đủ trong `vantaiAnhViet-web/docs/DEPLOY.md` Bước 4. Nội dung dưới đây chỉ minh hoạ trường hợp deploy riêng BE.

Nội dung (áp dụng khi **chỉ có backend API**):

```nginx
server {
    listen 80;
    server_name vantaianhviet.net www.vantaianhviet.net;

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Nếu có frontend (React) - chỉnh path tới thư mục build
    # location / {
    #     root /var/www/vantai/frontend/dist;
    #     try_files $uri $uri/ /index.html;
    # }
}
```

Bật site và reload Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/vantaianhviet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Bước 7: Cài SSL (HTTPS) với Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d vantaianhviet.net -d www.vantaianhviet.net
```

Làm theo hướng dẫn, nhập email. Certbot sẽ tự cấu hình HTTPS.

---

## Bước 8: Trỏ domain về VPS

1. Vào **Mat Bao** → **Quản trị tên miền** → **Bản ghi DNS**
2. Thêm bản ghi **A**:
   - Tên: `@` (hoặc để trống)
   - Trỏ tới: **IP VPS**
3. Thêm bản ghi **A** cho `www`:
   - Tên: `www`
   - Trỏ tới: **IP VPS**

Đợi 5–15 phút để DNS cập nhật.

---

## Lệnh hữu ích

| Lệnh | Mô tả |
|------|-------|
| `pm2 status` | Xem trạng thái app |
| `pm2 logs vantai-api` | Xem log |
| `pm2 restart vantai-api` | Khởi động lại sau khi sửa code |
| `pm2 stop vantai-api` | Dừng app |

---

## Cập nhật code sau này (re-deploy)

```bash
cd /var/vantai-viet-anh

# Check trạng thái hiện tại trước khi pull (tránh mất sửa tay chưa commit)
git status
git log --oneline -5

git pull
npm install

# Chạy lại toàn bộ migration — an toàn dù đã áp dụng rồi (đều có IF NOT EXISTS)
for f in database/migrations/*.sql; do
  echo "Applying $f"
  sudo -u postgres psql -d vantai_anh_viet -f "$f"
done

npm run build
pm2 restart vantai-api
pm2 save
```

Verify: `pm2 status` (phải **online**), `pm2 logs vantai-api --lines 50`, `curl http://localhost:3000/api/v1`.

---

## Kiểm tra nhanh

- API: `https://vantaianhviet.net/api/v1` (hoặc `/api/v1/health` nếu có)
- Frontend: `https://vantaianhviet.net` (khi đã cấu hình)
