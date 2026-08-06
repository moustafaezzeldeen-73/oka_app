import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useActions, useDerived, useStore } from '../store';
import { success } from '../haptics';
import { C, W } from '../theme';
import { chevronFlip } from '../rtl';
import { FadeIn } from '../components/anim';
import { DarkFill, Img, Press, Progress, Txt } from '../components/ui';
import { Cta, QtyStepper } from '../components/parts';
import { Cart, ChevronLeft, Heart } from '../components/Icons';

export default function PdpScreen() {
  const { state, products } = useStore();
  const actions = useActions();
  const d = useDerived();
  const p = d.selectedProduct;

  const related = useMemo(
    () => (p ? products.filter((x) => x.cat === p.cat && x.id !== p.id).slice(0, 4) : []),
    [products, p],
  );

  if (!p) return null;

  const stockText =
    p.stock === 0
      ? d.t('outOfStock')
      : p.stock <= 5
        ? d.t('onlyLeft', { n: p.stock })
        : d.t('inStock');

  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* hero */}
        <View style={styles.hero}>
          <Img source={p.img} contentFit="cover" style={styles.fill} />
          <LinearGradient
            colors={['rgba(255,255,255,0)', '#ffffff']}
            locations={[0.55, 0.98]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.heroBtns, rowDir]}>
            <Press onPress={actions.goBack} style={[styles.circleBtn, chevronFlip(d.isRtl)]}>
              <ChevronLeft />
            </Press>
            <Press onPress={() => actions.toggleWishlist(p.id)} style={styles.circleBtn}>
              <Heart fill={state.wishlist[p.id] ? C.accent : 'none'} />
            </Press>
          </View>
        </View>

        {/* detail card */}
        <View style={styles.card}>
          <View style={[styles.titleRow, rowDir]}>
            <Txt isRtl={d.isRtl} style={styles.title}>
              {d.title(p)}
            </Txt>
            <Txt style={styles.price}>{d.fmtPrice(p.price)}</Txt>
          </View>
          <Txt isRtl={d.isRtl} style={styles.stock}>
            {stockText}
          </Txt>

          <View style={styles.shipBox}>
            <Progress pct={d.pdpProgressPct} isRtl={d.isRtl} style={{ marginBottom: 8 }} />
            <Txt isRtl={d.isRtl} style={styles.shipTxt}>
              {d.pdpRemaining > 0
                ? d.t('freeShipProgress', { n: d.pdpRemaining })
                : d.t('freeShipReached')}
            </Txt>
          </View>

          <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
            {d.t('customize')}
          </Txt>
          <View style={[styles.qtyRow, rowDir]}>
            <Txt style={styles.qtyLabel}>{d.t('qty')}</Txt>
            <QtyStepper
              isRtl={d.isRtl}
              qty={d.num(state.pdpQty)}
              onDec={() => actions.setPdpQty(Math.max(1, state.pdpQty - 1))}
              onInc={() => actions.setPdpQty(Math.min(p.stock || 99, state.pdpQty + 1))}
            />
          </View>

          <View style={styles.block}>
            <View style={[styles.spread, rowDir]}>
              <Txt style={styles.deliverTxt}>{`${d.t('deliverTo')}: ${d.t(state.city)}`}</Txt>
              <Txt style={styles.deliverMuted}>{d.cityDays[state.city]}</Txt>
            </View>
            <View style={[styles.spread, rowDir, { marginTop: 6 }]}>
              <Txt style={styles.feeTxt}>{d.t('shippingFee')}</Txt>
              <Txt style={styles.feeTxt}>
                {d.subtotalRaw >= 300 ? d.t('freeShipReached') : d.fmtPrice(d.cityFee)}
              </Txt>
            </View>
            <Txt isRtl={d.isRtl} style={styles.payTxt}>
              {d.t('payMethods')}
            </Txt>
          </View>

          <View style={styles.block}>
            <Txt isRtl={d.isRtl} style={styles.sectionLabel}>
              {d.t('description')}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.desc}>
              {d.desc(p)}
            </Txt>
          </View>

          <View style={styles.pointsBox}>
            <Txt isRtl={d.isRtl} style={styles.pointsTxt}>
              {d.t('pointsNote', { n: Math.round(p.price) })}
            </Txt>
          </View>
        </View>

        {related.length > 0 && (
          <View style={{ paddingTop: 22 }}>
            <Txt isRtl={d.isRtl} style={styles.relatedLabel}>
              {d.t('related')}
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.relatedList, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}
            >
              {related.map((r) => (
                <Press
                  key={r.id}
                  onPress={() => actions.goTo('pdp', { selectedProductId: r.id, pdpQty: 1 })}
                  style={styles.relatedCard}
                >
                  <View style={styles.relatedImg}>
                    <Img source={r.img} contentFit="contain" style={styles.fill} />
                  </View>
                  <View style={styles.relatedBody}>
                    <Txt isRtl={d.isRtl} style={styles.relatedTitle}>
                      {d.title(r)}
                    </Txt>
                    <Txt isRtl={d.isRtl} style={styles.relatedPrice}>
                      {d.fmtPrice(r.price)}
                    </Txt>
                  </View>
                </Press>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* sticky buy bar */}
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
        locations={[0, 0.45]}
        style={[styles.buyBar, rowDir]}
      >
        <Press onPress={() => actions.goTab('cart')} activeScale={0.97} style={styles.cartBtn}>
          <Cart size={20} />
          {d.cartCount > 0 && (
            <DarkFill borderRadius={8} style={styles.badge}>
              <Txt style={styles.badgeTxt}>{d.num(d.cartCount)}</Txt>
            </DarkFill>
          )}
        </Press>
        <Cta
          glow
          style={styles.buyCta}
          onPress={() => {
            actions.addToCart(p.id, state.pdpQty);
            success();
          }}
        >
          <View style={[styles.buyInner, rowDir]}>
            <Txt style={styles.buyTxt}>{d.t('buyNow')}</Txt>
            <Txt style={styles.buyTxt}>{d.fmtPrice(p.price)}</Txt>
          </View>
        </Cta>
      </LinearGradient>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },

  hero: { height: 300 },
  heroBtns: {
    position: 'absolute',
    top: 18,
    left: 20,
    right: 20,
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },

  card: {
    marginTop: -26,
    marginHorizontal: 20,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
    padding: 20,
  },
  titleRow: { alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: W.heavy, fontSize: 21, lineHeight: 25, maxWidth: '70%' },
  price: { fontSize: 21, fontWeight: W.heavy, color: C.ink },
  stock: { fontSize: 12, fontWeight: W.bold, color: C.inkSofter, marginTop: 6 },

  shipBox: {
    marginVertical: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  shipTxt: { fontSize: 11.5, fontWeight: W.semibold, color: C.inkSoft },

  sectionLabel: { fontWeight: W.bold, fontSize: 13, marginBottom: 10 },
  qtyRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  qtyLabel: { fontSize: 13, color: C.inkSoft },

  block: {
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 14,
    marginBottom: 14,
  },
  spread: { justifyContent: 'space-between', alignItems: 'center' },
  deliverTxt: { fontSize: 12.5, fontWeight: W.semibold },
  deliverMuted: { fontSize: 12.5, fontWeight: W.semibold, color: 'rgba(110,110,115,0.6)' },
  feeTxt: { fontSize: 12, color: C.inkSofter },
  payTxt: { fontSize: 11.5, color: 'rgba(110,110,115,0.45)', marginTop: 8 },
  desc: { fontSize: 13, lineHeight: 21, color: C.inkSoft },

  pointsBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  pointsTxt: { fontSize: 12, fontWeight: W.semibold, color: C.inkSoft },

  relatedLabel: { paddingHorizontal: 22, paddingBottom: 12, fontWeight: W.heavy, fontSize: 16 },
  relatedList: { gap: 12, paddingHorizontal: 22, paddingBottom: 18 },
  relatedCard: {
    width: 118,
    borderRadius: 18,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  relatedImg: { width: 118, height: 110 },
  relatedBody: { paddingHorizontal: 10, paddingBottom: 10 },
  relatedTitle: { fontSize: 11.5, fontWeight: W.semibold, lineHeight: 14 },
  relatedPrice: { fontSize: 12, fontWeight: W.heavy, marginTop: 4, color: C.ink },

  buyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 10,
    alignItems: 'center',
  },
  cartBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: { color: '#ffffff', fontSize: 9, fontWeight: W.heavy },
  buyCta: { flex: 1 },
  buyInner: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  buyTxt: { color: '#ffffff', fontWeight: W.heavy, fontSize: 16 },
});
