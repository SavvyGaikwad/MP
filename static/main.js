/* =========================================================
   GuidedMind — main.js
   Landing ↔ Chat transitions, particle canvas,
   chat engine, markdown renderer, constraint flags
   ========================================================= */

'use strict';

// ─── Constants ──────────────────────────────────────────────
const MOTIVATIONS = [
  "🔥 You're still here — that's the whole game. Keep pushing.",
  "💪 Every scaffold you work through is a rep your brain won't forget.",
  "🎯 ChatGPT would've just answered it. You'd have learned nothing.",
  "🧠 The friction you feel right now is neurons wiring together. Lean in.",
  "⚡ Discomfort is the signal that real learning is happening.",
  "🌱 Growth is uncomfortable. Comfort is stagnation. You chose right.",
  "🏆 The student who struggles always outperforms the one who copied.",
  "🎓 Guided minds become great minds. Stay the course.",
  "🔬 You're not here for shortcuts — you're here to actually understand.",
  "✨ The harder this feels, the more permanent the knowledge.",
];

const INTENT_PROFILES = {
  concept: { label: "Conceptual",  icon: "💡", chipClass: "mc-concept" },
  math:    { label: "Mathematics", icon: "🔢", chipClass: "mc-math"    },
  coding:  { label: "Coding",      icon: "💻", chipClass: "mc-coding"  },
  essay:   { label: "Essay",       icon: "✍️", chipClass: "mc-essay"   },
};

const KEYWORDS = {
  concept: ["explain","what is","why does","how does","define","describe","difference between","compare","theory","concept"],
  math:    ["calculate","solve","equation","integral","derivative","proof","formula","matrix","algebra","compute","find the value","evaluate","simplify"],
  coding:  ["code","program","function","debug","algorithm","python","java","javascript","class","loop","array","sql","implement","script","compile","runtime"],
  essay:   ["essay","write","paragraph","thesis","argument","introduction","conclusion","article","report","analyse","discuss","critique"],
};

const RESTRICT_LABELS = { high: "🔴 High Restriction", medium: "🟡 Medium Restriction", low: "🟢 Low Restriction" };

// ─── State ──────────────────────────────────────────────────
let isLoading  = false;
let chatActive = false;
let landingParticles = [];
let chatParticles    = [];
let animFrameLanding = null;
let animFrameChat    = null;

// ─── DOM Refs (resolved on DOMContentLoaded) ─────────────────
let landingPage, chatPage, messagesArea, chatInput, chatSendBtn;

// ─── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  landingPage  = document.getElementById("landingPage");
  chatPage     = document.getElementById("chatPage");
  messagesArea = document.getElementById("messagesArea");
  chatInput    = document.getElementById("chatInput");
  chatSendBtn  = document.getElementById("chatSendBtn");

  initParticles("particleCanvas", landingParticles, true);
  setupDomainPills();
  setupTextarea();
});

