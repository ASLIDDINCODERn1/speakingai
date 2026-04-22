"use strict";

const state = {
  level: "B1",
  topicId: "",
  questionCount: 10,
  topics: [],
  banks: {},
  questions: [],
  answers: [],
  currentIndex: 0,
  currentTranscript: "",
  recognition: null,
  isRecording: false,
  voices: [],
  voiceUri: "",
  accentFilter: "all",
  voiceRate: 1,
  theme: "dark",
  splashClosed: false,
};

const STORAGE = {
  level: "speaking_ai_level",
  topicId: "speaking_ai_topic_id",
  questionCount: "speaking_ai_question_count",
  theme: "speaking_ai_theme",
  voiceUri: "speaking_ai_voice_uri",
  accentFilter: "speaking_ai_accent_filter",
  voiceRate: "speaking_ai_voice_rate",
};

const PROGRESS_RING_CIRCUMFERENCE = 163.36;
const SCORE_RING_CIRCUMFERENCE = 339.29;
const LEVEL_LABELS = {
  A2: "A2 - Elementary",
  B1: "B1 - Intermediate",
  B2: "B2 - Upper Intermediate",
  C1: "C1 - Advanced",
  C2: "C2 - Proficient",
};

const COMMON_MISTAKES = [
  {
    pattern: /\bi am agree\b/gi,
    correct: "I agree",
    explain: "Use 'agree' as a verb, not 'am agree'.",
    category: "Verb form",
  },
  {
    pattern: /\bmore better\b/gi,
    correct: "better",
    explain: "Do not use double comparatives.",
    category: "Comparatives",
  },
  {
    pattern: /\bdiscuss about\b/gi,
    correct: "discuss",
    explain: "Use 'discuss' without 'about'.",
    category: "Word choice",
  },
  {
    pattern: /\badvices\b/gi,
    correct: "advice",
    explain: "'Advice' is uncountable in English.",
    category: "Countable or uncountable",
  },
  {
    pattern: /\bpeople is\b/gi,
    correct: "people are",
    explain: "Use a plural verb with 'people'.",
    category: "Subject verb agreement",
  },
  {
    pattern: /\bhe go\b/gi,
    correct: "he goes",
    explain: "Use third person singular with -s in present simple.",
    category: "Subject verb agreement",
  },
  {
    pattern: /\bshe go\b/gi,
    correct: "she goes",
    explain: "Use third person singular with -s in present simple.",
    category: "Subject verb agreement",
  },
  {
    pattern: /\bi goed\b/gi,
    correct: "I went",
    explain: "The past form of 'go' is 'went'.",
    category: "Past tense",
  },
];

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

window.addEventListener("DOMContentLoaded", () => {
  void bootstrap();
});

async function bootstrap() {
  bindUiEvents();
  restoreSavedPreferences();
  initTheme();
  initSplash();
  initSpeechRecognition();
  initVoiceSettings();

  $("start-btn").disabled = true;
  try {
    await loadQuestionData();
    renderTopicGrid();
    applySavedSetupState();
    $("start-btn").disabled = false;
  } catch (error) {
    setSettingsError(`Could not load questions.json: ${error.message}`);
  }

  showScreen("setup");
  setStep("setup");
}

function bindUiEvents() {
  $("theme-toggle").addEventListener("click", toggleTheme);
  $("settings-btn").addEventListener("click", openSettingsDrawer);
  $("drawer-close").addEventListener("click", closeSettingsDrawer);
  $("drawer-overlay").addEventListener("click", closeSettingsDrawer);

  $$("button.theme-option").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.theme;
      if (theme) {
        setTheme(theme, true);
      }
    });
  });

  $("accent-filter").addEventListener("click", (event) => {
    const button = event.target.closest(".pill");
    if (!button || !button.dataset.accent) {
      return;
    }
    setAccentFilter(button.dataset.accent);
  });

  $("voice-select").addEventListener("change", (event) => {
    const value = event.target.value || "";
    state.voiceUri = value;
    localStorage.setItem(STORAGE.voiceUri, value);
  });

  $("rate-slider").addEventListener("input", (event) => {
    const nextRate = clampNumber(Number(event.target.value), 0.6, 1.4);
    state.voiceRate = nextRate;
    localStorage.setItem(STORAGE.voiceRate, String(nextRate));
    updateRateLabel();
  });

  $("preview-voice").addEventListener("click", () => {
    speak("Hello, I am your Speaking AI coach. I will ask clear questions and guide your improvement.");
    showToast("Voice preview started.");
  });

  $("level-group").addEventListener("click", (event) => {
    const button = event.target.closest(".pill");
    if (!button || !button.dataset.value) {
      return;
    }
    state.level = button.dataset.value;
    localStorage.setItem(STORAGE.level, state.level);
    applyPillActiveState($("level-group"), state.level, "value");
  });

  $("count-group").addEventListener("click", (event) => {
    const button = event.target.closest(".pill");
    if (!button || !button.dataset.value) {
      return;
    }
    const count = clampNumber(Number(button.dataset.value), 5, 20);
    state.questionCount = count;
    localStorage.setItem(STORAGE.questionCount, String(count));
    applyPillActiveState($("count-group"), String(count), "value");
  });

  $("start-btn").addEventListener("click", () => {
    void startPracticeSession();
  });

  $("mic-btn").addEventListener("click", toggleRecording);
  $("redo-btn").addEventListener("click", resetCurrentAnswer);
  $("next-btn").addEventListener("click", () => {
    void submitCurrentAnswer();
  });
  $("replay-btn").addEventListener("click", () => {
    const question = state.questions[state.currentIndex] || "";
    if (question) {
      speak(question);
    }
  });

  $("restart-btn").addEventListener("click", () => {
    void startPracticeSession();
  });

  $("home-btn").addEventListener("click", () => {
    hardStopRecording();
    showScreen("setup");
    setStep("setup");
    clearSettingsError();
  });
}

