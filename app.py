from flask import Flask, request, jsonify, render_template, send_from_directory
import requests
import json
import re
import os

# ─── Bloom's Taxonomy Intent Classifier ───────────────────────────────────────
INTENT_PROFILES = {
    "essay": {
        "label": "Essay / Writing",
        "restriction_level": "high",
        "hint": "Provide an outline structure, key argument angles, and what evidence to consider. Do NOT write paragraphs or conclusions.",
        "icon": "✍️"
    },
    "math": {
        "label": "Mathematics",
        "restriction_level": "medium",
        "hint": "Identify the relevant formula or theorem and guide the first logical step. Do NOT compute or reveal the final numerical answer.",
        "icon": "🔢"
    },
    "concept": {
        "label": "Conceptual Understanding",
        "restriction_level": "low",
        "hint": "Explain underlying principles using analogies. List the conceptual steps without giving a direct answer.",
        "icon": "💡"
    },
    "coding": {
        "label": "Programming / Logic",
        "restriction_level": "medium",
        "hint": "Provide pseudocode logic, point out the key algorithm or data structure, and highlight the first debugging step. Do NOT write complete working code.",
        "icon": "💻"
    }
}

KEYWORD_MAP = {
    "essay": ["essay", "write", "paragraph", "thesis", "argument", "introduction", "conclusion", "article", "report", "analyse", "discuss"],
    "math": ["calculate", "solve", "equation", "integral", "derivative", "proof", "formula", "matrix", "algebra", "geometry", "probability", "statistics", "compute", "find the value", "evaluate"],
    "coding": ["code", "program", "function", "debug", "algorithm", "python", "java", "javascript", "class", "loop", "array", "sql", "api", "implement", "script"],
    "concept": ["explain", "what is", "why does", "how does", "define", "describe", "concept", "theory", "difference between", "compare"]
}

def classify_intent(query: str) -> str:
    q = query.lower()
    scores = {k: 0 for k in KEYWORD_MAP}
    for intent, keywords in KEYWORD_MAP.items():
        for kw in keywords:
            if kw in q:
                scores[intent] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "concept"

