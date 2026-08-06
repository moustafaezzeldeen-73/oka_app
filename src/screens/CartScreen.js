import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useActions, useDerived, useStore } from '../store';
import { useRefresh } from '../useRefresh';
import { success } from '../haptics';
import { C, W } from '../theme';
import { textDir } from '../rtl';
import { FadeIn } from '../components/anim';
import { DarkFill, Img, Press, Progress, Txt } from '../components/ui';
import { Cta, QtyStepper, SumRow } from '../components/parts';

export default function CartScreen() {
  const { state, products, reloadCatalogue } = useStore();
  const actions = useActions();
  const d = useDerived();
  const { control } = useRefresh(reloadCatalogue);
  const rowDir = { flexDirection: d.isRtl ? 'row-reverse' : 'row' };

  const bestSellers = useMemo(
    () => [products[0], products[1], products[7], products[3]].filter(Boolean),
    [products],
  );
  const crossSell = useMemo(
    () =>
      products
        .filter((p) => !d.cartEntries.some((ce) => ce.product.id === p.id))
        .slice(0, 8),
    [products, d.cartEntries],
  );

  return (
    <FadeIn style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={control}
      >
        <Txt isRtl={d.isRtl} style={styles.title}>
          {d.t('cartTitle')}
        </Txt>

        {d.cartEntries.length > 0 ? (
          <>
            {d.cartEntries.map((ce) => (
              <View key={ce.id} style={[styles.line, rowDir]}>
                <View style={styles.lineImg}>
                  <Img source={ce.product.img} contentFit="contain" style={styles.fill} />
                </View>
                <View style={styles.lineBody}>
                  <Txt isRtl={d.isRtl} style={styles.lineTitle}>
                    {d.title(ce.product)}
                  </Txt>
                  <Txt isRtl={d.isRtl} style={styles.lineUnit}>
                    {d.fmtPrice(ce.product.price)}
                  </Txt>
                  <View style={[styles.lineFoot, rowDir]}>
                    <QtyStepper
                      isRtl={d.isRtl}
                      size={24}
                      fontSize={13}
                      gap={8}
                      qty={d.num(ce.qty)}
                      onDec={() => actions.setQty(ce.id, ce.qty - 1)}
                      onInc={() => actions.setQty(ce.id, ce.qty + 1)}
                    />
                    <Txt style={styles.lineTotal}>{d.fmtPrice(ce.lineTotalRaw)}</Txt>
                  </View>
                </View>
                <Press onPress={() => actions.setQty(ce.id, 0)} hitSlop={10} style={styles.remove}>
                  <Txt style={styles.removeTxt}>✕</Txt>
                </Press>
              </View>
            ))}

            <View style={styles.shipBox}>
              <Progress pct={d.cartProgressPct} isRtl={d.isRtl} style={{ marginBottom: 8 }} />
              <Txt isRtl={d.isRtl} style={styles.shipTxt}>
                {d.remainingForFree > 0
                  ? d.t('freeShipProgress', { n: d.remainingForFree })
                  : d.t('freeShipReached')}
              </Txt>
            </View>

            <View style={[styles.discountRow, rowDir]}>
              <TextInput
                value={state.discountCode}
                onChangeText={actions.setDiscountCode}
                placeholder={d.t('discountPlaceholder')}
                placeholderTextColor="rgba(110,110,115,0.6)"
                style={[styles.input, textDir(d.isRtl)]}
              />
              <Press onPress={actions.applyDiscount} activeScale={0.95} style={styles.applyBtn}>
                <Txt style={styles.applyTxt}>
                  {state.discountApplied ? d.t('applied') : d.t('apply')}
                </Txt>
              </Press>
            </View>

            <View style={styles.totals}>
              <SumRow
                isRtl={d.isRtl}
                label={d.t('subtotal')}
                value={d.fmtPrice(d.subtotalRaw)}
                labelStyle={styles.sumTxt}
                valueStyle={styles.sumTxt}
              />
              {state.discountApplied && (
                <SumRow
                  isRtl={d.isRtl}
                  label={d.t('discount')}
                  value={`-${d.fmtPrice(d.discountRaw)}`}
                  labelStyle={styles.sumTxt}
                  valueStyle={styles.sumTxt}
                />
              )}
              <SumRow
                isRtl={d.isRtl}
                label={d.t('shipping')}
                value={d.shippingRaw === 0 ? d.t('freeShipReached') : d.fmtPrice(d.shippingRaw)}
                labelStyle={styles.sumTxt}
                valueStyle={styles.sumTxt}
              />
              <SumRow
                isRtl={d.isRtl}
                label={d.t('total')}
                value={d.fmtPrice(d.totalRaw)}
                style={styles.grandRow}
                labelStyle={styles.grandTxt}
                valueStyle={styles.grandTxt}
              />
              <Txt isRtl={d.isRtl} style={styles.earnTxt}>
                {d.t('earnOnDelivery', { n: d.pointsEarn })}
              </Txt>
            </View>

            <Txt isRtl={d.isRtl} style={styles.railTitle}>
              {d.isRtl ? 'كمّل جلستك' : 'Complete your setup'}
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.rail, rowDir]}
            >
              {crossSell.map((p) => (
                <View key={p.id} style={styles.csSlot}>
                  <Press
                    onPress={() => actions.goTo('pdp', { selectedProductId: p.id, pdpQty: 1 })}
                    style={styles.csCard}
                  >
                    <Img source={p.img} contentFit="contain" style={styles.fill} />
                  </Press>
                  <Txt isRtl={d.isRtl} style={styles.csTitle}>
                    {d.title(p)}
                  </Txt>
                  <Txt isRtl={d.isRtl} style={styles.csPrice}>
                    {d.fmtPrice(p.price)}
                  </Txt>
                  <Press
                    onPress={() => {
                      actions.addToCart(p.id, 1);
                      success();
                    }}
                    activeScale={0.96}
                    style={{ marginTop: 9 }}
                  >
                    <DarkFill borderRadius={999} style={styles.csAdd}>
                      <Txt center style={styles.csAddTxt}>
                        {d.t('add')}
                      </Txt>
                    </DarkFill>
                  </Press>
                </View>
              ))}
            </ScrollView>

            <View style={styles.checkoutWrap}>
              <Cta glow label={d.t('checkout')} onPress={() => actions.goTo('checkout')} />
            </View>
          </>
        ) : (
          <>
            <Txt center style={styles.empty}>
              {d.t('emptyCart')}
            </Txt>
            <Txt isRtl={d.isRtl} style={styles.railTitle}>
              {d.t('browse')}
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.rail, rowDir, { paddingBottom: 26 }]}
            >
              {bestSellers.map((p) => (
                <Press
                  key={p.id}
                  onPress={() => actions.goTo('pdp', { selectedProductId: p.id, pdpQty: 1 })}
                  style={styles.bsCard}
                >
                  <View style={styles.bsImg}>
                    <Img source={p.img} contentFit="contain" style={styles.fill} />
                  </View>
                  <View style={styles.bsBody}>
                    <Txt isRtl={d.isRtl} style={styles.bsTitle}>
                      {d.title(p)}
                    </Txt>
                    <View style={[styles.bsFoot, rowDir]}>
                      <Txt style={styles.bsPrice}>{d.fmtPrice(p.price)}</Txt>
                      <Press
                        onPress={() => {
                          actions.addToCart(p.id, 1);
                          success();
                        }}
                        activeScale={0.9}
                        hitSlop={8}
                      >
                        <DarkFill borderRadius={13} style={styles.bsAdd}>
                          <Txt style={styles.bsAddTxt}>+</Txt>
                        </DarkFill>
                      </Press>
                    </View>
                  </View>
                </Press>
              ))}
            </ScrollView>
          </>
        )}
        <View style={{ height: 26 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  title: { paddingHorizontal: 22, paddingVertical: 18, fontWeight: W.heavy, fontSize: 26 },

  line: {
    gap: 12,
    marginHorizontal: 22,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  lineImg: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  lineBody: { flex: 1 },
  lineTitle: { fontSize: 13, fontWeight: W.semibold, lineHeight: 16 },
  lineUnit: { fontSize: 12, color: C.ink, marginTop: 3 },
  lineFoot: { alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  lineTotal: { fontSize: 13, fontWeight: W.heavy, color: C.ink },
  remove: { alignSelf: 'flex-start' },
  removeTxt: { fontSize: 12, color: C.ink },

  shipBox: {
    marginVertical: 16,
    marginHorizontal: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  shipTxt: { fontSize: 12, fontWeight: W.semibold },

  discountRow: { gap: 8, paddingHorizontal: 22, paddingBottom: 18 },
  input: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.4)',
    color: C.ink,
  },
  applyBtn: {
    borderRadius: 14,
    paddingHorizontal: 18,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
  },
  applyTxt: { fontWeight: W.bold, fontSize: 12.5 },

  totals: {
    marginHorizontal: 22,
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  sumTxt: { fontSize: 13, color: C.ink },
  grandRow: {
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    marginTop: 8,
  },
  grandTxt: { fontSize: 16, fontWeight: W.heavy },
  earnTxt: { fontSize: 12, fontWeight: W.semibold, color: C.green, marginTop: 6 },

  railTitle: { paddingHorizontal: 22, paddingBottom: 10, fontWeight: W.bold, fontSize: 16 },
  rail: { gap: 14, paddingHorizontal: 22, paddingBottom: 22 },

  csSlot: { width: 132 },
  csCard: {
    width: 132,
    height: 132,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    boxShadow: '0 8px 22px rgba(0,0,0,0.06)',
  },
  csTitle: { fontSize: 12.5, fontWeight: W.semibold, lineHeight: 16, marginTop: 9 },
  csPrice: { fontSize: 13.5, fontWeight: W.bold, marginTop: 3 },
  csAdd: { paddingVertical: 9, borderRadius: 999 },
  csAddTxt: { fontSize: 12, fontWeight: W.bold, color: '#ffffff' },

  empty: { paddingTop: 50, paddingBottom: 24, paddingHorizontal: 22, color: C.ink, fontSize: 13.5 },
  bsCard: {
    width: 148,
    borderRadius: 22,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  bsImg: { width: '100%', height: 120 },
  bsBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 14 },
  bsTitle: { fontSize: 12.5, fontWeight: W.semibold, lineHeight: 16 },
  bsFoot: { alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  bsPrice: { fontSize: 13.5, fontWeight: W.heavy, color: C.ink },
  bsAdd: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bsAddTxt: { fontWeight: W.heavy, fontSize: 16, color: '#ffffff', lineHeight: 19 },

  checkoutWrap: { paddingHorizontal: 22, paddingBottom: 26 },
});