function restoreSavedPreferences() {
  const savedLevel = localStorage.getItem(STORAGE.level);
  if (savedLevel && LEVEL_LABELS[savedLevel]) {
    state.level = savedLevel;
  }

  const savedCount = Number(localStorage.getItem(STORAGE.questionCount));
  if (Number.isFinite(savedCount) && savedCount >= 5 && savedCount <= 20) {
    state.questionCount = savedCount;
  }

  const savedTopicId = localStorage.getItem(STORAGE.topicId);
  if (savedTopicId) {
    state.topicId = savedTopicId;
  }

  const savedTheme = localStorage.getItem(STORAGE.theme);
  if (savedTheme === "light" || savedTheme === "dark") {
    state.theme = savedTheme;
  }

  const savedVoiceUri = localStorage.getItem(STORAGE.voiceUri);
  if (savedVoiceUri) {
    state.voiceUri = savedVoiceUri;
  }

  const savedAccent = localStorage.getItem(STORAGE.accentFilter);
  if (savedAccent) {
    state.accentFilter = savedAccent;
  }

  const savedRate = Number(localStorage.getItem(STORAGE.voiceRate));
  if (Number.isFinite(savedRate)) {
    state.voiceRate = clampNumber(savedRate, 0.6, 1.4);
  }
}

function applySavedSetupState() {
  applyPillActiveState($("level-group"), state.level, "value");
  applyPillActiveState($("count-group"), String(state.questionCount), "value");

  if (!state.topicId || !state.topics.some((topic) => topic.id === state.topicId)) {
    state.topicId = state.topics[0]?.id || "";
    if (state.topicId) {
      localStorage.setItem(STORAGE.topicId, state.topicId);
    }
  }

  updateTopicCardSelection();
}

function applyPillActiveState(group, value, key) {
  if (!group) {
    return;
  }
  const expected = String(value);
  Array.from(group.querySelectorAll(".pill")).forEach((pill) => {
    pill.classList.toggle("active", String(pill.dataset[key]) === expected);
  });
}

function initTheme() {
  if (!localStorage.getItem(STORAGE.theme)) {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    state.theme = prefersLight ? "light" : "dark";
  }
  setTheme(state.theme, false);
}

function setTheme(theme, persist) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  if (persist) {
    localStorage.setItem(STORAGE.theme, state.theme);
  }

  $$("button.theme-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === state.theme);
  });
}

function toggleTheme() {
  const next = state.theme === "dark" ? "light" : "dark";
  setTheme(next, true);
}

