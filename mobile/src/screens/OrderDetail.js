import React from "react";
import { ScrollView, View } from "react-native";
import { colors, ink, s } from "../theme.js";
import { Avatar, Barcode, Card, Chip, EmptyNote, Press, SectionLabel, Thumb, Txt } from "../components/primitives.js";
import { BackButton } from "../components/chrome.js";
import { CameraIcon, CancelIcon, CheckBigIcon, PencilIcon, PhoneIcon, WhatsAppIcon } from "../components/Icons.js";
import { RecordingButton } from "../components/RecordingButton.js";

/** One of the four square action buttons under the stat tiles. */
function ActionTile({ bg, border, label, labelColor, opacity = 1, onPress, children }) {
  return (
    <Press
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: bg,
        borderRadius: s(16),
        paddingVertical: s(13),
        paddingHorizontal: s(6),
        alignItems: "center",
        gap: s(7),
        opacity,
        ...(border ? { borderWidth: 1, borderColor: ink(0.1) } : null),
      }}
    >
      {children}
      <Txt f={[600, 12]} color={labelColor}>
        {label}
      </Txt>
    </Press>
  );
}

/** A stat tile: small caps label over a large mono value. */
function StatTile({ label, value, color }) {
  return (
    <Card radius={14} pad={0} style={{ flex: 1, paddingVertical: s(11), paddingHorizontal: s(13) }}>
      <Txt f={[500, 10.5]} color={ink(0.42)} style={{ letterSpacing: 0.4 }}>
        {label}
      </Txt>
      <Txt f={[600, 20]} mono color={color} style={{ marginTop: s(3) }}>
        {value}
      </Txt>
    </Card>
  );
}

