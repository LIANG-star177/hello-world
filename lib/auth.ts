import { randomBytes } from "node:crypto";
import { sign, verify } from "./core";
import { one } from "./db";
const state = globalThis as typeof globalThis & { attendanceDevSecret?: string };
const devSecret = state.attendanceDevSecret ??= randomBytes(32).toString("hex");
export function secret() {
  const s = process.env.AUTH_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!s || s.length < 32 || s.startsWith("replace-"))
  )
    throw new Error("Configure a strong AUTH_SECRET before production");
  return s || devSecret;
}
export function teacherPassword() {
  const p = process.env.TEACHER_PASSWORD;
  if (
    process.env.NODE_ENV === "production" &&
    (!p || p === "change-this-password" || p.length < 12)
  )
    throw new Error("Configure TEACHER_PASSWORD (12+ characters)");
  return p || "teacher-demo";
}
// Replace this adapter with verified University OAuth/SAML claims and roster lookup.
export function demoStudent(id: string, name: string) {
  const student = one("SELECT * FROM students WHERE id=?", id);
  if (!student || student.name.toLowerCase() !== name.trim().toLowerCase())
    throw new Error("Student ID/name do not match the demo roster");
  return { role: "student", id: student.id, name: student.name };
}
export function identity(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("attendance_auth="))
    ?.slice(16);
  if (!token) return null;
  try {
    const p = verify(token, secret());
    return p.kind === "auth" ? p : null;
  } catch {
    return null;
  }
}
export function authCookie(user: object) {
  return `attendance_auth=${sign({ ...user, kind: "auth", exp: Date.now() + 8 * 3600000 }, secret())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function simulation() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_SIMULATION === "true"
  );
}
