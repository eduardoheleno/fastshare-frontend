import test from "node:test";
import assert from "node:assert/strict";
import { mergeMessages, acknowledge } from "./chat.js";

test("histórico preenche lacunas sem duplicar entregas ao vivo e só confirma o próprio envio", () => {
  const first = { seq: 1, clientId: "a", participantId: "other" };
  const second = { seq: 2, clientId: "b", participantId: "me" };
  const third = { seq: 3, clientId: "c", participantId: "other" };
  const result = mergeMessages([third, first], [first, second, third]);
  assert.deepEqual(result, [first, second, third]);
  assert.deepEqual(
    acknowledge([{ clientId: "a" }, { clientId: "b" }], result, "me"),
    [{ clientId: "a" }],
  );
});