export function OrderDetail({
  L, ar, sel, items, history, photos, backGlyph, backGlyphFwd, locked, bottomPad,
  onBack, onTrack, onCancel, onMarkReady, onCall, onWhatsApp, onPhoto, onEdit,
}) {
  // CSS `text-align:end` resolves to the far edge of the reading direction;
  // React Native only understands left/right, so it is resolved here.
  const alignEnd = ar ? "left" : "right";

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
        <Chip label={sel.chip} bg={sel.chipBg} fg={sel.chipFg} size={12} padH={9} padV={4} radius={7} />
        <View style={{ flex: 1 }} />
        <Txt f={[500, 12]} mono color={ink(0.4)}>
          {sel.shopify}
        </Txt>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: s(18), paddingBottom: bottomPad }}
      >
        {/* AWB card */}
        <Card radius={18} pad={18} style={{ alignItems: "center" }}>
          <Txt f={[500, 11]} color={ink(0.4)} style={{ letterSpacing: 0.66 }}>
            {L.awb} · {sel.carrier}
          </Txt>
          <Txt f={[600, 30]} mono style={{ letterSpacing: -1, marginTop: s(4), marginBottom: s(12) }}>
            {sel.awb}
          </Txt>
          <Barcode height={44} />
        </Card>

        {/* Track row */}
        <Press onPress={onTrack} style={{ marginTop: s(12) }}>
          <Card
            radius={14}
            pad={0}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(10),
              paddingVertical: s(13),
              paddingHorizontal: s(15),
            }}
          >
            <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: colors.green }} />
            <Txt f={[600, 14]} style={{ flex: 1 }}>
              {L.track} · {sel.trackPhaseLabel}
            </Txt>
            <Txt f={[600, 15]} mono color={ink(0.35)}>
              {backGlyphFwd}
            </Txt>
          </Card>
        </Press>

        {/* Cancel */}
        <Press
          onPress={onCancel}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s(8),
            backgroundColor: colors.red,
            borderRadius: s(14),
            paddingVertical: s(13),
            marginTop: s(8),
          }}
        >
          <CancelIcon />
          <Txt f={[600, 14]} color="#fff">
            {L.cancelOrder}
          </Txt>
        </Press>

        {/* Ready for pickup */}
        <Press
          onPress={onMarkReady}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s(8),
            backgroundColor: colors.green,
            borderRadius: s(14),
            paddingVertical: s(13),
            marginTop: s(8),
          }}
        >
          <CheckBigIcon />
          <Txt f={[600, 14]} color="#fff">
            {L.readyPickup}
          </Txt>
        </Press>

        {/* Customer */}
        <Card radius={16} pad={14} style={{ flexDirection: "row", alignItems: "center", gap: s(12), marginTop: s(12) }}>
          <Avatar initials={sel.initials} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt f={[600, 16]}>{sel.name}</Txt>
            <Txt f={[500, 13]} mono color={ink(0.5)} style={{ marginTop: s(2) }}>
              {sel.phone}
            </Txt>
          </View>
          <Txt f={[400, 12]} color={ink(0.45)} style={{ maxWidth: s(110), textAlign: alignEnd }}>
            {sel.address}
          </Txt>
        </Card>

        {/* Stats */}
        <View style={{ flexDirection: "row", gap: s(8), marginTop: s(12) }}>
          <StatTile label={L.rank} value={sel.rankLabel} color={sel.rankColor} />
          <StatTile label={L.clarity} value={sel.clarityLabel} color={sel.clarityColor} />
          <StatTile label={L.shipping} value={sel.ship} color={colors.ink} />
        </View>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: s(8), marginTop: s(8) }}>
          <ActionTile bg={colors.greenDeep} label={L.call} labelColor="#fff" onPress={onCall}>
            <PhoneIcon />
          </ActionTile>
          <ActionTile bg={colors.ink} label={L.wa} labelColor="#fff" onPress={onWhatsApp}>
            <WhatsAppIcon />
          </ActionTile>
          <ActionTile bg={colors.surface} border label={L.photo} labelColor={colors.ink} onPress={onPhoto}>
            <CameraIcon />
          </ActionTile>
          {/* Editing is locked once Bosta has picked the shipment up. */}
          <ActionTile
            bg={colors.surface}
            border
            label={L.edit}
            labelColor={colors.ink}
            opacity={locked ? 0.4 : 1}
            onPress={locked ? undefined : onEdit}
          >
            <PencilIcon />
          </ActionTile>
        </View>

        {/* Contact history */}
        <View style={{ marginTop: s(16) }}>
          <SectionLabel style={{ marginBottom: s(8) }}>{L.history}</SectionLabel>
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
                {/* Renders only for rows that actually have audio. */}
                <RecordingButton call={entry} />
              </Card>
            ))}
            {history.length === 0 ? <EmptyNote>{L.noHistory}</EmptyNote> : null}
          </View>
        </View>

        {/* Contents */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginTop: s(22),
            marginBottom: s(10),
            marginHorizontal: s(2),
          }}
        >
          <Txt f={[600, 15]}>{L.contents}</Txt>
          <Txt f={[500, 13]} mono color={ink(0.4)}>
            {sel.count} {L.items}
          </Txt>
        </View>

        <View style={{ gap: s(8) }}>
          {items.map((item) => (
            <Card
              key={item.key}
              radius={14}
              pad={11}
              style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}
            >
              <Thumb uri={item.img} size={46} radius={11} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt f={[600, 14]}>{item.name}</Txt>
                <Txt f={[500, 12]} mono color={ink(0.42)} style={{ marginTop: s(2) }}>
                  {item.sku}
                </Txt>
              </View>
              <View
                style={{
                  width: s(38),
                  height: s(38),
                  borderRadius: s(11),
                  backgroundColor: colors.chipTrack,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt f={[600, 16]} mono>
                  {item.qty}
                </Txt>
              </View>
              <Txt f={[600, 14]} mono style={{ minWidth: s(54), textAlign: alignEnd }}>
                {item.price}
              </Txt>
            </Card>
          ))}
        </View>

        {/* Delivery address */}
        <View style={{ marginTop: s(16) }}>
          <SectionLabel style={{ marginBottom: s(7) }}>{L.deliverTo}</SectionLabel>
          <Card radius={14} pad={0} style={{ paddingVertical: s(13), paddingHorizontal: s(14) }}>
            <Txt f={[400, 14]} style={{ lineHeight: s(21) }}>
              {sel.address}
            </Txt>
          </Card>
        </View>

        {/* Totals */}
        <Card radius={16} pad={0} style={{ marginTop: s(12), paddingVertical: s(14), paddingHorizontal: s(16) }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: s(6) }}>
            <Txt f={[400, 13]} color={ink(0.5)}>
              {L.subtotal}
            </Txt>
            <Txt f={[400, 13]} mono color={ink(0.5)}>
              {sel.subtotal}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt f={[400, 13]} color={ink(0.5)}>
              {L.shipping}
            </Txt>
            <Txt f={[400, 13]} mono color={ink(0.5)}>
              {sel.ship}
            </Txt>
          </View>
          <View style={{ height: 1, backgroundColor: ink(0.08), marginVertical: s(11) }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Txt f={[600, 14]}>{L.cod}</Txt>
            <Txt f={[600, 24]} mono style={{ letterSpacing: -0.5 }}>
              {sel.cod}
            </Txt>
          </View>
        </Card>

        {/* Attached photos */}
        {photos.length > 0 ? (
          <View style={{ marginTop: s(18) }}>
            <Txt f={[600, 14]} style={{ marginHorizontal: s(2), marginBottom: s(9) }}>
              {L.attached} · {photos.length}
            </Txt>
            <View style={{ flexDirection: "row", gap: s(8) }}>
              {photos.map((photo, index) => (
                <View
                  key={index}
                  style={{
                    width: s(78),
                    height: s(78),
                    borderRadius: s(13),
                    backgroundColor: "#E2E7E6",
                    borderWidth: 1,
                    borderColor: ink(0.07),
                    justifyContent: "flex-end",
                    padding: s(6),
                  }}
                >
                  <Txt f={[500, 8]} mono color={ink(0.4)}>
                    {photo.time}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky primary action */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: s(18),
          paddingTop: s(12),
          paddingBottom: s(22),
          backgroundColor: colors.canvas,
        }}
      >
        <Press
          onPress={onMarkReady}
          style={{
            height: s(60),
            borderRadius: s(18),
            backgroundColor: colors.green,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[500, 17]} color="#fff">
            {L.markReady}
          </Txt>
        </Press>
      </View>
    </View>
  );
}
