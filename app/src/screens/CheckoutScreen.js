import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useActions, useDerived, useStore } from '../state/store';
import { success } from '../lib/haptics';
import { C, W } from '../theme';
import { chevronFlip } from '../lib/rtl';
import { FadeIn } from '../components/anim';
import { Divider, Img, Press, Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';
import { ChevronRight, MastercardMark } from '../components/Icons';
import { fetchCustomerAddresses, fetchQuote, placeOrder as submitOrder } from '../api/auth';
import { hasService } from '../api/config';

export default function CheckoutScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const [placing, setPlacing] = useState(false);
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };
  const token = state.session?.token ?? null;

  /**
   * One key per visit to checkout: a double tap, or a retry after the network
   * dropped mid-request, returns the order already placed instead of a second.
   */
  const [idempotencyKey] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!token || state.addresses !== null) return;
    fetchCustomerAddresses(token)
      .then((r) => actions.setAddresses(r.addresses ?? []))
      .catch(() => actions.setAddresses([]));
  }, [token, state.addresses, actions]);

  /** The address picked on the Addresses screen, else the account default. */
  const selectedAddr =
    (state.addresses ?? []).find((a) => a.id === state.selectedAddress) ??
    (state.addresses ?? []).find((a) => a.isDefault) ??
    (state.addresses ?? [])[0] ??
    null;

  const payOptions = [
    { id: 'cod', label: d.t('cod') },
    { id: 'card', label: d.t('card') },
    { id: 'wallet', label: d.t('wallet') },
  ].filter((po) => state.config.paymentMethods.includes(po.id));

  // A method the server stopped offering can't stay selected.
  useEffect(() => {
    if (!state.config.paymentMethods.includes(state.paymentMethod)) actions.setPaymentMethod('cod');
  }, [state.config.paymentMethods, state.paymentMethod, actions]);

  /** The server's price for exactly this basket, address and payment method. */
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const discountCode = state.discount?.applied ? state.discount.code : null;
  const quoteKey = JSON.stringify([d.cartLines, selectedAddr?.id, discountCode, state.paymentMethod]);

  const loadQuote = useCallback(async () => {
    if (!d.cartLines.length || !selectedAddr) return;
    try {
      const q = await fetchQuote(
        { lines: d.cartLines, discountCode, addressId: selectedAddr.id, paymentMethod: state.paymentMethod },
        token,
      );
      setQuote(q);
      setQuoteError(null);
    } catch (err) {
      setQuote(null);
      setQuoteError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  const totalLabel = quote ? d.fmtPrice(quote.total) : '…';
  const eta = d.etaFor(selectedAddr);
  const hero = d.cartEntries[0];

  const placeOrder = async () => {
    if (placing || !quote || !selectedAddr) return;
    if (quote.belowMinimum) return;
    setPlacing(true);
    try {
      const result = await submitOrder(
        {
          idempotencyKey,
          lang: d.lang,
          lines: d.cartLines,
          addressId: selectedAddr.id,
          discountCode,
          paymentMethod: state.paymentMethod,
        },
        token,
      );
      success();
      actions.placeOrder({
        number: result.orderNumber,
        shopifyOrderId: result.shopifyOrderId ?? null,
        trackingNumber: null,
        total: d.fmtPrice(result.total),
        cityDays: eta,
        itemCount: d.cartCount,
        heroImg: hero ? hero.product.img : null,
        heroTitle: hero ? d.title(hero.product) : '',
        heroProductId: hero ? hero.id : null,
      });
    } catch (err) {
      // The cart stays as it is: nothing was ordered, and the shopper is told
      // so. (A failure used to show a made-up order number and empty the cart.)
      Alert.alert(
        d.isRtl ? 'ما اتسجلش الطلب' : 'Your order was not placed',
        String(err.message ?? err),
        [{ text: d.isRtl ? 'حسناً' : 'OK' }],
      );
      if (err.code === 'stock' || err.code === 'discount') loadQuote();
    } finally {
      setPlacing(false);
    }
  };

  /* Signed out, or no service: checkout can't go further. */
  if (!token || !hasService()) {
    return (
      <FadeIn style={styles.root}>
        <ScreenHeader title={d.t('checkout')} onBack={actions.goBack} isRtl={d.isRtl} />
        <View style={styles.gate}>
          <Txt isRtl={d.isRtl} style={styles.arrivesTitle}>
            {!hasService()
              ? d.isRtl ? 'الطلب غير متاح في النسخة دي' : 'Ordering is not available in this build'
              : d.isRtl ? 'سجّل دخولك برقم موبايلك' : 'Sign in with your phone to order'}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.arrivesNote}>
            {d.isRtl
              ? 'بنأكد رقمك مرة واحدة عشان المندوب يقدر يوصلك.'
              : 'We confirm your number once so the courier can reach you.'}
          </Txt>
          {hasService() ? (
            <Cta label={d.isRtl ? 'تسجيل الدخول' : 'Sign in'} onPress={() => actions.requireSignIn('checkout')} style={{ marginTop: 18 }} />
          ) : null}
        </View>
      </FadeIn>
    );
  }

  const noAddress = state.addresses !== null && !selectedAddr;

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title={d.t('checkout')} onBack={actions.goBack} isRtl={d.isRtl} />

        <View style={[styles.heroRow, rowDir]}>
          <View style={styles.heroImg}>
            {hero && <Img source={hero.product.img} contentFit="contain" style={styles.fill} />}
          </View>
          <View style={styles.heroMeta}>
            <Txt isRtl={d.isRtl} style={styles.heroTitle}>
              {hero ? d.title(hero.product) : ''}
              {d.cartCount > 1 ? (d.isRtl ? ` + ${d.num(d.cartCount - 1)}` : ` + ${d.cartCount - 1} more`) : ''}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.heroTotal}>
              {totalLabel}
            </Txt>
          </View>
          <Press onPress={() => actions.goTab('cart')} style={chevronFlip(d.isRtl)} hitSlop={10}>
            <ChevronRight />
          </Press>
        </View>

        <Divider style={styles.rule} />

        <View style={styles.arrivesBlock}>
          <Txt isRtl={d.isRtl} style={styles.arrivesTitle}>
            {d.isRtl ? `يوصل خلال ${eta}` : `Arrives in ${eta}`}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.arrivesNote}>
            {d.isRtl
              ? 'هنراجع طلبك ونجهّزه للشحن بعد التأكيد.'
              : 'We’ll confirm your order and start preparing it for shipping.'}
          </Txt>
        </View>

        <Divider style={styles.rule} />

        <Field label={d.isRtl ? 'الشحن إلى' : 'Ships to'} isRtl={d.isRtl}>
          {state.addresses === null ? (
            <ActivityIndicator color={C.ink} style={{ alignSelf: d.isRtl ? 'flex-end' : 'flex-start' }} />
          ) : noAddress ? (
            <Press onPress={() => actions.goTo('addAddress')}>
              <Txt isRtl={d.isRtl} style={[styles.fieldStrong, { color: C.accent }]}>
                {d.isRtl ? '+ ضيف عنوان التوصيل' : '+ Add a delivery address'}
              </Txt>
            </Press>
          ) : (
            <Press onPress={() => actions.goTo('addresses')}>
              <Txt isRtl={d.isRtl} style={styles.fieldStrong}>{selectedAddr.name}</Txt>
              <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{selectedAddr.street}</Txt>
              <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{selectedAddr.city}</Txt>
              <Txt isRtl={d.isRtl} style={styles.fieldPhone}>{`⁦${selectedAddr.phone ?? ''}⁩`}</Txt>
              <Txt isRtl={d.isRtl} style={[styles.fieldTxt, { color: C.accent }]}>{d.t('change')}</Txt>
            </Press>
          )}
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.t('paymentTitle')} isRtl={d.isRtl}>
          <View style={{ gap: 12 }}>
            {payOptions.map((po) => (
              <Press
                key={po.id}
                onPress={() => actions.setPaymentMethod(po.id)}
                style={[styles.payRow, rowDir]}
              >
                <View style={styles.radio}>
                  <View
                    style={[
                      styles.radioDot,
                      { backgroundColor: state.paymentMethod === po.id ? C.accent : 'transparent' },
                    ]}
                  />
                </View>
                <Txt style={styles.payLabel}>{po.label}</Txt>
                {po.id === 'card' && (
                  <View style={[styles.marks, rowDir]}>
                    <View style={styles.markBox}>
                      <Txt style={styles.visa}>VISA</Txt>
                    </View>
                    <MastercardMark />
                    <View style={styles.markBox}>
                      <Txt style={styles.meeza}>meeza</Txt>
                    </View>
                  </View>
                )}
              </Press>
            ))}
            {state.paymentMethod === 'cod' && quote ? (
              <Txt isRtl={d.isRtl} style={styles.codNote}>
                {`${d.t('codNote')}: ${totalLabel}`}
              </Txt>
            ) : null}
          </View>
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.t('total')} isRtl={d.isRtl} style={{ paddingBottom: 110 }}>
          {quote ? (
            <View style={{ gap: 4 }}>
              <SumLine d={d} label={d.t('subtotal')} value={d.fmtPrice(quote.subtotal)} />
              {quote.discount.applied ? (
                <SumLine d={d} label={`${d.t('discount')} (${quote.discount.code})`} value={`-${d.fmtPrice(quote.discount.amount)}`} />
              ) : null}
              <SumLine
                d={d}
                label={d.t('shipping')}
                value={quote.shipping === 0 ? d.t('freeShipReached') : d.fmtPrice(quote.shipping)}
              />
              <Txt isRtl={d.isRtl} style={[styles.arrivesTitle, { marginTop: 6 }]}>
                {totalLabel}
              </Txt>
              {quote.belowMinimum ? (
                <Txt isRtl={d.isRtl} style={styles.quoteWarn}>
                  {d.isRtl
                    ? `أقل طلب ${d.fmtPrice(quote.minOrder)}.`
                    : `The minimum order is ${d.fmtPrice(quote.minOrder)}.`}
                </Txt>
              ) : null}
            </View>
          ) : quoteError ? (
            <View>
              <Txt isRtl={d.isRtl} style={styles.quoteWarn}>
                {String(quoteError.message ?? quoteError)}
              </Txt>
              <Press onPress={loadQuote}>
                <Txt isRtl={d.isRtl} style={[styles.fieldTxt, { color: C.accent }]}>
                  {d.isRtl ? 'حاول تاني' : 'Try again'}
                </Txt>
              </Press>
            </View>
          ) : noAddress ? (
            <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
              {d.isRtl ? 'ضيف عنوان عشان نحسب الإجمالي.' : 'Add an address to see your total.'}
            </Txt>
          ) : (
            <ActivityIndicator color={C.ink} style={{ alignSelf: d.isRtl ? 'flex-end' : 'flex-start' }} />
          )}
        </Field>
      </ScrollView>

      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.94)']}
        locations={[0, 0.45]}
        style={styles.placeBar}
      >
        <Cta
          label={placing ? '' : d.t('placeOrder')}
          onPress={placeOrder}
          textStyle={{ fontWeight: W.bold }}
          style={!quote || quote.belowMinimum ? { opacity: 0.45 } : null}
        >
          {placing ? <ActivityIndicator color="#ffffff" /> : undefined}
        </Cta>
      </LinearGradient>
    </FadeIn>
  );
}

