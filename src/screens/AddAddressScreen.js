import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { STR } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { selectionTick } from '../haptics';
import { C, W } from '../theme';
import { insetEnd, textDir } from '../rtl';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';
import { Crosshair, Pin } from '../components/Icons';
import { saveCustomerAddress } from '../api/auth';

export default function AddAddressScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Real GPS. This used to fill in a hardcoded Dokki address regardless of
   * where the phone actually was, which looked convincing and was never true.
   */
  const locate = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          d.isRtl ? 'إذن الموقع مرفوض' : 'Location permission denied',
          d.isRtl
            ? 'فعّل إذن الموقع من إعدادات الجهاز عشان نملأ العنوان تلقائياً.'
            : 'Enable location access in Settings to fill the address automatically.',
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [place] = await Location.reverseGeocodeAsync(pos.coords);
      if (!place) throw new Error('no address found for this location');

      actions.findMyLocation({
        street: [place.street, place.name].filter(Boolean).join(' ') || place.district || '',
        building: '',
        city: [place.city ?? place.subregion, place.region].filter(Boolean).join(', '),
        landmark: place.district ?? '',
        phone: state.customer?.phone ?? state.newAddr?.phone ?? '',
      });
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر تحديد الموقع' : 'Could not find your location',
        String(err.message ?? err),
      );
    } finally {
      setLocating(false);
    }
  };

  /** Saves onto the customer's Shopify record; the form used to go nowhere. */
  const save = async () => {
    if (saving) return;
    const addr = state.newAddr ?? {};
    if (!addr.street || !addr.city) {
      Alert.alert(
        d.isRtl ? 'ناقص بيانات' : 'Missing details',
        d.isRtl ? 'اكتب الشارع والمدينة على الأقل.' : 'Street and city are required.',
      );
      return;
    }
    if (!state.session?.token) {
      Alert.alert(
        d.isRtl ? 'سجّل دخولك الأول' : 'Sign in first',
        d.isRtl
          ? 'لازم تسجل دخولك عشان يتحفظ العنوان على حسابك.'
          : 'Sign in so the address can be saved to your account.',
      );
      return;
    }

    setSaving(true);
    try {
      await saveCustomerAddress(
        { ...addr, name: addr.name || state.customer?.name },
        state.session.token,
      );
      actions.goTo('addresses');
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر حفظ العنوان' : 'Could not save the address',
        String(err.message ?? err),
      );
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'street', label: d.isRtl ? 'الشارع' : 'Street address', ph: d.isRtl ? '١٤ شارع النصر' : '14 Al Nasr St' },
    {
      key: 'building',
      label: d.isRtl ? 'العمارة والدور والشقة' : 'Building, floor, apartment',
      ph: d.isRtl ? 'عمارة ٢، الدور ٥، شقة ١٢' : 'Building 2, Floor 5, Apt 12',
    },
    { key: 'city', label: d.isRtl ? 'المدينة' : 'City', ph: d.isRtl ? 'القاهرة' : 'Cairo' },
    {
      key: 'landmark',
      label: d.isRtl ? 'علامة مميزة (اختياري)' : 'Nearby landmark (optional)',
      ph: d.isRtl ? 'جوار صيدلية العزبي' : 'Next to El Ezaby Pharmacy',
    },
    { key: 'phone', label: d.isRtl ? 'رقم الموبايل' : 'Mobile number', ph: '+20 100 123 4567' },
  ];

  const types = [
    { id: 'home', label: d.isRtl ? 'المنزل' : 'Home' },
    { id: 'work', label: d.isRtl ? 'العمل' : 'Work' },
  ];

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title={d.isRtl ? 'إضافة عنوان جديد' : 'Add new address'}
          onBack={actions.goBack}
          isRtl={d.isRtl}
        />

        {/* stylised map */}
        <View style={styles.map}>
          <LinearGradient
            colors={['#eceae6', '#e2ded7', '#dcd7ce']}
            locations={[0, 0.55, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.roadV} />
          <View style={styles.roadH} />
          <View style={styles.pin}>
            <Pin size={30} />
            <View style={styles.pinShadow} />
          </View>
          <Press
            onPress={() => {
              selectionTick();
              locate();
            }}
            activeScale={0.96}
            style={[styles.locBtn, rowDir, insetEnd(d.isRtl, 12)]}
          >
            {locating ? <ActivityIndicator size="small" color={C.ink} /> : <Crosshair size={15} />}
            <Txt style={styles.locTxt}>
              {locating
                ? d.isRtl ? 'بنحدد موقعك…' : 'Locating…'
                : d.isRtl ? 'تحديد موقعي' : 'Find my location'}
            </Txt>
          </Press>
        </View>

        {state.locationFound && (
          <View style={[styles.found, rowDir]}>
            <View style={styles.foundDot} />
            <Txt isRtl={d.isRtl} style={styles.foundTxt}>
              {d.isRtl
                ? 'تم تحديد موقعك وتعبئة العنوان تلقائياً'
                : 'Location found — address filled in automatically'}
            </Txt>
          </View>
        )}

        <View style={styles.form}>
          {fields.map((f) => (
            <View key={f.key}>
              <Txt isRtl={d.isRtl} style={styles.fieldLabel}>
                {f.label}
              </Txt>
              <TextInput
                value={(state.newAddr && state.newAddr[f.key]) || ''}
                onChangeText={(v) => actions.setNewAddrField(f.key, v)}
                placeholder={f.ph}
                placeholderTextColor="rgba(110,110,115,0.6)"
                keyboardType={f.key === 'phone' ? 'phone-pad' : 'default'}
                style={[styles.input, textDir(d.isRtl)]}
              />
            </View>
          ))}

          <View>
            <Txt isRtl={d.isRtl} style={styles.fieldLabel}>
              {d.isRtl ? 'نوع العنوان' : 'Address type'}
            </Txt>
            <View style={[styles.types, rowDir]}>
              {types.map((t) => {
                const active = (state.newAddrType || 'home') === t.id;
                return (
                  <Press
                    key={t.id}
                    onPress={() => actions.setNewAddrType(t.id)}
                    style={[
                      styles.type,
                      { backgroundColor: active ? C.ink : 'transparent' },
                    ]}
                  >
                    <Txt center style={[styles.typeTxt, { color: active ? '#ffffff' : C.ink }]}>
                      {t.label}
                    </Txt>
                  </Press>
                );
              })}
            </View>
          </View>

          <Cta
            label={saving ? '' : d.isRtl ? 'حفظ العنوان' : 'Save address'}
            onPress={save}
            style={{ marginTop: 6 }}
            textStyle={{ fontWeight: W.bold }}
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : undefined}
          </Cta>
        </View>
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: {
    marginHorizontal: 22,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    height: 170,
  },
  roadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '26%',
    width: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  roadH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '58%',
    height: 13,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -15, marginTop: -38, alignItems: 'center' },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginTop: 2,
  },
  locBtn: {
    position: 'absolute',
    bottom: 12,
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.14)',
  },
  locTxt: { fontSize: 12, fontWeight: W.bold, color: C.ink },

  found: {
    marginHorizontal: 22,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: 'rgba(31,143,78,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(31,143,78,0.3)',
    alignItems: 'center',
    gap: 9,
  },
  foundDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  foundTxt: { flex: 1, fontSize: 12.5, fontWeight: W.semibold, color: C.greenDeep },

  form: { paddingHorizontal: 22, paddingBottom: 26, gap: 14 },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: W.semibold,
    color: 'rgba(110,110,115,0.95)',
    marginBottom: 7,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.5)',
    color: C.ink,
  },
  types: { gap: 9 },
  type: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  typeTxt: { fontSize: 13.5, fontWeight: W.bold },
});
