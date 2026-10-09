"""Shared style for the site figures: palette, icons, boxes, arrows.

Every figure is written twice, as <name>-light.svg and <name>-dark.svg,
and the page swaps them with the dp-light-only / dp-dark-only classes
(see style.css). Boxes are saturated with white text in both variants;
stripe labels, arrows, annotations and neutral fills change per theme.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "assets", "figures"))

FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

# Box gradients (Open Color shades 7 to 9), shared by both themes.
BOXES = {
    "cyan": ("#0c8599", "#0b7285"),
    "violet": ("#7048e8", "#5f3dc4"),
    "indigo": ("#4263eb", "#364fc7"),
    "blue": ("#1c7ed6", "#1864ab"),
    "green": ("#2f9e44", "#24753a"),
    "gray": ("#868e96", "#5c636a"),
}

THEMES = {
    "light": {
        "violet": "#7048e8", "indigo": "#4263eb", "green": "#2f9e44",
        "cyan": "#0c8599", "red": "#e03131", "amber": "#f59f00", "yellow": "#fab005",
        "muted": "#495057", "arrow": "#868e96", "text": "#212529",
        "node": "#e9ecef", "node_edge": "#adb5bd",
        "chip": "#ffffff", "chip_edge": "#ced4da",
        "tint": 0.07, "edge": 0.35,
    },
    "dark": {
        "violet": "#9775fa", "indigo": "#748ffc", "green": "#69db7c",
        "cyan": "#3bc9db", "red": "#ff1e1e", "amber": "#fcc419", "yellow": "#ffd43b",
        "muted": "#ced4da", "arrow": "#adb5bd", "text": "#f1f3f5",
        "node": "#343a40", "node_edge": "#6c757d",
        "chip": "#2b2f33", "chip_edge": "#495057",
        "tint": 0.12, "edge": 0.45,
    },
}

STROKE = 'fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'


def icon(kind, cx, cy, fill):
    s = STROKE
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
    if kind == "sensor":
        # pixel array: a 3 x 3 grid with one lit pixel
        cells = "".join(
            f'<rect x="{cx-15+i*11}" y="{cy-15+j*11}" width="8" height="8" rx="1.5" '
            + ('fill="#fff"' if (i, j) == (1, 1) else 'fill="none" stroke="#fff" stroke-width="2"')
            + "/>"
            for i in range(3) for j in range(3)
        )
        return cells
    if kind == "fpga":
        # hash mark inside a board outline
        return (
            f'<rect x="{cx-16}" y="{cy-14}" width="32" height="28" rx="4" {s}/>'
            f'<path d="M{cx-5},{cy-8} l-2,16 M{cx+5},{cy-8} l-2,16 M{cx-10},{cy-3} h19 M{cx-11},{cy+4} h19" {s}/>'
        )
    if kind == "package":
        return (
            f'<path d="M{cx},{cy-17} L{cx+15},{cy-9} V{cy+9} L{cx},{cy+17} L{cx-15},{cy+9} V{cy-9} Z" {s}/>'
            f'<path d="M{cx-15},{cy-9} L{cx},{cy-1} L{cx+15},{cy-9} M{cx},{cy-1} V{cy+17}" {s}/>'
        )
    raise ValueError(kind)


def check(x, y, color="#fff", size=1.0, width=2.6):
    """A check mark whose left end sits at (x, y)."""
    return (
        f'<path d="M{x},{y} l{5*size},{5*size} l{9*size},{-10*size}" fill="none" stroke="{color}" '
        f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def blocked(cx, cy, color, r=13):
    """A no-entry mark: a ring with a diagonal bar."""
    d = r * 0.7071
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="3"/>'
        f'<path d="M{cx-d},{cy+d} L{cx+d},{cy-d}" stroke="{color}" stroke-width="3" stroke-linecap="round"/>'
    )


def text(x, y, s, size=20, weight=400, fill="#fff", anchor="middle", extra=""):
    w = f' font-weight="{weight}"' if weight != 400 else ""
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}"{w} fill="{fill}"{extra}>{s}</text>'


def box(x, y, w, h, grad, kind, title, lines, title_size=28, line_size=20,
        icon_dy=40, title_dy=94, line_dy=126, line_step=26):
    cx = x + w / 2
    out = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="url(#g-{grad})" filter="url(#shadow)"/>',
    ]
    if kind:
        out.append(icon(kind, cx, y + icon_dy, BOXES[grad][1]))
    out.append(
        f'<text x="{cx}" y="{y + title_dy}" text-anchor="middle" font-size="{title_size}" font-weight="700" fill="#fff">{title}</text>'
    )
    for i, line in enumerate(lines):
        out.append(
            f'<text x="{cx}" y="{y + line_dy + line_step * i}" text-anchor="middle" font-size="{line_size}" fill="#fff" fill-opacity="0.92">{line}</text>'
        )
    return "\n".join(out)


def stripe(x, y, w, h, color, t, label, note=""):
    tail = (
        f'<tspan font-weight="400" letter-spacing="0" fill="{t["muted"]}" dx="10">{note}</tspan>'
        if note else ""
    )
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{color}" fill-opacity="{t["tint"]}" '
        f'stroke="{color}" stroke-opacity="{t["edge"]}" stroke-width="1.5"/>'
        f'<text x="{x + 20}" y="{y + 36}" font-size="18" font-weight="700" letter-spacing="1.6" fill="{color}">{label}'
        f"{tail}</text>"
    )


def arrow(d, t, dashed=False, color=None, head=True, width=3):
    dash = ' stroke-dasharray="9 7"' if dashed else ""
    end = ' marker-end="url(#head)"' if head else ""
    return (
        f'<path d="{d}" fill="none" stroke="{color or t["arrow"]}" stroke-width="{width}" '
        f'stroke-linecap="round" stroke-linejoin="round"{dash}{end}/>'
    )


def defs(t):
    grads = "".join(
        f'<linearGradient id="g-{k}" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
        for k, (a, b) in BOXES.items()
    )
    return (
        f"<defs>{grads}"
        '<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">'
        '<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.18"/></filter>'
        '<marker id="head" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" '
        f'markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L11,6 L1,11 Z" fill="{t["arrow"]}"/></marker>'
        "</defs>"
    )


def svg(w, h, label, t, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="{FONT}" '
        f'role="img" aria-label="{label}">\n'
        + defs(t) + "\n" + "\n".join(body) + "\n</svg>\n"
    )


def write_pair(name, build):
    """build(t) -> svg string, called once per theme."""
    os.makedirs(OUT, exist_ok=True)
    for theme, t in THEMES.items():
        path = os.path.join(OUT, f"{name}-{theme}.svg")
        with open(path, "w") as f:
            f.write(build(t))
        print("wrote", path)
