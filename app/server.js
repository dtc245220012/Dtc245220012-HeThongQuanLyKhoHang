'use strict';
// Student demo: Express + MySQL, safe stock transactions, parameterized SQL,
// hashed credentials, DB-backed session cookies and form CSRF protection.
const express = require('express');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const client = require('prom-client');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'inventory_app',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'inventory',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  decimalNumbers: false
});

const metrics = new client.Registry();
client.collectDefaultMetrics({ register: metrics, prefix: 'inventory_node_' });
const httpCounter = new client.Counter({
  name: 'inventory_http_requests_total', help: 'Requests served by inventory app',
  labelNames: ['method', 'route', 'status'], registers: [metrics]
});
const httpLatency = new client.Histogram({
  name: 'inventory_http_request_seconds', help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'], buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metrics]
});

const logFile = '/var/log/inventory/app.log';
function log(level, event, message, extra = {}) {
  const entry = { time: new Date().toISOString(), level, event, message, ...extra };
  const line = JSON.stringify(entry);
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n'); }
  catch (err) { console.error('log file unavailable', err.message); }
}

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const qtyFmt = num => Number(num || 0).toLocaleString('vi-VN');
const dateFmt = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '';
const notice = (message, type = 'info') => `<div class="notice ${type}">${esc(message)}</div>`;
const formToken = req => `<input type="hidden" name="_csrf" value="${esc(req.session.csrf_token)}">`;

function layout(req, title, body, status = 200) {
  const authed = !!req.session;
  const current = req.path;
  const nav = authed ? `
    <aside class="sidebar">
      <div class="brand-mark">▣ <span>INVENTORY</span><small>WAREHOUSE MANAGEMENT</small></div>
      <nav>
        <a class="${current === '/' ? 'active' : ''}" href="/">▦ Tổng quan</a>
        <a class="${current.startsWith('/products') ? 'active' : ''}" href="/products">▤ Hàng hóa</a>
        <a class="${current.startsWith('/suppliers') ? 'active' : ''}" href="/suppliers">♧ Nhà cung cấp</a>
        <a class="${current.startsWith('/movements') ? 'active' : ''}" href="/movements">⇄ Nhập / Xuất kho</a>
      </nav>
      <div class="sidebar-bottom"><span>Đăng nhập: ${esc(req.session.username)}</span>
        <form method="post" action="/logout">${formToken(req)}<button type="submit" class="logout">Đăng xuất ↗</button></form>
      </div>
    </aside>` : '';
  return { status, html: `<!doctype html><html lang="vi"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)} | Inventory</title><link rel="stylesheet" href="/style.css"></head>
    <body class="${authed ? 'logged-in' : 'login-mode'}">${nav}
    <main class="${authed ? 'main-content' : 'login-content'}">
      ${authed ? `<header class="topbar"><div><small>HỆ THỐNG QUẢN LÝ KHO HÀNG</small><h1>${esc(title)}</h1></div><div class="avatar">AD</div></header>` : ''}
      ${body}
      <footer class="footer">Đề tài 5 · Triển khai và Quản trị Hệ thống Phần mềm · Demo học phần</footer>
    </main></body></html>` };
}
function sendPage(req, res, title, body, status = 200) {
  const response = layout(req, title, body, status);
  return res.status(response.status).type('html').send(response.html);
}
const linkButton = (label, url, variant = '') => `<a class="btn ${variant}" href="${url}">${label}</a>`;
const cell = v => `<td>${esc(v)}</td>`;
const required = s => String(s || '').trim();
const positiveInt = v => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const nonnegativeInt = v => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v));
const UserError = class extends Error { constructor(message, status = 400) { super(message); this.status = status; } };

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route ? String(req.route.path) : 'unmatched';
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    httpCounter.inc({ method: req.method, route, status: String(res.statusCode) });
    httpLatency.observe({ method: req.method, route }, duration);
    log('info', 'http_request', `${req.method} ${req.path}`, { status: res.statusCode, duration_ms: Math.round(duration * 1000) });
  });
  next();
});
app.get('/healthz', wrap(async (req, res) => {
  await pool.query('SELECT 1 AS ok');
  res.json({ status: 'ok', database: 'connected' });
}));
app.get('/metrics', wrap(async (req, res) => {
  // app is on private Docker networks, while public nginx blocks /metrics.
  res.set('Content-Type', metrics.contentType);
  res.end(await metrics.metrics());
}));

