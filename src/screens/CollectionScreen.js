import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CATS } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { success } from '../haptics';
import { C, W } from '../theme';
import { chevronFlip } from '../rtl';
import { FadeIn } from '../components/anim';
import { DarkFill, Press, Txt } from '../components/ui';
import { GridCard } from '../components/parts';
import { ChevronLeft } from '../components/Icons';

export default function CollectionScreen() {
  const { state, products } = useStore();
  const actions = useActions();
  const d = useDerived();

  const cat = CATS.find((c) => c.id === state.collectionCategory);
  const list = useMemo(
    () =>
      state.collectionCategory === 'all'
        ? products
        : products.filter((p) => p.cat === state.collectionCategory),
    [products, state.collectionCategory],
  );

  /** The 2-up grid, chunked into rows so the gap logic stays simple. */
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
    return out;
  }, [list]);

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.bar, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
          <Press onPress={actions.goBack} style={[styles.backBtn, chevronFlip(d.isRtl)]} hitSlop={8}>
            <ChevronLeft />
          </Press>
          <Txt style={styles.barTitle}>
            {cat ? (d.isRtl ? cat.ar : cat.en) : d.t('all')}
          </Txt>
        </View>

        <Txt isRtl={d.isRtl} style={styles.count}>
          {`${d.num(list.length)} ${d.t('productsCount')}`}
        </Txt>

        <View style={[styles.chips, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
          <DarkFill borderRadius={999} style={styles.chipDark}>
            <Txt style={styles.chipDarkTxt}>{d.t('sortBestSelling')}</Txt>
          </DarkFill>
          <View style={styles.chip}>
            <Txt style={styles.chipTxt}>{d.t('filters')}</Txt>
          </View>
        </View>

        {rows.length > 0 ? (
          <View style={styles.grid}>
            {rows.map((pair, i) => (
              <View
                key={i}
                style={[styles.gridRow, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}
              >
                {pair.map((p) => (
                  <GridCard
                    key={p.id}
                    product={p}
                    d={d}
                    onOpen={() => actions.goTo('pdp', { selectedProductId: p.id, pdpQty: 1 })}
                    onAdd={() => {
                      actions.addToCart(p.id, 1);
                      success();
                    }}
                  />
                ))}
                {pair.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
        ) : (
          <Txt center style={styles.empty}>
            {d.t('noMatch')}
          </Txt>
        )}
        <View style={{ height: 26 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 22,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTitle: { fontWeight: W.heavy, fontSize: 21 },
  count: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14, fontSize: 12.5, color: C.inkSofter },
  chips: { gap: 8, paddingHorizontal: 22, paddingBottom: 18 },
  chipDark: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  chipDarkTxt: { fontSize: 12, fontWeight: W.bold, color: '#ffffff' },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chipTxt: { fontSize: 12, fontWeight: W.bold },
  grid: { paddingHorizontal: 22, gap: 14 },
  gridRow: { gap: 14 },
  empty: { paddingVertical: 40, color: C.ink, fontSize: 13.5 },
});
