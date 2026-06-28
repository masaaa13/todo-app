import type { VercelRequest, VercelResponse } from '@vercel/node';

const PROXY_BASE  = process.env.FS_PROXY_BASE_URL;
const PROXY_TOKEN = process.env.FS_PROXY_TOKEN;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

const SAFE_KEYS = new Set([
  'ok', 'source', 'orderCount', 'lineCount',
  'totalSalesQty', 'totalSalesAmount', 'nextUrl', 'warning',
  'skuSales', 'productSales', 'excluded', 'rawHints',
]);

function pickSafe(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => SAFE_KEYS.has(k)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!PROXY_BASE || !PROXY_TOKEN) {
    return res.status(500).json({ error: 'Proxy not configured' });
  }

  const {
    orderDateStart,
    orderDateEnd,
    updateDateStart,
    updateDateEnd,
    orderNo,
    shippingStatus,
    paymentStatus,
    cursor,
  } = req.body as {
    orderDateStart?:  unknown;
    orderDateEnd?:    unknown;
    updateDateStart?: unknown;
    updateDateEnd?:   unknown;
    orderNo?:         unknown;
    shippingStatus?:  unknown;
    paymentStatus?:   unknown;
    cursor?:          unknown;
  };

  const hasOrderDateRange  = typeof orderDateStart  === 'string' && typeof orderDateEnd   === 'string';
  const hasUpdateDateRange = typeof updateDateStart === 'string' && typeof updateDateEnd  === 'string';

  if (!hasOrderDateRange && !hasUpdateDateRange) {
    return res.status(400).json({
      error: 'orderDateStart+orderDateEnd または updateDateStart+updateDateEnd のどちらかが必要です',
    });
  }

  const datePairs = [
    ['orderDateStart',  orderDateStart],
    ['orderDateEnd',    orderDateEnd],
    ['updateDateStart', updateDateStart],
    ['updateDateEnd',   updateDateEnd],
  ] as [string, unknown][];

  for (const [name, value] of datePairs) {
    if (value !== undefined && (typeof value !== 'string' || !ISO_RE.test(value))) {
      return res.status(400).json({ error: `${name} は YYYY-MM-DDTHH:MM:SS 形式で指定してください` });
    }
  }

  const requestBody: Record<string, unknown> = {};
  if (typeof orderDateStart  === 'string') requestBody.orderDateStart  = orderDateStart;
  if (typeof orderDateEnd    === 'string') requestBody.orderDateEnd    = orderDateEnd;
  if (typeof updateDateStart === 'string') requestBody.updateDateStart = updateDateStart;
  if (typeof updateDateEnd   === 'string') requestBody.updateDateEnd   = updateDateEnd;
  if (typeof orderNo         === 'string') requestBody.orderNo         = orderNo;
  if (typeof shippingStatus  === 'string') requestBody.shippingStatus  = shippingStatus;
  if (typeof paymentStatus   === 'string') requestBody.paymentStatus   = paymentStatus;
  if (typeof cursor          === 'string') requestBody.cursor          = cursor;

  try {
    const upstream = await fetch(`${PROXY_BASE}/check-orders`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${PROXY_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream error', status: upstream.status });
    }

    const data = await upstream.json() as Record<string, unknown>;
    return res.status(200).json(pickSafe(data));
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
