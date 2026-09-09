<p align="center">
  <img src="static/img/logo-128.png" width="88" alt="Dramaz logo">
</p>

<h1 align="center">Dramaz</h1>

<p align="center">
  <b>An AI micro-drama studio that turns "what's trending right now" into a full, production-ready season — logline, cast, episode arc, and shot-by-shot AI image/video prompts.</b>
</p>

<p align="center">
  <a href="https://dramaz.onrender.com/"><img alt="Live Demo" src="https://img.shields.io/badge/demo-live-cf9e5b?style=flat-square"></a>
  <img alt="Python" src="https://img.shields.io/badge/python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white">
  <img alt="Flask" src="https://img.shields.io/badge/flask-3.x-000000?style=flat-square&logo=flask&logoColor=white">
  <img alt="Gemini" src="https://img.shields.io/badge/AI-Gemini%203.1-8E75B2?style=flat-square">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
</p>

<p align="center"><a href="https://dramaz.onrender.com/"><b>Live demo →</b></a></p>

---

## Demo

https://github.com/user-attachments/assets/c91c787c-2b42-41fb-b346-3fdfa1994c80

The Studio tab's live node graph, growing in real time as trends are discovered and selected. [**▶ Watch the full 2-minute demo**](media/demo.mp4) for the complete walkthrough — trend scouting, concept/season/episode generation, and the shot-by-shot AI prompts, end to end.

## The problem

Vertical micro-drama (ReelShort, DramaBox, ShortMax-style series) is one of the fastest-moving content formats on the internet — new tropes go viral and burn out within days. Writers rooms for this format are usually a solo creator juggling four very different jobs at once: trend research, story/concept design, season-arc plotting, and — the part that eats the most time — turning every single scene into a precise, structured AI image/video generation prompt that won't come out looking generic.

**Dramaz automates that whole chain**, end to end, while keeping a human in the loop at every checkpoint: nothing advances to the next stage until you explicitly approve it.

## How it works

Dramaz models the process as four specialist "agents," each one a Gemini call with a narrow, well-defined job and a strict output schema so the frontend always gets a shape it can render:

| Stage | Agent | What it does |
|---|---|---|
| 1 | **Trend Scout** | Runs a live web search (via Parallel) for what's currently trending in AI micro-drama, then has Gemini extract 5 concrete niches/tropes with a one-line seed and source link — never the same list twice, even for a re-search |
| 2 | **Concept Architect** | Picks a director + cinematographer style blend from a 20+ entry style library, then writes a logline, core conflict, a right-sized character sheet (2–6 people, not a fixed number), and a location list |
| 3 | **Season Planner** | Plans a full episode-by-episode arc (15–30 one-minute episodes) — a hook and a cliffhanger for every episode, tuned to force a binge |
| 4 | **Episode Director** | Breaks one episode into shot-by-shot scenes, and for each scene writes a fully structured **image prompt** (camera angle, lens, lighting, texture, color grade) and **video prompt** (one camera movement described in a strict six-slot template: movement, start, speed, framing, end, time) — then recommends which image/video model to actually generate it with |

At every stage you can **refine** (tell it what to change and it regenerates a genuinely different take, not a reworded one) or **approve** and move on. Approving is what unlocks the next stage — there's no way to accidentally skip ahead.

### Studio — the pipeline as a live graph

The **Studio** tab isn't a fixed diagram — it's a node graph built purely from your project's current state. It starts with a single "Trend Scout" node; scouting fans out one node per discovered niche; the trends you actually select wire into a new "Concept Architect" node; and the graph keeps growing through Season Planner and Episode Director as you progress, with one leaf node per episode you approve. Pan, zoom, and drag any node — your layout is remembered, and because the graph is a pure function of state, refreshing the page reconstructs it exactly.

### Office — the team, at a glance

The **Office** tab is a single status board: four roles, one photo, live "working / done / idle" indicators synced to the same pipeline state Studio reads.

## Why this approach

- **Structured output over prose parsing.** Every Gemini call uses `response_schema` (strict JSON schema) alongside a high temperature (1.35) — the schema guarantees shape (field names, array lengths, required fields) no matter how creative the content gets, so the frontend never has to defensively parse free-form text.
- **Explicit anti-convergence.** Left alone, an LLM tends to reuse the "safest" answer. Every regeneration prompt is given the previous output and told explicitly to pick a different director/DP pairing, a different character count, different plot mechanics — so "re-search" actually produces something new instead of a reworded duplicate.
- **A reference library instead of vibes.** `prompt_structures.json` encodes a real cinematography reference (30+ named camera movements, shot sizes, lens effects, color-grading formulas with film references) that's fed into every episode prompt, so the output reads like a studio's shot list rather than a generic AI caption.
- **Server-side routing, not model self-reporting.** Each scene is tagged with a `shot_type`, and the actual image/video model recommendation is resolved server-side from a routing table — the model never has to correctly "remember" which tool is best for a car chase vs. a dialogue close-up.
- **No backend database.** Projects are full client-side objects persisted to `localStorage`; the Flask backend is a stateless set of AI-calling routes. Simple to run, simple to deploy, and there's nothing to migrate.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | [Flask](https://flask.palletsprojects.com/) (Python), [Gunicorn](https://gunicorn.org/) in production |
| LLM | Google **Gemini 3.1 Flash Lite** via the `google-genai` SDK, with `response_schema` structured output |
| Web research | [Parallel](https://parallel.ai/) AI search API for live trend discovery |
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step. Client-side routing (`pushState`) between a dashboard and per-project views |
| Persistence | Browser `localStorage` — multi-project dashboard, no server-side database |
| Hosting | [Render](https://render.com/) (free tier) |

## Project structure

```
dramaz/
├── app.py                     # Flask app: routes, Gemini prompts + schemas, style/routing lookups
├── routing_table.json         # shot_type → recommended image/video model + fallback
├── style_library.json         # director & cinematographer style prompts, blended per concept
├── prompt_structures.json     # camera/lens/lighting/color-grade reference for episode prompts
├── templates/
│   └── index.html             # single-page shell (dashboard + project views)
├── static/
│   ├── js/main.js             # all app logic: state, API calls, Studio graph, rendering
│   ├── css/style.css          # design system (dark theme, node canvas, cards)
│   └── img/                   # logo, favicon, background art
├── requirements.txt
└── Procfile                   # gunicorn entrypoint for Render
```

## Running it locally

**Requirements:** Python 3.10+, a [Gemini API key](https://aistudio.google.com/), and a [Parallel API key](https://parallel.ai/).

```bash
git clone https://github.com/chadaramkarunakar16/dramaz.git
cd dramaz
python -m venv venv && venv\Scripts\activate   # or `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
```

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_gemini_key_here
PARALLEL_API_KEY=your_parallel_key_here
```

Then run it:

```bash
python app.py
```

The app serves on `http://localhost:5000`.

## Deployment

Dramaz runs on Render's free tier via the included `Procfile` (`gunicorn app:app`). The free tier cold-starts after inactivity — the first request after a while can take 30–60 seconds; everything after that is instant.

## License

[MIT](LICENSE)
