import os
import json
from datetime import datetime

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

app = Flask(__name__)

with open("routing_table.json") as f:
    ROUTING_TABLE = json.load(f)

with open("style_library.json") as f:
    STYLE_LIBRARY = json.load(f)

with open("prompt_structures.json") as f:
    PROMPT_STRUCTURES = json.load(f)

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
PARALLEL_API_KEY = os.environ["PARALLEL_API_KEY"]

from google import genai
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-3.1-flash-lite"

from parallel import Parallel
parallel_client = Parallel(api_key=PARALLEL_API_KEY)

# High temperature so repeated generations for the same seed genuinely vary
# (director/character/scene choices) instead of converging on one "safest" answer.
# response_schema strictly enforces the exact JSON shape (array vs object, field
# names) regardless of temperature, so the frontend never gets a shape it can't render.
def creative_config(schema):
    return {"response_mime_type": "application/json", "temperature": 1.35, "response_schema": schema}


TRENDS_SCHEMA = {
    "type": "ARRAY",
    "minItems": 5,
    "maxItems": 5,
    "items": {
        "type": "OBJECT",
        "properties": {
            "niche": {"type": "STRING"},
            "seed": {"type": "STRING"},
            "source_url": {"type": "STRING"},
        },
        "required": ["niche", "seed", "source_url"],
    },
}

CONCEPT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "logline": {"type": "STRING"},
        "core_conflict": {"type": "STRING"},
        "characters": {
            "type": "ARRAY",
            "minItems": 2,
            "maxItems": 6,
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "role": {"type": "STRING"},
                    "arc": {"type": "STRING"},
                    "visual_description": {"type": "STRING"},
                },
                "required": ["name", "role", "arc", "visual_description"],
            },
        },
        "locations": {"type": "ARRAY", "items": {"type": "STRING"}},
        "style_blend": {
            "type": "OBJECT",
            "properties": {
                "director_id": {"type": "STRING"},
                "cinematographer_id": {"type": "STRING"},
                "reason": {"type": "STRING"},
            },
            "required": ["director_id", "cinematographer_id", "reason"],
        },
    },
    "required": ["logline", "core_conflict", "characters", "locations", "style_blend"],
}

SEASON_ITEM_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "episode_number": {"type": "INTEGER"},
        "hook": {"type": "STRING"},
        "cliffhanger": {"type": "STRING"},
    },
    "required": ["episode_number", "hook", "cliffhanger"],
}

SCENE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "scene_number": {"type": "INTEGER"},
            "description": {"type": "STRING"},
            "image_prompt": {"type": "STRING"},
            "video_prompt": {"type": "STRING"},
            "shot_type": {"type": "STRING"},
            "direction": {"type": "STRING"},
        },
        "required": ["scene_number", "description", "image_prompt", "video_prompt", "shot_type", "direction"],
    },
}


def get_style_by_id(style_id):
    for s in STYLE_LIBRARY:
        if s["id"] == style_id:
            return s
    return None


API_ROUTES = {"/trends", "/concept", "/season", "/episode"}


@app.after_request
def add_no_cache_headers(response):
    # Only the AI-backed API routes need this — every request should hit the
    # live APIs fresh, never get served a stale cached response. Static assets
    # (background image, logo, css/js) should still cache normally.
    if request.path in API_ROUTES:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/project/<project_id>")
def project_page(project_id):
    # Projects live in the browser's localStorage, not server-side — this route
    # just serves the same shell so a saved/shared /project/<id> URL and the
    # browser back/forward buttons work. The client reads the id from the URL.
    return render_template("index.html")


