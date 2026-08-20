import React from "react";
import { ScrollView, View } from "react-native";
import { colors, ink, s } from "../theme.js";
import { Avatar, Card, EmptyNote, Press, Txt } from "../components/primitives.js";
import { BackButton } from "../components/chrome.js";
import { PhoneIcon, WhatsAppIcon } from "../components/Icons.js";

/** The shared timeline block — used at two sizes by Track and ShipDetail. */
export function Timeline({ steps, dot = 18, labelSize = 15, timeSize = 12, gapBelow = 26 }) {
  return (
    <>
      {steps.map((step, index) => (
        <View key={index} style={{ flexDirection: "row", gap: s(14) }}>
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: s(dot),
                height: s(dot),
                borderRadius: s(dot / 2),
                backgroundColor: step.dotBg,
                borderWidth: 2.5,
                borderColor: step.dotBorder,
              }}
            />
            {/* The design draws no connector between dots — the spacing comes
                from each row's padding-bottom. Adding a line here would be a
                deviation, not a fix. */}
          </View>
          <View style={{ flex: 1, paddingBottom: s(gapBelow), minWidth: 0 }}>
            <Txt f={[600, labelSize]} color={step.textColor}>
              {step.label}
            </Txt>
            <Txt f={[500, timeSize]} mono color={ink(0.4)} style={{ marginTop: s(3) }}>
              {step.time}
            </Txt>
          </View>
        </View>
      ))}
    </>
  );
}

/** The courier card with its two contact buttons. */
export function CourierCard({ L, sel, onCall, onWhatsApp, avatarSize = 44, radius = 13, nameSize = 16 }) {
  return (
    <Card radius={16} pad={14}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}>
        <Avatar initials={sel.courierInitials} size={avatarSize} radius={radius} fontSize={avatarSize > 40 ? 14 : 13} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt f={[600, nameSize]}>{sel.courierName}</Txt>
          <Txt f={[500, nameSize - 3]} mono color={ink(0.5)} style={{ marginTop: s(2) }}>
            {sel.courierPhone}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: s(8), marginTop: s(12) }}>
        <Press
          onPress={onCall}
          style={{
            flex: 1,
            backgroundColor: colors.greenDeep,
            borderRadius: s(14),
            paddingVertical: s(13),
            alignItems: "center",
            gap: s(7),
          }}
        >
          <PhoneIcon size={20} />
          <Txt f={[600, 12]} color="#fff">
            {L.callCourier}
          </Txt>
        </Press>
        <Press
          onPress={onWhatsApp}
          style={{
            flex: 1,
            backgroundColor: colors.ink,
            borderRadius: s(14),
            paddingVertical: s(13),
            alignItems: "center",
            gap: s(7),
          }}
        >
          <WhatsAppIcon size={20} />
          <Txt f={[600, 12]} color="#fff">
            {L.waCourier}
          </Txt>
        </Press>
      </View>
    </Card>
  );
}

export function Track({ L, sel, steps, backGlyph, onBack, onCallCourier, onWaCourier }) {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(12),
          paddingHorizontal: s(18),
          paddingTop: s(4),
          paddingBottom: s(14),
        }}
      >
        <BackButton glyph={backGlyph} onPress={onBack} />
        <Txt f={[600, 19]}>{L.trackTitle}</Txt>
        <View style={{ flex: 1 }} />
        <Txt f={[500, 12]} mono color={ink(0.4)}>
          {sel.awbTail}
        </Txt>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: s(18), paddingBottom: s(40) }}
      >
        <Card radius={18} pad={0} style={{ marginTop: s(6), paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(6) }}>
          <Timeline steps={steps} />
        </Card>

        <Txt f={[600, 13]} color={ink(0.5)} style={{ marginTop: s(8), marginBottom: s(8), marginHorizontal: s(2) }}>
          {L.courier}
        </Txt>

        {sel.courier ? (
          <CourierCard L={L} sel={sel} onCall={onCallCourier} onWhatsApp={onWaCourier} />
        ) : (
          <EmptyNote radius={16} pad={16} size={13}>
            {L.noCourier}
          </EmptyNote>
        )}
      </ScrollView>
    </View>
  );
}
