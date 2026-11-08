# BreakDecode (phone web app)

Runs fully in the phone's browser: no server, no account. Same idea as CoolCaps.

## What's in here
- `index.html` the app (open this)
- `lab.html` the speed / skeleton test page (open this first on your phone)
- `js/judge.js` your flare judge, ported from analyze_flares.py (edit the coach's words at the top)
- `js/pose.js` finds the skeleton on the phone (MediaPipe)
- `js/app.js`, `js/result.js`, `js/share.js`, `js/styles.js` the screens, feedback page, share cards and look
- `sw.js`, `manifest.webmanifest`, `icons/` make it installable and work offline

## Put it online (pick one)
**Netlify Drop (fastest):** go to https://app.netlify.com/drop and drag this whole folder onto the page.
**GitHub Pages:** upload everything in this folder to the repo (keep the `js` and `icons` folders), then
Settings > Pages > Branch `main` > `/ (root)` > Save. Link: https://YOURNAME.github.io/REPO/

## Updating later
Change the number in `sw.js` (`const V = "bd-v1"` to `"bd-v2"`) every time you upload a new version, so phones pick it up.

## Good to know
- The first scan downloads the pose model (a few MB). After that it works offline.
- Videos are never uploaded or saved. Only the results and one small picture are kept, on the phone.
- The judge's numbers were tuned on the desktop skeleton (RTMPose). The phone skeleton (MediaPipe) is a different model, so the limits may need a little retuning after real tests.


## Pro engine (RTMPose)
The app works without it (it then uses the Standard engine). To turn the Pro engine on, run `prepare_models.py` on your PC,
then upload the `models` folder it creates (inside `web`) to the repo, next to `js`. Settings then says "Pro engine installed".