// ─── Particle System ─────────────────────────────────────────
function initParticles(canvasId, store, isLanding) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const COUNT = isLanding ? 70 : 45;

  function resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  store.length = 0;
  for (let i = 0; i < COUNT; i++) {
    store.push({
      x:  Math.random() * (canvas.width  || 1400),
      y:  Math.random() * (canvas.height || 900),
      r:  Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      a:  Math.random() * 0.5 + 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    store.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212,168,83,${p.a})`;
      ctx.fill();
    });

    // Draw faint connection lines
    for (let i = 0; i < store.length; i++) {
      for (let j = i + 1; j < store.length; j++) {
        const dx = store[i].x - store[j].x;
        const dy = store[i].y - store[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(store[i].x, store[i].y);
          ctx.lineTo(store[j].x, store[j].y);
          ctx.strokeStyle = `rgba(212,168,83,${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    if (isLanding) {
      animFrameLanding = requestAnimationFrame(draw);
    } else {
      animFrameChat = requestAnimationFrame(draw);
    }
  }

  if (isLanding) {
    if (animFrameLanding) cancelAnimationFrame(animFrameLanding);
    animFrameLanding = requestAnimationFrame(draw);
  } else {
    if (animFrameChat) cancelAnimationFrame(animFrameChat);
    animFrameChat = requestAnimationFrame(draw);
  }
}

// ─── Page Transitions ────────────────────────────────────────
function enterChatMode() {
  chatActive = true;
  landingPage.classList.add("fade-out");

  setTimeout(() => {
    landingPage.classList.add("hidden");
    chatPage.classList.remove("hidden");
    chatPage.classList.add("fade-in");
    initParticles("chatParticleCanvas", chatParticles, false);
    injectWelcomeMessage();
    chatInput.focus();
  }, 400);
}

function exitChatMode() {
  chatActive = false;
  chatPage.classList.add("hidden");
  landingPage.classList.remove("hidden", "fade-out");
  if (animFrameChat) cancelAnimationFrame(animFrameChat);
}

// ─── Domain Pills ─────────────────────────────────────────────
function setupDomainPills() {
  document.querySelectorAll(".d-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".d-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// ─── Textarea auto-resize + live intent sniff ─────────────────
function setupTextarea() {
  if (!chatInput) return;

  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";

    const sniff = document.getElementById("intentSniff");
    if (!sniff) return;
    const q = chatInput.value.trim();
    if (q.length > 8) {
      const g = guessIntent(q);
      sniff.textContent = g.icon + " " + g.label;
      sniff.classList.add("visible");
    } else {
      sniff.classList.remove("visible");
    }
  });

  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChatQuery();
    }
  });
}

// ─── Intent classifier (client-side mirror) ──────────────────
function guessIntent(query) {
  const q = query.toLowerCase();
  const scores = {};
  Object.keys(KEYWORDS).forEach(k => {
    scores[k] = KEYWORDS[k].filter(kw => q.includes(kw)).length;
  });
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return INTENT_PROFILES[scores[best] > 0 ? best : "concept"];
}

// ─── Welcome message ─────────────────────────────────────────
function injectWelcomeMessage() {
  if (!messagesArea) return;
  messagesArea.innerHTML = "";
  const row = document.createElement("div");
  row.className = "msg-row welcome-msg";
  row.innerHTML = `
    <div class="msg-avatar ai-avatar">GM</div>
    <div class="msg-bubble ai-bubble">
      <div class="welcome-title">Welcome to GuidedMind 🎓</div>
      <div class="welcome-body">
        I'm your <em>Cognitive Constraint Chatbot</em> — built on Restrictive Productivity Theory.
        I will <em>never</em> hand you the answer. I will give you the key concepts,
        a thinking scaffold, and one Socratic question that forces you to
        reason one level deeper.<br/><br/>
        That friction you'll feel? <em>That's the learning.</em> Ask me anything hard.
      </div>
    </div>
  `;
  messagesArea.appendChild(row);
}

// ─── Submit ───────────────────────────────────────────────────
async function submitChatQuery() {
  if (isLoading || !chatInput) return;
  const query = chatInput.value.trim();
  if (!query) return;

  isLoading = true;
  chatSendBtn.disabled = true;

  // Clear input
  chatInput.value = "";
  chatInput.style.height = "auto";
  document.getElementById("intentSniff")?.classList.remove("visible");

  // Append user message
  appendUserMessage(query);

  // Append loading
  const loadingEl = appendLoadingMessage();

  try {
    // Read whichever pill is active
    const activePill = document.querySelector(".d-pill.active");
    const forcedIntent = activePill ? activePill.dataset.intent : null;

    const res  = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, intent: forcedIntent }),
    });
    const data = await res.json();

    loadingEl.remove();

    if (!res.ok || data.error) {
      appendErrorMessage(data.error || "API error. Please try again.");
      return;
    }

    appendAIMessage(data);

    // Sync domain pill
    if (data.intent?.key) {
      document.querySelectorAll(".d-pill").forEach(b => b.classList.remove("active"));
      document.querySelector(`[data-intent="${data.intent.key}"]`)?.classList.add("active");
    }

  } catch (err) {
    loadingEl.remove();
    appendErrorMessage("Network error. Could not reach the server.");
  } finally {
    isLoading = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}

