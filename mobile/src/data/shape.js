/**
 * The view model behind every screen — a direct port of the mockup's `shape()`.
 *
 * Live Shopify/Bosta data is adapted into the mockup's raw order format first
 * (see api/repository.js), so this function is identical for sample and live
 * data and the screens never branch on where an order came from.
 */

import { CHIP, rankColor, clarityColor, colors, ink } from "../theme.js";
import { PHASES } from "../i18n.js";
import { IMG, TIMES, TRACK, HISTORY } from "./sample.js";

const initialsOf = (name) =>
  String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

/** The photo shown on the list row: the highest-value line on the order. */
function heroImage(order) {
  if (!order.items?.length) return "";
  const hero = order.items.reduce((a, b) =>
    parseFloat(b.unit) * b.qty > parseFloat(a.unit) * a.qty ? b : a,
  );
  return order.img?.[hero.name] || IMG[hero.name] || hero.img || "";
}

export function shapeOrder(order, { lang = "en", cancelledOrders = [], qty = {}, addrEdit = {} } = {}) {
  const ar = lang === "ar";
  const status = cancelledOrders.includes(order.id) ? "cancelled" : order.status;
  const chip = CHIP[status] || CHIP.new;

  // Live orders carry their own track block; sample orders read the fixture.
  const tr = order.track || TRACK[order.id] || { phase: 0 };
  const courierName = tr.courier ? (ar ? tr.courier.name : tr.courier.nameEn || tr.courier.name) : "";

  const address =
    addrEdit[order.id] !== undefined ? addrEdit[order.id] : ar ? order.address : order.addressEn;

  return {
    id: order.id,
    trackPhase: tr.phase,
    trackPhaseLabel: ar ? PHASES[tr.phase].ar : PHASES[tr.phase].en,
    courier: tr.courier || null,
    courierName,
    courierPhone: tr.courier ? tr.courier.phone : "",
    courierInitials: initialsOf(courierName),
    awb: order.awb,
    awbTail: order.awb,
    shopify: order.sh,
    shopifyId: order.shopifyId || null,
    carrier: order.carrier,
    name: ar ? order.name : order.nameEn,
    city: ar ? order.city : order.cityEn,
    address,
    phone: order.phone,
    cod: order.cod,
    subtotal: order.subtotal,
    ship: order.ship,
    chip: ar ? chip.ar : chip.en,
    chipBg: chip.bg,
    chipFg: chip.fg,
    status,
    rank: order.rank,
    clarity: order.clarity,
    badAddr: order.status === "badaddr",
    rankLabel: order.rank === null || order.rank === undefined ? "—" : `${order.rank}%`,
    rankColor: rankColor(order.rank),
    clarityLabel: `${order.clarity ?? 0}%`,
    clarityColor: clarityColor(order.clarity ?? 0),
    thumb: heroImage(order),
    count: order.items.reduce((sum, item, index) => sum + (qty[`${order.id}:${index}`] ?? item.qty), 0),
    initials: initialsOf(order.nameEn),
  };
}

/** Line items with live quantity overrides and the +/- handlers wired in. */
export function shapeItems(order, { qty = {}, extra = {}, locked = false } = {}) {
  return order.items.concat(extra[order.id] || []).map((item, index) => {
    const key = `${order.id}:${index}`;
    const quantity = qty[key] ?? item.qty;
    return {
      key,
      name: item.name,
      sku: `${item.unit} EGP`,
      qty: quantity,
      price: String(Number(item.unit) * quantity),
      img: order.img?.[item.name] || IMG[item.name] || item.img || "",
      locked,
    };
  });
}

/** The five-step tracking timeline, coloured by how far the shipment has got. */
export function shapeTrackSteps(sel, lang) {
  const ar = lang === "ar";
  return PHASES.map((phase, index) => ({
    label: ar ? phase.ar : phase.en,
    time: index <= sel.trackPhase ? sel.times?.[index] || TIMES[index] : "",
    dotBg: index < sel.trackPhase ? colors.greenDeep : index === sel.trackPhase ? colors.green : "#fff",
    dotBorder: index <= sel.trackPhase ? colors.greenDeep : ink(0.22),
    textColor: index <= sel.trackPhase ? colors.ink : ink(0.35),
    lineBg: index < sel.trackPhase ? colors.greenDeep : ink(0.12),
    isLast: index === PHASES.length - 1,
  }));
}

/** Call/WhatsApp history rows for the selected order. */
export function shapeHistory(order, lang) {
  const ar = lang === "ar";
  const entries = order.history || HISTORY[order.id] || [];
  return entries.map((entry) => ({
    isCall: entry.type === "call",
    time: entry.time,
    dur: entry.dur || "",
    note: ar ? entry.ar : entry.en,
    iconBg: entry.type === "call" ? colors.greenDeep : colors.ink,
    // Carried through so the row can offer playback. Only set on live
    // provider entries — the sample fixtures have no audio.
    callId: entry.callId || null,
    hasRecording: Boolean(entry.hasRecording),
    recordingUrl: entry.recordingUrl || null,
  }));
}
