/**
 * NutriBot — app.js
 * Frontend logic: tab navigation, chat, meal plan, BMI, family plan, food analyzer
 */

"use strict";

// ── STATE ─────────────────────────────────────────────────────────────────

const State = {
  profile:       JSON.parse(localStorage.getItem("nutribot_profile") || "null"),
  familyMembers: JSON.parse(localStorage.getItem("nutribot_family")  || "[]"),
  currentTab:    "chat",
  tipsRotateIdx: 0,
  tipsData:      [],
};

// ── DOM HELPERS ───────────────────────────────────────────────────────────

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function showToast(msg, type = "success") {
  const toast = $("#notifToast");
  toast.classList.remove("bg-success", "bg-danger", "bg-warning", "text-white");
  if (type === "success")  toast.classList.add("bg-success", "text-white");
  if (type === "error")    toast.classList.add("bg-danger",  "text-white");
  if (type === "warning")  toast.classList.add("bg-warning");
  $("#toastMsg").textContent = msg;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

/** Converts plain text with bullet lines into HTML */
function formatBotMessage(text) {
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Bullet lines starting with - or •
  text = text.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> in <ul>
  text = text.replace(/(<li>.*<\/li>\n?)+/gs, m => `<ul>${m}</ul>`);
  // Day headers
  text = text.replace(/^(Day \d+[:\-\s])/gm, "<strong class='text-green'>$1</strong>");
  // Meal headers
  text = text.replace(/^(Breakfast|Lunch|Dinner|Snack[s]?|Mid-Morning|Evening)[:\-]/gm,
    m => `<span class='fw-600'>🍽️ ${m}</span>`);
  // Line breaks
  text = text.replace(/\n/g, "<br>");
  return text;
}

function setLoading(containerId, msg = "Generating with IBM Granite AI…") {
  $(containerId).innerHTML = `
    <div class="loading-block">
      <div class="spinner-border" role="status"></div>
      <span class="pulsing">${msg}</span>
    </div>`;
}

// ── TAB NAVIGATION ────────────────────────────────────────────────────────

function switchTab(tabId) {
  // Hide all panes
  $$(".tab-pane").forEach(p => p.classList.remove("active"));
  // Deactivate all nav items
  $$(".nav-item[data-tab]").forEach(n => n.classList.remove("active"));

  // Show target pane
  const pane = $(`#tab-${tabId}`);
  if (pane) {
    pane.classList.add("active", "fade-in");
    setTimeout(() => pane.classList.remove("fade-in"), 300);
  }

  // Activate nav items (both sidebar + mobile)
  $$(`[data-tab="${tabId}"]`).forEach(n => n.classList.add("active"));

  State.currentTab = tabId;

  // Lazy-load tab-specific data
  if (tabId === "dashboard") renderDashboard();
}

// Attach nav click events (delegated)
document.addEventListener("click", e => {
  const nav = e.target.closest("[data-tab]");
  if (nav) {
    e.preventDefault();
    switchTab(nav.dataset.tab);
    // Close offcanvas if open
    const oc = bootstrap.Offcanvas.getInstance($("#sidebarOffcanvas"));
    if (oc) oc.hide();
  }
});

// ── DARK MODE ─────────────────────────────────────────────────────────────

function applyTheme(dark) {
  document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");
  $("#darkModeToggle").innerHTML = dark
    ? `<i class="bi bi-sun-fill"></i>`
    : `<i class="bi bi-moon-stars-fill"></i>`;
  localStorage.setItem("nutribot_dark", dark ? "1" : "0");
}

(function initTheme() {
  const saved = localStorage.getItem("nutribot_dark");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved !== null ? saved === "1" : prefersDark);
})();

$("#darkModeToggle").addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-bs-theme") === "dark";
  applyTheme(!isDark);
});

// ── PROFILE ───────────────────────────────────────────────────────────────

