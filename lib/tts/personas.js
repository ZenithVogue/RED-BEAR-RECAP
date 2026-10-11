/* ============================================================
   Red Bear — Voice persona registry (single source of truth)

   The ten personas exposed in the UI (BB, NL, PW …) map onto the two
   public Burmese neural voices of the Edge read-aloud service:
     · my-MM-ThihaNeural  → male
     · my-MM-NilarNeural  → female
   Persona identity is expressed through rate + pitch offsets.
   ============================================================ */
"use strict";

const MALE_VOICE = "my-MM-ThihaNeural";
const FEMALE_VOICE = "my-MM-NilarNeural";

const PERSONAS = [
  { code: "BB", name: "Bobo", gender: "male", tone: "Natural", rate: 0.95, pitch: 0, desc: "သဘာဝကျသော အသံ" },
  { code: "NL", name: "Nilar", gender: "female", tone: "Clear", rate: 1.0, pitch: 18, desc: "ရှင်းလင်းသော အသံ" },
  { code: "PW", name: "Pyae Wai", gender: "male", tone: "Energetic", rate: 1.15, pitch: 8, desc: "စိတ်လှုပ်ရှားဖွယ် အသံ" },
  { code: "KM", name: "Kaung Myat", gender: "male", tone: "Deep", rate: 0.85, pitch: -12, desc: "လေးနက်သော အသံ" },
  { code: "ZK", name: "Zaw Ko", gender: "male", tone: "Narrator", rate: 0.9, pitch: -5, desc: "ဇာတ်ကြောင်းပြော အသံ" },
  { code: "HS", name: "Hnin Si", gender: "female", tone: "Gentle", rate: 0.95, pitch: 26, desc: "နူးညံ့သော အသံ" },
  { code: "SL", name: "Soe Lwin", gender: "male", tone: "Fast", rate: 1.3, pitch: 0, desc: "မြန်ဆန်သော အသံ" },
  { code: "YS", name: "Yee Mon", gender: "female", tone: "Natural", rate: 1.0, pitch: 14, desc: "သဘာဝကျသော အသံ" },
  { code: "EC", name: "Ei Chan", gender: "male", tone: "News", rate: 1.05, pitch: -3, desc: "သတင်းကြေညာ အသံ" },
  { code: "TS", name: "Thuzar", gender: "female", tone: "Lively", rate: 1.2, pitch: 22, desc: "တက်ကြွသော အသံ" },
];

const BY_CODE = new Map(PERSONAS.map((p) => [p.code.toUpperCase(), p]));
const BY_NAME = new Map(PERSONAS.map((p) => [p.name.toLowerCase(), p]));
const EDGE_VOICES = new Set([MALE_VOICE.toLowerCase(), FEMALE_VOICE.toLowerCase()]);

function accentFor(gender) {
  return gender === "female" ? "#ec4899" : "#2563eb";
}

/** Client-facing descriptor (adds derived fields used by the UI). */
function describe(persona) {
  return {
    code: persona.code,
    name: persona.name,
    gender: persona.gender,
    genderLabel: persona.gender === "female" ? "Female" : "Male",
    accent: accentFor(persona.gender),
    tone: persona.tone,
    desc: persona.desc,
    rate: persona.rate,
    pitch: persona.pitch,
    edgeVoice: persona.edgeVoice,
    locale: "my-MM",
  };
}

/** Public voice catalogue served by GET /api/voices. */
function listVoices() {
  return PERSONAS.map((persona) => {
    const edgeVoice = persona.gender === "female" ? FEMALE_VOICE : MALE_VOICE;
    return describe({ ...persona, edgeVoice });
  });
}

/**
 * Resolve a loosely-typed client identifier into a full voice plan.
 * Accepts: persona code ("BB"), persona name ("Bobo"), gender
 * ("male"/"female") or a raw Edge voice name ("my-MM-ThihaNeural").
 */
function resolveVoice(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return resolveVoice("BB");

  const upper = raw.toUpperCase();
  if (BY_CODE.has(upper)) return withEdgeVoice(BY_CODE.get(upper));

  const byName = BY_NAME.get(raw.toLowerCase());
  if (byName) return withEdgeVoice(byName);

  const lower = raw.toLowerCase();
  if (EDGE_VOICES.has(lower)) {
    const persona = PERSONAS.find((p) => genderVoice(p.gender).toLowerCase() === lower) || PERSONAS[0];
    return { ...withEdgeVoice(persona), edgeVoice: canonicalEdgeVoice(lower) };
  }

  if (lower === "male" || lower === "m" || lower === "အမျိုးသား") {
    return withEdgeVoice(PERSONAS.find((p) => p.gender === "male"));
  }
  if (lower === "female" || lower === "f" || lower === "အမျိုးသမီး") {
    return withEdgeVoice(PERSONAS.find((p) => p.gender === "female"));
  }

  /* Unknown code: keep the persona id for logging, fall back to the
     natural voice of the requested gender when we can infer one. */
  return {
    ...withEdgeVoice(PERSONAS[0]),
    code: raw.slice(0, 12).toUpperCase(),
    name: raw.slice(0, 24),
    requested: raw,
    fallback: true,
  };
}

function genderVoice(gender) {
  return gender === "female" ? FEMALE_VOICE : MALE_VOICE;
}

function canonicalEdgeVoice(lower) {
  return lower === FEMALE_VOICE.toLowerCase() ? FEMALE_VOICE : MALE_VOICE;
}

function withEdgeVoice(persona) {
  const edgeVoice = persona.edgeVoice || genderVoice(persona.gender);
  return { ...persona, edgeVoice };
}

module.exports = {
  PERSONAS,
  MALE_VOICE,
  FEMALE_VOICE,
  accentFor,
  describe,
  listVoices,
  resolveVoice,
};
