# GenTravel chạy trên Cloudflare Workers (dữ liệu vẫn ở Base44)

App ID Base44: `6afd64fe9b61ca64e1609eca` (đã điền sẵn trong `app.config.json` và `wrangler.jsonc`). Tên Worker: `gentravel`.

## 0. Hiểu nhanh trước khi làm

```
Trình duyệt ─► Cloudflare Worker "gentravel"
                ├─ Giao diện + SSR + server function (chạy trên Cloudflare)
                ├─ /api/apps/**, /auth/**  ──proxy──►  Base44 (dữ liệu, đăng nhập, upload ảnh)
                └─ Thao tác quyền hệ thống (đặt tour, thanh toán, email)
                        └─► function cfGateway trên Base44, kèm GATEWAY_SECRET
```

**GATEWAY_SECRET là gì và vì sao KHÔNG nằm trong source code?**
Đó là "mật khẩu" giữa Worker và function `cfGateway`. Ai biết mã này đều đọc/ghi được toàn bộ dữ liệu (booking, khách hàng, thanh toán). Nếu ghi vào source rồi đưa lên GitHub, mã bị lộ. Vì vậy source chỉ **khai báo cách dùng**, còn **giá trị thật** được đặt ở đúng 2 nơi (cùng một mã):

| Nơi đặt | Cách đặt | Source đã chuẩn bị sẵn |
| --- | --- | --- |
| Base44 | `base44 secrets set GATEWAY_SECRET=...` | `base44/functions/cfGateway/entry.js` đọc secret này |
| Cloudflare Worker | Dashboard → Settings → Variables and Secrets, hoặc `wrangler secret put` | `src/lib/base44-server.server.js` đọc `env.GATEWAY_SECRET` |

Chạy local thì thêm file `.dev.vars` (mẫu: `.dev.vars.example`). Script `npm run setup:gateway` làm toàn bộ việc này giúp bạn.

## 1. Chuẩn bị (làm một lần)

