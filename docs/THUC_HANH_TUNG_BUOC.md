# LỘ TRÌNH THỰC HÀNH THEO ĐỀ 5 – HỆ THỐNG QUẢN LÝ KHO

**Mục tiêu:** Hoàn thành đủ 7 tiêu chí của đề; có kết quả chạy thật trước khi đánh dấu đã đạt.

## BƯỚC 1 — Chuẩn bị môi trường và bộ mã nguồn

1. Trên **Windows 11**, cài Docker Desktop (WSL 2 backend, Linux containers), Git và Visual Studio Code.
2. Mở Docker Desktop, chờ Engine có trạng thái Running.
3. Mở PowerShell và kiểm tra:

```powershell
docker version
docker compose version
git --version
```

4. Giải nén file dự án và mở bằng VS Code (File → Open Folder).
5. Mở Terminal → New Terminal. Đảm bảo đang đứng trong thư mục có `docker-compose.yml`.
6. Sinh 5 mật khẩu mạnh và cấu hình .env:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
```

7. Mở `.env` bằng VS Code; kiểm tra có `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_EXPORTER_PASSWORD`, `ADMIN_PASSWORD`, `GRAFANA_ADMIN_PASSWORD` đã được thay bằng mật khẩu dài; KHÔNG đưa `.env` lên GitHub.
8. Kiểm tra file YAML:

```powershell
docker compose config --quiet
```

**Kết quả cần đạt:** Terminal nhận diện được Docker, Docker Compose và Git; `.env` đã sinh; cấu hình Compose hợp lệ.

**Ảnh cần chụp:** `docker compose config --quiet` không báo lỗi, cây thư mục dự án trong VS Code (không mở file chứa mật khẩu).

## BƯỚC 2 — Chạy website, MySQL và phpMyAdmin

Chạy tất cả dịch vụ từ Compose (cấu hình hiện tại là cấu hình tích hợp cả hệ thống):

```powershell
docker compose up -d --build
docker compose ps
```

Trong lần chạy đầu, Docker cần tải image, npm cài dependency và MySQL tạo bảng dữ liệu; quá trình có thể kéo dài vài phút tùy mạng.

Mở các URL:

- **http://localhost:8080**: website đi qua Nginx, hiện trang đăng nhập.
- **http://localhost:8081**: phpMyAdmin, đăng nhập bằng `MYSQL_USER` và `MYSQL_PASSWORD` trong `.env`.

Sau khi đăng nhập website bằng `ADMIN_USERNAME`/`ADMIN_PASSWORD`:

1. Nhà cung cấp → Thêm `Công ty ABC`.
2. Hàng hóa → Thêm `SP001`, tên `Bàn phím cơ`, đơn vị `cái`, ngưỡng cảnh báo `5`, chọn nhà cung cấp ABC.
3. Nhập kho → chọn SP001, số lượng `30`, mã `PN001`.
4. Kiểm tra tồn kho SP001 = `30`.
5. Xuất kho → SP001, số lượng `7`, mã `PX001`; kiểm tra còn `23`.
6. Xuất kho → SP001, số lượng `50`; kết quả **phải báo không đủ tồn**, vẫn còn `23`.
7. Vào Lịch sử nhập/xuất và kiểm tra 2 chứng từ thành công.
8. Vào phpMyAdmin, mở `inventory` → `products`, `stock_movements`; xem các dòng tương ứng.

**Kết quả cần đạt:** Các thao tác hoạt động, MySQL không mất dữ liệu sau restart container.

**Ảnh cần chụp:** trang tổng quan, sản phẩm, nhà cung cấp, nhập 30, xuất 7, cảnh báo xuất 50, hai bảng MySQL.

## BƯỚC 3 — Nginx + GitHub (Commit 1)

Kiểm tra Nginx:

```powershell
curl.exe -I http://localhost:8080/login
```

Response cần có các header `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`. Kiểm tra website đang mở qua **localhost:8080**, không phải truy cập trực tiếp app:3000.

Tạo tài khoản/repository GitHub **đặt tên theo mã số sinh viên theo yêu cầu giảng viên**. Trên máy, khởi tạo Git:

```powershell
git init
git branch -M main
git add app db nginx docker-compose.yml .env.example .gitignore README.md scripts
git commit -m "feat: inventory app with MySQL phpMyAdmin and Nginx"
```

**Ảnh cần chụp:** URL Nginx, lệnh curl, commit 1.

## BƯỚC 4 — Prometheus + Grafana (Commit 2)

1. Vào **http://localhost:9090/targets**, tìm các job `inventory-app`, `mysql`, `nginx`, `cadvisor`. Trạng thái kỳ vọng `UP`.
2. Vào **http://localhost:3001**, đăng nhập Grafana với `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`.
3. Chọn Dashboards → Inventory Course → Inventory - System Monitoring.
4. Làm vài thao tác website để tạo metrics.
5. Nếu có dashboard panel trống: kiểm tra Prometheus Targets, sau đó `docker compose logs --tail 100 cadvisor mysql-exporter nginx-exporter`.

PromQL demo:

```promql
up{job=~"inventory-app|cadvisor|nginx|mysql"}
mysql_global_status_threads_connected
rate(nginx_http_requests_total[5m])
```

Commit sau khi xác nhận file cấu hình:

```powershell
git add prometheus grafana
git commit -m "feat: monitor app Nginx MySQL and containers with Prometheus Grafana"
```

**Ảnh cần chụp:** trang Targets UP + dashboard Grafana 4–5 panel có dữ liệu + commit 2.

## BƯỚC 5 — Loki + Promtail (Commit 3)

1. Chạy thử nhập kho một lần để tạo `event: stock_in`.
2. Khi đang đăng nhập, truy cập `/trang-khong-ton-tai` để tạo log 404 Nginx.
3. Mở Grafana → Explore → Data source `Loki` → đặt time range `Last 1 hour`.
4. Lần lượt chạy ba query:

```logql
{job="inventory-app"}
{job="inventory-app", event="stock_in"}
{job="inventory-nginx"} | json | status >= 400
```

5. Nếu query không có kết quả, xem:

```powershell
docker compose logs --tail 100 promtail loki app nginx
```

6. Chụp ảnh **câu query và kết quả trả về** cho cả ba câu.
7. Commit 3:

```powershell
git add loki promtail docs
git commit -m "feat: centralized logs Loki Promtail and demo documentation"
```

**Kết quả cần đạt:** Promtail chuyển log ứng dụng và Nginx vào Loki, Grafana truy vấn được.

## BƯỚC 6 — Hardening (1,5 điểm)

Kiểm tra ít nhất 4 biện pháp:

1. `docker compose exec app id`: user khác root.
2. `docker compose exec nginx id`: user khác root.
3. Mở `docker-compose.yml`: `application`, `data`, `observability` có `internal: true`; MySQL không public port 3306.
4. `.env` có mật khẩu mạnh ngẫu nhiên; `.gitignore` loại `.env`.
5. `curl.exe -I http://localhost:8080/login` trả về security headers.
6. Dùng app user vào phpMyAdmin, chứng minh không cần root để thao tác DB inventory.

