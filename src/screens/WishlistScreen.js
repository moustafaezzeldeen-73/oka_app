import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useActions, useDerived, useStore } from '../store';
import { C } from '../theme';
import { FadeIn } from '../components/anim';
import { Txt } from '../components/ui';
import { Cta, ScreenHeader } from '../components/parts';
import ProductGrid from '../components/ProductGrid';

/** Everything the shopper has hearted. Saved on their account when signed in. */
export default function WishlistScreen() {
  const { state, products } = useStore();
  const actions = useActions();
  const d = useDerived();
  const saved = useMemo(() => products.filter((p) => state.wishlist[p.id]), [products, state.wishlist]);

  return (
    <FadeIn style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title={d.t('myWishlist')} onBack={actions.goBack} isRtl={d.isRtl} />
        {saved.length ? (
          <ProductGrid products={saved} d={d} />
        ) : (
          <>
            <Txt center style={styles.empty}>
              {d.isRtl ? 'اضغط على القلب في أي منتج عشان تحفظه هنا.' : 'Tap the heart on any product to save it here.'}
            </Txt>
            <Cta label={d.t('browse')} onPress={() => actions.goTab('home')} style={styles.cta} />
          </>
        )}
        {!state.session?.token && saved.length ? (
          <Txt center style={styles.note}>
            {d.isRtl ? 'سجّل دخولك عشان المفضلة تتحفظ على حسابك.' : 'Sign in to keep your wishlist on your account.'}
          </Txt>
        ) : null}
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  empty: { paddingVertical: 36, paddingHorizontal: 30, fontSize: 14, lineHeight: 21, color: C.inkSoft },
  cta: { marginHorizontal: 22 },
  note: { paddingVertical: 20, paddingHorizontal: 30, fontSize: 12.5, color: C.inkSoft },
});
