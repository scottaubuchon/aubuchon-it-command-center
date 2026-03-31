import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Download, AlertTriangle, Clock,
  CheckCircle, XCircle, Pause, FlaskConical, BarChart3, Calendar, Edit3,
  Save, X, User, Server, Shield, Monitor, Headphones, Layers, Search,
  List, LayoutGrid, ArrowRight, GripVertical, Square, CheckSquare,
  FolderOpen, Filter, ChevronUp, Zap, MoveRight, LogOut, Users,
  Building2, History, FileText, Tag, Eye, Briefcase, Archive, Inbox,
  ListChecks, CircleDot, RotateCcw
} from "lucide-react";
import { auth, signOut, db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/* =====================================================================
   CONFIGURATION
   ===================================================================== */

const STATUS_OPTIONS = ["Not Started", "In Progress", "Testing in Lab", "Done", "On Hold", "Blocked"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const TIER_OPTIONS = ["Project", "Quick Win"];
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

const DEPARTMENTS = [
  "Enterprise Systems",
  "Infrastructure & Cyber Security",
  "POS & Store Technology",
  "Store Expansion",
  "Resource Center & Support",
];

const DEPT_CONFIG = {
  "Enterprise Systems":              { icon: Server,     gradient: "from-blue-600 to-indigo-600",  bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700",    light: "bg-blue-100",    chip: "bg-blue-50 text-blue-700 border-blue-200" },
  "Infrastructure & Cyber Security": { icon: Shield,     gradient: "from-emerald-600 to-teal-600", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", light: "bg-emerald-100", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "POS & Store Technology":          { icon: Monitor,    gradient: "from-violet-600 to-purple-600",bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-700",  light: "bg-violet-100",  chip: "bg-violet-50 text-violet-700 border-violet-200" },
  "Store Expansion":                 { icon: Layers,     gradient: "from-orange-500 to-amber-600", bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-700",  light: "bg-orange-100",  chip: "bg-orange-50 text-orange-700 border-orange-200" },
  "Resource Center & Support":       { icon: Headphones, gradient: "from-rose-500 to-pink-600",    bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    light: "bg-rose-100",    chip: "bg-rose-50 text-rose-700 border-rose-200" },
};

const DEPT_SHORT = {
  "Enterprise Systems": "Enterprise",
  "Infrastructure & Cyber Security": "Infra/Cyber",
  "POS & Store Technology": "POS/Store",
  "Store Expansion": "Expansion",
  "Resource Center & Support": "Support",
};

const VIEWS = [
  { id: "projects", label: "All Projects", icon: Briefcase },
  { id: "owner",    label: "By Owner",     icon: Users },
  { id: "dept",     label: "By Dept",      icon: Building2 },
  { id: "inbox",    label: "Inbox",        icon: Inbox },
  { id: "trash",    label: "Trash",        icon: Trash2 },
  { id: "history",  label: "History",       icon: Archive },
];

/* =====================================================================
   INITIAL PROJECT DATA  (updated March 30 2026 from Notion / Asana / 1:1s)
   ===================================================================== */

const initialProjects = [
  // Enterprise Systems
  { id: 1,  departments: ["Enterprise Systems"], name: "E-Commerce Migration (Magento to Easy Commerce)", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 25, date: "9/30/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Migration from Magento platform to Easy Commerce", completedDate: "", subtasks: [], tier: "project" },
  { id: 2,  departments: ["Enterprise Systems"], name: "YODA (Power BI Analytics)", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "Basket Builders report redesign; AR aging report in dev", nextSteps: "Matillion upgrade (time-sensitive)", notes: "Business intelligence and analytics platform", completedDate: "", subtasks: [], tier: "project" },
  { id: 3,  departments: ["Enterprise Systems"], name: "Power BI / Fabric (Presidio)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Data platform modernization with Presidio", completedDate: "", subtasks: [], tier: "project" },
  { id: 4,  departments: ["Enterprise Systems"], name: "In-house A/R Module", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 50, date: "6/30/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Custom accounts receivable module development", completedDate: "", subtasks: [], tier: "project" },
  { id: 7,  departments: ["Enterprise Systems"], name: "Ideal Software Integration", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Ideal software system integration", completedDate: "", subtasks: [], tier: "project" },
  { id: 8,  departments: ["Enterprise Systems"], name: "Mi9 Bug Fixes & Enhancements", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing Mi9 retail system maintenance", completedDate: "", subtasks: [], tier: "project" },
  { id: 6,  departments: ["Enterprise Systems"], name: "Sport 2.0", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Next generation sporting goods system", completedDate: "", subtasks: [], tier: "project" },
  { id: 30, departments: ["Enterprise Systems"], name: "Matillion Upgrade", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "Time-sensitive -- due within 1-2 weeks", milestones: "", nextSteps: "Complete upgrade ASAP", notes: "ETL platform upgrade -- flagged in YODA review 3/13", completedDate: "", subtasks: [], tier: "project" },
  { id: 31, departments: ["Enterprise Systems"], name: "OpenFlow Migration POC", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "Evaluating proof of concept", nextSteps: "", notes: "From YODA review -- evaluating migration path", completedDate: "", subtasks: [], tier: "project" },

  // Infrastructure & Cyber Security
  { id: 9,  departments: ["Infrastructure & Cyber Security"], name: "Windows 11 Upgrade", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "Weekly status meetings Wed 1pm", nextSteps: "", notes: "Enterprise-wide Windows 11 migration before end of support", completedDate: "", subtasks: [], tier: "project" },
  { id: 10, departments: ["Infrastructure & Cyber Security"], name: "Cybersecurity Program", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "PCI compliance, CrowdStrike, Sophos, Mimecast, KnowBe4, Keeper", completedDate: "", subtasks: [], tier: "project" },
  { id: 11, departments: ["Infrastructure & Cyber Security", "Store Expansion"], name: "Store Conversions / IT Alignment", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "Aggressive 6-week timelines; vendor scheduling issues with IW", milestones: "73-75 store projects completed successfully", nextSteps: "Low-voltage cabling SOP to Mark; pre-project meetings for next 3-4 projects; floor plan markups for APs and Cat5 drops", notes: "IT infrastructure for store conversions -- process significantly improved", completedDate: "", subtasks: [], tier: "project" },
  { id: 12, departments: ["Infrastructure & Cyber Security", "POS & Store Technology"], name: "Delivery Pilot (IT Component)", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "4/7/2026", roadblocks: "DMS vendor lacks bulk import; daily product data updates difficult", milestones: "Store 218 South Burlington -- 5,000 sq ft warehouse space secured", nextSteps: "Set up separate VLAN; order 2 PCs, 2 phones, label printers; WorkWave driver login setup", notes: "Soft launch early April -- starting with 6 stores, could scale to 50", completedDate: "", subtasks: [], tier: "project" },
  { id: 32, departments: ["Infrastructure & Cyber Security"], name: "WiFi Speaker Evaluation", owner: "Craig Renaud", status: "Not Started", priority: "Low", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "Craig & Evan to investigate WiFi speakers vs. wired; review IW bills to separate speaker wiring costs", notes: "Cost-effective alternative to wired audio -- from store alignment 1:1", completedDate: "", subtasks: [], tier: "project" },

  // POS & Store Technology
  { id: 17, departments: ["POS & Store Technology"], name: "Tokenization", owner: "Eric Handley", status: "In Progress", priority: "High", pct: 75, date: "3/31/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Payment tokenization -- CRITICAL DEADLINE", completedDate: "", subtasks: [], tier: "project" },
  { id: 18, departments: ["POS & Store Technology"], name: "B2B Features & Employee Discount", owner: "Eric Handley", status: "In Progress", priority: "High", pct: 75, date: "3/31/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "B2B functionality -- CRITICAL DEADLINE", completedDate: "", subtasks: [], tier: "project" },
  { id: 19, departments: ["POS & Store Technology"], name: "Mobile POS", owner: "Eric Handley", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Mobile point of sale deployment", completedDate: "", subtasks: [], tier: "project" },
  { id: 20, departments: ["POS & Store Technology"], name: "Theatro (Motorola Solutions)", owner: "Eric Handley", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "In-store communication platform", completedDate: "", subtasks: [], tier: "project" },
  { id: 5,  departments: ["POS & Store Technology", "Enterprise Systems"], name: "EZAD TV (Digital Signage)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Digital signage rollout across stores", completedDate: "", subtasks: [], tier: "project" },

  // Store Expansion
  { id: 13, departments: ["Store Expansion", "Infrastructure & Cyber Security"], name: "237 Cumberland RI", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "Completing smoothly per 1:1", nextSteps: "", notes: "New store acquisition -- IT setup and integration", completedDate: "", subtasks: [], tier: "project" },
  { id: 14, departments: ["Store Expansion"], name: "233 Ithaca Downtown", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition -- POS equipment installation", completedDate: "", subtasks: [], tier: "project" },
  { id: 15, departments: ["Store Expansion"], name: "234 Ithaca Triphammer", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition -- IT setup and integration", completedDate: "", subtasks: [], tier: "project" },
  { id: 16, departments: ["Store Expansion"], name: "236 Dover PA", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition -- IT setup and integration", completedDate: "", subtasks: [], tier: "project" },

  // Resource Center & Support
  { id: 21, departments: ["Resource Center & Support"], name: "Resource Center / Help Desk Operations", owner: "Suzanne Fleury", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Help desk management and improvements", completedDate: "", subtasks: [], tier: "project" },
  { id: 22, departments: ["Resource Center & Support", "POS & Store Technology"], name: "POS Team Support", owner: "Suzanne Fleury", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "POS system support for stores", completedDate: "", subtasks: [], tier: "project" },
];

const initialInboxItems = [
  { id: 501, text: "Texting to Store Phones -- evaluate options", source: "Asana Intake", owner: "Unassigned", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 502, text: "WiFi registers setup for new locations", source: "Asana Intake", owner: "Craig Renaud", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 503, text: "Stop Key Entry on Credit Cards", source: "Asana Intake", owner: "Eric Handley", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 504, text: "WorldPay / Authorize.net / Apple Pay / Google Pay integration", source: "Asana Intake", owner: "Eric Handley", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 505, text: "Weather forecast data expansion for stores 220+", source: "YODA Review", owner: "Dave Faucher", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 506, text: "Loss prevention data refinement", source: "YODA Review", owner: "Dave Faucher", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 507, text: "Craig to send low-voltage cabling SOP to Mark", source: "1:1 3/4", owner: "Craig Renaud", priority: "Medium", addedDate: "3/30/2026", notes: "" },
  { id: 508, text: "Craig to introduce Mark to IW vendor", source: "1:1 3/4", owner: "Craig Renaud", priority: "Medium", addedDate: "3/30/2026", notes: "" },
];

/* =====================================================================
   SMALL REUSABLE COMPONENTS
   ===================================================================== */

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

function DeptChips({ departments, size = "sm" }) {
  return (
    <div className="flex flex-wrap gap-1">
      {departments.map(d => {
        const cfg = DEPT_CONFIG[d];
        if (!cfg) return null;
        const short = DEPT_SHORT[d] || d;
        return (
          <span key={d} className={`inline-flex items-center gap-1 ${size === "xs" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]"} rounded-full font-medium border ${cfg.chip}`}>
            {short}
          </span>
        );
      })}
    </div>
  );
}

function DeptMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (dept) => {
    if (selected.includes(dept)) {
      if (selected.length > 1) onChange(selected.filter(d => d !== dept));
    } else {
      onChange([...selected, dept]);
    }
  };
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors" title="Edit departments">
        <Tag size={12} /><ChevronDown size={9} className="opacity-50" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[220px] right-0">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Departments</div>
            {DEPARTMENTS.map(d => {
              const cfg = DEPT_CONFIG[d];
              const Icon = cfg.icon;
              const isOn = selected.includes(d);
              return (
                <button key={d} onClick={() => toggle(d)} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${isOn ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center ${isOn ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"}`}>
                    {isOn && <CheckCircle size={10} />}
                  </span>
                  <Icon size={13} className={cfg.text} />
                  <span className="truncate">{d}</span>
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

/* =====================================================================
   SUBTASK LIST (inside projects)
   ===================================================================== */

function SubtaskList({ subtasks, onUpdate }) {
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");

  const addSubtask = () => {
    if (!newText.trim()) return;
    const updated = [...subtasks, { id: Date.now(), text: newText.trim(), dueDate: newDate, done: false }];
    onUpdate(updated);
    setNewText("");
    setNewDate("");
  };

  const toggleSubtask = (id) => {
    onUpdate(subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s));
  };

  const removeSubtask = (id) => {
    onUpdate(subtasks.filter(s => s.id !== id));
  };

  const updateSubtaskText = (id, text) => {
    onUpdate(subtasks.map(s => s.id === id ? { ...s, text } : s));
  };

  const updateSubtaskDate = (id, dueDate) => {
    onUpdate(subtasks.map(s => s.id === id ? { ...s, dueDate } : s));
  };

  const pending = subtasks.filter(s => !s.done);
  const done = subtasks.filter(s => s.done);
  const overdue = pending.filter(s => s.dueDate && new Date(s.dueDate) < new Date(new Date().toDateString()));

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-2">
        <ListChecks size={12} className="text-gray-400" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Subtasks ({pending.length} open{done.length > 0 ? `, ${done.length} done` : ""})
        </span>
        {overdue.length > 0 && (
          <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">{overdue.length} overdue</span>
        )}
      </div>

      {/* Pending subtasks */}
      <div className="space-y-0.5">
        {pending.map(s => {
          const isOverdue = s.dueDate && new Date(s.dueDate) < new Date(new Date().toDateString());
          return (
            <div key={s.id} className="flex items-center gap-2 group py-1 px-1.5 rounded-md hover:bg-gray-50 transition-colors">
              <button onClick={() => toggleSubtask(s.id)} className="text-gray-300 hover:text-emerald-500 transition-colors flex-shrink-0">
                <Square size={13} />
              </button>
              <InlineEdit value={s.text} onChange={(v) => updateSubtaskText(s.id, v)} placeholder="Subtask..." className="flex-1 text-xs text-gray-700" />
              <input
                type="date"
                value={s.dueDate || ""}
                onChange={(e) => updateSubtaskDate(s.id, e.target.value)}
                className={`text-[10px] bg-transparent border-none focus:outline-none cursor-pointer w-24 ${isOverdue ? "text-red-500 font-semibold" : "text-gray-400"}`}
                title="Due date"
              />
              <button onClick={() => removeSubtask(s.id)} className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Completed subtasks */}
      {done.length > 0 && (
        <div className="mt-1">
          {done.map(s => (
            <div key={s.id} className="flex items-center gap-2 group py-1 px-1.5 rounded-md hover:bg-gray-50 transition-colors">
              <button onClick={() => toggleSubtask(s.id)} className="text-emerald-500 flex-shrink-0">
                <CheckSquare size={13} />
              </button>
              <span className="flex-1 text-xs text-gray-400 line-through">{s.text}</span>
              {s.dueDate && <span className="text-[10px] text-gray-300">{s.dueDate}</span>}
              <button onClick={() => removeSubtask(s.id)} className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new subtask */}
      <div className="flex items-center gap-2 mt-1.5 px-1.5 py-1 rounded-md bg-gray-50/50">
        <Plus size={11} className="text-gray-300 flex-shrink-0" />
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSubtask()}
          className="flex-1 bg-transparent text-xs placeholder-gray-300 focus:outline-none"
          placeholder="Add subtask..."
        />
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="text-[10px] text-gray-400 bg-transparent border-none focus:outline-none cursor-pointer w-24"
          title="Due date"
        />
        {newText && (
          <button onClick={addSubtask} className="text-[10px] font-medium text-blue-600 hover:text-blue-800">Add</button>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   SUMMARY CARD
   ===================================================================== */

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

/* =====================================================================
   QUICK TASKS
   ===================================================================== */

/* =====================================================================
   PROJECT CARD (used in card views)
   ===================================================================== */

function ProjectCard({ project, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isAlert = project.priority === "High" && project.pct < 100 && project.date && project.date.includes("3/31");

  return (
    <div className={`bg-white rounded-xl border ${isAlert ? "border-red-300 ring-1 ring-red-100" : "border-gray-200/80"} hover:shadow-md hover:border-gray-300 transition-all duration-200 group`}>
      {isAlert && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-red-50 to-red-100/50 rounded-t-xl border-b border-red-100">
          <AlertTriangle size={11} className="text-red-500" />
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Due 3/31 -- Critical</span>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <InlineEdit value={project.name} onChange={(v) => onUpdate(project.id, "name", v)} placeholder="Project name" className="font-semibold text-sm text-gray-900" />
          </div>
          <div className="flex items-center gap-1">
            <DeptMultiSelect selected={project.departments} onChange={(d) => onUpdate(project.id, "departments", d)} />
            <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className="text-red-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50" title="Delete project"><Trash2 size={13} /></button>
          </div>
        </div>

        {/* Department chips */}
        <div className="mb-2.5">
          <DeptChips departments={project.departments} size="xs" />
        </div>

        {project.tier === "quickwin" && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              <Zap size={9} />Quick Win
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} size="xs" />
          <PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} size="xs" />
          <OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" />
          {(
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
              <Calendar size={9} /><InlineEdit value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} placeholder="Set date..." className="text-[10px] text-gray-500" />
            </span>
          )}
        </div>

        <ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} />

        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 mt-2.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {expanded ? "Less" : "Details"}
        </button>

        {/* Subtask summary when collapsed */}
        {!expanded && project.subtasks && project.subtasks.length > 0 && (() => {
          const pending = project.subtasks.filter(s => !s.done);
          const total = project.subtasks.length;
          const overdue = pending.filter(s => s.dueDate && new Date(s.dueDate) < new Date(new Date().toDateString()));
          return (
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
              <ListChecks size={10} />
              <span>{total - pending.length}/{total} subtasks</span>
              {overdue.length > 0 && <span className="text-red-500 font-semibold">{overdue.length} overdue</span>}
            </div>
          );
        })()}

        {expanded && (
          <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
            {[
              ["Est. Completion", "date", "Target date...", false],
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

            {/* Subtasks */}
            <div className="pt-2 border-t border-gray-100">
              <SubtaskList subtasks={project.subtasks || []} onUpdate={(subs) => onUpdate(project.id, "subtasks", subs)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   PROJECT TABLE ROW (list views)
   ===================================================================== */

function ProjectRow({ project, onUpdate, onDelete, showDepts = true, showOwner = true }) {
  const [expanded, setExpanded] = useState(false);
  const isAlert = project.priority === "High" && project.pct < 100 && project.date && project.date.includes("3/31");
  const colCount = 6 + (showDepts ? 1 : 0) + (showOwner ? 1 : 0);

  return (
    <>
      <tr className={`group border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${isAlert ? "bg-red-50/30" : ""}`}>
        <td className="py-2.5 px-3 w-8">
          <button onClick={() => setExpanded(!expanded)} className="text-gray-300 hover:text-gray-500">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            {isAlert && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
            <InlineEdit value={project.name} onChange={(v) => onUpdate(project.id, "name", v)} placeholder="Project name" className="text-sm font-medium text-gray-900 truncate max-w-xs" />
            {project.tier === "quickwin" && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                <Zap size={8} />QW
              </span>
            )}
            {project.subtasks && project.subtasks.length > 0 && (() => {
              const done = project.subtasks.filter(s => s.done).length;
              const total = project.subtasks.length;
              const overdue = project.subtasks.filter(s => !s.done && s.dueDate && new Date(s.dueDate) < new Date(new Date().toDateString())).length;
              return (
                <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${overdue > 0 ? "bg-red-50 text-red-600" : done === total ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                  <ListChecks size={9} />{done}/{total}
                </span>
              );
            })()}
          </div>
        </td>
        {showDepts && (
          <td className="py-2.5 px-2"><DeptChips departments={project.departments} size="xs" /></td>
        )}
        <td className="py-2.5 px-2"><StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} size="xs" /></td>
        <td className="py-2.5 px-2"><PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} size="xs" /></td>
        {showOwner && (
          <td className="py-2.5 px-2"><OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} size="xs" /></td>
        )}
        <td className="py-2.5 px-2 w-32"><ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} /></td>
        <td className="py-2.5 px-2 text-xs text-gray-500 whitespace-nowrap"><InlineEdit value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} placeholder="Set date..." className="text-xs text-gray-500" /></td>
        <td className="py-2.5 px-2">
          <div className="flex items-center gap-1">
            <DeptMultiSelect selected={project.departments} onChange={(d) => onUpdate(project.id, "departments", d)} />
            <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className="text-red-300 hover:text-red-500 transition-colors" title="Delete project"><Trash2 size={12} /></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={colCount + 2} className="px-12 py-3">
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
            {/* Subtasks */}
            <div className="mt-3 pt-3 border-t border-gray-200 max-w-3xl">
              <SubtaskList subtasks={project.subtasks || []} onUpdate={(subs) => onUpdate(project.id, "subtasks", subs)} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* =====================================================================
   VIEW: ALL PROJECTS (default -- flat project list)
   ===================================================================== */

function AllProjectsView({ projects, onUpdate, onDelete, onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <th className="py-2.5 px-3 w-8"></th>
            <th className="py-2.5 px-3 text-left">Project</th>
            <th className="py-2.5 px-2 text-left">Departments</th>
            <th className="py-2.5 px-2 text-left">Status</th>
            <th className="py-2.5 px-2 text-left">Priority</th>
            <th className="py-2.5 px-2 text-left">Owner</th>
            <th className="py-2.5 px-2 text-left w-32">Progress</th>
            <th className="py-2.5 px-2 text-left">Est. Completion</th>
            <th className="py-2.5 px-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
      <button onClick={() => onAdd()} className="w-full text-left px-6 py-3 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 flex items-center gap-2">
        <Plus size={12} /> Add project
      </button>
    </div>
  );
}

/* =====================================================================
   VIEW: BY OWNER (for 1:1 meetings)
   ===================================================================== */

function ByOwnerView({ projects, onUpdate, onDelete, onAdd }) {
  const ownerGroups = useMemo(() => {
    const groups = {};
    for (const o of OWNER_OPTIONS.filter(o => o !== "Unassigned")) groups[o] = [];
    for (const p of projects) {
      if (groups[p.owner]) groups[p.owner].push(p);
    }
    const unassigned = projects.filter(p => p.owner === "Unassigned");
    if (unassigned.length) groups["Unassigned"] = unassigned;
    return groups;
  }, [projects]);

  return (
    <div className="space-y-6">
      {Object.entries(ownerGroups).filter(([, ps]) => ps.length > 0).map(([owner, ps]) => {
        const initials = owner === "Unassigned" ? "?" : owner.split(" ").map(n => n[0]).join("");
        const highCount = ps.filter(p => p.priority === "High").length;
        const blockedCount = ps.filter(p => p.status === "Blocked" || p.status === "On Hold").length;

        return (
          <OwnerSection key={owner} owner={owner} initials={initials} projects={ps}
            highCount={highCount} blockedCount={blockedCount}
            onUpdate={onUpdate} onDelete={onDelete} onAdd={onAdd} />
        );
      })}
    </div>
  );
}

function OwnerSection({ owner, initials, projects, highCount, blockedCount, onUpdate, onDelete, onAdd }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {initials}
          </div>
          <div className="text-left">
            <h3 className="font-bold text-gray-900 text-[15px]">{owner}</h3>
            <p className="text-[11px] text-gray-400">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {highCount > 0 && <span className="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded-lg font-semibold">{highCount} high</span>}
          {blockedCount > 0 && <span className="bg-amber-50 text-amber-600 text-[10px] px-2 py-1 rounded-lg font-semibold">{blockedCount} blocked</span>}
          {collapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">

          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-2 px-3 w-8"></th>
                <th className="py-2 px-3 text-left">Project</th>
                <th className="py-2 px-2 text-left">Departments</th>
                <th className="py-2 px-2 text-left">Status</th>
                <th className="py-2 px-2 text-left">Priority</th>
                <th className="py-2 px-2 text-left w-32">Progress</th>
                <th className="py-2 px-2 text-left">Est. Completion</th>
                <th className="py-2 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} showOwner={false} />
              ))}
            </tbody>
          </table>
          <button onClick={() => onAdd(owner)} className="w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-50 flex items-center gap-2">
            <Plus size={12} /> Add project for {owner.split(" ")[0]}
          </button>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   VIEW: BY DEPARTMENT
   ===================================================================== */

function ByDeptView({ projects, onUpdate, onDelete, onAdd }) {
  const deptGroups = useMemo(() => {
    const groups = {};
    for (const d of DEPARTMENTS) groups[d] = [];
    for (const p of projects) {
      for (const d of p.departments) {
        if (groups[d]) groups[d].push(p);
      }
    }
    return groups;
  }, [projects]);

  return (
    <div className="space-y-6">
      {DEPARTMENTS.map(dept => {
        const ps = deptGroups[dept] || [];
        if (ps.length === 0) return null;
        const cfg = DEPT_CONFIG[dept];
        const Icon = cfg.icon;
        const highCount = ps.filter(p => p.priority === "High").length;
        const totalPct = ps.length ? Math.round(ps.reduce((s, p) => s + p.pct, 0) / ps.length) : 0;

        return (
          <DeptSection key={dept} dept={dept} cfg={cfg} Icon={Icon} projects={ps}
            highCount={highCount} totalPct={totalPct}
            onUpdate={onUpdate} onDelete={onDelete} onAdd={() => onAdd(null, dept)} />
        );
      })}
    </div>
  );
}

function DeptSection({ dept, cfg, Icon, projects, highCount, totalPct, onUpdate, onDelete, onAdd }) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("cards");

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-3 group">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white shadow-sm`}>
            <Icon size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-[15px]">
              {dept}
              {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </h3>
            <p className="text-[11px] text-gray-400">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {highCount > 0 && <span className="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded-lg font-semibold">{highCount} high</span>}
          <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded-lg">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${totalPct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-gray-600 tabular-nums">{totalPct}%</span>
          </div>
          {!collapsed && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode("cards")} className={`p-1 rounded-md transition-all ${viewMode === "cards" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setViewMode("list")} className={`p-1 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}>
                <List size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {projects.map(p => <ProjectCard key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} />)}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="py-2 px-3 text-left">Project</th>
                    <th className="py-2 px-2 text-left">Status</th>
                    <th className="py-2 px-2 text-left">Priority</th>
                    <th className="py-2 px-2 text-left">Owner</th>
                    <th className="py-2 px-2 text-left w-32">Progress</th>
                    <th className="py-2 px-2 text-left">Est. Completion</th>
                    <th className="py-2 px-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => <ProjectRow key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} showDepts={false} />)}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={onAdd} className="mt-2.5 flex items-center gap-2 text-xs text-gray-400 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50 border border-dashed border-gray-200 hover:border-blue-300 w-full justify-center">
            <Plus size={13} /> Add project
          </button>
        </>
      )}
    </div>
  );
}

/* =====================================================================
   VIEW: TRASH (deleted projects)
   ===================================================================== */

function TrashView({ trashedProjects, onRestore, onPermanentDelete }) {
  if (trashedProjects.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Trash2 size={40} className="text-gray-200 mx-auto mb-3" />
        <h3 className="font-bold text-gray-400 text-lg">Trash is Empty</h3>
        <p className="text-sm text-gray-300 mt-1">Deleted projects will appear here so you can restore them if needed.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trash2 size={14} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-700">{trashedProjects.length} Deleted Project{trashedProjects.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {trashedProjects.map(p => (
          <div key={p.id} className="px-5 py-3 flex items-center justify-between group hover:bg-gray-50/50 transition-colors">
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-700">{p.name}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-gray-400">Deleted {p.deletedDate}</span>
                <span className="text-[10px] text-gray-300">{p.owner}</span>
                <DeptChips departments={p.departments} size="xs" />
              </div>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onRestore(p.id)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                <RotateCcw size={11} />Restore
              </button>
              <button onClick={() => onPermanentDelete(p.id)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors">
                <X size={11} />Delete Forever
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   VIEW: HISTORY (completed projects)
   ===================================================================== */

function HistoryView({ completedProjects, onUpdate }) {
  if (completedProjects.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Archive size={40} className="text-gray-200 mx-auto mb-3" />
        <h3 className="font-bold text-gray-400 text-lg">No Completed Projects Yet</h3>
        <p className="text-sm text-gray-300 mt-1">When you mark projects as Done, they will appear here with their completion dates.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <CheckCircle size={14} className="text-emerald-500" />
        <span className="text-sm font-bold text-gray-700">{completedProjects.length} Completed Project{completedProjects.length !== 1 ? "s" : ""}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/50 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <th className="py-2.5 px-3 text-left">Project</th>
            <th className="py-2.5 px-2 text-left">Departments</th>
            <th className="py-2.5 px-2 text-left">Owner</th>
            <th className="py-2.5 px-2 text-left">Priority</th>
            <th className="py-2.5 px-2 text-left">Completed</th>
            <th className="py-2.5 px-2 text-left">Notes</th>
          </tr>
        </thead>
        <tbody>
          {completedProjects.map(p => (
            <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td className="py-3 px-3">
                <span className="text-sm font-medium text-gray-700">{p.name}</span>
              </td>
              <td className="py-3 px-2"><DeptChips departments={p.departments} size="xs" /></td>
              <td className="py-3 px-2 text-xs text-gray-600">{p.owner}</td>
              <td className="py-3 px-2"><PriorityBadge priority={p.priority} onChange={(v) => onUpdate(p.id, "priority", v)} size="xs" /></td>
              <td className="py-3 px-2 text-xs text-gray-500">{p.completedDate || "--"}</td>
              <td className="py-3 px-2 text-xs text-gray-400 max-w-xs truncate">{p.notes || p.milestones || "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =====================================================================
   VIEW: INBOX (triage area for new requests & unassigned items)
   ===================================================================== */

function InboxView({ inboxItems, setInboxItems, onPromote }) {
  const [newText, setNewText] = useState("");

  const addItem = () => {
    if (!newText.trim()) return;
    setInboxItems(prev => [...prev, {
      id: Date.now(),
      text: newText.trim(),
      source: "Manual",
      owner: "Unassigned",
      priority: "Medium",
      addedDate: new Date().toLocaleDateString("en-US"),
      notes: "",
    }]);
    setNewText("");
  };

  const removeItem = (id) => setInboxItems(prev => prev.filter(i => i.id !== id));
  const updateItem = (id, field, value) => setInboxItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  return (
    <div className="space-y-4">
      {/* Add new inbox item */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Inbox size={16} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Inbox</h3>
            <p className="text-[11px] text-gray-400">New ideas, requests, and items -- promote to Projects or Quick Wins</p>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50/50 flex items-center gap-2 border-b border-gray-100">
          <Plus size={14} className="text-gray-400" />
          <input value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="flex-1 bg-transparent text-sm placeholder-gray-300 focus:outline-none" placeholder="Add a new request, idea, or task..." />
          {newText && <button onClick={addItem} className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 rounded-md">Add</button>}
        </div>

        {inboxItems.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Inbox size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Inbox is empty -- nice work!</p>
            <p className="text-xs text-gray-300 mt-1">Add new requests here, then promote them to Projects or Quick Wins.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {inboxItems.map(item => (
              <div key={item.id} className="px-5 py-3 group hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <InlineEdit value={item.text} onChange={(v) => updateItem(item.id, "text", v)} placeholder="Description..." className="font-medium text-sm text-gray-800" />
                    <div className="flex items-center gap-2 mt-1.5">
                      <PriorityBadge priority={item.priority} onChange={(v) => updateItem(item.id, "priority", v)} size="xs" />
                      <OwnerBadge owner={item.owner} onChange={(v) => updateItem(item.id, "owner", v)} size="xs" />
                      <span className="text-[10px] text-gray-300">{item.source}</span>
                      <span className="text-[10px] text-gray-300">Added {item.addedDate}</span>
                    </div>
                    {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    <button onClick={() => onPromote(item, "project")} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors" title="Promote to project">
                      <Briefcase size={11} />Project
                    </button>
                    <button onClick={() => onPromote(item, "quickwin")} className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors" title="Promote to quick win">
                      <Zap size={11} />Quick Win
                    </button>
                    <button onClick={() => removeItem(item.id)} className="text-red-300 hover:text-red-500 p-1.5 transition-colors rounded hover:bg-red-50" title="Remove">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   MAIN DASHBOARD
   ===================================================================== */

export default function Dashboard() {
  const [projects, setProjects] = useState(initialProjects);
  const [inboxItems, setInboxItems] = useState(initialInboxItems);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [nextId, setNextId] = useState(200);
  const [activeView, setActiveView] = useState("projects");
  const [filterOwner, setFilterOwner] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterDept, setFilterDept] = useState("All");
  const [filterTier, setFilterTier] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [exportMsg, setExportMsg] = useState("");

  // --- Firestore persistence ---
  const isLoaded = useRef(false);
  const saveTimer = useRef(null);
  const DOC_REF = doc(db, "dashboards", "it-command-center");

  // Load data from Firestore on mount
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(DOC_REF);
        if (snap.exists()) {
          const d = snap.data();
          if (d.projects) setProjects(d.projects);
          if (d.inboxItems) setInboxItems(d.inboxItems);
          if (d.trashedProjects) setTrashedProjects(d.trashedProjects);
        }
      } catch (err) {
        console.warn("Firestore load failed, using defaults:", err);
      }
      isLoaded.current = true;
    })();
  }, []);

  // Auto-save to Firestore when data changes (debounced 2s)
  useEffect(() => {
    if (!isLoaded.current) return; // Don't save until initial load completes
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDoc(DOC_REF, {
        projects,
        inboxItems,
        trashedProjects,
        lastSaved: new Date().toISOString(),
      }).catch(err => console.warn("Firestore save failed:", err));
    }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [projects, inboxItems, trashedProjects]);

  // Derived data
  const activeProjects = useMemo(() => projects.filter(p => p.status !== "Done"), [projects]);
  const completedProjects = useMemo(() => projects.filter(p => p.status === "Done"), [projects]);

  const filtered = useMemo(() => {
    return activeProjects.filter(p => {
      if (filterOwner !== "All" && p.owner !== filterOwner) return false;
      if (filterStatus !== "All" && p.status !== filterStatus) return false;
      if (filterPriority !== "All" && p.priority !== filterPriority) return false;
      if (filterDept !== "All" && !p.departments.includes(filterDept)) return false;
      if (filterTier !== "All" && p.tier !== (filterTier === "Project" ? "project" : "quickwin")) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.notes.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [activeProjects, filterOwner, filterStatus, filterPriority, filterDept, filterTier, searchQuery]);

  const stats = useMemo(() => {
    const all = activeProjects;
    return {
      total: all.length,
      inProgress: all.filter(p => p.status === "In Progress").length,
      highPriority: all.filter(p => p.priority === "High").length,
      avgProgress: all.length ? Math.round(all.reduce((s, p) => s + p.pct, 0) / all.length) : 0,
      blocked: all.filter(p => p.status === "Blocked" || p.status === "On Hold").length,
      done: completedProjects.length,
    };
  }, [activeProjects, completedProjects]);

  const alerts = activeProjects.filter(p => p.priority === "High" && p.pct < 100 && p.date && p.date.includes("3/31"));
  const hasFilters = filterOwner !== "All" || filterStatus !== "All" || filterPriority !== "All" || filterDept !== "All" || filterTier !== "All" || searchQuery;

  // Handlers
  const handleUpdate = useCallback((id, field, value) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      // Auto-capture completion date when status changes to Done
      if (field === "status" && value === "Done" && !p.completedDate) {
        updated.completedDate = new Date().toLocaleDateString("en-US");
        updated.pct = 100;
      }
      // Clear completion date if un-done
      if (field === "status" && value !== "Done" && p.status === "Done") {
        updated.completedDate = "";
      }
      return updated;
    }));
  }, []);

  const handleDelete = useCallback((id) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    if (!window.confirm(`Delete "${project.name}"? It will be moved to Trash.`)) return;
    setTrashedProjects(prev => [...prev, { ...project, deletedDate: new Date().toLocaleDateString("en-US") }]);
    setProjects(prev => prev.filter(p => p.id !== id));
  }, [projects]);

  const handleRestore = useCallback((id) => {
    const project = trashedProjects.find(p => p.id === id);
    if (!project) return;
    const { deletedDate, ...restored } = project;
    setProjects(prev => [...prev, restored]);
    setTrashedProjects(prev => prev.filter(p => p.id !== id));
  }, [trashedProjects]);

  const handlePermanentDelete = useCallback((id) => {
    if (!window.confirm("Permanently delete this project? This cannot be undone.")) return;
    setTrashedProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleAddProject = useCallback((ownerOrNull, deptOrNull) => {
    const newP = {
      id: nextId,
      departments: deptOrNull ? [deptOrNull] : ["Enterprise Systems"],
      name: "New Project",
      owner: ownerOrNull || "Unassigned",
      status: "Not Started",
      priority: "Medium",
      pct: 0,
      date: "",
      roadblocks: "",
      milestones: "",
      nextSteps: "",
      notes: "",
      completedDate: "",
      subtasks: [],
      tier: "project",
    };
    setProjects(prev => [...prev, newP]);
    setNextId(n => n + 1);
  }, [nextId]);

  const handlePromoteInbox = useCallback((item, tier) => {
    const newP = {
      id: nextId,
      departments: ["Enterprise Systems"],
      name: item.text,
      owner: item.owner || "Unassigned",
      status: "Not Started",
      priority: item.priority || "Medium",
      pct: 0,
      date: "",
      roadblocks: "",
      milestones: "",
      nextSteps: "",
      notes: item.notes || `Promoted from Inbox (${item.source}, added ${item.addedDate})`,
      completedDate: "",
      subtasks: [],
      tier: tier || "project",
    };
    setProjects(prev => [...prev, newP]);
    setInboxItems(prev => prev.filter(i => i.id !== item.id));
    setNextId(n => n + 1);
  }, [nextId]);

  // Export handlers
  const handleExportCSV = () => {
    const rows = [["Project", "Tier", "Departments", "Owner", "Status", "Priority", "% Complete", "Est. Completion", "Roadblocks", "Milestones", "Next Steps", "Notes", "Subtasks"]];
    for (const p of projects) {
      const subsText = (p.subtasks || []).map(s => `${s.done ? "[x]" : "[ ]"} ${s.text}${s.dueDate ? " (due " + s.dueDate + ")" : ""}`).join("; ");
      rows.push([p.name, p.tier === "quickwin" ? "Quick Win" : "Project", p.departments.join("; "), p.owner, p.status, p.priority, p.pct + "%", p.date, p.roadblocks, p.milestones, p.nextSteps, p.notes, subsText]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `IT_Projects_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("Done!"); setTimeout(() => setExportMsg(""), 2000);
  };

  const handleExportSummary = () => {
    let md = `# IT Project Dashboard -- Executive Summary\n`;
    md += `**Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}**\n\n`;
    md += `**Active Projects:** ${stats.total} | **In Progress:** ${stats.inProgress} | **High Priority:** ${stats.highPriority} | **Avg Progress:** ${stats.avgProgress}%\n\n`;

    if (alerts.length > 0) {
      md += `## Critical This Week\n`;
      for (const a of alerts) md += `- **${a.name}** (${a.owner}) -- ${a.pct}% complete, due ${a.date}\n`;
      md += `\n`;
    }

    const blocked = activeProjects.filter(p => p.status === "Blocked" || p.status === "On Hold");
    if (blocked.length > 0) {
      md += `## Blocked / On Hold\n`;
      for (const b of blocked) md += `- **${b.name}** (${b.owner}): ${b.roadblocks || "No details"}\n`;
      md += `\n`;
    }

    md += `## By Owner\n`;
    for (const owner of OWNER_OPTIONS.filter(o => o !== "Unassigned")) {
      const ownerPs = activeProjects.filter(p => p.owner === owner);
      if (ownerPs.length === 0) continue;
      md += `\n### ${owner} (${ownerPs.length} projects)\n`;
      for (const p of ownerPs) {
        md += `- ${p.name} [${p.status}] ${p.priority === "High" ? "HIGH" : ""} ${p.pct}%${p.nextSteps ? " -- Next: " + p.nextSteps : ""}\n`;
      }
    }

    if (completedProjects.length > 0) {
      md += `\n## Recently Completed\n`;
      for (const p of completedProjects) md += `- ${p.name} (${p.owner}) -- completed ${p.completedDate || "N/A"}\n`;
    }

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `IT_Summary_${new Date().toISOString().slice(0, 10)}.md`; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("Done!"); setTimeout(() => setExportMsg(""), 2000);
  };

  const clearFilters = () => { setFilterOwner("All"); setFilterStatus("All"); setFilterPriority("All"); setFilterDept("All"); setFilterTier("All"); setSearchQuery(""); };

  // Active status options (exclude Done for filter in non-history views)
  const activeStatusOptions = STATUS_OPTIONS.filter(s => s !== "Done");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
                <BarChart3 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">IT Project Dashboard</h1>
                <p className="text-[11px] text-gray-400">Aubuchon Hardware -- Week of March 30, 2026</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Export dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 bg-gray-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors shadow-sm">
                  <Download size={13} />{exportMsg || "Export"}
                </button>
                <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] hidden group-hover:block z-50">
                  <button onClick={handleExportCSV} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2">
                    <Download size={12} className="text-gray-400" />CSV (Full Data)
                  </button>
                  <button onClick={handleExportSummary} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2">
                    <FileText size={12} className="text-gray-400" />Executive Summary
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-gray-300 px-1">Auto-saved</span>
              <button onClick={() => signOut(auth)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" title="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>

          {/* View tabs */}
          <div className="flex items-center gap-1 mt-3 -mb-px">
            {VIEWS.map(v => {
              const Icon = v.icon;
              const isActive = activeView === v.id;
              return (
                <button key={v.id} onClick={() => setActiveView(v.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all ${isActive ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                  <Icon size={14} />{v.label}
                  {v.id === "inbox" && inboxItems.length > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{inboxItems.length}</span>
                  )}
                  {v.id === "trash" && trashedProjects.length > 0 && (
                    <span className="bg-gray-200 text-gray-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{trashedProjects.length}</span>
                  )}
                  {v.id === "history" && completedProjects.length > 0 && (
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{completedProjects.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5">
        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
          <SummaryCard label="Active" value={stats.total} icon={FolderOpen} color="text-gray-900" bg="bg-white" />
          <SummaryCard label="In Progress" value={stats.inProgress} icon={BarChart3} color="text-blue-600" bg="bg-white" />
          <SummaryCard label="High Priority" value={stats.highPriority} icon={AlertTriangle} color="text-red-600" bg="bg-white" />
          <SummaryCard label="Avg Progress" value={stats.avgProgress + "%"} icon={BarChart3} color="text-indigo-600" bg="bg-white" />
          <SummaryCard label="Blocked" value={stats.blocked} icon={XCircle} color="text-amber-600" bg="bg-white" />
          <SummaryCard label="Completed" value={stats.done} icon={CheckCircle} color="text-emerald-600" bg="bg-white" />
        </div>

        {/* ALERTS */}
        {alerts.length > 0 && activeView !== "history" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-red-800">Critical Deadlines This Week</h4>
              <p className="text-xs text-red-600 mt-0.5">{alerts.map(p => `${p.name} (${p.owner})`).join("  |  ")} -- due 3/31/2026</p>
            </div>
          </div>
        )}

        {/* FILTERS (hidden on history view) */}
        {activeView !== "history" && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-gray-200 flex-1 max-w-xs">
              <Search size={14} className="text-gray-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-xs bg-transparent focus:outline-none w-full" placeholder="Search projects..." />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>}
            </div>

            <div className="flex bg-gray-100 rounded-lg p-0.5 border border-gray-200">
              {["All", "Project", "Quick Win"].map(t => (
                <button key={t} onClick={() => setFilterTier(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterTier === t ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}>
                  {t === "Quick Win" && <Zap size={11} className="inline mr-1" />}
                  {t === "All" ? "All" : t + "s"}
                </button>
              ))}
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
                {activeStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-2 border border-gray-200">
              <ChevronUp size={12} className="text-gray-400" />
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
                <option value="All">All Priorities</option>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-2 border border-gray-200">
              <Building2 size={12} className="text-gray-400" />
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
                <option value="All">All Departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPT_SHORT[d]}</option>)}
              </select>
            </div>

            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Clear filters | {filtered.length}/{activeProjects.length}
              </button>
            )}
          </div>
        )}

        {/* VIEW CONTENT */}
        {activeView === "projects" && (
          <AllProjectsView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete} onAdd={() => handleAddProject()} />
        )}

        {activeView === "owner" && (
          <ByOwnerView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete}
            onAdd={(owner) => handleAddProject(owner)} />
        )}

        {activeView === "dept" && (
          <ByDeptView projects={filtered} onUpdate={handleUpdate} onDelete={handleDelete}
            onAdd={(owner, dept) => handleAddProject(owner, dept)} />
        )}

        {activeView === "inbox" && (
          <InboxView inboxItems={inboxItems} setInboxItems={setInboxItems} onPromote={handlePromoteInbox} />
        )}

        {activeView === "trash" && (
          <TrashView trashedProjects={trashedProjects} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} />
        )}

        {activeView === "history" && (
          <HistoryView completedProjects={completedProjects} onUpdate={handleUpdate} />
        )}

        {/* FOOTER */}
        <div className="text-center py-6 text-[11px] text-gray-300 mt-4">
          Aubuchon Hardware -- IT Department -- Click any field to edit | Changes auto-save | Projects can belong to multiple departments
        </div>
      </div>
    </div>
  );
}