function loadProfileToForm() {
  const p = State.profile;
  if (!p) return;
  const fields = {
    profileName: "name", profileAge: "age", profileGender: "gender",
    profileWeight: "weight", profileHeight: "height", profileFamily: "family_count",
    profileActivity: "activity", profileGoal: "goal",
    profileRestrictions: "restrictions", profileHealth: "health_conditions",
  };
  for (const [id, key] of Object.entries(fields)) {
    const el = $(` #${id}`);
    if (el && p[key] !== undefined) el.value = p[key];
  }
}

function saveProfile() {
  const p = {
    name:             $("#profileName").value.trim()  || "User",
    age:              parseInt($("#profileAge").value) || 25,
    gender:           $("#profileGender").value,
    weight:           parseFloat($("#profileWeight").value) || 0,
    height:           parseFloat($("#profileHeight").value) || 0,
    family_count:     parseInt($("#profileFamily").value)   || 1,
    activity:         $("#profileActivity").value,
    goal:             $("#profileGoal").value,
    restrictions:     $("#profileRestrictions").value.trim(),
    health_conditions:$("#profileHealth").value.trim(),
  };

  // Auto-calculate calories if weight & height present
  if (p.weight && p.height) {
    const bmr = p.gender === "male"
      ? 88.362 + 13.397*p.weight + 4.799*p.height - 5.677*p.age
      : 447.593 + 9.247*p.weight + 3.098*p.height - 4.330*p.age;
    const mults = { sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9 };
    p.calories = Math.round(bmr * (mults[p.activity] || 1.55));
  }

  State.profile = p;
  localStorage.setItem("nutribot_profile", JSON.stringify(p));
  updateSidebarProfile();
  bootstrap.Modal.getInstance($("#profileModal")).hide();
  showToast("Profile saved!");
}

function updateSidebarProfile() {
  const p = State.profile;
  if (!p) return;
  const avatars = { male: "👨", female: "👩", other: "🧑" };
  $("#profileAvatar").textContent = avatars[p.gender] || "👤";
  $("#sidebarName").textContent   = p.name || "Your Profile";
  $("#sidebarGoal").textContent   = p.goal || "Set a goal";
}

$("#saveProfileBtn").addEventListener("click", saveProfile);
$("#profileModal").addEventListener("show.bs.modal", loadProfileToForm);

// ── QUICK TIPS ────────────────────────────────────────────────────────────

async function loadTips() {
  try {
    const res  = await fetch("/api/quick-tips");
    const data = await res.json();
    State.tipsData = data.tips || [];
    if (State.tipsData.length) rotateDailyTip();
  } catch (_) {}
}

function rotateDailyTip() {
  const tips = State.tipsData;
  if (!tips.length) return;
  const t = tips[State.tipsRotateIdx % tips.length];
  $("#dailyTip").innerHTML = `<span class="tip-icon">${t.icon}</span><span class="tip-text">${t.tip}</span>`;
  State.tipsRotateIdx++;
}

// Rotate tip every 30 s
setInterval(rotateDailyTip, 30_000);

// ── CHAT ──────────────────────────────────────────────────────────────────

let chatWelcomeShown = true;

function appendMessage(role, text, time = "") {
  const messages = $("#chatMessages");

  // Remove welcome screen on first message
  const welcome = $(".chat-welcome", messages);
  if (welcome) { welcome.remove(); chatWelcomeShown = false; }

  const wrap = document.createElement("div");
  wrap.className = `chat-bubble-wrap ${role}`;

  const avatarHtml = role === "bot"
    ? `<div class="agent-avatar-xs">🥗</div>`
    : `<div class="agent-avatar-xs" style="background:var(--green-100)">👤</div>`;

  const bubbleClass = role === "error" ? "bot error" : role;
  const formatted   = role === "bot" ? formatBotMessage(text) : escapeHtml(text);
  const timeStr     = time || new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

  wrap.innerHTML = `
    ${role !== "user" ? avatarHtml : ""}
    <div>
      <div class="chat-bubble ${bubbleClass}">${formatted}</div>
      <div class="bubble-time">${timeStr}</div>
    </div>
    ${role === "user" ? avatarHtml : ""}
  `;

  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

async function sendMessage(text) {
  if (!text.trim()) return;

  appendMessage("user", text);
  $("#chatInput").value = "";
  autoResizeTextarea();

  // Show typing indicator
  const ti = $("#typingIndicator");
  ti.classList.remove("d-none");
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, profile: State.profile || {} }),
    });
    const data = await res.json();
    ti.classList.add("d-none");

    if (data.error) {
      appendMessage("error", `⚠️ ${data.error}`);
    } else {
      appendMessage("bot", data.reply, data.timestamp);
    }
  } catch (err) {
    ti.classList.add("d-none");
    appendMessage("error", "⚠️ Network error. Please check your connection.");
  }
}

