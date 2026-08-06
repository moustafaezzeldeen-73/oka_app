import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { C, D, DARK_GRAD, EASE, W } from '../theme';
import { textDir } from '../rtl';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Text with the prototype's defaults: SF Pro (which is what `-apple-system`
 * resolves to on iOS, so this *is* the prototype's font), ink colour, and
 * direction-aware alignment.
 */
export function Txt({ style, isRtl, center, children, ...rest }) {
  const dir = useMemo(
    () => (center ? { textAlign: 'center' } : isRtl === undefined ? null : textDir(isRtl)),
    [isRtl, center],
  );
  return (
    <Text style={[styles.txt, dir, style]} {...rest}>
      {children}
    </Text>
  );
}

/**
 * Pressable that reproduces the prototype's `style-active:transform:scale(x)`
 * and `style-hover:background:…` affordances. `activeScale` defaults to 1 so
 * elements the prototype leaves un-animated stay un-animated.
 */
export function Press({
  onPress,
  onLongPress,
  activeScale = 1,
  activeBg,
  style,
  children,
  disabled,
  hitSlop,
  ...rest
}) {
  const s = useSharedValue(1);
  const bg = useSharedValue(0);

  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const bgStyle = useAnimatedStyle(() =>
    activeBg ? { backgroundColor: bg.value ? activeBg : 'transparent' } : {},
  );

  const down = () => {
    if (activeScale !== 1) s.value = withTiming(activeScale, { duration: 90, easing: EASE.ease });
    if (activeBg) bg.value = 1;
  };
  const up = () => {
    if (activeScale !== 1) s.value = withTiming(1, { duration: 170, easing: EASE.out });
    if (activeBg) bg.value = 0;
  };

  return (
    <AnimatedPressable
      onPressIn={down}
      onPressOut={up}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[style, activeBg ? bgStyle : null, a]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Adds double-tap detection on top of `Press` (feed cards add to cart on 2 taps). */
export function DoublePress({ onPress, onDoublePress, ...rest }) {
  const last = React.useRef(0);
  const timer = React.useRef(null);

  const handle = () => {
    const now = Date.now();
    if (now - last.current < 280) {
      last.current = 0;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      onDoublePress?.();
      return;
    }
    last.current = now;
    timer.current = setTimeout(() => {
      timer.current = null;
      onPress?.();
    }, 280);
  };

  React.useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return <Press onPress={handle} {...rest} />;
}

/** `<image-slot fit="cover|contain">` */
export function Img({ source, contentFit = 'contain', style, transition = 220, ...rest }) {
  return (
    <Image
      source={source}
      contentFit={contentFit}
      transition={transition}
      style={style}
      {...rest}
    />
  );
}

/** `background: linear-gradient(135deg,#1d1d1f,#3a3a3c)` */
export function DarkFill({ style, borderRadius, children, pointerEvents }) {
  return (
    <LinearGradient
      colors={DARK_GRAD}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[borderRadius != null ? { borderRadius } : null, style]}
      pointerEvents={pointerEvents}
    >
      {children}
    </LinearGradient>
  );
}

/** `backdrop-filter: blur(Npx) saturate(…)` — CSS px maps ~1:1 onto BlurView intensity. */
export function Glass({ blur = 20, tint = 'light', style, children, pointerEvents }) {
  return (
    <BlurView
      intensity={Math.min(100, blur)}
      tint={tint}
      style={style}
      pointerEvents={pointerEvents}
    >
      {children}
    </BlurView>
  );
}

/** Free-shipping / loyalty progress bar with `transition: width .3s ease`. */
export function Progress({
  pct,
  isRtl,
  height = 5,
  duration = D.progress,
  track = 'rgba(0,0,0,0.08)',
  fill = DARK_GRAD,
  style,
}) {
  const w = useSharedValue(pct);
  React.useEffect(() => {
    w.value = withTiming(pct, { duration, easing: EASE.ease });
  }, [w, pct, duration]);

  const a = useAnimatedStyle(() => ({ width: `${w.value}%` }));

  return (
    <View
      style={[
        { height, borderRadius: 3, backgroundColor: track, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { [isRtl ? 'right' : 'left']: 0, height: '100%' },
          a,
        ]}
      >
        <LinearGradient
          colors={fill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: 3 }}
        />
      </Animated.View>
    </View>
  );
}

/** `<div style="height:1px;background:rgba(0,0,0,0.09)">` */
export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: C.hairline }, style]} />;
}

const styles = StyleSheet.create({
  txt: {
    color: C.ink,
    fontWeight: W.medium,
  },
});
