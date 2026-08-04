import { useState, useMemo, useRef } from "react";
import {
  MapPin, TrendingUp, TrendingDown, Minus, Phone, Building2,
  ArrowRightLeft, Search, ShieldCheck, Navigation, ChevronDown, X,
  Bell, BellRing, Calendar, Check, Star, Activity, Zap
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

/* ============================= Mock domain data ============================= */

const MEDS = [
  { id: "ator", name: "Atorvastatin", dose: "20mg" },
  { id: "amlo", name: "Amlodipine", dose: "5mg" },
  { id: "omep", name: "Omeprazole", dose: "20mg" },
  { id: "levo", name: "Levothyroxine", dose: "50mcg" },
  { id: "metf", name: "Metformin", dose: "500mg" },
  { id: "rami", name: "Ramipril", dose: "2.5mg" },
];

const NODES = [
  { id: "ls1-1", postcode: "LS1 4DY", pharmacy: "Boar Lane Pharmacy", area: "LS1 City Centre", distanceMi: 0.2, phone: "0113 496 0021" },
  { id: "ls1-2", postcode: "LS1 5DR", pharmacy: "Wellington St. Chemist", area: "LS1 City Centre", distanceMi: 0.5, phone: "0113 496 0044" },
  { id: "ls1-3", postcode: "LS1 6EL", pharmacy: "Merrion Health Pharmacy", area: "LS1 City Centre", distanceMi: 0.7, phone: "0113 496 0078" },
  { id: "ls1-4", postcode: "LS1 3AX", pharmacy: "Kirkgate Community Pharmacy", area: "LS1 City Centre", distanceMi: 0.9, phone: "0113 496 0103" },
  { id: "ls13-1", postcode: "LS13 1AA", pharmacy: "Bramley Town St. Pharmacy", area: "LS13 Bramley", distanceMi: 2.4, phone: "0113 256 0012" },
  { id: "ls13-2", postcode: "LS13 2QF", pharmacy: "Broad Lane Chemist", area: "LS13 Bramley", distanceMi: 2.6, phone: "0113 256 0034" },
  { id: "ls13-3", postcode: "LS13 3JN", pharmacy: "Fairfield Pharmacy", area: "LS13 Bramley", distanceMi: 2.8, phone: "0113 256 0056" },
  { id: "ls13-4", postcode: "LS13 4RT", pharmacy: "Cape Sq. Pharmacy", area: "LS13 Bramley", distanceMi: 2.9, phone: "0113 256 0089" },
];

const PATEL_NODE_ID = "ls13-2";

const LEVELS = ["out", "low", "medium", "high"];
const LEVEL_LABEL = { out: "Out of stock", low: "Low stock", medium: "In stock", high: "Well stocked" };
const LEVEL_DOT = { out: "bg-rose-400", low: "bg-amber-400", medium: "bg-emerald-400", high: "bg-emerald-400" };
const LEVEL_TEXT = { out: "text-rose-400", low: "text-amber-400", medium: "text-emerald-400", high: "text-emerald-400" };
const LEVEL_BG = { 
  out: "bg-rose-500/10 border-rose-500/20 hover:border-rose-500/40", 
  low: "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40", 
  medium: "bg-slate-900/60 border-slate-700/60 hover:border-emerald-500/30", 
  high: "bg-slate-900/60 border-slate-700/60 hover:border-emerald-500/30" 
};

const BASE_COST = { ator: 2.85, amlo: 1.4, omep: 3.6, levo: 1.95, metf: 1.1, rami: 1.65 };

function seedRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

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

STOCK.omep[PATEL_NODE_ID] = { ...STOCK.omep[PATEL_NODE_ID], level: "low", trend: "falling" };
STOCK.amlo[PATEL_NODE_ID] = { ...STOCK.amlo[PATEL_NODE_ID], level: "high", trend: "steady" };
STOCK.amlo["ls1-3"] = { ...STOCK.amlo["ls1-3"], level: "out", trend: "falling" };

function findDeficitMatch(medId, excludeId) {
  const out = NODES.find((n) => n.id !== excludeId && STOCK[medId][n.id].level === "out");
  if (out) return out;
  return NODES.find((n) => n.id !== excludeId && STOCK[medId][n.id].level === "low") || null;
}

function Sparkline({ data, color }) {
  const points = data.map((v, i) => ({ i, v }));
  const gradientId = `colorGrad-${Math.random().toString(36).substring(2, 9)}`;
  return (
    <div style={{ width: 72, height: 32, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#${gradientId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendBadge({ trend }) {
  const map = {
    rising: { icon: TrendingUp, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Rising" },
    falling: { icon: TrendingDown, cls: "text-rose-400 bg-rose-500/10 border-rose-500/20", label: "Falling" },
    steady: { icon: Minus, cls: "text-slate-400 bg-slate-800/50 border-slate-700/50", label: "Steady" },
  };
  const { icon: Icon, cls, label } = map[trend];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      <Icon size={12} strokeWidth={2.5} />
      {label}
    </span>
  );
}

function LevelBar({ level }) {
  const filled = LEVELS.indexOf(level);
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-4 w-2 rounded-full transition-all duration-300 ${i < filled ? LEVEL_DOT[level] : "bg-slate-800"}`} />
        ))}
      </div>
      <span className={`text-xs font-semibold tracking-wide ${LEVEL_TEXT[level]}`}>{LEVEL_LABEL[level]}</span>
    </div>
  );
}

function trendColorHex(trend) {
  return trend === "rising" ? "#34d399" : trend === "falling" ? "#f43f5e" : "#94a3b8";
}

function MedPicker({ medId, setMedId }) {
  const [open, setOpen] = useState(false);
  const med = MEDS.find((m) => m.id === medId);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-gradient-to-r from-slate-900 to-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:border-emerald-500/50 transition-all shadow-lg group"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Search size={15} />
          </div>
          <span>{med.name}</span>
          <span className="text-xs font-normal text-slate-400 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono">{med.dose}</span>
        </div>
        <ChevronDown size={15} className="text-slate-400 group-hover:text-emerald-400 transition-transform duration-300" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-64 rounded-2xl border border-slate-700/80 bg-[#0b0f19]/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800/80 mb-1">
            Select Medication
          </div>
          {MEDS.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMedId(m.id); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all ${
                m.id === medId ? "bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/20" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <span>{m.name}</span>
              <span className="text-xs text-slate-400 font-mono">{m.dose}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toast({ text, tone = "emerald", onClose }) {
  const tones = {
    emerald: "border-emerald-500/30 text-emerald-200 bg-[#0b0f19]/95 shadow-emerald-950/50",
    amber: "border-amber-500/30 text-amber-200 bg-[#0b0f19]/95 shadow-amber-950/50",
  };
  return (
    <div className={`flex items-center gap-3 rounded-2xl border ${tones[tone]} px-5 py-3.5 text-sm shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300`}>
      <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
        <ShieldCheck size={18} />
      </div>
      <span className="font-medium">{text}</span>
      <button onClick={onClose} className="ml-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
        <X size={15} />
      </button>
    </div>
  );
}

function PatientView() {
  const [medId, setMedId] = useState(MEDS[0].id);
  const [notifyOn, setNotifyOn] = useState(new Set());
  const [showFeed, setShowFeed] = useState(false);
  const [feed, setFeed] = useState([]);
  const timers = useRef([]);

  const rows = useMemo(() => {
    return NODES.map((n) => ({ node: n, stock: STOCK[medId][n.id] }))
      .sort((a, b) => a.node.distanceMi - b.node.distanceMi);
  }, [medId]);

  function toggleNotify(node) {
    const key = `${medId}-${node.id}`;
    setNotifyOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        const med = MEDS.find((m) => m.id === medId);
        setFeed((f) => [{ id: `${key}-on`, text: `Notifications active for ${node.pharmacy}'s ${med.name} stock.` }, ...f]);
        const t = setTimeout(() => {
          setFeed((f) => [{ id: `${key}-${Date.now()}`, text: `🔔 Live Update: ${node.pharmacy} stock level changed.` }, ...f]);
          setShowFeed(true);
        }, 4500);
        timers.current.push(t);
      }
      return next;
    });
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between pb-6 border-b border-slate-800/80 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
            <Zap size={12} /> Patient Portal Active
          </div>
          <h2 className="font-extrabold text-slate-50 text-3xl tracking-tighter">Find your medication</h2>
          <p className="text-xs text-slate-400 mt-1">Live inventory radius near LS1 · Signed in as Bob</p>
        </div>
        <button
          onClick={() => setShowFeed((s) => !s)}
          className="relative rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3 text-slate-300 hover:text-white hover:border-emerald-500/50 transition-all shadow-lg group"
        >
          {feed.length ? <BellRing size={18} className="text-emerald-400 animate-pulse" /> : <Bell size={18} />}
          {feed.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-emerald-400 text-[10px] font-bold text-[#07090f] flex items-center justify-center shadow-lg">
              {feed.length}
            </span>
          )}
        </button>
      </div>

      {showFeed && (
        <div className="mb-6 rounded-2xl border border-slate-700/80 bg-[#0b0f19]/95 divide-y divide-slate-800/80 max-h-56 overflow-y-auto shadow-2xl backdrop-blur-xl">
          <div className="px-4 py-3 bg-slate-900/60 font-semibold text-xs text-slate-300 flex items-center justify-between">
            <span>Activity & Alert Feed</span>
            <span className="text-emerald-400">{feed.length} updates</span>
          </div>
          {feed.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-400">No notifications yet. Tap the bell icon on any pharmacy card to subscribe to live alerts.</p>
          ) : (
            feed.map((f) => (
              <p key={f.id} className="px-5 py-3.5 text-xs text-slate-200 flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {f.text}
              </p>
            ))
          )}
        </div>
      )}

      <div className="mb-6">
        <MedPicker medId={medId} setMedId={setMedId} />
      </div>

      <div className="space-y-4">
        {rows.map(({ node, stock }) => {
          const driveMin = Math.max(2, Math.round(node.distanceMi * 3));
          const warnDropping = stock.trend === "falling" && (stock.level === "low" || stock.level === "out");
          const key = `${medId}-${node.id}`;
          const notifying = notifyOn.has(key);
          return (
            <div 
              key={node.id} 
              className={`group rounded-3xl border p-6 ${LEVEL_BG[stock.level]} bg-slate-900/40 backdrop-blur-xl border-slate-700/50 shadow-2xl shadow-black/20 transition-all duration-300 hover:border-emerald-500/30 hover:translate-y-[-2px]`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 text-slate-100 font-bold text-base">
                    <div className="p-2 rounded-xl bg-slate-800/80 text-emerald-400 border border-slate-700">
                      <Building2 size={16} />
                    </div>
                    {node.pharmacy}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-300 mt-2 font-medium">
                    <span className="flex items-center gap-1.5 bg-black/30 px-2.5 py-1 rounded-md border border-slate-700/80">
                       <MapPin size={13} className="text-emerald-400" /> 
                       <span className="font-mono font-bold text-slate-100 tracking-wide">{node.postcode}</span>
                    </span>
                    <span>{node.distanceMi} mi</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-semibold">~{driveMin} min drive</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Sparkline data={stock.history} color={trendColorHex(stock.trend)} />
                  <button
                    onClick={() => toggleNotify(node)}
                    title="Toggle stock alert"
                    className={`p-2.5 rounded-xl border transition-all ${
                      notifying 
                        ? "border-emerald-500/50 text-emerald-300 bg-emerald-500/15 shadow-lg shadow-emerald-950/50" 
                        : "border-slate-700/80 text-slate-400 hover:text-white hover:bg-slate-800/80 bg-slate-900/60"
                    }`}
                  >
                    {notifying ? <BellRing size={16} /> : <Bell size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800/60">
                <LevelBar level={stock.level} />
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-300 font-semibold">£{stock.cost.toFixed(2)}</span>
                  <TrendBadge trend={stock.trend} />
                </div>
              </div>

              {warnDropping && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3">
                  <TrendingDown size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-rose-200 font-medium leading-relaxed">
                    Stock is currently dropping here. We recommend calling ahead before traveling to confirm availability.
                  </p>
                </div>
              )}

              <button
                disabled={stock.level === "out"}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 text-[#07090f] text-sm font-bold py-3 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 hover:from-emerald-300 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-950/30"
              >
                <Navigation size={16} />
                Get turn-by-turn directions
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PharmacistView({ listings, addListing }) {
  const [medId, setMedId] = useState(MEDS[0].id);
  const [ownNodeId, setOwnNodeId] = useState(PATEL_NODE_ID);
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const ownStock = STOCK[medId][ownNodeId];
  const ownShort = ownStock.level === "low" || ownStock.level === "out";

  const rows = useMemo(() => {
    const list = NODES.filter((n) => n.id !== ownNodeId).map((n) => ({ node: n, stock: STOCK[medId][n.id] }));
    if (ownShort) {
      list.sort((a, b) => LEVELS.indexOf(b.stock.level) - LEVELS.indexOf(a.stock.level));
    }
    return list;
  }, [medId, ownNodeId, ownShort]);

  const bestMatchId = ownShort ? rows.find((r) => r.stock.level === "high")?.node.id : null;

  function requestTransfer(node) {
    setToast({ text: `Secure transfer request sent to ${node.pharmacy}`, tone: "emerald" });
    setTimeout(() => setToast(null), 3200);
  }

  const ownListings = listings.filter((l) => l.fromNodeId === ownNodeId);
  const incomingForOwn = listings.filter((l) => l.matchedNodeId === ownNodeId && l.medId === medId);

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold mb-2">
            <Activity size={12} /> Pharmacist Ledger Node Active
          </div>
          <h2 className="font-extrabold text-slate-50 text-3xl tracking-tighter">Network stock overview</h2>
          <p className="text-xs text-slate-400 mt-1">Viewing as active cryptographic inventory node</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={ownNodeId}
            onChange={(e) => setOwnNodeId(e.target.value)}
            className="rounded-xl border border-slate-700/80 bg-[#0b0f19] px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-lg focus:border-emerald-500 focus:outline-none"
          >
            {NODES.map((n) => (
              <option key={n.id} value={n.id}>{n.pharmacy} · {n.postcode}</option>
            ))}
          </select>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 text-sm font-bold hover:bg-emerald-500/30 transition-all shadow-lg"
          >
            <Calendar size={16} />
            Flag expiring surplus
          </button>
        </div>
      </div>

      <div className="mb-6">
        <MedPicker medId={medId} setMedId={setMedId} />
      </div>

      {ownShort && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-5 py-4 text-sm text-rose-200 shadow-lg backdrop-blur-xl">
          <TrendingDown size={18} className="mt-0.5 flex-shrink-0 text-rose-400" />
          <div>
            <span className="font-bold">Low Inventory Alert:</span> Your {MEDS.find((m) => m.id === medId).name} stock is {LEVEL_LABEL[ownStock.level].toLowerCase()}.
            {bestMatchId ? " The strongest surplus match in the network is highlighted below." : " No strong surplus match found nearby right now."}
          </div>
        </div>
      )}

      {incomingForOwn.length > 0 && (
        <div className="mb-6 space-y-3">
          {incomingForOwn.map((l) => {
            const from = NODES.find((n) => n.id === l.fromNodeId);
            return (
              <div key={l.id} className="flex items-center justify-between gap-4 rounded-2xl bg-violet-500/10 border border-violet-500/30 px-5 py-4 text-sm text-violet-200 shadow-lg backdrop-blur-xl">
                <span>
                  <strong className="text-white">{from.pharmacy}</strong> flagged surplus {MEDS.find((m) => m.id === l.medId).name} expiring <b className="text-amber-300">{l.expiryDate}</b> for your branch.
                </span>
                <button
                  onClick={() => requestTransfer(from)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 text-white px-4 py-2 text-xs font-bold hover:bg-violet-400 transition-all shadow-md"
                >
                  <Check size={14} /> Accept Transfer
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/40 shadow-2xl backdrop-blur-xl">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-slate-800 bg-[#07090f]/90 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              <th className="px-6 py-4">Node Location</th>
              <th className="px-6 py-4">Stock Level</th>
              <th className="px-6 py-4">Trend & History</th>
              <th className="px-6 py-4">Cost</th>
              <th className="px-6 py-4">Pharmacy & Contact</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map(({ node, stock }, idx) => {
              const listing = listings.find((l) => l.fromNodeId === node.id && l.medId === medId);
              const isBest = node.id === bestMatchId;
              return (
                <tr key={node.id} className={`${isBest ? "bg-emerald-500/10 font-medium" : idx % 2 ? "bg-slate-900/40" : "bg-transparent"} hover:bg-slate-800/50 transition-colors`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-100 font-bold font-mono">{node.postcode}</span>
                      {isBest && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 border border-emerald-500/40 shadow-sm">
                          <Star size={11} /> Best Match
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{node.area}</div>
                  </td>
                  <td className="px-6 py-4">
                    <LevelBar level={stock.level} />
                    {listing && (
                      <div className="mt-1 text-[11px] font-semibold text-amber-400">Expires {listing.expiryDate}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Sparkline data={stock.history} color={trendColorHex(stock.trend)} />
                      <TrendBadge trend={stock.trend} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-200 font-mono text-xs font-semibold">£{stock.cost.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <div className="text-slate-100 font-semibold">{node.pharmacy}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-1 font-mono">
                      <Phone size={12} className="text-emerald-400" /> {node.phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      disabled={stock.level === "out"}
                      onClick={() => requestTransfer(node)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-bold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-30 disabled:hover:border-slate-700 transition-all shadow-sm"
                    >
                      <ArrowRightLeft size={13} />
                      Request Transfer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ownListings.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Your Active Surplus Listings</p>
          <div className="space-y-3">
            {ownListings.map((l) => {
              const matched = NODES.find((n) => n.id === l.matchedNodeId);
              return (
                <div key={l.id} className="flex items-center justify-between rounded-2xl bg-[#0b0f19] border border-slate-800 px-5 py-3.5 text-sm shadow-lg">
                  <span className="text-slate-300 font-medium">
                    {MEDS.find((m) => m.id === l.medId).name} · Expires <b className="text-amber-300">{l.expiryDate}</b>
                  </span>
                  <span className="text-xs text-emerald-400 font-semibold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    {matched ? `Matched & Routed to ${matched.pharmacy}` : "Broadcasting to network..."}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500 leading-relaxed font-medium">
        🔒 Inventory levels are securely displayed as cryptographic bands. Individual pharmacies' precise stock counts remain private on the ledger.
      </p>

      {toast && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40"><Toast text={toast.text} tone={toast.tone} onClose={() => setToast(null)} /></div>}

      {modalOpen && (
        <ExpiryModal
          defaultMedId={medId}
          ownNodeId={ownNodeId}
          onClose={() => setModalOpen(false)}
          onSubmit={(payload) => {
            const match = findDeficitMatch(payload.medId, ownNodeId);
            addListing({ ...payload, fromNodeId: ownNodeId, matchedNodeId: match?.id ?? null, id: `${payload.medId}-${ownNodeId}-${Date.now()}` });
            setModalOpen(false);
            setToast({
              text: match ? `Expiry alert broadcasted to ${match.pharmacy}` : "Surplus listed on network ledger",
              tone: match ? "emerald" : "amber",
            });
            setTimeout(() => setToast(null), 3400);
          }}
        />
      )}
    </div>
  );
}

function ExpiryModal({ defaultMedId, ownNodeId, onClose, onSubmit }) {
  const [medId, setMedId] = useState(defaultMedId);
  const [expiryDate, setExpiryDate] = useState("");
  const ownStock = STOCK[medId][ownNodeId];
  const match = findDeficitMatch(medId, ownNodeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md px-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl border border-slate-700/80 bg-[#0b0f19] p-7 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-100 text-lg">Flag expiring surplus</h3>
          <button onClick={onClose} className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><X size={18} /></button>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Medication</label>
        <select
          value={medId}
          onChange={(e) => setMedId(e.target.value)}
          className="w-full rounded-xl border border-slate-700/80 bg-[#07090f] px-4 py-3 text-sm font-semibold text-slate-100 mb-5 focus:outline-none focus:border-emerald-500"
        >
          {MEDS.map((m) => <option key={m.id} value={m.id}>{m.name} {m.dose}</option>)}
        </select>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Your current node level</label>
        <div className="mb-5 p-3 rounded-xl bg-[#07090f] border border-slate-800"><LevelBar level={ownStock.level} /></div>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Batch expiry date</label>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="w-full rounded-xl border border-slate-700/80 bg-[#07090f] px-4 py-3 text-sm font-semibold text-slate-100 mb-5 focus:outline-none focus:border-emerald-500"
        />

        <div className="rounded-2xl bg-[#07090f] border border-slate-800 p-4 text-xs text-slate-300 mb-6 leading-relaxed">
          {match
            ? <>💡 Automatically matched with <b className="text-white">{match.pharmacy}</b> ({match.postcode}), currently {LEVEL_LABEL[STOCK[medId][match.id].level].toLowerCase()}.</>
            : "🔍 No immediate deficit node found — batch will be listed on the network ledger until requested."}
        </div>

        <button
          disabled={!expiryDate}
          onClick={() => onSubmit({ medId, expiryDate })}
          className="w-full rounded-xl bg-emerald-400 text-[#07090f] text-sm font-bold py-3.5 disabled:bg-slate-800 disabled:text-slate-600 hover:bg-emerald-300 transition-all shadow-xl shadow-emerald-950/40"
        >
          Broadcast expiry alert
        </button>
      </div>
    </div>
  );
}

export default function MapMyMedsPersonas() {
  const [role, setRole] = useState("patient");
  const [listings, setListings] = useState([]);

  function addListing(listing) {
    setListings((prev) => [...prev, listing]);
  }

  return (
    <div className="min-h-screen bg-[#07090f] bg-[radial-gradient(ellipse_at_top,#1a1d24,#07090f)] p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-4xl bg-slate-900/60 backdrop-blur-2xl rounded-3xl border border-slate-700/60 shadow-2xl overflow-hidden font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-[#07090f]">
        <header className="border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-xl sticky top-0 z-30 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 via-emerald-400 to-amber-400 p-[1.5px] shadow-lg shadow-emerald-950/50">
                <div className="h-full w-full rounded-[14.5px] bg-[#07090f] flex items-center justify-center">
                  <MapPin size={18} className="text-emerald-400" />
                </div>
              </div>
              <div>
                <div className="font-black text-slate-100 text-lg tracking-tight leading-tight flex items-center gap-2">
                  MapMyMeds <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">v2.0</span>
                </div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-0.5">Leeds Pilot · LS1 &amp; LS13</div>
              </div>
            </div>

            <div className="flex items-center rounded-2xl border border-slate-700/80 bg-[#07090f] p-1 shadow-lg">
              <button
                onClick={() => setRole("patient")}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  role === "patient" ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-[#07090f] shadow-lg shadow-emerald-950/50" : "text-slate-400 hover:text-white"
                }`}
              >
                Patient View
              </button>
              <button
                onClick={() => setRole("pharmacist")}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  role === "pharmacist" ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-[#07090f] shadow-lg shadow-emerald-950/50" : "text-slate-400 hover:text-white"
                }`}
              >
                Pharmacist View
              </button>
            </div>
          </div>
        </header>

        <div className="px-6 pt-5">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-5 py-4 text-xs text-amber-200 shadow-lg backdrop-blur-xl">
            <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <div className="font-medium leading-relaxed">
              <strong className="text-amber-300 font-bold">Leeds Pilot Notice:</strong> Demo data is illustrative for the August 7 launch. {role === "patient"
                ? "Always confirm by phone before travelling for urgent medication."
                : "Cryptographic stock feeds must be connected prior to live pharmacy synchronization."}
            </div>
          </div>
        </div>

        {role === "patient" ? <PatientView /> : <PharmacistView listings={listings} addListing={addListing} />}
      </div>
    </div>
  );
}