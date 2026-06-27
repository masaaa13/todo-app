import type { VercelRequest, VercelResponse } from '@vercel/node';

const PROXY_BASE  = process.env.FS_PROXY_BASE_URL;
const PROXY_TOKEN = process.env.FS_PROXY_TOKEN;

const DEFAULT_TYPES = ['variation', 'image', 'comment', 'preorder', 'plannedStock'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!PROXY_BASE || !PROXY_TOKEN) {
    return res.status(500).json({ error: 'Proxy not configured' });
  }

  const {
    productNos,
    updateDateStart,
    updateDateEnd,
    mainGroupUrl,
    janCode,
    count,
    cursor,
    types,
  } = req.body as {
    productNos?: unknown;
    updateDateStart?: unknown;
    updateDateEnd?: unknown;
    mainGroupUrl?: unknown;
    janCode?: unknown;
    count?: unknown;
    cursor?: unknown;
    types?: unknown;
  };

  const requestTypes = Array.isArray(types) && types.length > 0 ? types : DEFAULT_TYPES;

  const isSearchMode = !productNos && (
    updateDateStart !== undefined ||
    updateDateEnd !== undefined ||
    mainGroupUrl !== undefined ||
    janCode !== undefined
  );

  if (!isSearchMode) {
    if (!Array.isArray(productNos)) {
      return res.status(400).json({ error: 'productNos must be an array' });
    }
    if (productNos.length === 0) {
      return res.status(400).json({ error: 'productNos must not be empty' });
    }
    if (productNos.length > 50) {
      return res.status(400).json({ error: 'productNos must be 50 items or fewer' });
    }
    if (!productNos.every((n) => /^\d{7}$/.test(String(n)))) {
      return res.status(400).json({ error: 'Each productNo must be a 7-digit number' });
    }
  } else {
    if (updateDateStart !== undefined && typeof updateDateStart !== 'string') {
      return res.status(400).json({ error: 'updateDateStart must be a string' });
    }
    if (updateDateEnd !== undefined && typeof updateDateEnd !== 'string') {
      return res.status(400).json({ error: 'updateDateEnd must be a string' });
    }
    if (mainGroupUrl !== undefined && typeof mainGroupUrl !== 'string') {
      return res.status(400).json({ error: 'mainGroupUrl must be a string' });
    }
    if (janCode !== undefined && typeof janCode !== 'string') {
      return res.status(400).json({ error: 'janCode must be a string' });
    }
  }

  const requestBody = isSearchMode
    ? {
        updateDateStart: typeof updateDateStart === 'string' ? updateDateStart : undefined,
        updateDateEnd:   typeof updateDateEnd   === 'string' ? updateDateEnd   : undefined,
        mainGroupUrl:    typeof mainGroupUrl    === 'string' ? mainGroupUrl    : undefined,
        janCode:         typeof janCode         === 'string' ? janCode         : undefined,
        count:           typeof count           === 'number' ? count           : 50,
        cursor:          typeof cursor          === 'string' ? cursor          : undefined,
        types:           requestTypes,
      }
    : { productNos, types: requestTypes };

  try {
    const upstream = await fetch(`${PROXY_BASE}/check-products`, {
      method: 'POST',
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
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
