# FILE NAME: analyze_flares.py
# Reads a data file made by skeleton.py and checks the flares for the mistakes we have rules for.
# python analyze_flares.py <data file>          = look at the whole video
# python analyze_flares.py <data file> 3        = scan only flare number 3
# python analyze_flares.py <data file> all      = one line for every flare
import os
import sys
import csv
import html
import webbrowser
import numpy as np

DATA_IN = sys.argv[1] if len(sys.argv) > 1 else "flares_rtm_data.csv"

# ---------------- SETTINGS YOU CAN CHANGE ----------------
MIN_CONF = 0.5          # ignore joints the model is less sure about than this
OPEN_PAGE = os.environ.get("FLARE_NO_OPEN") != "1"   # open the feedback page in your browser when done (the web app turns this off)
SHOW_NUMBERS = False    # True = also print the measurements (useful for tuning)

# When can the app NOT trust what it saw? (measured in the part of the video where you are on the floor)
REFUSE_IF_FOUND_BELOW = 0.5      # I could find you in less than this share of the video
REFUSE_IF_LOST_LONGER = 1.5      # I lost you for longer than this many seconds in a row
REFUSE_IF_CLEAR_BELOW = 0.4      # I saw your whole body clearly in less than this share of the video
CAUTION_IF_CLEAR_BELOW = 0.85    # between the two numbers: I give feedback but warn that part of it is guesswork
CAUTION_IF_LOST_LONGER = 0.4
FILM_TIPS = [
    "Film in good light. Dark clothes in a dark room are the hardest for me to see.",
    "Make sure nobody is behind you, and your whole body stays in the frame.",
    "Prop your phone up so it doesn't move, and film from the front or at a 45 degree angle.",
    "Wear fitted clothes that stand out from the floor and the wall.",
    "If your phone has slow motion (120 fps or more), use it. Fast moves are much easier to read.",
]

# The moving skeleton on the page is only for show, so it is more forgiving than the judging:
DISPLAY_CONF = 0.3        # draw joints the model is at least this sure about (the judging uses MIN_CONF)
BONE_STRETCH = 1.25       # a limb drawn longer than this times its normal length is a model mistake: drop it
DISPLAY_FILL_SECONDS = 0.5   # fill gaps up to this long so the skeleton doesn't blink out. Longer gaps show "tracking lost"
DISPLAY_MIN_FRAME_QUALITY = 0.3   # frames where the model is this unsure about the whole body are not drawn

# Starting limits. They come from only a few clips, so they are NOT final.
MIN_INVERTED_SECONDS = 0.25   # the body should be upside down at least this long
MIN_HIP_HEIGHT = 1.65         # hips should reach at least this high above the floor (in torso lengths)
MAX_KICK_DISTANCE = 0.5       # a foot should come at least this close to the head (in torso lengths)
MIN_LEG_OPENING = 80          # degrees between the legs at their widest, during the flare
MIN_START_OPENING = 60        # degrees between the legs at their widest, in the second before the first round
DROP_KNEE_HEIGHT = 0.2        # a knee this close to the floor (in torso lengths) counts as "on the ground"
FR_MIN_HIPS_OFF_FLOOR = 0.6   # "first round" case: hips (5th lowest percent of the time) stay at least this high, so they don't collapse
FR_MIN_FOOT_HEIGHT = 1.5      # "first round" case: a foot swings at least this high above the floor
FR_MIN_LEG_OPENING = 80       # "first round" case: legs open at least this much (degrees)
DROP_SHARE = 0.10             # if your knees are on the ground for more than this share of the time after the first flare, it is a mistake
# ----------------------------------------------------------

# What the app says. Edit these freely, they are in your words.
SHORT = {
    "start": "You start with your legs too closed.",
    "legs": "Your legs aren't open wide enough.",
    "kick": "Your legs aren't kicking all the way toward your head.",
    "lift": "Your hips don't get high enough.",
    "flip": "Your body doesn't get upside down, so the flare doesn't come around.",
    "drop": "Your knees almost touch the ground after the first flare, on the way into the second one.",
    "onward": "You stop after part of one round.",
}
FIX = {
    "onward": "Don't stop. Keep going, first with your knees tucked, sliding through the second and third round. As it feels comfortable, your legs will rise higher behind you, like a planche from the back, until you don't need to slide at all.",
    "start": "Open your legs wider before the first round.",
    "legs": "Open your legs wider, and a bit toward the front, before you start, and keep them open through the flare.",
    "kick": "Kick your legs out to the sides. Kick each leg toward your head as you swing, and the other leg comes up with it, so your hips stay up.",
    "lift": "Bring your hands closer together so they can hold your hips up. Send your legs a bit more to the front, not straight up, or you lose momentum.",
    "flip": "Push forward AND up, not just up, and kick toward your head on each side so the flare can come around.",
    "drop": "Push more momentum at the start and kick with your legs. Aim to go back like a planche, and don't let your hips down.",
}
# Extra tips for each problem: drills to practise (edit these freely, they are in your words)
PRACTICE = {
    "onward": ["Do two or three rounds with your knees tucked, even if it's messy.",
               "Practise planche alongside it. It raises your legs higher with every session."],
    "start": ["Practise the start on its own: legs wide, then swing into the first round, 10 times in a row.",
              "Look at your legs in the mirror or a video before every first round."],
    "legs": ["Practise holding your legs wide in a straddle, then swing them while staying wide.",
             "Do a few slow flares and think about keeping the legs open the whole time.",
             "Think wide legs, a bit toward the front, on every round. Film a slow one from the front and check how wide they get."],
    "kick": ["Do slow flare swings and focus only on kicking each leg toward your head on each side.",
             "Practise more planche, it keeps your body up while the legs swing."],
    "lift": ["Focus on keeping your hips up. Practise more planche and handstand holds.",
             "Keep your hands closer together and push the floor away."],
    "flip": ["Practise the swing on its own first, then add the full round.",
             "Applejacks help you learn to push forward and up."],
    "drop": ["Practise more planche. It's the position you want to hold when you go back into the second flare.",
             "Push harder at the beginning to build more momentum, and kick with your legs as you go.",
             "Practise the part between the first and the second flare on its own: hips up, knees off the floor."],
}
# Why the mistake matters (shown under the main fix, edit freely)
WHY = {
    "onward": "Each round carries momentum into the next one, so stopping after one means the next round starts from zero.",
    "start": "If your legs are a bit closed at the start there is no momentum, so open them before the first round.",
    "legs": "With your legs closed there is no momentum, so your hips have to do all the work to get you around. Wide legs give you the swing that carries you through the flare.",
    "kick": "That swing is what carries you around the flare.",
    "lift": "Your hands hold your hips up. When your hands are far apart your hips drop, and sending your legs straight up loses momentum.",
    "flip": "If your body doesn't get upside down, the flare can't come around.",
    "drop": "When your hips come down to the floor, the momentum is gone and the next flare has to start from zero.",
}
# Tips for everyone, whatever the mistake: (title, text)
GENERAL = [
    ("START WITH MOMENTUM", "Every attempt you do, make sure you start with momentum. Don't start from a dead stop."),
    ("FILM IT AGAIN", "Film yourself again after practising and compare. Small changes show up on video before you feel them."),
]
# The windmill tip depends on how many flare rounds the app sees: more than 2 rounds = connect it, 2 or fewer = ask
WINDMILL_CONNECT = ("CONNECT IT WITH WINDMILLS", "Connect your flares with windmills. Going from a flare into a windmill teaches you to move your hips and makes both moves better. Once the flare works, try to do a windmill straight after it.")
WINDMILL_ASK = ("DO YOU DO WINDMILLS?", "If you haven't done windmills yet, I'd recommend learning windmills before you start doing flares. It makes flares easier because you learn how to move your hips, and connecting windmills to flares makes your flares better. And if you don't know any move to do after a flare, it's even harder, so windmills are a good one to know.")
WINDMILL_ONE = ("DO YOU DO WINDMILLS?", "If you do, try one round of flare and connect it into a windmill. It keeps you moving instead of stopping. If you haven't learned windmills yet, start there: they teach you how to move your hips, which makes flares easier.")
MORE_THAN_ROUNDS = 2      # more than this many flare rounds in the video = we say "connect it with windmills"
# Big headline for each mistake, shown on the page
HEADLINE = {
    "onward": "YOU STOPPED AFTER ONE ROUND",
    "start": "YOUR LEGS START CLOSED",
    "legs": "YOUR LEGS CLOSE IN THE FLARE",
    "kick": "YOUR LEGS DON'T KICK TO THE SIDES",
    "lift": "YOUR HIPS STAY LOW",
    "flip": "YOU DON'T GET ALL THE WAY AROUND",
    "drop": "YOUR KNEES DROP BETWEEN FLARES",
}
# What is actually happening in the video, said first. (onward fills in the moment the flare stops)
OBSERVE = {
    "onward": "At about {t} seconds you put your leg down and stop. Your hips are good and your legs are open, so your body is ready for another round.",
    "start": "Before your first round your legs are still closed, so there is no momentum going in.",
    "legs": "During the flare your legs close in instead of staying wide.",
    "kick": "Your legs swing, but your feet never come up close to your head on the sides.",
    "lift": "Your hips stay low through the flare.",
    "flip": "Your head never goes under your hips, so the flare doesn't come all the way around.",
    "drop": "After your first flare your knees almost touch the ground before you go into the second one.",
}
# Name of each check, shown on the page
CHECK_NAME = {"onward": "Second round", "start": "Start", "legs": "Legs open", "kick": "Kick", "lift": "Hip height", "flip": "Upside down", "drop": "Hips between flares"}
# One small line under each check on the page, so it's clear what it means
CHECK_DESC = {
    "onward": "You keep going into the next round",
    "start": "Legs open before the first round",
    "legs": "Legs wide during the flare",
    "kick": "Legs kick toward your head",
    "lift": "Hips stay high",
    "flip": "Head goes below your hips, so the flare comes around",
    "drop": "Knees and hips stay off the floor between flares",
}
# If several things are wrong, tell them about the first one in this list (the cause comes before the effect)
PRIORITY = ["onward", "start", "legs", "kick", "drop", "lift", "flip"]

