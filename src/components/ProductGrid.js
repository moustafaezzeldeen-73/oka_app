import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useActions } from '../store';
import { success } from '../haptics';
import { GridCard } from './parts';

/** The 2-up product grid used by collections, search and the wishlist. */
export default function ProductGrid({ products, d }) {
  const actions = useActions();
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < products.length; i += 2) out.push(products.slice(i, i + 2));
    return out;
  }, [products]);

  return (
    <View style={styles.grid}>
      {rows.map((pair, i) => (
        <View key={i} style={[styles.row, { flexDirection: d.isRtl ? 'row-reverse' : 'row' }]}>
          {pair.map((p) => (
            <GridCard
              key={p.id}
              product={p}
              d={d}
              onOpen={() => actions.goTo('pdp', { selectedProductId: p.id, pdpQty: 1 })}
              onAdd={() => {
                if (p.stock === 0 || p.available === false) return;
                actions.addToCart(p.id, 1);
                success();
              }}
            />
          ))}
          {pair.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: 22, gap: 14 },
  row: { gap: 14 },
});
