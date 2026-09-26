import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { registerPushToken } from './api/auth';
import { useActions, useStore } from './store';

/**
 * Shipment notifications.
 *
 * When the shopper switches notifications on (Account screen) and is signed
 * in, this asks for permission, gets the device's Expo push token and
 * registers it with the server, which then sends "on its way" (with the cash
 * to have ready), "delivered" and "the courier couldn't reach you" — the
 * messages that stop a COD parcel from being refused.
 *
 * Push tokens need an EAS project id (app.json → extra.eas.projectId, set by
 * `eas init`) and a real device. Without either, the toggle explains why it
 * can't turn on.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const projectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

async function devicePushToken() {
  if (!Device.isDevice) throw new Error('Notifications need a real phone, not a simulator.');
  if (!projectId()) throw new Error('Notifications need an EAS project id (run `eas init`).');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Orders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') throw new Error('Notifications are turned off for OKA in Settings.');
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  return data;
}

export function usePushRegistration() {
  const { state } = useStore();
  const actions = useActions();
  const token = state.session?.token ?? null;
  const registered = useRef(null); // "<session>|<push token>"

  useEffect(() => {
    if (!state.hydrated || !state.notifEnabled || !token) return;
    let alive = true;
    devicePushToken()
      .then(async (pushToken) => {
        const key = `${token}|${pushToken}`;
        if (registered.current === key) return;
        await registerPushToken(pushToken, token);
        registered.current = key;
      })
      .catch((err) => {
        if (!alive) return;
        actions.setNotif(false);
        Alert.alert('Notifications', String(err.message ?? err));
      });
    return () => {
      alive = false;
    };
  }, [state.hydrated, state.notifEnabled, token, actions]);

  // Switching off stops the server sending to this device.
  useEffect(() => {
    if (state.notifEnabled || !token || !registered.current) return;
    const pushToken = registered.current.split('|')[1];
    registered.current = null;
    registerPushToken(pushToken, token, true).catch(() => {});
  }, [state.notifEnabled, token]);
}
