import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActions, useDerived, useStore } from '../store';
import { deleteAddress, fetchCustomerAddresses, setDefaultAddress } from '../api/auth';
import { useRefresh } from '../useRefresh';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { Plus } from '../components/Icons';

/**
 * The signed-in customer's saved addresses. Tapping one chooses where the
 * next order ships; making it the default and deleting it are separate,
 * explicit actions.
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

  /** Chooses where the next order ships — nothing changes on the account. */
  const select = (id) => actions.selectAddress(id);

  const makeDefault = async (id) => {
    try {
      await setDefaultAddress(id, state.session.token);
      load();
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر تحديث العنوان الافتراضي' : 'Could not update the default address',
        String(err.message ?? err),
      );
    }
  };

  const remove = (id) =>
    Alert.alert(d.isRtl ? 'حذف العنوان' : 'Delete address', d.isRtl ? 'متأكد؟' : 'Are you sure?', [
      { text: d.isRtl ? 'رجوع' : 'Back', style: 'cancel' },
      {
        text: d.isRtl ? 'حذف' : 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAddress(id, state.session.token);
            if (state.selectedAddress === id) actions.selectAddress(null);
            load();
          } catch (err) {
            Alert.alert(d.isRtl ? 'تعذّر الحذف' : 'Could not delete', String(err.message ?? err));
          }
        },
      },
    ]);

  const list = (remote ?? []).map((a, i) => ({
    id: a.id,
    label: d.provinceName(a.provinceCode) || (d.isRtl ? `عنوان ${i + 1}` : `Address ${i + 1}`),
    name: a.name || state.customer?.name || '',
    street: a.street,
    city: a.city,
    phone: a.phone || state.customer?.phone,
    isDefault: a.isDefault,
    eta: d.etaFor(a),
  }));

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
            const active =
              (state.selectedAddress ?? list.find((x) => x.isDefault)?.id ?? list[0]?.id) === a.id;
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
                    <Txt isRtl={d.isRtl} style={styles.eta}>
                      {d.isRtl ? `التوصيل خلال ${a.eta}` : `Delivery in ${a.eta}`}
                    </Txt>
                    <View style={[styles.cardActions, rowDir]}>
                      {!a.isDefault ? (
                        <Press onPress={() => makeDefault(a.id)} hitSlop={8}>
                          <Txt style={styles.cardAction}>{d.isRtl ? 'اجعله الافتراضي' : 'Make default'}</Txt>
                        </Press>
                      ) : null}
                      <Press onPress={() => remove(a.id)} hitSlop={8}>
                        <Txt style={[styles.cardAction, { color: '#b3261e' }]}>{d.isRtl ? 'حذف' : 'Delete'}</Txt>
                      </Press>
                    </View>
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
  eta: { fontSize: 12, color: C.inkSoft, marginTop: 4 },
  cardActions: { gap: 18, marginTop: 10 },
  cardAction: { fontSize: 12.5, fontWeight: W.bold, color: C.accent },
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
