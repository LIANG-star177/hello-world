import { NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { all, one, run, prune } from "../../../lib/db";
import {
  authCookie,
  demoStudent,
  identity,
  secret,
  simulation,
  teacherPassword,
} from "../../../lib/auth";
import { evaluate, point, qrToken, verify } from "../../../lib/core";
import {checkinUrl, allowedOrigin} from "../../../lib/public-url";
export const runtime = "nodejs";
const limits = new Map<string, { n: number; until: number }>();
function limit(key: string, max: number) {
  const now = Date.now();
  if (limits.size > 10000)
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  const v = limits.get(key);
  if (v && v.until > now) {
    if (++v.n > max) throw new Error("Rate limit exceeded; wait one minute");
  } else limits.set(key, { n: 1, until: now + 60000 });
}
const sessionSchema = z
  .object({
    course_id: z.string().min(1).max(40),
    name: z.string().min(1).max(100),
    classroom: z.string().min(1).max(100),
    latitude: point.shape.latitude,
    longitude: point.shape.longitude,
    start: z.number().int().positive(),
    end: z.number().int().positive(),
    normal_radius: z.number().positive().max(10000),
    review_radius: z.number().positive().max(20000),
    max_adjustment: z.number().min(0).max(500),
    placeholder: z.boolean().default(false),
  })
  .refine(
    (v) =>
      v.end > v.start &&
      v.end - v.start <= 86400000 &&
      v.review_radius >= v.normal_radius,
    "Invalid attendance window or radii",
  );
async function handle(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.slice(5);
    const write = req.method === "POST";
    if (write && !allowedOrigin(req))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    if (write && Number(req.headers.get("content-length") || 0) > 16000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    if(path === "health" && !write) {
      try { secret(); teacherPassword(); one('SELECT 1'); return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}}); }
      catch { return NextResponse.json({ok:false},{status:503}); }
    }
    const user = identity(req);
    if (write)
      limit(user ? `${user.role}:${user.id || "teacher"}` : "anonymous", 60);
    if (path === "login" && write) {
      limit("login", 60);
      const p = z
        .object({
          role: z.enum(["teacher", "student"]),
          password: z.string().max(200).optional(),
          id: z.string().max(40).optional(),
          name: z.string().max(100).optional(),
        })
        .parse(await req.json());
      let u;
      if (p.role === "teacher") {
        const a = Buffer.from(p.password || ""),
          b = Buffer.from(teacherPassword());
        if (a.length !== b.length || !timingSafeEqual(a, b))
          return NextResponse.json(
            { error: "Wrong password" },
            { status: 401 },
          );
        u = { role: "teacher" };
      } else u = demoStudent(p.id || "", p.name || "");
      return NextResponse.json(u, { headers: { "Set-Cookie": authCookie(u) } });
    }
    if (path === "logout" && write)
      return NextResponse.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie":
              "attendance_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
          },
        },
      );
    if (path === "me")
      return NextResponse.json({ user, simulation: simulation() });
    if (path === "checkin" && !write) {
      const p = verify(url.searchParams.get("token") || "", secret());
      if (p.kind !== "qr") throw new Error("Invalid QR token");
      const s = one("SELECT * FROM sessions WHERE id=?", p.session);
      if (!s || Date.now() < s.start || Date.now() >= s.end)
        throw new Error("Attendance window is closed");
      return NextResponse.json({ session: s, simulation: simulation() });
    }
    if (!user)
      return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (path === "checkin" && write) {
      if (user.role !== "student")
        return NextResponse.json(
          { error: "Student login required" },
          { status: 403 },
        );
      const input = await req.json();
      const token = verify(z.string().max(2048).parse(input.token), secret());
      if (token.kind !== "qr") throw new Error("Invalid QR token");
      const s = one("SELECT * FROM sessions WHERE id=?", token.session);
      if (!s || Date.now() < s.start || Date.now() >= s.end)
        throw new Error("Attendance window is closed");
      if (
        !one(
          "SELECT 1 FROM enrollments WHERE course_id=? AND student_id=?",
          s.course_id,
          user.id,
        )
      )
        throw new Error("Not enrolled in this course");
      const v = evaluate(input, s);
      if (v.p.simulated && !simulation())
        throw new Error("Simulation is disabled");
      try {
        run(
          "INSERT INTO attendance(student_id,course_id,session_id,timestamp,location_timestamp,raw_latitude,raw_longitude,corrected_latitude,corrected_longitude,geolocation_accuracy,correction_distance,distance_to_classroom,token_id,status,low_accuracy,simulated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          user.id,
          s.course_id,
          s.id,
          Date.now(),
          v.p.locationTimestamp,
          v.p.raw.latitude,
          v.p.raw.longitude,
          v.p.corrected.latitude,
          v.p.corrected.longitude,
          v.p.accuracy,
          v.correction,
          v.d,
          token.jti,
          v.status,
          Number(v.lowAccuracy),
          Number(v.p.simulated),
        );
      } catch (e) {
        if (
          one(
            "SELECT 1 FROM attendance WHERE session_id=? AND student_id=?",
            s.id,
            user.id,
          )
        )
          return NextResponse.json(
            { error: "Attendance already submitted" },
            { status: 409 },
          );
        throw e;
      }
      return NextResponse.json({
        status: v.status,
        distance: v.d,
        lowAccuracy: v.lowAccuracy,
      });
    }
    if (user.role !== "teacher")
      return NextResponse.json(
        { error: "Teacher access required" },
        { status: 403 },
      );
    if (path === "courses") {
      if (write) {
        const p = z
          .object({
            id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
            name: z.string().min(1).max(200),
          })
          .parse(await req.json());
        run("INSERT INTO courses VALUES (?,?)", p.id, p.name);
        run("INSERT INTO enrollments SELECT ?,id FROM students", p.id);
      }
      return NextResponse.json(
        all(
          "SELECT c.*,(SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) enrolled FROM courses c",
        ),
      );
    }
    if (path === "roster")
      return NextResponse.json(all("SELECT * FROM students ORDER BY id"));
    if (path === "sessions") {
      if (write) {
        const p = sessionSchema.parse(await req.json());
        if (!one("SELECT 1 FROM courses WHERE id=?", p.course_id))
          throw new Error("Unknown course");
        const id = randomUUID();
        run(
          "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          id,
          p.course_id,
          p.name,
          p.classroom,
          p.latitude,
          p.longitude,
          p.start,
          p.end,
          p.normal_radius,
          p.review_radius,
          p.max_adjustment,
          Number(p.placeholder),
        );
        return NextResponse.json({ id });
      }
      return NextResponse.json(
        all("SELECT * FROM sessions ORDER BY start DESC"),
      );
    }
    const match = path.match(/^sessions\/([^/]+)\/(qr|records|csv)$/);
    if (match) {
      const s = one("SELECT * FROM sessions WHERE id=?", match[1]);
      if (!s)
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 },
        );
      if (match[2] === "qr") {
        if (Date.now() < s.start || Date.now() >= s.end)
          throw new Error("Attendance window is closed");
        const q = qrToken(s.id, secret(), Date.now(), s.end);
        return NextResponse.json({...q, url:checkinUrl(req,q.token)});
      }
      prune();
      const records = all(
        "SELECT a.*,st.name FROM attendance a JOIN students st ON st.id=a.student_id WHERE session_id=? ORDER BY timestamp DESC",
        s.id,
      );
      const enrolled = one(
        "SELECT COUNT(*) n FROM enrollments WHERE course_id=?",
        s.course_id,
      ).n;
      const checked = records.filter((r) => r.status !== "REJECTED").length;
      const summary = {
        enrolled,
        checked,
        normal: records.filter((r) => r.status === "NORMAL").length,
        review: records.filter((r) => r.status === "REVIEW").length,
        rejected: records.filter((r) => r.status === "REJECTED").length,
        absent: enrolled - checked,
      };
      if (match[2] === "csv") {
        const keys = [
          "student_id",
          "name",
          "timestamp",
          "distance_to_classroom",
          "geolocation_accuracy",
          "correction_distance",
          "status",
          "low_accuracy",
          "simulated",
        ];
        const cell = (v: unknown) =>
          '"' +
          String(v ?? "")
            .replace(/^[=+@-]/, "'")
            .replaceAll('"', '""') +
          '"';
        return new Response(
          [
            keys.join(","),
            ...records.map((r) => keys.map((k) => cell(r[k])).join(",")),
          ].join("\r\n"),
          {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="attendance.csv"',
              "Cache-Control": "no-store",
            },
          },
        );
      }
      return NextResponse.json({ records, summary });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Invalid input: " + e.issues.map((i) => i.message).join("; "),
        },
        { status: 400 },
      );
    const msg = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json(
      { error: msg.includes("UNIQUE") ? "This item already exists" : msg },
      { status: msg.includes("Rate limit") ? 429 : 400 },
    );
  }
}
export const GET = handle;
export const POST = handle;
