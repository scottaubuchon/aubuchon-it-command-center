import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Download, AlertTriangle, Clock, CheckCircle, XCircle, Pause, FlaskConical, BarChart3, Calendar, Edit3, Save, X, User, Server, Shield, Monitor, Headphones, Layers } from "lucide-react";

const STATUS_OPTIONS = ["Not Started", "In Progress", "Testing in Lab", "Done", "On Hold", "Blocked"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const OWNER_OPTIONS = ["Dave Faucher", "Craig Renaud", "Eric Handley", "Suzanne Fleury", "Unassigned"];

const STATUS_CONFIG = {
  "Not Started": { color: "bg-gray-100 text-gray-700", icon: Clock, dot: "bg-gray-400" },
  "In Progress": { color: "bg-blue-50 text-blue-700", icon: BarChart3, dot: "bg-blue-500" },
  "Testing in Lab": { color: "bg-purple-50 text-purple-700", icon: FlaskConical, dot: "bg-purple-500" },
  "Done": { color: "bg-emerald-50 text-emerald-700", icon: CheckCircle, dot: "bg-emerald-500" },
  "On Hold": { color: "bg-amber-50 text-amber-700", icon: Pause, dot: "bg-amber-500" },
  "Blocked": { color: "bg-red-50 text-red-700", icon: XCircle, dot: "bg-red-500" },
};

const PRIORITY_CONFIG = {
  "High": { color: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
  "Medium": { color: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-500" },
  "Low": { color: "bg-green-50 text-green-700 border border-green-200", dot: "bg-green-500" },
};

const AREA_CONFIG = {
  "Enterprise Systems": { icon: Server, gradient: "from-blue-600 to-indigo-700", light: "bg-blue-50 border-blue-100", accent: "text-blue-700" },
  "Infrastructure & Cyber Security": { icon: Shield, gradient: "from-emerald-600 to-teal-700", light: "bg-emerald-50 border-emerald-100", accent: "text-emerald-700" },
  "POS & Store Technology": { icon: Monitor, gradient: "from-violet-600 to-purple-700", light: "bg-violet-50 border-violet-100", accent: "text-violet-700" },
  "Store Expansion": { icon: Layers, gradient: "from-orange-500 to-amber-600", light: "bg-orange-50 border-orange-100", accent: "text-orange-700" },
  "Resource Center & Support": { icon: Headphones, gradient: "from-rose-500 to-pink-600", light: "bg-rose-50 border-rose-100", accent: "text-rose-700" },
};

const initialData = {
  "Enterprise Systems": {
    projects: [
      { id: 1, name: "E-Commerce Migration (Magento to Easy Commerce)", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 25, date: "9/30/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Migration from Magento platform to Easy Commerce" },
      { id: 2, name: "YODA (Power BI Analytics)", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Business intelligence and analytics platform" },
      { id: 3, name: "Power BI / Fabric (Presidio)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Data platform modernization with Presidio" },
      { id: 4, name: "In-house A/R Module", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 50, date: "6/30/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Custom accounts receivable module development" },
      { id: 7, name: "Ideal Software Integration", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Ideal software system integration" },
      { id: 8, name: "Mi9 Bug Fixes & Enhancements", owner: "Dave Faucher", status: "In Progress", priority: "High", pct: 0, date: "Ongoing", roadblocks: "", milestones: "", nextSteps: "", notes: "Ongoing Mi9 retail system maintenance" },
      { id: 6, name: "Sport 2.0", owner: "Dave Faucher", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Next generation sporting goods system" },
    ],
  },
  "Infrastructure & Cyber Security": {
    projects: [
      { id: 9, name: "Windows 11 Upgrade", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Enterprise-wide Windows 11 migration" },
      { id: 10, name: "Cybersecurity Program", owner: "Craig Renaud", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Comprehensive cybersecurity initiative" },
      { id: 11, name: "Store Conversions / IT Alignment", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "IT infrastructure for store conversions" },
      { id: 12, name: "Delivery Pilot (IT Component)", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "IT infrastructure for delivery pilot" },
    ],
  },
  "POS & Store Technology": {
    projects: [
      { id: 17, name: "Tokenization", owner: "Eric Handley", status: "In Progress", priority: "High", pct: 75, date: "3/31/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "Payment tokenization - CRITICAL DEADLINE" },
      { id: 18, name: "B2B Features & Employee Discount", owner: "Eric Handley", status: "In Progress", priority: "High", pct: 75, date: "3/31/2026", roadblocks: "", milestones: "", nextSteps: "", notes: "B2B functionality - CRITICAL DEADLINE" },
      { id: 19, name: "Mobile POS", owner: "Eric Handley", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Mobile point of sale deployment" },
      { id: 20, name: "Theatro (Motorola Solutions)", owner: "Eric Handley", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "In-store communication platform" },
      { id: 5, name: "EZAD TV (Digital Signage)", owner: "Dave Faucher", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Digital signage rollout across stores" },
    ],
  },
  "Store Expansion": {
    projects: [
      { id: 13, name: "237 Cumberland RI", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition - IT setup and integration" },
      { id: 14, name: "233 Ithaca Downtown", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition - IT setup and integration" },
      { id: 15, name: "234 Ithaca Triphammer", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition - IT setup and integration" },
      { id: 16, name: "236 Dover PA", owner: "Craig Renaud", status: "In Progress", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "New store acquisition - IT setup and integration" },
    ],
  },
  "Resource Center & Support": {
    projects: [
      { id: 21, name: "Resource Center / Help Desk Operations", owner: "Suzanne Fleury", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "Help desk management and improvements" },
      { id: 22, name: "POS Team Support", owner: "Suzanne Fleury", status: "In Progress", priority: "High", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "POS system support for stores" },
    ],
  },
};

/* ─── Reusable Components ─── */

function Dropdown({ value, options, onChange, renderOption, renderTrigger }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}>{renderTrigger(value)}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]" style={{ left: 0 }}>
            {options.map((opt) => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                {renderOption(opt)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, onChange }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Not Started"];
  const Icon = cfg.icon;
  return (
    <Dropdown value={status} options={STATUS_OPTIONS} onChange={onChange}
      renderTrigger={(v) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} cursor-pointer hover:opacity-80 transition-opacity`}>
          <Icon size={12} />{v}<ChevronDown size={10} />
        </span>
      )}
      renderOption={(s) => (<><span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />{s}</>)}
    />
  );
}

function PriorityBadge({ priority, onChange }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG["Medium"];
  return (
    <Dropdown value={priority} options={PRIORITY_OPTIONS} onChange={onChange}
      renderTrigger={(v) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} cursor-pointer hover:opacity-80 transition-opacity`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{v}<ChevronDown size={10} />
        </span>
      )}
      renderOption={(p) => (<><span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />{p}</>)}
    />
  );
}

function OwnerBadge({ owner, onChange }) {
  return (
    <Dropdown value={owner} options={OWNER_OPTIONS} onChange={onChange}
      renderTrigger={(v) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity">
          <User size={10} />{v}<ChevronDown size={10} />
        </span>
      )}
      renderOption={(o) => (<><User size={10} className="text-gray-400" />{o}</>)}
    />
  );
}

function ProgressBar({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  const color = value >= 75 ? "bg-emerald-500" : value >= 40 ? "bg-blue-500" : value > 0 ? "bg-amber-500" : "bg-gray-300";

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input type="number" min="0" max="100" value={temp} onChange={(e) => setTemp(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 rounded" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { onChange(temp); setEditing(false); } }} />
        <span className="text-xs text-gray-400">%</span>
        <button onClick={() => { onChange(temp); setEditing(false); }} className="text-emerald-600 hover:text-emerald-800"><Save size={12} /></button>
        <button onClick={() => { setTemp(value); setEditing(false); }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
    );
  }

  return (
    <button onClick={() => { setTemp(value); setEditing(true); }} className="flex items-center gap-2 w-full group cursor-pointer">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}%</span>
      <Edit3 size={10} className="text-gray-300 group-hover:text-gray-500" />
    </button>
  );
}

function EditableText({ value, onChange, placeholder, multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <div className="flex items-start gap-1">
        <Tag value={temp} onChange={(e) => setTemp(e.target.value)} className={`flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${multiline ? "min-h-[48px] resize-y" : ""}`} placeholder={placeholder} autoFocus onKeyDown={(e) => { if (!multiline && e.key === "Enter") { onChange(temp); setEditing(false); } }} />
        <button onClick={() => { onChange(temp); setEditing(false); }} className="mt-0.5 text-emerald-600 hover:text-emerald-800"><Save size={12} /></button>
        <button onClick={() => { setTemp(value); setEditing(false); }} className="mt-0.5 text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
    );
  }

  return (
    <button onClick={() => { setTemp(value); setEditing(true); }} className="text-left text-xs text-gray-600 hover:text-gray-900 group flex items-center gap-1 w-full">
      <span className={value ? "" : "text-gray-300 italic"}>{value || placeholder}</span>
      <Edit3 size={10} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
    </button>
  );
}

function EditableName({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input value={temp} onChange={(e) => setTemp(e.target.value)} className="flex-1 px-2 py-0.5 text-sm font-semibold border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { onChange(temp); setEditing(false); } }} />
        <button onClick={() => { onChange(temp); setEditing(false); }} className="text-emerald-600 hover:text-emerald-800"><Save size={12} /></button>
        <button onClick={() => { setTemp(value); setEditing(false); }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
    );
  }

  return (
    <button onClick={() => { setTemp(value); setEditing(true); }} className="text-left group flex items-center gap-1.5">
      <h4 className="font-semibold text-sm text-gray-900 leading-tight">{value}</h4>
      <Edit3 size={10} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
    </button>
  );
}

/* ─── Project Card ─── */

function ProjectCard({ project, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isAlert = project.priority === "High" && project.pct < 100 && project.date && project.date.includes("3/31");

  return (
    <div className={`bg-white rounded-xl border ${isAlert ? "border-red-200 shadow-sm shadow-red-100" : "border-gray-200"} hover:shadow-md transition-all duration-200`}>
      {isAlert && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-50 rounded-t-xl border-b border-red-100">
          <AlertTriangle size={12} className="text-red-500" />
          <span className="text-xs font-medium text-red-600">Deadline Alert — Due 3/31/2026</span>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <EditableName value={project.name} onChange={(v) => onUpdate(project.id, "name", v)} />
            <p className="text-xs text-gray-400 mt-0.5">{project.notes}</p>
          </div>
          <button onClick={() => onDelete(project.id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0" title="Remove project">
            <Trash2 size={14} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <StatusBadge status={project.status} onChange={(v) => onUpdate(project.id, "status", v)} />
          <PriorityBadge priority={project.priority} onChange={(v) => onUpdate(project.id, "priority", v)} />
          <OwnerBadge owner={project.owner} onChange={(v) => onUpdate(project.id, "owner", v)} />
          {project.date && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
              <Calendar size={10} />{project.date}
            </span>
          )}
        </div>

        <div className="mt-3">
          <ProgressBar value={project.pct} onChange={(v) => onUpdate(project.id, "pct", v)} />
        </div>

        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? "Hide details" : "Show details"}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2.5 pt-3 border-t border-gray-100">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Go-Live / Completion Date</label>
              <EditableText value={project.date} onChange={(v) => onUpdate(project.id, "date", v)} placeholder="Enter target date..." />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Roadblocks / Risks</label>
              <EditableText value={project.roadblocks} onChange={(v) => onUpdate(project.id, "roadblocks", v)} placeholder="Any blockers or risks..." multiline />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Key Milestones This Week</label>
              <EditableText value={project.milestones} onChange={(v) => onUpdate(project.id, "milestones", v)} placeholder="What was accomplished..." multiline />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Next Steps</label>
              <EditableText value={project.nextSteps} onChange={(v) => onUpdate(project.id, "nextSteps", v)} placeholder="Planned next actions..." multiline />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Project Notes</label>
              <EditableText value={project.notes} onChange={(v) => onUpdate(project.id, "notes", v)} placeholder="Additional notes..." multiline />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Area Section ─── */

function AreaSection({ area, projects, onUpdate, onDelete, onAdd }) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = AREA_CONFIG[area] || AREA_CONFIG["Enterprise Systems"];
  const Icon = cfg.icon;
  const totalPct = projects.length ? Math.round(projects.reduce((s, p) => s + p.pct, 0) / projects.length) : 0;
  const highCount = projects.filter((p) => p.priority === "High").length;
  const blockedCount = projects.filter((p) => p.status === "Blocked" || p.status === "On Hold").length;
  const doneCount = projects.filter((p) => p.status === "Done").length;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-3 group">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white shadow-sm`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              {area}
              {collapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </h3>
            <p className="text-xs text-gray-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
        </button>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {highCount > 0 && <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg font-medium">{highCount} high priority</span>}
          {blockedCount > 0 && <span className="bg-amber-50 text-amber-600 px-2.5 py-1 rounded-lg font-medium">{blockedCount} blocked</span>}
          {doneCount > 0 && <span className="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-lg font-medium">{doneCount} done</span>}
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg">
            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${totalPct}%` }} />
            </div>
            <span className="font-semibold text-gray-700">{totalPct}%</span>
          </div>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </div>
          <button onClick={() => onAdd(area)} className="mt-3 flex items-center gap-2 text-xs text-gray-400 hover:text-blue-600 transition-colors px-3 py-2.5 rounded-lg hover:bg-blue-50 border border-dashed border-gray-200 hover:border-blue-300 w-full justify-center">
            <Plus size={14} />
            Add project to {area}
          </button>
        </>
      )}
    </div>
  );
}

/* ─── Main Dashboard ─── */

export default function Dashboard() {
  const [data, setData] = useState(initialData);
  const [nextId, setNextId] = useState(100);
  const [exportMsg, setExportMsg] = useState("");
  const [filterOwner, setFilterOwner] = useState("All");

  const allProjects = Object.values(data).flatMap((a) => a.projects);
  const filteredData = filterOwner === "All"
    ? data
    : Object.fromEntries(
        Object.entries(data)
          .map(([area, info]) => [area, { ...info, projects: info.projects.filter((p) => p.owner === filterOwner) }])
          .filter(([, info]) => info.projects.length > 0)
      );
  const filteredProjects = Object.values(filteredData).flatMap((a) => a.projects);

  const totalProjects = allProjects.length;
  const inProgress = allProjects.filter((p) => p.status === "In Progress").length;
  const highPriority = allProjects.filter((p) => p.priority === "High").length;
  const avgProgress = totalProjects ? Math.round(allProjects.reduce((s, p) => s + p.pct, 0) / totalProjects) : 0;
  const blocked = allProjects.filter((p) => p.status === "Blocked" || p.status === "On Hold").length;
  const done = allProjects.filter((p) => p.status === "Done").length;

  const handleUpdate = (id, field, value) => {
    setData((prev) => {
      const next = {};
      for (const [area, info] of Object.entries(prev)) {
        next[area] = { ...info, projects: info.projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)) };
      }
      return next;
    });
  };

  const handleDelete = (id) => {
    setData((prev) => {
      const next = {};
      for (const [area, info] of Object.entries(prev)) {
        next[area] = { ...info, projects: info.projects.filter((p) => p.id !== id) };
      }
      return next;
    });
  };

  const handleAdd = (area) => {
    setData((prev) => ({
      ...prev,
      [area]: {
        ...prev[area],
        projects: [
          ...prev[area].projects,
          { id: nextId, name: "New Project", owner: "Unassigned", status: "Not Started", priority: "Medium", pct: 0, date: "", roadblocks: "", milestones: "", nextSteps: "", notes: "" },
        ],
      },
    }));
    setNextId((n) => n + 1);
  };

  const handleExport = () => {
    const rows = [["Area", "Project Name", "Owner", "Status", "Priority", "% Complete", "Go-Live Date", "Roadblocks", "Milestones", "Next Steps", "Notes"]];
    for (const [area, info] of Object.entries(data)) {
      for (const p of info.projects) {
        rows.push([area, p.name, p.owner, p.status, p.priority, p.pct + "%", p.date, p.roadblocks, p.milestones, p.nextSteps, p.notes]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IT_Project_Status_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg("Exported!");
    setTimeout(() => setExportMsg(""), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-sm">
                <BarChart3 size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Aubuchon IT Project Dashboard</h1>
                <p className="text-xs text-gray-500">Week of March 30, 2026 — Senior Team Review</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Owner Filter */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200">
                <User size={12} className="text-gray-400" />
                <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="text-xs font-medium text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer">
                  <option value="All">All Owners</option>
                  {OWNER_OPTIONS.filter((o) => o !== "Unassigned").map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <button onClick={handleExport} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
                <Download size={14} />
                {exportMsg || "Export CSV"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: "Total Projects", value: totalProjects, color: "text-gray-900", bg: "bg-white" },
            { label: "In Progress", value: inProgress, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "High Priority", value: highPriority, color: "text-red-600", bg: "bg-red-50" },
            { label: "Avg Progress", value: avgProgress + "%", color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Blocked / Hold", value: blocked, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Completed", value: done, color: "text-emerald-600", bg: "bg-emerald-50" },
          ].map((card) => (
            <div key={card.label} className={`${card.bg} rounded-xl p-4 border border-gray-200/50 shadow-sm`}>
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {allProjects.filter((p) => p.priority === "High" && p.date && p.date.includes("3/31")).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-red-800">Critical Deadlines This Week</h4>
              <p className="text-xs text-red-600 mt-0.5">
                {allProjects.filter((p) => p.priority === "High" && p.date && p.date.includes("3/31")).map((p) => `${p.name} (${p.owner})`).join("  •  ")} — due 3/31/2026
              </p>
            </div>
          </div>
        )}

        {/* Filter indicator */}
        {filterOwner !== "All" && (
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs text-gray-500">Filtered by:</span>
            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">{filterOwner}</span>
            <button onClick={() => setFilterOwner("All")} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
            <span className="text-xs text-gray-400 ml-2">Showing {filteredProjects.length} of {totalProjects} projects</span>
          </div>
        )}

        {/* Area Sections */}
        {Object.entries(filteredData).map(([area, info]) => (
          <AreaSection
            key={area}
            area={area}
            projects={info.projects}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAdd={handleAdd}
          />
        ))}

        {/* Footer */}
        <div className="text-center py-8 text-xs text-gray-400 border-t border-gray-200 mt-4">
          Aubuchon Hardware — IT Department Project Tracker — Click any field to edit
        </div>
      </div>
    </div>
  );
}