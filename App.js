import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { CANVAS_GRAD, CANVAS_LOCS } from './src/theme';
import { StoreProvider, useDerived, useStore } from './src/store';
import { useShopifyCart } from './src/useShopifyCart';
import { insetEnd, insetStart } from './src/rtl';
import { fetchCatalogue } from './src/api/shopify';
import { hasStorefront } from './src/api/config';
import { CATS } from './src/data';

import TabBar from './src/components/TabBar';
import HomeScreen from './src/screens/HomeScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import CollectionScreen from './src/screens/CollectionScreen';
import PdpScreen from './src/screens/PdpScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import ConfirmScreen from './src/screens/ConfirmScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import AddressesScreen from './src/screens/AddressesScreen';
import AddAddressScreen from './src/screens/AddAddressScreen';
import LoyaltyScreen from './src/screens/LoyaltyScreen';
import AccountScreen from './src/screens/AccountScreen';
import ArOverlay from './src/overlays/ArOverlay';
import EditOrderSheet from './src/overlays/EditOrderSheet';

/** Screens that keep the tab bar visible — same list as the prototype. */
const TAB_BAR_SCREENS = [
  'home',
  'categories',
  'cart',
  'orders',
  'account',
  'addresses',
  'addAddress',
  'loyalty',
];

const SCREENS = {
  home: HomeScreen,
  categories: CategoriesScreen,
  collection: CollectionScreen,
  pdp: PdpScreen,
  cart: CartScreen,
  checkout: CheckoutScreen,
  confirm: ConfirmScreen,
  orders: OrdersScreen,
  addresses: AddressesScreen,
  addAddress: AddAddressScreen,
  loyalty: LoyaltyScreen,
  account: AccountScreen,
};

export default function App() {
  /**
   * The live catalogue replaces the bundled one as soon as Shopify answers.
   * Until then — and forever, if no Storefront token is configured — the app
   * runs on the photography and copy that shipped with the design.
   */
  const [catalogue, setCatalogue] = useState(null);

  useEffect(() => {
    if (!hasStorefront()) return undefined;
    let cancelled = false;
    fetchCatalogue(CATS.map((c) => c.id))
      .then((c) => {
        if (!cancelled && c.products.length) setCatalogue(c);
      })
      .catch(() => {
        /* stay on the bundled catalogue */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider catalogue={catalogue}>
          <Shell />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { state } = useStore();
  const d = useDerived();
  const insets = useSafeAreaInsets();

  // Keeps a real Shopify cart in step with the local one, when configured.
  useShopifyCart();

  /**
   * The prototype's 402×874 frame put content 54px below the top of the screen
   * and floated the tab bar 14px above the bottom, both measured inside an
   * iPhone's safe area. Deriving them from the live insets reproduces exactly
   * that on a 16 Pro while staying correct on every other device.
   */
  const topPad = Math.max(insets.top - 5, 44);
  const bottomPad = Math.max(insets.bottom - 20, 14);

  const Screen = SCREENS[state.screen] ?? HomeScreen;
  const showTabBar = TAB_BAR_SCREENS.includes(state.screen);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={CANVAS_GRAD}
        locations={CANVAS_LOCS}
        style={StyleSheet.absoluteFill}
      />

      {/* the two warm blooms bleeding in from the corners */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="bloomA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ff7c30" stopOpacity={0.14} />
            <Stop offset="0.7" stopColor="#ff7c30" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bloomB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ff461e" stopOpacity={0.1} />
            <Stop offset="0.7" stopColor="#ff461e" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={d.isRtl ? '108%' : '-8%'} cy={-80} r={110} fill="url(#bloomA)" />
        <Circle cx={d.isRtl ? '-9%' : '109%'} cy="82%" r={100} fill="url(#bloomB)" />
      </Svg>

      <View style={[styles.content, { paddingTop: topPad }]}>
        {/* Keying on the screen name remounts on navigation, which is what makes
            the okaFadeIn entrance fire — exactly as `sc-if` did on the web. */}
        <Screen key={state.screen} />
      </View>

      {showTabBar && <TabBar bottomInset={bottomPad} />}

      {state.arProductId && <ArOverlay />}
      {state.editOrderOpen && <EditOrderSheet />}

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  content: { flex: 1, paddingBottom: 8 },
});
