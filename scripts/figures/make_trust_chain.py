"""Trust-chain figure for the Signing and Verification page.

    python3 scripts/figures/make_trust_chain.py
"""

from figstyle import BOXES, arrow, box, icon, stripe, svg, write_pair

W, H = 940, 660

# Layout: two stripes on the left (detector above, manufacturer below)
# and one tall stripe on the right (the verifier).
COL_A, COL_B, BOX_W, BOX_H = 30, 350, 280, 172
ROW_TOP, ROW_BOT = 68, 388
VER_X, VER_Y, VER_W, VER_H = 678, 110, 234, 410


def build(t):
    vcx = VER_X + VER_W / 2
    pills = "".join(
        f'<rect x="{vcx - 82}" y="{VER_Y + y}" width="164" height="44" rx="22" fill="#fff" fill-opacity="0.18" '
        f'stroke="#fff" stroke-opacity="0.55" stroke-width="1.5"/>'
        f'<text x="{vcx}" y="{VER_Y + y + 29}" text-anchor="middle" font-size="20" font-weight="700" fill="#fff">{label}</text>'
        for y, label in ((262, "Integrity"), (318, "Assurance"))
    )
    verifier = "\n".join([
        f'<rect x="{VER_X}" y="{VER_Y}" width="{VER_W}" height="{VER_H}" rx="16" fill="url(#g-green)" filter="url(#shadow)"/>',
        icon("verify", vcx, VER_Y + 52, BOXES["green"][1]),
        f'<text x="{vcx}" y="{VER_Y + 120}" text-anchor="middle" font-size="28" font-weight="700" fill="#fff">Verifier</text>',
        f'<text x="{vcx}" y="{VER_Y + 154}" text-anchor="middle" font-size="20" fill="#fff" fill-opacity="0.92">checks the signature</text>',
        f'<text x="{vcx}" y="{VER_Y + 180}" text-anchor="middle" font-size="20" fill="#fff" fill-opacity="0.92">and certificate chain</text>',
        f'<text x="{vcx}" y="{VER_Y + 238}" text-anchor="middle" font-size="16" font-weight="700" letter-spacing="1.4" fill="#fff" fill-opacity="0.8">REPORTS</text>',
        pills,
    ])
    top_mid = ROW_TOP + BOX_H / 2
    bot_mid = ROW_BOT + BOX_H / 2
    body = [
        stripe(10, 10, 640, 250, t["violet"], t, "DETECTOR", "during acquisition"),
        stripe(10, 330, 640, 250, t["indigo"], t, "MANUFACTURER", "at manufacture"),
        stripe(660, 10, 270, 570, t["green"], t, "ANYONE", "offline"),
        box(COL_A, ROW_TOP, BOX_W, BOX_H, "cyan", "frames", "Frame digests",
            ["computed for every frame", "as it is written"]),
        box(COL_B, ROW_TOP, BOX_W, BOX_H, "violet", "chip", "Secure element",
            ["signs the Merkle root", "once per run"]),
        box(COL_A, ROW_BOT, BOX_W, BOX_H, "indigo", "shield", "Root CA",
            ["certifies device keys", "through an issuing CA"]),
        box(COL_B, ROW_BOT, BOX_W, BOX_H, "blue", "certificate", "Device certificate",
            ["binds the detector key", "to its serial number"]),
        verifier,
        arrow(f"M{COL_A + BOX_W + 4},{top_mid} H{COL_B - 4}", t),
        arrow(f"M{COL_A + BOX_W + 4},{bot_mid} H{COL_B - 4}", t),
        arrow(f"M{COL_B + BOX_W + 4},{top_mid} H{VER_X - 4}", t),
        arrow(f"M{COL_B + BOX_W / 2},{ROW_BOT - 4} V{ROW_TOP + BOX_H + 4}", t),
        f'<text x="{COL_B + BOX_W / 2 - 14}" y="301" text-anchor="end" font-size="20" font-style="italic" fill="{t["muted"]}">certifies the key</text>',
        arrow(f"M{COL_A + BOX_W / 2},{ROW_BOT + BOX_H + 4} V612 H{vcx} V{VER_Y + VER_H + 4}", t, dashed=True),
        f'<text x="{(COL_A + BOX_W / 2 + vcx) / 2}" y="643" text-anchor="middle" font-size="20" font-style="italic" fill="{t["muted"]}">published root certificate</text>',
    ]
    return svg(W, H, "Trust chain for signed detector data", t, body)


if __name__ == "__main__":
    write_pair("trust-chain", build)
