import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useActions, useDerived, useStore } from '../state/store';
import { C, W } from '../theme';
import { textDir } from '../lib/rtl';
import { FadeIn } from '../components/anim';
import { Press, Txt } from '../components/ui';
import { ScreenHeader } from '../components/parts';
import ProductGrid from '../components/ProductGrid';
import { searchProducts } from '../lib/catalogueQuery';

/** Search across Arabic and English titles and descriptions. */
export default function SearchScreen() {
  const { state, products, cats } = useStore();
  const actions = useActions();
  const d = useDerived();
  const results = useMemo(() => searchProducts(products, state.searchQuery), [products, state.searchQuery]);
  const q = state.searchQuery.trim();

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={d.isRtl ? 'البحث' : 'Search'} onBack={actions.goBack} isRtl={d.isRtl} />
        <View style={styles.inputWrap}>
          <TextInput
            value={state.searchQuery}
            onChangeText={actions.setSearchQuery}
            placeholder={d.t('search')}
            placeholderTextColor="rgba(110,110,115,0.6)"
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[styles.input, textDir(d.isRtl)]}
          />
        </View>

        {!q ? (
          <View style={[styles.cats, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
            {cats.map((c) => (
              <Press
                key={c.id}
                onPress={() => actions.goTo('collection', { collectionCategory: c.id })}
                style={styles.catChip}
              >
                <Txt style={styles.catTxt}>{d.isRtl ? c.ar : c.en}</Txt>
              </Press>
            ))}
          </View>
        ) : results.length ? (
          <>
            <Txt isRtl={d.isRtl} style={styles.count}>
              {`${d.num(results.length)} ${d.t('productsCount')}`}
            </Txt>
            <ProductGrid products={results} d={d} />
          </>
        ) : (
          <Txt center style={styles.empty}>
            {d.isRtl ? `مفيش نتايج لـ "${q}"` : `No results for “${q}”`}
          </Txt>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inputWrap: { paddingHorizontal: 22, paddingBottom: 14 },
  input: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.7)',
    color: C.ink,
  },
  cats: { flexWrap: 'wrap', gap: 8, paddingHorizontal: 22 },
  catChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  catTxt: { fontSize: 13, fontWeight: W.semibold },
  count: { paddingHorizontal: 22, paddingBottom: 12, fontSize: 12.5, color: C.inkSofter },
  empty: { paddingVertical: 40, paddingHorizontal: 22, fontSize: 14, color: C.inkSoft },
});
