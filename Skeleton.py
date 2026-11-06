# FILE NAME: skeleton.py
# Reads a video, makes a skeleton video and a data file.
# It follows ONE person (the dancer) and ignores people in the background.
# NEW: a "zoom pass". After finding you once, it zooms in on you and looks again,
# and keeps whichever look the model was more sure about. This helps when you are small,
# low on the floor or upside down.
#   python Skeleton.py myflare.mp4            = with the zoom pass (slower, better)
#   python Skeleton.py myflare.mp4 nozoom     = without it (faster)
import os
import sys
import csv
import time
import cv2
import numpy as np
import onnxruntime as ort
from rtmlib import BodyWithFeet

# Type the video name after the script name
VIDEO_IN = sys.argv[1] if len(sys.argv) > 1 else "sixsteps.mp4"
ZOOM_PASS = not any(a.lower() == "nozoom" for a in sys.argv[2:])
BASE = os.path.splitext(VIDEO_IN)[0]
VIDEO_OUT = BASE + "_rtm_skeleton.mp4"
DATA_OUT = BASE + "_rtm_data.csv"

# Joints the model is less sure about than this get drawn in orange/yellow
CONFIDENCE = 0.5

# "performance" = most accurate, "balanced" = faster, "lightweight" = fastest
MODE = "performance"

# Use the GPU if it's available, otherwise the CPU
if "CUDAExecutionProvider" in ort.get_available_providers():
    DEVICE = "cuda"
else:
    DEVICE = "cpu"
    print("NOTE: GPU version of onnxruntime not found, using the CPU (slower).")

# The model's 26 body points, in order
JOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "head", "neck", "hip_center",
    "left_big_toe", "right_big_toe", "left_small_toe", "right_small_toe",
    "left_heel", "right_heel",
]

CONNECTIONS = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12),
    (11, 13), (13, 15), (12, 14), (14, 16),
    (15, 24), (15, 20), (24, 20),
    (16, 25), (16, 21), (25, 21),
]
DRAW_JOINTS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 21, 24, 25]
LEG_JOINTS = [13, 14, 15, 16, 20, 21, 24, 25]
MAIN_JOINTS = [5, 6, 9, 10, 11, 12, 13, 14, 15, 16]     # used to compare two looks at the same frame

# ---- Who is the dancer? ----
MAX_JUMP = 1.0         # the dancer can't move more than this many body sizes between frames
MIN_SIZE_RATIO = 0.4   # anyone smaller than this share of the dancer's size is someone else
LOST_RESET = 20        # after this many frames without the dancer, look for them again
MIN_FOUND_SHARE = 0.7  # warn if the dancer was followed in fewer frames than this

# ---- The zoom pass ----
ZOOM_SIDE_FACTOR = 2.6     # the zoomed picture is this many "dancer sizes" wide
ZOOM_MIN_SIDE = 256        # but never smaller than this many pixels
ZOOM_INPUT = 640           # the zoomed picture is scaled to this size before the model looks at it
ZOOM_MIN_GAIN = 0.02       # use the zoomed look only if the model is at least this much more sure


def report(done, total, part):
    """Tells the web app how far along we are (0-100). Harmless when you run this by hand."""
    if total <= 0:
        return
    frac = min(1.0, done / total)
    if ZOOM_PASS:
        pct = 50 * frac if part == 1 else 50 + 50 * frac
    else:
        pct = 85 * frac if part == 1 else 85 + 15 * frac
    print(f"PROGRESS {pct:.1f}", flush=True)


def person_box(kp, sc):
    ok = sc > 0.3
    if ok.sum() < 5:
        return None
    pts = kp[ok]
    x0, y0 = pts.min(axis=0)
    x1, y1 = pts.max(axis=0)
    return ((x0 + x1) / 2, (y0 + y1) / 2), float(np.hypot(x1 - x0, y1 - y0))


def pick_person(keypoints, scores, prev, ref_size):
    """Return (index, center, size) of the dancer, or None if we can't find them."""
    cands = []
    for i in range(len(keypoints)):
        pb = person_box(keypoints[i], scores[i])
        if pb is None:
            continue
        cands.append((i, pb[0], pb[1]))
    # once we know how big the dancer is, small people in the background never count
    if ref_size is not None:
        cands = [c for c in cands if c[2] >= MIN_SIZE_RATIO * ref_size]
    if not cands:
        return None
    if prev is None:
        return max(cands, key=lambda c: c[2])          # the biggest person = the dancer
    pc, ps = prev
    limit = MAX_JUMP * max(ps, 0.5 * (ref_size or ps))
    best = min(cands, key=lambda c: np.hypot(c[1][0] - pc[0], c[1][1] - pc[1]))
    dist = np.hypot(best[1][0] - pc[0], best[1][1] - pc[1])
    if dist <= limit:
        return best
    return None                                          # better a gap than the wrong person


