// Kiểm tra nhanh kết nối:   npm run check:gateway -- --url=https://gentravel.<tài-khoản>.workers.dev
// Không cần --url thì chỉ kiểm tra phía Base44 (đọc Tour + cfGateway có chặn mã sai không).
import { readFileSync } from "node:fs";

const { base44AppId } = JSON.parse(readFileSync(new URL("../app.config.json", import.meta.url), "utf8"));
const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice(6)?.replace(/\/$/, "");

const call = async (url, init) => {
  try {
    const response = await fetch(url, init);
    return { status: response.status, body: (await response.text()).slice(0, 200) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
};

const base = `https://base44.app/api/apps/${base44AppId}`;
console.log(`App ID: ${base44AppId}`);

const tours = await call(`${base}/entities/Tour/v2/list?limit=1`);
console.log(`\n[Base44] Đọc Tour:      ${tours.status ?? tours.error}  ${tours.status === 200 ? "OK" : `→ ${tours.body ?? ""}`}`);

const gate = await call(`${base}/functions/cfGateway`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ secret: "kiem-tra-ma-sai" }),
});
const gateNote = { 401: "OK (function đã chạy và chặn mã sai)", 404: "CHƯA deploy cfGateway", 503: "Function có nhưng chưa đặt GATEWAY_SECRET trên Base44" }[gate.status] ?? gate.body ?? "";
console.log(`[Base44] cfGateway:     ${gate.status ?? gate.error}  ${gateNote}`);

if (urlArg) {
  const diag = await call(`${urlArg}/api/diag`);
  console.log(`\n[Cloudflare] ${urlArg}/api/diag → ${diag.status ?? diag.error}`);
  try {
    const full = await (await fetch(`${urlArg}/api/diag`)).json();
    console.log(`  App ID hợp lệ:                  ${full.appIdLooksValid}`);
    console.log(`  GATEWAY_SECRET có trên Worker:  ${full.gatewaySecretSetOnCloudflare}`);
    console.log(`  Worker đọc được Tour:           ${full.readTours?.status}`);
    console.log(`  Mã bí mật hai bên khớp nhau:    ${full.gatewayAuthenticated?.ok} (status ${full.gatewayAuthenticated?.status})`);
  } catch {
    console.log("  Không đọc được JSON, mở địa chỉ trên trong trình duyệt để xem chi tiết.");
  }
}
