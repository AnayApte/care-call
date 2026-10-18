import { test } from "node:test";
import assert from "node:assert/strict";
import { cardCopy, displayWord, toLabel, trainingOrder } from "./labels.ts";

const vocabulary = [
  { label: "water", display: "Water", speech: "I would like some water, please." },
  { label: "cup_of_tea", display: "Cup of tea", speech: "I would like a cup of tea." },
];

test("toLabel turns a typed word into a server-safe label", () => {
  assert.equal(toLabel("Tea"), "tea");
  assert.equal(toLabel("  Cup of tea! "), "cup_of_tea");
  assert.equal(toLabel("Café"), "cafe");
  assert.equal(toLabel("a very long word that keeps on going"), "a_very_long_word_that_ke");
});

test("toLabel returns empty when no usable label is left", () => {
  assert.equal(toLabel(""), "");
  assert.equal(toLabel("!!!"), "");
  assert.equal(toLabel("2 pills"), "");
});

test("trainingOrder keeps the defaults first and appends added words once", () => {
  assert.deepEqual(trainingOrder(vocabulary), ["neutral", "water", "pain", "help", "bathroom", "cup_of_tea"]);
  assert.deepEqual(trainingOrder([]), ["neutral", "water", "pain", "help", "bathroom"]);
});

test("displayWord and cardCopy fall back to the patient's vocabulary for added words", () => {
  assert.equal(displayWord("neutral", vocabulary), "Rest");
  assert.equal(displayWord("cup_of_tea", vocabulary), "Cup of tea");
  assert.equal(displayWord("unknown", vocabulary), "unknown");
  assert.deepEqual(cardCopy("cup_of_tea", vocabulary), { word: "Cup of tea", ask: "Ask them to make their movement for cup of tea, and hold it." });
  assert.equal(cardCopy("water", vocabulary).word, "Water");
});
