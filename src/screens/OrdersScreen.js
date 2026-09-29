import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { STR } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { fetchOrderStatus } from '../api/orders';
import { cancelShopifyOrder, fetchCustomerOrders } from '../api/auth';
import { useRefresh } from '../useRefresh';
import { C, W } from '../theme';
import { chevronFlip } from '../rtl';
import { FadeIn } from '../components/anim';
import { Divider, Img, Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { ChevronRight, Phone, WhatsApp } from '../components/Icons';
import { selectionTick, success } from '../haptics';

/**
 * wa.me wants a bare international number — no `+`, no spaces, no leading 0.
 * Bosta returns the courier's number as +20…, but J&T's local 010… has to
 * gain the country code or WhatsApp opens on nobody.
 */
function waNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = `20${digits.replace(/^0+/, '')}`;
  return digits;
}

/**
 * The order's money, whichever source it came from. Shopify orders carry
 * their own breakdown; one the server predates is rebuilt from its lines and
 * total, so the invoice never has to be left out.
 */
function invoiceOf(o) {
  const items = o.items ?? [];
  const itemsSum = items.reduce((a, it) => a + (it.price ?? 0) * (it.quantity ?? 0), 0);
  if (o.breakdown) return o.breakdown;
  if (o.total == null) return null;
  return {
    subtotal: itemsSum,
    discount: 0,
    shipping: Math.max(0, o.total - itemsSum),
    total: o.total,
  };
}

/** The server's refusal text is already written for people; transport errors aren't. */
function friendlyError(err, ar) {
  const msg = String(err?.message ?? err);
  if (/already shipped/i.test(msg)) {
    return ar
      ? 'الطلب اتشحن بالفعل ومش ممكن يتلغي دلوقتي. كلّم خدمة العملاء لو محتاج ترجعه.'
      : 'This order has already shipped and can no longer be cancelled. Contact support if you need to return it.';
  }
  if (/not signed in|different account/i.test(msg)) {
    return ar ? 'سجّل دخولك بالحساب اللي عمل الطلب ده.' : 'Sign in with the account that placed this order.';
  }
  if (/timed out|network|non-JSON|service-/i.test(msg)) {
    return ar ? 'مفيش اتصال بالسيرفر دلوقتي. جرّب تاني.' : "Couldn't reach the server. Please try again.";
  }
  return msg;
}

const PAYMENT_LABEL = {
  cod: ['Cash on delivery', 'الدفع عند الاستلام'],
  card: ['Card', 'بطاقة'],
  wallet: ['Mobile wallet', 'محفظة إلكترونية'],
  paid: ['Paid', 'مدفوع'],
};

