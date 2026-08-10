import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { STR } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { fetchCustomerAddresses, setDefaultAddress } from '../api/auth';
import { useRefresh } from '../useRefresh';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { Plus } from '../components/Icons';

/**
 * Real addresses for a signed-in customer; the prototype's two-address demo
 * ("Nourhan Adel", home/work) as a guest preview otherwise — same shape, so
 * the screen looks identical either way, but it stops lying about whose
 * address is on screen once someone actually signs in.
 *
 * The fetched list lives on the store, not local state — checkout reads the
 * customer's selected address from the same place, so a choice made here is
 * the one an order actually ships to.
 */
export default function AddressesScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  const remote = state.addresses;
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!state.session?.token) return;
    setLoading(true);
    try {
      const r = await fetchCustomerAddresses(state.session.token);
      actions.setAddresses(r.addresses ?? []);
    } catch {
      actions.setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [state.session?.token, actions]);

  useEffect(() => {
    load();
  }, [load]);

  const { control } = useRefresh(load);

  /** Selecting a real address also makes it the account's default on Shopify. */
  const select = async (id) => {
    actions.selectAddress(id);
    if (!state.session?.token || !String(id).startsWith('gid://')) return;
    try {
      await setDefaultAddress(id, state.session.token);
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر تحديث العنوان الافتراضي' : 'Could not update the default address',
        String(err.message ?? err),
      );
    }
  };

  const demo = d.isRtl
    ? [
        { id: 'home', label: 'المنزل', name: 'نورهان عادل', street: '١٤ شارع النصر، مدينة نصر', city: 'القاهرة', isDefault: true },
        { id: 'work', label: 'العمل', name: 'نورهان عادل', street: '٢٧ شارع جامعة الدول، المهندسين', city: 'الجيزة', isDefault: false },
      ]
    : [
        { id: 'home', label: 'Home', name: 'Nourhan Adel', street: '14 Al Nasr St, Nasr City', city: 'Cairo', isDefault: true },
        { id: 'work', label: 'Work', name: 'Nourhan Adel', street: '27 Gameat Al Dowal St, Mohandessin', city: 'Giza', isDefault: false },
      ];

  const list = state.session?.token
    ? (remote ?? []).map((a, i) => ({
        id: a.id,
        label: a.isDefault ? (d.isRtl ? 'الافتراضي' : 'Default') : d.isRtl ? `عنوان ${i + 1}` : `Address ${i + 1}`,
        name: a.name || state.customer?.name || '',
        street: a.street,
        city: a.city,
        phone: a.phone || state.customer?.phone,
        isDefault: a.isDefault,
      }))
    : demo;

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={control}>
        <ScreenHeader title={d.t('myAddresses')} onBack={actions.goBack} isRtl={d.isRtl} />

        {loading && !remote ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={C.ink} />
        ) : list.length === 0 ? (
          <Txt center style={styles.empty}>
            {d.isRtl ? 'لا توجد عناوين محفوظة' : 'No saved addresses yet'}
          </Txt>
        ) : (
          list.map((a) => {
            const active = (state.selectedAddress || list[0]?.id) === a.id;
            return (
              <Press
                key={a.id}
                onPress={() => select(a.id)}
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
                      {a.isDefault && (
                        <View style={styles.badge}>
                          <Txt style={styles.badgeTxt}>{d.isRtl ? 'الافتراضي' : 'Default'}</Txt>
                        </View>
                      )}
                    </View>
                    <Txt isRtl={d.isRtl} style={styles.line}>{a.name}</Txt>
                    <Txt isRtl={d.isRtl} style={styles.line}>{a.street}</Txt>
                    <Txt isRtl={d.isRtl} style={styles.line}>{a.city}</Txt>
                    {a.phone ? (
                      <Txt isRtl={d.isRtl} style={styles.phone}>{`⁦${a.phone}⁩`}</Txt>
                    ) : null}
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
          })
        )}

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
  empty: { paddingVertical: 40, paddingHorizontal: 22, fontSize: 13.5, color: C.inkSoft },
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
