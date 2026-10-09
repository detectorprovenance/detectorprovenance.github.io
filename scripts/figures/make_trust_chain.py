"""Generate the trust-chain figure for the Signing and Verification page.

Writes a light and a dark variant, which the page swaps with the
dp-light-only / dp-dark-only classes (see style.css):

    python3 scripts/figures/make_trust_chain.py

The boxes are saturated with white text in both variants; only the
stripe labels, arrows and annotations change between themes.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "assets", "figures"))

W, H = 940, 660
FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

# Box gradients (Open Color shades 7 to 9), shared by both themes.
BOXES = {
    "cyan": ("#0c8599", "#0b7285"),
    "violet": ("#7048e8", "#5f3dc4"),
    "indigo": ("#4263eb", "#364fc7"),
    "blue": ("#1c7ed6", "#1864ab"),
    "green": ("#2f9e44", "#24753a"),
}

THEMES = {
    "light": {
        "violet": "#7048e8", "indigo": "#4263eb", "green": "#2f9e44",
        "muted": "#495057", "arrow": "#868e96",
        "tint": 0.07, "edge": 0.35,
    },
    "dark": {
        "violet": "#9775fa", "indigo": "#748ffc", "green": "#69db7c",
        "muted": "#ced4da", "arrow": "#adb5bd",
        "tint": 0.12, "edge": 0.45,
    },
}

# Layout: two stripes on the left (detector above, manufacturer below)
# and one tall stripe on the right (the verifier).
COL_A, COL_B, BOX_W, BOX_H = 30, 350, 280, 172
ROW_TOP, ROW_BOT = 68, 388
VER_X, VER_Y, VER_W, VER_H = 678, 110, 234, 410


def icon(kind, cx, cy, fill):
    s = 'fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "frames":
        return (
            f'<rect x="{cx-6}" y="{cy-18}" width="24" height="19" rx="3" {s}/>'
            f'<rect x="{cx-11}" y="{cy-12}" width="24" height="19" rx="3" fill="{fill}" stroke="#fff" stroke-width="2.6"/>'
            f'<rect x="{cx-16}" y="{cy-6}" width="24" height="19" rx="3" fill="#fff" fill-opacity="0.3" stroke="#fff" stroke-width="2.6"/>'
        )
    if kind == "chip":
        pins = "".join(
            f'<path d="M{cx+d},{cy-13} v-6 M{cx+d},{cy+13} v6 M{cx-13},{cy+d} h-6 M{cx+13},{cy+d} h6" {s}/>'
            for d in (-7, 0, 7)
        )
        return (
            f'<rect x="{cx-13}" y="{cy-13}" width="26" height="26" rx="4" {s}/>'
            f'<rect x="{cx-5}" y="{cy-5}" width="10" height="10" rx="1.5" fill="#fff"/>' + pins
        )
    if kind == "shield":
        return (
            f'<path d="M{cx},{cy-18} L{cx+15},{cy-12} V{cy+1} C{cx+15},{cy+10} {cx+8},{cy+16} {cx},{cy+19} '
            f'C{cx-8},{cy+16} {cx-15},{cy+10} {cx-15},{cy+1} V{cy-12} Z" {s}/>'
            f'<path d="M{cx-6},{cy+1} L{cx-1},{cy+6} L{cx+7},{cy-4}" {s}/>'
        )
    if kind == "certificate":
        return (
            f'<rect x="{cx-16}" y="{cy-18}" width="26" height="32" rx="3" {s}/>'
            f'<path d="M{cx-10},{cy-9} h14 M{cx-10},{cy-2} h10" {s}/>'
            f'<circle cx="{cx+10}" cy="{cy+9}" r="7" fill="{fill}" stroke="#fff" stroke-width="2.6"/>'
            f'<path d="M{cx+6},{cy+15} l-2,6 M{cx+14},{cy+15} l2,6" {s}/>'
        )
    if kind == "verify":
        return (
            f'<circle cx="{cx-4}" cy="{cy-4}" r="13" {s}/>'
            f'<path d="M{cx+6},{cy+6} L{cx+16},{cy+16}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>'
            f'<path d="M{cx-10},{cy-4} L{cx-6},{cy+1} L{cx+2},{cy-9}" {s}/>'
        )
    raise ValueError(kind)


def box(x, y, w, h, grad, kind, title, lines):
    cx = x + w / 2
    out = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="url(#g-{grad})" filter="url(#shadow)"/>',
        icon(kind, cx, y + 40, BOXES[grad][1]),
        f'<text x="{cx}" y="{y + 94}" text-anchor="middle" font-size="28" font-weight="700" fill="#fff">{title}</text>',
    ]
    for i, line in enumerate(lines):
        out.append(
            f'<text x="{cx}" y="{y + 126 + 26 * i}" text-anchor="middle" font-size="20" fill="#fff" fill-opacity="0.92">{line}</text>'
        )
    return "\n".join(out)


def stripe(x, y, w, h, color, t, label, note):
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{color}" fill-opacity="{t["tint"]}" '
        f'stroke="{color}" stroke-opacity="{t["edge"]}" stroke-width="1.5"/>'
        f'<text x="{x + 20}" y="{y + 36}" font-size="18" font-weight="700" letter-spacing="1.6" fill="{color}">{label}'
        f'<tspan font-weight="400" letter-spacing="0" fill="{t["muted"]}" dx="10">{note}</tspan></text>'
    )


def arrow(d, t, dashed=False):
    dash = ' stroke-dasharray="9 7"' if dashed else ""
    return (
        f'<path d="{d}" fill="none" stroke="{t["arrow"]}" stroke-width="3" '
        f'stroke-linecap="round" stroke-linejoin="round"{dash} marker-end="url(#head)"/>'
    )


def build(theme):
    t = THEMES[theme]
    grads = "".join(
        f'<linearGradient id="g-{k}" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
        for k, (a, b) in BOXES.items()
    )
    defs = (
        f"<defs>{grads}"
        '<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">'
        '<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.18"/></filter>'
        '<marker id="head" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" '
        f'markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L11,6 L1,11 Z" fill="{t["arrow"]}"/></marker>'
        "</defs>"
    )
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
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="{FONT}" '
        f'role="img" aria-label="Trust chain for signed detector data">\n'
        + defs + "\n" + "\n".join(body) + "\n</svg>\n"
    )


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for theme in THEMES:
        path = os.path.join(OUT, f"trust-chain-{theme}.svg")
        with open(path, "w") as f:
            f.write(build(theme))
        print("wrote", path)
