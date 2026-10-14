import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

import { registerPushToken } from '../api/auth';
import { useActions, useStore } from '../state/store';

/**
 * Shipment notifications: "shipped", "out for delivery — have the cash
 * ready", "the courier couldn't reach you", "delivered". The server decides
 * when to send them (server/services/notify.js); this registers the device and opens
 * the right order when one is tapped.
 *
 * Push needs:
 *  • an EAS project id (app.json → extra.eas.projectId, set by `eas init`)
 *  • a real device
 *  • on Android, a development or store build — Expo Go on Android dropped
 *    remote notifications in SDK 53, so the toggle says so there instead
 *
 * expo-notifications is loaded only once notifications are switched on, so
 * the app doesn't pay for it (or log Expo Go's warnings) otherwise.
 */

const projectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

const isExpoGo = Constants.executionEnvironment === 'storeClient';

/** Why push can't work in this build, or null if it can. */
function unsupportedReason(isRtl) {
  if (isExpoGo && Platform.OS === 'android') {
    return isRtl
      ? 'الإشعارات مش شغالة على Expo Go في أندرويد. جرّبها على نسخة التطبيق الكاملة.'
      : 'Notifications don’t work in Expo Go on Android. Use a development or store build.';
  }
  if (!projectId()) {
    return isRtl
      ? 'الإشعارات محتاجة ربط المشروع بـ EAS (eas init).'
      : 'Notifications need the project linked to EAS (run `eas init`).';
  }
  return null;
}

let modulePromise = null;
/** Loads expo-notifications once and sets how notices show in the foreground. */
function loadNotifications() {
  if (!modulePromise) {
    modulePromise = import('expo-notifications').then((N) => {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return N;
    });
  }
  return modulePromise;
}

async function devicePushToken(isRtl) {
  const Device = await import('expo-device');
  if (!Device.isDevice) {
    throw new Error(isRtl ? 'الإشعارات محتاجة موبايل حقيقي.' : 'Notifications need a real phone, not a simulator.');
  }
  const N = await loadNotifications();
  if (Platform.OS === 'android') {
    // The server sends to this channel (channelId: 'orders').
    await N.setNotificationChannelAsync('orders', {
      name: isRtl ? 'الطلبات' : 'Orders',
      importance: N.AndroidImportance.HIGH,
    });
  }
  let { status } = await N.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await N.requestPermissionsAsync());
  if (status !== 'granted') {
    throw new Error(
      isRtl
        ? 'الإشعارات مقفولة لأوكا من إعدادات الموبايل.'
        : 'Notifications are turned off for OKA in your phone’s Settings.',
    );
  }
  const { data } = await N.getExpoPushTokenAsync({ projectId: projectId() });
  return data;
}

export function usePushRegistration() {
  const { state } = useStore();
  const actions = useActions();
  const token = state.session?.token ?? null;
  const isRtl = state.lang === 'ar';
  /** { session, push } — which account this device is registered under. */
  const registered = useRef(null);

  // Register while switched on and signed in.
  useEffect(() => {
    if (!state.hydrated || !state.notifEnabled || !token) return undefined;
    const reason = unsupportedReason(isRtl);
    if (reason) {
      actions.setNotif(false);
      Alert.alert(isRtl ? 'الإشعارات' : 'Notifications', reason);
      return undefined;
    }
    let alive = true;
    devicePushToken(isRtl)
      .then(async (push) => {
        if (registered.current?.session === token && registered.current?.push === push) return;
        await registerPushToken(push, token);
        registered.current = { session: token, push };
      })
      .catch((err) => {
        if (!alive) return;
        actions.setNotif(false);
        Alert.alert(isRtl ? 'الإشعارات' : 'Notifications', String(err.message ?? err));
      });
    return () => {
      alive = false;
    };
  }, [state.hydrated, state.notifEnabled, token, isRtl, actions]);

  // Switched off, signed out, or a different account signed in: stop this
  // device receiving the previous account's notices.
  useEffect(() => {
    const r = registered.current;
    if (!r || (state.notifEnabled && token === r.session)) return;
    registered.current = null;
    registerPushToken(r.push, r.session, true).catch(() => {});
  }, [state.notifEnabled, token]);

  // Tapping a notice opens that order — including when it launched the app.
  useEffect(() => {
    if (!state.hydrated || !state.notifEnabled || unsupportedReason(isRtl)) return undefined;
    let sub = null;
    let alive = true;
    const open = (response) => {
      const name = response?.notification?.request?.content?.data?.orderName;
      if (!name) return;
      actions.goTab('orders');
      actions.openOrder(name);
    };
    loadNotifications()
      .then(async (N) => {
        if (!alive) return;
        sub = N.addNotificationResponseReceivedListener(open);
        const last = await N.getLastNotificationResponseAsync();
        if (alive && last) {
          open(last);
          N.clearLastNotificationResponseAsync().catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [state.hydrated, state.notifEnabled, isRtl, actions]);
}