export default function OrdersScreen() {
  const { state, products } = useStore();
  const actions = useActions();
  const d = useDerived();

  /**
   * One list, whatever the source. Real Shopify orders for a signed-in
   * customer, plus the order placed in this session if it is not already
   * among them. The list is always the entry point — the screen used to jump
   * straight into a detail view whenever exactly one order existed, which is
   * why no list ever appeared for a guest.
   */
  const remoteOrders = state.remoteOrders ?? [];
  const signedIn = Boolean(state.session?.token);

  const localRow =
    state.order && !remoteOrders.some((o) => o.name === state.order.number)
      ? {
          name: state.order.number,
          total: null,
          totalLabel: state.order.total,
          items: Object.entries(state.order.items ?? {}).map(([id, qty]) => {
            const p = d.byId(id);
            return {
              id,
              title: p ? d.title(p) : id,
              quantity: qty,
              // The price paid at checkout, not today's catalogue price.
              price: state.order.prices?.[id] ?? p?.price ?? 0,
              image: null,
              localImg: p?.img ?? null,
              variantId: p?.variantId ?? null,
            };
          }),
          cancelled: state.order.status === 'cancelled',
          breakdown: state.order.breakdown ?? null,
          paymentMethod: state.order.paymentMethod ?? 'cod',
          local: true,
          shipTo: null,
          hasAwb: Boolean(state.order.trackingNumber),
          trackingNumber: state.order.trackingNumber ?? null,
          city: state.order.cityDays ?? '',
          stateLabel: null,
          step: 0,
        }
      : null;

  // An order cancelled from here shows as cancelled at once, even while
  // Shopify's background cancel job hasn't reached it yet.
  const listRows = [...remoteOrders, ...(localRow ? [localRow] : [])].map((o) =>
    state.cancelledOrders?.[o.name] && !o.cancelled
      ? { ...o, cancelled: true, cancelledAt: o.cancelledAt ?? state.cancelledOrders[o.name] }
      : o,
  );
  const selected = listRows.find((o) => o.name === state.selectedOrderName) ?? null;
  const remote = selected && !selected.local ? selected : null;

  const order = selected
    ? {
        number: selected.name,
        total: selected.totalLabel ?? d.fmtPrice(Math.round(selected.total ?? 0)),
        cityDays: selected.city ?? '',
        trackingNumber: selected.trackingNumber,
        heroTitle: selected.items?.[0]?.title ?? '',
        heroImg: selected.items?.[0]?.image
          ? { uri: selected.items[0].image }
          : selected.items?.[0]?.localImg ?? null,
        items: selected.items,
        cancelled: Boolean(selected.cancelled),
        cancelledAt: selected.cancelledAt ?? null,
        invoice: invoiceOf(selected),
        paymentMethod: selected.paymentMethod ?? 'cod',
        shipTo: selected.shipTo ?? null,
        hasAwb: selected.hasAwb,
        local: Boolean(selected.local),
      }
    : null;

  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  /**
   * A local order exists only on this device — checkout never reached Shopify,
   * so there is nothing on the store to edit or cancel.
   */
  const isLocalOnly = Boolean(order?.local || String(order?.number ?? '').startsWith('OKA-'));

  /**
   * A fulfilled order has been handed to the courier — its AWB is printed and
   * the parcel is moving, so changing its contents or destination would leave
   * Shopify describing something different from what is actually in transit.
   * Shopify itself would allow the edit, so the app has to be the one to stop.
   *
   * PARTIALLY_FULFILLED counts too: order edits apply to the whole order, so
   * one shipped line is enough to make an edit rewrite something in transit.
   * Kept in step with `isShipped` in server/shopify.js, which enforces it.
   */
  const isFulfilled = ['FULFILLED', 'PARTIALLY_FULFILLED'].includes(
    selected?.fulfillmentStatus,
  );
  const canEdit = !isLocalOnly && signedIn && !isFulfilled && !order?.cancelled;

  /**
   * Every line in the order, not just the hero item. A real order (`remote`)
   * already carries full line items from Shopify; a locally-placed order only
   * has {productId: qty}, resolved back to the catalogue here.
   */
  const orderItems = (selected?.items ?? []).map((it) => ({
    key: it.id,
    title: it.title,
    qty: it.quantity,
    unit: d.fmtPrice(Math.round(it.price ?? 0)),
    price: d.fmtPrice(Math.round((it.price ?? 0) * it.quantity)),
    img: it.image ? { uri: it.image } : it.localImg ?? null,
  }));

  /** Live courier/Shopify status, when the order service is reachable. */
  const [live, setLive] = useState(null);

  const loadStatus = useCallback(async () => {
    // Signed in: pull the customer's real orders, each already joined to its shipment.
    if (state.session?.token) {
      try {
        const r = await fetchCustomerOrders({ token: state.session.token, lang: d.lang });
        actions.setRemoteOrders(r.orders ?? []);
        // Only ever the order that is actually open — never "the first one",
        // which is how another order's shipment ended up on this screen.
        const shown = (r.orders ?? []).find((o) => o.name === state.selectedOrderName) ?? null;
        setLive(
          shown
            ? {
                step: shown.step,
                stateLabel: shown.stateLabel,
                trackingNumber: shown.trackingNumber,
                courier: shown.courier ?? null,
                courierPhone: shown.courierPhone ?? null,
                actionNeeded: shown.actionNeeded ?? null,
                updates: shown.updates ?? [],
                carrier: shown.carrier ?? null,
                // "We couldn't reach the courier" and "this parcel has no
                // events" look identical on screen unless the failure is
                // carried through and said out loud.
                shippingError: r.shippingError ?? r.bostaError ?? null,
              }
            : null,
        );
        return;
      } catch {
        // fall through to the single-order path
      }
    }
    // A local-only order has nothing on Shopify or the courier to ask about.
    if (!order || order.local) {
      setLive(null);
      return;
    }
    // No phone is sent: the service finds the shipment by order number, and
    // the old fallback posted the demo placeholder number for signed-out
    // shoppers.
    const r = await fetchOrderStatus({
      orderNumber: order.number,
      trackingNumber: order.trackingNumber,
    });
    setLive(r);
  }, [
    state.session?.token,
    d.lang,
    order?.number,
    order?.trackingNumber,
    state.selectedOrderName,
    state.ordersVersion,
  ]);

  /**
   * Seeds the edit sheet. A remote order lists Shopify line items keyed by
   * variant id, so each is resolved back to the catalogue product that carries
   * that variant; a local order is already keyed by product id.
   */
  const editSeed = useCallback(() => {
    if (!remote) return undefined;
    const seed = {};
    for (const it of remote.items ?? []) {
      const p = products.find((pp) => pp.variantId && pp.variantId === it.variantId);
      if (p) seed[p.id] = it.quantity;
    }
    return seed;
  }, [remote, products]);

  /**
   * Cancels the real Shopify order, then says so and shows it.
   *
   * Shopify runs the cancel as a background job, so re-reading the order at
   * once would often still find it open. The store records the cancel
   * straight away, the screen shows it, and the order is re-read twice (now
   * and a few seconds later) so Shopify's own state takes over once it lands.
   */
  const doCancel = useCallback(() => {
    const name = order?.number;
    Alert.alert(
      d.isRtl ? 'إلغاء الطلب' : 'Cancel order',
      d.isRtl ? `هيتم إلغاء الطلب ${name} نهائياً.` : `Order ${name} will be cancelled.`,
      [
        { text: d.isRtl ? 'رجوع' : 'Back', style: 'cancel' },
        {
          text: d.isRtl ? 'إلغاء الطلب' : 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            try {
              const r = await cancelShopifyOrder(name, state.session?.token);
              actions.cancelOrder(name, r?.cancelledAt);
              success();
              Alert.alert(
                d.isRtl ? 'تم إلغاء الطلب' : 'Order cancelled',
                d.isRtl
                  ? `تم إلغاء الطلب ${name}. مش هيتشحن ومش هتدفع حاجة.`
                  : `Order ${name} has been cancelled. It won't be shipped and you won't be charged.`,
              );
              actions.ordersChanged();
              setTimeout(() => actions.ordersChanged(), 4000);
            } catch (err) {
              Alert.alert(
                d.isRtl ? 'تعذّر الإلغاء' : 'Could not cancel',
                friendlyError(err, d.isRtl),
              );
            }
          },
        },
      ],
    );
  }, [order?.number, state.session?.token, d.isRtl, actions]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const { control } = useRefresh(loadStatus);

  /**
   * Opens the dialler or WhatsApp for the courier.
   *
   * `https://wa.me/…` rather than the `whatsapp://` scheme on purpose: the
   * custom scheme needs an LSApplicationQueriesSchemes entry to be openable
   * from Expo Go, while the https link hands off to the app when it is
   * installed and falls back to the web otherwise.
   */
  const contactCourier = useCallback(
    async (kind) => {
      const phone = live?.courierPhone;
      if (!phone) return;
      selectionTick();
      const url =
        kind === 'call'
          ? `tel:${String(phone).replace(/\s/g, '')}`
          : `https://wa.me/${waNumber(phone)}`;
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(
          d.isRtl ? 'تعذّر فتح التطبيق' : 'Could not open',
          d.isRtl
            ? `جرّب تتواصل مع المندوب على ${phone}`
            : `Try reaching the courier on ${phone}`,
        );
      }
    },
    [live?.courierPhone, d.isRtl],
  );

  /** No order open — the list is the entry point. */
  if (!order) {
    return (
      <FadeIn style={styles.root}>
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={control}>
          <Txt isRtl={d.isRtl} style={styles.bigTitle}>
            {d.t('ordersTitle')}
          </Txt>

          {listRows.length === 0 ? (
            <>
              <Txt center style={styles.empty}>
                {d.t('noOrders')}
              </Txt>
              {!signedIn ? (
                <Press
                  onPress={() => actions.goTo('signIn')}
                  activeScale={0.99}
                  style={styles.notice}
                >
                  <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
                    {d.isRtl
                      ? 'سجّل دخولك عشان تشوف طلباتك الحقيقية وتتبع الشحن.'
                      : 'Sign in to see your real orders and track their delivery.'}
                  </Txt>
                </Press>
              ) : null}
            </>
          ) : (
            listRows.map((o) => (
              <Press
                key={o.name}
                onPress={() => actions.openOrder(o.name)}
                activeScale={0.99}
                style={[styles.orderCard, rowDir]}
              >
                <View style={styles.orderThumb}>
                  {o.items?.[0]?.image ? (
                    <Img source={{ uri: o.items[0].image }} contentFit="contain" style={styles.fill} />
                  ) : o.items?.[0]?.localImg ? (
                    <Img source={o.items[0].localImg} contentFit="contain" style={styles.fill} />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={[styles.orderTop, rowDir]}>
                    <Txt style={styles.orderName}>{o.name}</Txt>
                    <Txt style={styles.orderTotal}>
                      {o.totalLabel ?? d.fmtPrice(Math.round(o.total ?? 0))}
                    </Txt>
                  </View>
                  <Txt isRtl={d.isRtl} style={styles.orderMeta} numberOfLines={1}>
                    {(o.items ?? []).length > 1
                      ? d.isRtl
                        ? `${o.items[0].title} و${d.num(o.items.length - 1)} أخرى`
                        : `${o.items[0].title} +${o.items.length - 1} more`
                      : o.items?.[0]?.title ?? ''}
                  </Txt>
                  <Txt
                    isRtl={d.isRtl}
                    style={[
                      styles.orderState,
                      { color: o.cancelled ? '#b3261e' : o.step >= 3 ? C.green : C.inkSoft },
                    ]}
                  >
                    {o.cancelled
                      ? d.isRtl ? 'ملغي' : 'Cancelled'
                      : o.local
                        ? d.isRtl ? 'محلي — لم يصل لشوبيفاي' : 'Local — never reached Shopify'
                        : o.stateLabel ?? (d.isRtl ? 'قيد المعالجة' : 'Processing')}
                  </Txt>
                </View>
                <View style={chevronFlip(d.isRtl)}>
                  <ChevronRight size={15} />
                </View>
              </Press>
            ))
          )}
          <View style={{ height: 26 }} />
        </ScrollView>
      </FadeIn>
    );
  }

  const activeStep = live?.step ?? 0;
  const steps = [
    d.isRtl ? 'قيد المعالجة' : 'Processing',
    d.isRtl ? 'التجهيز للشحن' : 'Preparing to Ship',
    d.isRtl ? 'تم الشحن' : 'Shipped',
    d.isRtl ? 'تم التوصيل' : 'Delivered',
  ];

  /**
   * Real events only. The prototype's invented timeline ("Courier assigned",
   * "On the way to the sorting hub") used to fill this space whenever the
   * service returned nothing, which made an order with no shipment look like
   * one already in transit.
   */
  const updates = (live?.updates ?? []).map((u) => ({
    text: u.text,
    time: u.time,
    done: u.done,
  }));

  // Only meaningful for a real Shopify order; a locally-placed one never has
  // an AWB to report on.
  const awaitingAwb = Boolean(remote) && !order.hasAwb;
  const localNoTracking = Boolean(order?.local);

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={control}>
        <ScreenHeader
          title={d.isRtl ? 'تفاصيل الطلب' : 'Order Details'}
          onBack={actions.backToOrderList}
          isRtl={d.isRtl}
        />

        {!signedIn || isLocalOnly ? (
          <Press
            onPress={() => actions.goTo('signIn')}
            activeScale={0.99}
            style={styles.notice}
          >
            <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
              {!signedIn
                ? d.isRtl
                  ? 'مش مسجل دخول — ده طلب الجلسة الحالية بس. سجّل دخولك عشان تشوف طلباتك الحقيقية وتقدر تعدّل أو تلغي.'
                  : "You're not signed in — this is this session's order only. Sign in to see your real orders and to edit or cancel them."
                : d.isRtl
                  ? 'الطلب ده اتعمل محلياً وما وصلش لشوبيفاي، فمفيش حاجة تتعدّل أو تتلغي عليه.'
                  : 'This order was created locally and never reached Shopify, so there is nothing on the store to edit or cancel.'}
            </Txt>
          </Press>
        ) : null}

        <View style={[styles.heroRow, rowDir]}>
          <View style={styles.heroImg}>
            {order.heroImg && <Img source={order.heroImg} contentFit="contain" style={styles.fill} />}
          </View>
          <View style={styles.heroMeta}>
            <Txt isRtl={d.isRtl} style={styles.heroTitle}>
              {order.heroTitle}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.heroTotal}>
              {order.total}
            </Txt>
          </View>
          <View style={chevronFlip(d.isRtl)}>
            <ChevronRight />
          </View>
        </View>

        {/* The hero row above shows only the first item — every order can hold
            several, so the full breakdown is listed here. */}
        {/* Cancelled orders say so first — the timeline and buttons below
            would otherwise read like an order still in progress. */}
        {order.cancelled ? (
          <View style={styles.cancelledBanner}>
            <Txt isRtl={d.isRtl} style={styles.cancelledTitle}>
              {d.isRtl ? 'تم إلغاء الطلب' : 'Order cancelled'}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.cancelledTxt}>
              {order.cancelledAt
                ? (d.isRtl ? 'اتلغى يوم ' : 'Cancelled on ') + fmtDate(order.cancelledAt, d.isRtl)
                : d.isRtl
                  ? 'الطلب ده اتلغى ومش هيتشحن.'
                  : 'This order was cancelled and will not be shipped.'}
            </Txt>
          </View>
        ) : null}

        {/* The invoice: every line at the price actually charged, then
            subtotal, discount, shipping and the total the courier collects. */}
        <View style={styles.invoice}>
          <Txt isRtl={d.isRtl} style={styles.itemsLabel}>
            {d.isRtl ? 'تفاصيل الفاتورة' : 'Invoice'}
          </Txt>
          {orderItems.map((it) => (
            <View key={it.key} style={[styles.itemRow, rowDir]}>
              <View style={styles.itemImg}>
                {it.img && <Img source={it.img} contentFit="contain" style={styles.fill} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt isRtl={d.isRtl} style={styles.itemTitle} numberOfLines={2}>
                  {it.title}
                </Txt>
                <Txt isRtl={d.isRtl} style={styles.itemQty}>
                  {`${d.num(it.qty)} × ${it.unit}`}
                </Txt>
              </View>
              <Txt style={styles.itemPrice}>{it.price}</Txt>
            </View>
          ))}

          {order.invoice ? (
            <View style={styles.totals}>
              <TotalRow
                label={d.isRtl ? 'المجموع الفرعي' : 'Subtotal'}
                value={d.fmtPrice(Math.round(order.invoice.subtotal))}
                rowDir={rowDir}
                isRtl={d.isRtl}
              />
              {order.invoice.discount > 0 ? (
                <TotalRow
                  label={d.isRtl ? 'الخصم' : 'Discount'}
                  value={`−${d.fmtPrice(Math.round(order.invoice.discount))}`}
                  rowDir={rowDir}
                  isRtl={d.isRtl}
                  tone={C.green}
                />
              ) : null}
              <TotalRow
                label={d.isRtl ? 'مصاريف الشحن' : 'Shipping'}
                value={
                  order.invoice.shipping > 0
                    ? d.fmtPrice(Math.round(order.invoice.shipping))
                    : d.isRtl ? 'مجاني' : 'Free'
                }
                rowDir={rowDir}
                isRtl={d.isRtl}
              />
              <View style={styles.totalsRule} />
              <TotalRow
                label={d.isRtl ? 'الإجمالي' : 'Total'}
                value={d.fmtPrice(Math.round(order.invoice.total))}
                rowDir={rowDir}
                isRtl={d.isRtl}
                strong
              />
              <Txt isRtl={d.isRtl} style={styles.payNote}>
                {(PAYMENT_LABEL[order.paymentMethod] ?? PAYMENT_LABEL.cod)[d.isRtl ? 1 : 0]}
                {order.paymentMethod === 'cod' && !order.cancelled
                  ? d.isRtl
                    ? ` — هتدفع ${d.fmtPrice(Math.round(order.invoice.total))} للمندوب`
                    : ` — pay the courier ${d.fmtPrice(Math.round(order.invoice.total))}`
                  : ''}
              </Txt>
            </View>
          ) : null}
        </View>

        <Divider style={styles.rule} />

        <View style={styles.arrivesBlock}>
          <Txt isRtl={d.isRtl} style={styles.arrivesTitle}>
            {live?.stateLabel ??
              (d.isRtl ? `يوصل ${order.cityDays}` : `Arrives in ${order.cityDays}`)}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.arrivesNote}>
            {d.isRtl
              ? 'استلمنا بيانات الدفع وبدأنا تجهيز طلبك.'
              : 'We’ve received your payment information and we’re preparing your order.'}
          </Txt>
        </View>

        <View style={[styles.steps, rowDir]}>
          {steps.map((label, i) => (
            <View key={label} style={styles.stepCol}>
              <View
                style={[
                  styles.stepBar,
                  { backgroundColor: i <= activeStep ? C.green : 'rgba(0,0,0,0.12)' },
                ]}
              />
              <Txt
                isRtl={d.isRtl}
                style={[
                  styles.stepTxt,
                  {
                    fontWeight: i === activeStep ? W.bold : W.medium,
                    color: i <= activeStep ? C.ink : 'rgba(110,110,115,0.95)',
                  },
                ]}
              >
                {label}
              </Txt>
            </View>
          ))}
        </View>

        {localNoTracking ? (
          <View style={styles.awaiting}>
            <Txt isRtl={d.isRtl} style={styles.awaitingTxt}>
              {d.isRtl
                ? 'الطلب ده محلي ومش موجود على شوبيفاي، فمفيش تحديثات شحن ليه.'
                : 'This order is local and does not exist on Shopify, so there is no shipping to track.'}
            </Txt>
          </View>
        ) : awaitingAwb ? (
          <View style={styles.awaiting}>
            <Txt isRtl={d.isRtl} style={styles.awaitingTxt}>
              {d.isRtl
                ? 'لسه ما اتعملش بوليصة شحن للطلب ده. هتظهر تحديثات J&T هنا أول ما تتصدر.'
                : 'No AWB has been issued for this order yet. J&T updates will appear here once it is.'}
            </Txt>
          </View>
        ) : live?.shippingError && updates.length === 0 ? (
          <View style={styles.awaiting}>
            <Txt isRtl={d.isRtl} style={styles.awaitingTxt}>
              {d.isRtl
                ? 'ما قدرناش نوصل لشركة الشحن دلوقتي، فتحديثات الشحن مش ظاهرة. جرّب تسحب لتحديث الصفحة.'
                : 'We could not reach the courier just now, so shipping updates are missing. Pull down to retry.'}
            </Txt>
          </View>
        ) : updates.length === 0 ? (
          <View style={styles.awaiting}>
            <Txt isRtl={d.isRtl} style={styles.awaitingTxt}>
              {d.isRtl
                ? 'لا توجد تحديثات بعد لهذا الطلب.'
                : 'No updates for this order yet.'}
            </Txt>
          </View>
        ) : (
        /* `overflow-y:auto` in the prototype — it has to be a real scroller,
           and nestedScrollEnabled lets it scroll inside the page. */
        <ScrollView
          style={styles.updates}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentContainerStyle={{ paddingBottom: 2 }}
        >
          {updates.map((u, i) => (
            <View key={i} style={[styles.updateRow, rowDir]}>
              <View
                style={[
                  styles.updateDot,
                  { backgroundColor: u.done ? C.green : 'rgba(0,0,0,0.16)' },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Txt isRtl={d.isRtl} style={styles.updateTxt}>
                  {u.text}
                </Txt>
                <Txt isRtl={d.isRtl} style={styles.updateTime}>
                  {u.time}
                </Txt>
              </View>
            </View>
          ))}
        </ScrollView>
        )}

        {/* The store's own events still show when the courier can't be
            reached — but the gap is said out loud rather than implied. */}
        {live?.shippingError && updates.length > 0 ? (
          <Txt isRtl={d.isRtl} style={styles.shippingErr}>
            {d.isRtl
              ? 'تعذّر الوصول لشركة الشحن — تحديثات الشحنة ممكن تكون ناقصة. اسحب للتحديث.'
              : 'Couldn’t reach the courier — shipment updates may be missing. Pull to refresh.'}
          </Txt>
        ) : null}

        {/* The courier carrying this parcel right now, and the two ways to
            reach them. Only rendered once the courier company has assigned one —
            there is no courier to call while an order is still at the hub. */}
        {live?.courier ? (
          <View style={styles.courier}>
            <Txt isRtl={d.isRtl} style={styles.courierLabel}>
              {live.carrier === 'jt'
                ? d.isRtl ? 'مندوب J&T' : 'J&T courier'
                : d.isRtl ? 'مندوب التوصيل' : 'Delivery courier'}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.courierName}>
              {live.courier}
            </Txt>
            {live.courierPhone ? (
              <>
                <Txt isRtl={d.isRtl} style={styles.courierPhone}>
                  {`⁦${live.courierPhone}⁩`}
                </Txt>
                <View style={[styles.courierBtns, rowDir]}>
                  <Press
                    onPress={() => contactCourier('call')}
                    activeScale={0.96}
                    style={[styles.courierBtn, styles.callBtn, rowDir]}
                  >
                    <Phone size={14} color="#ffffff" />
                    <Txt style={styles.courierBtnTxt}>{d.isRtl ? 'اتصال' : 'Call'}</Txt>
                  </Press>
                  <Press
                    onPress={() => contactCourier('whatsapp')}
                    activeScale={0.96}
                    style={[styles.courierBtn, styles.waBtn, rowDir]}
                  >
                    <WhatsApp size={15} color="#ffffff" />
                    <Txt style={styles.courierBtnTxt}>{d.isRtl ? 'واتساب' : 'WhatsApp'}</Txt>
                  </Press>
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {/* A failed delivery attempt the shopper can fix (J&T's problem code, or
            Bosta's `waitingForBusinessAction` on older orders), with its reason — a courier can't just retry a bad address or a
            failed WhatsApp verification, someone has to act on it. */}
        {live?.actionNeeded ? (
          <View style={styles.actionNeeded}>
            <Txt isRtl={d.isRtl} style={styles.actionNeededTitle}>
              {d.isRtl ? 'مطلوب إجراء' : 'Action needed'}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.actionNeededTxt}>
              {live.actionNeeded}
            </Txt>
          </View>
        ) : null}

        <Divider style={styles.ruleTop} />

        {/* The address this order actually shipped to — not the account's
            current default, which may since have changed. */}
        <Field label={d.isRtl ? 'الشحن إلى' : 'Ships to'} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldStrong}>
            {order.shipTo?.name || state.customer?.name || STR[d.lang].name}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
            {order.shipTo?.street || STR[d.lang].street}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
            {order.shipTo?.city || d.t(state.city)}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldPhone}>
            {`⁦${order.shipTo?.phone || state.customer?.phone || STR[d.lang].phone}⁩`}
          </Txt>
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.isRtl ? 'التوصيل' : 'Delivers'} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
            {order.cityDays || (d.isRtl ? 'توصيل سريع' : 'Express Delivery')}
          </Txt>
          {/* The courier used to be repeated here; the green box above now
              carries the name, number and the buttons to reach them. */}
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.t('orderNumber')} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldNum}>{order.number}</Txt>
          {live?.trackingNumber && (
            <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
              {(d.isRtl ? 'رقم التتبع: ' : 'Tracking: ') + live.trackingNumber}
            </Txt>
          )}
        </Field>

        <Divider style={styles.ruleTop} />

        {/* Says why the buttons are dead before they're pressed, rather than
            leaving a dimmed control with no explanation. */}
        {isFulfilled && !isLocalOnly ? (
          <View style={[styles.awaiting, { marginTop: 20 }]}>
            <Txt isRtl={d.isRtl} style={styles.awaitingTxt}>
              {d.isRtl
                ? 'الطلب اتشحن بالفعل وفي الطريق ليك، فمش ممكن تتعدّل عناصره أو عنوانه. لو محتاج تغيير كلّم المندوب أو خدمة العملاء.'
                : 'This order has shipped and is on its way, so its items and address can no longer be changed. Contact the courier or support if you need a change.'}
            </Txt>
          </View>
        ) : null}

        <View style={[styles.actions, rowDir]}>
          <Press
            onPress={() =>
              canEdit
                ? actions.editOrder(editSeed())
                : Alert.alert(
                    d.isRtl ? 'غير متاح' : 'Not available',
                    isFulfilled
                      ? d.isRtl
                        ? 'الطلب اتشحن بالفعل، فمش ممكن تتعدّل عناصره أو عنوانه.'
                        : 'This order has already shipped, so its items and address can no longer be changed.'
                      : d.isRtl
                        ? 'لازم تسجل دخولك وتفتح طلب حقيقي من شوبيفاي عشان تعدّله.'
                        : 'Sign in and open a real Shopify order to edit it.',
                  )
            }
            activeBg="rgba(0,0,0,0.04)"
            style={[styles.editBtn, !canEdit && styles.disabled]}
          >
            <Txt center style={styles.editTxt}>
              {d.isRtl ? 'تعديل' : 'Edit'}
            </Txt>
          </Press>
          <Press
            onPress={() =>
              order.cancelled
                ? Alert.alert(
                    d.isRtl ? 'الطلب ملغي' : 'Already cancelled',
                    d.isRtl ? 'الطلب ده اتلغى بالفعل.' : 'This order has already been cancelled.',
                  )
                : isFulfilled && !isLocalOnly
                  ? Alert.alert(d.isRtl ? 'غير متاح' : 'Not available', friendlyError('already shipped', d.isRtl))
                  : isLocalOnly || !signedIn
                    ? Alert.alert(
                        d.isRtl ? 'غير متاح' : 'Not available',
                        d.isRtl
                          ? 'لازم تسجل دخولك وتفتح طلب حقيقي من شوبيفاي عشان تلغيه.'
                          : 'Sign in and open a real Shopify order to cancel it.',
                      )
                    : doCancel()
            }
            style={[
              styles.cancelBtn,
              (isLocalOnly || !signedIn || order.cancelled || isFulfilled) && styles.disabled,
            ]}
          >
            <Txt center style={styles.cancelTxt}>
              {order.cancelled
                ? d.isRtl ? 'ملغي' : 'Cancelled'
                : d.isRtl ? 'إلغاء الطلب' : 'Cancel Order'}
            </Txt>
          </Press>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </FadeIn>
  );
}

