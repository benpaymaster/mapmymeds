import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  MapPin, TrendingUp, TrendingDown, Minus, Phone, Building2,
  ArrowRightLeft, Search, ShieldCheck, Navigation, ChevronDown, X,
  Bell, BellRing, Calendar, Check, Star, LocateFixed, Clock, Ban,
  Map as MapIcon, List as ListIcon, Mail, Loader2, AlertTriangle
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import MapView from "./components/MapView.jsx";

/* ============================================================================
 * API_BASE — the real, deployed backend. Change this only if you redeploy the
 * backend somewhere else; do not point this back at localhost for the live site.
 * ============================================================================ */
const API_BASE = "https://mapmymeds-backend.onrender.com";

const PERSONAL_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "live.com", "aol.com", "protonmail.com", "msn.com"];

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const DEFAULT_COORDS = { lat: 53.7965, lng: -1.5478 }; // LS1 city centre fallback

const LEVELS = ["out", "low", "medium", "high"];
const LEVEL_LABEL = { out: "Out of stock", low: "Low stock", medium: "In stock", high: "Well stocked", unreported: "Not yet reporting" };
const LEVEL_DOT = { out: "bg-rose-400", low: "bg-amber-400", medium: "bg-emerald-400", high: "bg-emerald-400", unreported: "bg-slate-600" };
const LEVEL_TEXT = { out: "text-rose-300", low: "text-amber-300", medium: "text-emerald-300", high: "text-emerald-300", unreported: "text-slate-500" };
const LEVEL_BG = { out: "bg-rose-500/10 border-rose-500/30", low: "bg-amber-500/10 border-amber-500/30", medium: "bg-emerald-500/10 border-emerald-500/30", high: "bg-emerald-500/10 border-emerald-500/30", unreported: "bg-slate-800/40 border-slate-700/60" };

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function canSeeCommercialDetail(viewerNode, targetNode) {
  if (!viewerNode || !targetNode) return false;
  if (viewerNode.chain === targetNode.chain) return true;
  return viewerNode.networkPartner || targetNode.networkPartner;
}

function findDeficitMatch(nodes, stock, medId, ownNode) {
  const eligible = nodes.filter((n) => n.id !== ownNode.id && canSeeCommercialDetail(ownNode, n));
  const out = eligible.find((n) => stock[medId]?.[n.id]?.level === "out");
  if (out) return out;
  return eligible.find((n) => stock[medId]?.[n.id]?.level === "low") || null;
}

function trendColorHex(trend) {
  return trend === "rising" ? "#34d399" : trend === "falling" ? "#fb7185" : "#94a3b8";
}

/* ============================= Small shared UI ============================= */

function Sparkline({ data, color }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="w-16 h-7">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendBadge({ trend }) {
  const map = {
    rising: { icon: TrendingUp, cls: "text-emerald-300", label: "Rising" },
    falling: { icon: TrendingDown, cls: "text-rose-300", label: "Falling" },
    steady: { icon: Minus, cls: "text-slate-400", label: "Steady" },
  };
  const { icon: Icon, cls, label } = map[trend];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      <Icon size={13} strokeWidth={2.4} />
      {label}
    </span>
  );
}

function LevelBar({ level }) {
  const filled = LEVELS.indexOf(level);
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-4 w-2 rounded-sm ${i < filled ? LEVEL_DOT[level] : "bg-slate-700"}`} />
        ))}
      </div>
      <span className={`text-xs font-medium ${LEVEL_TEXT[level]}`}>{LEVEL_LABEL[level]}</span>
    </div>
  );
}

function MedPicker({ meds, medId, setMedId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const med = meds.find((m) => m.id === medId);
  const filtered = meds.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
  if (!med) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-100 hover:border-slate-500 transition-colors"
      >
        <Search size={14} className="text-slate-400" />
        {med.name} <span className="text-slate-400 font-normal">{med.dose}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medication…"
            className="w-full px-3 py-2 text-sm bg-slate-900 text-slate-100 placeholder-slate-500 border-b border-slate-700 outline-none"
          />
          {filtered.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">No match.</p>}
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMedId(m.id); setOpen(false); setQuery(""); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-700/70 ${
                m.id === medId ? "text-emerald-300" : "text-slate-200"
              }`}
            >
              {m.name} <span className="text-slate-400 text-xs">{m.dose}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toast({ text, tone = "emerald", onClose }) {
  const tones = {
    emerald: "border-emerald-500/30 text-emerald-200",
    amber: "border-amber-500/30 text-amber-200",
    rose: "border-rose-500/30 text-rose-200",
  };
  return (
    <div className={`flex items-center gap-2 rounded-lg bg-slate-800 border ${tones[tone]} px-4 py-2.5 text-sm shadow-xl`}>
      <ShieldCheck size={15} />
      {text}
      <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-200">
        <X size={14} />
      </button>
    </div>
  );
}

