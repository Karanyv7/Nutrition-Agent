"""
╔══════════════════════════════════════════════════════════════════╗
║           AI-POWERED NUTRITION AGENT — app.py                    ║
║           Backend: Flask + IBM Watsonx.ai (Granite)              ║
╚══════════════════════════════════════════════════════════════════╝

AGENT_INSTRUCTIONS
==================
Customize the agent's behavior, tone, and specialization here.
All settings below are read at startup — no code changes needed elsewhere.

  AGENT_NAME          : Display name shown in the UI
  AGENT_TONE          : "friendly" | "professional" | "motivational" | "clinical"
  LANGUAGE_STYLE      : "simple" | "detailed" | "bilingual-hindi"
  DIET_SPECIALIZATION : Primary diet focus for suggestions
  CUISINE_PREFERENCE  : Default cuisine for meal suggestions
  SAFETY_RULES        : Hard rules the agent must never break
  INDIAN_FOOD_PREFS   : Indian-specific food context injected into every prompt
  SYSTEM_PROMPT_EXTRA : Any extra instructions appended to every system prompt

==================
"""

# ── AGENT INSTRUCTIONS (edit freely) ────────────────────────────────────────

AGENT_INSTRUCTIONS = {
    "AGENT_NAME": "NutriBot",

    # Tone: "friendly" | "professional" | "motivational" | "clinical"
    "AGENT_TONE": "friendly",

    # Language: "simple" | "detailed" | "bilingual-hindi"
    "LANGUAGE_STYLE": "detailed",

    # Diet specializations (comma-separated for multi-focus)
    "DIET_SPECIALIZATION": "balanced, weight-management, diabetes-friendly, Indian vegetarian",

    # Default cuisine preference for meal suggestions
    "CUISINE_PREFERENCE": "Indian",

    # Safety rules the agent strictly follows
    "SAFETY_RULES": [
        "Never diagnose or treat medical conditions.",
        "Always recommend consulting a registered dietitian for clinical needs.",
        "Do not suggest extreme calorie restriction below 1200 kcal/day.",
        "Flag nut/dairy/gluten allergies explicitly when present.",
        "Do not promote supplements without mentioning 'consult your doctor'.",
    ],

    # Indian food preferences injected into every nutrition prompt
    "INDIAN_FOOD_PREFS": {
        "staples": ["dal", "roti", "rice", "sabzi", "curd", "paneer", "rajma", "chana"],
        "healthy_snacks": ["makhana", "chivda", "sprouts chaat", "roasted chana", "poha"],
        "regional_variety": True,          # Include regional Indian cuisines
        "respect_vegetarian": True,        # Default to vegetarian options first
        "festival_foods": True,            # Mention healthier festival food swaps
        "common_spices_benefits": True,    # Include health benefits of turmeric, cumin, etc.
    },

    # Extra instructions appended verbatim to every system prompt
    "SYSTEM_PROMPT_EXTRA": (
        "Always give concrete meal examples with approximate calories. "
        "Format multi-item lists with bullet points. "
        "When suggesting Indian meals, include both North and South Indian options where relevant. "
        "Keep responses concise but complete — aim for 150-300 words per answer."
    ),
}

# ── IMPORTS ──────────────────────────────────────────────────────────────────

import os
import json
import re
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from ibm_watsonx_ai import Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams



from dotenv import load_dotenv
load_dotenv()
# ── ENV & APP SETUP ──────────────────────────────────────────────────────────

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "nutribot-secret-2024-xk9")
CORS(app)

# ── IBM WATSONX CONFIG ───────────────────────────────────────────────────────

IBM_API_KEY    = os.getenv("IBM_API_KEY")
IBM_PROJECT_ID = os.getenv("IBM_PROJECT_ID")
IBM_URL        = os.getenv("IBM_URL", "https://eu-gb.ml.cloud.ibm.com")
# GRANITE_MODEL  = os.getenv("GRANITE_MODEL", "ibm/granite-4-h-small")
GRANITE_MODEL = os.getenv("MODEL_ID")