function TotalRow({ label, value, rowDir, isRtl, strong, tone }) {
  return (
    <View style={[styles.totalRow, rowDir]}>
      <Txt isRtl={isRtl} style={[styles.totalLabel, strong && styles.totalStrong]}>
        {label}
      </Txt>
      <Txt style={[styles.totalValue, strong && styles.totalStrong, tone && { color: tone }]}>
        {value}
      </Txt>
    </View>
  );
}

const fmtDate = (iso, ar) =>
  new Date(iso).toLocaleString(ar ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function Field({ label, children, isRtl }) {
  return (
    <View style={[styles.field, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
      <Txt isRtl={isRtl} style={styles.fieldLabel}>
        {label}
      </Txt>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  rule: { marginHorizontal: 22 },
  ruleTop: { marginHorizontal: 22, marginTop: 20 },

  bigTitle: { paddingHorizontal: 22, paddingVertical: 18, fontWeight: W.heavy, fontSize: 26 },
  empty: { paddingVertical: 60, paddingHorizontal: 22, color: C.ink, fontSize: 13.5 },

  heroRow: { alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingBottom: 22 },
  orderCard: {
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 22,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  orderThumb: {
    width: 54,
    height: 54,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  orderTop: { alignItems: 'center', justifyContent: 'space-between' },
  orderName: { fontSize: 14, fontWeight: W.heavy },
  orderTotal: { fontSize: 13.5, fontWeight: W.bold, color: C.ink },
  orderMeta: { fontSize: 12.5, color: C.inkSoft, marginTop: 3 },
  orderState: { fontSize: 12, fontWeight: W.bold, marginTop: 4 },

  disabled: { opacity: 0.45 },
  notice: {
    marginHorizontal: 22,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(179,38,30,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.25)',
  },
  noticeTxt: { fontSize: 12.5, lineHeight: 19, color: '#8c1d18', fontWeight: W.semibold },

  awaiting: {
    marginHorizontal: 22,
    padding: 15,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  awaitingTxt: { fontSize: 12.5, lineHeight: 19, color: C.inkSoft },

  itemsList: { paddingHorizontal: 22, paddingBottom: 18, gap: 10 },
  itemsLabel: { fontSize: 12.5, fontWeight: W.bold, color: 'rgba(110,110,115,0.9)', marginBottom: 2 },
  itemRow: {
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  itemImg: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.03)' },
  itemTitle: { fontSize: 13, fontWeight: W.semibold, lineHeight: 17 },
  itemQty: { fontSize: 11.5, color: 'rgba(110,110,115,0.9)', marginTop: 2 },
  itemPrice: { fontSize: 13, fontWeight: W.bold, color: C.ink },
  heroImg: { width: 78, height: 88, alignItems: 'center', justifyContent: 'center' },
  heroMeta: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 15.5, fontWeight: W.semibold, lineHeight: 21 },
  heroTotal: { fontSize: 15, fontWeight: W.medium, marginTop: 6 },

  arrivesBlock: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6 },
  arrivesTitle: { fontSize: 19, fontWeight: W.bold },
  arrivesNote: { fontSize: 14, lineHeight: 21, marginTop: 8 },

  shippingErr: { marginHorizontal: 22, marginTop: 8, fontSize: 11.5, color: '#b3261e' },
  cancelledBanner: {
    marginHorizontal: 22,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(179,38,30,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.25)',
  },
  cancelledTitle: { fontSize: 15, fontWeight: W.heavy, color: '#b3261e' },
  cancelledTxt: { fontSize: 12.5, color: '#b3261e', marginTop: 3 },
  invoice: { paddingHorizontal: 22, paddingBottom: 18, gap: 10 },
  totals: { marginTop: 6, gap: 7 },
  totalRow: { justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13.5, color: C.inkSoft },
  totalValue: { fontSize: 13.5, fontWeight: W.semibold, color: C.ink },
  totalStrong: { fontSize: 16, fontWeight: W.heavy, color: C.ink },
  totalsRule: { height: 1, backgroundColor: C.hairlineSoft, marginVertical: 3 },
  payNote: { fontSize: 12, color: C.inkSoft, marginTop: 4 },
  steps: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, gap: 10 },
  stepCol: { flex: 1, gap: 9 },
  stepBar: { height: 4, borderRadius: 2 },
  stepTxt: { fontSize: 11, lineHeight: 14 },

  updates: {
    marginHorizontal: 22,
    marginBottom: 4,
    // The prototype capped this at 148px, which fit the two events it mocked
    // up. A real courier timeline runs to five or six rows, several of them two
    // lines deep, so that cap turned a full history into a peephole.
    maxHeight: 300,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.hairline,
  },
  updateRow: {
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.hairlineSoft,
  },
  updateDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  updateTxt: { fontSize: 13, fontWeight: W.medium, lineHeight: 18 },
  updateTime: { fontSize: 11.5, color: 'rgba(110,110,115,0.95)', marginTop: 3 },

  courier: {
    marginHorizontal: 22,
    marginTop: 14,
    padding: 15,
    borderRadius: 16,
    backgroundColor: 'rgba(31,143,78,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(31,143,78,0.3)',
  },
  courierLabel: {
    fontSize: 11.5,
    fontWeight: W.bold,
    color: C.greenDeep,
    opacity: 0.75,
    marginBottom: 3,
  },
  courierName: { fontSize: 15, fontWeight: W.bold, color: C.greenDeep, lineHeight: 20 },
  courierPhone: {
    fontSize: 14,
    letterSpacing: 0.5,
    color: C.greenDeep,
    marginTop: 3,
    lineHeight: 20,
  },
  courierBtns: { gap: 10, marginTop: 13 },
  courierBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 999,
  },
  callBtn: { backgroundColor: C.greenDeep },
  waBtn: { backgroundColor: '#25D366' },
  courierBtnTxt: { fontSize: 13.5, fontWeight: W.bold, color: '#ffffff' },

  actionNeeded: {
    marginHorizontal: 22,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(179,38,30,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.25)',
  },
  actionNeededTitle: { fontSize: 12, fontWeight: W.heavy, color: '#8c1d18', marginBottom: 4 },
  actionNeededTxt: { fontSize: 12.5, lineHeight: 19, color: '#8c1d18', fontWeight: W.semibold },

  field: { paddingHorizontal: 22, paddingTop: 20, gap: 16 },
  fieldLabel: { width: 88, fontSize: 14, color: 'rgba(110,110,115,0.95)' },
  fieldStrong: { fontSize: 14, fontWeight: W.medium, lineHeight: 22 },
  fieldTxt: { fontSize: 14, lineHeight: 22 },
  fieldPhone: { fontSize: 14, lineHeight: 22, letterSpacing: 0.5 },
  fieldNum: { fontSize: 14, fontWeight: W.semibold },

  actions: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30, gap: 10 },
  editBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
  },
  editTxt: { fontSize: 14, fontWeight: W.semibold },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 24, backgroundColor: '#1a1a1a' },
  cancelTxt: { fontSize: 14, fontWeight: W.semibold, color: '#ffffff' },
});
