import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { D, EASE, FADE_FROM_Y } from '../theme';

/**
 * `@keyframes okaFadeIn { from { opacity:0; translateY:10px } to { … } }`
 *
 * Runs once on mount, exactly like the CSS animation it replaces — screens in
 * the prototype are mounted/unmounted by `sc-if`, so a mount effect reproduces
 * the timing precisely.
 */
export function FadeIn({
  duration = D.fadeIn,
  delay = 0,
  fromY = FADE_FROM_Y,
  style,
  children,
  pointerEvents,
  ...rest
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: EASE.ease }));
  }, [p, duration, delay]);

  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: fromY * (1 - p.value) }],
  }));

  return (
    <Animated.View style={[style, a]} pointerEvents={pointerEvents} {...rest}>
      {children}
    </Animated.View>
  );
}

/**
 * `@keyframes okaPop { 0% scale(.7)/opacity 0 · 60% scale(1.15)/opacity 1 · 100% scale(1) }`
 */
export function Pop({ duration = D.pop, easing = EASE.ease, style, children, ...rest }) {
  const s = useSharedValue(0.7);
  const o = useSharedValue(0);

  useEffect(() => {
    const first = duration * 0.6;
    s.value = withSequence(
      withTiming(1.15, { duration: first, easing }),
      withTiming(1, { duration: duration - first, easing }),
    );
    o.value = withTiming(1, { duration: first, easing });
  }, [s, o, duration, easing]);

  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));

  return (
    <Animated.View style={[style, a]} {...rest}>
      {children}
    </Animated.View>
  );
}

/**
 * `@keyframes okaGlow { 0%,100% { 0 8px 28px rgba(0,0,0,.18) } 50% { 0 8px 40px rgba(0,0,0,.3) } }`
 *
 * CSS blur radius is ~2× RN's `shadowRadius`, so 28px→14 and 40px→20.
 */
export function Glow({ style, children, radius = 24, ...rest }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: D.glow / 2, easing: EASE.easeInOut }),
      -1,
      true,
    );
  }, [t]);

  const a = useAnimatedStyle(() => ({
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18 + t.value * 0.12,
    shadowRadius: 14 + t.value * 6,
  }));

  return (
    <Animated.View style={[{ borderRadius: radius }, style, a]} {...rest}>
      {children}
    </Animated.View>
  );
}

/**
 * Drives a value toward `to` with a CSS-style transition — the native
 * equivalent of `transition: <prop> <duration> <easing>`.
 */
export function useTransition(to, duration, easing = EASE.ease) {
  const v = useSharedValue(to);
  useEffect(() => {
    v.value = withTiming(to, { duration, easing });
  }, [v, to, duration, easing]);
  return v;
}

/** `transition: transform .35s cubic-bezier(.22,1,.36,1)` on a scale. */
export function useScaleTransition(to, duration = D.iconScale, easing = EASE.out) {
  const v = useTransition(to, duration, easing);
  return useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
}
