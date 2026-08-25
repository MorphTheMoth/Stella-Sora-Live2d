#!/usr/bin/env python3
"""Mock renderer mirroring js/main.js parallax math for disc 4012, compared to 4012_B."""
import json, sys, math
from PIL import Image
import numpy as np

ID = sys.argv[1] if len(sys.argv) > 1 else "4012"
S = 1080 / (2 * 100 * math.tan(math.pi / 6))  # 9.3528 px per world unit
D = 100.0

scene = json.load(open("data/discparallax.json"))[ID]
layers = scene["layers"]

def euler_from(rx, ry, rz):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    return cx, sx, cy, sy, cz, sz

def rot_static(p, rx, ry, rz):
    x, y, z = p
    cx, sx, cy, sy, cz, sz = euler_from(rx, ry, rz)
    y, z = y*cx - z*sx, y*sx + z*cz          # R_x
    x, z = x*cy + z*sy, -x*sy + z*cz         # R_y
    x, y = x*cz - y*sz, x*sz + y*cz          # R_z
    return (x, y, z)

def project(xw, yw, zw):
    x = xw / S; y = -yw / S
    k = D / (D + zw / S)
    return (x * k * S, -y * k * S)  # canvas y-down relative to card centre

CARD = 712
out = Image.new("RGBA", (CARD, CARD), (0, 0, 0, 0))

for l in layers:
    tex = Image.open("chars/%s/%s_p/overlays/%s.png" % (ID, ID, l["file"])).convert("RGBA")
    zw = l.get("z", 0) / S
    rx, ry, rz = l.get("rx", 0), l.get("ry", 0), l.get("rz", 0)
    corners = l.get("corners")
    N = 24
    if corners:
        # bilinear grid through corners (local canvas px, y-up), static rot, project
        BL, TL, TR, BR = corners
        def P(uu, vv):
            tx = TL[0]+(TR[0]-TL[0])*uu; ty = TL[1]+(TR[1]-TL[1])*uu; tz = (TL[2] or 0)+((TR[2] or 0)-(TL[2] or 0))*uu
            bx = BL[0]+(BR[0]-BL[0])*uu; by = BL[1]+(BR[1]-BL[1])*uu; bz = (BL[2] or 0)+((BR[2] or 0)-(BL[2] or 0))*uu
            lx = bx+(tx-bx)*vv; ly = by+(ty-by)*vv; lz = bz+(tz-bz)*vv
            wx, wy, wz = rot_static((lx, ly, lz), rx, ry, rz)
            # wx,wz canvas px; wy is Unity y-up -> convert to canvas y-down (l.y - wy)
            return project(l["x"]+wx, l["y"]-wy, l["z"]+wz)
        # build mesh: for each cell, output bbox in screen px, input quad in tex px
        tw, th = tex.size
        mesh = []
        for i in range(N):
            for j in range(N):
                u0, u1 = i/N, (i+1)/N
                v0, v1 = j/N, (j+1)/N
                # screen positions of cell corners (u: left->right, v: top->bottom)
                p00 = P(u0, 1-v0); p10 = P(u1, 1-v0); p01 = P(u0, 1-v1); p11 = P(u1, 1-v1)
                xs = [p00[0]+356,p10[0]+356,p01[0]+356,p11[0]+356]; yscr = [p00[1]+356,p10[1]+356,p01[1]+356,p11[1]+356]
                x0, x1 = min(xs), max(xs); y0, y1 = min(yscr), max(yscr)
                if x1-x0 < 0.5 or y1-y0 < 0.5: continue
                # input quad in tex px (u right, v down): (x0,y0),(x1,y0),(x1,y1),(x0,y1) -> PIL QUAD wants NW,SW,SE,NE
                qx0, qx1 = u0*tw, u1*tw
                qy0, qy1 = v0*th, v1*th
                quad = (qx0,qy0, qx0,qy1, qx1,qy1, qx1,qy0)
                mesh.append(((int(x0),int(y0),int(math.ceil(x1)),int(math.ceil(y1))), quad))
        if mesh:
            warped = tex.transform((CARD, CARD), Image.MESH, mesh, Image.BILINEAR)
            out.alpha_composite(warped)
    else:
        cx, cy = project(l["x"], l["y"], zw)
        # corners of rect through static rot (z=0 local)
        hw, hh = l["w"]/2, l["h"]/2
        pts = [rot_static((dx,dy,0), rx, ry, rz) for dx,dy in [(-hw,-hh),(hw,-hh),(hw,hh),(-hw,hh)]]
        scr = [project(l["x"]+p[0], l["y"]-p[1], l["z"]+p[2]) for p in pts]
        xs = [p[0] for p in scr]; ys = [p[1] for p in scr]
        x0, x1 = min(xs)+CARD/2, max(xs)+CARD/2; y0, y1 = min(ys)+CARD/2, max(ys)+CARD/2
        w = x1-x0; h = y1-y0
        if w < 0.5 or h < 0.5: continue
        quad = (0,0, 0,tex.size[1], tex.size[0],tex.size[1], tex.size[0],0)
        warped = tex.transform((int(w), int(h)), Image.QUAD, quad, Image.BILINEAR)
        out.alpha_composite(warped, (int(x0), int(y0)))

out.save("/tmp/mock_%s.png" % ID)

# compare with B
b = Image.open(".dump_tmp/discoverlays/texpng/disc_%s/assets/assetbundles/disc/%s/%s_B.png" % (ID, ID, ID)).convert("RGB")
bc = b.crop((409,59,1991,1641)).resize((CARD,CARD), Image.LANCZOS)
comp = Image.new("RGB",(CARD*2+12,CARD),(30,30,30))
comp.paste(bc,(0,0)); comp.paste(out.convert("RGB"),(CARD+12,0))
comp.save("/tmp/mock_%s_cmp.png" % ID)
print("saved /tmp/mock_%s_cmp.png (left=B, right=mock)" % ID)
