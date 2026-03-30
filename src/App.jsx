import { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Download, AlertTriangle, Clock,
  CheckCircle, XCircle, Pause, FlaskConical, BarChart3, Calendar, Edit3,
  Save, X, User, Server, Shield, Monitor, Headphones, Layers, Search,
  List, LayoutGrid, ArrowRight, GripVertical, Square, CheckSquare,
  FolderOpen, Filter, ChevronUp, Zap, MoveRight, LogOut
} from "lucide-react";
import { auth, signOut } from "./firebase";

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   CONFIGURATION
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

const STATUS_OPTIONS = ["Not Started", "In Progress", "Testing in Lab", "Done", "On Hold", "Blocked"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const OWNER_OPTIONS = ["Dave Faucher", "Craig Renaud", "Eric Handley", "Suzanne Fleury", "Unassigned"];

const STATUS_CONFIG = {
  "Not Started": { color: "bg-gray-100 text-gray-600", icon: Clock, dot: "bg-gray-400", ring: "ring-gray-200" },
  "In Progress": { color: "bg-blue-50 text-blue-700", icon: BarChart3, dot: "bg-blue-500", ring: "ring-blue-200" },
  "Testing in Lab": { color: "bg-purple-50 text-purple-700", icon: FlaskConical, dot: "bg-purple-500", ring: "ring-purple-200" },
  "Done": { color: "bg-emerald-50 text-emerald-700", icon: CheckCircle, dot: "bg-emerald-500", ring: "ring-emerald-200" },
  "On Hold": { color: "bg-amber-50 text-amber-700", icon: Pause, dot: "bg-amber-500", ring: "ring-amber-200" },
  "Blocked": { color: "bg-red-50 text-red-700", icon: XCircle, dot: "bg-red-500", ring: "ring-red-200" },
};

const PRIORITY_CONFIG = {
  High: { color: "text-red-700 bg-red-50", dot: "bg-red-500", border: "border-red-200" },
  Medium: { color: "text-amber-700 bg-amber-50", dot: "bg-amber-500", border: "border-amber-200" },
  Low: { color: "text-green-700 bg-green-50", dot: "bg-green-500", border: "border-green-200" },
};

const AREAS = [
  "Enterprise Systems",
  "Infrastructure & Cyber Security",
  "POS & Store Technology",
  "Store Expansion",
  "Resource Center & Support",
];

const AREA_CONFIG = {
  "Enterprise Systems":              { icon: Server,     gradient: "from-blue-600 to-indigo-600",  bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700",    light: "bg-blue-100" },
  "Infrastructure & Cyber Security": { icon: Shield,     gradient: "from-emerald-600 to-teal-600", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", light: "bg-emerald-100" },
  "POS & Store Technology":          { icon: Monitor,    gradient: "from-violet-600 to-purple-600",bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-700",  light: "bg-violet-100" },
  "Store Expansion":                 { icon: Layers,     gradient: "from-orange-500 to-amber-600", bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-700",  light: "bg-orange-100" },
  "Resource Center & Support":       { icon: Headphones, gradient: "from-rose-500 to-pink-600",    bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    light: "bg-rose-100" },
};

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   INITIAL PROJECT DATA  (updated March 30 2026 from Notion / Asana / 1:1s)
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

const initialProjects = [
  // ââ Enterprise Systems ââ
  { id: 1,  area: "Enterprise Systems", name: "E-Commerce Migration (Magento â Easy Commerce)", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 25, date: "9/30/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Migration from Magento platform to Easy Commerce" },
  { id: 2,  area: "Enterprise Systems", name: "YODA (Power BI Analytics)", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "Basket Builders report redesign; AR aging report in dev", nextSteps: "Matillion upgrade (time-sensitive)", notes: "Business intelligence and analytics platform" },
  { id: 3,  area: "Enterprise Systems", name: "Power BI / Fabric (Presidio)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Data platform modernization with Presidio" },
  { id: 4,  area: "Enterprise Systems", name: "In-house A/R Module", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 50, date: "6/30/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Custom accounts receivable module development" },
  { id: 7,  area: "Enterprise Systems", name: "Ideal Software Integration", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Ideal software system integration" },
  { id: 8,  area: "Enterprise Systems", name: "Mi9 Bug Fixes & Enhancements", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing Mi9 retail system maintenance" },
  { id: 6,  area: "Enterprise Systems", name: "Sport 2.0", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Next generation sporting goods system" },
  { id: 30, area: "Enterprise Systems", name: "Matillion Upgrade", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "Time-sensitive â due within 1-2 weeks", milestones: "", nextSteps: "Complete upgrade ASAP", notes: "ETL platform upgrade â flagged in YODA review 3/13" },
  { id: 31, area: "Enterprise Systems", name: "OpenFlow Migration POC", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "Evaluating proof of concept", nextSteps: "", notes: "From YODA review â evaluating migration path" },

  // ââ Infrastructure & Cyber Security ââ
  { id: 9,  area: "Infrastructure & Cyber Security", name: "Windows 11 Upgrade", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "Weekly status meetings Wed 1pm", nextSteps: "", notes: "Enterprise-wide Windows 11 migration before end of support" },
  { id: 10, area: "Infrastructure & Cyber Security", name: "Cybersecurity Program", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "PCI compliance, CrowdStrike, Sophos, Mimecast, KnowBe4, Keeper" },
  { id: 11, area: "Infrastructure & Cyber Security", name: "Store Conversions / IT Alignment", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "Aggressive 6-week timelines; vendor scheduling issues with IW", milestones: "73-75 store projects completed successfully", nextSteps: "Low-voltage cabling SOP to Mark; pre-project meetings for next 3-4 projects; floor plan markups for APs and Cat5 drops", notes: "IT infrastructure for store conversions â process significantly improved" },
  { id: 12, area: "Infrastructure & Cyber Security", name: "Delivery Pilot (IT Component)", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "4/7/2026", roadblocks: "DMS vendor lacks bulk import; daily product data updates difficult", milestones: "Store 218 South Burlington â 5,000 sq ft warehouse space secured", nextSteps: "Set up separate VLAN; order 2 PCs, 2 phones, label printers; WorkWave driver login setup", notes: "Soft launch early April â starting with 6 stores, could scale to 50" },
  { id: 32, area: "Infrastructure & Cyber Security", name: "WiFi Speaker Evaluation", owner: "Craig Renaud", status: "Not Started", priority: "Low", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "Craig & Evan to investigate WiFi speakers vs. wired; review IW bills to separate speaker wiring costs", notes: "Cost-effective alternative to wired audio â from store alignment 1:1" },

  // ââ POS & Store Technology ââ
  { id: 17, area: "POS & Store Technology", name: "Tokenization", owner: "Eric Handley", status: "In Progress", priority: "High", pct: 75, date: "3/31/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Payment tokenization â CRITICAL DEADLINE" },
  { id: 18, area: "POS & Store Technology", name: "B2B Features & Employee Discount", owner: "Eric Handley", status: "In Progress", priority: "High", pct: 75, date: "3/31/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "B2B functionality â CRITICAL DEADLINE" },
  { id: 19, area: "POS & Store Technology", name: "Mobile POS", owner: "Eric Handley", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Mobile point of sale deployment" },
  { id: 20, area: "POS & Store Technology", name: "Theatro (Motorola Solutions)", owner: "Eric Handley", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "In-store communication platform" },
  { id: 5,  area: "POS & Store Technology", name: "EZAD TV (Digital Signage)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Digital signage rollout across stores" },

  // ââ Store Expansion ââ
  { id: 13, area: "Store Expansion", name: "237 Cumberland RI", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "Completing smoothly per 1:1", nextSteps: "", notes: "New store acquisition â IT setup and integration" },
  { id: 14, area: "Store Expansion", name: "233 Ithaca Downtown", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition â POS equipment installation" },
  { id: 15, area: "Store Expansion", name: "234 Ithaca Triphammer", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition â IT setup and integration" },
  { id: 16, area: "Store Expansion", name: "236 Dover PA", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition â IT setup and integration" },

  // ââ Resource Center & Support ââ
  { id: 21, area: "Resource Center & Support", name: "Resource Center / Help Desk Operations", owner: "Suzanne Fleury", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Help desk management and improvements" },
  { id: 22, area: "Resource Center & Support", name: "POS Team Support", owner: "Suzanne Fleury", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "POS system support for stores" },
];

const initialQuickTasks = [
  { id: 501, text: "Texting to Store Phones â evaluate options", done: false, owner: "Unassigned", source: "Asana Intake" },
  { id: 502, text: "WiFi registers setup for new locations", done: false, owner: "Craig Renaud", source: "Asana Intake" },
  { id: 503, text: "Stop Key Entry on Credit Cards", done: false, owner: "Eric Handley", source: "Asana Intake" },
  { id: 504, text: "WorldPay / Authorize.net / Apple Pay / Google Pay integration", done: false, owner: "Eric Handley", source: "Asana Intake" },
  { id: 505, text: "Weather forecast data expansion for stores 220+", done: false, owner: "Dave Faucher", source: "YODA Review" },
  { id: 506, text: "Loss prevention data refinement", done: false, owner: "Dave Faucher", source: "YODA Review" },
  { id: 507, text: "Craig to send low-voltage cabling SOP to Mark", done: false, owner: "Craig Renaud", source: "1:1 3/4" },
  { id: 508, text: "Craig to introduce Mark to IW vendor", done: false, owner: "Craig Renaud", source: "1:1 3/4" },
];

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   SMALL REUSABLE COMPONENTS
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function Dropdown({ value, options, onChange, renderOption, renderTrigger }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="focus:outline-none">{renderTrigger(value)}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px]" style={{ left: 0 }}>
            {options.map((opt) => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 transition-colors">
                {renderOption(opt)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, onChange, size = "sm" }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Not Started"];
  const Icon = cfg.icon;
  const sizeClass = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <Dropdown value={status} options={STATUS_OPTIONS} onChange={onChange}
      renderTrigger={(v) => (
        <span className={`inline-flex items-center gap-1.5 ${sizeClass} rounded-full font-medium ${cfg.color} cursor-pointer hover:ring-2 ${cfg.ring} transition-all`}>
          <Icon size={size === "xs" ? 10 : 12} />{v}<ChevronDown size={9} className="opacity-50" />
        </span>
      )}
      renderOption={(s) => {
        const c = STATUS_CONFIG[s];
        const I = c.icon;
        return <><span className={`w-2 h-2 rounded-full ${c.dot}`} /><I size={12} className="opacity-60" />{s}</>;
      }}
    />
  );
}

function PriorityBadge({ priority, onChange, size = "sm" }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG["Medium"];
  const sizeClass = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <Dropdown value={priority} options={PRIORITY_OPTIONS} onChange={onChange}
      renderTrigger={(v) => (
        <span className={`inline-flex items-center gap-1.5 ${sizeClass} rounded-full font-medium ${cfg.color} border ${cfg.border} cursor-pointer hover:opacity-80 transition-all`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{v}<ChevronDown size={9} className="opacity-50" />
        </span>
      )}
      renderOption={(p) => <><span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />{p}</>}
    />
  );
}

function OwnerBadge({ owner, onChange, size = "sm" }) {
  const sizeClass = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  const initials = owner === "Unassigned" ? "?" : owner.split(" ").map(n => n[0]).join("");
  return (
    <Dropdown value={owner} options={OWNER_OPTIONS} onChange={onChange}
      renderTrigger={(v) => (
        <span className={`inline-flex items-center gap-1.5 ${sizeClass} rounded-full font-medium bg-gray-50 text-gray-600 border border-gray-200 cursor-pointer hover:bg-gray-100 transition-all`}>
          <span className="w-4 h-4 rounded-full bg-gray-200 text-[9px] font-bold flex items-center justify-center text-gray-500">{initials}</span>
          {v}<ChevronDown size={9} className="opacity-50" />
        </span>
      )}
      renderOption={(o) => <><User size={12} className="text-gray-400" />{o}</>}
    />
  );
}

function MoveToArea({ currentArea, onMove }) {
  const [open, setOpen] = useState(false);
  const otherAreas = AREAS.filter(a => a !== currentArea);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="text-gray-300 hover:text-blue-500 transition-colors" title="Move to another area">
        <MoveRight size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px]">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move toâ¦</div>
            {otherAreas.map(a => {
              const cfg = AREA_CONFIG[a];
              const Icon = cfg.icon;
              return (
                <button key={a} onClick={() => { onMove(a); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 transition-colors">
                  <Icon size={14} className={cfg.text} />{a}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ProgressBar({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  const color = value >= 75 ? "bg-emerald-500" : value >= 40 ? "bg-blue-500" : value > 0 ? "bg-amber-500" : "bg-gray-200";

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input type="number" min="0" max="100" value={temp} onChange={(e) => setTemp(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className="w-14 px-2 py-0.5 text-xs border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { onChange(temp); setEditing(false); } if (e.key === "Escape") { setTemp(value); setEditing(false); } }} />
        <span className="text-[10px] text-gray-400">%</span>
        <button onClick={() => { onChange(temp); setEditing(false); }} className="text-emerald-500 hover:text-emerald-700"><Save size={12} /></button>
        <button onClick={() => { setTemp(value); setEditing(false); }} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>
      </div>
    );
  }

  return (
    <button onClick={() => { setTemp(value); setEditing(true); }} className="flex items-center gap-2 w-full group cursor-pointer">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(value, 2)}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-gray-500 w-8 text-right tabular-nums">{value}%</span>
    </button>
  );
}

function InlineEdit({ value, onChange, placeholder, multiline = false, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <div className="flex items-start gap-1">
        <Tag value={temp} onChange={(e) => setTemp(e.target.value)} className={`flex-1 px-2 py-1 text-xs border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 ${multiline ? "min-h-[44px] resize-y" : ""}`} placeholder={placeholder} autoFocus onKeyDown={(e) => { if (!multiline && e.key === "Enter") { onChange(temp); setEditing(false); } if (e.key === "Escape") { setTemp(value); setEditing(false); } }} />
        <button onClick={() => { onChange(temp); setEditing(false); }} className="mt-0.5 text-emerald-500 hover:text-emerald-700"><Save size={12} /></button>
        <button onClick={() => { setTemp(value); setEditing(false); }} className="mt-0.5 text-gray-300 hover:text-gray-500"><X size={12} /></button>
      </div>
    );
  }

  return (
    <button onClick={() => { setTemp(value); setEditing(true); }} className={`text-left text-xs text-gray-600 hover:text-gray-900 group flex items-center gap-1 w-full ${className}`}>
      <span className={value ? "" : "text-gray-300 italic"}>{value || placeholder}</span>
      <Edit3 size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   SUMMARY CARD
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function SummaryCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className={`${bg} rounded-xl p-4 border border-gray-100`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <Icon size={16} className={`${color} opacity-40`} />
      </div>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   PROJECT CARD VIEW
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function ProjectCard({ project, onUpdate, onDelete, onMove }) {
  const [expanded, setExpanded] = useState(false);
  const isAlert = project.priority === "High" && project.pct < 100 && project.date && project.date.includes("3/31");

  return (
    <div className={`bg-white rounded-xl border ${isAlert ? "border-red-300 ring-1 ring-red-100" : "border-gray-200/80"} hover:shadow-md hover:border-gray-300 transition-all duration-200 group`}>
      {isAlert && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-red-50 to-red-100/50 rounded-t-xl border-b border-red-100">
          <AlertTriangle size={11} className="text-red-500" />
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Due 3/31 â Critical</span>
        </div>
      )}
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <InlineEdit value={project.name} onChange={(v) => onUpdate(project.id, "name", v)} placeholder="Project name" className="font-semibold text-sm text-gray-900" />
            {project.notes && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{project.notes}</p>}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoveToArea currentArea={project.area} onMove={(a) => onMove(project.id, a)} />
            <button onClick={() => onDelete(project.id)} className="text-gray-300 hover:text-red-400 transition-colors" title="Remove"><Trash2 size={13} /></button>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} size="xs" />
          <PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} size="xs" />
          <OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" />
          {project.date && (
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
              <Calendar size={9} />{project.date}
            </span>
          )}
        </div>

        {/* Progress */}
        <ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} />

        {/* Expand toggle */}
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 mt-2.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {expanded ? "Less" : "Details"}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
            {[
              ["Go-Live Date", "date", "Target date...", false],
              ["Roadblocks", "roadblocks", "Any blockers or risks...", true],
              ["Milestones", "milestones", "What was accomplished...", true],
              ["Next Steps", "nextSteps", "Planned actions...", true],
              ["Notes", "notes", "Additional notes...", true],
            ].map(([label, field, ph, multi]) => (
              <div key={field}>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
                <InlineEdit value={project[field]} onChange={(v) => onUpdate(project.id, field, v)} placeholder={ph} multiline={multi} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   LIST VIEW ROW
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function ProjectRow({ project, onUpdate, onDelete, onMove, showArea = false }) {
  const [expanded, setExpanded] = useState(false);
  const isAlert = project.priority === "High" && project.pct < 100 && project.date && project.date.includes("3/31");
  const areaCfg = AREA_CONFIG[project.area];

  return (
    <>
      <tr className={`group border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${isAlert ? "bg-red-50/30" : ""}`}>
        <td className="py-2.5 px-3 w-8">
          <button onClick={() => setExpanded(!expanded)} className="text-gray-300 hover:text-gray-500">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </td>
        {showArea && (
          <td className="py-2.5 px-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${areaCfg.text} ${areaCfg.bg} px-2 py-0.5 rounded-full`}>
              {project.area.split(" ")[0]}
            </span>
          </td>
        )}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            {isAlert && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
            <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{project.name}</span>
          </div>
        </td>
        <td className="py-2.5 px-2"><StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} size="xs" /></td>
        <td className="py-2.5 px-2"><PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} size="xs" /></td>
        <td className="py-2.5 px-2"><OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" /></td>
        <td className="py-2.5 px-2 w-32"><ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} /></td>
        <td className="py-2.5 px-2 text-xs text-gray-500 whitespace-nowrap">{project.date || "â"}</td>
        <td className="py-2.5 px-2">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoveToArea currentArea={project.area} onMove={(a) => onMove(project.id, a)} />
            <button onClick={() => onDelete(project.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={showArea ? 9 : 8} className="px-12 py-3">
            <div className="grid grid-cols-2 gap-3 max-w-3xl">
              {[
                ["Roadblocks", "roadblocks", true],
                ["Milestones", "milestones", true],
                ["Next Steps", "nextSteps", true],
                ["Notes", "notes", true],
              ].map(([label, field, multi]) => (
                <div key={field}>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
                  <InlineEdit value={project[field]} onChange={(v) => onUpdate(project.id, field, v)} placeholder={`Add ${label.toLowerCase()}...`} multiline={multi} />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   QUICK TASKS SECTION
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function QuickTasks({ tasks, setTasks }) {
  const [newText, setNewText] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const addTask = () => {
    if (!newText.trim()) return;
    setTasks(prev => [...prev, { id: Date.now(), text: newText.trim(), done: false, owner: "Unassigned", source: "Manual" }]);
    setNewText("");
  };

  const toggleTask = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));

  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-gray-900 text-sm">Quick Tasks & One-offs</h3>
            <p className="text-[11px] text-gray-400">{pending.length} pending Â· {done.length} done</p>
          </div>
        </div>
        {collapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">
          {/* Add new */}
          <div className="px-5 py-3 bg-gray-50/50 flex items-center gap-2">
            <Plus size={14} className="text-gray-400" />
            <input value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} className="flex-1 bg-transparent text-sm placeholder-gray-300 focus:outline-none" placeholder="Add a quick task..." />
            {newText && <button onClick={addTask} className="text-xs font-medium text-blue-600 hover:text-blue-800">Add</button>}
          </div>

          {/* Pending tasks */}
          <div className="divide-y divide-gray-50">
            {pending.map(task => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-2.5 group hover:bg-gray-50/50 transition-colors">
                <button onClick={() => toggleTask(task.id)} className="text-gray-300 hover:text-emerald-500 transition-colors flex-shrink-0">
                  <Square size={16} />
                </button>
                <span className="flex-1 text-sm text-gray-700">{task.text}</span>
                <span className="text-[10px] text-gray-300 font-medium">{task.source}</span>
                <span className="text-[10px] text-gray-400">{task.owner !== "Unassigned" ? task.owner.split(" ")[1] : ""}</span>
                <button onClick={() => removeTask(task.id)} className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X size={12} /></button>
              </div>
            ))}
          </div>

          {/* Done tasks */}
          {done.length > 0 && (
            <div className="border-t border-gray-100">
              <div className="px-5 py-1.5 bg-gray-50/50">
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Completed ({done.length})</span>
              </div>
              {done.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-2 group hover:bg-gray-50/50 transition-colors">
                  <button onClick={() => toggleTask(task.id)} className="text-emerald-500 flex-shrink-0"><CheckSquare size={16} /></button>
                  <span className="flex-1 text-sm text-gray-400 line-through">{task.text}</span>
                  <button onClick={() => removeTask(task.id)} className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   AREA SECTION (Card View)
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function AreaSection({ area, projects, onUpdate, onDelete, onAdd, onMove }) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = AREA_CONFIG[area];
  const Icon = cfg.icon;
  const totalPct = projects.length ? Math.round(projects.reduce((s, p) => s + p.pct, 0) / projects.length) : 0;
  const counts = {
    high: projects.filter(p => p.priority === "High").length,
    blocked: projects.filter(p => p.status === "Blocked" || p.status === "On Hold").length,
    done: projects.filter(p => p.status === "Done").length,
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-3 group">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white shadow-sm`}>
            <Icon size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-[15px]">
              {area}
              {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </h3>
            <p className="text-[11px] text-gray-400">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {counts.high > 0 && <span className="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded-lg font-semibold">{counts.high} high</span>}
          {counts.blocked > 0 && <span className="bg-amber-50 text-amber-600 text-[10px] px-2 py-1 rounded-lg font-semibold">{counts.blocked} blocked</span>}
          <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded-lg">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${totalPct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-gray-600 tabular-nums">{totalPct}%</span>
          </div>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map(p => <ProjectCard key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} onMove={onMove} />)}
          </div>
          <button onClick={() => onAdd(area)} className="mt-2.5 flex items-center gap-2 text-xs text-gray-400 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50 border border-dashed border-gray-200 hover:border-blue-300 w-full justify-center">
            <Plus size={13} /> Add project
          </button>
        </>
      )}
    </div>
  );
}

/* âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   MAIN DASHBOARD
   âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

export default function Dashboard() {
  const [projects, setProjects] = useState(initialProjects);
  const [quickTasks, setQuickTasks] = useState(initialQuickTasks);
  const [nextId, setNextId] = useState(200);
  const [view, setView] = useState("cards"); // "cards" | "list"
  const [filterOwner, setFilterOwner] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [exportMsg, setExportMsg] = useState("");

  // ââ Derived data ââ
  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filterOwner !== "All" && p.owner !== filterOwner) return false;
      if (filterStatus !== "All" && p.status !== filterStatus) return false;
      if (filterPriority !== "All" && p.priority !== filterPriority) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.notes.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [projects, filterOwner, filterStatus, filterPriority, searchQuery]);

  const grouped = useMemo(() => {
    const g = {};
    for (const a of AREAS) g[a] = [];
    for (const p of filtered) {
      if (g[p.area]) g[p.area].push(p);
    }
    return g;
  }, [filtered]);

  const stats = useMemo(() => {
    const all = projects;
    return {
      total: all.length,
      inProgress: all.filter(p => p.status === "In Progress").length,
      highPriority: all.filter(p => p.priority === "High").length,
      avgProgress: all.length ? Math.round(all.reduce((s, p) => s + p.pct, 0) / all.length) : 0,
      blocked: all.filter(p => p.status === "Blocked" || p.status === "On Hold").length,
      done: all.filter(p => p.status === "Done").length,
    };
  }, [projects]);

  const alerts = projects.filter(p => p.priority === "High" && p.pct < 100 && p.date && p.date.includes("3/31"));
  const hasFilters = filterOwner !== "All" || filterStatus !== "All" || filterPriority !== "All" || searchQuery;

  // ââ Handlers ââ
  const handleUpdate = (id, field, value) => setProjects(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  const handleDelete = (id) => setProjects(prev => prev.filter(p => p.id !== id));
  const handleMove = (id, newArea) => setProjects(prev => prev.map(p => p.id === id ? { ...p, area: newArea } : p));
  const handleAdd = (area) => {
    setProjects(prev => [...prev, { id: nextId, area, name: "New Project", owner: "Unassigned", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "" }]);
    setNextId(n => n + 1);
  };

  const handleExport = () => {
    const rows = [["Area", "Project", "Owner", "Status", "Priority", "% Complete", "Date", "Roadblocks", "Milestones", "Next Steps", "Notes"]];
    for (const p of projects) rows.push([p.area, p.name, p.owner, p.status, p.priority, p.pct + "%", p.date, p.roadblocks, p.milestones, p.nextSteps, p.notes]);
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `IT_Projects_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("Done!"); setTimeout(() => setExportMsg(""), 2000);
  };

  const clearFilters = () => { setFilterOwner("All"); setFilterStatus("All"); setFilterPriority("All"); setSearchQuery(""); };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ââ HEADER ââ */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
                <BarChart3 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">IT Project Dashboard</h1>
                <p className="text-[11px] text-gray-400">Aubuchon Hardware Â· Week of March 30, 2026</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setView("cards")} className={`p-1.5 rounded-md transition-all ${view === "cards" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`} title="Card view">
                  <LayoutGrid size={15} />
                </button>
                <button onClick={() => setView("list")} className={`p-1.5 rounded-md transition-all ${view === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`} title="List view">
                  <List size={15} />
                </button>
              </div>

              <button onClick={handleExport} className="flex items-center gap-1.5 bg-gray-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors shadow-sm">
                <Download size={13} />{exportMsg || "Export"}
              </button>
              <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5">
        {/* ââ SUMMARY CARDS ââ */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
          <SummaryCard label="Total" value={stats.total} icon={FolderOpen} color="text-gray-900" bg="bg-white" />
          <SummaryCard label="In Progress" value={stats.inProgress} icon={BarChart3} color="text-blue-600" bg="bg-white" />
          <SummaryCard label="High Priority" value={stats.highPriority} icon={AlertTriangle} color="text-red-600" bg="bg-white" />
          <SummaryCard label="Avg Progress" value={stats.avgProgress + "%"} icon={BarChart3} color="text-indigo-600" bg="bg-white" />
          <SummaryCard label="Blocked" value={stats.blocked} icon={XCircle} color="text-amber-600" bg="bg-white" />
          <SummaryCard label="Done" value={stats.done} icon={CheckCircle} color="text-emerald-600" bg="bg-white" />
        </div>

        {/* ââ ALERTS ââ */}
        {alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-red-800">Critical Deadlines This Week</h4>
              <p className="text-xs text-red-600 mt-0.5">{alerts.map(p => `${p.name} (${p.owner})`).join("  Â·  ")} â due 3/31/2026</p>
            </div>
          </div>
        )}

        {/* ââ FILTERS ââ */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-gray-200 flex-1 max-w-xs">
            <Search size={14} className="text-gray-400" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-xs bg-transparent focus:outline-none w-full" placeholder="Search projects..." />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>}
          </div>

          <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-2 border border-gray-200">
            <User size={12} className="text-gray-400" />
            <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
              <option value="All">All Owners</option>
              {OWNER_OPTIONS.filter(o => o !== "Unassigned").map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-2 border border-gray-200">
            <Filter size={12} className="text-gray-400" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-2 border border-gray-200">
            <ChevronUp size={12} className="text-gray-400" />
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
              <option value="All">All Priorities</option>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              Clear filters Â· {filtered.length}/{projects.length}
            </button>
          )}
        </div>

        {/* ââ QUICK TASKS ââ */}
        <div className="mb-6">
          <QuickTasks tasks={quickTasks} setTasks={setQuickTasks} />
        </div>

        {/* ââ PROJECTS ââ */}
        {view === "cards" ? (
          Object.entries(grouped).filter(([, ps]) => ps.length > 0).map(([area, ps]) => (
            <AreaSection key={area} area={area} projects={ps} onUpdate={handleUpdate} onDelete={handleDelete} onAdd={handleAdd} onMove={handleMove} />
          ))
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8"></th>
                  <th className="py-2.5 px-2 text-left">Area</th>
                  <th className="py-2.5 px-3 text-left">Project</th>
                  <th className="py-2.5 px-2 text-left">Status</th>
                  <th className="py-2.5 px-2 text-left">Priority</th>
                  <th className="py-2.5 px-2 text-left">Owner</th>
                  <th className="py-2.5 px-2 text-left w-32">Progress</th>
                  <th className="py-2.5 px-2 text-left">Date</th>
                  <th className="py-2.5 px-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <ProjectRow key={p.id} project={p} onUpdate={handleUpdate} onDelete={handleDelete} onMove={handleMove} showArea />
                ))}
              </tbody>
            </table>
            {AREAS.map(area => (
              <button key={area} onClick={() => handleAdd(area)} className="w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-50 flex items-center gap-2">
                <Plus size={12} /> Add to {area}
              </button>
            ))}
          </div>
        )}

        {/* ââ FOOTER ââ */}
        <div className="text-center py-6 text-[11px] text-gray-300 mt-4">
          Aubuchon Hardware â IT Department â Click any field to edit Â· Toggle views above Â· Move projects between areas
        </div>
      </div>
    </div>
  );
}