# ---------- read the data ----------
rows = list(csv.DictReader(open(DATA_IN, newline="", encoding="utf-8")))
if not rows:
    raise SystemExit("The data file is empty.")
n = len(rows)

def col(name, suffix):
    out = np.full(n, np.nan)
    for i, r in enumerate(rows):
        v = r.get(f"{name}_{suffix}", "")
        if v not in ("", None):
            out[i] = float(v)
    return out

times = np.array([float(r["time_s"]) for r in rows])
fps = (n - 1) / (times[-1] - times[0]) if n > 1 else 30.0

JOINTS = ["head", "left_shoulder", "right_shoulder", "left_hip", "right_hip",
          "left_knee", "right_knee", "left_ankle", "right_ankle",
          "left_wrist", "right_wrist", "left_heel", "right_heel",
          "left_elbow", "right_elbow"]
X, Y = {}, {}
for j in JOINTS:
    x, y, c = col(j, "x"), col(j, "y"), col(j, "conf")
    bad = np.isnan(x) | np.isnan(y) | np.isnan(c) | (c < MIN_CONF)
    x[bad] = np.nan
    y[bad] = np.nan
    X[j], Y[j] = x, y

def mean2(a, b):
    return np.nanmean(np.vstack([a, b]), axis=0)

import warnings
warnings.filterwarnings("ignore")

shx, shy = mean2(X["left_shoulder"], X["right_shoulder"]), mean2(Y["left_shoulder"], Y["right_shoulder"])
hpx, hpy = mean2(X["left_hip"], X["right_hip"]), mean2(Y["left_hip"], Y["right_hip"])
torso = np.hypot(shx - hpx, shy - hpy)
TORSO = float(np.nanpercentile(torso, 90))   # body size, from the least foreshortened frames

# ---------- clean the data: throw away impossible jumps ----------
CORE = {"head", "left_shoulder", "right_shoulder", "left_hip", "right_hip"}
removed = 0
for j in JOINTS:
    limit = (0.8 if j in CORE else 2.2) * TORSO     # max believable move in ONE frame
    last = None
    for i in range(n):
        if np.isnan(X[j][i]):
            continue
        if last is not None and i - last[0] <= 3:
            if np.hypot(X[j][i] - last[1], Y[j][i] - last[2]) > limit * (i - last[0]):
                X[j][i] = Y[j][i] = np.nan
                removed += 1
                continue
        last = (i, X[j][i], Y[j][i])

def fill_and_smooth(a, max_gap=6, win=5):
    a = a.copy()
    idx = np.arange(len(a))
    ok = ~np.isnan(a)
    if ok.sum() < 2:
        return a
    filled = np.interp(idx, idx[ok], a[ok])
    # do not invent data across long gaps
    gap = 0
    for i in range(len(a)):
        if np.isnan(a[i]):
            gap += 1
        else:
            if gap > max_gap:
                filled[i - gap:i] = np.nan
            gap = 0
    if gap > max_gap:
        filled[len(a) - gap:] = np.nan
    out = filled.copy()
    h = win // 2
    for i in range(len(a)):
        if not np.isnan(filled[i]):
            out[i] = np.nanmedian(filled[max(0, i - h): i + h + 1])
    return out

for j in JOINTS:
    X[j] = fill_and_smooth(X[j])
    Y[j] = fill_and_smooth(Y[j])

shx, shy = mean2(X["left_shoulder"], X["right_shoulder"]), mean2(Y["left_shoulder"], Y["right_shoulder"])
hpx, hpy = mean2(X["left_hip"], X["right_hip"]), mean2(Y["left_hip"], Y["right_hip"])
headx, heady = X["head"], Y["head"]

# Where is the floor? The lowest points that hands and feet reach.
low = np.nanmax(np.vstack([Y["left_wrist"], Y["right_wrist"], Y["left_ankle"], Y["right_ankle"],
                           Y["left_heel"], Y["right_heel"]]), axis=0)
FLOOR = float(np.nanpercentile(low, 95))

# ---------- find the part where you are on the floor ----------
low = np.nanmax(np.vstack([Y["left_wrist"], Y["right_wrist"], Y["left_ankle"], Y["right_ankle"],
                           Y["left_heel"], Y["right_heel"]]), axis=0)
FLOOR = float(np.nanpercentile(low, 95))
wrist_low = np.nanmax(np.vstack([Y["left_wrist"], Y["right_wrist"]]), axis=0)
hands_down = np.where(wrist_low > FLOOR - 0.3 * TORSO)[0]

print()
print("FLARE FEEDBACK")
print("==============")
if len(hands_down) < int(0.3 * fps):
    print("I couldn't find you doing a flare in this video.")
    print("This can happen when the picture is too dark, you are too small in the frame, or the move isn't a flare.")
    print("Make sure your whole body is in frame, the light is good and the phone is propped still.")
    print()
    raise SystemExit()

a, b = int(hands_down[0]), int(hands_down[-1])
win = slice(a, b + 1)

def angle_between(v1, v2):
    d = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(d, -1, 1))))

# the spread of the legs, frame by frame
def spread_at(i):
    lv = np.array([X["left_ankle"][i] - X["left_hip"][i], Y["left_ankle"][i] - Y["left_hip"][i]])
    rv = np.array([X["right_ankle"][i] - X["right_hip"][i], Y["right_ankle"][i] - Y["right_hip"][i]])
    if np.isnan(lv).any() or np.isnan(rv).any():
        return np.nan
    return angle_between(lv, rv)

spread = np.array([spread_at(i) for i in range(n)])

# when is the body upside down? (head below hips)
inverted = (heady > hpy + 0.15 * TORSO) & ~np.isnan(heady) & ~np.isnan(hpy)

def upside_down_stretches(lo, hi):
    """the stretches between frames lo and hi where you are upside down, close ones joined together"""
    st, s0_ = [], None
    for i in range(lo, hi + 1):
        if inverted[i] and s0_ is None:
            s0_ = i
        if (not inverted[i]) and s0_ is not None:
            st.append([s0_, i - 1]); s0_ = None
    if s0_ is not None:
        st.append([s0_, hi])
    out = []
    for s_ in st:
        if out and (s_[0] - out[-1][1]) / fps <= 0.3:
            out[-1][1] = s_[1]
        else:
            out.append(s_)
    return out