app.use(wrap(async (req, res, next) => {
  const raw = req.cookies.inventory_session;
  if (typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw)) {
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const [sessions] = await pool.execute(
      'SELECT s.csrf_token, u.id AS user_id, u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > NOW()',
      [tokenHash]
    );
    if (sessions.length) req.session = sessions[0];
  }
  if (!req.session && !['/login', '/healthz', '/metrics'].includes(req.path)) return res.redirect('/login');
  next();
}));
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.path === '/login') return next();
  if (!req.session || !req.body || typeof req.body._csrf !== 'string') return next(new UserError('Thiếu mã bảo vệ biểu mẫu.', 403));
  const supplied = Buffer.from(req.body._csrf);
  const original = Buffer.from(req.session.csrf_token);
  if (supplied.length !== original.length || !crypto.timingSafeEqual(supplied, original)) return next(new UserError('Mã bảo vệ biểu mẫu không hợp lệ.', 403));
  next();
});

const attempts = new Map();
app.get('/login', (req, res) => {
  if (req.session) return res.redirect('/');
  return sendPage(req, res, 'Đăng nhập', `<section class="login-card"><div class="login-logo">▣</div>
    <p class="eyebrow">QUẢN LÝ KHO THÔNG MINH</p><h1>Chào mừng trở lại</h1>
    <p class="muted">Đăng nhập bằng tài khoản quản trị khai báo trong tệp .env.</p>
    <form method="post" action="/login" class="stack"><label>Tên đăng nhập<input name="username" maxlength="80" required autocomplete="username"></label>
      <label>Mật khẩu<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn primary" type="submit">Đăng nhập →</button></form></section>`);
});
app.post('/login', wrap(async (req, res) => {
  const ip = req.ip || 'unknown';
  const attempt = attempts.get(ip) || { count: 0, last: 0 };
  if (Date.now() - attempt.last > 15 * 60 * 1000) attempt.count = 0;
  if (attempt.count >= 12) throw new UserError('Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.', 429);
  const username = required(req.body.username);
  const password = String(req.body.password || '');
  const [users] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username=?', [username]);
  const valid = users.length && verifyPassword(password, users[0].password_hash);
  if (!valid) {
    attempts.set(ip, { count: attempt.count + 1, last: Date.now() });
    log('warn', 'login_failed', 'Dang nhap khong thanh cong', { username });
    return sendPage(req, res, 'Đăng nhập thất bại', `<section class="login-card">${notice('Sai tên đăng nhập hoặc mật khẩu.', 'danger')}
      <h2>Không thể đăng nhập</h2>${linkButton('← Quay lại đăng nhập', '/login', 'primary')}</section>`, 401);
  }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  await pool.execute('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))', [tokenHash, users[0].id, csrf]);
  res.cookie('inventory_session', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 86400000, path: '/' });
  log('info', 'login_success', 'Dang nhap thanh cong', { username });
  res.redirect('/');
}));
app.post('/logout', wrap(async (req, res) => {
  const raw = req.cookies.inventory_session;
  if (raw) await pool.execute('DELETE FROM sessions WHERE token_hash=?', [crypto.createHash('sha256').update(raw).digest('hex')]);
  res.clearCookie('inventory_session', { path: '/' });
  res.redirect('/login');
}));

