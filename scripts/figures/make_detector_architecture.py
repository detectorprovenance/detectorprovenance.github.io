"""Detector-architecture figure for the Manufacturer Requirements page:
the readout path is the only route to the signing key.

    python3 scripts/figures/make_detector_architecture.py
"""

from figstyle import arrow, blocked, box, stripe, svg, text, write_pair

W, H = 960, 520
BOX_W, BOX_H, ROW_Y = 200, 130, 118
COLS = [46, 280, 514]
IFACE_W, IFACE_Y, IFACE_H = 152, 362, 100
IFACE_X = [46, 218, 390, 562]
IFACES = [("Control", "interface"), ("File", "writer"), ("Service and", "debug"), ("Firmware", "update")]


def build(t):
    small = dict(title_size=24, line_size=19, icon_dy=34, title_dy=82, line_dy=112)
    mid = ROW_Y + BOX_H / 2
    body = [
        stripe(10, 10, 740, 500, t["indigo"], t, "DETECTOR", "electronics"),
        stripe(28, 64, 704, 200, t["violet"], t, "READOUT PATH", "the only route to the signing key"),
        box(COLS[0], ROW_Y, BOX_W, BOX_H, "cyan", "sensor", "Sensor", ["records each frame"], **small),
        box(COLS[1], ROW_Y, BOX_W, BOX_H, "blue", "fpga", "FPGA", ["computes digests"], **small),
        box(COLS[2], ROW_Y, BOX_W, BOX_H, "violet", "chip", "Secure element", ["signs the run"], **small),
        box(770, ROW_Y, 180, BOX_H, "green", "package", "Signed run", ["sent to storage"], **small),
        arrow(f"M{COLS[0] + BOX_W + 4},{mid} H{COLS[1] - 4}", t),
        arrow(f"M{COLS[1] + BOX_W + 4},{mid} H{COLS[2] - 4}", t),
        arrow(f"M{COLS[2] + BOX_W + 4},{mid} H{770 - 4}", t),
    ]
    for x, (a, b) in zip(IFACE_X, IFACES):
        cx = x + IFACE_W / 2
        body.append(
            f'<rect x="{x}" y="{IFACE_Y}" width="{IFACE_W}" height="{IFACE_H}" rx="14" '
            f'fill="url(#g-gray)" filter="url(#shadow)"/>'
        )
        body.append(text(cx, IFACE_Y + 44, a, size=20, weight=700))
        body.append(text(cx, IFACE_Y + 70, b, size=20, weight=700))
        body.append(arrow(f"M{cx},{IFACE_Y - 4} V302", t, dashed=True, color=t["red"], head=False))
        body.append(blocked(cx, 286, t["red"]))
    # legend
    body.append(blocked(792, 404, t["red"]))
    body.append(text(816, 400, "no access to", size=18, fill=t["text"], anchor="start"))
    body.append(text(816, 424, "the signing key", size=18, fill=t["text"], anchor="start"))
    return svg(W, H, "Detector electronics in which only the readout path can reach the signing key", t, body)


if __name__ == "__main__":
    write_pair("detector-architecture", build)