function openSettingsDrawer() {
  const drawer = $("settings-drawer");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeSettingsDrawer() {
  const drawer = $("settings-drawer");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function initSplash() {
  const splash = $("splash");
  const app = $("app");

  const closeSplash = () => {
    if (state.splashClosed) {
      return;
    }
    state.splashClosed = true;
    splash.classList.add("hide");
    app.classList.add("show");
    app.setAttribute("aria-hidden", "false");
  };

  setTimeout(closeSplash, 2600);
  splash.addEventListener("click", closeSplash);
}

async function loadQuestionData() {
  const response = await fetch("questions.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  state.banks = normalizeBanks(data.banks || {});

  if (Array.isArray(data.topics) && data.topics.length) {
    state.topics = data.topics.map((topic, index) => ({
      id: normalizeMojibake(topic.id || makeTopicId(topic.name || `topic-${index + 1}`)),
      name: normalizeMojibake(topic.name || `Topic ${index + 1}`),
      emoji: normalizeMojibake(topic.emoji || ""),
      group: normalizeMojibake(topic.group || "Speaking"),
    }));
  } else {
    state.topics = Object.keys(state.banks).map((name) => ({
      id: makeTopicId(name),
      name,
      emoji: "",
      group: "Speaking",
    }));
  }

  if (!state.topics.length) {
    throw new Error("No topics found in questions.json");
  }
}

function renderTopicGrid() {
  const grid = $("topic-grid");
  grid.innerHTML = "";

  state.topics.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-card";
    button.dataset.topicId = topic.id;
    button.innerHTML = `
      <span class="emoji">${escapeHtml(topic.emoji || "")}</span>
      <span class="name">${escapeHtml(topic.name)}</span>
      <span class="group">${escapeHtml(topic.group || "Speaking")}</span>
    `;

    button.addEventListener("click", () => {
      state.topicId = topic.id;
      localStorage.setItem(STORAGE.topicId, state.topicId);
      updateTopicCardSelection();
      clearSettingsError();
    });

    grid.appendChild(button);
  });

  updateTopicCardSelection();
}

function updateTopicCardSelection() {
  $$("button.topic-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.topicId === state.topicId);
  });
}

function initVoiceSettings() {
  $("rate-slider").value = String(state.voiceRate);
  updateRateLabel();
  setAccentFilter(state.accentFilter, false);

  if (!("speechSynthesis" in window)) {
    $("voice-select").innerHTML = "<option>Voice synthesis is not supported in this browser</option>";
    $("voice-select").disabled = true;
    $("preview-voice").disabled = true;
    return;
  }

  const loadVoices = () => {
    const voices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith("en"))
      .sort((a, b) => a.name.localeCompare(b.name));

    state.voices = voices;
    populateVoiceSelect();
  };

  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function setAccentFilter(accent, persist = true) {
  state.accentFilter = accent || "all";
  if (persist) {
    localStorage.setItem(STORAGE.accentFilter, state.accentFilter);
  }

  applyPillActiveState($("accent-filter"), state.accentFilter, "accent");
  populateVoiceSelect();
}

function populateVoiceSelect() {
  const select = $("voice-select");
  select.innerHTML = "";

  const filtered = state.voices.filter((voice) => matchAccentFilter(voice.lang || "", state.accentFilter));
  const finalList = filtered.length ? filtered : state.voices;

  if (!finalList.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No English voices available on this device";
    select.appendChild(option);
    select.disabled = true;
    $("preview-voice").disabled = true;
    state.voiceUri = "";
    return;
  }

  select.disabled = false;
  $("preview-voice").disabled = false;

  finalList.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    select.appendChild(option);
  });

  const exists = finalList.some((voice) => voice.voiceURI === state.voiceUri);
  if (!exists) {
    state.voiceUri = finalList[0].voiceURI;
    localStorage.setItem(STORAGE.voiceUri, state.voiceUri);
  }

  select.value = state.voiceUri;
}

function matchAccentFilter(lang, filter) {
  if (filter === "all") {
    return true;
  }

  const normalized = String(lang).toLowerCase();
  if (filter === "other") {
    return normalized.startsWith("en") && !normalized.startsWith("en-us") && !normalized.startsWith("en-gb") && !normalized.startsWith("en-au");
  }

  return normalized.startsWith(String(filter).toLowerCase());
}

function updateRateLabel() {
  $("rate-value").textContent = `${state.voiceRate.toFixed(2)}x`;
}

function speak(text) {
  if (!text || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const selected = state.voices.find((voice) => voice.voiceURI === state.voiceUri);

  if (selected) {
    utterance.voice = selected;
    utterance.lang = selected.lang;
  } else {
    utterance.lang = "en-US";
  }

  utterance.rate = state.voiceRate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("mic-btn").disabled = true;
    $("mic-status").textContent = "Speech recognition is not supported in this browser. Use Chrome or Edge.";
    return;
  }

  const recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let finalText = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += `${transcript} `;
      } else {
        interim += transcript;
      }
    }

    state.currentTranscript = `${finalText}${interim}`.trim();
    const transcriptEl = $("transcript");
    transcriptEl.textContent = state.currentTranscript || "Listening...";
    transcriptEl.classList.toggle("empty", !state.currentTranscript);
  };

  recognition.onerror = (event) => {
    const key = event.error || "unknown";
    const errorMessages = {
      "not-allowed": "Microphone permission was blocked. Allow microphone access and try again.",
      "no-speech": "No speech detected. Please try again.",
      "audio-capture": "Microphone is not available.",
    };

    showToast(errorMessages[key] || "Speech capture error. Please try again.");
    hardStopRecording();
  };

  recognition.onend = () => {
    if (state.isRecording) {
      try {
        recognition.start();
      } catch (_) {
        // Avoid noisy errors when browser throttles quick restarts.
      }
    }
  };

  recognition._reset = () => {
    finalText = "";
  };

  state.recognition = recognition;
}

