import React from "react";
import { ScrollView, View } from "react-native";
import { colors, ink, s, white } from "../theme.js";
import { Barcode, Press, Txt } from "../components/primitives.js";
import { CheckIcon } from "../components/Icons.js";

/**
 * Truck loading — the burst-scan mode.
 *
 * A big running count on a green field, a scan target, and the list of what
 * has gone on the truck so far with the newest highlighted. The whole
 * background flashes lighter green on each scan, which is the operator's
 * confirmation from across the warehouse.
 */
export function Pickup({ L, scanCount, scanned, beep, flash, onExit, onToggleBeep, onScan, onUndo, onFinish }) {
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: flash ? colors.pickupFlash : colors.pickup }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: s(18),
          paddingTop: s(6),
        }}
      >
        <Press onPress={onExit} style={{ paddingVertical: s(8) }}>
          <Txt f={[600, 14]} color={white(0.75)}>
            ✕ {L.exit}
          </Txt>
        </Press>

        <Press onPress={onToggleBeep} style={{ flexDirection: "row", alignItems: "center", gap: s(8), paddingVertical: s(8) }}>
          <Txt f={[600, 13]} color={white(0.75)}>
            {L.beep}
          </Txt>
          <View
            style={{
              width: s(42),
              height: s(26),
              borderRadius: s(13),
              padding: s(3),
              backgroundColor: beep ? white(0.9) : white(0.25),
              flexDirection: "row",
              justifyContent: beep ? "flex-end" : "flex-start",
            }}
          >
            <View style={{ width: s(20), height: s(20), borderRadius: s(10), backgroundColor: "#fff" }} />
          </View>
        </Press>
      </View>

      <Press onPress={onScan} style={{ paddingHorizontal: s(18), paddingTop: s(26), paddingBottom: s(22), alignItems: "center" }}>
        <Txt f={[600, 13]} color={white(0.7)} style={{ letterSpacing: 1.04 }}>
          {L.pickup}
        </Txt>
        <Txt f={[600, 108]} mono color="#fff" style={{ letterSpacing: -6, marginTop: s(6), marginBottom: s(4) }}>
          {scanCount}
        </Txt>
        <Txt f={[400, 14]} color={white(0.7)}>
          {L.loaded}
        </Txt>

        <View
          style={{
            alignSelf: "stretch",
            marginTop: s(20),
            height: s(70),
            borderRadius: s(20),
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: white(0.35),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s(12),
          }}
        >
          <Barcode height={34} color={white(0.6)} />
          <Txt f={[600, 15]} color="#fff">
            {L.tapScan}
          </Txt>
        </View>
      </Press>

      <ScrollView
        style={{ flex: 1, backgroundColor: "#fff", borderTopLeftRadius: s(26), borderTopRightRadius: s(26) }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: s(18), paddingTop: s(16), paddingBottom: s(100), gap: s(8) }}
      >
        {scanned.map((row, index) => (
          <View
            key={`${row.id}-${index}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(12),
              paddingVertical: s(11),
              paddingHorizontal: s(13),
              borderRadius: s(14),
              // Newest scan sits at the top on a green tint.
              backgroundColor: index === 0 ? colors.greenTint : colors.canvas,
            }}
          >
            <View
              style={{
                width: s(30),
                height: s(30),
                borderRadius: s(10),
                backgroundColor: colors.greenDeep,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckIcon />
            </View>
            <Txt f={[600, 18]} mono style={{ flex: 1 }}>
              {row.awbTail}
            </Txt>
            <Txt f={[400, 13]} color={ink(0.45)}>
              {row.city}
            </Txt>
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: "row",
          gap: s(10),
          paddingHorizontal: s(18),
          paddingTop: s(12),
          paddingBottom: s(22),
          backgroundColor: "#fff",
        }}
      >
        <Press
          onPress={onUndo}
          style={{
            width: s(78),
            height: s(58),
            borderRadius: s(17),
            backgroundColor: colors.chipTrack,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[600, 14]}>{L.undo}</Txt>
        </Press>
        <Press
          onPress={onFinish}
          style={{
            flex: 1,
            height: s(58),
            borderRadius: s(17),
            backgroundColor: colors.ink,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[500, 17]} color="#fff">
            {L.finish}
          </Txt>
        </Press>
      </View>
    </View>
  );
}
