import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { STR } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { success } from '../haptics';
import { C, W } from '../theme';
import { chevronFlip } from '../rtl';
import { FadeIn } from '../components/anim';
import { Divider, Img, Press, Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';
import { ChevronRight, MastercardMark } from '../components/Icons';
import { submitOrder } from '../api/orders';

export default function CheckoutScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const [placing, setPlacing] = useState(false);
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  /**
   * The signed-in customer wins; the address they typed comes next; the
   * prototype's placeholder person is only ever a last resort, and shipping
   * every order under one name was exactly that resort firing every time.
   */
  const buyer = {
    name: state.customer?.name || state.newAddr?.name || STR[d.lang].name,
    email: state.customer?.email || null,
    phone: state.customer?.phone || state.newAddr?.phone || STR[d.lang].phone,
    street:
      state.newAddr?.street ||
      state.customer?.address?.address1 ||
      STR[d.lang].street,
    city: state.newAddr?.city || state.customer?.address?.city || d.t(state.city),
  };

  const hero = d.cartEntries[0];
  const payOptions = [
    { id: 'cod', label: d.t('cod') },
    { id: 'card', label: d.t('card') },
    { id: 'wallet', label: d.t('wallet') },
  ];

  /**
   * Native checkout: the cart is posted to the OKA order service, which creates
   * the real Shopify order server-side. If the service isn't configured the
   * prototype's local order number is used instead, so the flow never dead-ends.
   */
  const placeOrder = async () => {
    if (placing) return;
    setPlacing(true);
    try {
      const result = await submitOrder({
        lang: d.lang,
        items: d.cartEntries.map((ce) => ({
          id: ce.id,
          variantId: ce.product.variantId,
          quantity: ce.qty,
          price: ce.product.price,
          title: ce.product.titleEn,
        })),
        city: state.city,
        paymentMethod: state.paymentMethod,
        discountCode: state.discountApplied ? state.discountCode : null,
        subtotal: d.subtotalRaw,
        shipping: d.shippingRaw,
        discount: d.discountRaw,
        total: d.totalRaw,
        customer: {
          name: buyer.name,
          email: buyer.email,
          phone: buyer.phone,
          street: buyer.street,
          city: buyer.city,
        },
      });

      success();
      actions.placeOrder({
        number: result.orderNumber,
        shopifyOrderId: result.shopifyOrderId ?? null,
        trackingNumber: result.trackingNumber ?? null,
        total: d.fmtPrice(d.totalRaw),
        cityDays: d.cityDays[state.city],
        itemCount: d.cartCount,
        heroImg: hero ? hero.product.img : null,
        heroTitle: hero ? d.title(hero.product) : '',
        heroProductId: hero ? hero.id : null,
      });
    } finally {
      setPlacing(false);
    }
  };

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
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.heroTotal}>
              {d.fmtPrice(d.totalRaw)}
            </Txt>
          </View>
          <View style={chevronFlip(d.isRtl)}>
            <ChevronRight />
          </View>
        </View>

        <Divider style={styles.rule} />

        <View style={styles.arrivesBlock}>
          <Txt isRtl={d.isRtl} style={styles.arrivesTitle}>
            {d.isRtl
              ? `يوصل ${d.cityDays[state.city]}`
              : `Arrives in ${d.cityDays[state.city]}`}
          </Txt>
          <Txt isRtl={d.isRtl} style={styles.arrivesNote}>
            {d.isRtl
              ? 'هنراجع طلبك ونجهّزه للشحن بعد التأكيد.'
              : 'We’ll confirm your order and start preparing it for shipping.'}
          </Txt>
        </View>

        <Divider style={styles.rule} />

        <Field label={d.isRtl ? 'الشحن إلى' : 'Ships to'} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldStrong}>{buyer.name}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{buyer.street}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{buyer.city}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldPhone}>{`⁦${buyer.phone}⁩`}</Txt>
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.isRtl ? 'التوصيل' : 'Delivers'} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{d.cityDays[state.city]}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
            {d.isRtl
              ? `خلال ${d.cityDays[state.city]} من التأكيد`
              : `Within ${d.cityDays[state.city]} of confirmation`}
          </Txt>
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
                      <Txt style={styles.fawry}>fawry</Txt>
                    </View>
                    <View style={styles.markBox}>
                      <Txt style={styles.meeza}>meeza</Txt>
                    </View>
                  </View>
                )}
              </Press>
            ))}
            {state.paymentMethod === 'cod' && (
              <Txt isRtl={d.isRtl} style={styles.codNote}>
                {`${d.t('codNote')}: ${d.fmtPrice(d.totalRaw)}`}
              </Txt>
            )}
          </View>
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.t('total')} isRtl={d.isRtl} style={{ paddingBottom: 110 }}>
          <Txt isRtl={d.isRtl} style={styles.arrivesTitle}>
            {d.fmtPrice(d.totalRaw)}
          </Txt>
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
        >
          {placing ? <ActivityIndicator color="#ffffff" /> : undefined}
        </Cta>
      </LinearGradient>
    </FadeIn>
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
  fawry: { fontSize: 8.5, fontWeight: W.heavy, color: '#e8b100' },
  meeza: { fontSize: 8.5, fontWeight: W.heavy, color: '#0a7a3c' },
  codNote: { fontSize: 12.5, color: C.ink, lineHeight: 19 },

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