@app.route("/trends", methods=["GET"])
def trends():
    refine = (request.args.get("refine") or "").strip()
    try:
        exclude_niches = json.loads(request.args.get("exclude") or "[]")
    except (TypeError, ValueError):
        exclude_niches = []

    today_str = datetime.now().strftime("%B %d, %Y")

    objective = (
        f"Find what is currently going viral in AI micro-dramas as of {today_str}: "
        "vertical, short-episode series on platforms like ReelShort, DramaBox, ShortMax, "
        "and viral drama-style content in Instagram/Facebook ads and posts."
    )
    search_queries = [
        "AI micro drama trending",
        "viral vertical drama app episodes",
        "ReelShort DramaBox trending tropes",
    ]
    if refine:
        objective += f" Focus specifically on: {refine}."
        search_queries.append(refine)
    if exclude_niches:
        search_queries.append("new AI micro drama tropes this week")

    try:
        search_result = parallel_client.search(
            objective=objective,
            search_queries=search_queries,
        )
        excerpts_text = "\n\n".join(
            f"{r.url}: {' '.join(r.excerpts)}" for r in search_result.results
        )

        exclude_block = ""
        if exclude_niches:
            exclude_block = (
                "\nThese niches were already shown to the user earlier in this session — "
                "do NOT repeat them or close variants of them, dig into the excerpts for "
                "genuinely different angles even if they're less obvious: "
                + ", ".join(exclude_niches)
            )

        prompt = f"""
        Today is {today_str}.
        Here are raw web search excerpts about what's trending in AI micro-dramas:
        {excerpts_text}
        {exclude_block}

        From these, extract 5 trending niches or tropes right now, each with a
        one-line concept seed and the source URL it came from. Prefer specific,
        concrete angles actually present in the excerpts over generic genre labels.
        Return as a JSON list with fields: niche, seed, source_url.
        """
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=creative_config(TRENDS_SCHEMA),
        )
        trends_data = json.loads(response.text)
        return jsonify(trends_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def get_style_shortlist():
    return [{"id": s["id"], "name": s["name"], "category": s["category"], "tags": s["tags"]} for s in STYLE_LIBRARY]


@app.route("/concept", methods=["POST"])
def concept():
    data = request.get_json(silent=True) or {}
    seeds = data.get("seeds") or ([data["seed"]] if data.get("seed") else [])
    combined_seed = " | ".join(seeds)
    note = data.get("note")
    previous = data.get("previous")
    shortlist = get_style_shortlist()

    refinement_block = f'\nThe user reviewed a previous version and asked for this change: "{note}"' if note else ""

    variation_block = ""
    if previous:
        prev_director = (previous.get("style_blend") or {}).get("director_id")
        prev_cinematographer = (previous.get("style_blend") or {}).get("cinematographer_id")
        prev_names = [c.get("name") for c in (previous.get("characters") or [])]
        prev_char_count = len(previous.get("characters") or [])
        variation_block = f"""
        A previous version was already generated for this seed:
        {json.dumps(previous)}

        Generate a genuinely DIFFERENT take, not a reword of the same ideas:
        - Unless the user's requested change above says otherwise, pick a
          DIFFERENT director/cinematographer pairing than director_id
          "{prev_director}" and cinematographer_id "{prev_cinematographer}".
        - Use different character names than: {", ".join(n for n in prev_names if n)}.
        - Use a DIFFERENT number of characters than the previous version's
          {prev_char_count} — do not default to the same headcount every time.
        - Change the specific plot mechanics, locations, and relationships —
          keep only the core niche/seed, not the previous story's details.
        """

    prompt = f"""
    You are a micro-drama creative director.
    Niche/concept seed(s): "{combined_seed}"
    {refinement_block}
    {variation_block}

    Available cinematic styles (id, name, category, tags):
    {json.dumps(shortlist)}

    Pick exactly one "director" style and one "cinematographer" style that
    best fit this story's tone, and explain why in one line.

    Then create:
    - a one-line logline and core conflict
    - a character sheet: name, role, one-line arc, visual description.
      Include as many characters as the story genuinely needs — do not
      default to a fixed number out of habit. A simple two-hander romance
      might only need 2, but most stories benefit from 3-5 (protagonist,
      antagonist or rival, love interest, ally, family member, etc. as
      relevant). Let the story's complexity decide the count, and vary it
      naturally across different concepts rather than always landing on
      the same number.
    - a list of locations/environments

    Return as JSON with fields: logline, core_conflict, characters, locations,
    style_blend: {{ director_id, cinematographer_id, reason }}
    """
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=creative_config(CONCEPT_SCHEMA),
        )
        concept_data = json.loads(response.text)

        style_blend = concept_data.get("style_blend", {})
        director = get_style_by_id(style_blend.get("director_id"))
        cinematographer = get_style_by_id(style_blend.get("cinematographer_id"))
        style_blend["director_name"] = director["name"] if director else style_blend.get("director_id")
        style_blend["cinematographer_name"] = cinematographer["name"] if cinematographer else style_blend.get("cinematographer_id")
        concept_data["style_blend"] = style_blend

        return jsonify(concept_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/season", methods=["POST"])
def season():
    data = request.get_json(silent=True) or {}
    concept_data = data.get("concept")
    episode_count = int(data.get("episode_count", 20))
    note = data.get("note")
    previous = data.get("previous")

    refinement_block = f'\nThe user reviewed a previous version and asked for this change: "{note}"' if note else ""

    variation_block = ""
    if previous:
        variation_block = f"""
        A previous season plan was already generated for this concept:
        {json.dumps(previous)}

        Generate a genuinely DIFFERENT plan, not a reword of the same beats:
        different specific hooks, different cliffhangers, a different order of
        revelations — while still serving the same approved concept.
        """

    prompt = f"""
    Approved concept: {json.dumps(concept_data)}
    Write a {episode_count}-episode season plan. Each episode is 1 minute.
    {refinement_block}
    {variation_block}
    For each episode: episode number, a one-line hook, and a cliffhanger note
    explaining exactly what unresolved moment forces the viewer into the next episode.
    Return as a JSON list with fields: episode_number, hook, cliffhanger.
    The list must contain exactly {episode_count} items, numbered 1 to {episode_count}.
    """
    season_schema = {
        "type": "ARRAY",
        "minItems": episode_count,
        "maxItems": episode_count,
        "items": SEASON_ITEM_SCHEMA,
    }
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=creative_config(season_schema),
        )
        season_data = json.loads(response.text)
        return jsonify(season_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/episode", methods=["POST"])
def episode():
    data = request.get_json(silent=True) or {}
    season_data = data.get("season")
    episode_number = data.get("episode_number", 1)
    style_blend = data.get("style_blend") or {}
    note = data.get("note")

    director_style = get_style_by_id(style_blend.get("director_id"))
    cinematographer_style = get_style_by_id(style_blend.get("cinematographer_id"))
    shot_type_keys = list(ROUTING_TABLE.keys())
    previous = data.get("previous")

    refinement_block = f'\nThe user reviewed a previous version and asked for this change: "{note}"' if note else ""

    variation_block = ""
    if previous:
        variation_block = f"""
        A previous scene breakdown was already generated for this episode:
        {json.dumps(previous)}

        Generate a genuinely DIFFERENT breakdown, not a reword of the same shots:
        different scene composition, different shot choices, different specific
        visual details in the prompts — while still hitting the same episode's
        hook and cliffhanger from the season plan.
        """

    prompt = f"""
    You are a cinematographer and prompt engineer building production-ready
    AI image and video generation prompts for a micro-drama episode.

    Season plan: {json.dumps(season_data)}
    Write the full scene-by-scene breakdown for episode {episode_number} only.
    {refinement_block}
    {variation_block}

    NARRATIVE / DIRECTOR STYLE ({director_style['name'] if director_style else 'unspecified'}):
    {director_style['prompt'] if director_style else ''}

    VISUAL / CINEMATOGRAPHER STYLE ({cinematographer_style['name'] if cinematographer_style else 'unspecified'}):
    {cinematographer_style['prompt'] if cinematographer_style else ''}

    For each scene, classify it with a shot_type key chosen ONLY from this
    exact list (use the key exactly as written): {json.dumps(shot_type_keys)}

    PROMPT-WRITING REFERENCE — use this to build image_prompt and video_prompt.
    Do not just name these concepts; actually apply specific chosen values
    (an exact focal length, an exact lighting direction, an exact color
    palette, an exact camera movement) so every prompt reads as a real,
    structured production prompt rather than a vague one-liner:
    {json.dumps(PROMPT_STRUCTURES)}

    Requirements for image_prompt (3-5 sentences, following image_prompt_anatomy
    above): describe the subject/action, camera angle + shot size, lens focal
    length and what it does to the space, lighting direction and quality,
    concrete texture/realism detail, the background in layers if the scene has
    depth, optionally a camera body reference, and end with one color-grading
    mood from the reference matched to this scene's tone. Do not pad with
    generic superlatives — every clause should be a concrete, specific choice.

    Requirements for video_prompt (2-4 sentences, following video_prompt_anatomy
    and the six_slot_template above): pick exactly ONE camera movement from the
    camera_movements list and describe it using the six slots (movement, start,
    speed, framing, end, time) in prose, plus the ONE main subject movement this
    scene needs. Never stack multiple camera movements or multiple subject
    actions in one video_prompt.

    For each scene return: scene_number, description (one line story beat),
    image_prompt, video_prompt, shot_type (must be one of the keys above), and
    direction (one line of director-style shot direction using the styles above).
    Return as a JSON list of scenes.
    """
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=creative_config(SCENE_SCHEMA),
        )
        scenes = json.loads(response.text)

        # Resolve both recommended models server-side from the routing table
        # itself, rather than trusting the model to echo values from it correctly.
        for scene in scenes:
            routing = ROUTING_TABLE.get(scene.get("shot_type"))
            if not routing:
                scene["shot_type"] = "wide_establishing"
                routing = ROUTING_TABLE.get("wide_establishing", {})
            scene["recommended_image_model"] = routing.get("image", "Seedream 5.0 Pro")
            scene["recommended_video_model"] = routing.get("video") or routing.get("fallback", "Veo 3.1")
            scene["model_reason"] = routing.get("reason", "")

        return jsonify(scenes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)
