import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const point = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const submission = z.object({
  token: z.string().min(1).max(2048),
  raw: point,
  corrected: point,
  accuracy: z.number().min(0).max(100000),
  locationTimestamp: z.number().int().positive(),
  simulated: z.boolean().default(false),
});
import { distance } from "./geo";
export { distance } from "./geo";
export function classify(d: number, normal: number, review: number) {
  return d <= normal ? "NORMAL" : d <= review ? "REVIEW" : "REJECTED";
}
export function sign(payload: object, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function verify(
  token: string,
  secret: string,
  now = Date.now(),
): Record<string, any> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra) throw new Error("Invalid token");
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid token");
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!Number.isFinite(data.exp) || data.exp <= now)
    throw new Error("Token expired");
  return data;
}
export function qrToken(
  session: string,
  secret: string,
  now = Date.now(),
  end = Infinity,
) {
  const exp = Math.min(now + 20000, end);
  return {
    token: sign(
      { kind: "qr", session, jti: randomBytes(16).toString("hex"), exp },
      secret,
    ),
    exp,
  };
}
export function evaluate(
  input: unknown,
  session: {
    latitude: number;
    longitude: number;
    normal_radius: number;
    review_radius: number;
    max_adjustment: number;
  },
  now = Date.now(),
) {
  const p = submission.parse(input);
  if (p.locationTimestamp < now - 120000 || p.locationTimestamp > now + 10000)
    throw new Error("Location is stale. Please locate again.");
  const correction = distance(p.raw, p.corrected);
  if (correction > session.max_adjustment + 0.001)
    throw new Error("Location correction exceeds allowed distance");
  const d = distance(p.corrected, session);
  return {
    p,
    correction,
    d,
    status: classify(d, session.normal_radius, session.review_radius),
    lowAccuracy: p.accuracy > session.normal_radius,
  };
}