def judge(a, b, start_at=None):
    """look at the frames a..b and decide what, if anything, was wrong"""
    win = slice(a, b + 1)
    # 1) how high do the hips get?
    hip_height = float(np.nanmax((FLOOR - hpy[win]) / TORSO))
    # 2) how long is the body upside down? (head below hips)
    inverted_seconds = float(inverted[win].sum()) / fps
    # 3) does a foot come all the way to the head?
    dl = np.hypot(X["left_ankle"] - headx, Y["left_ankle"] - heady) / TORSO
    dr = np.hypot(X["right_ankle"] - headx, Y["right_ankle"] - heady) / TORSO
    kick = float(np.nanmin(np.vstack([dl[win], dr[win]])))
    # 4a) the start: the second before your hands first touch the floor (start_at = that moment)
    # (only judged if the video shows you before the move, not if it begins mid-move)
    start_spread = None
    if start_at is not None and times[start_at] - times[0] >= 0.5:
        s0 = max(0, start_at - int(1.0 * fps))
        if np.isfinite(spread[s0:start_at + 1]).any():
            start_spread = float(np.nanmax(spread[s0:start_at + 1]))
    # 4b) the flare: the widest the legs get during the first time you go upside down
    # (we stop shortly after, so a fall onto the floor afterwards is not counted)
    flare_spread = None
    for s0_, s1_ in upside_down_stretches(a, b):
        if (s1_ - s0_ + 1) / fps >= MIN_INVERTED_SECONDS:
            end = min(n - 1, s1_ + int(0.5 * fps))
            seg = spread[a:end + 1]
            if np.isfinite(seg).any():
                flare_spread = float(np.nanmax(seg))
            break
    # 5) after your best moment (hips highest), do your knees come down to the floor?
    drop_share = None
    knee_low = (FLOOR - np.fmax(Y["left_knee"], Y["right_knee"])) / TORSO     # the lower knee, height above the floor
    hip_h = (FLOOR - hpy) / TORSO
    if np.isfinite(hip_h[win]).any():
        peak = a + int(np.nanargmax(hip_h[win]))
        after = slice(peak, b + 1)
        ok_k = np.isfinite(knee_low[after])
        if (b - peak) / fps >= 0.5 and ok_k.sum() >= 0.5 * fps:
            drop_share = float(np.mean(knee_low[after][ok_k] < DROP_KNEE_HEIGHT))
    problems = []
    if start_spread is not None and start_spread < MIN_START_OPENING:
        problems.append("start")
    if flare_spread is not None and flare_spread < MIN_LEG_OPENING:
        problems.append("legs")
    if kick > MAX_KICK_DISTANCE:
        problems.append("kick")
    if drop_share is not None and drop_share > DROP_SHARE:
        problems.append("drop")
    if hip_height < MIN_HIP_HEIGHT:
        problems.append("lift")
    if inverted_seconds < MIN_INVERTED_SECONDS:
        problems.append("flip")
    # some mistakes are just the result of another one, so we only talk about the cause:
    #  - no kick on the sides  -> hips don't get high and the body doesn't come around
    #  - start / legs / hips low -> the knees coming down is the same story
    if "kick" in problems:
        problems = [p for p in problems if p not in ("lift", "flip")]
    if any(p in problems for p in ("start", "legs", "lift")):
        problems = [p for p in problems if p != "drop"]
    problems.sort(key=PRIORITY.index)
    return {"hip_height": hip_height, "inverted_seconds": inverted_seconds, "kick": kick,
            "start_spread": start_spread, "flare_spread": flare_spread, "drop_share": drop_share, "problems": problems}

# ---------- which flares are in this video? (each time you go upside down is one flare) ----------
rounds = [r for r in upside_down_stretches(0, n - 1) if (r[1] - r[0] + 1) / fps >= 0.2]

if len(rounds) > MORE_THAN_ROUNDS:
    windmill_tip = WINDMILL_CONNECT + ("!",)
else:
    windmill_tip = WINDMILL_ASK + ("?",)
TIPS_ALL = [GENERAL[0] + ("1",), windmill_tip, GENERAL[1] + ("3",)]

def flare_window(k):
    """the frames around flare number k (1 = the first): a little before and after it"""
    s0_, s1_ = rounds[k - 1]
    lo = max(0, s0_ - int(0.5 * fps))
    hi = min(n - 1, s1_ + int(0.5 * fps))
    return lo, hi

def tt(i):
    return f"{times[i] - times[0]:.1f}s"

FIRST_HANDS_DOWN = a      # the moment your hands first touch the floor in this video
which = sys.argv[2].lower() if len(sys.argv) > 2 else None
seen_suffix = "where you are on the floor"
if which == "all":
    if not rounds:
        print("I couldn't find a flare in this video: you are never upside down long enough.")
        print("Run it without 'all' to look at the whole attempt instead.")
        raise SystemExit()
    print(f"I found {len(rounds)} flare(s) in this video. One line for each:")
    print()
    for k in range(1, len(rounds) + 1):
        lo, hi = flare_window(k)
        r_ = judge(lo, hi, start_at=(FIRST_HANDS_DOWN if k == 1 else None))
        txt = " ".join(SHORT[p] for p in r_["problems"]) if r_["problems"] else "Looking good."
        print(f"  Flare {k} ({tt(rounds[k - 1][0])} to {tt(rounds[k - 1][1])}): {txt}")
    print()
    print(f"To see the full feedback page for one of them, add its number, e.g.:  python analyze_flares.py {os.path.basename(DATA_IN)} 1")
    print()
    raise SystemExit()
elif which is not None:
    try:
        k = int(which)
    except ValueError:
        raise SystemExit("After the file name, type a flare number (like 3) or the word all.")
    if not rounds:
        raise SystemExit("I couldn't find any flares (upside-down moments) in this video.")
    if k < 1 or k > len(rounds):
        raise SystemExit(f"I found {len(rounds)} flare(s) in this video. Pick a number from 1 to {len(rounds)}.")
    a, b = flare_window(k)
    res = judge(a, b, start_at=(FIRST_HANDS_DOWN if k == 1 else None))
    seen_suffix = f"flare {k} of {len(rounds)}"
else:
    res = judge(a, b, start_at=FIRST_HANDS_DOWN)

# ---------- the "first round" case ----------
# A beginner does part of one round with open legs, hips that don't collapse, then puts a leg down and stops.
# No full upside-down round is seen, so it is not judged like a full flare: the advice is to keep going.
def first_round_case():
    if which is not None or rounds:
        return False
    w_ = slice(a, b + 1)
    hh_ = (FLOOR - hpy[w_]) / TORSO
    foot_ = (FLOOR - np.fmin(Y["left_ankle"], Y["right_ankle"]))[w_] / TORSO
    if (b - a) / fps < 0.5 or not np.isfinite(hh_).any() or not np.isfinite(foot_).any() or not np.isfinite(spread[w_]).any():
        return False
    return bool(np.nanpercentile(hh_, 5) >= FR_MIN_HIPS_OFF_FLOOR and np.nanmax(foot_) >= FR_MIN_FOOT_HEIGHT
                and np.nanmax(spread[w_]) >= FR_MIN_LEG_OPENING)

FIRST_ROUND = first_round_case()
if FIRST_ROUND:
    res["problems"] = ["onward"]
    res["flare_spread"] = float(np.nanmax(spread[a:b + 1]))
    TIPS_ALL[1] = WINDMILL_ONE + ("?",)
    _hi = (FLOOR - np.fmin(Y["left_ankle"], Y["right_ankle"])) / TORSO
    _idx = [i for i in range(a, b + 1) if np.isfinite(_hi[i]) and _hi[i] >= FR_MIN_FOOT_HEIGHT]
    _stop = _idx[-1] if _idx else b
    OBSERVE["onward"] = OBSERVE["onward"].format(t=f"{times[_stop] - times[0]:.1f}")

hip_height, inverted_seconds, kick = res["hip_height"], res["inverted_seconds"], res["kick"]
start_spread, flare_spread, problems = res["start_spread"], res["flare_spread"], res["problems"]
drop_share = res["drop_share"]

# ---------- can we trust what we saw? ----------
MAIN_JOINTS = ["left_shoulder", "right_shoulder", "left_wrist", "right_wrist", "left_hip", "right_hip",
               "left_knee", "right_knee", "left_ankle", "right_ankle"]

def tracking_quality(lo, hi):
    c = np.mean([np.nan_to_num(col(j, "conf"), nan=0.0) for j in MAIN_JOINTS], axis=0)
    found = np.array([r.get("person_found", "1") == "1" for r in rows])
    q = c[lo:hi + 1]
    run = best = 0
    for v in (q < 0.3):
        run = run + 1 if v else 0
        best = max(best, run)
    return {"found": float(found[lo:hi + 1].mean()), "clear": float(np.mean(q >= 0.45)), "lost_seconds": best / fps}

tq = tracking_quality(a, b)
refuse_reasons = []
if tq["found"] < REFUSE_IF_FOUND_BELOW:
    refuse_reasons.append(f"I could only find you in {tq['found'] * 100:.0f}% of the video.")
if tq["lost_seconds"] > REFUSE_IF_LOST_LONGER:
    refuse_reasons.append(f"I lost you for {tq['lost_seconds']:.1f} seconds in a row.")
if tq["clear"] < REFUSE_IF_CLEAR_BELOW:
    refuse_reasons.append(f"I only saw your whole body clearly in {tq['clear'] * 100:.0f}% of the video.")
if refuse_reasons:
    track_level = "refuse"
elif tq["clear"] < CAUTION_IF_CLEAR_BELOW or tq["lost_seconds"] > CAUTION_IF_LOST_LONGER:
    track_level = "caution"
else:
    track_level = "ok"
caution_text = (f"I lost track of you for a moment ({tq['lost_seconds']:.1f}s) and only saw you clearly "
                f"{tq['clear'] * 100:.0f}% of the time, so part of this feedback is based on the moments I could see.")

print(f"Looked at {times[a] - times[0]:.1f}s to {times[b] - times[0]:.1f}s, {seen_suffix}.")
if which is None and len(rounds) > 1:
    print(f"(I found {len(rounds)} flares in this video. To scan one on its own, add its number: python analyze_flares.py {os.path.basename(DATA_IN)} 1")
    print(f" or type  all  instead of a number to see every flare in one list.)")
if SHOW_NUMBERS:
    st = "n/a" if start_spread is None else f"{start_spread:.0f}"
    fl = "n/a" if flare_spread is None else f"{flare_spread:.0f}"
    print(f"[hips {hip_height:.2f}, upside down {inverted_seconds:.2f}s, kick {kick:.2f}, legs at start {st}, legs in flare {fl}]")
