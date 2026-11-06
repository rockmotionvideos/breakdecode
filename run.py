# FILE NAME: run.py
# Scans a video from start to finish: skeleton first, then the flare feedback.
#   python run.py testing.mp4            = scan the video (skips the slow part if its data file already exists)
#   python run.py testing.mp4 redo       = force the skeleton step again
#   python run.py testing.mp4 all        = judge every flare in the video
#   python run.py testing.mp4 2          = judge only flare number 2
#   python run.py testing.mp4 nozoom     = faster skeleton step, without the zoom pass
import os
import sys
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))

if len(sys.argv) < 2:
    raise SystemExit("Type the video name after run.py, for example:  python run.py testing.mp4")

video = sys.argv[1]
words = [a.lower() for a in sys.argv[2:]]
redo = "redo" in words
nozoom = "nozoom" in words
extra = [a for a in sys.argv[2:] if a.lower() not in ("redo", "nozoom")]

if not os.path.exists(video):
    alt = os.path.join(HERE, video)
    if os.path.exists(alt):
        video = alt
    else:
        raise SystemExit("I can't find " + video + ". Is it in this folder?")

base = os.path.splitext(video)[0]
csv_path = base + "_rtm_data.csv"

if redo or not os.path.exists(csv_path) or os.path.getsize(csv_path) < 1000:
    print("Step 1: finding the skeleton in " + video + " ...")
    cmd = [sys.executable, os.path.join(HERE, "Skeleton.py"), video]
    if nozoom:
        cmd.append("nozoom")
    if subprocess.run(cmd).returncode != 0:
        raise SystemExit("The skeleton step failed. Scroll up to see why.")
else:
    print("Step 1: skipped, " + csv_path + " already exists (add  redo  to do it again).")

print("Step 2: judging the flare ...")
subprocess.run([sys.executable, os.path.join(HERE, "analyze_flares.py"), csv_path] + extra)
