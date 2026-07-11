// Pure helpers for building Gmail reply headers and recipient lists. No network — unit-testable.

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function normalizeList(list) {
  if (!list) return [];
  return (Array.isArray(list) ? list : [list])
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return { email: entry.trim().toLowerCase(), name: "" };
      return { email: String(entry.email || entry.address || "").trim().toLowerCase(), name: entry.name || "" };
    })
    .filter((entry) => entry && EMAIL_REGEX.test(entry.email));
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (seen.has(entry.email)) continue;
    seen.add(entry.email);
    out.push(entry);
  }
  return out;
}

export function buildReplySubject(subject = "") {
  const clean = String(subject || "").trim() || "Following up";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

// mode: "reply" (sender only) | "reply_all" (sender + original To/Cc, excluding the connected
// Gmail address). Never copies original Bcc.
export function buildReplyRecipients({ mode = "reply", message = {}, connectedEmail = "" } = {}) {
  const connected = String(connectedEmail || "").trim().toLowerCase();
  const fromList = normalizeList(message.from?.length ? message.from : (message.fromEmail ? [{ email: message.fromEmail }] : []));
  const toList = normalizeList(message.to?.length ? message.to : (message.toEmail ? [{ email: message.toEmail }] : []));
  const ccList = normalizeList(message.cc);

  const senderEmail = fromList[0]?.email || "";
  // Primary recipient is the sender we are replying to; if that message was sent by us, reply to
  // the message's original recipients instead.
  let primary;
  if (senderEmail && senderEmail !== connected) {
    primary = [{ email: senderEmail, name: fromList[0]?.name || "" }];
  } else {
    primary = toList.filter((addr) => addr.email !== connected);
  }
  const to = dedupe(primary).filter((addr) => addr.email);

  if (mode !== "reply_all") {
    return { to, cc: [] };
  }

  const toSet = new Set(to.map((addr) => addr.email));
  const cc = dedupe([...toList, ...ccList]).filter(
    (addr) => addr.email && addr.email !== connected && !toSet.has(addr.email)
  );
  return { to, cc };
}

// Builds RFC In-Reply-To / References from the message being replied to.
export function buildReplyThreadingHeaders(message = {}) {
  const inReplyTo = message.internetMessageId || "";
  const references = Array.isArray(message.references) ? [...message.references] : [];
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);
  return { inReplyTo, references };
}