print()

if track_level == "refuse":
    print("I COULDN'T SEE YOU CLEARLY")
    print("--------------------------")
    for r_ in refuse_reasons:
        print("  - " + r_)
    print()
    print("I won't guess at your flare when I can't see it. Film it again like this:")
    for t_ in FILM_TIPS:
        print("  - " + t_)
    print()
else:
    if track_level == "caution":
        print("Heads up: " + caution_text)
        print()
    print("COACH'S REMARK")
    print("--------------")
    if not problems:
        print("Nice flares. I can't see anything clearly wrong here.")
        print("Keep practising, repetition is the next step.")
    else:
        print("What I saw in your video:")
        for p in problems:
            print("  - " + OBSERVE[p])
        print()
        print("Try this first:")
        print(FIX[problems[0]])
        print()
        print("Why it matters:")
        print(WHY[problems[0]])
        if len(problems) > 1:
            print()
            print("Also work on: " + HEADLINE[problems[1]].capitalize())
            print(FIX[problems[1]])
        print()
        print("Practise this:")
        tips = []
        for p in problems[:2]:
            for t_ in PRACTICE[p]:
                if t_ not in tips:
                    tips.append(t_)
        for t_ in tips:
            print("  - " + t_)
    print()
    print("FOR EVERY FLARE")
    print("---------------")
    for g in TIPS_ALL:
        print("  - " + g[0].capitalize() + ": " + g[1])
    print()

# ====================== THE FEEDBACK PAGE ======================
E = html.escape
page_name = os.path.basename(DATA_IN).replace("_rtm_data.csv", "").replace(".csv", "")
PAGE_OUT = os.path.join(os.path.dirname(os.path.abspath(DATA_IN)), page_name + "_feedback.html")

# ---- data for the animated replay of your flare (drawn from the skeleton numbers) ----
import json
REPLAY_JOINTS = ["head", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
                 "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel"]
f0 = max(0, a - int(0.6 * fps))
f1 = min(n - 1, b + int(0.6 * fps))
step = max(1, int(round(fps / 20)))          # about 20 pictures per second is plenty
frames_idx = list(range(f0, f1 + 1, step))
# a separate, more forgiving copy of the data, only for drawing
BONE_LIST = [("left_shoulder", "left_elbow"), ("left_elbow", "left_wrist"), ("right_shoulder", "right_elbow"),
             ("right_elbow", "right_wrist"), ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
             ("left_ankle", "left_heel"), ("right_hip", "right_knee"), ("right_knee", "right_ankle"),
             ("right_ankle", "right_heel"), ("left_shoulder", "left_hip"), ("right_shoulder", "right_hip")]
RAWX, RAWY, RAWC = {}, {}, {}
for j in REPLAY_JOINTS:
    x, y, c = col(j, "x"), col(j, "y"), col(j, "conf")
    bad = np.isnan(x) | np.isnan(y) | np.isnan(c) | (c < DISPLAY_CONF)
    x[bad] = np.nan
    y[bad] = np.nan
    RAWX[j], RAWY[j], RAWC[j] = x, y, c

