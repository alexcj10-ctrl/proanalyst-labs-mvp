import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { t, phaseLabel } from "./i18n/index.js";

import { findScenario, scenarioVideoUrl } from "./catalog";
import { serverRequest, recordEvent } from "./services/server";
import AdminPanel from "./components/AdminPanel.jsx";
const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE_URL || "";
const WHITEPAPER_URL = "/ProAnalystLabs_Whitepaper.pdf";
const INTRO_VIDEO_URL = "/intro.mp4";
const STORAGE_HISTORY = "proanalyst_history_v11";
const STORAGE_FAVORITES = "proanalyst_favorites_v11";
const PUBLIC_SITE_URL = "https://proanalyst-labs-mvp.vercel.app";

const PHASE_DESCRIPTIONS = {
  build_up: t("Create the conditions to escape the first pressure with control."),
  progression: t("Advance through or around the opponent's intermediate block."),
  creation: t("Create advantages around the final line before the decisive action."),
  finishing: t("Coordinate arrivals and occupation of the final third."),
  defensive_org: t("Organise distances, cover and pressure when defending the block."),
  transition: t("React and reorganise immediately after possession changes."),
};

const FORMATION_LINES = {
  "3-4-2-1": [1, 3, 4, 2, 1],
  "3-4-3": [1, 3, 4, 3],
  "3-5-2": [1, 3, 5, 2],
  "4-1-4-1": [1, 4, 1, 4, 1],
  "4-2-3-1": [1, 4, 2, 3, 1],
  "4-3-3": [1, 4, 3, 3],
  "4-4-2": [1, 4, 4, 2],
  "5-4-1": [1, 5, 4, 1],
};

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed.filter((item) => item != null) : fallback;
  } catch {
    return fallback;
  }
}

