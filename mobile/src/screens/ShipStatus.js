import React from "react";
import { ScrollView, TextInput, View } from "react-native";
import { colors, ink, mono as monoFont, s } from "../theme.js";
import { Card, EmptyNote, Press, Txt } from "../components/primitives.js";
import { BackButton } from "../components/chrome.js";

/**
 * Shipping status — look up a customer by phone and see which stage their
 * shipment is at and who is carrying it. The stage and courier both come from
 * Bosta; the name and phone come from Shopify.
 */
export function ShipStatus({ L, query, results, noResults, backGlyph, onBack, onQuery, onOpen }) {
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
        <Txt f={[600, 19]}>{L.shipStatus}</Txt>
      </View>

      <View style={{ paddingHorizontal: s(18), paddingBottom: s(12) }}>
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder={L.searchPhone}
          placeholderTextColor={ink(0.35)}
          keyboardType="phone-pad"
          style={[
            monoFont(500, 15),
            {
              height: s(50),
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: ink(0.12),
              backgroundColor: colors.surface,
              paddingHorizontal: s(16),
              color: colors.ink,
            },
          ]}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: s(18), paddingBottom: s(40), gap: s(8) }}
      >
        {results.map((row) => (
          <Press key={row.id} onPress={() => onOpen(row.id)}>
            <Card radius={14} pad={0} style={{ paddingVertical: s(13), paddingHorizontal: s(15) }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Txt f={[600, 15]}>{row.name}</Txt>
                <Txt f={[500, 12]} mono color={ink(0.4)}>
                  {row.awbTail}
                </Txt>
              </View>
              <Txt f={[500, 13]} mono color={ink(0.5)} style={{ marginTop: s(3) }}>
                {row.phone}
              </Txt>
              <View style={{ flexDirection: "row", alignItems: "center", gap: s(8), marginTop: s(9) }}>
                <View
                  style={{
                    backgroundColor: colors.greenTint,
                    borderRadius: s(8),
                    paddingHorizontal: s(10),
                    paddingVertical: s(5),
                  }}
                >
                  <Txt f={[600, 12]} color={colors.greenDeep}>
                    {row.stage}
                  </Txt>
                </View>
                {row.courierName ? (
                  <Txt f={[500, 12]} color={ink(0.5)}>
                    {row.courierName}
                  </Txt>
                ) : (
                  <Txt f={[400, 12]} color={ink(0.35)}>
                    {L.notAssigned}
                  </Txt>
                )}
              </View>
            </Card>
          </Press>
        ))}

        {noResults ? (
          <EmptyNote radius={14} pad={16} size={13}>
            {L.noResults}
          </EmptyNote>
        ) : null}
      </ScrollView>
    </View>
  );
}
