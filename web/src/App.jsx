import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

export default function App() {
  // -------------------------
  // AUTH
  // -------------------------
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // -------------------------
  // APP STATE
  // -------------------------
  const [options, setOptions] = useState({ own: [], opp: [], press: [] });
  const [own, setOwn] = useState("");
  const [opp, setOpp] = useState("");
  const [press, setPress] = useState("");

  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken("");
    setLoginError("");
    setMessage("");
    setStatus("");
    setJobId("");
    setVideoUrl("");
  }, []);

  const statusDot = (s) => {
    if (s === "done") return "ok";
    if (s === "processing") return "warn";
    if (s === "no_sequence") return "danger";
    if (s === "not_found") return "danger";
    return "";
  };

  const doLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("username", username);
      body.append("password", password);

      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        const txt = await res.text();
        setLoginError(`Login fallido (${res.status}). ${txt}`);
        setLoginLoading(false);
        return;
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      setToken(data.access_token);

      // reset UI
      setMessage("");
      setStatus("");
      setJobId("");
      setVideoUrl("");
      setLoginLoading(false);
    } catch (err) {
      setLoginError(`Error de red: ${String(err)}`);
      setLoginLoading(false);
    }
  };

  // -------------------------
  // LOAD OPTIONS
  // -------------------------
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch(`${API_BASE}/options`, { headers: authHeaders });
        if (res.status === 401) {
          logout();
          return;
        }
        if (!res.ok) {
          setMessage(`Error cargando opciones (${res.status}).`);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        setOptions(data);

        const dOwn = data.own?.[0] || "";
        const dOpp = data.opp?.[0] || "";
        const dPress = data.press?.[0] || "";
        setOwn(dOwn);
        setOpp(dOpp);
        setPress(dPress);
      } catch {
        if (!cancelled) setMessage("No se pudieron cargar las opciones.");
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, authHeaders, logout]);

  // -------------------------
  // GENERATE
  // -------------------------
  const generate = useCallback(async () => {
    setMessage("");
    setVideoUrl("");
    setStatus("processing");
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

      if (res.status === 401) {
        logout();
        return;
      }

      if (!res.ok) {
        const txt = await res.text();
        setStatus("");
        setMessage(`Error generando (${res.status}). ${txt}`);
        return;
      }

      const data = await res.json();
      setJobId(data.job_id);
    } catch {
      setStatus("");
      setMessage("Error de red generando el vídeo.");
    }
  }, [authHeaders, own, opp, press, logout]);

  // -------------------------
  // POLL STATUS
  // -------------------------
  useEffect(() => {
    if (!token) return;
    if (!jobId) return;

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`, { headers: authHeaders });
        if (res.status === 401) {
          logout();
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setMessage(`Error consultando estado (${res.status}).`);
            setStatus("");
          }
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        const s = data.status || "";
        setStatus(s);

        if (s === "done" && data.video_url) {
          const t = localStorage.getItem("token") || "";
          setVideoUrl(`${API_BASE}${data.video_url}?token=${encodeURIComponent(t)}`);
          setMessage("");
          return;
        }

        if (s === "no_sequence") {
          setVideoUrl("");
          setMessage("No existe vídeo para esta combinación.");
          return;
        }

        if (s === "not_found") {
          setVideoUrl("");
          setMessage("Job no encontrado. Vuelve a generar.");
          return;
        }

        // cualquier otro estado => seguimos consultando
        timer = window.setTimeout(poll, 550);
      } catch {
        if (!cancelled) {
          setMessage("Error consultando estado.");
          setStatus("");
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, token, authHeaders, logout]);

  // -------------------------
  // LOGIN UI
  // -------------------------
  if (!token) {
    return (
      <div className="loginWrap">
        <div className="card loginCard">
          <div className="loginTitle">
            <h2>ProAnalyst Labs</h2>
            <span className="small">MVP</span>
          </div>

          <p className="small" style={{ marginTop: 0 }}>
            Acceso seguro (demo).
          </p>

          <form onSubmit={doLogin} style={{ display: "grid", gap: 12 }}>
            <label className="label">
              <span>Usuario</span>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="label">
              <span>Contraseña</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {loginError ? <div className="alert alertDanger">{loginError}</div> : null}

            <button className="btn btnPrimary" type="submit" disabled={loginLoading}>
              {loginLoading ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span className="spinner" /> Entrando…
                </span>
              ) : (
                "Entrar"
              )}
            </button>

            <div className="small">
              (Demo) user: <b>admin</b> · pass: <b>admin123</b>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------
  // MAIN UI
  // -------------------------
  const generating = status === "processing";

  return (
    <div className="wrap">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <h1>ProAnalyst Labs</h1>
            <p>MVP · Tactical Video Server</p>
          </div>

          <button className="btn" onClick={logout}>
            Salir
          </button>
        </div>

        <div className="card">
          <div className="cardInner">
            <div className="grid">
              <label className="label">
                <span>Own</span>
                <select
                  value={own}
                  onChange={(e) => setOwn(e.target.value)}
                  disabled={loadingOptions || generating}
                >
                  {options.own.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                <span>Opp</span>
                <select
                  value={opp}
                  onChange={(e) => setOpp(e.target.value)}
                  disabled={loadingOptions || generating}
                >
                  {options.opp.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                <span>Press</span>
                <select
                  value={press}
                  onChange={(e) => setPress(e.target.value)}
                  disabled={loadingOptions || generating}
                >
                  {options.press.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="btn btnPrimary"
                onClick={generate}
                disabled={loadingOptions || generating || !own || !opp || !press}
              >
                {loadingOptions ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span className="spinner" /> Cargando…
                  </span>
                ) : generating ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span className="spinner" /> Generando…
                  </span>
                ) : (
                  "Generar"
                )}
              </button>
            </div>

            <div className="metaRow">
              <div className="badge">
                <span className={`dot ${statusDot(status)}`} />
                Estado: <b style={{ color: "white" }}>{status || "idle"}</b>
              </div>

              {jobId ? (
                <div className="badge">
                  Job:{" "}
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {jobId}
                  </span>
                </div>
              ) : null}
            </div>

            {message ? <div className="alert">{message}</div> : null}
          </div>
        </div>

        <div className="split">
          <div className="card">
            <div className="player">
              <div className="playerHeader">
                <div className="hint">Reproductor</div>
                <div className="small">Vídeo protegido por login</div>
              </div>

              {videoUrl ? (
                <video className="video" key={videoUrl} src={videoUrl} controls />
              ) : (
                <div className="placeholder">
                  Selecciona una combinación y pulsa <b>Generar</b>.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="cardInner">
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Modo Demo</div>
                <div className="small">
                  Esto ya es presentable: login + catálogo + reproductor.
                  <br />
                  El siguiente paso es ponerlo en URL pública con HTTPS.
                </div>

                <div className="badge">
                  <span className="dot ok" />
                  Ready to deploy
                </div>

                <div className="small">
                  Cuando quieras, hacemos:
                  <br />• Backend en servidor
                  <br />• Frontend en dominio
                  <br />• PWA (instalable) opcional
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