function FormationPitch({ formation, compact = false }) {
  const lines = FORMATION_LINES[formation] || [1, ...formation.split("-").map(Number)];
  return (
    <div className={`miniPitch ${compact ? "miniPitchCompact" : ""}`} aria-hidden="true">
      <div className="pitchHalfLine" />
      <div className="pitchCircle" />
      {lines.map((count, lineIndex) => (
        <div className="formationLine" key={`${formation}-${lineIndex}`}>
          {Array.from({ length: count }).map((_, dotIndex) => (
            <span className="playerDot" key={`${lineIndex}-${dotIndex}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FormationPicker({ label, value, formations, onChange, accent }) {
  return (
    <section className="selectorPanel">
      <div className="sectionEyebrow">{label}</div>
      <div className="formationGrid">
        {formations.map((formation) => (
          <button
            key={formation}
            type="button"
            className={`formationCard ${value === formation ? "active" : ""} ${accent || ""}`}
            onClick={() => onChange(formation)}
            aria-pressed={value === formation}
          >
            <FormationPitch formation={formation} compact />
            <span>{formation}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SolutionSummary({ solution, selected, onClick }) {
  return (
    <button
      type="button"
      className={`solutionChoice ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="solutionChoiceTop">
        <span className="solutionBadge">{solution.label}</span>
        <span className="riskBadge">{t("Risk ·")} {solution.profile?.risk}</span>
      </div>
      <strong>{solution.title}</strong>
      <p>{solution.objective}</p>
      <div className="solutionMetrics">
        <span>{t("Verticality ·")} {solution.profile?.verticality}</span>
        <span>{t("Tempo ·")} {solution.profile?.tempo}</span>
      </div>
    </button>
  );
}

function InfoList({ title, items, numbered = false }) {
  if (!items?.length) return null;
  const Tag = numbered ? "ol" : "ul";
  return (
    <div className="infoBlock">
      <h4>{title}</h4>
      <Tag>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Tag>
    </div>
  );
}

function TacticalDetail({ solution }) {
  if (!solution) return null;
  return (
    <div className="tacticalDetail">
      <div className="detailHeader">
        <div>
          <div className="sectionEyebrow">{t("Tactical solution")}</div>
          <h2>{solution.title}</h2>
          <p>{solution.objective}</p>
        </div>
        <div className="metricStack">
          <span><small>{t("Risk")}</small>{solution.profile?.risk}</span>
          <span><small>{t("Verticality")}</small>{solution.profile?.verticality}</span>
          <span><small>{t("Tempo")}</small>{solution.profile?.tempo}</span>
        </div>
      </div>

      <div className="principleChips">
        {solution.principles?.map((principle) => (
          <span key={principle}>{principle}</span>
        ))}
      </div>

      <div className="detailGrid">
        <InfoList title={t("Key actions")} items={solution.key_actions} numbered />
        <InfoList title={t("Coaching points")} items={solution.coaching_points} />
        <InfoList title={t("Risk notes")} items={solution.risk_notes} />
      </div>
    </div>
  );
}

function EmptyState({ title, children }) {
  return (
    <div className="emptyState">
      <div className="emptyIcon">PA</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function App() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staff, setStaff] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const catalogRequest = useRef(0);
  const authRequest = useRef(0);
  const [pendingEvents, setPendingEvents] = useState({});
  const [showIntro, setShowIntro] = useState(false);

  const [view, setView] = useState("analyze");
  const [phase, setPhase] = useState("build_up");
  const [own, setOwn] = useState("4-3-3");
  const [opp, setOpp] = useState("4-2-3-1");
  const [selectedVariant, setVariant] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const [failedVideoUrl, setFailedVideoUrl] = useState("");
  const [analysisId, setAnalysisId] = useState(null);
  const currentAnalysis = catalog?.combos.find((item) => item.scenario_id === analysisId) || null;
  const currentVideoUrl = scenarioVideoUrl(currentAnalysis, MEDIA_BASE);
  const videoUrl = failedVideoUrl === currentVideoUrl ? "" : currentVideoUrl;
  const setCurrentAnalysis = (solution) => setAnalysisId(solution?.scenario_id || null);
  const [message, setMessage] = useState("");

  const [requestNote, setRequestNote] = useState("");
  const [requestState, setRequestState] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackState, setFeedbackState] = useState("");

  const [history, setHistory] = useState(() => readStoredJson(STORAGE_HISTORY, []));
  const [favorites, setFavorites] = useState(() => readStoredJson(STORAGE_FAVORITES, []));
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryPhase, setLibraryPhase] = useState("all");
  const isPreviewHost = /^proanalyst-labs-.+\.vercel\.app$/.test(window.location.hostname) &&
    window.location.hostname !== "proanalyst-labs-mvp.vercel.app";

  const refreshCatalog = useCallback(async () => {
    const request = ++catalogRequest.current;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const next = await serverRequest("catalog");
      if (!Array.isArray(next.combos) || !Array.isArray(next.formations) || !Array.isArray(next.phase_roadmap)) throw new Error(t("Catalog unavailable"));
      if (request === catalogRequest.current) setCatalog(next);
    } catch (error) {
      if (request === catalogRequest.current) {
        // Do not fall back to bundled or cached scenarios: they may have been unpublished.
        setCatalog(null);
        setCatalogError(error.message);
      }
    } finally {
      if (request === catalogRequest.current) setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      const request = authRequest.current;
      try {
        const session = await serverRequest("session");
        if (!active || request !== authRequest.current) return;
        if (session.role === "admin" && session.admin === true) {
          setStaff(true);
          setIsAuthed(true);
        } else {
          setStaff(false);
          setView((previous) => previous === "admin" ? "analyze" : previous);
        }
      } catch {
        if (active && request === authRequest.current) {
          setStaff(false);
          setView((previous) => previous === "admin" ? "analyze" : previous);
        }
      }
    };
    const refresh = () => { void refreshCatalog(); void restoreSession(); };
    const expire = () => {
      setStaff(false);
      setView("analyze");
      setMessage(t("Administrator session expired"));
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("proanalyst-session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("proanalyst-session-expired", expire);
    };
  }, [refreshCatalog]);

  const resetResult = () => {
    setCurrentAnalysis(null);
    setFailedVideoUrl("");
    setMessage("");
    setRequestState("");
    setFeedbackState("");
    setFeedbackNote("");
  };

  const changeMatchup = (setter, value) => {
    setter(value);
    setVariant("");
    setCompareOpen(false);
    resetResult();
  };

  const logout = async () => {
    authRequest.current++;
    setShowPassword(false);
    setPassword("");
    if (staff) {
      try { await serverRequest("logout", {}); }
      catch (error) { setMessage(error.message); return; }
    }
    setStaff(false);
    setIsAuthed(false);
    setShowIntro(false);
    setView("analyze");
    resetResult();
  };

  const handleDemoLogin = () => {
    setIsAuthed(true);
    try {
      if (!sessionStorage.getItem("proanalyst_intro_seen")) setShowIntro(true);
    } catch { setShowIntro(true); }
  };

  const closeIntro = () => {
    try { sessionStorage.setItem("proanalyst_intro_seen", "1"); } catch { /* Session storage may be disabled. */ }
    setShowIntro(false);
  };

  const availableSolutions = useMemo(() => {
    if (!catalog) return [];
    return catalog.combos.filter(
      (combo) => combo.phase === phase && combo.own === own && combo.opp === opp
    );
  }, [catalog, phase, own, opp]);

  const variant = availableSolutions.some((item) => item.variant === selectedVariant)
    ? selectedVariant : availableSolutions[0]?.variant || "";

  const saveHistory = (solution) => {
    const entry = {
      scenario_id: solution.scenario_id,
      phase: solution.phase,
      phase_label: solution.phase_label,
      own: solution.own,
      opp: solution.opp,
      variant: solution.variant,
      label: solution.label,
      title: solution.title,
      objective: solution.objective,
      created_at: new Date().toISOString(),
    };
    setHistory((prev) => {
      const next = [entry, ...prev.filter((item) => item.scenario_id !== entry.scenario_id)].slice(0, 24);
      try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(next)); } catch { /* Keep in-memory history when storage is unavailable. */ }
      return next;
    });
  };

  const showScenario = (solution) => {
    resetResult();
    if (!solution) {
      setMessage(t("This scenario is not available in the deterministic catalog yet."));
      return;
    }
    setVariant(solution.variant);
    setCurrentAnalysis(solution);
    saveHistory(solution);
  };

  const handleAnalyze = (requestedVariant = variant) => {
    showScenario(findScenario(phase, own, opp, requestedVariant, catalog));
  };

  const submitEvent = async (action, body, setter) => {
    const fingerprint = JSON.stringify(body);
    const key = pendingEvents[fingerprint] || crypto.randomUUID();
    setPendingEvents((prev) => ({ ...prev, [fingerprint]: key }));
    setter("sending");
    try {
      await recordEvent(action, body, key);
      setter("recorded");
    } catch (error) { setter(error.message); }
  };
  const requestScenario = () => submitEvent("scenario-requests", { phase, own, opp, note: requestNote }, setRequestState);
  const sendFeedback = (useful) => submitEvent("feedback", { scenario_id: currentAnalysis.scenario_id, useful, note: feedbackNote }, setFeedbackState);

  const staffLogin = async (event) => {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    setShowPassword(false);
    authRequest.current++;
    try {
      const result = await serverRequest("login", { username: username.trim(), password });
      if (result.role !== "admin" || result.admin !== true) throw new Error(t("Staff access was not confirmed."));
      setPassword(""); setStaff(true); handleDemoLogin();
    } catch (error) { setAuthError(error.message); }
    finally { setAuthBusy(false); }
  };

  const toggleFavorite = (scenarioId) => {
    setFavorites((prev) => {
      const next = prev.includes(scenarioId)
        ? prev.filter((id) => id !== scenarioId)
        : [...prev, scenarioId];
      try { localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(next)); } catch { /* Keep in-memory favorites when storage is unavailable. */ }
      return next;
    });
  };

  const openScenario = (item) => {
    setPhase(item.phase);
    setOwn(item.own);
    setOpp(item.opp);
    setVariant(item.variant);
    setView("analyze");
    setCompareOpen(false);
    showScenario(catalog?.combos.find((scenario) => scenario.scenario_id === item.scenario_id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const libraryItems = useMemo(() => {
    if (!catalog) return [];
    const query = librarySearch.trim().toLowerCase();
    return catalog.combos.filter((item) => {
      const phaseMatch = libraryPhase === "all" || item.phase === libraryPhase;
      const text = `${item.own} ${item.opp} ${item.title} ${item.objective} ${item.principles?.join(" ")}`.toLowerCase();
      return phaseMatch && (!query || text.includes(query));
    });
  }, [catalog, libraryPhase, librarySearch]);

  if (!isAuthed) {
    return (
      <main className="loginPage">
        <section className="loginHero">
          <div className="loginBrand">
            <img src="/logo-proanalyst.png" alt="ProAnalyst Labs" />
            <span>PROANALYST LABS</span>
          </div>
          <div className="heroCopy">
            <div className="heroKicker">{t("TACTICAL INTELLIGENCE PLATFORM")}</div>
            <h1>{t("Turn a tactical problem into a clear coaching solution.")}</h1>
            <p>
              {t("Explore deterministic 3D scenarios, tactical principles and coaching points in one professional workspace.")}
            </p>
            <div className="heroStats">
              <div><strong>{catalog ? catalog.combos.length : "—"}</strong><span>{t("3D scenarios")}</span></div>
              <div><strong>{catalog ? catalog.phase_roadmap.filter((item) => item.available).length : "—"}</strong><span>{t("active phases")}</span></div>
              <div><strong>1</strong><span>{t("decision workflow")}</span></div>
            </div>
          </div>
        </section>

        <section className="loginPanel">
          <div className="loginPanelInner">
            <div className="versionPill">ProAnalyst v1.1</div>
            <h2>{t("Explore the platform")}</h2>
            <p className="muted">{t("No credentials required for the public demo.")}</p>
            <button className="primaryButton large" type="button" onClick={handleDemoLogin}>
              {t("Enter Demo")}
              <span>→</span>
            </button>

            <button className="textButton" type="button" onClick={() => { setStaffOpen((prev) => !prev); setShowPassword(false); }}>
              {staffOpen ? t("Hide staff access") : t("Staff access")}
            </button>

            {staffOpen && (
              <form className="staffForm" onSubmit={staffLogin}>
                {isPreviewHost && <p className="staffPreviewNotice">{t("This is a verification address. Use the public site for your usual sign-in.")} <a href={PUBLIC_SITE_URL}>{t("Open the public site")}</a></p>}
                <label>{t("User")}<input name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
                <div className="staffPasswordField">
                  <label htmlFor="administrator-password">{t("Password")}</label>
                  <div className="staffPasswordControl">
                    <input id="administrator-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
                    <button className="secondaryButton" type="button" aria-pressed={showPassword} aria-controls="administrator-password" disabled={authBusy} onClick={() => setShowPassword((previous) => !previous)}>{showPassword ? t("Hide password") : t("Show password")}</button>
                  </div>
                </div>
                <button className="secondaryButton" disabled={authBusy}>{authBusy ? t("Signing in…") : t("Sign in")}</button>
                {authError && <p role="alert">{authError}</p>}
              </form>
            )}

            <div className="loginFoot">{t("Public deterministic demo · No login required")}</div>
          </div>
        </section>
      </main>
    );
  }

  if (showIntro) {
    return (
      <main className="introScreen">
        <video
          src={INTRO_VIDEO_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(event) => {
            try { event.currentTarget.currentTime = 0.5; } catch { /* no-op */ }
          }}
          onEnded={closeIntro}
          onError={closeIntro}
        />
        <button className="introSkip" type="button" onClick={closeIntro}>{t("Skip intro")}</button>
      </main>
    );
  }

  const formations = catalog?.formations || Object.keys(FORMATION_LINES);
  const phaseRoadmap = catalog?.phase_roadmap || [];


  return (
    <div className="appFrame">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <img src="/logo-proanalyst.png" alt="" />
          <div><strong>ProAnalyst</strong><span>Labs</span></div>
        </div>

        <nav className="sideNav" aria-label={t("Main navigation")}>
          <button className={view === "analyze" ? "active" : ""} onClick={() => setView("analyze")}>
            <span className="navIcon">⌁</span><span>{t("Tactical Analysis")}</span>
          </button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>
            <span className="navIcon">▦</span><span>{t("Video Library")}</span>
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <span className="navIcon">↺</span><span>{t("My Analyses")}</span>
          </button>
          <button className={view === "methodology" ? "active" : ""} onClick={() => setView("methodology")}>
            <span className="navIcon">◇</span><span>{t("Club Methodology")}</span>
          </button>
          {staff && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}><span className="navIcon">⚙</span><span>{t("Administrator panel")}</span></button>}
        </nav>

        <div className="sidebarGrow" />
        <div className={`roleBadge ${staff ? "roleAdmin" : ""}`}>{staff ? t("Administrator") : t("Public user")}</div>
        <div className="developmentCard">
          <span className="statusDot" />
          <div><strong>{t("Motor IA v1")}</strong><span>{t("Architecture ready · next layer")}</span></div>
        </div>
        <a className="sidebarLink" href={WHITEPAPER_URL} target="_blank" rel="noreferrer">{t("Whitepaper ↗")}</a>
        <button className="sidebarLogout" type="button" onClick={logout}>{t("Logout")}</button>
      </aside>

      <div className="mobileBar">
        <div className="sidebarBrand"><img src="/logo-proanalyst.png" alt="" /><strong>ProAnalyst Labs</strong></div>
        <select value={view} onChange={(e) => setView(e.target.value)} aria-label={t("Section")}>
          <option value="analyze">{t("Tactical Analysis")}</option>
          <option value="library">{t("Video Library")}</option>
          <option value="history">{t("My Analyses")}</option>
          <option value="methodology">{t("Club Methodology")}</option>
          {staff && <option value="admin">{t("Administrator panel")}</option>}
        </select>
        <button className="textButton mobileLogout" type="button" onClick={logout}>{t("Logout")}</button>
      </div>

      <main className="mainWorkspace">
        {!catalog && view !== "admin" && view !== "methodology" && <section className="catalogNotice" aria-live="polite">
          <h2>{catalogLoading ? t("Loading catalog") : t("Catalog unavailable")}</h2>
          {catalogError && <p role="alert">{catalogError}</p>}
          {!catalogLoading && <button type="button" className="secondaryButton" onClick={refreshCatalog}>{t("Retry catalog")}</button>}
        </section>}
        {view === "analyze" && catalog && (
          <>
            <header className="workspaceHeader">
              <div>
                <div className="sectionEyebrow">{t("DECISION WORKSPACE")}</div>
                <h1>{t("Tactical Analysis")}</h1>
                <p>{t("Start from the football problem. ProAnalyst connects the scenario to the available tactical solution.")}</p>
              </div>
              <div className="catalogCounter"><strong>{catalog?.combos?.length || 0}</strong><span>{t("validated video scenarios")}</span></div>
            </header>

            <section className="workspaceSection">
              <div className="sectionTitleRow">
                <div><span>01</span><h2>{t("Choose the game phase")}</h2></div>
                <p>{t("Only phases with validated content are active today.")}</p>
              </div>
              <div className="phaseGrid">
                {phaseRoadmap.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`phaseCard ${phase === item.id ? "active" : ""} ${!item.available ? "locked" : ""}`}
                    disabled={!item.available}
                    onClick={() => changeMatchup(setPhase, item.id)}
                  >
                    <div className="phaseTop"><span>{item.label}</span>{!item.available && <small>{t("Coming soon")}</small>}</div>
                    <p>{PHASE_DESCRIPTIONS[item.id]}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="workspaceSection">
              <div className="sectionTitleRow">
                <div><span>02</span><h2>{t("Define the matchup")}</h2></div>
                <p>{t("Choose the structures exactly as the staff sees them on the pitch.")}</p>
              </div>
              <div className="matchupGrid">
                <FormationPicker label={t("Our shape")} value={own} formations={formations} onChange={(value) => changeMatchup(setOwn, value)} accent="ownAccent" />
                <div className="versusMark"><span>{t("VS")}</span></div>
                <FormationPicker label={t("Opponent shape")} value={opp} formations={formations} onChange={(value) => changeMatchup(setOpp, value)} accent="oppAccent" />
              </div>
            </section>

            <section className="workspaceSection">
              <div className="sectionTitleRow">
                <div><span>03</span><h2>{t("Choose the tactical solution")}</h2></div>
                <p>{phaseLabel(phase)} · {own} {t("vs")} {opp}</p>
              </div>

              {availableSolutions.length ? (
                <>
                  <div className="solutionsGrid">
                    {availableSolutions.map((solution) => (
                      <SolutionSummary
                        key={solution.scenario_id}
                        solution={solution}
                        selected={solution.variant === variant}
                        onClick={() => {
                          setVariant(solution.variant);
                          setCurrentAnalysis(null);
                          setFailedVideoUrl("");
                          setMessage("");
                        }}
                      />
                    ))}
                  </div>
                  <div className="actionRow">
                    <button
                      className="primaryButton"
                      type="button"
                      onClick={() => handleAnalyze(variant)}
                      disabled={!variant}
                    >
                      {t("Generate")} <span>→</span>
                    </button>
                    {availableSolutions.length > 1 && (
                      <button className="secondaryButton" type="button" onClick={() => setCompareOpen((prev) => !prev)}>
                        {compareOpen ? t("Close comparison") : t("Compare solutions")}
                      </button>
                    )}
                  </div>

                  {compareOpen && (
                    <div className="comparisonPanel">
                      <div className="comparisonHeader"><span>{t("Solution comparison")}</span><small>{t("Use this before choosing what to show the staff.")}</small></div>
                      <div className="comparisonGrid">
                        {availableSolutions.map((solution) => (
                          <div className="comparisonCard" key={solution.scenario_id}>
                            <div className="solutionChoiceTop"><span className="solutionBadge">{solution.label}</span><span>{solution.profile?.risk} {t("risk")}</span></div>
                            <h3>{solution.title}</h3>
                            <p>{solution.objective}</p>
                            <InfoList title={t("Core principles")} items={solution.principles?.slice(0, 4)} />
                            <button className="textButton" type="button" onClick={() => handleAnalyze(solution.variant)}>{t("Open")} {solution.label}</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="unavailablePanel">
                  <div>
                    <span className="availabilityPill">{t("Not catalogued yet")}</span>
                    <h3>{phaseLabel(phase)} · {own} {t("vs")} {opp}</h3>
                    <p>{t("This combination is not in the deterministic catalog. Request it to help prioritise the next scenario.")}</p>
                  </div>
                  <div className="requestBox">
                    <textarea
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder={t("Optional: add the specific tactical problem (e.g. high press, goalkeeper involved, no long ball).")}
                    />
                    <button className="primaryButton" type="button" onClick={requestScenario} disabled={requestState === "sending" || requestState === "recorded"}>
                      {requestState === "sending" ? t("Saving…") : t("Request this analysis")}
                    </button>
                    {requestState && <small role="status">{requestState === "recorded" ? t("Request recorded.") : requestState === "sending" ? t("Saving…") : requestState}</small>}
                  </div>
                </div>
              )}
            </section>

            <section className="workspaceSection resultSection">
              <div className="sectionTitleRow">
                <div><span>04</span><h2>{t("Tactical result")}</h2></div>
                {currentAnalysis && (
                  <button
                    className={`favoriteButton ${favorites.includes(currentAnalysis.scenario_id) ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleFavorite(currentAnalysis.scenario_id)}
                  >
                    {favorites.includes(currentAnalysis.scenario_id) ? t("★ Saved") : t("☆ Save analysis")}
                  </button>
                )}
              </div>

              {message && <div className="errorNotice">{message}</div>}

              {currentAnalysis ? (
                <div className="resultCard">
                  <div className="videoPanel">
                    <div className="videoHeader">
                      <div><span>{currentAnalysis.phase_label}</span><strong>{currentAnalysis.own} <em>{t("vs")}</em> {currentAnalysis.opp}</strong></div>
                      <span className="solutionBadge">{currentAnalysis.label}</span>
                    </div>
                    {videoUrl ? (
                      <video key={videoUrl} src={videoUrl} controls playsInline className="analysisVideo"
                        onError={() => { setFailedVideoUrl(videoUrl); setMessage(t("The scenario video could not be loaded. Tactical information remains available.")); }} />
                    ) : (
                      <EmptyState title={t("Video not connected")}>
                        {t("This scenario is available. Its video will be playable once media hosting is connected.")}
                      </EmptyState>
                    )}
                  </div>
                  <TacticalDetail solution={currentAnalysis} />
                </div>
              ) : (
                <EmptyState title={t("Your analysis will appear here")}>
                  {t("Select a validated solution and click Generate. The video will be paired with objective, principles, key actions, risks and coaching points.")}
                </EmptyState>
              )}

              {currentAnalysis && (
                <div className="feedbackPanel">
                  <div><strong>{t("Was this solution useful?")}</strong><span>{t("Your feedback helps prioritise future tactical scenarios.")}</span></div>
                  <input value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} placeholder={t("Optional coaching note")} />
                  <div className="feedbackActions">
                    <button type="button" onClick={() => sendFeedback(true)} disabled={feedbackState === "sending" || feedbackState === "recorded"}>{t("Useful ↑")}</button>
                    <button type="button" onClick={() => sendFeedback(false)} disabled={feedbackState === "sending" || feedbackState === "recorded"}>{t("Not useful ↓")}</button>
                  </div>
                  {feedbackState && <small role="status">{feedbackState === "recorded" ? t("Feedback recorded. Thank you.") : feedbackState === "sending" ? t("Saving…") : feedbackState}</small>}
                </div>
              )}
            </section>
          </>
        )}

        {view === "library" && catalog && (
          <>
            <header className="workspaceHeader">
              <div><div className="sectionEyebrow">{t("TACTICAL KNOWLEDGE BASE")}</div><h1>{t("Video Library")}</h1><p>{t("Browse validated scenarios by phase, structure or tactical principle.")}</p></div>
              <div className="catalogCounter"><strong>{libraryItems.length}</strong><span>{t("matching solutions")}</span></div>
            </header>
            <div className="libraryToolbar">
              <input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder={t("Search formation, principle, objective…")} />
              <select value={libraryPhase} onChange={(e) => setLibraryPhase(e.target.value)}>
                <option value="all">{t("All phases")}</option>
                {catalog?.phases?.map((item) => <option key={item} value={item}>{phaseLabel(item)}</option>)}
              </select>
            </div>
            <div className="libraryGrid">
              {libraryItems.map((item) => (
                <article className="libraryCard" key={item.scenario_id}>
                  <div className="libraryVisual">
                    <FormationPitch formation={item.own} />
                    <div className="libraryVs"><span>{item.own}</span><em>{t("vs")}</em><span>{item.opp}</span></div>
                  </div>
                  <div className="libraryBody">
                    <div className="libraryMeta"><span>{item.phase_label}</span><span>{item.label}</span></div>
                    <h3>{item.title}</h3>
                    <p>{item.objective}</p>
                    <div className="principleChips smallChips">{item.principles?.slice(0, 3).map((p) => <span key={p}>{p}</span>)}</div>
                    <div className="libraryActions">
                      <button className="secondaryButton" type="button" onClick={() => openScenario(item)}>{t("Open analysis")}</button>
                      <button className={`iconButton ${favorites.includes(item.scenario_id) ? "active" : ""}`} type="button" onClick={() => toggleFavorite(item.scenario_id)} aria-label={t("Toggle favorite")}>
                        {favorites.includes(item.scenario_id) ? "★" : "☆"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!libraryItems.length && <EmptyState title={t("No matching scenarios")}>{t("Try another phase, formation or tactical keyword.")}</EmptyState>}
          </>
        )}

        {view === "history" && catalog && (
          <>
            <header className="workspaceHeader">
              <div><div className="sectionEyebrow">{t("PERSONAL WORKSPACE")}</div><h1>{t("My Analyses")}</h1><p>{t("Return to recent scenarios and keep the most useful solutions close.")}</p></div>
              <div className="catalogCounter"><strong>{favorites.length}</strong><span>{t("saved favorites")}</span></div>
            </header>

            <section className="historySection">
              <div className="sectionTitleRow"><div><span>★</span><h2>{t("Saved")}</h2></div></div>
              <div className="historyGrid">
                {catalog?.combos?.filter((item) => favorites.includes(item.scenario_id)).map((item) => (
                  <button className="historyCard" type="button" key={item.scenario_id} onClick={() => openScenario(item)}>
                    <div><span>{item.phase_label} · {item.label}</span><strong>{item.own} {t("vs")} {item.opp}</strong></div><p>{item.title}</p><em>{t("Open →")}</em>
                  </button>
                ))}
                {favorites.filter((id) => !catalog.combos.some((item) => item.scenario_id === id)).map((id) => (
                  <div className="historyCard unavailableSaved" key={id}>
                    <strong>{t("Saved scenario unavailable")}</strong>
                    <p>{t("Saved scenario preserved")}</p>
                    <button className="textButton" type="button" onClick={() => toggleFavorite(id)}>{t("Remove favorite")}</button>
                  </div>
                ))}
              </div>
              {!favorites.length && <p className="muted">{t("Save a tactical result or library item and it will appear here.")}</p>}
            </section>

            <section className="historySection">
              <div className="sectionTitleRow"><div><span>↺</span><h2>{t("Recent analyses")}</h2></div><p>{t("Stored locally on this device.")}</p></div>
              <div className="historyList">
                {history.map((stored) => {
                  const current = catalog.combos.find((scenario) => scenario.scenario_id === stored.scenario_id);
                  const item = current ? { ...stored, ...current } : { ...stored,
                    phase_label: phaseLabel(stored.phase), label: t("Saved scenario unavailable"), title: t("Saved scenario unavailable") };
                  return <button className="historyRow" type="button" key={`${item.scenario_id}-${item.created_at}`} disabled={!current} onClick={() => openScenario(item)}>
                    <span className="historyDate">{new Date(item.created_at).toLocaleDateString("it-IT")}</span>
                    <span className="historyPhase">{item.phase_label}</span>
                    <strong>{item.own} {t("vs")} {item.opp}</strong>
                    <span>{item.label}</span>
                    <em>{item.title}</em>
                    <b>→</b>
                  </button>;
                })}
              </div>
              {!history.length && <EmptyState title={t("No analyses yet")}>{t("Run your first tactical scenario and it will be remembered here.")}</EmptyState>}
            </section>
          </>
        )}

        {view === "methodology" && (
          <>
            <header className="workspaceHeader">
              <div><div className="sectionEyebrow">{t("LINE B · CLUB ENVIRONMENT")}</div><h1>{t("Club Methodology")}</h1><p>{t("A separate workspace for each club's own game model, principles and development pathway.")}</p></div>
              <div className="roadmapBadge">{t("Product roadmap")}</div>
            </header>

            <div className="methodologyHero">
              <div>
                <span className="availabilityPill">{t("Architecture direction")}</span>
                <h2>{t("ProAnalyst is the platform. The club owns the methodology.")}</h2>
                <p>{t("This area is intentionally separate from Tactical Analysis. It will organise a club's principles, age-group progression, training content and video references without imposing a universal ProAnalyst methodology.")}</p>
              </div>
              <div className="methodologyMap">
                {[t("Game Model"), t("Principles"), t("Age Groups"), t("Training Sessions"), t("Video Examples"), t("Player Development")].map((item, index) => (
                  <div key={item}><span>0{index + 1}</span><strong>{item}</strong></div>
                ))}
              </div>
            </div>

            <div className="futureGrid">
              <article><span>01</span><h3>{t("Human methodology first")}</h3><p>{t("Staff define the content and structure before generative AI is allowed to extend it.")}</p></article>
              <article><span>02</span><h3>{t("Club-specific knowledge")}</h3><p>{t("Every organisation keeps its own vocabulary, priorities, progressions and references.")}</p></article>
              <article><span>03</span><h3>{t("AI on the same structure")}</h3><p>{t("The future engine can retrieve and generate sessions or explanations without losing the club's identity.")}</p></article>
            </div>
          </>
        )}

        {view === "admin" && staff && <AdminPanel onContentChanged={refreshCatalog} onOpenAnalysis={openScenario} />}
        <footer className="appFooter">
          <span>{t("ProAnalyst Labs v1.1 · Tactical Intelligence Platform")}</span>
          <span>{t("Deterministic video layer today · Motor IA architecture next")}</span>
        </footer>
      </main>
    </div>
  );
}