/* ============================= Patient view (Bob) ============================= */

function PatientView({ nodes, meds, stock }) {
  const [medId, setMedId] = useState(meds[0]?.id);
  const [notifyOn, setNotifyOn] = useState(new Set());
  const [showFeed, setShowFeed] = useState(false);
  const [feed, setFeed] = useState([]);
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [locStatus, setLocStatus] = useState("default");
  const [viewMode, setViewMode] = useState("list");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const timers = useRef({});

  function requestLocation() {
    if (!("geolocation" in navigator)) { setLocStatus("unavailable"); return; }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocStatus("granted"); },
      () => setLocStatus("denied"),
      { timeout: 6000 }
    );
  }

  useEffect(() => { requestLocation(); }, []);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const rows = useMemo(() => {
    if (!medId) return [];
    return nodes.map((n) => ({
      node: n,
      stock: stock[medId]?.[n.id] || { level: "unreported", trend: "steady", cost: null, history: [] },
      distanceMi: +haversineMiles(coords.lat, coords.lng, n.lat, n.lng).toFixed(1),
    })).sort((a, b) => a.distanceMi - b.distanceMi);
  }, [medId, coords, nodes, stock]);

  function toggleNotify(node) {
    const key = `${medId}-${node.id}`;
    setNotifyOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (timers.current[key]) { clearTimeout(timers.current[key]); delete timers.current[key]; }
      } else {
        next.add(key);
        const med = meds.find((m) => m.id === medId);
        setFeed((f) => [{ id: `${key}-on`, text: `You'll be notified about ${node.pharmacy}'s ${med.name} stock.` }, ...f]);
        timers.current[key] = setTimeout(() => {
          setFeed((f) => [{ id: `${key}-${Date.now()}`, text: `🔔 ${node.pharmacy}: ${med.name} stock level just changed.` }, ...f]);
          setShowFeed(true);
          delete timers.current[key];
        }, 4500);
      }
      return next;
    });
  }

  return (
    <div className="max-w-xl mx-auto px-4 pb-10">
      <div className="flex items-center justify-between py-4">
        <div>
          <h2 className="font-semibold text-slate-100 text-lg">Find your medication</h2>
          <p className="text-xs text-slate-400 mt-0.5">signed in as Bob</p>
        </div>
        <button onClick={() => setShowFeed((s) => !s)} className="relative rounded-full border border-slate-700 bg-slate-800/70 p-2 text-slate-300 hover:text-slate-100">
          {feed.length ? <BellRing size={16} /> : <Bell size={16} />}
          {feed.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 text-[10px] font-bold text-slate-900 flex items-center justify-center">{feed.length}</span>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
        <span className="flex items-center gap-1.5">
          <LocateFixed size={12} className={locStatus === "granted" ? "text-emerald-400" : "text-slate-500"} />
          {locStatus === "granted" && "Using your location"}
          {locStatus === "locating" && "Locating…"}
          {locStatus === "default" && "Using approximate LS1 location"}
          {locStatus === "denied" && "Location unavailable — using approximate LS1 location"}
          {locStatus === "unavailable" && "Geolocation not supported here — using approximate LS1 location"}
        </span>
        {locStatus !== "granted" && locStatus !== "locating" && (
          <button onClick={requestLocation} className="text-emerald-300 hover:underline font-medium">Enable location</button>
        )}
      </div>

      {showFeed && (
        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/60 divide-y divide-slate-800 max-h-48 overflow-y-auto">
          <p className="px-3 py-2 text-[10px] text-slate-500 bg-slate-900/80">Alerts fire only while this tab stays open — always-on push notifications are a future step.</p>
          {feed.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">No notifications yet. Tap the bell on a pharmacy card to get alerts.</p>
          ) : feed.map((f) => <p key={f.id} className="px-3 py-2.5 text-xs text-slate-300">{f.text}</p>)}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <MedPicker meds={meds} medId={medId} setMedId={setMedId} />
        <div className="flex items-center rounded-full border border-slate-700 bg-slate-900 p-1 text-xs">
          <button onClick={() => setViewMode("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors ${viewMode === "list" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>
            <ListIcon size={13} /> List
          </button>
          <button onClick={() => setViewMode("map")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors ${viewMode === "map" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>
            <MapIcon size={13} /> Map
          </button>
        </div>
      </div>

      {viewMode === "map" ? (
        <div className="mt-5">
          <MapView rows={rows} medName={meds.find((m) => m.id === medId)?.name} userCoords={coords} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">Pins are color-coded by stock level; a pulsing ring means stock is both low and falling. Tap a pin, then switch to List for full detail and notifications.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map(({ node, stock: s, distanceMi }) => {
            const driveMin = Math.max(2, Math.round(distanceMi * 3));
            const warnDropping = s.trend === "falling" && (s.level === "low" || s.level === "out");
            const key = `${medId}-${node.id}`;
            const notifying = notifyOn.has(key);
            return (
              <div key={node.id} className={`rounded-xl border p-4 ${LEVEL_BG[s.level]} bg-slate-900/40 ${node.id === selectedNodeId ? "ring-2 ring-emerald-400" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-100 font-medium text-sm"><Building2 size={14} className="text-slate-400" />{node.pharmacy}</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1"><MapPin size={12} />{node.postcode} · {distanceMi} mi · ~{driveMin} min drive (approx.)</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.history.length > 1 && <Sparkline data={s.history} color={trendColorHex(s.trend)} />}
                    <button
                      onClick={() => toggleNotify(node)}
                      disabled={s.level === "unreported"}
                      title={s.level === "unreported" ? "This pharmacy isn't reporting stock yet" : "Notify me about changes here"}
                      className={`p-1.5 rounded-full border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${notifying ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
                    >
                      {notifying ? <BellRing size={13} /> : <Bell size={13} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_BG[s.level]} ${LEVEL_TEXT[s.level]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[s.level]}`} />{LEVEL_LABEL[s.level]}
                  </span>
                  {s.history.length > 1 && <TrendBadge trend={s.trend} />}
                </div>

                {s.level === "unreported" && (
                  <p className="mt-3 text-xs text-slate-500 leading-relaxed">This pharmacy hasn't connected live stock reporting yet — the address and directions below are still accurate.</p>
                )}

                {warnDropping && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                    <TrendingDown size={14} className="text-rose-300 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-rose-200 leading-relaxed">Stock is dropping here. Call ahead before you travel to make sure it's still available.</p>
                  </div>
                )}

                {s.level === "out" ? (
                  <button disabled className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 text-slate-500 text-sm font-medium py-2 cursor-not-allowed">
                    <Navigation size={14} />Get directions
                  </button>
                ) : (
                  <a href={`https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${node.lat},${node.lng}`} target="_blank" rel="noopener noreferrer"
                    className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-900 text-sm font-medium py-2 hover:bg-white transition-colors">
                    <Navigation size={14} />Get directions
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">Distances are straight-line from your device location, not a routed driving time.</p>
    </div>
  );
}

/* ============================= Pharmacist sign-in (real email lookup) ============================= */

function PharmacistSignIn({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { node } = await api("/api/auth/lookup", { method: "POST", body: JSON.stringify({ email }) });
      onSignIn(node);
    } catch (err) {
      if (err.status === 403) setError("Please use your pharmacy's business email, not a personal address.");
      else if (err.status === 404) setError(`not-registered:${err.data.domain}`);
      else setError("Couldn't reach the server. Check the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  const notRegistered = error?.startsWith("not-registered:");
  const notRegisteredDomain = notRegistered ? error.split(":")[1] : null;

  if (notRegistered) {
    return <PharmacistRegisterForm emailDomain={notRegisteredDomain} onRegistered={onSignIn} onCancel={() => setError(null)} />;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 via-emerald-400 to-amber-400 p-[1.5px] mb-5">
        <div className="h-full w-full rounded-[15px] bg-slate-950 flex items-center justify-center"><ShieldCheck size={20} className="text-slate-100" /></div>
      </div>
      <h2 className="font-semibold text-slate-100 text-lg mb-1.5">Sign in with your pharmacy email</h2>
      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        We check this against your registered work email domain — no one can sign in as a pharmacy that isn't theirs.
      </p>
      <form onSubmit={handleSubmit} className="text-left">
        <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5"><Mail size={12} /> Work email</label>
        <input
          type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="you@yourpharmacy.co.uk"
          className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 mb-3 focus:outline-none focus:border-emerald-500"
        />
        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 text-xs text-rose-200 mb-3 leading-relaxed">{error}</div>
        )}
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-emerald-500 text-slate-950 text-sm font-medium py-3 hover:bg-emerald-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin" />}
          Sign in
        </button>
      </form>
    </div>
  );
}

function PharmacistRegisterForm({ emailDomain, onRegistered, onCancel }) {
  const [pharmacy, setPharmacy] = useState("");
  const [postcode, setPostcode] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [chain, setChain] = useState("Independent");
  const [coords, setCoords] = useState(null);
  const [locStatus, setLocStatus] = useState("locating");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function requestLocation() {
    if (!("geolocation" in navigator)) { setLocStatus("unavailable"); return; }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocStatus("granted"); },
      () => setLocStatus("denied"),
      { timeout: 8000 }
    );
  }

  useEffect(() => { requestLocation(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!coords) { setError("We need this device's location to register the pharmacy — enable location and try again."); return; }
    setSubmitting(true);
    try {
      const { node } = await api("/api/nodes", {
        method: "POST",
        body: JSON.stringify({
          id: crypto.randomUUID(),
          postcode, pharmacy, area, phone: phone || null, chain,
          networkPartner: false,
          emailDomain,
          lat: coords.lat, lng: coords.lng,
        }),
      });
      onRegistered(node);
    } catch (err) {
      setError(err.message || "Couldn't register this pharmacy — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="text-center mb-6">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 via-emerald-400 to-amber-400 p-[1.5px] mb-4">
          <div className="h-full w-full rounded-[15px] bg-slate-950 flex items-center justify-center"><Building2 size={20} className="text-slate-100" /></div>
        </div>
        <h2 className="font-semibold text-slate-100 text-lg mb-1.5">Register this pharmacy</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="font-mono">{emailDomain}</span> isn't on the network yet — let's fix that right now.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="text-left space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Pharmacy name</label>
          <input required value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} placeholder="e.g. Broad Street Pharmacy" className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Postcode</label>
            <input required value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="CF62 ..." className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Town / area</label>
            <input required value={area} onChange={(e) => setArea(e.target.value)} placeholder="Barry" className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Phone (optional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01446 …" className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Chain</label>
            <input value={chain} onChange={(e) => setChain(e.target.value)} placeholder="Independent" className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2.5">
          <LocateFixed size={13} className={locStatus === "granted" ? "text-emerald-400" : "text-slate-500"} />
          {locStatus === "locating" && <span className="text-slate-400">Getting this device's location…</span>}
          {locStatus === "granted" && <span className="text-emerald-300">Location captured — this pin will be accurate on the map.</span>}
          {(locStatus === "denied" || locStatus === "unavailable") && (
            <span className="text-amber-300 flex-1">Location unavailable. <button type="button" onClick={requestLocation} className="underline">Try again</button> — needed to place this pharmacy on the map.</span>
          )}
        </div>

        {error && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 text-xs text-rose-200 leading-relaxed">{error}</div>}

        <button type="submit" disabled={submitting || !coords} className="w-full rounded-lg bg-emerald-500 text-slate-950 text-sm font-medium py-3 hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Register &amp; sign in
        </button>
        <button type="button" onClick={onCancel} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1">
          Back
        </button>
      </form>
    </div>
  );
}

/* ============================= Stock reporting panel ============================= */

function MyStockPanel({ meds, ownNodeId, stock, onReport }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/30">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-xs font-medium text-slate-300 uppercase tracking-wide">Your stock levels</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {meds.map((m) => {
            const s = stock[m.id]?.[ownNodeId] || { level: "unreported" };
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="text-sm text-slate-200">{m.name} <span className="text-xs text-slate-500">{m.dose}</span></span>
                <div className="flex gap-1">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => onReport(ownNodeId, m.id, lvl)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                        s.level === lvl ? `${LEVEL_BG[lvl]} ${LEVEL_TEXT[lvl]}` : "border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      {LEVEL_LABEL[lvl]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
            This is exactly what patients and other pharmacies see for your branch, saved for real now — it survives a refresh and shows up for everyone else too.
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================= Pharmacist view (Rob / Patel) ============================= */

function PharmacistView({ nodes, meds, stock, requests, ownNode, onSignOut, onReportStock, onCreateRequest, onRespondRequest, onCompleteRequest }) {
  const [medId, setMedId] = useState(meds[0]?.id);
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [requestModalNode, setRequestModalNode] = useState(null);

  const ownNodeId = ownNode.id;
  const ownStock = stock[medId]?.[ownNodeId] || { level: "unreported" };
  const ownShort = ownStock.level === "low" || ownStock.level === "out";

  const rows = useMemo(() => {
    const list = nodes.filter((n) => n.id !== ownNodeId && (!n.isTest || ownNode.isTest)).map((n) => ({ node: n, stock: stock[medId]?.[n.id] || { level: "unreported", trend: "steady", cost: null, history: [] } }));
    if (ownShort) list.sort((a, b) => LEVELS.indexOf(b.stock.level) - LEVELS.indexOf(a.stock.level));
    return list;
  }, [medId, ownNodeId, ownShort, nodes, stock, ownNode.isTest]);

  const bestMatchId = ownShort ? rows.find((r) => r.stock.level === "high")?.node.id : null;

  function flashToast(text, tone = "emerald") { setToast({ text, tone }); setTimeout(() => setToast(null), 3400); }

  const incomingTransferRequests = requests.filter((r) => r.holderNodeId === ownNodeId && r.initiatedBy === "receiver" && r.status === "pending");
  const incomingOffers = requests.filter((r) => r.receiverNodeId === ownNodeId && r.initiatedBy === "holder" && r.status === "pending");
  const myOutgoing = requests.filter((r) => {
    const involved = r.holderNodeId === ownNodeId || r.receiverNodeId === ownNodeId;
    if (!involved) return false;
    if (r.status === "pending") {
      const needsMyApproval = (r.initiatedBy === "receiver" && r.holderNodeId === ownNodeId) || (r.initiatedBy === "holder" && r.receiverNodeId === ownNodeId);
      return !needsMyApproval;
    }
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt);

  async function handleRespond(req, action) {
    const counterpart = nodes.find((n) => n.id === (req.initiatedBy === "receiver" ? req.receiverNodeId : req.holderNodeId));
    try {
      await onRespondRequest(req.id, action);
      flashToast(action === "accepted" ? `Approved — stock reserved for ${counterpart?.pharmacy ?? "them"}` : `Declined request from ${counterpart?.pharmacy ?? "them"}`, action === "accepted" ? "emerald" : "rose");
    } catch {
      flashToast("Couldn't reach the server — try again.", "rose");
    }
  }

  async function handleComplete(req) {
    try { await onCompleteRequest(req.id); flashToast("Marked as received"); }
    catch { flashToast("Couldn't reach the server — try again.", "rose"); }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <h2 className="font-semibold text-slate-100 text-lg">Network stock overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">Signed in as <span className="text-slate-200 font-medium">{ownNode.pharmacy}</span><span className="text-slate-500"> · {ownNode.chain}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSignOut} className="text-xs text-slate-500 hover:text-slate-300 underline">Sign out</button>
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-2 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
            <Calendar size={14} />Flag expiring surplus
          </button>
        </div>
      </div>

      <MyStockPanel meds={meds} ownNodeId={ownNodeId} stock={stock} onReport={onReportStock} />

      <div className="mt-3"><MedPicker meds={meds} medId={medId} setMedId={setMedId} /></div>

      {ownShort && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 text-sm text-rose-200">
          <TrendingDown size={15} className="mt-0.5 flex-shrink-0" />
          Your {meds.find((m) => m.id === medId)?.name} is {LEVEL_LABEL[ownStock.level].toLowerCase()}
          {bestMatchId ? " — the strongest surplus match is highlighted below." : " — no strong surplus match nearby right now."}
        </div>
      )}

      {(incomingTransferRequests.length > 0 || incomingOffers.length > 0) && (
        <div className="mt-3 space-y-2">
          {incomingTransferRequests.map((r) => {
            const from = nodes.find((n) => n.id === r.receiverNodeId);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 border border-slate-700 px-3 py-2.5 text-sm">
                <span className="text-slate-200">
                  <b>{from?.pharmacy}</b> is requesting {r.quantity ? <><b>{r.quantity} packs</b> of</> : "your"} {meds.find((m) => m.id === r.medId)?.name}
                  {r.note ? <span className="block text-xs text-slate-400 mt-0.5">"{r.note}"</span> : null}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleRespond(r, "accepted")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 text-emerald-300 px-2.5 py-1 text-xs font-medium hover:bg-emerald-500/10"><Check size={12} /> Approve</button>
                  <button onClick={() => handleRespond(r, "rejected")} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 text-slate-400 px-2.5 py-1 text-xs font-medium hover:bg-slate-700/50"><Ban size={12} /> Decline</button>
                </div>
              </div>
            );
          })}
          {incomingOffers.map((r) => {
            const from = nodes.find((n) => n.id === r.holderNodeId);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-2.5 text-sm text-violet-200">
                <span><b>{from?.pharmacy}</b> flagged a {r.batchSize ? <b>{r.batchSize}</b> : ""} batch of {meds.find((m) => m.id === r.medId)?.name} expiring <b>{r.expiryDate}</b> for you</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleRespond(r, "accepted")} className="inline-flex items-center gap-1 rounded-lg border border-violet-400/40 px-2.5 py-1 text-xs font-medium hover:bg-violet-500/20"><Check size={12} /> Accept</button>
                  <button onClick={() => handleRespond(r, "rejected")} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 text-slate-400 px-2.5 py-1 text-xs font-medium hover:bg-slate-700/50"><Ban size={12} /> Decline</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Where</th><th className="px-4 py-3 font-medium">Level</th><th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 font-medium">Drug cost</th><th className="px-4 py-3 font-medium">Who has it</th><th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, stock: s }, idx) => {
              const canTransact = canSeeCommercialDetail(ownNode, node);
              const sameChain = ownNode.chain === node.chain;
              const forThisHolder = requests.filter((r) => r.holderNodeId === node.id && r.medId === medId);
              const settled = forThisHolder.find((r) => r.status === "accepted" || r.status === "completed");
              const mine = forThisHolder.find((r) => r.receiverNodeId === ownNodeId && r.initiatedBy === "receiver");
              const expiryListing = forThisHolder.find((r) => r.expiryDate);
              const isBest = node.id === bestMatchId;

              let actionNode;
              if (s.level === "unreported") actionNode = <span className="text-xs font-medium text-slate-600">No stock data yet</span>;
              else if (!canTransact) actionNode = <span className="text-xs font-medium text-slate-600">Same-chain only</span>;
              else if (settled && settled.receiverNodeId === ownNodeId) actionNode = settled.status === "completed" ? <span className="text-xs font-medium text-emerald-300 inline-flex items-center gap-1"><Check size={12} /> Received</span> : <span className="text-xs font-medium text-emerald-300 inline-flex items-center gap-1"><Check size={12} /> Approved for you</span>;
              else if (settled) actionNode = <span className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><Ban size={12} /> Claimed</span>;
              else if (mine?.status === "pending") actionNode = <span className="text-xs font-medium text-amber-300 inline-flex items-center gap-1"><Clock size={12} /> Pending approval</span>;
              else if (mine?.status === "rejected") actionNode = <button onClick={() => setRequestModalNode(node)} className="text-xs font-medium text-slate-400 hover:text-slate-200">Declined — request again</button>;
              else actionNode = (
                <button disabled={s.level === "out"} onClick={() => setRequestModalNode(node)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors">
                  <ArrowRightLeft size={12} /> Request transfer
                </button>
              );

              return (
                <tr key={node.id} className={isBest ? "bg-emerald-500/5" : idx % 2 ? "bg-slate-900/30" : "bg-slate-900/10"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-100 font-medium">{node.postcode}</span>
                      {isBest && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-medium px-1.5 py-0.5"><Star size={9} /> Best match</span>}
                      {canTransact && !sameChain && <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-medium px-1.5 py-0.5" title="Different chain — visible because one side opted in as a network partner">Network Partner</span>}
                    </div>
                    <div className="text-xs text-slate-400">{node.area}</div>
                  </td>
                  <td className="px-4 py-3">
                    <LevelBar level={s.level} />
                    {expiryListing && <div className="mt-1 text-[10px] text-amber-300">Expires {expiryListing.expiryDate}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {s.history.length > 1 ? <div className="flex items-center gap-2"><Sparkline data={s.history} color={trendColorHex(s.trend)} /><TrendBadge trend={s.trend} /></div> : <span className="text-xs text-slate-600">No trend data yet</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.cost == null ? <span className="text-slate-600">Not set</span> : canTransact ? <span className="text-slate-200 font-mono">£{s.cost.toFixed(2)}</span> : <span className="text-slate-600 inline-flex items-center gap-1">🔒 Chain-restricted</span>}
                  </td>
                  <td className="px-4 py-3"><div className="text-slate-100">{node.pharmacy}</div><div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5"><Phone size={11} /> {node.phone}</div></td>
                  <td className="px-4 py-3 text-right">{actionNode}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {myOutgoing.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Your transfers</p>
          <div className="space-y-2">
            {myOutgoing.map((r) => {
              const iAmHolder = r.holderNodeId === ownNodeId;
              const counterpart = nodes.find((n) => n.id === (iAmHolder ? r.receiverNodeId : r.holderNodeId));
              const statusStyle = { pending: "text-amber-300", accepted: "text-emerald-300", completed: "text-emerald-400", rejected: "text-rose-300", unavailable: "text-slate-500" }[r.status];
              const statusLabel = { pending: "Pending", accepted: "Approved", completed: "Received", rejected: "Declined", unavailable: "No longer available" }[r.status];
              const canMarkReceived = r.status === "accepted" && !iAmHolder;
              let actionLabel;
              if (iAmHolder && r.initiatedBy === "receiver") actionLabel = `${counterpart?.pharmacy ?? "—"} requested this from you`;
              else if (iAmHolder && r.initiatedBy === "holder") actionLabel = `you offered this to ${counterpart?.pharmacy ?? "no match yet"}`;
              else if (!iAmHolder && r.initiatedBy === "receiver") actionLabel = `you requested this from ${counterpart?.pharmacy}`;
              else actionLabel = `${counterpart?.pharmacy ?? "—"} offered this to you`;
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-slate-800 px-3 py-2.5 text-sm">
                  <span className="text-slate-300">
                    {meds.find((m) => m.id === r.medId)?.name}{r.quantity ? <> · {r.quantity} packs</> : null}{" · "}{actionLabel}
                    {r.expiryDate ? <> · expires <b className="text-amber-300">{r.expiryDate}</b></> : null}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {canMarkReceived && <button onClick={() => handleComplete(r)} className="text-xs font-medium text-emerald-300 border border-emerald-400/40 rounded-lg px-2 py-1 hover:bg-emerald-500/10">Mark as received</button>}
                    <span className={`text-xs font-medium ${statusStyle}`}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
        Levels and trend are visible network-wide. Drug cost and transfer requests are same-chain only by default — {ownNode.chain} branches, plus any pharmacy that's opted in as a network partner. This is now enforced by the server, not just hidden by the interface.
      </p>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30"><Toast text={toast.text} tone={toast.tone} onClose={() => setToast(null)} /></div>}

      {requestModalNode && (
        <RequestQuantityModal
          node={requestModalNode} medId={medId} onClose={() => setRequestModalNode(null)}
          onSubmit={async ({ quantity, note }) => {
            try {
              await onCreateRequest({ medId, holderNodeId: requestModalNode.id, receiverNodeId: ownNodeId, initiatedBy: "receiver", quantity, note });
              flashToast(`Request sent to ${requestModalNode.pharmacy} — waiting for their approval`);
            } catch (err) {
              flashToast(err.message || "Couldn't send the request", "rose");
            }
            setRequestModalNode(null);
          }}
        />
      )}

      {modalOpen && (
        <ExpiryModal
          meds={meds} nodes={nodes} stock={stock} defaultMedId={medId} ownNode={ownNode} onClose={() => setModalOpen(false)}
          onSubmit={async (payload) => {
            const match = findDeficitMatch(nodes, stock, payload.medId, ownNode);
            try {
              await onCreateRequest({ ...payload, holderNodeId: ownNodeId, receiverNodeId: match?.id ?? null, initiatedBy: "holder" });
              flashToast(match ? `Expiry alert sent to ${match.pharmacy} — awaiting their acceptance` : "Listed — no deficit match found yet", match ? "emerald" : "amber");
            } catch (err) {
              flashToast(err.message || "Couldn't submit", "rose");
            }
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RequestQuantityModal({ node, medId, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-100 text-sm">Request transfer from {node.pharmacy}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <label className="block text-xs text-slate-400 mb-1.5">How many packs do you need?</label>
        <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 20" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-3" />
        <label className="block text-xs text-slate-400 mb-1.5">Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. covering three patients this week" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-4" />
        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2.5 text-xs text-slate-400 mb-4">This is your estimated need — it doesn't reveal {node.pharmacy}'s actual stock count, which stays private on the ledger.</div>
        <button disabled={!quantity || Number(quantity) < 1} onClick={() => onSubmit({ quantity: Number(quantity), note: note.trim() || null })} className="w-full rounded-lg bg-emerald-500 text-slate-950 text-sm font-medium py-2 disabled:bg-slate-700 disabled:text-slate-500 hover:bg-emerald-400 transition-colors">Send request</button>
      </div>
    </div>
  );
}

function ExpiryModal({ meds, nodes, stock, defaultMedId, ownNode, onClose, onSubmit }) {
  const [medId, setMedId] = useState(defaultMedId);
  const [expiryDate, setExpiryDate] = useState("");
  const [batchSize, setBatchSize] = useState("Medium");
  const ownStock = stock[medId]?.[ownNode.id] || { level: "unreported" };
  const match = findDeficitMatch(nodes, stock, medId, ownNode);
  const todayISO = new Date().toISOString().slice(0, 10);
  const isPastDate = expiryDate && expiryDate < todayISO;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-100 text-sm">Flag expiring surplus</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <label className="block text-xs text-slate-400 mb-1.5">Medication</label>
        <select value={medId} onChange={(e) => setMedId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-3">
          {meds.map((m) => <option key={m.id} value={m.id}>{m.name} {m.dose}</option>)}
        </select>
        <label className="block text-xs text-slate-400 mb-1.5">Size of the expiring batch</label>
        <select value={batchSize} onChange={(e) => setBatchSize(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-1">
          <option>Small</option><option>Medium</option><option>Large</option>
        </select>
        <p className="text-[10px] text-slate-500 mb-3">This is just the batch that's expiring — not your total stock on hand.</p>
        <label className="block text-xs text-slate-400 mb-1.5">Your overall stock level (for context only)</label>
        <div className="mb-3"><LevelBar level={ownStock.level} /></div>
        <label className="block text-xs text-slate-400 mb-1.5">Batch expiry date</label>
        <input type="date" min={todayISO} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-1" />
        {isPastDate && <p className="text-[11px] text-rose-300 mb-2">That date's already passed — pick a real expiry date.</p>}
        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2.5 text-xs text-slate-400 mb-4">
          {match ? <>Matched with <b className="text-slate-200">{match.pharmacy}</b> ({match.postcode}), currently {LEVEL_LABEL[stock[medId]?.[match.id]?.level || "unreported"].toLowerCase()}. They'll need to accept it.</> : "No deficit node found within your chain or network partners right now — it'll stay listed until one appears."}
        </div>
        <button disabled={!expiryDate || isPastDate} onClick={() => onSubmit({ medId, expiryDate, batchSize })} className="w-full rounded-lg bg-emerald-500 text-slate-950 text-sm font-medium py-2 disabled:bg-slate-700 disabled:text-slate-500 hover:bg-emerald-400 transition-colors">Send expiry alert</button>
      </div>
    </div>
  );
}

/* ============================= Root ============================= */

export default function App() {
  const [role, setRole] = useState("patient");
  const [ownNode, setOwnNode] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [meds, setMeds] = useState([]);
  const [stock, setStock] = useState({});
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const refreshRequests = useCallback(async () => {
    const { requests: r } = await api("/api/requests");
    setRequests(r);
  }, []);

  const refreshStockForMed = useCallback(async (medId) => {
    const { stock: s } = await api(`/api/stock?medId=${medId}`);
    setStock((prev) => ({ ...prev, [medId]: s }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ nodes: n }, { meds: m }] = await Promise.all([api("/api/nodes"), api("/api/meds")]);
        const stockByMed = {};
        await Promise.all(m.map(async (med) => {
          const { stock: s } = await api(`/api/stock?medId=${med.id}`);
          stockByMed[med.id] = s;
        }));
        const { requests: r } = await api("/api/requests");
        if (cancelled) return;
        setNodes(n); setMeds(m); setStock(stockByMed); setRequests(r);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Couldn't reach the backend");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleReportStock(nodeId, medId, level) {
    await api("/api/stock", { method: "POST", body: JSON.stringify({ nodeId, medId, level }) });
    await refreshStockForMed(medId);
  }

  async function handleCreateRequest(payload) {
    await api("/api/requests", { method: "POST", body: JSON.stringify(payload) });
    await refreshRequests();
  }

  async function handleRespondRequest(id, action) {
    await api(`/api/requests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await refreshRequests();
  }

  async function handleCompleteRequest(id) {
    await api(`/api/requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "completed" }) });
    await refreshRequests();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 size={18} className="animate-spin" /> Loading MapMyMeds…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <AlertTriangle size={28} className="text-amber-400 mx-auto mb-3" />
          <p className="text-slate-200 font-medium mb-1.5">Couldn't reach the backend</p>
          <p className="text-xs text-slate-500 leading-relaxed">{loadError}. Confirm the backend is running at {API_BASE} and reachable from this browser.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 via-emerald-400 to-amber-400 p-[1.5px]">
              <div className="h-full w-full rounded-[7px] bg-slate-950 flex items-center justify-center"><MapPin size={14} className="text-slate-100" /></div>
            </div>
            <div>
              <div className="font-semibold text-slate-100 text-sm leading-tight">MapMyMeds</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Leeds pilot · LS1 &amp; LS13</div>
            </div>
          </div>
          <div className="flex items-center rounded-full border border-slate-700 bg-slate-900 p-1 text-sm">
            <button onClick={() => setRole("patient")} className={`px-3 py-1.5 rounded-full font-medium transition-colors ${role === "patient" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>Patient</button>
            <button onClick={() => setRole("pharmacist")} className={`px-3 py-1.5 rounded-full font-medium transition-colors ${role === "pharmacist" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>Pharmacist</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-3">
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-200">
          <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" />
          {role === "patient" ? "Always confirm by phone before travelling for an urgent medication." : "Levels are set by pharmacists themselves — help us keep this accurate."}
        </div>
      </div>

      {role === "patient" ? (
        <PatientView nodes={nodes.filter((n) => !n.isTest)} meds={meds} stock={stock} />
      ) : ownNode ? (
        <PharmacistView
          nodes={nodes} meds={meds} stock={stock} requests={requests} ownNode={ownNode}
          onSignOut={() => setOwnNode(null)}
          onReportStock={handleReportStock}
          onCreateRequest={handleCreateRequest}
          onRespondRequest={handleRespondRequest}
          onCompleteRequest={handleCompleteRequest}
        />
      ) : (
        <PharmacistSignIn onSignIn={setOwnNode} />
      )}
    </div>
  );
}