def sureness(sc):
    """how sure the model is about the main body joints (0 to 1)"""
    return float(np.mean([sc[i] for i in MAIN_JOINTS])) if sc is not None else 0.0


def smooth(a, win):
    pad = win // 2
    p = np.pad(a, (pad, pad), mode="edge")
    return np.convolve(p, np.ones(win) / win, mode="valid")


def rolling_max(a, half):
    return np.array([a[max(0, i - half): i + half + 1].max() for i in range(len(a))])


print(f"Loading model (mode: {MODE}, device: {DEVICE})...")
body = BodyWithFeet(mode=MODE, backend="onnxruntime", device=DEVICE)

cap = cv2.VideoCapture(VIDEO_IN)
if not cap.isOpened():
    raise SystemExit(f"Could not open {VIDEO_IN}. Is it in this folder?")

fps = cap.get(cv2.CAP_PROP_FPS) or 30
TOTAL_GUESS = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

# ================= PASS 1: find the dancer in the whole picture =================
print("Pass 1: finding you in every frame...")
start = time.time()
kp1, sc1 = [], []              # per frame: (26, 2) and (26,), or None if the dancer wasn't found
centers, sizes = [], []
prev = None
ref_size = None
lost = 0
frame_idx = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    keypoints, scores = body(frame)
    chosen = pick_person(keypoints, scores, prev, ref_size) if len(keypoints) > 0 else None
    if chosen is not None:
        idx, center, size = chosen
        prev = (center, size)
        ref_size = size if ref_size is None else max(ref_size, min(size, 1.3 * ref_size))
        lost = 0
        kp1.append(np.array(keypoints[idx], dtype=float))
        sc1.append(np.array(scores[idx], dtype=float))
        centers.append(center)
        sizes.append(size)
    else:
        lost += 1
        if lost > LOST_RESET:
            prev = None
        kp1.append(None)
        sc1.append(None)
        centers.append((np.nan, np.nan))
        sizes.append(np.nan)
    frame_idx += 1
    if frame_idx % 5 == 0:
        report(frame_idx, TOTAL_GUESS, 1)
    if frame_idx % 50 == 0:
        print(f"  ...{frame_idx} frames done ({time.time() - start:.0f}s)")
cap.release()
n_frames = frame_idx
found1 = sum(1 for k in kp1 if k is not None)
print(f"Pass 1 found the dancer in {found1} of {n_frames} frames ({time.time() - start:.0f}s).")

# ================= the zoom boxes: where to look in pass 2 =================
boxes = None
if ZOOM_PASS and found1 >= 5:
    idxs = np.arange(n_frames)
    cx = np.array([c[0] for c in centers], dtype=float)
    cy = np.array([c[1] for c in centers], dtype=float)
    sz = np.array(sizes, dtype=float)
    have = np.isfinite(cx)
    cx = smooth(np.interp(idxs, idxs[have], cx[have]), 7)       # gaps are filled with the movement between
    cy = smooth(np.interp(idxs, idxs[have], cy[have]), 7)       # the last and the next place we saw you
    sz = np.interp(idxs, idxs[have], sz[have])
    sz = rolling_max(sz, max(1, int(0.5 * fps)))                # your arms and legs reach out, so keep it roomy
    side = np.clip(ZOOM_SIDE_FACTOR * sz, ZOOM_MIN_SIDE, min(width, height))
    boxes = []
    for i in range(n_frames):
        s = int(round(side[i]))
        x0 = int(np.clip(round(cx[i] - s / 2), 0, width - s))
        y0 = int(np.clip(round(cy[i] - s / 2), 0, height - s))
        boxes.append((x0, y0, s, (float(cx[i]), float(cy[i])), float(sz[i])))
elif ZOOM_PASS:
    print("I found you in too few frames to zoom in, so I'm skipping the zoom pass.")

