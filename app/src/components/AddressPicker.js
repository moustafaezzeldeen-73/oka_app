import React from 'react';
import { StyleSheet, View } from 'react-native';

import { C, W } from '../theme';
import { Press, Txt } from './ui';

/**
 * Shared radio-list address picker.
 *
 * Used by the order-edit sheet and the subscription builder — both let a
 * shopper redirect something to a different one of their saved addresses,
 * and both want the same look. `gutter` matches whichever horizontal margin
 * the surrounding screen uses (a sheet's 20px vs. a full screen's 22px).
 */
export default function AddressPicker({ addresses, activeId, onPick, isRtl, fallbackName, gutter = 20 }) {
  const rowDir = { flexDirection: isRtl ? 'row-reverse' : 'row' };
  return (
    <>
      {addresses.map((a) => {
        const active = a.id === activeId;
        return (
          <Press
            key={a.id}
            onPress={() => onPick(a)}
            style={[
              styles.row,
              { marginHorizontal: gutter },
              {
                borderColor: active ? C.ink : 'rgba(0,0,0,0.1)',
                borderWidth: active ? 1.5 : 1,
                backgroundColor: active ? 'rgba(0,0,0,0.035)' : '#ffffff',
              },
            ]}
          >
            <View style={[styles.inner, rowDir]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt isRtl={isRtl} style={styles.name}>
                  {a.name || fallbackName || ''}
                </Txt>
                <Txt isRtl={isRtl} style={styles.line}>{a.street}</Txt>
                <Txt isRtl={isRtl} style={styles.line}>{a.city}</Txt>
              </View>
              <View style={styles.radio}>
                <View style={[styles.dot, { backgroundColor: active ? C.accent : 'transparent' }]} />
              </View>
            </View>
          </Press>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 9, padding: 13, borderRadius: 15 },
  inner: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  name: { fontSize: 13.5, fontWeight: W.bold, lineHeight: 18 },
  line: { fontSize: 12.5, lineHeight: 18, color: 'rgba(110,110,115,0.95)', marginTop: 1 },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.6,
    borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
