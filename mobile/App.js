import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";

import { colors, s } from "./src/theme.js";
import { labels, waTemplates } from "./src/i18n.js";
import { shapeHistory, shapeItems, shapeOrder, shapeTrackSteps } from "./src/data/shape.js";
import { CATALOG, IMG } from "./src/data/sample.js";
import { loadOrders, markReady as persistReady, refreshShipment } from "./src/api/repository.js";
import { describeConfig } from "./src/api/config.js";
import { callHistoryFor } from "./src/api/calls.js";

import { BottomNav, Toast } from "./src/components/chrome.js";
import { Txt } from "./src/components/primitives.js";
import { OrdersList } from "./src/screens/OrdersList.js";
import { Scan } from "./src/screens/Scan.js";
import { OrderDetail } from "./src/screens/OrderDetail.js";
import { EditOrder } from "./src/screens/EditOrder.js";
import { Track } from "./src/screens/Track.js";
import { Modes } from "./src/screens/Modes.js";
import { ShipStatus } from "./src/screens/ShipStatus.js";
import { ShipDetail } from "./src/screens/ShipDetail.js";
import { Pickup } from "./src/screens/Pickup.js";
import { CallSheet, PhotoSheet, WaSheet, openDialer } from "./src/screens/sheets.js";

/** Screens that keep the tab bar visible — same set as the mockup. */
const TABBED = ["list", "detail", "edit", "modes"];

