import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dueNotices, messageFor } from '../services/notify.js';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const at = (hoursAgo) => new Date(NOW - hoursAgo * 3600 * 1000).toISOString();
const order = (tags = []) => ({ name: '#1009', tags: ['oka-app', 'lang:ar', ...tags], outstanding: 425, cancelledAt: null });
const track = (over) => ({ carrier: 'jt', step: 2, stateCode: 10, actionNeeded: null, updates: [{ at: at(1) }], ...over });

const kinds = (due) => due.filter((d) => !d.silent).map((d) => d.kind);

test('collection is announced once', () => {
  assert.deepEqual(kinds(dueNotices(order(), track(), NOW)), ['picked']);
  assert.deepEqual(dueNotices(order(['notified:picked']), track(), NOW), []);
});

test('out for delivery is announced, and "shipped" is not sent alongside it', () => {
  const due = dueNotices(order(), track({ stateCode: 94 }), NOW);
  assert.deepEqual(kinds(due), ['out']);
  assert.ok(due.some((d) => d.tag === 'notified:picked' && d.silent));
  assert.ok(due.some((d) => d.tag === 'notified:out:2026-09-26'));
});

test('Bosta out-for-delivery (41) counts too', () => {
  assert.deepEqual(kinds(dueNotices(order(['notified:picked']), track({ carrier: 'bosta', stateCode: 41 }), NOW)), ['out']);
});

test('a failed attempt is announced once per day it happens', () => {
  const t = track({ stateCode: 110, actionNeeded: 'x' });
  assert.deepEqual(kinds(dueNotices(order(['notified:picked']), t, NOW)), ['action']);
  assert.deepEqual(dueNotices(order(['notified:picked', 'notified:action:2026-09-26']), t, NOW), []);
});

test('delivered is announced only while fresh', () => {
  assert.deepEqual(kinds(dueNotices(order(), track({ step: 3 }), NOW)), ['delivered']);
  const stale = dueNotices(order(), track({ step: 3, updates: [{ at: at(48) }] }), NOW);
  assert.deepEqual(kinds(stale), []);
  assert.equal(stale[0].tag, 'notified:delivered');
});

test('nothing for cancelled or not-yet-collected orders', () => {
  assert.deepEqual(dueNotices({ ...order(), cancelledAt: at(1) }, track(), NOW), []);
  assert.deepEqual(dueNotices(order(), track({ step: 1, updates: [] }), NOW), []);
});

test('messages use the order language, the courier name and the cash to prepare', () => {
  const [, ar] = messageFor(order(), track(), 'out');
  assert.match(ar, /J&T/);
  assert.match(ar, /425/);
  const [title, en] = messageFor({ ...order(), tags: ['lang:en'] }, track(), 'out');
  assert.equal(title, 'Out for delivery today');
  assert.match(en, /EGP 425/);
});