# 0) frames where the model is unsure about the whole body are mostly scrambled: don't draw them at all
MAIN = ["left_shoulder", "right_shoulder", "left_wrist", "right_wrist", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle"]
quality = np.mean([np.nan_to_num(RAWC[j], nan=0.0) for j in MAIN], axis=0)
for j in REPLAY_JOINTS:
    RAWX[j][quality < DISPLAY_MIN_FRAME_QUALITY] = np.nan
    RAWY[j][quality < DISPLAY_MIN_FRAME_QUALITY] = np.nan

# 1) how long is each limb normally? (measured only where the model was sure)
max_len = {}
for p_, q_ in BONE_LIST:
    ok2 = (RAWC[p_] >= MIN_CONF) & (RAWC[q_] >= MIN_CONF) & np.isfinite(RAWX[p_]) & np.isfinite(RAWX[q_])
    if ok2.sum() >= 5:
        ln = np.hypot(RAWX[p_] - RAWX[q_], RAWY[p_] - RAWY[q_])[ok2]
        max_len[(p_, q_)] = BONE_STRETCH * float(np.percentile(ln, 95))
# 2) a limb that is much too long means the model put a joint in the wrong place: drop that joint in that frame
for (p_, q_), mx in max_len.items():
    ln = np.hypot(RAWX[p_] - RAWX[q_], RAWY[p_] - RAWY[q_])
    wrong = np.where(ln > mx)[0]
    for i in wrong:
        RAWX[q_][i] = RAWY[q_][i] = np.nan

# the head can't be far away from the neck: if it is, the model got it wrong
nx = (RAWX["left_shoulder"] + RAWX["right_shoulder"]) / 2
ny = (RAWY["left_shoulder"] + RAWY["right_shoulder"]) / 2
hl = np.hypot(RAWX["head"] - nx, RAWY["head"] - ny)
okh = (RAWC["head"] >= MIN_CONF) & np.isfinite(hl)
if okh.sum() >= 5:
    far = np.where(hl > BONE_STRETCH * float(np.percentile(hl[okh], 95)))[0]
    for i in far:
        RAWX["head"][i] = RAWY["head"][i] = np.nan

# ---- the "predict the movement" smoother (only for the drawing) ----
# For every joint: trust confident frames a lot, unsure frames a little, and where there is nothing,
# carry on the movement the way a body would (speed and direction), then clean it up looking
# both forwards and backwards in time. (A Kalman filter with a backwards pass, "RTS smoother".)
SKEL_TRUST = 0.08          # how exactly a fully confident joint is placed (in torso lengths)
SKEL_ACCEL = 50.0          # how hard a joint can speed up or slow down (torso lengths per second per second)

def predict_smooth(z, conf):
    m = len(z)
    dt = 1.0
    sig_acc = SKEL_ACCEL * TORSO / (fps * fps)          # per frame
    Q = (sig_acc ** 2) * np.array([[0.25, 0.5], [0.5, 1.0]])
    F = np.array([[1.0, dt], [0.0, 1.0]])
    has = np.isfinite(z)
    if has.sum() < 2:
        return np.full(m, np.nan)
    xf = np.zeros((m, 2)); Pf = np.zeros((m, 2, 2)); xp = np.zeros((m, 2)); Pp = np.zeros((m, 2, 2))
    first = int(np.argmax(has))
    x = np.array([z[first], 0.0]); P = np.diag([(SKEL_TRUST * TORSO) ** 2, (0.5 * TORSO) ** 2])
    for i in range(m):
        if i > 0:
            x = F @ x; P = F @ P @ F.T + Q
        xp[i], Pp[i] = x, P
        if has[i]:
            rr = (SKEL_TRUST * TORSO / max(float(conf[i]), 0.08)) ** 2
            S = P[0, 0] + rr
            K = P[:, 0] / S
            x = x + K * (z[i] - x[0])
            P = P - np.outer(K, P[0, :])
        xf[i], Pf[i] = x, P
    xs = xf.copy()
    for i in range(m - 2, -1, -1):
        C = Pf[i] @ F.T @ np.linalg.inv(Pp[i + 1])
        xs[i] = xf[i] + C @ (xs[i + 1] - xp[i + 1])
    return xs[:, 0]

def mask_long_gaps(out, has_meas, max_gap):
    """don't draw across a stretch with no measurement that is longer than max_gap frames"""
    m = len(out); i = 0
    while i < m:
        if not has_meas[i]:
            j = i
            while j < m and not has_meas[j]:
                j += 1
            if j - i > max_gap or i == 0 or j == m:
                out[i:j] = np.nan
            i = j
        else:
            i += 1
    return out

DX, DY = {}, {}
gap_frames = max(6, int(DISPLAY_FILL_SECONDS * fps))
for j in REPLAY_JOINTS:
    x, y = RAWX[j], RAWY[j]
    limit = (0.8 if j in CORE else 2.2) * TORSO
    last = None
    for i in range(n):
        if np.isnan(x[i]):
            continue
        if last is not None and i - last[0] <= 3:
            if np.hypot(x[i] - last[1], y[i] - last[2]) > limit * (i - last[0]):
                x[i] = y[i] = np.nan
                continue
        last = (i, x[i], y[i])
    has_meas = np.isfinite(x) & np.isfinite(y)
    DX[j] = mask_long_gaps(predict_smooth(x, RAWC[j]), has_meas, gap_frames)
    DY[j] = mask_long_gaps(predict_smooth(y, RAWC[j]), has_meas, gap_frames)

# limbs can't be longer than they really are: pull a joint back toward its parent if the model stretched it
for (p_, q_), mx in max_len.items():
    dxp, dyp = DX[q_] - DX[p_], DY[q_] - DY[p_]
    ln = np.hypot(dxp, dyp)
    over = np.isfinite(ln) & (ln > mx)
    DX[q_][over] = DX[p_][over] + dxp[over] / ln[over] * mx
    DY[q_][over] = DY[p_][over] + dyp[over] / ln[over] * mx

allx = np.concatenate([DX[j][f0:f1 + 1] for j in REPLAY_JOINTS])
ally = np.concatenate([DY[j][f0:f1 + 1] for j in REPLAY_JOINTS])
ok_ = np.isfinite(allx) & np.isfinite(ally)
if ok_.sum() > 10:
    bx0, bx1 = float(allx[ok_].min()), float(allx[ok_].max())
    by0, by1 = float(ally[ok_].min()), float(max(ally[ok_].max(), FLOOR))
else:
    bx0, bx1, by0, by1 = 0.0, 1.0, 0.0, 1.0
replay = {
    "joints": REPLAY_JOINTS,
    "box": [bx0, by0, bx1, by1],
    "floor": FLOOR,
    "dt": step / fps,
    "t0": float(times[f0] - times[0]),
    "frames": [[None if not (np.isfinite(DX[j][i]) and np.isfinite(DY[j][i])) else [round(float(DX[j][i]), 1), round(float(DY[j][i]), 1)]
                for j in REPLAY_JOINTS] for i in frames_idx],
}
replay["lost"] = [all(p is None for p in fr_) for fr_ in replay["frames"]]
REPLAY_JSON = json.dumps(replay, separators=(",", ":"))

# status of every check: True = fine, False = needs work, None = couldn't be judged in this video
status = {
    "onward": False if FIRST_ROUND else None,
    "start": None if start_spread is None else bool(start_spread >= MIN_START_OPENING),
    "legs": None if flare_spread is None else bool(flare_spread >= MIN_LEG_OPENING),
    "kick": bool(kick <= MAX_KICK_DISTANCE),
    "lift": bool(hip_height >= MIN_HIP_HEIGHT),
    "flip": bool(inverted_seconds >= MIN_INVERTED_SECONDS),
    "drop": None if drop_share is None else bool(drop_share <= DROP_SHARE),
}
if FIRST_ROUND:
    status["lift"] = True            # hips stayed up, so no hip advice here
    HIDE_TILES = {"start", "kick", "flip", "drop"}
else:
    HIDE_TILES = {"onward"}

ICON_OK = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
ICON_BAD = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 6v8M12 18v.01" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>'
ICON_NA = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 12h10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'

tiles = ""
SHOWN = [k for k in PRIORITY if k not in HIDE_TILES]

# save a small summary of this scan, so the app can show progress over time (no scores, just fine / needs work)
try:
    _areas = {k: ("na" if (k in HIDE_TILES or status[k] is None) else ("ok" if status[k] else ("issue" if k in problems else "na"))) for k in PRIORITY}
    json.dump({"areas": _areas, "main": (problems[0] if problems else None),
               "headline": (HEADLINE[problems[0]] if problems else "NICE FLARES"),
               "first_round": bool(FIRST_ROUND), "rounds": (1 if FIRST_ROUND else len(rounds)), "track": track_level},
              open(os.path.join(os.path.dirname(os.path.abspath(DATA_IN)), page_name + "_findings.json"), "w"))
except Exception:
    pass
order = [k for k in SHOWN if status[k] is False] + [k for k in SHOWN if status[k] is not False]
rest = [k for k in order if status[k] is not False]
for k in order:
    st_ = status[k]
    if k in HIDE_TILES:
        continue
    if st_ is False and k not in problems:
        continue            # this one failed too, but it only follows from the main mistake, so no tile
    wide = " wide" if (st_ is not False and k == rest[-1] and len(rest) % 2 == 1) else ""
    if st_ is False:
        tiles += (f'<div class="tile bad"><div class="trow"><span class="ti bad">{ICON_BAD}</span><span class="chip bad">NEEDS WORK</span></div>'
                  f'<div class="tname">{E(CHECK_NAME[k])}</div><p>{E(SHORT[k])}</p></div>')
    elif st_ is True:
        tiles += (f'<div class="tile ok{wide}"><div class="trow"><span class="ti ok">{ICON_OK}</span><span class="chip ok">SOLID</span></div>'
                  f'<div class="tname">{E(CHECK_NAME[k])}</div><div class="td">{E(CHECK_DESC[k])}</div></div>')
    else:
        tiles += (f'<div class="tile na{wide}"><div class="trow"><span class="ti na">{ICON_NA}</span><span class="chip na">NOT IN VIDEO</span></div>'
                  f'<div class="tname">{E(CHECK_NAME[k])}</div><div class="td">{E(CHECK_DESC[k])}</div></div>')

if problems:
    focus = f"""
    <div class="head rise" style="--d:.3s"><span class="idx">01</span><span class="label">COACH'S REMARK</span></div>
    <section class="focus rise" style="--d:.35s">
      <div class="rings"></div>
      <div class="tag"><i></i>WHAT I SAW IN YOUR VIDEO</div>
      <h2>{E(HEADLINE[problems[0]])}</h2>
      <p>{E(OBSERVE[problems[0]])}</p>
      <div class="why"><div class="wl">// TRY THIS</div><p>{E(FIX[problems[0]])}</p></div>
      <div class="why"><div class="wl">// WHY IT MATTERS</div><p>{E(WHY[problems[0]])}</p></div>
    </section>"""
    if len(problems) > 1:
        focus += f"""
    <section class="focus also rise" style="--d:.4s">
      <div class="tag"><i></i>ALSO IN YOUR VIDEO</div>
      <h2>{E(HEADLINE[problems[1]])}</h2>
      <p>{E(OBSERVE[problems[1]])}</p>
      <div class="why"><div class="wl">// TRY THIS</div><p>{E(FIX[problems[1]])}</p></div>
    </section>"""
    cards = ""
    n_ = 0
    seen_t = set()
    for p in problems[:2]:
        for t_ in PRACTICE[p]:
            if t_ in seen_t:
                continue
            seen_t.add(t_)
            n_ += 1
            cards += (f'<div class="drill"><div class="num">{n_:02d}</div>'
                      f'<div><div class="for">FOR: {E(CHECK_NAME[p].upper())}</div><p>{E(t_)}</p></div></div>')
    drills = f"""
    <section class="rise" style="--d:.55s">
      <div class="head"><span class="idx">03</span><span class="label">PRACTISE THIS</span></div>
      <div class="drills">{cards}</div>
    </section>"""
else:
    focus = """
    <div class="head rise" style="--d:.3s"><span class="idx">01</span><span class="label">COACH'S REMARK</span></div>
    <section class="focus rise" style="--d:.35s">
      <div class="rings"></div>
      <div class="tag"><i></i>LOOKING GOOD</div>
      <h2>CLEAN FLARES</h2>
      <p>Nice flares. I can't see anything clearly wrong here. Keep practising, repetition is the next step.</p>
    </section>"""
    drills = ""

nxt = "".join(f'<div class="next{" ask" if bd_ in "?!" else ""}"><div class="nn">{E(bd_)}</div><h4>{E(t_)}</h4><p>{E(x_)}</p></div>'
              for (t_, x_, bd_) in TIPS_ALL)
seen = f"{times[a] - times[0]:.1f}s to {times[b] - times[0]:.1f}s"
tracking = {"ok": "CLEAN", "caution": "PARTIAL", "refuse": "POOR"}[track_level]
chips = (f'<span class="pill"><i></i>ROUNDS SEEN <b>{"1 (PART)" if FIRST_ROUND else len(rounds)}</b></span>'
         f'<span class="pill"><i></i>TRACKING <b>{tracking}</b></span>')


if track_level == "refuse":
    reasons_html = "".join(f"<li>{E(r_)}</li>" for r_ in refuse_reasons)
    focus = f"""
    <div class="head rise" style="--d:.3s"><span class="idx bad">01</span><span class="label">WHAT HAPPENED</span></div>
    <section class="focus bad rise" style="--d:.35s">
      <div class="tag bad"><i></i>RESCAN NEEDED</div>
      <h2>I COULDN'T SEE YOU CLEARLY</h2>
      <p>I won't guess at your flare when I can't see it. Here is what went wrong:</p>
      <ul class="reasons">{reasons_html}</ul>
    </section>"""
    cards = "".join(f'<div class="drill"><div class="num">{i:02d}</div><div><div class="for">FOR: A BETTER VIDEO</div><p>{E(t_)}</p></div></div>'
                    for i, t_ in enumerate(FILM_TIPS, 1))
    drills = f"""
    <section class="rise" style="--d:.55s">
      <div class="head"><span class="idx">02</span><span class="label">HOW TO FILM IT AGAIN</span></div>
      <div class="drills">{cards}</div>
    </section>"""
    badge_html = '<span class="check bad"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 6v8M12 18v.01" fill="none" stroke="#1a0904" stroke-width="3" stroke-linecap="round"/></svg></span>SCAN NOT CLEAR'
    h1_html = "Flare<br>scan <em class=\"bad\">unclear</em>"
    live_html = '<span class="live bad"><i></i>RESCAN NEEDED</span>'
    checks_section = ""
    tips_section = ""
    notice = ""
else:
    badge_html = '<span class="check"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#04120e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>SCAN COMPLETE'
    h1_html = "Flare<br>scan <em>success</em>"
    live_html = '<span class="live"><i></i>ANALYSIS DONE</span>'
    notice = f'<div class="notice rise" style="--d:.25s"><b>HEADS UP</b>{E(caution_text)}</div>' if track_level == "caution" else ""
    checks_section = f"""
  <section class="rise" style="--d:.45s">
    <div class="head"><span class="idx">02</span><span class="label">WHAT I SAW</span></div>
    <div class="grid">{tiles}</div>
  </section>"""
    tips_section = f"""
  <section class="rise" style="--d:.65s">
    <div class="head"><span class="idx">04</span><span class="label">FOR EVERY FLARE</span><span class="swipe">SWIPE →</span></div>
    <div class="nexts">{nxt}</div>
  </section>"""

REPLAY_SCRIPT = r"""<script>
const R = __REPLAY__;
const cv = document.getElementById('cv'), cx = cv.getContext('2d');
const clock = document.getElementById('clock'), prog = document.getElementById('prog');
const J = Object.fromEntries(R.joints.map((n, i) => [n, i]));
const BONES = [["left_shoulder","right_shoulder"],["left_hip","right_hip"],["left_shoulder","left_hip"],["right_shoulder","right_hip"],
  ["left_shoulder","left_elbow"],["left_elbow","left_wrist"],["right_shoulder","right_elbow"],["right_elbow","right_wrist"],
  ["left_hip","left_knee"],["left_knee","left_ankle"],["left_ankle","left_heel"],
  ["right_hip","right_knee"],["right_knee","right_ankle"],["right_ankle","right_heel"]];
const W = cv.width, H = cv.height, PAD = 130;
const [bx0, by0, bx1, by1] = R.box;
const sc = Math.min((W - 2*PAD) / Math.max(bx1 - bx0, 1), (H - 2*PAD) / Math.max(by1 - by0, 1));
const ox = (W - sc * (bx1 - bx0)) / 2 - sc * bx0, oy = (H - sc * (by1 - by0)) / 2 - sc * by0 + 10;
const P = (p) => [p[0] * sc + ox, p[1] * sc + oy];
const N = R.frames.length, total = N * R.dt, HOLD = 1.0;
// in-between pictures: glide from one frame to the next so the movement is smooth, not steppy
function pose(fi, u) {
  const a = R.frames[fi], b = R.frames[Math.min(N - 1, fi + 1)];
  return a.map((p, i) => {
    const q = b[i];
    if (p && q) return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    return p;
  });
}
function line(A, B, glow, core) {
  cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]);
  cx.strokeStyle = 'rgba(46,242,192,.16)'; cx.lineWidth = glow; cx.stroke();
  cx.strokeStyle = '#2ef2c0'; cx.lineWidth = core; cx.stroke();
  cx.strokeStyle = 'rgba(225,255,248,.85)'; cx.lineWidth = Math.max(1, core / 3); cx.stroke();
}
function draw(fi, u = 0) {
  cx.clearRect(0, 0, W, H);
  const fy = R.floor * sc + oy;
  const g = cx.createLinearGradient(0, fy, W, fy);
  g.addColorStop(0, 'rgba(46,242,192,0)'); g.addColorStop(.5, 'rgba(46,242,192,.7)'); g.addColorStop(1, 'rgba(46,242,192,0)');
  cx.fillStyle = g; cx.fillRect(0, fy, W, 2);
  const fade = cx.createLinearGradient(0, fy, 0, fy + 90);
  fade.addColorStop(0, 'rgba(46,242,192,.10)'); fade.addColorStop(1, 'rgba(46,242,192,0)');
  cx.fillStyle = fade; cx.fillRect(0, fy + 2, W, 90);
  const fr = pose(fi, u);
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const [a, b] of BONES) {
    const pa = fr[J[a]], pb = fr[J[b]]; if (!pa || !pb) continue;
    line(P(pa), P(pb), 18, 6);
  }
  const sh = [fr[J.left_shoulder], fr[J.right_shoulder]].filter(Boolean);
  const hd = fr[J.head];
  if (hd) {
    const Hh = P(hd);
    if (sh.length === 2) line(P([(sh[0][0] + sh[1][0]) / 2, (sh[0][1] + sh[1][1]) / 2]), Hh, 18, 6);
    cx.beginPath(); cx.arc(Hh[0], Hh[1], 24, 0, 7); cx.fillStyle = 'rgba(39,200,255,.14)'; cx.fill();
    cx.beginPath(); cx.arc(Hh[0], Hh[1], 15, 0, 7);
    cx.fillStyle = '#0b0d0e'; cx.fill(); cx.lineWidth = 4; cx.strokeStyle = '#27c8ff'; cx.stroke();
  }
  for (const n of R.joints) {
    if (n === 'head') continue; const p = fr[J[n]]; if (!p) continue;
    const q = P(p);
    cx.beginPath(); cx.arc(q[0], q[1], 13, 0, 7); cx.fillStyle = 'rgba(46,242,192,.18)'; cx.fill();
    cx.beginPath(); cx.arc(q[0], q[1], 6.5, 0, 7); cx.fillStyle = '#fff'; cx.fill();
  }
  if (R.lost[fi]) {
    cx.font = "22px 'Space Mono', monospace"; cx.textAlign = 'center';
    cx.fillStyle = 'rgba(255,122,89,.95)'; cx.fillText('// TRACKING LOST', W / 2, H / 2);
  }
}
let t0 = null;
function tick(ts) {
  if (t0 === null) t0 = ts;
  const t = ((ts - t0) / 1000) % (total + HOLD);
  const tc = Math.min(t, total - 0.0001);
  const f = tc / R.dt, fi = Math.min(N - 1, Math.floor(f));
  draw(fi, f - fi);
  const tt = R.t0 + Math.min(t, total);
  clock.textContent = String(Math.floor(tt / 60)).padStart(2, '0') + ':' + (tt % 60).toFixed(1).padStart(4, '0');
  prog.style.width = (Math.min(t, total) / total * 100) + '%';
  requestAnimationFrame(tick);
}
if (N > 1) requestAnimationFrame(tick);
</script>""".replace("__REPLAY__", REPLAY_JSON)

PAGE = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#07090a">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Flare feedback</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {{ --bg:#07090a; --text:#f2f5f4; --muted:#7f8d8a; --mint:#2ef2c0; --cyan:#27c8ff; --violet:#8a6bff; --coral:#ff7a59;
    --glass:rgba(255,255,255,.045); --edge:rgba(255,255,255,.09); }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  html {{ background:var(--bg); }}
  body {{ background:var(--bg); color:var(--text); font-family:'Space Grotesk',system-ui,sans-serif; display:flex; justify-content:center; min-height:100vh; -webkit-font-smoothing:antialiased; }}
  .mono, .label, .tag, .chip, .top, .for, .idx, .num, .nn, .pill {{ font-family:'Space Mono',ui-monospace,monospace; }}

  /* ---- background: slow aurora, fine grid, film grain ---- */
  .bg {{ position:fixed; inset:0; overflow:hidden; pointer-events:none; z-index:0; }}
  .blob {{ position:absolute; border-radius:50%; filter:blur(70px); opacity:.55; animation:drift 16s ease-in-out infinite alternate; }}
  .b1 {{ width:420px; height:420px; background:#0f8f86; left:-120px; top:-100px; }}
  .b2 {{ width:360px; height:360px; background:#5b3fd6; right:-140px; top:260px; opacity:.38; animation-duration:22s; }}
  .b3 {{ width:380px; height:380px; background:#0b7fa8; left:20%; bottom:-180px; opacity:.32; animation-duration:19s; }}
  @keyframes drift {{ to {{ transform:translate(50px,70px) scale(1.15); }} }}
  .grid-bg {{ position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
    background-size:34px 34px; -webkit-mask:radial-gradient(80% 60% at 50% 20%,#000,transparent); mask:radial-gradient(80% 60% at 50% 20%,#000,transparent); }}
  .grain {{ position:absolute; inset:0; opacity:.07; mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>"); }}

  .phone {{ position:relative; z-index:1; width:100%; max-width:440px; padding:calc(22px + env(safe-area-inset-top)) calc(18px + env(safe-area-inset-right)) calc(60px + env(safe-area-inset-bottom)) calc(18px + env(safe-area-inset-left)); }}
  html {{ -webkit-text-size-adjust:100%; }}
  body {{ overflow-x:hidden; -webkit-tap-highlight-color:transparent; }}

  /* ---- top bar ---- */
  .top {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:26px; }}
  .brand {{ display:flex; align-items:center; gap:10px; font-family:'Space Mono',monospace; font-size:11px; letter-spacing:.16em; color:var(--text); }}
  .brand svg {{ filter:drop-shadow(0 0 8px rgba(46,242,192,.7)); }}
  .brand span {{ color:var(--mint); }}
  .live {{ display:flex; align-items:center; gap:8px; font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:.14em; color:var(--mint);
    border:1px solid rgba(46,242,192,.3); background:rgba(46,242,192,.08); padding:7px 11px; border-radius:99px; backdrop-filter:blur(10px); }}
  .live i {{ width:6px; height:6px; border-radius:50%; background:var(--mint); box-shadow:0 0 10px var(--mint); animation:pulse 1.8s infinite; }}
  @keyframes pulse {{ 50% {{ opacity:.25; }} }}

  /* ---- headline ---- */
  .success {{ display:inline-flex; align-items:center; gap:10px; font-family:'Space Mono',monospace; font-size:11.5px; letter-spacing:.18em; color:var(--mint); margin-bottom:14px; }}
  .check {{ width:24px; height:24px; border-radius:50%; background:var(--mint); display:grid; place-items:center; box-shadow:0 0 22px rgba(46,242,192,.6); }}
  h1 {{ font-size:62px; line-height:.88; font-weight:700; letter-spacing:-.035em; text-transform:uppercase; }}
  h1 em {{ font-style:normal; background:linear-gradient(95deg,var(--mint),var(--cyan) 55%,var(--violet)); -webkit-background-clip:text; background-clip:text; color:transparent;
    filter:drop-shadow(0 0 22px rgba(46,242,192,.35)); }}
  .pills {{ display:flex; flex-wrap:wrap; gap:8px; margin:20px 0 22px; }}
  .pill {{ display:inline-flex; align-items:center; gap:8px; font-size:11px; letter-spacing:.12em; color:var(--muted); background:var(--glass); border:1px solid var(--edge);
    padding:7px 11px; border-radius:99px; backdrop-filter:blur(10px); }}
  .pill i {{ width:5px; height:5px; border-radius:50%; background:var(--mint); box-shadow:0 0 8px var(--mint); }}
  .pill b {{ color:var(--text); font-weight:700; }}

  /* ---- the replay: a little HUD screen ---- */
  .player {{ position:relative; border-radius:28px; overflow:hidden; border:1px solid rgba(46,242,192,.22);
    background:radial-gradient(90% 70% at 50% 105%, rgba(24,150,140,.42), rgba(8,12,13,.92) 68%);
    box-shadow:0 30px 80px -30px rgba(46,242,192,.35), inset 0 0 0 1px rgba(255,255,255,.03); }}
  .player::before {{ content:""; position:absolute; inset:0; background-image:linear-gradient(rgba(46,242,192,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(46,242,192,.06) 1px,transparent 1px);
    background-size:30px 30px; -webkit-mask:radial-gradient(70% 70% at 50% 60%,#000,transparent); mask:radial-gradient(70% 70% at 50% 60%,#000,transparent); }}
  .prings {{ position:absolute; left:50%; bottom:-180px; width:440px; height:440px; transform:translateX(-50%); border-radius:50%; opacity:.5;
    background:repeating-radial-gradient(circle, transparent 0 11px, rgba(46,242,192,.3) 11px 12px);
    -webkit-mask:radial-gradient(circle,#000 15%,transparent 68%); mask:radial-gradient(circle,#000 15%,transparent 68%); }}
  .scan {{ position:absolute; left:0; right:0; top:0; height:90px; pointer-events:none; opacity:.9;
    background:linear-gradient(to bottom, transparent, rgba(46,242,192,.10) 70%, rgba(46,242,192,.5) 99%, transparent); animation:sweep 4.2s cubic-bezier(.5,0,.5,1) infinite; }}
  @keyframes sweep {{ from {{ transform:translateY(-100%); }} to {{ transform:translateY(520%); }} }}
  .corner {{ position:absolute; width:22px; height:22px; border:2px solid var(--mint); opacity:.9; filter:drop-shadow(0 0 6px rgba(46,242,192,.7)); }}
  .c1 {{ left:14px; top:14px; border-right:0; border-bottom:0; border-top-left-radius:8px; }}
  .c2 {{ right:14px; top:14px; border-left:0; border-bottom:0; border-top-right-radius:8px; }}
  .c3 {{ left:14px; bottom:14px; border-right:0; border-top:0; border-bottom-left-radius:8px; }}
  .c4 {{ right:14px; bottom:14px; border-left:0; border-top:0; border-bottom-right-radius:8px; }}
  #cv {{ position:relative; display:block; width:100%; height:auto; aspect-ratio:1/1; }}
  .hud-top {{ position:absolute; left:46px; right:46px; top:20px; display:flex; justify-content:space-between; align-items:center; font-family:'Space Mono',monospace; font-size:10px; letter-spacing:.16em; color:var(--muted); }}
  .rec {{ display:flex; align-items:center; gap:7px; color:var(--coral); }}
  .rec i {{ width:7px; height:7px; border-radius:50%; background:var(--coral); box-shadow:0 0 10px var(--coral); animation:pulse 1.2s infinite; }}
  .hud-bot {{ position:absolute; left:46px; right:46px; bottom:22px; }}
  #clock {{ font-family:'Space Mono',monospace; font-size:26px; font-weight:700; letter-spacing:.04em; text-shadow:0 0 18px rgba(46,242,192,.5); }}
  .track {{ margin-top:8px; height:3px; background:rgba(255,255,255,.1); border-radius:3px; }}
  .track i {{ display:block; height:100%; width:0; background:linear-gradient(90deg,var(--mint),var(--cyan)); border-radius:3px; box-shadow:0 0 12px var(--mint); }}
  .sub {{ color:var(--muted); font-size:12.5px; margin:14px 2px 38px; font-family:'Space Mono',monospace; letter-spacing:.04em; }}
  .sub b {{ color:var(--text); font-weight:400; }}

  /* ---- section headers ---- */
  section {{ margin-bottom:40px; }}
  .head {{ display:flex; align-items:center; gap:12px; margin-bottom:16px; }}
  .idx {{ color:#04120e; background:linear-gradient(135deg,var(--mint),var(--cyan)); font-size:11px; font-weight:700; padding:3px 8px; border-radius:7px; box-shadow:0 0 16px rgba(46,242,192,.35); }}
  .label {{ color:var(--text); font-size:11.5px; letter-spacing:.18em; }}
  .head::after {{ content:""; flex:1; height:1px; background:linear-gradient(90deg,rgba(255,255,255,.16),transparent); }}
  .swipe {{ order:3; font-family:'Space Mono',monospace; font-size:10px; letter-spacing:.14em; color:var(--muted); }}

  /* ---- the main remark: glowing glass card with a gradient edge ---- */
  .focus {{ position:relative; overflow:hidden; border-radius:30px; padding:26px 22px 26px; margin-bottom:40px;
    background:linear-gradient(160deg,rgba(24,60,58,.75),rgba(10,14,15,.85) 62%); backdrop-filter:blur(16px);
    box-shadow:0 40px 90px -40px rgba(46,242,192,.5), inset 0 1px 0 rgba(255,255,255,.08); }}
  .focus::before {{ content:""; position:absolute; inset:0; border-radius:30px; padding:1.2px; pointer-events:none;
    background:linear-gradient(140deg,rgba(46,242,192,.9),rgba(39,200,255,.25) 35%,rgba(138,107,255,.5) 70%,rgba(46,242,192,.7));
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; }}
  .rings {{ position:absolute !important; right:-100px; top:-100px; width:320px; height:320px; border-radius:50%; opacity:.5;
    background:repeating-radial-gradient(circle, transparent 0 14px, rgba(46,242,192,.3) 14px 15px);
    -webkit-mask:radial-gradient(circle,#000 20%,transparent 70%); mask:radial-gradient(circle,#000 20%,transparent 70%); }}
  .focus > * {{ position:relative; }}
  .tag {{ display:inline-flex; align-items:center; gap:8px; font-size:10.5px; letter-spacing:.16em; color:var(--mint); margin-bottom:18px; }}
  .tag i {{ width:8px; height:8px; background:var(--mint); border-radius:2px; box-shadow:0 0 12px var(--mint); }}
  .focus h2 {{ font-size:40px; line-height:.98; font-weight:700; letter-spacing:-.025em; margin-bottom:16px;
    background:linear-gradient(180deg,#fff 30%,#b9fff0); -webkit-background-clip:text; background-clip:text; color:transparent; }}
  .focus p {{ font-size:16.5px; line-height:1.58; color:#cfdad7; }}
  .focus.also {{ margin-top:-18px; padding:22px 22px 24px; }}
  .focus.also h2 {{ font-size:28px; margin-bottom:12px; }}
  .focus.also p {{ font-size:15.5px; }}
  .why {{ margin-top:20px; padding:16px; border-radius:18px; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.07); }}
  .why .wl {{ font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:.16em; color:var(--cyan); margin-bottom:8px; }}
  .focus .why p {{ font-size:14.5px; line-height:1.55; color:#a9b9b5; }}

  /* ---- the checks: bento tiles ---- */
  .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
  .tile {{ position:relative; border-radius:22px; padding:14px 14px 15px; background:var(--glass); border:1px solid var(--edge); backdrop-filter:blur(12px); transition:transform .25s, border-color .25s; }}
  .tile:hover {{ transform:translateY(-2px); border-color:rgba(46,242,192,.35); }}
  .tile.bad {{ grid-column:1 / -1; border-color:rgba(255,122,89,.35); background:linear-gradient(150deg,rgba(255,122,89,.13),rgba(255,255,255,.03) 60%); box-shadow:0 20px 50px -28px rgba(255,122,89,.6); }}
  .tile.wide {{ grid-column:1 / -1; }}
  .trow {{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:14px; }}
  .ti {{ width:30px; height:30px; border-radius:10px; display:grid; place-items:center; }}
  .ti.ok {{ color:var(--mint); background:rgba(46,242,192,.12); box-shadow:0 0 18px rgba(46,242,192,.22); }}
  .ti.bad {{ color:var(--coral); background:rgba(255,122,89,.16); box-shadow:0 0 18px rgba(255,122,89,.3); }}
  .ti.na {{ color:var(--muted); background:rgba(255,255,255,.06); }}
  .tname {{ font-weight:700; font-size:17px; letter-spacing:-.01em; }}
  .tile p {{ margin-top:8px; font-size:15px; line-height:1.45; color:#ecd2ca; }}
  .td {{ margin-top:6px; font-size:12.5px; line-height:1.4; color:var(--muted); }}
  .chip {{ font-size:9.5px; letter-spacing:.12em; padding:5px 9px; border-radius:99px; white-space:nowrap; }}
  .chip.ok {{ color:var(--mint); background:rgba(46,242,192,.1); border:1px solid rgba(46,242,192,.3); }}
  .chip.bad {{ color:var(--coral); background:rgba(255,122,89,.1); border:1px solid rgba(255,122,89,.4); }}
  .chip.na {{ color:var(--muted); border:1px solid var(--edge); }}
  .tile.na .tname {{ color:var(--muted); }}

  /* ---- drills ---- */
  .drills {{ display:grid; gap:10px; }}
  .drill {{ position:relative; display:flex; gap:16px; align-items:center; border-radius:22px; padding:16px 16px 16px 18px; background:var(--glass); border:1px solid var(--edge); backdrop-filter:blur(12px); overflow:hidden; transition:transform .25s; }}
  .drill:hover {{ transform:translateY(-2px); }}
  .drill::before {{ content:""; position:absolute; left:0; top:14px; bottom:14px; width:3px; border-radius:3px; background:linear-gradient(var(--mint),var(--cyan)); box-shadow:0 0 12px var(--mint); }}
  .num {{ font-size:36px; font-weight:700; line-height:1; flex:none; color:transparent; -webkit-text-stroke:1.2px var(--mint); filter:drop-shadow(0 0 10px rgba(46,242,192,.4)); }}
  .for {{ display:inline-block; font-size:9.5px; letter-spacing:.14em; color:var(--cyan); margin-bottom:7px; }}
  .drill p {{ font-size:15.5px; line-height:1.48; }}

  /* ---- tips: swipeable cards ---- */
  .nexts {{ display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; margin:0 -18px; padding:4px 18px 14px; scrollbar-width:none; }}
  .nexts::-webkit-scrollbar {{ display:none; }}
  .next {{ position:relative; flex:0 0 84%; scroll-snap-align:center; border-radius:26px; padding:20px; background:var(--glass); border:1px solid var(--edge); backdrop-filter:blur(12px); overflow:hidden; }}
  .next.ask {{ background:linear-gradient(155deg,rgba(138,107,255,.22),rgba(255,255,255,.03) 65%); border-color:rgba(138,107,255,.5); box-shadow:0 24px 60px -30px rgba(138,107,255,.7); }}
  .nn {{ width:36px; height:36px; border-radius:12px; display:grid; place-items:center; margin-bottom:16px; font-weight:700; font-size:15px; color:#04120e;
    background:linear-gradient(135deg,var(--mint),var(--cyan)); box-shadow:0 0 22px rgba(46,242,192,.4); }}
  .next.ask .nn {{ background:linear-gradient(135deg,var(--violet),var(--cyan)); box-shadow:0 0 22px rgba(138,107,255,.55); color:#fff; }}
  .next h4 {{ font-size:15px; letter-spacing:.07em; margin-bottom:10px; }}
  .next p {{ font-size:15px; line-height:1.55; color:#b7c3c0; }}
  .foot {{ display:flex; flex-direction:column; align-items:center; gap:10px; color:var(--muted); font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:.24em; margin-top:10px; }}
  .foot::before {{ content:""; width:40px; height:2px; border-radius:2px; background:linear-gradient(90deg,transparent,var(--mint),transparent); }}

  @media (hover:none) {{ .tile:hover, .drill:hover {{ transform:none; }} }}
  @media (max-width:360px) {{ h1 {{ font-size:50px; }} .focus h2 {{ font-size:34px; }} .next {{ flex-basis:88%; }} }}
  .notice {{ margin:-18px 0 34px; padding:14px 16px; border-radius:18px; font-size:14px; line-height:1.5; color:#e8d6a8; background:rgba(255,196,77,.08); border:1px solid rgba(255,196,77,.3); }}
  .notice b {{ display:block; font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:.16em; color:#ffc44d; margin-bottom:6px; }}
  h1 em.bad {{ background:linear-gradient(95deg,#ff9a59,#ff5a5a 60%,#ff7ab8); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 0 22px rgba(255,122,89,.35)); }}
  .check.bad {{ background:var(--coral); box-shadow:0 0 22px rgba(255,122,89,.6); }}
  .live.bad {{ color:var(--coral); border-color:rgba(255,122,89,.4); background:rgba(255,122,89,.08); }}
  .live.bad i {{ background:var(--coral); box-shadow:0 0 10px var(--coral); }}
  .idx.bad {{ background:linear-gradient(135deg,#ff9a59,#ff5a5a); }}
  .tag.bad {{ color:var(--coral); }} .tag.bad i {{ background:var(--coral); box-shadow:0 0 12px var(--coral); }}
  .focus.bad::before {{ background:linear-gradient(140deg,rgba(255,122,89,.9),rgba(255,90,90,.25) 40%,rgba(255,122,184,.5) 75%,rgba(255,122,89,.7)); }}
  .focus.bad {{ background:linear-gradient(160deg,rgba(70,28,22,.6),rgba(12,12,13,.88) 62%); box-shadow:0 40px 90px -40px rgba(255,122,89,.45), inset 0 1px 0 rgba(255,255,255,.08); }}
  .focus.bad h2 {{ background:linear-gradient(180deg,#fff 30%,#ffd2c4); -webkit-background-clip:text; background-clip:text; color:transparent; }}
  ul.reasons {{ list-style:none; margin-top:16px; display:grid; gap:8px; }}
  ul.reasons li {{ padding:12px 14px; border-radius:14px; font-size:15px; background:rgba(0,0,0,.28); border:1px solid rgba(255,122,89,.25); color:#f0d9d1; }}
  /* ---- entrance ---- */
  .rise {{ opacity:0; transform:translateY(16px); animation:rise .7s var(--d,0s) forwards cubic-bezier(.2,.7,.2,1); }}
  @keyframes rise {{ to {{ opacity:1; transform:none; }} }}
  @media (prefers-reduced-motion:reduce) {{ .rise {{ animation:none; opacity:1; transform:none; }} .live i, .blob, .scan, .rec i {{ animation:none; }} }}
</style></head>
<body>
<div class="bg"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><div class="grid-bg"></div><div class="grain"></div></div>
<main class="phone">
  <div class="top">
    <div class="brand"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#2ef2c0" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="#2ef2c0"/></svg>FLARE<span>//</span>CHECK</div>
    {live_html}
  </div>
  <div class="success rise">{badge_html}</div>
  <h1 class="rise" style="--d:.05s">{h1_html}</h1>
  <div class="pills rise" style="--d:.1s">{chips}</div>
  <div class="player rise" style="--d:.15s">
    <div class="prings"></div><div class="scan"></div>
    <canvas id="cv" width="760" height="760"></canvas>
    <span class="corner c1"></span><span class="corner c2"></span><span class="corner c3"></span><span class="corner c4"></span>
    <div class="hud-top"><span>// YOUR FLARE, SCANNED</span><span class="rec"><i></i>REPLAY</span></div>
    <div class="hud-bot"><div id="clock">00:00.0</div><div class="track"><i id="prog"></i></div></div>
  </div>
  <p class="sub rise" style="--d:.2s">Looked at <b>{E(seen)}</b> · {E(seen_suffix)}</p>
  {notice}
  {focus}
  {checks_section}
  {drills}
  {tips_section}
  <div class="foot">KEEP TRAINING</div>
</main>
{REPLAY_SCRIPT}
</body></html>"""

with open(PAGE_OUT, "w", encoding="utf-8") as f:
    f.write(PAGE)
print(f"Feedback page saved as: {PAGE_OUT}")
if OPEN_PAGE:
    try:
        webbrowser.open("file:///" + PAGE_OUT.replace(os.sep, "/"))
    except Exception:
        pass
