import React from "react";
import { ScrollView, View } from "react-native";
import { colors, ink, s } from "../theme.js";
import { Card, Chip, Press, Thumb, Txt } from "../components/primitives.js";
import { SearchIcon } from "../components/Icons.js";

/**
 * Orders list — the app's home screen.
 * Header (title + count + language switch + OKA badge), search field, filter
 * chips, then the order rows.
 */
export function OrdersList({ L, lang, orders, orderCount, filter, onFilter, onOpen, onSetLang, bottomPad }) {
  const ar = lang === "ar";
  const filterLabels = ar ? ["الكل", "جاهز", "عنوان ناقص"] : ["All", "Ready", "Bad address"];

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ paddingHorizontal: s(18), paddingTop: s(4), paddingBottom: s(14) }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: s(14),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: s(8) }}>
            <Txt f={[600, 22]}>{L.orders}</Txt>
            <Txt f={[500, 13]} mono color={ink(0.4)}>
              {orderCount}
            </Txt>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
            <View style={{ flexDirection: "row", backgroundColor: ink(0.06), borderRadius: s(9), padding: s(2) }}>
              <Press
                onPress={() => onSetLang("ar")}
                style={{
                  paddingHorizontal: s(11),
                  paddingVertical: s(5),
                  borderRadius: s(7),
                  backgroundColor: ar ? colors.ink : "transparent",
                }}
              >
                <Txt f={[600, 12]} color={ar ? "#fff" : ink(0.5)}>
                  ع
                </Txt>
              </Press>
              <Press
                onPress={() => onSetLang("en")}
                style={{
                  paddingHorizontal: s(11),
                  paddingVertical: s(5),
                  borderRadius: s(7),
                  backgroundColor: ar ? "transparent" : colors.ink,
                }}
              >
                <Txt f={[600, 12]} mono color={ar ? ink(0.5) : "#fff"}>
                  EN
                </Txt>
              </Press>
            </View>

            <View
              style={{
                width: s(34),
                height: s(34),
                borderRadius: s(11),
                backgroundColor: colors.ink,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt f={[600, 12]} mono color="#fff">
                OKA
              </Txt>
            </View>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(10),
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: ink(0.09),
            borderRadius: s(14),
            paddingHorizontal: s(14),
            height: s(52),
          }}
        >
          <SearchIcon />
          <Txt f={[400, 15]} color={ink(0.38)} numberOfLines={1} style={{ flex: 1 }}>
            {L.search}
          </Txt>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: s(8) }}
          style={{ marginTop: s(12) }}
        >
          {filterLabels.map((label, index) => (
            <Press
              key={label}
              onPress={() => onFilter(index)}
              style={{
                paddingHorizontal: s(14),
                paddingVertical: s(8),
                borderRadius: s(10),
                backgroundColor: filter === index ? colors.ink : ink(0.06),
              }}
            >
              <Txt f={[600, 13]} color={filter === index ? "#fff" : ink(0.6)}>
                {label}
              </Txt>
            </Press>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: s(18), paddingBottom: bottomPad, gap: s(10) }}
      >
        {orders.map((order) => (
          <Press key={order.id} onPress={() => onOpen(order.id)}>
            <Card radius={16} pad={14} style={{ flexDirection: "row", alignItems: "center", gap: s(13) }}>
              <Thumb uri={order.thumb} size={52} radius={12} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(8), marginBottom: s(4) }}>
                  <Txt f={[600, 19]} mono style={{ letterSpacing: -0.4 }}>
                    {order.awbTail}
                  </Txt>
                  <Chip label={order.chip} bg={order.chipBg} fg={order.chipFg} />
                </View>
                <Txt f={[400, 13]} color={ink(0.55)} numberOfLines={1}>
                  {order.name} · {order.city}
                </Txt>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Txt f={[600, 16]} mono>
                  {order.cod}
                </Txt>
                <Txt f={[500, 11]} color={ink(0.4)} style={{ marginTop: s(3) }}>
                  {order.count} {L.items}
                </Txt>
              </View>
            </Card>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}