app.get('/', wrap(async (req, res) => {
  const [[counts]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM products) AS products,
    (SELECT COUNT(*) FROM suppliers) AS suppliers,
    (SELECT COALESCE(SUM(stock_qty),0) FROM products) AS units,
    (SELECT COUNT(*) FROM products WHERE stock_qty <= min_stock) AS low_stock`);
  const [lowProducts] = await pool.query('SELECT sku,name,stock_qty,min_stock,unit FROM products WHERE stock_qty<=min_stock ORDER BY stock_qty ASC LIMIT 8');
  const [moves] = await pool.query(`SELECT m.kind,m.qty,m.created_at,p.name,p.sku FROM stock_movements m JOIN products p ON m.product_id=p.id ORDER BY m.id DESC LIMIT 6`);
  const card = (label, value, note, icon) => `<div class="stat"><div class="stat-icon">${icon}</div><div class="stat-value">${qtyFmt(value)}</div><div class="stat-label">${label}</div><div class="stat-note">${note}</div></div>`;
  const low = lowProducts.map(p => `<tr>${cell(p.sku)}${cell(p.name)}<td><span class="pill danger">${qtyFmt(p.stock_qty)} ${esc(p.unit)}</span></td>${cell(p.min_stock)}</tr>`).join('');
  const recent = moves.map(m => `<tr><td>${m.kind === 'IN' ? '<span class="pill success">Nhập kho</span>' : '<span class="pill warning">Xuất kho</span>'}</td>${cell(m.sku)}${cell(m.name)}${cell(m.qty)}${cell(dateFmt(m.created_at))}</tr>`).join('');
  return sendPage(req, res, 'Tổng quan kho hàng', `<div class="intro"><div><h2>Chào mừng đến bảng điều khiển 👋</h2><p>Thống kê tổng quan, theo dõi tồn kho và hoạt động xuất nhập gần đây.</p></div>
    ${linkButton('+ Nhập kho', '/movements/new?kind=IN', 'primary')}</div>
    <div class="stats-grid">${card('Sản phẩm', counts.products, 'Danh mục đang quản lý', '▣')}${card('Nhà cung cấp', counts.suppliers, 'Đối tác đã tạo', '♧')}${card('Tổng đơn vị tồn', counts.units, 'Số lượng hiện trong kho', '▥')}${card('Hàng sắp hết', counts.low_stock, 'Tồn ≤ ngưỡng cảnh báo', '⚠')}</div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h3>⚠ Danh sách hàng sắp hết</h3>${linkButton('Xem tất cả', '/products')}</div>
      <div class="table-wrap"><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Hiện có</th><th>Ngưỡng</th></tr></thead><tbody>${low || '<tr><td colspan="4">Chưa có sản phẩm cần cảnh báo.</td></tr>'}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><h3>⇄ Giao dịch mới nhất</h3>${linkButton('Xem lịch sử', '/movements')}</div>
      <div class="table-wrap"><table><thead><tr><th>Loại</th><th>Mã</th><th>Sản phẩm</th><th>SL</th><th>Ngày</th></tr></thead><tbody>${recent || '<tr><td colspan="5">Chưa có giao dịch.</td></tr>'}</tbody></table></div></section></div>`);
}));

app.get('/suppliers', wrap(async (req, res) => {
  const [items] = await pool.query('SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id=s.id) AS product_count FROM suppliers s ORDER BY s.id DESC');
  const trs = items.map(s => `<tr>${cell(s.id)}<td><strong>${esc(s.name)}</strong></td>${cell(s.contact_name)}${cell(s.phone)}${cell(s.email)}${cell(s.product_count)}<td class="actions">${linkButton('Sửa', `/suppliers/${s.id}/edit`, 'outline')}
    <form method="post" action="/suppliers/${s.id}/delete">${formToken(req)}<button type="submit" class="btn danger-outline">Xóa</button></form></td></tr>`).join('');
  sendPage(req, res, 'Nhà cung cấp', `<div class="page-actions"><p>Thông tin đối tác và đơn vị cung ứng.</p>${linkButton('+ Thêm nhà cung cấp', '/suppliers/new', 'primary')}</div>
  <section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Tên nhà cung cấp</th><th>Người liên hệ</th><th>Điện thoại</th><th>Email</th><th>Số sản phẩm</th><th>Thao tác</th></tr></thead><tbody>${trs || '<tr><td colspan="7">Chưa có nhà cung cấp.</td></tr>'}</tbody></table></div></section>`);
}));
function supplierForm(req, s = {}, action = '/suppliers') {
  const inp = (label, name, type = 'text', requiredField = false) => `<label>${label}<input type="${type}" name="${name}" value="${esc(s[name])}" maxlength="${name === 'address' ? 255 : 160}" ${requiredField ? 'required' : ''}></label>`;
  return `<section class="panel form-panel"><form method="post" action="${action}" class="stack">${formToken(req)}<div class="form-grid">
    ${inp('Tên nhà cung cấp *', 'name', 'text', true)}${inp('Người liên hệ', 'contact_name')}${inp('Số điện thoại', 'phone')}${inp('Email', 'email')}
    <div class="full">${inp('Địa chỉ', 'address')}</div></div><div class="form-actions"><a class="btn outline" href="/suppliers">Hủy</a><button class="btn primary" type="submit">Lưu nhà cung cấp</button></div></form></section>`;
}
app.get('/suppliers/new', (req, res) => sendPage(req, res, 'Thêm nhà cung cấp', supplierForm(req)));
app.post('/suppliers', wrap(async (req, res) => {
  const name = required(req.body.name);
  if (!name || name.length > 180) throw new UserError('Tên nhà cung cấp không hợp lệ.');
  const fields = ['contact_name', 'phone', 'email', 'address'].map(k => required(req.body[k]));
  await pool.execute('INSERT INTO suppliers(name,contact_name,phone,email,address) VALUES(?,?,?,?,?)', [name, ...fields]);
  log('info', 'supplier_created', 'Them nha cung cap', { name, actor: req.session.username });
  res.redirect('/suppliers');
}));
app.get('/suppliers/:id/edit', wrap(async (req, res) => {
  const [[s]] = await pool.execute('SELECT * FROM suppliers WHERE id=?', [req.params.id]);
  if (!s) throw new UserError('Không tìm thấy nhà cung cấp.', 404);
  sendPage(req, res, 'Sửa nhà cung cấp', supplierForm(req, s, `/suppliers/${s.id}/edit`));
}));
app.post('/suppliers/:id/edit', wrap(async (req, res) => {
  const name = required(req.body.name);
  if (!name || name.length > 180) throw new UserError('Tên nhà cung cấp không hợp lệ.');
  await pool.execute('UPDATE suppliers SET name=?, contact_name=?, phone=?, email=?, address=? WHERE id=?', [name, ...['contact_name', 'phone', 'email', 'address'].map(k => required(req.body[k])), req.params.id]);
  res.redirect('/suppliers');
}));
app.post('/suppliers/:id/delete', wrap(async (req, res) => {
  await pool.execute('DELETE FROM suppliers WHERE id=?', [req.params.id]);
  log('info', 'supplier_deleted', 'Xoa nha cung cap', { supplier_id: req.params.id });
  res.redirect('/suppliers');
}));

app.get('/products', wrap(async (req, res) => {
  const term = required(req.query.q).slice(0, 100);
  const [items] = await pool.execute(`SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id
    WHERE p.name LIKE ? OR p.sku LIKE ? ORDER BY p.id DESC LIMIT 300`, [`%${term}%`, `%${term}%`]);
  const trs = items.map(p => `<tr><td><span class="sku">${esc(p.sku)}</span></td><td><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></td>
    ${cell(p.supplier_name || '—')}<td><strong>${qtyFmt(p.stock_qty)}</strong> ${esc(p.unit)}</td>
    <td>${p.stock_qty <= p.min_stock ? '<span class="pill danger">Sắp hết</span>' : '<span class="pill success">Còn hàng</span>'}</td><td class="actions">${linkButton('Sửa', `/products/${p.id}/edit`, 'outline')}
    <form method="post" action="/products/${p.id}/delete">${formToken(req)}<button class="btn danger-outline" type="submit">Xóa</button></form></td></tr>`).join('');
  sendPage(req, res, 'Quản lý hàng hóa', `<div class="page-actions"><form class="search" method="get"><input name="q" placeholder="Tìm theo mã hoặc tên..." value="${esc(term)}"><button class="btn outline">Tìm kiếm</button></form>
    ${linkButton('+ Thêm sản phẩm', '/products/new', 'primary')}</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Mã sản phẩm</th><th>Tên / Danh mục</th><th>Nhà cung cấp</th><th>Tồn kho</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
    <tbody>${trs || '<tr><td colspan="6">Không tìm thấy sản phẩm.</td></tr>'}</tbody></table></div></section><p class="hint">Lượng tồn kho chỉ được cập nhật thông qua nghiệp vụ Nhập / Xuất; không sửa trực tiếp trong sản phẩm.</p>`);
}));
async function productForm(req, p = {}, action = '/products') {
  const [suppliers] = await pool.query('SELECT id,name FROM suppliers ORDER BY name');
  const options = suppliers.map(s => `<option value="${s.id}" ${Number(p.supplier_id) === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const input = (label, name, attr = '') => `<label>${label}<input name="${name}" value="${esc(p[name])}" ${attr}></label>`;
  return `<section class="panel form-panel"><form method="post" action="${action}" class="stack">${formToken(req)}<div class="form-grid">
    ${input('Mã hàng (SKU) *', 'sku', 'required maxlength="64"')}${input('Tên sản phẩm *', 'name', 'required maxlength="180"')}
    ${input('Danh mục', 'category', 'maxlength="100" placeholder="VD: Điện tử"')}${input('Đơn vị tính', 'unit', 'maxlength="30" placeholder="cái, thùng, kg"')}
    <label>Nhà cung cấp<select name="supplier_id"><option value="">-- Chưa chọn --</option>${options}</select></label>
    <label>Ngưỡng cảnh báo tồn kho<input name="min_stock" type="number" min="0" max="999999999" value="${esc(p.min_stock == null ? 5 : p.min_stock)}" required></label>
    </div><p class="hint">Số lượng tồn kho được tính từ phiếu nhập và xuất, không nhập thủ công ở đây.</p>
    <div class="form-actions"><a href="/products" class="btn outline">Hủy</a><button type="submit" class="btn primary">Lưu sản phẩm</button></div></form></section>`;
}
app.get('/products/new', wrap(async (req, res) => sendPage(req, res, 'Thêm sản phẩm', await productForm(req))));
async function parseProduct(req) {
  const sku = required(req.body.sku);
  const name = required(req.body.name);
  const category = required(req.body.category) || 'Khác';
  const unit = required(req.body.unit) || 'cái';
  const minStock = req.body.min_stock;
  const supplierId = required(req.body.supplier_id) || null;
  if (!sku || !name || sku.length > 64 || name.length > 180 || category.length > 100 || unit.length > 30) throw new UserError('Tên, mã hoặc thông tin sản phẩm không hợp lệ.');
  if (!nonnegativeInt(minStock) || Number(minStock) > 999999999) throw new UserError('Ngưỡng tồn kho phải là số nguyên không âm.');
  if (supplierId && !positiveInt(supplierId)) throw new UserError('Mã nhà cung cấp không hợp lệ.');
  return [sku, name, category, unit, supplierId, Number(minStock)];
}
app.post('/products', wrap(async (req, res) => {
  const p = await parseProduct(req);
  await pool.execute('INSERT INTO products(sku,name,category,unit,supplier_id,min_stock) VALUES(?,?,?,?,?,?)', p);
  log('info', 'product_created', 'Them hang hoa', { sku: p[0], actor: req.session.username });
  res.redirect('/products');
}));
app.get('/products/:id/edit', wrap(async (req, res) => {
  const [[p]] = await pool.execute('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!p) throw new UserError('Không tìm thấy sản phẩm.', 404);
  sendPage(req, res, 'Sửa sản phẩm', await productForm(req, p, `/products/${p.id}/edit`));
}));
app.post('/products/:id/edit', wrap(async (req, res) => {
  const p = await parseProduct(req);
  await pool.execute('UPDATE products SET sku=?,name=?,category=?,unit=?,supplier_id=?,min_stock=? WHERE id=?', [...p, req.params.id]);
  res.redirect('/products');
}));
app.post('/products/:id/delete', wrap(async (req, res) => {
  // Prevent loss of audit history: FK RESTRICT if movement exists.
  await pool.execute('DELETE FROM products WHERE id=?', [req.params.id]);
  res.redirect('/products');
}));

app.get('/movements', wrap(async (req, res) => {
  const [items] = await pool.query(`SELECT m.*, p.sku,p.name,u.username FROM stock_movements m
    JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 150`);
  const trs = items.map(m => `<tr>${cell(m.id)}<td>${m.kind === 'IN' ? '<span class="pill success">Nhập kho</span>' : '<span class="pill warning">Xuất kho</span>'}</td>
    ${cell(m.sku)}${cell(m.name)}<td><strong>${qtyFmt(m.qty)}</strong></td>${cell(m.reference_code || '—')}${cell(m.username)}${cell(dateFmt(m.created_at))}${cell(m.note || '—')}</tr>`).join('');
  sendPage(req, res, 'Lịch sử nhập / xuất kho', `<div class="page-actions"><p>Ghi nhận giao dịch phát sinh, tự động cập nhật tồn kho.</p><div class="buttons">${linkButton('+ Nhập kho', '/movements/new?kind=IN', 'primary')}${linkButton('− Xuất kho', '/movements/new?kind=OUT', 'outline')}</div></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Loại</th><th>SKU</th><th>Hàng hóa</th><th>Số lượng</th><th>Mã chứng từ</th><th>Người lập</th><th>Thời gian</th><th>Ghi chú</th></tr></thead><tbody>${trs || '<tr><td colspan="9">Chưa phát sinh giao dịch.</td></tr>'}</tbody></table></div></section>`);
}));
app.get('/movements/new', wrap(async (req, res) => {
  const kind = req.query.kind === 'OUT' ? 'OUT' : 'IN';
  const [products] = await pool.query('SELECT id,sku,name,stock_qty,unit FROM products ORDER BY name');
  const opts = products.map(p => `<option value="${p.id}">${esc(p.sku)} — ${esc(p.name)} (tồn: ${qtyFmt(p.stock_qty)} ${esc(p.unit)})</option>`).join('');
  sendPage(req, res, kind === 'IN' ? 'Tạo phiếu nhập kho' : 'Tạo phiếu xuất kho', `<section class="panel form-panel">
    <form method="post" action="/movements" class="stack">${formToken(req)}
      <input type="hidden" name="kind" value="${kind}">
      <div class="form-grid"><label>Sản phẩm *<select name="product_id" required><option value="">-- Chọn sản phẩm --</option>${opts}</select></label>
      <label>Số lượng *<input name="qty" type="number" min="1" max="100000000" value="1" required></label>
      <label>Mã chứng từ<input name="reference_code" maxlength="64" placeholder="VD: PN001 / PX001"></label>
      <label>Ghi chú<input name="note" maxlength="255" placeholder="Lý do nhập / xuất hàng"></label></div>
      <p class="hint">${kind === 'OUT' ? 'Chỉ được xuất khi lượng tồn kho đủ. Hệ thống kiểm tra tồn kho trong giao dịch MySQL.' : 'Sau khi nhập kho, số lượng sẽ được cộng và ghi vào lịch sử.'}</p>
      <div class="form-actions"><a href="/movements" class="btn outline">Hủy</a><button class="btn primary" type="submit">${kind === 'IN' ? 'Xác nhận nhập kho' : 'Xác nhận xuất kho'}</button></div>
    </form></section>`);
}));
app.post('/movements', wrap(async (req, res) => {
  const kind = required(req.body.kind);
  const qty = req.body.qty;
  const productId = req.body.product_id;
  const ref = required(req.body.reference_code);
  const note = required(req.body.note);
  if (!['IN', 'OUT'].includes(kind) || !positiveInt(productId) || !positiveInt(qty) || Number(qty) > 100000000 || ref.length > 64 || note.length > 255) throw new UserError('Thông tin phiếu nhập / xuất không hợp lệ.');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [[p]] = await c.execute('SELECT id,sku,stock_qty FROM products WHERE id=? FOR UPDATE', [productId]);
    if (!p) throw new UserError('Sản phẩm không tồn tại.', 404);
    if (kind === 'OUT' && Number(p.stock_qty) < Number(qty)) throw new UserError(`Không đủ tồn kho. Mã ${p.sku} chỉ còn ${p.stock_qty} sản phẩm.`);
    if (kind === 'IN' && Number(p.stock_qty) + Number(qty) > 4294967295) throw new UserError('Số lượng nhập vượt giới hạn lưu trữ.');
    await c.execute(`UPDATE products SET stock_qty=stock_qty ${kind === 'IN' ? '+' : '-'} ? WHERE id=?`, [Number(qty), productId]);
    await c.execute('INSERT INTO stock_movements(product_id,user_id,kind,qty,reference_code,note) VALUES(?,?,?,?,?,?)', [productId, req.session.user_id, kind, Number(qty), ref || null, note || null]);
    await c.commit();
    log('info', kind === 'IN' ? 'stock_in' : 'stock_out', 'Giao dich kho thanh cong', { sku: p.sku, qty: Number(qty), actor: req.session.username });
    res.redirect('/movements');
  } catch (err) {
    await c.rollback();
    throw err;
  } finally { c.release(); }
}));

app.use((req, res) => sendPage(req, res, 'Không tìm thấy', `<section class="panel"><h2>404 — Không tìm thấy trang</h2>${linkButton('Về trang chủ', '/', 'primary')}</section>`, 404));
app.use((err, req, res, next) => {
  const duplicate = err.code === 'ER_DUP_ENTRY';
  const related = err.code === 'ER_ROW_IS_REFERENCED_2';
  const fk = err.code === 'ER_NO_REFERENCED_ROW_2';
  const status = err.status || (duplicate || related || fk ? 400 : 500);
  const msg = duplicate ? 'Mã SKU hoặc dữ liệu đã tồn tại, không thể lưu trùng.' :
    related ? 'Không thể xóa sản phẩm đã có lịch sử nhập / xuất.' :
    fk ? 'Nhà cung cấp hoặc sản phẩm được chọn không tồn tại.' :
    err.status ? err.message : 'Có lỗi hệ thống. Kiểm tra docker compose logs app.';
  log('error', 'request_error', err.message, { code: err.code, path: req.path, status });
  if (res.headersSent) return next(err);
  return sendPage(req, res, 'Thông báo', `<section class="panel form-panel">${notice(msg, 'danger')}<p>Quay lại trang trước để kiểm tra và nhập lại thông tin.</p>
    ${linkButton('Về tổng quan', '/', 'outline')}</section>`, status);
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}
function verifyPassword(password, packed) {
  try {
    const [alg, salt, digest] = packed.split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(digest, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}
async function bootstrap() {
  if (!process.env.DB_PASSWORD || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16) {
    throw new Error('Missing DB_PASSWORD or ADMIN_PASSWORD (min 16 characters)');
  }
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const [existing] = await pool.execute('SELECT id FROM users WHERE username=?', [adminUsername]);
  if (!existing.length) {
    await pool.execute('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [adminUsername, hashPassword(process.env.ADMIN_PASSWORD), 'ADMIN']);
    log('info', 'admin_created', 'Khoi tao tai khoan quan tri', { username: adminUsername });
  }
  await pool.execute('DELETE FROM sessions WHERE expires_at < NOW()');
  app.listen(PORT, '0.0.0.0', () => log('info', 'startup', 'Inventory app started', { port: PORT }));
}
bootstrap().catch(err => { log('error', 'startup_error', err.message); process.exit(1); });
