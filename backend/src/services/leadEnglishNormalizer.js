const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;
const DEVANAGARI_GLOBAL_PATTERN = /[\u0900-\u097F]/g;

const VOWELS = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "i",
  उ: "u",
  ऊ: "oo",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  ऋ: "ri"
};

const VOWEL_SIGNS = {
  "ा": "aa",
  "ि": "i",
  "ी": "i",
  "ु": "u",
  "ू": "oo",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ृ": "ri"
};

const CONSONANTS = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "ng",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "ny",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
  क्ष: "ksh",
  त्र: "tr",
  ज्ञ: "gy"
};

const DIGITS = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9"
};

const HINDI_NUMBERS = {
  शून्य: "0",
  एक: "1",
  पहला: "1",
  पहली: "1",
  दो: "2",
  दूसरा: "2",
  दूसरी: "2",
  तीन: "3",
  तीसरा: "3",
  तीसरी: "3",
  चार: "4",
  चौथा: "4",
  चौथी: "4",
  पांच: "5",
  पाँच: "5",
  पाच: "5",
  छह: "6",
  छः: "6",
  सात: "7",
  आठ: "8",
  नौ: "9",
  दस: "10",
  ग्यारह: "11",
  बारह: "12",
  तेरह: "13",
  चौदह: "14",
  पंद्रह: "15",
  सोलह: "16",
  सत्रह: "17",
  अठारह: "18",
  उन्नीस: "19",
  बीस: "20",
  इक्कीस: "21",
  बाईस: "22",
  तेईस: "23",
  चौबीस: "24",
  पच्चीस: "25",
  छब्बीस: "26",
  सत्ताईस: "27",
  अट्ठाईस: "28",
  उनतीस: "29",
  तीस: "30",
  इकतीस: "31"
};

const REQUIREMENT_REPLACEMENTS = [
  ["बुकिंग", "Booking"],
  ["टेबल बुकिंग", "Table booking"],
  ["टेबल", "Table"],
  ["रिजर्वेशन", "Reservation"],
  ["आरक्षण", "Reservation"],
  ["मेनू", "Menu"],
  ["कीमत", "Price"],
  ["प्राइस", "Price"],
  ["भाव", "Price"],
  ["टेकअवे", "Takeaway"],
  ["डिलीवरी", "Delivery"],
  ["अपॉइंटमेंट", "Appointment"],
  ["मीटिंग", "Meeting"],
  ["कॉल बैक", "Callback"],
  ["कॉलबैक", "Callback"],
  ["फॉलो अप", "Follow up"],
  ["पूछताछ", "Inquiry"],
  ["जानकारी", "Information"],
  ["प्रॉपर्टी", "Property"],
  ["बजट", "Budget"],
  ["लोन", "Loan"],
  ["एडमिशन", "Admission"]
];

const TIME_REPLACEMENTS = [
  ["तारीख", "Date"],
  ["दिनांक", "Date"],
  ["बजे", "o'clock"],
  ["सुबह", "AM"],
  ["दोपहर", "PM"],
  ["शाम", "PM"],
  ["रात", "PM"],
  ["कल", "tomorrow"],
  ["आज", "today"],
  ["परसों", "day after tomorrow"]
];

function hasDevanagari(value) {
  return DEVANAGARI_PATTERN.test(String(value || ""));
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function replaceHindiNumbers(value) {
  let output = String(value || "").replace(/[०-९]/g, (digit) => DIGITS[digit] || digit);

  for (const [word, number] of Object.entries(HINDI_NUMBERS)) {
    output = output.replace(new RegExp(word, "g"), number);
  }

  return output;
}

function transliterateDevanagariToken(token) {
  const input = String(token || "");
  let output = "";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    const combined = char + next;

    if (CONSONANTS[combined]) {
      output += CONSONANTS[combined];
      index += 1;
      continue;
    }

    if (CONSONANTS[char]) {
      if (next === "्") {
        output += CONSONANTS[char];
        index += 1;
      } else if (VOWEL_SIGNS[next]) {
        output += CONSONANTS[char] + VOWEL_SIGNS[next];
        index += 1;
      } else {
        output += CONSONANTS[char] + "a";
      }
      continue;
    }

    if (VOWELS[char]) {
      output += VOWELS[char];
      continue;
    }

    if (char === "ं" || char === "ँ") {
      output += "n";
      continue;
    }

    if (char === "ः") {
      output += "h";
      continue;
    }

    if (VOWEL_SIGNS[char] || char === "्" || char === "़") {
      continue;
    }

    output += char;
  }

  return output
    .replace(DEVANAGARI_GLOBAL_PATTERN, "")
    .replace(/a\b/i, "")
    .trim();
}

