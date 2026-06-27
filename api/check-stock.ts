import type { VercelRequest, VercelResponse } from '@vercel/node';

const PROXY_BASE  = process.env.FS_PROXY_BASE_URL;
const PROXY_TOKEN = process.env.FS_PROXY_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!PROXY_BASE || !PROXY_TOKEN) {
    return res.status(500).json({ error: 'Proxy not configured' });
  }

  const { productNos } = req.body as { productNos?: unknown };

  if (!Array.isArray(productNos)) {
    return res.status(400).json({ error: 'productNos must be an array' });
  }
  if (productNos.length === 0) {
    return res.status(400).json({ error: 'productNos must not be empty' });
  }
  if (productNos.length > 100) {
    return res.status(400).json({ error: 'productNos must be 100 items or fewer' });
  }
  if (!productNos.every((n) => /^\d{7}$/.test(String(n)))) {
    return res.status(400).json({ error: 'Each productNo must be a 7-digit number' });
  }

  try {
    const upstream = await fetch(`${PROXY_BASE}/check-stock`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${PROXY_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ productNos }),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream error' });
    }

    const data = await upstream.json() as { ok?: boolean; stock?: Record<string, number> };

    return res.status(200).json({
      ok:        data.ok   ?? false,
      stock:     data.stock ?? {},
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
