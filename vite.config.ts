import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

function loadDotEnvLocal(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    result[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dev-api-proxy',
      configureServer(server) {
        const env = loadDotEnvLocal();
        const proxyBase  = env.FS_PROXY_BASE_URL  ?? process.env.FS_PROXY_BASE_URL;
        const proxyToken = env.FS_PROXY_TOKEN ?? process.env.FS_PROXY_TOKEN;

        server.middlewares.use('/api/check-stock', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          if (!proxyBase || !proxyToken) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy not configured' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            void (async () => {
              try {
                const parsed = JSON.parse(body) as { productNos?: unknown };
                const productNos = parsed.productNos;

                if (!Array.isArray(productNos) || productNos.length === 0 || productNos.length > 100) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid productNos' }));
                  return;
                }

                if (!productNos.every((n) => /^\d{7}$/.test(String(n)))) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'productNos must be 7-digit numbers' }));
                  return;
                }

                const upstream = await fetch(`${proxyBase}/check-stock`, {
                  method:  'POST',
                  headers: {
                    'Authorization': `Bearer ${proxyToken}`,
                    'Content-Type':  'application/json',
                  },
                  body: JSON.stringify({ productNos }),
                });

                const data = await upstream.json() as Record<string, unknown>;
                res.writeHead(upstream.ok ? 200 : upstream.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  ok:        data.ok    ?? false,
                  stock:     data.stock ?? {},
                  fetchedAt: new Date().toISOString(),
                }));
              } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
              }
            })();
          });
        });

        server.middlewares.use('/api/check-orders', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          if (!proxyBase || !proxyToken) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy not configured' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            void (async () => {
              try {
                const parsed = JSON.parse(body) as {
                  orderDateStart?:  unknown;
                  orderDateEnd?:    unknown;
                  updateDateStart?: unknown;
                  updateDateEnd?:   unknown;
                  orderNo?:         unknown;
                  shippingStatus?:  unknown;
                  paymentStatus?:   unknown;
                  cursor?:          unknown;
                };

                const { orderDateStart, orderDateEnd, updateDateStart, updateDateEnd,
                        orderNo, shippingStatus, paymentStatus, cursor } = parsed;

                const hasOrderDateRange  = typeof orderDateStart  === 'string' && typeof orderDateEnd   === 'string';
                const hasUpdateDateRange = typeof updateDateStart === 'string' && typeof updateDateEnd  === 'string';

                if (!hasOrderDateRange && !hasUpdateDateRange) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'orderDateStart+orderDateEnd または updateDateStart+updateDateEnd のどちらかが必要です' }));
                  return;
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

                const upstream = await fetch(`${proxyBase}/check-orders`, {
                  method:  'POST',
                  headers: {
                    'Authorization': `Bearer ${proxyToken}`,
                    'Content-Type':  'application/json',
                  },
                  body: JSON.stringify(requestBody),
                });

                const data = await upstream.json() as Record<string, unknown>;
                const SAFE_KEYS = new Set([
                  'ok', 'source', 'orderCount', 'lineCount',
                  'totalSalesQty', 'totalSalesAmount', 'nextUrl', 'warning',
                  'skuSales', 'productSales', 'excluded', 'rawHints',
                ]);
                const safe = Object.fromEntries(Object.entries(data).filter(([k]) => SAFE_KEYS.has(k)));
                res.writeHead(upstream.ok ? 200 : 502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(safe));
              } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
              }
            })();
          });
        });

        server.middlewares.use('/api/check-products', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          if (!proxyBase || !proxyToken) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy not configured' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            void (async () => {
              try {
                const parsed = JSON.parse(body) as {
                  productNos?: unknown;
                  updateDateStart?: unknown;
                  updateDateEnd?: unknown;
                  mainGroupUrl?: unknown;
                  janCode?: unknown;
                  count?: unknown;
                  cursor?: unknown;
                  types?: unknown;
                };
                const { productNos, updateDateStart, updateDateEnd, mainGroupUrl, janCode, count, cursor } = parsed;
                const types = Array.isArray(parsed.types) && parsed.types.length > 0
                  ? parsed.types
                  : ['variation', 'image', 'comment', 'preorder', 'plannedStock'];

                const isSearchMode = !productNos && (
                  updateDateStart !== undefined ||
                  updateDateEnd !== undefined ||
                  mainGroupUrl !== undefined ||
                  janCode !== undefined
                );

                if (!isSearchMode) {
                  if (!Array.isArray(productNos) || productNos.length === 0 || productNos.length > 50) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid productNos' }));
                    return;
                  }
                  if (!productNos.every((n) => /^\d{7}$/.test(String(n)))) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'productNos must be 7-digit numbers' }));
                    return;
                  }
                }

                const requestBody = isSearchMode
                  ? { updateDateStart, updateDateEnd, mainGroupUrl, janCode, count: typeof count === 'number' ? count : 50, cursor, types }
                  : { productNos, types };

                const upstream = await fetch(`${proxyBase}/check-products`, {
                  method:  'POST',
                  headers: {
                    'Authorization': `Bearer ${proxyToken}`,
                    'Content-Type':  'application/json',
                  },
                  body: JSON.stringify(requestBody),
                });

                const data = await upstream.json() as Record<string, unknown>;
                res.writeHead(upstream.ok ? 200 : 502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
              } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
              }
            })();
          });
        });
      },
    },
  ],
});
