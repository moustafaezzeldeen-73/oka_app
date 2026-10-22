import React from "react";
import { Linking, Modal, View } from "react-native";
import { colors, ink, s, white } from "../theme.js";
import { Card, Press, Txt } from "../components/primitives.js";
import { WhatsAppIcon } from "../components/Icons.js";

/** Bosta and Shopify both hand back +20… numbers; WhatsApp wants bare digits. */
const waNumber = (phone) => String(phone || "").replace(/\D/g, "");

export const openDialer = (phone) => Linking.openURL(`tel:${String(phone || "").replace(/[^\d+]/g, "")}`);

export async function openWhatsApp(phone, message) {
  const url = `whatsapp://send?phone=${waNumber(phone)}&text=${encodeURIComponent(message || "")}`;
  const fallback = `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(message || "")}`;
  try {
    const supported = await Linking.canOpenURL(url);
    await Linking.openURL(supported ? url : fallback);
  } catch {
    await Linking.openURL(fallback);
  }
}

/**
 * WhatsApp template sheet. Picking a template opens WhatsApp with the message
 * pre-filled — the templates are already parameterised with the order's AWB,
 * COD and address by i18n.waTemplates().
 */
export function WaSheet({ visible, L, templates, contact, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <Press onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            backgroundColor: colors.canvas,
            borderTopLeftRadius: s(26),
            borderTopRightRadius: s(26),
            paddingHorizontal: s(18),
            paddingTop: s(18),
            paddingBottom: s(26),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: s(14),
            }}
          >
            <Txt f={[600, 18]}>{L.templates}</Txt>
            <Press
              onPress={onClose}
              style={{
                width: s(34),
                height: s(34),
                borderRadius: s(11),
                backgroundColor: ink(0.06),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt f={[600, 15]}>✕</Txt>
            </Press>
          </View>

          <View style={{ gap: s(9) }}>
            {templates.map((template) => (
              <Press
                key={template.title}
                onPress={() => {
                  onClose();
                  openWhatsApp(contact.phone, template.body);
                }}
              >
                <Card radius={16} pad={14} style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}>
                  <View style={{ width: s(8), height: s(38), borderRadius: s(4), backgroundColor: template.tone }} />
                  <View style={{ flex: 1 }}>
                    <Txt f={[600, 14]}>{template.title}</Txt>
                    <Txt f={[400, 13]} color={ink(0.5)} style={{ marginTop: s(3), lineHeight: s(18) }}>
                      {template.body}
                    </Txt>
                  </View>
                </Card>
              </Press>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The in-call screen. It mirrors the mockup exactly, including the recording
 * indicator — OKA records sales calls, and the operator needs to see that it
 * is on. The green button hands off to the real dialer.
 */
export function CallSheet({ visible, L, contact, sel, onClose }) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: "center", paddingHorizontal: s(24), paddingTop: s(60), paddingBottom: s(34) }}>
        <View
          style={{
            width: s(96),
            height: s(96),
            borderRadius: s(30),
            backgroundColor: white(0.1),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[600, 28]} mono color="#fff">
            {contact.initials}
          </Txt>
        </View>

        <Txt f={[600, 24]} color="#fff" style={{ marginTop: s(18) }}>
          {contact.name}
        </Txt>
        <Txt f={[500, 16]} mono color={white(0.55)} style={{ marginTop: s(6) }}>
          {contact.phone}
        </Txt>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(8),
            marginTop: s(22),
            paddingHorizontal: s(14),
            paddingVertical: s(8),
            borderRadius: s(12),
            backgroundColor: "rgba(176,42,42,0.18)",
          }}
        >
          <View style={{ width: s(9), height: s(9), borderRadius: s(5), backgroundColor: "#FF5A5A" }} />
          <Txt f={[600, 13]} color="#FF9A9A">
            {L.recording}
          </Txt>
          <Txt f={[500, 13]} mono color={white(0.6)}>
            00:42
          </Txt>
        </View>

        <View style={{ width: "100%", marginTop: s(26), backgroundColor: white(0.06), borderRadius: s(18), paddingHorizontal: s(16), paddingVertical: s(14) }}>
          <Txt f={[600, 12]} color={white(0.5)} style={{ marginBottom: s(8) }}>
            {L.awb}
          </Txt>
          <Txt f={[600, 20]} mono color="#fff">
            {sel.awb}
          </Txt>
          <Txt f={[400, 13]} color={white(0.55)} style={{ marginTop: s(8) }}>
            {sel.count} {L.items} · {sel.cod}
          </Txt>
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ flexDirection: "row", gap: s(14), width: "100%" }}>
          <Press
            onPress={onClose}
            style={{
              flex: 1,
              height: s(66),
              borderRadius: s(20),
              backgroundColor: colors.red,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt f={[500, 17]} color="#fff">
              {L.endCall}
            </Txt>
          </Press>
          <Press
            onPress={() => openWhatsApp(contact.phone, "")}
            style={{
              width: s(66),
              height: s(66),
              borderRadius: s(20),
              backgroundColor: white(0.12),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WhatsAppIcon size={24} />
          </Press>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Photo capture. The viewfinder is the mockup's placeholder — dropping in
 * expo-camera replaces this one View without touching the surrounding layout.
 */
export function PhotoSheet({ visible, L, sel, photos, onClose, onCapture }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.photoBg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: s(20),
            paddingVertical: s(18),
          }}
        >
          <Press onPress={onClose}>
            <Txt f={[600, 14]} color={white(0.7)}>
              ✕ {L.close}
            </Txt>
          </Press>
          <Txt f={[600, 14]} color="#fff">
            {sel.awbTail}
          </Txt>
        </View>

        <View
          style={{
            flex: 1,
            marginHorizontal: s(14),
            borderRadius: s(20),
            backgroundColor: "#252C2A",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[500, 11]} mono color={white(0.35)}>
            CAMERA · ORDER CONTENTS
          </Txt>
          <View
            style={{
              position: "absolute",
              top: s(26),
              left: s(26),
              right: s(26),
              bottom: s(26),
              borderWidth: 1,
              borderColor: white(0.16),
              borderRadius: s(12),
            }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(14),
            paddingHorizontal: s(20),
            paddingTop: s(18),
            paddingBottom: s(26),
          }}
        >
          <View style={{ flexDirection: "row", gap: s(6) }}>
            {photos.map((_, index) => (
              <View key={index} style={{ width: s(46), height: s(46), borderRadius: s(11), backgroundColor: "#39423F" }} />
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Press
            onPress={onCapture}
            style={{
              width: s(70),
              height: s(70),
              borderRadius: s(35),
              backgroundColor: "#fff",
              borderWidth: 5,
              borderColor: white(0.28),
            }}
          />
          <View style={{ flex: 1 }} />
          <Press
            onPress={onClose}
            style={{
              paddingHorizontal: s(16),
              height: s(46),
              borderRadius: s(14),
              backgroundColor: colors.greenDeep,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt f={[600, 13]} color="#fff">
              {L.attach}
            </Txt>
          </Press>
        </View>
      </View>
    </Modal>
  );
}
