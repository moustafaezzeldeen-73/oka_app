import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

/**
 * The J&T calls routed through OKA's GCP connector (jt-mcp-server). A local
 * stand-in answers the way the real one does — MCP tools/call over HTTP,
 * replying either as JSON or as a single SSE event — so the mapping onto the
 * direct-API shapes is checked without the network.
 */

let server;
let calls = [];
const TOKEN = 'test-connector-token';

const sse = (obj) => `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
const textResult = (id, text, isError = false) => ({
  jsonrpc: '2.0',
  id,
  result: { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) },
});

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.headers['x-api-key'] !== TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end('{"error":"unauthorized"}');
      }
      const rpc = JSON.parse(body);
      calls.push(rpc.params);
      const { name, arguments: args } = rpc.params;
      if (name === 'list_deliveries') {
        if (args.serialNumbers.every((s) => s.startsWith('SHOPIFY0'))) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          return res.end(sse(textResult(rpc.id,
            'J&T API error 999001030: 参数无效:waybillNos size must be between 1 and 1000;', true)));
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        return res.end(sse(textResult(rpc.id, JSON.stringify({ code: '1', msg: 'success', data: [
          { txlogisticId: 'SHOPIFY2763821', billCode: 'JEG000536920222', orderStatus: 103, createOrderTime: '2026-09-19T09:22:10' },
        ] }))));
      }
      if (name === 'track_delivery') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(textResult(rpc.id, JSON.stringify({ code: '1', msg: 'success', data: [
          { billCode: 'JEG000536920222', details: [
            { scanTime: '2026-09-20 17:20:02', scanTypeCode: 100, scanNetworkName: 'AS-Asyut DC',
              desc: 'J&T courier Mostafa Ahmed(01126797353) completed the delivery.' },
          ] },
        ] }))));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32602, message: 'unknown tool' } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.JT_CONNECTOR_URL = `http://127.0.0.1:${server.address().port}/mcp`;
  process.env.JT_CONNECTOR_TOKEN = TOKEN;
  delete process.env.JT_API_ACCOUNT;
  delete process.env.JT_PRIVATE_KEY;
});

after(() => server.close());

test('connector: order lookup and trace go through its read tools only', async () => {
  const jt = await import('../integrations/jt.js');
  assert.equal(jt.hasJT(), true);
  assert.equal(jt.jtTransport(), 'connector');
  calls = [];

  const found = await jt.findShipmentsByOrderNames(['#2763821']);
  assert.equal(found.get('#2763821').billCode, 'JEG000536920222');
  assert.deepEqual(calls[0], {
    name: 'list_deliveries',
    arguments: { command: 1, serialNumbers: ['SHOPIFY2763821', 'SHOPIFY2763821V2', 'SHOPIFY2763821V3'] },
  });

  const scans = await jt.trace(['JEG000536920222']);
  assert.equal(scans.get('JEG000536920222').length, 1);
  assert.deepEqual(calls[1], { name: 'track_delivery', arguments: { billCodes: ['JEG000536920222'] } });

  const t = jt.toTracking('JEG000536920222', scans.get('JEG000536920222'), 'en');
  assert.equal(t.step, 3);
  assert.ok(calls.every((c) => ['list_deliveries', 'track_delivery'].includes(c.name)));
});

test('connector: J&T "no match" quirk still reads as no shipments', async () => {
  const jt = await import('../integrations/jt.js');
  assert.deepEqual(await jt.getOrders(['SHOPIFY0']), []);
  assert.deepEqual(await jt.pingJT(), { ok: true, via: 'connector' });
});

test('connector: a wrong token is reported as such', async () => {
  const jt = await import('../integrations/jt.js');
  process.env.JT_CONNECTOR_TOKEN = 'wrong';
  await assert.rejects(jt.trace(['JEG1']), /rejected the token/);
  process.env.JT_CONNECTOR_TOKEN = TOKEN;
});
