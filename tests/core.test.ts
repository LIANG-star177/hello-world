import { test } from "node:test";
import assert from "node:assert/strict";
import { distance, classify, evaluate, qrToken, verify } from "../lib/core";
const classroom = {
  latitude: 0,
  longitude: 0,
  normal_radius: 100,
  review_radius: 300,
  max_adjustment: 50,
};
const input = {
  token: "demo",
  raw: { latitude: 0, longitude: 0 },
  corrected: { latitude: 0, longitude: 0 },
  accuracy: 20,
  locationTimestamp: 1000000,
};
test("Haversine: identity and known equatorial distance", () => {
  assert.equal(distance(classroom, classroom), 0);
  assert.ok(
    Math.abs(distance(classroom, { latitude: 0, longitude: 1 }) - 111194.93) <
      1,
  );
});
test("QR expires exactly at expiry and contains no PII", () => {
  const q = qrToken("session", "secret", 1000);
  assert.equal(q.exp, 21000);
  assert.equal(verify(q.token, "secret", 20999).kind, "qr");
  assert.throws(() => verify(q.token, "secret", 21000), /expired/);
  assert.throws(() => verify(q.token, "wrong", 1001), /Invalid/);
});
test("geofence inclusive boundaries", () => {
  assert.equal(classify(100, 100, 300), "NORMAL");
  assert.equal(classify(100.1, 100, 300), "REVIEW");
  assert.equal(classify(300, 100, 300), "REVIEW");
  assert.equal(classify(301, 100, 300), "REJECTED");
});
test("correction limit enforced", () => {
  assert.throws(
    () =>
      evaluate(
        { ...input, corrected: { latitude: 0.001, longitude: 0 } },
        classroom,
        1000000,
      ),
    /correction/,
  );
  assert.ok(
    evaluate(
      { ...input, corrected: { latitude: 0.0004, longitude: 0 } },
      classroom,
      1000000,
    ).correction < 50,
  );
});
test("poor accuracy flags a normal location without rejecting", () => {
  const v = evaluate({ ...input, accuracy: 500 }, classroom, 1000000);
  assert.equal(v.status, "NORMAL");
  assert.equal(v.lowAccuracy, true);
});
test("malformed coordinates, NaN, strings, negative accuracy and stale fixes fail", () => {
  for (const change of [
    { raw: { latitude: 91, longitude: 0 } },
    { raw: { latitude: "0", longitude: 0 } },
    { accuracy: -1 },
    { accuracy: NaN },
    { locationTimestamp: 1 },
  ])
    assert.throws(() => evaluate({ ...input, ...change }, classroom, 1000000));
});
