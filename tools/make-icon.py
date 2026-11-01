"""Draws the Crate Bridge logo as PNGs for an .iconset (no dependencies). Usage: make-icon.py <iconset dir>"""
import math, struct, sys, zlib, os

def png(path, size, px):
    raw = b''.join(b'\x00' + bytes(px[y * size * 4:(y + 1) * size * 4]) for y in range(size))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def render(size):
    s = 32 / size  # work in the 32-unit logo space
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            u, v = (x + .5) * s, (y + .5) * s
            # rounded square, radius 9 (of 32)
            qx, qy = abs(u - 16) - 7, abs(v - 16) - 7
            d = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - 9
            a = max(0, min(1, .5 - d / s))
            if a <= 0: continue
            t = (u + v) / 64
            r, g, b = (round(183 + (108 - 183) * t), round(168 + (76 - 168) * t), round(255 + (255 - 255) * t))
            # white mark: arch + two nodes
            m = min(seg(u, v, 7, 18, 7, 21), seg(u, v, 25, 18, 25, 21), abs(math.hypot(u - 16, v - 18) - 9) if v <= 18 else 99) - 1
            m = min(m, math.hypot(u - 7, v - 22) - 2.2, math.hypot(u - 25, v - 22) - 2.2)
            w = max(0, min(1, .5 - m / s))
            i = (y * size + x) * 4
            out[i:i + 4] = bytes((round(r + (255 - r) * w), round(g + (255 - g) * w), round(b + (255 - b) * w), round(a * 255)))
    return out

d = sys.argv[1]; os.makedirs(d, exist_ok=True)
cache = {}
for base in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        n = base * scale
        cache.setdefault(n, render(n))
        png(os.path.join(d, f'icon_{base}x{base}{"@2x" if scale == 2 else ""}.png'), n, cache[n])
