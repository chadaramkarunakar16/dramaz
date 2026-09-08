# Dramaz — Step 0 to Finished Product (Claude Code + free hosting)
### Same project, same Parallel partner track. Only where you write the code and where it lives changes.

Legend: 🖱 click/do this · 📋 prompt to paste into Claude Code · 💻 code (Claude Code will mostly write this for you — shown here so you know what to expect and can check it) · 💡 tip

---

## STEP 0 — Accounts and tools

1. 🖱 Install **Claude Code Desktop** (the card above this message, or claude.com/code) — this is where you'll write and run everything, replacing Replit.
2. 🖱 **aistudio.google.com** → Get API key → copy it somewhere safe. (Gemini key.)
3. 🖱 **platform.parallel.ai** → sign up (free credits, no card needed) → generate an API key → copy it.
4. 🖱 You already have the `dramaz` GitHub repo with an MIT license from before — no need to remake it.
5. 🖱 Sign up at **render.com** using "Sign up with GitHub" — free, no credit card required for the free web service tier.
6. 🖱 Make sure you have a YouTube account ready for the demo video.

💡 Render's free tier "sleeps" a service after inactivity — the first request after a while takes ~30-50 seconds to wake up. Not a problem for judging (they'll click once and wait), but **open your live link yourself and click around once before recording your demo**, so the recording doesn't start on a slow cold-start.

---

## STEP 1 — Create your project folder and open it in Claude Code

1. 🖱 On your computer, create a new folder called `dramaz`.
2. 🖱 Open Claude Code Desktop, point it at that folder.
3. 📋 Paste this into Claude Code:

   > Build a Flask web app called Dramaz in this folder. It needs a "director's binder" visual identity: dark cinematic background, one warm accent color, screenplay-style typography, and four tabs across the top labeled Trends, Concept, Season, Episode. Tab 1 (Trends) has a "Scout Trends" button and shows trend cards once clicked. Tab 2 (Concept) is locked until a trend card is selected, then shows a "Generate Concept" button; once generated it shows a logline, a character sheet as character cards (name, role, arc, visual description), a locations list, and a "Style DNA" badge showing two chosen cinematic style names with a one-line reason. Tab 3 (Season) is locked until the concept is approved via an "Approve Concept" button, then lets the user pick an episode count (15 to 30) and click "Generate Season"; results show as a numbered list of episodes with a hook line and cliffhanger note each. Tab 4 (Episode) lets the user pick one episode number and click "Generate Episode Kit," then shows a scene-by-scene breakdown: image prompt, video prompt, recommended AI model, and one line of director-style shot direction per scene. Set up four API routes: /trends, /concept, /season, /episode, each currently returning realistic hardcoded dummy data matching these shapes. Use python-dotenv to load environment variables from a .env file. Set up a requirements.txt and a simple way to run it locally with `python app.py`. I will replace the dummy data with real AI calls myself afterward.

4. 🖱 Let Claude Code build it, then run it (it will tell you the command, usually `python app.py`) and open the local address it gives you (usually `http://localhost:5000`) in your browser. Confirm the four tabs and dummy data work.

---

## STEP 2 — Add your two data files and your API keys

1. 🖱 Copy the two files I generated earlier — `routing_table.json` and `style_library.json` — into your `dramaz` folder (same level as your main Python file).
2. 🖱 In the folder, create a file called `.env` with:
   ```
   GEMINI_API_KEY=your_gemini_key_here
   PARALLEL_API_KEY=your_parallel_key_here
   ```
3. 📋 Tell Claude Code: "Add a `.gitignore` file if there isn't one, and make sure `.env` is listed in it so my API keys never get pushed to GitHub."

💡 This `.env` file is your local equivalent of Replit's Secrets tab. It stays on your computer only — Step 9 below covers setting the same keys again inside Render for the live version.

---

## STEP 3 — Install the packages you need

📋 Tell Claude Code: "Install python-dotenv, the Gemini SDK (whatever the current official package is), parallel-web, flask, and gunicorn, and add them all to requirements.txt."

