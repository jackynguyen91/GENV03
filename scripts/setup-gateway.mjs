// Cài cổng cfGateway + GATEWAY_SECRET chỉ bằng MỘT lệnh:   npm run setup:gateway
//
// Script làm lần lượt:
//   1. Tạo mã GATEWAY_SECRET ngẫu nhiên (hoặc dùng lại mã trong .dev.vars nếu đã có).
//   2. Lưu mã vào .dev.vars (file này đã bị .gitignore chặn, KHÔNG lên GitHub).
//   3. base44 secrets set GATEWAY_SECRET=...        (đặt secret bên Base44)
//   4. base44 functions deploy cfGateway             (đưa function cổng lên Base44)
//   5. wrangler secret put GATEWAY_SECRET            (đặt cùng mã bên Cloudflare Worker)
//
// Tuỳ chọn:  --secret=<mã>  dùng mã có sẵn | --skip-base44 | --skip-cloudflare
// Yêu cầu: đã chạy `base44 login` + `base44 link` (bước 3 trong HUONG-DAN-CLOUDFLARE.md)
// và Worker đã được deploy ít nhất một lần (để lệnh wrangler secret put tìm thấy Worker).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const DEV_VARS = ".dev.vars";
const readSavedSecret = () => {
  if (!existsSync(DEV_VARS)) return "";
  return readFileSync(DEV_VARS, "utf8").match(/^GATEWAY_SECRET=(\S+)/m)?.[1] ?? "";
};

const secret = option("secret") || readSavedSecret() || randomBytes(24).toString("hex");
if (!/^[A-Za-z0-9_-]{24,}$/.test(secret)) {
  console.error("GATEWAY_SECRET phải dài từ 24 ký tự và chỉ gồm chữ, số, '-' hoặc '_'.");
  process.exit(1);
}

const run = (title, command, commandArgs, input) => {
  console.log(`\n==> ${title}`);
  const result = spawnSync(command, commandArgs, {
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    input,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n[!] Bước "${title}" lỗi. Sửa lỗi rồi chạy lại: npm run setup:gateway   (mã bí mật được giữ nguyên trong ${DEV_VARS})`);
    process.exit(result.status ?? 1);
  }
};

// 1-2. Lưu mã để lần chạy sau (và chạy local) dùng lại đúng mã này.
writeFileSync(DEV_VARS, `GATEWAY_SECRET=${secret}\n`);
console.log(`Đã lưu GATEWAY_SECRET vào ${DEV_VARS} (không commit file này).`);

// 3-4. Base44.
if (!flag("skip-base44")) {
  run("Đặt GATEWAY_SECRET trên Base44", "npx", ["--yes", "base44@latest", "secrets", "set", `GATEWAY_SECRET=${secret}`]);
  run("Deploy function cfGateway lên Base44", "npx", ["--yes", "base44@latest", "functions", "deploy", "cfGateway"]);
}

// 5. Cloudflare (mã được đưa qua stdin, không hiện trong lịch sử lệnh).
if (!flag("skip-cloudflare")) {
  run("Đặt GATEWAY_SECRET trên Cloudflare Worker", "npx", ["wrangler", "secret", "put", "GATEWAY_SECRET"], `${secret}\n`);
}

console.log("\nXong. Mã GATEWAY_SECRET của bạn (lưu vào Notepad, và dán vào Cloudflare dashboard nếu bạn deploy bằng GitHub):");
console.log(`\n  ${secret}\n`);
console.log("Kiểm tra:  npm run check:gateway -- --url=https://<worker>.<tài-khoản>.workers.dev");
