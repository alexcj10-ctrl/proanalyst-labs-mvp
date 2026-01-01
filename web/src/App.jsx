// web/src/App.jsx

import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const isAuthed = Boolean(token);

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loginError, setLoginError] = useState("");

  // catalog
  const [catalog, setCatalog] = useState(null);
  const [ownList, setOwnList] = useState([]);
  const [oppList, setOppList] = useState([]);
  const [pressList, setPressList] = useState([]);

  // selections
  const [own, setOwn] = useState("");
  const [opp, setOpp] = useState("");
  const [press, setPress] = useState("");

  // job
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [message, setMessage] = useState("");

  const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
    setCatalog(null);
    setOwnList([]);
    setOppList([]);
    setPressList([]);
    setOwn("");
    setOpp("");
    setPress("");
    setJobId("");
    setStatus("");
    setVideoUrl("");
    setMessage("");
  };

  const loadCatalog = async (jwt) => {
    const res = await fetch(`${API_BASE}/catalog`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) throw new Error("Failed to load catalog");
    const data = await res.json();
    setCatalog(data);

    const ownArr = data.own || [];
    setOwnList(ownArr);

    const defaultOwn = ownArr[0] || "";
    setOwn(defaultOwn);

    const oppArr = data.opp_by_own?.[defaultOwn] || [];
    setOppList(oppArr);

    const defaultOpp = oppArr[0] || "";
    setOpp(defaultOpp);

    const key = `${defaultOwn}|${defaultOpp}`;
    const pressArr = data.press_by_pair?.[key] || [];
    setPressList(pressArr);

    const defaultPress = pressArr[0] || "";
    setPress(defaultPress);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");

    try {
      const body = new URLSearchParams();
      body.append("username", username);
      body.append("password", password);

      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!res.ok) {
        setLoginError("Invalid credentials");
        return;
      }

      const data = await res.json();
      const jwt = data.access_token;
      localStorage.setItem("token", jwt);
      setToken(jwt);

      await loadCatalog(jwt);
    } catch (err) {
      setLoginError("Network error");
    }
  };

  // On mount: if token exists, load catalog
  useEffect(() => {
    if (!token) return;
    loadCatalog(token).catch(() => {
      // token inválido o backend no responde
      logout();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When own changes -> update oppList and pressList (keep selection if still valid)
  useEffect(() => {
    if (!catalog || !own) return;

    const nextOppList = catalog.opp_by_own?.[own] || [];
    setOppList(nextOppList);

    const nextOpp = nextOppList.includes(opp) ? opp : (nextOppList[0] || "");
    if (nextOpp !== opp) setOpp(nextOpp);

    const key = `${own}|${nextOpp}`;
    const nextPressList = catalog.press_by_pair?.[key] || [];
    setPressList(nextPressList);

    const nextPress = nextPressList.includes(press) ? press : (nextPressList[0] || "");
    if (nextPress !== press) setPress(nextPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, catalog]);

  // When opp changes -> update pressList
  useEffect(() => {
    if (!catalog || !own || !opp) return;

    const key = `${own}|${opp}`;
    const nextPressList = catalog.press_by_pair?.[key] || [];
    setPressList(nextPressList);

    const nextPress = nextPressList.includes(press) ? press : (nextPressList[0] || "");
    if (nextPress !== press) setPress(nextPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opp, own, catalog]);

  const canGenerate = Boolean(isAuthed && own && opp && press);

  const handleGenerate = async () => {
    setMessage("");
    setVideoUrl("");
    setStatus("");
    setJobId("");

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ own, opp, press }),
      });

      if (!res.ok) {
        setMessage("Generate failed.");
        return;
      }

      const data = await res.json();
      setJobId(data.job_id);
      setStatus("queued");
    } catch {
      setMessage("Network error.");
    }
  };

  // Poll status
  useEffect(() => {
    if (!jobId || !token) return;

    let cancelled = false;
    let intervalId = null;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        if (cancelled) return;

        setStatus(data.status);

        if (data.status === "done") {
          // video_url comes as relative path
          const full = data.video_url.startsWith("http")
            ? data.video_url
            : `${API_BASE}${data.video_url}`;
          setVideoUrl(full);
          clearInterval(intervalId);
        }

        if (data.status === "no_sequence") {
          setMessage("No video exists for this combination.");
          clearInterval(intervalId);
        }
      } catch {
        // ignore transient
      }
    };

    poll();
    intervalId = setInterval(poll, 1200);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, token]);

  // UI
  if (!isAuthed) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>ProAnalyst Labs</h1>
          <p style={styles.subtitle}>MVP · Tactical Video Server</p>

          <form onSubmit={handleLogin} style={{ marginTop: 18 }}>
            <div style={styles.row}>
              <label style={styles.label}>User</label>
              <input
                style={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div style={styles.row}>
              <label style={styles.label}>Password</label>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {loginError ? <div style={styles.error}>{loginError}</div> : null}

            <button style={styles.button} type="submit">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.title}>ProAnalyst Labs</div>
          <div style={styles.subtitle}>MVP · Tactical Video Server</div>
        </div>
        <button onClick={logout} style={styles.logout}>
          Logout
        </button>
      </div>

      <div style={styles.cardWide}>
        <div style={styles.controls}>
          <div style={styles.control}>
            <div style={styles.labelSmall}>Own</div>
            <select style={styles.select} value={own} onChange={(e) => setOwn(e.target.value)}>
              {ownList.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.control}>
            <div style={styles.labelSmall}>Opp</div>
            <select style={styles.select} value={opp} onChange={(e) => setOpp(e.target.value)}>
              {oppList.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.control}>
            <div style={styles.labelSmall}>Press</div>
            <select style={styles.select} value={press} onChange={(e) => setPress(e.target.value)}>
              {pressList.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <button style={{ ...styles.button, height: 42 }} onClick={handleGenerate} disabled={!canGenerate}>
            Generate
          </button>
        </div>

        <div style={styles.statusRow}>
          <div style={styles.badge}>
            <span style={{ ...styles.dot, background: status === "no_sequence" ? "#ff4d4f" : "#4cd964" }} />
            Status: <b style={{ marginLeft: 6 }}>{status || "ready"}</b>
          </div>
          {jobId ? <div style={styles.badge}>Job: {jobId}</div> : null}
        </div>

        {message ? <div style={styles.message}>{message}</div> : null}

        <div style={styles.grid}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Player</div>
            {videoUrl ? (
              <video key={videoUrl} src={videoUrl} controls style={styles.video} />
            ) : (
              <div style={styles.placeholder}>Select a combination and click <b>Generate</b>.</div>
            )}
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Demo Mode</div>
            <div style={styles.panelText}>
              This is already presentable: login + catalog + player.
              <br />
              The next step is to publish it with a public HTTPS URL.
            </div>
            <div style={styles.badge}>
              <span style={{ ...styles.dot, background: "#4cd964" }} /> Ready to deploy
            </div>
            <div style={styles.panelText}>
              Whenever you want, we can do:
              <ul>
                <li>Backend on a server</li>
                <li>Frontend on a domain</li>
                <li>Optional PWA (installable)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick inline styling (simple MVP)
const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0b0f14 0%, #0f1720 60%, #101a24 100%)",
    color: "white",
    padding: 24,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { fontSize: 26, fontWeight: 800, letterSpacing: 0.2 },
  subtitle: { opacity: 0.8, marginTop: 6 },
  card: {
    maxWidth: 520,
    margin: "80px auto",
    padding: 22,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(10px)",
  },
  cardWide: {
    maxWidth: 1120,
    margin: "0 auto",
    padding: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(10px)",
  },
  row: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 12, alignItems: "center" },
  label: { opacity: 0.85 },
  labelSmall: { opacity: 0.8, fontSize: 12, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    outline: "none",
  },
  button: {
    width: "100%",
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    opacity: 1,
  },
  logout: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    cursor: "pointer",
  },
  error: { marginTop: 10, color: "#ff6b6b" },
  controls: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 140px",
    gap: 12,
    alignItems: "end",
  },
  control: {},
  statusRow: { display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.10)",
    fontSize: 13,
  },
  dot: { width: 8, height: 8, borderRadius: 99, display: "inline-block" },
  message: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255, 77, 79, 0.12)",
    border: "1px solid rgba(255, 77, 79, 0.25)",
  },
  grid: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginTop: 14 },
  panel: {
    borderRadius: 16,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.20)",
    minHeight: 260,
  },
  panelTitle: { fontWeight: 800, marginBottom: 10 },
  panelText: { opacity: 0.9, lineHeight: 1.5, fontSize: 13 },
  placeholder: {
    borderRadius: 14,
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.15)",
    height: 220,
    display: "grid",
    placeItems: "center",
    opacity: 0.9,
  },
  video: { width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)" },
};

