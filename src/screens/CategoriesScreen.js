import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CATS } from '../data';
import { useActions, useDerived, useStore } from '../store';
import { C, W } from '../theme';
import { FadeIn } from '../components/anim';
import { Img, Press, Txt } from '../components/ui';

export default function CategoriesScreen() {
  const { products } = useStore();
  const actions = useActions();
  const d = useDerived();

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Txt isRtl={d.isRtl} style={styles.title}>
          {d.t('categoriesTitle')}
        </Txt>

        {CATS.map((c) => {
          const first = products.find((p) => p.cat === c.id);
          const count = products.filter((p) => p.cat === c.id).length;
          return (
            <Press
              key={c.id}
              onPress={() => actions.goTo('collection', { collectionCategory: c.id })}
              activeBg="rgba(255,255,255,0.07)"
              style={[styles.row, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}
            >
              <View style={styles.thumb}>
                <Img source={c.img ?? first?.img} contentFit="cover" style={styles.fill} />
              </View>
              <View style={styles.meta}>
                <Txt isRtl={d.isRtl} style={styles.label}>
                  {d.isRtl ? c.ar : c.en}
                </Txt>
                <Txt isRtl={d.isRtl} style={styles.count}>
                  {`${d.num(count)} ${d.t('productsCount')}`}
                </Txt>
              </View>
            </Press>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  title: { paddingHorizontal: 22, paddingVertical: 18, fontWeight: W.heavy, fontSize: 26 },
  row: {
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 22,
    marginBottom: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  meta: { flex: 1 },
  label: { fontWeight: W.bold, fontSize: 15 },
  count: { fontSize: 12, color: C.inkSofter, marginTop: 3 },
});
