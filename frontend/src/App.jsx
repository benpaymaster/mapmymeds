import { useState, useMemo, useRef, useEffect } from "react";
import {
  MapPin, TrendingUp, TrendingDown, Minus, Phone, Building2,
  ArrowRightLeft, Search, ShieldCheck, Navigation, ChevronDown, X,
  Bell, BellRing, Calendar, Check, Star, LocateFixed, Clock, Ban,
  Map as MapIcon, List as ListIcon
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import MapView from "./components/MapView.jsx";

/* ============================= Mock domain data ============================= */

const MEDS = [
  { id: "ator", name: "Atorvastatin", dose: "20mg" },
  { id: "amlo", name: "Amlodipine", dose: "5mg" },
  { id: "omep", name: "Omeprazole", dose: "20mg" },
  { id: "levo", name: "Levothyroxine", dose: "50mcg" },
  { id: "metf", name: "Metformin", dose: "500mg" },
  { id: "rami", name: "Ramipril", dose: "2.5mg" },
];

// Approximate real coordinates so distance is a genuine haversine calc, not a placeholder.
// chain: which company owns this branch. networkPartner: true means this pharmacy has opted
// in to sharing cost + transfer requests with other chains, not just its own — the "Option B"
// model: stock LEVEL is always visible network-wide (the shortage-resolution mission), but
// commercial detail (cost, transfer requests) defaults to same-chain only.
const NODES = [
  { id: "ls1-1", postcode: "LS1 4DY", pharmacy: "Boar Lane Pharmacy", area: "LS1 City Centre", lat: 53.7958, lng: -1.5438, phone: "0113 496 0021", chain: "Northside Health", networkPartner: false },
  { id: "ls1-2", postcode: "LS1 5DR", pharmacy: "Wellington St. Chemist", area: "LS1 City Centre", lat: 53.7959, lng: -1.5551, phone: "0113 496 0044", chain: "Northside Health", networkPartner: false },
  { id: "ls1-3", postcode: "LS1 6EL", pharmacy: "Merrion Health Pharmacy", area: "LS1 City Centre", lat: 53.7999, lng: -1.5406, phone: "0113 496 0078", chain: "Independent", networkPartner: true },
  { id: "ls1-4", postcode: "LS1 3AX", pharmacy: "Kirkgate Community Pharmacy", area: "LS1 City Centre", lat: 53.7963, lng: -1.5386, phone: "0113 496 0103", chain: "CityCare Pharmacies", networkPartner: false },
  { id: "ls13-1", postcode: "LS13 1AA", pharmacy: "Bramley Town St. Pharmacy", area: "LS13 Bramley", lat: 53.8117, lng: -1.6205, phone: "0113 256 0012", chain: "CityCare Pharmacies", networkPartner: false },
  { id: "ls13-2", postcode: "LS13 2QF", pharmacy: "Broad Lane Chemist", area: "LS13 Bramley", lat: 53.8145, lng: -1.6108, phone: "0113 256 0034", chain: "Northside Health", networkPartner: false },
  { id: "ls13-3", postcode: "LS13 3JN", pharmacy: "Fairfield Pharmacy", area: "LS13 Bramley", lat: 53.8071, lng: -1.6247, phone: "0113 256 0056", chain: "Independent", networkPartner: true },
  { id: "ls13-4", postcode: "LS13 4RT", pharmacy: "Cape Sq. Pharmacy", area: "LS13 Bramley", lat: 53.8098, lng: -1.6156, phone: "0113 256 0089", chain: "CityCare Pharmacies", networkPartner: false },
];

// Same chain, or either side has opted in as a network partner.
function canSeeCommercialDetail(viewerNode, targetNode) {
  if (!viewerNode || !targetNode) return false;
  if (viewerNode.chain === targetNode.chain) return true;
  return viewerNode.networkPartner || targetNode.networkPartner;
}

const DEFAULT_COORDS = { lat: 53.7965, lng: -1.5478 }; // LS1 city centre fallback

const PATEL_NODE_ID = "ls13-2"; // Broad Lane Chemist — home base for the expiring-surplus scenario

const LEVELS = ["out", "low", "medium", "high"];
const LEVEL_LABEL = { out: "Out of stock", low: "Low stock", medium: "In stock", high: "Well stocked" };
const LEVEL_DOT = { out: "bg-rose-400", low: "bg-amber-400", medium: "bg-emerald-400", high: "bg-emerald-400" };
const LEVEL_TEXT = { out: "text-rose-300", low: "text-amber-300", medium: "text-emerald-300", high: "text-emerald-300" };
const LEVEL_BG = { out: "bg-rose-500/10 border-rose-500/30", low: "bg-amber-500/10 border-amber-500/30", medium: "bg-emerald-500/10 border-emerald-500/30", high: "bg-emerald-500/10 border-emerald-500/30" };

const BASE_COST = { ator: 2.85, amlo: 1.4, omep: 3.6, levo: 1.95, metf: 1.1, rami: 1.65 };

function seedRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Build deterministic stock history + level + cost per med per node
const STOCK = {};
MEDS.forEach((m, mi) => {
  STOCK[m.id] = {};
  const rnd = seedRand(mi * 131 + 17);
  NODES.forEach((n) => {
    const history = [];
    let v = 20 + rnd() * 60;
    for (let i = 0; i < 6; i++) {
      v = Math.max(0, v + (rnd() - 0.52) * 18);
      history.push(Math.round(v));
    }
    const last = history[history.length - 1];
    let level;
    if (last < 6) level = "out";
    else if (last < 22) level = "low";
    else if (last < 45) level = "medium";
    else level = "high";
    const slope = history[5] - history[1];
    const trend = slope > 6 ? "rising" : slope < -6 ? "falling" : "steady";
    const cost = +(BASE_COST[m.id] * (0.9 + rnd() * 0.25)).toFixed(2);
    STOCK[m.id][n.id] = { history, level, trend, cost };
  });
});

// Seed the three walkthrough scenarios so they're visible without hunting.
STOCK.omep[PATEL_NODE_ID] = { ...STOCK.omep[PATEL_NODE_ID], level: "low", trend: "falling" };
STOCK.amlo[PATEL_NODE_ID] = { ...STOCK.amlo[PATEL_NODE_ID], level: "high", trend: "steady" };
STOCK.amlo["ls1-3"] = { ...STOCK.amlo["ls1-3"], level: "out", trend: "falling" }; // Merrion Health — Patel's deficit match

// Respects the same same-chain-or-partner rule as manual transfer requests — a batch
// shouldn't get auto-offered to a competitor's branch that hasn't opted in to visibility.
function findDeficitMatch(medId, ownNode) {
  const eligible = NODES.filter((n) => n.id !== ownNode.id && canSeeCommercialDetail(ownNode, n));
  const out = eligible.find((n) => STOCK[medId][n.id].level === "out");
  if (out) return out;
  return eligible.find((n) => STOCK[medId][n.id].level === "low") || null;
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

function trendColorHex(trend) {
  return trend === "rising" ? "#34d399" : trend === "falling" ? "#fb7185" : "#94a3b8";
}

function MedPicker({ medId, setMedId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const med = MEDS.find((m) => m.id === medId);
  const filtered = MEDS.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
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

function PatientView() {
  const [medId, setMedId] = useState(MEDS[0].id);
  const [notifyOn, setNotifyOn] = useState(new Set());
  const [showFeed, setShowFeed] = useState(false);
  const [feed, setFeed] = useState([]);
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [locStatus, setLocStatus] = useState("default"); // default | locating | granted | denied | unavailable
  const [viewMode, setViewMode] = useState("list"); // list | map
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const timers = useRef([]);

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocStatus("unavailable");
      return;
    }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
      },
      () => setLocStatus("denied"),
      { timeout: 6000 }
    );
  }

  useEffect(() => { requestLocation(); }, []); // ask once on load; falls back silently if blocked

  const rows = useMemo(() => {
    return NODES.map((n) => ({
      node: n,
      stock: STOCK[medId][n.id],
      distanceMi: +haversineMiles(coords.lat, coords.lng, n.lat, n.lng).toFixed(1),
    })).sort((a, b) => a.distanceMi - b.distanceMi);
  }, [medId, coords]);

  function toggleNotify(node) {
    const key = `${medId}-${node.id}`;
    setNotifyOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        const med = MEDS.find((m) => m.id === medId);
        setFeed((f) => [{ id: `${key}-on`, text: `You'll be notified about ${node.pharmacy}'s ${med.name} stock.` }, ...f]);
        const t = setTimeout(() => {
          setFeed((f) => [{ id: `${key}-${Date.now()}`, text: `🔔 ${node.pharmacy}: ${med.name} stock level just changed.` }, ...f]);
          setShowFeed(true);
        }, 4500);
        timers.current.push(t);
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
        <button
          onClick={() => setShowFeed((s) => !s)}
          className="relative rounded-full border border-slate-700 bg-slate-800/70 p-2 text-slate-300 hover:text-slate-100"
        >
          {feed.length ? <BellRing size={16} /> : <Bell size={16} />}
          {feed.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 text-[10px] font-bold text-slate-900 flex items-center justify-center">
              {feed.length}
            </span>
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
          <p className="px-3 py-2 text-[10px] text-slate-500 bg-slate-900/80">Alerts fire only while this tab stays open — always-on push notifications need the backend integration.</p>
          {feed.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">No notifications yet. Tap the bell on a pharmacy card to get alerts.</p>
          ) : (
            feed.map((f) => <p key={f.id} className="px-3 py-2.5 text-xs text-slate-300">{f.text}</p>)
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <MedPicker medId={medId} setMedId={setMedId} />
        <div className="flex items-center rounded-full border border-slate-700 bg-slate-900 p-1 text-xs">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors ${viewMode === "list" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}
          >
            <ListIcon size={13} /> List
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors ${viewMode === "map" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}
          >
            <MapIcon size={13} /> Map
          </button>
        </div>
      </div>

      {viewMode === "map" ? (
        <div className="mt-5">
          <MapView
            rows={rows}
            medName={MEDS.find((m) => m.id === medId).name}
            userCoords={coords}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
            Pins are color-coded by stock level; a pulsing ring means stock is both low and falling. Tap a pin, then switch to List for full detail and notifications.
          </p>
        </div>
      ) : (
      <div className="mt-5 space-y-3">
        {rows.map(({ node, stock, distanceMi }) => {
          const driveMin = Math.max(2, Math.round(distanceMi * 3));
          const warnDropping = stock.trend === "falling" && (stock.level === "low" || stock.level === "out");
          const key = `${medId}-${node.id}`;
          const notifying = notifyOn.has(key);
          return (
            <div key={node.id} className={`rounded-xl border p-4 ${LEVEL_BG[stock.level]} bg-slate-900/40 ${node.id === selectedNodeId ? "ring-2 ring-emerald-400" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-100 font-medium text-sm">
                    <Building2 size={14} className="text-slate-400" />
                    {node.pharmacy}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <MapPin size={12} />
                    {node.postcode} · {distanceMi} mi · ~{driveMin} min drive (approx.)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkline data={stock.history} color={trendColorHex(stock.trend)} />
                  <button
                    onClick={() => toggleNotify(node)}
                    title="Notify me about changes here"
                    className={`p-1.5 rounded-full border transition-colors ${
                      notifying ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {notifying ? <BellRing size={13} /> : <Bell size={13} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_BG[stock.level]} ${LEVEL_TEXT[stock.level]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[stock.level]}`} />
                  {LEVEL_LABEL[stock.level]}
                </span>
                <TrendBadge trend={stock.trend} />
              </div>

              {warnDropping && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                  <TrendingDown size={14} className="text-rose-300 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-rose-200 leading-relaxed">
                    Stock is dropping here. Call ahead before you travel to make sure it's still available.
                  </p>
                </div>
              )}

              {stock.level === "out" ? (
                <button
                  disabled
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 text-slate-500 text-sm font-medium py-2 cursor-not-allowed"
                >
                  <Navigation size={14} />
                  Get directions
                </button>
              ) : (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${node.lat},${node.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-900 text-sm font-medium py-2 hover:bg-white transition-colors"
                >
                  <Navigation size={14} />
                  Get directions
                </a>
              )}
            </div>
          );
        })}
      </div>
      )}

      <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
        Distances are straight-line from your device location, not a routed driving time. Notifications above are simulated for this preview — see the engineering notes for how live alerts are meant to be wired.
      </p>
    </div>
  );
}

/* ============================= Pharmacist view (Rob / Patel) ============================= */

function PharmacistSignIn({ onSignIn }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 via-emerald-400 to-amber-400 p-[1.5px] mb-5">
        <div className="h-full w-full rounded-[15px] bg-slate-950 flex items-center justify-center">
          <ShieldCheck size={20} className="text-slate-100" />
        </div>
      </div>
      <h2 className="font-semibold text-slate-100 text-lg mb-1.5">Sign in to your pharmacy</h2>
      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        For this pilot, select your branch below. In production this becomes a real credential —
        a wallet signature tied to your pharmacy's own ENS name (e.g. <span className="font-mono">broadlane.mapmymeds.eth</span>) —
        so no one can act on another pharmacy's behalf.
      </p>
      <div className="space-y-2 text-left">
        {NODES.map((n) => (
          <button
            key={n.id}
            onClick={() => onSignIn(n.id)}
            className="w-full flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm hover:border-emerald-400 transition-colors"
          >
            <span>
              <span className="text-slate-100 font-medium">{n.pharmacy}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{n.postcode} · {n.chain}</span>
            </span>
            <ChevronDown size={14} className="text-slate-500 -rotate-90" />
          </button>
        ))}
      </div>
    </div>
  );
}

function PharmacistView({ requests, createRequest, respondRequest, completeRequest, signedInNodeId, onSignOut }) {
  const [medId, setMedId] = useState(MEDS[0].id);
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [requestModalNode, setRequestModalNode] = useState(null);

  const ownNodeId = signedInNodeId;
  const ownNode = NODES.find((n) => n.id === ownNodeId);
  const ownStock = STOCK[medId][ownNodeId];
  const ownShort = ownStock.level === "low" || ownStock.level === "out";

  const rows = useMemo(() => {
    const list = NODES.filter((n) => n.id !== ownNodeId).map((n) => ({ node: n, stock: STOCK[medId][n.id] }));
    if (ownShort) list.sort((a, b) => LEVELS.indexOf(b.stock.level) - LEVELS.indexOf(a.stock.level));
    return list;
  }, [medId, ownNodeId, ownShort]);

  const bestMatchId = ownShort ? rows.find((r) => r.stock.level === "high")?.node.id : null;

  function flashToast(text, tone = "emerald") {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3400);
  }

  const incomingTransferRequests = requests.filter(
    (r) => r.holderNodeId === ownNodeId && r.initiatedBy === "receiver" && r.status === "pending"
  );
  const incomingOffers = requests.filter(
    (r) => r.receiverNodeId === ownNodeId && r.initiatedBy === "holder" && r.status === "pending"
  );
  const myOutgoing = requests.filter(
    (r) => (r.initiatedBy === "receiver" && r.receiverNodeId === ownNodeId) || (r.initiatedBy === "holder" && r.holderNodeId === ownNodeId)
  ).sort((a, b) => b.createdAt - a.createdAt);

  function handleRespond(req, action) {
    respondRequest(req.id, action);
    const counterpart = NODES.find((n) => n.id === (req.initiatedBy === "receiver" ? req.receiverNodeId : req.holderNodeId));
    flashToast(
      action === "accepted" ? `Approved — stock reserved for ${counterpart?.pharmacy ?? "them"}` : `Declined request from ${counterpart?.pharmacy ?? "them"}`,
      action === "accepted" ? "emerald" : "rose"
    );
  }

  function handleComplete(req) {
    completeRequest(req.id);
    flashToast("Marked as received");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <h2 className="font-semibold text-slate-100 text-lg">Network stock overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Signed in as <span className="text-slate-200 font-medium">{ownNode.pharmacy}</span>
            <span className="text-slate-500"> · {ownNode.chain}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSignOut} className="text-xs text-slate-500 hover:text-slate-300 underline">Sign out</button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-2 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
          >
            <Calendar size={14} />
            Flag expiring surplus
          </button>
        </div>
      </div>

      <MedPicker medId={medId} setMedId={setMedId} />

      {ownShort && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 text-sm text-rose-200">
          <TrendingDown size={15} className="mt-0.5 flex-shrink-0" />
          Your {MEDS.find((m) => m.id === medId).name} is {LEVEL_LABEL[ownStock.level].toLowerCase()}
          {bestMatchId ? " — the strongest surplus match is highlighted below." : " — no strong surplus match nearby right now."}
        </div>
      )}

      {(incomingTransferRequests.length > 0 || incomingOffers.length > 0) && (
        <div className="mt-3 space-y-2">
          {incomingTransferRequests.map((r) => {
            const from = NODES.find((n) => n.id === r.receiverNodeId);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 border border-slate-700 px-3 py-2.5 text-sm">
                <span className="text-slate-200">
                  <b>{from.pharmacy}</b> is requesting {r.quantity ? <><b>{r.quantity} packs</b> of</> : "your"} {MEDS.find((m) => m.id === r.medId).name}
                  {r.note ? <span className="block text-xs text-slate-400 mt-0.5">"{r.note}"</span> : null}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleRespond(r, "accepted")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 text-emerald-300 px-2.5 py-1 text-xs font-medium hover:bg-emerald-500/10">
                    <Check size={12} /> Approve
                  </button>
                  <button onClick={() => handleRespond(r, "rejected")} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 text-slate-400 px-2.5 py-1 text-xs font-medium hover:bg-slate-700/50">
                    <Ban size={12} /> Decline
                  </button>
                </div>
              </div>
            );
          })}
          {incomingOffers.map((r) => {
            const from = NODES.find((n) => n.id === r.holderNodeId);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-2.5 text-sm text-violet-200">
                <span>
                  <b>{from.pharmacy}</b> flagged a {r.batchSize ? <b>{r.batchSize}</b> : ""} batch of {MEDS.find((m) => m.id === r.medId).name} expiring <b>{r.expiryDate}</b> for you
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleRespond(r, "accepted")} className="inline-flex items-center gap-1 rounded-lg border border-violet-400/40 px-2.5 py-1 text-xs font-medium hover:bg-violet-500/20">
                    <Check size={12} /> Accept
                  </button>
                  <button onClick={() => handleRespond(r, "rejected")} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 text-slate-400 px-2.5 py-1 text-xs font-medium hover:bg-slate-700/50">
                    <Ban size={12} /> Decline
                  </button>
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
              <th className="px-4 py-3 font-medium">Where</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 font-medium">Drug cost</th>
              <th className="px-4 py-3 font-medium">Who has it</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, stock }, idx) => {
              const canTransact = canSeeCommercialDetail(ownNode, node);
              const sameChain = ownNode.chain === node.chain;
              const forThisHolder = requests.filter((r) => r.holderNodeId === node.id && r.medId === medId);
              const settled = forThisHolder.find((r) => r.status === "accepted" || r.status === "completed");
              const mine = forThisHolder.find((r) => r.receiverNodeId === ownNodeId && r.initiatedBy === "receiver");
              const expiryListing = forThisHolder.find((r) => r.expiryDate);
              const isBest = node.id === bestMatchId;

              let actionNode;
              if (!canTransact) {
                actionNode = <span className="text-xs font-medium text-slate-600">Same-chain only</span>;
              } else if (settled && settled.receiverNodeId === ownNodeId) {
                actionNode = settled.status === "completed"
                  ? <span className="text-xs font-medium text-emerald-300 inline-flex items-center gap-1"><Check size={12} /> Received</span>
                  : <span className="text-xs font-medium text-emerald-300 inline-flex items-center gap-1"><Check size={12} /> Approved for you</span>;
              } else if (settled) {
                actionNode = <span className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><Ban size={12} /> Claimed</span>;
              } else if (mine?.status === "pending") {
                actionNode = <span className="text-xs font-medium text-amber-300 inline-flex items-center gap-1"><Clock size={12} /> Pending approval</span>;
              } else if (mine?.status === "rejected") {
                actionNode = (
                  <button onClick={() => setRequestModalNode(node)} className="text-xs font-medium text-slate-400 hover:text-slate-200">
                    Declined — request again
                  </button>
                );
              } else {
                actionNode = (
                  <button
                    disabled={stock.level === "out"}
                    onClick={() => setRequestModalNode(node)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:text-slate-200 transition-colors"
                  >
                    <ArrowRightLeft size={12} /> Request transfer
                  </button>
                );
              }

              return (
                <tr key={node.id} className={isBest ? "bg-emerald-500/5" : idx % 2 ? "bg-slate-900/30" : "bg-slate-900/10"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-100 font-medium">{node.postcode}</span>
                      {isBest && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-medium px-1.5 py-0.5">
                          <Star size={9} /> Best match
                        </span>
                      )}
                      {canTransact && !sameChain && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-medium px-1.5 py-0.5" title="Different chain — visible because one side opted in as a network partner">
                          Network Partner
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{node.area}</div>
                  </td>
                  <td className="px-4 py-3">
                    <LevelBar level={stock.level} />
                    {expiryListing && <div className="mt-1 text-[10px] text-amber-300">Expires {expiryListing.expiryDate}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Sparkline data={stock.history} color={trendColorHex(stock.trend)} />
                      <TrendBadge trend={stock.trend} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {canTransact
                      ? <span className="text-slate-200 font-mono">£{stock.cost.toFixed(2)}</span>
                      : <span className="text-slate-600 inline-flex items-center gap-1">🔒 Chain-restricted</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-100">{node.pharmacy}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5"><Phone size={11} /> {node.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{actionNode}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {myOutgoing.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Your requests</p>
          <div className="space-y-2">
            {myOutgoing.map((r) => {
              const counterpartId = r.initiatedBy === "receiver" ? r.holderNodeId : r.receiverNodeId;
              const counterpart = NODES.find((n) => n.id === counterpartId);
              const statusStyle = {
                pending: "text-amber-300",
                accepted: "text-emerald-300",
                completed: "text-emerald-400",
                rejected: "text-rose-300",
                unavailable: "text-slate-500",
              }[r.status];
              const statusLabel = { pending: "Pending", accepted: "Approved", completed: "Received", rejected: "Declined", unavailable: "No longer available" }[r.status];
              const canMarkReceived = r.status === "accepted" && r.initiatedBy === "receiver" && r.receiverNodeId === ownNodeId;
              const canMarkReceivedOffer = r.status === "accepted" && r.initiatedBy === "holder" && r.receiverNodeId === ownNodeId;
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-slate-800 px-3 py-2.5 text-sm">
                  <span className="text-slate-300">
                    {MEDS.find((m) => m.id === r.medId).name}
                    {r.quantity ? <> · {r.quantity} packs</> : null}
                    {" · "}{r.initiatedBy === "receiver" ? `requested from ${counterpart?.pharmacy}` : `offered to ${counterpart?.pharmacy ?? "—"}`}
                    {r.expiryDate ? <> · expires <b className="text-amber-300">{r.expiryDate}</b></> : null}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {(canMarkReceived || canMarkReceivedOffer) && (
                      <button onClick={() => handleComplete(r)} className="text-xs font-medium text-emerald-300 border border-emerald-400/40 rounded-lg px-2 py-1 hover:bg-emerald-500/10">
                        Mark as received
                      </button>
                    )}
                    <span className={`text-xs font-medium ${statusStyle}`}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
        Levels and trend are visible network-wide, so the shortage-matching mission works across every pharmacy. Drug cost and transfer requests are same-chain only by default — {ownNode.chain} branches, plus any pharmacy that's opted in as a network partner. Once a request is approved, competing requests for the same batch are automatically closed out so stock can't be double-claimed.
      </p>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30"><Toast text={toast.text} tone={toast.tone} onClose={() => setToast(null)} /></div>}

      {requestModalNode && (
        <RequestQuantityModal
          node={requestModalNode}
          medId={medId}
          onClose={() => setRequestModalNode(null)}
          onSubmit={({ quantity, note }) => {
            const existing = requests.find(
              (r) => r.holderNodeId === requestModalNode.id && r.medId === medId && r.receiverNodeId === ownNodeId && (r.status === "pending" || r.status === "accepted")
            );
            if (!existing) {
              createRequest({ medId, holderNodeId: requestModalNode.id, receiverNodeId: ownNodeId, initiatedBy: "receiver", quantity, note });
              flashToast(`Request sent to ${requestModalNode.pharmacy} — waiting for their approval`);
            }
            setRequestModalNode(null);
          }}
        />
      )}

      {modalOpen && (
        <ExpiryModal
          defaultMedId={medId}
          ownNodeId={ownNodeId}
          onClose={() => setModalOpen(false)}
          onSubmit={(payload) => {
            const match = findDeficitMatch(payload.medId, ownNode);
            createRequest({ ...payload, holderNodeId: ownNodeId, receiverNodeId: match?.id ?? null, initiatedBy: "holder" });
            setModalOpen(false);
            flashToast(match ? `Expiry alert sent to ${match.pharmacy} — awaiting their acceptance` : "Listed — no deficit match found yet", match ? "emerald" : "amber");
          }}
        />
      )}
    </div>
  );
}

function RequestQuantityModal({ node, medId, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const med = MEDS.find((m) => m.id === medId);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-100 text-sm">Request transfer from {node.pharmacy}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>

        <p className="text-xs text-slate-500 mb-4">{med.name} {med.dose}</p>

        <label className="block text-xs text-slate-400 mb-1.5">How many packs do you need?</label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="e.g. 20"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-3"
        />

        <label className="block text-xs text-slate-400 mb-1.5">Note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. covering three patients this week"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-4"
        />

        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2.5 text-xs text-slate-400 mb-4">
          This is your estimated need — it doesn't reveal {node.pharmacy}'s actual stock count, which stays private on the ledger.
        </div>

        <button
          disabled={!quantity || Number(quantity) < 1}
          onClick={() => onSubmit({ quantity: Number(quantity), note: note.trim() || null })}
          className="w-full rounded-lg bg-emerald-500 text-slate-950 text-sm font-medium py-2 disabled:bg-slate-700 disabled:text-slate-500 hover:bg-emerald-400 transition-colors"
        >
          Send request
        </button>
      </div>
    </div>
  );
}

function ExpiryModal({ defaultMedId, ownNodeId, onClose, onSubmit }) {
  const [medId, setMedId] = useState(defaultMedId);
  const [expiryDate, setExpiryDate] = useState("");
  const [batchSize, setBatchSize] = useState("Medium");
  const ownNode = NODES.find((n) => n.id === ownNodeId);
  const ownStock = STOCK[medId][ownNodeId];
  const match = findDeficitMatch(medId, ownNode);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-100 text-sm">Flag expiring surplus</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>

        <label className="block text-xs text-slate-400 mb-1.5">Medication</label>
        <select value={medId} onChange={(e) => setMedId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-3">
          {MEDS.map((m) => <option key={m.id} value={m.id}>{m.name} {m.dose}</option>)}
        </select>

        <label className="block text-xs text-slate-400 mb-1.5">Size of the expiring batch</label>
        <select value={batchSize} onChange={(e) => setBatchSize(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-1">
          <option>Small</option>
          <option>Medium</option>
          <option>Large</option>
        </select>
        <p className="text-[10px] text-slate-500 mb-3">This is just the batch that's expiring — not your total stock on hand.</p>

        <label className="block text-xs text-slate-400 mb-1.5">Your overall stock level (for context only)</label>
        <div className="mb-3"><LevelBar level={ownStock.level} /></div>

        <label className="block text-xs text-slate-400 mb-1.5">Batch expiry date</label>
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 mb-3" />

        <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2.5 text-xs text-slate-400 mb-4">
          {match
            ? <>Matched with <b className="text-slate-200">{match.pharmacy}</b> ({match.postcode}), currently {LEVEL_LABEL[STOCK[medId][match.id].level].toLowerCase()}. They'll need to accept it.</>
            : "No deficit node found within your chain or network partners right now — it'll stay listed until one appears."}
        </div>

        <button
          disabled={!expiryDate}
          onClick={() => onSubmit({ medId, expiryDate, batchSize })}
          className="w-full rounded-lg bg-emerald-500 text-slate-950 text-sm font-medium py-2 disabled:bg-slate-700 disabled:text-slate-500 hover:bg-emerald-400 transition-colors"
        >
          Send expiry alert
        </button>
      </div>
    </div>
  );
}

/* ============================= Root ============================= */

export default function App() {
  const [role, setRole] = useState("patient");
  const [requests, setRequests] = useState([]);
  const [signedInNodeId, setSignedInNodeId] = useState(null);

  function createRequest(payload) {
    setRequests((prev) => [
      ...prev,
      { id: `${payload.medId}-${payload.holderNodeId}-${Date.now()}`, status: "pending", createdAt: Date.now(), ...payload },
    ]);
  }

  function respondRequest(id, action) {
    setRequests((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target) return prev;
      const updated = prev.map((r) => (r.id === id ? { ...r, status: action } : r));
      if (action === "accepted") {
        // Close out any other pending claim on the same batch so it can't be double-approved.
        return updated.map((r) =>
          r.id !== id && r.holderNodeId === target.holderNodeId && r.medId === target.medId && r.status === "pending"
            ? { ...r, status: "unavailable" }
            : r
        );
      }
      return updated;
    });
  }

  function completeRequest(id) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "completed" } : r)));
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 via-emerald-400 to-amber-400 p-[1.5px]">
              <div className="h-full w-full rounded-[7px] bg-slate-950 flex items-center justify-center">
                <MapPin size={14} className="text-slate-100" />
              </div>
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
          Pilot demo data — figures are illustrative. {role === "patient" ? "Always confirm by phone before travelling for an urgent medication." : "Connect the live stock feed before this reflects real inventory."}
        </div>
      </div>

      {role === "patient" ? (
        <PatientView />
      ) : signedInNodeId ? (
        <PharmacistView
          requests={requests}
          createRequest={createRequest}
          respondRequest={respondRequest}
          completeRequest={completeRequest}
          signedInNodeId={signedInNodeId}
          onSignOut={() => setSignedInNodeId(null)}
        />
      ) : (
        <PharmacistSignIn onSignIn={setSignedInNodeId} />
      )}
    </div>
  );
}