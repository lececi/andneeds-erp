// ANDNEEDS ERP - 29CM 주문 조회 중계 함수 (Vercel Serverless Function)
// 주소: /api/29cm-orders?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// ⚠️ API 키는 코드에 넣지 말고, Vercel 환경변수에 저장하세요:
//   NCM_CLIENT_ID     : 29CM에서 발급받은 Client ID
//   NCM_CLIENT_SECRET : 29CM에서 발급받은 Client Secret
//   NCM_PARTNER_KEY   : 29CM 파트너 Key
//
// 흐름: /auth/token 으로 accessToken 발급 → /api/v1/orders/search 조회 → 화면용으로 정규화

const BASE = "https://openapi.29cm.co.kr";

async function getToken(clientId, clientSecret) {
  const r = await fetch(BASE + "/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("토큰 발급 실패 (" + r.status + "): " + text.slice(0, 200));
  let d = {};
  try { d = JSON.parse(text); } catch (e) {}
  const token = d.accessToken || (d.data && d.data.accessToken);
  if (!token) throw new Error("토큰 응답에 accessToken이 없어요: " + text.slice(0, 200));
  return token;
}

// KST(+09:00) 기준으로 날짜/시간 분해
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
    gross: o.sellAmount || 0,         // 판매액
    paid: o.saleAmount || 0,          // 실판매액
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

  const { NCM_CLIENT_ID, NCM_CLIENT_SECRET, NCM_PARTNER_KEY } = process.env;
  if (!NCM_CLIENT_ID || !NCM_CLIENT_SECRET || !NCM_PARTNER_KEY) {
    res.status(500).json({
      error:
        "29CM API 키가 아직 설정되지 않았어요. Vercel 환경변수 NCM_CLIENT_ID, NCM_CLIENT_SECRET, NCM_PARTNER_KEY 를 설정해주세요.",
    });
    return;
  }

  try {
    // 날짜 범위 (미지정 시 최근 30일)
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const ago30 = new Date(Date.now() + 9 * 3600 * 1000 - 30 * 864e5)
      .toISOString().slice(0, 10);
    const fromDate = (req.query.from || ago30).slice(0, 10);
    const toDate = (req.query.to || today).slice(0, 10);
    const fromDateTime = fromDate + "T00:00:00+09:00";
    const toDateTime = toDate + "T23:59:59+09:00";

    const token = await getToken(NCM_CLIENT_ID, NCM_CLIENT_SECRET);

    let page = 1, all = [], totalCount = 0;
    for (;;) {
      const url = new URL(BASE + "/api/v1/orders/search");
      url.searchParams.set("dateConditionType", "ORDERED_AT");
      url.searchParams.set("fromDateTime", fromDateTime);
      url.searchParams.set("toDateTime", toDateTime);
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", "500");

      const r = await fetch(url.toString(), {
        headers: { Authorization: "Bearer " + token, "Partner-Key": NCM_PARTNER_KEY },
      });
      const text = await r.text();
      if (!r.ok) throw new Error("주문 조회 실패 (" + r.status + "): " + text.slice(0, 300));
      let j = {};
      try { j = JSON.parse(text); } catch (e) { throw new Error("응답 파싱 실패: " + text.slice(0, 200)); }
      if (j.result && j.result !== "SUCCESS") {
        throw new Error(j.message || j.errorCode || "조회 결과 실패");
      }
      const data = j.data || {};
      const list = data.resultList || [];
      totalCount = data.totalCount != null ? data.totalCount : list.length;
      all = all.concat(list);
      if (list.length === 0 || all.length >= totalCount || page >= 40) break;
      page++;
    }

    const orders = all.map(normalize);
    res.status(200).json({ orders, totalCount: orders.length, from: fromDate, to: toDate });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}