1. Cài **Node.js 22 LTS** (https://nodejs.org), **Git**, **VS Code**. Kiểm tra: `node -v` (phải ≥ 20.19).
2. Tài khoản **Cloudflare** và **GitHub**.
3. **Publish app trên Base44**: mở app → nút **Publish** (góc trên bên phải) → chờ báo thành công. Chưa publish thì Base44 trả lỗi "This app is not yet available".
4. Giải nén `gentravel-cloudflare-v3.zip`, mở thư mục `gentravel` bằng VS Code, mở **Terminal** (Terminal → New Terminal). Các lệnh dưới đây chạy trong thư mục này, mỗi lần một lệnh.

```powershell
npm install
```

## 2. Deploy lần đầu để tạo Worker

```powershell
npx wrangler login
npm run deploy
```

Kết thúc in ra địa chỉ `https://gentravel.<tài-khoản>.workers.dev`. Mở địa chỉ đó: trang chủ phải hiện tour. (Đặt tour/thanh toán sẽ chưa chạy cho tới khi xong mục 3.)

## 3. Cài cổng cfGateway + GATEWAY_SECRET

### Cách A – Tự động (khuyến nghị)

```powershell
npm install -g base44@latest
base44 login
base44 link
npm run setup:gateway
```

- `base44 login`: mở link, nhập mã, đăng nhập tài khoản Base44 đã tạo app.
- `base44 link`: chọn **liên kết với dự án đã có**, chọn app GenTravel (`6afd64fe9b61ca64e1609eca`).
- `npm run setup:gateway`: tự tạo mã ngẫu nhiên, đặt secret trên Base44, deploy `cfGateway`, đặt secret trên Worker, lưu bản local vào `.dev.vars`, và **in mã ra cuối cùng, hãy lưu vào Notepad** (cần khi bạn deploy bằng GitHub ở mục 5).
- Chạy lại bao nhiêu lần cũng được: script dùng lại mã đã lưu trong `.dev.vars`, nên hai bên không bị lệch.

### Cách B – Thủ công

```powershell
# 1) Tạo mã (40 ký tự), lưu vào Notepad
-join ((1..40) | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] })

# 2) Đặt bên Base44 (không có khoảng trắng quanh dấu =)
base44 secrets set GATEWAY_SECRET=<dán-mã>

# 3) Đưa function lên Base44 (KHÔNG dùng "base44 deploy" trần, lệnh đó đẩy cả entity và site)
base44 functions deploy cfGateway

# 4) Đặt bên Cloudflare (dán mã khi được hỏi)
npx wrangler secret put GATEWAY_SECRET
```

Hoặc bước 4 trên web: Cloudflare → **Workers & Pages** → `gentravel` → **Settings** → **Variables and Secrets** → **Add** → Type **Secret**, Name `GATEWAY_SECRET`, Value là mã → **Deploy**.

> Quan trọng: phải là **Variables and Secrets** của Worker (chạy thật). **Không** đặt ở "Build variables and secrets" (mục đó chỉ có tác dụng lúc build, Worker sẽ không thấy).

Sau khi đặt secret trên Base44, hãy **Publish lại app một lần** để bản đã publish nhận secret mới.

## 4. Kiểm tra

Mở `https://gentravel.<tài-khoản>.workers.dev/api/diag` (hoặc `npm run check:gateway -- --url=https://gentravel.<tài-khoản>.workers.dev`). Kết quả đúng:

| Trường | Giá trị đúng |
| --- | --- |
| `appIdLooksValid` | `true` |
| `readTours.status` | `200` |
| `gatewaySecretSetOnCloudflare` | `true` |
| `gatewayAuthenticated.ok` | `true` (mã hai bên khớp) |
| `cfGatewayDeployed.status` | `401` (function đang chặn mã sai) |

Đọc `gatewayAuthenticated.hint` để biết sai ở đâu: **401** = mã Cloudflare khác mã Base44; **404** = chưa deploy cfGateway; **503** = chưa đặt secret bên Base44.

Sau đó thử thật: đặt 1 tour thử (hiện mã `BK-xxxx`, có đơn trong admin), đăng nhập `/login` bằng tài khoản admin, upload ảnh tour.

## 5. Tự động deploy từ GitHub (Workers Builds)

1. Đưa code lên GitHub (đổi tên repo nếu khác):
```powershell
git init
git add .
git commit -m "GenTravel on Cloudflare"
git branch -M main
git remote add origin https://github.com/jackynguyen91/gentravel.git
git push -u origin main
```
   `.gitignore` đã chặn `node_modules`, `dist`, `.dev.vars`, `base44/.app.jsonc`, nên mã bí mật không bị đẩy lên.
2. Cloudflare → **Workers & Pages** → Worker `gentravel` → **Settings** → **Builds** → **Connect** repo GitHub.
3. Điền: **Build command** `npm run build`, **Deploy command** `npx wrangler deploy`, **Root directory** là thư mục chứa `package.json`.
4. Secret `GATEWAY_SECRET` đã đặt ở mục 3 sẽ **được giữ nguyên** qua các lần deploy (deploy không xoá secret). Nếu chưa đặt thì làm theo mục 3, cách B bước 4.
5. Mỗi lần `git push`, Cloudflare tự build và deploy. Xem lỗi ở tab **Builds**.

## 6. Tên miền riêng

Workers & Pages → `gentravel` → **Settings → Domains & Routes → Add → Custom domain** (domain phải dùng nameserver Cloudflare). Nếu đăng nhập Google/MFA báo lỗi redirect trên domain mới, xem mục 7.

## 7. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| "This app is not yet available" | Publish app trên Base44, kiểm tra App ID trùng URL của app đã publish |
| "Chưa cấu hình App ID Base44" | Sửa `app.config.json` rồi build/deploy lại |
| Trang có nhưng không có tour | App ID sai, hoặc entity `Tour` chưa cho đọc công khai |
| Đặt tour báo "Thiếu GATEWAY_SECRET" | Chưa đặt secret ở Worker (mục 3), hoặc đặt nhầm vào Build variables |
| Đặt tour báo 401 | Mã hai bên khác nhau: chạy lại `npm run setup:gateway` |
| Đặt tour báo 404 | Chưa `base44 functions deploy cfGateway` |
| Đặt tour báo 503 | Chưa đặt secret bên Base44 (`base44 secrets set ...`), rồi Publish lại |
| Lỗi 1102 (CPU) | Gói Free giới hạn 10 ms CPU, nâng lên Workers Paid |
| Lỗi build do tên Worker | `"name"` trong `wrangler.jsonc` phải trùng đúng tên Worker trên Cloudflare |
| Google/MFA login lỗi | Đã proxy `/auth/**`; nếu Base44 chặn domain lạ thì nhờ hỗ trợ Base44 thêm domain |

Xem log thời gian thực: `npx wrangler tail`.

## 8. Lưu ý

- Dữ liệu, tài khoản, email, upload ảnh vẫn do Base44 cung cấp. Ngừng gói hoặc xoá app Base44 thì website mất dữ liệu.
- Đổi mã bí mật: chạy `npm run setup:gateway -- --secret=<mã-mới>` (cập nhật cả hai nơi) rồi Publish lại app trên Base44.
- Sau khi cài xong có thể xoá route `/api/diag` nếu không muốn công khai trạng thái kết nối (nó không trả bí mật hay dữ liệu).

## 9. Thay đổi so với bản v2

| File | Thay đổi |
| --- | --- |
| `base44/functions/cfGateway/entry.js` | Chuyển sang `Deno.serve` + đọc secret bằng `Deno.env`, ghim SDK `@0.8.6`; đã kiểm thử logic 401/403/503 |
| `wrangler.jsonc` | Thêm `BASE44_APP_ID` dự phòng, ghi chú rõ cách đặt `GATEWAY_SECRET` |
| `.dev.vars.example` (mới) | Mẫu khai báo `GATEWAY_SECRET` cho chạy local |
| `scripts/setup-gateway.mjs` (mới) | `npm run setup:gateway`: đặt secret ở cả Base44 và Cloudflare một lần |
| `scripts/check-gateway.mjs` (mới) | `npm run check:gateway`: kiểm tra kết nối |
| `src/lib/diag.server.js` | Thêm `gatewayAuthenticated` kiểm tra hai mã có khớp thật không |
| `vite.config.js` | Nhúng App ID vào cả bundle server và browser |
| `.node-version`, `package.json` | Ghim Node 22, thêm script và `engines` |
