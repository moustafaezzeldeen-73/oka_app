import React from "react";
import { View } from "react-native";
import { colors, ink, s, white } from "../theme.js";
import { Card, Press, Txt } from "../components/primitives.js";
import { ClockIcon, TruckIcon } from "../components/Icons.js";

/** Modes — the two burst-scan entry points plus the shift counters. */
export function Modes({ L, scanCount, orderCount, bottomPad, onPickup, onShipStatus }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: s(18), paddingTop: s(8), paddingBottom: bottomPad }}>
      <Txt f={[600, 22]} style={{ marginBottom: s(6) }}>
        {L.modes}
      </Txt>
      <Txt f={[400, 14]} color={ink(0.45)} style={{ marginBottom: s(18), lineHeight: s(21) }}>
        {L.modesHint}
      </Txt>

      <Press
        onPress={onPickup}
        style={{ backgroundColor: colors.greenDeep, borderRadius: s(22), padding: s(22), marginBottom: s(12) }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(12), marginBottom: s(14) }}>
          <TruckIcon />
          <Txt f={[600, 21]} color="#fff">
            {L.pickup}
          </Txt>
        </View>
        <Txt f={[400, 14]} color={white(0.72)} style={{ lineHeight: s(21) }}>
          {L.pickupHint}
        </Txt>
      </Press>

      <Press
        onPress={onShipStatus}
        style={{ backgroundColor: colors.ink, borderRadius: s(22), padding: s(22), marginBottom: s(12) }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(12), marginBottom: s(14) }}>
          <ClockIcon />
          <Txt f={[600, 21]} color="#fff">
            {L.shipStatus}
          </Txt>
        </View>
        <Txt f={[400, 14]} color={white(0.6)} style={{ lineHeight: s(21) }}>
          {L.shipStatusHint}
        </Txt>
      </Press>

      <Card radius={18} pad={16} style={{ marginTop: s(22) }}>
        <Txt f={[600, 14]} style={{ marginBottom: s(12) }}>
          {L.shift}
        </Txt>
        <View style={{ flexDirection: "row", gap: s(10) }}>
          <View style={{ flex: 1 }}>
            <Txt f={[600, 26]} mono color={colors.greenDeep}>
              {scanCount}
            </Txt>
            <Txt f={[400, 11]} color={ink(0.45)} style={{ marginTop: s(2) }}>
              {L.loaded}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt f={[600, 26]} mono>
              {orderCount}
            </Txt>
            <Txt f={[400, 11]} color={ink(0.45)} style={{ marginTop: s(2) }}>
              {L.open}
            </Txt>
          </View>
        </View>
      </Card>
    </View>
  );
}
