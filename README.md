# 🥗 NutriBot — AI-Powered Nutrition Agent
### Built with Python Flask · IBM Watsonx.ai · Granite Models

---

## 📁 Project Structure

```
nutrition-agent/
├── app.py                   # Flask backend + AGENT_INSTRUCTIONS
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
├── .env                     # Your secrets (DO NOT commit)
├── .gitignore
├── templates/
│   └── index.html           # Main UI (single-page app)
└── static/
    ├── css/style.css        # Full design system
    └── js/app.js            # Frontend logic
```

---

## ⚡ Quick Start (5 minutes)

### 1. Clone & Set Up Environment

```bash
git clone <your-repo-url>
cd nutrition-agent

# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure IBM Credentials

```bash
# Copy the template
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
IBM_API_KEY=your_ibm_cloud_api_key_here
IBM_PROJECT_ID=your_watsonx_project_id_here
IBM_URL=https://us-south.ml.cloud.ibm.com
GRANITE_MODEL=ibm/granite-13b-instruct-v2
FLASK_SECRET_KEY=change-me-to-random-string
FLASK_DEBUG=false
PORT=5000
```

#### How to get IBM credentials:
1. Log in to [IBM Cloud](https://cloud.ibm.com)
2. Go to **Manage → Access (IAM) → API Keys** → Create API key
3. Go to [IBM Watsonx.ai](https://dataplatform.cloud.ibm.com/wx/home)
4. Create or open a project → Copy the **Project ID** from Settings

### 3. Run the App

```bash
python app.py
```

Open your browser at **http://localhost:5000** 🎉

---

## 🤖 Customising the Agent (AGENT_INSTRUCTIONS)

All agent behaviour is controlled in the `AGENT_INSTRUCTIONS` block at the top of `app.py`.
No other code changes are needed.

```python
AGENT_INSTRUCTIONS = {
    "AGENT_NAME":         "NutriBot",          # Name shown in UI
    "AGENT_TONE":         "friendly",          # friendly | professional | motivational | clinical
    "LANGUAGE_STYLE":     "detailed",          # simple | detailed | bilingual-hindi
    "DIET_SPECIALIZATION":"balanced, ...",     # comma-separated focus areas
    "CUISINE_PREFERENCE": "Indian",            # default cuisine for meal plans
    "SAFETY_RULES": [...],                     # hard rules the agent follows
    "INDIAN_FOOD_PREFS": {...},                # Indian food context
    "SYSTEM_PROMPT_EXTRA": "...",              # extra instructions appended to every prompt
}
```

### Example Customisations

| Goal | Change |
|------|--------|
| Clinical dietitian tone | `"AGENT_TONE": "clinical"` |
| Focus on diabetes | `"DIET_SPECIALIZATION": "diabetes-friendly, low-glycemic"` |
| Vegan focus | `"INDIAN_FOOD_PREFS": {"respect_vegetarian": True, "staples": ["tofu", "tempeh", ...]}` |
| Hindi responses | `"LANGUAGE_STYLE": "bilingual-hindi"` |
| Custom safety rule | Add to `"SAFETY_RULES"` list |

---

## 🌟 Features

| Feature | Description |
|---------|-------------|
| 💬 **AI Chat** | Conversational nutrition assistant powered by IBM Granite |
| 📊 **Dashboard** | BMI, calorie stats, macro breakdown, daily tips |
| 🍽️ **Meal Planner** | AI-generated 1–14 day Indian meal plans |
| 🔬 **Food Analyzer** | Detailed nutritional analysis for any meal |
| ⚖️ **BMI Calculator** | BMI + TDEE with Harris-Benedict formula |
| 👨‍👩‍👧‍👦 **Family Plan** | Multi-member family nutrition planning |
| 🌙 **Dark Mode** | Full dark/light mode toggle |
| 📱 **Mobile Ready** | Fully responsive with offcanvas sidebar |

---

## 🚀 Deployment

### Option A: Gunicorn (Production Linux/macOS)

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Option B: IBM Code Engine

```bash
# Install IBM Cloud CLI + Code Engine plugin
ibmcloud login
ibmcloud ce project create --name nutribot
ibmcloud ce application create \
  --name nutribot \
  --image <your-container-image> \
  --env-from-secret nutribot-secrets \
  --port 5000
```

### Option C: Docker

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
```

```bash
docker build -t nutribot .
docker run -p 5000:5000 --env-file .env nutribot
```

### Option D: Render / Railway / Fly.io

1. Push to GitHub
2. Connect the repo to Render/Railway
3. Set environment variables in the dashboard
4. Deploy — done!

---

## 🔒 Security Notes

- Never commit `.env` to version control
- Add `.env` to `.gitignore`
- Rotate IBM API keys periodically
- Use `FLASK_DEBUG=false` in production
- Set a strong random `FLASK_SECRET_KEY` (use `python -c "import secrets; print(secrets.token_hex(32))"`)

---

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send a chat message |
| POST | `/api/bmi` | Calculate BMI + TDEE |
| POST | `/api/meal-plan` | Generate AI meal plan |
| POST | `/api/analyze-food` | Analyse food nutritional content |
| POST | `/api/family-plan` | Generate family nutrition plan |
| GET  | `/api/quick-tips` | Get static nutrition tips |
| GET  | `/api/history` | Get current session chat history |
| POST | `/api/clear-history` | Clear chat history |

---

## 📦 Available Granite Models

| Model | Best For |
|-------|----------|
| `ibm/granite-13b-instruct-v2` | Best quality, default recommendation |
| `ibm/granite-3-8b-instruct`  | Faster, lower cost |
| `ibm/granite-8b-code-instruct` | Code + structured output |
| `ibm/granite-20b-multilingual` | Multi-language including Hindi |

---

## 🐛 Troubleshooting

**"IBM credentials not configured"**
→ Make sure `.env` exists and has valid `IBM_API_KEY` and `IBM_PROJECT_ID`

**"403 Forbidden" from Watsonx**
→ Ensure your IBM API Key has Watsonx.ai Editor or Admin role on the project

**Slow responses**
→ Switch to `ibm/granite-3-8b-instruct` for faster replies

**Templates not found**
→ Run `python app.py` from the project root directory

---

## 📝 Licence

MIT — Free to use and modify.

---
*Powered by IBM Watsonx.ai · Granite Foundation Models · Flask · Bootstrap 5*