function toggleRecording() {
  if (state.isRecording) {
    hardStopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!state.recognition || state.isRecording) {
    return;
  }

  state.currentTranscript = "";
  state.recognition._reset();

  const transcriptEl = $("transcript");
  transcriptEl.textContent = "Listening...";
  transcriptEl.classList.remove("empty");

  $("next-btn").disabled = true;
  $("redo-btn").disabled = true;
  $("mic-btn").classList.add("recording");
  $("mic-status").classList.add("recording");
  $("mic-status").textContent = "Recording... click the mic to stop.";

  try {
    state.recognition.start();
    state.isRecording = true;
  } catch (_) {
    showToast("Could not start microphone recording.");
    hardStopRecording();
  }
}

function hardStopRecording() {
  if (!state.recognition) {
    return;
  }

  state.isRecording = false;
  try {
    state.recognition.stop();
  } catch (_) {
    // Safe no-op.
  }

  $("mic-btn").classList.remove("recording");
  $("mic-status").classList.remove("recording");

  if (state.currentTranscript.trim()) {
    $("next-btn").disabled = false;
    $("redo-btn").disabled = false;
    $("mic-status").textContent = "Answer captured. Submit or redo.";
  } else {
    $("next-btn").disabled = true;
    $("redo-btn").disabled = true;
    $("mic-status").textContent = "Press the mic to answer.";
    $("transcript").textContent = "Your spoken answer will appear here...";
    $("transcript").classList.add("empty");
  }
}

function resetCurrentAnswer() {
  state.currentTranscript = "";
  $("transcript").textContent = "Your spoken answer will appear here...";
  $("transcript").classList.add("empty");
  $("next-btn").disabled = true;
  $("redo-btn").disabled = true;
  $("mic-status").textContent = "Press the mic to answer.";
  $("mic-status").classList.remove("recording");
}

async function startPracticeSession() {
  clearSettingsError();

  if (!state.topicId) {
    setSettingsError("Select a topic before starting.");
    return;
  }

  const bank = getSelectedQuestionBank();
  if (!bank.length) {
    setSettingsError("No questions available for this topic.");
    return;
  }

  hardStopRecording();
  window.speechSynthesis?.cancel();

  showScreen("loading");
  setStep("practice");
  $("loading-text").textContent = "Preparing your speaking session...";

  await sleep(500);

  state.questions = pickQuestions(bank, state.questionCount);
  state.answers = new Array(state.questions.length).fill("");
  state.currentIndex = 0;
  state.currentTranscript = "";

  renderQuestion();
  showScreen("practice");
  speak(state.questions[0]);
}

function getSelectedTopic() {
  return state.topics.find((topic) => topic.id === state.topicId) || null;
}

function getSelectedQuestionBank() {
  const topic = getSelectedTopic();
  if (!topic) {
    return [];
  }

  const byName = state.banks[topic.name];
  if (Array.isArray(byName) && byName.length) {
    return byName;
  }

  const byId = state.banks[topic.id];
  if (Array.isArray(byId) && byId.length) {
    return byId;
  }

  return [];
}

function pickQuestions(source, count) {
  const cleanSource = source
    .map((question) => String(question || "").trim())
    .filter(Boolean);

  if (!cleanSource.length) {
    return [];
  }

  const wanted = clampNumber(Number(count), 5, 20);
  const picked = [];
  let pool = shuffleArray(cleanSource);

  while (picked.length < wanted) {
    if (!pool.length) {
      pool = shuffleArray(cleanSource);
    }
    picked.push(pool.pop());
  }

  return picked;
}

function renderQuestion() {
  const total = state.questions.length;
  const index = state.currentIndex;

  $("question-text").textContent = state.questions[index] || "";
  $("topic-label").textContent = getSelectedTopic()?.name || "Topic";
  $("level-label").textContent = LEVEL_LABELS[state.level] || state.level;

  const progressRatio = total > 0 ? index / total : 0;
  const offset = PROGRESS_RING_CIRCUMFERENCE * (1 - progressRatio);
  $("ring-fill-circle").style.strokeDashoffset = String(offset);
  $("ring-text").textContent = `${index + 1}/${total}`;

  resetCurrentAnswer();
  $("next-btn").innerHTML = index === total - 1
    ? "Finish and Get Feedback"
    : `Submit
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>`;
}

