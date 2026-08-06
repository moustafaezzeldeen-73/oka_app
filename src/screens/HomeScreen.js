import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { CATS, OFFERS, SHOP_LOGO } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { snapCollection, snapNotch, success } from '../haptics';
import { C, D, EASE, GLASS_LENS_SHADOW, GLASS_PILL_SHADOW, W } from '../theme';
import { DarkFill, DoublePress, Glass, Img, Press, Txt } from '../components/ui';
import { FadeIn } from '../components/anim';
import { Cube, Tag } from '../components/Icons';

/** Nav strip geometry, straight from the prototype's `grid-auto-columns:86px`. */
const NAV_ITEM = 86;
const NAV_PAD = 22;
const LENS_LEFT = 33;

const OFFER_W = 264;
const OFFER_GAP = 16;
const OFFER_STEP = OFFER_W + OFFER_GAP;

const PROD_W = 200;
const PROD_GAP = 16;
const PROD_STEP = PROD_W + PROD_GAP;

/**
 * Rails get explicit heights. A horizontal ScrollView inside a column would
 * otherwise stretch to fill the page, and the page's `justify-content:center`
 * would have nothing left to centre.
 */
const OFFER_RAIL_H = 363;
const PROD_RAIL_H = 369;

/**
 * Right-to-left rails are painted in reverse, so the first item sits at the
 * far end of the content. Scroll there once, without animation, on mount.
 */
function useRtlStart(isRtl, count, step) {
  const done = useRef(false);
  const ref = useRef(null);
  const onContentSizeChange = useCallback(() => {
    if (!isRtl || done.current || count < 2) return;
    done.current = true;
    ref.current?.scrollTo({ x: (count - 1) * step, animated: false });
  }, [isRtl, count, step]);
  return { ref, onContentSizeChange };
}

/**
 * The TikTok-style collection feed.
 *
 * Vertical: one page per collection, `scroll-snap-type:y mandatory` →
 * `pagingEnabled`, with a haptic tap on every page change.
 * Horizontal: one notch per product, `scroll-snap-type:x mandatory` →
 * `snapToOffsets`, again with a haptic on every notch.
 * The top selector is bound to the vertical position: the glass "lens" slides
 * to the active collection and the strip auto-centres it.
 */
