import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

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
import { ChevronRight } from '../components/Icons';

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
              price: p?.price ?? 0,
              image: null,
              localImg: p?.img ?? null,
              variantId: p?.variantId ?? null,
            };
          }),
          cancelled: state.order.status === 'cancelled',
          local: true,
          shipTo: null,
          hasAwb: Boolean(state.order.trackingNumber),
          trackingNumber: state.order.trackingNumber ?? null,
          city: state.order.cityDays ?? '',
          stateLabel: null,
          step: 0,
        }
      : null;

  const listRows = [...remoteOrders, ...(localRow ? [localRow] : [])];
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
        cancelled: selected.cancelled,
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
   * Every line in the order, not just the hero item. A real order (`remote`)
   * already carries full line items from Shopify; a locally-placed order only
   * has {productId: qty}, resolved back to the catalogue here.
   */
  const orderItems = (selected?.items ?? []).map((it) => ({
    key: it.id,
    title: it.title,
    qty: it.quantity,
    price: d.fmtPrice(Math.round((it.price ?? 0) * it.quantity)),
    img: it.image ? { uri: it.image } : it.localImg ?? null,
  }));

  /** Live Bosta/Shopify status, when the order service is reachable. */
  const [live, setLive] = useState(null);

  const loadStatus = useCallback(async () => {
    // Signed in: pull the customer's real orders, each already joined to Bosta.
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
                updates: shown.updates ?? [],
              }
            : null,
        );
        return;
      } catch {
        // fall through to the single-order path
      }
    }
    // A local-only order has nothing on Shopify or Bosta to ask about.
    if (!order || order.local) {
      setLive(null);
      return;
    }
    const r = await fetchOrderStatus({
      orderNumber: order.number,
      trackingNumber: order.trackingNumber,
      phone: state.customer?.phone || STR[d.lang].phone,
    });
    setLive(r);
  }, [
    state.session?.token,
    d.lang,
    order?.number,
    order?.trackingNumber,
    state.customer?.phone,
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

  /** Cancels the real Shopify order, not just the local copy. */
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
              await cancelShopifyOrder(name, state.session?.token);
              actions.cancelOrder();
              // Pull the order back from Shopify so the screen shows what the
              // store actually says, not an optimistic guess.
              actions.ordersChanged();
            } catch (err) {
              Alert.alert(d.isRtl ? 'تعذّر الإلغاء' : 'Could not cancel', String(err.message ?? err));
            }
          },
        },
      ],
    );
  }, [order?.number, state.session?.token, d.isRtl, actions, loadStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const { control } = useRefresh(loadStatus);

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
        {orderItems.length > 1 && (
          <View style={styles.itemsList}>
            <Txt isRtl={d.isRtl} style={styles.itemsLabel}>
              {d.isRtl ? `كل العناصر (${d.num(orderItems.length)})` : `All items (${orderItems.length})`}
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
                    {d.isRtl ? `الكمية: ${d.num(it.qty)}` : `Qty: ${it.qty}`}
                  </Txt>
                </View>
                <Txt style={styles.itemPrice}>{it.price}</Txt>
              </View>
            ))}
          </View>
        )}

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
                ? 'لسه ما اتعملش بوليصة شحن للطلب ده. هتظهر تحديثات بوسطة هنا أول ما تتصدر.'
                : 'No AWB has been issued for this order yet. Bosta updates will appear here once it is.'}
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
        /* `max-height:148px; overflow-y:auto` in the prototype — it has to be a
           real scroller, and nestedScrollEnabled lets it scroll inside the page. */
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
          {live?.courier ? (
            <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
              {(d.isRtl ? 'المندوب: ' : 'Courier: ') + live.courier}
            </Txt>
          ) : null}
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

        <View style={[styles.actions, rowDir]}>
          <Press
            onPress={() =>
              isLocalOnly || !signedIn
                ? Alert.alert(
                    d.isRtl ? 'غير متاح' : 'Not available',
                    d.isRtl
                      ? 'لازم تسجل دخولك وتفتح طلب حقيقي من شوبيفاي عشان تعدّله.'
                      : 'Sign in and open a real Shopify order to edit it.',
                  )
                : actions.editOrder(editSeed())
            }
            activeBg="rgba(0,0,0,0.04)"
            style={[styles.editBtn, (isLocalOnly || !signedIn) && styles.disabled]}
          >
            <Txt center style={styles.editTxt}>
              {d.isRtl ? 'تعديل' : 'Edit'}
            </Txt>
          </Press>
          <Press
            onPress={() =>
              isLocalOnly || !signedIn
                ? Alert.alert(
                    d.isRtl ? 'غير متاح' : 'Not available',
                    d.isRtl
                      ? 'لازم تسجل دخولك وتفتح طلب حقيقي من شوبيفاي عشان تلغيه.'
                      : 'Sign in and open a real Shopify order to cancel it.',
                  )
                : doCancel()
            }
            style={[styles.cancelBtn, (isLocalOnly || !signedIn) && styles.disabled]}
          >
            <Txt center style={styles.cancelTxt}>
              {d.isRtl ? 'إلغاء الطلب' : 'Cancel Order'}
            </Txt>
          </Press>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </FadeIn>
  );
}

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

  steps: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, gap: 10 },
  stepCol: { flex: 1, gap: 9 },
  stepBar: { height: 4, borderRadius: 2 },
  stepTxt: { fontSize: 11, lineHeight: 14 },

  updates: {
    marginHorizontal: 22,
    marginBottom: 4,
    maxHeight: 148,
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