💡 Claude Code will run the actual `pip install` commands for you — you don't need to type these yourself. Just confirm it finishes without errors before moving on.

---

## STEP 4 — Build the setup code at the top of your main file

💻 Ask Claude Code to add this near the top of your Flask file (it may write it slightly differently — that's fine, the intent is what matters):

```python
import os
import json
from dotenv import load_dotenv
load_dotenv()

with open("routing_table.json") as f:
    ROUTING_TABLE = json.load(f)

with open("style_library.json") as f:
    STYLE_LIBRARY = json.load(f)

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
PARALLEL_API_KEY = os.environ["PARALLEL_API_KEY"]
# (Gemini client setup goes here — ask Claude Code to add the current
# correct setup lines for the Gemini SDK it installed in Step 3)

from parallel import Parallel
parallel_client = Parallel(api_key=PARALLEL_API_KEY)
```

---

## STEP 5 — Build `/trends` (uses Parallel, then Gemini)

💻
```python
@app.route("/trends", methods=["GET"])
def trends():
    search_result = parallel_client.search(
        objective="Find what is currently going viral in AI micro-dramas: vertical, short-episode series on platforms like ReelShort, DramaBox, ShortMax, and viral drama-style content in Instagram/Facebook ads and posts.",
        search_queries=[
            "AI micro drama trending",
            "viral vertical drama app episodes",
            "ReelShort DramaBox trending tropes"
        ]
    )
    excerpts_text = "\n\n".join(f"{r.url}: {r.content}" for r in search_result.results)

    prompt = f"""
    Here are raw web search excerpts about what's trending in AI micro-dramas:
    {excerpts_text}

    From these, extract 5 trending niches or tropes right now, each with a
    one-line concept seed and the source URL it came from.
    Return as a JSON list with fields: niche, seed, source_url.
    """
    response = model.generate_content(prompt)
    return response.text
```

💡 **Test this route alone first** by visiting `http://localhost:5000/trends` in your browser after running the app. Real, current results = you're good. Generic results = make `search_queries` more specific.

---

## STEP 6 — Build `/concept`

💻
```python
def get_style_shortlist():
    return [{"id": s["id"], "name": s["name"], "category": s["category"], "tags": s["tags"]} for s in STYLE_LIBRARY]

@app.route("/concept", methods=["POST"])
def concept():
    niche_seed = request.json["seed"]
    shortlist = get_style_shortlist()

    prompt = f"""
    You are a micro-drama creative director.
    Niche/concept seed: "{niche_seed}"

    Available cinematic styles (id, name, category, tags):
    {json.dumps(shortlist)}

    Pick exactly one "director" style and one "cinematographer" style that
    best fit this story's tone, and explain why in one line.

    Then create:
    - a one-line logline and core conflict
    - a character sheet: name, role, one-line arc, visual description
      (only as many characters as the story truly needs)
    - a list of locations/environments

    Return as JSON: logline, characters, locations,
    style_blend: {{ director_id, cinematographer_id, reason }}
    """
    response = model.generate_content(prompt)
    return response.text
```

💡 Note: no Parallel call here, no `google_search` either — this route is pure creative generation. Your frontend needs to hold onto `style_blend` and send it along when calling `/episode` later.

---

## STEP 7 — Build `/season`

💻
```python
@app.route("/season", methods=["POST"])
def season():
    concept_data = request.json["concept"]
    episode_count = request.json["episode_count"]

    prompt = f"""
    Approved concept: {json.dumps(concept_data)}
    Write a {episode_count}-episode season plan. Each episode is 1 minute.
    For each: episode number, a one-line hook, and a cliffhanger note
    explaining exactly what unresolved moment forces the next episode.
    Return as a JSON list.
    """
    response = model.generate_content(prompt)
    return response.text
```

---

## STEP 8 — Build `/episode`

💻
```python
def get_style_by_id(style_id):
    for s in STYLE_LIBRARY:
        if s["id"] == style_id:
            return s
    return None

@app.route("/episode", methods=["POST"])
def episode():
    season_data = request.json["season"]
    episode_number = request.json["episode_number"]
    style_blend = request.json["style_blend"]

    director_style = get_style_by_id(style_blend["director_id"])
    cinematographer_style = get_style_by_id(style_blend["cinematographer_id"])

    prompt = f"""
    Season plan: {json.dumps(season_data)}
    Write the full scene-by-scene breakdown for episode {episode_number} only.

    NARRATIVE / DIRECTOR STYLE ({director_style['name']}):
    {director_style['prompt']}

    VISUAL / CINEMATOGRAPHER STYLE ({cinematographer_style['name']}):
    {cinematographer_style['prompt']}

    MODEL ROUTING TABLE (pick the recommended model for each scene from
    this table only — never invent a model not listed):
    {json.dumps(ROUTING_TABLE)}

    For each scene: scene number, one-line description, image prompt,
    video prompt, the shot-type key you classified it as (must match a
    routing table key), the recommended model (from the table), and one
    line of director-style shot direction using the styles above.
    Return as a JSON list of scenes.
    """
    response = model.generate_content(prompt)
    return response.text
```

---

## STEP 9 — Wire the frontend, test everything locally

📋 If any button isn't calling the right route yet, tell Claude Code: "Wire the [tab name] button to call [route], show a loading state while waiting, and display the returned JSON in the existing card layout."

🖱 Run the app locally (`python app.py`), click through the full flow in order: Scout Trends → pick one → Generate Concept → Approve → pick episode count → Generate Season → pick episode → Generate Episode Kit. Confirm real data at every step and that Episode Kit model picks match your routing table by scene type.

---

## STEP 10 — Prepare for deployment

💻 Ask Claude Code: "Add a `Procfile` (or Render's expected start command) using gunicorn to run this Flask app in production, since I'm deploying to Render."

It will typically create a file containing something like:
```
web: gunicorn app:app
```
(the exact filename `app` may differ if your main file is named differently — Claude Code will match it to your actual file).

---

## STEP 11 — Push to GitHub

🖱 In Claude Code's terminal, or via any Git client, run:
```
git init
git remote add origin https://github.com/<your-username>/dramaz.git
git add .
git commit -m "Dramaz initial build"
git push -u origin main
```

💡 Since `.env` is in your `.gitignore` from Step 2, your API keys will **not** be pushed — good. Open the repo on GitHub and confirm the MIT license still shows in "About."

---

## STEP 12 — Deploy on Render

1. 🖱 In Render, click **New → Web Service** → connect your `dramaz` GitHub repo.
2. 🖱 Set the **Build Command** to `pip install -r requirements.txt` and the **Start Command** to whatever your Procfile says (e.g. `gunicorn app:app`).
3. 🖱 In Render's **Environment** tab, add the same two variables as your local `.env`: `GEMINI_API_KEY` and `PARALLEL_API_KEY`, pasting your real keys.
4. 🖱 Click **Deploy**. Wait for the build to finish, then open the `.onrender.com` URL it gives you.
5. 🖱 Click through the full flow once to wake it up and confirm it works live, the same way you tested locally in Step 9.

---

## STEP 13 — Record your demo, then submit

Same as always: 15s problem statement, ~100s live app walkthrough (Trends → Concept with character sheet and Style DNA → Season → one full Episode Kit), 30s quick code look (the Parallel `search()` call and the routing table being respected), 15s who it helps. Upload to YouTube as Public.

Devpost: project name **Dramaz**, your `.onrender.com` URL, GitHub repo, YouTube video, partner track **Parallel**, submit a few hours before the 2:00pm PDT deadline.

---

## Everything that's different from the Replit-based build
- You write and run code locally with Claude Code instead of in Replit's browser editor.
- Environment variables live in a local `.env` file (via python-dotenv) instead of Replit's Secrets tab — and get re-entered once in Render's dashboard for the live version.
- Hosting is Render (free, Git-connected, no card) instead of Replit Deploy — needs a `requirements.txt` and a `Procfile`/start command, which Replit didn't require you to think about.
- Everything else — the four routes' actual logic, the routing table, the style library, the UI design brief, the submission requirements — is identical to what you already had.
