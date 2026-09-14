import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActions, useDerived, useStore } from '../store';
import { success } from '../haptics';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Divider, Img, Press, Txt } from '../components/ui';
import { Cta, QtyStepper, ScreenHeader, SumRow } from '../components/parts';
import AddressPicker from '../components/AddressPicker';
import { calculateCheckout, fetchCustomerAddresses } from '../api/auth';
import {
  createSubscription,
  fetchSubscriptionFrequencies,
  updateSubscription,
} from '../api/subscriptions';

/**
 * Fallback frequency tiers, used only until the server answers or if it
 * can't be reached — the app should never dead-end just because this one
 * call failed. Kept in sync with `FREQUENCIES` in server/subscriptions.js,
 * which is the authoritative source once it's reachable.
 */
const LOCAL_FREQUENCIES = [
  { id: 'monthly', en: 'Every month', ar: 'كل شهر', intervalDays: 30, discountPct: 5 },
  { id: 'biweekly', en: 'Every 2 weeks', ar: 'كل أسبوعين', intervalDays: 14, discountPct: 10 },
  { id: 'weekly', en: 'Every week', ar: 'كل أسبوع', intervalDays: 7, discountPct: 15 },
];

/**
 * The subscription builder — a standalone order mode, not a variant of the
 * regular cart. A shopper picks how often deliveries arrive, a basket to
 * repeat, and where it goes; the discount climbs with frequency, and the
 * server's scheduler turns each due cycle into a real COD Shopify order.
 *
 * Doubles as the edit flow: `state.editingSubscription`, set by the
 * Subscriptions screen before navigating here, pre-fills everything below
 * and switches the submit action from create to update.
 */