async function submitCurrentAnswer() {
  if (state.isRecording) {
    hardStopRecording();
  }

  const cleaned = state.currentTranscript.trim();
  if (!cleaned) {
    showToast("Record your answer before submitting.");
    return;
  }

  state.answers[state.currentIndex] = cleaned;

  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
    speak(state.questions[state.currentIndex]);
    return;
  }

  await finalizeAndShowFeedback();
}

async function finalizeAndShowFeedback() {
  showScreen("loading");
  setStep("feedback");
  $("loading-text").textContent = "Running error checks and preparing your professional report...";

  try {
    const report = await buildFeedbackReport();
    renderFeedbackReport(report);
    showScreen("feedback");
  } catch (error) {
    $("loading-text").textContent = `Could not generate feedback: ${error.message}`;
  }
}

async function buildFeedbackReport() {
  const analyses = await Promise.all(
    state.answers.map((answer, index) => analyzeAnswer(answer, index))
  );

  const allErrors = analyses.flatMap((item) => item.errors);
  const dedupedErrors = dedupeErrors(allErrors).slice(0, 20);

  const answeredCount = analyses.filter((item) => item.wordCount > 0).length;
  const totalWords = analyses.reduce((sum, item) => sum + item.wordCount, 0);
  const avgWords = answeredCount ? totalWords / answeredCount : 0;
  const fillerCount = analyses.reduce((sum, item) => sum + item.fillerCount, 0);

  const allTokens = analyses.flatMap((item) => item.tokens);
  const uniqueTokens = new Set(allTokens);
  const typeTokenRatio = allTokens.length ? uniqueTokens.size / allTokens.length : 0;

  const longWordCount = allTokens.filter((token) => token.length >= 7).length;
  const longWordRatio = allTokens.length ? longWordCount / allTokens.length : 0;

  const severeErrors = dedupedErrors.filter((error) => error.severity === "high").length;
  const completion = roundNumber((answeredCount / Math.max(state.questions.length, 1)) * 100);

  const grammarPenalty = Math.min(62, dedupedErrors.length * 2.8 + severeErrors * 3.5);
  const grammarAccuracy = clampNumber(100 - grammarPenalty, 20, 100);
  const fluency = clampNumber(40 + avgWords * 2.2 - fillerCount * 2.5, 20, 100);
  const vocabulary = clampNumber(30 + typeTokenRatio * 85 + longWordRatio * 45, 20, 100);

  const overall = roundNumber(
    grammarAccuracy * 0.42 +
    fluency * 0.23 +
    vocabulary * 0.2 +
    completion * 0.15
  );

  const metrics = {
    grammarAccuracy,
    fluency,
    vocabulary,
    completion,
    averageWords: roundNumber(avgWords),
    fillerCount,
  };

  const strengths = buildStrengths(metrics, dedupedErrors.length);
  const tips = buildTips(metrics, analyses, dedupedErrors);
  const coachFeedback = buildCoachFeedback(metrics, dedupedErrors.length, analyses);
  const followUpQuestions = buildFollowUpQuestions(dedupedErrors);

  return {
    score: overall,
    grade: scoreToGrade(overall),
    summary: buildSummary(metrics, dedupedErrors.length),
    strengths,
    tips,
    errors: dedupedErrors,
    metrics,
    coachFeedback,
    followUpQuestions,
    usedFallback: analyses.some((item) => item.usedFallback),
  };
}

async function analyzeAnswer(answer, questionIndex) {
  const text = String(answer || "").trim();
  const tokens = tokenizeWords(text);
  const fillerCount = countFillers(text);

  if (!text) {
    return {
      questionIndex,
      wordCount: 0,
      tokens: [],
      fillerCount: 0,
      errors: [],
      usedFallback: false,
    };
  }

  try {
    const errors = await checkGrammarWithLanguageTool(text, questionIndex);
    return {
      questionIndex,
      wordCount: tokens.length,
      tokens,
      fillerCount,
      errors,
      usedFallback: false,
    };
  } catch (_) {
    return {
      questionIndex,
      wordCount: tokens.length,
      tokens,
      fillerCount,
      errors: heuristicGrammarCheck(text, questionIndex),
      usedFallback: true,
    };
  }
}

async function checkGrammarWithLanguageTool(text, questionIndex) {
  const body = new URLSearchParams();
  body.set("language", "en-US");
  body.set("text", text);

  const response = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`LanguageTool HTTP ${response.status}`);
  }

  const data = await response.json();
  const matches = Array.isArray(data.matches) ? data.matches : [];

  return matches
    .map((match) => normalizeLanguageToolMatch(text, match, questionIndex))
    .filter(Boolean);
}

