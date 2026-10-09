/**
 * Object identifiers, and the one number that has to be registered.
 *
 * Mirrors src/framesig/oids.py. Kept in its own file for the same reason: the
 * arc is the single value that changes when the project gets a real IANA
 * Private Enterprise Number, and it should change in exactly one place per
 * implementation.
 *
 * **An unregistered OID that later collides is worse than no OID at all**, and
 * this project proved it the hard way: the first implementation used
 * `1.3.6.1.4.1.62630` as a placeholder, which turns out to be registered to
 * White Castle. The placeholder is now `1.3.6.1.4.1.32473`, which RFC 5612
 * reserves permanently for documentation -- it cannot collide with anyone
 * because it is nobody's, and a verifier reports its use rather than letting it
 * pass as a real namespace.
 */

/** RFC 5612: reserved permanently for documentation and examples. */
export const DOCUMENTATION_PEN = 32473;

/** Change this one number after registration, and nothing else. */
export const ACTIVE_PEN = DOCUMENTATION_PEN;

/**
 * Arcs a verifier accepts. During a migration this holds the new number *and*
 * the old one, so certificates already in the field keep working.
 */
export const RECOGNISED_PENS = [ACTIVE_PEN];

export const IANA_APPLY_URL =
  "https://www.iana.org/assignments/enterprise-numbers/assignment/apply/";

export const PROVISIONAL_WARNING =
  "the certificate's policy OID is under the RFC 5612 documentation arc " +
  `(1.3.6.1.4.1.${DOCUMENTATION_PEN}), which is reserved for examples and is not a ` +
  "registered namespace; a production deployment needs its own IANA Private " +
  "Enterprise Number";

export function arc(pen = ACTIVE_PEN) {
  return `1.3.6.1.4.1.${pen}.1`;
}

export function instrumentAttestationOid(pen = ACTIVE_PEN) {
  return `${arc(pen)}.1.1`;
}

export function custodialOid(pen = ACTIVE_PEN) {
  return `${arc(pen)}.1.2`;
}

export function isProvisional(pen) {
  return pen === DOCUMENTATION_PEN;
}

/**
 * Map a certificate's policy OIDs to `{kind, pen}`.
 *
 * Only arcs in RECOGNISED_PENS are honoured: an OID that merely *looks* like a
 * framesig policy but sits under somebody else's enterprise number means
 * nothing here, and treating it as equivalent is how namespaces get squatted.
 */
export function classifyPolicies(policyOids) {
  const policies = new Set(policyOids);
  for (const pen of RECOGNISED_PENS) {
    if (policies.has(instrumentAttestationOid(pen))) return { kind: "instrument", pen };
  }
  for (const pen of RECOGNISED_PENS) {
    if (policies.has(custodialOid(pen))) return { kind: "custodial", pen };
  }
  return { kind: null, pen: null };
}

export function describePen(pen) {
  return pen !== null && isProvisional(pen) ? PROVISIONAL_WARNING : null;
}