# ================= PASS 2: zoom in, look again, keep the better look, write the files =================
out = cv2.VideoWriter(VIDEO_OUT, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
csv_file = open(DATA_OUT, "w", newline="")
writer = csv.writer(csv_file)
header = ["frame", "time_s", "person_found"]
for name in JOINT_NAMES:
    header += [f"{name}_x", f"{name}_y", f"{name}_conf"]
writer.writerow(header)

cap = cv2.VideoCapture(VIDEO_IN)
if ZOOM_PASS and boxes is not None:
    print("Pass 2: zooming in on you and looking again...")
else:
    print("Writing the files...")
start2 = time.time()
detected = 0
improved = 0
leg_conf_total = 0.0
leg_low_frames = 0
for fi in range(n_frames):
    ok, frame = cap.read()
    if not ok:
        break
    kp, sc = kp1[fi], sc1[fi]

    if boxes is not None:
        x0, y0, s, (ecx, ecy), esz = boxes[fi]
        crop = frame[y0:y0 + s, x0:x0 + s]
        scale = ZOOM_INPUT / float(s)
        crop = cv2.resize(crop, (ZOOM_INPUT, ZOOM_INPUT), interpolation=cv2.INTER_CUBIC)
        k2, s2 = body(crop)
        if len(k2) > 0:
            exp_center = ((ecx - x0) * scale, (ecy - y0) * scale)
            exp_size = esz * scale
            ch = pick_person(k2, s2, (exp_center, exp_size), exp_size)
            if ch is not None:
                kk = np.array(k2[ch[0]], dtype=float)
                ss = np.array(s2[ch[0]], dtype=float)
                kk = kk / scale + np.array([x0, y0])          # back to the real picture
                if sureness(ss) > sureness(sc) + ZOOM_MIN_GAIN:
                    kp, sc = kk, ss
                    improved += 1

    row = [fi, round(fi / fps, 4)]
    if kp is not None:
        detected += 1
        leg_avg = sum(sc[i] for i in LEG_JOINTS) / len(LEG_JOINTS)
        leg_conf_total += leg_avg
        if leg_avg < CONFIDENCE:
            leg_low_frames += 1

        # Save the numbers
        row.append(1)
        for i in range(len(JOINT_NAMES)):
            if i < len(kp):
                row += [round(float(kp[i][0]), 1), round(float(kp[i][1]), 1), round(float(sc[i]), 3)]
            else:
                row += ["", "", ""]

        # Draw the skeleton
        pts = {i: (int(kp[i][0]), int(kp[i][1])) for i in DRAW_JOINTS}
        for a_, b_ in CONNECTIONS:
            sure = min(sc[a_], sc[b_]) >= CONFIDENCE
            color = (0, 255, 0) if sure else (0, 200, 255)
            cv2.line(frame, pts[a_], pts[b_], color, 3)
        for i in DRAW_JOINTS:
            color = (0, 0, 255) if sc[i] >= CONFIDENCE else (0, 255, 255)
            cv2.circle(frame, pts[i], 5, color, -1)
    else:
        # The dancer wasn't found in this frame: leave the numbers empty
        row.append(0)
        row += [""] * (len(JOINT_NAMES) * 3)

    writer.writerow(row)
    out.write(frame)
    if fi % 5 == 0:
        report(fi + 1, n_frames, 2)
    if boxes is not None and (fi + 1) % 50 == 0:
        print(f"  ...{fi + 1} frames done ({time.time() - start2:.0f}s)")

cap.release()
out.release()
csv_file.close()

elapsed = time.time() - start
print("PROGRESS 100", flush=True)
print(f"Done with {VIDEO_IN}!")
print(f"Device: {DEVICE}, mode: {MODE}, time: {elapsed:.0f} seconds")
print(f"Video frame rate: {fps:.1f} fps, size: {width}x{height}")
if boxes is not None:
    print(f"Zoom pass: the zoomed-in look was better in {improved} frames.")
print(f"Dancer found in {detected} of {n_frames} frames.")
if n_frames and detected / n_frames < MIN_FOUND_SHARE:
    print("WARNING: I could only follow the dancer in part of this video.")
    print("         Feedback from this clip will NOT be reliable. Check the skeleton video.")
if detected:
    print(f"Average leg confidence: {leg_conf_total / detected:.2f}")
    print(f"Frames where the legs were low confidence: {leg_low_frames} of {detected}")
print(f"Video saved as: {VIDEO_OUT}")
print(f"Data saved as:  {DATA_OUT}")
