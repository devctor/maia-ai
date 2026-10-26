/**
 * Turns the model's partial JSON into the prose a person can read while it arrives.
 *
 * The insight provider is asked for structured output, so what it streams is a JSON document
 * (`{"summary": "...`, then `"patterns": [`), not prose. Rendering those deltas directly puts JSON
 * syntax on screen, which is what this module exists to prevent.
 *
 * The input is deliberately treated as *incomplete*: at any moment a chunk boundary can fall in the
 * middle of a key, of an escape sequence, or of the string itself. `JSON.parse` is useless here — it
 * needs the whole document — so the summary value is scanned by hand and decoded incrementally.
 *
 * Untrusted by contract: this text is progressive *display*. The validated `insight` event remains
 * the only answer, and nothing here is ever parsed into the domain model.
 */

/** Matches the start of the `summary` key at the top level of the object. */
const SUMMARY_KEY = /"summary"\s*:\s*"/;

/**
 * Escapes that decode to exactly one character. `\u` is handled separately because it needs four
 * more characters, which may not have arrived yet.
 */
const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

/**
 * Decodes the summary string of a partial JSON document.
 *
 * Returns everything decoded so far: `""` when the key has not been reached, a growing prefix while
 * the value is streaming, and the complete summary once its closing quote is in the buffer. Scanning
 * stops at that closing quote so later keys can never leak into the displayed text.
 */
export function extractSummaryProse(partialJson: string): string {
  const key = SUMMARY_KEY.exec(partialJson);
  if (!key) {
    return "";
  }

  const value = partialJson.slice(key.index + key[0].length);
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '"') {
      // The value is closed: whatever follows belongs to another key.
      return decoded;
    }

    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const escaped = value[index + 1];

    // The buffer ends right after the backslash. Emitting it now would flash a stray "\" that the
    // next chunk is about to turn into a real character.
    if (escaped === undefined) {
      return decoded;
    }

    if (escaped === "u") {
      const hex = value.slice(index + 2, index + 6);
      // An incomplete `\uXXXX` is not an error, it is just not here yet: four hex digits are
      // needed to know which character it is.
      if (hex.length < 4) {
        return decoded;
      }
      const codePoint = Number.parseInt(hex, 16);
      if (Number.isNaN(codePoint)) {
        // Malformed escape: show nothing rather than a broken glyph, and keep scanning.
        index += 1;
        continue;
      }
      decoded += String.fromCharCode(codePoint);
      index += 5;
      continue;
    }

    const simple = SIMPLE_ESCAPES[escaped];
    if (simple === undefined) {
      // Unknown escape: drop the backslash and keep the character, which is the closest readable
      // rendering of something the model should not have emitted.
      decoded += escaped;
      index += 1;
      continue;
    }

    decoded += simple;
    index += 1;
  }

  return decoded;
}