export default function HomeScreen() {
  const { state, products } = useStore();
  const actions = useActions();
  const d = useDerived();
  const { isRtl } = d;
  const { width: winW } = useWindowDimensions();

  const feedRef = useRef(null);
  const navRef = useRef(null);
  const [feedH, setFeedH] = useState(0);
  const [navW, setNavW] = useState(0);

  /** [Offers, ...categories] — the selector's source list. */
  const navSource = useMemo(
    () => [{ id: 'offers', en: 'Offers', ar: 'العروض', isOffers: true }, ...CATS],
    [],
  );
  const navCount = navSource.length;

  /**
   * RTL keeps the same logical order but paints it right-to-left, matching the
   * browser's `dir="rtl"` overflow behaviour. Display position and logical
   * index therefore mirror each other.
   */
  const posOf = useCallback(
    (i) => (isRtl ? navCount - 1 - i : i),
    [isRtl, navCount],
  );
  const navDisplay = useMemo(
    () => (isRtl ? [...navSource].reverse() : navSource),
    [isRtl, navSource],
  );

  const lens = useSharedValue(posOf(state.activeCollectionIndex) * NAV_ITEM);
  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lens.value }],
  }));

  const centerNav = useCallback(
    (idx, animated = true) => {
      if (!navW) return;
      const target = Math.max(0, posOf(idx) * NAV_ITEM + NAV_ITEM / 2 - navW / 2);
      navRef.current?.scrollTo({ x: target, animated });
    },
    [navW, posOf],
  );

  /**
   * Park the strip on the active collection once its width is known, and again
   * whenever direction flips — otherwise a right-to-left strip opens showing
   * its last item.
   */
  React.useEffect(() => {
    lens.value = posOf(state.activeCollectionIndex) * NAV_ITEM;
    centerNav(state.activeCollectionIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navW, isRtl]);

  const setActive = useCallback(
    (idx, { haptic = true } = {}) => {
      if (idx === state.activeCollectionIndex) return;
      lens.value = withTiming(posOf(idx) * NAV_ITEM, {
        duration: D.lens,
        easing: EASE.out,
      });
      centerNav(idx);
      actions.setActiveCollection(idx);
      if (haptic) snapCollection();
    },
    [state.activeCollectionIndex, lens, posOf, centerNav, actions],
  );

  /** `onFeedVerticalScroll`: idx = round(scrollTop / clientHeight). */
  const onFeedScroll = useCallback(
    (e) => {
      if (!feedH) return;
      const idx = Math.round(e.nativeEvent.contentOffset.y / feedH);
      setActive(Math.max(0, Math.min(navCount - 1, idx)));
    },
    [feedH, navCount, setActive],
  );

  /** `scrollToCollection` — tapping the selector drives the feed. */
  const scrollToCollection = useCallback(
    (idx) => {
      feedRef.current?.scrollTo({ y: idx * feedH, animated: true });
      setActive(idx);
    },
    [feedH],
  );

  const sidePadOffers = Math.max(0, winW / 2 - OFFER_W / 2);
  const sidePadProds = Math.max(0, winW / 2 - PROD_W / 2);

  return (
    <FadeIn style={styles.root}>
      {/* ── sticky header ─────────────────────────────────────────── */}
      <Glass blur={24} style={styles.header}>
        <View style={[styles.headerRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <View style={styles.headerSlot} />
          <Img source={SHOP_LOGO} contentFit="contain" style={styles.logo} />
          <Press
            onPress={actions.toggleLang}
            activeScale={0.94}
            style={styles.langBtn}
          >
            <Txt style={styles.langTxt}>{d.langLabel}</Txt>
          </Press>
        </View>

        <ScrollView
          ref={navRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(e) => setNavW(e.nativeEvent.layout.width)}
          contentContainerStyle={styles.navContent}
        >
          <Animated.View style={[styles.lens, lensStyle]} pointerEvents="none" />
          {navDisplay.map((nav) => {
            const logical = navSource.indexOf(nav);
            return (
              <NavItem
                key={nav.id}
                nav={nav}
                img={nav.isOffers ? null : nav.img ?? catFallbackImg(products, nav.id)}
                active={logical === state.activeCollectionIndex}
                onPress={() => scrollToCollection(logical)}
              />
            );
          })}
        </ScrollView>
      </Glass>

      {/* ── vertical snap feed ────────────────────────────────────── */}
      <View style={styles.feedWrap} onLayout={(e) => setFeedH(e.nativeEvent.layout.height)}>
        {feedH > 0 && (
          <ScrollView
            ref={feedRef}
            pagingEnabled
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onMomentumScrollEnd={onFeedScroll}
            onScrollEndDrag={onFeedScroll}
            scrollEventThrottle={16}
          >
            <OffersPage
              height={feedH}
              sidePad={sidePadOffers}
              isRtl={isRtl}
              d={d}
              actions={actions}
            />
            {CATS.map((cat, ci) => (
              <CollectionPage
                key={cat.id}
                cat={cat}
                height={feedH}
                sidePad={sidePadProds}
                active={ci + 1 === state.activeCollectionIndex}
                isRtl={isRtl}
                d={d}
                actions={actions}
                activeProductIndex={state.activeProductIndex[cat.id] || 0}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </FadeIn>
  );
}

/** Categories without their own artwork borrow their first product's photo. */
function catFallbackImg(products, catId) {
  return products.find((p) => p.cat === catId)?.img;
}

/** Selector icon: `transform: scale(1.22 | 0.82)` over `.35s cubic-bezier(.22,1,.36,1)`. */
function NavItem({ nav, img, active, onPress }) {
  const s = useSharedValue(active ? 1.22 : 0.82);
  React.useEffect(() => {
    s.value = withTiming(active ? 1.22 : 0.82, { duration: D.iconScale, easing: EASE.out });
  }, [s, active]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Press onPress={onPress} style={styles.navItem}>
      <Animated.View style={[styles.navIcon, a]}>
        {nav.isOffers ? (
          <LinearGradient
            colors={['#0e0e10', '#3a3a3c', '#1a1a1d']}
            locations={[0, 0.55, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.offersIcon}
          >
            <Tag size={24} color="#ffffff" />
          </LinearGradient>
        ) : (
          <Img source={img} contentFit="cover" style={styles.fill} />
        )}
      </Animated.View>
    </Press>
  );
}

/** Page 0 — the promo carousel. */
function OffersPage({ height, sidePad, isRtl, d, actions }) {
  const items = isRtl ? [...OFFERS].reverse() : OFFERS;
  const offsets = useMemo(() => OFFERS.map((_, i) => i * OFFER_STEP), []);
  const notch = useNotchHaptic();
  const start = useRtlStart(isRtl, OFFERS.length, OFFER_STEP);

  return (
    <View style={[styles.page, { height }]}>
      <Txt center style={styles.pageTitle}>
        {isRtl ? 'العروض' : 'Offers'}
      </Txt>
      <ScrollView
        ref={start.ref}
        onContentSizeChange={start.onContentSizeChange}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToOffsets={offsets}
        decelerationRate="fast"
        onScroll={notch(OFFER_STEP)}
        scrollEventThrottle={16}
        style={{ height: OFFER_RAIL_H, flexGrow: 0 }}
        contentContainerStyle={[styles.hList, { paddingHorizontal: sidePad }]}
      >
        {items.map((o, i) => (
          <View key={o.id} style={[styles.offerSlot, i > 0 && { marginLeft: OFFER_GAP }]}>
            <Press
              onPress={() => actions.goTo('collection', { collectionCategory: o.cat })}
              style={styles.offerCard}
            >
              <Img source={o.img} contentFit="contain" style={styles.fill} />
            </Press>
            <Press
              onPress={() => {
                actions.addToCart(o.addId, 1);
                success();
              }}
              activeScale={0.97}
              style={styles.offerCta}
            >
              <DarkFill borderRadius={999} style={styles.offerCtaFill}>
                <Txt center style={styles.offerCtaTxt}>
                  {d.t('addToCart')}
                </Txt>
              </DarkFill>
            </Press>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Pages 1..n — one horizontal rail per category. */
function CollectionPage({
  cat,
  height,
  sidePad,
  active,
  isRtl,
  d,
  actions,
  activeProductIndex,
}) {
  const { products } = useStore();
  const list = useMemo(() => products.filter((p) => p.cat === cat.id), [products, cat.id]);
  const display = isRtl ? [...list].reverse() : list;
  const offsets = useMemo(() => list.map((_, i) => i * PROD_STEP), [list]);

  const titleScale = useSharedValue(active ? 1 : 0.86);
  const titleOpacity = useSharedValue(active ? 1 : 0.4);
  React.useEffect(() => {
    titleScale.value = withTiming(active ? 1 : 0.86, { duration: D.feedItem, easing: EASE.ease });
    titleOpacity.value = withTiming(active ? 1 : 0.4, { duration: D.feedItem, easing: EASE.ease });
  }, [active, titleScale, titleOpacity]);
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));

  const notch = useNotchHaptic((displayIdx) => {
    const logical = isRtl ? list.length - 1 - displayIdx : displayIdx;
    actions.setActiveProduct(cat.id, logical);
  });
  const start = useRtlStart(isRtl, list.length, PROD_STEP);

  return (
    <View style={[styles.page, { height }]}>
      <Animated.View style={titleStyle}>
        <Txt center style={styles.pageTitle}>
          {isRtl ? cat.ar : cat.en}
        </Txt>
      </Animated.View>

      <ScrollView
        ref={start.ref}
        onContentSizeChange={start.onContentSizeChange}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToOffsets={offsets}
        decelerationRate="fast"
        onScroll={notch(PROD_STEP)}
        scrollEventThrottle={16}
        style={{ height: PROD_RAIL_H, flexGrow: 0 }}
        contentContainerStyle={[styles.hListCentered, { paddingHorizontal: sidePad }]}
      >
        {display.map((p, i) => {
          const logical = isRtl ? list.length - 1 - i : i;
          return (
            <FeedProduct
              key={p.id}
              product={p}
              active={logical === activeProductIndex}
              first={i === 0}
              d={d}
              actions={actions}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

/** `transform: scale(1 | .8); opacity: 1 | .42` over `.35s ease`. */
function FeedProduct({ product, active, first, d, actions }) {
  const s = useSharedValue(active ? 1 : 0.8);
  const o = useSharedValue(active ? 1 : 0.42);
  React.useEffect(() => {
    s.value = withTiming(active ? 1 : 0.8, { duration: D.feedItem, easing: EASE.ease });
    o.value = withTiming(active ? 1 : 0.42, { duration: D.feedItem, easing: EASE.ease });
  }, [active, s, o]);
  const a = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ scale: s.value }],
  }));

  return (
    <Animated.View style={[styles.prodSlot, !first && { marginLeft: PROD_GAP }, a]}>
      <DoublePress
        onPress={() => actions.goTo('pdp', { selectedProductId: product.id, pdpQty: 1 })}
        onDoublePress={() => {
          actions.addToCart(product.id, 1);
          success();
        }}
        style={styles.prodCard}
      >
        <Img source={product.img} contentFit="contain" style={styles.fill} />
      </DoublePress>

      <View style={styles.prodMeta}>
        <Txt center style={styles.prodTitle}>
          {d.title(product)}
        </Txt>
        <Txt center style={styles.prodPrice}>
          {d.fmtPrice(product.price)}
        </Txt>

        <View style={styles.prodActions}>
          <Press
            onPress={() => {
              actions.addToCart(product.id, 1);
              success();
            }}
            activeScale={0.9}
            style={styles.addBtn}
          >
            <DarkFill borderRadius={17} style={styles.addBtnFill}>
              <Txt style={styles.addBtnTxt}>+</Txt>
            </DarkFill>
          </Press>

          <Press
            onPress={() => actions.openAr(product.id)}
            activeScale={0.96}
            style={styles.arPill}
          >
            <Cube size={15} />
            <Txt style={styles.arPillTxt}>
              {d.isRtl ? 'شوفها على طرابيزتك' : 'See it on your table'}
            </Txt>
          </Press>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Fires one light tap per notch crossed and reports the new index. Tracking the
 * rounded index (rather than momentum end) means the tap lands as the snap
 * engages, the way a physical detent feels.
 */
function useNotchHaptic(onIndex) {
  const last = useRef(0);
  return useCallback(
    (step) => (e) => {
      const idx = Math.max(0, Math.round(e.nativeEvent.contentOffset.x / step));
      if (idx !== last.current) {
        last.current = idx;
        snapNotch();
        onIndex?.(idx);
      }
    },
    [onIndex],
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },

  header: {
    flexGrow: 0,
    zIndex: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  headerRow: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSlot: { width: 34, height: 34 },
  logo: { height: 32, width: 32 },
  langBtn: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langTxt: { fontWeight: W.bold, fontSize: 12 },

  navContent: {
    position: 'relative',
    paddingTop: 6,
    paddingBottom: 18,
    paddingHorizontal: NAV_PAD,
    flexDirection: 'row',
  },
  lens: {
    position: 'absolute',
    top: 5,
    left: LENS_LEFT,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    boxShadow: GLASS_LENS_SHADOW,
    zIndex: 2,
  },
  navItem: {
    zIndex: 1,
    width: NAV_ITEM,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  navIcon: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
  offersIcon: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1d',
  },

  feedWrap: { flex: 1, minHeight: 0 },
  page: {
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 18,
  },
  pageTitle: { fontWeight: W.heavy, fontSize: 22, marginBottom: 14 },

  hList: { alignItems: 'flex-start', paddingBottom: 8 },
  hListCentered: { alignItems: 'center', paddingBottom: 8 },

  offerSlot: { width: OFFER_W },
  offerCard: {
    width: OFFER_W,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 14px 34px rgba(0,0,0,0.12)',
  },
  offerCta: { marginTop: 12 },
  offerCtaFill: { paddingVertical: 13, borderRadius: 999 },
  offerCtaTxt: { color: '#ffffff', fontSize: 14, fontWeight: W.bold },

  prodSlot: { width: PROD_W },
  prodCard: {
    width: PROD_W,
    height: 230,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
  },
  prodMeta: { alignItems: 'center', marginTop: 10 },
  prodTitle: { fontSize: 14.5, fontWeight: W.semibold },
  prodPrice: { fontSize: 16, fontWeight: W.heavy, color: C.ink, marginTop: 3 },
  prodActions: { alignItems: 'center', gap: 8, marginTop: 8 },
  addBtn: { width: 34, height: 34 },
  addBtnFill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnTxt: { fontWeight: W.heavy, fontSize: 18, color: '#ffffff', lineHeight: 21 },
  arPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    boxShadow: GLASS_PILL_SHADOW,
  },
  arPillTxt: { fontSize: 11.5, fontWeight: W.bold, color: C.ink, letterSpacing: 0.1 },
});
