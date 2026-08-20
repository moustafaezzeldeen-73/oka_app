import React from "react";
import { ScrollView, View } from "react-native";
import { colors, ink, s } from "../theme.js";
import { Card, EmptyNote, Thumb, Txt } from "../components/primitives.js";
import { BackButton } from "../components/chrome.js";
import { PhoneIcon, WhatsAppIcon } from "../components/Icons.js";
import { RecordingButton } from "../components/RecordingButton.js";
import { CourierCard, Timeline } from "./Track.js";

/**
 * Shipment detail, reached from the shipping-status search. Read-only: it
 * shows what is in the box, where the box is, who has it, and what contact
 * has already happened — no editing, because by this point it has shipped.
 */
export function ShipDetail({ L, sel, items, steps, history, backGlyph, onBack, onCallCourier, onWaCourier }) {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(12),
          paddingHorizontal: s(18),
          paddingTop: s(4),
          paddingBottom: s(12),
        }}
      >
        <BackButton glyph={backGlyph} onPress={onBack} />
        <Txt f={[600, 17]}>{sel.name}</Txt>
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
        <Txt f={[600, 15]} style={{ marginHorizontal: s(2), marginTop: s(2), marginBottom: s(9) }}>
          {L.contents}
        </Txt>
        <View style={{ gap: s(8) }}>
          {items.map((item) => (
            <Card key={item.key} radius={14} pad={11} style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}>
              <Thumb uri={item.img} size={40} radius={10} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt f={[600, 13]}>{item.name}</Txt>
              </View>
              <View
                style={{
                  width: s(32),
                  height: s(32),
                  borderRadius: s(9),
                  backgroundColor: colors.chipTrack,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt f={[600, 14]} mono>
                  {item.qty}
                </Txt>
              </View>
            </Card>
          ))}
        </View>

        <Txt f={[600, 13]} color={ink(0.5)} style={{ marginHorizontal: s(2), marginTop: s(20), marginBottom: s(8) }}>
          {L.trackTitle}
        </Txt>
        <Card radius={18} pad={0} style={{ paddingTop: s(20), paddingHorizontal: s(18), paddingBottom: s(4) }}>
          <Timeline steps={steps} dot={16} labelSize={14} timeSize={11} gapBelow={22} />
        </Card>

        <Txt f={[600, 13]} color={ink(0.5)} style={{ marginHorizontal: s(2), marginTop: s(20), marginBottom: s(8) }}>
          {L.courier}
        </Txt>
        {sel.courier ? (
          <CourierCard
            L={L}
            sel={sel}
            onCall={onCallCourier}
            onWhatsApp={onWaCourier}
            avatarSize={40}
            radius={12}
            nameSize={15}
          />
        ) : (
          <EmptyNote radius={16} pad={16} size={13}>
            {L.noCourier}
          </EmptyNote>
        )}

        <Txt f={[600, 13]} color={ink(0.5)} style={{ marginHorizontal: s(2), marginTop: s(20), marginBottom: s(8) }}>
          {L.history}
        </Txt>
        <View style={{ gap: s(7) }}>
          {history.map((entry, index) => (
            <Card
              key={index}
              radius={13}
              pad={0}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(11),
                paddingVertical: s(10),
                paddingHorizontal: s(12),
              }}
            >
              <View
                style={{
                  width: s(30),
                  height: s(30),
                  borderRadius: s(9),
                  backgroundColor: entry.iconBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {entry.isCall ? <PhoneIcon size={15} /> : <WhatsAppIcon size={15} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt f={[500, 13]}>{entry.note}</Txt>
                <Txt f={[400, 11]} mono color={ink(0.4)} style={{ marginTop: s(2) }}>
                  {entry.time}
                </Txt>
              </View>
              {entry.isCall ? (
                <Txt f={[500, 12]} mono color={ink(0.4)}>
                  {entry.dur}
                </Txt>
              ) : null}
              <RecordingButton call={entry} />
            </Card>
          ))}
          {history.length === 0 ? <EmptyNote>{L.noHistory}</EmptyNote> : null}
        </View>
      </ScrollView>
    </View>
  );
}