function SumLine({ d, label, value }) {
  return (
    <View style={{ flexDirection: d.isRtl ? 'row-reverse' : 'row', justifyContent: 'space-between' }}>
      <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{label}</Txt>
      <Txt style={styles.fieldTxt}>{value}</Txt>
    </View>
  );
}

/** `grid-template-columns: 88px 1fr` label/value block. */
function Field({ label, children, isRtl, style }) {
  return (
    <View
      style={[
        styles.field,
        { flexDirection: isRtl ? 'row-reverse' : 'row' },
        style,
      ]}
    >
      <Txt isRtl={isRtl} style={styles.fieldLabel}>
        {label}
      </Txt>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { paddingHorizontal: 22, paddingTop: 30 },
  fill: { width: '100%', height: '100%' },
  rule: { marginHorizontal: 22 },
  ruleTop: { marginHorizontal: 22, marginTop: 20 },

  heroRow: { alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingBottom: 22 },
  heroImg: { width: 78, height: 88, alignItems: 'center', justifyContent: 'center' },
  heroMeta: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 15.5, fontWeight: W.semibold, lineHeight: 21 },
  heroTotal: { fontSize: 15, fontWeight: W.medium, color: C.ink, marginTop: 6 },

  arrivesBlock: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6 },
  arrivesTitle: { fontSize: 19, fontWeight: W.bold },
  arrivesNote: { fontSize: 14, lineHeight: 21, color: C.ink, marginTop: 8 },

  field: { paddingHorizontal: 22, paddingTop: 20, gap: 16 },
  fieldLabel: { width: 88, fontSize: 14, color: C.ink },
  fieldStrong: { fontSize: 14, fontWeight: W.medium, lineHeight: 22 },
  fieldTxt: { fontSize: 14, lineHeight: 22 },
  fieldPhone: { fontSize: 14, lineHeight: 22, letterSpacing: 0.5, color: C.ink },

  payRow: { alignItems: 'center', gap: 10 },
  radio: {
    width: 18,
    height: 18,
    borderWidth: 1.6,
    borderColor: 'rgba(0,0,0,0.25)',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  payLabel: { fontSize: 14, fontWeight: W.medium },
  marks: { alignItems: 'center', gap: 6, marginLeft: 'auto' },
  markBox: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visa: { fontSize: 9, fontWeight: W.heavy, fontStyle: 'italic', letterSpacing: 0.3, color: '#1a1f71' },
  meeza: { fontSize: 8.5, fontWeight: W.heavy, color: '#0a7a3c' },
  codNote: { fontSize: 12.5, color: C.ink, lineHeight: 19 },
  quoteWarn: { fontSize: 11.5, color: '#8c1d18', lineHeight: 17, marginTop: 6 },

  placeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
});
