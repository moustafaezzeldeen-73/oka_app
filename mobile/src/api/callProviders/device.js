/**
 * Device call provider — the phone records, this app harvests.
 *
 * Zero recurring cost and no telephony account: the handset's own system
 * dialer does the recording (Xiaomi/Redmi, Realme, Oppo, Infinix, Tecno and
 * many Samsungs ship this), writes a file to shared storage, and this module
 * matches those files back to entries in the native call log.
 *
 * What this CANNOT do, on any Android 10+ device, at any price:
 * capture the call itself from inside this app. `VOICE_CALL`,
 * `VOICE_DOWNLINK` and `VOICE_UPLINK` need `CAPTURE_AUDIO_OUTPUT`, which is
 * `signature|privileged` — system, carrier, and preloaded OEM apps only. So
 * the recording has to come from the dialer that already has that privilege.
 * See docs/call-recording.md.
 *
 * Requirements, both unavoidable:
 *   1. A development build (`npx expo run:android`, or EAS). Expo Go is a
 *      fixed binary and cannot hold READ_CALL_LOG. Everything here degrades
 *      to an empty list inside Expo Go rather than crashing.
 *   2. Call recording switched ON in the phone's own dialer settings. If the
 *      handset has no such setting, there is no audio to find — the call log
 *      still works, the play buttons simply never appear.
 */

import { Platform } from "react-native";

/**
 * Where the stock dialers write call recordings. Ordered roughly by how
 * common the handset is in the Egyptian market. Add a path here when a new
 * device shows up rather than changing any logic.
 */
export const RECORDING_DIRECTORIES = [
  "MIUI/sound_recorder/call_rec", // Xiaomi / Redmi / POCO
  "Recordings/Call", // Android 12+ stock, recent Samsung
  "Record/PhoneRecord", // Oppo / Realme
  "PhoneRecord", // Vivo
  "Sounds", // older Samsung
  "Recordings/Call Recordings",
  "CallRecordings",
  "Music/Recordings",
];

/**
 * Native modules are resolved lazily so importing this file is safe in Expo
 * Go, where they do not exist.
 */
function loadCallLogModule() {
  try {
    // eslint-disable-next-line global-require
    return require("react-native-call-log").default || require("react-native-call-log");
  } catch {
    return null;
  }
}

function loadMediaLibrary() {
  try {
    // eslint-disable-next-line global-require
    return require("expo-media-library");
  } catch {
    return null;
  }
}

/** True only in a build that actually has the call-log module linked. */
export function isAvailable() {
  return Platform.OS === "android" && Boolean(loadCallLogModule());
}

/**
 * Why the provider is unavailable, so the UI can say something useful instead
 * of silently showing an empty history.
 */
export function unavailableReason() {
  if (Platform.OS !== "android") return "ios";
  if (!loadCallLogModule()) return "needs-dev-build";
  return null;
}

const digitsOf = (value) => String(value || "").replace(/\D/g, "");

/**
 * Egyptian numbers arrive in three shapes across the call log, Shopify and
 * Bosta (`01110727746`, `+201110727746`, `201110727746`). Comparing the last
 * nine digits matches all three without needing to normalize every source.
 */
const tail = (value) => digitsOf(value).slice(-9);

/**
 * Match a recording file to a call.
 *
 * Two independent signals, because filename conventions vary wildly by OEM:
 * some embed the number, some only a timestamp. A filename containing the
 * number is decisive; otherwise the file's modification time has to land
 * inside the call, with a little slack for the OEM writing the file after
 * hang-up.
 */
export function matchRecording(call, files, { slackMs = 120000 } = {}) {
  const callTail = tail(call.phoneNumber);
  const start = new Date(call.timestamp).getTime();
  const end = start + (Number(call.duration) || 0) * 1000;

  const byName = files.find((file) => callTail && digitsOf(file.filename).includes(callTail));
  if (byName) return byName;

  return (
    files.find((file) => {
      const modified = Number(file.modificationTime) || 0;
      // MediaLibrary reports seconds on some versions and ms on others.
      const ms = modified > 1e12 ? modified : modified * 1000;
      return ms >= start - slackMs && ms <= end + slackMs;
    }) || null
  );
}

/**
 * Audio files the OS has indexed. Call recordings written by a system dialer
 * land in MediaStore, so this finds them without needing broad file-system
 * access — `MANAGE_EXTERNAL_STORAGE` and its Play declaration are avoided.
 */
async function loadRecordingFiles() {
  const MediaLibrary = loadMediaLibrary();
  if (!MediaLibrary) return [];

  try {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) return [];

    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      sortBy: [MediaLibrary.SortBy.modificationTime],
      first: 300,
    });

    // Keep only assets that live under a known call-recording directory —
    // otherwise every music file on the phone is a candidate.
    return page.assets.filter((asset) => {
      const uri = asset.uri || "";
      return RECORDING_DIRECTORIES.some((dir) => uri.includes(dir)) || /call/i.test(uri);
    });
  } catch {
    return [];
  }
}

const durationLabel = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * One customer's calls from the device log, newest first, each carrying its
 * recording when the dialer produced one.
 */
export async function callsForPhone(phone, { days = 14 } = {}) {
  const CallLogs = loadCallLogModule();
  if (!CallLogs) return [];

  const target = tail(phone);
  if (!target) return [];

  try {
    // The module's own filter is unreliable across OEM ROMs, so a generous
    // page is pulled and filtered here.
    const entries = await CallLogs.load(200);
    const since = Date.now() - days * 86400000;
    const files = await loadRecordingFiles();

    return entries
      .filter((entry) => tail(entry.phoneNumber) === target && Number(entry.timestamp) >= since)
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
      .map((entry) => {
        const recording = matchRecording(entry, files);
        const answered = entry.type !== "MISSED" && Number(entry.duration) > 0;

        return {
          id: `${entry.timestamp}-${digitsOf(entry.phoneNumber)}`,
          startTime: new Date(Number(entry.timestamp)).toISOString(),
          answered,
          inbound: entry.type === "INCOMING",
          duration: Number(entry.duration) || 0,
          durationLabel: durationLabel(entry.duration),
          rep: entry.name || null,
          // Only true when the phone's dialer actually produced a file.
          hasRecording: Boolean(recording),
          recordingUrl: recording?.uri || null,
        };
      });
  } catch {
    return [];
  }
}

/** The file URI is already playable; nothing to resolve. */
export async function getRecording(call) {
  return call?.recordingUrl || null;
}
