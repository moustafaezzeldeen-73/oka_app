/**
 * Small shared building blocks. Each maps one recurring pattern from the
 * design — the white hairline card, the barcode strip, the status pill —
 * so screens read as layout rather than as repeated style objects.
 */

import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { BARS, colors, hairline, ink, mono, s, sans } from "../theme.js";

/** Text with the design's font shorthand: <Txt f={[600, 14]}>. */
export function Txt({ f = [400, 14], mono: isMono = false, color = colors.ink, style, children, ...rest }) {
  const [weight, size] = f;
  const base = isMono ? mono(weight, size) : sans(weight, size);
  return (
    <Text style={[base, { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

/** The white, hairline-bordered card used for almost every block. */
export function Card({ style, radius = 16, pad = 14, alpha = 0.08, children, ...rest }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: s(radius),
          padding: s(pad),
          ...hairline(alpha),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/** Pressable that dims slightly, standing in for the mockup's :hover. */
export function Press({ onPress, disabled, style, children, ...rest }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [style, pressed && !disabled ? { opacity: 0.75 } : null]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

/** The status chip (Ready / Bad address / Transit …). */
export function Chip({ label, bg, fg, size = 11, padH = 8, padV = 3, radius = 6 }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: s(radius), paddingHorizontal: s(padH), paddingVertical: s(padV) }}>
      <Txt f={[600, size]} color={fg}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * The barcode strip. The design draws 28 bars of varying width at a fixed
 * height, which reads as a barcode without pretending to encode anything —
 * the real AWB digits are printed above it.
 */
export function Barcode({ height, color = colors.ink, gap = 2 }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: s(height), gap: s(gap) }}>
      {BARS.map((width, index) => (
        <View key={index} style={{ width: s(width), height: s(height), backgroundColor: color }} />
      ))}
    </View>
  );
}

/** Square product thumbnail with the design's placeholder colour behind it. */
export function Thumb({ uri, size: box, radius }) {
  return (
    <View
      style={{
        width: s(box),
        height: s(box),
        borderRadius: s(radius),
        overflow: "hidden",
        backgroundColor: colors.surfaceMuted,
      }}
    >
      {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
    </View>
  );
}

/** Dark rounded square holding someone's initials. */
export function Avatar({ initials, size: box = 44, radius = 13, fontSize = 14 }) {
  return (
    <View
      style={{
        width: s(box),
        height: s(box),
        borderRadius: s(radius),
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt f={[600, fontSize]} mono color="#fff">
        {initials}
      </Txt>
    </View>
  );
}

/** Dashed-border empty state, used for "no history" / "no results". */
export function EmptyNote({ children, radius = 13, pad = 14, size = 12 }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: s(radius),
        padding: s(pad),
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: ink(0.18),
        alignItems: "center",
      }}
    >
      <Txt f={[500, size]} color={ink(0.4)}>
        {children}
      </Txt>
    </View>
  );
}

/** Section label above a group of cards. */
export function SectionLabel({ children, style, size = 13, color = ink(0.5) }) {
  return (
    <Txt f={[600, size]} color={color} style={[{ marginHorizontal: s(2) }, style]}>
      {children}
    </Txt>
  );
}
