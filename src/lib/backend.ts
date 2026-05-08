export type Backend = "drand" | "ctrng";

export interface BackendInfo {
  label: string;
  short: string;
  tagline: string;
  kind: Backend;
}

export const BACKENDS: Record<Backend, BackendInfo> = {
  ctrng: {
    kind: "ctrng",
    label: "SpaceComputer cTRNG (commit-reveal)",
    short: "cTRNG",
    tagline:
      "AES-256-GCM with a browser-held key. Reveal is gated on a published cTRNG beacon block from orbit — a publicly verifiable timestamp witness.",
  },
  drand: {
    kind: "drand",
    label: "drand timelock",
    short: "drand",
    tagline:
      "True non-interactive timelock. The unlock key literally does not exist until the drand consortium publishes a future BLS signature.",
  },
};

/**
 * Display order for the backend picker. cTRNG is the default / featured option.
 * Use this when iterating instead of `Object.values(BACKENDS)` so the order is
 * guaranteed regardless of engine field-ordering quirks.
 */
export const BACKEND_ORDER: Backend[] = ["ctrng", "drand"];

export const DEFAULT_BACKEND: Backend = "ctrng";
