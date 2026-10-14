"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "../../lib/client";
import { distance } from "../../lib/geo";
const Map = dynamic(() => import("../../components/Map"), { ssr: false });
type Point = { latitude: number; longitude: number };
export default function Student() {
  const [token, setToken] = useState(""),
    [session, setSession] = useState<any>(null),
    [user, setUser] = useState<any>(null),
    [id, setId] = useState(""),
    [name, setName] = useState(""),
    [raw, setRaw] = useState<Point | null>(null),
    [corrected, setCorrected] = useState<Point | null>(null),
    [accuracy, setAccuracy] = useState(0),
    [stamp, setStamp] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null),
    [simulate, setSimulate] = useState(false),
    [simAllowed, setSimAllowed] = useState(false),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    Promise.all([api("checkin?token=" + encodeURIComponent(t)), api("me")])
      .then(([p, m]) => {
        setSession(p.session);
        setUser(m.user);
        setSimAllowed(p.simulation);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setUser(await api("login", { role: "student", id, name }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    setBusy(true);
    setError("");
    if (!navigator.geolocation) {
      setError("Geolocation requires a supported browser and HTTPS.");
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pt = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };
        setRaw(pt);
        setCorrected(pt);
        setAccuracy(p.coords.accuracy);
        setStamp(p.timestamp);
        setSimulate(false);
        setBusy(false);
      },
      (e) => {
        setError(
          e.code === 1
            ? "Location permission denied. Enable location for this site, then try again."
            : "Could not retrieve location. Move near a window and retry.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }
  async function submit() {
    if (!raw || !corrected) return;
    setBusy(true);
    try {
      setResult(
        await api("checkin", {
          token,
          raw,
          corrected,
          accuracy,
          locationTimestamp: stamp,
          simulated: simulate,
        }),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const correction = raw && corrected ? distance(raw, corrected) : 0;
  return (
    <main className="student-shell">
      <div className="brand">
        ◉ PRESENT<span>CLASSROOM ATTENDANCE</span>
      </div>
      <section className="student-card">
        {result ? (
          <>
            <div
              className={`success-icon ${result.status === "REJECTED" ? "rejected" : ""}`}
            >
              {result.status === "REJECTED" ? "!" : "✓"}
            </div>
            <div className="eyebrow">
              {result.status === "NORMAL"
                ? "YOU’RE CHECKED IN"
                : "SUBMISSION RECORDED"}
            </div>
            <h1>
              {result.status === "NORMAL"
                ? "You’re here. All set."
                : result.status === "REVIEW"
                  ? "Your teacher will review."
                  : "Outside the attendance area."}
            </h1>
            <p>
              {result.status === "NORMAL"
                ? "Enjoy your class."
                : result.status === "REVIEW"
                  ? "Your location needs a quick review. Your record has been saved."
                  : "Your attempt was recorded as rejected. Speak to your teacher."}
            </p>
            <span className={`badge ${result.status}`}>
              {result.status} · {Math.round(result.distance)} m
            </span>
            {result.lowAccuracy && (
              <p className="warning">
                GPS accuracy flagged for teacher review.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow">STUDENT CHECK-IN</div>
            <h1>{session?.course_id || "Classroom attendance"}</h1>
            <p>
              {session
                ? `${session.name} · ${session.classroom}`
                : "Scan the current classroom QR to begin."}
            </p>
            <div className="steps">
              <span className={user?.role === "student" ? "done" : "current"}>
                1 Identify
              </span>
              <span
                className={
                  raw ? "done" : user?.role === "student" ? "current" : ""
                }
              >
                2 Locate
              </span>
              <span>3 Confirm</span>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
                {/expired|closed|Invalid.*token/i.test(error) && (
                  <p>
                    Rescan the current classroom QR code. Old codes cannot be
                    renewed from this page.
                  </p>
                )}
              </div>
            )}
            {session && user?.role !== "student" && (
              <form onSubmit={login}>
                <label>
                  Student ID
                  <input
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="S001"
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Demo Student 1"
                    autoComplete="name"
                    required
                  />
                </label>
                <button disabled={busy}>
                  {busy ? "Signing in…" : "Continue →"}
                </button>
                <small>Demo: S001 / Demo Student 1 (through S025).</small>
              </form>
            )}
            {session && user?.role === "student" && (
              <>
                <div className="student-identity">
                  <b>{user.name}</b>
                  <span>{user.id}</span>
                  <button
                    className="text-button"
                    onClick={async () => {
                      await api("logout", {});
                      setUser(null);
                      setRaw(null);
                      setCorrected(null);
                    }}
                  >
                    Change
                  </button>
                </div>
                <div className="privacy">
                  ⌁ Your location is collected only when you submit attendance
                  and is used to verify classroom presence.
                </div>
                <button onClick={locate} disabled={busy}>
                  {busy
                    ? "Working…"
                    : raw
                      ? "↻ Locate again"
                      : "◎ Allow location"}
                </button>
                {raw && corrected && (
                  <>
                    <Map
                      center={session}
                      raw={raw}
                      selected={corrected}
                      onMove={setCorrected}
                      normal={session.normal_radius}
                      review={session.review_radius}
                    />
                    <p className="muted">
                      Drag the blue marker only to correct inaccurate GPS. Max
                      adjustment: {session.max_adjustment} m.
                    </p>
                    <div className="location-details">
                      <span>
                        GPS accuracy <b>±{Math.round(accuracy)} m</b>
                      </span>
                      <span>
                        Adjustment{" "}
                        <b
                          className={
                            correction > session.max_adjustment ? "warning" : ""
                          }
                        >
                          {correction.toFixed(1)} m
                        </b>
                      </span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setCorrected(raw)}
                    >
                      Reset to original GPS
                    </button>
                    <button
                      disabled={busy || correction > session.max_adjustment}
                      onClick={submit}
                    >
                      Confirm attendance ✓
                    </button>
                    <small>
                      If the QR expires before submission, rescan and confirm
                      using a fresh code.
                    </small>
                  </>
                )}
                {simAllowed && (
                  <details className="simulation">
                    <summary>Desktop development simulation</summary>
                    <p>
                      Simulated submissions are visibly flagged to teachers.
                    </p>
                    <label>
                      North of classroom (meters)
                      <input
                        type="number"
                        value={offset}
                        onChange={(e) => setOffset(Number(e.target.value))}
                      />
                    </label>
                    <button
                      className="secondary"
                      onClick={() => {
                        const p = {
                          latitude: session.latitude + offset / 111195,
                          longitude: session.longitude,
                        };
                        setRaw(p);
                        setCorrected(p);
                        setAccuracy(15);
                        setStamp(Date.now());
                        setSimulate(true);
                      }}
                    >
                      Use simulated location
                    </button>
                  </details>
                )}
              </>
            )}
          </>
        )}
        <footer>One check-in. No background tracking.</footer>
      </section>
    </main>
  );
}