function transliterateDevanagari(value) {
  const input = replaceHindiNumbers(value);

  return input
    .split(/(\s+|[,.!?;:()[\]{}]+)/)
    .map((part) => (hasDevanagari(part) ? transliterateDevanagariToken(part) : part))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function translateKnownWords(value, replacements) {
  let output = replaceHindiNumbers(value);

  for (const [hindi, english] of replacements) {
    output = output.replace(new RegExp(hindi, "g"), english);
  }

  return output;
}

function ordinal(number) {
  const numeric = Number(number);
  if (!Number.isInteger(numeric)) return number;
  const suffix = numeric % 100 >= 11 && numeric % 100 <= 13
    ? "th"
    : { 1: "st", 2: "nd", 3: "rd" }[numeric % 10] || "th";
  return `${numeric}${suffix}`;
}

function normalizeTimePhrase(value) {
  let output = translateKnownWords(value, TIME_REPLACEMENTS);

  output = output.replace(/\b(\d{1,2})\s*Date\b/gi, (_, day) => `${ordinal(day)} Date`);
  output = output.replace(/\b(\d{1,2})\s*o'?clock\b/gi, (_, hour) => {
    const numericHour = Number(hour);
    if (!Number.isInteger(numericHour)) return `${hour}:00`;
    const suffix = numericHour >= 1 && numericHour <= 7 ? "PM" : "";
    return `${numericHour}:00${suffix ? ` ${suffix}` : ""}`;
  });
  output = output.replace(/\b(AM|PM)\s+(\d{1,2}):00(?:\s+(?:AM|PM))?\b/gi, (_, period, hour) => `${hour}:00 ${period.toUpperCase()}`);

  return transliterateDevanagari(output).replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  if (value === undefined || value === null || value === "") return value || "";
  return titleCase(transliterateDevanagari(value));
}

function normalizeRequirement(value) {
  if (value === undefined || value === null || value === "") return value || "";
  const translated = translateKnownWords(value, REQUIREMENT_REPLACEMENTS);
  return transliterateDevanagari(translated).replace(/\s+/g, " ").trim();
}

function normalizeGenericText(value) {
  if (value === undefined || value === null || value === "") return value || "";
  return normalizeTimePhrase(translateKnownWords(value, REQUIREMENT_REPLACEMENTS))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return notes;

  return notes.map((note) => {
    if (typeof note === "string") return normalizeGenericText(note);
    if (!note || typeof note !== "object") return note;
    return {
      ...note,
      text: normalizeGenericText(note.text)
    };
  });
}

export function normalizeLeadToEnglish(lead = {}) {
  const normalized = { ...lead };

  if (Object.prototype.hasOwnProperty.call(normalized, "name")) {
    normalized.name = normalizeName(normalized.name);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "requirement")) {
    normalized.requirement = normalizeRequirement(normalized.requirement);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "preferredTime")) {
    normalized.preferredTime = normalizeTimePhrase(normalized.preferredTime);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "preferred_time")) {
    normalized.preferred_time = normalizeTimePhrase(normalized.preferred_time);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "notes")) {
    normalized.notes = normalizeNotes(normalized.notes);
  }

  return normalized;
}

export function containsHindiText(value) {
  return hasDevanagari(value);
}
