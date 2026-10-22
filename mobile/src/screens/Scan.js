import React from "react";
import { View } from "react-native";
import { colors, s, white } from "../theme.js";
import { Barcode, Press, Txt } from "../components/primitives.js";

/**
 * Scan screen — the dark capture view.
 *
 * The mockup fakes the camera with a hatched backdrop and a pulsing laser
 * line, and advances to the next unscanned order on tap. That behaviour is
 * kept as-is: swapping in expo-camera's live barcode scanner is a drop-in
 * replacement for `onScan` and does not change this layout.
 */
export function Scan({ L, flash, onClose, onScan }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: s(18),
          paddingTop: s(6),
        }}
      >
        <Press onPress={onClose} style={{ paddingVertical: s(8) }}>
          <Txt f={[600, 14]} color={white(0.7)}>
            ✕ {L.close}
          </Txt>
        </Press>
        <Txt f={[600, 14]} color="#fff">
          {L.scan}
        </Txt>
      </View>

      <Press onPress={onScan} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: s(250),
            height: s(170),
            borderRadius: s(18),
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: white(0.3),
            alignItems: "center",
            justifyContent: "center",
            // Flashes green for 200ms on a successful scan.
            backgroundColor: flash ? "rgba(47,191,119,0.5)" : "transparent",
          }}
        >
          <Barcode height={60} color={white(0.55)} />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: colors.blue,
              shadowColor: colors.blue,
              shadowOpacity: 1,
              shadowRadius: s(14),
              elevation: 6,
            }}
          />
        </View>
      </Press>

      <View style={{ paddingHorizontal: s(18), paddingBottom: s(26), alignItems: "center" }}>
        <Txt f={[400, 14]} color={white(0.5)} style={{ marginBottom: s(16), textAlign: "center" }}>
          {L.scanHint}
        </Txt>
        <Press
          onPress={onScan}
          style={{
            alignSelf: "stretch",
            height: s(64),
            borderRadius: s(18),
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[500, 17]}>{L.scanNow}</Txt>
        </Press>
      </View>
    </View>
  );
}
