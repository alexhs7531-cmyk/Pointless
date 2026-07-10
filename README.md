# POINTLESS — Family Edition 🏆

A self-contained browser recreation of the *Pointless* studio graphics for playing at home. You're the host with full control over the questions; two or three quizzers try to score as **few** points as possible. Correct answers count down from 100 on the tower exactly like the show — including the suspense finish, where the ticks stretch right out as the counter drops into single digits (…3… 2…… 1……… POINTLESS). Wrong answers slam up the red ✕ and add 100, and a genuine pointless answer (0) lights the tower up with the P-O-I-N-T-L-E-S-S celebration.

No build step, no dependencies, no audio files — everything (including the sound effects) is generated in the browser. Three files: `index.html`, `style.css`, `app.js`.

## Quick start

**On GitHub Pages (recommended):**
1. Create a new repository and upload `index.html`, `style.css` and `app.js` to the root.
2. Repo **Settings → Pages → Deploy from a branch → main / (root) → Save**.
3. Open `https://<your-username>.github.io/<repo-name>/` — you're the host.

**Locally:** just double-click `index.html`. Everything works in a single window. (The pop-out TV display window needs the page to be served over http, so use GitHub Pages or `python -m http.server` for the two-window setup.)

## How a game runs

The screen is split into the **stage** (what the players watch) and the **host panel** (a drawer along the bottom that only you use — press **H** to hide/show it).

1. **Question Bank tab** — add a question and its answers, giving each answer a score from 0–100 (in the show this is how many of 100 surveyed people said it; here you decide). 0 = a pointless answer. You can add, edit, import or duplicate questions **at any time, including mid-game**, without touching the scores.
2. **Play** any question, in any order you like. The board announces it and tells the first quizzer to answer. The first-answerer rotates automatically each round through everyone playing: with three quizzers, round 1 starts with Quizzer 1, round 2 with Quizzer 2, round 3 with Quizzer 3, and back around.
3. A quizzer says their answer out loud. On the **Game tab**, click the matching answer — the tower counts down from 100 to its score with the ticking effect. If what they said isn't on your list, hit **✕ Wrong answer (+100)** (optionally typing what they said so it appears on screen).
4. Once both have answered, click **Bank scores & continue** — the totals roll up on the podiums and the round advances.
5. Between answers you can hit **Reveal full list on screen** to show every answer sorted lowest-first, just like the end-of-round reveal on the show.
6. When you're done, **End game & show winner** crowns whoever has the **lowest** total.

Misclicked? **Undo** rolls back the last action (answers, banks, even ending the game).

## Playing on a TV (so they can't see your answers)

In **Settings → Open display window**, a second clean window opens showing only the stage — no host panel, no answers. Then either:

- **Casting (Chromecast etc.):** in Chrome, cast **that tab only** — ⋮ menu → **Cast…** → **Sources** → **Cast tab** — with the display tab selected. The TV shows just the stage and scoreboard; your host tab, with every question and answer on it, stays private on your laptop. (Don't use "Cast screen", which mirrors everything.)
- **HDMI / extended display:** drag the display window onto the TV and press **F** for fullscreen.

It mirrors every animation live. Click the display once when it opens (browsers require one click before sound can play).

Notes:
- Both windows must be on the **same computer and browser** (they sync via BroadcastChannel).
- If sound plays from both windows, press **M** in one to mute just that window.
- On a single shared screen instead? Turn on **Settings → Blur answers here** — answer buttons stay blurred until you hover over them.

## Question JSON format

**Import/Export JSON** in the Question Bank uses this shape, so you can prep a whole evening's questions in a text editor:

```json
[
  {
    "question": "Films starring Tom Hanks",
    "answers": [
      { "text": "Forrest Gump", "score": 78 },
      { "text": "Cast Away", "score": 54 },
      { "text": "The 'Burbs", "score": 3 },
      { "text": "The Ladykillers", "score": 0 }
    ]
  }
]
```

Scores are clamped to 0–100. Everything (questions, names, totals, the live round) is saved to your browser's localStorage, so a refresh or crash mid-game loses nothing. **New game** resets scores but keeps your questions.

## Settings & shortcuts

- **Players** — rename your quizzers (e.g. Mike and Clare) and **add a third quizzer** with one click; remove one again with the ✕ next to their name. Change the roster between questions, not mid-question.
- **Countdown speed** — ms per point (default 75, so a big countdown takes a satisfying few seconds).
- **Suspense finish** — on by default: below 12 the ticks stretch out progressively, hitting roughly a 1s pause into 2, 1.2s into 1, and 1.4s onto POINTLESS at the default speed. Turn it off for uniform ticking.
- **H** toggle host panel · **F** fullscreen · **M** mute this window.
- A sample pack of five questions is included so you can try the graphics immediately (George Lazenby will get you the pointless celebration).

## Disclaimer

This is an unofficial fan-made homage for private family use. *Pointless* is a BBC programme produced by Remarkable Entertainment (Banijay UK); this project is not affiliated with, or endorsed by, them in any way. No assets from the show are used — all graphics and sounds here are original recreations in CSS/JS.
