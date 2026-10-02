import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActions, useDerived, useStore } from '../state/store';
import { useRefresh } from '../hooks/useRefresh';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';
import { Plus } from '../components/Icons';
import {
  cancelSubscription,
  fetchSubscriptions,
  pauseSubscription,
  resumeSubscription,
} from '../api/subscriptions';

const fmtDate = (iso, isRtl) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const STATUS_META = {
  active: { en: 'Active', ar: 'نشط', color: C.greenDeep, bg: 'rgba(31,143,78,0.09)' },
  paused: { en: 'Paused', ar: 'متوقف مؤقتاً', color: 'rgba(110,110,115,0.95)', bg: 'rgba(0,0,0,0.045)' },
  action_needed: { en: 'Needs attention', ar: 'يحتاج انتباه', color: '#8c1d18', bg: 'rgba(179,38,30,0.08)' },
  cancelled: { en: 'Cancelled', ar: 'ملغي', color: 'rgba(110,110,115,0.7)', bg: 'rgba(0,0,0,0.03)' },
};

/**
 * Manages the customer's subscribe-and-save plans: what's coming, when, and
 * pause/resume/cancel — the same level of control the Orders screen already
 * gives over one-off orders, applied to a standing one instead.
 */
export default function SubscriptionsScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };
  const signedIn = Boolean(state.session?.token);

  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      const list = await fetchSubscriptions(state.session.token);
      actions.setSubscriptions(list);
    } catch {
      actions.setSubscriptions([]);
    }
  }, [signedIn, state.session?.token, actions]);

  useEffect(() => {
    load();
  }, [load]);

  const { control } = useRefresh(load);

  const subscriptions = state.subscriptions ?? [];

  const edit = (sub) => {
    actions.patch({ editingSubscription: sub });
    actions.goTo('subscribe');
  };

  const act = async (sub, action, fn) => {
    if (busyId) return;
    setBusyId(sub.id);
    try {
      const updated = await fn(sub.id, state.session.token);
      actions.setSubscriptions(subscriptions.map((s) => (s.id === sub.id ? updated : s)));
    } catch (err) {
      Alert.alert(
        d.isRtl ? 'تعذّر تنفيذ الإجراء' : 'Could not do that',
        String(err.message ?? err),
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = (sub) => {
    Alert.alert(
      d.isRtl ? 'إلغاء الاشتراك' : 'Cancel subscription',
      d.isRtl
        ? 'مش هتتشحن طلبات جديدة بعد كده لحد ما تشترك تاني.'
        : 'No more orders will go out until you subscribe again.',
      [
        { text: d.isRtl ? 'رجوع' : 'Back', style: 'cancel' },
        {
          text: d.isRtl ? 'إلغاء الاشتراك' : 'Cancel subscription',
          style: 'destructive',
          onPress: () => act(sub, 'cancel', cancelSubscription),
        },
      ],
    );
  };

  if (!signedIn) {
    return (
      <FadeIn style={styles.root}>
        <ScreenHeader
          title={d.isRtl ? 'اشتراكاتي' : 'My Subscriptions'}
          onBack={actions.goBack}
          isRtl={d.isRtl}
        />
        <Press onPress={() => actions.goTo('signIn')} activeScale={0.99} style={styles.notice}>
          <Txt isRtl={d.isRtl} style={styles.noticeTxt}>
            {d.isRtl ? 'سجّل دخولك عشان تشوف اشتراكاتك.' : 'Sign in to see your subscriptions.'}
          </Txt>
        </Press>
      </FadeIn>
    );
  }

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={control}>
        <ScreenHeader
          title={d.isRtl ? 'اشتراكاتي' : 'My Subscriptions'}
          onBack={actions.goBack}
          isRtl={d.isRtl}
        />

        <View style={{ paddingHorizontal: 22, marginBottom: 18 }}>
          <Cta
            onPress={() => {
              actions.patch({ editingSubscription: null });
              actions.goTo('subscribe');
            }}
            textStyle={{ fontWeight: W.bold }}
          >
            <View style={[{ alignItems: 'center', justifyContent: 'center', gap: 8 }, rowDir]}>
              <Plus size={14} color="#ffffff" />
              <Txt style={{ color: '#ffffff', fontWeight: W.bold, fontSize: 14.5 }}>
                {d.isRtl ? 'اشتراك جديد' : 'New subscription'}
              </Txt>
            </View>
          </Cta>
        </View>

        {subscriptions.length === 0 ? (
          <Txt center style={styles.empty}>
            {d.isRtl
              ? 'لسه معندكش اشتراكات. ابدأ واحد عشان توصلك طلباتك أوتوماتيك بخصم.'
              : 'No subscriptions yet. Start one to get your regulars delivered automatically, at a discount.'}
          </Txt>
        ) : (
          subscriptions.map((sub) => {
            const meta = STATUS_META[sub.status] ?? STATUS_META.paused;
            const items = sub.items ?? [];
            const busy = busyId === sub.id;
            const canAct = sub.status !== 'cancelled';

            return (
              <View key={sub.id} style={styles.card}>
                <View style={[styles.cardTop, rowDir]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt isRtl={d.isRtl} style={styles.itemsLine} numberOfLines={1}>
                      {items.length > 1
                        ? d.isRtl
                          ? `${items[0].title} و${d.num(items.length - 1)} أخرى`
                          : `${items[0].title} +${items.length - 1} more`
                        : items[0]?.title ?? ''}
                    </Txt>
                    <Txt isRtl={d.isRtl} style={styles.freqLine}>
                      {(d.isRtl ? 'كل ' : 'Every ') +
                        (frequencyLabel(sub.frequencyId, d.isRtl)) +
                        ' — ' +
                        (d.isRtl ? `خصم ${d.num(sub.discountPct)}٪` : `${sub.discountPct}% off`)}
                    </Txt>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Txt style={[styles.badgeTxt, { color: meta.color }]}>
                      {d.isRtl ? meta.ar : meta.en}
                    </Txt>
                  </View>
                </View>

                {sub.status === 'active' || sub.status === 'paused' ? (
                  <Txt isRtl={d.isRtl} style={styles.nextLine}>
                    {sub.status === 'paused'
                      ? d.isRtl
                        ? 'متوقف — مش هيتشحن حاليًا'
                        : "Paused — won't ship right now"
                      : (d.isRtl ? 'الطلب الجاي: ' : 'Next order: ') + fmtDate(sub.nextOrderDate, d.isRtl)}
                  </Txt>
                ) : null}

                {sub.status === 'action_needed' && sub.lastError ? (
                  <Txt isRtl={d.isRtl} style={styles.errorLine}>
                    {sub.lastError}
                  </Txt>
                ) : null}

                {sub.ordersCreated > 0 ? (
                  <Txt isRtl={d.isRtl} style={styles.historyLine}>
                    {d.isRtl
                      ? `${d.num(sub.ordersCreated)} طلب اتشحن — آخر واحد ${sub.lastOrderName ?? ''}`
                      : `${sub.ordersCreated} order${sub.ordersCreated > 1 ? 's' : ''} shipped — last ${sub.lastOrderName ?? ''}`}
                  </Txt>
                ) : null}

                {canAct ? (
                  <View style={[styles.actions, rowDir]}>
                    <Press
                      onPress={() => edit(sub)}
                      style={styles.actionBtn}
                      disabled={busy}
                    >
                      <Txt center style={styles.actionTxt}>
                        {d.isRtl ? 'تعديل' : 'Edit'}
                      </Txt>
                    </Press>
                    {sub.status === 'paused' || sub.status === 'action_needed' ? (
                      <Press
                        onPress={() => act(sub, 'resume', resumeSubscription)}
                        style={styles.actionBtn}
                        disabled={busy}
                      >
                        <Txt center style={styles.actionTxt}>
                          {busy ? '…' : d.isRtl ? 'استئناف' : 'Resume'}
                        </Txt>
                      </Press>
                    ) : (
                      <Press
                        onPress={() => act(sub, 'pause', pauseSubscription)}
                        style={styles.actionBtn}
                        disabled={busy}
                      >
                        <Txt center style={styles.actionTxt}>
                          {busy ? '…' : d.isRtl ? 'إيقاف مؤقت' : 'Pause'}
                        </Txt>
                      </Press>
                    )}
                    <Press
                      onPress={() => confirmCancel(sub)}
                      style={styles.cancelBtn}
                      disabled={busy}
                    >
                      <Txt center style={styles.cancelTxt}>
                        {d.isRtl ? 'إلغاء' : 'Cancel'}
                      </Txt>
                    </Press>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        <View style={{ height: 26 }} />
      </ScrollView>
    </FadeIn>
  );
}

const FREQ_LABELS = {
  weekly: ['week', 'أسبوع'],
  biweekly: ['2 weeks', 'أسبوعين'],
  monthly: ['month', 'شهر'],
};
function frequencyLabel(id, isRtl) {
  const pair = FREQ_LABELS[id];
  return pair ? pair[isRtl ? 1 : 0] : id;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  empty: { paddingHorizontal: 22, paddingVertical: 30, fontSize: 13.5, lineHeight: 20, color: C.inkSoft },

  notice: {
    marginHorizontal: 22,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(179,38,30,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.25)',
  },
  noticeTxt: { fontSize: 12.5, lineHeight: 19, color: '#8c1d18', fontWeight: W.semibold },

  card: {
    marginHorizontal: 22,
    marginBottom: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  cardTop: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemsLine: { fontSize: 14.5, fontWeight: W.bold, lineHeight: 19 },
  freqLine: { fontSize: 12.5, color: C.inkSoft, marginTop: 3 },
  badge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 11, fontWeight: W.bold },

  nextLine: { fontSize: 12.5, fontWeight: W.semibold, marginTop: 10, color: C.ink },
  errorLine: { fontSize: 12, lineHeight: 17, marginTop: 8, color: '#8c1d18' },
  historyLine: { fontSize: 11.5, marginTop: 6, color: 'rgba(110,110,115,0.85)' },

  actions: { gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
    alignItems: 'center',
  },
  actionTxt: { fontSize: 12.5, fontWeight: W.semibold },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(179,38,30,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.25)',
    alignItems: 'center',
  },
  cancelTxt: { fontSize: 12.5, fontWeight: W.semibold, color: '#8c1d18' },
});
