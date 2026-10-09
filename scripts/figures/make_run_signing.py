"""Run-signing figure for the Signing and Verification page: a Merkle tree
over one run with the proof for one frame highlighted, and a schematic
timeline comparing per-frame and per-run signing.

    python3 scripts/figures/make_run_signing.py
"""

from figstyle import BOXES, arrow, box, stripe, svg, text, write_pair

W, H = 940, 715
N = 8
LEAF_X = [70 + 78 * i for i in range(N)]
HIGHLIGHT = 2  # frame 3
NODE_W, NODE_H = 44, 30
Y_LEAF, Y_L1, Y_L2, Y_ROOT = 251, 180, 124, 68


def node(cx, cy, fill, edge, width=1.5):
    return (
        f'<rect x="{cx - NODE_W / 2}" y="{cy - NODE_H / 2}" width="{NODE_W}" height="{NODE_H}" rx="7" '
        f'fill="{fill}" stroke="{edge}" stroke-width="{width}"/>'
    )


def frame_tile(cx, top, ring=None):
    out = []
    if ring:
        out.append(f'<rect x="{cx - 33}" y="{top - 6}" width="66" height="66" rx="12" fill="none" '
                   f'stroke="{ring}" stroke-width="3"/>')
    out.append(f'<rect x="{cx - 27}" y="{top}" width="54" height="54" rx="8" fill="url(#g-cyan)"/>')
    cy = top + 27
    out.append(f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="#fff"/>')
    for dx, dy in ((14, 0), (7, 12), (-7, 12), (-14, 0), (-7, -12), (7, -12)):
        out.append(f'<circle cx="{cx + dx}" cy="{cy + dy}" r="2.6" fill="#fff" fill-opacity="0.85"/>')
    return "".join(out)


def build(t):
    plain, plain_edge = t["node"], t["node_edge"]
    path_c, proof_c = t["cyan"], t["amber"]

    # tree levels as lists of x centres
    l1 = [(LEAF_X[2 * i] + LEAF_X[2 * i + 1]) / 2 for i in range(4)]
    l2 = [(l1[2 * i] + l1[2 * i + 1]) / 2 for i in range(2)]
    root = (l2[0] + l2[1]) / 2
    on_path = {("leaf", 2), ("l1", 1), ("l2", 0)}
    in_proof = {("leaf", 3), ("l1", 0), ("l2", 1)}

    def style(level, i):
        if (level, i) in on_path:
            return path_c, path_c
        if (level, i) in in_proof:
            return proof_c, proof_c
        return plain, plain_edge

    def edge(x1, y1, x2, y2, hot):
        c = path_c if hot else plain_edge
        w = 3.5 if hot else 2
        return f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>'

    body = [stripe(10, 10, 920, 395, t["violet"], t, "ONE RUN", "a Merkle tree over the frame digests")]
    edges, nodes = [], []
    for i, x in enumerate(LEAF_X):
        edges.append(edge(x, 300, x, Y_LEAF + NODE_H / 2, i == HIGHLIGHT))
        edges.append(edge(x, Y_LEAF - NODE_H / 2, l1[i // 2], Y_L1 + NODE_H / 2, i == HIGHLIGHT))
        nodes.append(node(x, Y_LEAF, *style("leaf", i)))
        nodes.append(frame_tile(x, 306, ring=path_c if i == HIGHLIGHT else None))
        nodes.append(text(x, 392, str(i + 1), size=17, weight=700 if i == HIGHLIGHT else 400,
                          fill=path_c if i == HIGHLIGHT else t["muted"]))
    for i, x in enumerate(l1):
        edges.append(edge(x, Y_L1 - NODE_H / 2, l2[i // 2], Y_L2 + NODE_H / 2, i == 1))
        nodes.append(node(x, Y_L1, *style("l1", i)))
    for i, x in enumerate(l2):
        edges.append(edge(x, Y_L2 - NODE_H / 2, root, Y_ROOT + NODE_H / 2, i == 0))
        nodes.append(node(x, Y_L2, *style("l2", i)))
    nodes.append(
        f'<rect x="{root - 34}" y="{Y_ROOT - 18}" width="68" height="36" rx="9" fill="url(#g-violet)" filter="url(#shadow)"/>'
        + text(root, Y_ROOT + 6, "root", size=17, weight=700)
    )
    body += edges + nodes

    # root -> secure element
    se_x, se_y, se_w, se_h = 690, 40, 220, 160
    body.append(arrow(f"M{root + 38},{Y_ROOT} H{se_x - 4}", t))
    body.append(box(se_x, se_y, se_w, se_h, "violet", "chip", "Secure element",
                    ["signs the root", "once per run"], title_size=25, line_size=19,
                    icon_dy=36, title_dy=86, line_dy=116, line_step=24))

    # legend
    for i, (c, label) in enumerate(((path_c, "path of frame 3"), (proof_c, "proof stored with"),
                                    (None, "frame 3"))):
        y = 262 + 28 * i
        if c:
            body.append(f'<rect x="{se_x + 4}" y="{y - 15}" width="20" height="20" rx="5" fill="{c}"/>')
        body.append(text(se_x + 36, y, label, size=18, fill=t["text"], anchor="start"))

    # timeline
    body.append(stripe(10, 425, 920, 280, t["indigo"], t, "TIMING", "schematic"))
    x0, dx = 300, 26
    # one signature per frame: each slow signature delays the next
    body.append(text(30, 500, "One signature per frame", size=20, weight=700, fill=t["text"], anchor="start"))
    body.append(text(30, 526, "signing falls behind", size=18, fill=t["muted"], anchor="start",
                     extra=' font-style="italic"'))
    for k in range(24):
        body.append(f'<rect x="{x0 + dx * k}" y="478" width="10" height="24" rx="3" fill="url(#g-cyan)"/>')
    for k in range(5):
        bx = x0 + 124 * k
        body.append(f'<path d="M{x0 + dx * k + 5},504 L{bx + 6},532" stroke="{t["arrow"]}" stroke-width="1.6" '
                    f'stroke-dasharray="4 4"/>')
        body.append(f'<rect x="{bx}" y="534" width="118" height="28" rx="6" fill="url(#g-violet)"/>')
        body.append(text(bx + 59, 554, "sign", size=16, weight=700))
    # one signature per run: digests keep pace, one signature at the end
    body.append(text(30, 612, "One signature per run", size=20, weight=700, fill=t["text"], anchor="start"))
    body.append(text(30, 638, "digests keep pace", size=18, fill=t["muted"], anchor="start",
                     extra=' font-style="italic"'))
    for k in range(19):
        x = x0 + dx * k
        body.append(f'<rect x="{x}" y="590" width="10" height="24" rx="3" fill="url(#g-cyan)"/>')
        body.append(f'<circle cx="{x + 5}" cy="628" r="4.5" fill="{t["cyan"]}"/>')
    body.append(f'<rect x="{x0 + dx * 19}" y="600" width="128" height="34" rx="7" fill="url(#g-violet)"/>')
    body.append(text(x0 + dx * 19 + 64, 623, "sign root", size=16, weight=700))
    body.append(arrow(f"M{x0},675 H910", t, width=2.5))
    body.append(text(910, 697, "time", size=16, fill=t["muted"], anchor="end", extra=' font-style="italic"'))
    return svg(W, H, "Signing a complete run with one signature over a Merkle tree", t, body)


if __name__ == "__main__":
    write_pair("run-signing", build)