print("IBM_API_KEY:", IBM_API_KEY[:7] if IBM_API_KEY else None)
print("IBM_URL:", IBM_URL)
print("IBM_PROJECT_ID:", IBM_PROJECT_ID)

def get_watsonx_model():
    """Initialise and return an IBM Watsonx ModelInference instance."""
    credentials = Credentials(
        url=IBM_URL,
        api_key=IBM_API_KEY,
    )
    params = {
        GenParams.MAX_NEW_TOKENS: 350,
        GenParams.MIN_NEW_TOKENS: 0,
        GenParams.TEMPERATURE: 0.4,
        GenParams.TOP_P: 0.9,
        GenParams.TOP_K: 50,
        GenParams.REPETITION_PENALTY: 1.2,
        GenParams.STOP_SEQUENCES: ["Human:", "User:", "\n\nHuman"],
    }
    return ModelInference(
        model_id=GRANITE_MODEL,
        credentials=credentials,
        project_id=IBM_PROJECT_ID,
        params=params,
    )

# ── SYSTEM PROMPT BUILDER ────────────────────────────────────────────────────

def build_system_prompt(user_profile=None) -> str:  # type: dict | None
    ai = AGENT_INSTRUCTIONS
    tone_map = {
        "friendly":      "warm, encouraging, and approachable",
        "professional":  "precise, evidence-based, and formal",
        "motivational":  "energetic, inspiring, and action-oriented",
        "clinical":      "clinical, concise, and data-driven",
    }
    tone_desc = tone_map.get(ai["AGENT_TONE"], "helpful")
    indian     = ai["INDIAN_FOOD_PREFS"]
    safety     = "\n".join(f"- {r}" for r in ai["SAFETY_RULES"])
    staples    = ", ".join(indian["staples"])
    snacks     = ", ".join(indian["healthy_snacks"])

    profile_section = ""
    if user_profile:
        profile_section = f"""
Current User Profile:
- Name: {user_profile.get('name', 'User')}
- Age: {user_profile.get('age', 'N/A')} years
- Gender: {user_profile.get('gender', 'N/A')}
- Weight: {user_profile.get('weight', 'N/A')} kg
- Height: {user_profile.get('height', 'N/A')} cm
- Activity Level: {user_profile.get('activity', 'N/A')}
- Goal: {user_profile.get('goal', 'N/A')}
- Dietary Restrictions: {user_profile.get('restrictions', 'None')}
- Health Conditions: {user_profile.get('health_conditions', 'None')}
- Family Members: {user_profile.get('family_count', 1)}
"""

    return f"""You are {ai['AGENT_NAME']}, an expert AI nutrition assistant.
Your tone is {tone_desc}.
Your diet specializations: {ai['DIET_SPECIALIZATION']}.
Your default cuisine preference: {ai['CUISINE_PREFERENCE']}.

Indian Food Context:
- Common staples to include: {staples}
- Healthy Indian snack options: {snacks}
- Regional variety: {'Yes' if indian['regional_variety'] else 'No'}
- Vegetarian-first approach: {'Yes' if indian['respect_vegetarian'] else 'No'}
- Festival food swaps: {'Mentioned when relevant' if indian['festival_foods'] else 'Skip'}
- Spice health benefits: {'Include' if indian['common_spices_benefits'] else 'Skip'}
{profile_section}
Safety Rules (strictly follow):
{safety}

{ai['SYSTEM_PROMPT_EXTRA']}

You help users with: meal planning, calorie analysis, BMI interpretation,
nutrition advice, healthy recipes, weight management, family diet planning,
and Indian food nutrition. Always be specific and actionable.
"""

# ── CALORIE & BMI UTILITIES ──────────────────────────────────────────────────

