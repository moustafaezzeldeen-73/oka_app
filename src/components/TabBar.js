import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useActions, useDerived, useStore } from '../store';
import { selectionTick } from '../haptics';
import { GLASS_BAR_SHADOW, TAB_ACTIVE_SHADOW, W } from '../theme';
import { DarkFill, Press, Txt } from './ui';
import { Pop } from './anim';
import { Box, Cart, Home, Person } from './Icons';

/**
 * The liquid-glass tab bar. The active pill is a light gradient with an inset
 * highlight; icons switch between full black and 55% black.
 */
export default function TabBar({ bottomInset }) {
  const { state } = useStore();
  const actions = useActions();
  const d = useDerived();

  const tabs = [
    { id: 'home', Icon: Home, go: () => actions.goTab('home') },
    { id: 'cart', Icon: Cart, go: () => actions.goTab('cart'), badge: d.cartCount },
    { id: 'orders', Icon: Box, go: () => actions.goTab('orders') },
    { id: 'account', Icon: Person, go: () => actions.goTab('account') },
  ];

  const ordered = d.isRtl ? [...tabs].reverse() : tabs;

  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.3)']}
      locations={[0, 0.52, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={[styles.bar, { marginBottom: bottomInset }]}
    >
      {ordered.map(({ id, Icon, go, badge }) => {
        const active = state.screen === id;
        return (
          <Press
            key={id}
            onPress={() => {
              if (!active) selectionTick();
              go();
            }}
            style={styles.tab}
          >
            <View style={styles.iconWrap}>
              {active && (
                <LinearGradient
                  colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.45)']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.activePill}
                />
              )}
              <Icon size={25} color={active ? '#000000' : 'rgba(0,0,0,0.55)'} />
              {id === 'cart' && badge > 0 && (
                <Pop duration={300} style={styles.badgeWrap}>
                  <DarkFill borderRadius={8} style={styles.badge}>
                    <Txt style={styles.badgeTxt}>{d.num(badge)}</Txt>
                  </DarkFill>
                </Pop>
              )}
            </View>
          </Press>
        );
      })}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    marginHorizontal: 14,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    boxShadow: GLASS_BAR_SHADOW,
    zIndex: 2,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 23,
    boxShadow: TAB_ACTIVE_SHADOW,
  },
  badgeWrap: { position: 'absolute', top: -4, right: -4 },
  badge: {
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: { color: '#ffffff', fontSize: 9, fontWeight: W.heavy },
});