function Warehouse() {
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState(describeConfig());

  const [lang, setLang] = useState("en");
  const [screen, setScreen] = useState("list");
  const [sel, setSel] = useState(1);
  const [sheet, setSheet] = useState(null);
  const [filter, setFilter] = useState(0);
  const [beep, setBeep] = useState(true);
  const [scanned, setScanned] = useState([]);
  const [photoCount, setPhotoCount] = useState(2);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [shipQuery, setShipQuery] = useState("");
  const [qty, setQty] = useState({});
  const [extra, setExtra] = useState({});
  const [addrEdit, setAddrEdit] = useState({});
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const [contactTarget, setContactTarget] = useState("customer");
  const [waContext, setWaContext] = useState("normal");

  const toastTimer = useRef(null);
  const ar = lang === "ar";
  const L = labels(lang);

  useEffect(() => {
    let alive = true;
    loadOrders().then((result) => {
      if (!alive) return;
      setOrders(result.orders);
      setSource({ mode: result.mode, detail: result.error || describeConfig().detail });
      // The first order is the default selection, matching the mockup.
      if (result.orders.length) setSel(result.orders[0].id);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const doFlash = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  }, []);

  const rawOrder = useMemo(
    () => orders.find((order) => order.id === sel) || orders[0],
    [orders, sel],
  );

  const shapeOptions = { lang, cancelledOrders, qty, addrEdit };
  const selShaped = rawOrder ? shapeOrder(rawOrder, shapeOptions) : null;
  const locked = Boolean(selShaped && selShaped.trackPhase >= 1);

  const items = rawOrder ? shapeItems(rawOrder, { qty, extra, locked }) : [];
  const history = rawOrder ? shapeHistory(rawOrder, lang) : [];
  const trackSteps = selShaped ? shapeTrackSteps(selShaped, lang) : [];
  const photos = Array.from({ length: photoCount }, (_, i) => ({ time: `14:0${i + 2}` }));

  /**
   * Pull the real call history from Salestrail when an order is opened.
   * The app never records calls itself — Android blocks that for third-party
   * apps; Salestrail's Android app is what captures them. See
   * docs/call-recording.md.
   */
  useEffect(() => {
    if (!rawOrder || !["detail", "shipdetail"].includes(screen)) return;
    let alive = true;
    callHistoryFor(rawOrder.phone, { lang }).then((entries) => {
      if (!alive || !entries.length) return;
      setOrders((current) =>
        current.map((order) => (order.id === rawOrder.id ? { ...order, history: entries } : order)),
      );
    });
    return () => {
      alive = false;
    };
  }, [screen, rawOrder?.id, lang]);

  /** Pull fresh Bosta state whenever an order's detail or tracking is opened. */
  useEffect(() => {
    if (!rawOrder || !["detail", "track", "shipdetail"].includes(screen)) return;
    let alive = true;
    refreshShipment(rawOrder.awb).then((update) => {
      if (!alive || !update) return;
      setOrders((current) =>
        current.map((order) => (order.id === rawOrder.id ? { ...order, track: update } : order)),
      );
    });
    return () => {
      alive = false;
    };
  }, [screen, rawOrder?.id]);

  const visibleOrders = useMemo(() => {
    const keys = ["all", "ready", "badaddr"];
    return orders.filter((order) => filter === 0 || order.status === keys[filter]);
  }, [orders, filter]);

  const orderList = visibleOrders.map((order) => shapeOrder(order, shapeOptions));

  const catalog = CATALOG.map((product) => ({
    name: product.name,
    price: product.unit,
    img: IMG[product.name] || "",
  }));

  const nextUnscanned = useCallback(() => {
    const found = orders.find((order) => !scanned.includes(order.id));
    return (found || orders[0])?.id;
  }, [orders, scanned]);

  const shipResults = useMemo(() => {
    const digits = shipQuery.replace(/\D/g, "");
    return orders
      .filter((order) => !digits || order.phone.includes(digits))
      .map((order) => {
        const shaped = shapeOrder(order, shapeOptions);
        return {
          id: order.id,
          name: shaped.name,
          phone: order.phone,
          awbTail: shaped.awbTail,
          stage: shaped.trackPhaseLabel,
          courierName: shaped.courierName,
        };
      });
  }, [orders, shipQuery, lang, cancelledOrders]);

  const contact =
    contactTarget === "courier" && selShaped?.courier
      ? { name: selShaped.courierName, phone: selShaped.courierPhone, initials: selShaped.courierInitials }
      : { name: selShaped?.name || "", phone: selShaped?.phone || "", initials: selShaped?.initials || "" };

  const backGlyph = ar ? "→" : "←";
  const backGlyphFwd = ar ? "←" : "→";
  const showTabs = TABBED.includes(screen) && !sheet;
  const bottomPad = s(110) + insets.bottom;

  const handleMarkReady = useCallback(async () => {
    showToast(ar ? "الأوردر جاهز للتحميل" : "Order marked ready");
    setScreen("list");
    if (rawOrder) await persistReady(rawOrder);
  }, [ar, rawOrder, showToast]);

  const handleCancel = useCallback(() => {
    if (!rawOrder) return;
    setCancelledOrders((current) => current.concat([rawOrder.id]));
    showToast(L.orderCancelled);
    setScreen("list");
  }, [rawOrder, L, showToast]);

  const openCall = (target) => {
    setContactTarget(target);
    setSheet("call");
    const phone = target === "courier" ? selShaped?.courierPhone : selShaped?.phone;
    if (phone) openDialer(phone);
  };

  if (loading || !selShaped) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.green} />
        <Txt f={[500, 13]} style={{ marginTop: s(12) }}>
          {L.loading}
        </Txt>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: screen === "scan" ? colors.ink : screen === "pickup" ? colors.pickup : colors.canvas,
        paddingTop: insets.top,
        // Mirrors the mockup's dir attribute; Yoga flips the flex axis for us.
        direction: ar ? "rtl" : "ltr",
      }}
    >
      <StatusBar barStyle={screen === "scan" || screen === "pickup" ? "light-content" : "dark-content"} />

      {screen === "list" ? (
        <OrdersList
          L={L}
          lang={lang}
          orders={orderList}
          orderCount={orderList.length}
          filter={filter}
          onFilter={setFilter}
          onOpen={(id) => {
            setSel(id);
            setScreen("detail");
          }}
          onSetLang={setLang}
          bottomPad={bottomPad}
        />
      ) : null}

      {screen === "scan" ? (
        <Scan
          L={L}
          flash={flash}
          onClose={() => setScreen("list")}
          onScan={() => {
            doFlash();
            setTimeout(() => {
              setSel(nextUnscanned());
              setScreen("detail");
            }, 180);
          }}
        />
      ) : null}

      {screen === "detail" ? (
        <OrderDetail
          L={L}
          ar={ar}
          sel={selShaped}
          items={items}
          history={history}
          photos={photos}
          backGlyph={backGlyph}
          backGlyphFwd={backGlyphFwd}
          locked={locked}
          bottomPad={bottomPad + s(20)}
          onBack={() => setScreen("list")}
          onTrack={() => setScreen("track")}
          onCancel={handleCancel}
          onMarkReady={handleMarkReady}
          onCall={() => openCall("customer")}
          onWhatsApp={() => {
            setContactTarget("customer");
            setWaContext("normal");
            setSheet("wa");
          }}
          onPhoto={() => setSheet("photo")}
          onEdit={() => setScreen("edit")}
        />
      ) : null}

      {screen === "edit" ? (
        <EditOrder
          L={L}
          sel={selShaped}
          items={items}
          catalog={catalog}
          address={selShaped.address}
          backGlyph={backGlyph}
          locked={locked}
          onBack={() => setScreen("detail")}
          onInc={(key, current) => setQty((prev) => ({ ...prev, [key]: current + 1 }))}
          onDec={(key, current) => setQty((prev) => ({ ...prev, [key]: Math.max(0, current - 1) }))}
          onAdd={(product) =>
            setExtra((prev) => ({
              ...prev,
              [rawOrder.id]: (prev[rawOrder.id] || []).concat([
                { name: product.name, unit: product.price, qty: 1 },
              ]),
            }))
          }
          onAddress={(value) => setAddrEdit((prev) => ({ ...prev, [rawOrder.id]: value }))}
        />
      ) : null}

      {screen === "track" ? (
        <Track
          L={L}
          sel={selShaped}
          steps={trackSteps}
          backGlyph={backGlyph}
          onBack={() => setScreen("detail")}
          onCallCourier={() => openCall("courier")}
          onWaCourier={() => {
            setContactTarget("courier");
            setWaContext("normal");
            setSheet("wa");
          }}
        />
      ) : null}

      {screen === "modes" ? (
        <Modes
          L={L}
          scanCount={scanned.length}
          orderCount={orders.length}
          bottomPad={bottomPad}
          onPickup={() => setScreen("pickup")}
          onShipStatus={() => setScreen("shipstatus")}
        />
      ) : null}

      {screen === "shipstatus" ? (
        <ShipStatus
          L={L}
          query={shipQuery}
          results={shipResults}
          noResults={Boolean(shipQuery) && shipResults.length === 0}
          backGlyph={backGlyph}
          onBack={() => setScreen("modes")}
          onQuery={setShipQuery}
          onOpen={(id) => {
            setSel(id);
            setScreen("shipdetail");
          }}
        />
      ) : null}

      {screen === "shipdetail" ? (
        <ShipDetail
          L={L}
          sel={selShaped}
          items={items}
          steps={trackSteps}
          history={history}
          backGlyph={backGlyph}
          onBack={() => setScreen("shipstatus")}
          onCallCourier={() => openCall("courier")}
          onWaCourier={() => {
            setContactTarget("courier");
            setWaContext("shipdetail");
            setSheet("wa");
          }}
        />
      ) : null}

      {screen === "pickup" ? (
        <Pickup
          L={L}
          scanCount={scanned.length}
          scanned={scanned
            .slice()
            .reverse()
            .map((id) => shapeOrder(orders.find((order) => order.id === id) || orders[0], shapeOptions))}
          beep={beep}
          flash={flash}
          onExit={() => setScreen("modes")}
          onToggleBeep={() => setBeep((value) => !value)}
          onScan={() => {
            const id = nextUnscanned();
            if (id === undefined) return;
            doFlash();
            setScanned((current) => current.concat([id]));
          }}
          onUndo={() => setScanned((current) => current.slice(0, -1))}
          onFinish={() => setScreen("modes")}
        />
      ) : null}

      {showTabs ? (
        <BottomNav
          screen={screen}
          L={L}
          bottomInset={insets.bottom}
          onList={() => {
            setScreen("list");
            setSheet(null);
          }}
          onScan={() => {
            setScreen("scan");
            setSheet(null);
          }}
          onModes={() => {
            setScreen("modes");
            setSheet(null);
          }}
        />
      ) : null}

      <WaSheet
        visible={sheet === "wa"}
        L={L}
        contact={contact}
        templates={waTemplates({ lang, contactTarget, waContext, sel: selShaped })}
        onClose={() => setSheet(null)}
      />
      <CallSheet visible={sheet === "call"} L={L} contact={contact} sel={selShaped} onClose={() => setSheet(null)} />
      <PhotoSheet
        visible={sheet === "photo"}
        L={L}
        sel={selShaped}
        photos={photos}
        onClose={() => setSheet(null)}
        onCapture={() => setPhotoCount((count) => count + 1)}
      />

      <Toast message={toast} topInset={insets.top} />

      {/* Sample mode is called out so nobody mistakes fixtures for live orders. */}
      {source.mode === "sample" && screen === "list" ? (
        <View
          style={{
            position: "absolute",
            bottom: bottomPad,
            left: s(18),
            right: s(18),
            backgroundColor: colors.amberTint,
            borderRadius: s(10),
            paddingVertical: s(8),
            paddingHorizontal: s(12),
          }}
        >
          <Txt f={[600, 11]} color={colors.amber}>
            {L.offline}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  return (
    <SafeAreaProvider>
      <Warehouse />
    </SafeAreaProvider>
  );
}
