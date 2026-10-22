/**
 * Call history + recordings, behind a swappable provider.
 *
 * OKA is retiring Salestrail, so nothing above this file may import
 * `salestrail.js` directly. Routes and the mobile app talk to this module and
 * get the same normalized shape whichever backend is in use:
 *
 *   { id, startTime, answered, inbound, duration, durationLabel, rep,
 *     hasRecording, recordingUrl }
 *
 * Swapping providers is then an env change plus one new file, not a rewrite.
 *
 * Providers:
 *   salestrail  reads Salestrail's export API (current)
 *   voip        calls placed through a telephony provider, recorded server
 *               side — the only option that yields clean two-way audio on
 *               modern Android and iOS. Not implemented yet; see
 *               docs/call-recording.md for why this is the recommended
 *               replacement.
 *   device      the rep's phone supplies the call log (and, where the OEM
 *               allows, audio). Android-only and device-dependent.
 *   none        no call source; history renders empty.
 */

import { config } from "../config.js";
import * as salestrail from "./salestrail.js";
import { UpstreamError } from "./httpClient.js";

const notImplemented = (name) => ({
  isConfigured: () => false,
  callsForPhone: async () => {
    throw new UpstreamError(
      `Call provider "${name}" is selected but not implemented yet — see docs/call-recording.md`,
      { service: "calls", status: 501 },
    );
  },
  getRecording: async () => {
    throw new UpstreamError(`Call provider "${name}" is not implemented yet`, {
      service: "calls",
      status: 501,
    });
  },
});

const PROVIDERS = {
  salestrail: {
    isConfigured: salestrail.isConfigured,
    callsForPhone: async (phone, options) => {
      const calls = await salestrail.callsForPhone(phone, options);
      return calls.map((entry) => ({
        id: entry.id,
        startTime: entry.startTime,
        answered: entry.answered,
        inbound: entry.inbound,
        duration: entry.duration,
        durationLabel: salestrail.formatDuration(entry.duration),
        rep: entry.rep,
        hasRecording: Boolean(entry.recordingUrl),
        recordingUrl: entry.recordingUrl,
      }));
    },
    getRecording: salestrail.getRecording,
  },

  voip: notImplemented("voip"),
  device: notImplemented("device"),

  none: {
    isConfigured: () => true,
    callsForPhone: async () => [],
    getRecording: async () => null,
  },
};

export function activeProvider() {
  return PROVIDERS[config.calls.provider] || PROVIDERS.none;
}

export const providerName = () => config.calls.provider;
export const isConfigured = () => activeProvider().isConfigured();
export const callsForPhone = (phone, options) => activeProvider().callsForPhone(phone, options);
export const getRecording = (callId) => activeProvider().getRecording(callId);
