"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import QRCode from "qrcode";
import { api } from "../lib/client";
const Map = dynamic(() => import("../components/Map"), { ssr: false });
export default function Teacher() {
  const [user, setUser] = useState<any>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [courses, setCourses] = useState<any[]>([]),
    [sessions, setSessions] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [data, setData] = useState<any>(null),
    [qr, setQr] = useState<any>(null),
    [qrImage, setQrImage] = useState(""),
    [now, setNow] = useState(Date.now()),
    [filter, setFilter] = useState("ALL"),
    [sort, setSort] = useState("timestamp"),
    [project, setProject] = useState(false),
    [showForm, setShowForm] = useState(false),
    [roster, setRoster] = useState<any[]>([]),
    [showRoster, setShowRoster] = useState(false);
  const [form, setForm] = useState({
    course_id: "LAWS7701",
    name: "Lecture 01 · Digital society",
    classroom: "E32-G007",
    latitude: 0,
    longitude: 0,
    normal_radius: 100,
    review_radius: 300,
    max_adjustment: 50,
    minutes: 3,
    start: "",
  });
  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api("courses"), api("sessions")]);
    setCourses(c);
    setSessions(s);
    setSelected((v) => v || s[0]?.id || "");
  }, []);
  useEffect(() => {
    api("me").then((p) => {
      setUser(p.user);
      if (p.user?.role === "teacher") load().catch((e) => setError(e.message));
    });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [load]);
  const session = sessions.find((s) => s.id === selected);
  useEffect(() => {
    setQr(null);
    setQrImage("");
    setData(null);
    if (!selected || user?.role !== "teacher") return;
    let alive = true;
    async function poll() {
      try {
        const d = await api(`sessions/${selected}/records`);
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selected, user]);
  useEffect(() => {
    if (!session) return;
    let alive = true, inFlight = false, expires = 0;
    async function refresh() {
      const clock = Date.now();
      if (clock < session.start || clock >= session.end) {
        if (alive) setQr(null);
        return;
      }
      if (inFlight || expires > clock) return;
      inFlight = true;
      try {
        const q = await api(`sessions/${selected}/qr`);
        const image = await QRCode.toDataURL(`${window.location.origin}/student?token=${encodeURIComponent(q.token)}`, {width:600, margin:2,errorCorrectionLevel:'M'});
        if (alive) { expires=q.exp; setQr({...q,sessionId:selected});setQrImage(image); }
      } catch(e) { if(alive) setError((e as Error).message); }
      finally { inFlight=false; }
    }
    refresh();
    const timer=setInterval(refresh,1000);
    return () => { alive=false; clearInterval(timer); };
  }, [selected, session]);
  const qrReady = qr && qr.sessionId === selected && qr.exp > now;
  async function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      const u = await api("login", { role: "teacher", password });
      setUser(u);
      setError("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const start = form.start ? new Date(form.start).getTime() : Date.now();
      const p = await api("sessions", {
        ...form,
        start,
        end: start + form.minutes * 60000,
        placeholder: form.latitude === 0 && form.longitude === 0,
      });
      await load();
      setSelected(p.id);
      setShowForm(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const stats = data?.summary || {
    enrolled: 25,
    checked: 0,
    normal: 0,
    review: 0,
    rejected: 0,
    absent: 25,
  };
  const records = (data?.records || [])
    .filter(
      (r: any) =>
        filter === "ALL" ||
        (filter === "LOW" ? r.low_accuracy : r.status === filter),
    )
    .sort((a: any, b: any) => Number(b[sort]) - Number(a[sort]));
  if (user?.role !== "teacher")
    return (
      <main className="login">
        <div className="brand">
          ◉ PRESENT<span>CLASSROOM ATTENDANCE</span>
        </div>
        <div className="login-card">
          <div className="eyebrow">TEACHER WORKSPACE</div>
          <h1>
            A little less admin.
            <br />
            More time to teach.
          </h1>
          <p>
            Open attendance, project a QR code, and see who’s here in real time.
          </p>
          <form onSubmit={login}>
            <label>
              Teacher password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button>Enter workspace →</button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small>
            Local demo password: teacher-demo (unless configured).
            <br />
            Students: scan the classroom QR to begin.
          </small>
        </div>
        <footer>Simple check-ins. Thoughtful privacy.</footer>
      </main>
    );
  return (
    <div className={project ? "shell projection" : "shell"}>
      <aside>
        <div className="brand">
          ◉ PRESENT<span>CLASSROOM ATTENDANCE</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <button className="nav active" onClick={() => setShowRoster(false)}>
          ▦ Attendance
        </button>
        <button
          className="nav"
          onClick={async () => {
            try {
              setRoster(await api("roster"));
              setShowRoster(true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          ♧ Demo roster
        </button>
        <div className="sidebar-bottom">
          <div className="avatar">T</div>
          <b>Teacher workspace</b>
          <small>University classroom demo</small>
          <button
            className="text-button"
            onClick={async () => {
              await api("logout", {});
              setUser(null);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <div>
            <div className="eyebrow">TEACHER WORKSPACE / ATTENDANCE</div>
            <h1>{project ? "Classroom check-in" : "Attendance overview"}</h1>
            <p>Know who’s here. Keep your class moving.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}>＋ New session</button>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        {showRoster ? (
          <section className="card">
            <h2>Demo student roster</h2>
            <p>
              Use an ID and its matching name on the student login page. Demo
              identity is not secure university authentication.
            </p>
            <div className="roster">
              {roster.map((s) => (
                <div key={s.id}>
                  <b>{s.id}</b> {s.name}
                </div>
              ))}
            </div>
            <button onClick={() => setShowRoster(false)}>
              Back to attendance
            </button>
          </section>
        ) : (
          <>
            {showForm && (
              <section className="card">
                <h2>Create an attendance session</h2>
                <p className="warning">
                  0, 0 is a placeholder, not E32-G007’s real location. Replace
                  both coordinates before classroom use.
                </p>
                <form onSubmit={create} className="form-grid">
                  <label>
                    Course
                    <select
                      value={form.course_id}
                      onChange={(e) =>
                        setForm({ ...form, course_id: e.target.value })
                      }
                    >
                      {courses.map((c) => (
                        <option key={c.id}>{c.id}</option>
                      ))}
                    </select>
                  </label>
                  {(
                    [
                      "name",
                      "classroom",
                      "latitude",
                      "longitude",
                      "normal_radius",
                      "review_radius",
                      "max_adjustment",
                      "minutes",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {
                        {
                          name: "Lecture name",
                          classroom: "Classroom",
                          latitude: "Latitude",
                          longitude: "Longitude",
                          normal_radius: "Normal radius (m)",
                          review_radius: "Review radius (m)",
                          max_adjustment: "Max correction (m)",
                          minutes: "Window (minutes)",
                        }[k]
                      }
                      <input
                        required
                        type={typeof form[k] === "number" ? "number" : "text"}
                        step="any"
                        value={form[k]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [k]:
                              typeof form[k] === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Start (blank = now)
                    <input
                      type="datetime-local"
                      value={form.start}
                      onChange={(e) =>
                        setForm({ ...form, start: e.target.value })
                      }
                    />
                  </label>
                  <button>Create session</button>
                </form>
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      await api("courses", {
                        id: f.get("id"),
                        name: f.get("name"),
                      });
                      await load();
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <input name="id" placeholder="New course code" required />
                  <input name="name" placeholder="Course title" required />
                  <button className="secondary">Add course</button>
                </form>
              </section>
            )}
            <div className="session-bar">
              <div>
                <span className="eyebrow">CURRENT SESSION</span>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Select a session</option>
                  {sessions.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.course_id} · {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {session && (
                <div className="session-meta">
                  <b>{session.classroom}</b>
                  <span>
                    {new Date(session.start).toLocaleString()} ·{" "}
                    {session.normal_radius} m normal radius
                  </span>
                </div>
              )}
              <span
                className={`badge ${session && now >= session.start && now < session.end ? "NORMAL" : "REVIEW"}`}
              >
                {session
                  ? now < session.start
                    ? "Scheduled"
                    : now < session.end
                      ? "● Attendance open"
                      : "Window closed"
                  : "No session yet"}
              </span>
            </div>
            <div className="stats">
              {[
                ["ENROLLED", stats.enrolled],
                ["CHECKED IN", stats.checked],
                ["NORMAL", stats.normal],
                ["REVIEW", stats.review],
                ["REJECTED", stats.rejected],
                ["ABSENT", stats.absent],
              ].map(([l, v]) => (
                <div className="stat" key={l}>
                  <span>{l}</span>
                  <strong>{v}</strong>
                  <div
                    className={
                      "stat-line " + String(l).toLowerCase().replace(" ", "")
                    }
                  />
                </div>
              ))}
            </div>
            {!session ? (
              <section className="card empty">
                <h2>Your next class starts here</h2>
                <p>
                  Create a session to project a QR code and begin collecting
                  attendance.
                </p>
                <button onClick={() => setShowForm(true)}>
                  Create first session
                </button>
              </section>
            ) : (
              <>
                <div className="top-grid">
                  <section className="card qr-card">
                    <div className="card-heading">
                      <h2>Scan. Confirm. You’re here.</h2>
                      <span className="live-dot">LIVE</span>
                    </div>
                    <p>
                      {session.course_id} · {session.name} · {session.classroom}
                    </p>
                    {session.placeholder === 1 && (
                      <small className="warning">
                        Demo placeholder coordinates — replace before class.
                      </small>
                    )}
                    {qrReady && qrImage ? (
                      <img
                        className="qr"
                        src={qrImage}
                        alt="Scan to check in"
                      />
                    ) : (
                      <div className="qr-placeholder">
                        {now < session.start
                          ? "Waiting for scheduled start"
                          : "Attendance closed"}
                      </div>
                    )}
                    <div className="qr-timers">
                      <div>
                        <strong>
                          {qr
                            ? Math.max(0, Math.ceil((qr.exp - now) / 1000))
                            : "—"}
                          s
                        </strong>
                        <span>QR refresh</span>
                      </div>
                      <div>
                        <strong>
                          {Math.max(0, Math.ceil((session.end - now) / 1000))}s
                        </strong>
                        <span>Window remaining</span>
                      </div>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setProject(!project)}
                    >
                      {project ? "Exit projection" : "⛶ Projection view"}
                    </button>
                    {qrReady && (
                      <a
                        className="student-link"
                        href={`/student?token=${encodeURIComponent(qr.token)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open student flow ↗
                      </a>
                    )}
                    <small>
                      QR codes expire in 20 seconds. Submit before expiry;
                      rescan if needed.
                    </small>
                  </section>
                  <section className="card map-card">
                    <div className="card-heading">
                      <h2>Classroom location</h2>
                      <span className="muted">Live submissions</span>
                    </div>
                    <Map
                      center={session}
                      records={data?.records || []}
                      normal={session.normal_radius}
                      review={session.review_radius}
                    />
                    <div className="map-legend">
                      <span>● Normal</span>
                      <span>● Review</span>
                      <span>● Rejected</span>
                    </div>
                    <p className="muted">
                      Inner circle = normal attendance,
                      outer circle = review. GPS accuracy is shown in the table.
                    </p>
                  </section>
                </div>
                <section className="card table-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        Attendance records{" "}
                        <span className="count">
                          {data?.records.length || 0}
                        </span>
                      </h2>
                      <p>
                        Focus on exceptions. Normal check-ins take care of
                        themselves.
                      </p>
                    </div>
                    <a
                      className="button secondary"
                      href={`/api/sessions/${selected}/csv`}
                    >
                      ↓ Export CSV
                    </a>
                  </div>
                  <div className="table-controls">
                    <div className="tabs">
                      {["ALL", "REVIEW", "REJECTED", "LOW"].map((f) => (
                        <button
                          className={filter === f ? "selected" : ""}
                          key={f}
                          onClick={() => setFilter(f)}
                        >
                          {f === "ALL"
                            ? "All students"
                            : f === "LOW"
                              ? "Low GPS accuracy"
                              : f.charAt(0) + f.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="timestamp">Newest first</option>
                      <option value="distance_to_classroom">
                        Distance: highest
                      </option>
                      <option value="geolocation_accuracy">
                        Accuracy: poorest
                      </option>
                      <option value="correction_distance">
                        Correction: highest
                      </option>
                    </select>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Time</th>
                          <th>Distance</th>
                          <th>GPS accuracy</th>
                          <th>Correction</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r: any) => (
                          <tr key={r.id}>
                            <td>
                              <b>{r.name}</b>
                              <small>
                                {r.student_id}
                                {r.simulated ? " · SIMULATED" : ""}
                              </small>
                            </td>
                            <td>
                              {new Date(r.timestamp).toLocaleTimeString()}
                            </td>
                            <td>{r.distance_to_classroom.toFixed(0)} m</td>
                            <td className={r.low_accuracy ? "warning" : ""}>
                              ± {r.geolocation_accuracy.toFixed(0)} m
                              {r.low_accuracy ? " ⚑" : ""}
                            </td>
                            <td>{r.correction_distance.toFixed(1)} m</td>
                            <td>
                              <span className={`badge ${r.status}`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!records.length && (
                      <div className="empty-table">
                        {filter === "ALL"
                          ? "No check-ins yet. Share the QR code to get started."
                          : "No matching records."}
                      </div>
                    )}
                  </div>
                  <small>
                    Checked in = normal + review. Rejected submissions remain
                    absent. Poor accuracy is flagged, never rejected solely for
                    accuracy.
                  </small>
                </section>
              </>
            )}
          </>
        )}
        <footer>
          ◉ PRESENT{" "}
          <span>
            Location is collected only for attendance. Precise coordinates
            expire after the configured retention period.
          </span>
        </footer>
      </main>
    </div>
  );
}
