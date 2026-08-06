import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { STR } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { fetchOrderStatus } from '../api/orders';
import { C, W } from '../theme';
import { chevronFlip } from '../rtl';
import { FadeIn } from '../components/anim';
import { Divider, Img, Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { ChevronRight } from '../components/Icons';

export default function OrdersScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const order = state.order;
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  /** Live Bosta/Shopify status, when the order service is reachable. */
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!order) return undefined;
    fetchOrderStatus({
      orderNumber: order.number,
      trackingNumber: order.trackingNumber,
    }).then((r) => {
      if (!cancelled) setLive(r);
    });
    return () => {
      cancelled = true;
    };
  }, [order?.number, order?.trackingNumber]);

  if (!order) {
    return (
      <FadeIn style={styles.root}>
        <Txt isRtl={d.isRtl} style={styles.bigTitle}>
          {d.t('ordersTitle')}
        </Txt>
        <Txt center style={styles.empty}>
          {d.t('noOrders')}
        </Txt>
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

  const fallbackUpdates = d.isRtl
    ? [
        ['تم تأكيد الدفع واستلام الطلب', 'اليوم ١٠:٤٢ ص'],
        ['جاري تجهيز الطلب في المخزن', 'اليوم ١١:١٥ ص'],
        ['تم تعيين مندوب التوصيل', 'اليوم ١٢:٣٠ م'],
        ['الطلب في الطريق إلى مركز الفرز', 'قيد الانتظار'],
        ['الطلب خارج للتوصيل', 'قيد الانتظار'],
      ]
    : [
        ['Payment confirmed, order received', 'Today 10:42 AM'],
        ['Order being prepared at the warehouse', 'Today 11:15 AM'],
        ['Courier assigned to your order', 'Today 12:30 PM'],
        ['On the way to the sorting hub', 'Pending'],
        ['Out for delivery', 'Pending'],
      ];

  const updates =
    live?.updates?.length > 0
      ? live.updates.map((u) => ({ text: u.text, time: u.time, done: u.done }))
      : fallbackUpdates.map(([text, time], i) => ({ text, time, done: i < 3 }));

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={d.isRtl ? 'تفاصيل الطلب' : 'Order Details'}
          onBack={() => actions.goTab('home')}
          isRtl={d.isRtl}
        />

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

        <View style={styles.updates}>
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
        </View>

        <Divider style={styles.ruleTop} />

        <Field label={d.isRtl ? 'الشحن إلى' : 'Ships to'} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldStrong}>{STR[d.lang].name}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{STR[d.lang].street}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{d.t(state.city)}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldPhone}>{`⁦${STR[d.lang].phone}⁩`}</Txt>
        </Field>

        <Divider style={styles.ruleTop} />

        <Field label={d.isRtl ? 'التوصيل' : 'Delivers'} isRtl={d.isRtl}>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>{order.cityDays}</Txt>
          <Txt isRtl={d.isRtl} style={styles.fieldTxt}>
            {d.isRtl ? 'توصيل سريع' : 'Express Delivery'}
          </Txt>
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
            onPress={actions.editOrder}
            activeBg="rgba(0,0,0,0.04)"
            style={styles.editBtn}
          >
            <Txt center style={styles.editTxt}>
              {d.isRtl ? 'تعديل' : 'Edit'}
            </Txt>
          </Press>
          <Press onPress={actions.cancelOrder} style={styles.cancelBtn}>
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
