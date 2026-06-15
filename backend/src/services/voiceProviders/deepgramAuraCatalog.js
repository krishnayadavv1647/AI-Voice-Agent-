const CATALOG = {
  en: [
    "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas", "aurora", "callista",
    "cora", "cordelia", "delia", "draco", "electra", "harmonia", "helena", "hera", "hermes", "hyperion",
    "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus", "ophelia",
    "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "selene", "thalia", "theia", "vesta", "zeus"
  ],
  es: ["sirio", "nestor", "carina", "celeste", "alvaro", "diana", "aquila", "selena", "estrella", "javier", "agustina", "antonia", "gloria", "luciano", "olivia", "silvia", "valerio"],
  nl: ["beatrix", "daphne", "cornelia", "sander", "hestia", "lars", "roman", "rhea", "leda"],
  fr: ["agathe", "hector"],
  de: ["elara", "aurelia", "lara", "julius", "fabian", "kara", "viktoria"],
  it: ["melia", "elio", "flavio", "maia", "cinzia", "cesare", "livia", "perseo", "dionisio", "demetra"],
  ja: ["uzume", "ebisu", "fujin", "izanami", "ama"]
};

const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
  nl: "Dutch",
  fr: "French",
  de: "German",
  it: "Italian",
  ja: "Japanese"
};

function titleCase(value) {
  return String(value || "").replace(/(^|[-_ ])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

export const DEEPGRAM_AURA_VOICES = Object.freeze(
  Object.entries(CATALOG).flatMap(([language, names]) => names.map((name) => ({
    id: `aura-2-${name}-${language}`,
    name: `${titleCase(name)} · Aura 2`,
    provider: "deepgram",
    language,
    languageName: LANGUAGE_NAMES[language] || language,
    gender: "",
    style: "Aura 2 voice",
    previewUrl: "",
    labels: { language: LANGUAGE_NAMES[language] || language, family: "Aura 2" }
  })))
);
