"""Assurance-ladder figure for the Assurance Levels page.

    python3 scripts/figures/make_assurance_ladder.py
"""

from figstyle import MONO, check, svg, text, write_pair

W, H = 940, 545
COL_W = 205
COLS = [33, 256, 479, 702]
BASE = 470
LIGHT = {"none": ("red", "Unverified"), "self-attested": ("red", "Unverified"),
         "custodial": ("yellow", "Software signed"), "instrument": ("green", "Hardware signed")}

# level, gradient, step height, requirements met, example files (top first)
STEPS = [
    ("none", "gray", 120, [], ["0-unsigned.cbf"]),
    ("self-attested", "cyan", 190, ["valid signature"], ["1-fabricated.cbf"]),
    ("custodial", "indigo", 260, ["valid signature", "trusted chain"],
     ["2-software-signed.cbf", "3-test-pattern.cbf"]),
    ("instrument", "green", 330,
     ["valid signature", "trusted chain", "key in instrument", "physical exposure"],
     ["4-genuine.cbf"]),
]


def build(t):
    body = [
        text(COLS[0], 40, "EXAMPLE FILES", size=16, weight=700, fill=t["muted"], anchor="start",
             extra=' letter-spacing="1.4"'),
    ]
    for x, (level, grad, h, reqs, files) in zip(COLS, STEPS):
        top = BASE - h
        cx = x + COL_W / 2
        body.append(
            f'<rect x="{x}" y="{top}" width="{COL_W}" height="{h}" rx="14" fill="url(#g-{grad})" filter="url(#shadow)"/>'
        )
        body.append(text(cx, top + 42, level, size=25, weight=700))
        if reqs:
            for i, r in enumerate(reqs):
                y = top + 82 + 28 * i
                body.append(check(x + 18, y - 6))
                body.append(text(x + 42, y, r, size=18, anchor="start"))
        else:
            body.append(text(cx, top + 82, "no signature", size=18, extra=' fill-opacity="0.9"'))
        # example files sit on top of the step, nearest file lowest
        for i, name in enumerate(reversed(files)):
            y = top - 46 - 42 * i
            body.append(
                f'<rect x="{x}" y="{y}" width="{COL_W}" height="34" rx="8" fill="{t["chip"]}" '
                f'stroke="{t["chip_edge"]}" stroke-width="1.5"/>'
            )
            body.append(
                f'<text x="{cx}" y="{y + 23}" text-anchor="middle" font-family="{MONO}" font-size="15" '
                f'fill="{t["text"]}">{name}</text>'
            )
        # the light the demonstration shows for this level
        light, label = LIGHT[level]
        mark_y = BASE + 38
        width = 26 + 8 + len(label) * 10.5
        x0 = cx - width / 2
        body.append(f'<circle cx="{x0 + 13}" cy="{mark_y}" r="13" fill="{t[light]}"/>')
        body.append(text(x0 + 34, mark_y + 7, label, size=19, weight=700, fill=t["text"], anchor="start"))
    return svg(W, H, "Assurance levels, from none to instrument, with the example files at each level", t, body)


if __name__ == "__main__":
    write_pair("assurance-ladder", build)
