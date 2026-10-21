# HỆ THỐNG QUẢN LÝ KHO HÀNG — ĐỀ 5

Bài thực hành môn **Triển khai và Quản trị Hệ thống Phần mềm**. Website Node.js/Express tích hợp MySQL, phpMyAdmin, Nginx, Prometheus, Grafana, Loki, Promtail, cAdvisor và các exporter. **Tất cả dịch vụ chạy bằng Docker Compose.**

> Dự án mẫu phục vụ bài thực hành **trên máy cá nhân (localhost)**, không mặc định là giải pháp production. Chưa xác nhận chạy end-to-end trên máy của sinh viên; cần thực hiện đầy đủ các bài kiểm tra trong tài liệu.

## 1. Yêu cầu máy

- Windows 11 với Docker Desktop (Linux containers), WSL 2, Git, VS Code.
- Gợi ý: tối thiểu 8 GB RAM, lý tưởng 16 GB RAM; Docker được cấp >= 4 GB RAM và đủ dung lượng ổ đĩa.
- Docker Desktop đã khởi động; PowerShell chạy `docker version` và `docker compose version` thành công.

## 2. Chạy nhanh trên Windows 11 (PowerShell)

Mở VS Code -> File -> Open Folder -> chọn thư mục dự án -> Terminal -> New Terminal (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

**Đợi trạng thái container ổn định** trước khi thử đăng nhập. Kiểm tra khi có lỗi:

```powershell
docker compose logs --tail 100 mysql app nginx
```

Mở `.env` để xem `ADMIN_USERNAME` và `ADMIN_PASSWORD`, dùng tài khoản này đăng nhập. **Không đăng .env hoặc ảnh chứa mật khẩu lên GitHub**.

| Dịch vụ | URL trên máy người thực hiện | Tài khoản |
|---|---|---|
| Website qua Nginx | http://localhost:8080 | `ADMIN_USERNAME`, `ADMIN_PASSWORD` trong `.env` |
| phpMyAdmin | http://localhost:8081 | `MYSQL_USER`, `MYSQL_PASSWORD` trong `.env` |
| Grafana | http://localhost:3001 | `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` trong `.env` |
| Prometheus targets | http://localhost:9090/targets | Không yêu cầu đăng nhập; chỉ mở loopback |

**Lưu ý:** Nếu sửa `.env` sau khi MySQL đã tạo volume dữ liệu, mật khẩu tài khoản MySQL sẽ **không tự thay đổi**; không xóa volume chỉ để sửa mật khẩu nếu đang có dữ liệu cần giữ. Lưu ý thay đổi `ADMIN_PASSWORD` cũng không tự đổi mật khẩu tài khoản đã được khởi tạo trong DB.

## 3. Tính năng nghiệp vụ

1. Đăng nhập quản trị (mật khẩu được băm scrypt, session cookie HttpOnly, CSRF cho biểu mẫu).
2. Dashboard: đếm sản phẩm, nhà cung cấp, đơn vị tồn kho, số mặt hàng sắp hết.
3. Quản lý sản phẩm: thêm, sửa, xóa sản phẩm chưa có lịch sử giao dịch; tìm kiếm theo SKU và tên.
4. Quản lý nhà cung cấp: thêm, sửa, xóa, liên kết với sản phẩm.
5. Nhập kho: thêm số lượng, ghi lịch sử và chứng từ.
6. Xuất kho: khóa dòng bằng `SELECT ... FOR UPDATE`, không cho tồn âm, ghi giao dịch cùng transaction.
7. Xem lịch sử nhập/xuất và cảnh báo hàng sắp hết.

## 4. Kiến trúc

```text
Trình duyệt
  |--> localhost:8080 --> Nginx (non-root, headers, reverse proxy)
  |                         |
  |                         v
  |                   Node.js Express (non-root)
  |                         |
  |                         v
  |                       MySQL 8.4 <---- phpMyAdmin (localhost:8081)
  |
  +--> localhost:3001 --> Grafana <--- Prometheus <--- app / Nginx exporter / MySQL exporter / cAdvisor
  |                           |
  |                           +--------- Loki <--- Promtail <--- volume logs app + Nginx
  +--> localhost:9090 --> Prometheus /targets
```

- `entry`: mạng có cổng localhost để truy cập các UI.
- `application`: mạng nội bộ Nginx ⇄ app.
- `data`: mạng nội bộ app ⇄ MySQL ⇄ phpMyAdmin ⇄ MySQL exporter.
- `observability`: mạng nội bộ thu thập metrics và log.
- Database KHÔNG mở cổng 3306 trên host; Prometheus và Grafana chỉ mở cổng trên `127.0.0.1`.

## 5. Kịch bản demo nghiệp vụ

1. Vào `/login`, đăng nhập.
2. Tạo nhà cung cấp `Công ty ABC` ở mục Nhà cung cấp.
3. Tạo sản phẩm `SP001 - Bàn phím cơ`, đơn vị `cái`, ngưỡng cảnh báo 5.
4. Ở Nhập kho, nhập **30**, mã phiếu `PN001`; kiểm tra tồn = **30**.
5. Ở Xuất kho, xuất **7**, mã phiếu `PX001`; kiểm tra tồn = **23**.
6. Thử xuất **50**: hệ thống từ chối do thiếu tồn, số dư vẫn là **23**.
7. Kiểm tra ba giao dịch ở Lịch sử: chỉ có `PN001` và `PX001` thành công, phiếu xuất 50 không được ghi.
8. Mở phpMyAdmin -> CSDL `inventory` -> bảng `products` và `stock_movements` để đối chiếu.

## 6. Prometheus + Grafana (Commit 2)

- Vào http://localhost:9090/targets, kiểm tra `inventory-app`, `cadvisor`, `nginx`, `mysql`, `prometheus` ở trạng thái UP.
- Vào Grafana http://localhost:3001 -> **Dashboards** -> **Inventory Course** -> **Inventory - System Monitoring**.
- Dashboard được provisioning tự động từ `grafana/provisioning/dashboards/inventory-dashboard.json`.
- PromQL demo:

```promql
up{job=~"inventory-app|cadvisor|nginx|mysql"}
sum(rate(inventory_http_requests_total[5m]))
mysql_global_status_threads_connected
rate(nginx_http_requests_total[5m])
sum by (name) (container_memory_working_set_bytes{name!=""}) / 1024 / 1024
```

> cAdvisor trên Windows qua Docker Desktop có thể có giới hạn riêng đối với container/host metrics. Nếu panel trống, kiểm tra `http://localhost:9090/targets`, quyền mount và `docker compose logs cadvisor` trước khi chụp minh chứng.

## 7. Loki + Promtail (Commit 3)

- Vào Grafana -> **Explore** -> data source `Loki`.
- Ở website, thực hiện vài thao tác nhập/xuất và truy cập trang, đợi ít nhất một chu kỳ thu thập log.
- Chạy ba truy vấn LogQL:

```logql
{job="inventory-app"}
{job="inventory-app", event="stock_in"}
{job="inventory-nginx"} | json | status >= 400
```

Nếu chưa có log lỗi 4xx, chủ động truy cập `http://localhost:8080/trang-khong-ton-tai` rồi chạy query thứ 3. Mở *Time range* thành **Last 1 hour**. App và Nginx ghi file trong Docker named volumes, Promtail đọc read-only, không cần quyền truy cập Docker socket.

## 8. Hardening (Commit 1 + toàn bộ)

- **Non-root app:** `USER node` trong `app/Dockerfile`.
- **Non-root Nginx:** dùng `nginxinc/nginx-unprivileged`.
- **Network isolation:** `application`, `data`, `observability` đều `internal: true`; chỉ các UI cần thiết nằm mạng `entry`.
- **Mật khẩu ngẫu nhiên:** `scripts/setup-env.ps1` tạo 5 mật khẩu 48 ký tự hex, `.env` được `.gitignore` loại khỏi Git.
- **Least privilege:** app sử dụng user MySQL riêng (`MYSQL_USER` chỉ được tạo trong DB ứng dụng), exporter có user riêng, thông tin nhạy cảm không để trong repo.
- **Security headers:** Nginx có CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy; `/metrics` bị chặn qua Nginx.
- **Khác:** cookie HttpOnly + SameSite, kiểm tra CSRF, prepared statements, password scrypt, giới hạn login, `no-new-privileges`, một số `cap_drop: ALL`.
- Hệ thống demo chạy **HTTP trên localhost** theo lựa chọn `security headers` hợp lệ trong đề; không tuyên bố đã có HTTPS.

Kiểm tra header bằng PowerShell:

```powershell
curl.exe -I http://localhost:8080/login
```

Kiểm tra quyền người dùng:

```powershell
docker compose exec app id
docker compose exec nginx id
```

## 9. Kế hoạch 3 commit theo yêu cầu đề

Trong thư mục dự án (sau khi tạo repo GitHub mang tên theo mã sinh viên), thực hiện 3 commit **có nội dung thật**:

```powershell
git init
git branch -M main
git add app db nginx docker-compose.yml .env.example .gitignore README.md scripts
git commit -m "feat: inventory app with MySQL phpMyAdmin and Nginx"
git add prometheus grafana
git commit -m "feat: monitor app Nginx MySQL and containers with Prometheus Grafana"
git add loki promtail docs
git commit -m "feat: centralized log collection with Loki Promtail and security report"
```

> Các thư mục giám sát và log đã có trong bản source tải về; để ghi đúng lịch sử phát triển, có thể làm lần lượt từng giai đoạn rồi commit. `docker-compose.yml` cấu hình đầy đủ ngay từ đầu để chạy cả hệ thống; commit 2 và 3 bổ sung file cấu hình từng thành phần.

Sau khi tạo repository **trống** trên GitHub, kết nối bằng đường dẫn chính xác do GitHub cung cấp (không chèn tên tài khoản giả vào báo cáo):

```powershell
git remote add origin https://github.com/TAI_KHOAN_CUA_BAN/TEN_REPO.git
git push -u origin main
```

Kiểm tra `git status` không liệt kê `.env` và trên GitHub phải có đủ 3 commit; nếu đã push sau commit cuối, cả 3 commit sẽ xuất hiện trên GitHub.

## 10. Lệnh kiểm tra, dừng, xóa dữ liệu

```powershell
# Hiện trạng thái và logs
docker compose ps
docker compose logs -f app nginx mysql

# Kiểm tra tự động các đường dẫn
powershell -ExecutionPolicy Bypass -File .\scripts\demo-check.ps1

# Xem security headers
curl.exe -I http://localhost:8080/login

# Dừng mà KHÔNG xóa dữ liệu
docker compose down

# Chỉ dùng khi chấp nhận XÓA SẠCH dữ liệu demo:
docker compose down -v
```

## 11. Minh chứng cần chụp ảnh đưa vào báo cáo

- GitHub repository, commit history (tối thiểu 3 commit), README.
- `docker compose ps`, các container chạy.
- Website đăng nhập, dashboard, danh sách hàng, nhà cung cấp.
- Nhập 30, xuất 7, thử xuất 50 bị chặn, tồn 23, lịch sử chứng từ.
- phpMyAdmin: các bảng MySQL, dữ liệu sản phẩm và lịch sử.
- `curl.exe -I` chứng minh Nginx security headers.
- Prometheus Targets `UP` và dashboard Grafana.
- Grafana Explore 3 LogQL với dữ liệu thật.
- `docker compose exec app id`, `docker compose exec nginx id`, mô tả mạng và `.env` bị loại khỏi Git (KHÔNG lộ nội dung mật khẩu).

## 12. Thư mục mã nguồn

```text
app/                      Express app, Dockerfile, CSS
db/init/                  SQL schema, tạo user exporter
nginx/                    Dockerfile Nginx non-root, reverse proxy
prometheus/               scrape jobs
grafana/provisioning/     data sources + dashboard
loki/                     storage Loki TSDB v13
promtail/                 tail logs app/nginx
scripts/                  tạo secret, kiểm tra demo
docs/                     hướng dẫn + mẫu báo cáo
docker-compose.yml        chạy toàn bộ dịch vụ
.env.example              mẫu config KHÔNG chứa mật khẩu thật
```

## 13. Lưu ý vận hành

- Mã nguồn được viết để **triển khai thử nghiệm**. Chưa thực hiện kiểm thử thực tế Docker Desktop trong môi trường tạo file này, nên cần xác nhận thực tế trên máy của bạn.
- Dashboard Prometheus chỉ có kết quả sau khi container khởi động và có dữ liệu metrics.
- Nếu MySQL init lỗi, xem log trước khi đụng đến volume. Không dùng `down -v` khi muốn giữ dữ liệu.
- Loki/Promtail được sử dụng vì **đề bài yêu cầu**; công nghệ này đã có thay đổi vòng đời hỗ trợ, cần xem xét nếu chuyển sang môi trường thực tế lâu dài.
- Nếu sử dụng cho Internet thật, phải bổ sung HTTPS với chứng chỉ tin cậy, secret manager, backup/restore, phân quyền sâu và kiểm thử bảo mật.
