import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { STR } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { Plus } from '../components/Icons';

export default function AddressesScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  const list = d.isRtl
    ? [
        { id: 'home', label: 'المنزل', name: 'نورهان عادل', street: '١٤ شارع النصر، مدينة نصر', city: 'القاهرة' },
        { id: 'work', label: 'العمل', name: 'نورهان عادل', street: '٢٧ شارع جامعة الدول، المهندسين', city: 'الجيزة' },
      ]
    : [
        { id: 'home', label: 'Home', name: 'Nourhan Adel', street: '14 Al Nasr St, Nasr City', city: 'Cairo' },
        { id: 'work', label: 'Work', name: 'Nourhan Adel', street: '27 Gameat Al Dowal St, Mohandessin', city: 'Giza' },
      ];

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title={d.t('myAddresses')} onBack={actions.goBack} isRtl={d.isRtl} />

        {list.map((a) => {
          const active = (state.selectedAddress || 'home') === a.id;
          return (
            <Press
              key={a.id}
              onPress={() => actions.selectAddress(a.id)}
              style={[
                styles.card,
                {
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? C.ink : 'rgba(0,0,0,0.1)',
                  backgroundColor: active ? 'rgba(0,0,0,0.035)' : 'transparent',
                },
              ]}
            >
              <View style={[styles.cardRow, rowDir]}>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <View style={[styles.labelRow, rowDir]}>
                    <Txt style={styles.label}>{a.label}</Txt>
                    {a.id === 'home' && (
                      <View style={styles.badge}>
                        <Txt style={styles.badgeTxt}>{d.isRtl ? 'الافتراضي' : 'Default'}</Txt>
                      </View>
                    )}
                  </View>
                  <Txt isRtl={d.isRtl} style={styles.line}>{a.name}</Txt>
                  <Txt isRtl={d.isRtl} style={styles.line}>{a.street}</Txt>
                  <Txt isRtl={d.isRtl} style={styles.line}>{a.city}</Txt>
                  <Txt isRtl={d.isRtl} style={styles.phone}>{`⁦${STR[d.lang].phone}⁩`}</Txt>
                </View>
                <View style={styles.radio}>
                  <View
                    style={[
                      styles.radioDot,
                      { backgroundColor: active ? C.accent : 'transparent' },
                    ]}
                  />
                </View>
              </View>
            </Press>
          );
        })}

        <View style={styles.addWrap}>
          <Press
            onPress={() => actions.goTo('addAddress')}
            activeScale={0.98}
            style={[styles.addBtn, rowDir]}
          >
            <Plus size={16} />
            <Txt style={styles.addTxt}>{d.isRtl ? 'إضافة عنوان جديد' : 'Add new address'}</Txt>
          </Press>
        </View>
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { marginHorizontal: 22, marginBottom: 12, padding: 16, borderRadius: 20 },
  cardRow: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  labelRow: { alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: W.bold },
  badge: { backgroundColor: C.ink, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  badgeTxt: { fontSize: 10, fontWeight: W.bold, color: '#ffffff' },
  line: { fontSize: 13.5, lineHeight: 21, marginTop: 2 },
  phone: { fontSize: 13.5, lineHeight: 21, letterSpacing: 0.5 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.6,
    borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  addWrap: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 30 },
  addBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
  },
  addTxt: { fontSize: 14, fontWeight: W.bold },
});
