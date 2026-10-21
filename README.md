# HỆ THỐNG QUẢN LÝ KHO HÀNG — ĐỀ TÀI 5

**Môn học:** Triển khai và Quản trị Hệ thống Phần mềm  
**Đề tài:** Triển khai và quản trị Hệ thống quản lý kho hàng bằng Docker Compose  
**Mã số sinh viên / tài khoản GitHub:** `dtc245220012`  
**Repository:** [dtc245220012/Dtc245220012-HeThongQuanLyKhoHang](https://github.com/dtc245220012/Dtc245220012-HeThongQuanLyKhoHang)

## 1. Giới thiệu

Dự án triển khai ứng dụng **quản lý kho hàng** bằng **Node.js/Express** và **MySQL 8.4**, sử dụng **Nginx** làm reverse proxy, **phpMyAdmin** để quản trị cơ sở dữ liệu, **Prometheus + Grafana** để giám sát và **Loki + Promtail** để thu thập log tập trung. Hệ thống được đóng gói, cấu hình và vận hành bằng **Docker Compose**.

Các thành phần giám sát bổ trợ gồm **cAdvisor**, **MySQL Exporter** và **Nginx Exporter**.

**Phạm vi:** Dự án phục vụ thực hành, demo và đánh giá trên máy cá nhân (`localhost`); **không phải cấu hình production trên Internet**.

### Kết quả triển khai thực tế

- Đã khởi chạy hệ thống bằng Docker Compose và kiểm tra các dịch vụ chính hoạt động.
- Đã truy cập ứng dụng qua Nginx, phpMyAdmin, Prometheus, Grafana và Loki theo cấu hình cổng trên máy thực hành.
- Đã kiểm tra **5/5 targets UP** trên Prometheus.
- Đã xem dữ liệu giám sát trên Grafana, bao gồm biểu đồ **Memory by cgroup (MiB)** đã chỉnh sửa cho dữ liệu cAdvisor thực tế.
- Đã chạy và nhận kết quả với **3 truy vấn LogQL**.
- Đã kiểm tra các biện pháp hardening như non-root, network isolation, security headers và hạn chế quyền Docker.
- Đã push mã nguồn cùng **3 commit** lên repository GitHub nêu trên.

> Kết quả trên dựa vào lần triển khai và các kiểm tra đã thực hiện trên máy cá nhân. Các máy khác cần chạy lại bước kiểm tra vì cấu hình cổng, tài nguyên và phiên bản Docker có thể khác nhau.

## 2. Yêu cầu môi trường

- Windows 11, Docker Desktop (Linux containers, WSL 2).
- Git, Visual Studio Code và PowerShell.
- RAM tối thiểu khuyến nghị 8 GB; 16 GB sẽ thuận lợi hơn khi chạy đồng thời 11 dịch vụ.
- Docker Desktop đang chạy; xác nhận bằng:

```powershell
docker version
docker compose version
git --version
```

## 3. Cấu trúc dự án

```text
He_Thong_Quan_Ly_Kho_Hang/
├── app/                       Ứng dụng Express, giao diện, Dockerfile
├── db/init/                   Script khởi tạo MySQL và tài khoản exporter
├── nginx/                     Reverse proxy và cấu hình bảo mật
├── prometheus/                Cấu hình scrape metrics
├── grafana/provisioning/      Datasource và dashboard Grafana
├── loki/                      Cấu hình Loki
├── promtail/                  Cấu hình thu thập log
├── scripts/                   Tạo .env và kiểm tra dịch vụ
├── docs/                      Hướng dẫn thực hành và báo cáo Word
├── docker-compose.yml         Khởi chạy toàn bộ hệ thống
├── .env.example               Mẫu cấu hình, KHÔNG chứa mật khẩu thật
├── .gitignore                 Loại trừ file nhạy cảm
└── README.md                  Hướng dẫn và tổng hợp kết quả
```

## 4. Hướng dẫn chạy trên Windows 11

### Bước 1 — Lấy mã nguồn

Có thể mở thư mục dự án đã tải về trên VS Code hoặc clone repository:

```powershell
git clone https://github.com/dtc245220012/Dtc245220012-HeThongQuanLyKhoHang.git
cd Dtc245220012-HeThongQuanLyKhoHang
```

Nếu đã có thư mục dự án trên máy, **không cần clone lại**.

### Bước 2 — Chuẩn bị `.env`

Chạy trong Terminal PowerShell tại thư mục có `docker-compose.yml`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
```

Script tạo `.env` từ `.env.example` với mật khẩu ngẫu nhiên nếu `.env` **chưa tồn tại**; script không ghi đè file đã có. **Không commit hoặc chụp ảnh nội dung `.env`**.

Máy thực hành đã cấu hình cổng ứng dụng `8082` và Prometheus `9091` để tránh xung đột cổng. Có thể điều chỉnh các biến không nhạy cảm trong `.env` như sau:

```dotenv
APP_PORT=8082
PHPMYADMIN_PORT=8081
GRAFANA_PORT=3001
PROMETHEUS_PORT=9091
TZ=Asia/Ho_Chi_Minh
```

> Đây là **các cổng đã dùng trên máy thực hành**. Giá trị mặc định ở `.env.example` là `APP_PORT=8080` và `PROMETHEUS_PORT=9090`. Nếu sử dụng cổng mặc định trên máy khác, hãy thay URL tương ứng trong hướng dẫn.

### Bước 3 — Khởi động

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Kiểm tra log nếu có container chưa lên:

```powershell
docker compose logs --tail 100 mysql app nginx
```

Đợi MySQL và ứng dụng có trạng thái `healthy` trước khi thử đăng nhập.

### Bước 4 — Truy cập các giao diện

| Dịch vụ | Địa chỉ trên máy đã thực hành | Ghi chú |
|---|---|---|
| Website qua Nginx | http://localhost:8082 | Trang đăng nhập: `/login` |
| phpMyAdmin | http://localhost:8081 | Đăng nhập bằng thông tin MySQL hợp lệ trong `.env` |
| Grafana | http://localhost:3001 | Dùng `GRAFANA_ADMIN_USER` và mật khẩu tương ứng |
| Prometheus Targets | http://localhost:9091/targets | Kiểm tra trạng thái job |

Tài khoản đăng nhập quản trị website được tạo từ các biến `ADMIN_USERNAME` và `ADMIN_PASSWORD` **khi khởi tạo dữ liệu**. Không công bố thông tin đăng nhập trong README.

**Quan trọng khi thay mật khẩu:** Chỉnh `.env` sau khi MySQL đã khởi tạo volume **không tự đổi** mật khẩu các tài khoản trong database. Mật khẩu quản trị ứng dụng đã được khởi tạo trong database cũng không tự cập nhật chỉ bằng thay biến môi trường. Cần đổi mật khẩu tương ứng trong hệ thống và cập nhật cấu hình đồng bộ. Không dùng `docker compose down -v` chỉ để thay mật khẩu vì sẽ xóa dữ liệu trong volume.

## 5. Kiến trúc hệ thống

```text
                         Người dùng / Trình duyệt
                                   |
                             localhost:8082
                                   |
                     Nginx reverse proxy (non-root)
                                   |
                            Node.js / Express
                                   |
                                MySQL 8.4
                                   ^
                                   |
                       phpMyAdmin (:8081)

   Metrics:  App / Nginx Exporter / MySQL Exporter / cAdvisor
                             | 
                         Prometheus (:9091)
                             |
                         Grafana (:3001)

   Logs:    App + Nginx  -->  Promtail  -->  Loki  -->  Grafana Explore
```

**Phân tách mạng Docker:**

- `entry`: cho phép truy cập các giao diện cần thiết từ `127.0.0.1`.
- `application`: kết nối Nginx và ứng dụng.
- `data`: kết nối ứng dụng, MySQL, phpMyAdmin và MySQL Exporter.
- `observability`: mạng dành cho giám sát và log.
- `application`, `data`, `observability` là mạng nội bộ (`internal: true`).
- MySQL không publish cổng `3306` ra máy host.

## 6. Chức năng nghiệp vụ

1. Đăng nhập và đăng xuất quản trị.
2. Dashboard tổng quan: sản phẩm, nhà cung cấp, tổng lượng tồn và cảnh báo sắp hết hàng.
3. Quản lý sản phẩm: thêm, sửa, xóa trong giới hạn ràng buộc dữ liệu; tìm theo SKU và tên.
4. Quản lý nhà cung cấp và liên kết với sản phẩm.
5. Nhập kho, cập nhật tồn và lưu phiếu giao dịch.
6. Xuất kho, kiểm tra số lượng tồn, ngăn xuất quá số lượng có sẵn.
7. Theo dõi lịch sử nhập – xuất và mặt hàng sắp hết.

### Kịch bản demo nghiệp vụ

Đây là kịch bản để giảng viên có thể thực hiện lại, **không phải tuyên bố rằng mọi dữ liệu mẫu đã tồn tại trong database hiện tại**:

1. Đăng nhập tại http://localhost:8082/login.
2. Tạo nhà cung cấp: `Công ty ABC`.
3. Tạo sản phẩm: `SP001 – Bàn phím cơ`, đơn vị `cái`, ngưỡng cảnh báo `5`.
4. Nhập kho `30` sản phẩm, mã phiếu `PN001` → tồn dự kiến `30`.
5. Xuất kho `7` sản phẩm, mã phiếu `PX001` → tồn dự kiến `23`.
6. Thử xuất `50` sản phẩm → hệ thống phải từ chối do không đủ tồn, số lượng vẫn là `23`.
7. Kiểm tra lịch sử giao dịch: chỉ **2 phiếu hợp lệ** (`PN001`, `PX001`); thao tác xuất 50 bị từ chối không tạo phiếu xuất thành công.
8. Vào phpMyAdmin, đối chiếu các bảng `products`, `stock_movements` và số lượng tồn.

## 7. Giám sát Prometheus + Grafana

### Prometheus

Mở http://localhost:9091/targets. Trong lần kiểm thử đã ghi nhận **5/5 targets UP**: `inventory-app`, `cadvisor`, `nginx`, `mysql`, `prometheus`.

Một số truy vấn PromQL:

```promql
up{job=~"inventory-app|cadvisor|nginx|mysql"}
sum(rate(inventory_http_requests_total[5m]))
mysql_global_status_threads_connected
rate(nginx_http_requests_total[5m])
```

### Grafana

Mở http://localhost:3001 → **Dashboards** → **Inventory Course** → **Inventory - System Monitoring**.

Dashboard hiển thị trạng thái dịch vụ, số request ứng dụng, kết nối MySQL, request Nginx và số liệu bộ nhớ từ cAdvisor.

**Cập nhật quan trọng đã áp dụng trên máy thực hành:** Truy vấn bộ nhớ trong bản README cũ sử dụng nhãn `name` không có dữ liệu tại máy này. Truy vấn đã sử dụng thành công là:

```promql
sum by (id) (container_memory_working_set_bytes{job="cadvisor",id!="",id!="/",id!="/docker"}) / 1024 / 1024
```

Panel được đổi tên **Memory by cgroup (MiB)**, với legend `{{id}}`. Biểu đồ này thể hiện **bộ nhớ theo cgroup**, không nên mô tả nhầm là đã định danh chính xác từng container theo tên.

Dashboard được provision từ file:

```text
grafana/provisioning/dashboards/inventory-dashboard.json
```

Sau khi thay đổi file dashboard, có thể khởi động lại Grafana để tải cấu hình đã được provision:

```powershell
docker compose restart grafana
```

## 8. Hệ thống log tập trung Loki + Promtail

Mở **Grafana → Explore → chọn data source Loki**. Trong lần kiểm thử, đã có log ứng dụng và log Nginx được thu thập thành công.

**Ba truy vấn LogQL đã thực hiện và có kết quả trên máy thực hành:**

**Truy vấn 1 — Log ứng dụng:**

```logql
{job="inventory-app"}
```

**Truy vấn 2 — Log Nginx:**

```logql
{job="inventory-nginx"}
```

**Truy vấn 3 — Lọc lỗi ứng dụng:**

```logql
{job="inventory-app"} | json | level="error"
```

Truy vấn lọc lỗi từng hiển thị các bản ghi lỗi khởi động và lỗi yêu cầu xuất kho vượt số lượng tồn. Số lượng bản ghi hiển thị **thay đổi theo khoảng thời gian lọc**, không phải con số cố định.

Nếu chưa có dữ liệu, truy cập website để phát sinh log, mở rộng **Time range** (ví dụ *Last 1 hour*), kiểm tra Promtail và Loki:

```powershell
docker compose logs --tail 100 promtail loki
```

## 9. Hardening và bảo mật

Các kiểm tra đã thực hiện:

| Biện pháp | Thiết lập / cách kiểm chứng |
|---|---|
| Non-root | `docker compose exec app id` → `uid=1000(node)`; `docker compose exec nginx id` → `uid=101(nginx)` |
| Network isolation | `application`, `data`, `observability` đều có `Internal=true` |
| Security headers | Nginx phản hồi `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy` |
| Hạn chế quyền container | App và Nginx có `cap_drop: ALL` và `no-new-privileges:true` |
| Mật khẩu / thông tin nhạy cảm | Script sinh mật khẩu ngẫu nhiên; file `.env` bị loại khỏi Git bằng `.gitignore` |
| Giới hạn truy cập | Các cổng web demo được bind `127.0.0.1`; MySQL không mở cổng DB trên host |

Lệnh kiểm tra thực tế:

```powershell
docker compose exec app id
docker compose exec nginx id
curl.exe -I http://localhost:8082/login

docker network inspect inventory-coursework_application --format '{{.Internal}}'
docker network inspect inventory-coursework_data --format '{{.Internal}}'
docker network inspect inventory-coursework_observability --format '{{.Internal}}'

docker inspect inventory-coursework-app-1 --format '{{json .HostConfig.CapDrop}} {{json .HostConfig.SecurityOpt}}'
docker inspect inventory-coursework-nginx-1 --format '{{json .HostConfig.CapDrop}} {{json .HostConfig.SecurityOpt}}'
```

Các tên container và network ở trên theo Compose project `inventory-coursework` trong bản triển khai này; nếu thay đổi tên project, hãy xem `docker compose ps` và `docker network ls` để tìm tên tương ứng.

**Giới hạn bảo mật:** Hệ thống dùng **HTTP trên localhost**, chưa cấu hình HTTPS cho truy cập Internet. Trước khi đưa lên môi trường production cần bổ sung HTTPS, quản lý secret, sao lưu/khôi phục và kiểm thử bảo mật. Mật khẩu từng được chia sẻ khi hỗ trợ cài đặt cần được **thay mới** trước khi công khai môi trường thật; chỉ bỏ qua `.env` khỏi Git không đồng nghĩa đã an toàn tuyệt đối.

## 10. GitHub và lịch sử 3 commit

**Repository chính thức:**  
https://github.com/dtc245220012/Dtc245220012-HeThongQuanLyKhoHang

**Nhánh:** `main`

| Commit | Nội dung | Mã commit |
|---|---|---|
| 1 | Triển khai website, MySQL và Nginx | `5fcbc81` |
| 2 | Bổ sung Prometheus và Grafana | `1f5c0ea` |
| 3 | Bổ sung Loki, Promtail và tài liệu | `132efe6` |

Các commit trên đã được push thành công qua `git push -u origin main` và repository đã hiển thị mã nguồn trên GitHub.

Kiểm tra nhanh:

```powershell
git remote -v
git log -3 --oneline
git status
git ls-files .env
git check-ignore -v .env
```

Lệnh `git ls-files .env` cần không có đầu ra. File backup Grafana `*.bak` nếu còn xuất hiện trong *Untracked files* có thể giữ cục bộ hoặc thêm quy tắc ignore phù hợp; **không cần commit bản backup**.

**Lưu ý:** Bài thực hành yêu cầu tối thiểu 3 commit có ý nghĩa. Nếu cập nhật README sau khi đã nộp 3 commit, việc tạo thêm commit là bình thường và không làm mất lịch sử ba commit trước đó.

## 11. Kiểm tra, dừng và quản lý dữ liệu

```powershell
# Xem trạng thái dịch vụ
docker compose ps

# Xem log ba dịch vụ chính
docker compose logs --tail 100 app nginx mysql

# Kiểm tra các URL theo cổng thực tế trên máy: xem bên dưới
```

Các lệnh kiểm tra URL nên chạy trực tiếp trong PowerShell:

```powershell
curl.exe -I http://localhost:8082/login
curl.exe -I http://localhost:8081/
curl.exe -I http://localhost:9091/-/ready
curl.exe -I http://localhost:3001/login
```

> Script `scripts/demo-check.ps1` trong bộ nguồn ban đầu vẫn có URL mặc định `8080` và `9090`. Khi máy sử dụng `8082` và `9091`, cần sửa cổng trong script đó trước khi dùng hoặc sử dụng lệnh `curl.exe` ở trên. Không kết luận hệ thống lỗi chỉ vì script đang trỏ nhầm cổng.

```powershell
# Dừng các container, giữ nguyên dữ liệu
docker compose down

# Khởi động lại
docker compose up -d

# CHỈ sử dụng nếu thực sự muốn xóa các volume dữ liệu
docker compose down -v
```

**Cảnh báo:** `docker compose down -v` có thể xóa dữ liệu MySQL và các volume liên quan. Không chạy lệnh này khi muốn giữ dữ liệu để demo/nộp bài.

## 12. Lỗi từng gặp và cách xử lý

**Lỗi khởi tạo MySQL do cột `password_hash` quá ngắn:** Khi chạy ban đầu, cột `password_hash` trong bảng người dùng cần tăng kích thước từ `VARCHAR(160)` lên `VARCHAR(255)`. Trên máy thực hành đã sửa schema và dữ liệu đang chạy. Nếu triển khai trên máy khác, đảm bảo file `db/init/001-schema.sql` định nghĩa `password_hash VARCHAR(255) NOT NULL`.

**Dashboard Grafana không có dữ liệu bộ nhớ:** Dùng PromQL theo `id` tại Mục 7 thay cho truy vấn theo nhãn `name`, sau đó reload Grafana khi cần.

**GitHub báo 403 khi push:** Tài khoản Git dùng xác thực phải có quyền ghi vào repository. Dự án đã chuyển `origin` sang repository do `dtc245220012` sở hữu và push thành công. Không cần tạo lại 3 commit.

## 13. Danh sách ảnh minh chứng cần đưa vào báo cáo

Bài thực hành yêu cầu **báo cáo tối thiểu 10 trang**, mô tả cấu trúc hệ thống, quá trình triển khai, kết quả và ảnh minh chứng. Nên có:

1. Repository GitHub, danh sách source, README và lịch sử **3 commit**.
2. Terminal `docker compose ps` với các dịch vụ hoạt động.
3. Website: đăng nhập, dashboard, sản phẩm, nhà cung cấp, nhập/xuất kho.
4. Kịch bản nhập `30`, xuất `7`, từ chối xuất `50`, tồn `23` (nếu đã thực hiện trên dữ liệu demo).
5. phpMyAdmin: bảng dữ liệu sản phẩm, lịch sử giao dịch.
6. Nginx: truy cập website qua reverse proxy, kết quả `curl.exe -I` có security headers.
7. Prometheus: màn hình **Targets 5/5 UP**.
8. Grafana: dashboard giám sát, biểu đồ **Memory by cgroup (MiB)**.
9. Grafana Explore: ảnh kết quả **3 truy vấn LogQL**.
10. Hardening: `id` người dùng non-root, Docker network isolation, `cap_drop`, `no-new-privileges`.

Không chụp màn hình để lộ mật khẩu trong `.env`, phiên đăng nhập hoặc token. Ảnh minh chứng cần phản ánh dữ liệu thực tế, không sử dụng ảnh minh họa thay cho kết quả chạy.

## 14. Phạm vi và hướng phát triển

Dự án hiện đáp ứng mục tiêu của bài thực hành triển khai ứng dụng nhiều dịch vụ trên Docker Compose, giám sát bằng Prometheus/Grafana, log tập trung bằng Loki/Promtail và áp dụng các kỹ thuật hardening cơ bản. Việc vận hành trên Internet cần thêm HTTPS, sao lưu định kỳ, phân quyền theo vai trò, giám sát cảnh báo, quản lý secret và kiểm thử tải/bảo mật.

---

**Ghi chú:** README là tài liệu hướng dẫn triển khai và tổng hợp kết quả; **không thay thế báo cáo Word tối thiểu 10 trang** theo đề bài. Các bằng chứng thực tế cần được trình bày trong báo cáo riêng.
