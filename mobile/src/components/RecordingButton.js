/**
 * Play button for a call recording.
 *
 * The audio is captured by whichever call provider the backend is configured
 * with — this app only plays it back (see docs/call-recording.md). A row with
 * no audio renders nothing here, because an answered call is not necessarily
 * a recorded one.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { colors, s, white } from "../theme.js";
import { Press, Txt } from "./primitives.js";
import { recordingUrlFor } from "../api/calls.js";

export function RecordingButton({ call }) {
  const [state, setState] = useState("idle"); // idle | loading | playing
  const playerRef = useRef(null);

  // Releasing the native player on unmount stops audio continuing after the
  // screen is closed.
  useEffect(
    () => () => {
      playerRef.current?.remove?.();
      playerRef.current = null;
    },
    [],
  );

  const toggle = useCallback(async () => {
    if (state === "playing") {
      playerRef.current?.pause?.();
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const url = await recordingUrlFor(call);
      if (!url) {
        setState("idle");
        return;
      }

      // Play through the speaker even when the ringer switch is silenced —
      // a warehouse floor is loud and the rep is reviewing, not being called.
      await setAudioModeAsync({ playsInSilentMode: true });

      playerRef.current?.remove?.();
      const player = createAudioPlayer({ uri: url });
      playerRef.current = player;

      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) setState("idle");
      });

      player.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }, [call, state]);

  if (!call.hasRecording) return null;

  return (
    <Press
      onPress={toggle}
      style={{
        width: s(30),
        height: s(30),
        borderRadius: s(9),
        backgroundColor: state === "playing" ? colors.green : colors.chipTrack,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {state === "loading" ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : state === "playing" ? (
        // Pause: two bars.
        <View style={{ flexDirection: "row", gap: s(3) }}>
          <View style={{ width: s(3), height: s(11), backgroundColor: "#fff" }} />
          <View style={{ width: s(3), height: s(11), backgroundColor: "#fff" }} />
        </View>
      ) : (
        <Txt f={[600, 11]} color={colors.ink}>
          ▶
        </Txt>
      )}
    </Press>
  );
}