// ─── Message builders ─────────────────────────────────────────
function appendUserMessage(text) {
  const row = document.createElement("div");
  row.className = "msg-row user-row";
  row.innerHTML = `
    <div class="msg-avatar user-avatar">U</div>
    <div class="msg-bubble user-bubble">
      <div class="msg-text">${escapeHtml(text)}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

function appendLoadingMessage() {
  const row = document.createElement("div");
  row.className = "msg-row loading-row";
  row.innerHTML = `
    <div class="msg-avatar ai-avatar">GM</div>
    <div class="msg-bubble ai-bubble">
      <div class="dots-loader">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
  return row;
}

function appendAIMessage(data) {
  const profile  = INTENT_PROFILES[data.intent?.key] || INTENT_PROFILES.concept;
  const restrict = RESTRICT_LABELS[data.intent?.restriction_level] || "Medium";
  const motiv    = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];

  let flagsHtml = "";
  if (data.flags?.length) {
    flagsHtml = `<div class="msg-flags">
      ${data.flags.map(f => `<span class="flag-chip">${f}</span>`).join("")}
    </div>`;
  }

  const row = document.createElement("div");
  row.className = "msg-row";
  row.innerHTML = `
    <div class="msg-avatar ai-avatar">GM</div>
    <div class="msg-bubble ai-bubble">
      <div class="msg-meta">
        <span class="meta-chip ${profile.chipClass}">${profile.icon} ${profile.label}</span>
        <span class="meta-chip mc-restrict">${restrict}</span>
      </div>
      <div class="msg-body">${renderMarkdown(data.response)}</div>
      ${flagsHtml}
      <div class="msg-motivation">${motiv}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

function appendErrorMessage(msg) {
  const row = document.createElement("div");
  row.className = "msg-row";
  row.innerHTML = `
    <div class="msg-avatar ai-avatar">!</div>
    <div class="msg-bubble ai-bubble">
      <div class="msg-body" style="color:var(--coral)">${escapeHtml(msg)}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

// ─── Markdown renderer ────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";

  // Escape HTML first
  let html = text
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");

  // Headers
  html = html
    .replace(/^#### (.*?)$/gm, "<h4>$1</h4>")
    .replace(/^### (.*?)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.*?)$/gm,   "<h2>$1</h2>")
    .replace(/^# (.*?)$/gm,    "<h2>$1</h2>");

  // Bold / italic
  html = html
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g,     "<strong>$1</strong>")
    .replace(/__(.*?)__/g,         "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g,         "<em>$1</em>")
    .replace(/_(.*?)_/g,           "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Blockquote
  html = html.replace(/^&gt; (.*?)$/gm, "<blockquote>$1</blockquote>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr/>");

  // Emoji-led section headings (🔑 🧩 🤔 📚 ⚡ etc)
  html = html.replace(
    /^(🔑|🧩|🤔|📚|⚡|💡|🔢|✍️|💻|🎯|📌|🔍|🧠|🌱|✅|🔥)(.*?)$/gm,
    "<p><strong>$1$2</strong></p>"
  );

  // Unordered lists
  html = html.replace(/^[\-\*•] (.*?)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, "<ul>$&</ul>");

  // Ordered lists
  html = html.replace(/^\d+\. (.*?)$/gm, "<li>$1</li>");

  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return "";
      if (/^<(h[1-4]|ul|ol|li|blockquote|hr)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

// ─── Utilities ────────────────────────────────────────────────
function scrollBottom() {
  setTimeout(() => {
    if (messagesArea) {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }
  }, 60);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

// Expose globals for onclick attributes
window.enterChatMode   = enterChatMode;
window.exitChatMode    = exitChatMode;
window.submitChatQuery = submitChatQuery;