function normalizeLanguageToolMatch(text, match, questionIndex) {
  const offset = Number(match.offset) || 0;
  const length = Number(match.length) || 0;
  const wrong = text.slice(offset, offset + length).trim();
  const replacement = Array.isArray(match.replacements) ? match.replacements[0]?.value || "" : "";

  const categoryId = String(match.rule?.category?.id || "").toUpperCase();
  const categoryName = String(match.rule?.category?.name || "Grammar");

  if (!wrong || wrong.length < 2) {
    return null;
  }

  if (categoryId === "PUNCTUATION" || categoryId === "CASING" || categoryId === "TYPOGRAPHY") {
    return null;
  }

  const issueType = String(match.rule?.issueType || "").toLowerCase();
  const severity = issueType.includes("grammar") || categoryId.includes("GRAMMAR") ? "high" : "medium";

  return {
    question: questionIndex,
    wrong,
    correct: replacement || wrong,
    explain: String(match.message || "Grammar issue detected."),
    category: categoryName,
    severity,
  };
}

function heuristicGrammarCheck(text, questionIndex) {
  const errors = [];

  COMMON_MISTAKES.forEach((rule) => {
    const matches = text.matchAll(rule.pattern);
    for (const match of matches) {
      const wrong = String(match[0] || "").trim();
      if (!wrong) {
        continue;
      }

      errors.push({
        question: questionIndex,
        wrong,
        correct: rule.correct,
        explain: rule.explain,
        category: rule.category,
        severity: "medium",
      });
    }
  });

  const repeatedWordMatch = text.match(/\b([a-zA-Z']+)\s+\1\b/);
  if (repeatedWordMatch) {
    errors.push({
      question: questionIndex,
      wrong: repeatedWordMatch[0],
      correct: repeatedWordMatch[1],
      explain: "Avoid repeating the same word twice in a row.",
      category: "Fluency",
      severity: "low",
    });
  }

  return errors;
}

function dedupeErrors(errors) {
  const seen = new Set();
  const deduped = [];

  errors.forEach((error) => {
    const key = [
      error.question,
      String(error.wrong || "").toLowerCase(),
      String(error.correct || "").toLowerCase(),
      String(error.category || "").toLowerCase(),
    ].join("::");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(error);
  });

  return deduped;
}

function buildStrengths(metrics, errorCount) {
  const strengths = [];

  if (metrics.completion >= 95) {
    strengths.push("You completed almost every question and stayed consistent through the full session.");
  }
  if (metrics.fluency >= 72) {
    strengths.push("Your answers were detailed and easy to follow, which shows good speaking fluency.");
  }
  if (metrics.vocabulary >= 70) {
    strengths.push("You used a strong range of vocabulary with varied word choices.");
  }
  if (metrics.grammarAccuracy >= 78 || errorCount <= 4) {
    strengths.push("Your sentence structures were mostly accurate and clear.");
  }

  if (!strengths.length) {
    strengths.push("You kept speaking and gave complete ideas, which is the best way to improve fast.");
    strengths.push("Your answers show good intent and communication even when grammar needs polishing.");
  }

  return strengths.slice(0, 4);
}

function buildTips(metrics, analyses, errors) {
  const tips = [];

  const byCategory = new Map();
  errors.forEach((error) => {
    const key = String(error.category || "Grammar");
    byCategory.set(key, (byCategory.get(key) || 0) + 1);
  });

  const topCategory = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCategory) {
    tips.push(`Focus on ${topCategory[0].toLowerCase()} patterns first. That category had the highest number of mistakes.`);
  }

  if (metrics.grammarAccuracy < 70) {
    tips.push("Slow down your sentence building and check verb tense and subject agreement before finishing each answer.");
  }
  if (metrics.fluency < 65) {
    tips.push("Practice 45-second speaking bursts: answer one question without stopping, then repeat once with cleaner structure.");
  }
  if (metrics.vocabulary < 65) {
    tips.push("Add 3 topic words to each answer and reuse them in different sentence patterns.");
  }
  if (metrics.completion < 100) {
    tips.push("Answer every question fully, even with short responses, to build exam-style consistency.");
  }

  const emptyAnswers = analyses.filter((item) => item.wordCount === 0).length;
  if (emptyAnswers > 0) {
    tips.push(`You skipped ${emptyAnswers} question(s). Keep your microphone active and submit a full answer for each prompt.`);
  }

  if (!tips.length) {
    tips.push("Your core performance is strong. Next step: increase answer complexity with linking words and specific examples.");
  }

  return tips.slice(0, 5);
}

function buildCoachFeedback(metrics, errorCount, analyses) {
  const answered = analyses.filter((item) => item.wordCount > 0).length;
  const total = analyses.length;

  if (answered === 0) {
    return "No recorded speech was captured, so a full coaching analysis is not possible yet. Start another session and answer each question out loud for a complete report.";
  }

  const qualityLine = metrics.grammarAccuracy >= 80
    ? "Your grammar control is solid, and most messages are clear on the first read."
    : "Your ideas are understandable, but grammar accuracy is reducing clarity in several answers.";

  const paceLine = metrics.fluency >= 70
    ? "Your speaking flow is stable and confident."
    : "Your speaking flow improves when you use shorter sentence blocks before adding detail.";

  const targetLine = errorCount > 0
    ? "Review the correction list and repeat those structures in new sentences to lock in accuracy."
    : "Keep the same structure quality and focus on richer vocabulary to raise your score further.";

  return `${qualityLine} ${paceLine} You completed ${answered} of ${total} questions. ${targetLine}`;
}

function buildFollowUpQuestions(errors) {
  const followUps = [];

  const errorsByQuestion = new Map();
  errors.forEach((error) => {
    errorsByQuestion.set(error.question, (errorsByQuestion.get(error.question) || 0) + 1);
  });

  const rankedQuestions = Array.from(errorsByQuestion.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  rankedQuestions.forEach((questionIndex) => {
    if (followUps.length >= 3) {
      return;
    }

    const question = state.questions[questionIndex];
    const correction = errors.find((item) => item.question === questionIndex)?.correct || "correct grammar";
    if (!question) {
      return;
    }

    followUps.push(`Answer this again with perfect grammar: "${question}" Include this corrected form: "${correction}".`);
  });

  const extra = shuffleArray(getSelectedQuestionBank().filter((question) => !state.questions.includes(question)));
  for (const question of extra) {
    if (followUps.length >= 5) {
      break;
    }
    followUps.push(`Practice question: ${question}`);
  }

  while (followUps.length < 5) {
    const fallback = state.questions[followUps.length % state.questions.length] || "Give a one-minute answer about your daily routine using clear grammar.";
    followUps.push(`Exact follow-up: ${fallback}`);
  }

  return followUps;
}

function buildSummary(metrics, errorCount) {
  const errorLine = errorCount === 0
    ? "No major grammar errors were detected."
    : `${errorCount} grammar issue(s) were detected and corrected.`;

  return `${errorLine} Grammar ${roundNumber(metrics.grammarAccuracy)}%, Fluency ${roundNumber(metrics.fluency)}%, Vocabulary ${roundNumber(metrics.vocabulary)}%.`;
}

function scoreToGrade(score) {
  if (score >= 95) return "A+ Excellent";
  if (score >= 90) return "A Strong";
  if (score >= 85) return "B+ Very Good";
  if (score >= 78) return "B Good";
  if (score >= 70) return "C+ Developing";
  if (score >= 62) return "C Needs Polish";
  if (score >= 52) return "D Needs Work";
  return "Rebuild Foundation";
}

function renderFeedbackReport(report) {
  $("feedback-summary").textContent = report.usedFallback
    ? `${report.summary} Live grammar API was unavailable, so backup error rules were used for this report.`
    : report.summary;

  animateScore(report.score);
  $("score-grade").textContent = report.grade;

  const scoreOffset = SCORE_RING_CIRCUMFERENCE * (1 - report.score / 100);
  $("score-ring-fill").style.strokeDashoffset = String(scoreOffset);

  renderMetrics(report.metrics);
  renderFeedbackSections(report);
}

function animateScore(target) {
  const element = $("score-number");
  const start = Number(element.textContent) || 0;
  const diff = target - start;
  const duration = 900;
  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(start + diff * eased));

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

function renderMetrics(metrics) {
  const cards = [
    { label: "Grammar Accuracy", value: roundNumber(metrics.grammarAccuracy), unit: "%" },
    { label: "Fluency", value: roundNumber(metrics.fluency), unit: "%" },
    { label: "Vocabulary Range", value: roundNumber(metrics.vocabulary), unit: "%" },
    { label: "Task Completion", value: roundNumber(metrics.completion), unit: "%" },
  ];

  const container = $("metrics");
  container.innerHTML = "";

  cards.forEach((card) => {
    const metric = document.createElement("div");
    metric.className = "metric";
    metric.innerHTML = `
      <div class="metric-label">
        <span>${escapeHtml(card.label)}</span>
        <span class="metric-value">${card.value}${card.unit}</span>
      </div>
      <div class="metric-bar">
        <div class="metric-bar-fill" style="width: 0%"></div>
      </div>
    `;

    container.appendChild(metric);
    const fill = metric.querySelector(".metric-bar-fill");
    requestAnimationFrame(() => {
      fill.style.width = `${card.value}%`;
    });
  });
}

function renderFeedbackSections(report) {
  const container = $("feedback-content");
  container.innerHTML = "";

  container.appendChild(buildErrorsSection(report.errors));
  container.appendChild(buildSimpleSection("Professional Coach Feedback", [report.coachFeedback], "strengths"));
  container.appendChild(buildSimpleSection("What You Did Well", report.strengths, "strengths"));
  container.appendChild(buildSimpleSection("Professional Improvement Plan", report.tips, "tips"));
  container.appendChild(buildSimpleSection("Exact Follow-up Questions", report.followUpQuestions, "tips"));
  container.appendChild(buildAnswerReviewSection());
}

function buildErrorsSection(errors) {
  const section = document.createElement("section");
  section.className = "feedback-section errors";

  if (!errors.length) {
    section.innerHTML = `
      <h3>Error Checker</h3>
      <p>No major grammar errors were detected in your submitted answers. Keep your current structure quality.</p>
    `;
    return section;
  }

  const title = document.createElement("h3");
  title.innerHTML = `Error Checker <span class="section-count">${errors.length}</span>`;
  section.appendChild(title);

  const list = document.createElement("ul");
  list.className = "error-list";

  errors.forEach((error) => {
    const item = document.createElement("li");
    item.className = "error-card";
    item.innerHTML = `
      <div class="correction-row">
        <span class="wrong">${escapeHtml(error.wrong)}</span>
        <span class="arrow">-&gt;</span>
        <span class="correct">${escapeHtml(error.correct)}</span>
      </div>
      <div class="explain">${escapeHtml(error.explain)} <span class="q-tag">(Q${error.question + 1})</span></div>
    `;

    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function buildSimpleSection(titleText, items, variant) {
  const section = document.createElement("section");
  section.className = `feedback-section ${variant || ""}`.trim();

  const title = document.createElement("h3");
  title.textContent = titleText;
  section.appendChild(title);

  const list = document.createElement("ul");
  list.className = "simple-list";

  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });

  if (!list.children.length) {
    const li = document.createElement("li");
    li.textContent = "No additional notes for this section.";
    list.appendChild(li);
  }

  section.appendChild(list);
  return section;
}

function buildAnswerReviewSection() {
  const section = document.createElement("section");
  section.className = "feedback-section";
  section.innerHTML = "<h3>Your Answers</h3>";

  state.questions.forEach((question, index) => {
    const row = document.createElement("div");
    row.className = "qa-item";
    row.innerHTML = `
      <div class="q"><strong>Q${index + 1}:</strong> ${escapeHtml(question)}</div>
      <div class="a"><strong>You said:</strong> ${escapeHtml(state.answers[index] || "(no answer)")}</div>
    `;
    section.appendChild(row);
  });

  return section;
}

function showScreen(name) {
  ["setup", "loading", "practice", "feedback"].forEach((screen) => {
    $(`${screen}-screen`).classList.toggle("active", screen === name);
  });
}

function setStep(step) {
  const ordered = ["setup", "practice", "feedback"];
  const activeIndex = ordered.indexOf(step);

  $$(".stepper .step").forEach((element, index) => {
    element.classList.toggle("active", index === activeIndex);
    element.classList.toggle("done", index < activeIndex);
  });
}

function setSettingsError(message) {
  $("settings-error").textContent = message;
}

function clearSettingsError() {
  $("settings-error").textContent = "";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function tokenizeWords(text) {
  return String(text || "").toLowerCase().match(/[a-z']+/g) || [];
}

function countFillers(text) {
  const sample = ` ${String(text || "").toLowerCase()} `;
  const fillers = [" um ", " uh ", " you know ", " like ", " actually ", " basically "];

  return fillers.reduce((sum, filler) => {
    let index = 0;
    let count = 0;

    while (index !== -1) {
      index = sample.indexOf(filler, index);
      if (index !== -1) {
        count += 1;
        index += filler.length;
      }
    }

    return sum + count;
  }, 0);
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function makeTopicId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "topic";
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value) {
  return Math.round(Number(value) || 0);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeBanks(rawBanks) {
  const normalized = {};

  Object.entries(rawBanks).forEach(([topicName, questions]) => {
    const safeTopic = normalizeMojibake(topicName);
    normalized[safeTopic] = Array.isArray(questions)
      ? questions.map((question) => normalizeMojibake(question))
      : [];
  });

  return normalized;
}

function normalizeMojibake(value) {
  const text = String(value || "");
  if (!text || !/[ÃÂð]/.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return decoded.includes("\uFFFD") ? text : decoded;
  } catch (_) {
    return text;
  }
}
