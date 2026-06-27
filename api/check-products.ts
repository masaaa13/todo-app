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
    productNoPrefix,
    dateLastUpdatedFrom,
    dateLastUpdatedTo,
    visible,
    types,
  } = req.body as {
    productNos?: unknown;
    productNoPrefix?: unknown;
    dateLastUpdatedFrom?: unknown;
    dateLastUpdatedTo?: unknown;
    visible?: unknown;
    types?: unknown;
  };

  const requestTypes = Array.isArray(types) && types.length > 0 ? types : DEFAULT_TYPES;

  // Condition search mode when productNos is absent and at least one condition is specified
  const isSearchMode = !productNos && (
    productNoPrefix !== undefined ||
    dateLastUpdatedFrom !== undefined ||
    dateLastUpdatedTo !== undefined ||
    visible !== undefined
  );

  if (!isSearchMode) {
    // Existing validation: productNos required
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
    // Condition search validation
    if (productNoPrefix !== undefined && typeof productNoPrefix !== 'string') {
      return res.status(400).json({ error: 'productNoPrefix must be a string' });
    }
    if (dateLastUpdatedFrom !== undefined && typeof dateLastUpdatedFrom !== 'string') {
      return res.status(400).json({ error: 'dateLastUpdatedFrom must be a string' });
    }
    if (dateLastUpdatedTo !== undefined && typeof dateLastUpdatedTo !== 'string') {
      return res.status(400).json({ error: 'dateLastUpdatedTo must be a string' });
    }
    if (visible !== undefined && typeof visible !== 'boolean') {
      return res.status(400).json({ error: 'visible must be a boolean' });
    }
  }

  // Build request body for VPS
  const requestBody = isSearchMode
    ? {
        productNoPrefix:       typeof productNoPrefix === 'string'       ? productNoPrefix       : undefined,
        dateLastUpdatedFrom:   typeof dateLastUpdatedFrom === 'string'   ? dateLastUpdatedFrom   : undefined,
        dateLastUpdatedTo:     typeof dateLastUpdatedTo === 'string'     ? dateLastUpdatedTo     : undefined,
        visible:               typeof visible === 'boolean'              ? visible               : undefined,
        types:                 requestTypes,
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
