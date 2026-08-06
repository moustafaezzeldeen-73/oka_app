import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useActions, useDerived, useStore } from '../store';
import { C, D, EASE, W } from '../theme';
import { FadeIn, Pop } from '../components/anim';
import { DarkFill, Press, Txt } from '../components/ui';
import { SumRow } from '../components/parts';
import { Check } from '../components/Icons';

export default function ConfirmScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const order = state.order || { number: '', total: '', cityDays: '' };

  const steps = [
    d.t('timelineConfirmed'),
    d.t('timelinePacked'),
    d.t('timelineShipped'),
    d.t('timelineOut'),
    d.t('timelineDelivered'),
  ];

  return (
    <FadeIn duration={D.fadeInSlow} style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Pop duration={D.pop} easing={EASE.ease} style={styles.tick}>
            <DarkFill borderRadius={32} style={styles.tickFill}>
              <Check size={28} />
            </DarkFill>
          </Pop>
          <Txt center style={styles.placed}>
            {d.t('orderPlaced')}
          </Txt>
        </View>

        <View style={styles.card}>
          <SumRow
            isRtl={d.isRtl}
            label={d.t('orderNumber')}
            value={order.number}
            style={styles.row}
            labelStyle={styles.rowLabel}
            valueStyle={styles.rowValue}
          />
          <SumRow
            isRtl={d.isRtl}
            label={d.t('deliveryWindow')}
            value={order.cityDays}
            style={styles.row}
            labelStyle={styles.rowLabel}
            valueStyle={styles.rowValue}
          />
          <SumRow
            isRtl={d.isRtl}
            label={d.t('total')}
            value={order.total}
            style={styles.row}
            labelStyle={styles.rowLabel}
            valueStyle={styles.rowValue}
          />
        </View>

        <View style={[styles.timeline, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
          {steps.map((label, i) => (
            <View key={label} style={styles.step}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === 0 ? C.accent : 'rgba(0,0,0,0.15)',
                    ...(i === 0
                      ? { boxShadow: '0 0 10px rgba(255,156,74,0.7)' }
                      : null),
                  },
                ]}
              />
              <Txt center style={[styles.stepTxt, { color: i === 0 ? C.ink : C.muted }]}>
                {label}
              </Txt>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Press onPress={() => actions.goTab('orders')} activeScale={0.98} style={styles.ghost}>
            <Txt center style={styles.ghostTxt}>
              {d.t('trackOrder')}
            </Txt>
          </Press>
          <Press onPress={() => actions.goTab('home')} activeScale={0.98}>
            <DarkFill borderRadius={999} style={styles.solid}>
              <Txt center style={styles.solidTxt}>
                {d.t('continueShopping')}
              </Txt>
            </DarkFill>
          </Press>
        </View>
        <View style={{ height: 26 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingTop: 36, paddingHorizontal: 24, paddingBottom: 10, alignItems: 'center' },
  tick: { marginBottom: 18 },
  tickFill: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 30px rgba(255,110,40,0.4)',
  },
  placed: { fontWeight: W.heavy, fontSize: 24 },

  card: {
    marginVertical: 20,
    marginHorizontal: 22,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 18,
  },
  row: { paddingVertical: 5 },
  rowLabel: { fontSize: 13, color: 'rgba(110,110,115,0.75)' },
  rowValue: { fontSize: 13, fontWeight: W.bold, color: C.ink },

  timeline: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 26 },
  step: { flex: 1, alignItems: 'center' },
  dot: { width: 11, height: 11, borderRadius: 6, marginBottom: 6 },
  stepTxt: { fontSize: 9, fontWeight: W.bold, lineHeight: 11 },

  actions: { paddingHorizontal: 22, gap: 10 },
  ghost: {
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
  },
  ghostTxt: { fontWeight: W.bold, fontSize: 13.5 },
  solid: { paddingVertical: 15, borderRadius: 999 },
  solidTxt: { fontWeight: W.heavy, fontSize: 13.5, color: '#ffffff' },
});