def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    height_m = height_cm / 100
    bmi = weight_kg / (height_m ** 2)
    if bmi < 18.5:
        category, advice = "Underweight", "Focus on nutrient-dense, calorie-rich foods."
    elif bmi < 25:
        category, advice = "Normal weight", "Maintain your healthy habits!"
    elif bmi < 30:
        category, advice = "Overweight", "Moderate calorie deficit with regular activity."
    else:
        category, advice = "Obese", "Consult a dietitian; gradual lifestyle changes recommended."
    return {"bmi": round(bmi, 1), "category": category, "advice": advice}

def calculate_tdee(weight_kg: float, height_cm: float, age: int,
                    gender: str, activity: str) -> dict:
    """Harris-Benedict BMR × activity multiplier."""
    if gender.lower() in ("male", "m"):
        bmr = 88.362 + (13.397 * weight_kg) + (4.799 * height_cm) - (5.677 * age)
    else:
        bmr = 447.593 + (9.247 * weight_kg) + (3.098 * height_cm) - (4.330 * age)

    multipliers = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "active": 1.725, "very_active": 1.9,
    }
    mult = multipliers.get(activity.lower().replace(" ", "_"), 1.55)
    tdee = bmr * mult

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "weight_loss": round(tdee - 500),
        "weight_gain": round(tdee + 300),
        "maintenance": round(tdee),
    }

# ── CHAT HISTORY (session-based) ─────────────────────────────────────────────

def get_history() -> list:
    return session.get("chat_history", [])

def save_history(history: list):
    session["chat_history"] = history[-20:]  # keep last 20 turns

def build_conversation_prompt(system: str, history: list, user_msg: str) -> str:
    prompt = f"System: {system}\n\n"
    for turn in history[-6:]:  # last 6 turns for context
        prompt += f"Human: {turn['user']}\nAssistant: {turn['bot']}\n\n"
    prompt += f"Human: {user_msg}\nAssistant:"
    return prompt

# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", agent_name=AGENT_INSTRUCTIONS["AGENT_NAME"])


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True)
    user_message  = data.get("message", "").strip()
    user_profile  = data.get("profile", {})

    if not user_message:
        return jsonify({"error": "Empty message"}), 400
    if not IBM_API_KEY or not IBM_PROJECT_ID:
        return jsonify({"error": "IBM credentials not configured. Check your .env file."}), 500

    try:
        history = get_history()
        system  = build_system_prompt(user_profile)
        prompt  = build_conversation_prompt(system, history, user_message)

        model    = get_watsonx_model()
        response = model.generate_text(prompt=prompt)
        bot_reply = response.strip() if isinstance(response, str) else response

        history.append({"user": user_message, "bot": bot_reply,
                         "timestamp": datetime.now().isoformat()})
        save_history(history)

        return jsonify({
            "reply": bot_reply,
            "agent_name": AGENT_INSTRUCTIONS["AGENT_NAME"],
            "timestamp": datetime.now().strftime("%H:%M"),
        })

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/bmi", methods=["POST"])
def bmi_endpoint():
    data = request.get_json(force=True)
    try:
        weight = float(data["weight"])
        height = float(data["height"])
        age    = int(data.get("age", 25))
        gender = data.get("gender", "female")
        activity = data.get("activity", "moderate")

        bmi_result  = calculate_bmi(weight, height)
        tdee_result = calculate_tdee(weight, height, age, gender, activity)

        return jsonify({**bmi_result, **tdee_result})
    except (KeyError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/meal-plan", methods=["POST"])
def meal_plan():
    data = request.get_json(force=True)
    profile = data.get("profile", {})
    days    = int(data.get("days", 7))
    goal    = data.get("goal", "balanced")

    if not IBM_API_KEY or not IBM_PROJECT_ID:
        return jsonify({"error": "IBM credentials not configured."}), 500

    prompt_text = (
        f"Create a detailed {days}-day Indian meal plan for:\n"
        f"Goal: {goal}\n"
        f"Calories target: {profile.get('calories', 2000)} kcal/day\n"
        f"Dietary restrictions: {profile.get('restrictions', 'None')}\n"
        f"Family members: {profile.get('family_count', 1)}\n\n"
        f"For each day provide: Breakfast, Mid-Morning Snack, Lunch, Evening Snack, Dinner.\n"
        f"Include calories for each meal. Use Indian foods as primary options.\n"
        f"Format as Day 1, Day 2, etc."
    )

    try:
        system = build_system_prompt(profile)
        prompt = build_conversation_prompt(system, [], prompt_text)
        model  = get_watsonx_model()
        result = model.generate_text(prompt=prompt)
        return jsonify({"meal_plan": result.strip() if isinstance(result, str) else result})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/analyze-food", methods=["POST"])
def analyze_food():
    data = request.get_json(force=True)
    food_items = data.get("foods", "")

    if not food_items:
        return jsonify({"error": "No food items provided"}), 400
    if not IBM_API_KEY or not IBM_PROJECT_ID:
        return jsonify({"error": "IBM credentials not configured."}), 500

    prompt_text = (
        f"Analyze the nutritional content of the following foods/meals:\n{food_items}\n\n"
        f"For each item provide: Calories, Protein (g), Carbs (g), Fat (g), Fiber (g), "
        f"key vitamins/minerals, and a health rating (1-10). "
        f"Then give a total summary and improvement suggestions."
    )

    try:
        model  = get_watsonx_model()
        system = build_system_prompt()
        prompt = build_conversation_prompt(system, [], prompt_text)
        result = model.generate_text(prompt=prompt)
        return jsonify({"analysis": result.strip() if isinstance(result, str) else result})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/family-plan", methods=["POST"])
def family_plan():
    data    = request.get_json(force=True)
    members = data.get("members", [])

    if not members:
        return jsonify({"error": "No family members provided"}), 400
    if not IBM_API_KEY or not IBM_PROJECT_ID:
        return jsonify({"error": "IBM credentials not configured."}), 500

    member_desc = "\n".join(
        f"- {m.get('name','Member')} ({m.get('age','?')} yrs, {m.get('gender','?')}, "
        f"goal: {m.get('goal','balanced')}, restrictions: {m.get('restrictions','none')})"
        for m in members
    )
    prompt_text = (
        f"Create a unified family nutrition plan for:\n{member_desc}\n\n"
        f"Suggest shared Indian family meals that work for everyone, "
        f"with individual modifications where needed. "
        f"Include breakfast, lunch, dinner and snacks. "
        f"Note any special considerations per member."
    )

    try:
        model  = get_watsonx_model()
        system = build_system_prompt()
        prompt = build_conversation_prompt(system, [], prompt_text)
        result = model.generate_text(prompt=prompt)
        return jsonify({"family_plan": result.strip() if isinstance(result, str) else result})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/clear-history", methods=["POST"])
def clear_history():
    session.pop("chat_history", None)
    return jsonify({"status": "cleared"})


@app.route("/api/history", methods=["GET"])
def get_chat_history():
    return jsonify({"history": get_history()})


@app.route("/api/quick-tips", methods=["GET"])
def quick_tips():
    """Returns static quick nutrition tips (no LLM call needed)."""
    tips = [
        {"icon": "🥗", "tip": "Fill half your plate with colourful vegetables at every meal."},
        {"icon": "💧", "tip": "Drink 8-10 glasses of water daily; start with a glass before meals."},
        {"icon": "🌾", "tip": "Choose whole grains like brown rice, jowar, or bajra over refined grains."},
        {"icon": "🫘", "tip": "Include dal or legumes daily — excellent plant-based protein and fibre."},
        {"icon": "🥜", "tip": "A small handful of mixed nuts makes a perfect mid-morning snack."},
        {"icon": "🧘", "tip": "Eat mindfully — chew slowly and avoid screens during meals."},
        {"icon": "🌿", "tip": "Turmeric, cumin, and ginger in your cooking add anti-inflammatory benefits."},
        {"icon": "⏰", "tip": "Maintain regular meal timings; avoid eating heavy meals after 8 PM."},
    ]
    return jsonify({"tips": tips})


# ── ENTRY POINT ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    print(f"\n🥗  {AGENT_INSTRUCTIONS['AGENT_NAME']} is running on http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
