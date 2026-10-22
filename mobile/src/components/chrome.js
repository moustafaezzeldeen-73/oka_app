/**
 * App chrome: the bottom tab bar and the toast.
 *
 * The mockup also draws its own status bar (a hardcoded "14:22" plus battery
 * glyphs) because it's a picture of a phone. On a real device Android draws
 * that band itself, so reproducing it would render two status bars stacked.
 * The safe-area inset takes that 44px slot instead, which is what the design
 * reserved it for.
 */

import React from "react";
import { View } from "react-native";
import { colors, ink, s } from "../theme.js";
import { Press, Txt } from "./primitives.js";
import { GridTabIcon, ListTabIcon, ScanTabIcon } from "./Icons.js";

export function BottomNav({ screen, L, onList, onScan, onModes, bottomInset = 0 }) {
  const listColor = screen === "list" ? colors.ink : ink(0.3);
  const modesColor = screen === "modes" ? colors.ink : ink(0.3);

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: s(84) + bottomInset,
        paddingBottom: s(14) + bottomInset,
        paddingHorizontal: s(8),
        backgroundColor: "rgba(243,245,244,0.94)",
        borderTopWidth: 1,
        borderTopColor: ink(0.08),
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Press onPress={onList} style={{ flex: 1, alignItems: "center", gap: s(5), paddingTop: s(12) }}>
        <ListTabIcon color={listColor} />
        <Txt f={[600, 11]} color={listColor}>
          {L.orders}
        </Txt>
      </Press>

      <View style={{ width: s(74), alignItems: "center" }}>
        <Press
          onPress={onScan}
          style={{
            width: s(64),
            height: s(64),
            borderRadius: s(22),
            backgroundColor: colors.green,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: s(14),
            // The mockup's green glow under the scan button.
            shadowColor: colors.green,
            shadowOpacity: 0.28,
            shadowRadius: s(20),
            shadowOffset: { width: 0, height: s(8) },
            elevation: 8,
          }}
        >
          <ScanTabIcon />
        </Press>
      </View>

      <Press onPress={onModes} style={{ flex: 1, alignItems: "center", gap: s(5), paddingTop: s(12) }}>
        <GridTabIcon color={modesColor} />
        <Txt f={[600, 11]} color={modesColor}>
          {L.modes}
        </Txt>
      </Press>
    </View>
  );
}

export function Toast({ message, topInset = 0 }) {
  if (!message) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: s(12) + topInset,
        left: s(18),
        right: s(18),
        backgroundColor: colors.ink,
        borderRadius: s(15),
        paddingHorizontal: s(16),
        paddingVertical: s(14),
        flexDirection: "row",
        alignItems: "center",
        gap: s(11),
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: s(30),
        shadowOffset: { width: 0, height: s(10) },
        elevation: 12,
      }}
    >
      <View
        style={{
          width: s(24),
          height: s(24),
          borderRadius: s(8),
          backgroundColor: colors.greenDeep,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt f={[600, 12]} color="#fff">
          ✓
        </Txt>
      </View>
      <Txt f={[600, 14]} color="#fff" style={{ flex: 1 }}>
        {message}
      </Txt>
    </View>
  );
}

/** The rounded back button that opens every sub-screen header. */
export function BackButton({ glyph, onPress }) {
  return (
    <Press
      onPress={onPress}
      style={{
        width: s(38),
        height: s(38),
        borderRadius: s(12),
        backgroundColor: ink(0.06),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt f={[600, 16]} mono>
        {glyph}
      </Txt>
    </Press>
  );
}
