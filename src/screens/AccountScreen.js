import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useActions, useDerived, useStore } from '../store';
import { selectionTick } from '../haptics';
import { C, D, EASE, W } from '../theme';
import { chevronFlip } from '../rtl';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { ChevronRight } from '../components/Icons';

export default function AccountScreen() {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Txt isRtl={d.isRtl} style={styles.title}>
          {d.t('accountTitle')}
        </Txt>

        {state.customer ? (
          <View style={styles.guest}>
            <Txt isRtl={d.isRtl} style={styles.guestTxt}>
              {state.customer.name || state.customer.email || state.customer.phone}
            </Txt>
            {state.session?.staff ? (
              <Txt isRtl={d.isRtl} style={styles.staffTag}>
                {d.isRtl ? 'وضع الموظفين — بيانات عميل حقيقية' : 'Staff mode — real customer data'}
              </Txt>
            ) : null}
          </View>
        ) : (
          <Press onPress={() => actions.goTo('signIn')} activeScale={0.98} style={styles.guest}>
            <Txt isRtl={d.isRtl} style={styles.guestTxt}>
              {d.t('guestPrompt')}
            </Txt>
          </Press>
        )}

        <View style={styles.list}>
          <Row
            label={d.t('myAddresses')}
            onPress={() => actions.goTo('addresses')}
            chevron
            d={d}
            rowDir={rowDir}
          />
          <Row label={d.t('myWishlist')} d={d} rowDir={rowDir} />
          <Row
            label={d.t('loyaltyRow')}
            onPress={() => actions.goTo('loyalty')}
            chevron
            d={d}
            rowDir={rowDir}
          />
          <Row
            label={d.t('notifRow')}
            d={d}
            rowDir={rowDir}
            right={
              <Toggle
                on={state.notifEnabled}
                isRtl={d.isRtl}
                onPress={() => {
                  selectionTick();
                  actions.toggleNotif();
                }}
              />
            }
          />
          <Row
            label={d.t('language')}
            onPress={actions.toggleLang}
            d={d}
            rowDir={rowDir}
            right={<Txt style={styles.langVal}>{d.langLabel}</Txt>}
          />
          <Row label={d.t('faq')} d={d} rowDir={rowDir} />
          <Row label={d.t('legal')} d={d} rowDir={rowDir} />
          <Row
            label={state.customer ? d.t('signOut') : d.isRtl ? 'تسجيل الدخول' : 'Sign in'}
            onPress={state.customer ? actions.signOut : () => actions.goTo('signIn')}
            d={d}
            rowDir={rowDir}
            last
            signOut
          />
        </View>
        <View style={{ height: 26 }} />
      </ScrollView>
    </FadeIn>
  );
}

function Row({ label, onPress, chevron, right, d, rowDir, last, signOut }) {
  const body = (
    <View style={[styles.row, rowDir, last && { borderBottomWidth: 0 }]}>
      <Txt style={[styles.rowLabel, signOut && styles.signOut]}>{label}</Txt>
      {right ?? (chevron ? (
        <View style={chevronFlip(d.isRtl)}>
          <ChevronRight size={15} />
        </View>
      ) : null)}
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} activeBg="rgba(0,0,0,0.035)">
      {body}
    </Press>
  ) : (
    body
  );
}

/** `transition: background .2s` on the track, `left .2s` on the knob. */
function Toggle({ on, isRtl, onPress }) {
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(on ? 1 : 0, { duration: D.toggle, easing: EASE.ease });
  }, [p, on]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: p.value > 0.5 ? '#1a1a1a' : 'rgba(0,0,0,0.15)',
  }));
  // The knob travels 2px → 21px, mirrored when the layout is right-to-left.
  const knob = useAnimatedStyle(() => {
    const start = isRtl ? 21 : 2;
    const end = isRtl ? 2 : 21;
    return { left: start + (end - start) * p.value };
  });

  return (
    <Press onPress={onPress} hitSlop={8}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Press>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { paddingHorizontal: 22, paddingVertical: 18, fontWeight: W.heavy, fontSize: 26 },
  guest: {
    marginHorizontal: 22,
    marginBottom: 20,
    padding: 15,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  guestTxt: { fontSize: 13, fontWeight: W.semibold },
  staffTag: { fontSize: 11.5, fontWeight: W.bold, color: '#b3261e', marginTop: 5 },
  list: {
    marginHorizontal: 22,
    borderRadius: 18,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.hairlineSoft,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { fontSize: 14, fontWeight: W.semibold },
  signOut: { fontWeight: W.bold, color: '#3a3a3c' },
  langVal: { color: C.ink, fontSize: 14, fontWeight: W.semibold },
  track: { width: 46, height: 27, borderRadius: 14, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    top: 2,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
});
