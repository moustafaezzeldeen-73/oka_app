import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as Clipboard from 'expo-clipboard';

import { useActions, useDerived, useStore } from '../state/store';
import { useRefresh } from '../hooks/useRefresh';
import { success } from '../lib/haptics';
import { C, D, W } from '../theme';
import { arDigits } from '../lib/rtl';
import { FadeIn } from '../components/anim';
import { Press, Progress, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { fetchLoyalty, redeemReward } from '../api/auth';

/**
 * Loyalty points: the customer's live balance (their Shopify store credit,
 * 10 points = 1 EGP), and rewards that turn points into a single-use voucher
 * code. Points are earned after delivery — 1 per 10 EGP of product.
 */
export default function LoyaltyScreen() {
  const { state, reloadCatalogue } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };
  const token = state.session?.token ?? null;
  const rewards = state.config.loyalty?.rewards ?? [];

  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetchLoyalty(token);
      setBalance(r.balance ?? 0);
      setError(null);
    } catch (err) {
      setError(String(err.message ?? err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const { control } = useRefresh(async () => {
    await Promise.all([reloadCatalogue?.(), load()]);
  });

  const fmtPts = (n) => (d.isRtl ? arDigits(n) : Number(n).toLocaleString('en-US'));
  const next = rewards.find((r) => (balance ?? 0) < r.points) ?? null;
  const progressPct = next ? Math.min(100, Math.round(((balance ?? 0) / next.points) * 100)) : 100;
  const worthEgp = Math.floor((balance ?? 0) / (state.config.loyalty?.pointsPerEgp ?? 10));

  const showVoucher = (v) =>
    Alert.alert(
      d.isRtl ? 'كود الخصم بتاعك' : 'Your voucher code',
      `${v.code}\n\n${d.isRtl ? v.reward.ar : v.reward.en}`,
      [
        {
          text: d.isRtl ? 'نسخ' : 'Copy',
          onPress: () => Clipboard.setStringAsync(v.code).catch(() => {}),
        },
        {
          text: d.isRtl ? 'استخدمه في السلة' : 'Use in cart',
          onPress: () => {
            actions.setDiscountCode(v.code);
            actions.goTab('cart');
          },
        },
      ],
    );

  const redeem = (r) =>
    Alert.alert(
      d.isRtl ? 'استبدال النقاط' : 'Redeem points',
      d.isRtl
        ? `هنخصم ${fmtPts(r.points)} نقطة ونديك كود: ${r.ar}. صالح ${fmtPts(90)} يوم ولمرة واحدة.`
        : `${fmtPts(r.points)} points for a one-time code: ${r.en}. Valid for 90 days.`,
      [
        { text: d.isRtl ? 'رجوع' : 'Back', style: 'cancel' },
        {
          text: d.isRtl ? 'استبدال' : 'Redeem',
          onPress: async () => {
            setBusyId(r.id);
            try {
              const res = await redeemReward(r.id, token);
              success();
              setBalance(res.balance);
              actions.patch((s) => ({ vouchers: [res.voucher, ...(s.vouchers ?? [])].slice(0, 10) }));
              showVoucher(res.voucher);
            } catch (err) {
              Alert.alert(d.isRtl ? 'تعذّر الاستبدال' : 'Could not redeem', String(err.message ?? err));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );

  const earnRate = state.config.loyalty?.earnPointsPerEgp || 1;
  const earnRules = d.isRtl
    ? [
        {
          label: earnRate >= 1 ? 'كل ١ ج.م منتجات بتوصلك' : `كل ${arDigits(Math.round(1 / earnRate))} ج.م منتجات بتوصلك`,
          value: earnRate >= 1 ? `${arDigits(Math.round(earnRate))} نقطة` : 'نقطة واحدة',
        },
        { label: 'النقاط بتنزل', value: 'بعد التسليم' },
        { label: '١٠ نقاط', value: 'تساوي ١ ج.م' },
      ]
    : [
        {
          label: earnRate >= 1 ? 'Every EGP 1 of products delivered' : `Every EGP ${Math.round(1 / earnRate)} of products delivered`,
          value: earnRate >= 1 ? `${Math.round(earnRate)} point${earnRate > 1 ? 's' : ''}` : '1 point',
        },
        { label: 'Points arrive', value: 'after delivery' },
        { label: '10 points', value: 'worth EGP 1' },
      ];

  const vouchers = (state.vouchers ?? []).filter((v) => new Date(v.endsAt) > new Date());

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={control}>
        <ScreenHeader title={d.t('loyaltyRow')} onBack={actions.goBack} isRtl={d.isRtl} />

        <View style={styles.card}>
          <LinearGradient
            colors={['#0e0e10', '#2b2b30', '#55555e', '#1a1a1d']}
            locations={[0, 0.38, 0.62, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={styles.sheen}
            pointerEvents="none"
          />
          <Txt isRtl={d.isRtl} style={styles.tier}>
            {d.isRtl ? 'رصيد نقاطك' : 'YOUR POINTS'}
          </Txt>
          <View style={[styles.pointsRow, rowDir]}>
            {balance == null ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Txt style={styles.points}>{fmtPts(balance)}</Txt>
            )}
            <Txt style={styles.pointsUnit}>{d.isRtl ? 'نقطة' : 'points'}</Txt>
          </View>
          <Progress
            pct={progressPct}
            isRtl={d.isRtl}
            duration={D.progressSlow}
            track="rgba(255,255,255,0.22)"
            fill={['#ffffff', '#d8d8dd']}
            style={{ marginTop: 18 }}
          />
          {error ? <Txt isRtl={d.isRtl} style={styles.demoTag}>{error}</Txt> : null}
          <Txt isRtl={d.isRtl} style={styles.nextTier}>
            {next
              ? d.isRtl
                ? `${fmtPts(next.points - (balance ?? 0))} نقطة للمكافأة الجاية · قيمتها ${fmtPts(worthEgp)} ج.م`
                : `${fmtPts(next.points - (balance ?? 0))} points to your next reward · worth EGP ${worthEgp}`
              : d.isRtl
                ? 'تقدر تستبدل أي مكافأة'
                : 'Every reward is unlocked'}
          </Txt>
        </View>

        {vouchers.length ? (
          <>
            <Txt isRtl={d.isRtl} style={styles.sectionTitle}>
              {d.isRtl ? 'أكوادك' : 'Your codes'}
            </Txt>
            <View style={styles.rewards}>
              {vouchers.map((v) => (
                <Press key={v.code} onPress={() => showVoucher(v)} style={[styles.rewardRow, rowDir]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt isRtl={d.isRtl} style={styles.rewardTitle}>{v.code}</Txt>
                    <Txt isRtl={d.isRtl} style={styles.rewardCost}>{d.isRtl ? v.reward.ar : v.reward.en}</Txt>
                  </View>
                </Press>
              ))}
            </View>
          </>
        ) : null}

        <Txt isRtl={d.isRtl} style={styles.sectionTitle}>
          {d.isRtl ? 'المكافآت' : 'Rewards'}
        </Txt>
        <View style={styles.rewards}>
          {rewards.map((r) => {
            const affordable = balance != null && balance >= r.points;
            return (
              <View key={r.id} style={[styles.rewardRow, rowDir]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt isRtl={d.isRtl} style={styles.rewardTitle}>
                    {d.isRtl ? r.ar : r.en}
                  </Txt>
                  <Txt isRtl={d.isRtl} style={styles.rewardCost}>
                    {d.isRtl ? `${fmtPts(r.points)} نقطة` : `${fmtPts(r.points)} points`}
                  </Txt>
                </View>
                <Press
                  onPress={() => affordable && !busyId && redeem(r)}
                  activeScale={affordable ? 0.95 : 1}
                  style={[
                    styles.rewardBtn,
                    {
                      backgroundColor: affordable ? C.ink : 'transparent',
                      borderColor: affordable ? C.ink : 'rgba(0,0,0,0.14)',
                    },
                  ]}
                >
                  {busyId === r.id ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Txt style={[styles.rewardBtnTxt, { color: affordable ? '#ffffff' : 'rgba(110,110,115,0.95)' }]}>
                      {affordable ? (d.isRtl ? 'استبدال' : 'Redeem') : d.isRtl ? 'مقفول' : 'Locked'}
                    </Txt>
                  )}
                </Press>
              </View>
            );
          })}
        </View>

        <Txt isRtl={d.isRtl} style={styles.sectionTitle}>
          {d.isRtl ? 'طرق كسب النقاط' : 'How to earn'}
        </Txt>
        <View style={styles.earnList}>
          {earnRules.map((e) => (
            <View key={e.label} style={[styles.earnRow, rowDir]}>
              <Txt isRtl={d.isRtl} style={styles.earnLabel}>
                {e.label}
              </Txt>
              <Txt style={styles.earnValue} numberOfLines={1}>
                {e.value}
              </Txt>
            </View>
          ))}
        </View>
        <View style={{ height: 28 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    marginHorizontal: 22,
    marginBottom: 20,
    padding: 22,
    borderRadius: 26,
    overflow: 'hidden',
    boxShadow: '0 18px 40px rgba(0,0,0,0.26)',
  },
  sheen: { position: 'absolute', top: '-30%', left: '-10%', width: '70%', height: '190%' },
  tier: { fontSize: 12, fontWeight: W.semibold, letterSpacing: 0.6, color: 'rgba(255,255,255,0.75)' },
  pointsRow: { alignItems: 'flex-end', gap: 8, marginTop: 8 },
  points: { fontSize: 40, fontWeight: W.heavy, lineHeight: 42, color: '#ffffff' },
  pointsUnit: { fontSize: 14, fontWeight: W.semibold, color: 'rgba(255,255,255,0.85)', paddingBottom: 4 },
  nextTier: { fontSize: 12, marginTop: 9, color: 'rgba(255,255,255,0.85)' },
  demoTag: { fontSize: 11.5, marginTop: 10, color: '#ffd7a8', fontWeight: W.bold },

  sectionTitle: { paddingHorizontal: 22, paddingBottom: 10, fontWeight: W.bold, fontSize: 16 },
  rewards: {
    marginHorizontal: 22,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.hairline,
    overflow: 'hidden',
  },
  rewardRow: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.hairlineSoft,
  },
  rewardTitle: { fontSize: 14, fontWeight: W.semibold, lineHeight: 19 },
  rewardCost: { fontSize: 12, color: 'rgba(110,110,115,0.95)', marginTop: 4 },
  rewardBtn: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 999, borderWidth: 1 },
  rewardBtnTxt: { fontSize: 12.5, fontWeight: W.bold },

  earnList: { marginHorizontal: 22, marginBottom: 28, gap: 11 },
  earnRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.035)',
  },
  earnLabel: { flex: 1, fontSize: 13.5 },
  earnValue: { fontSize: 13.5, fontWeight: W.bold },
});
