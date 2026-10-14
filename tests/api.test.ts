import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_PATH = ":memory:";
process.env.AUTH_SECRET = "test-secret-only-123456789012345678901";
process.env.TEACHER_PASSWORD = "test-teacher-password";
const { GET, POST } = await import("../app/api/[...path]/route");
const { sign } = await import("../lib/core");
const { one, run, prune } = await import("../lib/db");
async function request(path: string, body?: unknown, cookie = "") {
  return (body === undefined ? GET : POST)(
    new Request("http://localhost/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
test("end-to-end API: permissions, expired token, correction, duplicates, CSV and retention", async () => {
  assert.equal((await request("sessions")).status, 401);
  const login = await request("login", {
    role: "teacher",
    password: "test-teacher-password",
  });
  assert.equal(login.status, 200);
  const teacher = login.headers.get("set-cookie")!;
  const start = Date.now() - 1000;
  const session = await (
    await request(
      "sessions",
      {
        course_id: "LAWS7701",
        name: "Test",
        classroom: "Placeholder",
        latitude: 0,
        longitude: 0,
        start,
        end: start + 180000,
        normal_radius: 100,
        review_radius: 300,
        max_adjustment: 50,
        placeholder: true,
      },
      teacher,
    )
  ).json();
  assert.ok(session.id);
  const qr = await (
    await request(`sessions/${session.id}/qr`, undefined, teacher)
  ).json();
  const student = (
    await request("login", {
      role: "student",
      id: "S001",
      name: "Demo Student 1",
    })
  ).headers.get("set-cookie")!;
  assert.equal((await request("roster", undefined, student)).status, 403);
  const payload = {
    token: qr.token,
    raw: { latitude: 0, longitude: 0 },
    corrected: { latitude: 0, longitude: 0 },
    accuracy: 500,
    locationTimestamp: Date.now(),
  };
  const expired = sign(
    { kind: "qr", session: session.id, jti: "expired", exp: Date.now() - 1000 },
    process.env.AUTH_SECRET!,
  );
  assert.equal(
    (await request("checkin", { ...payload, token: expired }, student)).status,
    400,
  );
  assert.equal(
    (
      await request(
        "checkin",
        { ...payload, corrected: { latitude: 0.01, longitude: 0 } },
        student,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "checkin",
        { ...payload, raw: { latitude: 999, longitude: 0 } },
        student,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("checkin", { ...payload, simulated: true }, student)).status,
    400,
  );
  const good = await request("checkin", payload, student);
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), {
    status: "NORMAL",
    distance: 0,
    lowAccuracy: true,
  });
  assert.equal((await request("checkin", payload, student)).status, 409);
  const records = await (
    await request(`sessions/${session.id}/records`, undefined, teacher)
  ).json();
  assert.equal(records.records.length, 1);
  assert.equal(records.summary.checked, 1);
  assert.equal(records.summary.absent, 24);
  assert.ok(
    (
      await (
        await request(`sessions/${session.id}/csv`, undefined, teacher)
      ).text()
    ).includes("Demo Student 1"),
  );
  run("UPDATE attendance SET timestamp=?", Date.now() - 40 * 86400000);
  assert.equal(prune(), 1);
  assert.equal(one("SELECT raw_latitude FROM attendance").raw_latitude, null);
});

test('origin checks use external Host behind Next server and reject foreign origins',async()=>{
const body=JSON.stringify({role:'teacher',password:'test-teacher-password'});
const good=await POST(new Request('http://internal:3000/api/login',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','Content-Type':'application/json'},body}));
assert.equal(good.status,200);
const bad=await POST(new Request('http://internal:3000/api/login',{method:'POST',headers:{host:'localhost:3000',origin:'https://evil.example','Content-Type':'application/json'},body}));
assert.equal(bad.status,403);
});
