/**
 * SPEC §9.1 -- assurance: what a valid signature proves about *origin*.
 *
 * A generative model that fabricates a diffraction pattern can also generate a
 * key pair, sign its output, and embed the public key. The result is
 * cryptographically flawless. So "the signature verifies" is not the question,
 * and a verifier that answers it as though it were becomes a rubber stamp for
 * exactly the adversary it was built to stop.
 *
 * Integrity and origin are separate axes. This file is the origin one.
 */

import { classifyPolicies, describePen } from "./oids.js";

export const ASSURANCE_NONE = "none";
export const ASSURANCE_SELF = "self-attested";
export const ASSURANCE_CUSTODIAL = "custodial";
export const ASSURANCE_INSTRUMENT = "instrument";

export const ASSURANCE_ORDER = [
  ASSURANCE_NONE,
  ASSURANCE_SELF,
  ASSURANCE_CUSTODIAL,
  ASSURANCE_INSTRUMENT,
];

// Certificate policy OIDs live in oids.js -- one definition, one place to
// change when the project gets a real IANA Private Enterprise Number.
export {
  ACTIVE_PEN, DOCUMENTATION_PEN, IANA_APPLY_URL, PROVISIONAL_WARNING,
  arc, classifyPolicies, custodialOid, describePen, instrumentAttestationOid,
  isProvisional,
} from "./oids.js";

export const MODE_PHYSICAL = "physical";

export const ACQUISITION_MODES = {
  physical: "photons on the sensor, read out normally",
  "test-pattern": "detector-generated synthetic image",
  calibration: "flat-field, dark, or gain calibration exposure",
  simulated: "data injected into the detector, not measured",
  unknown: "the signer did not state a mode",
};

function weakest(a, b) {
  return ASSURANCE_ORDER.indexOf(a) <= ASSURANCE_ORDER.indexOf(b) ? a : b;
}

export function headline(level) {
  return {
    [ASSURANCE_NONE]: "no origin claim",
    [ASSURANCE_SELF]: "self-attested - origin NOT established",
    [ASSURANCE_CUSTODIAL]: "custodial - vouched for, but not instrument-attested",
    [ASSURANCE_INSTRUMENT]: "instrument-attested",
  }[level];
}

/**
 * Conservative at every branch: an absent claim is treated as a claim not made,
 * never as a claim satisfied. A scheme whose default is "probably fine"
 * defends against nothing.
 */
export function assessAssurance({ signatureValid, trustStatus, certificates, manifest }) {
  if (!signatureValid || !manifest) {
    return { level: ASSURANCE_NONE, mode: null, limits: ["no verified signature"], instrument: {}, policyPen: null };
  }

  const attestation = manifest.attestation;
  const mode = attestation && attestation.mode;
  const limits = [];

  if (trustStatus !== "trusted") {
    limits.push(
      "the signing key chains to no trusted authority, so anyone -- including " +
      "whoever produced the file -- could have generated it"
    );
    return { level: ASSURANCE_SELF, mode: mode || null, limits, instrument: {}, policyPen: null };
  }

  const policies = (certificates[0] && certificates[0].policies) || [];
  const { kind, pen } = classifyPolicies(policies);
  let level = ASSURANCE_INSTRUMENT;
  if (kind !== "instrument") {
    level = ASSURANCE_CUSTODIAL;
    limits.push(
      kind === "custodial"
        ? "the certificate declares a custodial key: software- or facility-held, not inside the instrument"
        : "the certificate makes no instrument-attestation claim, so the key may be software-held; whoever holds it can sign anything"
    );
  }
  // An arc nobody has registered names a claim that is not globally unique. It
  // does not weaken the chain -- authority comes from the root, not the OID --
  // but it must never pass silently as though it were a real one.
  const provisional = describePen(pen);
  if (provisional) limits.push(provisional);

  if (!attestation || typeof attestation !== "object") {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push("the manifest carries no acquisition attestation");
  } else if (!mode) {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push("the attestation does not state an acquisition mode");
  } else if (!(mode in ACQUISITION_MODES)) {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push(`unrecognised acquisition mode "${mode}"`);
  } else if (mode !== MODE_PHYSICAL) {
    level = weakest(level, ASSURANCE_CUSTODIAL);
    limits.push(
      `the detector attests this frame was produced in "${mode}" mode ` +
      `(${ACQUISITION_MODES[mode]}) -- it is not a measurement`
    );
  }

  const instrument = {};
  if (attestation) {
    for (const f of ["model", "serial", "firmware", "sensor", "detector_time"]) {
      if (attestation[f]) instrument[f] = attestation[f];
    }
  }
  return { level, mode: mode || null, limits, instrument, policyPen: pen };
}
