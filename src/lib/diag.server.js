// Trang chẩn đoán kết nối Worker -> Base44 (mở /api/diag). Không trả bí mật, chỉ trạng thái.
import { env } from "cloudflare:workers";
import { getServerConfig } from "@/lib/base44-server.server";

async function probe(url, init) {
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    return { status: response.status, body: text.slice(0, 300) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

// Gọi cfGateway bằng GATEWAY_SECRET thật của Worker (chỉ đọc 1 dòng Tour, KHÔNG trả dữ liệu về, chỉ trả trạng thái).
// ok = true nghĩa là mã bí mật ở Cloudflare KHỚP với mã trên Base44.
async function probeGatewayAuth(base) {
  if (!env.GATEWAY_SECRET) return { ok: false, status: 0, hint: "Chưa đặt GATEWAY_SECRET trên Cloudflare Worker." };
  const result = await probe(`${base}/functions/cfGateway`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.GATEWAY_SECRET, op: "entity", entity: "Tour", method: "list", args: ["-created_date", 1] }),
  });
  const hints = { 401: "Mã ở Cloudflare KHÁC mã trên Base44.", 404: "Chưa deploy function cfGateway.", 503: "Chưa đặt GATEWAY_SECRET trên Base44." };
  return { ok: result.status === 200, status: result.status ?? 0, hint: result.status === 200 ? "Khớp." : (hints[result.status] ?? result.error ?? "Xem body.") };
}

export async function runDiagnostics() {
  const { appId, serverUrl } = getServerConfig();
  const base = `${serverUrl}/api/apps/${appId}`;
  return {
    appId,
    serverUrl,
    appIdLooksValid: /^[a-f0-9]{24}$/i.test(appId),
    gatewaySecretSetOnCloudflare: Boolean(env.GATEWAY_SECRET),
    // 200 + dữ liệu = Worker đọc được Base44.
    readTours: await probe(`${base}/entities/Tour/v2/list?limit=1`),
    // ok:true = Worker và Base44 dùng cùng một GATEWAY_SECRET (đặt tour, thanh toán, email sẽ chạy).
    gatewayAuthenticated: await probeGatewayAuth(base),
    // 401 = cfGateway đã deploy và đang chặn mã sai (đúng). 404 = chưa deploy cfGateway.
    cfGatewayDeployed: await probe(`${base}/functions/cfGateway`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "diagnostic" }),
    }),
  };
}
