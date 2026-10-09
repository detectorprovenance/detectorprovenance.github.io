/**
 * SPEC §3 -- digests, domain separation, and Merkle proof replay.
 */

import { concat, equalBytes, fromHex, toHex, utf8 } from "./bytes.js";

/**
 * SPEC §3: signature pre-images `framesig/1 <NUL> manifest <NUL>` and
 * `framesig/1 <NUL> series <NUL>`.
 *
 * Built from parts rather than written as a string literal containing NUL.
 * A literal NUL in source is legal JavaScript and works, but it is invisible
 * in most editors and one copy-paste through a tool that normalises control
 * characters silently turns it into a space -- after which every signature
 * fails and the symptom looks like a wrong key. Not worth the risk.
 */
const NUL = new Uint8Array([0x00]);
export const DOMAIN_MANIFEST = concat(utf8("framesig/1"), NUL, utf8("manifest"), NUL);
export const DOMAIN_SERIES = concat(utf8("framesig/1"), NUL, utf8("series"), NUL);

/** SPEC §7: Merkle domain separation. */
const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

export async function sha256(...parts) {
  const buf = await crypto.subtle.digest("SHA-256", concat(...parts));
  return new Uint8Array(buf);
}

/** SPEC §3: digests are written `"sha256:" + lowercase hex`. */
export async function sha256Label(...parts) {
  return "sha256:" + toHex(await sha256(...parts));
}

export function stripLabel(labelled) {
  const s = String(labelled ?? "");
  return s.startsWith("sha256:") ? s.slice(7) : s;
}

export async function merkleLeaf(manifestBytes) {
  return sha256(LEAF_PREFIX, manifestBytes);
}

async function merkleNode(left, right) {
  return sha256(NODE_PREFIX, left, right);
}

/**
 * SPEC §7: replay an inclusion proof.
 *
 * SPEC-GAP 1: the spec shows proof steps as `{side, hash}` but never says what
 * `side` names. Two readings are possible -- the side the *sibling* sits on,
 * or the side the *current node* sits on -- and they are exact opposites, so a
 * verifier that guesses wrong fails every proof of depth >= 1 with no clue why.
 * Taken here as **the side the sibling sits on**: `side === "left"` means the
 * sibling is the left child, so the parent is H(0x01 ‖ sibling ‖ current).
 *
 * SPEC-GAP 2: the spec says an odd node is "promoted unchanged" but never says
 * how a proof represents a level at which a node has no sibling. What falls out
 * of promotion is: emit no step at all, and replay simply skips that level.
 */
export async function merkleVerify(leaf, index, proof, root) {
  let current = leaf;
  for (const step of proof) {
    if (!step || (step.side !== "left" && step.side !== "right")) {
      throw new Error("malformed Merkle proof step");
    }
    const sibling = fromHex(step.hash);
    current =
      step.side === "left"
        ? await merkleNode(sibling, current)
        : await merkleNode(current, sibling);
  }
  return equalBytes(current, root);
}
