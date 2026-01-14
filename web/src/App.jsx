// web/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL;
const DEBUG = import.meta.env.DEV;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const isAuthed = Boolean(token);

  // login
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

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

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
    setLoginError("");
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
    setMessage("");

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
    } catch {
      setLoginError("Network error");
    }
  };

  // On mount
  useEffect(() => {
    if (!token) return;
    loadCatalog(token).catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Own → Opp + Press
  useEffect(() => {
    if (!catalog || !own) return;

    const nextOppList = catalog.opp_by_own?.[own] || [];
    setOppList(nextOppList);

    const nextOpp = nextOppList.includes(opp) ? opp : nextOppList[0] || "";
    if (nextOpp !== opp) setOpp(nextOpp);

    const key = `${own}|${nextOpp}`;
    const nextPressList = catalog.press_by_pair?.[key] || [];
    setPressList(nextPressList);

    const nextPress = nextPressList[0] || "";
    if (nextPress !== press) setPress(nextPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, catalog]);

  // Opp → Press
  useEffect(() => {
    if (!catalog || !own || !opp) return;

    const key = `${own}|${opp}`;
    const nextPressList = catalog.press_by_pair?.[key] || [];
    setPressList(nextPressList);

    const nextPress = nextPressList[0] || "";
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
        setMessage("Generation failed.");
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
          const full = data.video_url.startsWith("http")
            ? data.video_url
            : `${API_BASE}${data.video_url}`;
          setVideoUrl(full);
          clearInterval(intervalId);
        }

        if (data.status === "no_sequence") {
          setMessage("This combination isn’t available yet.");
          clearInterval(intervalId);
        }
      } catch {}
    };

    poll();
    intervalId = setInterval(poll, 1200);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, token]);

  const showSpinner = status === "queued" || status === "processing";

  // ---------- LOGIN ----------
  if (!isAuthed) {
    return (
      <div className="loginWrap">
        <div className="card loginCard">
          <div className="loginTitle">
            <div className="loginTitleLeft">
              <img
                src="/logo-proanalyst.png"
                alt="ProAnalyst Labs"
                className="logo"
              />
              <div>
                <h2>ProAnalyst Labs</h2>
                <span className="small">MVP</span>
              </div>
            </div>
          </div>

          <p className="small">Tactical Video Server · Secure Login</p>

          {/* ✅ Demo credentials (smaller + centered + cleaner) */}
          <div
            className="alert"
            style={{
              marginTop: 12,
              textAlign: "center",
              fontSize: 12,
              lineHeight: 1.35,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.95 }}>
              Demo access
            </div>

            <div style={{ opacity: 0.85 }}>
              <span style={{ fontWeight: 600 }}>User</span>{" "}
              <span
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                admin
              </span>
              <span style={{ opacity: 0.6 }}> · </span>
              <span style={{ fontWeight: 600 }}>Pass</span>{" "}
              <span
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                admin123
              </span>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ marginTop: 14 }}>
            <label className="label">
              <span>User</span>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>

            <div style={{ height: 12 }} />

            <label className="label">
              <span>Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {loginError ? (
              <div className="alert alertDanger" style={{ marginTop: 12 }}>
                {loginError}
              </div>
            ) : null}

            <button
              className="btn btnPrimary"
              style={{ width: "100%", marginTop: 12 }}
              type="submit"
            >
              Login
            </button>

            <div className="brandMeta">
              <div className="brandHandle">@proanalyst_labs</div>
              <div className="brandAddress">
                312 West Madison Street · Chicago, IL
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ---------- APP ----------
  return (
    <div className="wrap">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <img
              src="/logo-proanalyst.png"
              alt="ProAnalyst Labs"
              className="logo"
            />
            <div className="brandText">
              <div className="title">ProAnalyst Labs</div>
              <div className="subtitle">MVP · Tactical Video Generator</div>
            </div>
          </div>

          <button onClick={logout} className="btn">
            Logout
          </button>
        </div>

        <div className="card">
          <div className="cardInner">
            <div className="grid">
              <label className="label">
                <span>Our shape</span>
                <select value={own} onChange={(e) => setOwn(e.target.value)}>
                  {ownList.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                <span>Opponent shape</span>
                <select value={opp} onChange={(e) => setOpp(e.target.value)}>
                  {oppList.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>

              {pressList.length > 1 ? (
                <label className="label">
                  <span>Variant</span>
                  <select
                    value={press}
                    onChange={(e) => setPress(e.target.value)}
                  >
                    {pressList.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div />
              )}

              <button
                className="btn btnPrimary"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {showSpinner ? (
                  <span style={{ display: "inline-flex", gap: 8 }}>
                    <span className="spinner" /> Generating
                  </span>
                ) : (
                  "Generate clip"
                )}
              </button>
            </div>

            {message ? <div className="alert alertDanger">{message}</div> : null}

            <div className="card player" style={{ marginTop: 14 }}>
              {videoUrl ? (
                <video key={videoUrl} src={videoUrl} controls className="video" />
              ) : (
                <div className="placeholder">
                  Select a matchup and click <b>Generate clip</b>.
                </div>
              )}
            </div>

            <footer className="appMeta">
              <a
                href="/ProAnalystLabs_Whitepaper.pdf"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                Download Whitepaper (PDF)
              </a>

              <span className="sep">•</span>
              <span className="brandHandle">@proanalyst_labs</span>
              <span className="sep">•</span>
              <span className="brandAddress">
                312 West Madison Street · Chicago, IL
              </span>
            </footer>

            {DEBUG ? (
              <div className="small" style={{ opacity: 0.6, marginTop: 12 }}>
                DEBUG · status: {status || "idle"} · job: {jobId || "-"} · api:{" "}
                {String(API_BASE || "")}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
