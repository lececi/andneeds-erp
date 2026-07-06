// ANDNEEDS ERP - 29CM 주문 조회 중계 함수 (Vercel Serverless Function)
// 주소: /api/29cm-orders?from=YYYY-MM-DD&to=YYYY-MM-DD  (&debug=1 로 진단)
//
// Vercel 환경변수 (Sensitive):
//   NCM_OPEN_API_KEY  또는  NCM_CLIENT_ID / NCM_CLIENT_SECRET  중 하나가 29CM openApiKey
//   NCM_PARTNER_KEY   : 29CM Partner-Key (헤더)
//
// 인증: POST /api/v2/auth/token  { openApiKey } → accessToken
// 조회: GET  /api/v1/orders/search  (Authorization: Bearer, Partner-Key)

const BASE = "https://openapi.29cm.co.kr";

function pickToken(j) {
  const d = (j && j.data) || {};
  if (typeof d === "string") return d;
  return (
    d.accessToken || d.token || d.access_token || d.jwt || d.accessTokenValue ||
    (j && (j.accessToken || j.token)) || null
  );
}

// 넣어둔 키 후보들 중 실제로 토큰이 발급되는 것을 자동으로 찾는다.
async function getToken(diag) {
  const candidates = [
    ["NCM_OPEN_API_KEY", process.env.NCM_OPEN_API_KEY],
    ["NCM_CLIENT_ID", process.env.NCM_CLIENT_ID],
    ["NCM_CLIENT_SECRET", process.env.NCM_CLIENT_SECRET],
    ["NCM_PARTNER_KEY", process.env.NCM_PARTNER_KEY],
  ].filter((c) => c[1]).map((c) => [c[0], String(c[1]).trim()]);

  let lastMsg = "사용 가능한 키가 없습니다.";
  for (const [name, key] of candidates) {
    const r = await fetch(BASE + "/api/v2/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openApiKey: key }),
    });
    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch (e) {}
    if (r.ok && (j.result === "SUCCESS" || pickToken(j))) {
      const token = pickToken(j);
      if (token) {
        if (diag) diag.tokenFrom = name, diag.tokenRespKeys = Object.keys(j.data || {});
        return token;
      }
      lastMsg = "토큰 응답에서 값을 못 찾음: " + Object.keys(j.data || j || {}).join(",");
    } else {
      lastMsg = "[" + name + "] " + (j.message || ("HTTP " + r.status)) + " " + text.slice(0, 120);
    }
  }
  throw new Error("토큰 발급 실패 - " + lastMsg);
}

function kstParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return { date: k.toISOString().slice(0, 10), hour: k.getUTCHours() };
}

const CANCEL_STATUS = ["CANCELED", "RETURNED", "CANCELED_BY_EXCHANGE"];

function normalize(o) {
  const kp = kstParts(o.orderedAt);
  return {
    date: kp ? kp.date : "",
    hour: kp ? kp.hour : 12,
    product: o.itemName || "상품",
    qty: o.orderCount || 1,
    gross: o.sellAmount || 0,
    paid: o.saleAmount || 0,
    coupon: o.couponResultAmount || 0,
    point: o.preDiscountMileageAmount || 0,
    cust: o.orderName || o.receiverName || "",
    cancelled: CANCEL_STATUS.indexOf(o.orderItemCancelStatus) >= 0,
    orderSerial: o.orderSerial || "",
    status: o.orderStatusDescription || "",
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const hasKey = process.env.NCM_OPEN_API_KEY || process.env.NCM_CLIENT_ID || process.env.NCM_CLIENT_SECRET;
  if (!hasKey || !process.env.NCM_PARTNER_KEY) {
    res.status(500).json({
      error: "29CM API 키가 아직 설정되지 않았어요. Vercel 환경변수(NCM_OPEN_API_KEY 또는 NCM_CLIENT_ID/SECRET, 그리고 NCM_PARTNER_KEY)를 확인해주세요.",
    });
    return;
  }

  const diag = req.query.debug ? {} : null;
  try {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const ago30 = new Date(Date.now() + 9 * 3600 * 1000 - 30 * 864e5).toISOString().slice(0, 10);
    const fromDate = (req.query.from || ago30).slice(0, 10);
    const toDate = (req.query.to || today).slice(0, 10);
    const fromDateTime = fromDate + "T00:00:00+09:00";
    const toDateTime = toDate + "T23:59:59+09:00";

    const token = await getToken(diag);

    let page = 1, all = [], totalCount = 0;
    for (;;) {
      const url = new URL(BASE + "/api/v1/orders/search");
      url.searchParams.set("dateConditionType", "ORDERED_AT");
      url.searchParams.set("fromDateTime", fromDateTime);
      url.searchParams.set("toDateTime", toDateTime);
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", "500");

      const r = await fetch(url.toString(), {
        headers: { Authorization: "Bearer " + token, "Partner-Key": process.env.NCM_PARTNER_KEY },
      });
      const text = await r.text();
      if (!r.ok) throw new Error("주문 조회 실패 (" + r.status + "): " + text.slice(0, 300));
      let j = {};
      try { j = JSON.parse(text); } catch (e) { throw new Error("응답 파싱 실패: " + text.slice(0, 200)); }
      if (j.result && j.result !== "SUCCESS") throw new Error(j.message || j.errorCode || "조회 실패");
      const data = j.data || {};
      const list = data.resultList || [];
      totalCount = data.totalCount != null ? data.totalCount : list.length;
      if (diag && page === 1) diag.firstOrderKeys = list[0] ? Object.keys(list[0]) : [];
      all = all.concat(list);
      if (list.length === 0 || all.length >= totalCount || page >= 40) break;
      page++;
    }

    const orders = all.map(normalize);
    const out = { orders, totalCount: orders.length, from: fromDate, to: toDate };
    if (diag) out.diag = diag;
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e), diag });
  }
}
