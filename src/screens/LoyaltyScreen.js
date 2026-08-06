import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { GOLD_TIER, LOYALTY_REWARDS, REWARD_COSTS } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { useRefresh } from '../useRefresh';
import { success } from '../haptics';
import { C, D, W } from '../theme';
import { arDigits } from '../rtl';
import { FadeIn } from '../components/anim';
import { Press, Progress, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import { fetchLoyalty, redeemReward as redeemOnShopify } from '../api/loyalty';

export default function LoyaltyScreen() {
  const { state, reloadCatalogue } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  /**
   * The real balance, derived by the service from what this customer has
   * actually spent minus what they have redeemed. The 1,240-point demo figure
   * only stands in when nobody is signed in.
   */
  const [remote, setRemote] = useState(null);
  const phone = state.customer?.phone ?? null;

  const load = useCallback(async () => {
    if (!phone) {
      setRemote(null);
      return;
    }
    const r = await fetchLoyalty(phone);
    setRemote(r?.demo ? null : r);
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  const { control } = useRefresh(async () => {
    await Promise.all([reloadCatalogue?.(), load()]);
  });

  const balance = remote ? remote.balance : d.loyaltyBalance;
  const isDemo = !remote;

  const redeem = async (r) => {
    if (!phone) {
      Alert.alert(
        d.isRtl ? 'سجّل دخولك الأول' : 'Sign in first',
        d.isRtl
          ? 'لازم تسجل دخولك عشان نقدر نخصم النقاط من حسابك.'
          : 'Sign in so the points can be deducted from your account.',
      );
      return;
    }
    try {
      const res = await redeemOnShopify(phone, r.id, r.pts);
      if (!res.ok) throw new Error('the service refused the redemption');
      actions.redeemReward(r.id);
      success();
      load();
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر الاستبدال' : 'Could not redeem',
        String(err.message ?? err),
      );
    }
  };

  const earnRules = d.isRtl
    ? [
        { label: 'كل ١ ج.م تشتريه', value: 'نقطة واحدة' },
        { label: 'تقييم منتج بصورة', value: '٥٠ نقطة' },
        { label: 'دعوة صديق يطلب', value: '٢٠٠ نقطة' },
      ]
    : [
        { label: 'Every EGP 1 spent', value: '1 point' },
        { label: 'Review with a photo', value: '50 points' },
        { label: 'Refer a friend who orders', value: '200 points' },
      ];

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={control}>
        <ScreenHeader title={d.t('loyaltyRow')} onBack={actions.goBack} isRtl={d.isRtl} />

        {/* tier card */}
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
            {d.isRtl ? 'مستوى فضي' : 'SILVER TIER'}
          </Txt>
          <View style={[styles.pointsRow, rowDir]}>
            <Txt style={styles.points}>
              {d.isRtl ? arDigits(balance) : balance.toLocaleString('en-US')}
            </Txt>
            <Txt style={styles.pointsUnit}>{d.isRtl ? 'نقطة' : 'points'}</Txt>
          </View>
          <Progress
            pct={d.loyaltyProgressPct}
            isRtl={d.isRtl}
            duration={D.progressSlow}
            track="rgba(255,255,255,0.22)"
            fill={['#ffffff', '#d8d8dd']}
            style={{ marginTop: 18 }}
          />
          {isDemo ? (
            <Txt isRtl={d.isRtl} style={styles.demoTag}>
              {d.isRtl
                ? 'رصيد تجريبي — سجّل دخولك عشان تشوف نقاطك الحقيقية'
                : 'Demo balance — sign in to see your real points'}
            </Txt>
          ) : null}
          <Txt isRtl={d.isRtl} style={styles.nextTier}>
            {balance >= GOLD_TIER
              ? d.isRtl
                ? 'وصلت للمستوى الذهبي'
                : 'Gold tier reached'
              : d.isRtl
                ? arDigits(`${GOLD_TIER - balance} نقطة للوصول للمستوى الذهبي`)
                : `${(GOLD_TIER - balance).toLocaleString('en-US')} points to Gold tier`}
          </Txt>
        </View>

        <Txt isRtl={d.isRtl} style={styles.sectionTitle}>
          {d.isRtl ? 'المكافآت' : 'Rewards'}
        </Txt>
        <View style={styles.rewards}>
          {LOYALTY_REWARDS.map((r) => {
            const redeemed = !!state.redeemedRewards[r.id];
            const affordable = balance >= r.pts;
            const costStr = d.isRtl
              ? `${arDigits(r.pts)} نقطة`
              : `${r.pts.toLocaleString('en-US')} points`;
            return (
              <View key={r.id} style={[styles.rewardRow, rowDir]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt isRtl={d.isRtl} style={styles.rewardTitle}>
                    {d.isRtl ? r.ar : r.en}
                  </Txt>
                  <Txt isRtl={d.isRtl} style={styles.rewardCost}>
                    {redeemed ? (d.isRtl ? 'تم الاستبدال' : 'Redeemed') : costStr}
                  </Txt>
                </View>
                <Press
                  onPress={() => {
                    if (redeemed || !affordable) return;
                    redeem(r);
                  }}
                  activeScale={!redeemed && affordable ? 0.95 : 1}
                  style={[
                    styles.rewardBtn,
                    {
                      backgroundColor: redeemed
                        ? 'rgba(31,143,78,0.12)'
                        : affordable
                          ? C.ink
                          : 'transparent',
                      borderColor: redeemed
                        ? 'rgba(31,143,78,0.35)'
                        : affordable
                          ? C.ink
                          : 'rgba(0,0,0,0.14)',
                    },
                  ]}
                >
                  <Txt
                    style={[
                      styles.rewardBtnTxt,
                      {
                        color: redeemed
                          ? C.greenDeep
                          : affordable
                            ? '#ffffff'
                            : 'rgba(110,110,115,0.95)',
                      },
                    ]}
                  >
                    {redeemed
                      ? d.isRtl
                        ? 'مُستبدل'
                        : 'Redeemed'
                      : affordable
                        ? d.isRtl
                          ? 'استبدال'
                          : 'Redeem'
                        : d.isRtl
                          ? 'مقفول'
                          : 'Locked'}
                  </Txt>
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