// Send button
$("#sendBtn").addEventListener("click", () => sendMessage($("#chatInput").value));

// Enter key (Shift+Enter = newline)
$("#chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage($("#chatInput").value);
  }
});

// Auto-resize textarea
function autoResizeTextarea() {
  const ta = $("#chatInput");
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
}
$("#chatInput").addEventListener("input", autoResizeTextarea);

// Quick question buttons
document.addEventListener("click", e => {
  if (e.target.classList.contains("quick-q")) {
    switchTab("chat");
    sendMessage(e.target.textContent.trim());
  }
});

// Clear chat
$("#clearChatBtn").addEventListener("click", async () => {
  await fetch("/api/clear-history", { method: "POST" });
  $("#chatMessages").innerHTML = `
    <div class="chat-welcome text-center py-5">
      <div class="welcome-icon">🥗</div>
      <h4 class="mt-3 fw-700">Chat cleared!</h4>
      <p class="text-muted">Start a new conversation below.</p>
    </div>`;
  showToast("Chat cleared");
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────

async function renderDashboard() {
  const p = State.profile;

  // Stats
  $("#statGoal").textContent    = p ? capitalise(p.goal || "—") : "—";
  $("#statCalories").textContent = p?.calories ? `${p.calories} kcal` : "—";

  // BMI
  if (p?.weight && p?.height) {
    const h = p.height / 100;
    const bmi = (p.weight / (h * h)).toFixed(1);
    $("#statBMI").textContent = bmi;
  }

  // Profile summary card
  const ps = $("#profileSummary");
  if (p) {
    ps.innerHTML = `
      <table class="w-100" style="font-size:0.88rem">
        <tr><td class="text-muted py-1">Name</td><td class="fw-600 text-end">${escapeHtml(p.name)}</td></tr>
        <tr><td class="text-muted py-1">Age / Gender</td><td class="fw-600 text-end">${p.age} yrs · ${capitalise(p.gender)}</td></tr>
        <tr><td class="text-muted py-1">Weight / Height</td><td class="fw-600 text-end">${p.weight} kg · ${p.height} cm</td></tr>
        <tr><td class="text-muted py-1">Activity</td><td class="fw-600 text-end">${capitalise(p.activity)}</td></tr>
        <tr><td class="text-muted py-1">Goal</td><td class="fw-600 text-end">${capitalise(p.goal)}</td></tr>
        ${p.restrictions ? `<tr><td class="text-muted py-1">Restrictions</td><td class="fw-600 text-end">${escapeHtml(p.restrictions)}</td></tr>` : ""}
      </table>`;
  }

  // Macros
  const md = $("#macroDisplay");
  if (p?.calories) {
    const cal   = p.calories;
    const carbs = Math.round(cal * 0.50 / 4);
    const prot  = Math.round(cal * 0.25 / 4);
    const fat   = Math.round(cal * 0.25 / 9);
    md.innerHTML = `
      ${macroBar("Carbohydrates", carbs, "g", "#3b82f6", Math.min(carbs/350*100,100))}
      ${macroBar("Protein",       prot,  "g", "#22c55e", Math.min(prot/180*100,100))}
      ${macroBar("Fat",           fat,   "g", "#f59e0b", Math.min(fat/80*100,100))}
      <p class="text-muted mt-3 mb-0" style="font-size:0.78rem">
        Based on 50% carbs · 25% protein · 25% fat split for ${cal} kcal/day
      </p>`;
  }

  // Tips
  const tg = $("#tipsGrid");
  if (State.tipsData.length) {
    tg.innerHTML = State.tipsData.map(t => `
      <div class="col-md-6 col-lg-4">
        <div class="tip-grid-item">
          <span class="tip-icon">${t.icon}</span>
          <span>${t.tip}</span>
        </div>
      </div>`).join("");
  }
}

function macroBar(name, val, unit, color, pct) {
  return `
    <div class="macro-bar">
      <div class="macro-label">
        <span>${name}</span>
        <span>${val}${unit}</span>
      </div>
      <div class="macro-track">
        <div class="macro-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

// ── MEAL PLAN ─────────────────────────────────────────────────────────────

$("#generateMealPlanBtn").addEventListener("click", async () => {
  const days     = $("#planDays").value;
  const goal     = $("#planGoal").value;
  const calories = $("#planCalories").value || (State.profile?.calories || 2000);

  setLoading("#mealPlanOutput", `Generating your ${days}-day meal plan…`);

  try {
    const res  = await fetch("/api/meal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days, goal,
        profile: { ...State.profile, calories, goal },
      }),
    });
    const data = await res.json();

    if (data.error) {
      $("#mealPlanOutput").innerHTML = errorBlock(data.error);
    } else {
      $("#mealPlanOutput").innerHTML = `
        <div class="output-content">${formatBotMessage(data.meal_plan)}</div>
        <div class="mt-3 d-flex gap-2">
          <button class="btn btn-sm btn-outline-success" onclick="copyOutput(this)">
            <i class="bi bi-clipboard me-1"></i>Copy
          </button>
          <button class="btn btn-sm btn-success" onclick="chatAboutPlan()">
            <i class="bi bi-chat-dots me-1"></i>Ask questions about this plan
          </button>
        </div>`;
    }
  } catch (err) {
    $("#mealPlanOutput").innerHTML = errorBlock("Network error: " + err.message);
  }
});

function chatAboutPlan() {
  switchTab("chat");
  setTimeout(() => sendMessage("Can you explain my meal plan in more detail and give shopping tips?"), 100);
}

// ── FOOD ANALYZER ─────────────────────────────────────────────────────────

$("#analyzeBtn").addEventListener("click", async () => {
  const foods = $("#foodInput").value.trim();
  if (!foods) { showToast("Please enter food items", "warning"); return; }

  setLoading("#analysisOutput", "Analysing nutritional content…");

  try {
    const res  = await fetch("/api/analyze-food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foods }),
    });
    const data = await res.json();

    if (data.error) {
      $("#analysisOutput").innerHTML = errorBlock(data.error);
    } else {
      $("#analysisOutput").innerHTML = `
        <div class="output-content">${formatBotMessage(data.analysis)}</div>
        <div class="mt-3">
          <button class="btn btn-sm btn-outline-success" onclick="copyOutput(this)">
            <i class="bi bi-clipboard me-1"></i>Copy Analysis
          </button>
        </div>`;
    }
  } catch (err) {
    $("#analysisOutput").innerHTML = errorBlock("Network error: " + err.message);
  }
});

// ── BMI CALCULATOR ────────────────────────────────────────────────────────

$("#calcBMIBtn").addEventListener("click", async () => {
  const weight   = parseFloat($("#bmiWeight").value);
  const height   = parseFloat($("#bmiHeight").value);
  const age      = parseInt($("#bmiAge").value) || 25;
  const gender   = $("#bmiGender").value;
  const activity = $("#bmiActivity").value;

  if (!weight || !height) { showToast("Please enter weight and height", "warning"); return; }

  try {
    const res  = await fetch("/api/bmi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weight, height, age, gender, activity }),
    });
    const d = await res.json();
    if (d.error) { showToast(d.error, "error"); return; }

    const badgeClass = {
      "Underweight": "underweight", "Normal weight": "normal",
      "Overweight":  "overweight",  "Obese": "obese",
    }[d.category] || "normal";

    const bmiColor = {
      underweight: "#3b82f6", normal: "#22c55e",
      overweight:  "#f59e0b", obese:  "#ef4444",
    }[badgeClass];

    $("#bmiResult").innerHTML = `
      <div class="bmi-result-card">
        <div class="row g-3">
          <div class="col-sm-5 text-center">
            <div class="bmi-big-number" style="color:${bmiColor}">${d.bmi}</div>
            <div class="text-muted small mb-2">BMI Score</div>
            <span class="bmi-badge ${badgeClass}">${d.category}</span>
            <p class="mt-3 text-muted small">${d.advice}</p>
          </div>
          <div class="col-sm-7">
            <div class="fw-600 mb-3">Daily Calorie Estimates</div>
            <table class="tdee-table">
              <tr><td>Basal Metabolic Rate (BMR)</td><td>${d.bmr} kcal</td></tr>
              <tr><td>Maintenance (TDEE)</td>        <td>${d.maintenance} kcal</td></tr>
              <tr><td>Weight Loss (−500 kcal)</td>   <td>${d.weight_loss} kcal</td></tr>
              <tr><td>Weight Gain (+300 kcal)</td>   <td>${d.weight_gain} kcal</td></tr>
            </table>
            <div class="mt-3 d-flex gap-2 flex-wrap">
              <button class="btn btn-sm btn-success"
                onclick="askBMIAdvice(${d.bmi},'${d.category}')">
                <i class="bi bi-chat-dots me-1"></i>Get personalised advice
              </button>
            </div>
          </div>
        </div>
      </div>`;
  } catch (err) {
    showToast("Calculation error: " + err.message, "error");
  }
});

function askBMIAdvice(bmi, category) {
  switchTab("chat");
  setTimeout(() => sendMessage(
    `My BMI is ${bmi} (${category}). What nutrition and lifestyle changes should I make?`), 100);
}

// ── FAMILY PLAN ───────────────────────────────────────────────────────────

function renderFamilyMembers() {
  const list = $("#familyMembersList");
  if (!State.familyMembers.length) {
    list.innerHTML = `
      <div class="col-12 text-center text-muted py-4">
        <p>No family members added yet. Click <strong>Add Member</strong> to get started.</p>
      </div>`;
    return;
  }

  const avatars = { male: "👨", female: "👩" };
  list.innerHTML = State.familyMembers.map((m, i) => `
    <div class="col-md-6 col-lg-4">
      <div class="member-card d-flex align-items-center gap-3">
        <button class="remove-btn" onclick="removeMember(${i})">
          <i class="bi bi-x-circle"></i>
        </button>
        <div class="member-avatar">${avatars[m.gender] || "🧑"}</div>
        <div>
          <div class="fw-600">${escapeHtml(m.name)}</div>
          <div class="small text-muted">${m.age} yrs · ${capitalise(m.gender)}</div>
          <div class="small text-muted">${capitalise(m.goal)}
            ${m.restrictions ? ` · ${m.restrictions}` : ""}
          </div>
        </div>
      </div>
    </div>`).join("");
}

function removeMember(idx) {
  State.familyMembers.splice(idx, 1);
  localStorage.setItem("nutribot_family", JSON.stringify(State.familyMembers));
  renderFamilyMembers();
  showToast("Member removed");
}

$("#addMemberBtn").addEventListener("click", () => {
  bootstrap.Modal.getOrCreateInstance($("#addMemberModal")).show();
});

$("#saveMemberBtn").addEventListener("click", () => {
  const name = $("#memberName").value.trim();
  if (!name) { showToast("Please enter a name", "warning"); return; }

  State.familyMembers.push({
    name, age:  parseInt($("#memberAge").value) || 30,
    gender: $("#memberGender").value,
    goal:   $("#memberGoal").value,
    restrictions: $("#memberRestrictions").value.trim(),
  });

  localStorage.setItem("nutribot_family", JSON.stringify(State.familyMembers));
  renderFamilyMembers();
  bootstrap.Modal.getInstance($("#addMemberModal")).hide();
  // Reset fields
  ["memberName","memberAge","memberRestrictions"].forEach(id => $(` #${id}`).value = "");
  showToast("Member added!");
});

$("#generateFamilyPlanBtn").addEventListener("click", async () => {
  if (!State.familyMembers.length) {
    showToast("Add at least one family member first", "warning"); return;
  }

  setLoading("#familyPlanOutput", "Creating your family nutrition plan…");

  try {
    const res  = await fetch("/api/family-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: State.familyMembers }),
    });
    const data = await res.json();

    if (data.error) {
      $("#familyPlanOutput").innerHTML = errorBlock(data.error);
    } else {
      $("#familyPlanOutput").innerHTML = `
        <div class="output-content">${formatBotMessage(data.family_plan)}</div>
        <div class="mt-3">
          <button class="btn btn-sm btn-outline-success" onclick="copyOutput(this)">
            <i class="bi bi-clipboard me-1"></i>Copy
          </button>
          <button class="btn btn-sm btn-success ms-2" onclick="chatAboutFamily()">
            <i class="bi bi-chat-dots me-1"></i>Discuss with AI
          </button>
        </div>`;
    }
  } catch (err) {
    $("#familyPlanOutput").innerHTML = errorBlock("Network error: " + err.message);
  }
});

