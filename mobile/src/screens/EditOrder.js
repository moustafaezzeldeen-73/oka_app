import React from "react";
import { ScrollView, TextInput, View } from "react-native";
import { colors, ink, s, sans } from "../theme.js";
import { Card, Press, Thumb, Txt } from "../components/primitives.js";
import { BackButton } from "../components/chrome.js";

/**
 * Edit order — quantity steppers, a catalog to add from, and the delivery
 * address. Everything here is disabled once the shipment is past "created",
 * which is why the detail screen dims the Edit button at the same point.
 */
export function EditOrder({ L, sel, items, catalog, address, backGlyph, locked, onBack, onInc, onDec, onAdd, onAddress }) {
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
        <Txt f={[600, 19]}>{L.editOrder}</Txt>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: s(18), paddingBottom: s(120), gap: s(9) }}
      >
        {items.map((item) => (
          <Card key={item.key} radius={16} pad={12} style={{ flexDirection: "row", alignItems: "center", gap: s(11) }}>
            <Thumb uri={item.img} size={44} radius={11} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt f={[600, 14]}>{item.name}</Txt>
              <Txt f={[500, 12]} mono color={ink(0.42)} style={{ marginTop: s(2) }}>
                {item.price}
              </Txt>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(4),
                backgroundColor: colors.chipTrack,
                borderRadius: s(13),
                padding: s(4),
                opacity: locked ? 0.45 : 1,
              }}
            >
              <Press
                onPress={() => onDec(item.key, item.qty)}
                disabled={locked}
                style={{
                  width: s(36),
                  height: s(36),
                  borderRadius: s(10),
                  backgroundColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt f={[600, 20]} mono>
                  −
                </Txt>
              </Press>
              <Txt f={[600, 17]} mono style={{ width: s(34), textAlign: "center" }}>
                {item.qty}
              </Txt>
              <Press
                onPress={() => onInc(item.key, item.qty)}
                disabled={locked}
                style={{
                  width: s(36),
                  height: s(36),
                  borderRadius: s(10),
                  backgroundColor: colors.ink,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt f={[600, 20]} mono color="#fff">
                  +
                </Txt>
              </Press>
            </View>
          </Card>
        ))}

        <Txt f={[600, 13]} color={ink(0.45)} style={{ marginTop: s(16), marginHorizontal: s(2), marginBottom: s(4) }}>
          {L.addProduct}
        </Txt>

        {catalog.map((product) => (
          <Press
            key={product.name}
            onPress={() => onAdd(product)}
            disabled={locked}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(11),
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: ink(0.18),
              borderRadius: s(16),
              padding: s(12),
              opacity: locked ? 0.45 : 1,
            }}
          >
            <Thumb uri={product.img} size={44} radius={11} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt f={[600, 14]}>{product.name}</Txt>
              <Txt f={[500, 12]} mono color={ink(0.42)} style={{ marginTop: s(2) }}>
                {product.price}
              </Txt>
            </View>
            <View
              style={{
                width: s(36),
                height: s(36),
                borderRadius: s(11),
                backgroundColor: colors.green,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt f={[600, 20]} mono color="#fff">
                +
              </Txt>
            </View>
          </Press>
        ))}

        <View style={{ marginTop: s(18) }}>
          <Txt f={[600, 13]} color={ink(0.45)} style={{ marginBottom: s(7) }}>
            {L.deliverTo}
          </Txt>
          <TextInput
            value={address}
            onChangeText={onAddress}
            multiline
            editable={!locked}
            style={[
              sans(400, 14),
              {
                minHeight: s(64),
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: ink(0.12),
                borderRadius: s(14),
                paddingHorizontal: s(13),
                paddingVertical: s(12),
                color: colors.ink,
                lineHeight: s(21),
                textAlignVertical: "top",
              },
            ]}
          />
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: s(10),
          paddingHorizontal: s(18),
          paddingTop: s(12),
          paddingBottom: s(22),
          backgroundColor: colors.canvas,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt f={[400, 11]} color={ink(0.45)}>
            {L.cod}
          </Txt>
          <Txt f={[600, 24]} mono style={{ letterSpacing: -0.5 }}>
            {sel.cod}
          </Txt>
        </View>
        <Press
          onPress={onBack}
          style={{
            paddingHorizontal: s(30),
            height: s(60),
            borderRadius: s(18),
            backgroundColor: colors.ink,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt f={[500, 17]} color="#fff">
            {L.save}
          </Txt>
        </Press>
      </View>
    </View>
  );
}