**Không đăng ảnh lộ mật khẩu lên GitHub.**

## BƯỚC 7 — GitHub, báo cáo và nghiệm thu (1,0 điểm tổng thể)

1. Sau khi tạo repo GitHub trống (không thêm README ban đầu từ giao diện web), chạy:

```powershell
git remote add origin https://github.com/TAI_KHOAN_CUA_BAN/TEN_REPO.git
git push -u origin main
git log --oneline --max-count=5
git status
```

2. Mở GitHub để kiểm tra đầy đủ các thư mục, README và ít nhất **3 commit có ý nghĩa**.
3. Mở `docs/Bao_Cao_De_Tai_Quan_Ly_Kho_Hang.docx` (mẫu báo cáo 15 trang), điền: trường, lớp, MSSV, tên, giảng viên, URL repo.
4. Thay tất cả chỉ dẫn `[CHÈN ẢNH THỰC TẾ: ...]` bằng ảnh chạy thật, cập nhật phần kết quả kiểm thử theo trạng thái đã xác nhận.
5. Kiểm tra các tiêu chí trên bảng chấm trang 2 của PDF, rà soát báo cáo đủ từ **10 trang trở lên**.
6. Trước khi demo, chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-check.ps1
docker compose ps
```

### Một số lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp / cách xử lý |
|---|---|
| `docker` không được nhận diện | Chưa cài/chưa mở Docker Desktop; mở lại PowerShell |
| Port `8080/8081/3001/9090` bận | Đóng ứng dụng đang dùng port hoặc sửa port trong `.env` |
| `mysql` unhealthy | Xem `docker compose logs mysql`; kiểm tra init script/mật khẩu |
| phpMyAdmin báo `Access denied` | Dùng `MYSQL_USER`/`MYSQL_PASSWORD`, không dùng mật khẩu admin website |
| Login sai dù đã sửa `.env` | `ADMIN_PASSWORD` chỉ seed lần tạo user; không tự reset tài khoản có sẵn |
| Prometheus target DOWN | Kiểm tra container tương ứng và exporter logs |
| Grafana panel trống | Chờ 15–30 giây, chọn Last 30 minutes, xem `/targets` |
| LogQL trả No data | Phát sinh thao tác thật, chọn Last 1 hour, kiểm tra promtail và Loki |
| Chạy lại bị mất dữ liệu | Không dùng `docker compose down -v`; `down -v` sẽ xóa volume |

## Tự đánh giá cuối cùng

- [ ] GitHub + README + 3 commit (1,5đ)
- [ ] Website, MySQL, phpMyAdmin (1,5đ)
- [ ] Nginx Reverse Proxy và security headers (1,5đ)
- [ ] Prometheus Targets, Grafana Dashboard (1,5đ)
- [ ] Loki, Promtail và 3 LogQL có log thực tế (1,5đ)
- [ ] Ít nhất 4 biện pháp hardening (1,5đ)
- [ ] Compose chạy, demo, ảnh và báo cáo trên 10 trang (1,0đ)