function chatAboutFamily() {
  const names = State.familyMembers.map(m => m.name).join(", ");
  switchTab("chat");
  setTimeout(() => sendMessage(
    `I have a family plan for ${names}. Can you suggest Indian grocery shopping tips and batch cooking ideas?`), 100);
}

// ── UTILITIES ─────────────────────────────────────────────────────────────

function capitalise(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, " ");
}

function errorBlock(msg) {
  return `<div class="alert alert-danger m-0"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(msg)}</div>`;
}

function copyOutput(btn) {
  const text = btn.closest(".card-body, .card").querySelector(".output-content");
  if (!text) return;
  navigator.clipboard.writeText(text.innerText).then(() => showToast("Copied to clipboard!"));
}

// ── MOBILE SIDEBAR CLONE ──────────────────────────────────────────────────

function buildMobileSidebar() {
  const content = $("#mobileSidebarContent");
  content.innerHTML = `
    <div class="sidebar-profile p-3">
      <div class="profile-avatar mx-auto mb-2" id="mobAvatar">👤</div>
      <div class="text-center">
        <div class="fw-600 text-light" id="mobName">Your Profile</div>
        <div class="text-muted small" id="mobGoal">Set up your profile</div>
      </div>
      <button class="btn btn-sm btn-outline-success w-100 mt-2"
              data-bs-toggle="modal" data-bs-target="#profileModal"
              data-bs-dismiss="offcanvas">
        <i class="bi bi-pencil-square me-1"></i>Edit Profile
      </button>
    </div>
    <hr class="sidebar-divider">
    <nav class="sidebar-nav px-2">
      ${[
        ["chat",      "bi-chat-dots-fill",         "Chat"],
        ["dashboard", "bi-bar-chart-fill",          "Dashboard"],
        ["mealplan",  "bi-calendar3-week-fill",     "Meal Plan"],
        ["analyzer",  "bi-search-heart-fill",       "Food Analyzer"],
        ["bmi",       "bi-activity",                "BMI Calculator"],
        ["family",    "bi-people-fill",             "Family Plan"],
      ].map(([tab, icon, label]) => `
        <a class="nav-item ${State.currentTab === tab ? "active" : ""}" data-tab="${tab}">
          <i class="bi ${icon}"></i><span>${label}</span>
        </a>`).join("")}
    </nav>`;

  // Sync profile avatar in mobile sidebar
  if (State.profile) {
    const avatars = { male: "👨", female: "👩", other: "🧑" };
    const el = content.querySelector("#mobAvatar");
    if (el) el.textContent = avatars[State.profile.gender] || "👤";
    const nm = content.querySelector("#mobName");
    if (nm) nm.textContent = State.profile.name || "Your Profile";
    const gl = content.querySelector("#mobGoal");
    if (gl) gl.textContent = State.profile.goal || "Set a goal";
  }
}

$("#sidebarOffcanvas").addEventListener("show.bs.offcanvas", buildMobileSidebar);

// ── INIT ──────────────────────────────────────────────────────────────────

(function init() {
  if (State.profile) updateSidebarProfile();
  renderFamilyMembers();
  loadTips();
})();