export default function SubscribeScreen() {
  const { state, products, cats } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  const editing = state.editingSubscription;
  const signedIn = Boolean(state.session?.token);

  const [frequencies, setFrequencies] = useState(LOCAL_FREQUENCIES);
  const [frequencyId, setFrequencyId] = useState(editing?.frequencyId ?? null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSubscriptionFrequencies()
      .then((list) => {
        if (list.length) setFrequencies(list);
      })
      .catch(() => {
        // Offline or the service isn't configured — LOCAL_FREQUENCIES already
        // covers the screen, so there is nothing more to do here.
      });
  }, []);

  /** Resolves an editing subscription's stored items back to catalogue products. */
  const [subCart, setSubCart] = useState(() => {
    if (!editing) return {};
    const seed = {};
    for (const it of editing.items ?? []) {
      const p = products.find((pp) => pp.variantId && pp.variantId === it.variantId);
      if (p) seed[p.id] = it.quantity;
    }
    return seed;
  });

  const setQty = (id, qty) =>
    setSubCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const cartEntries = Object.entries(subCart)
    .map(([id, qty]) => {
      const p = products.find((pp) => pp.id === id);
      return p ? { id, product: p, qty } : null;
    })
    .filter(Boolean);

  /** Delivery address — same real-address list the rest of the app shares. */
  const addresses = state.addresses ?? [];
  const [pickedAddress, setPickedAddress] = useState(null);

  useEffect(() => {
    if (!signedIn || state.addresses !== null) return;
    fetchCustomerAddresses(state.session.token)
      .then((r) => actions.setAddresses(r.addresses ?? []))
      .catch(() => actions.setAddresses([]));
  }, [signedIn, state.addresses, state.session?.token, actions]);

  // Once the real list arrives, try to preselect whichever address this
  // subscription is already shipping to, matched by its street + city since
  // the stored record has no address id of its own to key off.
  useEffect(() => {
    if (!editing || pickedAddress || !addresses.length) return;
    const match = addresses.find(
      (a) => a.raw?.address1 === editing.address?.address1 && a.raw?.city === editing.address?.city,
    );
    if (match) setPickedAddress(match);
  }, [editing, addresses, pickedAddress]);

  const activeAddress =
    pickedAddress ?? addresses.find((a) => a.id === state.selectedAddress) ?? addresses.find((a) => a.isDefault) ?? null;

  /**
   * The delivery fee for this address, asked of Shopify the same way checkout
   * does — a per-city table guessed client-side is exactly what caused the
   * checkout total to disagree with the store before that was fixed.
   */
  const [shippingFee, setShippingFee] = useState(editing?.shippingFee ?? 0);

  const quoteKey = JSON.stringify([
    cartEntries.map((e) => [e.product.variantId, e.qty]),
    activeAddress?.id,
  ]);

  const loadShipping = useCallback(async () => {
    if (!cartEntries.length || !activeAddress) return;
    try {
      const q = await calculateCheckout({
        items: cartEntries.map((e) => ({
          variantId: e.product.variantId,
          quantity: e.qty,
          price: e.product.price,
          title: e.product.titleEn,
        })),
        customer: { street: activeAddress.street, city: activeAddress.city, phone: activeAddress.phone },
      });
      setShippingFee(q.shipping ?? 0);
    } catch {
      // Keep whatever figure was already showing — an unreachable quote
      // should not block building the subscription.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  useEffect(() => {
    loadShipping();
  }, [loadShipping]);

  const freq = useMemo(() => frequencies.find((f) => f.id === frequencyId) ?? null, [frequencies, frequencyId]);
  const subtotalRaw = cartEntries.reduce((a, e) => a + e.product.price * e.qty, 0);
  const discountRaw = freq ? Math.round(subtotalRaw * (freq.discountPct / 100)) : 0;
  const totalRaw = subtotalRaw - discountRaw + shippingFee;

  const canSubmit = signedIn && Boolean(freq) && cartEntries.length > 0 && Boolean(activeAddress);

  const submit = async () => {
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const items = cartEntries.map((e) => ({
        variantId: e.product.variantId,
        title: e.product.titleEn,
        price: e.product.price,
        quantity: e.qty,
      }));
      const address = activeAddress.raw ?? {
        address1: activeAddress.street,
        city: activeAddress.city,
        phone: activeAddress.phone,
        firstName: state.customer?.name?.split(' ')?.[0],
      };

      if (editing) {
        await updateSubscription(
          editing.id,
          { items, frequencyId: freq.id, address, shippingFee },
          state.session.token,
        );
      } else {
        await createSubscription(
          {
            frequencyId: freq.id,
            items,
            address,
            shippingFee,
            customerName: state.customer?.name,
            email: state.customer?.email,
          },
          state.session.token,
        );
      }
      success();
      actions.patch({ editingSubscription: null, subscriptions: null });
      actions.goTo('subscriptions');
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر حفظ الاشتراك' : 'Could not save the subscription',
        String(err.message ?? err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!signedIn) {
    return (
      <FadeIn style={styles.root}>
        <ScreenHeader
          title={d.isRtl ? 'الاشتراك والتوفير' : 'Subscribe & Save'}
          onBack={actions.goBack}
          isRtl={d.isRtl}
        />
        <Press onPress={() => actions.goTo('signIn')} activeScale={0.99} style={styles.notice}>
          <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
            {d.isRtl
              ? 'سجّل دخولك عشان تقدر تبدأ اشتراك توصيل متكرر.'
              : 'Sign in to start a recurring delivery subscription.'}
          </Txt>
        </Press>
      </FadeIn>
    );
  }

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={editing ? (d.isRtl ? 'تعديل الاشتراك' : 'Edit Subscription') : (d.isRtl ? 'الاشتراك والتوفير' : 'Subscribe & Save')}
          onBack={actions.goBack}
          isRtl={d.isRtl}
        />

        <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
          {d.isRtl ? 'كل ما توصلك بشكل متكرر، وفّر أكتر' : 'THE MORE OFTEN IT ARRIVES, THE MORE YOU SAVE'}
        </Txt>
        {frequencies.map((f) => {
          const active = f.id === frequencyId;
          return (
            <Press
              key={f.id}
              onPress={() => setFrequencyId(f.id)}
              style={[
                styles.freqRow,
                rowDir,
                {
                  borderColor: active ? C.ink : 'rgba(0,0,0,0.1)',
                  borderWidth: active ? 1.5 : 1,
                  backgroundColor: active ? 'rgba(0,0,0,0.035)' : '#ffffff',
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Txt isRtl={d.isRtl} style={styles.freqLabel}>
                  {d.isRtl ? f.ar : f.en}
                </Txt>
              </View>
              <View style={styles.freqBadge}>
                <Txt style={styles.freqBadgeTxt}>
                  {d.isRtl ? `وفّر ${d.num(f.discountPct)}٪` : `Save ${f.discountPct}%`}
                </Txt>
              </View>
            </Press>
          );
        })}

        <Divider style={styles.rule} />
        <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
          {d.isRtl ? 'عنوان التوصيل' : 'DELIVERY ADDRESS'}
        </Txt>
        {addresses.length ? (
          <AddressPicker
            addresses={addresses}
            activeId={activeAddress?.id}
            onPick={setPickedAddress}
            isRtl={d.isRtl}
            fallbackName={state.customer?.name}
            gutter={22}
          />
        ) : (
          <Press onPress={() => actions.goTo('addAddress')} activeScale={0.99} style={styles.notice}>
            <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
              {d.isRtl ? 'مفيش عنوان محفوظ — ضيف عنوان الأول.' : 'No saved address yet — add one first.'}
            </Txt>
          </Press>
        )}

        <Divider style={styles.rule} />
        <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
          {d.isRtl ? 'اختار المنتجات' : 'CHOOSE YOUR PRODUCTS'}
        </Txt>
        {cats.map((c) => {
          const group = products.filter((p) => p.cat === c.id);
          if (!group.length) return null;
          return (
            <View key={c.id}>
              <Txt isRtl={d.isRtl} style={styles.groupLabel}>
                {d.isRtl ? c.ar : c.en}
              </Txt>
              {group.map((p) => {
                const qty = subCart[p.id] || 0;
                return (
                  <View key={p.id} style={[styles.catalogRow, rowDir]}>
                    <View style={styles.catalogImg}>
                      <Img source={p.img} contentFit="contain" style={styles.fill} />
                    </View>
                    <View style={styles.catalogMeta}>
                      <Txt isRtl={d.isRtl} style={styles.catalogTitle}>
                        {d.title(p)}
                      </Txt>
                      <Txt isRtl={d.isRtl} style={styles.catalogPrice}>
                        {d.fmtPrice(p.price)}
                      </Txt>
                    </View>
                    <QtyStepper
                      isRtl={d.isRtl}
                      size={26}
                      fontSize={14}
                      gap={8}
                      qty={d.num(qty)}
                      onDec={() => setQty(p.id, qty - 1)}
                      onInc={() => setQty(p.id, qty + 1)}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}

        <Divider style={styles.rule} />
        <View style={styles.totals}>
          <SumRow
            isRtl={d.isRtl}
            label={d.t('subtotal')}
            value={d.fmtPrice(subtotalRaw)}
            labelStyle={styles.totalSub}
            valueStyle={styles.totalSub}
          />
          {freq ? (
            <SumRow
              isRtl={d.isRtl}
              label={d.isRtl ? `خصم ${d.num(freq.discountPct)}٪` : `${freq.discountPct}% discount`}
              value={`-${d.fmtPrice(discountRaw)}`}
              labelStyle={[styles.totalSub, { color: C.greenDeep }]}
              valueStyle={[styles.totalSub, { color: C.greenDeep }]}
            />
          ) : null}
          <SumRow
            isRtl={d.isRtl}
            label={d.isRtl ? 'الشحن' : 'Shipping'}
            value={shippingFee > 0 ? d.fmtPrice(shippingFee) : d.isRtl ? 'مجاني' : 'Free'}
            labelStyle={styles.totalSub}
            valueStyle={styles.totalSub}
          />
          <SumRow
            isRtl={d.isRtl}
            label={d.isRtl ? 'كل عملية توصيل' : 'Each delivery'}
            value={d.fmtPrice(totalRaw)}
            style={{ paddingTop: 6 }}
            labelStyle={styles.totalMain}
            valueStyle={styles.totalMain}
          />
        </View>

        <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 30 }}>
          <Cta
            label={submitting ? '' : editing ? (d.isRtl ? 'حفظ التعديلات' : 'Save changes') : (d.isRtl ? 'ابدأ الاشتراك' : 'Start subscription')}
            onPress={submit}
            textStyle={{ fontWeight: W.bold }}
          >
            {submitting ? <ActivityIndicator color="#ffffff" /> : undefined}
          </Cta>
          {!canSubmit ? (
            <Txt isRtl={d.isRtl} style={styles.hint}>
              {!freq
                ? d.isRtl
                  ? 'اختار مواعيد التوصيل الأول.'
                  : 'Pick a delivery frequency first.'
                : !cartEntries.length
                  ? d.isRtl
                    ? 'ضيف منتج واحد على الأقل.'
                    : 'Add at least one product.'
                  : d.isRtl
                    ? 'محتاج عنوان توصيل.'
                    : 'A delivery address is needed.'}
            </Txt>
          ) : null}
        </View>
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },

  sectionLabel: {
    paddingHorizontal: 22,
    paddingBottom: 10,
    fontSize: 12.5,
    fontWeight: W.bold,
    color: 'rgba(110,110,115,0.9)',
    letterSpacing: 0.4,
  },

  freqRow: {
    marginHorizontal: 22,
    marginBottom: 9,
    padding: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  freqLabel: { fontSize: 14.5, fontWeight: W.bold },
  freqBadge: { backgroundColor: C.greenDeep, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  freqBadgeTxt: { fontSize: 12, fontWeight: W.bold, color: '#ffffff' },

  rule: { marginHorizontal: 22, marginVertical: 16 },

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

  groupLabel: { paddingHorizontal: 22, paddingBottom: 8, paddingTop: 6, fontSize: 15, fontWeight: W.heavy },
  catalogRow: {
    gap: 12,
    marginHorizontal: 22,
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    alignItems: 'center',
  },
  catalogImg: {
    width: 44,
    height: 44,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  catalogMeta: { flex: 1, minWidth: 0, gap: 2 },
  catalogTitle: { fontSize: 13, fontWeight: W.semibold, lineHeight: 17 },
  catalogPrice: { fontSize: 12, color: 'rgba(110,110,115,0.9)' },

  totals: { paddingHorizontal: 22, gap: 2 },
  totalSub: { fontSize: 13.5, color: 'rgba(110,110,115,0.9)' },
  totalMain: { fontSize: 16, fontWeight: W.heavy },

  hint: { marginTop: 10, fontSize: 12, color: 'rgba(110,110,115,0.9)', textAlign: 'center' },
});
