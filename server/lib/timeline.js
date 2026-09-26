import { fmtCairo } from './timefmt.js';

/**
 * Shopify's own milestones, merged into the courier's timeline so the order
 * screen shows one story rather than only the courier's half of it. Same
 * shape as the courier rows, and only events that have actually happened.
 */
function shopifyEvents(order, lang) {
  const ar = lang === 'ar';
  const fmt = (t) => fmtCairo(t, ar);

  const rows = [];
  if (order.createdAt) {
    rows.push({
      at: order.createdAt,
      text: ar ? 'تم استلام الطلب' : 'Order received',
      time: fmt(order.createdAt),
      done: true,
    });
  }
  if (order.fulfilledAt) {
    rows.push({
      at: order.fulfilledAt,
      text: ar ? 'تم تجهيز الطلب وشحنه' : 'Order fulfilled and handed to the courier',
      time: fmt(order.fulfilledAt),
      done: true,
    });
  }
  if (order.cancelledAt) {
    rows.push({
      at: order.cancelledAt,
      text: ar ? 'تم إلغاء الطلب' : 'Order cancelled',
      time: fmt(order.cancelledAt),
      done: true,
    });
  }
  return rows;
}

/** Shopify events and courier scans as one chronological story, oldest first. */
export const mergeTimeline = (order, tracking, lang) =>
  [...shopifyEvents(order, lang), ...(tracking?.updates ?? [])]
    .filter((r) => r.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map(({ at, ...row }) => row);