# ─── Restrictive Prompt Builder ───────────────────────────────────────────────
def build_restrictive_prompt(query: str, intent: str) -> list:
    profile = INTENT_PROFILES[intent]

    # ── Domain-specific deep instructions ──────────────────────────────────────
    domain_instructions = {

        "math": """
MATH TUTORING RULES — read carefully:
You ARE allowed to:
  • State the relevant theorem, formula, or equation IN FULL (e.g. quadratic formula, integration by parts rule, chain rule). The student needs to see the tool.
  • Walk through what EACH SYMBOL / TERM in that formula means, one by one.
  • Show a WORKED EXAMPLE that is DIFFERENT from the student's specific problem — different numbers, different context — so they understand the method without copying.
  • Explain the conceptual WHY behind the method (e.g. why do we complete the square? what does the discriminant tell us?).
  • Point out common mistakes students make and what to watch for.

You are NOT allowed to:
  • Solve the student's exact problem end-to-end.
  • Produce the final numerical or algebraic answer to their specific question.
  • Skip the explanation and just state results.

FORMAT YOUR RESPONSE AS:
📐 The Formula / Method — state it fully and label every part
🔍 What Each Part Means — break down symbols and terms
🧮 Worked Example (different problem) — show the method step-by-step on a DIFFERENT example
⚠️ Common Mistakes — what trips students up here
🤔 Now Your Turn — tell them exactly what first step to take on their problem
📚 Resources — 2-3 specific textbook chapters, Khan Academy topics, or search terms
""",

        "essay": """
ESSAY TUTORING RULES — read carefully:
You ARE allowed to:
  • Provide a detailed OUTLINE STRUCTURE with section headings and sub-points.
  • Suggest 4-6 specific, real ACADEMIC REFERENCES, books, authors, or papers relevant to the topic (give real titles and authors where you know them).
  • Explain what argument or evidence SHOULD go in each section — not write it, but describe what it should contain and why.
  • Give 3-4 specific SEARCH TERMS for Google Scholar, JSTOR, or library databases.
  • Point out what makes a strong thesis vs a weak one for this topic specifically.
  • Give an example of a STRONG THESIS STATEMENT structure (not their thesis — a template or example from a related topic).

You are NOT allowed to:
  • Write any complete paragraphs for the student.
  • Draft their introduction, conclusion, or body sections.
  • Provide a thesis statement they can directly use.

FORMAT YOUR RESPONSE AS:
📝 Suggested Essay Structure — full outline with section purposes
💡 What to Argue — the key angles and tensions the essay should explore
📚 References & Resources — real books, papers, authors, databases, search terms
🎯 Strong vs Weak Thesis — what makes a thesis work for THIS topic
🤔 Your First Move — what to do right now to start
""",

        "coding": """
CODING TUTORING RULES — read carefully:
You ARE allowed to:
  • List ALL the functions, classes, or modules the student will need to build — with a clear description of what each one should do.
  • Recommend specific LIBRARIES and explain why each one is appropriate (e.g. "use tkinter for the GUI because...", "use math module for...").
  • Provide FULL PSEUDOCODE — written in plain English logic or structured pseudocode notation — showing the complete program flow from start to finish. Be thorough, not vague.
  • Write out the ALGORITHM step-by-step: inputs, processing steps, conditions, loops, outputs — in enough detail that the student can directly translate it to code themselves.
  • Show a SMALL ISOLATED code snippet (5-10 lines max) demonstrating ONE specific concept they will need, not the full solution.
  • Describe the ARCHITECTURE: how files/classes/functions connect.
  • Explain relevant ALGORITHMS or data structures they should use and why.
  • List the exact steps to set up their development environment.

You are NOT allowed to:
  • Provide complete, runnable code for the full task.
  • Write more than a small illustrative snippet at a time.
  • Do the architectural thinking FOR them without explaining why.

FORMAT YOUR RESPONSE AS:
🏗️ Project Architecture — components, files, and how they connect
📦 Libraries to Use — each library with the reason why
🔧 Functions / Classes to Build — list every one with its purpose described
🧮 Algorithm — numbered step-by-step logic: inputs → processing → conditions → loops → outputs. Write this in enough detail that the student can translate it directly into code.
📋 Pseudocode — structured pseudocode for the full program flow (use indentation to show nesting, use IF/ELSE/FOR/WHILE/RETURN notation)
💻 Key Snippet — one small (max 10 line) illustrative code example for one core concept
🤔 Start Here — the very first thing they should code and why
📚 Resources — docs links, tutorials, search terms
""",

        "concept": """
CONCEPTUAL TUTORING RULES — read carefully:
You ARE allowed to:
  • Explain the concept THOROUGHLY — mechanisms, history, context, real-world applications.
  • Use analogies, comparisons, and examples to make it concrete.
  • Break it down into a clear mental model the student can hold.
  • Explain what the concept connects to and why it matters in the broader field.
  • Point out what most students misunderstand about it.

You are NOT allowed to:
  • Directly answer a specific exam or assignment question the student is trying to answer.
  • Do the application or analysis work for the student.

FORMAT YOUR RESPONSE AS:
🧠 The Concept Explained — full, clear, rich explanation with analogies
🔗 How It Connects — related ideas, broader context, real-world use
⚠️ Common Misconceptions — what people get wrong and why
🤔 Test Yourself — 2 questions the student should be able to answer if they understood
📚 Go Deeper — books, articles, search terms, YouTube channels
"""
    }

    system_prompt = f"""You are GuidedMind — a Scaffolded Intelligent Tutoring System built on Restrictive Productivity Theory.

CORE PHILOSOPHY:
You are a brilliant, generous tutor. You do NOT withhold knowledge — you withhold finished work.
The difference: explaining HOW integration by parts works (with a full example) = GOOD.
Solving the student's specific integral for them = NOT allowed.
Giving a list of 6 real references for an essay = GOOD. Writing the essay = NOT allowed.
Listing every function a calculator app needs with pseudocode = GOOD. Writing the app = NOT allowed.

Your goal: give the student EVERYTHING they need to do the work themselves.
Be RICH, DETAILED, and GENUINELY HELPFUL — just don't cross the line into doing their specific work.

DETECTED DOMAIN: {profile['label']}

{domain_instructions.get(intent, domain_instructions['concept'])}

TONE: Warm, enthusiastic, like a tutor who genuinely loves this subject and believes in the student.
Be specific. Be generous. Be concrete. Never be vague just to seem restrictive.
A vague unhelpful response is a FAILURE. A rich, detailed response that stops short of doing their work = SUCCESS.
"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query}
    ]

# ─── LLM API Call ─────────────────────────────────────────────────────────────
def call_llm(messages: list) -> dict:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://studious-ai.app",
        "X-OpenRouter-Title": "StudiousAI Tutoring System"
    }

    payload = {
        "model": "stepfun/step-3.5-flash:free",
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 700,
        "top_p": 0.8,
        "reasoning": {"enabled": True}
    }

    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            data=json.dumps(payload),
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        msg = data["choices"][0]["message"]
        return {
            "content": msg.get("content", ""),
            "reasoning": msg.get("reasoning_details", []),
            "usage": data.get("usage", {})
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "content": ""}

# ─── Response Filter / Constraint Engine ──────────────────────────────────────
def apply_constraint_engine(response_text: str, intent: str) -> dict:
    flags = []

    # Detect if a "final answer" phrase slipped through
    answer_patterns = [
        r"\bthe answer is\b", r"\bfinal answer\b", r"\btherefore,?\s+\w+\s*=",
        r"\bhere is the (complete|full)\b", r"```[\s\S]+```"
    ]
    for pat in answer_patterns:
        if re.search(pat, response_text, re.IGNORECASE):
            flags.append("⚠️ System intercepted an overly complete response — trimmed for academic integrity.")
            # Remove code blocks if coding wasn't the intent
            if intent != "coding":
                response_text = re.sub(r"```[\s\S]+?```", "[Code block removed — try writing this yourself!]", response_text)
            break

    # Token length guard — if response is very long, warn
    word_count = len(response_text.split())
    if word_count > 500:
        flags.append("📏 Response was trimmed to maintain guidance-only policy.")
        words = response_text.split()[:480]
        response_text = " ".join(words) + "\n\n*[Response limited to preserve your learning journey.]*"

    return {"text": response_text, "flags": flags}

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json()
    if not data or not data.get("query", "").strip():
        return jsonify({"error": "Empty query"}), 400

    query = data["query"].strip()


    # 1. Classify intent — use forced intent from UI if provided
    forced = data.get("intent", "").strip()
    intent = forced if forced in INTENT_PROFILES else classify_intent(query)
    profile = INTENT_PROFILES[intent]

    # 2. Build restrictive prompt
    messages = build_restrictive_prompt(query, intent)

    # 3. Call LLM
    llm_result = call_llm(messages)

    if "error" in llm_result and not llm_result.get("content"):
        return jsonify({"error": f"LLM API error: {llm_result['error']}"}), 500

    # 4. Apply constraint engine
    constrained = apply_constraint_engine(llm_result["content"], intent)

    return jsonify({
        "response": constrained["text"],
        "flags": constrained["flags"],
        "intent": {
            "key": intent,
            "label": profile["label"],
            "icon": profile["icon"],
            "restriction_level": profile["restriction_level"]
        },
        "usage": llm_result.get("usage", {})
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
