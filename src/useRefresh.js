import React, { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { C } from './theme';

/**
 * Pull-to-refresh.
 *
 * Returns a `<RefreshControl>` ready to hand to a ScrollView, plus the
 * `refreshing` flag. The spinner is held for a beat even when the work
 * finishes instantly, because a gesture that produces no visible response
 * reads as a broken control.
 */
export function useRefresh(onRefresh) {
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await onRefresh?.();
    } catch {
      // A failed refresh leaves the last-known data on screen.
    } finally {
      const elapsed = Date.now() - started;
      const hold = Math.max(0, 450 - elapsed);
      setTimeout(() => setRefreshing(false), hold);
    }
  }, [onRefresh]);

  const control = (
    <RefreshControl refreshing={refreshing} onRefresh={run} tintColor={C.ink} colors={[C.ink]} />
  );

  return { refreshing, control, refresh: run };
}
